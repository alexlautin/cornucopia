import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Keyboard, Linking, Pressable, ScrollView, StyleSheet, Switch, TextInput, TouchableWithoutFeedback, View } from 'react-native';

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

// Extended program calculations
const extendedPrograms = [
  ...rules.programs,
  {
    id: 'medicaid',
    name: 'Medicaid',
    income_per_person_monthly_max: 1500,
    children_under5_bonus: 200,
    description: 'Healthcare coverage for low-income individuals and families.',
    link: 'https://www.medicaid.gov/medicaid/index.html'
  },
  {
    id: 'liheap',
    name: 'LIHEAP (Energy Assistance)',
    income_per_person_monthly_max: 1300,
    children_under5_bonus: 100,
    description: 'Low Income Home Energy Assistance Program helps with utility bills.',
    link: 'https://www.acf.hhs.gov/ocs/programs/liheap'
  },
  {
    id: 'housing_voucher',
    name: 'Housing Choice Voucher',
    income_per_person_monthly_max: 1200,
    children_under5_bonus: 150,
    description: 'Section 8 housing vouchers help pay rent in private housing.',
    link: 'https://www.hud.gov/topics/housing_choice_voucher_program_section_8'
  }
];

export default function EligibilityScreen() {
  // Basic household info
  const [householdSize, setHouseholdSize] = useState<string>('1');
  const [monthlyIncome, setMonthlyIncome] = useState<string>('0');
  const [monthlyRent, setMonthlyRent] = useState<string>('0');
  const [assets, setAssets] = useState<string>('0');
  
  // Demographics
  const [childrenUnder5, setChildrenUnder5] = useState<boolean>(false);
  const [childrenUnder18, setChildrenUnder18] = useState<string>('0');
  const [adults60Plus, setAdults60Plus] = useState<string>('0');
  const [hasDisability, setHasDisability] = useState<boolean>(false);
  const [isVeteran, setIsVeteran] = useState<boolean>(false);
  const [isStudent, setIsStudent] = useState<boolean>(false);
  
  // Employment
  const [employmentStatus, setEmploymentStatus] = useState<'employed' | 'unemployed' | 'disabled' | 'retired' | 'student'>('employed');
  const [workHoursPerWeek, setWorkHoursPerWeek] = useState<string>('40');
  
  // State
  const [state, setState] = useState<string>('GA'); // Default to Georgia
  
  const [results, setResults] = useState<any[] | null>(null);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Clear results when screen focuses
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
    const rent = parseNumber(monthlyRent);
    const totalAssets = parseNumber(assets);
    const children18 = parseNumber(childrenUnder18);
    const seniors = parseNumber(adults60Plus);
    const workHours = parseNumber(workHoursPerWeek);

    // Calculate additional factors
    const hasChildren = childrenUnder5 || children18 > 0;
    const hasSeniors = seniors > 0;
    const isLowIncome = income < 2000;
    const highRentBurden = rent > (income * 0.3); // Rent > 30% of income
    
    const evaluated = extendedPrograms.map(p => {
      let threshold = p.income_per_person_monthly_max * size;
      
      // Apply bonuses
      if (childrenUnder5) threshold += p.children_under5_bonus;
      if (hasChildren) threshold += 100; // General child bonus
      if (hasSeniors) threshold += 150; // Senior bonus
      if (hasDisability) threshold += 200; // Disability bonus
      if (isVeteran) threshold += 175; // Veteran bonus
      if (employmentStatus === 'unemployed') threshold += 250; // Unemployment bonus
      if (highRentBurden) threshold += 300; // High rent burden bonus

      // Special rules for specific programs
      if (p.id === 'snap') {
        // SNAP has asset limits
        if (totalAssets > 2750 && !hasSeniors && !hasDisability) {
          threshold = 0; // Asset limit exceeded
        }
        // Work requirements (simplified)
        if (!hasChildren && !hasSeniors && !hasDisability && workHours < 20) {
          threshold *= 0.8; // Reduced eligibility
        }
      }
      
      if (p.id === 'wic') {
        // WIC is specifically for women, infants, and children
        if (!childrenUnder5 && children18 === 0) {
          threshold = 0; // Not eligible without children
        }
      }

      let status: 'Eligible' | 'Likely Eligible' | 'May Qualify' | 'Not Eligible';
      let confidence = 'High';
      
      if (income <= threshold) {
        status = 'Eligible';
      } else if (income <= threshold * 1.1) {
        status = 'Likely Eligible';
        confidence = 'Medium';
      } else if (income <= threshold * 1.25) {
        status = 'May Qualify';
        confidence = 'Low';
      } else {
        status = 'Not Eligible';
      }

      // Special overrides
      if (p.id === 'snap' && totalAssets > 2750 && !hasSeniors && !hasDisability) {
        status = 'Not Eligible';
        confidence = 'High';
      }

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        link: p.link,
        threshold,
        income,
        status,
        confidence,
        factors: {
          hasChildren,
          hasSeniors,
          hasDisability,
          isVeteran,
          highRentBurden,
          employmentStatus,
          workHours
        }
      };
    });

    setResults(evaluated.sort((a, b) => {
      const statusOrder = { 'Eligible': 0, 'Likely Eligible': 1, 'May Qualify': 2, 'Not Eligible': 3 };
      return statusOrder[a.status] - statusOrder[b.status];
    }));
  }, [householdSize, monthlyIncome, monthlyRent, assets, childrenUnder5, childrenUnder18, adults60Plus, hasDisability, isVeteran, isStudent, employmentStatus, workHoursPerWeek, state]);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <ScrollView style={{ backgroundColor: 'transparent' }} contentContainerStyle={styles.container}>
      <ThemedText type="title" style={styles.header}>Benefits Eligibility Check</ThemedText>
      <ThemedText style={styles.subtitle}>
        Get personalized eligibility estimates for government assistance programs
      </ThemedText>
      
      {!results && (
        <>
          <ThemedView style={styles.card}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>Household Information</ThemedText>
            
            <ThemedView style={styles.field}>
              <ThemedText style={styles.label}>Total Household Size</ThemedText>
              <TextInput
                value={householdSize}
                onChangeText={setHouseholdSize}
                keyboardType="number-pad"
                returnKeyType="next"
                onSubmitEditing={() => Keyboard.dismiss()}
                style={styles.input}
                placeholder="e.g. 4"
              />
              <ThemedText style={styles.helpText}>Include everyone who lives and eats together</ThemedText>
            </ThemedView>

            <ThemedView style={styles.field}>
              <ThemedText style={styles.label}>Total Monthly Income ($)</ThemedText>
              <TextInput
                value={monthlyIncome}
                onChangeText={setMonthlyIncome}
                keyboardType="number-pad"
                returnKeyType="next"
                onSubmitEditing={() => Keyboard.dismiss()}
                style={styles.input}
                placeholder="e.g. 2500"
              />
              <ThemedText style={styles.helpText}>Include all income before taxes: wages, benefits, etc.</ThemedText>
            </ThemedView>

            <ThemedView style={styles.field}>
              <ThemedText style={styles.label}>Monthly Rent/Housing Cost ($)</ThemedText>
              <TextInput
                value={monthlyRent}
                onChangeText={setMonthlyRent}
                keyboardType="number-pad"
                returnKeyType="next"
                onSubmitEditing={() => Keyboard.dismiss()}
                style={styles.input}
                placeholder="e.g. 1200"
              />
            </ThemedView>

            <ThemedView style={styles.toggleRow}>
              <ThemedText style={styles.label}>Any children under 5?</ThemedText>
              <Switch value={childrenUnder5} onValueChange={setChildrenUnder5} />
            </ThemedView>

            <ThemedView style={styles.field}>
              <ThemedText style={styles.label}>Children under 18 (total)</ThemedText>
              <TextInput
                value={childrenUnder18}
                onChangeText={setChildrenUnder18}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                style={styles.input}
                placeholder="e.g. 2"
              />
            </ThemedView>
          </ThemedView>

          <Pressable 
            style={styles.advancedToggle} 
            onPress={() => setShowAdvanced(!showAdvanced)}
          >
            <ThemedText style={styles.advancedToggleText}>
              {showAdvanced ? '▼' : '▶'} Advanced Options (for more accurate results)
            </ThemedText>
          </Pressable>

          {showAdvanced && (
            <ThemedView style={styles.card}>
              <ThemedText type="subtitle" style={styles.sectionTitle}>Additional Details</ThemedText>
              
              <ThemedView style={styles.field}>
                <ThemedText style={styles.label}>Adults 60+ in household</ThemedText>
                <TextInput
                  value={adults60Plus}
                  onChangeText={setAdults60Plus}
                  keyboardType="number-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => Keyboard.dismiss()}
                  style={styles.input}
                  placeholder="e.g. 1"
                />
              </ThemedView>

              <ThemedView style={styles.field}>
                <ThemedText style={styles.label}>Total Assets/Savings ($)</ThemedText>
                <TextInput
                  value={assets}
                  onChangeText={setAssets}
                  keyboardType="number-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => Keyboard.dismiss()}
                  style={styles.input}
                  placeholder="e.g. 5000"
                />
                <ThemedText style={styles.helpText}>Bank accounts, investments (affects some programs)</ThemedText>
              </ThemedView>

              <ThemedView style={styles.field}>
                <ThemedText style={styles.label}>Work Hours Per Week</ThemedText>
                <TextInput
                  value={workHoursPerWeek}
                  onChangeText={setWorkHoursPerWeek}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                  style={styles.input}
                  placeholder="e.g. 40"
                />
              </ThemedView>

              <ThemedView style={styles.toggleRow}>
                <ThemedText style={styles.label}>Anyone with disability?</ThemedText>
                <Switch value={hasDisability} onValueChange={setHasDisability} />
              </ThemedView>

              <ThemedView style={styles.toggleRow}>
                <ThemedText style={styles.label}>Military veteran?</ThemedText>
                <Switch value={isVeteran} onValueChange={setIsVeteran} />
              </ThemedView>

              <ThemedView style={styles.toggleRow}>
                <ThemedText style={styles.label}>Currently a student?</ThemedText>
                <Switch value={isStudent} onValueChange={setIsStudent} />
              </ThemedView>
            </ThemedView>
          )}

          <Pressable style={styles.submitBtn} onPress={() => { Keyboard.dismiss(); evaluate(); }}>
            <ThemedText style={styles.submitText}>Check Eligibility</ThemedText>
          </Pressable>

          <ThemedView style={styles.disclaimerBox}>
            <ThemedText style={styles.disclaimerText}>
              ⚠️ This is an estimate only. Actual eligibility depends on many factors and official verification. 
              Contact program offices for definitive determinations.
            </ThemedText>
          </ThemedView>
        </>
      )}

      {results && (
        <ThemedView style={styles.resultsWrapper}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>Your Eligibility Results</ThemedText>
          <ThemedText style={styles.resultsSubtitle}>
            Based on household size: {householdSize}, Monthly income: ${parseNumber(monthlyIncome).toLocaleString()}
          </ThemedText>
          
          {results.map(r => {
            const borderColor =
              r.status === 'Eligible' ? '#10b981' :
              r.status === 'Likely Eligible' ? '#059669' :
              r.status === 'May Qualify' ? '#f59e0b' : '#ef4444';
              
            return (
              <View key={r.id} style={[styles.resultCard, { borderLeftColor: borderColor }]}>
                <View style={styles.resultHeaderRow}>
                  <ThemedText style={styles.resultProgram}>{r.name}</ThemedText>
                  <View style={styles.statusContainer}>
                    <ThemedText style={[styles.statusBadge, 
                      r.status === 'Eligible' && styles.statusEligible,
                      r.status === 'Likely Eligible' && styles.statusLikelyEligible,
                      r.status === 'May Qualify' && styles.statusMayQualify,
                      r.status === 'Not Eligible' && styles.statusNotEligible
                    ]}>
                      {r.status}
                    </ThemedText>
                    <ThemedText style={styles.confidenceText}>
                      {r.confidence} confidence
                    </ThemedText>
                  </View>
                </View>
                
                <ThemedText style={styles.resultDesc}>{r.description}</ThemedText>
                
                <View style={styles.metricsRow}>
                  <View style={styles.metric}>
                    <ThemedText style={styles.metricLabel}>Your Income</ThemedText>
                    <ThemedText style={styles.metricValue}>${r.income.toLocaleString()}</ThemedText>
                  </View>
                  <View style={styles.metric}>
                    <ThemedText style={styles.metricLabel}>Income Limit</ThemedText>
                    <ThemedText style={styles.metricValue}>${r.threshold.toLocaleString()}</ThemedText>
                  </View>
                  <View style={styles.metric}>
                    <ThemedText style={styles.metricLabel}>Difference</ThemedText>
                    <ThemedText style={[styles.metricValue, 
                      r.income <= r.threshold ? styles.positive : styles.negative
                    ]}>
                      ${Math.abs(r.threshold - r.income).toLocaleString()}
                    </ThemedText>
                  </View>
                </View>

                {/* Show factors that helped */}
                {(r.factors.hasChildren || r.factors.hasSeniors || r.factors.hasDisability || r.factors.isVeteran) && (
                  <View style={styles.factorsBox}>
                    <ThemedText style={styles.factorsTitle}>Qualifying factors:</ThemedText>
                    <ThemedText style={styles.factorsText}>
                      {[
                        r.factors.hasChildren && '• Children in household',
                        r.factors.hasSeniors && '• Senior adults (60+)',
                        r.factors.hasDisability && '• Disability status',
                        r.factors.isVeteran && '• Military veteran',
                        r.factors.highRentBurden && '• High housing costs'
                      ].filter(Boolean).join('\n')}
                    </ThemedText>
                  </View>
                )}

                {!!r.link && (
                  <Pressable onPress={() => Linking.openURL(r.link!)} style={styles.linkBtn}>
                    <ThemedText style={styles.linkText}>Apply / Learn More →</ThemedText>
                  </Pressable>
                )}
              </View>
            );
          })}
          
          <Pressable style={styles.editBtn} onPress={() => setResults(null)}>
            <ThemedText style={styles.editText}>← Edit Information</ThemedText>
          </Pressable>
        </ThemedView>
      )}
      </ScrollView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 100,
    gap: 16,
    backgroundColor: 'transparent'
  },
  header: {
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
    lineHeight: 20
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
  helpText: {
    fontSize: 11,
    color: '#6b7280',
    fontStyle: 'italic'
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
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  advancedToggle: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  advancedToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151'
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
  disclaimerBox: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fbbf24',
    borderRadius: 10,
    padding: 12
  },
  disclaimerText: {
    fontSize: 11,
    color: '#92400e',
    lineHeight: 15
  },
  resultsWrapper: {
    gap: 16,
    paddingTop: 8,
    backgroundColor: 'transparent',
    padding: 4
  },
  resultsSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8
  },
  resultCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderLeftWidth: 5,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  resultHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  resultProgram: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    flex: 1
  },
  statusContainer: {
    alignItems: 'flex-end'
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
  confidenceText: {
    fontSize: 9,
    color: '#6b7280',
    marginTop: 2
  },
  statusEligible: { backgroundColor: '#d1fae5', color: '#065f46' },
  statusLikelyEligible: { backgroundColor: '#a7f3d0', color: '#065f46' },
  statusMayQualify: { backgroundColor: '#fef3c7', color: '#92400e' },
  statusNotEligible: { backgroundColor: '#fee2e2', color: '#991b1b' },
  resultDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 4
  },
  metric: {
    flexDirection: 'column',
    gap: 2,
    flex: 1
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
  positive: { color: '#059669' },
  negative: { color: '#dc2626' },
  factorsBox: {
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    padding: 10,
    marginTop: 4
  },
  factorsTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#075985',
    marginBottom: 4
  },
  factorsText: {
    fontSize: 10,
    color: '#0c4a6e',
    lineHeight: 14
  },
  linkBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#2563eb'
  },
  linkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
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
