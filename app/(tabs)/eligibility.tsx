import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

// Load rules JSON (static sync)
const rules: {
  programs: {
    id: string;
    name: string;
    income_per_person_monthly_max: number;
    children_under5_bonus: number;
    description: string;
    link?: string;
  }[];
} = require('@/constants/eligibility-rules.json');

export default function EligibilityScreen() {
  const [householdSize, setHouseholdSize] = useState<string>('1');
  const [monthlyIncome, setMonthlyIncome] = useState<string>('0');
  const [childrenUnder5, setChildrenUnder5] = useState<boolean>(false);
  const [results, setResults] = useState<any[] | null>(null);

  // Clear results (show the form) whenever the Eligibility tab/screen becomes focused.
  useFocusEffect(
    useCallback(() => {
      setResults(null);
    }, [])
  );

  const parseNumber = (v: string) => {
    const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  };

  const evaluate = useCallback(() => {
    const size = Math.max(1, parseNumber(householdSize));
    const income = parseNumber(monthlyIncome);

    const evaluated = rules.programs.map(p => {
      const threshold =
        p.income_per_person_monthly_max * size +
        (childrenUnder5 ? p.children_under5_bonus : 0);

      let status: 'Eligible' | 'Borderline' | 'Not Eligible';
      if (income <= threshold) {
        status = 'Eligible';
      } else if (income <= threshold * 1.15) {
        status = 'Borderline';
      } else {
        status = 'Not Eligible';
      }

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        link: p.link,
        threshold,
        income,
        status
      };
    });

    setResults(evaluated);
  }, [householdSize, monthlyIncome, childrenUnder5]);

  return (
    <ScrollView style={{ backgroundColor: 'transparent' }} contentContainerStyle={styles.container}>
      <ThemedText type="title" style={styles.header}>Eligibility Check</ThemedText>
      {!results && (
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>Your Info</ThemedText>
          <ThemedView style={styles.field}>
            <ThemedText style={styles.label}>Household Size</ThemedText>
            <TextInput
              value={householdSize}
              onChangeText={setHouseholdSize}
              keyboardType="number-pad"
              style={styles.input}
              placeholder="e.g. 3"
            />
          </ThemedView>
          <ThemedView style={styles.field}>
            <ThemedText style={styles.label}>Monthly Income ($)</ThemedText>
            <TextInput
              value={monthlyIncome}
              onChangeText={setMonthlyIncome}
              keyboardType="number-pad"
              style={styles.input}
              placeholder="e.g. 2500"
            />
          </ThemedView>
          <ThemedView style={styles.toggleRow}>
            <ThemedText style={styles.label}>Children Under 5</ThemedText>
            <Switch value={childrenUnder5} onValueChange={setChildrenUnder5} />
          </ThemedView>
          <Pressable style={styles.submitBtn} onPress={evaluate}>
            <ThemedText style={styles.submitText}>Check Eligibility</ThemedText>
          </Pressable>
        </ThemedView>
      )}

      {results && (
        <ThemedView style={styles.resultsWrapper}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>Results</ThemedText>
          {results.map(r => {
            const borderColor =
              r.status === 'Eligible'
                ? '#10b981'
                : r.status === 'Borderline'
                  ? '#f59e0b'
                  : '#ef4444';
            return (
              <View
                key={r.id}
                style={[
                  styles.resultCard,
                  { borderLeftColor: borderColor },
                  r.status === 'Eligible' && styles.resultCardEligibleBg,
                  r.status === 'Borderline' && styles.resultCardBorderlineBg,
                  r.status === 'Not Eligible' && styles.resultCardNotEligibleBg
                ]}
              >
                <View style={styles.resultHeaderRow}>
                  <ThemedText style={styles.resultProgram}>{r.name}</ThemedText>
                  <ThemedText
                    style={[
                      styles.statusBadge,
                      r.status === 'Eligible' && styles.statusEligible,
                      r.status === 'Borderline' && styles.statusBorderline,
                      r.status === 'Not Eligible' && styles.statusNotEligible
                    ]}
                  >
                    {r.status}
                  </ThemedText>
                </View>
                <ThemedText style={styles.resultDesc}>{r.description}</ThemedText>
                <View style={styles.metricsRow}>
                  <View style={styles.metric}>
                    <ThemedText style={styles.metricLabel}>Income</ThemedText>
                    <ThemedText style={styles.metricValue}>${r.income.toLocaleString()}</ThemedText>
                  </View>
                  <View style={styles.metric}>
                    <ThemedText style={styles.metricLabel}>Allowed</ThemedText>
                    <ThemedText style={styles.metricValue}>${r.threshold.toLocaleString()}</ThemedText>
                  </View>
                </View>
                {!!r.link && (
                  <Pressable
                    onPress={() => Linking.openURL(r.link!)}
                    style={styles.linkBtn}
                    hitSlop={6}
                  >
                    <ThemedText style={styles.linkText}>Apply / Learn More ➤</ThemedText>
                  </Pressable>
                )}
              </View>
            );
          })}
          <Pressable style={styles.editBtn} onPress={() => setResults(null)}>
            <ThemedText style={styles.editText}>Edit Info</ThemedText>
          </Pressable>
        </ThemedView>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 60, // push header lower
    paddingBottom: 40,
    gap: 16,
    backgroundColor: 'transparent'
  },
  header: {
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 4
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 12
  },
  // "Your Info" card: white background and subtle elevation
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 16,
    gap: 14,
    // subtle shadow for both iOS and Android
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  field: {
    gap: 6
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151'
  },
  // inputs inside the white card should also be white and clear
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#ffffff',
    // slight inner shadow / elevation for input field
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.03,
    shadowRadius: 1,
    elevation: 0,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  submitBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4
  },
  submitText: {
    color: '#ffffff',
    fontWeight: '700',
    letterSpacing: 0.5
  },
  resultsWrapper: {
    gap: 16,
    paddingTop: 8,
    backgroundColor: 'transparent', // let page background show through
    padding: 4
  },
  resultCard: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderLeftWidth: 5,
    borderLeftColor: '#10b981', // overridden per status when rendered
    borderRadius: 12,
    padding: 14,
    gap: 10
  },
  // subtle status tints (now transparent; no background)
  resultCardEligibleBg: { backgroundColor: 'transparent' },
  resultCardBorderlineBg: { backgroundColor: 'transparent' },
  resultCardNotEligibleBg: { backgroundColor: 'transparent' },
  resultHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  resultProgram: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937'
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#e5e7eb',
    color: '#374151',
    overflow: 'hidden'
  },
  statusEligible: {
    backgroundColor: '#d1fae5',
    color: '#065f46'
  },
  statusBorderline: {
    backgroundColor: '#fef3c7',
    color: '#92400e'
  },
  statusNotEligible: {
    backgroundColor: '#fee2e2',
    color: '#991b1b'
  },
  resultDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 4
  },
  metric: {
    flexDirection: 'column',
    gap: 2
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6b7280',
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1f2937'
  },
  linkBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1d4ed8',
    backgroundColor: 'transparent'
  },
  linkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1d4ed8',
    letterSpacing: 0.5
  },
  editBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  editText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151'
  }
});
