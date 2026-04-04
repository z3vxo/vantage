#!/bin/bash
set -euo pipefail

resolvers_name="resolvers.txt"
trusted_resolvers_name="trusted_resolvers.txt"

resolvers_url="https://raw.githubusercontent.com/trickest/resolvers/main/resolvers.txt"

wordlist="/usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt"

RED='\e[31m'
GREEN='\e[32m'
YELLOW='\e[33m'
BLUE='\e[34m'
MAGENTA='\e[35m'
CYAN='\e[36m'
BOLD="\e[1m"
ENDCOLOR='\e[0m'


bruteforce=false

bruteforce=false

while getopts "b" opt; do
  case $opt in
    b) bruteforce=true ;;
    *) echo "Usage: $0 [-b] <domain>"; exit 1 ;;
  esac
done
shift $((OPTIND - 1))

if [ "$bruteforce" = true ] && [ -z "$1" ]; then
  echo -e "${BOLD}${RED}[!]${ENDCOLOR} Domain not set, run with: $0 [-b] <domain>"
  exit 1
fi

[ -n "$1" ] && url=$1
subs_dir="$HOME/.recon/$url/subdomains"
active_dir="$HOME/.recon/$url/subdomains/active"
temp_dir="$HOME/.recon/$url/temp"


cleanup() {

	rm "$temp_dir/$trusted_resolvers_name" && rm "$temp_dir/$resolvers_name"

}


get_new_resolvers() {
	mkdir -p "$temp_dir"
	printf "1.1.1.1\n1.0.0.1\n8.8.8.8\n8.8.4.4\n9.9.9.9\n149.112.112.112\n208.67.222.222\n208.67.220.220\n" > "$temp_dir/$trusted_resolvers_name"

	echo -e "${BOLD}${BLUE}[+]${ENDCOLOR} Retreving upto date resolvers.txt..."
	if ! wget -q -O "$temp_dir/$resolvers_name" "$resolvers_url"; then

	    echo -e "${BOLD}${RED}[!]${ENDCOLOR} Failed to fetch resolvers, falling back to local copy..." >&2

	    resolvers_file="/usr/share/seclists/Discovery/DNS/resolvers.txt"
	    if [ ! -f "$resolvers_file" ]; then
	      echo -e "${BOLD}${RED}[!]${ENDCOLOR} No fallback resolvers found, exiting..." >&2
	      exit 1
	    fi
  fi
  echo -e "${BOLD}${GREEN}[+]${ENDCOLOR} Retreved resolvers"
}

check_tools() {
	for tool in alterx puredns wget; do
		if ! command -v "$tool" &> /dev/null; then
			echo -e "${BOLD}${RED}[!]${ENDCOLOR} $tool is not installed!"
      exit 1
    fi
  done
}


mutate_words() {
	count=$(wc -l < "$active_dir/resolved.txt")
	echo "Count: $count"

	if [ "$count" -lt 50 ]; then
		  echo -e "${BOLD}${YELLOW}[!]${ENDCOLOR} Low subdomain count ($count), enriching with wordlist..."
		  cat "$active_dir/resolved.txt" | alterx -enrich -pp "$wordlist" -o "$active_dir/mutated.txt" #> /dev/null 2>&1
	else
		  alterx -list "$active_dir/resolved.txt" -enrich -o "$active_dir/mutated.txt" #> /dev/null 2>&1
	fi

	if [[ ! -s "$active_dir/mutated.txt" ]]; then
		echo -e "${BOLD}${RED}[!]${ENDCOLOR} alterx produced no permutations" >&2
		exit 1
	fi

	echo -e "${BOLD}${GREEN}[+]${ENDCOLOR} Permutated domains: ${BOLD}$(wc -l < "$active_dir/mutated.txt")${ENDCOLOR} results, saved to $active_dir/mutated.txt"
}

resolve_dns() {
  echo -e "\n${BOLD}${BLUE}[+]${ENDCOLOR} Resolving passive subdomains..."

  puredns resolve "$subs_dir/all_subs.txt" --resolvers "$temp_dir/$resolvers_name" --resolvers-trusted "$temp_dir/$trusted_resolvers_name" --rate-limit 10000 --rate-limit-trusted 2000 -w "$active_dir/resolved.txt" \
    || { echo -e "${BOLD}${RED}[!]${ENDCOLOR} puredns failed" >&2; exit 1; }

  [[ -s "$active_dir/resolved.txt" ]] \
    || { echo -e "${BOLD}${RED}[!]${ENDCOLOR} puredns resolved no domains" >&2; exit 1; }

  echo -e "${BOLD}${GREEN}[*]${ENDCOLOR} Resolved domains: ${BOLD}$(wc -l < "$active_dir/resolved.txt")${ENDCOLOR}/${BOLD}$(wc -l < "$subs_dir/all_subs.txt")"
  cat "$active_dir/resolved.txt" > "$subs_dir/final_subs.txt"
}


resolve__permuated_dns() {

  puredns resolve "$active_dir/mutated.txt" --resolvers "$temp_dir/$resolvers_name" --resolvers-trusted "$temp_dir/$trusted_resolvers_name" --rate-limit 10000 --rate-limit-trusted 2000 -w "$active_dir/puredns.txt"

  echo -e "${BOLD}${GREEN}[*]${ENDCOLOR} Resolved domains: ${BOLD}$(wc -l < "$active_dir/puredns.txt")${ENDCOLOR} results"

  cat "$active_dir/puredns.txt" "$active_dir/resolved.txt" | sort -u > "$subs_dir/final_subs.txt"
}


mkdir -p "$active_dir"
rm -f "$active_dir/resolved.txt" "$active_dir/mutated.txt" "$active_dir/puredns.txt"
rm -f "$subs_dir/final_subs.txt"
check_tools
[[ -s "$subs_dir/all_subs.txt" ]] \
    || { echo -e "${BOLD}${RED}[!]${ENDCOLOR} all_subs.txt is empty — run subdomain2.sh first" >&2; exit 1; }
get_new_resolvers


if [ "$bruteforce" = true ]; then
  bruteforce_dns
else
  resolve_dns
  echo -e "\n${BOLD}${BLUE}[+]${ENDCOLOR} Starting Permutated resolving..."
  mutate_words
  cleanup
  #resolve_permutated_dns
fi
