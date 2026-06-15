# Create Brands Dashboard — Feature Handout

**Release date:** 15 June 2026
**Scope:** Accounts / Finance management system and a full Scheduling redesign

This handout documents every feature and fix shipped in this development cycle. It is written for operators, managers and HQ staff, with technical notes where useful for future development.

---

## Table of contents

1. [Accounts / Finance system](#1-accounts--finance-system)
2. [Scheduling](#2-scheduling)
3. [Other changes](#3-other-changes)
4. [How things work — quick reference](#4-how-things-work--quick-reference)
5. [Notes, caveats and future work](#5-notes-caveats-and-future-work)

---

## 1. Accounts / Finance system

A management-accounting layer that sits **alongside** the accountant. Statutory filing, VAT returns and the balance sheet deliberately remain with the accountant; this system gives a live operational view of the numbers.

### Where to find it
Pick the **Finance** entity tile from the entity picker. The Accounts hub is group-wide (all stores/brands) and visible to owner and HQ staff.

### Features

- **Accounts hub with tabs** — P&L, Bank, Invoices, Suppliers, Reconcile and Export are consolidated into one tabbed page rather than separate navigation items.
- **P&L dashboard** — revenue minus cost of sales, labour and overheads, per store and group-wide, with week/month and ex/inc-VAT toggles. Spend now breaks down **by category**, including invoice spend (not just one lump in cost of sales).
- **Bank** — import statements, per-store bank accounts, transaction categorisation with auto-tagging rules.
- **Invoices (accounts-grade)**
  - AI extraction of line items from a photo or PDF.
  - Category, payment status (unpaid / partial / paid), due date and automatic paid-date.
  - Summary cards: total ex-VAT, outstanding, overdue, VAT.
  - Search and filters (supplier, status, payment state, store).
  - Bulk multi-file upload and duplicate detection (same supplier + invoice number).
  - Fullscreen review mode — scan image and extracted lines side by side.
  - List capacity raised to 1,000.
- **Reconciliation (Stage 3)**
  - Auto-matches exact 1:1 bank lines to invoices, Flipdish payouts or payroll runs.
  - Manual batch-builder with a live running total that turns green when ticked items sum to the bank amount (handles one bank line matched to many items).
  - Matching a bank line to an invoice **auto-marks that invoice paid** (closed loop).
- **EOD ↔ Flipdish reconciliation** — side-by-side comparison of EOD figures against Flipdish daily aggregates (gross, card, cash, tax, discounts) with manual approval.
- **Suppliers — aged payables** — what is owed to each supplier, aged into 0–30 / 31–60 / 61–90 / 90+ day buckets, with expandable per-supplier invoice lists.
- **Export for accountant** — date-ranged CSV exports of bank transactions, invoices and a VAT summary.
- **Editable categories + F&B pack** — inline editing of category name, type and P&L line; a grouped chart-of-accounts view; richer hospitality P&L lines (occupancy, marketing, admin, finance and more); and a one-tap button to load a pack of ~45 hospitality categories.

---

## 2. Scheduling

The scheduling experience was rebuilt this cycle — from data fixes through to a full visual redesign.

### 2.1 Cross-store staff assignment
Previously you could only schedule staff already assigned to a store. You can now bring in staff from other stores, with a prompt asking whether to **also permanently assign** them to that store — your choice each time, never automatic.

### 2.2 Availability on the grid
The red/green availability strip now shows the actual **time** (for example `09:00–17:00`, `All day`, or `Off 12:00–14:00`) rather than just a coloured line, with the full reason in the hover tooltip.

### 2.3 Employee-side fixes
- The employee's **My Schedule** now shows the **store name** on each shift.
- Fixed **multiple shifts per day** not showing — the view had been brand-filtered, hiding cross-store and split shifts. It now shows all of an employee's shifts that day, sorted by start time.

### 2.4 Manager availability scoping
Managers now only see availability for employees in **their own stores** (HQ still sees everything). Legacy entries with no store assigned remain visible so nothing silently disappears.

### 2.5 Second shift on the same day
The shift form had been blocking any second shift on a day an employee already worked. It now only blocks on an **actual time overlap** — a non-overlapping morning-plus-evening split saves, with a gentle split-shift note; genuine overlaps are still flagged in red.

### 2.6 Cross-store shift bug (Riya Poonattu)
Two shifts at two stores were not both showing. The root cause was traced from the clue that **deleting one shift made the other appear**: the primary shift ID had no random suffix, so two shifts created close together collided on the same ID and the list (keyed by ID) rendered only one.

**Fix:** shift IDs are now always unique, and shift matching was made resilient so an employee's shifts show even across duplicate staff records (matched by email).

### 2.7 Availability picker — store, not location
Removed the location/brand picker from the employee availability form (availability applies to all of an employee's stores). The manager Add-availability form now uses a **store picker** scoped to the manager's stores, and the availability tracker filters and badges by store rather than brand.

### 2.8 Full week-grid redesign
A clean, scannable grid:
- Table grid with column dividers and row separators instead of floating grey blocks.
- Employee rows with avatar, name, role underneath, and a running **hours and cost** total.
- Day-header columns showing the date, headcount (`N on shift`) and labour percentage.
- Availability shown as a coloured dot and short label per cell, with a faint tint and a full hover tooltip (status, window, reason).
- Shift blocks as rounded cards with a coloured left bar, the time and the shift name.
- A clean dashed **+** button on hover in empty cells.
- Daily totals footer (hours, wages, sales).

### 2.9 Cross-store "already scheduled" indicator
When viewing one store's rota, an employee already scheduled at **another store** that day shows a greyed, dashed block labelled with the other store — so you can see they are working elsewhere before double-booking, while still allowing you to add a shift if you intend to.

### 2.10 Layout cleanup
- Removed the duplicate right-hand total column (hours and cost are shown under the name instead).
- Moved the top summary tiles (hours, wages, labour percentage) to the **bottom**, so the rota starts at the top of the screen for more visible area.

### 2.11 Staff picker instead of "show all"
Replaced the show-all-staff toggle — which dumped every employee onto the rota — with a **searchable multi-select picker** to add specific people, plus a per-row remove control. The picker shows each person's store(s).

### 2.12 Department and period structure
- Rota rows are grouped under **department headings** (FOH, BOH, Kitchen, and so on).
- Added staff appear in a separate **"Other stores staff"** section at the bottom; only those can be removed (your own store staff cannot be removed from their rota).
- Brightened the previously near-invisible department heading bands.
- Each department is split into **Morning** and **Evening** groups with divider lines.
- The period is **draggable** — drag any employee between Morning and Evening regardless of their role name (the role only sets the default). The assignment persists per store.

### 2.13 Drag-to-reorder
A visible grip handle on every row lets you **drag staff up and down**, working even when the week is locked. The order persists across reloads, per store.

---

## 3. Other changes

- **Ops Setup → Structure** now shows **all stores across all brands** for owner/HQ (it had been scoped to one brand), so departments and roles can be managed for any store.
- **Service worker / push notifications** — the share-target service-worker deployment was fixed, and push delivery on Android was resolved as an OS-level notification setting rather than a code issue.

---

## 4. How things work — quick reference

| Task | Where | Notes |
|------|-------|-------|
| View P&L / accounts | Finance tile → Accounts | Owner / HQ, group-wide |
| Match a bank payment | Finance → Reconcile | Auto 1:1 + manual batch builder |
| See what you owe a supplier | Finance → Suppliers | Aged 0–30 / 30–60 / 60–90 / 90+ |
| Export for accountant | Finance → Export | Transactions, invoices, VAT summary CSV |
| Add staff to a rota | Schedule → Add staff | Searchable multi-select picker |
| Move someone Morning ↔ Evening | Schedule grid | Drag the row to the other group |
| Reorder staff | Schedule grid | Drag the grip handle (saves per store) |
| Manage departments / roles | Ops Setup → Structure | All stores visible to owner/HQ |

---

## 5. Notes, caveats and future work

- **Per-device persistence** — the schedule drag order and the Morning/Evening assignments are saved per store **in the browser**. They survive reloads on that device but do not sync across devices or to other managers. These can be moved to the database to share group-wide if required.
- **Period grouping is organisational** — the Morning/Evening split reflects how you think about staff on the rota; it does not change the actual shift times you assign.
- **Management vs statutory accounting** — the Accounts system is a live management view. Statutory filing, VAT returns and the balance sheet deliberately remain with the accountant.
- **Cross-store indicator** relies on shifts carrying a store ID; recent shifts do, but very old shifts saved with only a brand ID will not appear as cross-store blocks.

---

*Document maintained alongside the Create Brands Dashboard codebase. Update with each release cycle.*
