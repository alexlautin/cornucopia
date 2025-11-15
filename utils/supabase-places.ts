import { supabase } from '@/lib/supabase';
import type { OSMPlace } from './osm-api';

type NearbyParams = {
  lat: number;
  lon: number;
  radiusKm?: number;
  limit?: number;
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
    const { data, error } = await supabase.rpc('nearby_places', {
      lat,
      lon,
      radius_m,
      limit_count: limit,
    });

    if (error) {
      console.error('Supabase nearby_places RPC error:', error);
      return null;
    }

    if (!Array.isArray(data)) return [];

    // Map rows to OSMPlace-like structure used by the app
    const mapped: OSMPlace[] = data.map((row: any) => ({
      place_id: row.id ? String(row.id) : `sb_${row.name}_${row.lat}_${row.lon}`,
      lat: String(row.lat),
      lon: String(row.lon),
      display_name: row.name || 'Food resource',
      type: row.category || row.type || 'food_resource',
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
    console.error('Supabase nearby fetch failed:', e);
    return null;
  }
}
