#!/usr/bin/env bash
# Presence check for secret *names* only — never prints values.
set -euo pipefail

REQUIRED=(
  SUPABASE_URL__SHARED
  SUPABASE_ANON_KEY__SHARED
  SUPABASE_SERVICE_ROLE_KEY__SHARED
  SENDGRID_API_KEY
  SENDGRID_FROM_EMAIL
  APP_BASE_URL__PROJ_KRUISPAD
  KRUISPAD_NOTIFY_SECRET__PROJ_KRUISPAD
)

missing=0
for name in "${REQUIRED[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "MISSING $name"
    missing=1
  else
    echo "SET $name"
  fi
done

exit "$missing"
