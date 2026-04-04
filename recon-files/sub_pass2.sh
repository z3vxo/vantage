#!/bin/bash

if [[ -z "${1:-}" ]]; then
    echo "Usage: $0 <domain>" >&2
    exit 1
fi

passive_dir="$HOME/.recon/$1/subdomains"


grep -Ei "api|dev|staging|test|qa|internal|admin|auth|backend|beta|sandbox|app|portal|secure|dashboard" "$passive_dir/all_subs.txt" > "$passive_dir/temp.txt"


for domain in $(cat "$passive_dir/temp.txt"); do
    subfinder -d $domain
done
