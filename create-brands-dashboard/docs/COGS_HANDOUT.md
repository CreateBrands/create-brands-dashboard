# Store-Level COGS — Build Handout & Context

**Repo:** `CreateBrands/create-brands-dashboard` · branch `main` · prod `create-brands-dashboard.vercel.app`
**Local:** `C:\dev\create-brands-dashboard\create-brands-dashboard` (Windows CMD, `cd /d`)
**Stack:** React (CRA) + Supabase + Vercel · monolith `src/App.js` (~2.13MB) + `src/supabase.js` (~355KB)
**Date of this handout:** 15 Jun 2026

This document captures the full context of the store-level COGS work so it can be (a) committed to the repo as a reference and (b) handed to a fresh chat without losing the thread.

---

## 1. The core decision & mental model

**Goal:** give each store a trustworthy Cost of Goods Sold figure, feeding the P&L and the operational KPI cards (Prime Cost %, Net Margin) that were previously stubbed "Awaiting COGS module".

**Key constraints that shaped everything:**

- **CK is a SEPARATE ENTITY.** The Central Kitchen has its own rich recipe/production/dispatch system (`ck_*` tables). **Store COGS does NOT use CK recipe costing.** The CK sells to stores like any other supplier. Do not mix CK costing into store COGS.
- **Stores do NOT track inventory quantities.** There is a costed *item list* per store (`cogs_store_items`, with `cost_per_base_unit`) but **no stock-on-hand, no receiving, no closing counts**. Therefore true usage-based COGS (opening + purchases − closing) is **not possible** without first building a store stock-count module.
- **Therefore: theoretical COGS is the right model.** Theoretical COGS = **mapped POS sales × recipe cost**. "What sold *should* have cost, per the recipes." This is the standard metric for a multi-site café group and needs no stock counts.

**Why theoretical is the right call (not just a fallback):** it's automatic, consistent across all sites, isolates the recipe/pricing question from operational leakage, and — once reconciled against actual purchase invoices later — the *gap* between theoretical and actual becomes the wastage/variance number, which is the real money-saver. Theoretical is the foundation that makes variance analysis possible.

---

## 2. The staged transition plan (where we are)

- **Stage 1 — Show, don't replace. ✅ BUILT & DEPLOYED.** Compute theoretical COGS, display it on the P&L *alongside* the existing recorded figure (manual EOD COGS + supplier invoices), with a mapping-coverage indicator. Nothing about existing P&L numbers changes. Lets the recipe number prove itself before being trusted.
- **Stage 2 — Switch P&L primary COGS to theoretical. ⬜ NOT BUILT.** Once coverage is high (>90%) and the number looks right: make theoretical the P&L COGS, and switch supplier/CK invoices from "COGS" to "purchases/inventory" so they stop double-counting. Retire (or keep as override) the manual EOD COGS field.
- **Stage 3 — Variance view. ⬜ NOT BUILT.** Theoretical COGS vs actual purchases per store = wastage/leakage. The payoff.

**The live double-count risk (until Stage 2):** the P&L currently sums manual EOD `cogsCost` **+** supplier invoices' `totalExVat` as COGS. If you also trust theoretical, that's three sources. Stage 1 deliberately only *shows* theoretical alongside; it does not add it into the P&L total.

---

## 3. Architecture — the store COGS layer (`cogs_*`)

A full recipe-costing system, separate from CK:

- **`cogs_ingredients`** / **`cogs_store_items`** — costed items with `cost_per_base_unit`, pack pricing, supplier. (`cogs_store_items` is the per-store costed *list* — **no quantities**.)
- **`cogs_preps`** + **`cogs_prep_components`** — intermediate recipes (e.g. sauces) with a `yield_qty`.
- **`cogs_modifiers`** — add-ons; each = an ingredient × portion (`item_scope`, `item_id`, `portion_qty`).
- **`cogs_product_variants`** — sizes/variants of a product.
- **`cogs_products`** + **`cogs_product_components`** — finished items built from ingredients/preps (component has `kind`, `item_scope`, `item_id`, `prep_id`, `variant_id`, `portion_qty`).
- **`cogs_pos_map`** / **`cogs_pos_mappings`** — maps a store's POS/till item name → a master product. **`cogs_pos_mappings`** is the store-scoped one (store_id, pos_name, product_id) used by the live mapping screen.
- **`cogs_ignored_till_names`** — junk/"open item" till names hidden from mapping & coverage (keeps the sales revenue; per store; reversible).

**Cost rollup chain (identical everywhere):**
`itemCost(scope,id)` → `prepCost(prep)` (sums components ÷ yield) → `prepCostPerUnit(prepId)` → `productCost(productId)` (sums components, preps expanded). A product returns `null` cost if any component is uncosted (this is why "mapped but uncosted" exists).

**Sales source:** `item_day_aggregates` — `item, qty, revenue, business_date, store_id`. **Item-per-day aggregates, NOT order-level.** In-store till sales exist ONLY here (no basket grouping).

**Order-level data:** `flipdish_orders` — has `items` (basket array), `store_id` (= a Flipdish store id), `order_placed_time`, `amount_total`, `amount_subtotal`, `channel`. **Online/Flipdish orders only.** Synced server-side by the `flipdish-rms-sync` Edge Function (not in App.js/supabase.js, so its store_id derivation isn't visible from the front-end code).

**P&L:** `AccountsView` (~line 24508). Recorded COGS = manual EOD `cogsCost` + supplier invoices `totalExVat`. The theoretical panel renders only when a **specific store** is selected (`storeFilter !== "all"`), since theoretical COGS is inherently per-store.

**COGS UI:** `CogsView` (~line 4899), owner/hq_staff only, nav key `"cogs"` ("COGS / Inventory"). Tabs: Inventory · Preps · Modifiers · Products · Mapping · **Order Simulator** · **Order Inspector**.

---

## 4. What was built (functions & UI)

### supabase.js

- **`computeStoreTheoreticalCogs({storeId, from, to})`** — Stage 1 engine. Pulls `item_day_aggregates` (date+store filtered), recipes, POS mappings, ignored names. Maps each sold item → product → recipe cost; multiplies sold qty × cost. Excludes ignored names from the coverage denominator. **Returns:** `cogs`, `totalRevenue`, `costedRevenue`, `unmappedRevenue`, `mappedButUncostedRevenue`, `coverage` (0–1), `cogsPctOfCosted`, `uncostedByProduct` (ranked list with reason), `lines`.
- **`fetchIgnoredTillNames(storeId)` / `ignoreTillName(storeId, posName)` / `unignoreTillName(id)`** — hide/restore junk till names. NB `ignoreTillName` uses **check-then-insert** (NOT upsert/onConflict) because the unique index is *functional* `(store_id, lower(pos_name))` which a column-list `ON CONFLICT` can't match.
- **`simulateFlipdishOrders({storeId, from, to})`** — replays real Flipdish orders, costs each basket via the recipe engine + **modifier costs from `orderItemOptions`** (Option B). Matches orders to a store via the explicit link `flipdish_stores.store_id === storeId` (matches against both the flipdish row id and store id as strings). **Returns** per-order COGS/sale/GP/margin, summary totals, `lineCoverage`, and a `diag` block (linked stores, orders-in-window, matched count, sample order store ids).

### App.js

- **Theoretical COGS panel** in `AccountsView` P&L — shows Theoretical vs Recorded COGS, COGS % of costed sales, mapping coverage (green ≥90 / amber ≥60 / red), an under-90% warning breaking the gap into unmapped £ vs mapped-but-uncosted £, and an expandable **"Mapped products with no cost yet"** breakdown (ranked by sales, with reason: *no recipe components* vs *ingredient cost missing*).
- **`PosMapper`** (Mapping tab) — three-way **All / Mapped / Unmapped** filter; **Hide/Restore** junk till names; **numbered rows**; **multi-select checkboxes + bulk auto-map** to best-match suggestion (≥0.9); wider product dropdown (`w-96`).
- **`OrderSimulator`** (Order Simulator tab) — store + date range → replays Flipdish orders → per-order items/COGS/sale/GP/margin + summary. Has its own local `Stat` helper (do NOT reference `AccountsView`'s `Stat` — it's out of scope; that caused a build failure).
- **`OrderInspector`** (Order Inspector tab) — pulls recent orders **from all sites** (no store-link dependency), renders nested item → variant → modifier structure with prices (**£0 flagged**), recipe-match badge per item (green → product / red unmapped), **modifier-match badge per option** (green "costed modifier" / amber "no modifier cost"), and a **"Show raw JSON"** per order. Field readers are defensive across Flipdish shapes.

---

## 5. The Flipdish order structure (confirmed from real data)

A real order item looks like:

```
{ "name": "Waffle Bites", "price": 6.95, "priceIncludingOptionSetItems": 6.95,
  "menuItemId": 95062988, "menuSectionName": "Chocoberry Specials",
  "orderItemOptions": [
     { "name": "Milk Chocolate", "price": 0, ... },
     { "name": "Ice-Cream (Vanilla)", "price": 0, ... }
  ] }
```

**Key facts:**
- The **item** carries the price (`price` / `priceIncludingOptionSetItems`).
- **`orderItemOptions`** = the toppings/modifiers selected, almost all at **`price: 0`** (included toppings — this is correct Flipdish behaviour, NOT a bug).
- £0 options still **cost real money** (the chocolate/ice cream have ingredient cost), which is exactly why **Option B** (cost modifiers separately) was chosen.
- Option line field is `name`; quantity rarely present on options.

---

## 6. Costing decision for topping-based items (Waffle Bites etc.) — OPTION B

**Chosen approach:** base recipe + costed modifiers matched to the order's options by name.

- **Base recipe** = the item without toppings (e.g. waffle batter prep + core).
- **Each topping = a costed modifier** in the Modifiers tab, **named exactly as Flipdish names the option** (`Milk Chocolate`, `Ice-Cream (Vanilla)` — punctuation matters, case-insensitive).
- **Engine** reads `orderItemOptions`, matches each to a modifier by name, **adds its cost** even at £0 sale price.

**To make Waffle Bites cost correctly in the recipe builder:**
1. Cost the **waffle batter** prep (its ingredients need `cost_per_base_unit`) and set the empty item row — clears "X unpriced".
2. Build each topping as a **modifier** named identically to the Flipdish option name.
3. **Attach** the modifiers to the product.

**Watch-points:**
- **Exact name matching** is the crux. Any option showing amber "no modifier cost" in the Inspector = a name mismatch. If mismatches are common, the next build is a **modifier-name mapping layer** (like POS item mapping) so names needn't be identical.
- The sample JSON showed "Milk Chocolate" **twice** on one item — if Flipdish genuinely sends duplicates, the engine counts both. Verify and dedupe if wrong.

---

## 7. Real numbers seen (London Road, a sample period)

- Theoretical COGS **£22,844** at **27.9%** of costed sales (healthy café food-cost %).
- Mapping coverage **72%**.
- Gap: **£6,839 unmapped** (no recipe mapping) + **£25,252 mapped but recipe has no cost yet**.
- Recorded COGS **£0** for that store/period (no manual EOD COGS, no invoices tagged) — which is exactly why theoretical adds visibility where there was none.

**Priority to improve coverage:** cost the recipes behind the £25,252 first (biggest impact; the breakdown view ranks them), then map the £6,839 (bulk auto-map).

---

## 8. File lineage (chronological; LATEST = current state)

All in the repo as `src/App.js` / `src/supabase.js`. Deploy bytes noted for verification.

| Order | File(s) | What it added |
|---|---|---|
| 1 | `App_COGS1` + `supabase_COGS1` | Stage 1: `computeStoreTheoreticalCogs`, P&L theoretical panel + coverage |
| 2 | `cogs_ignored_till_names_20260615.sql` + `App_MAPFILTER` + `supabase_MAPFILTER` | Ignore-names table; three-way filter; hide/restore |
| 3 | `App_BULKMAP` (App only) | Numbered rows, multi-select + bulk auto-map, wider dropdown |
| 4 | `supabase_IGNFIX` (sb only) | Fixed `ignoreTillName` onConflict → check-then-insert |
| 5 | `App_UNCOST` + `supabase_UNCOST` | Uncosted-products breakdown (ranked, with reason) |
| 6 | `App_ORDERSIM` + `supabase_ORDERSIM` | Order Simulator tab + `simulateFlipdishOrders` |
| 7 | `App_ORDERSIM2` (App only) | Fixed build error: OrderSimulator local `Stat` (was out of scope) |
| 8 | `supabase_SIMLINK` (sb only) | Match orders via explicit `flipdish_stores.store_id` link, not name |
| 9 | `App_SIMDIAG` + `supabase_SIMDIAG` | Diagnostics when no orders match (linked ids, window count, sample ids) |
| 10 | `App_INSPECTOR` (App only) | Order Inspector tab (nested structure, £0 flags, recipe-match, raw JSON) |
| 11 | **`App_MODB` + `supabase_MODB`** ← **CURRENT** | Option B: engine adds modifier costs from `orderItemOptions`; Inspector shows per-option modifier-match |

**Current deployed-target bytes:** `App_MODB_20260615.js` = **2,129,631** · `supabase_MODB_20260615.js` = **355,002**.

> Note: an unrelated **Spend dashboard** (`App_SPEND_20260615.js`) was built earlier and is on hold per request; its nav item may still be visible. Not part of the COGS thread.

---

## 9. Deploy procedure (every ship)

SQL (if any) runs FIRST in Supabase, then the matched JS pair.

```cmd
cd /d C:\dev\create-brands-dashboard\create-brands-dashboard
copy /Y "C:\Users\conta\Downloads\App_MODB_20260615.js" src\App.js
copy /Y "C:\Users\conta\Downloads\supabase_MODB_20260615.js" src\supabase.js
for %F in (src\App.js) do @echo %~zF bytes
for %F in (src\supabase.js) do @echo %~zF bytes
```

Confirm bytes match, then:

```cmd
git add src\App.js src\supabase.js
git commit -m "your message"
git push
```

Then in Vercel: **Redeploy without cache**, and in the browser **hard refresh (Ctrl+F5)** — the PWA service worker can hold a stale bundle, so if a new tab/feature doesn't appear, it's almost always a cached bundle, not a missing deploy.

**Quick "am I on the new bundle?" check:** the Mapping tab should show the three-way All/Mapped/Unmapped filter + numbered rows + checkboxes. If it still shows a single "Unmapped only" toggle, you're cached — hard refresh.

---

## 10. Code conventions (must follow)

- **Bare React hook/Fragment imports only:** `import {useState, useMemo, Fragment}` — NEVER `React.useState`, `React.Fragment`.
- `window.confirm()`, `.maybeSingle()`.
- After any `ALTER TABLE`: `SELECT pg_notify('pgrst','reload schema')`.
- App.js + supabase.js deploy as a **matched pair** when both change.
- **Local helpers are component-scoped.** A name defined inside one component is NOT visible in another (this bit us twice: `storeFilter`, `Stat`). The production build's `react/jsx-no-undef` catches cross-scope JSX component refs that a plain no-undef check misses.

### Validation protocol (run before every ship)
1. Babel parse (sourceType module, jsx) → must succeed.
2. `grep -c 'React\.use'` = 0 and `React.Fragment` = 0.
3. ESLint rules-of-hooks = 0.
4. ESLint no-undef = 0.
5. **ESLint `react/jsx-no-undef` = 0** (catches out-of-scope components — added after the `Stat` build failure).
6. **TDZ check:** flat config `no-use-before-define` ({variables:true, functions:false, classes:false}); diff against baseline; NEW hits must be empty. (Define consts before the functions that consume them; reorder if needed.)

---

## 11. OPEN ISSUES / NEXT STEPS

**Immediate (current blocker):**
- **`flipdish_orders` is sparse.** Only ~2 orders in recent windows across ALL sites. The Inspector already pulls all sites (no filter) with limit 500 — so this is a *data* problem, not a code one. The `flipdish-rms-sync` Edge Function likely only populates order-level data recently / for some channels, while `item_day_aggregates` (aggregate sales) is well-populated. **Action:** confirm how/whether `flipdish-rms-sync` writes `flipdish_orders`, for which stores/channels and date range. Until orders are flowing, the Simulator/Inspector have little to chew on (but theoretical COGS via `item_day_aggregates` is unaffected and works).
- **Manchester store-link mismatch:** Manchester is linked to Flipdish id `73680`, but its orders carry store id `73687` (a different Manchester channel row, not linked). **Fix in DATA, not code:** link `73687` to Manchester in the admin Flipdish/RMS store linking (the `linkFlipdishStore` action), OR correct the existing link. The Simulator matches via the explicit link, so it'll work once linked.

**COGS data quality (ongoing):**
- Cost the **£25,252** of mapped-but-uncosted recipes (breakdown view ranks them by sales).
- Map the **£6,839** unmapped sales (bulk auto-map).
- Build topping **modifiers** named to match Flipdish options (Option B) so £0 toppings get costed.

**Possible follow-on builds (not yet done):**
- **Modifier-name mapping layer** (if Flipdish option names don't match modifier names cleanly) — mirror the POS item mapping.
- **COGS Stage 2** (theoretical → P&L primary; invoices → purchases; kill double-count) and **Stage 3** (variance view).
- The big **"Unmapped: 417"** stat card on the Mapping screen may still count hidden names (the list + coverage exclude them; the top stat card calc may be separate — verify and align).
- Possible **more-forgiving simulator match** (by brand) when exact store id isn't linked — offered, deferred.
- Dedupe repeated options if Flipdish genuinely sends duplicates.

---

## 12. One-paragraph summary for a fresh chat

> Building store-level COGS for a multi-site café group (Chocoberry/Create Brands) on a React/Supabase/Vercel dashboard. CK is a separate entity — ignore CK costing for store COGS. Stores have a costed item list but NO stock quantities, so we use **theoretical COGS** (mapped POS sales × recipe cost). Stage 1 is built & deployed: `computeStoreTheoreticalCogs` shows theoretical COGS alongside the existing recorded figure on the P&L with a coverage indicator; recorded COGS still = manual EOD + invoices (double-count to be resolved in Stage 2). The recipe layer (`cogs_ingredients/preps/modifiers/products` + `cogs_pos_mappings`) and a cost rollup exist. Mapping screen has filter + hide/restore + bulk auto-map. An uncosted-products breakdown ranks recipes to fix. An Order Simulator and Order Inspector replay/inspect real Flipdish orders; we chose **Option B** for toppings (cost modifiers from `orderItemOptions`, matched by name, so £0 included toppings still add cost). Current files: `App_MODB_20260615.js` (2,129,631) + `supabase_MODB_20260615.js` (355,002). Blockers: `flipdish_orders` table is sparse (data/sync issue, not code), and Manchester's Flipdish store link points at 73680 but orders carry 73687 (fix in admin). Follow strict conventions: bare hook imports, matched-pair deploys, and the 6-step validation incl. `react/jsx-no-undef` and TDZ checks.
