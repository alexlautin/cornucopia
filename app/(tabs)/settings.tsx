import { clearCache } from '@/utils/cache';
import { clearOSMMemoryCache } from '@/utils/osm-api';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { FlatList } from 'react-native';

export default function SettingsScreen() {
  const [clearing, setClearing] = useState(false);
  const [favorites, setFavorites] = useState<Array<{ id: string; name?: string; address?: string; type?: string; latitude?: number; longitude?: number }>>([]);
  const [loadingFavs, setLoadingFavs] = useState(false);
  const router = useRouter();

  async function loadFavorites() {
    setLoadingFavs(true);
    try {
      const keys = await AsyncStorage.getAllKeys();
      const favKeys = keys.filter((k) => k.startsWith('fav_'));
      if (favKeys.length === 0) {
        setFavorites([]);
        return;
      }

      const items: any[] = [];
      for (const k of favKeys) {
        try {
          const v = await AsyncStorage.getItem(k);
          if (!v) {
            // If value missing, still derive id from key so it can be removed later
            items.push({ id: k.replace(/^fav_/, ''), savedAt: undefined });
            continue;
          }
          try {
            const p = JSON.parse(v);
            if (!p.id) p.id = k.replace(/^fav_/, '');
            items.push(p);
          } catch {
            // legacy marker like '1' or plain string — use key-derived id
            items.push({ id: k.replace(/^fav_/, ''), savedAt: undefined });
          }
        } catch (inner) {
          console.warn('Failed reading fav key', k, inner);
        }
      }

      // Normalize, dedupe by id (keep latest savedAt), sort newest-first
      const byId = new Map<string, any>();
      for (const p of items) {
        if (!p || !p.id) continue;
        const existing = byId.get(String(p.id));
        if (!existing) byId.set(String(p.id), p);
        else if (p.savedAt && (!existing.savedAt || p.savedAt > existing.savedAt)) byId.set(String(p.id), p);
      }

      const parsed = Array.from(byId.values()).map((p) => ({
        id: String(p.id),
        name: p.name,
        address: p.address,
        type: p.type,
        latitude: p.latitude,
        longitude: p.longitude,
        savedAt: p.savedAt,
      }));

      parsed.sort((a: any, b: any) => (b.savedAt || 0) - (a.savedAt || 0));
      setFavorites(parsed);
    } catch (e) {
      console.error('loadFavorites error', e);
    } finally {
      setLoadingFavs(false);
    }
  }

  // reload when screen comes into focus and on mount
  useFocusEffect(
    useCallback(() => {
      void loadFavorites();
    }, [])
  );

  // Navigate with full metadata so the details screen shows name/address immediately
  const openFavorite = (item: { id: string; name?: string; address?: string; type?: string; latitude?: number; longitude?: number }) => {
    router.push({
      pathname: '/option/[id]',
      params: {
        id: item.id,
        ...(item.name ? { name: item.name } : {}),
        ...(item.type ? { type: item.type } : {}),
        ...(item.address ? { address: item.address } : {}),
        ...(typeof item.latitude === 'number' ? { latitude: String(item.latitude) } : {}),
        ...(typeof item.longitude === 'number' ? { longitude: String(item.longitude) } : {}),
      },
    });
  };

  const removeFavorite = (id: string) => {
    Alert.alert('Remove saved place', 'Remove this place from your saved list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await AsyncStorage.removeItem(`fav_${id}`);
            // refresh list after deletion
            void loadFavorites();
          } catch (e) {
            console.error('removeFavorite error', e);
            Alert.alert('Error', 'Failed to remove saved place.');
          }
        },
      },
    ]);
  };

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
              await clearOSMMemoryCache();
              await clearCache();
              Alert.alert('Success', 'Cache cleared! Fresh data will load next time.');
            } catch (err) {
              console.error('Error clearing cache:', err);
              Alert.alert('Error', 'Failed to clear cache. Please try again.');
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.header}>
        Favorites
      </ThemedText>

      <ThemedView style={[styles.section, { marginBottom: 8 }]}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Saved Places
        </ThemedText>

        {loadingFavs ? (
          <ActivityIndicator />
        ) : favorites.length === 0 ? (
          <ThemedText style={{ opacity: 0.7 }}>You have no saved places.</ThemedText>
        ) : (
          <FlatList
            data={favorites}
            keyExtractor={(it) => it.id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => openFavorite(item)}
                style={({ pressed }) => [
                  { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 8, backgroundColor: '#fff' },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <ThemedText type="defaultSemiBold">{item.name ?? item.id}</ThemedText>
                {item.address ? <ThemedText style={{ opacity: 0.75, fontSize: 13 }}>{item.address}</ThemedText> : null}
                <View style={{ flexDirection: 'row', marginTop: 8, justifyContent: 'flex-end' }}>
                  <Pressable onPress={() => openFavorite(item)} style={{ marginRight: 8 }}>
                    <ThemedText style={{ color: '#1a73e8', fontWeight: '600' }}>Open</ThemedText>
                  </Pressable>
                  <Pressable onPress={() => removeFavorite(item.id)}>
                    <ThemedText style={{ color: '#ef4444', fontWeight: '600' }}>Remove</ThemedText>
                  </Pressable>
                </View>
              </Pressable>
            )}
          />
        )}
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
