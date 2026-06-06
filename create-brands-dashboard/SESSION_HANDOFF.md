# CHOCOBERRY DASHBOARD — SESSION HANDOFF
**Updated: 2026-06-06 (post-marathon session + security cleanup). Supersedes the 944aec5 version.**
**Marker for deploy verification: store_day_aggregates**

---

## 1. PROJECT & PEOPLE
- **Owner**: Atif Razzaq (atifrazzaqfast@gmail.com) — owner-operator of Chocoberry (~20-store UK hospitality chain: owned / franchise / JV) + second smaller brand **Tove** (~£13.5k/wk).
- **App**: "Chocoberry Dashboard" / create-brands-dashboard — React (CRA) ops & staff-management dashboard.
- **Stack**: React + Tailwind (core utility classes only), Supabase (PRODUCTION project id `qtjsdbasoouslcpinqhu`, free tier), Vercel hosting.
- **Prod URL**: create-brands-dashboard.vercel.app · **GitHub**: github.com/CreateBrands/create-brands-dashboard
- **Local repo**: `C:\dev\create-brands-dashboard\create-brands-dashboard` (the DOUBLED folder name is real). Windows CMD user — no `\` line continuations, one command per line.

## 2. CODEBASE & CONVENTIONS
- Two giant files: `src/App.js` (~1.25 MB) and `src/supabase.js` (~186 KB). All components live in App.js (function declarations, hoisted).
- **App.js imports BARE hooks** (`import { useState, useMemo, useEffect, useCallback, useRef } from "react"`). **NEVER write `React.useMemo` etc.** — broke a prod build once. Check `grep React\.use` = 0 before deploy.
- Roles: owner / hq_staff / manager / staff / employee / trainee. Helpers `isOwnerRole`, `isHqOrAbove`. **RLS is OFF everywhere** — all access gating is app-side.
- ~76 ops_team members across stores; brand ids `chocoberry`, `tove`.
- `useExcelJS()` hook (~line 585) lazy-loads ExcelJS from CDN for styled Excel exports.
- recharts + lucide-react imported. Manager login screen (~line 2573) compares PLAIN-TEXT passwords (known debt; dormant Supabase Auth fns exist in supabase.js for future real passwords).
- Validation before every deploy (assistant runs in its sandbox): babel parse check, eslint hooks config, eslint no-undef config (React removed from globals deliberately).

## 3. DEPLOY DISCIPLINE (hard-won — follow exactly)
1. Assistant produces full files in outputs with **distinct filenames per iteration** + exact byte counts.
2. User downloads → **`dir "C:\Users\conta\Downloads\<name>*.js"` FIRST** — newest file is often `"(1)"`-suffixed; the plain name is usually STALE. When in doubt: `del` old ones, re-download.
3. `copy /Y` newest → `src\`.
4. **Verify gate**: `findstr` for a marker string unique to the new version + `for %F in (file) do @echo %~zF bytes` exact byte match. **Empty findstr = STOP, do not commit.** (Stale-file commits happened 3× in one night.)
5. Use **`&&`-gated chain** so verification physically blocks git: `findstr /c:"MARKER" src\App.js && git add ... && git commit -m "..." && git push`.
6. Supabase SQL editor: run statements ONE AT A TIME; never paste query OUTPUT back into the editor (caused repeated syntax errors).
7. Edge Function updates: **edit IN-PLACE in the dashboard editor of the existing function** — uploading a file once created an accidental NEW function that nothing calls (since deleted).

## 4. FLIPDISH SALES PIPELINE (the heart of the data platform)
- **Live source**: `flipdish_sales` table, fed by Edge Function **`flipdish-rms-sync`** (pulls per-sale data from RMS Reporting API, franchisor id 678cacc0-..., property→store matched by name candidates from `deriveShortNameCandidates`; store lookup is `.in("brand_id",["chocoberry","tove"])`).
- **DEAD**: `flipdish_orders`, `flipdish_sync_log` (old /orders webhook pipeline, stopped 19 May). flipdishOrders=[] in app → **no customer-level data exists** (no names/tips/fees) → customer-level AI impossible.
- **Function behaviour**: empty `{}` body = **ROLLING WINDOW yesterday+today** (gap days self-heal). Explicit `{"fromDate","toDate"}` = backfill; processes **MAX 2 days/invocation** (~40s), returns `resumeFrom` for longer ranges. Upsert conflict key **(sale_id, brand_id)** — NB: if a sale's brand classification changes, re-sync INSERTS A DUPLICATE under the new brand (bit us on 19 May Tove data).
- **Auth**: Verify-JWT is OFF (legacy-JWT gate caused the 1–14 June silent outage: cron's hardcoded legacy service-role JWT stopped validating → 401 UNAUTHORIZED_INVALID_JWT_FORMAT). Protection = **shared-secret guard**: env `SYNC_SHARED_SECRET` on the function; callers must send header `x-sync-secret`. ⚠️ Current secret value was EXPOSED in chats/docs — **rotation is open item 2**; must match in 3 places: function env, cron job 5 header, Vercel `REACT_APP_SYNC_SECRET` (+ redeploy, CRA bakes at build).
- **Tokens**: TWO portal session cookies read per-request from `sync_config` table (keys `flipdish_rms_token` ~24h TTL, `flipdish_fd_authorization` ~Sep 2026). Kept fresh by Chrome extension **"Chocoberry — Flipdish Token Refresh"** (4-h alarm; ONLY works while Chrome open AND Flipdish portal logged in; portal logout → "Failed to fetch" → token rot → sync 401s from Flipdish within ~24h). STRUCTURAL FRAGILITY — recurs; long-term fix = always-on host or official API creds (Phase 0.4).
- **Cron jobs** (pg_cron): job 1 punch-photo-cleanup 03:00 · **job 5 `flipdish-daily-sync`** `0 6,12,18 * * *` → net.http_post to the function with x-sync-secret (legacy JWT removed) · **`flipdish-health-check`** `30 6,12,18 * * *` → `check_flipdish_sync_health()` · **job 7 `store-day-aggregates-refresh`** `0 7 * * *` → `refresh_store_day_aggregates(3)`.
- **net.http_post is fire-and-forget**: real result in `net._http_response` by returned request id (`SELECT * FROM net._http_response WHERE id=<req_id>` after ~40-60s).
- **Diagnostic playbook**: freshness query `SELECT business_date, count(*), max(sale_time), count(*) FILTER (WHERE sale_time::time > '18:00') FROM flipdish_sales WHERE business_date >= current_date-7 GROUP BY 1 ORDER BY 1 DESC;` — healthy days end ~02:40 next morning with 1000-2000 evening sales; **partial-day fingerprint = sales>0 but ZERO after 18:00**; all-stores-down-in-lockstep on dashboard = partial sync, NOT trading collapse.
- **Manual trigger**: net.http_post with the secret header; manual backfill body `{"fromDate":"YYYY-MM-DD","toDate":"YYYY-MM-DD"}`.
- **Sync-health watchdog** (`check_flipdish_sync_health`, sync_health_check.sql, RUN): STALE >20h → "Flipdish sync may be down"; PARTIAL yesterday → "Yesterday's sales look incomplete" + backfill instruction. Inserts kind='sync' notifications to owner/hq bells. **DEDUPE: no new alert while an UNREAD same-title sync alert exists → user must DISMISS handled alerts or future ones are muffled.** Manual tests before 06:30 UTC false-positive on yesterday (evening arrives via 06:00 run) — field-proven day 1.

## 5. DATA PLATFORM — PHASE 0.2 (DONE)
- **`store_day_aggregates`** table: PK (brand_id, store_id, business_date); orders, revenue_gross/net, tax, discounts, atv, cancelled_count, refunded_count, **by_channel jsonb**, **by_hour jsonb (Europe/London hours — for hourly forecasting)**, first/last_sale. Unmatched sales aggregate under store_id **'unmatched'** (data-quality alarm, currently 0 rows everywhere).
- **`refresh_store_day_aggregates(days_back int)`**: **REBUILD semantics** (DELETE date range, then INSERT) — original upsert-only version left stale rows when a grouping key disappeared (caused double counting). Canonical file `store_day_aggregates.sql` carries the fixed version. Nightly cron job 7 runs `(3)`; manual backfill `(60)`.
- **Reconciled to the penny** vs raw sales. ~587 rows: 21 stores × ~28 trading days (clean data from ~19 May).
- **Tove saga (resolved)**: Tove revenue (£13.5k/wk) was invisible in 'unmatched'. Fixes: existing store record `store-tove` used; all tove sales `UPDATE ... SET store_id='store-tove'`; Edge Function store lookup extended to both brands (in-place edit, verified `tove_unmatched=0` after a real sync); **19 May day-one sales were mis-branded `chocoberry` with property "Tove"** → re-sync created correct `tove` copies as DUPLICATES (different conflict key) → deleted the mis-branded originals (`DELETE FROM flipdish_sales WHERE brand_id='chocoberry' AND property_name='Tove'`). NB: 19 May chocoberry chain total dropped ~£2k = correction.
- Daily revenue shape (sanity reference): weekdays ~£29-33k, weekends ~£55-65k chain-wide; Tove £1-3.3k/day.

## 6. WHAT'S DEPLOYED IN THE APP (all live @ commit 5d4b47c)
**Session 06-05/06:**
- **Notification system**: `notifications` table (recipient_type 'user'|'ops', recipient_id, kind, title, body, link_view, read_at; notifications.sql RUN). supabase.js: fetch/markRead/markAll/insert + **notifyManagers({brandId,storeId,kind,title,body,linkView,excludeUserId})** (owners/hq always, managers on brand+store match; fire-and-forget) + **notifyOpsMember(id,{...})**. **NotificationBell** (self-contained 60s poll; UNREAD-ONLY list; dismiss-on-click; Web-Audio chime only when count rises on background poll; onNavigate(linkView); "View all"); placed in Sidebar (panel opens upward, navigates via setActiveView), EmployeeShell header (navigates ITS internal setActiveView), TraineePortal (dismiss-only). **NotificationsView** page (nav "notifications"): latest 100 read+unread, All/Unread filter, click = read + navigate. KIND icons: application📋 task✅ training🎓 staff👤 sync⚠️("Data health"). **4 event hooks**: addApplication→managers(linkView "hiring"); addAssignment employee+personId→that member(linkView "ops-tasks"); TraineePortal module done→managers("training"); convertToStaff→managers("team"). ⚠️ linkViews MUST match real NAV_GROUPS keys (first guesses were wrong).
- **Clear-on-view badges** (Team + Hiring only): these are WORK counters (Team=pending_setup members; Hiring=applied/manager_reviewing apps). Sidebar: `badgeClearOnView:true` items hide after visit, REAPPEAR when count rises past seen; seen clamps down when count drops; per-user localStorage `cb_badge_seen_<userId>`.
- **Member delete fix**: deleteOpsTeam now try/catches with FK-aware error toast (was silently failing). FK playbook: Postgres names only the FIRST violating table; delete child rows by employee_id, retry, repeat. Archive is correct for real ex-staff.
- **Reports section** (nav "reports", roles owner/hq_staff/manager): 6 timesheet reports — store-summary, employee-detail, daily attendance (LATE = >5min after scheduledStart), scheduled-vs-actual variance (fetchSchedulesRange NEW; overnight wraps +24), overtime (Approved/Pending/Rejected), exceptions (missing punch-out / amendedBy / !approved). ONE {title,columns,rows,totals} structure drives BOTH on-screen table and styled ExcelJS export. Managers store-scoped. ⚠️ punches with NULL store_id invisible to store-filtered runs.
- **Sync-now button**: runFlipdishSync invokes `flipdish-rms-sync` with x-sync-secret from `REACT_APP_SYNC_SECRET` (Vercel env, baked at BUILD time). Old dead "flipdish-sync" reference removed.
**Earlier sessions**: Store Analytics dashboard + v2 (gross/net toggle, discount rate, channel ATV, prev-period overlay, day-parts, heatmap toggle) for managers; hiring→"Onboarding" relabel; new-hire trainee defaults; profile pending/complete (17 required fields); employee email+PIN login; stepped training (`---` splits module into cards); outage root-cause & fixes.
**Commit chain**: c4bca8b → 38bb9d7 → 4f1e0c2 → 20b06fb → **5d4b47c (code)** → 944aec5 (prior handoff) → this commit.
**Canonical files**: App_REPORTS.js **1,249,998 bytes** + supabase_REPORTS.js **186,038 bytes** = deployed code. SQL run: notifications.sql, sync_health_check.sql, store_day_aggregates.sql (fixed version).

## 7. SECURITY CLEANUP LOG (06-06)
- ✅ **`super-api` Edge Function DELETED** — appeared unexplained ~04:30 on 06-06; invocation count was 0 (never called); deleted same day.
- ✅ **`flipdish-rms-sync_index-ts` DELETED** — accidental duplicate from a file-upload deploy mishap; was never called.
- ⏳ Service-role key rotation and shared-secret swap still OPEN (items 1–2 below).

## 8. 🎯 AI & DATA-DRIVEN OPS ROADMAP (agreed; benchmark Nory.ai)
**Principles**: data foundations FIRST · statistical forecasting (NOT LLM) for all numbers · Claude API (server-side Edge Fn — APPROVED by Atif) only for narrative/interpretation · forecast accuracy tracked & displayed honestly.
**Decision sequence**: 1) site performance + anomaly alerts (least history, zero manager behaviour change, builds trust) → 2) staffing/labour (biggest lever, needs history+adoption) → 3) prep/ordering & waste.
**Phases**: 0.1 sync watchdog ✅ · 0.2 aggregates table ✅ · **0.3 labour % per store/day ← NEXT BUILD** (punch_records have store_id + hoursWorked + grossPay; aggregate hours+cost per store/day, join onto store_day_aggregates → labour % of revenue; same nightly-SQL pattern; store-level EOD NOT needed) · 0.4 token hardening · **Phase 1** forecast engine (weekday-weighted daily forecast + hourly curves from by_hour) + accuracy tracking — needs ~8-12 wks history; clean data started 19 May, so viable from ~mid-July, build earlier and let it warm up · **Phase 2** anomaly alerts → staffing recommendations · **Phase 3** Claude API: weekly narrative reports, ask-your-data chat, alert explanations (send AGGREGATES only, never raw rows).
**Constraints**: ~3 wks clean history; no customer-level data; EOD is brand-level (fine for labour%).

## 9. OPEN ITEMS — PRIORITY ORDER
1. **Rotate service-role key** (exposed in chat history + old cron command). Check extension `shared.js` FIRST — unknown which credential it uses to write sync_config; if the rotated key, the extension breaks silently.
2. **Swap shared secret** → fresh random value in ALL 3 places (function env SYNC_SHARED_SECRET, cron job 5 header via cron.alter_job, Vercel REACT_APP_SYNC_SECRET + redeploy). Exact-match; whitespace mismatch caused 401s once (delete+re-add secret cleanly, redeploy).
3. **BUILD: Phase 0.3 labour aggregates** (see §8).
4. Backlog: sales/performance reports in ReportsView framework; email layer (Resend) on notifications table; HR onboarding/compliance dashboard (parked spec: read-only grid, rows=onboarding people, columns=RTW/contract/training/policies/starter/converted/profile_status); real employee passwords; kiosk breaks stage 2; login background; dismiss reminder — watchdog alerts must be cleared after handling.

## 10. KNOWN GOTCHAS QUICK LIST
- Downloads "(1)" trap · empty-findstr = STOP · one CMD command per line (pasted blocks execute everything) · don't paste SQL output into SQL editor · React.use* forbidden · net.http_post async (read net._http_response) · sync upsert key (sale_id,brand_id) duplicates on brand reclassification · derived tables REBUILD don't patch · rolling window OVERWRITES manual store_id patches for yesterday/today (fix at ingest, not in data) · unread sync alerts muffle future ones · CRA env vars baked at build (add to Vercel BEFORE push or redeploy) · Edge Function edits go in-place (file upload creates new function) · manual watchdog tests before 06:30 UTC false-positive.
