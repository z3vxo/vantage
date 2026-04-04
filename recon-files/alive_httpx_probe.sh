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
subs_dir="subdomains"
httpx_dir="probe/httpx"

PORTS="80,443,2082,2083,2086,2087,3000,3001,3443,4200,4443,4567,5000,5001,5443,5601,7080,7443,8000,8001,8008,8080,8081,8082,8083,8090,8181,8443,8800,8834,8888,9000,9090,9200,9443,10000,10443"


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

    httpx -silent -follow-redirects \
        -l "$subs_file" \
        -p "$PORTS" \
        -status-code \
        -title \
        -tech-detect \
        -content-length \
        -web-server \
        -ip \
        -cname \
        -json \
        -o "$httpx_dir/${DOMAIN}_httpx_enriched.json" > /dev/null 2>&1

    echo -e "${BOLD}${GREEN}[*]${ENDCOLOR} Enrichment complete: ${BOLD}$(wc -l < "$httpx_dir/${DOMAIN}_httpx_enriched.json") hosts${ENDCOLOR}\n"
}

# ─────────────────────────────────────────────
path_probe() {
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
        -json \
        -o "$httpx_dir/${DOMAIN}_path_hits_raw.json" > /dev/null 2>&1

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
