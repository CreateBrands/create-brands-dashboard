-- LEAVER 2026-10-22 — staff leaver process
-- Run in the Supabase SQL editor ONE STATEMENT AT A TIME, in order.
-- Safe to re-run (IF NOT EXISTS). Nothing existing is changed or removed.

-- 1. Where the person is in the leaving process: NULL (not leaving), 'notice', 'left'
ALTER TABLE ops_team ADD COLUMN IF NOT EXISTS leaver_status text;

-- 2. Last working day. Payroll includes them up to and including this date,
--    and their PIN / logins stop working the day after.
ALTER TABLE ops_team ADD COLUMN IF NOT EXISTS leaving_date date;

-- 3. Everything else about the leaving: type, reason, rehire flag, approval,
--    holiday owed, notes and the checklist ticks.
ALTER TABLE ops_team ADD COLUMN IF NOT EXISTS leaver jsonb;

-- 4. (Optional) Lets the leavers list and payroll filter quickly.
CREATE INDEX IF NOT EXISTS ops_team_leaving_date_idx ON ops_team (leaving_date);
