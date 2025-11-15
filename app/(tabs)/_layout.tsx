import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';

export default function TabLayout() {
  // Force light theme only
  const theme = Colors.light;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.tabIconDefault,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.2,
          textAlign: 'center',
          // slightly more compact labels
          marginBottom: Platform.OS === 'ios' ? 6 : 4,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
        },
        // Floating pill-style tab bar
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: Platform.OS === 'ios' ? 20 : 12,
          height: 72,
          borderRadius: 20,
          borderTopWidth: 0,
          paddingBottom: Platform.OS === 'ios' ? 14 : 10,
          paddingTop: Platform.OS === 'ios' ? 8 : 6,
          justifyContent: 'center',
          backgroundColor: 'transparent',
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowOffset: { width: 0, height: 10 },
          shadowRadius: 20,
          elevation: 18,
          overflow: 'visible',
        },
        // Use a BlurView inside a rounded container so the bar looks lifted
        tabBarBackground: () => (
          <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <BlurView
              pointerEvents="none"
              tint="light"
              intensity={70}
              style={{
                flex: 1,
                marginHorizontal: 0,
                marginVertical: 6,
                borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.85)',
                overflow: 'hidden',
              }}
            />
          </View>
        ),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Map',
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="map.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="eligibility"
        options={{
          title: 'Eligibility',
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={24}
              name="checkmark.circle.fill"
              color={color}
              style={{ marginLeft: 6 }}
            />
          ),
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 0.2,
            textAlign: 'center',
            marginTop: 0,
            transform: [{ translateX: -6 }],
          },
          tabBarItemStyle: {
            alignItems: 'center',
            justifyContent: 'center',
          },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Favorites',
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="heart.fill" color={color} />,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 0.2,
            textAlign: 'center',
            transform: [{ translateX: -10 }],
          },
        }}
      />
    </Tabs>
  );
}
