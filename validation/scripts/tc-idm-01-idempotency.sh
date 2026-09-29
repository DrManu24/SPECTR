#!/usr/bin/env bash
# TC-IDM-01: Idempotency and safe retry test for SPECTR.
#
# Verifies that replaying assign-kit with the same Idempotency-Key does not
# consume additional sequence rows. Runs:
#   1) Sequential replay (simulates client retry after network drop)
#   2) Parallel duplicate requests with the same key (simulates double-submit)
#
# Usage:
#   ./tc-idm-01-idempotency.sh
#   ./tc-idm-01-idempotency.sh --patient-id TEST-IDM-01 --strata-id 24
#   SPECTR_USERNAME=AEWSSY SPECTR_PASSWORD='...' ./tc-idm-01-idempotency.sh
#
# If username/password are omitted, the script prompts for them interactively.
#
# Options:
#   --base-url URL        API base (default: https://spectr.mmmr.in)
#   --username USER       Investigator username (or set SPECTR_USERNAME)
#   --password PASS       Investigator password (or set SPECTR_PASSWORD)
#   --strata-id ID        Stratum to use (default: first with >= 1 unassigned)
#   --patient-id ID       Participant ID (default: TEST-IDM-01)
#   --output-dir DIR      Where to write response files (default: ./tc-idm-01-output)
#   --skip-parallel       Only run sequential replay (skip parallel duplicate test)
#   --help                Show this help

set -euo pipefail

BASE_URL="${SPECTR_BASE_URL:-https://spectr.mmmr.in}"
USERNAME="${SPECTR_USERNAME:-}"
PASSWORD="${SPECTR_PASSWORD:-}"
STRATA_ID=""
PATIENT_ID="TEST-IDM-01"
OUTPUT_DIR="./tc-idm-01-output"
SKIP_PARALLEL=false

usage() {
  sed -n '3,24p' "$0" | sed 's/^# \{0,1\}//'
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
    --patient-id)
      PATIENT_ID="$2"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --skip-parallel)
      SKIP_PARALLEL=true
      shift
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

if ! command -v uuidgen >/dev/null 2>&1; then
  uuidgen() {
    cat /proc/sys/kernel/random/uuid
  }
fi

mkdir -p "$OUTPUT_DIR"
COOKIE_JAR="$OUTPUT_DIR/cookies.txt"
LOGIN_JSON="$OUTPUT_DIR/login.json"
STRATA_JSON="$OUTPUT_DIR/strata-availability.json"
RESULT_SEQ_1="$OUTPUT_DIR/sequential-request-1.json"
RESULT_SEQ_2="$OUTPUT_DIR/sequential-request-2.json"
META_SEQ_1="$OUTPUT_DIR/sequential-request-1.meta"
META_SEQ_2="$OUTPUT_DIR/sequential-request-2.meta"
RESULT_PAR_A="$OUTPUT_DIR/parallel-request-a.json"
RESULT_PAR_B="$OUTPUT_DIR/parallel-request-b.json"
META_PAR_A="$OUTPUT_DIR/parallel-request-a.meta"
META_PAR_B="$OUTPUT_DIR/parallel-request-b.meta"

echo "==> TC-IDM-01 idempotency test"
echo "    base url   : $BASE_URL"
echo "    username   : $USERNAME"
echo "    patient id : $PATIENT_ID"
echo "    output     : $OUTPUT_DIR"
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
  STRATA_ID=$(jq -r '[.[] | select(.unassigned_count >= 1)] | sort_by(.id) | .[0].id // empty' "$STRATA_JSON")
  [[ -n "$STRATA_ID" ]] || die "no stratum with at least 1 unassigned kit code; pass --strata-id manually"
  echo
  echo "    auto-selected strata_id=$STRATA_ID"
else
  UNASSIGNED=$(jq -r --arg id "$STRATA_ID" '.[] | select(.id == ($id | tonumber)) | .unassigned_count' "$STRATA_JSON")
  [[ -n "$UNASSIGNED" ]] || die "strata_id $STRATA_ID not found for this investigator"
  if [[ "$UNASSIGNED" -lt 1 ]]; then
    die "strata_id $STRATA_ID has no unassigned kit codes"
  fi
  echo
  echo "    using strata_id=$STRATA_ID ($UNASSIGNED unassigned)"
fi

UNASSIGNED_BEFORE=$(jq -r --arg id "$STRATA_ID" '.[] | select(.id == ($id | tonumber)) | .unassigned_count' "$STRATA_JSON")

assign_kit() {
  local idem_key="$1"
  local body_file="$2"
  local meta_file="$3"
  local label="${4:-request}"

  local payload
  payload=$(jq -nc --arg patient "$PATIENT_ID" --argjson strata "$STRATA_ID" \
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

  printf 'label=%s\nhttp_status=%s\nidempotency_key=%s\n' \
    "$label" "$http_code" "$idem_key" >"$meta_file"
}

summarize() {
  local label="$1"
  local body_file="$2"
  local meta_file="$3"

  local http_status seq kit outcome record_id idem_key
  http_status=$(awk -F= '/^http_status=/{print $2}' "$meta_file")
  idem_key=$(awk -F= '/^idempotency_key=/{print $2}' "$meta_file")

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
    "  label            : $label" \
    "  http_status      : $http_status" \
    "  idempotency_key  : $idem_key" \
    "  record_id        : $record_id" \
    "  sequence_number  : $seq" \
    "  kit_code         : $kit" \
    "  assignment_outcome: $outcome"
}

responses_match() {
  local file_a="$1"
  local file_b="$2"
  local id_a id_b seq_a seq_b kit_a kit_b

  id_a=$(jq -r '.id // empty' "$file_a")
  id_b=$(jq -r '.id // empty' "$file_b")
  seq_a=$(jq -r '.sequence_number // empty' "$file_a")
  seq_b=$(jq -r '.sequence_number // empty' "$file_b")
  kit_a=$(jq -r '.kit_code // empty' "$file_a")
  kit_b=$(jq -r '.kit_code // empty' "$file_b")

  [[ -n "$id_a" && -n "$id_b" && "$id_a" == "$id_b" && "$seq_a" == "$seq_b" && "$kit_a" == "$kit_b" ]]
}

PASS=true

echo
echo "==> Test 1: Sequential replay with the same Idempotency-Key"
SEQ_IDEM_KEY=$(uuidgen)
assign_kit "$SEQ_IDEM_KEY" "$RESULT_SEQ_1" "$META_SEQ_1" "sequential-1"
assign_kit "$SEQ_IDEM_KEY" "$RESULT_SEQ_2" "$META_SEQ_2" "sequential-2"

summarize "sequential-1" "$RESULT_SEQ_1" "$META_SEQ_1"
echo
summarize "sequential-2" "$RESULT_SEQ_2" "$META_SEQ_2"
echo

HTTP_SEQ_1=$(awk -F= '/^http_status=/{print $2}' "$META_SEQ_1")
HTTP_SEQ_2=$(awk -F= '/^http_status=/{print $2}' "$META_SEQ_2")
OUTCOME_SEQ_1=$(jq -r '.assignment_outcome // empty' "$RESULT_SEQ_1")
OUTCOME_SEQ_2=$(jq -r '.assignment_outcome // empty' "$RESULT_SEQ_2")

if [[ "$HTTP_SEQ_1" != "200" || "$HTTP_SEQ_2" != "200" ]]; then
  echo "FAIL: sequential replay did not return HTTP 200 for both requests" >&2
  PASS=false
fi

if [[ "$OUTCOME_SEQ_1" != "created" ]]; then
  echo "FAIL: first sequential request expected assignment_outcome=created (got '$OUTCOME_SEQ_1')" >&2
  echo "      participant '$PATIENT_ID' may already be allocated; use a fresh --patient-id" >&2
  PASS=false
fi

if ! responses_match "$RESULT_SEQ_1" "$RESULT_SEQ_2"; then
  echo "FAIL: sequential replay responses do not match" >&2
  PASS=false
fi

if [[ "$SKIP_PARALLEL" == false ]]; then
  echo "==> Test 2: Parallel duplicate requests with the same Idempotency-Key"
  PAR_PATIENT_ID="${PATIENT_ID}-PAR"
  PATIENT_ID="$PAR_PATIENT_ID"
  PAR_IDEM_KEY=$(uuidgen)

  assign_kit "$PAR_IDEM_KEY" "$RESULT_PAR_A" "$META_PAR_A" "parallel-a" &
  PID_A=$!
  assign_kit "$PAR_IDEM_KEY" "$RESULT_PAR_B" "$META_PAR_B" "parallel-b" &
  PID_B=$!
  wait "$PID_A"
  wait "$PID_B"

  summarize "parallel-a" "$RESULT_PAR_A" "$META_PAR_A"
  echo
  summarize "parallel-b" "$RESULT_PAR_B" "$META_PAR_B"
  echo

  HTTP_PAR_A=$(awk -F= '/^http_status=/{print $2}' "$META_PAR_A")
  HTTP_PAR_B=$(awk -F= '/^http_status=/{print $2}' "$META_PAR_B")
  OUTCOME_PAR_A=$(jq -r '.assignment_outcome // empty' "$RESULT_PAR_A")
  OUTCOME_PAR_B=$(jq -r '.assignment_outcome // empty' "$RESULT_PAR_B")

  if [[ "$HTTP_PAR_A" != "200" || "$HTTP_PAR_B" != "200" ]]; then
    echo "FAIL: parallel duplicate requests did not return HTTP 200" >&2
    PASS=false
  fi

  if [[ "$OUTCOME_PAR_A" != "created" || "$OUTCOME_PAR_B" != "created" ]]; then
    echo "FAIL: parallel duplicate requests expected assignment_outcome=created" >&2
    PASS=false
  fi

  if ! responses_match "$RESULT_PAR_A" "$RESULT_PAR_B"; then
    echo "FAIL: parallel duplicate responses do not match" >&2
    PASS=false
  fi
else
  echo "==> Test 2 skipped (--skip-parallel)"
  echo
fi

echo "==> Verifying stratum consumption"
STRATA_HTTP_AFTER=$(curl -sS -b "$COOKIE_JAR" -o "$OUTPUT_DIR/strata-availability-after.json" -w "%{http_code}" \
  "$BASE_URL/investigator/strata-availability")
if [[ "$STRATA_HTTP_AFTER" != "200" ]]; then
  echo "WARN: could not re-fetch strata availability after test" >&2
else
  UNASSIGNED_AFTER=$(jq -r --arg id "$STRATA_ID" '.[] | select(.id == ($id | tonumber)) | .unassigned_count' \
    "$OUTPUT_DIR/strata-availability-after.json")
  EXPECTED_DROP=1
  if [[ "$SKIP_PARALLEL" == false ]]; then
    EXPECTED_DROP=2
  fi
  ACTUAL_DROP=$((UNASSIGNED_BEFORE - UNASSIGNED_AFTER))
  echo "    unassigned before : $UNASSIGNED_BEFORE"
  echo "    unassigned after  : $UNASSIGNED_AFTER"
  echo "    consumed          : $ACTUAL_DROP (expected $EXPECTED_DROP)"
  if [[ "$ACTUAL_DROP" -ne "$EXPECTED_DROP" ]]; then
    echo "FAIL: stratum consumed $ACTUAL_DROP row(s); expected $EXPECTED_DROP" >&2
    PASS=false
  fi
fi

echo
if [[ "$PASS" == true ]]; then
  echo "PASS: idempotency prevented duplicate allocations"
  echo "Raw responses saved in $OUTPUT_DIR"
  exit 0
fi

echo "Response bodies:" >&2
for f in "$RESULT_SEQ_1" "$RESULT_SEQ_2" "$RESULT_PAR_A" "$RESULT_PAR_B"; do
  if [[ -f "$f" ]]; then
    echo "--- $f ---" >&2
    cat "$f" >&2
    echo >&2
  fi
done
exit 1
