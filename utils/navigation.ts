import { Alert, Linking, Platform } from 'react-native';

export interface NavigationOptions {
  latitude: number;
  longitude: number;
  address?: string;
  name?: string;
}

// Helper: build a prioritized list of candidate URLs to try for navigation
function buildNavigationUrls(latitude: number, longitude: number, label: string) {
  const encLabel = encodeURIComponent(label);
  const lat = encodeURIComponent(String(latitude));
  const lon = encodeURIComponent(String(longitude));

  const appleMapsNative = `maps://?daddr=${lat},${lon}`;
  const appleMapsHttp = `http://maps.apple.com/?daddr=${lat},${lon}&q=${encLabel}`;
  const comGoogleMaps = `comgooglemaps://?daddr=${lat},${lon}&directionsmode=driving`;
  const googleNav = `google.navigation:q=${lat},${lon}&mode=d`;
  const googleMapsWeb = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
  const geoIntent = `geo:${lat},${lon}?q=${lat},${lon}(${encLabel})`;
  const waze = `waze://?ll=${lat},${lon}&navigate=yes`;

  // Order candidates by platform preference
  if (Platform.OS === 'ios') {
    return [appleMapsNative, comGoogleMaps, appleMapsHttp, googleMapsWeb, waze];
  } else if (Platform.OS === 'android') {
    return [googleNav, geoIntent, comGoogleMaps, googleMapsWeb, waze];
  } else {
    return [googleMapsWeb, appleMapsHttp, waze];
  }
}

async function tryOpenFirstAvailable(urls: string[]): Promise<boolean> {
  for (const url of urls) {
    try {
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
        return true;
      }
    } catch {
      // ignore and try next
    }
  }

  // As a last resort, try opening the web URL directly without canOpenURL
  const webUrl = urls.find((u) => u.startsWith('http'));
  if (webUrl) {
    try {
      await Linking.openURL(webUrl);
      return true;
    } catch {
      // ignore
    }
  }

  return false;
}

export async function openNavigation({ latitude, longitude, address, name }: NavigationOptions) {
  const label = name || address || 'Destination';
  const candidates = buildNavigationUrls(latitude, longitude, label);

  try {
    const opened = await tryOpenFirstAvailable(candidates);
    if (!opened) {
      throw new Error('No navigation app available');
    }
  } catch (error) {
    console.error('Error opening navigation:', error);
    Alert.alert(
      'Navigation Error',
      'Could not open a native maps app. Opening in browser instead.',
      [{ text: 'OK' }]
    );
    // final fallback to web
    const fallback = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      `${latitude},${longitude}`
    )}`;
    try {
      await Linking.openURL(fallback);
    } catch (err) {
      console.error('Error opening fallback maps URL:', err);
      Alert.alert('Navigation Error', 'Unable to open navigation. Please ensure a maps app or browser is available.');
    }
  }
}

export async function showNavigationOptions({ latitude, longitude, address, name }: NavigationOptions) {
  const label = name || address || 'Location';
  const candidates = buildNavigationUrls(latitude, longitude, label);

  // Map nice titles to a canonical URL to check availability
  const optionMap = [
    { title: 'Apple Maps', url: candidates.find((u) => u.startsWith('maps://') || u.includes('apple')) ?? undefined },
    { title: 'Google Maps (App)', url: candidates.find((u) => u.startsWith('comgooglemaps://') || u.startsWith('google.navigation:')) ?? undefined },
    { title: 'Waze', url: candidates.find((u) => u.startsWith('waze://')) ?? undefined },
    { title: 'Geo Intent', url: candidates.find((u) => u.startsWith('geo:')) ?? undefined },
    { title: 'Web Browser', url: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${latitude},${longitude}`)}` },
  ].filter(Boolean) as { title: string; url?: string }[];

  const available: { title: string; url: string }[] = [];
  for (const opt of optionMap) {
    if (!opt.url) continue;
    try {
      const can = await Linking.canOpenURL(opt.url);
      if (can || opt.title === 'Web Browser') {
        available.push({ title: opt.title, url: opt.url });
      }
    } catch {
      // ignore
    }
  }

  if (available.length === 0) {
    // nothing available — open web fallback directly
    const web = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${latitude},${longitude}`)}`;
    await Linking.openURL(web);
    return;
  }

  if (available.length === 1) {
    await Linking.openURL(available[0].url);
    return;
  }

  Alert.alert(
    'Get Directions',
    `Choose how to navigate to ${label}:`,
    [
      ...available.map((opt) => ({
        text: opt.title,
        onPress: () => {
          Linking.openURL(opt.url).catch((err) => {
            console.error('Failed to open navigation option:', err);
            Alert.alert('Navigation Error', 'Failed to open selected navigation method.');
          });
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]
  );
}
