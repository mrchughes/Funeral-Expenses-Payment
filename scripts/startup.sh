#!/bin/bash
# Startup script for FEP_Local stack: Cloudflare Tunnel, Docker Desktop, containers, and status report

set -e

# 1. Start Docker Desktop (macOS)
echo "[INFO] Starting Docker Desktop..."
open -a Docker || {
  echo "[ERROR] Could not start Docker Desktop. Please start it manually."; exit 1;
}

# Wait for Docker to be ready
echo "[INFO] Waiting for Docker to be ready..."
while ! docker system info > /dev/null 2>&1; do
  sleep 2
done
echo "[INFO] Docker is running."

# 2. Start Cloudflare Tunnel (background)
echo "[INFO] Starting Cloudflare Tunnel..."
if pgrep -f "cloudflared tunnel run" > /dev/null; then
  echo "[INFO] Cloudflare Tunnel is already running."
else
  nohup cloudflared tunnel run > cloudflared.log 2>&1 &
  sleep 3
fi

# 3. Start Docker containers
echo "[INFO] Starting Docker containers..."
docker compose up -d

# 4. Report status
echo "\n[INFO] Docker containers status:"
docker compose ps

echo "\n[INFO] Cloudflare Tunnel status:"
if pgrep -f "cloudflared tunnel run" > /dev/null; then
  echo "Cloudflare Tunnel is running."
else
  echo "Cloudflare Tunnel is NOT running."
fi

echo "\n[INFO] Startup complete."
