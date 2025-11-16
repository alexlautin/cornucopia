import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Platform } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";

export default function TabLayout() {
  // Force light theme only
  const theme = Colors.light;

  return (
    <Tabs
      screenOptions={{
        lazy: true,
        freezeOnBlur: true,
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.tabIconDefault,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: false,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.2,
          textAlign: "center",
        },
        tabBarItemStyle: {
          justifyContent: "center",
          alignItems: "center",
          alignSelf: "center",
        },
        tabBarStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          borderTopWidth: 0,
          height: Platform.OS === "ios" ? 86 : 70,
          paddingBottom: Platform.OS === "ios" ? 18 : 10,
          paddingTop: 10,
          borderRadius: 0,
          backgroundColor: "rgba(255,255,255,0.92)",
          borderColor: "rgba(148,163,184,0.16)",
          borderWidth: 0,
          shadowColor: "#0f172a",
          shadowOpacity: 0.04,
          shadowOffset: { width: 0, height: -2 },
          shadowRadius: 12,
          elevation: 6,
        },
        tabBarBackground: () => (
          // keep a transparent background element for compatibility, no visual fill
          <BlurView
            tint="light"
            intensity={35}
            style={{ flex: 1, backgroundColor: "transparent" }}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={22} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Map",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={22} name="map.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={22} name="calendar" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="eligibility"
        options={{
          title: "Eligibility",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={22} name="checkmark.circle.fill" color={color} />
          ),
          tabBarItemStyle: {
            justifyContent: "center",
            alignItems: "center",
            alignSelf: "center",
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
            letterSpacing: 0.2,
            textAlign: "center",
          },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Favorites",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={22} name="heart.fill" color={color} />
          ),
          tabBarItemStyle: {
            justifyContent: "center",
            alignItems: "center",
            alignSelf: "center",
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
            letterSpacing: 0.2,
            textAlign: "center",
          },
        }}
      />
    </Tabs>
  );
}
