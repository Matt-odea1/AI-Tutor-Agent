#!/usr/bin/env bash
set -euo pipefail

SERVICE_SRC="terraform/minimal/systemd/ai-tutor-compose.service"
ALT_SERVICE_SRC="terraform/minimal/ai-tutor-compose.service"
SERVICE_DST="/etc/systemd/system/ai-tutor-compose.service"

if [[ ! -f "$SERVICE_SRC" && -f "$ALT_SERVICE_SRC" ]]; then
  SERVICE_SRC="$ALT_SERVICE_SRC"
fi

if [[ ! -f "$SERVICE_SRC" ]]; then
  echo "Missing $SERVICE_SRC (or $ALT_SERVICE_SRC). Run this from repository root."
  exit 1
fi

sudo cp "$SERVICE_SRC" "$SERVICE_DST"
sudo systemctl daemon-reload
sudo systemctl enable ai-tutor-compose.service
sudo systemctl restart ai-tutor-compose.service
sudo systemctl status ai-tutor-compose.service --no-pager -n 20
