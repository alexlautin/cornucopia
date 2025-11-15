// src/services/scores.ts (moved out of app/ to avoid route scanning)
import { supabase } from "../lib/supabase";

export type ScoreRow = {
  geoid: string;
  score_0_100: number;
  components: {
    subscores?: {
      A_lowIncomeLowAccess_flag?: number;
      B_lowAccessShare?: number;
      C_noVehicleLowAccessShare?: number;
      D_vulnerableLowAccessShare?: number;
    };
    raw?: {
      lila_flag?: number;
      lapop1?: number;
      lahunv1?: number;
      laseniors1?: number;
      lakids1?: number;
      lasnap1?: number;
      pop2010?: number;
      vulnerable_rate?: number;
    };
  } | null;
  vintage: string | null;
  computed_at: string;
};

/**
 * Fetch the food access score for a given census tract (geoid).
 */
export async function fetchScoreForTract(
  geoid: string
): Promise<ScoreRow | null> {
  const { data, error } = await supabase
    .from("scores")
    .select("geoid, score_0_100, components, vintage, computed_at")
    .eq("geoid", geoid)
    .maybeSingle();

  if (error) {
    console.error("Error fetching score for tract", geoid, error);
    throw error;
  }

  return data as ScoreRow | null;
}
