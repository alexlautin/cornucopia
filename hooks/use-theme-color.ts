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
 * This app only supports light mode now — keep function for compatibility but no-op.
 */
export function setForcedColorScheme(scheme?: 'light' | 'dark') {
  // no-op: app is locked to light mode
  forcedColorScheme = 'light';
}

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  // Always call the system hook to keep hook order stable even when forcing the scheme.
  // We still call it to preserve hook-order, but ignore the value.
  useColorScheme();

  // Always use light theme for colors
  const theme = 'light';
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors.light[colorName];
  }
}
