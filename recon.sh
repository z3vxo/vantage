#!/bin/bash
set -euo pipefail

if [ -z "$1" ]; then
    echo "Usage: $0 <domain>"
    exit 1
fi

DOMAIN=$1

die() { echo -e "\033[1;31m[!]\033[0m $*" >&2; exit 1; }

bash recon-files/subdomain2.sh "$DOMAIN"       || die "Stage 1 (passive enumeration) failed"
[[ -s subdomains/all_subs.txt ]]               || die "Stage 1 produced no subdomains — aborting"

bash recon-files/subdomains_active.sh "$DOMAIN" || die "Stage 2 (active DNS) failed"
[[ -s subdomains/final_subs.txt ]]             || die "Stage 2 produced no resolved subdomains — aborting"

bash recon-files/alive_httpx_probe.sh "$DOMAIN" || die "Stage 3 (HTTP probe) failed"
#python3 server/app.py
