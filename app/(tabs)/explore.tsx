import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import MapView, { Callout, Marker, PROVIDER_DEFAULT } from 'react-native-maps';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { foodLocations } from '@/constants/locations';

export default function TabTwoScreen() {
  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          latitude: 33.7676,
          longitude: -84.3908,
          latitudeDelta: 0.15,
          longitudeDelta: 0.15,
        }}
        showsUserLocation
        showsMyLocationButton
        showsCompass
      >
        {foodLocations.map((location) => (
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
                <ThemedText style={styles.calloutDistance}>{location.distance}</ThemedText>
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
          {foodLocations.length} food options nearby
        </ThemedText>
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
