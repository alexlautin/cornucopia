import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Callout, Marker, PROVIDER_DEFAULT, type Region } from 'react-native-maps';

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
  const [userHasMovedMap, setUserHasMovedMap] = useState(false);
  const lastLoadedRef = useRef<number>(0);
  const hasLoadedRef = useRef<boolean>(false);
  const mapRef = useRef<MapView | null>(null);

  // Track visible region to fetch what's in the field of view
  const [visibleRegion, setVisibleRegion] = useState<Region | null>(null);
  const regionDebounceRef = useRef<any>(null);

  // Map pin color by place type
  const pinColorMap: Record<string, string> = {
    'Food Bank': '#b91c1c',
    'Food Pantry': '#b91c1c',
    'Soup Kitchen': '#f59e0b',
    'Meal Delivery': '#16a34a',
    'Community Center': '#7c3aed',
    'Place of Worship': '#0ea5e9',
    'Charity': '#fb7185',
    'Social Facility': '#06b6d4',
    'Supermarket': '#059669',
    'Greengrocer': '#22c55e',
    'Convenience Store': '#f973a0',
    'Bakery': '#f97316',
    'Deli': '#f97316',
    'Market': '#f59e0b',
    'Farmers Market': '#f59e0b',
    'Other': '#2563eb',
  };

  const getPinColor = (type?: string) => {
    if (!type) return pinColorMap['Other'];
    const key = type.trim();
    return pinColorMap[key] ?? pinColorMap['Other'];
  };

  // Get user location immediately on mount
  const getUserLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      
      const location = await Location.getCurrentPositionAsync({});
      const newLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      
      setUserLocation(newLocation);
      
      // Auto-center on user location if they haven't moved the map
      if (!userHasMovedMap && mapRef.current) {
        mapRef.current.animateToRegion({
          ...newLocation,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }, 1000);
      }
    } catch (error) {
      console.error('Error getting user location:', error);
    }
  }, [userHasMovedMap]);

  // Initialize user location on mount
  useEffect(() => {
    getUserLocation();
    
    // Set up location watching
    const watchLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        
        return await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000, // Update every 10 seconds
            distanceInterval: 50, // Update if moved 50 meters
          },
          (location) => {
            const newLocation = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            };
            
            setUserLocation(newLocation);
            
            // Auto-center on user location if they haven't moved the map
            if (!userHasMovedMap && mapRef.current) {
              mapRef.current.animateToRegion({
                ...newLocation,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }, 1000);
            }
          }
        );
      } catch (error) {
        console.error('Error watching location:', error);
      }
    };
    
    let subscription: Location.LocationSubscription | undefined;
    watchLocation().then(sub => subscription = sub);
    
    return () => {
      subscription?.remove();
    };
  }, [userHasMovedMap]);

  // Accept an optional center/region so results match the visible map area.
  const loadLocations = useCallback(
    async (opts?: { force?: boolean; center?: Region }) => {
      const isStale = Date.now() - lastLoadedRef.current > STALE_MS;
      // If caller didn't force and we've loaded recently, short-circuit.
      if (!opts?.force && hasLoadedRef.current && !isStale && !opts?.center) return;

      // show spinner for first load or when forcing and we have no data
      if ((!hasLoadedRef.current || opts?.force) && locations.length === 0) setLoading(true);

      try {
        let centerLat: number;
        let centerLon: number;

        if (opts?.center) {
          // Use provided center (map's visible region) instead of device location
          centerLat = opts.center.latitude;
          centerLon = opts.center.longitude;
          // update userLocation so distance badges remain meaningful
          setUserLocation({ latitude: centerLat, longitude: centerLon });
        } else {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            setLoading(false);
            return;
          }
          const location = await Location.getCurrentPositionAsync({});
          centerLat = location.coords.latitude;
          centerLon = location.coords.longitude;
          if (!userLocation) {
            setUserLocation({ latitude: centerLat, longitude: centerLon });
          }
        }

        console.log('Fetching OSM data for center:', centerLat, centerLon);
        // Fetch real data from OSM
        const osmPlaces = await searchNearbyFoodLocations(
          centerLat,
          centerLon,
          undefined,
          (opts?.force || !hasLoadedRef.current) ? { force: true } : undefined
        );

        console.log(`Found ${osmPlaces.length} OSM places`);

        if (osmPlaces && osmPlaces.length > 0) {
          const mappedLocations: FoodLocation[] = osmPlaces.map((place, index) => {
            const lat = parseFloat(place.lat ?? '0');
            const lon = parseFloat(place.lon ?? '0');
            const distMiles = getDistance(centerLat, centerLon, lat, lon);
            return {
              id: place.place_id || `osm-${index}`,
              name: place.display_name.split(',')[0],
              address: formatOSMAddress(place),
              type: categorizePlace(place),
              coordinate: { latitude: lat, longitude: lon },
              distance: formatDistance(distMiles),
              snap: Boolean((place as any).snap),
            };
          });

          setLocations(mappedLocations);
        } else {
          // fallback: compute distances for static list relative to center
          const withDistances = foodLocations.map((loc) => ({
            ...loc,
            calculatedDistance: getDistance(centerLat, centerLon, loc.coordinate.latitude, loc.coordinate.longitude),
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
      } finally {
        hasLoadedRef.current = true;
        lastLoadedRef.current = Date.now();
        setLoading(false);
      }
    },
    [userLocation]
  );

  const centerOnUserLocation = useCallback(async () => {
    if (centeringLocation) return;
    setCenteringLocation(true);
    setUserHasMovedMap(false); // Reset the flag when manually centering
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

  // Handle when user manually moves the map
  const handleRegionChangeComplete = useCallback((region: Region) => {
    // mark that user moved the map and remember visible region
    setUserHasMovedMap(true);
    setVisibleRegion(region);

    // debounce calls while user is interacting
    if (regionDebounceRef.current) {
      clearTimeout(regionDebounceRef.current);
    }
    regionDebounceRef.current = setTimeout(() => {
      // load locations for the visible region; do not force spinner but ensure fresh results
      void loadLocations({ force: true, center: region });
    }, 450);
  }, [loadLocations]);

  useFocusEffect(
    useCallback(() => {
      // initial load uses device location
      void loadLocations();
    }, [loadLocations])
  );

  useEffect(() => {
    const unsubscribe = onOSMCacheCleared(() => {
      setLocations([]);
      setLoading(true);
      hasLoadedRef.current = false;
      lastLoadedRef.current = 0;
      // reload for current visible region if available, otherwise device location
      void loadLocations({ force: true, center: visibleRegion ?? undefined });
    });

    return unsubscribe;
  }, [loadLocations, visibleRegion]);

  // Center map: prefer user location, fallback to default Atlanta coordinates
  const mapRegion = userLocation || {
    latitude: 33.7676,
    longitude: -84.3908,
  };

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

  const getMarkerColor = useCallback((type?: string) => {
    if (!type) return '#2563eb'; // default blue
    const normalized = type.toLowerCase();
    
    // Map categories to colors
    if (/bank|pantry|fridge/.test(normalized)) return '#b91c1c'; // red for food banks/pantries
    if (/soup|kitchen/.test(normalized)) return '#f59e0b'; // amber for soup kitchens
    if (/delivery|meal/.test(normalized)) return '#16a34a'; // green for meal delivery
    if (/community|center/.test(normalized)) return '#7c3aed'; // purple for community centers
    if (/worship|church/.test(normalized)) return '#0ea5e9'; // sky blue for places of worship
    if (/charity/.test(normalized)) return '#fb7185'; // pink for charity
    if (/social|facility/.test(normalized)) return '#06b6d4'; // cyan for social facilities
    if (/supermarket|grocery|store/.test(normalized)) return '#059669'; // emerald for supermarkets
    if (/greengrocer/.test(normalized)) return '#22c55e'; // green for greengrocers
    if (/convenience/.test(normalized)) return '#f973a0'; // hot pink for convenience stores
    if (/bakery|deli/.test(normalized)) return '#f97316'; // orange for bakeries/delis
    if (/market|farmer/.test(normalized)) return '#f59e0b'; // amber for markets
    
    return '#2563eb'; // default blue
  }, []);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          ...mapRegion,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        onRegionChangeComplete={handleRegionChangeComplete}
        showsUserLocation
        showsMyLocationButton
        showsCompass
      >
        {locations.map((location) => (
          <Marker
            key={location.id}
            coordinate={location.coordinate}
          >
            <View style={[styles.markerContainer, { backgroundColor: getMarkerColor(location.type) }]}>
              <ThemedText style={styles.markerEmoji}>{typeEmoji(location.type)}</ThemedText>
            </View>
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
                    snap: location.snap ? 'true' : 'false',
                  },
                });
              }}
            >
              <View style={styles.calloutContainer}>
                <ThemedText style={styles.calloutTitle}>{location.name}</ThemedText>
                <View style={styles.calloutBadge}>
                  <ThemedText style={styles.calloutBadgeText}>{location.type}</ThemedText>
                </View>
                {location.snap ? (
                  <View style={[styles.calloutBadge, { backgroundColor: '#e6f7eb' }]}> 
                    <ThemedText style={[styles.calloutBadgeText, { color: '#166534' }]}>SNAP</ThemedText>
                  </View>
                ) : null}
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
  // make the map fill the full container so it reaches the bottom edge
  map: {
    ...StyleSheet.absoluteFillObject,
  },

  centerLocationButton: {
    position: 'absolute',
    // moved up so the button sits higher on the map
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
  markerContainer: {
    backgroundColor: '#2563eb', // default color, will be overridden
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  markerEmoji: {
    fontSize: 18,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
