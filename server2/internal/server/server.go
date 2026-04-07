package server

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
)

//  {domain} -> target level e.g domain.com
//  {hostURL} -> host level, e.g https://domain.com:443 -> routes need url decoding!

func Run() {
	loadSessions()
	r := chi.NewRouter()

	r.Use(authMiddleware)

	r.Post("/api/login", Login_Handler)
	r.Get("/goaway", GoAway_Handler)

	r.Get("/api/{domain}/hosts", Host_Handler)
	r.Get("/api/{domain}/hits", Juicy_Handler)

	r.Patch("/api/{domain}/host/{hostURL}/triage", Triage_Handler)
	r.Patch("/api/{domain}/host/{hostURL}/notes", Notes_Handler)

	r.Post("/api/{domain}/host/{hostURL}/screenshot", ScreenShot_Handler)
	r.Get("/api/{domain}/host/{hostURL}/screenshot/status", ScreenShotStatus_Handler)
	r.Get("/api/{domain}/host/{hostURL}/screenshot", ScreenShotServe_Handler)
	// r.Post("/api/{domain}/host/{hostURL}/portscan", PortScan_Handler)

	//r.Post("/api/workflow", Worflow_Handler)

	r.Post("/api/import/{domain}", ImportHandler)
	r.Delete("/api/delete/{domain}", deleteTargetHandler)

	r.Post("/api/targets/new", NewTargetHandler)
	r.Get("/api/targets", Targets_Handler)

	r.Get("/login", serveHTML("static/dist/index.html"))
	r.Get("/dashboard", serveHTML("static/dist/index.html"))

	// React SPA — targets page (serves dist/index.html for / and any non-API routes)
	r.Get("/", serveHTML("static/dist/index.html"))
	r.Get("/*", func(w http.ResponseWriter, req *http.Request) {
		if strings.HasPrefix(req.URL.Path, "/api/") {
			http.NotFound(w, req)
			return
		}
		serveHTML("static/dist/index.html")(w, req)
	})

	// Middleware wrapper: static assets served before Chi routing.
	staticFS := http.FileServer(http.Dir("static"))
	distFS := http.FileServer(http.Dir("static/dist"))
	handler := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		p := req.URL.Path
		// Vite build output: JS/CSS chunks under /assets/
		if strings.HasPrefix(p, "/assets/") {
			distFS.ServeHTTP(w, req)
			return
		}
		// Legacy static files and images
		if strings.HasPrefix(p, "/css/") || strings.HasPrefix(p, "/js/") || strings.HasPrefix(p, "/images/") {
			staticFS.ServeHTTP(w, req)
			return
		}
		r.ServeHTTP(w, req)
	})

	fmt.Println("[+] Server running on http://127.0.0.1:8080")
	fmt.Println("[+] Ensure nginx is running and proxying!")
	http.ListenAndServe("127.0.0.1:8080", handler)
}

func serveHTML(path string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		content, err := os.ReadFile(path)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(content)
	}
}
