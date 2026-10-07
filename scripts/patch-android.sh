#!/usr/bin/env bash
# NORA TUNNEL — idempotent Android manifest/gradle patcher.
# Runs in CI before `gradlew assembleDebug`. Safe to run repeatedly.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/android/app/src/main/AndroidManifest.xml"
GRADLE="$ROOT/android/app/build.gradle"
STRINGS="$ROOT/android/app/src/main/res/values/strings.xml"

if [[ ! -f "$MANIFEST" ]]; then
  echo "AndroidManifest.xml not found at $MANIFEST — run 'npx cap add android' first." >&2
  exit 1
fi

python3 - "$MANIFEST" "$GRADLE" "$STRINGS" <<'PY'
import re, sys, pathlib

manifest_path, gradle_path, strings_path = (pathlib.Path(p) for p in sys.argv[1:4])
xml = manifest_path.read_text()

if "android.permission.POST_NOTIFICATIONS" not in xml:
    xml = xml.replace(
        '<uses-permission android:name="android.permission.INTERNET" />',
        '<uses-permission android:name="android.permission.INTERNET" />\n'
        '    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />\n'
        '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
        1,
    )

# Needed so a phone can reach a workspace served over plain http:// on the LAN.
if "usesCleartextTraffic" not in xml:
    xml = re.sub(
        r'(<application\b[^>]*?)>',
        lambda m: m.group(1) + ' android:usesCleartextTraffic="true" android:largeHeap="true">',
        xml,
        count=1,
    )

if "android:screenOrientation" not in xml:
    xml = re.sub(r'(<activity\b[^>]*?)>', lambda m: m.group(1) + ' android:screenOrientation="portrait">', xml, count=1)

manifest_path.write_text(xml)
print("manifest patched")

if gradle_path.exists():
    gradle = gradle_path.read_text()
    if "minSdkVersion" in gradle and "minSdkVersion 24" not in gradle:
        gradle = re.sub(r"minSdkVersion\s+rootProject\.ext\.minSdkVersion", "minSdkVersion 24", gradle)
        gradle = re.sub(r"minSdkVersion\s+\d+", "minSdkVersion 24", gradle)
    if "packagingOptions" not in gradle:
        gradle += "\nandroid {\n    packagingOptions {\n        resources.excludes += ['/META-INF/*.kotlin_module']\n    }\n}\n"
    gradle_path.write_text(gradle)
    print("gradle patched")

if strings_path.exists():
    text = strings_path.read_text()
    text = re.sub(r"<string name=\"app_name\">.*?</string>", '<string name="app_name">Nora Tunnel</string>', text)
    strings_path.write_text(text)
    print("strings patched")
PY

chmod +x "$ROOT/android/gradlew" || true
echo "android project ready"
