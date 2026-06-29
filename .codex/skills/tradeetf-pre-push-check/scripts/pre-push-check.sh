#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-}"
if [ -z "$ROOT" ]; then
  ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fi

cd "$ROOT"

if [ -f "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh"
  current_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
  if [ "$current_major" -lt 22 ]; then
    nvm use 22 >/dev/null
  fi
fi

node_ok="$(node -p "Number(process.versions.node.split('.')[0]) >= 22 ? 'yes' : 'no'" 2>/dev/null || echo no)"
if [ "$node_ok" != "yes" ]; then
  echo "Node.js 22 or newer is required. Current version: $(node --version 2>/dev/null || echo unavailable)"
  exit 1
fi

echo "Using Node $(node --version)"

if [ ! -d node_modules ]; then
  echo "node_modules missing; running npm ci"
  npm ci
fi

echo "Running npm run validate"
npm run validate

log_file="$(mktemp)"
preview_pid=""
cleanup() {
  if [ -n "$preview_pid" ] && kill -0 "$preview_pid" 2>/dev/null; then
    kill "$preview_pid" 2>/dev/null || true
    wait "$preview_pid" 2>/dev/null || true
  fi
  rm -f "$log_file"
}
trap cleanup EXIT

open_url() {
  local target_url="$1"
  local chrome_path="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"

  if [ -x "$chrome_path" ] && "$chrome_path" "$target_url" >/dev/null 2>&1; then
    echo "Opened browser with Google Chrome."
    return 0
  fi

  if command -v powershell.exe >/dev/null 2>&1 &&
    powershell.exe -NoProfile -NonInteractive -Command 'Start-Process chrome.exe -ArgumentList $args[0]' "$target_url" >/dev/null 2>&1; then
    echo "Opened browser with Google Chrome through powershell.exe."
    return 0
  fi

  if command -v wslview >/dev/null 2>&1 && wslview "$target_url" >/dev/null 2>&1; then
    echo "Opened browser with wslview."
    return 0
  fi

  if command -v powershell.exe >/dev/null 2>&1 &&
    powershell.exe -NoProfile -NonInteractive -Command 'Start-Process -FilePath $args[0]' "$target_url" >/dev/null 2>&1; then
    echo "Opened browser with powershell.exe."
    return 0
  fi

  if command -v explorer.exe >/dev/null 2>&1 && explorer.exe "$target_url" >/dev/null 2>&1; then
    echo "Opened browser with explorer.exe."
    return 0
  fi

  if command -v cmd.exe >/dev/null 2>&1 && cmd.exe /C start "" "$target_url" >/dev/null 2>&1; then
    echo "Opened browser with cmd.exe."
    return 0
  fi

  if command -v xdg-open >/dev/null 2>&1 && xdg-open "$target_url" >/dev/null 2>&1; then
    echo "Opened browser with xdg-open."
    return 0
  fi

  if command -v open >/dev/null 2>&1 && open "$target_url" >/dev/null 2>&1; then
    echo "Opened browser with open."
    return 0
  fi

  echo "No browser opener succeeded. Open this URL manually: $target_url"
  return 1
}

echo "Starting local production preview"
npm run preview -- --host 127.0.0.1 --port "${PRE_PUSH_PORT:-4173}" >"$log_file" 2>&1 &
preview_pid="$!"

url=""
for _ in $(seq 1 60); do
  if ! kill -0 "$preview_pid" 2>/dev/null; then
    echo "Preview server exited before becoming ready."
    tail -80 "$log_file"
    exit 1
  fi

  url="$(grep -Eo 'http://127\.0\.0\.1:[0-9]+/tradeETF/?' "$log_file" | tail -1 || true)"
  if [ -z "$url" ]; then
    url="$(grep -Eo 'http://localhost:[0-9]+/tradeETF/?' "$log_file" | tail -1 || true)"
  fi

  if [ -n "$url" ] && curl --silent --show-error --fail "$url" >/dev/null; then
    break
  fi

  sleep 0.5
done

if [ -z "$url" ]; then
  echo "Could not detect the Vite preview URL."
  tail -80 "$log_file"
  exit 1
fi

curl --silent --show-error --fail "$url" >/dev/null
echo "Preview responded successfully at $url"

if [ "${PRE_PUSH_OPEN_BROWSER:-0}" = "1" ]; then
  echo "Opening browser at $url"
  open_url "$url" || true
fi

if [ "${PRE_PUSH_KEEP_PREVIEW:-0}" = "1" ]; then
  echo "Pre-push check passed. Keeping preview server running at $url"
  echo "Press Ctrl+C to stop it."
  wait "$preview_pid"
fi

echo "Pre-push check passed. Preview server stopped."
