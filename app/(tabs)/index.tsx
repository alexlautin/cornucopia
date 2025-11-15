import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
<<<<<<< HEAD
import { FoodLocation, foodLocations } from '@/constants/locations';
import { setForcedColorScheme } from '@/hooks/use-theme-color';
=======
import { FoodLocation } from '@/constants/locations';
>>>>>>> main
import { formatDistance, getDistance } from '@/utils/distance';
import {
  categorizePlace,
  formatOSMAddress,
  searchNearbyFoodLocations,
} from '@/utils/osm-api';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';

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
  // NEW: query/filter + last updated
  const [query, setQuery] = useState('');
  const filters = ['All', 'Pantry', 'Grocery', 'Market', 'Food Bank'] as const;
  const [activeFilter, setActiveFilter] = useState<typeof filters[number]>('All');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const hasInitialLoad = useRef(false);
  const isInitializing = useRef(true); // NEW: track true initialization
  const router = useRouter();
  const formattedLastUpdated = useMemo(() => {
    if (!lastUpdated) return '';
    try {
      return new Date(lastUpdated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return new Date(lastUpdated).toISOString();
    }
  }, [lastUpdated]);

  // Minimal emoji for type indicator
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

  // Helper: parse "0.8 mi" or "500 ft" into miles
  const toMiles = (d?: string) => {
    if (!d) return Number.POSITIVE_INFINITY;
    const n = parseFloat(d);
    if (Number.isNaN(n)) return Number.POSITIVE_INFINITY;
    return /ft/i.test(d) ? n / 5280 : n;
  };

  const getCurrentLocation = useCallback(async (force?: boolean) => {
    // Always show loader on initial load or forced refresh
    if (!hasInitialLoad.current || force) {
      setLoading(true);
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission not granted');
        setLoading(false);
        hasInitialLoad.current = true;
        isInitializing.current = false;
        return;
      }

      console.log('Getting current position...');
      const locationData = await Location.getCurrentPositionAsync({});
      console.log('Current position:', locationData.coords.latitude, locationData.coords.longitude);

      // Only fetch OSM data with larger radius
      console.log('Fetching OSM data...');
      
      // Add timeout protection
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout after 30s')), 30000);
      });
      
      const osmPlaces = await Promise.race([
        searchNearbyFoodLocations(
          locationData.coords.latitude,
          locationData.coords.longitude,
          10, // Increased from default 5km to 10km
          force ? { force: true } : undefined // bypass caches on manual refresh
        ),
        timeoutPromise
      ]);

      console.log(`Fetched ${osmPlaces.length} places from OSM`);

      if (osmPlaces.length === 0) {
        console.warn('No OSM places found in the area');
        setSortedLocations([]);
        setLastUpdated(Date.now());
        hasInitialLoad.current = true;
        isInitializing.current = false;
        setLoading(false);
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
          name: place.display_name.split(',')[0],
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
      console.log('Setting sorted locations...');
      setSortedLocations(sorted);
      setLastUpdated(Date.now());
      hasInitialLoad.current = true;
      isInitializing.current = false;
      console.log('Location fetch complete');
    } catch (error) {
      console.error('Error getting location:', error);
      hasInitialLoad.current = true;
      isInitializing.current = false;
      // Don't set fallback data on error
    } finally {
      setLoading(false);
    }
  }, []); // Empty deps is fine - we use refs for tracking state

  useEffect(() => {
    if (!hasInitialLoad.current) {
      getCurrentLocation();
    }
  }, [getCurrentLocation]);

  // Force light theme while Home is mounted, then restore default on unmount
  useEffect(() => {
    setForcedColorScheme('light');
    return () => setForcedColorScheme(undefined);
  }, []);

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

<<<<<<< HEAD
  const foodAccessScore = 0.25; // 0–1 scale; 0.25 = LOW
  const foodAccessLabel = 'LOW';
  const foodAccessDescription = 'Few fresh food options within walking distance.';
=======
  // Derived: filtered list for UI
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

  // Dynamic Food Access Score based on nearest distance
  const nearestMi = useMemo(() => toMiles(filteredLocations[0]?.distance || sortedLocations[0]?.distance), [filteredLocations, sortedLocations]);
  const score = useMemo(() => {
    const miles = nearestMi;
    // Don't show UNKNOWN during initial load
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
  }, [nearestMi, hasInitialLoad.current]);
>>>>>>> main

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
            <Pressable onPress={() => setQuery('')} style={styles.clearBtn}>
              <ThemedText style={styles.clearTxt}>✕</ThemedText>
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

      {/* FOOD ACCESS SCORE CARD */}
<<<<<<< HEAD
      <ThemedView style={styles.scoreCard}>
        <ThemedView style={styles.scoreHeaderRow}>
          <ThemedText type="subtitle">Food Walkability Score</ThemedText>
          <ThemedText style={styles.scorePill}>{foodAccessLabel}</ThemedText>
        </ThemedView>

        <ThemedView style={styles.scoreBarContainer}>
          <ThemedView style={styles.scoreBarTrack}>
            <ThemedView
              style={[
                styles.scoreBarFill,
                { width: `${foodAccessScore * 100}%` },
              ]}
            />
          </ThemedView>
          <ThemedText style={styles.scoreNumeric}>
            {Math.round(foodAccessScore * 100)}/100
          </ThemedText>
        </ThemedView>

        <ThemedText style={styles.scoreDescription}>
          {foodAccessDescription}
=======
      <ThemedView style={[styles.scoreCard, styles.elevated]}>
        <ThemedText type="subtitle">Food Access Score</ThemedText>
        <ThemedText type="title" style={[styles.scoreValue, { color: score.color }]}>
          {score.label}
>>>>>>> main
        </ThemedText>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${Math.round(score.pct * 100)}%`, backgroundColor: score.color }]} />
        </View>
        <ThemedText style={styles.scoreDescription}>{score.hint}</ThemedText>
      </ThemedView>
      <ThemedView style={styles.sectionDivider} />

      {/* NEARBY OPTIONS LIST */}
      <ThemedText type="subtitle" style={styles.sectionHeader}>
        Nearest Options
      </ThemedText>
      {lastUpdated !== null && !isInitializing.current && (
        <ThemedText style={styles.resultsMeta}>
          Showing {filteredLocations.length} result{filteredLocations.length === 1 ? '' : 's'}
          {filteredLocations.length !== sortedLocations.length ? ` (of ${sortedLocations.length} total)` : ''} · Updated {formattedLastUpdated}
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.2}
          contentContainerStyle={{ paddingBottom: 28 }}
          ListEmptyComponent={
            <View style={{ padding: 24, alignItems: 'center' }}>
              <ThemedText style={{ opacity: 0.7, marginBottom: 8 }}>
                No locations found nearby.
              </ThemedText>
              <Pressable onPress={() => { setQuery(''); setActiveFilter('All'); }} style={styles.resetBtn}>
                <ThemedText style={{ color: 'white', fontWeight: '600' }}>Clear filters</ThemedText>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
<<<<<<< HEAD
              style={({ pressed }) => [styles.optionCard, pressed && { opacity: 0.92 }]}
=======
              android_ripple={{ color: '#00000010' }}
>>>>>>> main
              onPress={() =>
                router.push({
                  pathname: '/option/[id]',
                  params: {
                    id: item.id,
                    name: item.name,
                    type: item.type,
                    address: item.address,
                    distance: item.distance,
                  },
                })
              }
              style={({ pressed }) => [styles.optionCard, styles.cardElevated, pressed && styles.cardPressed]}
            >
<<<<<<< HEAD
              <ThemedView style={styles.optionHeaderRow}>
                <ThemedView style={{ flex: 1 }}>
                  <ThemedText style={styles.optionName}>{item.name}</ThemedText>
                  <ThemedText style={styles.optionAddress}>{item.address}</ThemedText>
                </ThemedView>
                <ThemedView style={styles.distanceBadge}>
                  <ThemedText style={styles.distanceBadgeText}>{item.distance}</ThemedText>
                </ThemedView>
              </ThemedView>
              <ThemedView style={styles.optionFooterRow}>
                <ThemedText style={styles.optionTypeTag}>{item.type}</ThemedText>
                <Pressable
                  style={styles.directionsButton}
                  onPress={(e) => {
                    e.stopPropagation();
=======
              <View style={styles.cardRow}>
                <View style={styles.leading}>
                  <View style={styles.leadingIcon}>
                    <ThemedText style={styles.leadingEmoji}>{typeEmoji(item.type)}</ThemedText>
                  </View>
                </View>

                <View style={styles.middle}>
                  <View style={styles.titleRow}>
                    <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.optionTitle}>
                      {item.name}
                    </ThemedText>
                    <ThemedText style={styles.distancePill}>{item.distance}</ThemedText>
                  </View>

                  <View style={styles.subRow}>
                    <View style={styles.metaRow}>
                      <View style={styles.metaDot} />
                      <ThemedText style={styles.subtleText} numberOfLines={1}>{item.type}</ThemedText>
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
>>>>>>> main
                    router.push({
                      pathname: '/option/[id]',
                      params: {
                        id: item.id,
                        name: item.name,
                        type: item.type,
                        address: item.address,
                        distance: item.distance,
                      },
                    });
                  }}
<<<<<<< HEAD
                  hitSlop={8}
                >
                  <ThemedText style={styles.directionsText}>➤</ThemedText>
                </Pressable>
              </ThemedView>
=======
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <ThemedText style={styles.chevron}>›</ThemedText>
                </Pressable>
              </View>
>>>>>>> main
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
    backgroundColor: '#ffffff', // changed from dark slate background to white
    paddingBottom: 20,
  },
  header: {
    marginTop: 4,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subtitle: {
<<<<<<< HEAD
    marginBottom: 16,
=======
    marginBottom: 6,
    opacity: 0.75,
  },

  // Search
  searchContainer: {
    marginTop: 8,
    marginBottom: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
>>>>>>> main
    opacity: 0.7,
    fontSize: 15,
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5e7eb',
  },
  clearTxt: { fontWeight: '700', opacity: 0.7 },
  chipsRow: {
    gap: 8,
    paddingTop: 10,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#1a73e8',
    borderColor: '#1a73e8',
  },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: 'white', fontWeight: '600' },

  // Score card
  scoreCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
<<<<<<< HEAD
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    marginTop: 4,
    gap: 10,
=======
    borderColor: '#e5e5e5',
    backgroundColor: 'white',
  },
  elevated: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
>>>>>>> main
  },
  scoreValue: {
    fontSize: 30,
    fontWeight: '700',
    marginVertical: 4,
  },
  progressBar: {
    height: 8,
    borderRadius: 6,
    backgroundColor: '#eef2f7',
    overflow: 'hidden',
    marginVertical: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  scoreDescription: {
    opacity: 0.9,
    fontSize: 13,
    lineHeight: 18,
    color: '#374151',
  },
<<<<<<< HEAD
  scoreHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scorePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    overflow: 'hidden',
  },
  scoreBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 2,
  },
  scoreBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#fb923c',
  },
  scoreNumeric: {
    fontSize: 11,
    color: '#374151',
    opacity: 0.9,
    width: 50,
    textAlign: 'right',
  },
  sectionHeader: {
    marginTop: 4,
    marginBottom: 6,
    fontSize: 17,
    fontWeight: '700',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginVertical: 14,
  },
  optionCard: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginVertical: 6,
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
    gap: 10,
  },
  optionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  optionName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 2,
  },
  optionAddress: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 16,
  },
  distanceBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  distanceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0f172a',
    letterSpacing: 0.3,
  },
  optionFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  optionTypeTag: {
    backgroundColor: '#ecfdf5',
    color: '#047857',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  directionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#059669',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  directionsText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12,
    letterSpacing: 0.5,
=======

  sectionHeader: {
    marginTop: 10,
  },
  resultsMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },

  // List items (minimal)
  optionCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'white',
    marginVertical: 6,
  },
  cardElevated: {
    shadowColor: '#000',
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
    flexDirection: 'row',
    alignItems: 'center',
  },
  leading: {
    marginRight: 12,
>>>>>>> main
  },
  leadingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  leadingEmoji: { fontSize: 18 },
  middle: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    backgroundColor: '#f3f4f6',
    color: '#374151',
  },
  subRow: {
    marginTop: 4,
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#a3a3a3',
    marginRight: 6,
  },
  subtleText: {
    fontSize: 12,
    color: '#6b7280',
  },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  addrIcon: {
    fontSize: 12,
    marginRight: 6,
    opacity: 0.7,
  },
  optionAddress: {
  },flex: 1,
  optionAddress: {
    flex: 1,ton: {
  },marginLeft: 8,
  chevronButton: {tal: 2,
    marginLeft: 8,l: 2,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },color: '#9ca3af',
  chevron: {ht: '700',
    color: '#9ca3af',
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 18,
  }, ADD: loading + skeleton styles (fix corrupted section)
  loadingContainer: {
  // ADD: loading + skeleton styles (fix corrupted section)
  loadingContainer: {
    padding: 16,
    alignItems: 'center',textAlign: 'center',
    justifyContent: 'center',80',
  },6,
  loadingText: {20,
    fontSize: 16,
    opacity: 0.7,
  },backgroundColor: '#1a73e8',
  skeletonCard: {rizontal: 14,
    height: 72,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    marginVertical: 6,
  }, Keep existing legacy refs (deduplicated)
  resetBtn: {  optionType: { opacity: 0.7, marginTop: 2 },
    backgroundColor: '#1a73e8',m: 2 },
    paddingHorizontal: 14,tWeight: '600' },
    paddingVertical: 8,
    borderRadius: 999,  },
  // Keep existing legacy refs (deduplicated)
  optionType: { opacity: 0.7, marginTop: 2 },
  optionDistance: { opacity: 0.6, marginBottom: 2 },
  directionsTextLegacy: { color: 'white', fontWeight: '600' },
});
