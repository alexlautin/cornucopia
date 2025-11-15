import { supabase } from "@/lib/supabase";
import type { OSMPlace } from "./osm-api";

type NearbyParams = {
  lat: number;
  lon: number;
  radiusKm?: number;
  limit?: number; // total desired max to return
};

// Fetch nearby places from Supabase via an RPC that uses PostGIS for fast radius queries.
export async function fetchNearbyPlacesFromSupabase({
  lat,
  lon,
  radiusKm = 10,
  limit = 300,
}: NearbyParams): Promise<OSMPlace[] | null> {
  try {
    const radius_m = Math.max(100, Math.floor(radiusKm * 1000));
    const PAGE = 1000; // Supabase/PostgREST typical row cap per request
    const target = Math.max(1, limit);
    let offset = 0;
    const all: any[] = [];

    while (all.length < target) {
      const pageLimit = Math.min(PAGE, target - all.length);
      const { data, error } = await supabase.rpc("nearby_places", {
        lat,
        lon,
        radius_m,
        limit_count: pageLimit,
        offset_count: offset,
      });

      if (error) {
        console.error("Supabase nearby_places RPC error:", error);
        break;
      }

      const rows: any[] = Array.isArray(data) ? data : [];
      all.push(...rows);
      if (rows.length < pageLimit) break; // no more rows
      offset += rows.length;
    }

    // Map rows to OSMPlace-like structure used by the app
    const mapped: OSMPlace[] = all.slice(0, target).map((row: any) => ({
      place_id: row.id ? String(row.id) : `sb_${row.name}_${row.lat}_${row.lon}`,
      lat: String(row.lat),
      lon: String(row.lon),
      display_name: row.name || "Food resource",
      type: row.category || row.type || "food_resource",
      address: {
        road: row.road || row.address_line || undefined,
        house_number: row.house_number || undefined,
        city: row.city || undefined,
        state: row.state || undefined,
        postcode: row.postcode || undefined,
      },
      openingHours: Array.isArray(row.opening_hours_lines)
        ? (row.opening_hours_lines as string[])
        : undefined,
    }));

    return mapped;
  } catch (e) {
    console.error("Supabase nearby fetch failed:", e);
    return null;
  }
}
