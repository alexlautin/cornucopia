import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FoodLocation } from '@/constants/locations';
import { formatDistance, getDistance } from '@/utils/distance';
import { openNavigation } from '@/utils/navigation';
import {
  categorizePlace,
  formatOSMAddress,
  getOpeningHours,
  searchNearbyFoodLocations,
} from '@/utils/osm-api';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, LayoutAnimation, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, UIManager, View } from 'react-native';

const DEFAULT_COORDINATE = { latitude: 33.7676, longitude: -84.3908 };

const sortByDistance = (locations: FoodLocation[]) =>
  [...locations].sort((a, b) => {
    const distA = parseFloat(a.distance || '0');
    const distB = parseFloat(b.distance || '0');
    return distA - distB;
  });

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortedLocations, setSortedLocations] = useState<FoodLocation[]>([]);
  const [query, setQuery] = useState('');
  const filters = ['All', 'Pantry', 'Grocery', 'Market', 'Food Bank'] as const;
  const [activeFilter, setActiveFilter] = useState<typeof filters[number]>('All');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const hasInitialLoad = useRef(false);
  const isInitializing = useRef(true);
  const router = useRouter();
  const formattedLastUpdated = useMemo(() => {
    if (!lastUpdated) return '';
    try {
      return new Date(lastUpdated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return new Date(lastUpdated).toISOString();
    }
  }, [lastUpdated]);

  const typeEmoji = useCallback((t?: string) => {
    if (!t) return '🏬';
    const normalized = t.toLowerCase();
    const map: Record<string, string> = {
      'food bank': '🥫',
      'food pantry': '🥫',
      'soup kitchen': '🍲',
      'meal delivery': '🚚',
      'community center': '🏘️',
      'place of worship': '⛪',
      charity: '💝',
      'social facility': '🤝',
      supermarket: '🛒',
      'grocery store': '🛒',
      greengrocer: '🥦',
      'convenience store': '🏪',
      bakery: '🥐',
      deli: '🥪',
      market: '🧺',
      'farmers market': '🧺',
    };
    if (map[normalized]) return map[normalized];
    if (/bank|pantry|fridge/.test(normalized)) return '🥫';
    if (/market|farmer/.test(normalized)) return '🧺';
    if (/grocery|supermarket|store/.test(normalized)) return '🛒';
    return '🏬';
  }, []);

  const toMiles = (d?: string) => {
    if (!d) return Number.POSITIVE_INFINITY;
    const n = parseFloat(d);
    if (Number.isNaN(n)) return Number.POSITIVE_INFINITY;
    return /ft/i.test(d) ? n / 5280 : n;
  };

  const reverseGeocodeCache = useRef<Map<string, string | null>>(new Map());

  // Try to resolve a human-readable address for given coords using native reverse geocoding.
  const reverseGeocodeCoords = useCallback(async (lat: number, lon: number) => {
    const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
    if (reverseGeocodeCache.current.has(key)) return reverseGeocodeCache.current.get(key) || null;
    try {
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      if (!results || results.length === 0) {
        reverseGeocodeCache.current.set(key, null);
        return null;
      }
      const r = results[0];
      const parts = [r.name, r.street, r.city, r.region, r.postalCode, r.country].filter(Boolean);
      const formatted = parts.join(', ');
      reverseGeocodeCache.current.set(key, formatted);
      return formatted;
    } catch (err) {
      console.warn('reverseGeocodeCoords error', err);
      reverseGeocodeCache.current.set(key, null);
      return null;
    }
  }, []);

  const getCurrentLocation = useCallback(async (force?: boolean) => {
    if (!hasInitialLoad.current || force) setLoading(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission not granted');
        setLoading(false);
        hasInitialLoad.current = true;
        isInitializing.current = false;
        return;
      }

      const locationData = await Location.getCurrentPositionAsync({});
      const osmPlaces = await searchNearbyFoodLocations(
        locationData.coords.latitude,
        locationData.coords.longitude,
        10000,
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
          const distanceNum = Number.isFinite(lat) && Number.isFinite(lon)
            ? getDistance(locationData.coords.latitude, locationData.coords.longitude, lat, lon)
            : Number.POSITIVE_INFINITY;
          return { place, lat, lon, distanceNum };
        })
        .filter((m) => Number.isFinite(m.lat) || Number.isFinite(m.lon) || m.place) // keep items (defensive)
        .sort((a, b) => a.distanceNum - b.distanceNum);

      // Resolve addresses for the nearest entries only (limit to avoid platform rate limits).
      const BATCH_SIZE = 6;
      const MAX_REVERSE_GEOCODE = 15; // only reverse-geocode this many closest places
      const toResolveCount = Math.min(placesWithMeta.length, MAX_REVERSE_GEOCODE);
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
            } catch (e) {
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
        const address = osmAddr || resolved || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        return {
          id: m.place.place_id || `osm-${index}`,
          name: (m.place.display_name || '').split(',')[0] || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
          address,
          type: categorizePlace(m.place),
          coordinate: { latitude: lat, longitude: lon },
          distance: formatDistance(calcDist),
          snap: Boolean((m.place as any).snap),
        } as FoodLocation;
      });

      const sorted = sortByDistance(nextLocations);
      setSortedLocations(sorted);
      setLastUpdated(Date.now());
      hasInitialLoad.current = true;
      isInitializing.current = false;
    } catch (error) {
      console.error('Error getting location:', error);
      hasInitialLoad.current = true;
      isInitializing.current = false;
    } finally {
      setLoading(false);
    }
  }, [reverseGeocodeCoords]);

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

  const filteredLocations = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...sortedLocations];

    if (activeFilter !== 'All') {
      list = list.filter((l) => {
        const t = (l.type || '').toLowerCase();
        if (activeFilter === 'Pantry') return /pantry|fridge/.test(t);
        if (activeFilter === 'Grocery') return /grocery|supermarket|store/.test(t);
        if (activeFilter === 'Market') return /market|farmer/.test(t);
        if (activeFilter === 'Food Bank') return /bank/.test(t);
        return true;
      });
    }

    if (q.length) {
      list = list.filter((l) => (l.name || '').toLowerCase().includes(q) || (l.address || '').toLowerCase().includes(q));
    }

    return list;
  }, [sortedLocations, activeFilter, query]);

  // Guarded onEndReached: only try to fetch more when there is something to paginate,
  // and when we're not already loading/refreshing/initializing.
  const onEndReached = useCallback(() => {
    if (loading || refreshing || isInitializing.current) return;
    // If the active filter results in zero visible items, don't trigger another fetch.
    if (!filteredLocations || filteredLocations.length === 0) return;
    void getCurrentLocation(true);
  }, [getCurrentLocation, loading, refreshing, filteredLocations, isInitializing]);

  const nearestMi = useMemo(() => toMiles(filteredLocations[0]?.distance || sortedLocations[0]?.distance), [filteredLocations, sortedLocations]);
  const score = useMemo(() => {
    const miles = nearestMi;
    if (!hasInitialLoad.current || !Number.isFinite(miles)) {
      return { label: 'LOADING', pct: 0.25, color: '#6b7280', hint: 'Finding food options near you...' };
    }
    const pct = Math.max(0.06, 1 - Math.min(miles / 3, 1));
    const label = miles <= 0.5 ? 'HIGH' : miles <= 1.5 ? 'MEDIUM' : 'LOW';
    const color = label === 'HIGH' ? '#15803d' : label === 'MEDIUM' ? '#f59e0b' : '#b91c1c';
    const hint =
      label === 'HIGH'
        ? 'Plenty of options within a short walk.'
        : label === 'MEDIUM'
        ? 'Some options are nearby.'
        : 'Few fresh food options within walking distance.';
    return { label, pct, color, hint };
  }, [nearestMi]);

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
  const openDetailsWithPrefetch = useCallback(
    async (item: FoodLocation) => {
      try {
        // Resolve address if missing or clearly placeholder
        let address = item.address;
        if (!address || /^\d+\.\d+,\s*-?\d+\.\d+/.test(address)) {
          const resolved = await reverseGeocodeCoords(item.coordinate.latitude, item.coordinate.longitude);
          address = resolved || address;
        }

        // Try to prefetch opening hours (best-effort)
        let hours: string[] | null = null;
        try {
          if (item.id) {
            const fetched = await getOpeningHours(String(item.id));
            if (fetched && fetched.length > 0) hours = fetched;
          }
        } catch (e) {
          // ignore; details page will attempt fetch if needed
          console.warn('prefetch getOpeningHours failed', e);
        }

        router.push({
          pathname: '/option/[id]',
          params: {
            id: item.id,
            name: item.name,
            type: item.type,
            address: address,
            distance: item.distance,
            latitude: item.coordinate.latitude.toString(),
            longitude: item.coordinate.longitude.toString(),
            snap: item.snap ? 'true' : 'false',
            ...(hours ? { hours: JSON.stringify(hours) } : {}),
          },
        });
      } catch (err) {
        console.error('openDetailsWithPrefetch error', err);
        // fallback: minimal push
        router.push({
          pathname: '/option/[id]',
          params: {
            id: item.id,
            name: item.name,
            type: item.type,
            address: item.address,
            distance: item.distance,
            latitude: item.coordinate.latitude.toString(),
            longitude: item.coordinate.longitude.toString(),
            snap: item.snap ? 'true' : 'false',
          },
        });
      }
    },
    [reverseGeocodeCoords, router]
  );

  // Enable LayoutAnimation on Android
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // Track which item is expanded and cache of resolved details (address / hours)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<Record<string, { address?: string | null; hours?: string[] | null; loading?: boolean }>>({});

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
      setExpandedDetails((p) => ({ ...p, [id]: { ...(p[id] || {}), loading: true } }));

      try {
        // Resolve address if missing/placeholder
        let address = item.address;
        if (!address || /^\d+\.\d+,\s*-?\d+\.\d+/.test(address)) {
          const resolved = await reverseGeocodeCoords(item.coordinate.latitude, item.coordinate.longitude);
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
          console.warn('prefetch getOpeningHours failed', e);
        }

        setExpandedDetails((p) => ({ ...p, [id]: { address, hours, loading: false } }));
      } catch (err) {
        console.warn('toggleExpand error', err);
        setExpandedDetails((p) => ({ ...p, [id]: { ...(p[id] || {}), loading: false } }));
      }
    },
    [expandedId, reverseGeocodeCoords]
  );

  return (
    <ThemedView style={styles.container}>
      {/* Sticky header */}
      <View style={styles.stickyHeader}>
        <ThemedText type="title" style={styles.header}>Cornucopia</ThemedText>
        <ThemedText type="default" style={styles.subtitle}>Find fresh, affordable food nearby.</ThemedText>
      </View>
      
      <FlatList
         data={loading || isInitializing.current ? [] : filteredLocations}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.2}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 28 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 8 }}>
            <View style={styles.searchContainer}>
              <View style={styles.searchBox}>
                <IconSymbol name="magnifyingglass" size={16} color="#6b7280" style={styles.searchIcon} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search by name or address"
                  placeholderTextColor="#8a8a8a"
                  style={styles.searchInput}
                  returnKeyType="search"
                />
                {query.length > 0 && (
                  <Pressable onPress={() => setQuery('')} style={styles.clearBtn}>
                    <IconSymbol name="xmark" size={12} color="#374151" style={styles.clearTxt as any} />
                  </Pressable>
                )}
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {filters.map((f) => (
                  <Pressable key={f} onPress={() => setActiveFilter(f)} style={[styles.chip, activeFilter === f && styles.chipActive]}>
                    <ThemedText style={[styles.chipText, activeFilter === f && styles.chipTextActive]}>{f}</ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <ThemedView style={[styles.scoreCard, styles.elevated]}>
              <ThemedText type="subtitle">Food Walkability Score</ThemedText>
              <ThemedText type="title" style={[styles.scoreValue, { color: score.color }]}>{score.label}</ThemedText>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.round(score.pct * 100)}%`, backgroundColor: score.color }]} />
              </View>
              <ThemedText style={styles.scoreDescription}>{score.hint}</ThemedText>
            </ThemedView>

            <ThemedView style={styles.sectionDivider} />

            <ThemedText type="subtitle" style={styles.sectionHeader}>Nearest Options</ThemedText>
            {lastUpdated !== null && !isInitializing.current && (
              <ThemedText style={styles.resultsMeta}>
                Showing {filteredLocations.length} result{filteredLocations.length === 1 ? '' : 's'}
                {filteredLocations.length !== sortedLocations.length ? ` (of ${sortedLocations.length} total)` : ''} · Updated {formattedLastUpdated}
              </ThemedText>
            )}

            {(loading || isInitializing.current) && (
              <View style={styles.loadingContainer}>
                <ThemedText style={styles.loadingText}>Loading options...</ThemedText>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading && !isInitializing.current ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <ThemedText style={{ opacity: 0.7, marginBottom: 8 }}>No locations found nearby.</ThemedText>
              <Pressable onPress={() => { setQuery(''); setActiveFilter('All'); }} style={styles.resetBtn}>
                <ThemedText style={{ color: 'white', fontWeight: '600' }}>Clear filters</ThemedText>
              </Pressable>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            android_ripple={{ color: '#00000010' }}
            onPress={() => void toggleExpand(item)}
            style={({ pressed }) => [styles.optionCard, styles.cardElevated, pressed && styles.cardPressed]}
          >
            <View style={styles.cardRow}>
              <View style={styles.leading}>
                <View style={styles.leadingIcon}>
                  <ThemedText style={styles.leadingEmoji}>{typeEmoji(item.type)}</ThemedText>
                </View>
              </View>

              <View style={styles.middle}>
                <View style={styles.titleRow}>
                  <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.optionTitle}>{item.name}</ThemedText>
                  <ThemedText style={styles.distancePill}>{item.distance}</ThemedText>
                </View>

                <View style={styles.subRow}>
                  <View style={styles.metaRow}>
                    <View style={styles.metaDot} />
                    <ThemedText style={styles.subtleText} numberOfLines={1}>{item.type}</ThemedText>
                  </View>
                  {item.snap ? (
                    <View style={styles.snapPill}>
                      <ThemedText style={styles.snapPillText}>SNAP</ThemedText>
                    </View>
                  ) : null}
                </View>

                {expandedId !== item.id && (
                  <View style={styles.addrRow}>
                    <ThemedText style={styles.addrIcon}>📍</ThemedText>
                    <ThemedText style={styles.optionAddress} numberOfLines={1}>{item.address}</ThemedText>
                  </View>
                )}

                {/* Inline expanded content (shows resolved address, opening hours, actions) */}
                {expandedId === item.id && (
                  <View style={styles.expandedContent}>
                    {expandedDetails[item.id]?.loading ? (
                      <ThemedText style={{ marginTop: 8, opacity: 0.8 }}>Loading details...</ThemedText>
                    ) : (
                      <>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                          <IconSymbol name="mappin" size={16} color="#6b7280" />
                          <ThemedText style={{ marginLeft: 8, flex: 1 }}>
                            {expandedDetails[item.id]?.address ?? item.address}
                          </ThemedText>
                        </View>

                        {expandedDetails[item.id]?.hours && expandedDetails[item.id].hours!.length > 0 && (
                          <View style={{ marginTop: 8 }}>
                            <ThemedText type="subtitle" style={{ marginBottom: 4 }}>Opening hours</ThemedText>
                            {expandedDetails[item.id].hours!.map((h, idx) => (
                              <ThemedText key={idx} style={{ fontSize: 13 }}>{h}</ThemedText>
                            ))}
                          </View>
                        )}

                        <View style={{ flexDirection: 'row', marginTop: 12, justifyContent: 'flex-end' }}>
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              handleQuickNavigation(item, e);
                            }}
                            style={styles.smallBtn}
                          >
                            <ThemedText style={{ color: 'white', fontWeight: '600' }}>Navigate →</ThemedText>
                          </Pressable>

                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              router.push({
                                pathname: '/option/[id]',
                                params: {
                                  id: item.id,
                                  name: item.name,
                                  type: item.type,
                                  address: expandedDetails[item.id]?.address ?? item.address,
                                  distance: item.distance,
                                  latitude: item.coordinate.latitude.toString(),
                                  longitude: item.coordinate.longitude.toString(),
                                  snap: item.snap ? 'true' : 'false',
                                },
                              });
                            }}
                            style={[styles.smallBtn, styles.smallBtnOutline]}
                          >
                            <ThemedText style={{ fontWeight: '600' }}>Open</ThemedText>
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
                <ThemedText style={styles.chevron}>{expandedId === item.id ? '‹' : '›'}</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', paddingTop: 60 },
  stickyHeader: { 
    paddingHorizontal: 20, 
    paddingBottom: 12, 
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6'
  },
  header: { marginTop: 4, fontSize: 34, fontWeight: '700', letterSpacing: 0.5 },
  subtitle: { marginBottom: 6, opacity: 0.75 },
  searchContainer: { marginTop: 8, marginBottom: 4, paddingHorizontal: 20 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 4 },
  clearBtn: { marginLeft: 8, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e5e7eb' },
  clearTxt: { fontWeight: '700', opacity: 0.7 },
  chipsRow: { gap: 8, paddingTop: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', marginRight: 8 },
  chipActive: { backgroundColor: '#1a73e8', borderColor: '#1a73e8' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: 'white', fontWeight: '600' },
  scoreCard: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#e5e5e5', backgroundColor: 'white', marginHorizontal: 20 },
  elevated: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  scoreValue: { fontSize: 30, fontWeight: '700', marginVertical: 4 },
  progressBar: { height: 8, borderRadius: 6, backgroundColor: '#eef2f7', overflow: 'hidden', marginVertical: 8 },
  progressFill: { height: '100%', borderRadius: 6 },
  scoreDescription: { opacity: 0.9, fontSize: 13, lineHeight: 18, color: '#374151' },
  sectionDivider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 14, marginHorizontal: 20 },
  sectionHeader: { marginTop: 10, paddingHorizontal: 20 },
  resultsMeta: { fontSize: 12, color: '#6b7280', marginBottom: 4, paddingHorizontal: 20 },
  loadingContainer: { padding: 16, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 16, opacity: 0.7 },
  optionCard: { 
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    marginVertical: 8,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  cardElevated: { 
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  cardPressed: { transform: [{ scale: 0.997 }], opacity: 0.98 },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  leading: { marginRight: 12 },
  leadingIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' },
  leadingEmoji: { fontSize: 18 },
  middle: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  optionTitle: { 
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#1f2937'
  },
  distancePill: { 
    marginLeft: 8,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
    fontWeight: '600'
  },
  subRow: { marginTop: 4, marginBottom: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#a3a3a3', marginRight: 6 },
  subtleText: { fontSize: 12, color: '#6b7280' },
  snapPill: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#e6f7eb',
    borderWidth: 1,
    borderColor: '#bfe5ca',
    alignSelf: 'flex-start',
  },
  snapPillText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  addrRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  addrIcon: { fontSize: 12, marginRight: 6, opacity: 0.7 },
  optionAddress: { 
    flex: 1,
    fontSize: 13,
    color: '#4b5563'
  },
  chevronButton: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  chevron: {
    color: '#9ca3af',
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 18 },
  resetBtn: { backgroundColor: '#1a73e8', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  // Expanded panel styles
  expandedContent: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  smallBtn: {
    backgroundColor: '#1a73e8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  smallBtnOutline: {
    backgroundColor: '#eef2f7',
    marginLeft: 8,
  },
});
