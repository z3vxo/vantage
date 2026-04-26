#!/bin/bash
set -e



export DEBIAN_FRONTEND="noninteractive"
export HOME="/root"
export PATH=$PATH:/usr/local/go/bin:/root/go/bin

# — System Update —
apt update && apt upgrade -y

# — Base Dependencies —
apt install -y \
    git \
    python3-pip \
    build-essential \
    tmux \
    wget \
    curl \
    unzip \
    libpcap-dev \
    nmap \
    nginx \
    chromium

# — Fix TERM for tmux over SSH —
echo 'export TERM=xterm-256color' >> /root/.bashrc
echo 'export PATH=$PATH:/usr/local/go/bin:/root/go/bin' >> /root/.bashrc

# — Install Go —
echo "[*] Installing golang..."
GO_VERSION="1.23.4"
wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O /tmp/go.tar.gz
rm -rf /usr/local/go
tar -C /usr/local -xzf /tmp/go.tar.gz
rm /tmp/go.tar.gz

# — Go-based Tools —
echo "[*] Installing Go tools..."
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest
go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
go install -v github.com/projectdiscovery/asnmap/cmd/asnmap@latest
go install -v github.com/d3mondev/puredns/v2/cmd/puredns@latest
go install -v github.com/projectdiscovery/alterx/cmd/alterx@latest
go install -v github.com/projectdiscovery/katana/cmd/katana@latest
go install -v github.com/owasp-amass/amass/v4/...@master
go install -v github.com/tomnomnom/waybackurls@latest
go install -v github.com/lc/gau/v2/cmd/gau@latest
go install -v github.com/sensepost/gowitness@latest

# — Massdns (required for puredns) —
echo "[*] Installing massdns..."
git clone https://github.com/blechschmidt/massdns.git /opt/massdns
cd /opt/massdns && make
cp bin/massdns /usr/local/bin/
cd /root

# — Masscan —
apt install -y masscan

# — TruffleHog —
echo "[*] Installing trufflehog..."
curl -sSfL https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/scripts/install.sh | sh -s -- -b /usr/local/bin

# — LinkFinder & SecretFinder —
echo "[*] Installing LinkFinder and SecretFinder..."
mkdir -p ~/tools
git clone https://github.com/GerbenJavado/LinkFinder.git ~/tools/linkFinder
git clone https://github.com/m4ll0k/SecretFinder.git ~/tools/secretFinder

pip3 install -r ~/tools/linkFinder/requirements.txt --break-system-packages --root-user-action=ignore
pip3 install -r ~/tools/secretFinder/requirements.txt --break-system-packages --root-user-action=ignore

# — Wordlists & Resolvers —
echo "[*] Downloading wordlists..."
mkdir -p /root/wordlists

wget -q "https://raw.githubusercontent.com/trickest/resolvers/main/resolvers.txt" \
    -O /root/wordlists/resolvers.txt

wget -q "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/DNS/subdomains-top1million-5000.txt" \
    -O /root/wordlists/subdomains-5k.txt

wget -q "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/DNS/subdomains-top1million-110000.txt" \
    -O /root/wordlists/subdomains-110k.txt

# — Done —
echo ""
echo "========================================="
echo " Tools: nmap, masscan, subfinder, httpx,"
echo "        nuclei, puredns, massdns, amass,"
echo "        alterx, asnmap, katana, gowitness"
echo "        gau, waybackurls, trufflehog,"
echo "        linkfinder, SecretFinder"
echo " Wordlists: /root/wordlists/"
echo " Remember: source ~/.bashrc or re-login"
echo "========================================="
