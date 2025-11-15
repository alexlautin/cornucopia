import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FoodLocation, foodLocations } from '@/constants/locations';
import { setForcedColorScheme } from '@/hooks/use-theme-color';
import { formatDistance, getDistance } from '@/utils/distance';
import { categorizePlace, formatOSMAddress, searchNearbyFoodLocations } from '@/utils/osm-api';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';

export default function HomeScreen() {
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); // new
  const [sortedLocations, setSortedLocations] = useState<FoodLocation[]>(foodLocations);

  const getCurrentLocation = useCallback(async (force?: boolean) => {
    // Only show the big loader on first load when we have no data yet
    if (!sortedLocations.length) setLoading(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setUserLocation(location);

      // Fetch OSM data (respect force for a fresh fetch)
      try {
        const osmPlaces = await searchNearbyFoodLocations(
          location.coords.latitude,
          location.coords.longitude,
          undefined,
          { force } // bypass caches on manual refresh
        );

        if (osmPlaces.length > 0) {
          const mapped: FoodLocation[] = osmPlaces.map((place, index) => ({
            id: place.place_id || `osm-${index}`,
            name: place.display_name.split(',')[0],
            address: formatOSMAddress(place),
            type: categorizePlace(place),
            coordinate: {
              latitude: parseFloat(place.lat),
              longitude: parseFloat(place.lon),
            },
            calculatedDistance: getDistance(
              location.coords.latitude,
              location.coords.longitude,
              parseFloat(place.lat),
              parseFloat(place.lon)
            ),
          }));

          const sorted = mapped.sort((a, b) => a.calculatedDistance - b.calculatedDistance);
          setSortedLocations(
            sorted.map((loc) => ({ ...loc, distance: formatDistance(loc.calculatedDistance) }))
          );
          return;
        }
      } catch (e) {
        // fall through to static fallback
      }

      // Fallback to static list with computed distances
      const withDistances = foodLocations.map((loc) => ({
        ...loc,
        calculatedDistance: getDistance(
          location.coords.latitude,
          location.coords.longitude,
          loc.coordinate.latitude,
          loc.coordinate.longitude
        ),
      }));
      const sorted = withDistances.sort((a, b) => a.calculatedDistance - b.calculatedDistance);
      setSortedLocations(sorted.map((loc) => ({ ...loc, distance: formatDistance(loc.calculatedDistance) })));
    } catch (error) {
      console.error('Error getting location:', error);
    } finally {
      setLoading(false);
    }
  }, [sortedLocations.length]);

  useEffect(() => {
    getCurrentLocation();
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
    void getCurrentLocation(true);
    // End the spinner after a short, fixed delay so it doesn't hang
    const MIN_SPINNER_MS = 1200;
    setTimeout(() => setRefreshing(false), MIN_SPINNER_MS);
  }, [refreshing, getCurrentLocation]);

  // Swipe up to bottom: do a silent background refresh (no spinner)
  const onEndReached = useCallback(() => {
    void getCurrentLocation(true);
  }, [getCurrentLocation]);

  const foodAccessScore = 0.25; // 0–1 scale; 0.25 = LOW
  const foodAccessLabel = 'LOW';
  const foodAccessDescription = 'Few fresh food options within walking distance.';

  return (
    <ThemedView style={styles.container}>
      {/* HEADER */}
      <ThemedText type="title" style={styles.header}>
        Cornucopia
      </ThemedText>
      <ThemedText type="default" style={styles.subtitle}>
        Helping you access fresh, affordable food nearby.
      </ThemedText>

      {/* FOOD ACCESS SCORE CARD */}
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
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.sectionDivider} />

      {/* NEARBY OPTIONS LIST */}
      <ThemedText type="subtitle" style={styles.sectionHeader}>
        Nearest Options
      </ThemedText>

      {loading && !sortedLocations.length ? (
        <ThemedView style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
          <ThemedText style={{ marginTop: 12, opacity: 0.7 }}>
            Finding food assistance near you...
          </ThemedText>
        </ThemedView>
      ) : (
        <FlatList
          data={sortedLocations}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.2}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.optionCard, pressed && { opacity: 0.92 }]}
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
            >
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
                  hitSlop={8}
                >
                  <ThemedText style={styles.directionsText}>➤</ThemedText>
                </Pressable>
              </ThemedView>
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
    marginBottom: 16,
    opacity: 0.7,
    fontSize: 15,
  },
  scoreCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    marginTop: 4,
    gap: 10,
  },
  scoreValue: {
    color: '#b91c1c',
    fontSize: 30,
    fontWeight: '700',
    marginVertical: 4,
  },
  scoreDescription: {
    opacity: 0.9,
    fontSize: 13,
    lineHeight: 18,
    color: '#374151',
  },
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
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});