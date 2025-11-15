import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { setForcedColorScheme } from '@/hooks/use-theme-color';
import { openNavigation, showNavigationOptions } from '@/utils/navigation';
import { getOpeningHours } from '@/utils/osm-api';

export default function OptionDetailsScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    type?: string;
    address?: string;
    distance?: string;
    latitude?: string;
    longitude?: string;
  }>();

  const name = params.name ?? 'Location';
  const type = params.type ?? '—';
  const address = params.address ?? 'Address not available';
  const distance = params.distance;
  const latitude = params.latitude ? parseFloat(params.latitude) : undefined;
  const longitude = params.longitude ? parseFloat(params.longitude) : undefined;
  const isOSMData = params.id?.startsWith('osm-') || (params.id && params.id.length > 10);

  // Declare state hooks first (stable order)
  const [hours, setHours] = useState<string[] | null>(null);
  const [loadingHours, setLoadingHours] = useState<boolean>(false);

  // Force light mode while this description/details page is active and mounted
  useEffect(() => {
    setForcedColorScheme('light');
    return () => setForcedColorScheme(undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!params.id) return;
      setLoadingHours(true);
      try {
        const lines = await getOpeningHours(String(params.id));
        if (!cancelled) setHours(lines ?? null);
      } finally {
        if (!cancelled) setLoadingHours(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const handleQuickNavigation = () => {
    if (latitude && longitude) {
      openNavigation({
        latitude,
        longitude,
        address,
        name,
      });
    }
  };

  const handleNavigationOptions = () => {
    if (latitude && longitude) {
      showNavigationOptions({
        latitude,
        longitude,
        address,
        name,
      });
    }
  };

  const canNavigate = latitude !== undefined && longitude !== undefined;

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        {name}
      </ThemedText>
      
      <View style={styles.metaContainer}>
        {distance ? (
          <ThemedText style={styles.distance}>{distance}</ThemedText>
        ) : null}
      </View>
      
      <View style={styles.labelContainer}>
        <View style={styles.typeLabel}>
          <ThemedText style={styles.typeLabelText}>{type}</ThemedText>
        </View>
      </View>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
          Address
        </ThemedText>
        <ThemedText>{address}</ThemedText>
        {canNavigate && (
          <Pressable
            style={styles.addressNavButton}
            onPress={handleQuickNavigation}
          >
            <ThemedText style={styles.addressNavText}>Navigate →</ThemedText>
          </Pressable>
        )}
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
          Hours
        </ThemedText>
        {loadingHours ? (
          <ThemedText style={{ opacity: 0.7 }}>Loading hours…</ThemedText>
        ) : hours && hours.length > 0 ? (
          <View style={{ gap: 4 }}>
            {hours.map((line, idx) => (
              <ThemedText key={`${line}-${idx}`}>• {line}</ThemedText>
            ))}
          </View>
        ) : (
          <ThemedText style={{ opacity: 0.7 }}>Not available</ThemedText>
        )}
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
          About
        </ThemedText>
        <ThemedText>
          Fresh, accessible food option in your area. More detailed information and hours coming soon.
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
          Details
        </ThemedText>
        <ThemedText>• Type: {type}</ThemedText>
        {distance ? <ThemedText>• Distance: {distance}</ThemedText> : null}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 16,
    paddingTop: 24,
  },
  title: {
    marginBottom: 4,
  },
  metaContainer: {
    marginBottom: 4,
  },
  distance: {
    opacity: 0.7,
    fontSize: 16,
  },
  labelContainer: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  typeLabel: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  typeLabelText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    gap: 6,
  },
  addressNavButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  addressNavText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '600',
  },
});
