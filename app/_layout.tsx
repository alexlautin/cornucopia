import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
            title: '',
          }}
        />
        <Stack.Screen
          name="option/[id]"
          options={({ route }) => {
            const params = route.params as { name?: string } | undefined;
            const rawName = typeof params?.name === 'string' ? params.name : undefined;
            const trimmedName = rawName?.trim();
            const placeName = trimmedName?.length ? trimmedName : undefined;

            return {
              title: placeName ?? 'Location',
              headerBackTitle: '',
              headerBackTitleVisible: false,
            };
          }}
        />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="signin" options={{ title: 'Sign In' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
