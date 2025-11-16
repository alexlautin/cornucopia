import { Platform } from "react-native";

const tintColorLight = "#6366f1";
const tintColorDark = "#a5b4fc";

export const Colors = {
  light: {
    text: "#0f172a",
    textMuted: "#475569",
    background: "#f5f7fb",
    card: "rgba(255,255,255,0.92)",
    surface: "rgba(255,255,255,0.75)",
    border: "rgba(15,23,42,0.08)",
    tint: tintColorLight,
    icon: "#475569",
    tabIconDefault: "#94a3b8",
    tabIconSelected: tintColorLight,
    accent: "#7c3aed",
    accentMuted: "#c4b5fd",
    success: "#16a34a",
    warning: "#f97316",
    danger: "#ef4444",
  },
  dark: {
    text: "#f8fafc",
    textMuted: "#cbd5f5",
    background: "#050816",
    card: "rgba(15,23,42,0.8)",
    surface: "rgba(15,23,42,0.7)",
    border: "rgba(148,163,184,0.2)",
    tint: tintColorDark,
    icon: "#cbd5f5",
    tabIconDefault: "#64748b",
    tabIconSelected: tintColorDark,
    accent: "#c084fc",
    accentMuted: "#7c3aed",
    success: "#4ade80",
    warning: "#fb923c",
    danger: "#f87171",
  },
} as const;

export const Radii = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Shadows = {
  soft: {
    shadowColor: "rgba(15,23,42,0.18)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  subtle: {
    shadowColor: "rgba(15,23,42,0.12)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
} as const;

export const Gradients = {
  sunrise: ["#fdf2f8", "#eef2ff", "#ecfeff"] as const,
  daybreak: ["#f4f8ff", "#eef2ff", "#fef6fb"] as const,
  midnight: ["#050816", "#0b1220", "#111927"] as const,
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
