import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FoodLocation, foodLocations } from '@/constants/locations';
import { formatDistance, getDistance } from '@/utils/distance';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';

export default function HomeScreen() {
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortedLocations, setSortedLocations] = useState<FoodLocation[]>(foodLocations);

  useEffect(() => {
    async function getCurrentLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLoading(false);
          return;
        }

        const location = await Location.getCurrentPositionAsync({});
        setUserLocation(location);

        // Calculate distances and sort
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
        setSortedLocations(sorted.map(loc => ({
          ...loc,
          distance: formatDistance(loc.calculatedDistance),
        })));
      } catch (error) {
        console.error('Error getting location:', error);
      } finally {
        setLoading(false);
      }
    }

    getCurrentLocation();
  }, []);

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

      {loading ? (
        <ThemedView style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
          <ThemedText style={{ marginTop: 12, opacity: 0.7 }}>
            Getting your location...
          </ThemedText>
        </ThemedView>
      ) : (
        <FlatList
          data={sortedLocations}
          keyExtractor={(item) => item.id}
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
                <ThemedText style={styles.optionDistance}>
                  {item.distance}
                </ThemedText>
                <ThemedView style={styles.optionRow}>
                  <ThemedView style={{ flexDirection: 'column', flex: 1 }}>
                    <ThemedText type="defaultSemiBold">
                      {item.name}
                    </ThemedText>
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