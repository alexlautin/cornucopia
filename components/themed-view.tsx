import { BlurView } from 'expo-blur';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  variant?: 'glass' | 'solid';
  intensity?: number;
};

export function ThemedView({
  style,
  lightColor,
  darkColor,
  variant = 'glass',
  intensity,
  ...otherProps
}: ThemedViewProps) {
  const colorScheme = useColorScheme();
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');
  const tint = colorScheme === 'dark' ? 'dark' : 'light';

  if (variant === 'glass') {
    const palette = colorScheme === 'dark' ? glassPalette.dark : glassPalette.light;
    return (
      <BlurView
        intensity={intensity ?? (colorScheme === 'dark' ? 70 : 50)}
        tint={tint}
        style={[styles.glassBase, palette, style]}
        {...otherProps}
      />
    );
  }

  // Fallback to a solid background when explicitly requested.
  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}

const styles = StyleSheet.create({
  glassBase: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
});

const glassPalette = {
  light: {
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderColor: 'rgba(255,255,255,0.25)',
  },
  dark: {
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
};
