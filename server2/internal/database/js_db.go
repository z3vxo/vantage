package database

import "fmt"

type JsSecret struct {
	File  string `json:"file"`
	Type  string `json:"type"`
	Value string `json:"value"`
}

type JsLink struct {
	File string `json:"file"`
	URL  string `json:"url"`
}

type JsResults struct {
	Secrets []JsSecret `json:"secrets"`
	Links   []JsLink   `json:"links"`
}

func SaveJsResults(domain, hostURL string, secrets []JsSecret, links []JsLink) error {
	db, err := getDB(domain)
	if err != nil {
		return fmt.Errorf("failed to get db: %w", err)
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}

	// Clear previous results for this host before inserting fresh ones
	_, err = tx.Exec(`
		DELETE FROM js_secrets WHERE js_file_id IN (SELECT id FROM js_files WHERE host_url = ?)
	`, hostURL)
	if err != nil {
		tx.Rollback()
		return err
	}
	_, err = tx.Exec(`DELETE FROM js_links WHERE js_file_id IN (SELECT id FROM js_files WHERE host_url = ?)`, hostURL)
	if err != nil {
		tx.Rollback()
		return err
	}
	_, err = tx.Exec(`DELETE FROM js_files WHERE host_url = ?`, hostURL)
	if err != nil {
		tx.Rollback()
		return err
	}

	// Track file path → row id so secrets/links can reference it
	fileIDs := map[string]int64{}

	insertFile, err := tx.Prepare(`INSERT INTO js_files (host_url, file_path) VALUES (?, ?)`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer insertFile.Close()

	insertSecret, err := tx.Prepare(`INSERT INTO js_secrets (js_file_id, secret_type, value) VALUES (?, ?, ?)`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer insertSecret.Close()

	insertLink, err := tx.Prepare(`INSERT INTO js_links (js_file_id, url) VALUES (?, ?)`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer insertLink.Close()

	getOrCreateFile := func(filePath string) (int64, error) {
		if id, ok := fileIDs[filePath]; ok {
			return id, nil
		}
		res, err := insertFile.Exec(hostURL, filePath)
		if err != nil {
			return 0, err
		}
		id, _ := res.LastInsertId()
		fileIDs[filePath] = id
		return id, nil
	}

	for _, s := range secrets {
		fileID, err := getOrCreateFile(s.File)
		if err != nil {
			tx.Rollback()
			return err
		}
		if _, err := insertSecret.Exec(fileID, s.Type, s.Value); err != nil {
			tx.Rollback()
			return err
		}
	}

	for _, l := range links {
		fileID, err := getOrCreateFile(l.File)
		if err != nil {
			tx.Rollback()
			return err
		}
		if _, err := insertLink.Exec(fileID, l.URL); err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

func GetJsResults(domain, hostURL string) (JsResults, error) {
	db, err := getDB(domain)
	if err != nil {
		return JsResults{}, fmt.Errorf("failed to get db: %w", err)
	}

	secretRows, err := db.Query(`
		SELECT jf.file_path, js.secret_type, js.value
		FROM js_secrets js
		JOIN js_files jf ON jf.id = js.js_file_id
		WHERE jf.host_url = ?`, hostURL)
	if err != nil {
		return JsResults{}, err
	}
	defer secretRows.Close()

	var secrets []JsSecret
	for secretRows.Next() {
		var s JsSecret
		if err := secretRows.Scan(&s.File, &s.Type, &s.Value); err != nil {
			return JsResults{}, err
		}
		secrets = append(secrets, s)
	}

	linkRows, err := db.Query(`
		SELECT jf.file_path, jl.url
		FROM js_links jl
		JOIN js_files jf ON jf.id = jl.js_file_id
		WHERE jf.host_url = ?`, hostURL)
	if err != nil {
		return JsResults{}, err
	}
	defer linkRows.Close()

	var links []JsLink
	for linkRows.Next() {
		var l JsLink
		if err := linkRows.Scan(&l.File, &l.URL); err != nil {
			return JsResults{}, err
		}
		links = append(links, l)
	}

	if secrets == nil {
		secrets = []JsSecret{}
	}
	if links == nil {
		links = []JsLink{}
	}

	return JsResults{Secrets: secrets, Links: links}, nil
}
