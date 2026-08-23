CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
-- Ékezet- és kisbetűfüggetlen keresési forma (spec 11.2): a keresés minden
-- szöveges mezőn ezen a normalizált alapon fut.
CREATE OR REPLACE FUNCTION bss_norm(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT translate(lower(coalesce(t, '')), 'áéíóöőúüű', 'aeioouuu')
$$;
