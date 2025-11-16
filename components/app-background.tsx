import { LinearGradient } from "expo-linear-gradient";
import { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";

import { useColorScheme } from "@/hooks/use-color-scheme";

export function AppBackground({ children }: PropsWithChildren) {
  const colorScheme = useColorScheme();
  const palette = colorScheme === "dark" ? darkPalette : lightPalette;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={palette.base}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  spot: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.4,
  },
  glow: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 210,
    opacity: 0.3,
  },
});

const lightPalette = {
  base: ["#f6fbff", "#ffffff"] as const,
};

const darkPalette = {
  base: ["#060b1a", "#10162a"] as const,
};
