import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getOpeningHours } from '@/utils/osm-api';

export default function OptionDetailsScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    type?: string;
    address?: string;
    distance?: string;
  }>();

  const name = params.name ?? 'Location';
  const type = params.type ?? '—';
  const address = params.address ?? 'Address not available';
  const distance = params.distance;
  const isOSMData = params.id?.startsWith('osm-') || (params.id && params.id.length > 10);

  const [hours, setHours] = React.useState<string[] | null>(null);
  const [loadingHours, setLoadingHours] = React.useState<boolean>(false);

  React.useEffect(() => {
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
        {isOSMData && (
          <View style={[styles.typeLabel, { backgroundColor: '#10b981', marginLeft: 8 }]}>
            <ThemedText style={styles.typeLabelText}>✓ Real Data</ThemedText>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
          Address
        </ThemedText>
        <ThemedText>{address}</ThemedText>
      </View>

      <View style={styles.card}>
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
      </View>

      <View style={styles.card}>
        <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
          About
        </ThemedText>
        <ThemedText>
          {isOSMData 
            ? 'This location data is sourced from OpenStreetMap, a free and open geographic database maintained by volunteers worldwide.'
            : 'Fresh, accessible food option in your area. More detailed information and hours coming soon.'}
        </ThemedText>
      </View>

      <View style={styles.card}>
        <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
          Details
        </ThemedText>
        <ThemedText>• Type: {type}</ThemedText>
        {distance ? <ThemedText>• Distance: {distance}</ThemedText> : null}
        {isOSMData && <ThemedText>• Data Source: OpenStreetMap</ThemedText>}
      </View>
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
});
