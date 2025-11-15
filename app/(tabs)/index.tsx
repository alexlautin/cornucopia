import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FoodLocation, foodLocations } from '@/constants/locations';
import { formatDistance, getDistance } from '@/utils/distance';
import {
  categorizePlace,
  formatOSMAddress,
  onOSMCacheCleared,
  searchNearbyFoodLocations,
} from '@/utils/osm-api';
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

  useEffect(() => {
    const unsubscribe = onOSMCacheCleared(() => {
      setSortedLocations([]);
      setLoading(true);
      void getCurrentLocation(true);
    });

    return unsubscribe;
  }, [getCurrentLocation]);

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
        <ThemedText type="subtitle">Food Access Score</ThemedText>
        <ThemedText type="title" style={styles.scoreValue}>LOW</ThemedText>
        <ThemedText style={styles.scoreDescription}>
          Few fresh food options within walking distance.
        </ThemedText>
      </ThemedView>

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
              <ThemedView style={styles.optionCard}>
                <ThemedText style={styles.optionDistance}>{item.distance}</ThemedText>
                <ThemedView style={styles.optionRow}>
                  <ThemedView style={{ flexDirection: 'column', flex: 1 }}>
                    <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
                    <ThemedText style={styles.optionType}>{item.type}</ThemedText>
                    <ThemedText style={styles.optionAddress}>{item.address}</ThemedText>
                  </ThemedView>
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
                  >
                    <ThemedText style={styles.directionsText}>➤</ThemedText>
                  </Pressable>
                </ThemedView>
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
  },
  header: {
    marginTop: 10,
    fontSize: 32,
  },
  subtitle: {
    marginBottom: 10,
    opacity: 0.7,
  },
  scoreCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  scoreValue: {
    color: '#b91c1c',
    fontSize: 30,
    fontWeight: '700',
    marginVertical: 4,
  },
  scoreDescription: {
    opacity: 0.8,
  },
  sectionHeader: {
    marginTop: 16,
  },
  optionCard: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    marginVertical: 6,
  },
  optionType: {
    opacity: 0.7,
    marginTop: 2,
  },
  optionAddress: {
    opacity: 0.6,
    fontSize: 12,
    marginTop: 4,
  },
  optionDistance: {
    opacity: 0.6,
    marginBottom: 2,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  directionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#1a73e8',
    borderRadius: 20,
  },
  directionsText: {
    color: 'white',
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
