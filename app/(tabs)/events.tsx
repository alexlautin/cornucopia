import { useCallback, useEffect, useState } from 'react';
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
  // events list state
  const [events, setEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  // Date/time fields
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const defaultDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  const defaultEndDate = `${oneHourLater.getFullYear()}-${pad(oneHourLater.getMonth() + 1)}-${pad(oneHourLater.getDate())}`;
  const defaultEndTime = `${pad(oneHourLater.getHours())}:${pad(oneHourLater.getMinutes())}`;

  const [startDate, setStartDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(defaultTime);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [endTime, setEndTime] = useState(defaultEndTime);
  const [street, setStreet] = useState('');
  const [apartment, setApartment] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const [submitting, setSubmitting] = useState(false);
  // fetch events from Supabase
  const fetchEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const { data, error } = await supabase.from('events').select();
      if (error) {
        console.error('fetchEvents error', error);
        setEvents([]);
      } else {
        setEvents(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('fetchEvents unexpected error', e);
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  // Helper: validate date (YYYY-MM-DD) and time (HH:MM, 24h)
  function isValidDate(str: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str).getTime());
  }
  function isValidTime(str: string) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(str);
  }

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Please enter an event name.');
      return;
    }
    if (!isValidDate(startDate) || !isValidTime(startTime)) {
      Alert.alert('Invalid start date/time', 'Start date must be YYYY-MM-DD and time must be HH:MM (24h).');
      return;
    }
    if (!isValidDate(endDate) || !isValidTime(endTime)) {
      Alert.alert('Invalid end date/time', 'End date must be YYYY-MM-DD and time must be HH:MM (24h).');
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

      // Build event_hours JSONB from start/end date/time
      let eventHours: any = null;
      console.log('Validating event hours', { startDate, startTime, endDate, endTime });
      if (isValidDate(startDate) && isValidTime(startTime) && isValidDate(endDate) && isValidTime(endTime)) {
        eventHours = { [startDate]: {"start": startTime, "end": endTime} };
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
        setStartDate(defaultDate);
        setStartTime(defaultTime);
        setEndDate(defaultEndDate);
        setEndTime(defaultEndTime);
        setStreet('');
        setApartment('');
        setCity('');
        setState('');
        setPostalCode('');
        // refresh events list after successful submit
        void fetchEvents();
      }
    } catch (e) {
      console.error('submit event error', e);
      Alert.alert('Submit failed', 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  }, [name, type, description, startDate, startTime, endDate, endTime, street, apartment, city, state, postalCode, defaultDate, defaultTime, defaultEndDate, defaultEndTime, fetchEvents]);

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

        {/* <View style={styles.field}>
          <ThemedText style={styles.label}>Description</ThemedText>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Brief description of the event"
            multiline
            numberOfLines={4}
          />
        </View> */}

        <View style={styles.timeRow}>
          <View style={[styles.field, { flex: 1 }]}> 
            <ThemedText style={styles.label}>Event Date</ThemedText>
            <TextInput
              style={styles.input}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              keyboardType="numeric"
            />
          </View>
        </View>
        <View style={styles.timeRow}>
            <View style={[styles.field, { flex: 1 }]}> 
            <ThemedText style={styles.label}>Start time</ThemedText>
            <TextInput
              style={styles.input}
              value={startTime}
              onChangeText={setStartTime}
              placeholder="HH:MM"
              autoCapitalize="none"
              keyboardType="numeric"
            />
          </View>
          {/* <View style={[styles.field, { flex: 1 }]}> 
            <ThemedText style={styles.label}>End date</ThemedText>
            <TextInput
              style={styles.input}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              keyboardType="numeric"
            />
          </View> */}
          <View style={[styles.field, { flex: 1 }]}> 
            <ThemedText style={styles.label}>End time</ThemedText>
            <TextInput
              style={styles.input}
              value={endTime}
              onChangeText={setEndTime}
              placeholder="HH:MM"
              autoCapitalize="none"
              keyboardType="numeric"
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

        {/* Submitted events shown below the form */}
        <View style={styles.eventsSection}>
          <ThemedText type="subtitle" style={styles.eventsHeader}>Submitted Events</ThemedText>
          {loadingEvents ? (
            <ActivityIndicator />
          ) : events.length === 0 ? (
            <ThemedText style={{ opacity: 0.7 }}>No events submitted yet.</ThemedText>
          ) : (
            events.map((e) => {
              const addr = e.address && typeof e.address === 'object'
                ? `${e.address.street ?? ''}${e.address.address2 ? ', ' + e.address.address2 : ''}, ${e.address.city ?? ''}${e.address.state ? ', ' + e.address.state : ''} ${e.address.postcode ?? ''}`.trim()
                : e.address || '';
              const hours = e.event_hours && typeof e.event_hours === 'object'
                ? Object.entries(e.event_hours).map(([d, v]: any) => `${d}: ${v.start}–${v.end}`).join(', ')
                : '';
              const key = e.place_id ?? e.id ?? `${e.name}-${Math.random()}`;
              return (
                <View key={key} style={styles.eventCard}>
                  <ThemedText style={styles.eventTitle}>{e.name ?? 'Unnamed event'}</ThemedText>
                  {e.type ? <ThemedText style={styles.eventMeta}>{e.type}</ThemedText> : null}
                  {addr ? <ThemedText style={styles.eventAddress}>{addr}</ThemedText> : null}
                  {hours ? <ThemedText style={styles.eventMeta}>{hours}</ThemedText> : null}
                </View>
              );
            })
          )}
          <Button title="Refresh events" onPress={() => void fetchEvents()} />
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  // push content down so the "Create Event" title is not overlapped by the app header
  container: { flex: 1, paddingTop: 60 },
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
  eventsSection: { marginTop: 20, gap: 8 },
  eventsHeader: { marginBottom: 8 },
  eventCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  eventTitle: { fontWeight: '700', fontSize: 16, marginBottom: 2 },
  eventMeta: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  eventAddress: { fontSize: 13, color: '#374151', marginBottom: 4 },
});
