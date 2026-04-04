#!/bin/bash
set -euo pipefail

if [[ -z "${1:-}" ]]; then
    echo "Usage: $0 <domain>" >&2
    exit 1
fi

DOMAIN=$1
subs_dir="$HOME/.recon/$DOMAIN/subdomains"
probe="$HOME/.recon/$DOMAIN/probe"
portscan_dir="$HOME/.recon/$DOMAIN/probe/port-scan"
temp="$HOME/.recon/$DOMAIN/temp"
cdn_ranges="$temp/cdn_ranges.txt"

# ── Colours ───────────────────────────────────
R="\033[0;31m"; G="\033[0;32m"; B="\033[0;34m"; BOLD="\033[1m"; NC="\033[0m"
log_info() { echo -e "${BOLD}${B}[+]${NC} $1"; }
log_ok()   { echo -e "${BOLD}${G}[*]${NC} $1"; }
log_err()  { echo -e "${BOLD}${R}[!]${NC} $1" >&2; }
die()      { log_err "$*"; exit 1; }

check_tools() {
    for tool in dnsx masscan grepcidr whois jq python3; do
        command -v "$tool" &>/dev/null || die "$tool is not installed"
    done
}

check_ranges_download() {
    mkdir -p "$temp"

    # download if missing or older than 7 days
    if [ ! -f "$cdn_ranges" ] || [ $(find "$cdn_ranges" -mtime +7 | wc -l) -gt 0 ]; then
        log_info "Downloading CDN ranges..."

        # Cloudflare
        curl -sf https://www.cloudflare.com/ips-v4 > "$cdn_ranges" \
            && log_ok "Cloudflare ranges downloaded" \
            || log_err "Failed to download Cloudflare ranges"

        # Fastly
        curl -sf https://api.fastly.com/public-ip-list \
            | jq -r '.addresses[]' >> "$cdn_ranges" \
            && log_ok "Fastly ranges downloaded" \
            || log_err "Failed to download Fastly ranges"

        # AWS CloudFront
        curl -sf https://ip-ranges.amazonaws.com/ip-ranges.json \
            | jq -r '.prefixes[] | select(.service=="CLOUDFRONT") | .ip_prefix' >> "$cdn_ranges" \
            && log_ok "CloudFront ranges downloaded" \
            || log_err "Failed to download CloudFront ranges"

        # Google Cloud
        curl -sf https://www.gstatic.com/ipranges/cloud.json \
            | jq -r '.prefixes[] | select(.scope=="global") | .ipv4Prefix // empty' >> "$cdn_ranges" \
            && log_ok "Google Cloud ranges downloaded" \
            || log_err "Failed to download Google Cloud ranges"

        # Akamai (AS20940, AS16625)
        whois -h whois.radb.net -- '-i origin AS20940' \
            | grep -oP '(\d+\.){3}\d+/\d+' >> "$cdn_ranges"
        whois -h whois.radb.net -- '-i origin AS16625' \
            | grep -oP '(\d+\.){3}\d+/\d+' >> "$cdn_ranges"
        log_ok "Akamai ranges downloaded"

        # Incapsula/Imperva (AS19551)
        whois -h whois.radb.net -- '-i origin AS19551' \
            | grep -oP '(\d+\.){3}\d+/\d+' >> "$cdn_ranges"
        log_ok "Incapsula ranges downloaded"

        # Sucuri (AS30148)
        whois -h whois.radb.net -- '-i origin AS30148' \
            | grep -oP '(\d+\.){3}\d+/\d+' >> "$cdn_ranges"
        log_ok "Sucuri ranges downloaded"

        # deduplicate
        sort -u "$cdn_ranges" -o "$cdn_ranges"
        log_ok "CDN ranges saved to $cdn_ranges ($(wc -l < "$cdn_ranges") entries)"
    else
        log_ok "CDN ranges up to date ($(stat -c %y "$cdn_ranges" | cut -d' ' -f1))"
    fi
}


extract_ips_json() {
    local ips_file=$1
    log_info "Parsing IPs and checking CDN ranges..." >&2

    python3 - "$ips_file" "$cdn_ranges" <<'EOF'
import sys, json, re, subprocess

ips_file    = sys.argv[1]
ranges_file = sys.argv[2]

# parse ips.txt -> {domain: [ip, ...]}
domain_ips = {}
for line in open(ips_file):
    line = line.strip()
    if not line:
        continue
    parts = line.split()
    if len(parts) < 2:
        continue
    domain = parts[0]
    ip = re.search(r'\d+\.\d+\.\d+\.\d+', line)
    if not ip:
        continue
    ip = ip.group()
    domain_ips.setdefault(domain, [])
    if ip not in domain_ips[domain]:
        domain_ips[domain].append(ip)

# check each unique IP against CDN ranges via grepcidr
all_ips = {ip for ips in domain_ips.values() for ip in ips}
cdn_ips = set()
for ip in all_ips:
    result = subprocess.run(
        ["grepcidr", "-f", ranges_file],
        input=ip, capture_output=True, text=True
    )
    if result.stdout.strip():
        cdn_ips.add(ip)

# build per-domain entries with cdn flag
entries = []
for domain, ips in domain_ips.items():
    is_cdn = all(ip in cdn_ips for ip in ips)
    entry = {"domain": domain, "ips": ips}
    if is_cdn:
        entry["cdn"] = True
    entries.append(entry)

print(json.dumps(entries, indent=2))
EOF
}

run_portscan() {
    local domain_ips_file=$1
    local masscan_file=$2
    local ports_file=$3
    local scan_targets="$portscan_dir/${DOMAIN}_scan_targets.txt"

    log_info "Extracting non-CDN IPs for scanning..."

    # get unique non-CDN IPs
    python3 - "$domain_ips_file" <<'EOF' > "$scan_targets"
import sys, json
entries = json.load(open(sys.argv[1]))
ips = {ip for e in entries if not e.get("cdn") for ip in e["ips"]}
print("\n".join(sorted(ips)))
EOF

    local count=$(wc -l < "$scan_targets")
    if [[ "$count" -eq 0 ]]; then
        log_ok "All domains are CDN-hosted — skipping masscan"
        echo '[]' > "$ports_file"
        return
    fi
    log_ok "Scanning $count IPs with masscan..."

    sudo masscan -iL "$scan_targets" -p0-10000 --rate=20000 -oJ "$masscan_file" 2>/dev/null \
        || die "masscan failed"
    log_ok "Masscan complete"

    log_info "Building final port JSON..."
    python3 - "$domain_ips_file" "$masscan_file" <<'EOF' > "$ports_file"
import sys, json, collections

entries    = json.load(open(sys.argv[1]))
masscan    = json.load(open(sys.argv[2]))

# masscan json: [{ip, ports:[{port,proto},...]}]
ip_ports = collections.defaultdict(set)
for host in masscan:
    ip = host.get("ip")
    for p in host.get("ports", []):
        ip_ports[ip].add(p["port"])

# build ip -> [domains] map
ip_domains = collections.defaultdict(list)
for e in entries:
    if not e.get("cdn"):
        for ip in e["ips"]:
            if e["domain"] not in ip_domains[ip]:
                ip_domains[ip].append(e["domain"])

# group IPs that share the same domain set
results = []
for ip, ports in ip_ports.items():
    results.append({
        "IPs":     [ip],
        "domains": ip_domains.get(ip, []),
        "ports":   sorted(ports)
    })

print(json.dumps(results, indent=2))
EOF
    log_ok "Final port data saved to $ports_file"
}



mkdir -p "$portscan_dir"

check_tools
[[ -s "$subs_dir/final_subs.txt" ]] || die "final_subs.txt is empty — run subdomains_active.sh first"

check_ranges_download

log_info "Resolving domains..."
dnsx -l "$subs_dir/final_subs.txt" -a -resp -o "$portscan_dir/${DOMAIN}_ips.txt" > /dev/null 2>&1 \
    || die "dnsx failed"
[[ -s "$portscan_dir/${DOMAIN}_ips.txt" ]] || die "dnsx resolved no IPs"
log_ok "Resolved domains"

extract_ips_json "$portscan_dir/${DOMAIN}_ips.txt" > "$portscan_dir/${DOMAIN}_domain_ips.json" \
    || die "Failed to build domain/IP mapping"
[[ -s "$portscan_dir/${DOMAIN}_domain_ips.json" ]] || die "${DOMAIN}_domain_ips.json is empty"
log_ok "Domain/IP mapping saved to $portscan_dir/${DOMAIN}_domain_ips.json"

run_portscan "$portscan_dir/${DOMAIN}_domain_ips.json" "$portscan_dir/${DOMAIN}_masscan.json" "$portscan_dir/${DOMAIN}_ports.json"