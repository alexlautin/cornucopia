import { AppBackground } from "@/components/app-background";
import { ThemedText } from "@/components/themed-text";
import { Colors, Radii, Shadows, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

const thresholds = [
  {
    label: "HIGH",
    distance: "≤ 0.5 mi",
    description: "Short, easily walkable trips earn the highest pct.",
  },
  {
    label: "MEDIUM",
    distance: "0.5 – 1.5 mi",
    description: "Comfortable for many walkers with a bit more planning.",
  },
  {
    label: "LOW",
    distance: "> 1.5 mi",
    description: "Often requires a ride, transit, or a longer trek.",
  },
];

const formulaSteps = [
  "Measure the walking distance (in miles) to the nearest food option.",
  "pct = clamp(1 - min(miles / 3, 1), 0.06, 1).",
  "Higher pct = closer option, with a floor so values never hit zero.",
];

const examples = [
  { distance: "0.2 mi", pct: "≈ 0.93", label: "HIGH" },
  { distance: "1.0 mi", pct: "≈ 0.67", label: "MEDIUM" },
  { distance: "3.5 mi", pct: "0.06 (floor)", label: "LOW" },
];

const notes = [
  "Thresholds mimic a short walk, a casual mile, and trips that usually need transit.",
  "The score is intentionally simple and meant as a quick signal, not a full accessibility audit.",
  "Future versions could weigh option density, transit, and opening hours.",
];

export default function WalkabilityExplanation() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const palette = Colors[colorScheme];

  const surfaceStyle = {
    backgroundColor: palette.card,
    borderColor: palette.border,
  } as const;

  return (
    <AppBackground>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.wrapper}>
          <View style={[styles.card, styles.hero, surfaceStyle]}>
            <View style={styles.heroHeader}>
              <View
                style={[
                  styles.kicker,
                  { backgroundColor: palette.accentMuted },
                ]}
              >
                <ThemedText
                  style={[styles.kickerText, { color: palette.accent }]}
                >
                  Score primer
                </ThemedText>
              </View>
              <ThemedText type="title" style={styles.title}>
                Walkability
              </ThemedText>
              <ThemedText style={[styles.body, styles.heroDescription]}>
                A quick look at how we translate the distance to fresh food into
                an easy label and percentage.
              </ThemedText>
            </View>

            <View style={styles.heroStats}>
              <View style={[styles.stat, { borderColor: palette.border }]}>
                <ThemedText
                  style={[styles.statLabel, { color: palette.textMuted }]}
                >
                  Primary signal
                </ThemedText>
                <ThemedText style={styles.statValue}>
                  Nearest distance
                </ThemedText>
                <ThemedText
                  style={[styles.statCaption, { color: palette.textMuted }]}
                >
                  Measured in walking miles
                </ThemedText>
              </View>
              <View style={[styles.stat, { borderColor: palette.border }]}>
                <ThemedText
                  style={[styles.statLabel, { color: palette.textMuted }]}
                >
                  Pct band
                </ThemedText>
                <ThemedText style={styles.statValue}>0.06 → 1.0</ThemedText>
                <ThemedText
                  style={[styles.statCaption, { color: palette.textMuted }]}
                >
                  Floored so it never hits zero
                </ThemedText>
              </View>
            </View>
          </View>

          <View style={[styles.card, styles.sectionCard, surfaceStyle]}>
            <ThemedText type="subtitle" style={styles.sectionHeading}>
              How we label it
            </ThemedText>
            <View style={styles.thresholdGrid}>
              {thresholds.map((row) => (
                <View
                  key={row.label}
                  style={[
                    styles.thresholdCard,
                    { borderColor: palette.border },
                  ]}
                >
                  <ThemedText
                    style={[styles.thresholdLabel, { color: palette.accent }]}
                  >
                    {row.label}
                  </ThemedText>
                  <ThemedText style={styles.thresholdDistance}>
                    {row.distance}
                  </ThemedText>
                  <ThemedText
                    style={[styles.thresholdCopy, { color: palette.textMuted }]}
                  >
                    {row.description}
                  </ThemedText>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.card, styles.sectionCard, surfaceStyle]}>
            <ThemedText type="subtitle" style={styles.sectionHeading}>
              Formula (simplified)
            </ThemedText>
            {formulaSteps.map((text, idx) => (
              <View key={text} style={styles.bulletRow}>
                <View
                  style={[
                    styles.bulletDot,
                    { backgroundColor: palette.accent },
                  ]}
                />
                <ThemedText style={[styles.body, idx === 1 && styles.bold]}>
                  {text}
                </ThemedText>
              </View>
            ))}
          </View>

          <View style={[styles.card, styles.sectionCard, surfaceStyle]}>
            <ThemedText type="subtitle" style={styles.sectionHeading}>
              Examples
            </ThemedText>
            {examples.map((example) => (
              <View
                key={example.distance}
                style={[styles.exampleRow, { borderColor: palette.border }]}
              >
                <View>
                  <ThemedText style={styles.exampleDistance}>
                    {example.distance}
                  </ThemedText>
                  <ThemedText
                    style={[styles.examplePct, { color: palette.textMuted }]}
                  >
                    {example.pct}
                  </ThemedText>
                </View>
                <ThemedText
                  style={[styles.exampleLabel, { color: palette.accent }]}
                >
                  {example.label}
                </ThemedText>
              </View>
            ))}
          </View>

          <View style={[styles.card, styles.sectionCard, surfaceStyle]}>
            <ThemedText type="subtitle" style={styles.sectionHeading}>
              Why these choices?
            </ThemedText>
            {notes.map((note) => (
              <ThemedText
                key={note}
                style={[styles.body, { color: palette.textMuted }]}
              >
                {note}
              </ThemedText>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={[styles.closeBtn, { backgroundColor: palette.accent }]}
          >
            <ThemedText style={styles.closeText}>Close</ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: Spacing.xxl,
  },
  wrapper: {
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radii.xl,
    padding: Spacing.xl,
    ...Shadows.subtle,
  },
  hero: {
    gap: Spacing.lg,
  },
  heroHeader: {
    gap: Spacing.sm,
  },
  kicker: {
    alignSelf: "flex-start",
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  kickerText: {
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontSize: 12,
  },
  title: {
    fontSize: 28,
    letterSpacing: -0.5,
  },
  heroDescription: {
    fontSize: 16,
    lineHeight: 22,
  },
  heroStats: {
    flexDirection: "row",
    gap: Spacing.md,
    flexWrap: "wrap",
  },
  stat: {
    flex: 1,
    minWidth: 160,
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: Spacing.md,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: Spacing.xs,
  },
  statCaption: {
    fontSize: 13,
    marginTop: Spacing.xs,
  },
  sectionCard: {
    gap: Spacing.md,
  },
  sectionHeading: {
    fontSize: 18,
    letterSpacing: 0.2,
  },
  thresholdGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  thresholdCard: {
    flexGrow: 1,
    minWidth: 160,
    borderWidth: 1,
    borderRadius: Radii.lg,
    padding: Spacing.md,
  },
  thresholdLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  thresholdDistance: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: Spacing.xs,
  },
  thresholdCopy: {
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  bulletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: Spacing.sm,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  bold: {
    fontWeight: "600",
  },
  exampleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: Radii.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  exampleDistance: {
    fontSize: 17,
    fontWeight: "700",
  },
  examplePct: {
    marginTop: Spacing.xs,
    fontSize: 14,
  },
  exampleLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  closeBtn: {
    borderRadius: Radii.xl,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.sm,
    ...Shadows.soft,
  },
  closeText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
