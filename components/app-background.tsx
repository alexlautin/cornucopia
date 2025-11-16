import { LinearGradient } from "expo-linear-gradient";
import { PropsWithChildren } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { Gradients } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type BackgroundVariant = keyof typeof Gradients;

type AppBackgroundProps = PropsWithChildren<{
  variant?: BackgroundVariant;
  contentStyle?: StyleProp<ViewStyle>;
}>;

export function AppBackground({
  children,
  variant,
  contentStyle,
}: AppBackgroundProps) {
  const colorScheme = useColorScheme();
  const key = variant ?? (colorScheme === "dark" ? "midnight" : "daybreak");
  const gradient = Gradients[key] ?? Gradients.daybreak;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={gradient as unknown as string[]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.spot, styles.spotOne]} />
      <View style={[styles.spot, styles.spotTwo]} />
      <View style={[styles.glow, styles.glowOne]} />
      <View style={[styles.glow, styles.glowTwo]} />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  content: {
    flex: 1,
  },
  spot: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 180,
    opacity: 0.5,
    transform: [{ translateX: -60 }],
    backgroundColor: "rgba(124,58,237,0.25)",
  },
  spotOne: {
    top: -120,
    left: -40,
  },
  spotTwo: {
    bottom: -100,
    right: -60,
    backgroundColor: "rgba(37,99,235,0.18)",
    transform: [{ translateX: 60 }],
  },
  glow: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 210,
    opacity: 0.35,
    backgroundColor: "rgba(255,255,255,0.25)",
    transform: [{ rotate: "15deg" }],
  },
  glowOne: {
    top: -160,
    right: 40,
  },
  glowTwo: {
    bottom: -140,
    left: -20,
  },
});
