-- Enable PostGIS once per database
create extension if not exists postgis;

-- Table to store places aggregated from OSM (and optionally other sources)
create table if not exists public.places (
  id text primary key,
  name text not null,
  category text,
  lat double precision not null,
  lon double precision not null,
  geom geography(Point, 4326) generated always as (
    ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
  ) stored,
  address_line text,
  house_number text,
  road text,
  city text,
  state text,
  postcode text,
  opening_hours_lines text[],
  tags jsonb,
  updated_at timestamptz not null default now()
);

-- Index for fast geo queries
create index if not exists places_gix on public.places using gist (geom);
create index if not exists places_name_idx on public.places using gin (to_tsvector('simple', coalesce(name,'')));
create index if not exists places_category_idx on public.places (category);

-- RPC to fetch nearby places by radius (meters)
create or replace function public.nearby_places(
  lat double precision,
  lon double precision,
  radius_m integer,
  limit_count integer default 300
)
returns table (
  id text,
  name text,
  category text,
  lat double precision,
  lon double precision,
  address_line text,
  house_number text,
  road text,
  city text,
  state text,
  postcode text,
  opening_hours_lines text[]
) language sql stable as $$
  select p.id,
         p.name,
         p.category,
         p.lat,
         p.lon,
         p.address_line,
         p.house_number,
         p.road,
         p.city,
         p.state,
         p.postcode,
         p.opening_hours_lines
  from public.places p
  where ST_DWithin(
    p.geom,
    ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography,
    greatest(100, radius_m)
  )
  order by ST_Distance(
    p.geom,
    ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
  ) asc
  limit least(1000, greatest(1, coalesce(limit_count, 300)));
$$;

-- Optional: allow anon to execute RPC (adjust for your security needs)
-- grant execute on function public.nearby_places(double precision,double precision,integer,integer) to anon;
