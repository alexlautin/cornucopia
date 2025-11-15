import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

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
          marginBottom: Platform.OS === 'ios' ? 0 : 0,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarStyle: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 70,
          borderRadius: 0,
          borderTopWidth: 0,
          paddingBottom: Platform.OS === 'ios' ? 18 : 12,
          paddingTop: Platform.OS === 'ios' ? 10 : 8,
          justifyContent: 'center',
          backgroundColor: 'transparent',
          shadowColor: '#00000030',
          shadowOpacity: 1,
          shadowOffset: { width: 0, height: -1 },
          shadowRadius: 8,
          elevation: 12,
          overflow: 'hidden',
        },
        tabBarBackground: () => (
          <BlurView
            pointerEvents="none"
            tint={colorScheme === 'dark' ? 'dark' : 'light'}
            intensity={65}
            style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.8)' }}
          />
        ),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Map',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="map.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="eligibility"
        options={{
          title: 'Eligibility',
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={26}
              name="checkmark.circle.fill"
              color={color}
              style={{ marginLeft: 10 }}
            />
          ),
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 0.2,
            textAlign: 'center',
            marginTop: 0,
            transform: [{ translateX: -4 }],
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
          title: 'Settings',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="gearshape.fill" color={color} />,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 0.2,
            textAlign: 'center',
            transform: [{ translateX: -6 }],
          },
        }}
      />
      <Tabs.Screen
        name="signin"
        options={{
          href: null, // Hide from tab bar
        }}
      />
    </Tabs>
  );
}
