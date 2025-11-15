import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { clearCache } from '@/utils/cache';
import { clearOSMMemoryCache } from '@/utils/osm-api';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { setForcedColorScheme } from '@/hooks/use-theme-color';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';

export default function SettingsScreen() {
  const [clearing, setClearing] = useState(false);
  const systemScheme = useColorScheme() ?? 'light';
  const [appearance, setAppearance] = useState<'system' | 'light' | 'dark'>('system');

  const handleRefreshData = async () => {
    Alert.alert(
      'Refresh Data',
      'This will clear all cached location data and fetch fresh results on your next visit to the Home or Map screen.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Refresh',
          onPress: async () => {
            setClearing(true);
            try {
              // Clear in-memory caches first, then persistent storage
              clearOSMMemoryCache();
              await clearCache();
              Alert.alert('Success', 'Cache cleared! Fresh data will load next time.');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear cache. Please try again.');
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  };

  const applyAppearance = (mode: 'system' | 'light' | 'dark') => {
    setAppearance(mode);
    if (mode === 'system') setForcedColorScheme(undefined);
    else setForcedColorScheme(mode);
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.header}>
        Settings
      </ThemedText>

      {/* Appearance */}
      <ThemedView style={styles.section}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Appearance
        </ThemedText>
        <ThemedText style={styles.infoText}>System: {systemScheme}</ThemedText>
        <ThemedView style={styles.appearanceRow}>
          <Pressable
            onPress={() => applyAppearance('system')}
            style={[styles.appearanceBtn, appearance === 'system' && styles.appearanceBtnActive]}
          >
            <ThemedText style={[styles.appearanceText, appearance === 'system' && styles.appearanceTextActive]}>
              System
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => applyAppearance('light')}
            style={[styles.appearanceBtn, appearance === 'light' && styles.appearanceBtnActive]}
          >
            <ThemedText style={[styles.appearanceText, appearance === 'light' && styles.appearanceTextActive]}>
              Light
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => applyAppearance('dark')}
            style={[styles.appearanceBtn, appearance === 'dark' && styles.appearanceBtnActive]}
          >
            <ThemedText style={[styles.appearanceText, appearance === 'dark' && styles.appearanceTextActive]}>
              Dark
            </ThemedText>
          </Pressable>
        </ThemedView>
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Data Management
        </ThemedText>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            clearing && styles.buttonDisabled,
          ]}
          onPress={handleRefreshData}
          disabled={clearing}
        >
          {clearing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <ThemedText style={styles.buttonText}>🔄 Refresh Location Data</ThemedText>
              <ThemedText style={styles.buttonSubtext}>
                Clear cache and fetch fresh results
              </ThemedText>
            </>
          )}
        </Pressable>

        <ThemedView style={styles.infoCard}>
          <ThemedText style={styles.infoTitle}>About Data Caching</ThemedText>
          <ThemedText style={styles.infoText}>
            Location data is cached for 24 hours to provide faster load times and reduce API
            requests. Use the refresh button above if you want to fetch the latest information.
          </ThemedText>
        </ThemedView>
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          About
        </ThemedText>
        <ThemedView style={styles.infoCard}>
          <ThemedText style={styles.infoText}>
            Cornucopia helps you find food assistance near you using OpenStreetMap data.
          </ThemedText>
          <ThemedText style={[styles.infoText, { marginTop: 8 }]}>Version 1.0.0</ThemedText>
        </ThemedView>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 60,
  },
  header: {
    marginBottom: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  appearanceRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  appearanceBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: 'transparent',
  },
  appearanceBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  appearanceText: {
    color: '#374151',
    fontWeight: '600',
  },
  appearanceTextActive: {
    color: '#ffffff',
  },
  button: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    backgroundColor: '#93c5fd',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSubtext: {
    color: '#ffffff',
    fontSize: 12,
    opacity: 0.9,
    marginTop: 4,
  },
  infoCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  infoTitle: {
    fontWeight: '600',
    marginBottom: 8,
  },
  infoText: {
    opacity: 0.8,
    lineHeight: 20,
  },
});
