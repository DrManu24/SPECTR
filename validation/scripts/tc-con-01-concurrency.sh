#!/usr/bin/env bash
# TC-CON-01: Bedside concurrency and row-locking test for SPECTR.
#
# Fires two near-simultaneous POST /investigator/assign-kit requests for the
# same stratum with different participant IDs and verifies distinct sequence rows.
#
# Usage:
#   ./tc-con-01-concurrency.sh
#   ./tc-con-01-concurrency.sh --username inv_Hospital_01 --password 'your-password'
#   SPECTR_USERNAME=inv_Hospital_01 SPECTR_PASSWORD='...' ./tc-con-01-concurrency.sh
#
# If username/password are omitted, the script prompts for them interactively.
#
# Options:
#   --base-url URL        API base (default: https://spectr.mmmr.in)
#   --username USER       Investigator username (or set SPECTR_USERNAME)
#   --password PASS       Investigator password (or set SPECTR_PASSWORD)
#   --strata-id ID        Stratum to use (default: first with >= 2 unassigned)
#   --patient-a ID        First participant ID (default: TEST-001)
#   --patient-b ID        Second participant ID (default: TEST-002)
#   --output-dir DIR      Where to write response files (default: ./tc-con-01-output)
#   --help                Show this help

set -euo pipefail

BASE_URL="${SPECTR_BASE_URL:-https://spectr.mmmr.in}"
USERNAME="${SPECTR_USERNAME:-}"
PASSWORD="${SPECTR_PASSWORD:-}"
STRATA_ID=""
PATIENT_A="TEST-001"
PATIENT_B="TEST-002"
OUTPUT_DIR="./tc-con-01-output"

usage() {
  sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'
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
    --username)
      USERNAME="$2"
      shift 2
      ;;
    --password)
      PASSWORD="$2"
      shift 2
      ;;
    --strata-id)
      STRATA_ID="$2"
      shift 2
      ;;
    --patient-a)
      PATIENT_A="$2"
      shift 2
      ;;
    --patient-b)
      PATIENT_B="$2"
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

prompt_credentials() {
  if [[ -z "$USERNAME" ]]; then
    read -r -p "Investigator username: " USERNAME
    USERNAME="${USERNAME//[[:space:]]/}"
    [[ -n "$USERNAME" ]] || die "username cannot be empty"
  fi

  if [[ -z "$PASSWORD" ]]; then
    read -r -s -p "Investigator password: " PASSWORD
    echo
    [[ -n "$PASSWORD" ]] || die "password cannot be empty"
  fi
}

prompt_credentials

if [[ "$PATIENT_A" == "$PATIENT_B" ]]; then
  die "participant IDs must differ"
fi

if ! command -v uuidgen >/dev/null 2>&1; then
  uuidgen() {
    cat /proc/sys/kernel/random/uuid
  }
fi

mkdir -p "$OUTPUT_DIR"
COOKIE_JAR="$OUTPUT_DIR/cookies.txt"
LOGIN_JSON="$OUTPUT_DIR/login.json"
STRATA_JSON="$OUTPUT_DIR/strata-availability.json"
RESULT_A="$OUTPUT_DIR/${PATIENT_A}.json"
RESULT_B="$OUTPUT_DIR/${PATIENT_B}.json"
META_A="$OUTPUT_DIR/${PATIENT_A}.meta"
META_B="$OUTPUT_DIR/${PATIENT_B}.meta"

echo "==> TC-CON-01 concurrency test"
echo "    base url : $BASE_URL"
echo "    username : $USERNAME"
echo "    patients : $PATIENT_A, $PATIENT_B"
echo "    output   : $OUTPUT_DIR"
echo

echo "==> Logging in"
LOGIN_HTTP=$(curl -sS -c "$COOKIE_JAR" -o "$LOGIN_JSON" -w "%{http_code}" \
  -X POST "$BASE_URL/investigator/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")

if [[ "$LOGIN_HTTP" != "200" ]]; then
  echo "login response ($LOGIN_HTTP):" >&2
  cat "$LOGIN_JSON" >&2
  die "login failed with HTTP $LOGIN_HTTP"
fi

CSRF=$(jq -r '.csrf_token // empty' "$LOGIN_JSON")
[[ -n "$CSRF" ]] || die "login succeeded but csrf_token missing in response"

echo "    login ok"
echo

echo "==> Fetching strata availability"
STRATA_HTTP=$(curl -sS -b "$COOKIE_JAR" -o "$STRATA_JSON" -w "%{http_code}" \
  "$BASE_URL/investigator/strata-availability")

if [[ "$STRATA_HTTP" != "200" ]]; then
  echo "strata response ($STRATA_HTTP):" >&2
  cat "$STRATA_JSON" >&2
  die "strata-availability failed with HTTP $STRATA_HTTP"
fi

echo "    available strata:"
jq -r '.[] | "      id=\(.id) name=\(.name) unassigned=\(.unassigned_count)"' "$STRATA_JSON"

if [[ -z "$STRATA_ID" ]]; then
  STRATA_ID=$(jq -r '[.[] | select(.unassigned_count >= 2)] | sort_by(.id) | .[0].id // empty' "$STRATA_JSON")
  [[ -n "$STRATA_ID" ]] || die "no stratum with at least 2 unassigned kit codes; pass --strata-id manually"
  echo
  echo "    auto-selected strata_id=$STRATA_ID"
else
  UNASSIGNED=$(jq -r --arg id "$STRATA_ID" '.[] | select(.id == ($id | tonumber)) | .unassigned_count' "$STRATA_JSON")
  [[ -n "$UNASSIGNED" ]] || die "strata_id $STRATA_ID not found for this investigator"
  if [[ "$UNASSIGNED" -lt 2 ]]; then
    die "strata_id $STRATA_ID only has $UNASSIGNED unassigned kit code(s); need >= 2"
  fi
  echo
  echo "    using strata_id=$STRATA_ID ($UNASSIGNED unassigned)"
fi

echo
echo "==> Dispatching parallel assign-kit requests"

assign_kit() {
  local patient_id="$1"
  local idem_key="$2"
  local body_file="$3"
  local meta_file="$4"

  local payload
  payload=$(jq -nc --arg patient "$patient_id" --argjson strata "$STRATA_ID" \
    '{patient_id: $patient, strata_id: $strata}')

  local http_code
  http_code=$(curl -sS \
    -b "$COOKIE_JAR" \
    -o "$body_file" \
    -w "%{http_code}" \
    -X POST "$BASE_URL/investigator/assign-kit" \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $CSRF" \
    -H "Idempotency-Key: $idem_key" \
    -d "$payload")

  printf 'patient=%s\nhttp_status=%s\nidempotency_key=%s\n' \
    "$patient_id" "$http_code" "$idem_key" >"$meta_file"
}

IDEM_A=$(uuidgen)
IDEM_B=$(uuidgen)

assign_kit "$PATIENT_A" "$IDEM_A" "$RESULT_A" "$META_A" &
PID_A=$!
assign_kit "$PATIENT_B" "$IDEM_B" "$RESULT_B" "$META_B" &
PID_B=$!

wait "$PID_A"
wait "$PID_B"

echo "    requests complete"
echo

summarize() {
  local patient="$1"
  local body_file="$2"
  local meta_file="$3"

  local http_status seq kit outcome record_id
  http_status=$(awk -F= '/^http_status=/{print $2}' "$meta_file")

  if jq -e . >/dev/null 2>&1 <"$body_file"; then
    seq=$(jq -r '.sequence_number // "n/a"' "$body_file")
    kit=$(jq -r '.kit_code // "n/a"' "$body_file")
    outcome=$(jq -r '.assignment_outcome // "n/a"' "$body_file")
    record_id=$(jq -r '.id // "n/a"' "$body_file")
  else
    seq="n/a"
    kit="n/a"
    outcome="n/a"
    record_id="n/a"
  fi

  printf '%s\n' \
    "  patient          : $patient" \
    "  http_status      : $http_status" \
    "  record_id        : $record_id" \
    "  sequence_number  : $seq" \
    "  kit_code         : $kit" \
    "  assignment_outcome: $outcome"
}

echo "==> Results"
summarize "$PATIENT_A" "$RESULT_A" "$META_A"
echo
summarize "$PATIENT_B" "$RESULT_B" "$META_B"
echo

HTTP_A=$(awk -F= '/^http_status=/{print $2}' "$META_A")
HTTP_B=$(awk -F= '/^http_status=/{print $2}' "$META_B")
SEQ_A=$(jq -r '.sequence_number // empty' "$RESULT_A")
SEQ_B=$(jq -r '.sequence_number // empty' "$RESULT_B")
ID_A=$(jq -r '.id // empty' "$RESULT_A")
ID_B=$(jq -r '.id // empty' "$RESULT_B")
OUTCOME_A=$(jq -r '.assignment_outcome // empty' "$RESULT_A")
OUTCOME_B=$(jq -r '.assignment_outcome // empty' "$RESULT_B")

PASS=true

if [[ "$HTTP_A" != "200" || "$HTTP_B" != "200" ]]; then
  echo "FAIL: one or both requests did not return HTTP 200" >&2
  PASS=false
fi

if [[ "$OUTCOME_A" != "created" || "$OUTCOME_B" != "created" ]]; then
  echo "FAIL: expected assignment_outcome=created for both requests" >&2
  PASS=false
fi

if [[ -z "$SEQ_A" || -z "$SEQ_B" ]]; then
  echo "FAIL: sequence_number missing from one or both responses" >&2
  PASS=false
elif [[ "$SEQ_A" == "$SEQ_B" ]]; then
  echo "FAIL: duplicate sequence_number assigned ($SEQ_A)" >&2
  PASS=false
elif (( SEQ_A > SEQ_B ? SEQ_A - SEQ_B : SEQ_B - SEQ_A != 1 )); then
  echo "WARN: sequence numbers are distinct but not consecutive ($SEQ_A, $SEQ_B)" >&2
fi

if [[ -n "$ID_A" && -n "$ID_B" && "$ID_A" == "$ID_B" ]]; then
  echo "FAIL: duplicate randomization record id ($ID_A)" >&2
  PASS=false
fi

if [[ "$PASS" == true ]]; then
  echo "PASS: $PATIENT_A -> sequence $SEQ_A; $PATIENT_B -> sequence $SEQ_B"
  echo "Raw responses saved in $OUTPUT_DIR"
  exit 0
fi

echo
echo "Response bodies:" >&2
echo "--- $PATIENT_A ---" >&2
cat "$RESULT_A" >&2
echo >&2
echo "--- $PATIENT_B ---" >&2
cat "$RESULT_B" >&2
exit 1
