#!/usr/bin/env bash
# Presence check for Kruispad secret NAMES only. Never prints values.
# Prefer `bws secret list` when BWS_ACCESS_TOKEN is available; else env presence.

set -euo pipefail

NAMES=(
  SUPABASE_URL__PROJ_KRUISPAD
  SUPABASE_ANON_KEY__PROJ_KRUISPAD
  SUPABASE_SERVICE_ROLE_KEY__PROJ_KRUISPAD
  SUPABASE_PROJECT_REF__PROJ_KRUISPAD
  SUPABASE_DB_PASSWORD__PROJ_KRUISPAD
  SENDGRID_API_KEY__PROJ_KRUISPAD
  SENDGRID_FROM__PROJ_KRUISPAD
  APP_BASE_URL__PROJ_KRUISPAD
)

echo "Kruispad secrets presence (SET/MISSING only)"
missing=0
for name in "${NAMES[@]}"; do
  if [[ -n "${!name:-}" ]]; then
    echo "SET     $name"
  elif command -v bws >/dev/null 2>&1 && [[ -n "${BWS_ACCESS_TOKEN:-}" ]]; then
    if bws secret list --output json 2>/dev/null | grep -q "\"key\":\"$name\""; then
      echo "SET     $name (bws)"
    else
      echo "MISSING $name"
      missing=1
    fi
  else
    echo "MISSING $name"
    missing=1
  fi
done

exit "$missing"
