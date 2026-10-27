#!/usr/bin/env bash
# Build the widget, render it with Velocity 1.4 against mock Polarion objects (VforIA test set),
# then load the browser and PDF output in Chromium (Playwright) and take screenshots.
# Usage: tools/test-widget.sh [outDir]      (default: /tmp/bw-widget-test)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-/tmp/bw-widget-test}"
mkdir -p "$out/cls"
python3 "$root/tools/build-widget.py"
lib="$root/tools/.lib"
cp="$lib/velocity-1.4.jar:$lib/commons-collections-3.2.2.jar:$lib/commons-lang-2.6.jar:$lib/oro-2.0.8.jar"
javac -nowarn -cp "$cp" -d "$out/cls" "$root/tools/vtest/WidgetHarness.java" 2>&1 | grep -v '^Picked up\|^Note:' || true
java -cp "$out/cls:$cp" WidgetHarness "$root/widget/dist/docBranches" "$out" related 2>&1 | grep -v '^Picked up'
for f in browser pdf; do
  { printf '<!doctype html><html><head><meta charset="utf-8"><title>%s</title></head><body style="margin:16px;width:1180px">' "$f"
    cat "$out/$f-fragment.html"; echo '</body></html>'; } > "$out/$f.html"
done
node "$root/tools/vtest/browser-check.js" "$out"
echo "Screenshots and exports in $out"
