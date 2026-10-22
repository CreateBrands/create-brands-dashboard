-- PAYMETHOD 2026-10-22 — how each employee is paid
-- Run in the Supabase SQL editor. Safe to re-run.
-- Values: 'bank' (bank transfer), 'cash', 'cheque'; NULL = not set yet.
ALTER TABLE ops_team ADD COLUMN IF NOT EXISTS payment_method text;
