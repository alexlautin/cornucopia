import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { FoodLocation } from "@/constants/locations";
import { formatDistance, getDistance } from "@/utils/distance";
import {
  categorizePlace,
  formatOSMAddress,
  searchNearbyFoodLocations,
} from "@/utils/osm-api";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

const DEFAULT_COORDINATE = { latitude: 33.7676, longitude: -84.3908 };

const sortByDistance = (locations: FoodLocation[]) =>
  [...locations].sort((a, b) => {
    const distA = parseFloat(a.distance || "0");
    const distB = parseFloat(b.distance || "0");
    return distA - distB;
  });

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortedLocations, setSortedLocations] = useState<FoodLocation[]>([]);
  // NEW: query/filter + last updated
  const [query, setQuery] = useState("");
  const filters = ["All", "Pantry", "Grocery", "Market", "Food Bank"] as const;
  const [activeFilter, setActiveFilter] =
    useState<(typeof filters)[number]>("All");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const hasInitialLoad = useRef(false);
  const isInitializing = useRef(true); // NEW: track true initialization
  const inflightRef = useRef<Promise<void> | null>(null);
  const router = useRouter();
  const formattedLastUpdated = useMemo(() => {
    if (!lastUpdated) return "";
    try {
      return new Date(lastUpdated).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return new Date(lastUpdated).toISOString();
    }
  }, [lastUpdated]);

  // Minimal emoji for type indicator
  const typeEmoji = useCallback((t?: string) => {
    if (!t) return "🏬";
    const normalized = t.toLowerCase();
    const map: Record<string, string> = {
      "food bank": "🥫",
      "food pantry": "🥫",
      "soup kitchen": "🍲",
      "meal delivery": "🚚",
      "community center": "🏘️",
      "place of worship": "⛪",
      charity: "💝",
      "social facility": "🤝",
      supermarket: "🛒",
      "grocery store": "🛒",
      greengrocer: "🥦",
      "convenience store": "🏪",
      bakery: "🥐",
      deli: "🥪",
      market: "🧺",
      "farmers market": "🧺",
    };
    if (map[normalized]) return map[normalized];
    if (/bank|pantry|fridge/.test(normalized)) return "🥫";
    if (/market|farmer/.test(normalized)) return "🧺";
    if (/grocery|supermarket|store/.test(normalized)) return "🛒";
    return "🏬";
  }, []);

  // Helper: parse "0.8 mi" or "500 ft" into miles
  const toMiles = (d?: string) => {
    if (!d) return Number.POSITIVE_INFINITY;
    const n = parseFloat(d);
    if (Number.isNaN(n)) return Number.POSITIVE_INFINITY;
    return /ft/i.test(d) ? n / 5280 : n;
  };

  const getCurrentLocation = useCallback(async (force?: boolean) => {
    if (inflightRef.current) {
      return inflightRef.current;
    }

    // Always show loader on initial load or forced refresh
    if (!hasInitialLoad.current || force) {
      setLoading(true);
    }

    const run = (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          console.log("Location permission not granted");
          return;
        }

        console.log("Getting current position...");
        const locationData = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        console.log(
          "Current position:",
          locationData.coords.latitude,
          locationData.coords.longitude
        );

        console.log("Fetching OSM data...");
        const osmPlaces = await searchNearbyFoodLocations(
          locationData.coords.latitude,
          locationData.coords.longitude,
          10,
          force ? { force: true } : undefined
        );

        console.log(`Fetched ${osmPlaces.length} places from OSM`);

        if (osmPlaces.length === 0) {
          console.warn("No OSM places found in the area");
          setSortedLocations([]);
          setLastUpdated(Date.now());
          return;
        }

        const nextLocations = osmPlaces.map((place, index) => {
          const calcDist = getDistance(
            locationData.coords.latitude,
            locationData.coords.longitude,
            parseFloat(place.lat),
            parseFloat(place.lon)
          );
          return {
            id: place.place_id || `osm-${index}`,
            name: place.display_name.split(",")[0],
            address: formatOSMAddress(place),
            type: categorizePlace(place),
            coordinate: {
              latitude: parseFloat(place.lat),
              longitude: parseFloat(place.lon),
            },
            distance: formatDistance(calcDist),
          };
        });

        console.log(`Mapped ${nextLocations.length} locations`);
        const sorted = sortByDistance(nextLocations);
        console.log("Setting sorted locations...");
        setSortedLocations(sorted);
        setLastUpdated(Date.now());
        console.log("Location fetch complete");
      } catch (error) {
        console.error("Error fetching places:", error);
        // Don't set fallback data on error
      } finally {
        hasInitialLoad.current = true;
        isInitializing.current = false;
        setLoading(false);
      }
    })();

    inflightRef.current = run;
    try {
      await run;
    } finally {
      inflightRef.current = null;
    }
  }, []); // Empty deps is fine - we use refs for tracking state

  useEffect(() => {
    if (!hasInitialLoad.current) {
      getCurrentLocation();
    }
  }, [getCurrentLocation]);

  // Pull-to-refresh: stop spinner quickly; let fetch continue in background
  const onRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    // Fire a forced refresh in the background
    getCurrentLocation(true).catch(console.error);
    // End the spinner after a short, fixed delay so it doesn't hang
    const MIN_SPINNER_MS = 1200;
    setTimeout(() => setRefreshing(false), MIN_SPINNER_MS);
  }, [refreshing, getCurrentLocation]);

  // Swipe up to bottom: do a silent background refresh (no spinner)
  const onEndReached = useCallback(() => {
    getCurrentLocation(true).catch(console.error);
  }, [getCurrentLocation]);

  // Derived: filtered list for UI
  const filteredLocations = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...sortedLocations];

    if (activeFilter !== "All") {
      list = list.filter((l) => {
        const t = (l.type || "").toLowerCase();
        if (activeFilter === "Pantry") return /pantry|fridge/.test(t);
        if (activeFilter === "Grocery")
          return /grocery|supermarket|store/.test(t);
        if (activeFilter === "Market") return /market|farmer/.test(t);
        if (activeFilter === "Food Bank") return /bank/.test(t);
        return true;
      });
    }

    if (q.length) {
      list = list.filter(
        (l) =>
          (l.name || "").toLowerCase().includes(q) ||
          (l.address || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [sortedLocations, activeFilter, query]);

  // Dynamic Food Access Score based on nearest distance
  const nearestMi = useMemo(
    () =>
      toMiles(filteredLocations[0]?.distance || sortedLocations[0]?.distance),
    [filteredLocations, sortedLocations]
  );
  const score = useMemo(() => {
    const miles = nearestMi;
    // Don't show UNKNOWN during initial load
    if (!hasInitialLoad.current || !Number.isFinite(miles)) {
      return {
        label: "LOADING",
        pct: 0.25,
        color: "#6b7280",
        hint: "Finding food options near you...",
      };
    }
    const pct = Math.max(0.06, 1 - Math.min(miles / 3, 1));
    const label = miles <= 0.5 ? "HIGH" : miles <= 1.5 ? "MEDIUM" : "LOW";
    const color =
      label === "HIGH" ? "#15803d" : label === "MEDIUM" ? "#f59e0b" : "#b91c1c";
    const hint =
      label === "HIGH"
        ? "Plenty of options within a short walk."
        : label === "MEDIUM"
        ? "Some options are nearby."
        : "Few fresh food options within walking distance.";
    return { label, pct, color, hint };
  }, [nearestMi, hasInitialLoad.current]);

  return (
    <ThemedView style={styles.container}>
      {/* HEADER */}
      <ThemedText type="title" style={styles.header}>
        Cornucopia
      </ThemedText>
      <ThemedText type="default" style={styles.subtitle}>
        Find fresh, affordable food nearby.
      </ThemedText>

      {/* SEARCH + FILTERS */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <ThemedText style={styles.searchIcon}>🔎</ThemedText>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or address"
            placeholderTextColor="#8a8a8a"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} style={styles.clearBtn}>
              <ThemedText style={styles.clearTxt}>✕</ThemedText>
            </Pressable>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {filters.map((f) => (
            <Pressable
              key={f}
              onPress={() => setActiveFilter(f)}
              style={[styles.chip, activeFilter === f && styles.chipActive]}
            >
              <ThemedText
                style={[
                  styles.chipText,
                  activeFilter === f && styles.chipTextActive,
                ]}
              >
                {f}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* FOOD ACCESS SCORE CARD */}
      <ThemedView style={[styles.scoreCard, styles.elevated]}>
        <ThemedText type="subtitle">Food Access Score</ThemedText>
        <ThemedText
          type="title"
          style={[styles.scoreValue, { color: score.color }]}
        >
          {score.label}
        </ThemedText>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.round(score.pct * 100)}%`,
                backgroundColor: score.color,
              },
            ]}
          />
        </View>
        <ThemedText style={styles.scoreDescription}>{score.hint}</ThemedText>
      </ThemedView>

      {/* NEARBY OPTIONS LIST */}
      <ThemedText type="subtitle" style={styles.sectionHeader}>
        Nearest Options
      </ThemedText>
      {lastUpdated !== null && !isInitializing.current && (
        <ThemedText style={styles.resultsMeta}>
          Showing {filteredLocations.length} result
          {filteredLocations.length === 1 ? "" : "s"}
          {filteredLocations.length !== sortedLocations.length
            ? ` (of ${sortedLocations.length} total)`
            : ""}{" "}
          · Updated {formattedLastUpdated}
        </ThemedText>
      )}

      {loading || isInitializing.current ? (
        // Show loading message instead of skeleton cards
        <View style={styles.loadingContainer}>
          <ThemedText style={styles.loadingText}>Loading options...</ThemedText>
        </View>
      ) : (
        <FlatList
          data={filteredLocations}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.2}
          contentContainerStyle={{ paddingBottom: 28 }}
          ListEmptyComponent={
            <View style={{ padding: 24, alignItems: "center" }}>
              <ThemedText style={{ opacity: 0.7, marginBottom: 8 }}>
                No locations found nearby.
              </ThemedText>
              <Pressable
                onPress={() => {
                  setQuery("");
                  setActiveFilter("All");
                }}
                style={styles.resetBtn}
              >
                <ThemedText style={{ color: "white", fontWeight: "600" }}>
                  Clear filters
                </ThemedText>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              android_ripple={{ color: "#00000010" }}
              onPress={() =>
                router.push({
                  pathname: "/option/[id]",
                  params: {
                    id: item.id,
                    name: item.name,
                    type: item.type,
                    address: item.address,
                    distance: item.distance,
                  },
                })
              }
              style={({ pressed }) => [
                styles.optionCard,
                styles.cardElevated,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.cardRow}>
                <View style={styles.leading}>
                  <View style={styles.leadingIcon}>
                    <ThemedText style={styles.leadingEmoji}>
                      {typeEmoji(item.type)}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.middle}>
                  <View style={styles.titleRow}>
                    <ThemedText
                      type="defaultSemiBold"
                      numberOfLines={1}
                      style={styles.optionTitle}
                    >
                      {item.name}
                    </ThemedText>
                    <ThemedText style={styles.distancePill}>
                      {item.distance}
                    </ThemedText>
                  </View>

                  <View style={styles.subRow}>
                    <View style={styles.metaRow}>
                      <View style={styles.metaDot} />
                      <ThemedText style={styles.subtleText} numberOfLines={1}>
                        {item.type}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={styles.addrRow}>
                    <ThemedText style={styles.addrIcon}>📍</ThemedText>
                    <ThemedText style={styles.optionAddress} numberOfLines={1}>
                      {item.address}
                    </ThemedText>
                  </View>
                </View>

                <Pressable
                  style={styles.chevronButton}
                  onPress={() => {
                    router.push({
                      pathname: "/option/[id]",
                      params: {
                        id: item.id,
                        name: item.name,
                        type: item.type,
                        address: item.address,
                        distance: item.distance,
                      },
                    });
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <ThemedText style={styles.chevron}>›</ThemedText>
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 12,
    paddingTop: 60,
  },
  header: {
    marginTop: 10,
    fontSize: 32,
  },
  subtitle: {
    marginBottom: 6,
    opacity: 0.75,
  },

  // Search
  searchContainer: {
    marginTop: 8,
    marginBottom: 4,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
    opacity: 0.7,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
  clearBtn: {
    marginLeft: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e5e7eb",
  },
  clearTxt: { fontWeight: "700", opacity: 0.7 },
  chipsRow: {
    gap: 8,
    paddingTop: 10,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: "#1a73e8",
    borderColor: "#1a73e8",
  },
  chipText: { fontSize: 13, color: "#374151" },
  chipTextActive: { color: "white", fontWeight: "600" },

  // Score card
  scoreCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    backgroundColor: "white",
  },
  elevated: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  scoreValue: {
    fontSize: 30,
    fontWeight: "700",
    marginVertical: 4,
  },
  progressBar: {
    height: 8,
    borderRadius: 6,
    backgroundColor: "#eef2f7",
    overflow: "hidden",
    marginVertical: 8,
  },
  progressFill: {
    height: "100%",
    borderRadius: 6,
  },
  scoreDescription: {
    opacity: 0.8,
  },

  sectionHeader: {
    marginTop: 10,
  },
  resultsMeta: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
  },

  // List items (minimal)
  optionCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 0,
    borderColor: "transparent",
    backgroundColor: "white",
    marginVertical: 6,
  },
  cardElevated: {
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  cardPressed: {
    transform: [{ scale: 0.997 }],
    opacity: 0.98,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  leading: {
    marginRight: 12,
  },
  leadingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  leadingEmoji: { fontSize: 18 },
  middle: { flex: 1 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  optionTitle: {
    flex: 1,
    fontSize: 16,
  },
  distancePill: {
    marginLeft: 8,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#f3f4f6",
    color: "#374151",
  },
  subRow: {
    marginTop: 4,
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#a3a3a3",
    marginRight: 6,
  },
  subtleText: {
    fontSize: 12,
    color: "#6b7280",
  },
  addrRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  addrIcon: {
    fontSize: 12,
    marginRight: 6,
    opacity: 0.7,
  },
  optionAddress: {
    flex: 1,
  },
  chevronButton: {
    marginLeft: 8,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  chevron: {
    color: "#9ca3af",
    fontWeight: "700",
    fontSize: 18,
    lineHeight: 18,
  },
  loadingContainer: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 16,
    opacity: 0.7,
  },
  skeletonCard: {
    height: 72,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    marginVertical: 6,
  },
  resetBtn: {
    backgroundColor: "#1a73e8",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  optionType: { opacity: 0.7, marginTop: 2 },
  optionDistance: { opacity: 0.6, marginBottom: 2 },
  directionsTextLegacy: { color: "white", fontWeight: "600" },
});
