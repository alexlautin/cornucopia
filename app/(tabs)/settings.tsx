import { AppBackground } from "@/components/app-background";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { clearCache } from "@/utils/cache";
import { clearOSMMemoryCache } from "@/utils/osm-api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [clearing, setClearing] = useState(false);
  const [favorites, setFavorites] = useState<
    Array<{
      id: string;
      name?: string;
      address?: string;
      type?: string;
      latitude?: number;
      longitude?: number;
    }>
  >([]);
  const [loadingFavs, setLoadingFavs] = useState(false);
  const router = useRouter();

  async function loadFavorites() {
    setLoadingFavs(true);
    try {
      const keys = await AsyncStorage.getAllKeys();
      const favKeys = keys.filter((k) => k.startsWith("fav_"));
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
            items.push({ id: k.replace(/^fav_/, ""), savedAt: undefined });
            continue;
          }
          try {
            const p = JSON.parse(v);
            if (!p.id) p.id = k.replace(/^fav_/, "");
            items.push(p);
          } catch {
            // legacy marker like '1' or plain string — use key-derived id
            items.push({ id: k.replace(/^fav_/, ""), savedAt: undefined });
          }
        } catch (inner) {
          console.warn("Failed reading fav key", k, inner);
        }
      }

      // Normalize, dedupe by id (keep latest savedAt), sort newest-first
      const byId = new Map<string, any>();
      for (const p of items) {
        if (!p || !p.id) continue;
        const existing = byId.get(String(p.id));
        if (!existing) byId.set(String(p.id), p);
        else if (
          p.savedAt &&
          (!existing.savedAt || p.savedAt > existing.savedAt)
        )
          byId.set(String(p.id), p);
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
      console.error("loadFavorites error", e);
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
  const openFavorite = (item: {
    id: string;
    name?: string;
    address?: string;
    type?: string;
    latitude?: number;
    longitude?: number;
  }) => {
    router.push({
      pathname: "/option/[id]",
      params: {
        id: item.id,
        ...(item.name ? { name: item.name } : {}),
        ...(item.type ? { type: item.type } : {}),
        ...(item.address ? { address: item.address } : {}),
        ...(typeof item.latitude === "number"
          ? { latitude: String(item.latitude) }
          : {}),
        ...(typeof item.longitude === "number"
          ? { longitude: String(item.longitude) }
          : {}),
      },
    });
  };

  const removeFavorite = (id: string) => {
    Alert.alert(
      "Remove saved place",
      "Remove this place from your saved list?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.removeItem(`fav_${id}`);
              // refresh list after deletion
              void loadFavorites();
            } catch (e) {
              console.error("removeFavorite error", e);
              Alert.alert("Error", "Failed to remove saved place.");
            }
          },
        },
      ]
    );
  };

  const handleRefreshData = async () => {
    Alert.alert(
      "Refresh Data",
      "This will clear all cached location data and fetch fresh results on your next visit to the Home or Map screen.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Refresh",
          onPress: async () => {
            setClearing(true);
            try {
              // Clear in-memory caches first, then persistent storage
              await clearOSMMemoryCache();
              await clearCache();
              Alert.alert(
                "Success",
                "Cache cleared! Fresh data will load next time."
              );
            } catch (err) {
              console.error("Error clearing cache:", err);
              Alert.alert("Error", "Failed to clear cache. Please try again.");
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  };

  return (
    <AppBackground>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: Math.max(24, insets.top + 8) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <ThemedText type="title" style={styles.header}>
            Favorites
          </ThemedText>
          <ThemedText style={styles.heroSubtitle}>
            Pin trusted places so they are one tap away across the app.
          </ThemedText>
        </View>

        <ThemedView style={[styles.sectionCard, { gap: 14 }]}>
          <View style={styles.sectionHeaderRow}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Saved Places
            </ThemedText>
            {loadingFavs ? <ActivityIndicator size="small" /> : null}
          </View>

          {loadingFavs ? null : favorites.length === 0 ? (
            <ThemedText style={styles.emptyState}>
              You have no saved places.
            </ThemedText>
          ) : (
            <View style={styles.favList}>
              {favorites.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => openFavorite(item)}
                  style={({ pressed }) => [
                    styles.favCard,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText type="defaultSemiBold">
                      {item.name ?? item.id}
                    </ThemedText>
                    {item.address ? (
                      <ThemedText style={styles.favAddress}>
                        {item.address}
                      </ThemedText>
                    ) : null}
                    {item.type ? (
                      <ThemedText style={styles.favMeta}>
                        {item.type}
                      </ThemedText>
                    ) : null}
                  </View>
                  <View style={styles.favActions}>
                    <Pressable onPress={() => openFavorite(item)}>
                      <ThemedText style={styles.favActionPrimary}>
                        Open
                      </ThemedText>
                    </Pressable>
                    <Pressable onPress={() => removeFavorite(item.id)}>
                      <ThemedText style={styles.favActionDanger}>
                        Remove
                      </ThemedText>
                    </Pressable>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </ThemedView>

        <ThemedView style={styles.sectionCard}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Data Management
          </ThemedText>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
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
                <ThemedText style={styles.buttonText}>
                  🔄 Refresh Location Data
                </ThemedText>
                <ThemedText style={styles.buttonSubtext}>
                  Clear cache and fetch fresh results
                </ThemedText>
              </>
            )}
          </Pressable>

          <ThemedView style={styles.infoCard}>
            <ThemedText style={styles.infoTitle}>About Data Caching</ThemedText>
            <ThemedText style={styles.infoText}>
              Location data is cached for 24 hours to provide faster load times
              and reduce API requests. Use the refresh button above if you want
              to fetch the latest information.
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.sectionCard}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            About
          </ThemedText>
          <ThemedView style={styles.infoCard}>
            <ThemedText style={styles.infoText}>
              Cornucopia helps you find food assistance near you using
              OpenStreetMap data.
            </ThemedText>
            <ThemedText style={[styles.infoText, { marginTop: 8 }]}>
              Version 1.0.0
            </ThemedText>
          </ThemedView>
        </ThemedView>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingBottom: 120,
    gap: 24,
  },
  hero: {
    gap: 8,
  },
  header: {
    fontSize: 30,
    fontWeight: "700",
    color: "#0f172a",
  },
  heroSubtitle: {
    color: "#475569",
    fontSize: 15,
  },
  sectionCard: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.25)",
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  emptyState: {
    opacity: 0.75,
  },
  favList: {
    gap: 12,
  },
  favCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.3)",
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  favAddress: {
    opacity: 0.75,
    fontSize: 13,
    marginTop: 2,
  },
  favMeta: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  favActions: {
    alignItems: "flex-end",
    gap: 6,
  },
  favActionPrimary: {
    color: "#2563eb",
    fontWeight: "600",
  },
  favActionDanger: {
    color: "#dc2626",
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: "#1d4ed8",
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: "center",
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonSubtext: {
    color: "#e0e7ff",
    fontSize: 12,
    marginTop: 4,
  },
  infoCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.2)",
    backgroundColor: "rgba(15,23,42,0.03)",
    gap: 6,
  },
  infoTitle: {
    fontWeight: "600",
    fontSize: 14,
    color: "#0f172a",
  },
  infoText: {
    opacity: 0.85,
    lineHeight: 20,
  },
});
