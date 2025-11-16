import { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import * as Haptics from "expo-haptics";
import { Platform, StyleSheet } from "react-native";

import { useColorScheme } from "@/hooks/use-color-scheme";

export function HapticTab(props: BottomTabBarButtonProps) {
  const colorScheme = useColorScheme();
  const pressedBackground =
    colorScheme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)";
  const pressedBorder =
    colorScheme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(59,130,246,0.15)";

  return (
    <PlatformPressable
      {...props}
      style={[styles.base, props.style as any]}
      onPressIn={(ev) => {
        // Use runtime platform check for haptics
        if (Platform.OS === "ios" || Platform.OS === "android") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
            () => {}
          );
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    overflow: "hidden",
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
