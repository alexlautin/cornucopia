import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedData, getCachedPlaceHours, setCachedData, setCachedPlaceHours } from './cache';
import { getDistance } from './distance';

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

// Rate limiting: minimum delay between API calls (milliseconds)
const MIN_REQUEST_DELAY_MS = 2000; // 2 seconds minimum between requests
const OVERPASS_RETRY_LIMIT = 3;
const OVERPASS_RETRY_BASE_DELAY = 5000; // 5 seconds extra wait on 429
let lastOverpassRequestTime = 0;

// Max distance (miles) to include in results
const MAX_DISTANCE_MI = 2.5;
// Overpass response types
type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

async function fetchOverpassFoodLocations(
  latitude: number,
  longitude: number,
  radiusMeters: number
): Promise<OSMPlace[]> {
  // Enforce rate limiting: wait if necessary
  const timeSinceLastRequest = Date.now() - lastOverpassRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_DELAY_MS) {
    const delayNeeded = MIN_REQUEST_DELAY_MS - timeSinceLastRequest;
    console.log(`Rate limit: waiting ${delayNeeded}ms before Overpass request`);
    await new Promise((resolve) => setTimeout(resolve, delayNeeded));
  }

  // Build bounding box from center coordinates and radius
  // Approximate: 1 degree ≈ 111 km
  const radiusDegrees = radiusMeters / 111000;
  const south = (latitude - radiusDegrees).toFixed(2);
  const west = (longitude - radiusDegrees).toFixed(2);
  const north = (latitude + radiusDegrees).toFixed(2);
  const east = (longitude + radiusDegrees).toFixed(2);

  // Bounding box format: (south, west, north, east)
  const bbox = `(${south},${west},${north},${east})`;

  const query = `[out:json];(node["shop"="supermarket"]${bbox};way["shop"="supermarket"]${bbox};node["shop"="greengrocer"]${bbox};way["shop"="greengrocer"]${bbox};node["amenity"="food_bank"]${bbox};way["amenity"="food_bank"]${bbox};node["amenity"="soup_kitchen"]${bbox};way["amenity"="soup_kitchen"]${bbox};node["shop"="bakery"]${bbox};way["shop"="bakery"]${bbox};node["shop"="convenience"]${bbox};way["shop"="convenience"]${bbox};);out body;>;out skel qt;`;

  let attempt = 0;
  while (attempt <= OVERPASS_RETRY_LIMIT) {
    try {
      console.log('Overpass query:', query);
      const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
      lastOverpassRequestTime = Date.now();

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'FoodPantryApp/1.0 (Educational Project)',
          Accept: 'application/json',
        },
      });

      if (res.status === 429) {
        attempt += 1;
        if (attempt > OVERPASS_RETRY_LIMIT) {
          console.error('Overpass rate limit exceeded (429) – giving up');
          return [];
        }
        const wait = OVERPASS_RETRY_BASE_DELAY * attempt;
        console.warn(`Overpass rate limit hit (429). Retrying in ${wait}ms (attempt ${attempt})`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      if (!res.ok) {
        console.error('Overpass API error:', res.status, res.statusText);
        return [];
      }

      const json = await res.json();
      const elements: OverpassElement[] = json?.elements ?? [];

      const toPlace = (el: OverpassElement): OSMPlace | null => {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat == null || lon == null) return null;

        const tags = el.tags ?? {};
        const display =
          tags.name ||
          tags['operator'] ||
          tags['brand'] ||
          `${tags.shop || tags.amenity || 'Food resource'} (${el.type}/${el.id})`;
        const openingRaw = tags.opening_hours as string | undefined;
        const formatted = openingRaw ? formatOpeningHoursLines(openingRaw) : undefined;

        return {
          place_id: `overpass_${el.type}_${el.id}`,
          lat: String(lat),
          lon: String(lon),
          display_name: display,
          type: tags.shop || tags.amenity || 'food_resource',
          address: {
            house_number: tags['addr:housenumber'],
            road: tags['addr:street'],
            city: tags['addr:city'] || tags['addr:town'] || tags['addr:village'],
            state: tags['addr:state'],
            postcode: tags['addr:postcode'],
          },
          openingHours: formatted,
        };
      };

      return elements.map(toPlace).filter(Boolean) as OSMPlace[];
    } catch (e) {
      attempt += 1;
      if (attempt > OVERPASS_RETRY_LIMIT) {
        console.error('Overpass API error (giving up):', e);
        return [];
      }
      const wait = OVERPASS_RETRY_BASE_DELAY * attempt;
      console.warn(`Overpass fetch failed (${e}). Retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return [];
}

// Helper: hydrate opening hours for places that don't have them yet
async function hydrateOpeningHours(places: OSMPlace[]): Promise<void> {
  const needHours = places.filter((p) => !p.openingHours || p.openingHours.length === 0);

  // First try in-memory or persistent cache to avoid network calls
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

  // Fetch remaining via APIs (small concurrency to respect usage policies)
  const toFetch = needHours.filter((p) => !p.openingHours || p.openingHours.length === 0);
  if (!toFetch.length) return;

  const CONCURRENCY = 2;
  let idx = 0;

  async function worker() {
    while (idx < toFetch.length) {
      const cur = toFetch[idx++];
      try {
        const lines = await getOpeningHours(cur.place_id);
        if (lines && lines.length) {
          cur.openingHours = lines;
          hoursMemoryCache.set(cur.place_id, lines);
          await setCachedPlaceHours(cur.place_id, lines);
        }
      } catch {
        // ignore per-place failure
      }
      // gentle pacing
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, toFetch.length) }, worker);
  await Promise.all(workers);
}

export async function searchNearbyFoodLocations(
  latitude: number,
  longitude: number,
  radiusKm: number = 5,
  opts?: { force?: boolean }
): Promise<OSMPlace[]> {
  const cacheKey = `locations_${latitude.toFixed(2)}_${longitude.toFixed(2)}`;

  // If forcing, skip fast paths and drop in-memory entry for this key
  if (!opts?.force) {
    // 1) Fast path: valid in-memory cache
    const mem = memoryCache.get(cacheKey);
    if (mem && Date.now() - mem.ts < MEMORY_TTL_MS) {
      // seed hours memory cache from stored places
      mem.data.forEach((p) => {
        if (p.openingHours?.length) hoursMemoryCache.set(p.place_id, p.openingHours);
      });
      return mem.data;
    }

    // 2) Fast path: persistent cache -> memory
    const cached = await getCachedData<OSMPlace[]>(cacheKey);
    if (cached && cached.length) {
      cached.forEach((p) => {
        if (p.openingHours?.length) hoursMemoryCache.set(p.place_id, p.openingHours);
      });
      memoryCache.set(cacheKey, { data: cached, ts: Date.now() });
      return cached;
    }

    // 3) Deduplicate concurrent fetches
    if (inflight.has(cacheKey)) {
      return inflight.get(cacheKey)!;
    }
  } else {
    // Drop only in-memory entry for this key; persistent cache will be replaced after fetch
    memoryCache.delete(cacheKey);
  }

  const fetchPromise = (async () => {
    try {
      // Use Overpass API with bounding box for food-related locations
      const radiusMeters = radiusKm * 1000;
      const overpassResults = await fetchOverpassFoodLocations(latitude, longitude, radiusMeters);

      console.log(`Overpass returned: ${overpassResults.length}`);

      const computeClosest = (places: OSMPlace[]) => {
        const resultsWithDistance = places.map((place) => {
          const distance = getDistance(
            latitude,
            longitude,
            parseFloat(place.lat),
            parseFloat(place.lon)
          );
          return { place, distance };
        });

        const base = resultsWithDistance.filter((item) => item.distance <= MAX_DISTANCE_MI);
        const pool = base.length ? base : resultsWithDistance;

        return pool
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 100)
          .map((item) => item.place);
      };

      const cappedResults = computeClosest(overpassResults);

      // Hydrate opening hours (cached, then network where needed)
      await hydrateOpeningHours(cappedResults);

      // Save caches (persist + memory), including openingHours
      await setCachedData(cacheKey, cappedResults);
      memoryCache.set(cacheKey, { data: cappedResults, ts: Date.now() });
      cappedResults.forEach((p) => {
        if (p.openingHours?.length) hoursMemoryCache.set(p.place_id, p.openingHours);
      });

      return cappedResults;
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, fetchPromise);
  return fetchPromise;
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

  // 3) fetch from Overpass (all locations now come from Overpass)
  const lines = await fetchOverpassOpeningHoursById(placeId);
  if (lines?.length) {
    hoursMemoryCache.set(placeId, lines);
    await setCachedPlaceHours(placeId, lines);
    return lines;
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

// Format an OSM opening_hours string into readable lines
function formatOpeningHoursLines(opening: string): string[] {
  if (!opening) return [];  
  if (opening.trim() === '24/7') return ['Open 24/7'];

  const dayMap: Record<string, string> = {
    Mo: 'Mon', Tu: 'Tue', We: 'Wed', Th: 'Thu', Fr: 'Fri', Sa: 'Sat', Su: 'Sun',
  };

  const beautifyDays = (s: string) =>
    s.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (m) => dayMap[m] || m)
     .replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)-(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g, '$1–$2');

  return opening
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(beautifyDays);
}

// Fetch opening hours for Overpass id types: overpass_node_123, overpass_way_456, overpass_relation_789
async function fetchOverpassOpeningHoursById(overpassId: string): Promise<string[] | null> {
  try {
    const [, type, rawId] = overpassId.split('_'); // ['overpass', 'node', '123']
    if (!type || !rawId) return null;

    const query = `[out:json][timeout:25]; ${type}(${rawId}); out tags;`;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'FoodPantryApp/1.0 (Educational Project)',
        Accept: 'application/json',
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!res.ok) return null;
    const json = await res.json();
    const opening = json?.elements?.[0]?.tags?.opening_hours as string | undefined;
    if (!opening) return null;
    const lines = formatOpeningHoursLines(opening);
    return lines.length ? lines : null;
  } catch {
    return null;
  }
}

const cacheClearListeners = new Set<() => void>();

export function onOSMCacheCleared(listener: () => void) {
  cacheClearListeners.add(listener);
  return () => cacheClearListeners.delete(listener);
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

  cacheClearListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore individual listener failures
    }
  });
}
