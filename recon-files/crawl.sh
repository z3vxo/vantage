#!/bin/bash

R="\033[0;31m"; G="\033[0;32m"; B="\033[0;34m"; BOLD="\033[1m"; NC="\033[0m"
log_info() { echo -e "${BOLD}${B}[+]${NC} $1"; }
log_ok()   { echo -e "${BOLD}${G}[*]${NC} $1"; }
log_err()  { echo -e "${BOLD}${R}[!]${NC} $1" >&2; }

HEADLESS=false

checktools() {
    for tool in katana gau waybackurls jq; do
        if ! command -v "$tool" &>/dev/null; then
            log_err "$tool is not installed!"
            exit 1
        fi
    done
}

runpassive() {
    local domain="$1"
    local temp_dir="$HOME/.recon/$domain/temp"

    log_info "Running gau on $domain..."
    gau "$domain" > "$temp_dir/${domain}_gau.txt" 2>/dev/null
    log_ok "gau done: $(wc -l < "$temp_dir/${domain}_gau.txt") URLs"

    log_info "Running waybackurls on $domain..."
    waybackurls "$domain" > "$temp_dir/${domain}_wayback.txt" 2>/dev/null
    log_ok "waybackurls done: $(wc -l < "$temp_dir/${domain}_wayback.txt") URLs"
}

runactive() {
    local domain="$1"
    local temp_dir="$HOME/.recon/$domain/temp"
    local katana_args=(-u "https://$domain" -d 3 -jc -kf all -c 20 -silent)

    if [ "$HEADLESS" = true ]; then
        log_info "Running katana (headless) on $domain..."
        katana_args+=(-headless)
    else
        log_info "Running katana on $domain..."
    fi

    katana "${katana_args[@]}" -o "$temp_dir/${domain}_katana.txt" > /dev/null 2>&1
    log_ok "katana done: $(wc -l < "$temp_dir/${domain}_katana.txt") URLs"
}

# ── Arg parsing ──
if [ -z "$1" ]; then
    log_err "Domain file not set, run with: $0 <file> [--headless]"
    exit 1
fi

DOMAINS_FILE="$1"

if [ "${2}" = "--headless" ]; then
    HEADLESS=true
    log_info "Headless mode enabled"
fi

checktools

while IFS= read -r line; do
    [ -z "$line" ] && continue
    log_info "Processing $line..."
    mkdir -p "$HOME/.recon/$line/temp"
    #runpassive "$line"
    runactive "$line"
    echo ""
done < "$DOMAINS_FILE"