import type { CapacitorConfig } from "@capacitor/cli";

/**
 * NORA TUNNEL — Android shell configuration.
 *
 * The APK is a thin, honest wrapper: it needs a reachable NORA TUNNEL control
 * plane URL (this web app) because profiles, routing, logs and telemetry live
 * in PostgreSQL on the server. Set NORA_WEB_URL (or the GitHub Actions
 * `server_url` input) to the address of your deployed workspace.
 *
 * If no URL is set the APK opens the bundled offline shell, which explains the
 * situation instead of pretending to be a working tunnel.
 */
const serverUrl = process.env.NORA_WEB_URL?.trim();

const config: CapacitorConfig = {
  appId: "com.nora.tunnel",
  appName: "Nora Tunnel",
  webDir: "public/capacitor-www",
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith("http://"),
        androidScheme: "https",
      }
    : {
        androidScheme: "https",
      },
};

export default config;
