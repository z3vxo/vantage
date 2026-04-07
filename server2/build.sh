#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-all}"

build_frontend() {
  echo "[*] Building frontend..."
  cd "$ROOT/frontend"
  npm install --silent
  npm run build
  cd "$ROOT"
}

build_backend() {
  echo "[*] Building server..."
  cd "$ROOT"
  go build -o recon-server ./cmd/main.go
}

case "$TARGET" in
  frontend)
    build_frontend
    echo "[+] Done. Frontend built to $ROOT/static/dist/"
    ;;
  backend)
    build_backend
    echo "[+] Done. Binary: $ROOT/recon-server"
    ;;
  all)
    build_frontend
    build_backend
    echo "[+] Done. Binary: $ROOT/recon-server"
    ;;
  *)
    echo "Usage: $0 [all|frontend|backend]"
    exit 1
    ;;
esac
