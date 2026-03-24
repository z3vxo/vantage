#!/bin/bash
set -uo pipefail

subs_dir=“subdomains”
passive_dir=“subdomains/passive”
active=false

RED=’\e[31m’
GREEN=’\e[32m’
YELLOW=’\e[33m’
BLUE=’\e[34m’
MAGENTA=’\e[35m’
CYAN=’\e[36m’
BOLD=”\e[1m”
ENDCOLOR=’\e[0m’



check_tools() {
for tool in subfinder jq github-subdomains; do
if ! command -v “$tool” &> /dev/null; then
echo -e “${BOLD}${RED}[!]${ENDCOLOR} $tool is not installed!”
exit 1
fi
done
}



run_subfinder() {
subfinder -d “$url” -o “$passive_dir/subfinder.txt” > /dev/null 2>&1
}

run_crt() {
local crt_response
crt_response=$(curl -s –max-time 30 –retry 3 “https://crt.sh/?q=$url&output=json”)
if [ $? -ne 0 ]; then
echo -e “${BOLD}${RED}[!]${ENDCOLOR} curl failed for crt.sh, skipping…”
elif [ -z “$crt_response” ]; then
echo -e “${BOLD}${RED}[!]${ENDCOLOR} crt.sh returned empty response, skipping…”
elif ! echo “$crt_response” | jq -e . > /dev/null 2>&1; then
echo -e “${BOLD}${RED}[!]${ENDCOLOR} crt.sh response is not valid JSON, skipping…”
else
echo “$crt_response” | jq -r ‘.[].name_value’ | sort -u > “$passive_dir/crt_subs.txt”
fi
}

run_certspotter() {
local page=0
local tmp_file=”$passive_dir/certspotter_raw.txt”
local output_file=”$passive_dir/certspotter.txt”
: > “$tmp_file”

while true; do
local response
response=$(curl -s –max-time 30   
“https://api.certspotter.com/v1/issuances?domain=${url}&include_subdomains=true&expand=dns_names&after=${page}”)

```
if [ $? -ne 0 ] || [ -z "$response" ]; then
  echo -e "${BOLD}${RED}[!]${ENDCOLOR} certspotter request failed, skipping..."
  break
fi

if ! echo "$response" | jq -e . > /dev/null 2>&1; then
  echo -e "${BOLD}${RED}[!]${ENDCOLOR} certspotter response is not valid JSON, skipping..."
  break
fi

local count
count=$(echo "$response" | jq 'length')

if [ "$count" -eq 0 ]; then
  break
fi

echo "$response" | jq -r '.[].dns_names[]' >> "$tmp_file"


page=$(echo "$response" | jq -r '.[-1].id')


if [ "$count" -lt 100 ]; then
  break
fi
```

done

if [ -s “$tmp_file” ]; then
sort -u “$tmp_file” > “$output_file”
fi
rm -f “$tmp_file”
}

run_gitsubdomains() {
github-subdomains -d “$url” -t “$GITHUB_TOKEN” -o “$passive_dir/gitsubs.txt” > /dev/null 2>&1
}



merge_results() {
local files=(”$passive_dir/subfinder.txt” “$passive_dir/crt_subs.txt” “$passive_dir/certspotter.txt” “$passive_dir/gitsubs.txt”)
local missing=0
local existing_files=()

for f in “${files[@]}”; do
if [ ! -f “$f” ]; then
((missing++))
else
existing_files+=(”$f”)
fi
done

if [ “$missing” -ge 3 ]; then
echo -e “${BOLD}${RED}[!]${ENDCOLOR} Too many files missing, skipping merge” >&2
exit 1
fi

cat “${existing_files[@]}” | sort -u > “$subs_dir/all_subs.txt”
}



while getopts “a” opt; do
case $opt in
a) active=true ;;
*) echo “Usage: $0 [-a] <domain>”; exit 1 ;;
esac
done
shift $((OPTIND - 1))

if [ -z “$1” ]; then
echo -e “${BOLD}${RED}[!]${ENDCOLOR} Domain not set, run with: $0 [-a] <domain>”
exit 1
fi

url=$1
mkdir -p “$passive_dir”
rm -f “$passive_dir/subfinder.txt” “$passive_dir/crt_subs.txt” “$passive_dir/certspotter.txt” “$passive_dir/gitsubs.txt”
rm -f “$subs_dir/all_subs.txt”



check_tools

echo -e “${BOLD}${CYAN}[*]${ENDCOLOR} Running passive recon for ${BOLD}$url${ENDCOLOR}”

run_subfinder &
pid_subfinder=$!
run_crt &
pid_crt=$!
run_certspotter &
pid_certspotter=$!
run_gitsubdomains &
pid_git=$!

wait $pid_subfinder
wait $pid_crt
wait $pid_certspotter
wait $pid_git

merge_results



count_subfinder=$(  [ -f “$passive_dir/subfinder.txt”   ] && wc -l < “$passive_dir/subfinder.txt”   || echo 0)
count_crt=$(        [ -f “$passive_dir/crt_subs.txt”    ] && wc -l < “$passive_dir/crt_subs.txt”    || echo 0)
count_certspotter=$([ -f “$passive_dir/certspotter.txt” ] && wc -l < “$passive_dir/certspotter.txt” || echo 0)
count_git=$(        [ -f “$passive_dir/gitsubs.txt”     ] && wc -l < “$passive_dir/gitsubs.txt”     || echo 0)
count_total=$(      [ -f “$subs_dir/all_subs.txt”       ] && wc -l < “$subs_dir/all_subs.txt”       || echo 0)

echo -e  “\n————— RESULTS —————”

echo -e “${BOLD}${GREEN}[*]${ENDCOLOR} Total merged results: ${BOLD}$count_total${ENDCOLOR}”
echo -e “${GREEN}[${ENDCOLOR}${BOLD}${GREEN}+${ENDCOLOR}${GREEN}]${ENDCOLOR} Subfinder:            ${BOLD}$count_subfinder${ENDCOLOR}”
echo -e “${GREEN}[${ENDCOLOR}${BOLD}${GREEN}+${ENDCOLOR}${GREEN}]${ENDCOLOR} crt.sh:               ${BOLD}$count_crt${ENDCOLOR}”
echo -e “${GREEN}[${ENDCOLOR}${BOLD}${GREEN}+${ENDCOLOR}${GREEN}]${ENDCOLOR} Certspotter:          ${BOLD}$count_certspotter${ENDCOLOR}”
echo -e “${GREEN}[${ENDCOLOR}${BOLD}${GREEN}+${ENDCOLOR}${GREEN}]${ENDCOLOR} GitHub Subdomains:    ${BOLD}$count_git${ENDCOLOR}”



if [ “$active” = true ]; then
echo -e “${BOLD}${CYAN}[*]${ENDCOLOR} Starting active recon…”



echo -e “${BOLD}${CYAN}[*]${ENDCOLOR} Active recon running with PID $!”
fi