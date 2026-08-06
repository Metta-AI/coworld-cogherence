#!/usr/bin/env bash
set -euo pipefail

game_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec "${game_dir}/scripts/build-static-replay-viewer.sh" "${game_dir}" "$1"
