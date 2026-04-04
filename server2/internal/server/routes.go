package server

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/z3vxo/recon-dashboard/internal/database"
	"github.com/z3vxo/recon-dashboard/internal/tools"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type TriageData struct {
	Domain string `json:"domain"`
	Status string `json:"status"`
}

type NewTargetJson struct {
	Domain string `json:"domain"`
}

type NoteStruct struct {
	Domain string `json:"domain"`
	Note   string `json:"notes"`
}

func writeJSON(w http.ResponseWriter, status int, msg any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(msg)
}

func AiDomain_Handler(w http.ResponseWriter, r *http.Request) {
	domain := chi.URLParam(r, "domain")
	fmt.Println(domain)

	tools.AnalyiseDomains(domain)
	writeJSON(w, http.StatusOK, "YEP")
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
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "failed to insert"})
		return
	}

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
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": error.Error(err)})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"hits": data})
}

// handles retreving the active targets from /databases/<domain>_db.sql, comes from targets.html
func Targets_Handler(w http.ResponseWriter, r *http.Request) {
	entries, err := os.ReadDir("./databases")
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
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": error.Error(err)})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"domain": domain.Domain})
	return

}

// Handles importing data for a target, reads json from disk and stores in DB
func ImportHandler(w http.ResponseWriter, r *http.Request) {
	domain := chi.URLParam(r, "domain")

	err := database.ImportData(domain)

	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": error.Error(err)})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"domain": "good"})
	return
}

func deleteTargetHandler(w http.ResponseWriter, r *http.Request) {
	domain := chi.URLParam(r, "domain")

	if err := database.DeleteData(domain); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "Failed Deleting Data."})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "Data Deleted Succesfully!"})
	return
}

func ScreenShot_Handler(w http.ResponseWriter, r *http.Request) {
	hostURL, _ := url.QueryUnescape(chi.URLParam(r, "hostURL"))
	id := uuid.NewString()
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
