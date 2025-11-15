import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
import { StyleSheet } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

export function HapticTab(props: BottomTabBarButtonProps) {
  const colorScheme = useColorScheme();
  const pressedBackground =
    colorScheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  const pressedBorder =
    colorScheme === 'dark' ? 'rgba(255,255,255,0.25)' : 'rgba(59,130,246,0.2)';

  return (
    <PlatformPressable
      {...props}
      style={(state) => {
        const incoming = typeof props.style === 'function' ? props.style(state) : props.style;
        return [
          styles.base,
          state.pressed && {
            backgroundColor: pressedBackground,
            borderColor: pressedBorder,
            transform: [{ scale: 0.97 }],
          },
          incoming,
        ];
      }}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios') {
          // Soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
});
