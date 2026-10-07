/** Pure Android shell metadata — safe to import from client components. */
export const ANDROID_APP = {
  appId: "com.nora.tunnel",
  appName: "Nora Tunnel",
  versionName: "1.0.0",
  minSdk: 24,
  minAndroid: "Android 7.0+",
  targetSdk: "34 (Android 14)",
  jdk: 17,
  abi: "arm64-v8a",
  artifact: "nora-tunnel-debug.apk",
  workflow: "Build Nora Tunnel APK",
  workflowFile: ".github/workflows/build-apk.yml",
  gradleTask: "assembleDebug",
  installCommand: "adb install -r nora-tunnel-debug.apk",
  core: "sing-box v1.14.2",
  coreProvenance: "compiled from SagerNet/sing-box source with gomobile (sagernet fork 0.1.13, NDK r28c, Go 1.27)",
  nativeLibraryBytes: 78_734_800,
  signing: "debug keystore (sideload). Configure a release keystore for distribution.",
} as const;

export type ScaffoldFile = {
  path: string;
  content: string;
  language: string;
  purpose: string;
};

export type LanAddress = { name: string; address: string; suggestedUrl: string | null };

export type UrlCheck = {
  ok: boolean;
  normalized: string;
  host: string;
  port: string;
  status?: number;
  durationMs: number;
  reachable: boolean;
  warnings: string[];
  hints: string[];
  server?: string;
  title?: string;
};

export type BuildStep = { title: string; detail: string; command: string };
