#!/usr/bin/env bash
# Orchestrates the full fake-printer test suite (TCP simulators + Mongo + routing).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PRINTER_MODE="${PRINTER_MODE:-fake}"
export FAKE_PRINTER_HOST="${FAKE_PRINTER_HOST:-127.0.0.1}"
node tools/fake-printers/run-all.js "$@"
