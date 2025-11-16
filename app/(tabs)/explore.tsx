import * as Location from "expo-location";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import MapView, { Callout, Marker, PROVIDER_DEFAULT } from "react-native-maps";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { FoodLocation, foodLocations } from "@/constants/locations";
import { formatDistance, getDistance } from "@/utils/distance";
import {
  categorizePlace,
  formatOSMAddress,
  getAllPlacesOnce,
} from "@/utils/osm-api";

const DEBUG =
  (typeof process !== "undefined" &&
    (process.env.EXPO_PUBLIC_DEBUG_OSM === "1" ||
      process.env.EXPO_PUBLIC_DEBUG_OSM === "true")) ||
  false;
const dlog = (...args: any[]) => {
  if (DEBUG) console.log("EXPLORE:", ...args);
};

export default function TabTwoScreen() {
  const [locations, setLocations] = useState<FoodLocation[]>(foodLocations);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [centeringLocation, setCenteringLocation] = useState(false);
  const [userHasMovedMap, setUserHasMovedMap] = useState(false);
  const [trackMarkerUpdates, setTrackMarkerUpdates] = useState(true);
  const hasLoadedRef = useRef<boolean>(false);
  const mapRef = useRef<MapView | null>(null);

  // Prevent overlapping fetches that would all force on initial load
  const isFetchingRef = useRef<boolean>(false);

  // Get user location immediately on mount
  const getUserLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const location = await Location.getCurrentPositionAsync({});
      const newLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setUserLocation(newLocation);

      // Auto-center on user location if they haven't moved the map
      if (!userHasMovedMap && mapRef.current) {
        mapRef.current.animateToRegion(
          {
            ...newLocation,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          },
          1000
        );
      }
    } catch (error) {
      console.error("Error getting user location:", error);
    }
  }, [userHasMovedMap]);

  // Initialize user location on mount
  useEffect(() => {
    getUserLocation();

    // Set up location watching
    const watchLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

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
              mapRef.current.animateToRegion(
                {
                  ...newLocation,
                  latitudeDelta: 0.05,
                  longitudeDelta: 0.05,
                },
                1000
              );
            }
          }
        );
      } catch (error) {
        console.error("Error watching location:", error);
      }
    };

    let subscription: Location.LocationSubscription | undefined;
    watchLocation().then((sub) => (subscription = sub));

    return () => {
      subscription?.remove();
    };
  }, [getUserLocation, userHasMovedMap]);

  const loadLocations = useCallback(async () => {
    if (hasLoadedRef.current || isFetchingRef.current) return;

    isFetchingRef.current = true;
    setLoading(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const centerLat = location.coords.latitude;
      const centerLon = location.coords.longitude;
      const newLocation = {
        latitude: centerLat,
        longitude: centerLon,
      };

      setUserLocation(newLocation);

      dlog("load.start", { centerLat, centerLon });
      const t0 = Date.now();
      const osmPlaces = await getAllPlacesOnce();
      const t1 = Date.now();
      dlog("load.fetch.done", { count: osmPlaces.length, fetchMs: t1 - t0 });

      if (osmPlaces && osmPlaces.length > 0) {
        const m0 = Date.now();
        const mappedLocations: FoodLocation[] = osmPlaces.map(
          (place, index) => {
            const lat = parseFloat(place.lat ?? "0");
            const lon = parseFloat(place.lon ?? "0");
            const distMiles = getDistance(centerLat, centerLon, lat, lon);
            const pl =
              (place as any).price_level &&
              Number.isFinite((place as any).price_level)
                ? Math.max(
                    1,
                    Math.min(3, Math.round((place as any).price_level))
                  )
                : undefined;
            return {
              id: place.place_id || `osm-${index}`,
              name: place.display_name.split(",")[0],
              address: formatOSMAddress(place),
              type: categorizePlace(place),
              coordinate: { latitude: lat, longitude: lon },
              distance: formatDistance(distMiles),
              snap: Boolean((place as any).snap),
              priceLevel: pl as 1 | 2 | 3 | undefined,
            };
          }
        );
        dlog("load.map.done", {
          mapMs: Date.now() - m0,
          count: mappedLocations.length,
        });
        setTrackMarkerUpdates(true);
        setLocations(mappedLocations);
        dlog("load.setLocations", {
          count: mappedLocations.length,
          totalMs: Date.now() - t0,
        });
        hasLoadedRef.current = true;
        setTimeout(() => setTrackMarkerUpdates(false), 600);
      } else {
        const withDistances = foodLocations.map((loc) => ({
          ...loc,
          calculatedDistance: getDistance(
            centerLat,
            centerLon,
            loc.coordinate.latitude,
            loc.coordinate.longitude
          ),
        }));
        const sorted = withDistances.sort(
          (a, b) => a.calculatedDistance - b.calculatedDistance
        );
        setTrackMarkerUpdates(true);
        setLocations(
          sorted.map((loc) => ({
            ...loc,
            distance: formatDistance(loc.calculatedDistance),
          }))
        );
        hasLoadedRef.current = true;
        setTimeout(() => setTrackMarkerUpdates(false), 600);
      }
    } catch (error) {
      console.error("Error loading locations:", error);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, []);

  const centerOnUserLocation = useCallback(async () => {
    if (centeringLocation) return;
    setCenteringLocation(true);
    setUserHasMovedMap(false); // Reset the flag when manually centering
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
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
        mapRef.current.animateToRegion(
          {
            ...newLocation,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          },
          800
        );
      }
    } catch (e) {
      console.error("Error centering on location:", e);
    } finally {
      setCenteringLocation(false);
    }
  }, [centeringLocation]);

  // Handle when user manually moves the map
  const handleRegionChangeComplete = useCallback(() => {
    setUserHasMovedMap(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      // initial load uses device location
      void loadLocations();
    }, [loadLocations])
  );

  // Center map: prefer user location, fallback to default Atlanta coordinates
  const mapRegion = userLocation || {
    latitude: 33.7676,
    longitude: -84.3908,
  };

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

  const getMarkerColor = useCallback((type?: string) => {
    if (!type) return "#2563eb"; // default blue
    const normalized = type.toLowerCase();

    // Map categories to colors
    if (/bank|pantry|fridge/.test(normalized)) return "#b91c1c"; // red for food banks/pantries
    if (/soup|kitchen/.test(normalized)) return "#f59e0b"; // amber for soup kitchens
    if (/delivery|meal/.test(normalized)) return "#16a34a"; // green for meal delivery
    if (/community|center/.test(normalized)) return "#7c3aed"; // purple for community centers
    if (/worship|church/.test(normalized)) return "#0ea5e9"; // sky blue for places of worship
    if (/charity/.test(normalized)) return "#fb7185"; // pink for charity
    if (/social|facility/.test(normalized)) return "#06b6d4"; // cyan for social facilities
    if (/supermarket|grocery|store/.test(normalized)) return "#059669"; // emerald for supermarkets
    if (/greengrocer/.test(normalized)) return "#22c55e"; // green for greengrocers
    if (/convenience/.test(normalized)) return "#f973a0"; // hot pink for convenience stores
    if (/bakery|deli/.test(normalized)) return "#f97316"; // orange for bakeries/delis
    if (/market|farmer/.test(normalized)) return "#f59e0b"; // amber for markets

    return "#2563eb"; // default blue
  }, []);

  const markerCountLabel = loading
    ? "Loading nearby options..."
    : locations.length === 0
    ? "No options available"
    : `${locations.length} food options nearby`;

  const hudSubtitle = loading ? "Scanning for fresh food..." : markerCountLabel;

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
        {locations.map((location: FoodLocation) => (
          <Marker
            key={location.id}
            coordinate={location.coordinate}
            pinColor={getMarkerColor(location.type)}
            tracksViewChanges={trackMarkerUpdates}
          >
            <View
              style={[
                styles.markerContainer,
                { backgroundColor: getMarkerColor(location.type) },
              ]}
            >
              <ThemedText style={styles.markerEmoji}>
                {typeEmoji(location.type)}
              </ThemedText>
            </View>
            <Callout
              onPress={() => {
                router.push({
                  pathname: "/option/[id]",
                  params: {
                    id: location.id,
                    name: location.name,
                    type: location.type,
                    address: location.address,
                    distance: location.distance,
                    latitude: location.coordinate.latitude.toString(),
                    longitude: location.coordinate.longitude.toString(),
                    snap: location.snap ? "true" : "false",
                    ...(location.priceLevel
                      ? { price: String(location.priceLevel) }
                      : {}),
                  },
                });
              }}
            >
              <View style={styles.calloutContainer}>
                <ThemedText style={styles.calloutTitle}>
                  {location.name}
                </ThemedText>
                <View style={styles.calloutBadgesRow}>
                  <View style={styles.calloutBadge}>
                    <ThemedText style={styles.calloutBadgeText}>
                      {location.type}
                    </ThemedText>
                  </View>
                  {location.snap ? (
                    <View
                      style={[
                        styles.calloutBadge,
                        { backgroundColor: "#e6f7eb" },
                      ]}
                    >
                      <ThemedText
                        style={[styles.calloutBadgeText, { color: "#166534" }]}
                      >
                        SNAP
                      </ThemedText>
                    </View>
                  ) : null}
                  {location.priceLevel ? (
                    <View
                      style={[
                        styles.calloutBadge,
                        { backgroundColor: "#eef2ff" },
                      ]}
                    >
                      <ThemedText
                        style={[styles.calloutBadgeText, { color: "#3730a3" }]}
                      >
                        {"$".repeat(location.priceLevel)}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
                {location.distance && (
                  <ThemedText style={styles.calloutDistance}>
                    {location.distance}
                  </ThemedText>
                )}

                <View style={styles.calloutDetailsButton}>
                  <ThemedText style={styles.calloutDetailsText}>
                    Tap for Details →
                  </ThemedText>
                </View>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      <Pressable
        style={[
          styles.centerLocationButton,
          centeringLocation && styles.centerLocationButtonActive,
        ]}
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

      <ThemedView style={styles.floatingHeader} intensity={80}>
        <ThemedText type="title" style={styles.headerTitle}>
          Explore nearby
        </ThemedText>
        <ThemedText style={styles.headerSubtitle}>{hudSubtitle}</ThemedText>
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
    position: "absolute",
    // moved up so the button sits higher on the map
    bottom: 110,
    right: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(15,23,42,0.9)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  centerLocationButtonActive: {
    transform: [{ scale: 0.98 }],
  },
  locationArrow: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  locationInnerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#60a5fa",
    borderWidth: 2,
    borderColor: "#0f172a",
    zIndex: 2,
  },
  locationHalo: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(96, 165, 250, 0.15)",
    zIndex: 1,
  },
  floatingHeader: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderRadius: 24,
    gap: 6,
    backgroundColor: "rgba(15,23,42,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 10,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#ffffff",
  },
  headerSubtitle: {
    opacity: 0.9,
    fontSize: 14,
    color: "#cbd5f5",
  },
  calloutContainer: {
    padding: 18,
    minWidth: 240,
    maxWidth: 280,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 18,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    alignItems: "flex-start",
  },
  calloutTitle: {
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 6,
    color: "#1f2937",
  },
  calloutBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 4,
    justifyContent: "flex-start",
    alignSelf: "flex-start",
  },
  calloutBadge: {
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginBottom: 4,
    marginRight: 6,
  },
  calloutBadgeText: {
    color: "#0369a1",
    fontSize: 12,
    fontWeight: "600",
  },
  calloutDistance: {
    fontSize: 13,
    opacity: 0.7,
    marginBottom: 12,
    color: "#6b7280",
  },
  calloutDetailsButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  calloutDetailsText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
  markerContainer: {
    backgroundColor: "#2563eb",
    borderRadius: 18,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  markerEmoji: {
    fontSize: 18,
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
