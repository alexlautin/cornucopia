import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import MapView, { Callout, Marker, PROVIDER_DEFAULT } from 'react-native-maps';

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

const STALE_MS = 5 * 60 * 1000;

export default function TabTwoScreen() {
  const [locations, setLocations] = useState<FoodLocation[]>(foodLocations);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const lastLoadedRef = useRef<number>(0);
  const hasLoadedRef = useRef<boolean>(false);

  const loadLocations = useCallback(async (opts?: { force?: boolean }) => {
    const isStale = Date.now() - lastLoadedRef.current > STALE_MS;
    if (!opts?.force && hasLoadedRef.current && !isStale) return;

    // When forcing or first load with empty data, show spinner
    if ((!hasLoadedRef.current || opts?.force) && locations.length === 0) setLoading(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      console.log('Fetching OSM data...');
      // Fetch real data from OSM
      const osmPlaces = await searchNearbyFoodLocations(
        location.coords.latitude,
        location.coords.longitude,
        undefined,
        opts?.force ? { force: true } : undefined
      );

      console.log(`Found ${osmPlaces.length} OSM places`);

      if (osmPlaces.length > 0) {
        const mappedLocations: FoodLocation[] = osmPlaces.map((place, index) => ({
          id: place.place_id || `osm-${index}`,
          name: place.display_name.split(',')[0],
          address: formatOSMAddress(place),
          type: categorizePlace(place),
          coordinate: {
            latitude: parseFloat(place.lat),
            longitude: parseFloat(place.lon),
          },
          distance: formatDistance(
            getDistance(
              location.coords.latitude,
              location.coords.longitude,
              parseFloat(place.lat),
              parseFloat(place.lon)
            )
          ),
        }));

        setLocations(mappedLocations);
      } else {
        // Fall back to static list with computed distances so we always show something
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
        setLocations(
          sorted.map((loc) => ({
            ...loc,
            distance: formatDistance(loc.calculatedDistance),
          }))
        );
      }
    } catch (error) {
      console.error('Error loading locations:', error);
      // Fall back to static data
    } finally {
      hasLoadedRef.current = true;
      lastLoadedRef.current = Date.now();
      setLoading(false);
    }
  }, [locations]);

  useFocusEffect(
    useCallback(() => {
      loadLocations();
    }, [loadLocations])
  );

  useEffect(() => {
    const unsubscribe = onOSMCacheCleared(() => {
      setLocations([]);
      setLoading(true);
      hasLoadedRef.current = false;
      lastLoadedRef.current = 0;
      void loadLocations({ force: true });
    });

    return unsubscribe;
  }, [loadLocations]);

  const mapRegion = userLocation || {
    latitude: 33.7676,
    longitude: -84.3908,
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          ...mapRegion,
          latitudeDelta: 0.15,
          longitudeDelta: 0.15,
        }}
        showsUserLocation
        showsMyLocationButton
        showsCompass
      >
        {locations.map((location) => (
          <Marker
            key={location.id}
            coordinate={location.coordinate}
            pinColor="#2563eb"
          >
            <Callout
              onPress={() => {
                router.push({
                  pathname: '/option/[id]',
                  params: {
                    id: location.id,
                    name: location.name,
                    type: location.type,
                    address: location.address,
                    distance: location.distance,
                  },
                });
              }}
            >
              <View style={styles.calloutContainer}>
                <ThemedText style={styles.calloutTitle}>{location.name}</ThemedText>
                <View style={styles.calloutBadge}>
                  <ThemedText style={styles.calloutBadgeText}>{location.type}</ThemedText>
                </View>
                {location.distance && (
                  <ThemedText style={styles.calloutDistance}>{location.distance}</ThemedText>
                )}
                <ThemedText style={styles.calloutTap}>Tap for details →</ThemedText>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>
      
      <ThemedView style={styles.floatingHeader}>
        <ThemedText type="title" style={styles.headerTitle}>
          Explore
        </ThemedText>
        <ThemedText style={styles.headerSubtitle}>
          {loading ? 'Loading nearby options...' : `${locations.length} food options nearby`}
        </ThemedText>
        {loading && <ActivityIndicator size="small" style={{ marginTop: 8 }} />}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  floatingHeader: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  headerTitle: {
    fontSize: 28,
    marginBottom: 4,
  },
  headerSubtitle: {
    opacity: 0.7,
    fontSize: 14,
  },
  calloutContainer: {
    padding: 12,
    minWidth: 220,
    maxWidth: 260,
    gap: 6,
  },
  calloutTitle: {
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 4,
  },
  calloutBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 2,
  },
  calloutBadgeText: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '600',
  },
  calloutDistance: {
    fontSize: 13,
    opacity: 0.7,
    marginTop: 2,
  },
  calloutTap: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '700',
    marginTop: 6,
  },
});
