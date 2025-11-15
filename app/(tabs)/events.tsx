import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Button, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

// Simple forward-geocode via Nominatim (returns first match or null)
async function geocodeAddress(address: string): Promise<{ lat: number; lon: number; addressObj?: any } | null> {
  try {
    const q = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&addressdetails=1&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Cornucopia/1.0 (contact@local)' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const first = data[0];
    return { lat: parseFloat(first.lat), lon: parseFloat(first.lon), addressObj: first.address ?? null };
  } catch (e) {
    console.warn('geocodeAddress error', e);
    return null;
  }
}

export default function EventsScreen() {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [startDateTime, setStartDateTime] = useState('');
  const [endDateTime, setEndDateTime] = useState('');
  const [street, setStreet] = useState('');
  const [apartment, setApartment] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Please enter an event name.');
      return;
    }
    if (!startDateTime.trim() || !endDateTime.trim()) {
      Alert.alert('Missing date/time', 'Please enter both start and end date/time for the event.');
      return;
    }
    if (!street.trim() || !city.trim() || !state.trim()) {
      Alert.alert('Missing address', 'Please enter street, city, and state.');
      return;
    }
    setSubmitting(true);
    try {
      // Build full address string for geocoding
      const fullAddress = `${street}${apartment ? ', ' + apartment : ''}, ${city}, ${state} ${postalCode}`;
      
      // Attempt to geocode the full address to get lat/lon
      const geocoded = await geocodeAddress(fullAddress);
      const lat = geocoded?.lat ?? null;
      const lon = geocoded?.lon ?? null;

      const placeId = `user_event_${Date.now()}`;

      // Build address payload in the specified format
      const addressPayload = {
        street: street || null,
        address2: apartment || null,
        city: city || null,
        state: state || null,
        postcode: postalCode || null,
      };

      const rawTags = JSON.stringify({ name: name || null, type: type || null, source: 'user' });

      // Build event_hours JSONB from start and end datetimes
      // Format: { "DayName": "HH:MM-HH:MM" }
      let eventHours: any = null;
      if (startDateTime.trim() && endDateTime.trim()) {
        // Parse start datetime: format should be "YYYY-MM-DD HH:MM"
        const startParts = startDateTime.split(' ');
        const endParts = endDateTime.split(' ');
        
        if (startParts.length >= 2 && endParts.length >= 2) {
          const startDate = new Date(startParts[0]);
          const startTime = startParts[1];
          const endTime = endParts[1];
          
          if (!isNaN(startDate.getTime())) {
            const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
              startDate.getDay()
            ];
            eventHours = { [dayOfWeek]: `${startTime}-${endTime}` };
          }
        }
      }

      const row = {
        place_id: placeId,
        name: name || null,
        type: type || null,
        lat: lat,
        lon: lon,
        address: addressPayload,
        opening_hours: null,
        event_hours: eventHours,
        raw_tags: rawTags,
      } as any;

      const { data, error } = await supabase.from('events').insert(row).select();
      if (error) {
        console.error('Supabase insert error', error);
        Alert.alert('Submit failed', 'Failed to submit event to the server.');
      } else {
        console.log('Inserted event', data);
        Alert.alert('Event submitted', 'Thanks — your event was submitted.');

        // clear form
        setName('');
        setType('');
        setDescription('');
        setStartDateTime('');
        setEndDateTime('');
        setStreet('');
        setApartment('');
        setCity('');
        setState('');
        setPostalCode('');
      }
    } catch (e) {
      console.error('submit event error', e);
      Alert.alert('Submit failed', 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  }, [name, type, description, startDateTime, endDateTime, street, apartment, city, state, postalCode]);

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        <ThemedText type="title" style={styles.title}>Create Event</ThemedText>

        <View style={styles.field}>
          <ThemedText style={styles.label}>Event name</ThemedText>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Community Pantry" />
        </View>

        <View style={styles.field}>
          <ThemedText style={styles.label}>Event type</ThemedText>
          <TextInput style={styles.input} value={type} onChangeText={setType} placeholder="e.g. Food distribution, Meeting" />
        </View>

        <View style={styles.field}>
          <ThemedText style={styles.label}>Description</ThemedText>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Brief description of the event"
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.timeRow}>
          <View style={[styles.field, { flex: 1 }]}>
            <ThemedText style={styles.label}>Start date/time</ThemedText>
            <TextInput
              style={styles.input}
              value={startDateTime}
              onChangeText={setStartDateTime}
              placeholder="YYYY-MM-DD HH:MM"
            />
          </View>
          <View style={[styles.field, { flex: 1 }]}>
            <ThemedText style={styles.label}>End date/time</ThemedText>
            <TextInput
              style={styles.input}
              value={endDateTime}
              onChangeText={setEndDateTime}
              placeholder="YYYY-MM-DD HH:MM"
            />
          </View>
        </View>

        <View style={styles.field}>
          <ThemedText style={styles.label}>Street address *</ThemedText>
          <TextInput
            style={styles.input}
            value={street}
            onChangeText={setStreet}
            placeholder="e.g. 229 N Broad St"
          />
        </View>

        <View style={styles.field}>
          <ThemedText style={styles.label}>Apartment, unit, suite, or floor #</ThemedText>
          <TextInput
            style={styles.input}
            value={apartment}
            onChangeText={setApartment}
            placeholder="Optional"
          />
        </View>

        <View style={styles.timeRow}>
          <View style={[styles.field, { flex: 1 }]}>
            <ThemedText style={styles.label}>City *</ThemedText>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="e.g. Winder"
            />
          </View>
          <View style={[styles.field, { flex: 1 }]}>
            <ThemedText style={styles.label}>State/Province *</ThemedText>
            <TextInput
              style={styles.input}
              value={state}
              onChangeText={setState}
              placeholder="e.g. GA"
            />
          </View>
        </View>

        <View style={styles.field}>
          <ThemedText style={styles.label}>Postal code</ThemedText>
          <TextInput
            style={styles.input}
            value={postalCode}
            onChangeText={setPostalCode}
            placeholder="e.g. 30680"
          />
        </View>

        <View style={styles.actions}>
          {submitting ? (
            <ActivityIndicator />
          ) : (
            <Button title="Submit Event" onPress={handleSubmit} />
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { fontSize: 24, marginBottom: 4 },
  field: { gap: 8 },
  label: { opacity: 0.8 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  timeRow: { flexDirection: 'row', gap: 12 },
  actions: { marginTop: 12 },
});
