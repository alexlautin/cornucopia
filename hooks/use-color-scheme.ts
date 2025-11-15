import { useColorScheme as useRNColorScheme } from 'react-native';

export function useColorScheme(): 'light' {
  // Force light mode across the app regardless of system preference.
  useRNColorScheme();
  return 'light';
}
