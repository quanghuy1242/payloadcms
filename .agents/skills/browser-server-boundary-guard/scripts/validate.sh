#!/usr/bin/env bash
set -euo pipefail

skill_dir="$(cd "$(dirname "$0")/.." && pwd)"

grep -q '^name: browser-server-boundary-guard$' "$skill_dir/SKILL.md"
grep -q '^description:' "$skill_dir/SKILL.md"
test -s "$skill_dir/template.md"
test -s "$skill_dir/examples/sample.md"