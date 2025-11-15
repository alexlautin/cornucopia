import { Alert, Linking, Platform } from 'react-native';

export interface NavigationOptions {
  latitude: number;
  longitude: number;
  address?: string;
  name?: string;
}

export async function openNavigation({ latitude, longitude, address, name }: NavigationOptions) {
  const label = name || address || 'Destination';
  const encodedLabel = encodeURIComponent(label);
  
  // Platform-specific URLs
  const urls = {
    apple: `maps://app?daddr=${latitude},${longitude}&dirflg=d`,
    google: `google.navigation:q=${latitude},${longitude}`,
    googleWeb: `https://maps.google.com/maps?daddr=${latitude},${longitude}&dirflg=d`,
    waze: `waze://?ll=${latitude},${longitude}&navigate=yes`,
    // Generic URL that works on both platforms
    generic: Platform.select({
      ios: `maps://app?daddr=${latitude},${longitude}&dirflg=d`,
      android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodedLabel})`,
      default: `https://maps.google.com/maps?daddr=${latitude},${longitude}&dirflg=d`,
    }),
  };

  // Try to open navigation
  try {
    // First try platform-specific default
    const canOpen = await Linking.canOpenURL(urls.generic!);
    if (canOpen) {
      await Linking.openURL(urls.generic!);
      return;
    }

    // Fallback to web Google Maps
    await Linking.openURL(urls.googleWeb);
  } catch (error) {
    console.error('Error opening navigation:', error);
    Alert.alert(
      'Navigation Error',
      'Could not open navigation app. Please check your maps app is installed.',
      [{ text: 'OK' }]
    );
  }
}

export async function showNavigationOptions({ latitude, longitude, address, name }: NavigationOptions) {
  const label = name || address || 'Location';
  
  const options = [
    {
      title: 'Apple Maps',
      url: `maps://app?daddr=${latitude},${longitude}&dirflg=d`,
    },
    {
      title: 'Google Maps',
      url: `google.navigation:q=${latitude},${longitude}`,
    },
    {
      title: 'Waze',
      url: `waze://?ll=${latitude},${longitude}&navigate=yes`,
    },
  ];

  // Check which apps are available
  const availableOptions = [];
  for (const option of options) {
    try {
      const canOpen = await Linking.canOpenURL(option.url);
      if (canOpen) {
        availableOptions.push(option);
      }
    } catch {
      // Ignore errors
    }
  }

  // Always add web option as fallback
  availableOptions.push({
    title: 'Web Browser',
    url: `https://maps.google.com/maps?daddr=${latitude},${longitude}&dirflg=d`,
  });

  if (availableOptions.length === 1) {
    // Only web browser available, open directly
    await Linking.openURL(availableOptions[0].url);
    return;
  }

  // Show options to user
  Alert.alert(
    'Get Directions',
    `Choose how to navigate to ${label}:`,
    [
      ...availableOptions.map((option) => ({
        text: option.title,
        onPress: () => Linking.openURL(option.url),
      })),
      {
        text: 'Cancel',
        style: 'cancel' as const,
      },
    ]
  );
}
