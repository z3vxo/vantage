---
name: server2 Go dashboard
description: Architecture, routes, features, and todo for Vantage — the Go+React bug bounty recon dashboard
type: project
---

Go-powered recon dashboard called **Vantage** in server2/. Ignore old server/ directory.

**How to run:** `go run ./server2/cmd/main.go` → http://127.0.0.1:8080 (nginx proxies port 80)
**Build:** `./server2/build.sh [all|frontend|backend]`

---

## Key file structure

### Backend (Go)
| File | Purpose |
|------|---------|
| `server2/cmd/main.go` | Entry point — sets up logging, starts Telegram bot goroutine, calls `server.Run()` |
| `server2/internal/server/server.go` | Chi v5 router, `authMiddleware` applied globally, static file serving, `loadSessions()` on startup |
| `server2/internal/server/routes.go` | All HTTP handlers, auth logic, session management, logging |
| `server2/internal/database/types.go` | Structs: HttpxEntry, Host, HostResponse, HitResponse, Stats, HostsResult, PortServices, DomainEntry |
| `server2/internal/database/db_ops.go` | getDB, CreateNewTarget, ImportData, migrateDB, WriteNote, UpdateTriage, DeleteData, DbDir(), dbDir(), reconHome() |
| `server2/internal/database/importHelper.go` | ImportHttpx, ImportPathHits, computeBadges, severityFromStatus |
| `server2/internal/database/db_reads.go` | ReadHosts, ReadHits, GetStats, GetDomainNames, transformHost, statusClass, splitTrim |
| `server2/internal/database/js_db.go` | SaveJsResults, GetJsResults — JS scan DB read/write |
| `server2/internal/tools/screenshot.go` | Async screenshot job system: job map, RWMutex, Screenshot(), SanitizeForFilename() |
| `server2/internal/tools/telegram.go` | SendTelegram(), StartTeleGramBot() poll loop, RunWorkFlow(), ListTargets(), ListDomains(), ListInfo() |
| `server2/internal/tools/shared.go` | Job system: JobStatus, JobResult, SetJob, GetJob, deleteJob — shared across all async tools |
| `server2/internal/tools/js.go` | ScrapeAndScan() pipeline: gau+waybackurls+katana → dedup → httpx download → linkfinder+secretsfinder+trufflehog |
| `server2/internal/tools/ai.go` | (legacy AI triage — unused, kept for reference) |

### Frontend (React + TypeScript)
| File | Purpose |
|------|---------|
| `server2/frontend/src/main.tsx` | React entry point |
| `server2/frontend/src/App.tsx` | React Router — `/login` → LoginPage, `/` → TargetsPage, `/dashboard` → DashboardPage |
| `server2/frontend/src/lib/types.ts` | TypeScript interfaces + `fetchApi()` wrapper (redirects to /login on 401) |
| `server2/frontend/src/pages/LoginPage.tsx` | Login form — POST /api/login, handles /goaway redirect via `redirect: 'manual'` |
| `server2/frontend/src/pages/TargetsPage.tsx` | Target selection — table, stats, new target modal, delete |
| `server2/frontend/src/pages/DashboardPage.tsx` | Dashboard shell — tab switcher (hosts/hits/recon/overview/js), fetches hosts + hits |
| `server2/frontend/src/pages/HostsTab.tsx` | Host enumeration table — virtual list, group/expand, filter, sort, hide, triage tags, import |
| `server2/frontend/src/pages/HitsTab.tsx` | Juicy hits table — severity badges, filter, sort by severity |
| `server2/frontend/src/pages/ReconTab.tsx` | Automated recon tab — domain input, POST /api/workflow, toast on success |
| `server2/frontend/src/pages/OverviewTab.tsx` | Overview — sidebar host list, screenshot viewer/capture, host info, triage, notes |
| `server2/frontend/src/pages/HostPanel.tsx` | Side panel — host detail, triage, notes, "Overview ↗" link |
| `server2/frontend/src/pages/JSTab.tsx` | JS analysis tab — sidebar host list, per-host scrape+scan, secrets table, links table, headless toggle |
| `server2/frontend/src/styles/globals.css` | Supabase-inspired dark theme, emerald accent #3ecf8e, IBM Plex Sans |
| `server2/frontend/vite.config.ts` | Vite build config — dev proxy `/api` + `/images` → http://127.0.0.1:8080 |

### Data paths (all under ~/.recon/)
| Path | Purpose |
|------|---------|
| `~/.recon/databases/<domain>_db.sql` | Per-target SQLite files |
| `~/.recon/logs/recon.log` | Server logs (slog, DEBUG level) |
| `~/.recon/sessions.json` | Persisted login sessions — survive restarts |
| `~/.recon/<domain>/probe/httpx/` | Recon script output consumed by ImportData |
| `~/.recon/<domain>/<sanitized_hostURL>/js/response/` | Downloaded JS files (httpx -srd, subdirs per hostname) |
| `server2/static/dist/` | Vite build output — served by Go |
| `server2/static/images/screenshots/` | Cached screenshot files |
| `server2/temp/<job_id>/` | Temp dir for JS URL collection (cleaned up after scan) |

---

## Auth
- Cookie-based session auth (`session` cookie, HttpOnly, SameSite=Strict)
- Sessions persisted to `~/.recon/sessions.json` — survive restarts
- TTL: 30 days, MaxAge: 30*86400
- Credentials: hardcoded in `Login_Handler` (`user`/`pass` vars, lines ~298-299)
- Wrong credentials → 303 redirect to `/goaway` (returns "Stop looking here" HTML)
- `authMiddleware` applied globally — skips non-`/api/` paths and `/api/login`
- Frontend `fetchApi()` redirects to `/login` on any 401
- Login attempts logged: success=INFO, fail=WARN (includes username + IP)
- Unauthorized API requests logged: WARN with path + IP
- `/goaway` hits logged: WARN with IP

---

## Active API routes

### Public
| Method | Route | Handler | Notes |
|--------|-------|---------|-------|
| POST | `/api/login` | `Login_Handler` | Body: `{ username, password }` → sets session cookie |
| GET | `/goaway` | `GoAway_Handler` | Honeypot — logged on every hit |

### Target-level (auth required)
| Method | Route | Handler | Notes |
|--------|-------|---------|-------|
| GET | `/api/targets` | `Targets_Handler` | Lists targets from `~/.recon/databases/` |
| POST | `/api/targets/new` | `NewTargetHandler` | Creates new SQLite DB for domain |
| POST | `/api/import/{domain}` | `ImportHandler` | Reads probe JSON from disk, upserts into DB |
| DELETE | `/api/delete/{domain}` | `deleteTargetHandler` | Deletes DB file |
| GET | `/api/{domain}/hosts` | `Host_Handler` | Returns `{ stats, hosts[] }` |
| GET | `/api/{domain}/hits` | `Juicy_Handler` | Returns `{ hits[] }` |
| POST | `/api/workflow` | `Worflow_Handler` | Body: `{ target }` → fires `RunWorkFlow` goroutine |
| GET | `/api/tools/status` | `ToolStatus_Handler` | `?id=<uuid>` → `{ status: pending\|done\|failed }` shared across all async tools |
| GET | `/api/logs` | `Logs_Handler` | Downloads `~/.recon/logs/recon.log` |

### Host-level (auth required)
| Method | Route | Handler | Notes |
|--------|-------|---------|-------|
| PATCH | `/api/{domain}/host/{hostURL}/triage` | `Triage_Handler` | Body: `{ domain, status }` |
| PATCH | `/api/{domain}/host/{hostURL}/notes` | `Notes_Handler` | Body: `{ domain, notes }` |
| POST | `/api/{domain}/host/{hostURL}/screenshot` | `ScreenShot_Handler` | Starts gowitness job, returns `{ token }` |
| GET | `/api/{domain}/host/{hostURL}/screenshot/status` | `ScreenShotStatus_Handler` | Poll `?token=<uuid>` → pending/done/failed |
| GET | `/api/{domain}/host/{hostURL}/screenshot` | `ScreenShotServe_Handler` | Serves cached screenshot image |
| POST | `/api/{domain}/host/{hostURL}/js` | `JsTool_Handler` | Body: `{ headless: bool }` → starts ScrapeAndScan, returns `{ id }` |
| GET | `/api/{domain}/host/{hostURL}/js` | `JsTool_Handler` | Returns stored JS results `{ secrets[], links[] }` from DB |

---

## JS Analysis pipeline (tools/js.go)

### ScrapeAndScan(host, id, domain, headless)
1. Creates `./temp/<id>/` working dir
2. Runs in parallel: `gau <hostname>`, `waybackurls <hostname>`, `katana -u <hostURL> -d 2 -jc [-hl -nos if headless]`
3. `deDupeAndExtract` — cat all .txt files, sort -u, grep `.js`, grep hostname → `<id>_js.txt`
4. `ScrapeJsFiles` — httpx downloads JS files to `~/.recon/<domain>/<sanitized_hostURL>/js/` with `-mc 200`
5. `analyzeJsFiles` — walks `response/` tree (skips dirs), per file runs LinkFinder + SecretsFinder in parallel goroutines
6. TruffleHog runs on full `response/` dir as second pass
7. `isNoise()` filter drops false positives: values >200 chars or containing JS syntax patterns
8. Saves to DB via `SaveJsResults`, cleans up temp dir, sets job done

### Tools used
| Tool | Purpose |
|------|---------|
| gau | Passive URL collection (historical) |
| waybackurls | Passive URL collection (Wayback Machine) |
| katana | Active crawler, `-jc` JS parsing, `-hl -nos` for headless |
| httpx | Bulk JS file download (`-sr -srd -mc 200`) |
| LinkFinder | Extract URLs/paths from JS (`-o cli`) |
| SecretsFinder | Regex-based secret detection (`-o cli`) |
| TruffleHog | Entropy-based secret validation (`filesystem --json --no-verification`) |

### Tool paths
- LinkFinder: `~/tools/linkFinder/linkfinder.py`
- SecretsFinder: `~/tools/secretFinder/SecretFinder.py`
- All others: system PATH

---

## Automated recon pipeline (tools/telegram.go)

### Via dashboard (ReconTab)
- `POST /api/workflow {"target":"example.com"}` → fires goroutine, returns 200 immediately
- Frontend shows toast "Recon started — watch Telegram for updates"

### Via Telegram bot
- `StartTeleGramBot()` runs as goroutine on server start
- Polls `GET /getUpdates?offset=<n>` every 2 seconds
- Verifies `chat.id` matches `TELEGRAM_CHAT_ID` env var before acting
- Messages use `parse_mode=HTML` — supports `<u>underline</u>` etc.

### Commands
| Command | Description |
|---------|-------------|
| `/start <domain>` | Fires `RunWorkFlow(domain)` |
| `/targets` | Lists all targets (underlined) |
| `/domains <target>` | Lists all hosts for target in chunks of 15 with status codes |
| `/info <domain>` | Shows host/2xx/4xx/5xx/hits stats with colour emojis |
| `/js <domain>` | (stub — CMD_JS defined, handler commented out) |

### RunWorkFlow(domain)
1. Checks `isRunning(domain)` — deduplicates concurrent runs
2. Sends `[*] Starting recon — <domain>`
3. `exec.Command("./recon.sh", domain)` with `cmd.Dir = ".."`
4. `database.CreateNewTarget(domain)` — ignores `ErrDomainExists`
5. `database.ImportData(domain)` — ImportHttpx + ImportPathHits
6. `database.GetStats(domain)` — queries DB for counts
7. Sends completion message with 🟢 2xx / 🟡 4xx / 🔴 5xx emojis

### Env vars required
| Var | Purpose |
|-----|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Your personal chat ID from @userinfobot |

---

## DB schema
```sql
CREATE TABLE domains (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_name    TEXT UNIQUE,
  status_code    TEXT,
  open_ports     TEXT,  -- comma-separated
  title          TEXT,
  tech_stack     TEXT,  -- comma-separated
  content_type   TEXT,
  server         TEXT,
  ips            TEXT,  -- comma-separated
  cname          TEXT,  -- comma-separated
  badges         TEXT,  -- comma-separated: "interesting,api"
  triage_status  TEXT DEFAULT '',
  notes          TEXT DEFAULT '',
  tier_tag       TEXT DEFAULT '',
  tier_reason    TEXT DEFAULT ''
);

CREATE TABLE juicy_hits (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  url          TEXT UNIQUE,
  status_code  TEXT,
  size         TEXT,
  severity     TEXT  -- high, medium, low
);

CREATE TABLE js_files (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  host_url  TEXT,
  file_path TEXT
);

CREATE TABLE js_secrets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  js_file_id  INTEGER,
  secret_type TEXT,
  value       TEXT,
  FOREIGN KEY(js_file_id) REFERENCES js_files(id)
);

CREATE TABLE js_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  js_file_id INTEGER,
  url        TEXT,
  FOREIGN KEY(js_file_id) REFERENCES js_files(id)
);
```

---

## Important data notes
- Probe files read from `~/.recon/<domain>/probe/httpx/<domain>_httpx_enriched.json` (JSONL) and `<domain>_path_hits.txt`
- httpx probe uses `-location` (no `-follow-redirects`) — alt-port entries that 3xx redirect to same host:443 root are filtered out in `alive_httpx_probe.sh`
- IP field in httpx JSON is `"a"` (DNS A record)
- ON CONFLICT upsert on `domain_name` preserves `triage_status`/`notes` on re-import
- Severity: 2xx→high, 5xx→medium, else→low
- Badges: "interesting" (login/admin/dashboard/portal/jenkins/kibana etc), "api" (api/swagger/openapi/graphql)
- `hostURL` Chi URL params must be `url.QueryUnescape`d
- JS files saved by httpx into `response/<hostname>/` subdirs — use `filepath.Walk` not `Glob` to enumerate

---

## Logging (slog, ~/.recon/logs/recon.log)
| Level | Event |
|-------|-------|
| WARN | No session cookie on protected route (path + IP) |
| WARN | Invalid/expired session (path + IP) |
| WARN | Failed login attempt (username + IP) |
| WARN | `/goaway` hit (IP) |
| INFO | Successful login (username + IP) |
| INFO | New target created |
| INFO | Target deleted |
| INFO | Import started + complete |
| INFO | Screenshot started |
| INFO | Recon workflow triggered (target + IP) |
| INFO | JS scrape and scan started (host + id + headless) |
| INFO | JS dedup complete (bytes), files downloaded (count) |
| WARN | JS no URLs found / no files downloaded |
| DEBUG | Triage updated |
| DEBUG | gau/waybackurls/katana done (line counts) |
| ERROR | All DB/operation failures |

---

## TODO

1. **Workflow job status polling** — frontend ReconTab has no progress feedback after triggering
2. **Port scanning** — implement `POST /api/{domain}/host/{hostURL}/portscan` (nmap/masscan, fire-and-forget like screenshots)
3. **DB schema refactor** — remove comma-separated columns, add junction tables for ips/cnames/tech/ports
4. **Telegram /js command** — `CMD_JS` defined, handler stubbed out — needs `ScrapeAndScan` wired up with a job ID
5. **JS re-scan dedup** — re-running JS scan appends to DB rather than replacing; needs clear-before-rescan logic
