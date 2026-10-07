import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { getAppearance, getSettings, type Appearance } from "@/lib/store";
import { ThemeProvider } from "@/components/theme-provider";
import { rgba } from "@/lib/color";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#04050c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  applicationName: "Nora Tunnel",
  appleWebApp: { capable: true, title: "Nora Tunnel", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-512.png", apple: "/icons/icon-512.png" },
  title: "NORA TUNNEL · Web Control Plane",
  description:
    "NORA TUNNEL — validation-first tunnel control plane: profile management, routing studio, network diagnostics, honest connection state and security posture.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  let theme = "dark";
  let appearance: Appearance = {
    accentHex: "#8b5cf6",
    accent2Hex: "#22d3ee",
    accent3Hex: "#f472b6",
    glassBlur: 18,
    glassAlpha: 5,
    auroraIntensity: 55,
    gridOpacity: 70,
    radiusScale: "default",
    density: "comfortable",
    fontFamily: "sans",
    bgPattern: "grid",
    motionLevel: "full",
    presetName: "Nora Violet",
  };
  try {
    const [settings, stored] = await Promise.all([getSettings(), getAppearance()]);
    theme = settings.theme === "light" ? "light" : "dark";
    appearance = stored;
  } catch {
    /* database not ready yet — fall back to defaults */
  }

  const bootCss = `:root{--accent:${appearance.accentHex};--accent-2:${appearance.accent2Hex};--accent-3:${appearance.accent3Hex};--accent-soft:${rgba(appearance.accentHex, 0.16)};--glass-blur:${appearance.glassBlur}px;--glass-alpha:${(appearance.glassAlpha / 100).toFixed(3)};--aurora-opacity:${(appearance.auroraIntensity / 100).toFixed(2)};--grid-opacity:${(appearance.gridOpacity / 100).toFixed(2)}}`;

  return (
    <html
      lang="en"
      data-theme={theme}
      data-radius={appearance.radiusScale}
      data-density={appearance.density}
      data-font={appearance.fontFamily}
      data-pattern={appearance.bgPattern}
      data-motion={appearance.motionLevel}
      suppressHydrationWarning
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: bootCss }} />
      </head>
      <body className="antialiased">
        <div className="nora-bg" aria-hidden>
          <span className="aurora" style={{ width: 520, height: 520, left: "-8%", top: "-12%", background: "var(--accent)" }} />
          <span
            className="aurora"
            style={{ width: 420, height: 420, right: "-6%", top: "8%", background: "var(--accent-2)", animationDelay: "-6s" }}
          />
          <span
            className="aurora"
            style={{ width: 620, height: 380, left: "35%", bottom: "-18%", background: "var(--accent-3)", animationDelay: "-12s" }}
          />
        </div>
        <ThemeProvider initialAppearance={appearance} initialTheme={theme === "light" ? "light" : "dark"}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
