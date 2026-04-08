package database

import (
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"sync"

	_ "github.com/mattn/go-sqlite3"
)

var (
	connections = map[string]*sql.DB{}
	mu          sync.Mutex
)

var ErrDomainExists = errors.New("domain already exists")

func migrateDB(db *sql.DB) {
	// SQLite ignores "duplicate column" errors — safe to run on every open
	db.Exec(`ALTER TABLE domains ADD COLUMN triage_status TEXT NOT NULL DEFAULT ''`)
	db.Exec(`ALTER TABLE domains ADD COLUMN notes TEXT NOT NULL DEFAULT ''`)
	db.Exec(`CREATE TABLE IF NOT EXISTS js_files (
		id        INTEGER PRIMARY KEY AUTOINCREMENT,
		host_url  TEXT,
		file_path TEXT
	)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS js_secrets (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		js_file_id  INTEGER,
		secret_type TEXT,
		value       TEXT,
		FOREIGN KEY(js_file_id) REFERENCES js_files(id)
	)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS js_links (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		js_file_id INTEGER,
		url        TEXT,
		FOREIGN KEY(js_file_id) REFERENCES js_files(id)
	)`)
}

func reconHome() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".recon"
	}
	return home + "/.recon"
}

func dbDir() string  { return reconHome() + "/databases" }
func DbDir() string  { return dbDir() }
func dbPath(domain string) string { return dbDir() + "/" + domain + "_db.sql" }

func getDB(domain string) (*sql.DB, error) {
	mu.Lock()
	defer mu.Unlock()

	if db, ok := connections[domain]; ok {
		return db, nil
	}

	Path := dbPath(domain)
	db, err := sql.Open("sqlite3", Path)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	migrateDB(db)
	connections[domain] = db
	return db, nil
}

// Handles creating new target database
func CreateNewTarget(name string) error {

	if err := os.MkdirAll(dbDir(), 0755); err != nil {
		return err
	}

	fullFileName := dbPath(name)

	if _, err := os.Stat(fullFileName); err == nil {
		return ErrDomainExists
	}

	db, err := sql.Open("sqlite3", fullFileName)
	if err != nil {
		fmt.Println(err)
		return err
	}

	mu.Lock()
	connections[name] = db
	mu.Unlock()

	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS domains (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        domain_name  TEXT UNIQUE,
        status_code  TEXT,
        open_ports   TEXT,
        title        TEXT,
        tech_stack   TEXT,
        content_type TEXT,
        server       TEXT,
        ips          TEXT,
        cname        TEXT,
        badges        TEXT,
        tier_tag     TEXT NOT NULL DEFAULT '',
        tier_reason  TEXT NOT NULL DEFAULT '',
        triage_status TEXT NOT NULL DEFAULT '',
        notes         TEXT NOT NULL DEFAULT ''
    );`)
	if err != nil {
		fmt.Println(err)
		return err
	}

	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS juicy_hits (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        url         TEXT UNIQUE,
        status_code TEXT,
        size        TEXT,
        severity    TEXT
    );`)
	if err != nil {
		fmt.Println(err)
		return err
	}

	slog.Info("New Target Created", "domain", name)

	return nil
}

// Handles importing data from disk
func ImportData(domain string) error {
	slog.Debug("Importing Data", "domain", domain)

	if err := ImportHttpx(domain); err != nil {
		slog.Error("Failed Loading httpx data", "domain", domain)
		return err
	}
	if err := ImportPathHits(domain); err != nil {
		slog.Error("Failed Loading Path-Hits data", "domain", domain)
		return err
	}
	return nil
}

func DeleteData(domain string) error {
	slog.Debug("Deleting Data", "domain", domain)

	dbPath := dbPath(domain)

	err := os.Remove(dbPath)
	if err != nil {
		slog.Error("Failed Deleting Data", "path", dbPath)
		return err
	}

	slog.Info("Deleted Data", "path", dbPath)

	return nil

}

func WriteNote(target string, hostURL string, note string) error {
	db, err := getDB(target)
	if err != nil {
		fmt.Println(err)
		return err
	}

	_, err = db.Exec("UPDATE domains SET notes = ? WHERE domain_name = ?", note, hostURL)
	if err != nil {
		fmt.Println(err)
		return err
	}

	return nil
}

func UpdateTriage(target string, hostURL string, triageStatus string) error {

	db, err := getDB(target)
	if err != nil {
		return err
	}

	_, err = db.Exec("UPDATE domains SET triage_status = ? WHERE domain_name = ?", triageStatus, hostURL)
	if err != nil {
		return err
	}

	return nil

}
