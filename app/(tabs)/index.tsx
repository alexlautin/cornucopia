import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet } from 'react-native';

export default function HomeScreen() {
  // Temporary mock data — replace with real data soon
  const nearbyOptions = [
    { id: '1', name: 'Community Fridge – 0.4 miles', type: 'Free Produce' },
    { id: '2', name: 'Farmers Market – 0.8 miles', type: 'Fresh Veggies + SNAP' },
    { id: '3', name: 'Low-Cost Produce Stand – 1.1 miles', type: 'Affordable' },
  ];

  return (
    <ThemedView style={styles.container}>
      {/* HEADER */}
      <ThemedText type="title" style={styles.header}>
        Food App
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

      <FlatList
        data={nearbyOptions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ThemedView style={styles.optionCard}>
            <ThemedText style={styles.optionDistance}>
              {item.name.split('–')[1]?.trim()}
            </ThemedText>
            <ThemedView style={styles.optionRow}>
              <ThemedView style={{ flexDirection: 'column' }}>
                <ThemedText type="defaultSemiBold">
                  {item.name.split('–')[0]?.trim()}
                </ThemedText>
                <ThemedText style={styles.optionType}>{item.type}</ThemedText>
              </ThemedView>
              <Pressable style={styles.directionsButton}>
                <ThemedText style={styles.directionsText}>➤</ThemedText>
              </Pressable>
            </ThemedView>
          </ThemedView>
        )}
      />

      {/* VIEW MAP BUTTON */}
      <Pressable style={styles.mapButton} onPress={() => router.push('/map')}>
        <ThemedText type="defaultSemiBold" style={styles.mapButtonText}>
          View on Map
        </ThemedText>
      </Pressable>
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
  },
  mapButton: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 10,
    marginTop: 20,
    alignItems: 'center',
  },
  mapButtonText: {
    color: 'white',
    fontSize: 16,
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
});