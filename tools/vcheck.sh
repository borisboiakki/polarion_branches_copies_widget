#!/usr/bin/env bash
# Parse Velocity templates with Velocity 1.4, which reproduces the parser errors of Polarion 2512.
# Usage: tools/vcheck.sh [files...]   (default: every .vm file under spike/ and widget/)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
lib="$here/.lib"
mkdir -p "$lib"
fetch() { [ -f "$lib/$(basename "$1")" ] || curl -sSfL --retry 4 --retry-delay 2 -o "$lib/$(basename "$1")" "$1"; }
fetch https://repo1.maven.org/maven2/velocity/velocity/1.4/velocity-1.4.jar
fetch https://repo1.maven.org/maven2/commons-collections/commons-collections/3.2.2/commons-collections-3.2.2.jar
fetch https://repo1.maven.org/maven2/commons-lang/commons-lang/2.6/commons-lang-2.6.jar
fetch https://repo1.maven.org/maven2/oro/oro/2.0.8/oro-2.0.8.jar
cp="$lib/velocity-1.4.jar:$lib/commons-collections-3.2.2.jar:$lib/commons-lang-2.6.jar:$lib/oro-2.0.8.jar"
[ -f "$lib/VCheck.class" ] || javac -nowarn -cp "$cp" -d "$lib" "$here/VCheck.java"
if [ $# -eq 0 ]; then
  root="$(dirname "$here")"
  mapfile -t files < <(find "$root/spike" "$root/widget" -name '*.vm' 2>/dev/null | sort)
  set -- "${files[@]}"
fi
java -cp "$lib:$cp" VCheck "$@" 2>&1 | grep -v '^Picked up JAVA_TOOL_OPTIONS'
