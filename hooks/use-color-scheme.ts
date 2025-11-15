<<<<<<< HEAD
// Force light mode globally
export function useColorScheme(): 'light' {
=======
import { useColorScheme as useRNColorScheme } from 'react-native';

export function useColorScheme(): 'light' {
  // Force light mode across the app regardless of system preference.
  useRNColorScheme();
>>>>>>> main
  return 'light';
}
