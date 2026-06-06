# Chocoberry Dashboard — Session Handoff

**Last updated**: 2026-06-06 (NOTIFICATION SYSTEM complete; Reports section 6 timesheet reports + Excel; clear-on-view badges; sync-health watchdog LIVE; AI/DATA ROADMAP agreed — Phase 0.1 done, 0.2 next)
**Project**: create-brands-dashboard
**Repo**: github.com/CreateBrands/create-brands-dashboard
**Supabase project**: qtjsdbasoouslcpinqhu (PRODUCTION)
**Production URL**: create-brands-dashboard.vercel.app
**Owner**: Atif Razzaq, atifrazzaqfast@gmail.com
**Local repo path**: `C:\dev\create-brands-dashboard\create-brands-dashboard` (DOUBLED folder is real)

---

## 🎯 STRATEGIC: AI & DATA-DRIVEN OPS ROADMAP (agreed 2026-06-06)
Atif's goal: world-class AI/data-driven ops + decision-making. Benchmark: Nory.ai. Agreed principles: data foundations FIRST; statistical forecasting (NOT LLM) for numbers; LLM (Claude API, server-side Edge Fn — approved) only for narrative/interpretation layer; forecast accuracy must be TRACKED & shown.
**Decision sequencing**: 1) Site performance mgmt + anomaly alerts (least history needed, zero manager behaviour change, builds trust) → 2) Staffing/labour optimization (biggest lever; needs history + labour↔sales join + manager adoption) → 3) Prep/ordering & waste (noisiest item-level data, needs depth).
**Phases**: 0.1 sync-health watchdog ✅DONE · 0.2 nightly aggregates table (store×day precomputed — substrate for everything) ←NEXT · 0.3 labour % per store/day (punch_records have store_id+hours+gross_pay; joinable with sales NOW, no store-level EOD needed) · 0.4 token hardening (tokens are portal SESSION COOKIES — no trivial server fix; path: monitoring✅ → always-on host for extension → investigate official API creds) · Phase 1 forecast engine + accuracy tracking (needs ~8-12wks history; clean data started ~mid-May) · Phase 2 anomaly alerts → staffing recommendations · Phase 3 Claude API: weekly narrative reports, ask-your-data chat, alert explanations.
**Data constraints (honest)**: ~3wks clean sales history (mid-May+, 1-3 June repaired); flipdish_orders (customer/tips) DEAD = no customer-level AI; EOD is brand-level (labour% doesn't need it though).

## 🆕 SESSION 2026-06-05/06 — what shipped (ALL DEPLOYED, latest commit 5d4b47c)

### 1. IN-APP NOTIFICATION SYSTEM (complete arc)
- **Table**: `notifications` (uuid id, recipient_type 'user'|'ops', recipient_id, kind, title, body, link_view, created_at, read_at; idx on recipient). notifications.sql RUN ✅. No RLS (matches schema).
- **supabase.js**: dbNotificationToApp, fetchNotifications({recipientType,recipientId,limit}), markNotificationRead, markAllNotificationsRead, insertNotifications(bulk), **notifyManagers({brandId,storeId,kind,title,body,linkView,excludeUserId})** (queries users: owner/hq always, managers if brand+store match; FIRE-AND-FORGET, never throws), **notifyOpsMember(opsMemberId,{...})**.
- **NotificationBell** component (self-contained: own fetch + 60s poll): unread badge, dropdown panel, **dismiss-on-click** (item removed from list, marked read in DB — list is UNREAD-ONLY; read kept in DB for history/email layer), "Clear all" (restores on failure), **sound** (Web Audio two-tone chime ONLY when count increases on background poll, never on first load; browsers block audio until first page interaction — unavoidable), **click-to-NAVIGATE** via onNavigate(linkView), "View all →" footer via onViewAll. Placed 3×: Sidebar (panelClass bottom-full left-0, onNavigate=setActiveView, onViewAll→"notifications"), EmployeeShell header (onNavigate=its INTERNAL setActiveView), TraineePortal header (dismiss-only, single page).
- **NotificationsView** page: nav key "notifications" (Bell icon, after comms), latest 100 read+unread, All/Unread filter, mark-all, click = mark read + navigate. KIND_ICON/LABEL: application📋/task✅/training🎓/staff👤/**sync⚠️ "Data health"**.
- **4 event hooks**: addApplication→notifyManagers(linkView **"hiring"**, excludes actor); addAssignment when assignTo==="employee"&&personId→notifyOpsMember(linkView **"ops-tasks"** = EmployeeShell internal key); TraineePortal handleToggle done→notifyManagers(linkView **"training"**); handleConvertToStaff→notifyManagers(linkView **"team"**). ⚠️ linkViews were initially WRONG guesses ("training-admin","ops-team","tasks") — fixed to real nav keys; always verify keys against NAV_GROUPS.
- Recipient routing tested 8/8 (store-scoped managers, owners/hq always, actor excluded, staff never).

### 2. Clear-on-view badges (Team + Hiring)
- Those nav badges are WORK COUNTERS (Team = pending_setup members; Hiring = applications in applied/manager_reviewing) — NOT unread counts. User found red circles misleading; chose clear-on-view (option B, advised of trade-off: no standing nag).
- Implemented in **Sidebar**: items flagged `badgeClearOnView: true` (team+hiring only); seen-counts per user in localStorage (`cb_badge_seen_<userId>`); badge hidden once visited, REAPPEARS when count increases past seen; **clamps seen down when count drops** (so next new item re-triggers — the subtle case). displayBadge() at render. 7/7 tests. Other badges (comms/issues/tasks/ops-settings) unchanged always-on.

### 3. Member delete fix + cleanup
- deleteOpsTeam had NO try/catch → FK-blocked deletes failed SILENTLY (user: "can't delete test name"). Fixed: error toast, FK-specific message ("has linked records — archive instead or remove linked records").
- Hard deletes blocked by FK refs; Postgres names only the FIRST violating table. "test name" (ot-1780400184419) was blocked by **employee_loans** rows (test advance/repayment) — cleaned via SQL then deleted. Playbook: SELECT child rows by employee_id → DELETE children → DELETE member → repeat if new FK named. Archive is the right path for real ex-staff.

### 4. REPORTS SECTION — 6 timesheet reports (nav "reports", FileText icon, roles owner/hq_staff/manager)
- **ReportsView** (before ManagerStoreDashboard): report-type cards → filters (store/employee/period; single date for daily) → Run → on-screen table → **styled Excel** (ExcelJS via existing useExcelJS hook line ~585: title row, period row, indigo header, totals row, col widths). ONE unified {title,columns,rows,totals} structure drives BOTH render & export.
- Reports: **store-summary** (per-employee hours/OT/gross/days + grand totals), **employee-detail** (day rows for one employee), **daily** (attendance + LATE flag = punch-in >5min after scheduledStart), **variance** (schedules table hours vs punched hours; overnight shifts wrap +24), **overtime** (OT rows + Approved/Pending/Rejected from overtimeApproved/overtimeRejectedReason), **exceptions** (missing punch-out / amendedBy / !approved).
- Manager scoping: store picker limited to their storeIds, data filtered, employee dropdown store-scoped. ⚠️ punches with NULL store_id invisible to managers/store-filtered runs (owner "All stores" sees them).
- Data: fetchPunchRecords({from,to}) existed; **NEW fetchSchedulesRange({from,to})** in supabase.js. 12/12 computation tests.

### 5. PHASE 0.1 — SYNC-HEALTH WATCHDOG (LIVE & FIELD-PROVEN)
- **sync_health_check.sql** RUN ✅: function `check_flipdish_sync_health()` + cron job **flipdish-health-check** ('30 6,12,18 * * *' — 30min AFTER each sync). Checks: (1) STALE >20h since max(sale_time) → "Flipdish sync may be down" alert; (2) PARTIAL yesterday (sales>0 but ZERO after 18:00 — the outage fingerprint) → "Yesterday's sales look incomplete" + backfill instruction. Inserts 'sync'-kind notifications to owner/hq bells. **DEDUPE: no new alert while an UNREAD same-title sync alert exists → USER MUST DISMISS alerts after handling or future ones are muffled.**
- Field-proven day 1: manual test at 03:00 UTC fired "incomplete" for 5 June (613 sales, 0 after 6pm) — TIMING ARTIFACT (last sync 18:00; evening arrives via 06:00 rolling window). Verified after 06:00: 5 June = 2,586 sales, after_6pm 1,732, latest 02:58 ✅ self-healed. Scheduled :30 runs avoid this false positive by design. Lesson: manual tests before 06:30 will false-positive on yesterday.

### CANONICAL FILES (deployed @ 5d4b47c)
- **App_REPORTS.js (1,249,998 bytes — the (1) download!)** + **supabase_REPORTS.js (186,038)**. Cumulative: everything above + all prior sessions.
- SQL run this session: notifications.sql ✅, sync_health_check.sql ✅. Lineage: App_NOTIFICATIONS(+supabase) → App_NOTIF_v2 (sound+dismiss) → App_NOTIF_v3 (page+navigate+delete-fix, 1,228,384) → App_BADGES_clearonview (1,230,336) → **App_REPORTS (1,249,998) = CURRENT**.

### OPEN / NEXT (priority)
1. **PHASE 0.2 — nightly aggregates table** (store×day: revenue/orders/atv/channel mix, maybe hourly) ← NEXT SESSION. Then 0.3 labour% join.
2. Rotate service-role key (still exposed; check extension shared.js dependency first) + swap shared secret `chocoberryflipdishsync2026` (function secret + cron header + Vercel REACT_APP_SYNC_SECRET, all must match).
3. Token hardening (0.4): extension needs Chrome open + portal login; recurs ~24h after logout.
4. Future reports: sales/performance reports in same ReportsView framework (cards built to grow).
5. Email notification layer (Resend) on the notifications table; HR onboarding/compliance dashboard (parked); real employee passwords (Supabase Auth, dormant fns); login background (parked).
6. Badge question half-open: only team+hiring are clear-on-view; user may want others converted later.

---


## 🆕 SESSION 2026-06-04 — Store Analytics + SYNC OUTAGE incident

### 1. Comprehensive per-store Flipdish dashboard (DEPLOYED)
- NEW `StoreAnalytics` component (before ChainPerformanceView): KPIs w/ vs-prev deltas, revenue trend (ComposedChart), channel mix (Pie), 7×24 day-hour heatmap, top-15 items (defensive sale_items parsing: caption/name/title, quantity/qty/count, revenue/amount/price), payment methods, refunds/cancellations. Computed client-side from NEW `fetchStoreSalesDetailed({storeId,from,to})` in supabase.js (richer per-store fetch: payment_method, refund flags, discount, subtotal, tax, sale_items; KEEPS cancelled rows flagged; truly store-scoped, NOT brand-wide RPCs).
- NEW `ManagerStoreDashboard` wrapper: resolves manager's stores from currentUser.storeIds, store picker if >1, period selector (today/yesterday/last7/last30/custom), computes prev-period dates, renders StoreAnalytics. Empty state if no store assigned.
- Nav: `{ key: "store-analytics", label: "Store Analytics", icon: BarChart2, roles: ["manager"] }`; render gated `currentUser.role === "manager"`. Owners/HQ keep Chain Performance unchanged.

### 2. Dashboard v2 — interpretation upgrades (DEPLOYED)
After auditing what Flipdish data actually exists: live source = `flipdish_sales` only. **`flipdish_orders` (customer name/phone, tips, fees, vouchers, order_type) is DEPRECATED/not synced — `flipdishOrders=[]`. No customer-level analytics possible.**
- **Gross/Net(ex-VAT) toggle** (`basis` state): net uses amount_subtotal w/ graceful fallback; Net button disabled if subtotal null in feed (`netAvailable`). VAT shown alongside.
- **Discount RATE** (discount/(gross+discount)) replaces bare £ total.
- **Channel table w/ ATV** (revenue/orders/ATV/% per channel) replaces donut legend.
- **Prev-period overlay** on trend: bars=current, dashed line=previous, aligned by day index.
- **Day-part summary** (Morning 6-12/Afternoon 12-17/Evening 17-21/Late 21-6 w/ hour-wrap): revenue/orders/share per bucket.
- **Heatmap orders↔revenue toggle** (`heatMetric`).
- All aggregations basis-aware. 13 tests passed. Files: App_STORE_analytics_v2.js + supabase_STORE_analytics_v2.js (superseded by App_SYNCNOW_fixed below).

### 3. ⚠️🔥 FLIPDISH SYNC OUTAGE — full incident + fixes (RESOLVED 2026-06-04)
**Symptom**: dashboard "-88% vs prior", all stores down in lockstep. Root-cause chain discovered:
- `flipdish_sales` data FROZE ~2026-06-01 (days 01-03 June cut off mid-afternoon, 0 sales after 18:00 vs healthy days ending ~02:40 next morning w/ 1000-2000 evening sales).
- **ROOT CAUSE**: cron job 5 (`flipdish-daily-sync`, `0 6,12,18 * * *`) calls Edge Function `flipdish-rms-sync` via net.http_post. The function had **"Verify JWT (legacy secret)" ON**, and the hardcoded legacy service-role JWT in the cron stopped validating (Supabase key-system migration) → every call bounced **401 UNAUTHORIZED_INVALID_JWT_FORMAT** → function never ran. Cron showed "succeeded" (net.http_post = fire-and-forget; check `net._http_response` table by request id for real status/body!).
- **Distinct second failure**: Chrome token-refresh extension ("Chocoberry — Flipdish Token Refresh", refreshes rms-token+FD-Authorization every 4h into `sync_config` table keys `flipdish_rms_token`/`flipdish_fd_authorization`) was failing "Failed to fetch" because the **Flipdish portal session was logged out**. Fixed by logging into portal + clicking manual refresh. Extension only works while Chrome open + portal logged in (STRUCTURAL FRAGILITY — recurs!).
- **Red herrings**: old `flipdish_sync_log` table = DEAD /orders pipeline (stopped 19 May, ignore it). "Latest sale Xh ago" can't distinguish closed-stores vs sync-down.
**FIXES APPLIED**:
1. **Verify JWT turned OFF** on flipdish-rms-sync → 200 OK.
2. **Manual backfills** repaired 1-3 June (POST body `{"fromDate":"2026-06-01","toDate":"2026-06-03"}`; function processes MAX 2 days/invocation, returns `resumeFrom` for longer ranges).
3. **Rolling window deployed** (new function version): empty `{}` body now syncs **YESTERDAY+TODAY** (was today-only) → gap days self-heal. Explicit ranges unchanged. File: /mnt/user-data/outputs/flipdish-rms-sync_index.ts.
4. **Shared-secret guard added**: env `SYNC_SHARED_SECRET` on the function; requests need `x-sync-secret` header (or body.secret) else 401. Guard SKIPPED if env unset (staged rollout). Current secret: `chocoberryflipdishsync2026` (EXPOSED in notes/chat — should be swapped for fresh random value in ALL THREE places: function secret, cron header, Vercel env).
5. **Cron job 5 updated** via cron.alter_job: sends x-sync-secret, legacy JWT REMOVED. Gotcha hit: env secret had whitespace/mismatch initially (both tests 401) → delete+re-add secret cleanly, redeploy function, retest. Verified: no-secret=401, with-secret=200, daysProcessed=2.
**Diagnostic playbook (recurring!)**: check freshness `SELECT business_date, count(*), max(sale_time), count(*) FILTER (WHERE sale_time::time > '18:00') FROM flipdish_sales WHERE business_date >= current_date-7 GROUP BY 1 ORDER BY 1 DESC;` — partial day = few hundred sales, 0 after 18:00. Trigger sync via net.http_post w/ secret header; read result `SELECT * FROM net._http_response WHERE id=<req_id>` (~40s for 2 days). All-channels-drop-proportionally = partial sync, NOT trading collapse.

### 4. Sync-now button rewired (DEPLOYED — App_SYNCNOW_fixed.js 1,211,934 + supabase_SYNCNOW_fixed.js 182,079)
- `runFlipdishSync` was invoking **dead** "flipdish-sync" → now invokes **flipdish-rms-sync** with `x-sync-secret` header from `REACT_APP_SYNC_SECRET` (Vercel env var, Settings→Environment Variables; baked at BUILD time — add var BEFORE push or redeploy after; value must exactly match function secret). Toast now reports `totalUpserted`. CONFIRMED WORKING by user.
- CRA env vars are public in bundle — guard protects vs scanners, not bundle-readers (accepted trade-off; worst case = triggered syncs).

### CANONICAL LATEST FILES
- **App_SYNCNOW_fixed.js (1,211,934 bytes)** + **supabase_SYNCNOW_fixed.js (182,079 bytes)** — cumulative: ALL of 06-03 work + StoreAnalytics + v2 upgrades + sync-now fix.
- Edge Function: **flipdish-rms-sync_index.ts** (rolling window + secret guard) — DEPLOYED to Supabase.
- Lineage 06-04: App_STORE_analytics(+supabase) → App_STORE_analytics_v2(+supabase) → **App_SYNCNOW_fixed(+supabase) = CURRENT**.

### OPEN / NEXT (priority order)
1. **Rotate service-role key** (exposed in cron history + chats). FIRST check extension `shared.js` — if it writes sync_config with that key, extension needs the new key too or token refresh silently breaks.
2. **Swap shared secret** for fresh random value in all 3 places (function secret, cron job 5 header, Vercel REACT_APP_SYNC_SECRET + redeploy).
3. **Structural token fragility**: refresh needs Chrome open + portal logged in on Atif's machine; portal logout = sync death within ~24h (rms-token TTL). Rolling window softens (self-heals once token refreshed). Long-term: server-side token acquisition or always-on host.
4. **Sync-health indicator** on dashboard: "last successful sync X ago" + partial-day warning, so closed-stores vs sync-down vs incomplete-day are distinguishable.
5. **HR Onboarding & Compliance dashboard** (parked from 06-03): read-only grid, rows=people in onboarding, columns=Documents/RTW, Contract, Training, Policies, Tax/Starter, Converted, profile_status.
6. **Real employee passwords** (Supabase Auth; dormant fns exist), login background (CSS options parked), kiosk breaks stage 2, email notifications (Resend), storage hardening.
7. NOTE: payroll corrections pasted 06-04 (P45/RTI/maternity) were a MISTAKE — ignore, not a task.

---


## 🆕 SESSION 2026-06-03 — what shipped

### ⚠️ Validation discipline (reinforced this session — TWO build failures)
Local babel + react-hooks eslint do NOT catch `no-undef`. Production CRA build does.
- Failure 1: `XLSX` not imported (earlier session) → added `eslintcheck/.eslintrc.noundef.json`.
- Failure 2 THIS SESSION: wrote `React.useMemo/useState/useEffect` in a new component, but App.js imports hooks as BARE names (`import { useState, useMemo, useEffect } from "react"`) and has NO `React` namespace in scope. The no-undef config had `React` whitelisted as a global → hid it. **FIXED the config: removed `React` from globals** so it now mirrors prod. ALWAYS use bare hooks (`useMemo`, not `React.useMemo`) in App.js.
- RUN ALL THREE before every deploy: `node check.js App.js` (babel) + eslint `.eslintrc.json` (hooks) + eslint `.eslintrc.noundef.json` (no-undef, React NOT whitelisted).
- Downloads `(1)` trap bit HARD this session: user repeatedly copied the OLD file or pasted literal `<placeholder>` text. Lesson: give a FRESH distinct filename when a fix re-uses a name (used `App_TRAINING_FIXED_v2.js`). ALWAYS verify by (a) `findstr` for the BROKEN marker returning EMPTY, and (b) exact byte count, BEFORE git commit. Also remind user: add → commit → push are THREE separate commands (user skipped commit once, ran add+push).

### 1. Employee login → email + PIN, single page (DEPLOYED)
- Problem: login showed all 30 employee NAMES (privacy + scale). 
- `EmployeeLoginScreen` rewritten: single page, Email field + PIN field (masked password input w/ Eye/EyeOff show-hide toggle, digits only, max 6). One "Sign In". Combined check: find active ops_team by email (case-insensitive, trimmed) AND pin match. Vague error "Incorrect email or PIN" (no enumeration). Archived blocked. Same onLogin object as before (role employee, opsTeamMemberId, etc.) so nothing downstream changed.
- PREREQUISITE: employees need EMAIL on their ops_team record (+ PIN). Many are blank — must be filled before they can log in.
- Also added DORMANT Supabase Auth data-layer in supabase.js for FUTURE real passwords: `employeeSignIn`, `employeeResetPassword`, `employeeSetPassword`, `employeeAuthSignOut`. NOT wired to any UI yet. SECURITY NOTE found: existing MANAGER login (LoginScreen, ~line 2573) stores passwords PLAIN TEXT (`u.password === password`) — when we do real employee passwords, use Supabase Auth (Option A chosen) NOT plain text, and ideally migrate manager login too. Candidate magic-link auth already uses supabase.auth (OTP) — separate flow, shares the single browser session.

### 2. Hiring pipeline: "In Training" → "Onboarding" (DEPLOYED)
- APPLICATION_STATUSES: relabelled `in_training` display label from "In Training" to "Onboarding". KEY UNCHANGED (`in_training`) — no DB migration, no constraint change, existing applicants intact. Badges + Move-to buttons read from the label so they update automatically.
- Flow is now: Applied → Reviewing → Onboarding → (convert to full staff) → Hired. The Training PORTAL feature is separate and untouched.

### 3. New employees default to Onboarding/trainee (DEPLOYED)
- Employee form init (~line 12534): `isTrainee: isHireFlow ? true : (item ? (item.isTrainee ?? false) : true)`. Pipeline hires AND manual adds → trainee. EDITS preserve existing flag (never re-trainee a converted full-staff member). isHireFlow = !!prefillApplication checked FIRST.
- BULK: ran `bulk_set_onboarding.sql` → set ALL existing active employees `is_trainee=true` (user confirmed). They land in trainee portal until manager "Convert to full staff". Reverse statements in the SQL file if needed.

### 4. Profile pending/complete status — ENFORCED (DEPLOYED: profile_status.sql)
- NEW field `ops_team.profile_status` ('pending'|'complete', NOT NULL DEFAULT 'pending', CHECK). All existing → pending. SEPARATE from trainee/onboarding flag.
- Mapper: profileStatus ↔ profile_status.
- Validator `missingProfileFields(member)` + `PROFILE_REQUIRED_FIELDS` (17 fields): firstName, lastName, dob, niNumber, email, phone, address, role(or roleIds/roleId), store(storeIds), hireDate, payBasis, hourlyRate (£0 VALID — only null/undefined/"" fails), taxStarterStatement, legalStatus, emergencyContactName, emergencyContactPhone, pin.
- EmployeeProfileView: status card (manager/owner only) shows pending/complete + lists missing fields as pills. "Mark complete" BLOCKED until all 17 filled (alert lists missing). "Set back to pending" to revert. Header badge ✓ complete / ● pending.
- Pairs with the future HR onboarding/compliance dashboard (parked — see below).

### 5. Interactive training: stepped guided cards (DEPLOYED: needs App + sample SQL)
- Checked existing system first: per-store `training_modules` (title/description/category/Markdown content/required/type onboarding|training), authored in TrainingAdminView/TrainingModuleEditor, shown in TraineePortal + StaffTrainingView, progress in `training_progress`. Content was one read-only Markdown scroll.
- NEW reusable `SteppedModuleContent` component: splits a module's existing `content` on a `---`-on-its-own-line delimiter into guided cards with PROGRESS BAR + step dots + Back/Next. 1 section → renders as before (backward compatible). NO DB change — reuses content field, SafeMarkdown, progress. Wired into BOTH TraineePortal and StaffTrainingView. Editor got a hint: "put --- on its own line to split into steps."
- Sample module: `sample_training_module.sql` inserts "Welcome & Floor Basics (sample)" (6 steps) at store-london-road. Cleanup: DELETE FROM training_modules WHERE title='Welcome & Floor Basics (sample)'.

### SQL run this session (all PROD)
- profile_status.sql (profile_status column) ✅
- bulk_set_onboarding.sql (all active → is_trainee true) ✅
- sample_training_module.sql (demo stepped module) — run when deploying training

### CANONICAL LATEST FILE
- **App_TRAINING_FIXED_v2.js (1,185,655 bytes)** — has EVERYTHING this session (the React.* build-fix version; verify zero `React.use` + exact bytes before commit).
- **supabase_PROFILE_status.js (~179,670 bytes)** — latest supabase (profileStatus mapper + dormant employee auth fns). 
- Deploy lineage this session: App_HIRING_onboarding → App_NEWHIRE_onboarding → App_PROFILE_status (+supabase_PROFILE_status, +profile_status.sql) → App_EMAIL_PIN_login (+supabase_EMAIL_PIN_login) → App_LOGIN_singlepage → App_TRAINING_stepped → **App_TRAINING_FIXED_v2** (current).
- NOTE: confirm all of profile_status + email-pin supabase + their SQL are deployed since App is cumulative and contains all that code.

### OPEN / NEXT
- **HR Onboarding & Compliance dashboard (PARKED — user said "later")**: read-only grid, rows = people in onboarding, columns = Documents/RTW, Contract, Training, Policies, Tax/Starter, Converted, + profile_status. Filters by store/search. "% complete / ready to convert". Layer 2 = clickable cells → profile tab. Build Layer 1 first.
- **Real employee passwords (Supabase Auth)**: dormant fns exist. Decide provisioning: invite-by-email (needs small Edge Function) vs self-signup vs admin temp-password. Then wire employeeSignIn into login, add /reset page, session bridging (app uses cb_session localStorage, separate from supabase.auth).
- **Login background**: user looked at CSS textured-pattern options (dot grid, mesh glow, chocolate weave etc.) then said "ignore for now". Pure-CSS options ready if revisited.
- Carried from before: Flipdish pg_cron 401; rotate service-role key + shared secret; filter web-employee TodaysTasks to only the person's own tasks (currently shows all store tasks); kiosk breaks-deduct stage 2; email notifications (Resend); storage hardening (public applicant-photos bucket).

---


## 🆕 SESSION 2026-06-01 — what shipped (all DEPLOYED & live)

### Validation gotcha learned this session
- babel parse + react-hooks eslint DO NOT catch `no-undef` ("X is not defined") — the production CRA build does, and a build failed on it (XLSX not imported).
- NEW validator added: `eslintcheck/.eslthrc.noundef.json` — run `./node_modules/.bin/eslint <file> -c .eslintrc.noundef.json --no-eslintrc`, grep "no-undef", ignore the exhaustive-deps lines. RUN ALL THREE (babel + hooks + no-undef) before every deploy.
- Downloads numbering trap bit again: newest file gets the `(1)` suffix; the plain name is OLDER. ALWAYS `dir` first, verify byte-size before commit (findstr can pass on both old+new).

### 1. Flipdish token auto-refresh — DONE
- Chrome extension (C:\dev\flipdish-token-extension) reads rms-token + FD-Authorization cookies from logged-in portal.flipdish.com, writes via RPC `set_flipdish_tokens`. Background service-worker chrome.alarms auto-refresh every 4h. Editing shared.js needs FULL remove+re-add of extension.
- STILL OPEN: pg_cron job 'flipdish-daily-sync' returns 401 UNAUTHORIZED_INVALID_JWT_FORMAT. Check Verify-JWT toggle OFF on the function + legacy vs new key system.
- SECURITY TODO: rotate service-role key (was pasted in chat); replace 'chocoberryflipdishsync2026' shared secret.

### 2. PAYROLL SYSTEM — full feature, DONE (owner-only)
Goal: produce payroll Excel for the accountant from dashboard data. ALL wages fully declared; cash-vs-bank is purely PAYMENT METHOD, not off-books.

**DB (all run, no RLS to match app):**
- `minimum_wage_rates` (band 21_over/18_20/under_18, rate, effective_from) — payroll_stage1.sql
- `payroll_periods` (employee_id, period_start/end, total_hours, total_pay, bank_amount, cash_amount, payroll_location, accounting_location, rate_snapshot jsonb) — stage1 + payroll_amounts.sql added bank_amount/cash_amount
- `employee_loans` (advance/repayment) — internal only, NEVER exported
- ops_team added: pay_basis, default_bank_amount, payroll_location, accounting_location

**Code (supabase.js):** resolveHourlyRate (accepts BOTH camelCase app shape {payBasis,hourlyRate,dob} AND snake_case — dual-shape fix was critical), fetchMinimumWageRates/upsert/remove, ageOnDate/bandForAge/rateForBandOnDate, fetchPayrollPeriods/upsertPayrollPeriod, fetchEmployeeLoans/addLoanEntry/loanBalance. Rules: age on WORK date (birthday mid-period → higher rate from that day); fixed→hourly_rate (£0 valid, not flagged); minimum_wage→age band→rate; missing rate/DOB → flagged, never guess.

**UI (App.js):**
- Job & Pay tab: pay-basis selector
- Profile "Payroll" tab (PayrollAttributesTab, owner-only): Default bank transfer (£), payroll location, accounting location, loan ledger (running balance), read-only Starter & tax summary
- Admin → Minimum Wage tab (MinimumWageAdmin)
- Admin → Payroll tab (PayrollRunScreen): pick date range → sums APPROVED punch_records hours → resolves rate per punch → shows working → applies default bank-£ split (cash=remainder, editable per row) → Save to payroll_periods (overlap warn) → Export Excel.

**Split is BY AMOUNT (£):** "Bank transfer" / "Cash paid" labels, £ amounts only. default_bank_amount pre-fills, editable per run, capped at gross.

**EXPORT — ExcelJS (not SheetJS — community SheetJS can't style cells).** New useExcelJS() hook (CDN exceljs 4.4.0). Accountant's EXACT 17 columns IN ORDER: Accounting Location, Start Date (=hire_date), End Date (blank), First Name, Last Name, Gender, DOB, NI Number, Email, Address, Starter Statement A, Starter Statement B, Starter Statement C (each "Yes" in matching col by tax_starter_statement), Salary Term (Hourly=minimum_wage / Fixed), Gross Pay, Bank Transfer, Cash Paid. Formatting: bold white-on-indigo frozen header, borders, zebra stripes, £#,##0.00, bold TOTAL row with SUM formulas. Verified by generate+read-back in Node.

**UK NMW rates (user verifies on gov.uk):** from 1 Apr 2026 — 21+ £12.71, 18–20 £10.85, under-18 £8.00. Apr 2025–Mar 2026 — £12.21/£10.00/£7.55.

**punch_records facts:** brand_id NOT NULL (use 'chocoberry'), status CHECK in ('open','closed','amended') — use 'closed' for completed shifts. Only approved+hours_worked counted. Test data: payroll_test_data.sql (notes='PAYROLL_TEST'; cleanup: DELETE WHERE notes='PAYROLL_TEST'). Armaan Singh ot-1779835195017 @ £13 = clean money test (38h → £494).

### 3. Assignment target picker + save fix — DONE
- assignment_target.sql added assignments.department + assign_to columns.
- AssignmentFormModal: "Role" free-text REPLACED with two-dropdown picker — "Assign to" (Department/Role/Employee) + second dropdown of matching list, filtered to selected store (assignTargets useMemo). Threaded opsTeam/storeRoles/storeDepartments through AssignmentsView → modal. Mappers carry department+assignTo (back-compat infers from populated field).
- SAVE BUG FIXED: handleSave had `if (!form.taskId || !form.role) return;` — silently failed when role empty. Now validates per assignTo with visible alerts, clears non-selected target fields.

### 4. Employee task-visibility — TWO bugs fixed
- KioskApp (in-store tablet): todaysTasks `mine`-match had no department case — added (matches employee.department field + roles' departmentId→storeDepartments name). Threaded storeDepartments through KioskShell loader.
- THE REAL ONE (website employee login, name+PIN → EmployeeShell → TodaysTasks): EmployeeShell rendered `<TodaysTasks>` WITHOUT passing `stores` or `visibleStoreIds` → inside, store-scope filter was empty → EVERY store-assigned task hidden. FIXED: EmployeeShell now computes myVisibleStoreIds (stores in user's brands + ops_team storeIds) and passes stores + visibleStoreIds. NOTE: TodaysTasks shows ALL in-scope store tasks (no per-employee role/dept/person filter) — if user wants the web employee view filtered to only THEIR tasks like the kiosk, that's a future enhancement.

### 5. Assignment filters — DONE
AssignmentsView: added filter row — Search (by task name, case-insensitive) + Store dropdown (brand-prefixed, primary nav for 24+ stores) + existing Type dropdown + Target dropdown (Dept/Role/Employee) + Clear link + live count. All combine; brand-scoping preserved.

### CANONICAL LATEST FILES (cumulative, in /mnt/user-data/outputs/)
- **App_ASSIGN_filters.js (1,178,847 bytes)** — has EVERYTHING above
- **supabase_ASSIGN_filters.js** — latest supabase (== supabase_KIOSK_match.js, == supabase_ASSIGN_picker.js cumulatively)
- Deploy lineage this session: App_PAYROLL_S3a → S3b → exceljs → starter → ASSIGN_picker → KIOSK_match → EMPTASKS_fix → ASSIGN_filters

### OPEN / NEXT
- Flipdish pg_cron 401 (see above)
- Security: rotate service-role key + shared secret
- Possible: filter web employee TodaysTasks to only the logged-in person's tasks (currently shows all store tasks)
- Long-standing: kiosk breaks-deduct stage 2; email notifications (Resend); storage hardening (public applicant-photos bucket has sensitive docs); enable TRAINING_GUIDE_PDF_URL

---


## ⚠️ ENVIRONMENT — read before any work
- Repo at `C:\dev\create-brands-dashboard\create-brands-dashboard` (nested one level — `git rev-parse --show-toplevel` → `C:/dev/create-brands-dashboard`).
- Vercel **Root Directory = `create-brands-dashboard`** (Settings → Build & Deployment); "Include files outside root" ON. Keep set while doubled structure exists.
- Old `C:\Users\conta` repo is GONE (stray .git removed). Never run git from home folder.
- **No staging. Every SQL change hits production directly.** Watch for real errors per statement; verify objects exist after DDL.
- App.js is now **~1.0 MB / ~18,200 lines**; supabase.js **~140 KB / ~2,920 lines**.

---

## 🪤 GOTCHAS (all learned the hard way; several bit us TODAY)

### Downloads-folder trap
~30 `App*.js` files in Downloads. Newest = highest number / latest timestamp, NOT the unnumbered one. Build files get DISTINCT names. Sort by date.

### Copy can silently fail
`copy` says "file not found" if the download isn't finished or the name differs (a `(1)` suffix). Happened repeatedly today. If a copy fails: `dir "C:\Users\conta\Downloads\<name>*.js"` to find the real file/size, re-download if missing, THEN copy. Always re-run size+findstr checks after.

### Two-checkpoint rule before every commit
```
for %F in (src\App.js) do @echo %~zF bytes      :: must match expected
findstr /c:"<marker>" src\App.js                 :: must return the line
```
Huge negative git diff = wrong file copied.

### ⚠️ pg_notify success ≠ DDL succeeded (BIT US TWICE TODAY)
A multi-statement SQL script can have its CREATE TABLE / ALTER silently skip while the trailing `pg_notify`/`NOTIFY` still returns a row. `training_templates` "succeeded" but didn't exist; only found when a save failed. **After ANY CREATE/ALTER, verify with `SELECT <newcol> FROM <table> LIMIT 1;`** (expect success/rows, NOT "relation/column does not exist"). Re-run the bare statement if it didn't take.

### ⚠️ Hidden CHECK constraints (BIT US TODAY)
`employee_documents.doc_type` has a CHECK constraint allowing only `rtw_passport/rtw_brp/rtw_share_code/rtw_visa/rtw_other`. Writing any other value (e.g. a slot key) → "violates check constraint employee_documents_doc_type_check". There may be other such constraints not visible from code. When inserting into an existing table, reuse values the existing UI already inserts successfully, or check the constraint first.

### Rules-of-hooks (build-failing; parse won't catch)
A hook after an early `return` fails the Vercel build. All hooks before any conditional return. Validate with eslint-plugin-react-hooks at `/home/claude/eslintcheck` (and babel parse at `/home/claude/check.js`) before pushing.

### Field-by-field save objects drop fields (BIT US TODAY)
The training module `handleSave` rebuilt its payload field-by-field and silently dropped `type` (always saved "onboarding"). When a handler reconstructs an object for a helper, make sure EVERY field is carried. Prefer spreads where safe.

---

## ✅ SHIPPED + VERIFIED THIS SESSION

### Trainee portal (journey: applied → reviewing → hired → Training → Employee)
- A trainee = a HIRED employee with `ops_team.is_trainee = true`. "Training" is an employee state, not an application status. "Convert to full staff" clears the flag.
- `ops_team.is_trainee boolean NOT NULL DEFAULT false` (separate column: `role` is JOB TITLE string e.g. "Barista", not a permission level; `status` is lifecycle).
- New hires default to trainee. FIXED: two hire row-creation paths (modal payload keyed on `isHireFlow`; inline `hireApplication` else-branch in supabase.js) — both now set `isTrainee:true`.
- PIN set at hire = trainee login. Trainee login = FULL TAKEOVER → `TraineePortal` only (no sidebar/employee shell). Profile shows "🎓 Trainee" badge + "Convert to full staff".

### Training content layer (manager authoring) — `TrainingAdminView`, "Training" sidebar item (PEOPLE group)
- **training_modules** (per-store, store_id NOT NULL): title, description, category, content (Markdown), required, sort_order, source_template_id, type, archived_at.
- **training_progress**: (employee_id, module_id) UNIQUE; completed_at (trainee tick) + verified_at/verified_by_* (manager). Helpers read-modify-write so the two states don't clobber.
- **training_templates**: reusable blueprints (no store_id, has type). Any manager authors. `instantiateTemplate` copies a template into a NEW independent store module (source_template_id provenance, NO propagation = copy-and-own).
- **type** field on modules+templates: `onboarding` (trainees see) vs `training` (general library, all staff). CHECK constraint NOT VALID. Existing backfilled to onboarding.
- Two tabs: Store modules / Templates. Shared editor `TrainingModuleEditor` (isTemplate prop) with type picker.

### Trainee consumption (`TraineePortal` body) + staff library
- **SafeMarkdown** renderer (hand-rolled, no dependency, no XSS — no markdown lib in package.json). Headings, bold, italic, links, lists, inline code, images.
- Trainee sees ONLY `type==='onboarding'` modules, grouped by category, tick-to-complete, progress bar (counts onboarding-required only), + RTW docs via reused `DocumentsTab`.
- **StaffTrainingView**: "Training" item in EmployeeShell nav; existing staff browse ALL store modules (both types), read-only, grouped by category, expandable Markdown.

### Onboarding documents — TWO-STAGE approval + required slots (the big build)
- **employee_documents** extended (Step 1 + two-stage + slots), all verified to exist:
  - `status` (pending/accepted/rejected) — legacy single-stage, kept in sync for back-compat.
  - `review_stage` (pending / manager_approved / hr_approved / rejected) — SOURCE OF TRUTH.
  - manager_approved_by_id/_name/_at; hr_approved_by_id/_name/_at; rejected_by_id/_name/_at; rejected_stage ('manager'|'hr'); rejection_reason.
  - `required_doc_key` (slot key) + idx_employee_documents_slot.
- **Workflow**: Pending → Manager-approved → HR-approved (final). Manager = manager/hq_staff/owner; HR = hq_staff/owner. Reject at either stage → back to trainee (re-upload restarts at pending).
- **Required slots** (fixed, `REQUIRED_DOC_SLOTS` in App.js): Passport, Share code, Proof of address, NI number (trainee-uploadable); **Right to work (managerOnly)**. Each slot maps to a constraint-valid `doc_type` (slot identity is in `required_doc_key`, NOT doc_type). "X/5 approved" gates on all required = hr_approved.
- **ANY manager upload auto-passes stage 1** → manager_approved (still needs HR). Trainee upload → pending.
- **RTW privacy**: trainee NEVER sees the RTW document/detail/View — only "Handled by your manager". Managers/HR see it fully.
- **Versioning**: re-upload into a slot archives the prior current version (kept as history) and inserts new — slot = single trace.
- **Other documents**: un-keyed uploads (incl. legacy test docs) show in a separate section.
- supabase helpers: `managerApproveDocument`, `hrApproveDocument`, `rejectDocument(id,stage,reviewer,reason)`, `resetDocumentReview`, `_updateDocAndReturn`. `addEmployeeDocument` extended with requiredDocKey/reviewStage/managerApprovedBy + supersede. OLD `setDocumentStatus` REMOVED.
- App components: `DocumentsTab` rebuilt as slot checklist (shared by manager profile + trainee portal, signature `{employeeId, currentUser}`); `DocRejectPrompt`; `DocUploadForm` (now takes `fixedLabel` to hide doc-type picker for slot uploads); helpers `REQUIRED_DOC_SLOTS`, `getSlotLabel`, `docStageMeta`.

### Onboarding documents — STEP 3: comment threads + version history
- **document_comments** table: per-document back-and-forth thread. Anyone with visibility posts (trainee on own docs + any manager/HR). `read_by` array tracks unread (same pattern as inbox_messages); a comment is unread for a viewer if their id isn't in read_by. In-app only — EMAIL DEFERRED (needs Resend).
- supabase helpers: `fetchDocumentComments`, `addDocumentComment`, `markDocumentCommentRead`. Mapper `dbDocumentCommentToApp`.
- UI: collapsible "Comments (n)" per document in `DocCommentThread` with unread badge ("n new"); opening a thread marks its comments read. RTW thread IS visible to trainee (only the RTW *document* is hidden, not its thread — deliberate, so manager can message re: the check).
- **Version history**: re-upload archives the prior version (file kept in storage, never destroyed) and inserts new. Re-uploading an APPROVED slot resets it to needs-review (intended). `fetchArchivedDocuments` returns superseded versions; "Previous versions (n)" expander per slot shows them with View links — MANAGERS/HR ONLY (trainees don't see history).

---

## SCHEMA OBJECTS ADDED THIS SESSION (all on PRODUCTION, all verified)
1. `ops_team.is_trainee`
2. `training_modules` (+ content, + source_template_id, + type)
3. `training_progress`
4. `training_templates` (+ type)
5. `employee_documents.status` + reviewed_by_* + reviewed_at + rejection_reason (Step 1)
6. `employee_documents.review_stage` + manager_approved_* + hr_approved_* + rejected_* (two-stage)
7. `employee_documents.required_doc_key` + idx_employee_documents_slot
8. `document_comments` table (per-document comment threads; read_by array for unread)
9. `employee_documents` signature cols: signed_by_id, signed_by_name, signature_statement, signed_ip (signed_at already existed) — for contract e-sign
10. `employee_documents_stage_chk` constraint widened to allow 'signed'
11. `contract_templates` table (web contract templates — stage 1)
12. `employee_contracts` table (sent+signed web contracts; filled_body = frozen snapshot)
13. ops_team: tax_starter_statement, has_p45, student_loan, tax_completed_at (HMRC tax)
14. ops_team: bank_account_name, bank_sort_code, bank_account_no, bank_provided_at + bank_declared_by_name, bank_declaration, bank_declared_at (employee self-submits + declaration; HR/owner or own-record view)
15. `policy_acknowledgements` table (employee+policy, upsert, audit)
16. ops_team.role_ids text[] (multiple job roles; role_id mirrors role_ids[0])
17. `advertised_roles` table (managed advert titles for hiring; separate from store roles)
18. ops_team: ni_number, selffill_token (unique idx), selffill_completed_at (self-fill link)
19. ops_team: gender (added with self-fill); pin now also employee-settable via self-fill
20. Postgres FUNCTIONS (server_aggregation.sql): agg_flipdish_sales, agg_flipdish_items, agg_flipdish_heatmap, agg_flipdish_last_sale (Chain Performance reads via these RPCs, not raw rows)
21. INDEX idx_flipdish_sales_brand_saletime (brand_id, sale_time DESC) — makes agg_flipdish_last_sale instant (was 10.5s)
22. Edge Function flipdish-rms-sync REWRITTEN: auto-chunk max 2 days/call + resumeFrom + hardened error handling (NOT in repo — lives in Supabase; source saved as flipdish-rms-sync.ts)
SQL files in outputs: training_step3_is_trainee, training_step1_modules, training_stepA_content_progress, training_templates, training_module_type, docs_step1_review_state, docs_two_stage_approval, docs_step2_slots, docs_step3_comments.

---

## 🔜 NOT BUILT — next-session work

### ONBOARDING COMPLETENESS — ALL FOUR BUILT + VERIFIED (this session)
Reviewed onboarding vs UK standard; built the four prioritised gaps. All deployed + tested in prod.
1. **HMRC tax starter checklist** — DONE. Statement A/B/C + P45 flag + student-loan flag. Manager side on profile → new "Onboarding" tab; employee self-service in portal (EmployeeOnboardingSection). Fields on ops_team: tax_starter_statement / has_p45 / student_loan / tax_completed_at.
2. **Policy/allergen acknowledgements** — DONE. ONBOARDING_POLICIES = handbook, allergen (food-safety), health_safety, gdpr. Employee ticks "I have read this" in portal; manager can record in-person. Table policy_acknowledgements (upsert on employee_id+policy_key). Helpers fetchPolicyAcknowledgements / acknowledgePolicy.
3. **Bank details** — DONE, option (A). Stored on ops_team (bank_account_name/sort_code/account_no/provided_at + declaration audit: bank_declared_by_name/bank_declaration/bank_declared_at). EMPLOYEE SELF-SUBMITS their own bank details in their portal/shell onboarding section + must tick accuracy declaration ("I confirm these bank details are correct and authorise payment of my wages to this account") before submit — recorded with name+timestamp. Employee sees only their own (masked to last-4 after submit: "ending 5678"); can update (re-declares). OWNER/HR view full numbers + the declaration on profile → Onboarding → Bank details → View/edit. Managers see only "provided/not provided", never numbers. Access gate: isHqOrOwner OR own record. ⚠️ App-level protection only — NOT encrypted; numbers in DB plaintext, relies on DB access control. User accepted trade-off. Upgrade path = encryption/RLS. NOTE (debugging lesson): a Supabase .update().eq() that matches zero rows / is RLS-blocked returns success with no error — so "saved" UI can be phantom. When a write seems lost, verify in DB directly (SELECT) before changing code. In this case the data WAS saving correctly; the apparent bug was just checking a different employee's record (sakshi vs atif).
4. **Onboarding-complete gate** — DONE. Computed (no column) at top of Onboarding tab: 5 checks (docs hr_approved + contract signed + tax done + bank provided + all policies acked) → "✓ Onboarding complete". Components: OnboardingTab (manager/HR), EmployeeOnboardingSection (employee self-service tax + policies, NO bank). SQL: onboarding_completeness.sql.

### Other open
- **Email notifications** for document comments (needs Resend infra: account, API key, domain verification, send logic). In-app unread badge already works.
- **Storage hardening (flagged)**: `applicant-photos` bucket is PUBLIC with broad SELECT, now holds passports/NI/signed contracts. DON'T just remove the SELECT policy — app reads files via public URLs (View links, image rendering) so removing it breaks viewing. Needs proper review (signed URLs / scoped policies). Related: bank details would benefit from encryption/RLS as a future hardening.
- **Enable editor's PDF-guide link** (tiny): host Training_Content_Authoring_Guide.pdf, paste URL into `const TRAINING_GUIDE_PDF_URL = ""`.
- Albin Tamang (and possibly others) has NO store assigned → "No stores assigned" empty state in employee shell. Fix on Job & Pay tab. Minor data cleanup.
- Category defined list (minor); "Insert image row" button (minor).

### DONE this session (Flipdish: sync recovery + server-side aggregation) — verified in prod
- **AUTO-REFRESH UPGRADE (extension v1.1.0) — WORKING, verified.** The extension now ALSO auto-refreshes both tokens every 4 hours in the background (no clicking) via a service-worker chrome.alarms timer — works as long as Chrome is open and the Flipdish session is alive (user confirmed their portal login persists for days, so the captcha/2FA login is rare). Files added: background.js (the alarm) + shared.js (CONFIG incl. SUPABASE_ANON + SHARED_SECRET + refreshTokens(), shared by button and timer). Folder now has 5 files. ⚠️ CONFIG (anon key + secret) now lives in shared.js, NOT popup.js. ⚠️ GOTCHA: after editing shared.js you must do a FULL remove+re-add of the extension (a plain reload leaves the service worker running a STALE cached shared.js → "401 Invalid API key" on the background run while the button still works). Verified: background alarm fired on its own → popup "Auto-refresh last ran ...: ✓ ok" → sync_config.updated_at matched the background run time. The button still works for on-demand refresh. Needs Chrome running; if Chrome is fully closed past the token's life the timer won't fire (alarm + manual button cover that).
- **ONE-CLICK TOKEN REFRESH (Chrome extension) — WORKING, verified end-to-end.** The token CANNOT be auto-refreshed (login = hCaptcha + SMS 2FA; auto-solving them is unsafe/ToS-violating — declined). Instead: a Chrome extension (folder C:\dev\flipdish-token-extension; files flipdish-token-extension/{manifest.json,popup.html,popup.js}) reads BOTH session cookies (rms-token + FD-Authorization) from the logged-in portal and writes them to a `sync_config` table via an RPC. You log in as a human, click one button, done (~10s). 
  - Architecture change: tokens moved OUT of env secrets INTO the `sync_config` table (keys flipdish_rms_token, flipdish_fd_authorization). The Edge Function now reads BOTH from sync_config per-request (not Deno.env). SQL in sync_config.sql: table (RLS on, no public policies) + RPC `set_flipdish_tokens(p_rms_token, p_fd_auth, p_secret)` (SECURITY DEFINER, granted to anon, guarded by a shared secret). Extension uses the ANON/public key (safe in browser) + the shared secret.
  - ⚠️ GOTCHA that cost time: the shared secret had a TRAILING NEWLINE in the function definition (multi-line SQL put the closing quote on the next line → secret = '...\n'), causing 400 P0001 'unauthorized'. Fix: define `expected text := '...';` ALL ON ONE LINE. Current secret = 'chocoberryflipdishsync2026' (guessable — swap for a long random one eventually, but keep it single-line in BOTH the SQL and popup.js, and RELOAD the extension after editing popup.js).
  - Verified: extension button → "✓ Saved. RMS token updated + FD-Authorization updated" → sync_config.updated_at changed → function `{}` invoke returned 200 (358 sales) using the freshly-written tokens.
  - Cookie names confirmed real: `rms-token` and `FD-Authorization` on portal.flipdish.com. FD-Authorization expires ~Sep 2026 (long-lived); rms-token ~24h. Both now refreshed together in one click.
- **SYNC-SAFETY NET (token can't be auto-refreshed — login has hCaptcha + SMS 2FA, confirmed via screenshots; so manual refresh is unavoidable, goal is making it rare/painless):**
  - **Stale-data alarm** (App, deployed): red banner on Chain Performance when no new sale in >30h (signature of token expiry / dead sync). Inline "latest sale" indicator goes amber >18h, red >30h. 30h tolerates a normal quiet overnight so no false alarms. Turns silent failure into same-day visible. (App_SYNC_ALARM.js → now folded into latest.)
  - **last_sale index fix** (SQL): agg_flipdish_last_sale was 10.5s (no index on sale_time → scan); added `idx_flipdish_sales_brand_saletime (brand_id, sale_time DESC)` + dropped the is_cancelled filter from the function → now 21ms. This 10s query was causing the INTERMITTENT "Couldn't load sales data" timeout on page load (it ran in parallel with the other load queries). Fixed.
  - **Auto-chunk sync** (Edge Function flipdish-rms-sync.ts, redeployed in Supabase): processes max 2 DAYS PER INVOCATION (each day ~11s; the free-tier Edge Function execution limit killed 3+ days → that was the cryptic "reading 'error'" 500, NOT a code bug). Returns `resumeFrom` + `moreToProcess` for longer ranges. Backfill pattern: call, read resumeFrom, call again with it, repeat (~7 calls for 2 weeks). Daily case (sync today) = one call, works. Function fully hardened with try/catch around fetch/json/upsert/store-lookup so failures return readable messages (incl. tokenHint on 401/403) not cryptic 500s. Verified: single day 2,979 sales / £58k clean.

- **Sync was DEAD ~2 weeks (expired token) — restored.** The `flipdish-rms-sync` Edge Function authenticates to Flipdish's RMS *portal* API by passing two cookies: `FLIPDISH_FD_AUTHORIZATION` (long-lived, ~Sep 2026) and `FLIPDISH_RMS_TOKEN` (SHORT-LIVED ~24h, scraped from portal cookies). The rms-token had expired, so no new data since ~mid-May. Fixed by refreshing the `FLIPDISH_RMS_TOKEN` secret + backfilling. ⚠️ ROOT CAUSE UNRESOLVED: this token expires every ~24h and must be manually refreshed — the sync WILL die again. Real fix = move to official Flipdish v3.0 API OAuth (App ID/Secret), not portal-cookie scraping. Also the function 500s on multi-day ranges (>~1 day at once = too many rows / 60s fetch timeout) — backfill ONE DAY PER REQUEST (`{"fromDate":"YYYY-MM-DD","toDate":"YYYY-MM-DD"}`). Could be fixed to auto-chunk internally.
- **Chain Performance timeout FIXED via server-side aggregation.** The view was pulling ~44k flipdish_sales rows to the browser per load and intermittently hitting the 2-min statement_timeout (returning partial data). Now aggregates in Postgres via RPCs and ships tiny result sets. SQL functions (in server_aggregation.sql, all CREATE OR REPLACE / idempotent): `agg_flipdish_sales(brand,from,to)` → per store×channel count+revenue; `agg_flipdish_items(brand,from,to)` → per-item qty+revenue (top-level items only, excludes modifiers/cancelled/refunded); `agg_flipdish_heatmap(brand,from,to)` → dow×hour counts; `agg_flipdish_last_sale(brand)` → max sale_time. App: storeMetrics now built from salesAgg/prevSalesAgg (via fetchSalesAggregated current+prior); heatmap via fetchSalesHeatmap; "latest sale" via fetchLastSaleTime; StoreDetailModal fetches its own store's sales on demand (fetchStoreSales, scoped/lazy). Raw `fetchFlipdishSales` full-load no longer drives the view. Items-sold section (top/bottom 10, revenue, category) now uses agg_flipdish_items.
- **⚠️ "13% undercount" was a FALSE ALARM — do not chase it.** Mid-investigation it looked like the dashboard understated revenue (£306k vs £351k). That was a MEASUREMENT ARTIFACT: two *different* 7-day windows were compared (fixed 05-25→05-31 vs rolling today-6→today). When pinned to identical dates, dashboard and SQL match EXACTLY (£303,524.70 / 15,472 both). The dashboard numbers were always correct. The server-side rewrite is still a genuine win (fixes the timeout), just not a correctness fix.


- **Multiple job roles per employee.** ops_team.role_ids (text[]) added; role_id KEPT and mirrors role_ids[0] for backward compat (every single-role reader still works). Schema backfilled role_ids from existing role_id. Both edit paths (Add/Edit Member modal + profile Job & Pay tab) use multi-select CHIP toggles (toggleRole / toggleRoleJP) grouped by department. Team list, profile header, and role filter show/match ALL roles. Department stays SINGLE, derived from first role (deliberate). Validation requires ≥1 role. SQL: multi_role.sql. Files: App_MULTI_ROLE.js / supabase_MULTI_ROLE.js.
- **Advertised roles (managed list for hiring).** New advertised_roles table (id/title/description/active/sort_order) — a SEPARATE, simple list of advert titles managed in Hiring (HQ/owner → "Advertised roles" button → AdvertisedRolesModal: add/rename/hide/remove). DELIBERATELY decoupled from store roles: advert title ≠ assigned role. The PUBLIC apply form now populates its position dropdown from advertised_roles (active only), STORE-INDEPENDENT — this REPLACES the old per-store advertiseForHiring filtering (that flag still exists on store_roles but no longer drives the public form). Manager assigns real store role(s) at hire time via the multi-role picker. ⚠️ Public form shows "No positions open" until at least one advertised role is added. Helpers: fetchAdvertisedRoles/createAdvertisedRole/updateAdvertisedRole/archiveAdvertisedRole + handlers addAdvertisedRole/updateAdvertisedRoleRow/archiveAdvertisedRoleRow. SQL: advertised_roles.sql. Files: App_ADVERTISED_ROLES.js / supabase_ADVERTISED_ROLES.js.

### DONE this session (kiosk + self-fill onboarding) — verified in prod
- **Kiosk: tasks on punch-in + clocked-in menu (Stage 1).** After punch-IN, if the employee has tasks today, a "View today's tasks (N)" button shows the list (assignments matching personId OR any of their roleIds, scoped to the kiosk store, due today by frequency). If already clocked in and PIN entered → 3-option menu: ☕ Go on a break (stub — "coming soon") / ✓ View tasks / ⏹ Punch out. Clocked-in banner+button now say "tap to continue"/"→ Continue" (not Clock Out). todaysTasks useMemo in KioskApp; kiosk shell now also loads assignments/checklists/cleaningTasks/storeRoles. STAGE 2 (not built): break tracking (simple start→punch-to-end, ALWAYS UNPAID → must deduct from hours) + wiring task-MARKING into the existing checklistStates/cleaning completion system.
- **Employee self-fill onboarding link.** Manager creates a stub employee → SelfFillLinkCard generates a secure unguessable token → shares `/onboard?token=...`. New hire (no login) fills PERSONAL details only: name, nickname, photo, email, phone, DOB, gender, address, legal status, NI number, emergency contact (×3), AND chooses their own kiosk PIN. Link stays editable until manager finalizes. Bank EXCLUDED from the public link (done in-app post-login). Security: submitSelfFill whitelists fields server-side (SELFFILL_ALLOWED) — can't write roles/pay/status/bank. Helpers: generateSelfFillToken/clearSelfFillToken/fetchEmployeeBySelfFillToken/submitSelfFill. SQL: selffill_onboarding.sql (ni_number, selffill_token unique idx, selffill_completed_at). Public page: SelfFillShell at IS_SELFFILL route (/onboard).
- **Self-chosen PIN with uniqueness (added on top).** Self-fill form has a "Choose your clock-in PIN" field (4–6 digits). submitSelfFill validates format + GLOBAL uniqueness (isPinAvailable) — rejects "already in use" since the kiosk identifies people by PIN. This was the only piece NOT already in the prior self-fill build.

### DONE this session (Team view) — verified in prod
- **Ops Team moved to PEOPLE → "Team" + restructured.** New standalone OpsTeamView component (was a tab inside OpsSettingsView). Now a "Team" nav item at top of PEOPLE group (pending-setup badge moved here). Members GROUPED BY STORE (section headers + counts; unassigned → "No store assigned" group). Filters: search (name/nickname/role) + store + department + role dropdowns + "Pending only" toggle + Clear. Click row → opens profile (openEmployeeProfile); closing a profile now returns to "team" (closeEmployeeProfile updated). Add Member / Edit / Delete intact (uses addOpsTeam/updateOpsTeam/deleteOpsTeam + OpsConfirmModal). The old "Ops Team" tab REMOVED from Ops Setup; Shift Presets (was bundled there) given its own "Shift Presets" tab in Ops Setup so nothing lost. Orphaned tmModal/showOnlyPending state cleaned from OpsSettingsView. App.js only — no schema/supabase change. NOTE: OpsTeamView was rebuilt fresh (not a literal code move) so add/edit was re-verified working.

### DONE this session (contracts) — verified in prod
- **Contracts STAGE 2 — web contract send + sign + print.** Manager: Contracts → Send → pick employee (name auto-fills) → fill manual fields (position/start_date/salary/hours/probation/store/store_address) → live preview → Send (BLOCKED if any `[[ … — not set ]]` gap remains). Snapshot: filled body FROZEN into employee_contracts.filled_body at send; signing never touches it; independent of template (verified). Employee: "Contracts" tab in employee shell (Stage 2B fix — contracts go to full staff too) + inline in trainee portal → Read & sign (type name + tick + timestamp) → Print/PDF = single compliance file. Manager sees status+audit on profile → Documents → Contracts. Helpers: fetchEmployeeContracts/sendContract/signEmployeeContract/voidContract. fillContractForSend (name auto, rest manual, gap markers). SQL: employee_contracts_step2.sql.

### DONE since last handoff (this session, all verified)
- **Contract e-signature (PDF-upload route)**: new "Contract of employment" slot in DocumentsTab, kind "sign" (vs "approve"). Manager-uploads (like RTW) BUT trainee-visible (RTW stays hidden — gated on `slot.kind !== "sign"`). Employee: Review & sign → type name + tick statement + confirm → records signer id/name/statement/timestamp. Shows "✓ Signed by X on DATE" both ends. Helper `signContractDocument`; mapper fields signedById/signedByName/signatureStatement; review_stage "signed" counts as done in progress. SQL: docs_step4_signature.sql (signature cols), docs_step4b_signed_stage.sql (added 'signed' to employee_documents_stage_chk — the constraint only allowed pending/manager_approved/hr_approved/rejected; same hidden-CHECK-constraint trap as doc_type earlier).
- **Bucket PDF fix**: `applicant-photos` bucket only allowed image MIME types + 5MB, so contract PDFs (and any PDF) were rejected at the storage layer. Added `application/pdf` + raised to 10MB via Supabase dashboard → Edit bucket. This unblocked PDF uploads for ALL document slots, not just contracts. No code change.
- **Contracts STAGE 1 — web contract templates**: new "Contracts" nav item (PEOPLE) → ContractsAdminView. Author `contract_templates` (table: id/title/description/body/created_by/timestamps) with merge tokens; ContractTemplateEditor with an "Insert merge field" palette; Preview picks an employee and renders the FILLED contract via SafeMarkdown on a white page. Merge engine (module-level): CONTRACT_TOKENS, resolveContractTokens(employee, stores), fillContractBody(body, values). Tokens: {{employee_name}} {{position}} {{start_date}} {{salary}} {{store}} {{store_address}} auto-fill; {{hours}} stays literal (manual); unknown tokens left as-is; missing values show `[[ Label — not set ]]`. Store address composes from stores.address/city/postcode (already existed — no schema change). Preview readability fix: SafeMarkdown hard-codes light text for dark bg, so on the white preview box a scoped `.contract-preview-box` style forces dark text. SQL: contract_templates_step1.sql. Helpers: fetchContractTemplates / createContractTemplate / updateContractTemplate / archiveContractTemplate.
- **Contract template asset** (in outputs): `contract_template_body.txt` — the user's real "Statement of Main Terms" contract converted to a paste-ready template with merge tokens, adapted for SafeMarkdown (tables removed — sig boxes replaced by e-sign; columns→sentences; caps headings normalised). NOTE: salary "per annum" wording removed since pay may be hourly — verify per-use.
- **Profile polish**: denser fields, section grouping in Personal & HR, header tidy, Pay History merged into "Job & Pay" tab (7→6). Presentational.
- **C2b — trainee progress view**: "Trainee progress" tab in TrainingAdminView; pick trainee → modules with completed/verified + Verify/Unverify.
- **Training image upload**: "+ Insert image" in editor → uploads + inserts `![](url)` at cursor.
- **Side-by-side image+text**: `:::row`/`:::row-right`/`:::` in SafeMarkdown (tolerant of trailing whitespace). Don't nest images.
- **In-editor formatting help** panel + `TRAINING_GUIDE_PDF_URL` placeholder.
- **Authoring docs** (outputs): Training_Content_Authoring_Guide.pdf + sample_module.txt.

---

## DEFERRED FROM EARLIER (still open)
- Candidate self-apply via anon RLS — rolled back twice, needs staging. (Trainee portal is PIN-gated like the kiosk, sidestepped this.)
- Resend email infra never set up; magic-link auto-send DISABLED.
- Auto-purge applicant photos on rejection; GDPR retention; Assets/Disciplinary/Performance tabs; Holiday/sick tracking.
- Flipdish API migration — blocked until end-June 2026.
- 12 latent mapper bugs (documented in supabase.js header, no incidents).
- Cosmetic: `ChainPerformanceView .jsx` filename has a space; consider flattening the doubled repo folder.

---

## LATEST FILE STATE (deployed + verified)
- App.js: **App_SYNC_ALARM.js** (1,131,558 bytes) — latest, deployed. (lineage: …SELFFILL_PIN → ITEMS_SOLD → SERVER_AGG → SYNC_ALARM)
- supabase.js: **supabase_SERVER_AGG.js** (169,184 bytes) — latest, deployed.

### ⚠️ FILE-LINEAGE WARNING (read before building)
Canonical latest = **App_SYNC_ALARM.js (1,131,558) + supabase_SERVER_AGG.js (169,184)**. (supabase unchanged since SERVER_AGG; the sync-safety SQL — last_sale index + the 4 agg functions — lives in server_aggregation.sql, run directly in Supabase. The Edge Function flipdish-rms-sync lives in Supabase, source saved as flipdish-rms-sync.ts, NOT in the repo.) Lineage: …REFINEMENTS → SELFFILL_PIN → ITEMS_SOLD → SERVER_AGG → SYNC_ALARM. A stale PARALLEL branch (App_KIOSK_TASKS/TASKS2, ~1,108,247) is MISSING self-fill — never build on it. Before treating a file as current: `findstr /c:"fetchSalesAggregated" src\supabase.js` and `findstr /c:"function SelfFillShell" src\App.js` must both return, and App.js should be ~1,131,558+.

---

## CRITICAL PATTERNS (carry-forward)
1. Mappers partial-aware: `if (m.field !== undefined) row.db_field = m.field`.
2. Upsert enforces ALL NOT NULL — pass complete objects / `.update().eq()`. Rows touched by two actors (e.g. training_progress) → read-modify-write.
3. `window.confirm()`/`alert()`, never bare.
4. Hooks before any early return (build-failing; parse won't catch).
5. After CREATE/ALTER on prod: VERIFY with `SELECT ... LIMIT 1`. pg_notify ≠ proof.
6. Inserting into an existing table: reuse known-good values (watch hidden CHECK constraints).
7. Handler payloads must carry EVERY field the helper expects (the type-drop bug).
8. getCertExpiryStatus is module-level (reused cert + doc expiry badges).

Schema cache reload after ALTER: `NOTIFY pgrst, 'reload schema';`

---

## ⏳ IN PROGRESS — SCHEDULED SYNC (cron) — auth failing, pick up here
(NOTE: tokens now live in sync_config and the function reads them there — the one-click extension keeps them fresh. The cron job's only remaining blocker is the cron→function bearer auth 401, unrelated to the Flipdish tokens.)
Goal: a pg_cron job that auto-invokes the flipdish-rms-sync Edge Function daily so "sync today" runs without a manual click (the stale-data alarm covers the days the token's expired). pg_cron 1.6.4 + pg_net 0.20.0 both already enabled.

DONE: Found TWO pre-existing broken cron jobs and removed them — `flipdish-auto-sync` (every 15min: typo'd URL `qtjsdbasoooous...` THREE o's + wrong function name `flipdish-sync` + unconfigured current_setting key) and `flipdish-rms-sync-30min` (every 30min: literal unfilled `<anon-key>` placeholder). BOTH had been failing every run — that's why the schedule "existed" but data still died silently. Created replacement `flipdish-daily-sync` (jobid 5), schedule `0 6,12,18 * * *`, correct URL (`qtjsdbasoouslcpinqhu`, two o's) + correct function (`flipdish-rms-sync`) + a real well-formed service_role JWT (decodes correctly: ref matches, role=service_role, exp 2036).

BLOCKER: test invoke still returns **401 `UNAUTHORIZED_INVALID_JWT_FORMAT` / "Invalid JWT"** despite the key being a valid JWT. Function ITSELF works fine (used all session via the Edge Function test panel). So it's specifically the cron→bearer auth path. NEXT SESSION, check two things to find the fix:
  1. Edge Functions → flipdish-rms-sync → Settings → is **"Verify JWT" ON?** If on, the gateway is rejecting the bearer — simplest fix is turn Verify JWT OFF for this internal-only function (called only by cron, not user-facing).
  2. Settings → API Keys → is the project on **legacy** keys (anon/service_role JWTs) or the **new** system (sb_publishable_/sb_secret_)? Both sections were visible. If new system, the gateway may want an `sb_secret_...` key, not the legacy JWT.
Test pattern: `SELECT net.http_post(url:='https://qtjsdbasoouslcpinqhu.supabase.co/functions/v1/flipdish-rms-sync', headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer <KEY>'), body:='{}'::jsonb);` then `SELECT id,status_code,content::text FROM net._http_response ORDER BY created DESC LIMIT 3;` — want status_code 200.
⚠️ SECURITY: the legacy service_role JWT was pasted into chat + sits in plaintext in cron.job/net._http_response. ROTATE the service_role key (Settings→API Keys) once the sync works, and update the job. File scheduled_sync.sql has the template (⚠️ its placeholder must be replaced with the REAL key — that mistake already cost a cycle).


## 🏗️ IN PROGRESS — PAYROLL FEATURE (staged build)
Goal: produce payroll data for the accountant from dashboard data. Design (all confirmed with user):
- A **payroll TAB inside the employee profile** (per-employee), PLUS an all-employee Excel export (the export iterates everyone for a period). OWNER-ONLY access (isOwnerRole, not hq).
- Per-employee per-period record: total_hours, total_pay (gross), bank_hours, cash_hours (split is by HOURS; amounts derived proportionally from gross), payroll_location (PAYE entity) + accounting_location (cost centre) — two SEPARATE location fields.
- **Cash vs bank is purely PAYMENT METHOD** — all wages fully declared to the accountant; cash is used when the bank balance is short (cash-flow), everything recorded. NOT off-books. (User clarified this explicitly.)
- LOANS: internal-only running balance (advances + repayments ledger), NEVER in the accountant export.
- PAY RATE per employee via new `ops_team.pay_basis` ('minimum_wage' | 'fixed'). minimum_wage = look up live from NMW table by age-on-work-date; fixed = use ops_team.hourly_rate. User pays min-or-above; picks per employee. NO below-min warning for fixed (user said fixed=fixed). NO apprentice rate (3 bands only: 21_over / 18_20 / under_18).
- Hours: auto-pulled from punch_records (only APPROVED), editable. Overtime = just more hours, no premium. Gross for min-wage employees = RECOMPUTED live from the NMW rate (don't trust punch_records.gross_pay); show the working (auditable). Pay period = CUSTOM date range each run (warn on overlap with an existing saved period).
- Rate resolver rules: age computed on the WORK/PUNCH date; exact age (birthday mid-period → higher rate from that day — user's choice, slightly more generous than strict UK law but safe); if NO rate configured for a band on a date → ERROR/FLAG loudly, never guess.
- UK NMW (user MUST verify on gov.uk before entering): from 1 Apr 2026 — 21+ £12.71, 18–20 £10.85, under-18 £8.00. Apr 2025–Mar 2026 — £12.21 / £10.00 / £7.55.

STAGE 1 — DONE & VERIFIED in prod. payroll_stage1.sql created 3 tables + 1 column (NO RLS — matches ops_team which has relrowsecurity=false; app gates owner-only at app layer). Confirmed: minimum_wage_rates, payroll_periods, employee_loans all exist; ops_team.pay_basis added, all 30 employees defaulted to 'fixed'. (Had to run statements ONE AT A TIME — the SQL editor only partially executed the multi-statement file.)

STAGE 2 — DATA LAYER DONE & VERIFIED; UI NOT STARTED. Appended to supabase.js (saved as supabase_PAYROLL_S2.js, 175,292 bytes): fetchMinimumWageRates / upsertMinimumWageRate / removeMinimumWageRate; ageOnDate / bandForAge / rateForBandOnDate / **resolveHourlyRate** (the core resolver); fetchPayrollPeriods / upsertPayrollPeriod; fetchEmployeeLoans / addLoanEntry / loanBalance. Resolver tested with 13 cases ALL PASS (payroll_resolver_tests.mjs) incl. birthday-crossing (turns 21 on the 15th → 18_20 rate on 14th, 21_over on 15th) and April rate-change (effective-dating). syntax-clean.
  REMAINING in Stage 2 (UI, in App.js — NOT yet edited, still canonical 1,131,558): (1) add `payBasis` to the ops_team camelCase mapper; (2) a pay_basis selector on the Job & Pay tab of EmployeeProfileView (function at ~line 8233; tabs array ~8457; tab bodies render via `tab === "job"` ~8491); (3) an OWNER-ONLY NMW-rates admin screen (add/list/delete rates by band+effective_from). Owner check helper: `isOwnerRole(role)` (~line 187). EmployeeProfileView gets `currentUser` prop. Build UI, then verify rate entry + resolver end-to-end BEFORE Stage 3.
STAGE 3 (pending) — the payroll tab itself (period picker, auto-pull approved punch hours, show rate working per the resolver, bank/cash hours split, two locations, loan section). 
STAGE 4 (pending) — all-employee Excel export, standard clean layout (user has no prior file to match); EXCLUDES loans. ⚠️ read /mnt/skills/public/xlsx/SKILL.md before building the export.


## SUGGESTED OPENER FOR NEXT CHAT
> "Continuing Chocoberry dashboard. ⚠️ FIRST: latest files are App_SYNC_ALARM.js (1,131,558 bytes) + supabase_SERVER_AGG.js (169,184 bytes) — see FILE-LINEAGE WARNING; do NOT build on the App_KIOSK_TASKS branch. Everything's built and live: full onboarding (RTW docs two-stage + versioning + comments; contracts author→send→sign→print frozen-snapshot; HMRC tax; policy/allergen acks; employee bank w/ declaration; complete gate), training, profile polish. Team under PEOPLE→'Team' (grouped by store, filters+search). Multiple job roles per employee. Hiring advertised-roles list drives the public apply form. Self-fill onboarding link (/onboard?token=) + self-chosen unique PIN. Kiosk: tasks on punch-in + clocked-in menu. Chain Performance uses SERVER-SIDE aggregation RPCs (agg_flipdish_sales/items/heatmap/last_sale) — fixed a load timeout; numbers verified correct (an earlier '13% undercount' was a FALSE ALARM = mismatched windows, ignore). ⚠️ FLIPDISH SYNC: depends on FLIPDISH_RMS_TOKEN that expires ~24h and CANNOT be auto-refreshed (login has hCaptcha + SMS 2FA — confirmed). Safety net now in place: dashboard shows a red STALE-DATA alarm if no sale >30h; Edge Function flipdish-rms-sync auto-chunks max 2 days/call with resumeFrom (~7 calls for 2wks; daily sync-today = 1 call). When sync dies: refresh the token in Supabase secrets, then call the function following resumeFrom. Repo: C:\\dev\\create-brands-dashboard\\create-brands-dashboard; read SESSION_HANDOFF.md. ⚠️ IN PROGRESS: scheduled sync (pg_cron job flipdish-daily-sync, jobid 5) is created but the cron→function auth returns 401 Invalid JWT — see the IN PROGRESS section in the handoff (check Verify-JWT setting + legacy-vs-new key system); also ROTATE the service_role key (it was exposed). Other open (non-urgent): kiosk Stage 2 (breaks UNPAID→deduct + task-marking); email notifications (Resend); storage hardening; PDF-guide link."
