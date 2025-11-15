#!/usr/bin/env node
/*
  Seed Supabase `places` from Overpass (OSM) for a bounding box or center+radius.

  Usage examples:
    node scripts/seed-places.js --bbox 37.70,-122.50,37.88,-122.32
    node scripts/seed-places.js --center 37.7858,-122.4064 --radiusKm 10

  Requires env:
    EXPO_PUBLIC_SUPABASE_URL
    EXPO_PUBLIC_SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_KEY
*/

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Lightweight .env loader so the script works outside Expo
function loadDotEnv() {
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (!line || line.trim().startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = val;
      }
    }
    console.log("env: loaded .env for seed script");
  } catch {
    // ignore
  }
}
loadDotEnv();

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--bbox") {
      const v = argv[++i];
      const [south, west, north, east] = (v || "")
        .split(",")
        .map((x) => parseFloat(x.trim()));
      if ([south, west, north, east].some((n) => Number.isNaN(n))) {
        throw new Error("Invalid --bbox. Expected: south,west,north,east");
      }
      args.bbox = { south, west, north, east };
    } else if (a === "--center") {
      const v = argv[++i];
      const [lat, lon] = (v || "").split(",").map((x) => parseFloat(x.trim()));
      if ([lat, lon].some((n) => Number.isNaN(n))) {
        throw new Error("Invalid --center. Expected: lat,lon");
      }
      args.center = { lat, lon };
    } else if (a === "--radiusKm") {
      const v = parseFloat(argv[++i]);
      if (!Number.isFinite(v) || v <= 0) throw new Error("Invalid --radiusKm");
      args.radiusKm = v;
    } else if (a === "--limit") {
      const v = parseInt(argv[++i], 10);
      if (!Number.isFinite(v) || v <= 0) throw new Error("Invalid --limit");
      args.limit = v;
    } else if (a === "--dryRun") {
      args.dryRun = true;
    } else {
      console.warn("Unknown arg:", a);
    }
  }
  return args;
}

function bboxFromCenter(lat, lon, radiusKm) {
  const radiusDeg = (radiusKm * 1000) / 111000; // ~1 deg = 111km
  return {
    south: (lat - radiusDeg).toFixed(2),
    west: (lon - radiusDeg).toFixed(2),
    north: (lat + radiusDeg).toFixed(2),
    east: (lon + radiusDeg).toFixed(2),
  };
}

function buildOverpassQuery(bbox) {
  const box = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
  return `[out:json];(node["shop"="supermarket"]${box};way["shop"="supermarket"]${box};node["shop"="greengrocer"]${box};way["shop"="greengrocer"]${box};node["amenity"="food_bank"]${box};way["amenity"="food_bank"]${box};node["amenity"="soup_kitchen"]${box};way["amenity"="soup_kitchen"]${box};node["shop"="bakery"]${box};way["shop"="bakery"]${box};node["shop"="convenience"]${box};way["shop"="convenience"]${box};);out body;>;out skel qt;`;
}

async function fetchOverpass(query) {
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(
    query
  )}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "FoodPantryApp/Seeder/1.0",
      Accept: "application/json",
    },
  });
  if (!res.ok)
    throw new Error(`Overpass error ${res.status} ${res.statusText}`);
  const json = await res.json();
  return json?.elements ?? [];
}

function toRow(el) {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  const tags = el.tags ?? {};
  const display =
    tags.name ||
    tags["operator"] ||
    tags["brand"] ||
    `${tags.shop || tags.amenity || "Food resource"} (${el.type}/${el.id})`;
  const row = {
    id: `overpass_${el.type}_${el.id}`,
    name: display,
    category: tags.shop || tags.amenity || "food_resource",
    lat,
    lon,
    address_line: undefined,
    house_number: tags["addr:housenumber"],
    road: tags["addr:street"],
    city: tags["addr:city"] || tags["addr:town"] || tags["addr:village"],
    state: tags["addr:state"],
    postcode: tags["addr:postcode"],
    opening_hours_lines: null, // optional: derive later
    tags,
  };
  const street = [row.house_number, row.road].filter(Boolean).join(" ").trim();
  const stateZip = [row.state, row.postcode].filter(Boolean).join(" ").trim();
  const parts = [];
  if (street) parts.push(street);
  if (row.city) parts.push(row.city);
  if (stateZip) parts.push(stateZip);
  row.address_line = parts.join(", ");
  return row;
}

async function upsertRows(supabase, rows, batchSize = 500) {
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error, count } = await supabase.from("places").upsert(chunk, {
      onConflict: "id",
      ignoreDuplicates: false,
      count: "exact",
    });
    if (error) throw error;
    total += chunk.length;
    console.log(
      `Upserted ${Math.min(i + chunk.length, rows.length)}/${rows.length}`
    );
  }
  return total;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.bbox && !args.center) {
    console.log(
      "Provide --bbox south,west,north,east OR --center lat,lon --radiusKm N"
    );
    process.exit(1);
  }
  const bbox =
    args.bbox ||
    bboxFromCenter(args.center.lat, args.center.lon, args.radiusKm || 10);
  console.log("Using bbox:", bbox);
  const query = buildOverpassQuery(bbox);
  console.log("Overpass query:", query);

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY/KEY in env"
    );
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch from Overpass
  const elements = await fetchOverpass(query);
  console.log("Overpass elements:", elements.length);
  const rows = elements.map(toRow).filter(Boolean);
  console.log("Rows to upsert:", rows.length);

  if (args.dryRun) {
    console.log("Dry run; showing first 3 rows:\n", rows.slice(0, 3));
    return;
  }

  const count = await upsertRows(supabase, rows);
  console.log(`Done. Upserted ${count} rows into public.places`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
