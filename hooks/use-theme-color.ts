/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Allow a programmatic override (used by screens that need to force light/dark)
// Default to light for app-wide forced-light mode
let forcedColorScheme: 'light' | 'dark' | undefined = 'light';

/**
 * Set a forced color scheme for useThemeColor consumers.
 * Pass 'light' | 'dark' to force, or undefined to clear the override.
 */
export function setForcedColorScheme(scheme?: 'light' | 'dark') {
  forcedColorScheme = scheme;
}

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  // Always call the system hook to keep hook order stable even when forcing the scheme.
  const systemScheme = useColorScheme() ?? 'light';
  // Prefer the forced scheme when set; otherwise fall back to system color scheme
  const theme = forcedColorScheme ?? systemScheme;
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}
