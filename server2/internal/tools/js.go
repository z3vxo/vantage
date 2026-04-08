package tools

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/z3vxo/recon-dashboard/internal/database"
)

func extractHostname(rawURL string) (string, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	return u.Hostname(), nil
}

func runGau(tmpDir, id, hostURL string) {
	fileName := fmt.Sprintf("%s/%s_gau.txt", tmpDir, id)
	domain, err := extractHostname(hostURL)
	if err != nil {
		slog.Error("js: gau failed to extract hostname", "host", hostURL, "err", err)
		return
	}
	res, err := exec.Command("gau", domain).CombinedOutput()
	if err != nil {
		slog.Error("js: gau failed", "host", domain, "err", err, "out", string(res))
		return
	}
	slog.Debug("js: gau done", "host", domain, "lines", bytes.Count(res, []byte("\n")))
	os.WriteFile(fileName, res, 0644)
}

func runWayback(tmpDir, id, hostURL string) {
	fileName := fmt.Sprintf("%s/%s_wayback.txt", tmpDir, id)
	domain, err := extractHostname(hostURL)
	if err != nil {
		slog.Error("js: waybackurls failed to extract hostname", "host", hostURL, "err", err)
		return
	}
	res, err := exec.Command("waybackurls", domain).CombinedOutput()
	if err != nil {
		slog.Error("js: waybackurls failed", "host", domain, "err", err, "out", string(res))
		return
	}
	slog.Debug("js: waybackurls done", "host", domain, "lines", bytes.Count(res, []byte("\n")))
	os.WriteFile(fileName, res, 0644)
}

func runKatana(tmpDir, id, hostURL string) {
	fileName := fmt.Sprintf("%s/%s_katana.txt", tmpDir, id)
	cmd := exec.Command("katana",
		"-u", hostURL,
		"-d", "2",
		"-jc",
		"-hl",
		"-nos")
	out, err := cmd.CombinedOutput()
	if err != nil {
		slog.Error("js: katana failed", "host", hostURL, "err", err, "out", string(out))
		return
	}
	slog.Debug("js: katana done", "host", hostURL, "lines", bytes.Count(out, []byte("\n")))
	os.WriteFile(fileName, out, 0644)
}

func deDupeAndExtract(tmpDir, hostURL, id string) error {
	hostname, err := extractHostname(hostURL)
	if err != nil {
		return err
	}
	cmd := fmt.Sprintf("cat %s/%s_*.txt | sort -u | grep -iE '\\.js(\\?|$)' | grep '%s' > %s/%s_js.txt", tmpDir, id, hostname, tmpDir, id)
	if out, err := exec.Command("sh", "-c", cmd).CombinedOutput(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); !ok || exitErr.ExitCode() != 1 {
			return fmt.Errorf("dedup failed: %w — %s", err, string(out))
		}
	}
	return nil
}

func ScrapeJsFiles(hostURL, domain, tmpDir, id string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home dir: %w", err)
	}

	jsDir := fmt.Sprintf("%s/.recon/%s/%s/js", home, domain, SanitizeForFilename(hostURL))
	if err := os.MkdirAll(jsDir, 0755); err != nil {
		return fmt.Errorf("failed to create js dir: %w", err)
	}

	jsList := fmt.Sprintf("%s/%s_js.txt", tmpDir, id)
	if _, err := os.Stat(jsList); os.IsNotExist(err) {
		return nil // no JS files found
	}

	cmd := exec.Command("httpx",
		"-l", jsList,
		"-sr",
		"-srd", jsDir,
		"-mc", "200",
		"-silent",
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("httpx scrape failed: %w — %s", err, string(out))
	}

	return nil
}

// runLinkFinder runs linkfinder on a single file and returns discovered URLs
func runLinkFinder(filePath string) []string {
	out, err := exec.Command("python3", os.Getenv("HOME")+"/tools/linkFinder/linkfinder.py", "-i", filePath, "-o", "cli").CombinedOutput()
	if err != nil {
		return nil
	}
	var links []string
	scanner := bufio.NewScanner(bytes.NewReader(out))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			links = append(links, line)
		}
	}
	return links
}

// runSecretsFinder runs SecretFinder on a single file and returns secrets
// Output format: "Type    ->    value"
func runSecretsFinder(filePath string) []database.JsSecret {
	out, err := exec.Command("python3", os.Getenv("HOME")+"/tools/secretFinder/SecretFinder.py", "-i", filePath, "-o", "cli").CombinedOutput()
	if err != nil {
		return nil
	}
	var secrets []database.JsSecret
	scanner := bufio.NewScanner(bytes.NewReader(out))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		parts := strings.SplitN(line, "->", 2)
		if len(parts) != 2 {
			continue
		}
		secretType := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		if secretType != "" && value != "" {
			secrets = append(secrets, database.JsSecret{
				File:  filePath,
				Type:  secretType,
				Value: value,
			})
		}
	}
	return secrets
}

// runTruffleHog runs trufflehog on the JS directory and returns findings
type truffleHogResult struct {
	SourceMetadata struct {
		Data struct {
			Filesystem struct {
				File string `json:"file"`
			} `json:"Filesystem"`
		} `json:"Data"`
	} `json:"SourceMetadata"`
	DetectorName string `json:"DetectorName"`
	Raw          string `json:"Raw"`
}

func runTruffleHog(jsDir string) []database.JsSecret {
	out, err := exec.Command("trufflehog", "filesystem", jsDir, "--json", "--no-verification").CombinedOutput()
	if err != nil {
		return nil
	}
	var secrets []database.JsSecret
	scanner := bufio.NewScanner(bytes.NewReader(out))
	for scanner.Scan() {
		line := scanner.Bytes()
		var r truffleHogResult
		if err := json.Unmarshal(line, &r); err != nil {
			continue
		}
		if r.Raw == "" {
			continue
		}
		secrets = append(secrets, database.JsSecret{
			File:  r.SourceMetadata.Data.Filesystem.File,
			Type:  r.DetectorName,
			Value: r.Raw,
		})
	}
	return secrets
}

func analyzeJsFiles(jsDir, domain, hostURL string) error {
	files, err := filepath.Glob(jsDir + "/response/*")
	if err != nil || len(files) == 0 {
		return nil
	}

	var mu sync.Mutex
	var allSecrets []database.JsSecret
	var allLinks []database.JsLink
	var wg sync.WaitGroup

	for _, f := range files {
		wg.Add(2)
		go func(filePath string) {
			defer wg.Done()
			links := runLinkFinder(filePath)
			mu.Lock()
			for _, l := range links {
				allLinks = append(allLinks, database.JsLink{File: filePath, URL: l})
			}
			mu.Unlock()
		}(f)
		go func(filePath string) {
			defer wg.Done()
			secrets := runSecretsFinder(filePath)
			mu.Lock()
			allSecrets = append(allSecrets, secrets...)
			mu.Unlock()
		}(f)
	}
	wg.Wait()

	// TruffleHog on the whole dir as a second pass
	thSecrets := runTruffleHog(jsDir + "/response")
	allSecrets = append(allSecrets, thSecrets...)

	return database.SaveJsResults(domain, hostURL, allSecrets, allLinks)
}

func ScrapeAndScan(host, id, domain string) {
	SetJob(id, JobResult{Status: JobPending})

	tmpDir := fmt.Sprintf("./temp/%s", id)
	if err := os.MkdirAll(tmpDir, 0755); err != nil {
		SetJob(id, JobResult{Status: JobFailed, Error: err.Error()})
		return
	}

	var wg sync.WaitGroup
	wg.Add(3)
	go func() { defer wg.Done(); runGau(tmpDir, id, host) }()
	go func() { defer wg.Done(); runWayback(tmpDir, id, host) }()
	go func() { defer wg.Done(); runKatana(tmpDir, id, host) }()
	wg.Wait()

	if err := deDupeAndExtract(tmpDir, host, id); err != nil {
		SetJob(id, JobResult{Status: JobFailed, Error: err.Error()})
		return
	}

	jsList := fmt.Sprintf("%s/%s_js.txt", tmpDir, id)
	if info, err := os.Stat(jsList); err == nil {
		slog.Info("js: dedup complete", "host", host, "js_list_bytes", info.Size())
	} else {
		slog.Warn("js: no JS URLs found after dedup", "host", host)
	}

	if err := ScrapeJsFiles(host, domain, tmpDir, id); err != nil {
		SetJob(id, JobResult{Status: JobFailed, Error: err.Error()})
		return
	}

	home, _ := os.UserHomeDir()
	jsDir := fmt.Sprintf("%s/.recon/%s/%s/js", home, domain, SanitizeForFilename(host))
	if entries, err := os.ReadDir(jsDir + "/response"); err == nil {
		slog.Info("js: files downloaded", "host", host, "count", len(entries))
	} else {
		slog.Warn("js: no files downloaded", "host", host, "err", err)
	}

	if err := analyzeJsFiles(jsDir, domain, host); err != nil {
		SetJob(id, JobResult{Status: JobFailed, Error: err.Error()})
		return
	}

	os.RemoveAll(tmpDir)
	SetJob(id, JobResult{Status: JobDone})
}
