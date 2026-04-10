#!/bin/bash

# ─────────────────────────────────────────────
#  alive_httpx_probe.sh
#  Input:  subdomains/final_subs.txt
#  Output: probe/httpx/
# ─────────────────────────────────────────────

set -euo pipefail

if [[ -z "${1:-}" ]]; then
    echo "Usage: $0 <domain>" >&2
    exit 1
fi

DOMAIN=$1
subs_dir="$HOME/.recon/$DOMAIN/subdomains"
httpx_dir="$HOME/.recon/$DOMAIN/probe/httpx"

PORTS="80,443,2082,2083,2086,2087,3000,3001,3443,4200,4443,4567,5000,5001,5443,5601,7080,7443,8000,8001,8008,8080,8081,8082,8083,8090,8181,8443,8800,8834,8888,9000,9090,9200,9443,10000,10443"
match_codes="200,201,204,301,302,401,403,409,429,405"
accept_hdr="Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
accept_lang_hdr="Accept-Language: en-US,en;q=0.5"
accept_enc_hdr="Accept-Encoding: gzip, deflate, br, zstd"
conn_hdr="Connection: keep-alive"
upgrade_hdr="Upgrade-Insecure-Requests: 1"
cache_hdr="Cache-Control: max-age=0"
sf_dest_hdr="Sec-Fetch-Dest: document"
sf_mode_hdr="Sec-Fetch-Mode: navigate"
sf_site_hdr="Sec-Fetch-Site: none"
sf_user_hdr="Sec-Fetch-User: ?1"

RED='\e[31m'; GREEN='\e[32m'; YELLOW='\e[33m'; BLUE='\e[34m'
BOLD="\e[1m"; ENDCOLOR='\e[0m'

mkdir -p "$httpx_dir"
rm -f "$httpx_dir/${DOMAIN}_httpx_enriched.json" "$httpx_dir/${DOMAIN}_path_targets.txt" "$httpx_dir/${DOMAIN}_path_hits_raw.json" "$httpx_dir/${DOMAIN}_path_hits.txt"

# ─────────────────────────────────────────────
check_tools() {
    for tool in httpx jq python3; do
        if ! command -v "$tool" &>/dev/null; then
            echo -e "${BOLD}${RED}[!]${ENDCOLOR} $tool is not installed!"
            exit 1
        fi
    done
}

# ─────────────────────────────────────────────
httpx_enrich() {
    local subs_file="$subs_dir/final_subs.txt"
    [[ -s "$subs_file" ]] || { echo -e "${BOLD}${RED}[!]${ENDCOLOR} $subs_file is empty or missing"; exit 1; }

    echo -e "${BOLD}${BLUE}[+]${ENDCOLOR} Probing $(wc -l < "$subs_file") domains across common ports..."

    httpx -silent \
        -l "$subs_file" \
        -p "$PORTS" \
        -t 200 \
        -rl 500 \
        -random-agent \
        -H "$accept_hdr" \
        -H "$accept_lang_hdr" \
        -H "$accept_enc_hdr" \
        -H "$conn_hdr" \
        -H "$upgrade_hdr" \
        -H "$cache_hdr" \
        -H "$sf_dest_hdr" \
        -H "$sf_mode_hdr" \
        -H "$sf_site_hdr" \
        -H "$sf_user_hdr" \
        -timeout 3 \
        -retries 0 \
        -mc "$match_codes" \
        -status-code \
        -title \
        -tech-detect \
        -content-length \
        -web-server \
        -ip \
        -cname \
        -location \
        -json \
        -o "$httpx_dir/${DOMAIN}_httpx_raw.json" > /dev/null 2>&1 || true

    # Drop alt-port entries that are just redirects to the canonical HTTPS site
    python3 - "$httpx_dir/${DOMAIN}_httpx_raw.json" <<'EOF' > "$httpx_dir/${DOMAIN}_httpx_enriched.json"
import sys, json
from urllib.parse import urlparse

for line in open(sys.argv[1]):
    line = line.strip()
    if not line:
        continue
    try:
        e = json.loads(line)
    except json.JSONDecodeError:
        print(line)
        continue

    sc = e.get("status_code", 0)
    location = e.get("location", "")
    url = e.get("url", "")

    if 300 <= sc < 400 and location and url:
        src = urlparse(url)
        dst = urlparse(location)
        if (src.hostname == dst.hostname
                and dst.scheme == "https"
                and dst.port in (None, 443)
                and dst.path in ("", "/")):
            continue  # redirect to canonical HTTPS root — skip

    print(line)
EOF

    local count=0
    [[ -s "$httpx_dir/${DOMAIN}_httpx_enriched.json" ]] && count=$(wc -l < "$httpx_dir/${DOMAIN}_httpx_enriched.json")
    echo -e "${BOLD}${GREEN}[*]${ENDCOLOR} Enrichment complete: ${BOLD}${count} hosts${ENDCOLOR}\n"
}

# ─────────────────────────────────────────────
path_probe() {
    [[ -s "$httpx_dir/${DOMAIN}_httpx_enriched.json" ]] || { echo -e "${BOLD}${YELLOW}[!]${ENDCOLOR} No live hosts found, skipping path probe"; return; }
    echo -e "${BOLD}${BLUE}[+]${ENDCOLOR} Probing juicy paths..."

    local paths=(
        /.git/config /.env /robots.txt /sitemap.xml /crossdomain.xml
        /clientaccesspolicy.xml /.well-known/security.txt
        /api/swagger /api/swagger.json /api/openapi.json /v1/swagger
        /actuator /actuator/env /actuator/mappings
        /phpinfo.php /server-status /server-info
        /wp-admin /wp-config.php.bak /.DS_Store
    )

    # generate full url+path list from enriched results
    while IFS= read -r base_url; do
        for path in "${paths[@]}"; do
            echo "${base_url}${path}"
        done
    done < <(jq -r '.url' "$httpx_dir/${DOMAIN}_httpx_enriched.json") > "$httpx_dir/${DOMAIN}_path_targets.txt"

    httpx -silent \
        -l "$httpx_dir/${DOMAIN}_path_targets.txt" \
        -mc 200 \
        -status-code \
        -content-length \
        -random-agent \
        -H "$accept_hdr" \
        -H "$accept_lang_hdr" \
        -H "$accept_enc_hdr" \
        -H "$conn_hdr" \
        -H "$upgrade_hdr" \
        -H "$cache_hdr" \
        -H "$sf_dest_hdr" \
        -H "$sf_mode_hdr" \
        -H "$sf_site_hdr" \
        -H "$sf_user_hdr" \
        -json \
        -o "$httpx_dir/${DOMAIN}_path_hits_raw.json" > /dev/null 2>&1 || true

    python3 - "$httpx_dir/${DOMAIN}_path_hits_raw.json" <<'EOF' > "$httpx_dir/${DOMAIN}_path_hits.txt"
import sys, json
for line in open(sys.argv[1]):
    line = line.strip()
    if not line:
        continue
    try:
        h = json.loads(line)
        size = h.get("content_length") or 0
        if size > 0:
            print(f"{h['url']}|{h['status_code']}|{size}")
    except (json.JSONDecodeError, KeyError):
        pass
EOF

    echo -e "${BOLD}${GREEN}[*]${ENDCOLOR} Path hits found: ${BOLD}$(wc -l < "$httpx_dir/${DOMAIN}_path_hits.txt")${ENDCOLOR}\n"
}

# ─────────────────────────────────────────────
main() {
    check_tools
    httpx_enrich
    path_probe
    echo -e "${BOLD}${GREEN}[*]${ENDCOLOR} Enriched JSON: ${BOLD}$httpx_dir/${DOMAIN}_httpx_enriched.json${ENDCOLOR}"
    echo -e "${BOLD}${GREEN}[*]${ENDCOLOR} Path hits:     ${BOLD}$httpx_dir/${DOMAIN}_path_hits.txt${ENDCOLOR}\n"
}

main
