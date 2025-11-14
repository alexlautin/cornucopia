import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

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

      <View style={styles.card}>
        <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
          Address
        </ThemedText>
        <ThemedText>{address}</ThemedText>
      </View>

      <View style={styles.card}>
        <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
          Description
        </ThemedText>
        <ThemedText>
          Fresh, accessible food option in your area. More detailed information and hours coming
          soon.
        </ThemedText>
      </View>

      <View style={styles.card}>
        <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
          Details
        </ThemedText>
        <ThemedText>- Type: {type}</ThemedText>
        {distance ? <ThemedText>- Distance: {distance}</ThemedText> : null}
        <ThemedText>- ID: {params.id}</ThemedText>
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
