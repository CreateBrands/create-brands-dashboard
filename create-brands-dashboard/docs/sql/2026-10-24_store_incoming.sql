-- INCOMING 2026-10-24 — one delivery per Distribution dispatch.
-- The app checks before creating one; this stops a duplicate if two devices
-- open Incoming Orders at the same moment. Run in the Supabase SQL editor one
-- statement at a time. Safe to re-run.
-- Only deliveries made from a sales order are covered: fresh shopping-run and
-- direct-supplier deliveries have no order and reuse their dispatch_id.

CREATE UNIQUE INDEX IF NOT EXISTS store_deliveries_one_per_dispatch
  ON store_deliveries (dispatch_id)
  WHERE dispatch_id IS NOT NULL AND dist_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ck_deliveries_one_per_dispatch
  ON ck_deliveries (dispatch_id)
  WHERE dispatch_id IS NOT NULL AND dist_order_id IS NOT NULL;

-- If either fails with "could not create unique index", two deliveries already
-- share a dispatch. List them (send me the result):
--   SELECT dispatch_id, array_agg(id), array_agg(status) FROM store_deliveries
--   WHERE dispatch_id IS NOT NULL AND dist_order_id IS NOT NULL
--   GROUP BY dispatch_id HAVING count(*) > 1;
