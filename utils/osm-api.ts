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
const MEMORY_TTL_MS = 5 * 60 * 1000;
const memoryCache = new Map<string, { data: OSMPlace[]; ts: number }>();
const inflight = new Map<string, Promise<OSMPlace[]>>();
// New: in-memory hours map per placeId
const hoursMemoryCache = new Map<string, string[]>();

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
  const query = `
    [out:json][timeout:25];
    (
      node(around:${radiusMeters},${latitude},${longitude})["amenity"="social_facility"]["social_facility"="food_bank"];
      way(around:${radiusMeters},${latitude},${longitude})["amenity"="social_facility"]["social_facility"="food_bank"];
      relation(around:${radiusMeters},${latitude},${longitude})["amenity"="social_facility"]["social_facility"="food_bank"];

      node(around:${radiusMeters},${latitude},${longitude})["charity"="food_bank"];
      way(around:${radiusMeters},${latitude},${longitude})["charity"="food_bank"];
      relation(around:${radiusMeters},${latitude},${longitude})["charity"="food_bank"];

      node(around:${radiusMeters},${latitude},${longitude})["amenity"="food_bank"];
      way(around:${radiusMeters},${latitude},${longitude})["amenity"="food_bank"];
      relation(around:${radiusMeters},${latitude},${longitude})["amenity"="food_bank"];

      node(around:${radiusMeters},${latitude},${longitude})["amenity"="soup_kitchen"];
      way(around:${radiusMeters},${latitude},${longitude})["amenity"="soup_kitchen"];
      relation(around:${radiusMeters},${latitude},${longitude})["amenity"="soup_kitchen"];

      node(around:${radiusMeters},${latitude},${longitude})["amenity"="place_of_worship"]["pantry"~"yes|food"];
      node(around:${radiusMeters},${latitude},${longitude})["amenity"="place_of_worship"]["food_bank"="yes"];

      node(around:${radiusMeters},${latitude},${longitude})["amenity"="community_centre"]["food_bank"="yes"];
      node(around:${radiusMeters},${latitude},${longitude})["social_facility:for"~"food|homeless"];

      node(around:${radiusMeters},${latitude},${longitude})["pantry"="yes"];
      way(around:${radiusMeters},${latitude},${longitude})["pantry"="yes"];
      relation(around:${radiusMeters},${latitude},${longitude})["pantry"="yes"];

      node(around:${radiusMeters},${latitude},${longitude})["social_facility"="outreach"];
      way(around:${radiusMeters},${latitude},${longitude})["social_facility"="outreach"];
      relation(around:${radiusMeters},${latitude},${longitude})["social_facility"="outreach"];

      node(around:${radiusMeters},${latitude},${longitude})["amenity"="community_centre"]["pantry"="yes"];
      way(around:${radiusMeters},${latitude},${longitude})["amenity"="community_centre"]["pantry"="yes"];
      relation(around:${radiusMeters},${latitude},${longitude})["amenity"="community_centre"]["pantry"="yes"];

      node(around:${radiusMeters},${latitude},${longitude})["service:food"="yes"];
      way(around:${radiusMeters},${latitude},${longitude})["service:food"="yes"];
      relation(around:${radiusMeters},${latitude},${longitude})["service:food"="yes"];
    );
    out center tags;
  `;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'FoodPantryApp/1.0 (Educational Project)',
        Accept: 'application/json',
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!res.ok) return [];

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
        `${tags.amenity || tags.social_facility || 'Food resource'} (${el.type}/${el.id})`;
      const openingRaw = tags.opening_hours as string | undefined;
      const formatted = openingRaw ? formatOpeningHoursLines(openingRaw) : undefined;

      return {
        place_id: `overpass_${el.type}_${el.id}`,
        lat: String(lat),
        lon: String(lon),
        display_name: display,
        type: tags.amenity || tags.social_facility || 'food_resource',
        address: {
          house_number: tags['addr:housenumber'],
          road: tags['addr:street'],
          city: tags['addr:city'] || tags['addr:town'] || tags['addr:village'],
          state: tags['addr:state'],
          postcode: tags['addr:postcode'],
        },
        openingHours: formatted, // New
      };
    };

    return elements.map(toPlace).filter(Boolean) as OSMPlace[];
  } catch (e) {
    console.warn('Overpass fallback failed', e);
    return [];
  }
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
      // Reduced and prioritized queries for faster initial load
      const queries = [
        'food bank',
        'food pantry',
        'soup kitchen',
        'salvation army',
        'community kitchen',
        'free meals'
      ];

      const allResults: OSMPlace[] = [];
      // Use a ~2.5mi bounding box for Nominatim queries (≈0.036°). Slightly larger for tolerance.
      const searchRadius = 0.04; // ≈2.5 miles bbox

      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?` +
              `q=${encodeURIComponent(query)}&` +
              `lat=${latitude}&lon=${longitude}&` +
              `format=json&limit=50&` + // was 30 -> 50
              `addressdetails=1&` +
              `bounded=1&` +
              `viewbox=${longitude - searchRadius},${latitude - searchRadius},${longitude + searchRadius},${latitude + searchRadius}`,
            {
              headers: {
                'User-Agent': 'FoodPantryApp/1.0 (Educational Project)',
              },
            }
          );
          if (response.ok) {
            const results = await response.json();
            console.log(`Found ${results.length} results for "${query}"`);
            allResults.push(...results);
          }
        } catch (error) {
          console.error(`Error fetching "${query}":`, error);
        }

        if (i < queries.length - 1) {
          // raise early stop threshold so we collect more before stopping
          if (allResults.length >= 200) {
            console.log('Found enough results, stopping early');
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1100));
        }
      }

      // De-dupe Nominatim
      const uniqueResults = Array.from(
        new Map(allResults.map((item) => [item.place_id, item])).values()
      );
      console.log(`Total unique Nominatim results: ${uniqueResults.length}`);

      // Always supplement with Overpass (tag-based), but only within ~2.5mi (≈4km)
      const overpassSupp = await fetchOverpassFoodLocations(latitude, longitude, 4000); // ≈2.5 miles
      console.log(`Overpass returned: ${overpassSupp.length}`);

      const mergedUnique = Array.from(
        new Map([...uniqueResults, ...overpassSupp].map((p) => [p.place_id, p])).values()
      );
      console.log(`Merged unique results: ${mergedUnique.length}`);

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

        return resultsWithDistance
          .filter((item) => item.distance <= MAX_DISTANCE_MI) // was 10
          .sort((a, b) => a.distance - b.distance)
          .map((item) => item.place)
          .slice(0, 100); // keep up to 100 within 2.5 miles
      };

      // Use merged set (Nominatim + Overpass), then filter/sort/cap
      let cappedResults = computeClosest(mergedUnique);

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

export async function getPlaceDetails(placeId: string): Promise<OSMPlace | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/details?` +
        `place_id=${placeId}&` +
        `format=json&` +
        `addressdetails=1`,
      {
        headers: {
          'User-Agent': 'FoodPantryApp/1.0 (Educational Project)',
        },
      }
    );

    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    console.error('Error fetching place details:', error);
    return null;
  }
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

  // 3) fetch from the appropriate source and store
  if (placeId.startsWith('overpass_')) {
    const lines = await fetchOverpassOpeningHoursById(placeId);
    if (lines?.length) {
      hoursMemoryCache.set(placeId, lines);
      await setCachedPlaceHours(placeId, lines);
      return lines;
    }
    return null;
  }

  const lines = await fetchNominatimOpeningHoursByPlaceId(placeId);
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

// Fetch opening hours for Nominatim place_id via details endpoint
async function fetchNominatimOpeningHoursByPlaceId(placeId: string): Promise<string[] | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/details?place_id=${encodeURIComponent(
        placeId
      )}&format=json&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'FoodPantryApp/1.0 (Educational Project)',
          Accept: 'application/json',
        },
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    const opening =
      data?.extratags?.opening_hours ||
      data?.addtags?.opening_hours ||
      data?.tags?.opening_hours ||
      data?.opening_hours;
    if (!opening || typeof opening !== 'string') return null;
    const lines = formatOpeningHoursLines(opening);
    return lines.length ? lines : null;
  } catch {
    return null;
  }
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
