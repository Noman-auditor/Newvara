#!/usr/bin/env bash
# Compiles the REAL sing-box core (libbox.aar) from upstream source with gomobile.
#
# Verified toolchain: JDK 17, Go 1.27, Android SDK platform 34 + build-tools 34,
# NDK 28.2.13676358, gomobile fork github.com/sagernet/gomobile v0.1.13.
#
# Usage:  bash scripts/build-libbox.sh [sing-box-tag]
set -euo pipefail

TAG="${1:-v1.14.2}"
WORK="${NORATUNNEL_ANDROID_WORK:-$HOME/.nora-android}"
OUT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/app/libs"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 1; }; }
need git
need go
need java
need unzip
[ -n "${ANDROID_HOME:-}" ] || { echo "set ANDROID_HOME to your Android SDK" >&2; exit 1; }
[ -n "${ANDROID_NDK_HOME:-}" ] || { echo "set ANDROID_NDK_HOME to an installed NDK (r26+)" >&2; exit 1; }

mkdir -p "$WORK" "$OUT"
export GOPATH="$WORK/gopath"
export GOCACHE="$WORK/gocache"
export PATH="$(go env GOPATH)/bin:$PATH"

echo "==> installing the gomobile fork sing-box expects"
go install -v github.com/sagernet/gomobile/cmd/gomobile@v0.1.13
go install -v github.com/sagernet/gomobile/cmd/gobind@v0.1.13
gomobile init

echo "==> cloning sing-box $TAG"
if [ ! -d "$WORK/sing-box/.git" ]; then
  git clone --depth 1 --branch "$TAG" https://github.com/SagerNet/sing-box.git "$WORK/sing-box"
fi
cd "$WORK/sing-box"
rm -rf build

echo "==> binding libbox for android/arm64"
gomobile bind -v \
  -o "$OUT/libbox.aar" \
  -target android/arm64,android/arm \
  -androidapi 24 \
  -javapkg=io.nekohasekai \
  -libname=box \
  -trimpath \
  -buildvcs=false \
  -ldflags "-s -w -buildid= -X github.com/sagernet/sing-box/constant.Version=$TAG -X runtime.godebugDefault=multipathtcp=0,tlssha1=1 -checklinkname=0" \
  -tags "with_gvisor,with_quic,with_wireguard,with_utls,with_naive_outbound,with_clash_api,with_usbip,with_openvpn,with_openconnect,badlinkname,tfogo_checklinkname0,with_tailscale,ts_omit_logtail,ts_omit_ssh,ts_omit_drive,ts_omit_taildrop,ts_omit_webclient,ts_omit_doctor,ts_omit_capture,ts_omit_kube,ts_omit_aws,ts_omit_synology,ts_omit_bird,with_low_memory" \
  ./experimental/libbox

ls -la "$OUT/libbox.aar"
echo "==> done. libbox.aar is the real upstream core (no custom cryptography)."
