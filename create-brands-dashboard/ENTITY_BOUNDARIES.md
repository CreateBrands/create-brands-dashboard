# Entity Boundaries — CK, Distribution, Stores

**Purpose:** Stop conflating the three entities during design and development.
Read this before touching any inventory / stock / ordering code.

---

## The core rule

**CK, Distribution, and Stores are three INDEPENDENT entities.**
Each manages its own stock and inventory separately.

- **There is NO link between Stores and CK.**
- Everything flows through **Distribution**.
- CK → sends product → Distribution → dispatches → Stores.
- Stores never reference CK directly. Ever.

If you find yourself reasoning about "the store's CK items" or
"CK stock at store level" — **stop. That relationship does not exist.**

---

## The three entities and their tables

### 1. Central Kitchen (CK)
Produces goods. Manages its own ingredients & production stock.
- Tables: `cogs_ck_items` (ingredients), `ck_goods_in`, `ck_products`,
  `ck_dispatches`, `ck_dispatch_lines`, `ck_counts`, `ck_count_lines`,
  `ck_production_*`, `ck_distribution_stock`.
- CK's stock reconciliation writes to `ck_goods_in`.

### 2. Distribution (Dist)
Holds/buys/dispatches. The HUB everything routes through.
- Tables: `dist_items` (the 465-item catalogue everyone orders from),
  `dist_stock_movements`, `dist_sales_orders`, `dist_picks`, `dist_dispatches`,
  `dist_goods_receipts`, `dist_invoices`, `dist_batches`, etc.
- Dist stock = `SUM(dist_stock_movements.qty)` — never stored, always computed.
- `dist_items.item_type` = 'warehouse' | 'fresh' | (CK-supplied) — how Dist
  sources the item, NOT a link to CK's tables.

### 3. Stores
Order from Dist. Consume via COGS. Count their own stock.
- Tables: `cogs_store_items` (master identity), `cogs_store_item_settings`
  (per-store cost/pack overrides), `cogs_stock_counts` + `cogs_stock_count_lines`
  (per-store counts), `cogs_product_components` (recipes).
- Store stock/cost is STORE-OWNED and store-specific.

---

## Where CK and Store SHARE code (the confusion source)

Some functions serve BOTH CK and Store via a `scope` parameter. **This is
shared code, not a CK-trace to delete. Deleting CK branches BREAKS CK.**

- `bulkAddInventory(scope, ...)` / `deleteInventoryItem(scope, ...)`
  → `scope === "ck" ? cogs_ck_items : cogs_store_items`
- `cogs_stock_count_lines.item_scope` = 'ck' | 'store'
- `finaliseStockCount(...)` — processes a count, but its reconcile-to-stock
  step **only runs for `item_scope === 'ck'` lines** (writes to `ck_goods_in`).
  **Store-scoped lines are recorded but NOT reconciled to any live store stock.**

**When working on STORE features:** only touch `item_scope === 'store'`
paths. Leave the `'ck'` branches alone — they belong to CK.

---

## Current state of STORE inventory (CK excluded)

What EXISTS for stores:
- Master item list + per-store cost overrides ✓
- Store can record a stock count (qty + cost per item) ✓
- Store orders from Dist ✓; Dist delivers ✓

What is MISSING for stores (the real gap — nothing to do with CK):
- No store stock table with a **running quantity**.
- Finalising a store count does **not** write counted qty to any live store stock
  (the reconcile step is CK-only).
- Delivery from Dist does **not** increase store stock.
- COGS does **not** decrease store stock.
- No stored `dist_item_id` link on store items (connected by NAME only).

---

## The item-identity rule (traceability)

One item = one name, kept identical at every stage, so a scan at any point
(order → pick → dispatch → invoice → delivery → store) maps to the same item.
- Within Distribution: the same `dist_items.id` flows through the whole
  order→pick→dispatch→invoice pipeline. ✓
- Store ↔ Dist: currently matched by NAME (289 exact matches + 118 fresh added
  from store names). A stored `dist_item_id` link does not yet exist.

---

## TL;DR for every future conversation

1. Three separate stocks: CK, Dist, Store. No CK↔Store link.
2. Everything routes through Distribution.
3. CK & Store share scope-switched functions — never delete CK branches.
4. Store inventory today = record-only counts; no running/perpetual stock yet.
5. That store-stock build is store-only — no CK involvement.
