package database

import (
    "database/sql"
    "errors"
    "os"
    "fmt"
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
}

func getDB(domain string) (*sql.DB, error) {
    mu.Lock()
    defer mu.Unlock()

    if db, ok := connections[domain]; ok {
        return db, nil
    }

    dbPath := "databases/" + domain + "_db.sql"
    db, err := sql.Open("sqlite3", dbPath)
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
    fullFileName := "./databases/" + name + "_db.sql"

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

    return nil
}



// Handles importing data from disk
func ImportData(domain string) error {
	if err := ImportHttpx(domain); err != nil {
		return err
	}
	if err := ImportPathHits(domain); err != nil {
		return err
	}
	return nil
}

func WriteNote(target string, note string) error {
    db, err := getDB(target)
    if err != nil {
        fmt.Println(err)
        return err
    }

    _, err = db.Exec("UPDATE domains SET notes = ? WHERE domain_name = ?", note, target)
    if err != nil {
        fmt.Println(err)
        return err
    }

    return nil
}