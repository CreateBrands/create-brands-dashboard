# Create Brands — System Architecture & POS Build Plan

*One backend, many front-ends. This doc is the reference for how the
dashboard, customer app, phone agent and new POS fit together, and the
phased plan to build the POS without creating problems later.*

---

## 1. The core principle

**One Supabase backend (`qtjsdbasoouslcpinqhu`) serves every surface.**
The POS is not a new system — it is another front-end onto the same
tables. The four surfaces are just different windows onto one database:

| Surface | Who uses it | Runs on | Auth |
|---|---|---|---|
| Dashboard (`create-brands-dashboard`) | Ops / back-office | Desktop browser | app-side roles (users table) |
| Customer app (`chocoberry-menu` → public) | Guests | Their phones | anonymous |
| Phone agent (Retell + `phone-tools`) | Callers | Phone line | secret header |
| **POS (new)** | Store staff | **Sunmi Android terminals** | **staff PINs** |

### The one non-negotiable rule
**Every order — POS, web, or phone — is a row in the same `menu_orders`
table**, tagged with an `order_channel` column (`pos` / `web` / `phone`).

Get this right and the printer, sales reports, and "today's takings" all
work across every channel automatically, forever. A POS with its own
separate order store is the mistake that forces a painful migration
later. The POS becomes just another writer into the pipeline you already
built for the phone agent.

---

## 2. Repo structure

Three repos, one shared backend. The **`chocoberry-menu` repo needs a
tidy-up first** — it currently has two `src` folders and stray files
(`App-WELCOMEFIX.jsx`), which will cause "why isn't my change showing"
once a fourth app lives there.

```
create-brands-dashboard/        (existing — ops, unchanged)

chocoberry-menu/                 (existing — restructure into 3 entry points)
  src/
    shared/                      ← the spine every surface imports
      supabase.js                  client + keys
      api.js                       callAdmin / callPos PIN helpers
      theme.js                     the T design tokens
      types.js
    public/                      customer menu + ordering (App.jsx today)
    admin/                       menu admin + printers (Admin.jsx today)
    pos/                         NEW — the till
  supabase/functions/
    admin-api/                   menu + printer writes (PIN)
    pos-api/                     NEW — till operations (PIN)
    sunmi-print/                 existing — printing pipeline
    phone-tools/                 existing — phone agent tools
```

**Why separate entry points, not one app with routes:** the POS and the
customer app have opposite needs. The POS is a logged-in, always-on,
touch-optimised terminal staff use for hours; the customer app is
anonymous, load-once, mobile. Separate Vite builds mean the customer
never downloads till code and vice-versa, and the auth models don't
fight. This is how Square/Toast/Lightspeed are structured under the hood.

**Why one repo, not three:** the three menu-project surfaces share the
Supabase client, design tokens, and types. One repo + `shared/` folder =
no duplication, one deploy pipeline, but each surface builds its own
bundle.

---

## 3. Data model

### Reuse (already exist)
- `menu_locations` — stores/branches
- `menu_categories`, `menu_items`, `menu_modifiers`, `menu_modifier_groups`,
  `menu_item_modifiers` — the menu
- `menu_orders`, `menu_order_items` — **all** orders, all channels
- `printers` — printer registry (store_id, sn, shop_id, label, active,
  location_id)

### Add
- `menu_orders.order_channel` (text: `pos` / `web` / `phone`) — the single
  most important addition; tags every order by where it came from
- `pos_staff` (id, location_id, name, pin_hash, role, active) — till logins
- `pos_payments` (id, order_id → menu_orders, method [cash/card/teya],
  amount, status, meta) — added at the payments phase
- `pos_sessions` / cash drawer tracking — added at the cash phase

RLS stays off (your established pattern); access is gated app-side and via
PIN-checked edge functions.

---

## 4. Edge functions

- **`admin-api`** (exists) — menu writes + **printer actions** (being added
  now: printer_list/bind/test/status/update/remove). PIN-gated.
- **`pos-api`** (new) — the till's write path. Same PIN-gate pattern as
  admin-api. Actions: `staff_login`, `create_order` (writes menu_orders
  with order_channel='pos' → fires printer), `take_payment`, `open_drawer`,
  `session_report`, etc. Service-role key stays server-side.
- **`sunmi-print`** (exists) — the print pipeline. POS orders print through
  it exactly like phone/web orders. No change needed.
- **`phone-tools`** (exists) — phone agent. Unchanged.

**Security model, consistent everywhere:** the browser/terminal never holds
the service-role key. It sends a PIN + action to an edge function which
verifies and performs the write. Identical to how Admin.jsx works today.

---

## 5. Build phases

Each phase ships and earns before the next — the POS is a big build, so it
is deliberately staged.

### Phase 0 — Repo tidy-up + shared/ extraction
Collapse the duplicate `src` folders to one, remove stray files, pull the
Supabase client / theme / api helpers into `src/shared/`. Nothing
user-facing changes; this is the foundation that stops the four apps
colliding. *Confirm which src Vercel builds (vercel.json) before moving
anything.*

### Phase 1 — Printers screen (in progress)
A Printers tab in Admin.jsx + printer actions in admin-api. Proves the
admin-api pattern that pos-api will copy. Delivers: printer list with live
status dots, Add (manual SN + QR scan), Test/Edit/Remove. *(Waiting on the
admin-api/index.ts file to finish.)*

### Phase 2 — `order_channel` + POS foundations
Add `order_channel` to menu_orders (backfill existing rows: web/phone).
Create `pos_staff` table. Build `pos-api` with `staff_login`. Build the POS
shell: PIN login on the Sunmi terminal, loads the store's menu.

### Phase 3 — POS takes orders + prints
The till core: tap items → build order → send. Writes menu_orders
(order_channel='pos') + menu_order_items, which fires the existing printer
webhook → kitchen ticket. At this point the POS is a working order-taker
reusing the entire pipeline you already built.

### Phase 4 — Payments (Teya)
Add `pos_payments`. Integrate Teya — Pay-by-Link or terminal per the Teya
scoping notes. Cash + card, order marked paid, receipt prints.

### Phase 5 — Cash management + reporting
Drawer sessions, cash reconciliation, X/Z reports — and because every
order (pos/web/phone) is in one table, store takings roll up across all
channels in the dashboard automatically.

---

## 6. What this structure buys you

- **One source of truth for sales** — every channel writes menu_orders, so
  reporting, printing, and takings never fragment.
- **The printer pipeline is already done** — POS orders print with zero new
  printing work.
- **Consistent security** — PIN + edge function everywhere; service key
  never in a browser or terminal.
- **Scales to all stores** — same Supabase, add a printer row + pos_staff
  rows per store; no per-store rebuild.
- **Each surface stays lean** — separate bundles, no cross-contamination
  between a customer phone and a staff till.

---

## 7. Immediate next actions

1. Confirm which `src` in chocoberry-menu is the live build (vercel.json).
2. Get `admin-api/index.ts` to Claude to finish the **Printers screen**
   (Phase 1).
3. Then Phase 0 tidy-up, then Phase 2 onward.

*Teya payment integration is scoped separately (see teya-payments notes) —
it slots into Phase 4. Estimates there: Pay-by-Link a few days, hosted
checkout 1–2 weeks, physical terminal 3–5 weeks; commercial gate is Teya's
per-transaction quote.*
