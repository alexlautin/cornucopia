import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

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
        tabBarShowLabel: false,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.2,
          textAlign: 'center',
        },
        tabBarItemStyle: {
           justifyContent: 'center',
           alignItems: 'center',
           alignSelf: 'center',
        },
         tabBarStyle: {
          borderTopWidth: 0,
          height: 80,
          paddingBottom: Platform.OS === 'ios' ? 20 : 10,
          paddingTop: 10,
         },
        tabBarBackground: () => (
          <BlurView
            tint="light"
            intensity={100}
            style={{
              flex: 1,
              backgroundColor: 'rgba(255,255,255,0.9)',
            }}
          />
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
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="checkmark.circle.fill" color={color} />,
          tabBarItemStyle: {
            justifyContent: 'center',
            alignItems: 'center',
            alignSelf: 'center',
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 0.2,
            textAlign: 'center',
          },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Favorites',
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="heart.fill" color={color} />,
          tabBarItemStyle: {
            justifyContent: 'center',
            alignItems: 'center',
            alignSelf: 'center',
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 0.2,
            textAlign: 'center',
          },
        }}
      />
    </Tabs>
  );
}
