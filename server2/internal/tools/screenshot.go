package tools

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type ScreenshotStatusResult struct {
	Status  JobStatus
	ImgPath string
	Error   string
}

func SanitizeForFilename(s string) string {
	var b strings.Builder
	for _, c := range s {
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '.' || c == '-' {
			b.WriteRune(c)
		} else {
			b.WriteRune('_')
		}
	}
	return b.String()
}

func moveFile(src, dst string) error {
	if err := os.Rename(src, dst); err == nil {
		return nil
	}
	// Cross-device fallback
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err = io.Copy(out, in); err != nil {
		return err
	}
	return os.Remove(src)
}

func Screenshot(hostURL string, uuid string) {
	tmpDir := fmt.Sprintf("./temp/%s", uuid)

	if err := os.MkdirAll(tmpDir, 0755); err != nil {
		SetJob(uuid, JobResult{Status: JobFailed, Error: err.Error()})
		return
	}

	SetJob(uuid, JobResult{Status: JobPending})

	out, err := exec.Command("gowitness", "scan", "single", "-u", hostURL, "--screenshot-path", tmpDir).CombinedOutput()
	if err != nil {
		SetJob(uuid, JobResult{Status: JobFailed, Error: string(out)})
		return
	}

	SetJob(uuid, JobResult{Status: JobDone})
}

func CheckScreenshotStatus(token string, hostURL string) (ScreenshotStatusResult, bool) {
	job, ok := GetJob(token)
	if !ok {
		return ScreenshotStatusResult{}, false
	}

	switch job.Status {
	case JobPending:
		return ScreenshotStatusResult{Status: JobPending}, true

	case JobFailed:
		deleteJob(token)
		return ScreenshotStatusResult{Status: JobFailed, Error: job.Error}, true

	case JobDone:
		tmpDir := fmt.Sprintf("./temp/%s", token)
		files, _ := filepath.Glob(tmpDir + "/*")

		if len(files) == 0 {
			deleteJob(token)
			os.RemoveAll(tmpDir)
			return ScreenshotStatusResult{Status: JobFailed, Error: "gowitness produced no screenshot file"}, true
		}

		outDir := "./static/images/screenshots"
		if err := os.MkdirAll(outDir, 0755); err != nil {
			deleteJob(token)
			return ScreenshotStatusResult{Status: JobFailed, Error: err.Error()}, true
		}

		safe := SanitizeForFilename(hostURL)
		ext := filepath.Ext(files[0])
		if ext == "" {
			ext = ".png"
		}

		outPath := fmt.Sprintf("%s/%s%s", outDir, safe, ext)
		if err := moveFile(files[0], outPath); err != nil {
			deleteJob(token)
			return ScreenshotStatusResult{Status: JobFailed, Error: err.Error()}, true
		}

		os.RemoveAll(tmpDir)
		deleteJob(token)

		imgPath := fmt.Sprintf("/images/screenshots/%s%s", safe, ext)
		return ScreenshotStatusResult{Status: JobDone, ImgPath: imgPath}, true
	}

	return ScreenshotStatusResult{}, false
}
