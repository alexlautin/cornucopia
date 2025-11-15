// app/lib/supabase.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

// Support both EXPO_PUBLIC_SUPABASE_ANON_KEY (preferred) and EXPO_PUBLIC_SUPABASE_KEY (legacy)
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [
    !supabaseUrl && "EXPO_PUBLIC_SUPABASE_URL",
    !supabaseAnonKey &&
      "EXPO_PUBLIC_SUPABASE_ANON_KEY (or EXPO_PUBLIC_SUPABASE_KEY)",
  ]
    .filter(Boolean)
    .join(", ");
  throw new Error(
    `Supabase env missing: ${missing}. Add to your .env or app config.`
  );
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey
);
