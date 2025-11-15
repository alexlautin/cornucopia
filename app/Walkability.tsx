import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

export default function WalkabilityExplanation() {
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedText type="title" style={styles.header}>Walkability</ThemedText>

        <ThemedText type="subtitle" style={styles.section}>Overview</ThemedText>
        <ThemedText style={styles.paragraph}>
          The score summarizes how easy it is to access fresh food nearby. It is based primarily on the distance to the nearest food option and scaled to a simple label and percentage.
        </ThemedText>

        <ThemedText type="subtitle" style={styles.section}>Formula (simplified)</ThemedText>
        <ThemedText style={styles.paragraph}>
          - We measure the walking distance (in miles) to the nearest food option.{"\n"}
          - Percentage (pct) = clamp(1 - min(miles / 3, 1), 0.06, 1). This gives a higher pct for closer options and prevents values from reaching zero.{"\n"}
          - Labels are assigned from the nearest distance:
        </ThemedText>

        <View style={styles.list}>
          <ThemedText style={styles.listItem}>• HIGH — nearest within 0.5 miles</ThemedText>
          <ThemedText style={styles.listItem}>• MEDIUM — nearest between 0.5 and 1.5 miles</ThemedText>
          <ThemedText style={styles.listItem}>• LOW — nearest over 1.5 miles</ThemedText>
        </View>

        <ThemedText type="subtitle" style={styles.section}>Why these choices?</ThemedText>
        <ThemedText style={styles.paragraph}>
          These thresholds are intended to approximate walkability: under 0.5 miles is typically a short walk, around 1 mile is an easy short trip, and beyond 1.5 miles generally requires a vehicle or longer transit.
        </ThemedText>

        <ThemedText type="subtitle" style={styles.section}>Examples</ThemedText>
        <ThemedText style={styles.paragraph}>• Nearest = 0.2 mi → pct ≈ 0.93 → HIGH</ThemedText>
        <ThemedText style={styles.paragraph}>• Nearest = 1.0 mi → pct ≈ 0.67 → MEDIUM</ThemedText>
        <ThemedText style={styles.paragraph}>• Nearest = 3.5 mi → pct = 0.06 (floor) → LOW</ThemedText>

        <ThemedText type="subtitle" style={styles.section}>Notes</ThemedText>
        <ThemedText style={styles.paragraph}>
          The score is intentionally simple and meant as a quick indicator. Future improvements could factor in the number of nearby options, transit accessibility, and opening hours.
        </ThemedText>

        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <ThemedText style={styles.closeText}>Close</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 20, backgroundColor: '#ffffff' },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  header: { fontSize: 28, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 },
  section: { marginTop: 8, fontWeight: '700' },
  paragraph: { color: '#374151', lineHeight: 20 },
  list: { marginTop: 6, marginLeft: 6 },
  listItem: { marginVertical: 2, color: '#374151' },
  closeBtn: { marginTop: 12, backgroundColor: '#1a73e8', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center' },
  closeText: { color: '#fff', fontWeight: '700' },
});
