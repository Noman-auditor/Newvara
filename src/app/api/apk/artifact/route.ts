import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ANDROID_APP } from "@/lib/android-meta";

export const dynamic = "force-dynamic";

let cached: { mtimeMs: number; sha256: string } | null = null;

/**
 * Reports the APK that was actually assembled in this workspace: real byte size,
 * real SHA-256, real build time. If no artifact was built yet the route says so
 * instead of pointing at a placeholder.
 */
export async function GET() {
  const file = path.join(process.cwd(), "public", ANDROID_APP.artifact);
  try {
    const info = await stat(file);
    if (!cached || cached.mtimeMs !== info.mtimeMs) {
      const buffer = await readFile(file);
      cached = { mtimeMs: info.mtimeMs, sha256: createHash("sha256").update(buffer).digest("hex") };
    }
    return Response.json({
      ok: true,
      available: true,
      artifact: ANDROID_APP.artifact,
      url: `/${ANDROID_APP.artifact}`,
      bytes: info.size,
      sha256: cached.sha256,
      builtAt: info.mtime.toISOString(),
      appId: ANDROID_APP.appId,
      versionName: ANDROID_APP.versionName,
      minSdk: ANDROID_APP.minSdk,
      targetSdk: ANDROID_APP.targetSdk,
      abi: ANDROID_APP.abi,
      core: ANDROID_APP.core,
      coreProvenance: ANDROID_APP.coreProvenance,
      nativeLibraryBytes: ANDROID_APP.nativeLibraryBytes,
      signing: ANDROID_APP.signing,
    });
  } catch {
    return Response.json(
      {
        ok: true,
        available: false,
        artifact: ANDROID_APP.artifact,
        hint:
          "Run the Android build (GitHub Actions workflow or `bash scripts/build-apk.sh`) — it compiles the real sing-box core with gomobile, then assembles the APK into public/.",
      },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
