# NORA TUNNEL — real Android APK

This is not a webview wrapper. The APK contains the **upstream sing-box core**
(`lib/arm64-v8a/libbox.so`, 78.7 MiB uncompressed) compiled from
`SagerNet/sing-box` source with gomobile, plus a real `android.net.VpnService`
that creates the TUN interface, runs the core inside it, and reports the core's own
traffic totals back to this control plane.

## Verified artifact in this repository

| fact | value |
| --- | --- |
| file | `public/nora-tunnel-debug.apk` |
| size | 29,726,700 bytes (28.3 MiB) |
| sha256 | printed on the **APK & Phone** screen (`/apk`) and by `sha256sum` |
| package | `com.nora.tunnel` · versionName `1.0.0` |
| sdk | minSdk 24 (Android 7.0+) · targetSdk 34 |
| abi | arm64-v8a |
| core | sing-box v1.14.2 (gomobile, NDK r28c, Go 1.27, sagernet gomobile fork 0.1.13) |
| signing | debug keystore — fine for sideloading, use a release key for distribution |

Verify the download before installing:

```bash
sha256sum nora-tunnel-debug.apk      # must match the value on /apk
unzip -l nora-tunnel-debug.apk | grep libbox.so
```

## What actually works on the phone

* Real VPN interface through `VpnService` (Android shows its own permission prompt).
* Real protocol stack, executed by sing-box: VLESS (including XTLS-Reality), VMess,
  Trojan, Shadowsocks, Hysteria2, TUIC and WireGuard.
* Real routing: the per-app split tunnel and rule table compiled by this control
  plane are applied by the core (`include_package` / `exclude_package` and route rules).
* Real counters: upload/download totals come from the core's status channel — not
  estimated, not faked. The dashboard switches to these numbers and labels them
  «device-reported».
* Real logs from the core, a foreground notification with live state, a Quick
  Settings tile, and boot auto-start.
* If the core refuses a configuration, or the TUN cannot be established, the app
  reports the error and stops. It never shows a green «connected» it cannot prove.

OpenVPN is the one protocol it will not pretend to support: that needs the openvpn3
core, which is not bundled, so the client refuses to start such a profile and says why.

## Build it yourself

### 1. Compile the real core (once)

Needs Go 1.27+, JDK 17, Android SDK (platform 34, build-tools 34) and NDK r26+.

```bash
export ANDROID_HOME=/path/to/android-sdk
export ANDROID_NDK_HOME=$ANDROID_HOME/ndk/28.2.13676358
bash android-native/scripts/build-libbox.sh v1.14.2
```

The script installs the gomobile fork sing-box expects, clones the upstream source,
and runs the exact `gomobile bind` used for the artifact above
(`-target android/arm64 -androidapi 24 -javapkg=io.nekohasekai -libname=box`, with
`with_gvisor,with_quic,with_wireguard,with_utls,with_clash_api…` and
`-checklinkname=0`, which upstream also sets).

### 2. Assemble and publish the APK

```bash
export ANDROID_HOME=/path/to/android-sdk
bash android-native/scripts/build-apk.sh
```

This runs `gradlew assembleDebug`, copies the APK to `public/nora-tunnel-debug.apk`
(so the web app serves it with a real SHA-256 on `/apk`) and prints the native
library list as proof the core is inside.

### 3. Push → GitHub Actions → phone

Push the repository, then run the **Build Nora Tunnel APK** workflow
(Actions → Run workflow). It installs JDK 17, Go, the Android SDK + NDK, compiles
the core when `libbox.aar` is absent or `rebuild_core=true`, assembles the APK,
asserts that `libbox.so` and the app classes are really inside it, uploads the
artifact, and attaches it to a release on `main`.

```bash
gh workflow run build-apk.yml
gh run download --name nora-tunnel-apk
adb install -r nora-tunnel-debug.apk
```

## First run on the phone

1. Install the APK and open **Nora Tunnel**.
2. Paste your workspace URL (the address this web app is served from) and tap
   **Test** — it hits `/api/health` for real.
3. Tap **Fetch profiles**: the app calls `/api/device/profiles` and lists what the
   control plane validated.
4. Pick a profile, tap **Connect**, and accept Android's VPN permission prompt.
5. The app requests `/api/device/config?id=<profile>`; the server compiles the
   sing-box document from the stored profile and the workspace routing table.
6. While connected the app streams real counters and a log tail to
   `/api/device/report` every 15 seconds, so the web dashboard shows measured
   numbers under the «device-reported» label.

## Notes and limits

* arm64-v8a only. For 32-bit or emulator builds, add ABIs to the `gomobile bind`
  `-target` list and to `abiFilters` in `android-native/app/build.gradle`.
* The APK is debug-signed for sideloading. For Play distribution, add a release
  keystore and remove `signingConfig signingConfigs.debug`.
* No custom cryptography exists anywhere in this project: the app configures
  upstream cores (sing-box here; openvpn3 would be the same pattern) and nothing else.
