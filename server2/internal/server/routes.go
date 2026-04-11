package server

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/z3vxo/vantage/internal/database"
	"github.com/z3vxo/vantage/internal/tools"
)

func realIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		return strings.Split(ip, ",")[0]
	}
	return r.RemoteAddr
}

func writeJSON(w http.ResponseWriter, status int, msg any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(msg)
}

func Triage_Handler(w http.ResponseWriter, r *http.Request) {
	domain := chi.URLParam(r, "domain")
	hostURL, _ := url.QueryUnescape(chi.URLParam(r, "hostURL"))

	var data TriageData
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "Failed to decode json"})
		return
	}

	err := database.UpdateTriage(domain, hostURL, data.Status)
	if err != nil {
		slog.Error("failed to update triage", "domain", domain, "host", hostURL, "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "failed to insert"})
		return
	}

	slog.Debug("triage updated", "domain", domain, "host", hostURL, "status", data.Status)
	writeJSON(w, http.StatusOK, map[string]string{"status": "Status updated!"})
	return

}

func Notes_Handler(w http.ResponseWriter, r *http.Request) {
	domain := chi.URLParam(r, "domain")
	hostURL, _ := url.QueryUnescape(chi.URLParam(r, "hostURL"))

	var data NoteStruct
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		slog.Error("Failed To Insert Json in Notes", "hostURL", hostURL)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "Failed to decode json"})
		return
	}

	err := database.WriteNote(domain, hostURL, data.Note)
	if err != nil {
		slog.Error("Failed To Insert Note", "hostURL", hostURL)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "failed to insert"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "Note added!"})
}

func Host_Handler(w http.ResponseWriter, r *http.Request) {
	domain := chi.URLParam(r, "domain")
	data, err := database.ReadHosts(domain)
	if err != nil {
		slog.Error("failed to read hosts", "domain", domain, "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": error.Error(err)})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func Juicy_Handler(w http.ResponseWriter, r *http.Request) {
	domain := chi.URLParam(r, "domain")
	data, err := database.ReadHits(domain)
	if err != nil {
		slog.Error("failed to read hits", "domain", domain, "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": error.Error(err)})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"hits": data})
}

// handles retreving the active targets from /databases/<domain>_db.sql, comes from targets.html
func Targets_Handler(w http.ResponseWriter, r *http.Request) {
	entries, err := os.ReadDir(database.DbDir())
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string][]string{"targets": []string{}})
		return
	}

	var targets []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), "_db.sql") {
			domain := strings.TrimSuffix(entry.Name(), "_db.sql")
			targets = append(targets, domain)
		}
	}

	if targets == nil {
		targets = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string][]string{"targets": targets})
}

// handles the creation of a new target from /target.html
func NewTargetHandler(w http.ResponseWriter, r *http.Request) {

	var domain NewTargetJson
	err := json.NewDecoder(r.Body).Decode(&domain)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": error.Error(err)})
		return
	}

	defer r.Body.Close()

	err = database.CreateNewTarget(domain.Domain)
	if err != nil {
		slog.Error("failed to create target", "domain", domain.Domain, "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": error.Error(err)})
		return
	}

	slog.Info("new target created", "domain", domain.Domain)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"domain": domain.Domain})
	return

}

// Handles importing data for a target, reads json from disk and stores in DB
func ImportHandler(w http.ResponseWriter, r *http.Request) {
	domain := chi.URLParam(r, "domain")
	slog.Info("import started", "domain", domain)

	err := database.ImportData(domain)
	if err != nil {
		slog.Error("import failed", "domain", domain, "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": error.Error(err)})
		return
	}

	slog.Info("import complete", "domain", domain)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"domain": "good"})
}

func deleteTargetHandler(w http.ResponseWriter, r *http.Request) {
	domain := chi.URLParam(r, "domain")

	if err := database.DeleteData(domain); err != nil {
		slog.Error("failed to delete target", "domain", domain, "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "Failed Deleting Data."})
		return
	}

	slog.Info("target deleted", "domain", domain)
	writeJSON(w, http.StatusOK, map[string]string{"status": "Data Deleted Succesfully!"})
}

func ScreenShot_Handler(w http.ResponseWriter, r *http.Request) {
	hostURL, _ := url.QueryUnescape(chi.URLParam(r, "hostURL"))
	id := uuid.NewString()
	slog.Info("screenshot started", "host", hostURL, "token", id)
	go tools.Screenshot(hostURL, id)
	writeJSON(w, http.StatusOK, map[string]string{"token": id})
}

func ScreenShotStatus_Handler(w http.ResponseWriter, r *http.Request) {
	hostURL, _ := url.QueryUnescape(chi.URLParam(r, "hostURL"))
	token := r.URL.Query().Get("token")
	if token == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing token"})
		return
	}
	result, ok := tools.CheckScreenshotStatus(token, hostURL)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"status": "not_found"})
		return
	}
	switch result.Status {
	case tools.JobPending:
		writeJSON(w, http.StatusOK, map[string]string{"status": "pending"})
	case tools.JobDone:
		writeJSON(w, http.StatusOK, map[string]interface{}{"status": "done", "img_path": result.ImgPath})
	case tools.JobFailed:
		writeJSON(w, http.StatusOK, map[string]string{"status": "failed", "error": result.Error})
	}
}

func ScreenShotServe_Handler(w http.ResponseWriter, r *http.Request) {
	hostURL, _ := url.QueryUnescape(chi.URLParam(r, "hostURL"))
	safe := tools.SanitizeForFilename(hostURL)
	for _, ext := range []string{".png", ".jpg", ".jpeg"} {
		path := fmt.Sprintf("./static/images/screenshots/%s%s", safe, ext)
		if _, err := os.Stat(path); err == nil {
			http.ServeFile(w, r, path)
			return
		}
	}
	http.NotFound(w, r)
}

func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api/login" {
			next.ServeHTTP(w, r)
			return
		}
		cookie, err := r.Cookie("session")
		if err != nil {
			slog.Warn("unauthorized request - no session cookie", "path", r.URL.Path, "ip", realIP(r))
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		exp, ok := sessions[cookie.Value]
		if !ok || time.Now().After(exp) {
			if ok {
				delete(sessions, cookie.Value)
				saveSessions()
			}
			slog.Warn("unauthorized request - invalid or expired session", "path", r.URL.Path, "ip", realIP(r))
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

var sessionsFile = func() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "./sessions.json"
	}
	return home + "/.recon/sessions.json"
}()

var sessions = map[string]time.Time{}

func loadSessions() {
	data, err := os.ReadFile(sessionsFile)
	if err != nil {
		return
	}
	json.Unmarshal(data, &sessions)
	// prune expired
	for token, exp := range sessions {
		if time.Now().After(exp) {
			delete(sessions, token)
		}
	}
}

func saveSessions() {
	data, err := json.Marshal(sessions)
	if err != nil {
		return
	}
	os.WriteFile(sessionsFile, data, 0600)
}

func randString() (string, error) {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}

	return base64.URLEncoding.EncodeToString(b), nil
}

func Login_Handler(w http.ResponseWriter, r *http.Request) {

	user := "zev"
	pass := "Embassy55$"
	var data LoginData

	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	ip := realIP(r)

	if data.Username == user && data.Password == pass {
		token, err := randString()
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Faile Creating cookie"})
			return
		}

		sessions[token] = time.Now().Add(30 * 24 * time.Hour)
		saveSessions()

		http.SetCookie(w, &http.Cookie{
			Name:     "session",
			Value:    token,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteStrictMode,
			MaxAge:   30 * 86400,
		})

		slog.Info("login success", "user", data.Username, "ip", ip)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}

	slog.Warn("login failed", "user", data.Username, "ip", ip)
	http.Redirect(w, r, "/goaway", http.StatusSeeOther)
}

func Logs_Handler(w http.ResponseWriter, r *http.Request) {
	home, _ := os.UserHomeDir()
	logPath := home + "/.recon/logs/recon.log"
	slog.Info("log file downloaded", "ip", realIP(r))
	w.Header().Set("Content-Disposition", "attachment; filename=recon.log")
	w.Header().Set("Content-Type", "text/plain")
	http.ServeFile(w, r, logPath)
}

func GoAway_Handler(w http.ResponseWriter, r *http.Request) {
	slog.Warn("goaway hit", "ip", realIP(r))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`<html><body>Stop looking here</body></html>`))
}

func Worflow_Handler(w http.ResponseWriter, r *http.Request) {

	var TargetVal Target
	if err := json.NewDecoder(r.Body).Decode(&TargetVal); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	if TargetVal.Target == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Target Required"})
		return
	}

	slog.Info("recon workflow triggered", "target", TargetVal.Target, "ip", realIP(r))
	go tools.RunWorkFlow(TargetVal.Target)
	writeJSON(w, http.StatusOK, map[string]string{"status": "started"})
}

func JsTool_Handler(w http.ResponseWriter, r *http.Request) {
	hostURL, _ := url.QueryUnescape(chi.URLParam(r, "hostURL"))
	domain := chi.URLParam(r, "domain")

	switch r.Method {
	case http.MethodPost:
		var body struct {
			Headless bool `json:"headless"`
		}
		json.NewDecoder(r.Body).Decode(&body)
		id := uuid.NewString()
		slog.Info("js scrape and scan started", "host", hostURL, "id", id, "headless", body.Headless)
		go tools.ScrapeAndScan(hostURL, id, domain, body.Headless)
		writeJSON(w, http.StatusOK, map[string]string{"id": id})

	case http.MethodGet:
		results, err := database.GetJsResults(domain, hostURL)
		if err != nil {
			slog.Error("failed to get js results", "host", hostURL, "err", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func Summary_Handler(w http.ResponseWriter, r *http.Request) {
	domain := chi.URLParam(r, "domain")
	data, err := database.GetSummary(domain)
	if err != nil {
		slog.Error("failed to get summary", "domain", domain, "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func ToolStatus_Handler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing id"})
		return
	}
	job, ok := tools.GetJob(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"status": "not_found"})
		return
	}
	switch job.Status {
	case tools.JobPending:
		writeJSON(w, http.StatusOK, map[string]string{"status": "pending"})
	case tools.JobDone:
		writeJSON(w, http.StatusOK, map[string]string{"status": "done"})
	case tools.JobFailed:
		writeJSON(w, http.StatusOK, map[string]string{"status": "failed", "error": job.Error})
	}
}
