# Handover — 2026-06-10 session (Chocoberry dashboard)

## Current live state (verify byte counts before editing!)
- **src/App.js = 1416771 bytes** — `App_REVIEWSCANS_v2_20260610.js` (review-scan QR pointing at `review_scans` function slug).
- **src/supabase.js = 218964 bytes** — `supabase_REVIEWSCANS_20260610.js`.
- **public/index.html — UNCHANGED** (Tailwind CDN is load-bearing; never add CDN `<script>` tags or all styling breaks).
- App icons: brown+cream theme deployed (logo192/512, apple-touch-icon, favicon, badge-96).

Deploy discipline unchanged: full file → `copy /Y` → byte-check → `git status` modified (watch the Downloads `(1)` trap) → commit → push. PWA caches HARD — after deploy, test in **incognito / fresh tab**, not the installed home-screen app (a stale cache caused ~30 min of false "it's broken" debugging this session — the code was right, the device was cached).

---

## What shipped this session (employee app)

All built on the recovered "old" employee app base after another app's deploy had wiped the formatting. Sequence of live files: EMPNAV → EMPCOMMS → CHATUI → CHATFIX → HOME → HOMEFIX → THEME → NAVCONTRAST → UNREADBADGE → REVIEWQR v2/v3 → REVIEWSCANS v2.

1. **Bottom tab nav** (Home / Schedule / Training / More) + slide-up More sheet. Replaced the cluttered wrapping top nav. Chat icon + bell in header; Sign out moved into More.
2. **Communication = Chat/Help Desk slider** (Chat default). Availability + My Hours moved into More; My Schedule is its own bottom tab.
3. **Home greeting card** — avatar, date, live weather (Open-Meteo via geolocation, silent fallback), greeting, today's shift (from `schedules`), task count scoped to the employee's stores. Role removed from header/More (name + brand only).
4. **Cream/brown theme** — scoped via `.emp-theme` wrapper + a `<style>` block remapping slate/indigo utilities to cream/brown. **Employee app only** — manager/admin stays dark. Bottom nav dark-brown with light text; chat/helpdesk slider contrast fixed.
5. **iPhone safe-area padding** on bottom nav, More sheet, main content, chat input (`max(env(safe-area-inset-bottom), …)`).
6. **Chat UI polish** + fixed an invalid Tailwind class `border-slate-800/60/80` (22 occurrences) that rendered borders invisible.
7. **Unread badge fix** — root cause history: (a) `markMessageRead` had `if (error||true)` forcing a fallback that threw on NULL `read_by`; rewrote it (supabase). (b) A blanket "mark all visible read on every messages change" effect cleared the badge instantly so it never showed — **removed** that; marking-read now happens per-conversation in `ChatThread` against BOTH `currentUser.id` and `opsTeamMemberId`. Badge now shows for unread and clears when a conversation is opened.

## Google Review QR feature (employee app) — COMPLETE
- Employee **More → Review QR**: warm customer-facing card (brown ribbon, gold stars, team message), QR rendered brown-on-cream (goqr.me API `color`/`bgcolor` params — NO white box, NO CDN script, just an `<img>`). Uses inline hex colors so the cream theme can't alter it.
- **Per-store direct review links** stored in `stores.metadata.google_review_url`. 7 stores set (evington-road, gipsy-lane, london-road, loughborough, narborough, rotherham, tove). Remaining 16 use a Google Maps name+address fallback. Helper `reviewUrlForStore(store)` prefers the direct link.
- **Per-staff scan tracking (option 1, scan-only):**
  - Table `review_scans` (staff_id, store_id, scanned_at, user_agent), RLS off.
  - Edge Function deployed with **slug `review_scans`** (display name may say "review-redirect" — the SLUG is what the URL uses; the app points at `/functions/v1/review_scans`). Verify-JWT OFF (customers have no token). Logs a scan, 302-redirects to the store's review URL.
  - Staff QR encodes `${REACT_APP_SUPABASE_URL}/functions/v1/review_scans?s=<opsTeamMemberId|id>&store=<storeId>`.
  - Manager app **Review Scans** view (under Reports, owner/hq/manager): leaderboard of scans per staff, period filter, top performer.
  - NOTE: Google gives no way to attribute a review to a person — this measures scan TRAFFIC driven, not confirmed reviews (the agreed metric).

## NOT live / parked
- **COGS view + GP%** (`App_COGS` 1421171, `App_COGSGP` 1423576) were built but NOT deployed (live App is the QR line). COGS *tables/SQL* WERE run in Supabase, but the model is being **rebuilt** (see below), so the old COGS screen is intentionally not live.
- supabase COGS helpers (fetchCogsAll/updateCogs…) ARE in the live supabase.js (218964) but unused by the live App — harmless.

---

## COGS — where we are (the rebuild)

We corrected the model twice and landed on the right architecture:

**Two SEPARATE inventory masters — never mixed:**
1. **Store master** — what each shop buys/holds: raw ingredients from suppliers + finished goods from Central Kitchen. **CK is treated as a supplier.** Shared across all stores (same items/prices).
2. **CK master** — CK's own raw ingredients (from its suppliers) used to make the goods it sells to shops.

CK output items appear in the STORE master as `ck_supplied` line items at a **transfer price**; CK's recipes/ingredients live ONLY in the CK master.

**Costing rule (unified):** every component cost = `portion_qty ÷ pack_size × pack_price`. Applies to raw ingredients, CK items, and prep ingredients.
- **Preps** are 2-stage: a mix is made (e.g. waffle mix from 1 of 6 bags + water + oil → 4400g yield), then a **portion** goes into each product (155g per waffle).
- **CK items** are purchasable with pack qty + transfer price (cake = 14 slices → ÷14; butter chicken = 1kg → ÷1000g; banana pudding = pack of 25 → ÷25). Can be sold direct (portioned) OR used inside a product.
- **Chocolate + toppings = MODIFIERS**, not base cost. Base product cost = always-included parts (batter + ice cream + packaging). Modifiers have their own cost, applied per customer selection at sale. Modifiers are a shared library, attached per product.

**Plan:** build a **recipe builder in the app** so Atif inputs products/variations directly; the builder's structure defines the schema; then generate a fill-in file in that format for bulk entry.

**Deliverables produced (need filling by Atif):**
- `INVENTORY_MASTERS_20260610.xlsx` — 2 tabs: Store Inventory Master (359 items, CK pre-tagged) + CK Inventory Master (152 ingredients). Pre-filled from costing sheets; pack-qty/unit need cleaning (source sheets mixed pack size and portion), suppliers mostly blank, Source tags are heuristic guesses.
- Source files used: Costing version 1, Chocoberry food costing, Food_Unit_Prep, Baking_Unit_Prep, COGS_DATA_PACK, COGS_INGREDIENT_RESOLUTION.

**Key reference (Atif's worked example):** Waffle Bites — mix prep (£8.14/4400g) → 155g portion (£0.287) + 1 chosen chocolate (modifier, £0.60–0.92/100g) + toppings (modifiers) + whippy ice cream (£0.117) + packaging (£0.175).

## Next COGS step
Start the build per Atif's request. Sequence: finalize Store master structure → recipe builder UI (defines schema) → fill-in file → import. CK master second.
