#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "Usage: UPLOAD_BEARER_TOKEN=token bash test/resourse/upload-file.sh <upload_url> <file_path> [storage_id]" >&2
  exit 1
fi

UPLOAD_URL="$1"
FILE_PATH="$2"
STORAGE_ID="${3:-r2}"
UPLOAD_BEARER_TOKEN="${UPLOAD_BEARER_TOKEN:-}"

if [[ -z "$UPLOAD_BEARER_TOKEN" ]]; then
  echo "Missing UPLOAD_BEARER_TOKEN" >&2
  exit 1
fi

if [[ ! -f "$FILE_PATH" ]]; then
  echo "File not found: $FILE_PATH" >&2
  exit 1
fi

case "${FILE_PATH##*.}" in
  webp) CONTENT_TYPE='image/webp' ;;
  jpg|jpeg) CONTENT_TYPE='image/jpeg' ;;
  png) CONTENT_TYPE='image/png' ;;
  gif) CONTENT_TYPE='image/gif' ;;
  avif) CONTENT_TYPE='image/avif' ;;
  svg) CONTENT_TYPE='image/svg+xml' ;;
  *) CONTENT_TYPE='application/octet-stream' ;;
esac

curl -sS -X PUT "$UPLOAD_URL" \
  -H "Authorization: Bearer $UPLOAD_BEARER_TOKEN" \
  -F "storage_id=$STORAGE_ID" \
  -F "file=@$FILE_PATH;type=$CONTENT_TYPE"
