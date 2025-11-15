import { supabase } from '@/lib/supabase';

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours - safe for OSM data

export async function getCachedData<T>(cacheKey: string): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from('osm_places_cache')
      .select('data, expires_at')
      .eq('cache_key', cacheKey)
      .single();

    if (error || !data) return null;

    // Check if cache has expired
    if (new Date(data.expires_at) < new Date()) {
      await supabase.from('osm_places_cache').delete().eq('cache_key', cacheKey);
      return null;
    }

    return data.data as T;
  } catch (error) {
    console.error('Error reading from cache:', error);
    return null;
  }
}

export async function setCachedData<T>(cacheKey: string, data: T): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + CACHE_DURATION_MS);

    await supabase
      .from('osm_places_cache')
      .upsert(
        {
          cache_key: cacheKey,
          data: data as any,
          expires_at: expiresAt.toISOString(),
          cached_at: new Date().toISOString(),
        },
        { onConflict: 'cache_key' }
      );
  } catch (error) {
    console.error('Error writing to cache:', error);
  }
}

export async function clearExpiredCache(): Promise<void> {
  try {
    await supabase
      .from('osm_places_cache')
      .delete()
      .lt('expires_at', new Date().toISOString());
  } catch (error) {
    console.error('Error clearing expired cache:', error);
  }
}
