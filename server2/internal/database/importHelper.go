package database

import (
    "errors"
    "os"
    "path/filepath"
    "strings"
    "strconv"
    "fmt"
    "encoding/json"
    "bufio"
    _ "github.com/mattn/go-sqlite3"
)



func joinInts(ports []int) string {
      parts := make([]string, len(ports))
      for i, p := range ports {
          parts[i] = strconv.Itoa(p)
      }
      return strings.Join(parts, ", ")
  }

func computeBadges(url, title string) string {
      combined := strings.ToLower(url + " " + title)
      var badges []string

      interestingPatterns := []string{"login", "admin", "dashboard", "portal", "jenkins", "grafana", "kibana", "gitlab", "jira", "confluence", "phpmyadmin", "cpanel", "wp-admin"}
      for _, p := range interestingPatterns {
          if strings.Contains(combined, p) {
              badges = append(badges, "interesting")
              break
          }
      }

      apiPatterns := []string{"api", "swagger", "openapi", "graphql"}
      for _, p := range apiPatterns {
          if strings.Contains(combined, p) {
              badges = append(badges, "api")
              break
          }
      }

      return strings.Join(badges, ",")
  }



func severityFromStatus(status string) string {
	switch {
	case strings.HasPrefix(status, "2"):
		return "high"
	case strings.HasPrefix(status, "5"):
		return "medium"
	default:
		return "low"
	}
}

func ImportPathHits(domain string) error {
	db, err := getDB(domain)
	if err != nil {
		return fmt.Errorf("failed to get db: %w", err)
	}

	home, _ := os.UserHomeDir()
	fullPath := filepath.Join(home, ".recon", domain, "probe", "httpx", domain+"_path_hits.txt")
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		return nil // no hits file is fine
	}

	file, err := os.Open(fullPath)
	if err != nil {
		return fmt.Errorf("failed opening path hits file: %w", err)
	}
	defer file.Close()

	tx, err := db.Begin()
	if err != nil {
		return err
	}

	stmt, err := tx.Prepare(`INSERT INTO juicy_hits (url, status_code, size, severity)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(url) DO UPDATE SET
			status_code = excluded.status_code,
			size        = excluded.size,
			severity    = excluded.severity`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "|", 3)
		if len(parts) != 3 {
			continue
		}
		url, status, size := parts[0], parts[1], parts[2]
		severity := severityFromStatus(status)

		if _, err := stmt.Exec(url, status, size, severity); err != nil {
			tx.Rollback()
			return err
		}
	}
	if err := scanner.Err(); err != nil {
		tx.Rollback()
		return err
	}

	return tx.Commit()
}

func ImportHttpx(domain string) error {

	db, err := getDB(domain)
	if err != nil {
        return fmt.Errorf("failed to get db: %w", err)
    }
	home, _ := os.UserHomeDir()
	fullPath := filepath.Join(home, ".recon", domain, "probe", "httpx", domain+"_httpx_enriched.json")

	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
    	return errors.New("file does not exist")
	}

	file, err := os.Open(fullPath)
	if err != nil {
	    return errors.New("failed opening file")
	}
	defer file.Close()


	tx, err := db.Begin()
    if err != nil {
        return err
    }
    //  domain_name  TEXT UNIQUE,
    //     status_code  INT,
    //     open_ports   TEXT,
    //     title        TEXT,
    //     tech_stack   TEXT,
    //     content_type TEXT,
    //     server       TEXT,
    //     ips          TEXT,
    //     cname        TEXT,
    //     badges       TEXT
    // );`)

    stmt, err := tx.Prepare(`INSERT INTO domains (domain_name, status_code, title, server, content_type, tech_stack, ips, cname, open_ports, badges)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(domain_name) DO UPDATE SET
            status_code  = excluded.status_code,
            title        = excluded.title,
            server       = excluded.server,
            content_type = excluded.content_type,
            tech_stack   = excluded.tech_stack,
            ips          = excluded.ips,
            cname        = excluded.cname,
            open_ports   = excluded.open_ports,
            badges       = excluded.badges`)
    if err != nil {
        tx.Rollback()
        
        return err
    }
    defer stmt.Close()


	scanner := bufio.NewScanner(file)
    for scanner.Scan() {
    	var entry HttpxEntry
    	if err := json.Unmarshal(scanner.Bytes(), &entry); err != nil {
        	continue 
      	}

      	badges := computeBadges(entry.URL, entry.Title)

      	_, err = stmt.Exec(entry.URL, entry.StatusCode, entry.Title, entry.WebServer, entry.ContentType, 
      		strings.Join(entry.Tech, ", "), 
      		strings.Join(entry.IPs, ", "),  
      		strings.Join(entry.CNAME, ", "),
      		joinInts(entry.OpenPorts), badges)

      	if err != nil {
            tx.Rollback() // rollback on any error
             fmt.Println("failed to insert:", err)
       		 return err
        }
    }
    if err := scanner.Err(); err != nil {  
        tx.Rollback()
        return err
    }

    return tx.Commit()

}