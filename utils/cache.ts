import AsyncStorage from '@react-native-async-storage/async-storage';

// Make sure both prefixes exist at top-level
const CACHE_PREFIX = 'osm_cache_';
const HOURS_PREFIX = 'osm_hours_';

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!cached) return null;

    const entry: CacheEntry<T> = JSON.parse(cached);
    
    // Check if cache is still valid
    if (Date.now() - entry.timestamp > CACHE_DURATION) {
      await AsyncStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }

    return entry.data;
  } catch (error) {
    console.error('Error reading from cache:', error);
    return null;
  }
}

export async function setCachedData<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch (error) {
    console.error('Error writing to cache:', error);
  }
}

export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(
      (k) => k.startsWith(CACHE_PREFIX) || k.startsWith(HOURS_PREFIX)
    );
    if (cacheKeys.length) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
    console.log(`Cleared ${cacheKeys.length} cached keys`);
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

// Cache: opening hours per placeId
export async function getCachedPlaceHours(placeId: string): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(HOURS_PREFIX + placeId);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { data: string[]; timestamp: number };
    // Reuse the same TTL as other cached data, or customize if you want
    if (Date.now() - entry.timestamp > CACHE_DURATION) {
      await AsyncStorage.removeItem(HOURS_PREFIX + placeId);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export async function setCachedPlaceHours(placeId: string, hours: string[]): Promise<void> {
  try {
    const entry = JSON.stringify({ data: hours, timestamp: Date.now() });
    await AsyncStorage.setItem(HOURS_PREFIX + placeId, entry);
  } catch {
    // noop
  }
}
