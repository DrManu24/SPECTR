#!/usr/bin/env bash
# TC-SEC-01: Multicenter queue isolation test for SPECTR.
#
# Verifies that an investigator credentialed at Site A cannot assign kits from
# Site B's stratum queue. The script:
#   1) Logs in as Site A investigator and records visible strata
#   2) Discovers a Site B stratum (second investigator login or --foreign-strata-id)
#   3) Attempts cross-site assign-kit from the Site A session
#   4) Confirms the request is rejected and Site B queue count is unchanged
#
# Usage:
#   ./tc-sec-01-site-isolation.sh
#   ./tc-sec-01-site-isolation.sh --foreign-strata-id 25
#
# If credentials are omitted, the script prompts interactively.
#
# Options:
#   --base-url URL           API base (default: https://spectr.mmmr.in)
#   --site-a-username USER   Site A investigator username
#   --site-a-password PASS   Site A investigator password
#   --site-b-username USER   Site B investigator username (to discover foreign strata)
#   --site-b-password PASS   Site B investigator password
#   --foreign-strata-id ID   Site B stratum id (skips Site B login when set)
#   --patient-id ID          Participant ID for the blocked attempt (default: TEST-SEC-01)
#   --output-dir DIR         Output directory (default: ./tc-sec-01-output)
#   --help                   Show this help
#
# Environment variable aliases:
#   SPECTR_SITE_A_USERNAME, SPECTR_SITE_A_PASSWORD
#   SPECTR_SITE_B_USERNAME, SPECTR_SITE_B_PASSWORD

set -euo pipefail

BASE_URL="${SPECTR_BASE_URL:-https://spectr.mmmr.in}"
SITE_A_USERNAME="${SPECTR_SITE_A_USERNAME:-}"
SITE_A_PASSWORD="${SPECTR_SITE_A_PASSWORD:-}"
SITE_B_USERNAME="${SPECTR_SITE_B_USERNAME:-}"
SITE_B_PASSWORD="${SPECTR_SITE_B_PASSWORD:-}"
FOREIGN_STRATA_ID=""
PATIENT_ID="TEST-SEC-01"
OUTPUT_DIR="./tc-sec-01-output"

usage() {
  sed -n '3,30p' "$0" | sed 's/^# \{0,1\}//'
}

die() {
  echo "error: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --site-a-username)
      SITE_A_USERNAME="$2"
      shift 2
      ;;
    --site-a-password)
      SITE_A_PASSWORD="$2"
      shift 2
      ;;
    --site-b-username)
      SITE_B_USERNAME="$2"
      shift 2
      ;;
    --site-b-password)
      SITE_B_PASSWORD="$2"
      shift 2
      ;;
    --foreign-strata-id)
      FOREIGN_STRATA_ID="$2"
      shift 2
      ;;
    --patient-id)
      PATIENT_ID="$2"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1 (use --help)"
      ;;
  esac
done

require_cmd curl
require_cmd jq

prompt_site_a_credentials() {
  if [[ -z "$SITE_A_USERNAME" ]]; then
    read -r -p "Site A investigator username: " SITE_A_USERNAME
    SITE_A_USERNAME="${SITE_A_USERNAME//[[:space:]]/}"
    [[ -n "$SITE_A_USERNAME" ]] || die "Site A username cannot be empty"
  fi

  if [[ -z "$SITE_A_PASSWORD" ]]; then
    read -r -s -p "Site A investigator password: " SITE_A_PASSWORD
    echo
    [[ -n "$SITE_A_PASSWORD" ]] || die "Site A password cannot be empty"
  fi
}

prompt_site_b_credentials() {
  if [[ -z "$SITE_B_USERNAME" ]]; then
    read -r -p "Site B investigator username: " SITE_B_USERNAME
    SITE_B_USERNAME="${SITE_B_USERNAME//[[:space:]]/}"
    [[ -n "$SITE_B_USERNAME" ]] || die "Site B username cannot be empty"
  fi

  if [[ -z "$SITE_B_PASSWORD" ]]; then
    read -r -s -p "Site B investigator password: " SITE_B_PASSWORD
    echo
    [[ -n "$SITE_B_PASSWORD" ]] || die "Site B password cannot be empty"
  fi
}

if ! command -v uuidgen >/dev/null 2>&1; then
  uuidgen() {
    cat /proc/sys/kernel/random/uuid
  }
fi

mkdir -p "$OUTPUT_DIR"

login_investigator() {
  local username="$1"
  local password="$2"
  local cookie_jar="$3"
  local login_json="$4"

  local http_code
  http_code=$(curl -sS -c "$cookie_jar" -o "$login_json" -w "%{http_code}" \
    -X POST "$BASE_URL/investigator/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$username\",\"password\":\"$password\"}")

  if [[ "$http_code" != "200" ]]; then
    echo "login response ($http_code):" >&2
    cat "$login_json" >&2
    die "login failed for $username with HTTP $http_code"
  fi

  jq -r '.csrf_token // empty' "$login_json"
}

fetch_strata() {
  local cookie_jar="$1"
  local out_json="$2"

  local http_code
  http_code=$(curl -sS -b "$cookie_jar" -o "$out_json" -w "%{http_code}" \
    "$BASE_URL/investigator/strata-availability")

  if [[ "$http_code" != "200" ]]; then
    echo "strata response ($http_code):" >&2
    cat "$out_json" >&2
    die "strata-availability failed with HTTP $http_code"
  fi
}

stratum_unassigned_count() {
  local strata_json="$1"
  local strata_id="$2"
  jq -r --arg id "$strata_id" '.[] | select(.id == ($id | tonumber)) | .unassigned_count' "$strata_json"
}

stratum_visible() {
  local strata_json="$1"
  local strata_id="$2"
  jq -e --arg id "$strata_id" '.[] | select(.id == ($id | tonumber))' "$strata_json" >/dev/null 2>&1
}

assign_kit_attempt() {
  local cookie_jar="$1"
  local csrf="$2"
  local strata_id="$3"
  local patient_id="$4"
  local body_file="$5"
  local meta_file="$6"

  local payload
  payload=$(jq -nc --arg patient "$patient_id" --argjson strata "$strata_id" \
    '{patient_id: $patient, strata_id: $strata}')

  local http_code
  http_code=$(curl -sS \
    -b "$cookie_jar" \
    -o "$body_file" \
    -w "%{http_code}" \
    -X POST "$BASE_URL/investigator/assign-kit" \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $csrf" \
    -H "Idempotency-Key: $(uuidgen)" \
    -d "$payload")

  printf 'http_status=%s\nstrata_id=%s\npatient_id=%s\n' \
    "$http_code" "$strata_id" "$patient_id" >"$meta_file"
}

COOKIE_JAR_A="$OUTPUT_DIR/site-a-cookies.txt"
LOGIN_JSON_A="$OUTPUT_DIR/site-a-login.json"
STRATA_JSON_A="$OUTPUT_DIR/site-a-strata.json"
COOKIE_JAR_B="$OUTPUT_DIR/site-b-cookies.txt"
LOGIN_JSON_B="$OUTPUT_DIR/site-b-login.json"
STRATA_JSON_B="$OUTPUT_DIR/site-b-strata.json"
CROSS_SITE_BODY="$OUTPUT_DIR/cross-site-assign.json"
CROSS_SITE_META="$OUTPUT_DIR/cross-site-assign.meta"
STRATA_JSON_B_AFTER="$OUTPUT_DIR/site-b-strata-after.json"

echo "==> TC-SEC-01 multicenter queue isolation test"
echo "    base url   : $BASE_URL"
echo "    patient id : $PATIENT_ID"
echo "    output     : $OUTPUT_DIR"
echo

echo "==> Logging in as Site A investigator"
prompt_site_a_credentials
CSRF_A=$(login_investigator "$SITE_A_USERNAME" "$SITE_A_PASSWORD" "$COOKIE_JAR_A" "$LOGIN_JSON_A")
[[ -n "$CSRF_A" ]] || die "Site A login missing csrf_token"
echo "    site A login ok ($SITE_A_USERNAME)"
echo

echo "==> Fetching Site A strata visibility"
fetch_strata "$COOKIE_JAR_A" "$STRATA_JSON_A"
echo "    visible to Site A:"
jq -r '.[] | "      id=\(.id) name=\(.name) unassigned=\(.unassigned_count)"' "$STRATA_JSON_A"
echo

if [[ -z "$FOREIGN_STRATA_ID" ]]; then
  echo "==> Discovering Site B foreign stratum"
  prompt_site_b_credentials
  CSRF_B=$(login_investigator "$SITE_B_USERNAME" "$SITE_B_PASSWORD" "$COOKIE_JAR_B" "$LOGIN_JSON_B")
  [[ -n "$CSRF_B" ]] || die "Site B login missing csrf_token"
  echo "    site B login ok ($SITE_B_USERNAME)"

  fetch_strata "$COOKIE_JAR_B" "$STRATA_JSON_B"
  echo "    visible to Site B:"
  jq -r '.[] | "      id=\(.id) name=\(.name) unassigned=\(.unassigned_count)"' "$STRATA_JSON_B"

  FOREIGN_STRATA_ID=$(jq -r '[.[] | select(.unassigned_count >= 1)] | sort_by(.id) | .[0].id // empty' "$STRATA_JSON_B")
  [[ -n "$FOREIGN_STRATA_ID" ]] || die "no Site B stratum with unassigned kits found"
  FOREIGN_STRATA_NAME=$(jq -r --arg id "$FOREIGN_STRATA_ID" '.[] | select(.id == ($id | tonumber)) | .name' "$STRATA_JSON_B")
  FOREIGN_UNASSIGNED_BEFORE=$(stratum_unassigned_count "$STRATA_JSON_B" "$FOREIGN_STRATA_ID")
else
  echo "==> Using provided foreign strata id: $FOREIGN_STRATA_ID"
  prompt_site_b_credentials
  CSRF_B=$(login_investigator "$SITE_B_USERNAME" "$SITE_B_PASSWORD" "$COOKIE_JAR_B" "$LOGIN_JSON_B")
  [[ -n "$CSRF_B" ]] || die "Site B login missing csrf_token"
  fetch_strata "$COOKIE_JAR_B" "$STRATA_JSON_B"
  FOREIGN_STRATA_NAME=$(jq -r --arg id "$FOREIGN_STRATA_ID" '.[] | select(.id == ($id | tonumber)) | .name' "$STRATA_JSON_B")
  FOREIGN_UNASSIGNED_BEFORE=$(stratum_unassigned_count "$STRATA_JSON_B" "$FOREIGN_STRATA_ID")
  [[ -n "$FOREIGN_UNASSIGNED_BEFORE" ]] || die "foreign strata_id $FOREIGN_STRATA_ID not visible to Site B investigator"
fi

echo
echo "    selected foreign stratum: id=$FOREIGN_STRATA_ID name=$FOREIGN_STRATA_NAME unassigned=$FOREIGN_UNASSIGNED_BEFORE"
echo

PASS=true

if stratum_visible "$STRATA_JSON_A" "$FOREIGN_STRATA_ID"; then
  echo "WARN: foreign strata id $FOREIGN_STRATA_ID is visible in Site A strata-availability" >&2
else
  echo "==> Site A cannot see foreign stratum in strata-availability (expected)"
fi

echo
echo "==> Attempting cross-site assign-kit from Site A session"
assign_kit_attempt "$COOKIE_JAR_A" "$CSRF_A" "$FOREIGN_STRATA_ID" "$PATIENT_ID" \
  "$CROSS_SITE_BODY" "$CROSS_SITE_META"

HTTP_STATUS=$(awk -F= '/^http_status=/{print $2}' "$CROSS_SITE_META")
DETAIL=$(jq -r '.detail // empty' "$CROSS_SITE_BODY")

echo "    http status : $HTTP_STATUS"
echo "    detail      : ${DETAIL:-<none>}"
echo

if [[ "$HTTP_STATUS" != "400" && "$HTTP_STATUS" != "403" ]]; then
  echo "FAIL: expected HTTP 400 or 403 for cross-site assign-kit, got $HTTP_STATUS" >&2
  PASS=false
fi

if [[ "$DETAIL" != "Invalid stratum selection for your site." ]]; then
  echo "FAIL: unexpected error detail: '$DETAIL'" >&2
  PASS=false
fi

echo "==> Verifying Site B queue unchanged"
fetch_strata "$COOKIE_JAR_B" "$STRATA_JSON_B_AFTER"
FOREIGN_UNASSIGNED_AFTER=$(stratum_unassigned_count "$STRATA_JSON_B_AFTER" "$FOREIGN_STRATA_ID")
echo "    foreign stratum unassigned before: $FOREIGN_UNASSIGNED_BEFORE"
echo "    foreign stratum unassigned after : $FOREIGN_UNASSIGNED_AFTER"

if [[ "$FOREIGN_UNASSIGNED_AFTER" != "$FOREIGN_UNASSIGNED_BEFORE" ]]; then
  echo "FAIL: Site B unassigned count changed after cross-site attempt" >&2
  PASS=false
fi

echo
if [[ "$PASS" == true ]]; then
  echo "PASS: cross-site assign-kit blocked; Site B queue unchanged"
  echo "Raw responses saved in $OUTPUT_DIR"
  exit 0
fi

echo "Cross-site response body:" >&2
cat "$CROSS_SITE_BODY" >&2
exit 1
