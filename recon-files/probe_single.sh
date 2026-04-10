#!/bin/bash
# probe_single.sh — probe a single host and append to an existing target's enriched JSON
# Usage: ./probe_single.sh <host_url> <target_domain>
# Example: ./probe_single.sh app.clovr.dev clovr.dev

set -euo pipefail

if [[ -z "${1:-}" || -z "${2:-}" ]]; then
    echo "Usage: $0 <host_url> <target_domain>" >&2
    echo "  host_url:      the host to probe (e.g. app.clovr.dev)" >&2
    echo "  target_domain: the target the host belongs to (e.g. clovr.dev)" >&2
    exit 1
fi

HOST="$1"
DOMAIN="$2"
httpx_dir="$HOME/.recon/$DOMAIN/probe/httpx"
enriched="$httpx_dir/${DOMAIN}_httpx_enriched.json"

PORTS="80,443,3000,3001,8000,8080,8443,8888"

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

RED='\e[31m'; GREEN='\e[32m'; BLUE='\e[34m'; BOLD="\e[1m"; ENDCOLOR='\e[0m'

mkdir -p "$httpx_dir"

if [[ ! -f "$enriched" ]]; then
    echo -e "${BOLD}${RED}[!]${ENDCOLOR} $enriched not found — run the main probe first" >&2
    exit 1
fi

# Check if host is already in the enriched file
if grep -q "\"$HOST\"" "$enriched" 2>/dev/null; then
    echo -e "${BOLD}${BLUE}[*]${ENDCOLOR} $HOST already exists in enriched JSON — will upsert on import"
fi

echo -e "${BOLD}${BLUE}[+]${ENDCOLOR} Probing $HOST..."

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

httpx -silent \
    -u "$HOST" \
    -p "$PORTS" \
    -t 50 \
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
    -timeout 5 \
    -retries 1 \
    -mc "200,201,204,301,302,401,403,404,405,407,409,429,503" \
    -status-code \
    -title \
    -tech-detect \
    -content-length \
    -web-server \
    -ip \
    -cname \
    -location \
    -json \
    -o "$tmpfile" > /dev/null 2>&1 || true

if [[ ! -s "$tmpfile" ]]; then
    echo -e "${BOLD}${RED}[!]${ENDCOLOR} httpx returned no results for $HOST" >&2
    exit 1
fi

count=$(wc -l < "$tmpfile")
echo -e "${BOLD}${GREEN}[*]${ENDCOLOR} Got $count result(s) — appending to enriched JSON"

cat "$tmpfile" >> "$enriched"

echo -e "${BOLD}${GREEN}[*]${ENDCOLOR} Done. Now re-import $DOMAIN in the dashboard to pick up the changes."
