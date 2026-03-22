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
	r := chi.NewRouter()

	r.Get("/api/{domain}/hosts", Host_Handler)
	r.Get("/api/{domain}/hits", Juicy_Handler)

	r.Patch("/api/{domain}/host/{hostURL}/triage", Triage_Handler)
	r.Patch("/api/{domain}/host/{hostURL}/notes", Notes_Handler)

	r.Post("/api/{domain}/host/{hostURL}/screenshot", ScreenShot_Handler)
	// r.Get("/api/{domain}/host/{hostURL}/screenshot/status, ScreenShotStatus_Handler)
	// r.Post( "/api/{domain}/host/{hostURL}/portscan", PortScan_Handler)

	r.Post("/api/import/{domain}", ImportHandler)
	r.Delete("/api/delete/{domain}", deleteTargetHandler)

	r.Post("/api/targets/new", NewTargetHandler)
	r.Get("/api/targets", Targets_Handler)

	r.Get("/index.html", serveHTML("static/index.html"))
	r.Get("/*", serveHTML("static/target.html"))

	// Middleware wrapper serves /css/* and /js/* before Chi route matching.
	fs := http.FileServer(http.Dir("static"))
	handler := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		p := req.URL.Path
		if strings.HasPrefix(p, "/css/") || strings.HasPrefix(p, "/js/") || strings.HasPrefix(p, "/images/") || strings.HasSuffix(p, ".png") || strings.HasSuffix(p, ".jpg") || strings.HasSuffix(p, ".jpeg") || strings.HasSuffix(p, ".gif") || strings.HasSuffix(p, ".webp") {
			fs.ServeHTTP(w, req)
			return
		}
		r.ServeHTTP(w, req)
	})

	fmt.Println("[+] Server running on http://127.0.0.1:8080")
	http.ListenAndServe(":8080", handler)
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
