#!/bin/bash
set -e

# ============================================

# Bug Bounty VPS Setup Script

# Paste into Vultr startup script field

# ============================================

export DEBIAN_FRONTEND=noninteractive
export HOME=/root

# — System Update —

apt update && apt upgrade -y

# — Base Dependencies —

apt install -y
git
python3-pip
build-essential
tmux
wget
curl
unzip
libpcap-dev
nmap
nginx

# — Fix TERM for tmux over SSH —

echo ‘export TERM=xterm-256color’ >> /root/.bashrc

# — Install Go —

GO_VERSION=“1.22.2”
wget -q “https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz” -O /tmp/go.tar.gz
rm -rf /usr/local/go
tar -C /usr/local -xzf /tmp/go.tar.gz
rm /tmp/go.tar.gz

echo ‘export PATH=$PATH:/usr/local/go/bin:/root/go/bin’ >> /root/.bashrc
export PATH=$PATH:/usr/local/go/bin:/root/go/bin

# — Go-based Tools —

go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest
go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
go install -v github.com/projectdiscovery/asnmap/cmd/asnmap@latest
go install -v github.com/d3mondev/puredns/v2/cmd/puredns@latest
go install -v github.com/projectdiscovery/alterx/cmd/alterx@latest
go install -v github.com/owasp-amass/amass/v4/…@master
go install -v github.com/tomnomnom/waybackurls@latest
go install -v github.com/lc/gau/v2/cmd/gau@latest

# — Massdns (required for puredns) —

git clone https://github.com/blechschmidt/massdns.git /opt/massdns
cd /opt/massdns && make
cp bin/massdns /usr/local/bin/
cd /root

# — Masscan —

apt install -y masscan

# — Wordlists & Resolvers —

mkdir -p /root/wordlists

# Resolvers

wget -q https://raw.githubusercontent.com/trickest/resolvers/main/resolvers.txt
-O /root/wordlists/resolvers.txt

# DNS wordlists

wget -q https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/DNS/subdomains-top1million-5000.txt
-O /root/wordlists/subdomains-5k.txt

wget -q https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/DNS/subdomains-top1million-110000.txt
-O /root/wordlists/subdomains-110k.txt

# — Done —

echo “”
echo “=========================================”
echo “ VPS Setup Complete!”
echo “ Tools: nmap, masscan, subfinder, httpx,”
echo “        nuclei, puredns, massdns, amass,”
echo “        alterx, asnmap, gau, waybackurls”
echo “ Wordlists: /root/wordlists/”
echo “ Remember: source ~/.bashrc or re-login”
echo “=========================================”
