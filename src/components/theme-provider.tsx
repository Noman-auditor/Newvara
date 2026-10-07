"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { hexToRgb, rgba } from "@/lib/color";

export { hexToRgb, rgba };

export type Appearance = {
  accentHex: string;
  accent2Hex: string;
  accent3Hex: string;
  glassBlur: number;
  glassAlpha: number;
  auroraIntensity: number;
  gridOpacity: number;
  radiusScale: string;
  density: string;
  fontFamily: string;
  bgPattern: string;
  motionLevel: string;
  presetName: string;
};

export type ThemePreset = {
  name: string;
  emoji: string;
  theme: "dark" | "light";
  values: Partial<Appearance>;
};

export const DEFAULT_APPEARANCE: Appearance = {
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

export const ACCENT_PALETTE = [
  "#8b5cf6", "#22d3ee", "#34d399", "#fbbf24", "#fb7185",
  "#60a5fa", "#a78bfa", "#f472b6", "#2dd4bf", "#f97316",
];

export const THEME_PRESETS: ThemePreset[] = [
  {
    name: "Nora Violet",
    emoji: "🟣",
    theme: "dark",
    values: { accentHex: "#8b5cf6", accent2Hex: "#22d3ee", accent3Hex: "#f472b6", glassBlur: 18, glassAlpha: 5, auroraIntensity: 55, gridOpacity: 70, radiusScale: "default", density: "comfortable", fontFamily: "sans", bgPattern: "grid", motionLevel: "full" },
  },
  {
    name: "Cyber Terminal",
    emoji: "🟢",
    theme: "dark",
    values: { accentHex: "#34d399", accent2Hex: "#22d3ee", accent3Hex: "#a3e635", glassBlur: 8, glassAlpha: 4, auroraIntensity: 30, gridOpacity: 90, radiusScale: "sharp", density: "compact", fontFamily: "mono", bgPattern: "grid", motionLevel: "calm" },
  },
  {
    name: "Ice Nordic",
    emoji: "❄️",
    theme: "light",
    values: { accentHex: "#2563eb", accent2Hex: "#0ea5e9", accent3Hex: "#0891b2", glassBlur: 24, glassAlpha: 7, auroraIntensity: 35, gridOpacity: 45, radiusScale: "round", density: "comfortable", fontFamily: "grotesk", bgPattern: "dots", motionLevel: "full" },
  },
  {
    name: "Sunset Amber",
    emoji: "🌅",
    theme: "dark",
    values: { accentHex: "#fbbf24", accent2Hex: "#fb7185", accent3Hex: "#f97316", glassBlur: 14, glassAlpha: 6, auroraIntensity: 70, gridOpacity: 50, radiusScale: "round", density: "roomy", fontFamily: "display", bgPattern: "mesh", motionLevel: "full" },
  },
  {
    name: "Rose Quartz",
    emoji: "🌸",
    theme: "light",
    values: { accentHex: "#db2777", accent2Hex: "#a855f7", accent3Hex: "#f0abfc", glassBlur: 20, glassAlpha: 8, auroraIntensity: 45, gridOpacity: 40, radiusScale: "round", density: "comfortable", fontFamily: "grotesk", bgPattern: "mesh", motionLevel: "full" },
  },
  {
    name: "Retro CRT",
    emoji: "📼",
    theme: "dark",
    values: { accentHex: "#22c55e", accent2Hex: "#eab308", accent3Hex: "#ef4444", glassBlur: 4, glassAlpha: 3, auroraIntensity: 15, gridOpacity: 100, radiusScale: "sharp", density: "compact", fontFamily: "mono", bgPattern: "diagonal", motionLevel: "off" },
  },
  {
    name: "Deep Ocean",
    emoji: "🌊",
    theme: "dark",
    values: { accentHex: "#0ea5e9", accent2Hex: "#2dd4bf", accent3Hex: "#6366f1", glassBlur: 26, glassAlpha: 7, auroraIntensity: 80, gridOpacity: 35, radiusScale: "default", density: "comfortable", fontFamily: "sans", bgPattern: "mesh", motionLevel: "calm" },
  },
  {
    name: "Paper Notebook",
    emoji: "📄",
    theme: "light",
    values: { accentHex: "#b45309", accent2Hex: "#0f766e", accent3Hex: "#7c2d12", glassBlur: 6, glassAlpha: 9, auroraIntensity: 12, gridOpacity: 100, radiusScale: "compact", density: "roomy", fontFamily: "display", bgPattern: "grid", motionLevel: "calm" },
  },
];

export function mixHex(a: string, b: string, ratio = 0.5): string {
  const first = hexToRgb(a);
  const second = hexToRgb(b);
  const channel = (x: number, y: number) => Math.round(x * (1 - ratio) + y * ratio);
  return `#${[channel(first.r, second.r), channel(first.g, second.g), channel(first.b, second.b)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

type ThemeApi = {
  appearance: Appearance;
  themeMode: "dark" | "light";
  dirty: boolean;
  saving: boolean;
  update: (patch: Partial<Appearance>) => void;
  setThemeMode: (mode: "dark" | "light") => void;
  applyPreset: (preset: ThemePreset) => void;
  save: () => Promise<void>;
  reset: () => void;
};

const ThemeContext = createContext<ThemeApi>({
  appearance: DEFAULT_APPEARANCE,
  themeMode: "dark",
  dirty: false,
  saving: false,
  update: () => undefined,
  setThemeMode: () => undefined,
  applyPreset: () => undefined,
  save: async () => undefined,
  reset: () => undefined,
});

export function useTheme() {
  return useContext(ThemeContext);
}

/** Applies appearance tokens to <html> instantly and persists them on demand. */
function applyToDocument(appearance: Appearance, themeMode: "dark" | "light") {
  const root = document.documentElement;
  root.dataset.theme = themeMode;
  root.dataset.radius = appearance.radiusScale;
  root.dataset.density = appearance.density;
  root.dataset.font = appearance.fontFamily;
  root.dataset.pattern = appearance.bgPattern;
  root.dataset.motion = appearance.motionLevel;
  root.style.setProperty("--accent", appearance.accentHex);
  root.style.setProperty("--accent-2", appearance.accent2Hex);
  root.style.setProperty("--accent-3", appearance.accent3Hex);
  root.style.setProperty("--accent-soft", rgba(appearance.accentHex, 0.16));
  root.style.setProperty("--accent-glow", rgba(appearance.accent2Hex, 0.35));
  root.style.setProperty("--glass-blur", `${appearance.glassBlur}px`);
  root.style.setProperty("--glass-alpha", (appearance.glassAlpha / 100).toFixed(3));
  root.style.setProperty("--aurora-opacity", (appearance.auroraIntensity / 100).toFixed(2));
  root.style.setProperty("--grid-opacity", (appearance.gridOpacity / 100).toFixed(2));
  root.style.setProperty("--glow", `0 0 0 1px rgba(255,255,255,0.04), 0 18px 60px -20px ${appearance.accentHex}`);
}

export function ThemeProvider({
  initialAppearance,
  initialTheme,
  children,
}: {
  initialAppearance: Appearance;
  initialTheme: "dark" | "light";
  children: ReactNode;
}) {
  const [appearance, setAppearance] = useState<Appearance>(initialAppearance);
  const [themeMode, setThemeModeState] = useState<"dark" | "light">(initialTheme);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    applyToDocument(appearance, themeMode);
  }, [appearance, themeMode]);

  const update = useCallback((patch: Partial<Appearance>) => {
    setAppearance((current) => ({ ...current, ...patch, presetName: patch.presetName ?? "Custom" }));
    setDirty(true);
  }, []);

  const setThemeMode = useCallback((mode: "dark" | "light") => {
    setThemeModeState(mode);
    setDirty(true);
  }, []);

  const applyPreset = useCallback((preset: ThemePreset) => {
    setAppearance((current) => ({ ...current, ...preset.values, presetName: preset.name }));
    setThemeModeState(preset.theme);
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...appearance, theme: themeMode }),
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [appearance, themeMode]);

  const reset = useCallback(() => {
    setAppearance(DEFAULT_APPEARANCE);
    setThemeModeState("dark");
    setDirty(true);
  }, []);

  const api = useMemo(
    () => ({ appearance, themeMode, dirty, saving, update, setThemeMode, applyPreset, save, reset }),
    [appearance, themeMode, dirty, saving, update, setThemeMode, applyPreset, save, reset],
  );

  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

/** Inline SSR style block so the first paint already carries the saved tokens. */
export function appearanceStyleTag(appearance: Appearance, theme: string) {
  const css = `:root{--accent:${appearance.accentHex};--accent-2:${appearance.accent2Hex};--accent-3:${appearance.accent3Hex};--accent-soft:${rgba(appearance.accentHex, 0.16)};--glass-blur:${appearance.glassBlur}px;--glass-alpha:${(appearance.glassAlpha / 100).toFixed(3)};--aurora-opacity:${(appearance.auroraIntensity / 100).toFixed(2)};--grid-opacity:${(appearance.gridOpacity / 100).toFixed(2)}}`;
  return { css, theme };
}
