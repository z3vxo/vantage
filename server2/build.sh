#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "[*] Building frontend..."
cd "$ROOT/frontend"
npm install --silent
npm run build

echo "[*] Building server..."
cd "$ROOT"
go build -o recon-server ./cmd/main.go

echo "[+] Done. Binary: $ROOT/recon-server"
