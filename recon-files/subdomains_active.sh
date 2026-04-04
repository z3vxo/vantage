#!/bin/bash
set -euo pipefail

resolvers_name="resolvers.txt"
trusted_resolvers_name="trusted_resolvers.txt"

resolvers_url="https://raw.githubusercontent.com/trickest/resolvers/main/resolvers.txt"

RED='\e[31m'
GREEN='\e[32m'
YELLOW='\e[33m'
BLUE='\e[34m'
BOLD="\e[1m"
ENDCOLOR='\e[0m'

while getopts "b" opt; do
  case $opt in
    b) ;;
    *) echo "Usage: $0 <domain>"; exit 1 ;;
  esac
done
shift $((OPTIND - 1))

if [ -z "${1:-}" ]; then
  echo -e "${BOLD}${RED}[!]${ENDCOLOR} Domain not set, run with: $0 <domain>"
  exit 1
fi

url=$1
subs_dir="$HOME/.recon/$url/subdomains"
active_dir="$HOME/.recon/$url/subdomains/active"
temp_dir="$HOME/.recon/$url/temp"


cleanup() {
  rm -f "$temp_dir/$trusted_resolvers_name" "$temp_dir/$resolvers_name"
}


check_tools() {
  for tool in alterx puredns wget; do
    if ! command -v "$tool" &> /dev/null; then
      echo -e "${BOLD}${RED}[!]${ENDCOLOR} $tool is not installed!"
      exit 1
    fi
  done
}


get_new_resolvers() {
  mkdir -p "$temp_dir"
  printf "1.1.1.1\n1.0.0.1\n8.8.8.8\n8.8.4.4\n9.9.9.9\n149.112.112.112\n208.67.222.222\n208.67.220.220\n" > "$temp_dir/$trusted_resolvers_name"

  echo -e "${BOLD}${BLUE}[+]${ENDCOLOR} Retrieving up to date resolvers.txt..."
  if ! wget -q -O "$temp_dir/$resolvers_name" "$resolvers_url"; then
    echo -e "${BOLD}${RED}[!]${ENDCOLOR} Failed to fetch resolvers, falling back to local copy..." >&2
    resolvers_file="/usr/share/seclists/Discovery/DNS/resolvers.txt"
    if [ ! -f "$resolvers_file" ]; then
      echo -e "${BOLD}${RED}[!]${ENDCOLOR} No fallback resolvers found, exiting..." >&2
      exit 1
    fi
    cp "$resolvers_file" "$temp_dir/$resolvers_name"
  fi
  echo -e "${BOLD}${GREEN}[+]${ENDCOLOR} Retrieved resolvers"
}


# Step 1: resolve all_subs.txt -> alive.txt
resolve_dns() {
  echo -e "\n${BOLD}${BLUE}[+]${ENDCOLOR} Resolving passive subdomains..."

  puredns resolve "$subs_dir/all_subs.txt" \
    --resolvers "$temp_dir/$resolvers_name" \
    --resolvers-trusted "$temp_dir/$trusted_resolvers_name" \
    --rate-limit 10000 --rate-limit-trusted 2000 \
    -w "$active_dir/alive.txt" \
    || { echo -e "${BOLD}${RED}[!]${ENDCOLOR} puredns failed" >&2; exit 1; }

  [[ -s "$active_dir/alive.txt" ]] \
    || { echo -e "${BOLD}${RED}[!]${ENDCOLOR} puredns resolved no domains" >&2; exit 1; }

  echo -e "${BOLD}${GREEN}[*]${ENDCOLOR} Alive: ${BOLD}$(wc -l < "$active_dir/alive.txt")${ENDCOLOR} / $(wc -l < "$subs_dir/all_subs.txt")"
}


# Step 2: alterx on alive.txt -> mutated.txt
mutate_words() {
  echo -e "\n${BOLD}${BLUE}[+]${ENDCOLOR} Running alterx on alive subdomains..."

  alterx -list "$active_dir/alive.txt" -enrich -o "$active_dir/mutated.txt"

  if [[ ! -s "$active_dir/mutated.txt" ]]; then
    echo -e "${BOLD}${YELLOW}[!]${ENDCOLOR} alterx produced no permutations, skipping mutated resolve" >&2
    return 1
  fi

  echo -e "${BOLD}${GREEN}[+]${ENDCOLOR} Permutations: ${BOLD}$(wc -l < "$active_dir/mutated.txt")${ENDCOLOR}"
}


# Step 3: resolve mutated.txt -> alive_mutated.txt
resolve_mutated() {
  echo -e "\n${BOLD}${BLUE}[+]${ENDCOLOR} Resolving permutated subdomains..."

  puredns resolve "$active_dir/mutated.txt" \
    --resolvers "$temp_dir/$resolvers_name" \
    --resolvers-trusted "$temp_dir/$trusted_resolvers_name" \
    --rate-limit 10000 --rate-limit-trusted 2000 \
    -w "$active_dir/alive_mutated.txt" \
    || { echo -e "${BOLD}${RED}[!]${ENDCOLOR} puredns (mutated) failed" >&2; exit 1; }

  echo -e "${BOLD}${GREEN}[*]${ENDCOLOR} Alive mutated: ${BOLD}$(wc -l < "$active_dir/alive_mutated.txt")${ENDCOLOR}"
}


mkdir -p "$active_dir"
rm -f "$active_dir/alive.txt" "$active_dir/mutated.txt" "$active_dir/alive_mutated.txt"
rm -f "$subs_dir/final_subs.txt"

check_tools
[[ -s "$subs_dir/all_subs.txt" ]] \
  || { echo -e "${BOLD}${RED}[!]${ENDCOLOR} all_subs.txt is empty — run subdomain2.sh first" >&2; exit 1; }

get_new_resolvers
resolve_dns

if mutate_words; then
  resolve_mutated
  cat "$active_dir/alive.txt" "$active_dir/alive_mutated.txt" | sort -u > "$subs_dir/final_subs.txt"
else
  sort -u "$active_dir/alive.txt" > "$subs_dir/final_subs.txt"
fi

cleanup

echo -e "\n${BOLD}${GREEN}[*]${ENDCOLOR} Final subdomains: ${BOLD}$(wc -l < "$subs_dir/final_subs.txt")${ENDCOLOR} -> $subs_dir/final_subs.txt"
