#!/usr/bin/env bash
# check-status.sh — Read pipeline state from .claude/state/pipeline.json
# Usage: ./scripts/check-status.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PIPELINE_FILE="$PROJECT_ROOT/.claude/state/pipeline.json"
AGENT_STATUS_DIR="$PROJECT_ROOT/.claude/state/agent-status"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Check dependencies
if ! command -v jq &> /dev/null; then
  echo -e "${RED}Error: jq is required but not installed.${NC}"
  echo "Install with: brew install jq"
  exit 1
fi

# Check pipeline file exists
if [ ! -f "$PIPELINE_FILE" ]; then
  echo -e "${YELLOW}Pipeline state not initialized.${NC}"
  echo "Run /kickoff in Claude to start the SDLC pipeline."
  exit 0
fi

# Read pipeline state
RUN_ID=$(jq -r '.run_id // "none"' "$PIPELINE_FILE")
STATUS=$(jq -r '.status // "unknown"' "$PIPELINE_FILE")
STARTED=$(jq -r '.started_at // "—"' "$PIPELINE_FILE")
COMPLETED=$(jq -r '.completed_at // "—"' "$PIPELINE_FILE")
PUSH_ALLOWED=$(jq -r '.git_push_allowed // false' "$PIPELINE_FILE")

# No run yet
if [ "$RUN_ID" = "null" ] || [ "$RUN_ID" = "none" ]; then
  echo -e "${YELLOW}No pipeline run found.${NC}"
  echo "Run /kickoff in Claude to start the SDLC pipeline."
  exit 0
fi

# Status color
status_color() {
  case "$1" in
    completed) echo -e "${GREEN}$1${NC}" ;;
    in_progress) echo -e "${BLUE}$1${NC}" ;;
    failed) echo -e "${RED}$1${NC}" ;;
    pending) echo -e "${YELLOW}$1${NC}" ;;
    *) echo "$1" ;;
  esac
}

# Status icon
status_icon() {
  case "$1" in
    completed) echo -e "${GREEN}[x]${NC}" ;;
    in_progress) echo -e "${BLUE}[>]${NC}" ;;
    failed) echo -e "${RED}[!]${NC}" ;;
    pending) echo "[ ]" ;;
    *) echo "[?]" ;;
  esac
}

# Gate icon
gate_icon() {
  case "$1" in
    pass) echo -e "${GREEN}pass${NC}" ;;
    fail) echo -e "${RED}FAIL${NC}" ;;
    pending) echo -e "${YELLOW}pending${NC}" ;;
    *) echo "$1" ;;
  esac
}

# Header
echo ""
echo -e "${BOLD}Pipeline Status:${NC} $(status_color "$STATUS")"
echo -e "${BOLD}Run ID:${NC}          $RUN_ID"
echo -e "${BOLD}Started:${NC}         $STARTED"
if [ "$COMPLETED" != "—" ] && [ "$COMPLETED" != "null" ]; then
  echo -e "${BOLD}Completed:${NC}       $COMPLETED"
fi
if [ "$PUSH_ALLOWED" = "true" ]; then
  echo -e "${BOLD}Git Push:${NC}        ${GREEN}allowed${NC}"
else
  echo -e "${BOLD}Git Push:${NC}        ${RED}blocked${NC}"
fi

# Phase Progress
echo ""
echo -e "${BOLD}Phase Progress:${NC}"

PHASES=("0_initialize:Initialize" "0.5_configure:Configure" "1_read_code:Read Code" "2_requirements:Requirements" "3_implementation:Implementation" "4_testing:Testing" "5_load_test:Load Test" "6_final:Final Push")

# Config summary (if configure phase completed)
TARGET_CHAIN=$(jq -r '.config.target_chain // empty' "$PIPELINE_FILE")
if [ -n "$TARGET_CHAIN" ] && [ "$TARGET_CHAIN" != "null" ]; then
  echo ""
  echo -e "${BOLD}Configuration:${NC}"
  echo -e "  Target:     $TARGET_CHAIN"
  PARENT_RPC=$(jq -r '.config.parent_chain_rpc // "—"' "$PIPELINE_FILE")
  L2_RPC=$(jq -r '.config.l2_chain_rpc // "—"' "$PIPELINE_FILE")
  CONFIGURED_CHAIN_ID=$(jq -r '.config.chain_id // "—"' "$PIPELINE_FILE")
  echo -e "  Parent RPC: $PARENT_RPC"
  echo -e "  L2 RPC:     $L2_RPC"
  echo -e "  Chain ID:   $CONFIGURED_CHAIN_ID"
fi

for phase_entry in "${PHASES[@]}"; do
  PHASE_KEY="${phase_entry%%:*}"
  PHASE_LABEL="${phase_entry##*:}"
  PHASE_STATUS=$(jq -r ".phases.\"$PHASE_KEY\".status // \"pending\"" "$PIPELINE_FILE")
  ICON=$(status_icon "$PHASE_STATUS")
  NOTES=$(jq -r ".phases.\"$PHASE_KEY\".notes // empty" "$PIPELINE_FILE")

  printf "  %b %-20s" "$ICON" "$PHASE_LABEL"
  if [ "$PHASE_STATUS" = "in_progress" ]; then
    printf " ${CYAN}<- current${NC}"
  fi
  if [ -n "$NOTES" ] && [ "$NOTES" != "null" ]; then
    printf " ${YELLOW}(%s)${NC}" "$NOTES"
  fi
  echo ""
done

# Testing Gates
echo ""
echo -e "${BOLD}Testing Gates:${NC}"

AGENTS=("functional" "integration" "security" "performance" "system-uat" "deployment")

for AGENT in "${AGENTS[@]}"; do
  GATE_STATUS=$(jq -r ".phases.\"4_testing\".gates.\"$AGENT\".status // \"pending\"" "$PIPELINE_FILE")
  GATE_RESULT=$(jq -r ".phases.\"4_testing\".gates.\"$AGENT\".gate // \"pending\"" "$PIPELINE_FILE")
  ICON=$(status_icon "$GATE_STATUS")
  GATE=$(gate_icon "$GATE_RESULT")

  # Check for agent status file with findings
  FINDINGS=""
  AGENT_FILE="$AGENT_STATUS_DIR/${AGENT}-tester.json"
  if [ -f "$AGENT_FILE" ]; then
    FCOUNT=$(jq -r '.findings_count // 0' "$AGENT_FILE")
    if [ "$FCOUNT" -gt 0 ] 2>/dev/null; then
      S1=$(jq -r '.findings_by_severity.s1 // 0' "$AGENT_FILE")
      S2=$(jq -r '.findings_by_severity.s2 // 0' "$AGENT_FILE")
      S3=$(jq -r '.findings_by_severity.s3 // 0' "$AGENT_FILE")
      S4=$(jq -r '.findings_by_severity.s4 // 0' "$AGENT_FILE")
      FINDINGS=" ($FCOUNT findings: ${S1}S1 ${S2}S2 ${S3}S3 ${S4}S4)"
    fi
  fi

  printf "  %b %-16s — %b%s\n" "$ICON" "$AGENT" "$GATE" "$FINDINGS"
done

# Findings Summary
echo ""
echo -e "${BOLD}Findings Summary:${NC}"
S1=$(jq -r '.findings_summary.s1 // 0' "$PIPELINE_FILE")
S2=$(jq -r '.findings_summary.s2 // 0' "$PIPELINE_FILE")
S3=$(jq -r '.findings_summary.s3 // 0' "$PIPELINE_FILE")
S4=$(jq -r '.findings_summary.s4 // 0' "$PIPELINE_FILE")

if [ "$S1" -gt 0 ] 2>/dev/null; then
  echo -e "  S1 (critical):  ${RED}${S1}${NC}"
else
  echo "  S1 (critical):  $S1"
fi
if [ "$S2" -gt 0 ] 2>/dev/null; then
  echo -e "  S2 (high):      ${YELLOW}${S2}${NC}"
else
  echo "  S2 (high):      $S2"
fi
echo "  S3 (medium):    $S3"
echo "  S4 (low):       $S4"
echo ""
