#!/usr/bin/env bash
# Build each widget, render it with Velocity 1.4 against mock Polarion objects, then load the browser
# and PDF output in Chromium (Playwright), take screenshots and test the interactions.
# Usage: tools/test-widget.sh [widget|all] [outDir]      (defaults: all, /tmp/bw-widget-test)
# Per widget: tools/vtest/<widget>/*Harness.java (render on mocks; main class = that file) and tools/vtest/<widget>/browser-check.js.
# The harness writes browser-fragment.html, pdf-fragment.html, (two projects in scope) multi-fragment.html and (docCoverage,
# collection context) collection-fragment.html.
# The mock Polarion objects live in tools/vtest/docBranches/WidgetHarness.java and are compiled with every harness.
# Output of each widget goes to <outDir>/<widget>/.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
which="${1:-all}"
base="${2:-/tmp/bw-widget-test}"
if [ "$which" = all ]; then
  mapfile -t widgets < <(cd "$root/tools/vtest" && for d in */; do [ -d "$root/widgets/${d%/}" ] && echo "${d%/}"; done)
else
  widgets=("$which")
fi
lib="$root/tools/.lib"   # Velocity 1.4 jars, downloaded by tools/vcheck.sh (run by the build)
cp="$lib/velocity-1.4.jar:$lib/commons-collections-3.2.2.jar:$lib/commons-lang-2.6.jar:$lib/oro-2.0.8.jar"
for w in "${widgets[@]}"; do
  echo "=== $w"
  out="$base/$w"
  mkdir -p "$out/cls"
  python3 "$root/tools/build-widget.py" --widget "$w"
  srcs=("$root/tools/vtest/docBranches/WidgetHarness.java")
  for f in "$root/tools/vtest/$w/"*.java; do [ "$f" = "${srcs[0]}" ] || srcs+=("$f"); done
  main="$(cd "$root/tools/vtest/$w" && ls *Harness.java | head -1)"
  javac -nowarn -cp "$cp" -d "$out/cls" "${srcs[@]}" 2>&1 | grep -v '^Picked up\|^Note:' || true
  java -cp "$out/cls:$cp" "${main%.java}" "$root/widgets/$w/dist/$w" "$out" related 2>&1 | grep -v '^Picked up'
  for f in browser pdf multi collection; do
    [ -f "$out/$f-fragment.html" ] || continue
    { printf '<!doctype html><html><head><meta charset="utf-8"><title>%s</title></head><body style="margin:16px;width:1180px">' "$f"
      cat "$out/$f-fragment.html"; echo '</body></html>'; } > "$out/$f.html"
  done
  # Polarion turns the directive into a script tag; emulate it (the Velocity 1.4 harness leaves it as text).
  mkdir -p "$out/resources" && cp "$root/widgets/$w/dist/$w/resources/xlsx.js" "$out/resources/"
  sed -i 's|#loadWidgetJs("resources/xlsx.js")|<script src="resources/xlsx.js"></script>|' "$out/browser.html"
  grep -q '<script src="resources/xlsx.js">' "$out/browser.html" || { echo "loadWidgetJs directive not found in the output"; exit 1; }
  node "$root/tools/vtest/$w/browser-check.js" "$out"
  echo "Screenshots and exports in $out"
done
# Spike widgets of docCoverage (cvSpike, ccSpike): Velocity 1.4 smoke tests on the docBranches mocks.
if [ "$which" = all ]; then
  echo "=== cvSpike"
  out="$base/cvSpike"
  mkdir -p "$out/cls"
  "$root/tools/vcheck.sh" "$root/tests/docCoverage-v0.1.x/spike-widget/cvSpike/"*.vm
  javac -nowarn -cp "$cp" -d "$out/cls" "$root/tools/vtest/docBranches/WidgetHarness.java" "$root/tools/vtest/cvSpike/SpikeHarness.java" 2>&1 | grep -v '^Picked up\|^Note:' || true
  java -cp "$out/cls:$cp" SpikeHarness "$root/tests/docCoverage-v0.1.x/spike-widget/cvSpike" "$out" 2>&1 | grep -v '^Picked up'
  echo "=== ccSpike"
  out="$base/ccSpike"
  mkdir -p "$out/cls"
  "$root/tools/vcheck.sh" "$root/tests/docCoverage-v0.3.x/spike-widget/ccSpike/"*.vm
  javac -nowarn -cp "$cp" -d "$out/cls" "$root/tools/vtest/docBranches/WidgetHarness.java" "$root/tools/vtest/ccSpike/CollectionSpikeHarness.java" 2>&1 | grep -v '^Picked up\|^Note:' || true
  java -cp "$out/cls:$cp" CollectionSpikeHarness "$root/tests/docCoverage-v0.3.x/spike-widget/ccSpike" "$out" 2>&1 | grep -v '^Picked up'
  echo "=== aiSpike"
  out="$base/aiSpike"
  mkdir -p "$out/cls"
  "$root/tools/vcheck.sh" "$root/tests/advImpact-v0.1.x/spike-widget/aiSpike/"*.vm
  javac -nowarn -cp "$cp" -d "$out/cls" "$root/tools/vtest/docBranches/WidgetHarness.java" "$root/tools/vtest/aiSpike/AdvImpactSpikeHarness.java" 2>&1 | grep -v '^Picked up\|^Note:' || true
  java -cp "$out/cls:$cp" AdvImpactSpikeHarness "$root/tests/advImpact-v0.1.x/spike-widget/aiSpike" "$out" 2>&1 | grep -v '^Picked up'
fi
