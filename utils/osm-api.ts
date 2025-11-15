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
  snap?: boolean;
  address?: {
    road?: string;
    house_number?: string;
    city?: string;
    state?: string;
    postcode?: string;
  };
  openingHours?: string[];
}

// In-module caches and helpers
const memoryCache = new Map<string, { data: OSMPlace[]; ts: number }>();
const hoursMemoryCache = new Map<string, string[]>();
const inflight = new Map<string, Promise<OSMPlace[]>>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

type SupabaseOSMRecord = {
  place_id: string;
  name: string | null;
  type: string | null;
  lat: number | null;
  lon: number | null;
  snap_eligible?: boolean | null;
  snap?: boolean | null; // legacy/back-compat
  address?: {
    road?: string | null;
    house_number?: string | null;
    city?: string | null;
    state?: string | null;
    postcode?: string | null;
  } | null;
  opening_hours?: string[] | null;
};

function normalizeAddress(address?: SupabaseOSMRecord['address']): OSMPlace['address'] | undefined {
  if (!address) return undefined;
  const normalized: OSMPlace['address'] = {
    house_number: address.house_number ?? undefined,
    road: address.road ?? undefined,
    city: address.city ?? undefined,
    state: address.state ?? undefined,
    postcode: address.postcode ?? undefined,
  };
  return Object.values(normalized).some(Boolean) ? normalized : undefined;
}

function mapSupabasePlace(record: SupabaseOSMRecord): OSMPlace | null {
  if (!record.place_id || record.lat == null || record.lon == null) return null;
  const address = normalizeAddress(record.address ?? undefined);
  const display = record.name || address?.road || 'Food resource';
  return {
    place_id: record.place_id,
    lat: String(record.lat),
    lon: String(record.lon),
    display_name: display,
    type: record.type || 'food_resource',
    snap: Boolean((record as any).snap_eligible ?? (record as any).snap ?? (record as any).SNAP ?? false),
    address,
    openingHours: record.opening_hours ?? undefined,
  };
}

async function fetchSupabaseFoodLocations(latitude: number, longitude: number): Promise<OSMPlace[]> {
  try {
    // Determine which select clause works, preferring snap_eligible
    const selectClauses = [
      'place_id,name,type,lat,lon,address,opening_hours,snap_eligible',
      'place_id,name,type,lat,lon,address,opening_hours,snap',
      'place_id,name,type,lat,lon,address,opening_hours,"SNAP"',
    ];

    let workingSelect: string | null = null;

    for (const clause of selectClauses) {
      try {
        const probe = await supabase
          .from('osm_and_snap_places_atl')
          .select(clause)
          .range(0, 0);
        if (!probe.error) {
          workingSelect = clause;
          break;
        }
      } catch {
        // try next
      }
    }

    if (!workingSelect) {
      console.error('Supabase table fetch error: no valid select clause for SNAP column');
      return [];
    }

    // Paginate through all rows in chunks
    const pageSize = 1000;
    let from = 0;
    let allRows: SupabaseOSMRecord[] = [];

    while (true) {
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from('osm_and_snap_places_atl')
        .select(workingSelect)
        .range(from, to);

      if (error) {
        console.error('Supabase table fetch error (paged):', error);
        break;
      }

      const batch: SupabaseOSMRecord[] = (data as any) || [];
      allRows = allRows.concat(batch);

      if (batch.length < pageSize) break; // last page
      from += pageSize;
      // small yield to avoid blocking event loop on mobile
      await new Promise((r) => setTimeout(r, 0));
    }

    const mapped = allRows.map(mapSupabasePlace).filter(Boolean) as OSMPlace[];

    const withDistance = mapped
      .map((place) => {
        const lat = parseFloat(place.lat);
        const lon = parseFloat(place.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const distance = getDistance(latitude, longitude, lat, lon);
        return { place, distance };
      })
      .filter(Boolean) as Array<{ place: OSMPlace; distance: number }>;

    withDistance.sort((a, b) => a.distance - b.distance);
    return withDistance.map((i) => i.place);
  } catch (e) {
    console.error('Supabase table fetch error:', e);
    return [];
  }
}

// Hydrate opening hours from memory, persistent cache, or payload; persist newly discovered hours.
async function hydrateOpeningHours(places: OSMPlace[]): Promise<void> {
  const needHours = places.filter((p) => !p.openingHours || p.openingHours.length === 0);
  const persistQueue: Array<{ id: string; hours: string[] }> = [];

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

  for (const place of places) {
    if (place.openingHours && place.openingHours.length) {
      hoursMemoryCache.set(place.place_id, place.openingHours);
      persistQueue.push({ id: place.place_id, hours: place.openingHours });
    }
  }

  if (persistQueue.length) {
    await Promise.all(persistQueue.map(({ id, hours }) => setCachedPlaceHours(id, hours)));
  }
}

export async function searchNearbyFoodLocations(
  latitude: number,
  longitude: number,
  radiusMeters = 5000,
  options?: { force?: boolean }
): Promise<OSMPlace[]> {
  const cacheKey = `osm_food_${latitude.toFixed(4)}_${longitude.toFixed(4)}_${radiusMeters}`;

  if (!options?.force) {
    const mem = memoryCache.get(cacheKey);
    if (mem && Date.now() - mem.ts < CACHE_TTL_MS) {
      mem.data.forEach((p) => p.openingHours && hoursMemoryCache.set(p.place_id, p.openingHours!));
      return mem.data;
    }

    const persisted = await getCachedData<OSMPlace[]>(cacheKey);
    if (persisted && persisted.length) {
      memoryCache.set(cacheKey, { data: persisted, ts: Date.now() });
      persisted.forEach((p) => p.openingHours && hoursMemoryCache.set(p.place_id, p.openingHours!));
      return persisted;
    }

    if (inflight.has(cacheKey)) return inflight.get(cacheKey)!;
  } else {
    memoryCache.delete(cacheKey);
  }

  const fetchPromise = (async () => {
    try {
      const results = await fetchSupabaseFoodLocations(latitude, longitude);
      await hydrateOpeningHours(results);
      await setCachedData(cacheKey, results);
      memoryCache.set(cacheKey, { data: results, ts: Date.now() });
      results.forEach((p) => p.openingHours && hoursMemoryCache.set(p.place_id, p.openingHours!));
      return results;
    } catch (e) {
      console.error('searchNearbyFoodLocations error:', e);
      return [];
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, fetchPromise);
  return fetchPromise;
}

export async function getOpeningHours(placeId: string): Promise<string[] | null> {
  const mem = hoursMemoryCache.get(placeId);
  if (mem && mem.length) return mem;

  const persisted = await getCachedPlaceHours(placeId);
  if (persisted && persisted.length) {
    hoursMemoryCache.set(placeId, persisted);
    return persisted;
  }

  return null;
}

export function formatOSMAddress(place: OSMPlace): string {
  if (!place.address) return '';
  const { house_number, road, city, state, postcode } = place.address;
  return [
    house_number ? `${house_number} ` : '',
    road ?? '',
    city ? `, ${city}` : '',
    state ? `, ${state}` : '',
    postcode ? ` ${postcode}` : '',
  ].join('').trim();
}

export function categorizePlace(place: OSMPlace): string {
  const categoryMap: Record<string, string> = {
    food_bank: 'Food Bank',
    soup_kitchen: 'Soup Kitchen',
    community_centre: 'Community Center',
    place_of_worship: 'Place of Worship',
    charity: 'Charity',
    social_facility: 'Social Facility',
    supermarket: 'Supermarket',
    greengrocer: 'Greengrocer',
    convenience: 'Convenience Store',
    bakery: 'Bakery',
    market: 'Market',
    deli: 'Deli',
  };

  return categoryMap[place.type] || place.type || 'Other';
}

// Cache-clear listener helpers
const cacheClearListeners = new Set<() => void>();
export function onOSMCacheCleared(listener: () => void) {
  cacheClearListeners.add(listener);
  return () => {
    cacheClearListeners.delete(listener);
  };
}

export async function clearOSMMemoryCache() {
  memoryCache.clear();
  inflight.clear();
  hoursMemoryCache.clear();

  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter((k) => k.startsWith('osm_cache_') || k.startsWith('osm_hours_') || k.includes('locations_'));
    if (toRemove.length) {
      await AsyncStorage.multiRemove(toRemove);
      console.log(`OSM: Cleared ${toRemove.length} persisted cache keys`);
    }
  } catch (e) {
    console.warn('OSM: Persistent cache clear failed', e);
  }

  cacheClearListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore listener errors
    }
  });
}
