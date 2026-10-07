import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ANDROID_APP } from "@/lib/android-meta";
import type { BuildStep, LanAddress, ScaffoldFile, UrlCheck } from "@/lib/android-meta";

export type { BuildStep, LanAddress, ScaffoldFile, UrlCheck };
export { ANDROID_APP };

const SCAFFOLD_FILES: { path: string; language: string; purpose: string }[] = [
  { path: "ANDROID-APK.md", language: "md", purpose: "Verified artifact facts, install steps and the exact build commands." },
  { path: ".github/workflows/build-apk.yml", language: "yaml", purpose: "CI: compiles the real core, assembles the APK, proves libbox.so is inside, uploads it." },
  { path: "android-native/scripts/build-libbox.sh", language: "bash", purpose: "Compiles the upstream sing-box core (libbox.aar) with gomobile." },
  { path: "android-native/scripts/build-apk.sh", language: "bash", purpose: "Gradle assembleDebug + publish the APK into public/ for download." },
  { path: "android-native/app/build.gradle", language: "gradle", purpose: "App module: minSdk 24, arm64-v8a, libbox.aar dependency, debug signing." },
  { path: "android-native/app/src/main/java/com/nora/tunnel/NoraVpnService.java", language: "java", purpose: "Real VpnService: builds the TUN, runs the core, samples real counters, reports them." },
  { path: "android-native/app/src/main/java/com/nora/tunnel/TunnelCore.java", language: "java", purpose: "libbox bridge: setup, config check, service start/reload/stop, status channel." },
  { path: "android-native/app/src/main/java/com/nora/tunnel/NoraPlatformInterface.java", language: "java", purpose: "Returns the VpnService file descriptor to the core and answers its platform calls." },
  { path: "android-native/app/src/main/java/com/nora/tunnel/ControlPlane.java", language: "java", purpose: "Fetches validated configs and posts measured telemetry back to this server." },
  { path: "src/lib/device.ts", language: "ts", purpose: "Server side: compiles a stored profile + routing table into the sing-box document." },
];

export async function readScaffold(): Promise<ScaffoldFile[]> {
  const root = process.cwd();
  const files: ScaffoldFile[] = [];
  for (const entry of SCAFFOLD_FILES) {
    try {
      const content = await readFile(path.join(root, entry.path), "utf8");
      files.push({ ...entry, content });
    } catch {
      files.push({ ...entry, content: `// ${entry.path} is missing from this checkout.` });
    }
  }
  return files;
}

export function lanAddresses(port: number, scheme = "http"): LanAddress[] {
  const interfaces = os.networkInterfaces();
  const results: LanAddress[] = [];
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal) continue;
      results.push({
        name,
        address: address.address,
        suggestedUrl: `${scheme}://${address.address}:${port}`,
      });
    }
  }
  return results;
}

export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host)) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return true;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/** Checks whether a phone on the same network could plausibly open this URL. */
export async function checkWorkspaceUrl(rawUrl: string): Promise<UrlCheck> {
  const warnings: string[] = [];
  const hints: string[] = [];
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return {
      ok: false,
      normalized: rawUrl,
      host: "",
      port: "",
      durationMs: 0,
      reachable: false,
      warnings: ["Not a valid URL. Use the full address including scheme, e.g. https://nora.example.com"],
      hints: [],
    };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    warnings.push("Only http and https URLs can be wrapped by the Android shell.");
  }

  const privateHost = isPrivateHost(url.hostname);
  if (privateHost) {
    warnings.push(
      `${url.hostname} is a private/loopback address. A phone can only reach it on the same Wi-Fi, and localhost inside the APK points at the phone itself — never at your dev machine.`,
    );
    hints.push("Deploy the workspace somewhere public (Vercel, a VPS, a Cloudflare tunnel) and rebuild the APK with that URL.");
  }

  const start = performance.now();
  let status: number | undefined;
  let server: string | undefined;
  let title: string | undefined;
  let reachable = false;

  try {
    const response = await fetch(url.toString(), { method: "GET", redirect: "follow", signal: AbortSignal.timeout(7000) });
    status = response.status;
    server = response.headers.get("server") ?? undefined;
    const body = await response.text();
    const match = body.match(/<title>([^<]*)<\/title>/i);
    if (match) title = match[1];
    reachable = status < 500;
  } catch (error) {
    warnings.push(`Request failed from the control plane: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  if (!url.pathname || url.pathname === "/") {
    hints.push("Root path detected — Nora Tunnel serves the dashboard at /, which is what the shell should open.");
  }
  if (url.protocol === "https:") {
    hints.push("HTTPS detected: the shell will validate the certificate normally, and cleartext is not required.");
  } else if (!privateHost) {
    hints.push("Plain HTTP on a public host: the shell sets android:usesCleartextTraffic when the URL starts with http://, but TLS is strongly preferred.");
  }

  return {
    ok: true,
    normalized: url.toString(),
    host: url.hostname,
    port: url.port || (url.protocol === "https:" ? "443" : "80"),
    status,
    durationMs: Math.round(performance.now() - start),
    reachable,
    warnings,
    hints,
    server,
    title,
  };
}

export function buildSteps(workspaceUrl: string): BuildStep[] {
  return [
    {
      title: "Push the repository to GitHub",
      detail: "The native project, the compiled core and the CI workflow are committed; pushing is all that is left.",
      command: `git init\ngit add .\ngit commit -m "NORA TUNNEL control plane + real Android client"\ngit branch -M main\ngit remote add origin https://github.com/<you>/<repo>.git\ngit push -u origin main`,
    },
    {
      title: "Run the APK workflow with your workspace URL",
      detail: `Actions → "${ANDROID_APP.workflow}" → Run workflow. Set rebuild_core=true to recompile the core from source in CI.`,
      command: `gh workflow run build-apk.yml -f rebuild_core=false`,
    },
    {
      title: "Download the artifact",
      detail: `The job asserts libbox.so is inside the APK, uploads it as an artifact, and attaches it to a release on main.`,
      command: `gh run list --workflow=build-apk.yml\ngh run download --name nora-tunnel-apk`,
    },
    {
      title: "Install on the phone",
      detail: "Open the APK on the device and allow installs from your browser, or use adb over USB.",
      command: `${ANDROID_APP.installCommand}`,
    },
    {
      title: "Rebuild everything locally",
      detail: "JDK 17 + Android SDK (platform 34, build-tools 34) + NDK r26+ and Go 1.27.",
      command: `export ANDROID_HOME=/path/to/android-sdk\nexport ANDROID_NDK_HOME=$ANDROID_HOME/ndk/28.2.13676358\nbash android-native/scripts/build-libbox.sh v1.14.2\nbash android-native/scripts/build-apk.sh`,
    },
  ];
}
