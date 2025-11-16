import { AppBackground } from "@/components/app-background";
import { ThemedText } from "@/components/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { FoodLocation } from "@/constants/locations";
import { formatDistance, getDistance } from "@/utils/distance";
import { openNavigation } from "@/utils/navigation";
import {
  categorizePlace,
  formatOSMAddress,
  getAllPlacesOnce,
  getOpeningHours,
} from "@/utils/osm-api";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DEBUG =
  (typeof process !== "undefined" &&
    (process.env.EXPO_PUBLIC_DEBUG_OSM === "1" ||
      process.env.EXPO_PUBLIC_DEBUG_OSM === "true")) ||
  false;
const dlog = (...args: any[]) => {
  if (DEBUG) console.log("INDEX:", ...args);
};

const sortByDistance = (locations: FoodLocation[]) =>
  [...locations].sort((a, b) => {
    const distA = parseFloat(a.distance || "0");
    const distB = parseFloat(b.distance || "0");
    return distA - distB;
  });

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortedLocations, setSortedLocations] = useState<FoodLocation[]>([]);
  const [query, setQuery] = useState("");
  // Filters: only Supabase `type` values + price tiers + SNAP.
  // Health Food is grouped under "Farmers And Markets" via categorizePlace.
  // Per request, omit "Butcher" as a filter button.
  const filters: string[] = [
    "All",
    "SNAP/EBT",
    "$",
    "$$",
    "$$$",
    "Bakery",
    "Convenience",
    "Farmers And Markets",
    "Greengrocer",
    "Grocery Store",
    "Marketplace",
    "Specialty Store",
    "Supermarket",
    "Other",
  ];
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const hasInitialLoad = useRef(false);
  const isInitializing = useRef(true);
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

  const typeEmoji = useCallback((t?: string) => {
    if (!t) return "🏬";
    const normalized = t.toLowerCase();
    const map: Record<string, string> = {
      "food bank": "🥫",
      "food pantry": "🥫",
      "soup kitchen": "🍲",
      "meal delivery": "🚚",
      "community center": "🏘️",
      "social facility": "🤝",
      supermarket: "🛒",
      "grocery store": "🛒",
      greengrocer: "🥦",
      convenience: "🏪",
      bakery: "🥐",
      marketplace: "🧺",
      "farmers and markets": "🧺",
      "specialty store": "🛍️",
    };
    if (map[normalized]) return map[normalized];
    if (/bank|pantry|fridge/.test(normalized)) return "🥫";
    if (/market|farmer/.test(normalized)) return "🧺";
    if (/grocery|supermarket|store/.test(normalized)) return "🛒";
    return "🏬";
  }, []);

  const reverseGeocodeCache = useRef<Map<string, string | null>>(new Map());

  // Try to resolve a human-readable address for given coords using native reverse geocoding.
  const reverseGeocodeCoords = useCallback(async (lat: number, lon: number) => {
    const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
    if (reverseGeocodeCache.current.has(key))
      return reverseGeocodeCache.current.get(key) || null;
    try {
      const results = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lon,
      });
      if (!results || results.length === 0) {
        reverseGeocodeCache.current.set(key, null);
        return null;
      }
      const r = results[0];
      const parts = [
        r.name,
        r.street,
        r.city,
        r.region,
        r.postalCode,
        r.country,
      ].filter(Boolean);
      const formatted = parts.join(", ");
      reverseGeocodeCache.current.set(key, formatted);
      return formatted;
    } catch (err) {
      console.warn("reverseGeocodeCoords error", err);
      reverseGeocodeCache.current.set(key, null);
      return null;
    }
  }, []);

  const getCurrentLocation = useCallback(
    async (force?: boolean) => {
      if (!hasInitialLoad.current || force) setLoading(true);

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          console.log("Location permission not granted");
          setLoading(false);
          hasInitialLoad.current = true;
          isInitializing.current = false;
          return;
        }

        const locationData = await Location.getCurrentPositionAsync({});
        const osmPlaces = await getAllPlacesOnce(
          force ? { force: true } : undefined
        );

        if (!osmPlaces || osmPlaces.length === 0) {
          setSortedLocations([]);
          setLastUpdated(Date.now());
          hasInitialLoad.current = true;
          isInitializing.current = false;
          setLoading(false);
          return;
        }

        // Build locations array but resolve missing addresses in distance-prioritized batches.
        // 1) compute numeric distances, 2) sort ascending, 3) batch reverse-geocode (closest batches first).
        const placesWithMeta = osmPlaces
          .map((place) => {
            const lat = parseFloat(place.lat);
            const lon = parseFloat(place.lon);
            const distanceNum =
              Number.isFinite(lat) && Number.isFinite(lon)
                ? getDistance(
                    locationData.coords.latitude,
                    locationData.coords.longitude,
                    lat,
                    lon
                  )
                : Number.POSITIVE_INFINITY;
            return { place, lat, lon, distanceNum };
          })
          .filter(
            (m) => Number.isFinite(m.lat) || Number.isFinite(m.lon) || m.place
          ) // keep items (defensive)
          .sort((a, b) => a.distanceNum - b.distanceNum);

        // Resolve addresses for the nearest entries only (limit to avoid platform rate limits).
        const BATCH_SIZE = 6;
        const MAX_REVERSE_GEOCODE = 15; // only reverse-geocode this many closest places
        const toResolveCount = Math.min(
          placesWithMeta.length,
          MAX_REVERSE_GEOCODE
        );
        for (let i = 0; i < toResolveCount; i += BATCH_SIZE) {
          const batch = placesWithMeta.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(async (m) => {
              if (!m.place) return;
              // If OSM already provides an address, skip reverse geocoding
              const osmAddr = formatOSMAddress(m.place);
              if (osmAddr && osmAddr.length) {
                (m as any).resolvedAddress = osmAddr;
                return;
              }
              // Attempt reverse geocode (priority ensures closer batches run first)
              try {
                const resolved = await reverseGeocodeCoords(m.lat, m.lon);
                (m as any).resolvedAddress = resolved || null;
              } catch {
                (m as any).resolvedAddress = null;
              }
            })
          );
          // small micro-yield to avoid blocking event loop long-term
          await new Promise((r) => setTimeout(r, 0));
        }
        // Note: items beyond MAX_REVERSE_GEOCODE will keep resolvedAddress undefined and will fall back
        // to OSM address (if any) or coordinates when building final list.

        // Build final nextLocations in the same prioritized (distance) order
        const nextLocations: FoodLocation[] = placesWithMeta.map((m, index) => {
          const lat = m.lat;
          const lon = m.lon;
          const calcDist = m.distanceNum;
          const osmAddr = formatOSMAddress(m.place);
          const resolved = (m as any).resolvedAddress;
          const address =
            osmAddr || resolved || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
          const pl =
            (m.place as any).price_level &&
            Number.isFinite((m.place as any).price_level)
              ? Math.max(
                  1,
                  Math.min(3, Math.round((m.place as any).price_level))
                )
              : undefined;
          return {
            id: m.place.place_id || `osm-${index}`,
            name:
              (m.place.display_name || "").split(",")[0] ||
              `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
            address,
            type: categorizePlace(m.place),
            coordinate: { latitude: lat, longitude: lon },
            distance: formatDistance(calcDist),
            snap: Boolean((m.place as any).snap),
            priceLevel: pl as 1 | 2 | 3 | undefined,
          } as FoodLocation;
        });

        const sorted = sortByDistance(nextLocations);
        setSortedLocations(sorted);
        setLastUpdated(Date.now());
        hasInitialLoad.current = true;
        isInitializing.current = false;
      } catch (error) {
        console.error("Error getting location:", error);
        hasInitialLoad.current = true;
        isInitializing.current = false;
      } finally {
        setLoading(false);
      }
    },
    [reverseGeocodeCoords]
  );

  useEffect(() => {
    if (!hasInitialLoad.current) {
      getCurrentLocation();
    }
  }, [getCurrentLocation]);

  const onRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    void getCurrentLocation(true);
    const MIN_SPINNER_MS = 1200;
    setTimeout(() => setRefreshing(false), MIN_SPINNER_MS);
  }, [refreshing, getCurrentLocation]);

  const visibleLocations = useMemo(() => {
    const t0 = Date.now();
    const q = query.trim().toLowerCase();
    let list = [...sortedLocations];

    if (activeFilter !== "All") {
      list = list.filter((l) => {
        if (activeFilter === "SNAP/EBT") return Boolean(l.snap);
        if (activeFilter === "$") return l.priceLevel === 1;
        if (activeFilter === "$$") return l.priceLevel === 2;
        if (activeFilter === "$$$") return l.priceLevel === 3;
        return (l.type || "") === activeFilter;
      });
    }

    if (q.length) {
      list = list.filter(
        (l) =>
          (l.name || "").toLowerCase().includes(q) ||
          (l.address || "").toLowerCase().includes(q)
      );
    }

    const ms = Date.now() - t0;
    if (DEBUG)
      dlog("filter.done", {
        ms,
        count: list.length,
        filter: activeFilter,
        qLen: q.length,
      });
    return list;
  }, [sortedLocations, query, activeFilter]);

  const headerStatus = useMemo(() => {
    if (refreshing) return "Refreshing data...";
    if (loading) return "Locating nearby options...";
    if (formattedLastUpdated) return `Updated ${formattedLastUpdated}`;
    return "Ready to explore";
  }, [formattedLastUpdated, loading, refreshing]);

  // Walkability score (simple: based on nearest distance in miles)
  const toMiles = (d?: string) => {
    if (!d) return Number.POSITIVE_INFINITY;
    const n = parseFloat(d);
    if (Number.isNaN(n)) return Number.POSITIVE_INFINITY;
    return /ft/i.test(d) ? n / 5280 : n;
  };

  const nearestMi = useMemo(() => {
    const first = visibleLocations[0]?.distance || sortedLocations[0]?.distance;
    return toMiles(first);
  }, [visibleLocations, sortedLocations]);

  const score = useMemo(() => {
    const miles = nearestMi;
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
  }, [nearestMi]);

  // Guarded onEndReached: only try to fetch more when there is something to paginate,
  // and when we're not already loading/refreshing/initializing.
  const onEndReached = useCallback(() => {
    if (loading || refreshing || isInitializing.current) return;
    if (!visibleLocations || visibleLocations.length === 0) return;
    void getCurrentLocation(true);
  }, [
    getCurrentLocation,
    loading,
    refreshing,
    visibleLocations,
    isInitializing,
  ]);

  const handleQuickNavigation = (item: FoodLocation, event: any) => {
    event.stopPropagation();
    openNavigation({
      latitude: item.coordinate.latitude,
      longitude: item.coordinate.longitude,
      address: item.address,
      name: item.name,
    });
  };

  // NEW: open details with prefetch (reverse geocode + opening hours)
  // Enable LayoutAnimation on Android
  useEffect(() => {
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // Track which item is expanded and cache of resolved details (address / hours)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<
    Record<
      string,
      { address?: string | null; hours?: string[] | null; loading?: boolean }
    >
  >({});

  // Toggle expand with prefetch (reverse geocode + opening hours)
  const toggleExpand = useCallback(
    async (item: FoodLocation) => {
      const id = item.id;
      const isCurrentlyExpanded = expandedId === id;

      // collapse
      if (isCurrentlyExpanded) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedId(null);
        return;
      }

      // expand
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedId(id);
      setExpandedDetails((p) => ({
        ...p,
        [id]: { ...(p[id] || {}), loading: true },
      }));

      try {
        // Resolve address if missing/placeholder
        let address = item.address;
        if (!address || /^\d+\.\d+,\s*-?\d+\.\d+/.test(address)) {
          const resolved = await reverseGeocodeCoords(
            item.coordinate.latitude,
            item.coordinate.longitude
          );
          address = resolved || address;
        }

        // Best-effort fetch opening hours
        let hours: string[] | null = null;
        try {
          if (item.id) {
            const fetched = await getOpeningHours(String(item.id));
            if (fetched && fetched.length > 0) hours = fetched;
          }
        } catch (e) {
          console.warn("prefetch getOpeningHours failed", e);
        }

        setExpandedDetails((p) => ({
          ...p,
          [id]: { address, hours, loading: false },
        }));
      } catch (err) {
        console.warn("toggleExpand error", err);
        setExpandedDetails((p) => ({
          ...p,
          [id]: { ...(p[id] || {}), loading: false },
        }));
      }
    },
    [expandedId, reverseGeocodeCoords]
  );

  const listHeader = (
    <View style={styles.listHeader}>
      <View style={styles.hero}>
        <ThemedText type="title" style={styles.header}>
          Cornucopia
        </ThemedText>
        <ThemedText type="default" style={styles.subtitle}>
          Fresh, dignified food access wherever you stand.
        </ThemedText>
        <Pressable
          onPress={() => router.push("/Walkability")}
          style={({ pressed }) => [
            styles.heroLink,
            pressed && styles.heroLinkPressed,
          ]}
        >
          <ThemedText style={styles.heroLinkText}>
            Learn how we grade walkability →
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <IconSymbol
            name="magnifyingglass"
            size={16}
            color="#64748b"
            style={styles.searchIcon}
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or address"
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} style={styles.clearBtn}>
              <IconSymbol
                name="xmark"
                size={12}
                color="#0f172a"
                style={styles.clearTxt as any}
              />
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
              style={[
                styles.chip,
                f === "SNAP/EBT" ? styles.snapChip : null,
                activeFilter === f &&
                  (f === "SNAP/EBT"
                    ? styles.snapChipActive
                    : styles.chipActive),
              ]}
            >
              <ThemedText
                style={[
                  styles.chipText,
                  f === "SNAP/EBT" ? styles.snapChipText : null,
                  activeFilter === f &&
                    (f === "SNAP/EBT"
                      ? styles.snapChipTextActive
                      : styles.chipTextActive),
                ]}
              >
                {f}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <Pressable
        onPress={() => router.push("/Walkability")}
        style={({ pressed }) => [
          styles.scoreCard,
          pressed && styles.cardPressed,
        ]}
        accessibilityRole="button"
      >
        <ThemedText type="subtitle" style={styles.scoreTitle}>
          Food Walkability
        </ThemedText>
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
        <ThemedText style={styles.scoreTapHint}>
          Tap to learn how we calculate this
        </ThemedText>
      </Pressable>

      <View style={styles.sectionDivider} />

      <View style={styles.sectionHeaderRow}>
        <ThemedText type="subtitle" style={styles.sectionHeader}>
          Nearest Options
        </ThemedText>
        {lastUpdated !== null && !isInitializing.current && (
          <ThemedText style={styles.resultsMeta}>{headerStatus}</ThemedText>
        )}
      </View>

      {(loading || isInitializing.current) && (
        <View style={styles.loadingContainer}>
          <ThemedText style={styles.loadingText}>Loading options...</ThemedText>
        </View>
      )}
    </View>
  );

  return (
    <AppBackground>
      <View style={styles.container}>
        <FlatList
          data={loading || isInitializing.current ? [] : visibleLocations}
          keyExtractor={(item) => item.id}
          initialNumToRender={16}
          windowSize={6}
          maxToRenderPerBatch={24}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.2}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: Math.max(insets.top) },
          ]}
          contentInsetAdjustmentBehavior="always"
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            !loading && !isInitializing.current ? (
              <View style={styles.emptyState}>
                <ThemedText style={styles.emptyStateText}>
                  No locations found nearby.
                </ThemedText>
                <Pressable
                  onPress={() => {
                    setQuery("");
                    setActiveFilter("All");
                  }}
                  style={styles.resetBtn}
                >
                  <ThemedText style={styles.resetBtnText}>
                    Clear filters
                  </ThemedText>
                </Pressable>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              android_ripple={{ color: "#00000010" }}
              onPress={() => void toggleExpand(item)}
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
                    {item.snap ? (
                      <View style={styles.snapPill}>
                        <ThemedText style={styles.snapPillText}>
                          SNAP
                        </ThemedText>
                      </View>
                    ) : null}
                    {item.priceLevel ? (
                      <View style={styles.pricePill}>
                        <ThemedText style={styles.pricePillText}>
                          {"$".repeat(item.priceLevel)}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>

                  {expandedId !== item.id && (
                    <View style={styles.addrRow}>
                      <ThemedText style={styles.addrIcon}>📍</ThemedText>
                      <ThemedText
                        style={styles.optionAddress}
                        numberOfLines={1}
                      >
                        {item.address}
                      </ThemedText>
                    </View>
                  )}

                  {/* Inline expanded content (shows resolved address, opening hours, actions) */}
                  {expandedId === item.id && (
                    <View style={styles.expandedContent}>
                      {expandedDetails[item.id]?.loading ? (
                        <ThemedText style={{ marginTop: 8, opacity: 0.8 }}>
                          Loading details...
                        </ThemedText>
                      ) : (
                        <>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              marginTop: 10,
                            }}
                          >
                            <IconSymbol
                              name="mappin"
                              size={16}
                              color="#6b7280"
                            />
                            <ThemedText style={{ marginLeft: 8, flex: 1 }}>
                              {expandedDetails[item.id]?.address ??
                                item.address}
                            </ThemedText>
                          </View>

                          {expandedDetails[item.id]?.hours &&
                            expandedDetails[item.id].hours!.length > 0 && (
                              <View style={{ marginTop: 8 }}>
                                <ThemedText
                                  type="subtitle"
                                  style={{ marginBottom: 4 }}
                                >
                                  Opening hours
                                </ThemedText>
                                {expandedDetails[item.id].hours!.map(
                                  (h, idx) => (
                                    <ThemedText
                                      key={idx}
                                      style={{ fontSize: 13 }}
                                    >
                                      {h}
                                    </ThemedText>
                                  )
                                )}
                              </View>
                            )}

                          <View
                            style={{
                              flexDirection: "row",
                              marginTop: 12,
                              justifyContent: "flex-end",
                            }}
                          >
                            <Pressable
                              onPress={(e) => {
                                e.stopPropagation();
                                handleQuickNavigation(item, e);
                              }}
                              style={styles.smallBtn}
                            >
                              <ThemedText
                                style={{ color: "white", fontWeight: "600" }}
                              >
                                Navigate →
                              </ThemedText>
                            </Pressable>

                            <Pressable
                              onPress={(e) => {
                                e.stopPropagation();
                                router.push({
                                  pathname: "/option/[id]",
                                  params: {
                                    id: item.id,
                                    name: item.name,
                                    type: item.type,
                                    address:
                                      expandedDetails[item.id]?.address ??
                                      item.address,
                                    distance: item.distance,
                                    latitude:
                                      item.coordinate.latitude.toString(),
                                    longitude:
                                      item.coordinate.longitude.toString(),
                                    snap: item.snap ? "true" : "false",
                                    ...(item.priceLevel
                                      ? { price: String(item.priceLevel) }
                                      : {}),
                                  },
                                });
                              }}
                              style={[styles.smallBtn, styles.smallBtnOutline]}
                            >
                              <ThemedText style={{ fontWeight: "600" }}>
                                Open
                              </ThemedText>
                            </Pressable>
                          </View>
                        </>
                      )}
                    </View>
                  )}
                </View>

                <Pressable
                  style={styles.chevronButton}
                  onPress={(e) => {
                    // Prevent the outer Pressable from also receiving this press.
                    e.stopPropagation?.();
                    void toggleExpand(item);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <ThemedText style={styles.chevron}>
                    {expandedId === item.id ? "‹" : "›"}
                  </ThemedText>
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      </View>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 0,
  },
  listContent: {
    paddingBottom: 120,
  },
  listHeader: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 4,
    gap: 20,
  },
  hero: {
    paddingTop: 0,
    gap: 12,
  },
  heroBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(99,102,241,0.12)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.3)",
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4c1d95",
    letterSpacing: 0.4,
  },
  header: {
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: "#0f172a",
    marginTop: 0,
  },
  subtitle: {
    fontSize: 16,
    color: "#475569",
  },
  heroLink: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  heroLinkPressed: {
    opacity: 0.7,
  },
  heroLinkText: {
    fontSize: 13,
    color: "#2563eb",
    fontWeight: "600",
  },
  searchContainer: {
    gap: 12,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.25)",
  },
  searchIcon: { fontSize: 16, marginRight: 10 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 4 },
  clearBtn: {
    marginLeft: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(148,163,184,0.2)",
  },
  clearTxt: { fontWeight: "700", opacity: 0.8 },
  chipsRow: { gap: 10, paddingTop: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.06)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.2)",
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: "#1d4ed8",
    borderColor: "#1d4ed8",
  },
  chipText: { fontSize: 13, color: "#475569" },
  chipTextActive: { color: "#ffffff", fontWeight: "600" },
  snapChip: {
    backgroundColor: "rgba(22,101,52,0.08)",
    borderColor: "rgba(22,101,52,0.2)",
    borderWidth: 1,
  },
  snapChipActive: {
    backgroundColor: "#166534",
    borderColor: "#166534",
  },
  snapChipText: {
    color: "#166534",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  snapChipTextActive: {
    color: "#ffffff",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  scoreCard: {
    marginTop: 4,
    padding: 20,
    borderRadius: 22,
    backgroundColor: "rgba(99,102,241,0.1)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.25)",
  },
  cardPressed: {
    transform: [{ scale: 0.997 }],
    opacity: 0.97,
  },
  scoreTitle: {
    fontSize: 15,
    color: "#312e81",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  scoreValue: { fontSize: 30, fontWeight: "700", marginVertical: 6 },
  progressBar: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.15)",
    overflow: "hidden",
    marginVertical: 8,
  },
  progressFill: { height: "100%", borderRadius: 999 },
  scoreDescription: {
    fontSize: 13,
    color: "#0f172a",
    opacity: 0.85,
  },
  scoreTapHint: {
    marginTop: 6,
    fontSize: 12,
    color: "#475569",
  },
  sectionDivider: {
    height: 1,
    backgroundColor: "rgba(148,163,184,0.25)",
  },
  sectionHeaderRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  sectionHeader: {
    fontSize: 20,
  },
  resultsMeta: {
    fontSize: 12,
    color: "#64748b",
  },
  loadingContainer: {
    paddingVertical: 16,
    alignItems: "center",
  },
  loadingText: { fontSize: 15, color: "#475569" },
  emptyState: {
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  emptyStateText: {
    opacity: 0.8,
    fontSize: 15,
  },
  resetBtn: {
    backgroundColor: "#1d4ed8",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
  },
  resetBtnText: {
    color: "white",
    fontWeight: "600",
  },
  optionCard: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.92)",
    marginVertical: 10,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.25)",
  },
  cardElevated: {
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  cardRow: { flexDirection: "row", alignItems: "center" },
  leading: { marginRight: 14 },
  leadingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.06)",
  },
  leadingEmoji: { fontSize: 18 },
  middle: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center" },
  optionTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: "#0f172a",
  },
  distancePill: {
    marginLeft: 8,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.12)",
    color: "#1d4ed8",
    fontWeight: "600",
  },
  subRow: {
    marginTop: 6,
    marginBottom: 2,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  metaRow: { flexDirection: "row", alignItems: "center", marginRight: 6 },
  metaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#94a3b8",
    marginRight: 6,
  },
  subtleText: { fontSize: 12, color: "#64748b" },
  snapPill: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(22,101,52,0.08)",
    borderWidth: 1,
    borderColor: "rgba(22,101,52,0.2)",
    alignSelf: "flex-start",
  },
  snapPillText: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  pricePill: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(99,102,241,0.12)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.25)",
    alignSelf: "flex-start",
  },
  pricePillText: {
    color: "#4338ca",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  addrRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  addrIcon: { fontSize: 12, marginRight: 6, opacity: 0.7 },
  optionAddress: {
    flex: 1,
    fontSize: 13,
    color: "#475569",
  },
  chevronButton: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  chevron: {
    color: "#94a3b8",
    fontWeight: "700",
    fontSize: 18,
    lineHeight: 18,
  },
  expandedContent: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(148,163,184,0.25)",
  },
  smallBtn: {
    backgroundColor: "#1d4ed8",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  smallBtnOutline: {
    backgroundColor: "rgba(15,23,42,0.06)",
    marginLeft: 8,
  },
});
