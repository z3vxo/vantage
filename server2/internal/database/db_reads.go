package database

import (
	"strconv"
	"strings"
)

type ReconStats struct {
	Total int
	S2xx  int
	S4xx  int
	S5xx  int
	Hits  int
}

func GetStats(domain string) (ReconStats, error) {
	db, err := getDB(domain)
	if err != nil {
		return ReconStats{}, err
	}

	var stats ReconStats

	row := db.QueryRow(`SELECT
		COUNT(*),
		SUM(CASE WHEN status_code LIKE '2%' THEN 1 ELSE 0 END),
		SUM(CASE WHEN status_code LIKE '4%' THEN 1 ELSE 0 END),
		SUM(CASE WHEN status_code LIKE '5%' THEN 1 ELSE 0 END)
		FROM domains`)
	if err := row.Scan(&stats.Total, &stats.S2xx, &stats.S4xx, &stats.S5xx); err != nil {
		return ReconStats{}, err
	}

	row = db.QueryRow(`SELECT COUNT(*) FROM juicy_hits`)
	if err := row.Scan(&stats.Hits); err != nil {
		return ReconStats{}, err
	}

	return stats, nil
}

func splitTrim(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func statusClass(code string) string {
	switch {
	case strings.HasPrefix(code, "2"):
		return "s" + code
	case strings.HasPrefix(code, "3"):
		return "s" + code
	case code == "403":
		return "s403"
	case strings.HasPrefix(code, "4"):
		return "s400"
	default:
		return ""
	}
}

func transformHost(h Host) HostResponse {
	var ports []Port
	for _, p := range splitTrim(h.OpenPorts) {
		portNum, _ := strconv.Atoi(strings.TrimSpace(p))
		service, ok := PortServices[portNum]
		if !ok {
			service = "Unknown"
		}
		ports = append(ports, Port{Port: p, Service: service})
	}

	if ports == nil {
		ports = []Port{}
	}
	tech := splitTrim(h.TechStack)
	ips := splitTrim(h.IPs)
	cname := splitTrim(h.CNAME)
	badges := splitTrim(h.Badges)
	if tech == nil {
		tech = []string{}
	}
	if ips == nil {
		ips = []string{}
	}
	if cname == nil {
		cname = []string{}
	}
	if badges == nil {
		badges = []string{}
	}

	return HostResponse{
		ID:           h.ID,
		DomainName:   h.DomainName,
		SC:           statusClass(h.StatusCode),
		StatusCode:   h.StatusCode,
		OpenPorts:    ports,
		Title:        h.Title,
		TechStack:    tech,
		ContentType:  h.ContentType,
		Server:       h.Server,
		IPs:          ips,
		CNAME:        cname,
		Badges:       badges,
		TriageStatus: h.TriageStatus,
		Notes:        h.Notes,
	}
}

func ReadHits(domain string) ([]HitResponse, error) {
	db, err := getDB(domain)
	if err != nil {
		return nil, err
	}

	rows, err := db.Query(`SELECT url, status_code, size, severity FROM juicy_hits`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hits []HitResponse
	for rows.Next() {
		var h HitResponse
		if err := rows.Scan(&h.URL, &h.StatusCode, &h.Size, &h.Severity); err != nil {
			return nil, err
		}
		h.SC = statusClass(h.StatusCode)
		hits = append(hits, h)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	if hits == nil {
		hits = []HitResponse{}
	}
	return hits, nil
}

func ReadHosts(domain string) (HostsResult, error) {
	db, err := getDB(domain)
	if err != nil {
		return HostsResult{}, err
	}

	rows, err := db.Query(`
		SELECT id, domain_name, status_code, open_ports, title, tech_stack,
		       content_type, server, ips, cname, badges, triage_status, notes
		FROM domains
	`)
	if err != nil {
		return HostsResult{}, err
	}
	defer rows.Close()

	var hosts []HostResponse
	stats := Stats{}

	for rows.Next() {
		var h Host
		err := rows.Scan(
			&h.ID, &h.DomainName, &h.StatusCode, &h.OpenPorts,
			&h.Title, &h.TechStack, &h.ContentType, &h.Server,
			&h.IPs, &h.CNAME, &h.Badges, &h.TriageStatus, &h.Notes,
		)
		if err != nil {
			return HostsResult{}, err
		}

		switch {
		case strings.HasPrefix(h.StatusCode, "2"):
			stats.S200++
		case h.StatusCode == "403":
			stats.S403++
		case strings.HasPrefix(h.StatusCode, "5"):
			stats.S500++
		}

		hosts = append(hosts, transformHost(h))
	}

	if err = rows.Err(); err != nil {
		return HostsResult{}, err
	}

	if hosts == nil {
		hosts = []HostResponse{}
	}
	stats.Total = len(hosts)

	return HostsResult{Stats: stats, Hosts: hosts}, nil
}

type DomainEntry struct {
	Name       string
	StatusCode string
}

func GetDomainNames(domain string) ([]DomainEntry, error) {
	db, err := getDB(domain)
	if err != nil {
		return nil, err
	}

	rows, err := db.Query(`SELECT domain_name, status_code FROM domains ORDER BY domain_name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []DomainEntry
	for rows.Next() {
		var e DomainEntry
		if err := rows.Scan(&e.Name, &e.StatusCode); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

type DomainForAI struct {
	URL    string
	Status string
	Title  string
	Tech   string
}

func ReadHostsForAI(domain string) ([]DomainForAI, error) {
	db, err := getDB(domain)

	if err != nil {
		return nil, err
	}

	rows, err := db.Query(`
		SELECT domain_name, status_code, title, tech_stack FROM domains
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var domains []DomainForAI
	for rows.Next() {
		var d DomainForAI
		err := rows.Scan(&d.URL, &d.Status, &d.Title, &d.Tech)
		if err != nil {
			return nil, err
		}
		domains = append(domains, d)
	}

	return domains, nil
}
