import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { getCachedPlaceHours, setCachedPlaceHours } from "./cache";
import { getDistance } from "./distance";
import { getCachedData, setCachedData } from "./supabase-cache";

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
  // Fallback when upstream address is a single formatted string
  addressText?: string;
  openingHours?: string[];
}

// In-module caches and helpers
const memoryCache = new Map<string, { data: OSMPlace[]; ts: number }>();
const hoursMemoryCache = new Map<string, string[]>();
const inflight = new Map<string, Promise<OSMPlace[]>>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
// Bump this when schema/mapping changes to invalidate persisted caches
const CACHE_VERSION = "v2_addr_root";
const DEBUG_OSM = (() => {
  const env = (process.env.EXPO_PUBLIC_DEBUG_OSM || "").toLowerCase();
  if (env === "true") return true;
  const extra = (Constants.expoConfig?.extra || {}) as any;
  const extraFlag = String(
    extra.EXPO_PUBLIC_DEBUG_OSM ?? extra.debugOSM ?? ""
  ).toLowerCase();
  return extraFlag === "true";
})();
let SNAP_DEBUG_COUNT = 0;
const MAX_SNAP_DEBUG = 25;

type SupabaseOSMRecord = {
  place_id: string;
  name: string | null;
  type: string | null;
  lat: number | null;
  lon: number | null;
  snap_eligible?: boolean | null;
  snap?: boolean | null; // legacy/back-compat
  // In DB this may be a JSON object or a JSON/stringified blob or a plain string
  address?: any | null;
  // Potential root-level address fields (varies by source)
  road?: string | null;
  street?: string | null;
  street_name?: string | null;
  house_number?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  postal_code?: string | null;
  zip?: string | null;
  formatted_address?: string | null;
  address1?: string | null;
  line1?: string | null;
  opening_hours?: string[] | null;
};

function normalizeAddress(address?: SupabaseOSMRecord["address"]): {
  obj?: OSMPlace["address"];
  text?: string;
} {
  if (address == null) return {};

  let value: any = address;
  if (typeof address === "string") {
    const s = address.trim();
    // Try to parse JSON if it looks like it
    if (
      (s.startsWith("{") && s.endsWith("}")) ||
      (s.startsWith('"') && s.endsWith('"'))
    ) {
      try {
        value = JSON.parse(s);
      } catch {
        return { text: s.replace(/^\"|\"$/g, "") };
      }
    } else {
      return { text: s };
    }
  }

  if (typeof value !== "object" || Array.isArray(value)) return {};

  // Access helper against a provided object
  const pickFrom = (obj: any) => {
    const get = (keys: string[]): string | undefined => {
      for (const k of keys) {
        const v = obj[k];
        if (v != null && String(v).trim().length) return String(v);
      }
      return undefined;
    };

    const normalized: OSMPlace["address"] = {
      house_number: get([
        "house_number",
        "housenumber",
        "number",
        "addr:housenumber",
        "addr:house_number",
        "houseNumber",
      ]),
      road: get([
        "road",
        "street",
        "addr:street",
        "street_name",
        "addr1",
        "address1",
        "thoroughfare",
      ]),
      city: get(["city", "town", "village", "locality"]),
      state: get(["state", "region", "state_code", "province"]),
      postcode: get(["postcode", "postal_code", "zip", "zipcode"]),
    };

    const hasAny = Object.values(normalized).some(Boolean);
    if (hasAny) return { obj: normalized } as const;

    // Fallback: maybe there is a single-line field
    const line = get([
      "full",
      "display",
      "display_name",
      "formatted",
      "address",
      "formatted_address",
      "line1",
    ]);
    if (line) return { text: line } as const;
    return {} as const;
  };

  // Try top-level first
  let res = pickFrom(value);
  if (res.obj || res.text) return res;

  // Try common nested containers one level deep
  for (const key of ["address", "properties", "attrs", "data"]) {
    if (value && typeof value[key] === "object" && !Array.isArray(value[key])) {
      res = pickFrom(value[key]);
      if (res.obj || res.text) return res;
    }
  }

  // As a last resort scan first nested object value
  for (const v of Object.values(value)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      res = pickFrom(v);
      if (res.obj || res.text) return res;
    }
  }

  return {};
}

function mapSupabasePlace(record: SupabaseOSMRecord): OSMPlace | null {
  if (!record.place_id || record.lat == null || record.lon == null) return null;
  const { obj: address, text: addressText } = normalizeAddress(
    record.address ?? undefined
  );
  // Fallbacks from root-level fields when address JSON lacks street info
  let addrObj = address;
  let addrText = addressText;
  if (!addrObj || !(addrObj.house_number || addrObj.road)) {
    const road =
      (record.road || record.street || record.street_name || undefined) ??
      undefined;
    const house_number = (record.house_number || undefined) ?? undefined;
    const city = (record.city || undefined) ?? addrObj?.city;
    const state = (record.state || undefined) ?? addrObj?.state;
    const postcode =
      (record.postcode || record.postal_code || record.zip || undefined) ??
      addrObj?.postcode;
    if (road || house_number || city || state || postcode) {
      addrObj = {
        house_number: house_number ?? addrObj?.house_number,
        road: road ?? addrObj?.road,
        city,
        state,
        postcode,
      };
    }
    if (!addrText) {
      addrText =
        (record.formatted_address ||
          record.address1 ||
          record.line1 ||
          undefined) ??
        undefined;
    }
  }

  const display = record.name || addrObj?.road || "Food resource";
  const mapped: OSMPlace = {
    place_id: record.place_id,
    lat: String(record.lat),
    lon: String(record.lon),
    display_name: display,
    type: record.type || "food_resource",
    snap: Boolean(
      (record as any).snap_eligible ??
        (record as any).snap ??
        (record as any).SNAP ??
        false
    ),
    address: addrObj,
    addressText: addrText,
    openingHours: record.opening_hours ?? undefined,
  };
  if (DEBUG_OSM && mapped.snap && SNAP_DEBUG_COUNT < MAX_SNAP_DEBUG) {
    try {
      const formatted = formatOSMAddress(mapped);
      console.log("OSM SNAP address debug", {
        id: mapped.place_id,
        raw: record.address,
        normalized: mapped.address,
        text: mapped.addressText,
        formatted,
      });
      SNAP_DEBUG_COUNT += 1;
    } catch {}
  }
  return mapped;
}

async function fetchSupabaseFoodLocations(
  latitude: number,
  longitude: number
): Promise<OSMPlace[]> {
  try {
    // Select all columns to accommodate varying schemas between OSM and SNAP rows
    const workingSelect = "*";

    // Paginate through all rows in chunks
    const pageSize = 1000;
    let from = 0;
    let allRows: SupabaseOSMRecord[] = [];

    while (true) {
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from("osm_and_snap_places_atl")
        .select(workingSelect)
        .range(from, to);

      if (error) {
        console.error("Supabase table fetch error (paged):", error);
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
    console.error("Supabase table fetch error:", e);
    return [];
  }
}

// Hydrate opening hours from memory, persistent cache, or payload; persist newly discovered hours.
async function hydrateOpeningHours(places: OSMPlace[]): Promise<void> {
  const needHours = places.filter(
    (p) => !p.openingHours || p.openingHours.length === 0
  );
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
  const cacheKey = `osm_food_${CACHE_VERSION}_${latitude.toFixed(
    4
  )}_${longitude.toFixed(4)}_${radiusMeters}`;

  if (DEBUG_OSM) {
    try {
      console.log("OSM DEBUG enabled", {
        cacheKey,
        latitude,
        longitude,
        radiusMeters,
      });
    } catch {}
  }

  if (!options?.force) {
    const mem = memoryCache.get(cacheKey);
    if (mem && Date.now() - mem.ts < CACHE_TTL_MS) {
      if (DEBUG_OSM) {
        try {
          const snapCount = mem.data.filter((r) => r.snap).length;
          console.log("OSM DEBUG returning memory cache", {
            total: mem.data.length,
            snap: snapCount,
            cacheKey,
          });
          const problematic = mem.data
            .filter(
              (r) =>
                r.snap &&
                (!r.address || !(r.address.house_number || r.address.road))
            )
            .slice(0, 10)
            .map((r) => ({
              id: r.place_id,
              addr: r.address,
              text: r.addressText,
              formatted: formatOSMAddress(r),
            }));
          if (problematic.length)
            console.log("OSM DEBUG SNAP (mem) no-street sample", problematic);
        } catch {}
      }
      mem.data.forEach(
        (p) =>
          p.openingHours && hoursMemoryCache.set(p.place_id, p.openingHours!)
      );
      return mem.data;
    }

    const persisted = await getCachedData<OSMPlace[]>(cacheKey);
    if (persisted && persisted.length) {
      if (DEBUG_OSM) {
        try {
          const snapCount = persisted.filter((r) => r.snap).length;
          console.log("OSM DEBUG returning persisted cache", {
            total: persisted.length,
            snap: snapCount,
            cacheKey,
          });
          const problematic = persisted
            .filter(
              (r) =>
                r.snap &&
                (!r.address || !(r.address.house_number || r.address.road))
            )
            .slice(0, 10)
            .map((r) => ({
              id: r.place_id,
              addr: r.address,
              text: r.addressText,
              formatted: formatOSMAddress(r),
            }));
          if (problematic.length)
            console.log(
              "OSM DEBUG SNAP (persisted) no-street sample",
              problematic
            );
        } catch {}
      }
      memoryCache.set(cacheKey, { data: persisted, ts: Date.now() });
      persisted.forEach(
        (p) =>
          p.openingHours && hoursMemoryCache.set(p.place_id, p.openingHours!)
      );
      return persisted;
    }

    if (inflight.has(cacheKey)) return inflight.get(cacheKey)!;
  } else {
    memoryCache.delete(cacheKey);
  }

  const fetchPromise = (async () => {
    try {
      const results = await fetchSupabaseFoodLocations(latitude, longitude);
      if (DEBUG_OSM) {
        try {
          const snapCount = results.filter((r) => r.snap).length;
          console.log("OSM DEBUG fetched results", {
            total: results.length,
            snap: snapCount,
          });
          const problematic = results
            .filter(
              (r) =>
                r.snap &&
                (!r.address || !(r.address.house_number || r.address.road))
            )
            .slice(0, 10)
            .map((r) => ({
              id: r.place_id,
              addr: r.address,
              text: r.addressText,
              formatted: formatOSMAddress(r),
            }));
          if (problematic.length)
            console.log("OSM DEBUG SNAP no-street sample", problematic);
        } catch {}
      }
      await hydrateOpeningHours(results);
      await setCachedData(cacheKey, results);
      memoryCache.set(cacheKey, { data: results, ts: Date.now() });
      results.forEach(
        (p) =>
          p.openingHours && hoursMemoryCache.set(p.place_id, p.openingHours!)
      );
      return results;
    } catch (e) {
      console.error("searchNearbyFoodLocations error:", e);
      return [];
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, fetchPromise);
  return fetchPromise;
}

export async function getOpeningHours(
  placeId: string
): Promise<string[] | null> {
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
  if (place.address) {
    const { house_number, road, city, state, postcode } = place.address;
    const hasStreet = Boolean(
      (house_number && house_number.trim()) || (road && road.trim())
    );

    if (hasStreet) {
      const line = [
        house_number ? `${house_number} ` : "",
        road ?? "",
        city ? `, ${city}` : "",
        state ? `, ${state}` : "",
        postcode ? ` ${postcode}` : "",
      ]
        .join("")
        .trim();
      if (line.length) return line;
    } else {
      // No street info — prefer a single-line formatted address if available
      if (place.addressText && place.addressText.trim().length)
        return place.addressText.trim();
      // Otherwise, compose a clean city/state/postcode line without leading commas
      const cityState = [city, state].filter(Boolean).join(", ");
      const line = [cityState, postcode].filter(Boolean).join(" ");
      if (line.trim().length) return line.trim();
    }
  }
  if (place.addressText && place.addressText.trim().length)
    return place.addressText.trim();
  return "";
}

export function categorizePlace(place: OSMPlace): string {
  const categoryMap: Record<string, string> = {
    food_bank: "Food Bank",
    soup_kitchen: "Soup Kitchen",
    community_centre: "Community Center",
    place_of_worship: "Place of Worship",
    charity: "Charity",
    social_facility: "Social Facility",
    supermarket: "Supermarket",
    greengrocer: "Greengrocer",
    convenience: "Convenience Store",
    bakery: "Bakery",
    market: "Market",
    deli: "Deli",
  };

  return categoryMap[place.type] || place.type || "Other";
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
    const toRemove = keys.filter(
      (k) =>
        k.startsWith("osm_cache_") ||
        k.startsWith("osm_hours_") ||
        k.includes("locations_")
    );
    if (toRemove.length) {
      await AsyncStorage.multiRemove(toRemove);
      console.log(`OSM: Cleared ${toRemove.length} persisted cache keys`);
    }
  } catch (e) {
    console.warn("OSM: Persistent cache clear failed", e);
  }

  cacheClearListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore listener errors
    }
  });
}
