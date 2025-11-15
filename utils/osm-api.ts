import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedPlaceHours, setCachedPlaceHours } from './cache';
import { getDistance } from './distance';
import { getCachedData, setCachedData } from './supabase-cache';

export interface OSMPlace {
  place_id: string;
  lat: string;
  lon: string;
  display_name: string;
  type: string;
  address?: {
    road?: string;
    house_number?: string;
    city?: string;
    state?: string;
    postcode?: string;
  };
  // New: pre-formatted opening hours lines
  openingHours?: string[];
}

// Simple cache to avoid re-fetching
const cache = new Map<string, { data: OSMPlace[]; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// In-memory "stale-while-revalidate" cache and inflight deduper
// Increased cache duration to 30 minutes to reduce API calls
const MEMORY_TTL_MS = 30 * 60 * 1000;
const memoryCache = new Map<string, { data: OSMPlace[]; ts: number }>();
const inflight = new Map<string, Promise<OSMPlace[]>>();
// In-memory hours map per placeId
const hoursMemoryCache = new Map<string, string[]>();

// Max distance (miles) to include in results
const MAX_DISTANCE_MI = 2.5;

type SupabaseOSMRecord = {
  place_id: string;
  name: string | null;
  type: string | null;
  lat: number | null;
  lon: number | null;
  address?: {
    road?: string | null;
    house_number?: string | null;
    city?: string | null;
    state?: string | null;
    postcode?: string | null;
  } | null;
  opening_hours?: string[] | null;
};

async function fetchSupabaseFoodLocations(
  latitude: number,
  longitude: number,
  radiusMeters: number
): Promise<OSMPlace[]> {
  try {
    // Fetch a reasonable chunk of rows and sort client-side by distance.
    // Avoid filtering here so the calling screens can show all entries ordered by distance.
    const { data, error } = await supabase
      .from('osm_places')
      .select('place_id,name,type,lat,lon,address,opening_hours')
      .limit(5000); // adjust if your table is larger

    if (error || !data) {
      console.error('Supabase table fetch error:', error);
      return [];
    }

    const mapped = data.map(mapSupabasePlace).filter(Boolean) as OSMPlace[];

    // Compute distance for each place and sort by proximity.
    const withDistance = mapped
      .map((place) => {
        const lat = parseFloat(place.lat);
        const lon = parseFloat(place.lon);
        if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
        const distance = getDistance(latitude, longitude, lat, lon);
        return { place, distance };
      })
      .filter(Boolean) as Array<{ place: OSMPlace; distance: number }>;

    withDistance.sort((a, b) => a.distance - b.distance);

    // Return the places in nearest-first order (no radius cap here).
    return withDistance.map((item) => item.place);
  } catch (e) {
    console.error('Supabase table fetch error:', e);
    return [];
  }
}

function mapSupabasePlace(record: SupabaseOSMRecord): OSMPlace | null {
  if (!record.place_id || record.lat == null || record.lon == null) {
    return null;
  }

  const address = normalizeAddress(record.address ?? undefined);
  const display = record.name || address?.road || 'Food resource';

  return {
    place_id: record.place_id,
    lat: String(record.lat),
    lon: String(record.lon),
    display_name: display,
    type: record.type || 'food_resource',
    address,
    openingHours: record.opening_hours ?? undefined,
  };
}

function normalizeAddress(address?: SupabaseOSMRecord['address']): OSMPlace['address'] | undefined {
  if (!address) return undefined;
  const normalized: OSMPlace['address'] = {
    house_number: address.house_number ?? undefined,
    road: address.road ?? undefined,
    city: address.city ?? undefined,
    state: address.state ?? undefined,
    postcode: address.postcode ?? undefined,
  };

  const hasValue = Object.values(normalized).some(Boolean);
  return hasValue ? normalized : undefined;
}

// Helper: hydrate opening hours for places that don't have them yet
async function hydrateOpeningHours(places: OSMPlace[]): Promise<void> {
  const needHours = places.filter((p) => !p.openingHours || p.openingHours.length === 0);
  const persistQueue: Array<{ id: string; hours: string[] }> = [];

  // First try in-memory or persistent cache to avoid extra calls
  for (const p of needHours) {
    const mem = hoursMemoryCache.get(p.place_id);
    if (mem && mem.length) {
      p.openingHours = mem;
      continue;
    }
    const persisted = await getCachedPlaceHours(p.place_id);
    if (persisted && persisted.length) {
      p.openingHours = persisted;
      hoursMemoryCache.set(p.place_id, persisted);
    }
  }

  // Cache any newly provided hours from Supabase
  for (const place of places) {
    if (place.openingHours && place.openingHours.length) {
      hoursMemoryCache.set(place.place_id, place.openingHours);
      persistQueue.push({ id: place.place_id, hours: place.openingHours });
    }
  }

  if (persistQueue.length) {
    await Promise.all(
      persistQueue.map(({ id, hours }) => setCachedPlaceHours(id, hours))
    );
  }
}

export async function searchNearbyFoodLocations(
  latitude: number,
  longitude: number,
  radiusMeters = 5000,
  options?: { force?: boolean }
): Promise<OSMPlace[]> {
  const cacheKey = `osm_food_${latitude.toFixed(4)}_${longitude.toFixed(4)}_${radiusMeters}`;

  // Check Supabase cache first (unless force refresh)
  if (!options?.force) {
    const cached = await getCachedData<OSMPlace[]>(cacheKey);
    if (cached) {
      console.log('✅ Using cached OSM data from Supabase');
      return cached;
    }
  }

  console.log('🌐 Fetching fresh OSM data directly from Supabase table (sorted by distance)...');
  const supabaseResults = await fetchSupabaseFoodLocations(latitude, longitude, radiusMeters);
  console.log(`Supabase table returned: ${supabaseResults.length} entries (sorted)`);

  // The results from fetchSupabaseFoodLocations are already sorted by distance.
  const cappedResults = supabaseResults; // keep name for compatibility

  // Hydrate opening hours from cached data and Supabase payload
  await hydrateOpeningHours(cappedResults);

  // Save caches (persist + memory), including openingHours
  await setCachedData(cacheKey, cappedResults);
  memoryCache.set(cacheKey, { data: cappedResults, ts: Date.now() });
  cappedResults.forEach((p) => {
    if (p.openingHours?.length) hoursMemoryCache.set(p.place_id, p.openingHours);
  });

  return cappedResults;
}

export async function getOpeningHours(placeId: string): Promise<string[] | null> {
  // 1) in-memory hours
  const mem = hoursMemoryCache.get(placeId);
  if (mem && mem.length) return mem;

  // 2) persistent per-place hours
  const persisted = await getCachedPlaceHours(placeId);
  if (persisted && persisted.length) {
    hoursMemoryCache.set(placeId, persisted);
    return persisted;
  }

  return null;
}

export function formatOSMAddress(place: OSMPlace): string {
  if (!place.address) return '';

  const { road, house_number, city, state, postcode } = place.address;
  return [
    house_number ? `${house_number} ` : '',
    road,
    city ? `, ${city}` : '',
    state ? `, ${state}` : '',
    postcode ? `, ${postcode}` : '',
  ].join('');
}

export function categorizePlace(place: OSMPlace): string {
  const categoryMap: Record<string, string> = {
    'food_bank': 'Food Bank',
    'soup_kitchen': 'Soup Kitchen',
    'community_centre': 'Community Center',
    'place_of_worship': 'Place of Worship',
    'charity': 'Charity',
    'social_facility': 'Social Facility',
  };

  return categoryMap[place.type] || 'Other';
}

// Add this export to clear all in-memory caches from this module
export async function clearOSMMemoryCache() {
  memoryCache.clear();
  inflight.clear();
  hoursMemoryCache.clear();
  cache.clear(); // legacy map, safe to clear as well

  // Also remove persisted keys to ensure a true refresh
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter(
      (k) =>
        k.startsWith('osm_cache_') || // places list cache
        k.startsWith('osm_hours_') || // per-place hours
        k.includes('locations_') // legacy/unprefixed keys
    );
    if (toRemove.length) {
      await AsyncStorage.multiRemove(toRemove);
      console.log(`OSM: Cleared ${toRemove.length} persisted cache keys`);
    }
  } catch (e) {
    console.warn('OSM: Persistent cache clear failed', e);
  }
}
