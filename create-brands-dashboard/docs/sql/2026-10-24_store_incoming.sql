-- INCOMING 2026-10-24 — optional safety net: one store delivery per dispatch.
-- The app already checks before creating one; this stops a duplicate if two
-- devices open Incoming Orders at the same moment. Safe to re-run.
-- Direct-supplier and fresh deliveries use their own ids ("direct:…", "fresh:…")
-- and are left out, because a fresh shopping run can feed several stores.
CREATE UNIQUE INDEX IF NOT EXISTS store_deliveries_one_per_dispatch
  ON store_deliveries (dispatch_id)
  WHERE dispatch_id IS NOT NULL AND dispatch_id NOT LIKE 'direct:%' AND dispatch_id NOT LIKE 'fresh:%';
-- If this fails with "could not create unique index", two deliveries already
-- share a dispatch. Find them with:
--   SELECT dispatch_id, array_agg(id) FROM store_deliveries
--   WHERE dispatch_id IS NOT NULL AND dispatch_id NOT LIKE 'direct:%' AND dispatch_id NOT LIKE 'fresh:%'
--   GROUP BY dispatch_id HAVING count(*) > 1;
