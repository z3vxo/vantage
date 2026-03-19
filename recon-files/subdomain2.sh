#!/bin/bash
set -uo pipefail

subs_dir="subdomains"
passive_dir="subdomains/passive"
active=false

RED='\e[31m'
GREEN='\e[32m'
YELLOW='\e[33m'
BLUE='\e[34m'
MAGENTA='\e[35m'
CYAN='\e[36m'
BOLD="\e[1m"
ENDCOLOR='\e[0m'

# ─── Validate tools ───────────────────────────────────────────────────────────
check_tools() {
  for tool in subfinder jq github-subdomains; do
    if ! command -v "$tool" &> /dev/null; then
      echo -e "${BOLD}${RED}[!]${ENDCOLOR} $tool is not installed!"
      exit 1
    fi
  done
}

# ─── Recon functions ──────────────────────────────────────────────────────────
run_subfinder() {
  subfinder -d "$url" -o "$passive_dir/subfinder.txt" > /dev/null 2>&1
}

run_crt() {
  local crt_response
  crt_response=$(curl -s --max-time 30 --retry 3 "https://crt.sh/?q=$url&output=json")
  if [ $? -ne 0 ]; then
    echo -e "${BOLD}${RED}[!]${ENDCOLOR} curl failed for crt.sh, skipping..."
  elif [ -z "$crt_response" ]; then
    echo -e "${BOLD}${RED}[!]${ENDCOLOR} crt.sh returned empty response, skipping..."
  elif ! echo "$crt_response" | jq -e . > /dev/null 2>&1; then
    echo -e "${BOLD}${RED}[!]${ENDCOLOR} crt.sh response is not valid JSON, skipping..."
  else
    echo "$crt_response" | jq -r '.[].name_value' | sort -u > "$passive_dir/crt_subs.txt"
  fi
}

run_gitsubdomains() {
  github-subdomains -d "$url" -t "$GITHUB_TOKEN" -o "$passive_dir/gitsubs.txt" > /dev/null 2>&1
}

# ─── Merge & deduplicate ──────────────────────────────────────────────────────
merge_results() {
  local files=("$passive_dir/subfinder.txt" "$passive_dir/crt_subs.txt" "$passive_dir/gitsubs.txt")
  local missing=0
  local existing_files=()

  for f in "${files[@]}"; do
    if [ ! -f "$f" ]; then
      ((missing++))
    else
      existing_files+=("$f")
    fi
  done

  if [ "$missing" -ge 2 ]; then
    echo -e "${BOLD}${RED}[!]${ENDCOLOR} Too many files missing, skipping merge" >&2
    exit 1
  fi

  cat "${existing_files[@]}" | sort -u > "$subs_dir/all_subs.txt"
}

# ─── Parse flags ──────────────────────────────────────────────────────────────
while getopts "a" opt; do
  case $opt in
    a) active=true ;;
    *) echo "Usage: $0 [-a] <domain>"; exit 1 ;;
  esac
done
shift $((OPTIND - 1))

if [ -z "$1" ]; then
  echo -e "${BOLD}${RED}[!]${ENDCOLOR} Domain not set, run with: $0 [-a] <domain>"
  exit 1
fi

url=$1
mkdir -p "$passive_dir"

# ─── Main ─────────────────────────────────────────────────────────────────────
check_tools

echo -e "${BOLD}${CYAN}[*]${ENDCOLOR} Running passive recon for ${BOLD}$url${ENDCOLOR}"

run_subfinder &
pid_subfinder=$!
run_crt &
pid_crt=$!
run_gitsubdomains &
pid_git=$!

wait $pid_subfinder
wait $pid_crt
wait $pid_git

merge_results

# ─── Print summary ────────────────────────────────────────────────────────────
count_subfinder=$([ -f "$passive_dir/subfinder.txt" ] && wc -l < "$passive_dir/subfinder.txt" || echo 0)
count_crt=$(      [ -f "$passive_dir/crt_subs.txt"  ] && wc -l < "$passive_dir/crt_subs.txt"  || echo 0)
count_git=$(      [ -f "$passive_dir/gitsubs.txt"   ] && wc -l < "$passive_dir/gitsubs.txt"   || echo 0)
count_total=$(    [ -f "$subs_dir/all_subs.txt"  ] && wc -l < "$subs_dir/all_subs.txt"  || echo 0)


echo -e  "\n--------------- RESULTS ---------------"

echo -e "${BOLD}${GREEN}[*]${ENDCOLOR} Total merged results: ${BOLD}$count_total${ENDCOLOR}"
echo -e "${GREEN}[${ENDCOLOR}${BOLD}${GREEN}+${ENDCOLOR}${GREEN}]${ENDCOLOR} Subfinder:            ${BOLD}$count_subfinder${ENDCOLOR}"
echo -e "${GREEN}[${ENDCOLOR}${BOLD}${GREEN}+${ENDCOLOR}${GREEN}]${ENDCOLOR} crt.sh:               ${BOLD}$count_crt${ENDCOLOR}"
echo -e "${GREEN}[${ENDCOLOR}${BOLD}${GREEN}+${ENDCOLOR}${GREEN}]${ENDCOLOR} GitHub Subdomains:    ${BOLD}$count_git${ENDCOLOR}"

# ─── Active recon ─────────────────────────────────────────────────────────────
if [ "$active" = true ]; then
  echo -e "${BOLD}${CYAN}[*]${ENDCOLOR} Starting active recon..."
  # ./active_recon.sh "$url" "$subs_dir/all_subs.txt" &
  echo -e "${BOLD}${CYAN}[*]${ENDCOLOR} Active recon running with PID $!"
fi