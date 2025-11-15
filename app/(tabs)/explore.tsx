import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
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
  const [centeringLocation, setCenteringLocation] = useState(false);
  const lastLoadedRef = useRef<number>(0);
  const hasLoadedRef = useRef<boolean>(false);
  const mapRef = useRef<MapView | null>(null);

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
        // Filter out entries without valid numeric coordinates, then map
        const validPlaces = osmPlaces.filter((p) => {
          const lat = parseFloat(p.lat);
          const lon = parseFloat(p.lon);
          return Number.isFinite(lat) && Number.isFinite(lon);
        });

        const mappedLocations: FoodLocation[] = validPlaces.map((place, index) => ({
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

  const centerOnUserLocation = useCallback(async () => {
    if (centeringLocation) return;
    setCenteringLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setCenteringLocation(false);
        return;
      }
      const location = await Location.getCurrentPositionAsync({});
      const newLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setUserLocation(newLocation);
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          ...newLocation,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }, 800);
      }
    } catch (e) {
      console.error('Error centering on location:', e);
    } finally {
      setCenteringLocation(false);
    }
  }, [centeringLocation]);

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

  // Center map: prefer user location, otherwise center on first location so markers are visible
  const mapRegion = userLocation || (locations.length ? locations[0].coordinate : {
    latitude: 33.7676,
    longitude: -84.3908,
  });

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
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
                    latitude: location.coordinate.latitude.toString(),
                    longitude: location.coordinate.longitude.toString(),
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
                
                <View style={styles.calloutDetailsButton}>
                  <ThemedText style={styles.calloutDetailsText}>Tap for Details →</ThemedText>
                </View>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>
      
      {/* Center location button */}
      <Pressable
        style={[styles.centerLocationButton, centeringLocation && styles.centerLocationButtonActive]}
        onPress={centerOnUserLocation}
        disabled={centeringLocation}
        accessibilityLabel="Center map on my location"
      >
        {centeringLocation ? (
          <ActivityIndicator size="small" color="#2563eb" />
        ) : (
          <View style={styles.locationArrow}>
            <View style={styles.locationInnerDot} />
            <View style={styles.locationHalo} />
          </View>
        )}
      </Pressable>
+
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
    paddingBottom: 65,
  },
  centerLocationButton: {
    position: 'absolute',
    bottom: 110,
    right: 18,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  centerLocationButtonActive: {
    transform: [{ scale: 0.98 }],
  },
  locationArrow: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationInnerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2563eb',
    borderWidth: 2,
    borderColor: '#ffffff',
    zIndex: 2,
  },
  locationHalo: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(37, 99, 235, 0.14)',
    zIndex: 1,
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
    padding: 16,
    minWidth: 240,
    maxWidth: 280,
    backgroundColor: 'transparent',
    borderRadius: 0,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  calloutTitle: {
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 6,
    color: '#1f2937',
  },
  calloutBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  calloutBadgeText: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '600',
  },
  calloutDistance: {
    fontSize: 13,
    opacity: 0.7,
    marginBottom: 12,
    color: '#6b7280',
  },
  calloutDetailsButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  calloutDetailsText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
});
