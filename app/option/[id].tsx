import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Clipboard,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { AppBackground } from "@/components/app-background";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { setForcedColorScheme } from "@/hooks/use-theme-color";
import { openNavigation, showNavigationOptions } from "@/utils/navigation";
import { getOpeningHours } from "@/utils/osm-api";

export default function OptionDetailsScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    type?: string;
    address?: string;
    distance?: string;
    latitude?: string;
    longitude?: string;
    snap?: string;
    price?: string;
  }>();

  const name = params.name ?? "Location";
  const type = params.type ?? "—";
  const address = params.address ?? "Address not available";
  const distance = params.distance;
  const latitude = params.latitude ? parseFloat(params.latitude) : undefined;
  const longitude = params.longitude ? parseFloat(params.longitude) : undefined;
  const snap = params.snap === "true";
  const priceLevel = params.price
    ? Math.max(1, Math.min(3, parseInt(params.price, 10)))
    : undefined;
  const isOSMData =
    params.id?.startsWith("osm-") || (params.id && params.id.length > 10);

  // Declare state hooks first (stable order)
  const [hours, setHours] = useState<string[] | null>(null);
  const [loadingHours, setLoadingHours] = useState<boolean>(false);

  // Favorites state (persisted per place as `fav_{id}`)
  const [isFavorite, setIsFavorite] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    async function loadFavorite() {
      if (!params.id) return;
      try {
        const key = `fav_${params.id}`;
        const v = await AsyncStorage.getItem(key);
        if (cancelled) return;
        if (!v) {
          setIsFavorite(false);
          return;
        }
        // support legacy boolean marker '1' or stored JSON metadata
        try {
          const parsed = JSON.parse(v);
          setIsFavorite(Boolean(parsed && parsed.id));
        } catch {
          setIsFavorite(v === "1");
        }
      } catch {
        // noop
      }
    }
    loadFavorite();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const toggleFavorite = async () => {
    if (!params.id) {
      Alert.alert("Unable to save", "Missing place id");
      return;
    }
    const key = `fav_${params.id}`;
    try {
      if (isFavorite) {
        await AsyncStorage.removeItem(key);
        setIsFavorite(false);
        Alert.alert("Removed", "This place was removed from your saved list.");
      } else {
        // Save compact metadata to show in the list later
        const payload = {
          id: params.id,
          name: name ?? undefined,
          address: address ?? undefined,
          type: type ?? undefined,
          latitude: latitude ?? undefined,
          longitude: longitude ?? undefined,
          savedAt: Date.now(),
        };
        await AsyncStorage.setItem(key, JSON.stringify(payload));
        setIsFavorite(true);
        Alert.alert("Saved", "This place was added to your saved list.");
      }
    } catch (e) {
      console.error("toggleFavorite error", e);
      Alert.alert("Error", "Failed to update favorites.");
    }
  };

  // Force light mode while this description/details page is active and mounted
  useEffect(() => {
    setForcedColorScheme("light");
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

  // --- New: build a concise shareable summary for this place ---
  const formatPlaceShare = () => {
    const parts: string[] = [];
    parts.push(name);
    if (type) parts.push(`Type: ${type}`);
    if (distance) parts.push(`Distance: ${distance}`);
    if (address) parts.push(`Address: ${address}`);
    if (hours && hours.length > 0) parts.push(`Hours: ${hours.join("; ")}`);
    parts.push("", "Found with Cornucopia");
    return parts.join("\n");
  };

  // --- New: share handler with dynamic clipboard fallback ---
  const handleSharePlace = async () => {
    const summary = formatPlaceShare();
    try {
      await Share.share({ title: `Location: ${name}`, message: summary });
      return;
    } catch {
      try {
        Clipboard.setString(summary);
        Alert.alert(
          "Copied to clipboard",
          "Share sheet failed — details copied to clipboard."
        );
        return;
      } catch {
        // ignore
      }

      Alert.alert(
        "Share failed",
        'Unable to open share sheet or copy to clipboard. Tap "Show" to view the summary and copy it manually.',
        [
          {
            text: "Show",
            onPress: () => Alert.alert("Place summary", summary),
          },
          { text: "OK", style: "cancel" },
        ]
      );
    }
  };

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

  // Determine whether there is a usable human-readable address to display.
  const hasUsableAddress = Boolean(
    address &&
      address !== "Address not available" &&
      // treat plain coordinate fallback (e.g. "33.76760, -84.39080") as not usable text
      !/^\s*-?\d+\.\d+,\s*-?\d+\.\d+\s*$/.test(address)
  );

  return (
    <AppBackground>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flexDirection: "column", alignItems: "flex-start" }}>
            <ThemedText type="title" style={styles.title}>
              {name}
            </ThemedText>
            <View style={styles.headerActionsRow}>
              <Pressable
                onPress={toggleFavorite}
                style={({ pressed }) => [
                  styles.headerSaveBtnBelow,
                  isFavorite && styles.headerFavorited,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <ThemedText
                  style={[
                    styles.headerActionText,
                    isFavorite && styles.headerFavoritedText,
                  ]}
                >
                  {isFavorite ? "Saved" : "Save"}
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={handleSharePlace}
                style={({ pressed }) => [
                  styles.headerShareBtnBelow,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <ThemedText
                  style={[
                    styles.headerActionText,
                    styles.headerActionGhostText,
                  ]}
                >
                  Share
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.metaContainer}>
          {distance ? (
            <ThemedText style={styles.distance}>{distance}</ThemedText>
          ) : null}
        </View>

        <View style={styles.labelContainer}>
          <View style={styles.typeLabel}>
            <ThemedText style={styles.typeLabelText}>{type}</ThemedText>
          </View>
          {snap ? (
            <View style={styles.snapLabel}>
              <ThemedText style={styles.snapLabelText}>SNAP</ThemedText>
            </View>
          ) : null}
          {priceLevel ? (
            <View style={styles.priceLabel}>
              <ThemedText style={styles.priceLabelText}>
                {"$".repeat(priceLevel)}
              </ThemedText>
            </View>
          ) : null}
        </View>

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
            Address
          </ThemedText>
          {hasUsableAddress ? (
            <>
              <ThemedText>{address}</ThemedText>
              {canNavigate && (
                <Pressable
                  style={styles.addressNavButton}
                  onPress={handleQuickNavigation}
                >
                  <ThemedText style={styles.addressNavText}>
                    Navigate →
                  </ThemedText>
                </Pressable>
              )}
            </>
          ) : canNavigate ? (
            // Compact UI when address text is not available: only show a single Navigate action.
            <Pressable
              style={[styles.addressNavButton, styles.addressOnlyButton]}
              onPress={handleQuickNavigation}
            >
              <ThemedText
                style={[styles.addressNavText, styles.addressOnlyText]}
              >
                Navigate →
              </ThemedText>
            </Pressable>
          ) : (
            // No address and cannot navigate: show a subtle fallback message without big whitespace.
            <ThemedText style={{ opacity: 0.7 }}>
              Address not available
            </ThemedText>
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

        {/* <ThemedView style={styles.card}>
          <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
            About
          </ThemedText>
          <ThemedText>
            Fresh, accessible food option in your area. More detailed information and hours coming soon.
          </ThemedText>
        </ThemedView> */}

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
            Details
          </ThemedText>
          <ThemedText>• Type: {type}</ThemedText>
          {distance ? <ThemedText>• Distance: {distance}</ThemedText> : null}
        </ThemedView>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 18,
    paddingBottom: 120,
  },
  title: {
    marginBottom: 4,
    fontSize: 30,
    fontWeight: "700",
  },
  metaContainer: {
    marginBottom: 4,
  },
  distance: {
    opacity: 0.8,
    fontSize: 15,
    color: "#475569",
  },
  labelContainer: {
    flexDirection: "row",
    marginBottom: 8,
    alignItems: "center",
  },
  typeLabel: {
    backgroundColor: "rgba(37,99,235,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.35)",
  },
  typeLabelText: {
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: "600",
  },
  snapLabel: {
    marginLeft: 6,
    backgroundColor: "#e6f7eb",
    paddingHorizontal: 6, // tighter horizontal padding
    paddingVertical: 3, // tighter vertical padding
    borderRadius: 12, // slightly smaller radius
    borderWidth: 1,
    borderColor: "#bfe5ca",
    alignSelf: "flex-start",
    flexShrink: 1,
    minWidth: 0,
  },
  priceLabel: {
    marginLeft: 6,
    backgroundColor: "#eef2ff",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dcd7fe",
    alignSelf: "flex-start",
    flexShrink: 1,
    minWidth: 0,
  },
  priceLabelText: {
    color: "#4338ca",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    lineHeight: 14,
  },
  snapLabelText: {
    color: "#166534",
    fontSize: 11, // smaller font to reduce width
    fontWeight: "700",
    letterSpacing: 0.3,
    lineHeight: 14,
  },
  card: {
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.25)",
    backgroundColor: "rgba(255,255,255,0.95)",
    gap: 10,
    marginVertical: 10,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  addressNavButton: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#dbeafe",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#93c5fd",
  },
  addressNavText: {
    color: "#2563eb",
    fontSize: 14,
    fontWeight: "600",
  },
  // Compact variant when no address text is available (removes extra spacing/visual weight).
  addressOnlyButton: {
    marginTop: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  addressOnlyText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  headerShareBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#eef6ff",
    borderWidth: 1,
    borderColor: "#dbeafe",
    alignSelf: "flex-start",
  },
  headerShareText: {
    color: "#1a73e8",
    fontWeight: "700",
  },
  // Row for inline action buttons under the title; ensures vertical centering
  headerActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  // Matched action button styles so Save and Share render exactly the same height
  headerSaveBtnBelow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#1d4ed8",
    borderWidth: 1,
    borderColor: "#1e3a8a",
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerShareBtnBelow: {
    marginLeft: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(15,23,42,0.06)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.3)",
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  // Shared text style for header actions to keep typography identical
  headerActionText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
    lineHeight: 18,
  },
  headerActionGhostText: {
    color: "#0f172a",
  },
  headerFavorited: {
    backgroundColor: "#1d4ed8",
    borderColor: "#1e3a8a",
  },
  headerFavoritedText: {
    color: "#ffffff",
  },
});
