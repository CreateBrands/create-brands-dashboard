// ─── supabase.js ─────────────────────────────────────────────────────────────
// Complete file — existing financial functions + new OpsHub functions.
// Replace your current supabase.js with this file entirely.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

// ── EMPLOYEE PASSWORD AUTH (Supabase Auth) ───────────────────────────────────
// Website employee login by email + password, backed by Supabase Auth so we
// never store passwords ourselves. On success we look up the matching ops_team
// record by email and return it so the app can build its currentUser object.
// (The manager/owner login is separate and unchanged. The kiosk stays on PIN.)

// Sign in an employee. Returns { ok, opsMember? , error? }.
export async function employeeSignIn(email, password) {
  const e = (email || "").trim().toLowerCase();
  if (!e || !password) return { ok: false, error: "Enter your email and password." };
  const { data, error } = await supabase.auth.signInWithPassword({ email: e, password });
  if (error) return { ok: false, error: error.message || "Invalid email or password." };
  // Find the ops_team member whose email matches the signed-in auth user.
  const { data: rows, error: qErr } = await supabase
    .from("ops_team").select("*").ilike("email", e).limit(1);
  if (qErr) return { ok: false, error: qErr.message };
  if (!rows || rows.length === 0) {
    // Authenticated but no matching employee record — sign back out to avoid a
    // dangling session, and report clearly.
    await supabase.auth.signOut();
    return { ok: false, error: "No employee record is linked to this email. Ask your manager." };
  }
  return { ok: true, opsMember: dbOpsTeamToApp(rows[0]) };
}

// Send a password-reset email (Supabase handles the secure token + link).
export async function employeeResetPassword(email) {
  const e = (email || "").trim().toLowerCase();
  if (!e) return { ok: false, error: "Enter your email first." };
  const { error } = await supabase.auth.resetPasswordForEmail(e, {
    redirectTo: `${window.location.origin}/reset`,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Set a new password for the currently-authenticated user (used on the reset
// landing page after they click the email link).
export async function employeeSetPassword(newPassword) {
  if (!newPassword || newPassword.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Sign out of Supabase Auth (call alongside the app's own logout).
export async function employeeAuthSignOut() {
  try { await supabase.auth.signOut(); } catch { /* ignore */ }
}

// ── BRANDS ───────────────────────────────────────────────────────────────────
export async function fetchBrands() {
  const { data, error } = await supabase.from("brands").select("*").order("name");
  if (error) throw error;
  return data.map(dbBrandToApp);
}
export async function insertBrand(brand) {
  const { data, error } = await supabase.from("brands").insert(appBrandToDb(brand)).select().single();
  if (error) throw error;
  return dbBrandToApp(data);
}
// ════════════════════════════════════════════════════════════════════════════
// UPSERT VS PARTIAL UPDATE — pattern reference
// ════════════════════════════════════════════════════════════════════════════
// All `upsertX(item)` functions below use Supabase's `.upsert()`. This is
// INSERT ... ON CONFLICT (id) DO UPDATE — useful when you don't know in
// advance whether the row exists. But it has a footgun:
//
//   Supabase enforces ALL NOT NULL constraints on upsert, because it must
//   be ready to INSERT even if the row already exists. So a payload like
//   { id, status: 'done' } will FAIL with "null value in column X violates
//   not-null constraint" — even though we're really updating an existing
//   row that already has X set.
//
// The workaround: ALWAYS PASS THE COMPLETE OBJECT to upsert*. Spread the
// existing row, override the fields you want to change, then pass the
// spread result:
//
//   ✓ SAFE:    await updateIssue({ ...issue, status: 'done' })
//   ✗ UNSAFE:  await updateIssue({ id: issue.id, status: 'done' })
//
// If you need true partial-update semantics (e.g. an "edit one field at a
// time" UI), DO NOT use the upsert path. Add a sibling function that uses
// `.update().eq(...)` directly — see `updateOpsTeamMember` for the
// canonical example. Also requires the mapper to be partial-aware (only
// include fields that are actually present in the input).
//
// Mappers known to be partial-aware (safe for partial updates):
//   - appApplicationToDb  (fixed mid-session after critical data-loss bug)
//   - appOpsTeamToDb      (fixed during mapper audit)
//   - appStoreToDb        (was already correct)
//   - appStoreRoleToDb    (was already correct)
//   - appStoreDepartmentToDb (was already correct)
//
// Mappers NOT confirmed partial-aware (UNSAFE for partial updates without
// audit first): appBrandToDb, appUserToDb, appIssueToDb, appTempUnitToDb,
// appCleanTaskToDb, appAssignmentToDb, appEntryToDb, appAuditToDb,
// appMsgToDb, appAvailToDb, appScheduleToDb, appPunchToDb. If you need to
// partial-update any of these tables, audit the mapper first.
// ════════════════════════════════════════════════════════════════════════════

export async function upsertBrand(brand) {
  const { data, error } = await supabase.from("brands").upsert(appBrandToDb(brand), { onConflict: "id" }).select().single();
  if (error) throw error;
  return dbBrandToApp(data);
}
export async function removeBrand(id) {
  const { error } = await supabase.from("brands").delete().eq("id", id);
  if (error) throw error;
}

// ── USERS ────────────────────────────────────────────────────────────────────
export async function fetchUsers() {
  const { data, error } = await supabase.from("users").select("*").order("name");
  if (error) throw error;
  return data.map(dbUserToApp);
}
export async function insertUser(user) {
  const { data, error } = await supabase.from("users").insert(appUserToDb(user)).select().single();
  if (error) throw error;
  return dbUserToApp(data);
}
export async function upsertUser(user) {
  const { data, error } = await supabase.from("users").upsert(appUserToDb(user), { onConflict: "id" }).select().single();
  if (error) throw error;
  return dbUserToApp(data);
}
export async function removeUser(id) {
  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) throw error;
}

// ── EOD ENTRIES ──────────────────────────────────────────────────────────────
export async function fetchEntries() {
  const { data, error } = await supabase.from("eod_entries").select("*").order("date");
  if (error) throw error;
  return data.map(dbEntryToApp);
}
export async function upsertEntry(entry) {
  const { data, error } = await supabase.from("eod_entries").upsert(appEntryToDb(entry), { onConflict: "id" }).select().single();
  if (error) throw error;
  return dbEntryToApp(data);
}
export async function deleteEntry(id) {
  const { error } = await supabase.from("eod_entries").delete().eq("id", id);
  if (error) throw error;
  return id;
}
export async function upsertEntries(entries) {
  const { data, error } = await supabase
    .from("eod_entries")
    .upsert(entries.map(appEntryToDb), { onConflict: "id", ignoreDuplicates: false })
    .select();
  if (error) throw error;
  return data.map(dbEntryToApp);
}

// ── ISSUES ───────────────────────────────────────────────────────────────────
export async function fetchIssues() {
  const { data, error } = await supabase.from("issues").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(dbIssueToApp);
}
export async function insertIssue(issue) {
  const { data, error } = await supabase.from("issues").insert(appIssueToDb(issue)).select().single();
  if (error) throw error;
  return dbIssueToApp(data);
}
export async function upsertIssue(issue) {
  const { data, error } = await supabase.from("issues").upsert(appIssueToDb(issue), { onConflict: "id" }).select().single();
  if (error) throw error;
  return dbIssueToApp(data);
}
export async function removeIssue(id) {
  const { error } = await supabase.from("issues").delete().eq("id", id);
  if (error) throw error;
}

// ── MAINTENANCE TICKETS ──────────────────────────────────────────────────────
export async function fetchMaintenanceTickets(brandId) {
  let q = supabase.from("maintenance_tickets").select("*").order("created_at", { ascending: false });
  if (brandId) q = q.eq("brand_id", brandId);
  const { data, error } = await q;
  if (error) throw error;
  return data.map(dbTicketToApp);
}
export async function insertMaintenanceTicket(ticket) {
  const { data, error } = await supabase.from("maintenance_tickets").insert(appTicketToDb(ticket)).select().single();
  if (error) throw error;
  return dbTicketToApp(data);
}
export async function updateMaintenanceTicket(ticket) {
  const { data, error } = await supabase
    .from("maintenance_tickets")
    .update({ done: ticket.done, text: ticket.text, priority: ticket.priority, updated_at: new Date().toISOString() })
    .eq("id", ticket.id).select().single();
  if (error) throw error;
  return dbTicketToApp(data);
}
export async function deleteMaintenanceTicket(id) {
  const { error } = await supabase.from("maintenance_tickets").delete().eq("id", id);
  if (error) throw error;
}

// ── CHECKLISTS ───────────────────────────────────────────────────────────────
export async function fetchChecklists() {
  const { data: cls, error: e1 } = await supabase.from("checklists").select("*").order("sort_order");
  if (e1) throw e1;
  const { data: items, error: e2 } = await supabase.from("checklist_items").select("*").order("sort_order");
  if (e2) throw e2;
  return cls.map(cl => ({
    id: cl.id, name: cl.name, shift: cl.shift, defaultRole: cl.default_role,
    color: cl.color, sortOrder: cl.sort_order,
    storeId: cl.store_id || null,
    brandId: cl.brand_id || null,
    items: items.filter(i => i.checklist_id === cl.id).map(i => ({ id: i.id, text: i.text, guide: i.guide, sortOrder: i.sort_order })),
  }));
}
export async function upsertChecklist(cl) {
  const { data, error } = await supabase.from("checklists").upsert({
    id: cl.id, name: cl.name, shift: cl.shift, default_role: cl.defaultRole || "",
    color: cl.color || "indigo", sort_order: cl.sortOrder || 0,
    // Stage 7: per-store checklists. store_id is NOT NULL on the DB so
    // callers MUST set it. brand_id is derived from the store for legacy
    // code that still filters by brand.
    store_id: cl.storeId, brand_id: cl.brandId || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" }).select().single();
  if (error) throw error;
  // Replace items — delete existing then insert fresh
  const { error: delErr } = await supabase.from("checklist_items").delete().eq("checklist_id", cl.id);
  if (delErr) throw delErr;
  if (cl.items?.length) {
    const { error: insErr } = await supabase.from("checklist_items").insert(
      cl.items.map((item, idx) => ({ id: item.id, checklist_id: cl.id, text: item.text, guide: item.guide || "", sort_order: idx }))
    );
    if (insErr) throw insErr;
  }
  return {
    id: data.id, name: data.name, shift: data.shift,
    defaultRole: data.default_role, color: data.color,
    sortOrder: data.sort_order,
    storeId: data.store_id || null,
    brandId: data.brand_id || null,
    items: cl.items || [],
  };
}
export async function removeChecklist(id) {
  const { error } = await supabase.from("checklists").delete().eq("id", id);
  if (error) throw error;
}

// ── TEMP UNITS ───────────────────────────────────────────────────────────────
export async function fetchTempUnits() {
  const { data, error } = await supabase.from("temp_units").select("*").order("brand_id");
  if (error) throw error;
  return data.map(dbTempUnitToApp);
}
export async function upsertTempUnit(unit) {
  const { data, error } = await supabase.from("temp_units").upsert(appTempUnitToDb(unit), { onConflict: "id" }).select().single();
  if (error) throw error;
  return dbTempUnitToApp(data);
}
export async function removeTempUnit(id) {
  const { error } = await supabase.from("temp_units").delete().eq("id", id);
  if (error) throw error;
}

// ── CLEANING TASKS ───────────────────────────────────────────────────────────
export async function fetchCleaningTasks() {
  const { data, error } = await supabase.from("cleaning_tasks").select("*").order("area");
  if (error) throw error;
  return data.map(dbCleanTaskToApp);
}
export async function upsertCleaningTask(task) {
  const { data, error } = await supabase.from("cleaning_tasks").upsert(appCleanTaskToDb(task), { onConflict: "id" }).select().single();
  if (error) throw error;
  return dbCleanTaskToApp(data);
}
export async function removeCleaningTask(id) {
  const { error } = await supabase.from("cleaning_tasks").delete().eq("id", id);
  if (error) throw error;
}

// ── ASSIGNMENTS ──────────────────────────────────────────────────────────────
export async function fetchAssignments() {
  const { data, error } = await supabase.from("assignments").select("*").order("brand_id");
  if (error) throw error;
  return data.map(dbAssignmentToApp);
}
export async function upsertAssignment(a) {
  const { data, error } = await supabase.from("assignments").upsert(appAssignmentToDb(a), { onConflict: "id" }).select().single();
  if (error) throw error;
  return dbAssignmentToApp(data);
}
export async function removeAssignment(id) {
  const { error } = await supabase.from("assignments").delete().eq("id", id);
  if (error) throw error;
}

// ── OPS TEAM ─────────────────────────────────────────────────────────────────
export async function fetchOpsTeam() {
  const { data, error } = await supabase.from("ops_team").select("*").order("brand_id");
  if (error) throw error;
  return data.map(dbOpsTeamToApp);
}
export async function upsertOpsTeamMember(m) {
  const { data, error } = await supabase.from("ops_team").upsert(appOpsTeamToDb(m), { onConflict: "id" }).select().single();
  if (error) throw error;
  return dbOpsTeamToApp(data);
}

// True partial-update for existing employees. Used by the slice 6 profile
// page tabs (Personal & HR, Job Assignment) which only want to touch
// SOME columns and leave others alone.
//
// Why not use upsertOpsTeamMember? Supabase's upsert enforces all NOT NULL
// constraints because it doesn't know in advance whether the row exists.
// Sending a partial payload like { hire_date, email, phone } without
// brand_id would fail because brand_id is NOT NULL — even though we're
// really updating an existing row that already has a brand_id.
//
// Uses the same RLS-tolerant pattern as updateStoreRole / updateApplication
// (drops .single(), refetches if SELECT-after-UPDATE returns empty).
export async function updateOpsTeamMember(id, patch) {
  if (!id) throw new Error("id required");
  const row = appOpsTeamToDb({ ...patch });
  // Don't try to UPDATE the primary key itself
  delete row.id;
  const { data, error } = await supabase
    .from("ops_team")
    .update(row)
    .eq("id", id)
    .select();
  if (error) throw error;
  if (data && data.length > 0) return dbOpsTeamToApp(data[0]);
  // UPDATE worked but SELECT returned nothing — refetch defensively
  const { data: fresh, error: fetchErr } = await supabase
    .from("ops_team").select("*").eq("id", id).maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!fresh) throw new Error(`Employee ${id} updated but could not be retrieved.`);
  return dbOpsTeamToApp(fresh);
}
export async function removeOpsTeamMember(id) {
  const { error } = await supabase.from("ops_team").delete().eq("id", id);
  if (error) throw error;
}

// ── TEMP LOGS ────────────────────────────────────────────────────────────────
export async function fetchTempLogs() {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const { data, error } = await supabase.from("temp_logs").select("*")
    .gte("date", cutoff.toISOString().split("T")[0])
    .order("date", { ascending: false }).order("time", { ascending: false }).limit(500);
  if (error) throw error;
  return data.map(dbTempLogToApp);
}
export async function insertTempLog(log) {
  const { data, error } = await supabase.from("temp_logs").insert(appTempLogToDb(log)).select().single();
  if (error) throw error;
  return dbTempLogToApp(data);
}

// ── DELIVERIES ───────────────────────────────────────────────────────────────
export async function fetchDeliveries() {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const { data, error } = await supabase.from("deliveries").select("*")
    .gte("date", cutoff.toISOString().split("T")[0])
    .order("date", { ascending: false }).limit(500);
  if (error) throw error;
  return data.map(dbDeliveryToApp);
}
export async function insertDelivery(d) {
  const { data, error } = await supabase.from("deliveries").insert(appDeliveryToDb(d)).select().single();
  if (error) throw error;
  return dbDeliveryToApp(data);
}

// ── CHECKLIST STATES ─────────────────────────────────────────────────────────
export async function fetchChecklistStates() {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const { data, error } = await supabase.from("checklist_states").select("*")
    .gte("date", cutoff.toISOString().split("T")[0]);
  if (error) throw error;
  const result = {};
  data.forEach(row => {
    // Key shape after Stage 6: storeId||checklistId||date (was brandId||...).
    // Legacy rows with NULL store_id are still indexed under brand_id so
    // they don't vanish from the UI; new rows are always store-keyed.
    const scope = row.store_id || row.brand_id;
    result[`${scope}||${row.checklist_id}||${row.date}`] = row.item_states || {};
  });
  return result;
}
// Per-store checklist sign-off state. After Stage 6, the unique constraint
// is (store_id, checklist_id, date) — each store signs off its own copy of
// the checklist, even though the checklist template itself is chain-wide.
// This matches real operations: Evington Road completing morning open says
// nothing about whether Gipsy Lane has done theirs.
export async function upsertChecklistState(storeId, brandId, checklistId, date, itemStates, signedOffBy, signedOffAt) {
  if (!storeId) throw new Error("upsertChecklistState requires storeId");
  const { error } = await supabase.from("checklist_states").upsert({
    store_id: storeId, brand_id: brandId, checklist_id: checklistId, date,
    item_states: itemStates, signed_off_by: signedOffBy || "",
    signed_off_at: signedOffAt || null, updated_at: new Date().toISOString(),
  }, { onConflict: "store_id,checklist_id,date" });
  if (error) throw error;
}

// ── AUDIT TRAIL ──────────────────────────────────────────────────────────────
export async function fetchAuditTrail() {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const { data, error } = await supabase.from("audit_trail").select("*")
    .gte("date", cutoff.toISOString().split("T")[0])
    .order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  return data.map(dbAuditToApp);
}
export async function insertAuditEntry(entry) {
  const { error } = await supabase.from("audit_trail").insert(appAuditToDb(entry));
  if (error) console.error("Audit log failed (non-critical):", error);
}
export async function clearAuditTrail() {
  const { error } = await supabase.from("audit_trail").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
}

// ── SHAPE CONVERTERS ─────────────────────────────────────────────────────────
// Brand kpi_targets is deprecated — superseded by per-store kpi_targets.
// We stop writing it from new code (no app form should be editing it any more);
// the column on the DB is scheduled for drop. We keep reading it defensively
// in case a deploy lands before the SQL drop — `?? null` keeps the field
// present so older readers don't crash on undefined.
function appBrandToDb(b) { return { id: b.id, name: b.name, icon_key: b.iconKey, color: b.color, address: b.address }; }
function dbBrandToApp(b) { return { id: b.id, name: b.name, iconKey: b.icon_key, color: b.color, address: b.address, kpiTargets: b.kpi_targets ?? null }; }

function appUserToDb(u) { return { id: u.id, name: u.name, email: u.email, password: u.password, role: u.role, brand_ids: u.brandIds, store_ids: u.storeIds, avatar: u.avatar }; }
function dbUserToApp(u) { return { id: u.id, name: u.name, email: u.email, password: u.password, role: u.role, brandIds: u.brand_ids, storeIds: u.store_ids || [], avatar: u.avatar }; }

function appEntryToDb(e) {
  return { id: e.id, brand_id: e.brandId, brand_name: e.brandName, date: e.date, manager: e.manager, submitted_by: e.submittedBy, net_sales: e.netSales, card_revenue: e.cardRevenue, cash_expected: e.cashExpected, physical_cash: e.physicalCash, cash_variance: e.cashVariance, variance_justification: e.varianceJustification, opening_float: e.openingFloat, closing_float: e.closingFloat, labor_cost: e.laborCost, cogs_cost: e.cogsCost, total_hours: e.totalHours, total_orders: e.totalOrders, atv: e.atv, five_star_reviews: e.fiveStarReviews, mid_star_reviews: e.midStarReviews, one_star_reviews: e.oneStarReviews, notes: e.notes, maintenance_tickets: e.maintenanceTickets, timestamp: e.timestamp, store_id: e.storeId || null, amendments: e.amendments || [], reconciliation: e.reconciliation || [], recon_status: e.reconStatus || "open" };
}
function dbEntryToApp(e) {
  return { id: e.id, brandId: e.brand_id, brandName: e.brand_name, date: e.date, manager: e.manager, submittedBy: e.submitted_by, netSales: e.net_sales, cardRevenue: e.card_revenue, cashExpected: e.cash_expected, physicalCash: e.physical_cash, cashVariance: e.cash_variance, varianceJustification: e.variance_justification, openingFloat: e.opening_float, closingFloat: e.closing_float, laborCost: e.labor_cost, cogsCost: e.cogs_cost, totalHours: e.total_hours, totalOrders: e.total_orders, atv: e.atv, fiveStarReviews: e.five_star_reviews, midStarReviews: e.mid_star_reviews, oneStarReviews: e.one_star_reviews, notes: e.notes, maintenanceTickets: e.maintenance_tickets ?? [], timestamp: e.timestamp, storeId: e.store_id || null, amendments: e.amendments ?? [], reconciliation: e.reconciliation ?? [], reconStatus: e.recon_status || "open" };
}

function appIssueToDb(i) { return { id: i.id, brand_id: i.brandId, brand_name: i.brandName, type: i.type || "Issue", title: i.title, description: i.description, category: i.category, priority: i.priority, status: i.status, reported_by: i.reportedBy, assigned_to: i.assignedTo, comments: i.comments, created_at: i.createdAt, updated_at: i.updatedAt }; }
function dbIssueToApp(i) { return { id: i.id, brandId: i.brand_id, brandName: i.brand_name, type: i.type || "Issue", title: i.title, description: i.description, category: i.category, priority: i.priority, status: i.status, reportedBy: i.reported_by, assignedTo: i.assigned_to, comments: i.comments ?? [], createdAt: i.created_at, updatedAt: i.updated_at }; }

function appTicketToDb(t) { return { id: t.id, brand_id: t.brandId, text: t.text, priority: t.priority, done: t.done ?? false }; }
function dbTicketToApp(t) { return { id: t.id, brandId: t.brand_id, text: t.text, priority: t.priority, done: t.done, createdAt: t.created_at }; }

function appTempUnitToDb(u) { return { id: u.id, brand_id: u.brandId, store_id: u.storeId || null, name: u.name, type: u.type, min_temp: u.min ?? null, max_temp: u.max ?? null, assign_role: u.assignRole || "", updated_at: new Date().toISOString() }; }
function dbTempUnitToApp(u) { return { id: u.id, brandId: u.brand_id, storeId: u.store_id || null, name: u.name, type: u.type, min: u.min_temp, max: u.max_temp, assignRole: u.assign_role }; }

function appCleanTaskToDb(t) {
  return {
    id: t.id, name: t.name, area: t.area, freq: t.freq,
    assign_role: t.assignRole || "", notes: t.notes || "",
    // Stage 7: cleaning tasks are now per-store. brand_id is derived from
    // the store on save so legacy code reading brand_id still works.
    store_id: t.storeId || null,
    brand_id: t.brandId || null,
    updated_at: new Date().toISOString(),
  };
}
function dbCleanTaskToApp(t) {
  return {
    id: t.id, name: t.name, area: t.area, freq: t.freq,
    assignRole: t.assign_role, notes: t.notes,
    storeId: t.store_id || null,
    brandId: t.brand_id || null,
  };
}

function appAssignmentToDb(a) { return { id: a.id, brand_id: a.brandId, store_id: a.storeId || null, type: a.type, task_id: a.taskId, role: a.role || "", person_id: a.personId || "", department: a.department || "", assign_to: a.assignTo || "role", freq: a.freq, weekday: a.weekday || null, once_date: a.date || null, custom_days: a.customDays || [], win_start: a.winStart, win_end: a.winEnd, priority: a.priority, notes: a.notes || "", updated_at: new Date().toISOString() }; }
function dbAssignmentToApp(a) { return { id: a.id, brandId: a.brand_id, storeId: a.store_id || null, type: a.type, taskId: a.task_id, role: a.role, personId: a.person_id, department: a.department || "", assignTo: a.assign_to || (a.person_id ? "employee" : (a.department ? "department" : "role")), freq: a.freq, weekday: a.weekday, date: a.once_date, customDays: a.custom_days || [], winStart: a.win_start, winEnd: a.win_end, priority: a.priority, notes: a.notes }; }

function appOpsTeamToDb(m) {
  // ⚠ Partial-aware mapper. Same shape as appApplicationToDb after the
  // slice 5 critical fix. Only writes fields the caller explicitly provided.
  // Stops partial updates (e.g. a future "rename role" quick action) from
  // wiping unrelated fields.
  //
  // updated_at is always set — that's a server-side concern, not user data.
  const row = { updated_at: new Date().toISOString() };
  if (m.id            !== undefined) row.id            = m.id;
  if (m.brandId       !== undefined) row.brand_id      = m.brandId;
  if (m.firstName     !== undefined) row.first_name    = m.firstName;
  if (m.lastName      !== undefined) row.last_name     = m.lastName || "";
  if (m.nickname      !== undefined) row.nickname      = m.nickname || "";
  if (m.department    !== undefined) row.department    = m.department || "";
  if (m.role          !== undefined) row.role          = m.role;
  if (m.isTrainee     !== undefined) row.is_trainee     = !!m.isTrainee;
  if (m.pin           !== undefined) row.pin           = m.pin || "";
  if (m.color         !== undefined) row.color         = m.color || "#6366f1";
  if (m.hourlyRate    !== undefined) row.hourly_rate   = m.hourlyRate || 0;
  if (m.storeIds      !== undefined) row.store_ids     = m.storeIds || [];
  if (m.roleId        !== undefined) row.role_id       = m.roleId || null;
  // Multiple job roles. role_ids is the source of truth; role_id mirrors the
  // first element for backward compatibility with single-role readers.
  if (m.roleIds       !== undefined) {
    const ids = Array.isArray(m.roleIds) ? m.roleIds.filter(Boolean) : [];
    row.role_ids = ids;
    row.role_id  = ids[0] || null;   // keep legacy single column in sync
  }
  if (m.departmentId  !== undefined) row.department_id = m.departmentId || null;
  // Slice 5 — HR fields, also partial-aware
  if (m.email         !== undefined) row.email         = m.email || null;
  if (m.phone         !== undefined) row.phone         = m.phone || null;
  if (m.dob           !== undefined) row.dob           = m.dob || null;
  if (m.gender        !== undefined) row.gender        = m.gender || null;
  if (m.address       !== undefined) row.address       = m.address || null;
  if (m.legalStatus   !== undefined) row.legal_status  = m.legalStatus || null;
  if (m.niNumber      !== undefined) row.ni_number     = m.niNumber?.trim() || null;
  if (m.selffillToken !== undefined) row.selffill_token = m.selffillToken || null;
  if (m.selffillCompletedAt !== undefined) row.selffill_completed_at = m.selffillCompletedAt || null;
  if (m.photoUrl      !== undefined) row.photo_url     = m.photoUrl || null;
  if (m.roleId        !== undefined) row.role_id       = m.roleId || null;
  if (m.hrNotes       !== undefined) row.hr_notes      = m.hrNotes || null;
  if (m.status        !== undefined) row.status        = m.status || "active";
  if (m.archivedAt    !== undefined) row.archived_at   = m.archivedAt;
  // Slice 6 — explicit hire date. Manager can override; default-derived
  // from linked job_application.archived_at in the profile UI.
  if (m.hireDate      !== undefined) row.hire_date     = m.hireDate || null;
  // Slice 6 follow-up — pay type. The hourly_rate column is reused as the
  // "amount" regardless of type, so no separate "pay_amount" column.
  if (m.payType       !== undefined) row.pay_type      = m.payType || "hourly";
  if (m.phoneClockIn  !== undefined) row.phone_clock_in = !!m.phoneClockIn;
  // Payroll — how the pay RATE is determined: 'minimum_wage' (live NMW lookup by
  // age on work date) or 'fixed' (use hourly_rate). Defaults handled in DB.
  if (m.payBasis      !== undefined) row.pay_basis     = m.payBasis || "fixed";
  if (m.profileStatus !== undefined) row.profile_status = m.profileStatus || "pending";
  // Payroll — per-employee DEFAULT attributes (read by the calc screen; actual
  // per-run values are saved in payroll_periods).
  if (m.defaultBankHours   !== undefined) row.default_bank_hours  = (m.defaultBankHours === "" || m.defaultBankHours == null) ? null : Number(m.defaultBankHours);
  if (m.defaultBankAmount  !== undefined) row.default_bank_amount = (m.defaultBankAmount === "" || m.defaultBankAmount == null) ? null : Number(m.defaultBankAmount);
  if (m.payrollLocation    !== undefined) row.payroll_location    = m.payrollLocation || null;
  if (m.accountingLocation !== undefined) row.accounting_location = m.accountingLocation || null;
  // Slice 7 — emergency contact (single contact per employee)
  if (m.emergencyContactName         !== undefined) row.emergency_contact_name         = m.emergencyContactName?.trim() || null;
  if (m.emergencyContactPhone        !== undefined) row.emergency_contact_phone        = m.emergencyContactPhone?.trim() || null;
  if (m.emergencyContactRelationship !== undefined) row.emergency_contact_relationship = m.emergencyContactRelationship?.trim() || null;
  // Slice 7 — probation
  if (m.probationEndDate !== undefined) row.probation_end_date = m.probationEndDate || null;
  if (m.probationStatus  !== undefined) row.probation_status   = m.probationStatus  || "in_progress";
  // Onboarding — HMRC tax starter checklist
  if (m.taxStarterStatement !== undefined) row.tax_starter_statement = m.taxStarterStatement || "";
  if (m.hasP45              !== undefined) row.has_p45               = !!m.hasP45;
  if (m.studentLoan         !== undefined) row.student_loan          = !!m.studentLoan;
  if (m.loanEligible        !== undefined) row.loan_eligible         = !!m.loanEligible;
  if (m.taxCompletedAt      !== undefined) row.tax_completed_at      = m.taxCompletedAt || null;
  // Onboarding — bank details (owner/HR only; app-gated)
  if (m.bankAccountName !== undefined) row.bank_account_name = m.bankAccountName?.trim() || null;
  if (m.bankSortCode    !== undefined) row.bank_sort_code    = m.bankSortCode?.trim() || null;
  if (m.bankAccountNo   !== undefined) row.bank_account_no   = m.bankAccountNo?.trim() || null;
  if (m.bankProvidedAt  !== undefined) row.bank_provided_at  = m.bankProvidedAt || null;
  if (m.bankDeclaredByName !== undefined) row.bank_declared_by_name = m.bankDeclaredByName || null;
  if (m.bankDeclaration    !== undefined) row.bank_declaration      = m.bankDeclaration || null;
  if (m.bankDeclaredAt     !== undefined) row.bank_declared_at      = m.bankDeclaredAt || null;
  return row;
}
function dbOpsTeamToApp(m) {
  return {
    id: m.id, brandId: m.brand_id,
    firstName: m.first_name, lastName: m.last_name,
    nickname: m.nickname || "", department: m.department || "",
    role: m.role, pin: m.pin, color: m.color,
    isTrainee: m.is_trainee ?? false,
    hourlyRate: m.hourly_rate != null ? parseFloat(m.hourly_rate) : 0,
    storeIds: m.store_ids || [],
    roleId: m.role_id || null,
    roleIds: (m.role_ids && m.role_ids.length) ? m.role_ids : (m.role_id ? [m.role_id] : []),
    departmentId: m.department_id || null,
    // Slice 5 — HR fields
    email:       m.email || "",
    phone:       m.phone || "",
    dob:         m.dob || null,
    gender:      m.gender || "",
    address:     m.address || "",
    legalStatus: m.legal_status || "",
    niNumber:    m.ni_number || "",
    selffillToken: m.selffill_token || null,
    selffillCompletedAt: m.selffill_completed_at || null,
    photoUrl:    m.photo_url || null,
    roleId:      m.role_id || null,
    hrNotes:     m.hr_notes || "",
    status:      m.status || "active",
    archivedAt:  m.archived_at || null,
    hireDate:    m.hire_date || null,
    payType:     m.pay_type || "hourly",
    phoneClockIn: m.phone_clock_in ?? false,
    payBasis:    m.pay_basis || "fixed",
    profileStatus: m.profile_status || "pending",
    defaultBankHours:   m.default_bank_hours != null ? parseFloat(m.default_bank_hours) : null,
    defaultBankAmount:  m.default_bank_amount != null ? parseFloat(m.default_bank_amount) : null,
    payrollLocation:    m.payroll_location || null,
    accountingLocation: m.accounting_location || null,
    // Slice 7 — emergency contact
    emergencyContactName:         m.emergency_contact_name         || null,
    emergencyContactPhone:        m.emergency_contact_phone        || null,
    emergencyContactRelationship: m.emergency_contact_relationship || null,
    // Slice 7 — probation
    probationEndDate: m.probation_end_date || null,
    probationStatus:  m.probation_status   || "in_progress",
    // Onboarding — HMRC tax
    taxStarterStatement: m.tax_starter_statement || "",
    hasP45:              m.has_p45 ?? false,
    studentLoan:         m.student_loan ?? false,
    loanEligible:        m.loan_eligible ?? false,
    taxCompletedAt:      m.tax_completed_at || null,
    // Onboarding — bank (owner/HR only; UI must gate display)
    bankAccountName: m.bank_account_name || "",
    bankSortCode:    m.bank_sort_code || "",
    bankAccountNo:   m.bank_account_no || "",
    bankProvidedAt:  m.bank_provided_at || null,
    bankDeclaredByName: m.bank_declared_by_name || null,
    bankDeclaration:    m.bank_declaration || null,
    bankDeclaredAt:     m.bank_declared_at || null,
  };
}

function appTempLogToDb(l) { return { id: l.id, brand_id: l.brandId, unit_id: l.unitId, date: l.date, time: l.time, value: l.value, is_breach: l.isBreach || false, notes: l.notes || "", logged_by: l.loggedBy || "" }; }
function dbTempLogToApp(l) { return { id: l.id, brandId: l.brand_id, unitId: l.unit_id, date: l.date, time: l.time, value: Number(l.value), isBreach: l.is_breach, notes: l.notes, loggedBy: l.logged_by }; }

function appDeliveryToDb(d) { return { id: d.id, brand_id: d.brandId, date: d.date, time: d.time, supplier: d.supplier, items: d.items || "", temp: d.temp ?? null, temp_ok: d.tempOk || "yes", condition: d.condition || "good", driver: d.driver || "", notes: d.notes || "", logged_by: d.loggedBy || "" }; }
function dbDeliveryToApp(d) { return { id: d.id, brandId: d.brand_id, date: d.date, time: d.time, supplier: d.supplier, items: d.items, temp: d.temp, tempOk: d.temp_ok, condition: d.condition, driver: d.driver, notes: d.notes, loggedBy: d.logged_by, timestamp: d.created_at }; }

function appAuditToDb(a) {
  return {
    brand_id: a.brandId || null,
    // store_id is nullable on this table — chain-wide actions (e.g. brand
    // creation, user impersonation) have no natural storeId and would force
    // us to invent one. When the action IS store-specific, callers pass it.
    store_id: a.storeId || null,
    action: a.action,
    detail: a.detail || "",
    performed_by: a.by || "",
    date: a.date,
    time: a.time,
  };
}
function dbAuditToApp(a) {
  return {
    id: a.id,
    brandId: a.brand_id,
    storeId: a.store_id || null,
    action: a.action,
    detail: a.detail,
    by: a.performed_by,
    date: a.date,
    time: a.time,
    timestamp: a.created_at,
  };
}

// ── HELPDESK TICKETS ─────────────────────────────────────────────────────────

export async function fetchHelpdeskTickets() {
  const { data, error } = await supabase
    .from("helpdesk_tickets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(dbTicketToHelpdesk);
}

export async function insertHelpdeskTicket(ticket) {
  const { data, error } = await supabase
    .from("helpdesk_tickets")
    .insert(helpdeskTicketToDb(ticket))
    .select().single();
  if (error) throw error;
  return dbTicketToHelpdesk(data);
}

export async function upsertHelpdeskTicket(ticket) {
  const { data, error } = await supabase
    .from("helpdesk_tickets")
    .upsert(helpdeskTicketToDb(ticket), { onConflict: "id" })
    .select().single();
  if (error) throw error;
  return dbTicketToHelpdesk(data);
}

export async function removeHelpdeskTicket(id) {
  const { error } = await supabase.from("helpdesk_tickets").delete().eq("id", id);
  if (error) throw error;
}

function helpdeskTicketToDb(t) {
  return {
    id: t.id,
    brand_id: t.brandId,
    store_id: t.storeId || null,   // nullable: chain-wide tickets have no store
    title: t.title,
    description: t.description || "",
    category: t.category || "General",
    priority: t.priority || "Normal",
    status: t.status || "Open",
    created_by_id: t.createdById || "",
    created_by_name: t.createdByName || "",
    // We keep `assigned_to` as text[] (matches existing schema) but per Q2
    // we enforce ONE assignee in practice. Empty array = unassigned (HQ
    // triage queue). Single-element array = assigned. Multi-element would
    // work technically but UI never produces it.
    assigned_to: t.assignedTo || [],
    comments: t.comments || [],
    updated_at: new Date().toISOString(),
  };
}
function dbTicketToHelpdesk(t) {
  return {
    id: t.id,
    brandId: t.brand_id,
    storeId: t.store_id || null,
    title: t.title,
    description: t.description,
    category: t.category,
    priority: t.priority,
    status: t.status,
    createdById: t.created_by_id,
    createdByName: t.created_by_name,
    assignedTo: t.assigned_to || [],
    comments: t.comments || [],
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

// ── INBOX MESSAGES ────────────────────────────────────────────────────────────

export async function fetchInboxMessages() {
  const { data, error } = await supabase
    .from("inbox_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return data.map(dbMsgToApp);
}

export async function insertInboxMessage(msg) {
  const { data, error } = await supabase
    .from("inbox_messages")
    .insert(appMsgToDb(msg))
    .select().single();
  if (error) throw error;
  return dbMsgToApp(data);
}

export async function markMessageRead(id, readerId) {
  // UNREAD_FIX_V1: previously this threw when read_by was NULL (NULL.includes),
  // so the read never persisted and the unread badge kept climbing. Now we
  // coalesce NULL -> [], dedupe, and only write when the id is actually missing.
  if (!id || !readerId) return;
  try {
    const { data: existing, error: selErr } = await supabase
      .from("inbox_messages").select("read_by").eq("id", id).single();
    if (selErr || !existing) return;
    const current = Array.isArray(existing.read_by) ? existing.read_by : [];
    if (current.includes(readerId)) return; // already read — nothing to do
    await supabase.from("inbox_messages")
      .update({ read_by: [...current, readerId] }).eq("id", id);
  } catch (e) {
    // swallow — a failed mark-read should never crash the chat UI
  }
}

function appMsgToDb(m) {
  return {
    id: m.id, brand_id: m.brandId || null,
    from_id: m.fromId || "", from_name: m.fromName || "", from_role: m.fromRole || "",
    to_scope: m.toScope || "location", to_brand_id: m.toBrandId || null,
    to_person_id: m.toPersonId || null, to_person_name: m.toPersonName || null,
    subject: m.subject || "", body: m.body || "", read_by: m.readBy || [],
  };
}
function dbMsgToApp(m) {
  return {
    id: m.id, brandId: m.brand_id,
    fromId: m.from_id, fromName: m.from_name, fromRole: m.from_role,
    toScope: m.to_scope, toBrandId: m.to_brand_id,
    toPersonId: m.to_person_id, toPersonName: m.to_person_name,
    subject: m.subject, body: m.body, readBy: m.read_by || [],
    createdAt: m.created_at,
  };
}

// ── AVAILABILITY ──────────────────────────────────────────────────────────────

export async function fetchAvailability() {
  const { data, error } = await supabase
    .from("availability")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(dbAvailToApp);
}

export async function insertAvailability(a) {
  const { data, error } = await supabase
    .from("availability")
    .insert(appAvailToDb(a))
    .select().single();
  if (error) throw error;
  return dbAvailToApp(data);
}

export async function upsertAvailability(a) {
  const { data, error } = await supabase
    .from("availability")
    .upsert(appAvailToDb(a), { onConflict: "id" })
    .select().single();
  if (error) throw error;
  return dbAvailToApp(data);
}

export async function removeAvailability(id) {
  const { error } = await supabase.from("availability").delete().eq("id", id);
  if (error) throw error;
}

function appAvailToDb(a) {
  return {
    id: a.id, brand_id: a.brandId,
    employee_id: a.employeeId || "", employee_name: a.employeeName || "",
    type: a.type, date: a.date || null,
    day_of_week: a.dayOfWeek || null,
    start_date: a.startDate || null, end_date: a.endDate || null,
    start_time: a.startTime || "09:00", end_time: a.endTime || "17:00",
    available: a.available ?? true, notes: a.notes || "",
    status: a.status || "pending", manager_notes: a.managerNotes || "",
    amended_start_time: a.amendedStartTime || null,
    amended_end_time: a.amendedEndTime || null,
    amended_date: a.amendedDate || null,
    amended_day_of_week: a.amendedDayOfWeek || null,
    comments: a.comments || [],
    updated_at: new Date().toISOString(),
  };
}

function dbAvailToApp(a) {
  return {
    id: a.id, brandId: a.brand_id,
    employeeId: a.employee_id, employeeName: a.employee_name,
    type: a.type, date: a.date,
    dayOfWeek: a.day_of_week,
    startDate: a.start_date, endDate: a.end_date,
    startTime: a.start_time?.slice(0,5) || "09:00",
    endTime: a.end_time?.slice(0,5) || "17:00",
    available: a.available, notes: a.notes,
    status: a.status, managerNotes: a.manager_notes || "",
    amendedStartTime: a.amended_start_time?.slice(0,5) || null,
    amendedEndTime: a.amended_end_time?.slice(0,5) || null,
    amendedDate: a.amended_date || null,
    amendedDayOfWeek: a.amended_day_of_week || null,
    comments: a.comments || [],
    createdAt: a.created_at, updatedAt: a.updated_at,
  };
}

// ── SCHEDULES ─────────────────────────────────────────────────────────────────

export async function fetchSchedules() {
  const { data, error } = await supabase
    .from("schedules").select("*")
    .order("date").order("start_time");
  if (error) throw error;
  return data.map(dbScheduleToApp);
}

// Ranged variant for the Reports section (scheduled-vs-actual variance).
export async function fetchSchedulesRange({ from, to } = {}) {
  let q = supabase.from("schedules").select("*").order("date").order("start_time");
  if (from) q = q.gte("date", from);
  if (to)   q = q.lte("date", to);
  const { data, error } = await q;
  if (error) throw error;
  return data.map(dbScheduleToApp);
}

export async function upsertSchedule(s) {
  const { data, error } = await supabase
    .from("schedules")
    .upsert(appScheduleToDb(s), { onConflict: "id" })
    .select().single();
  if (error) throw error;
  return dbScheduleToApp(data);
}

export async function removeSchedule(id) {
  const { error } = await supabase.from("schedules").delete().eq("id", id);
  if (error) throw error;
}

function appScheduleToDb(s) {
  return {
    id: s.id, brand_id: s.brandId, store_id: s.storeId || null,
    employee_id: s.employeeId || "", employee_name: s.employeeName || "",
    date: s.date, shift: s.shift || "Morning",
    start_time: s.startTime || "08:00", end_time: s.endTime || "16:00",
    role: s.role || "", department: s.department || "",
    notes: s.notes || "", status: s.status || "scheduled",
    published: s.published ?? false,
    week_start: s.weekStart || null,
    created_by: s.createdBy || "", updated_at: new Date().toISOString(),
  };
}
function dbScheduleToApp(s) {
  return {
    id: s.id, brandId: s.brand_id, storeId: s.store_id || null,
    employeeId: s.employee_id, employeeName: s.employee_name,
    date: s.date, shift: s.shift,
    startTime: s.start_time?.slice(0,5) || "08:00",
    endTime: s.end_time?.slice(0,5) || "16:00",
    role: s.role, department: s.department,
    notes: s.notes, status: s.status,
    published: s.published ?? false,
    weekStart: s.week_start || null,
    createdBy: s.created_by, createdAt: s.created_at, updatedAt: s.updated_at,
  };
}

// ── SHIFT PRESETS ─────────────────────────────────────────────────────────────

export async function fetchShiftPresets() {
  const { data, error } = await supabase
    .from("shift_presets").select("*").order("sort_order");
  if (error) throw error;
  return data.map(r => ({ id: r.id, brandId: r.brand_id, name: r.name,
    startTime: r.start_time?.slice(0,5)||"08:00", endTime: r.end_time?.slice(0,5)||"16:00",
    color: r.color, sortOrder: r.sort_order }));
}

export async function upsertShiftPreset(p) {
  const { data, error } = await supabase.from("shift_presets")
    .upsert({ id: p.id, brand_id: p.brandId, name: p.name,
      start_time: p.startTime, end_time: p.endTime,
      color: p.color || "#6366f1", sort_order: p.sortOrder || 0 },
      { onConflict: "id" }).select().single();
  if (error) throw error;
  return { id: data.id, brandId: data.brand_id, name: data.name,
    startTime: data.start_time?.slice(0,5), endTime: data.end_time?.slice(0,5),
    color: data.color, sortOrder: data.sort_order };
}

export async function removeShiftPreset(id) {
  const { error } = await supabase.from("shift_presets").delete().eq("id", id);
  if (error) throw error;
}

// ── Publish/unpublish a week of schedules ─────────────────────────────────────
// Publish (or unpublish) all schedules in a given week for a given scope.
// New shape: pass { storeId, weekStart, published } to publish per-store.
// Legacy shape (brandId positional) still works for backward compatibility.
export async function publishWeekSchedules(arg1, weekStart, published) {
  // Detect calling shape: object means new-style, string means legacy brandId.
  const opts = (typeof arg1 === "object" && arg1 !== null)
    ? arg1
    : { brandId: arg1, weekStart, published };
  const weekEnd = new Date(opts.weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  let q = supabase.from("schedules")
    .update({ published: opts.published, updated_at: new Date().toISOString() })
    .gte("date", opts.weekStart)
    .lte("date", weekEnd.toISOString().split("T")[0]);
  // Scope to a single store if provided, else to the legacy brand path.
  if (opts.storeId) q = q.eq("store_id", opts.storeId);
  else if (opts.brandId) q = q.eq("brand_id", opts.brandId);
  const { error } = await q;
  if (error) throw error;
}

// ── PUNCH RECORDS ─────────────────────────────────────────────────────────────

export async function fetchPunchRecords({ brandId, from, to } = {}) {
  let q = supabase.from("punch_records").select("*").order("punch_in", { ascending: false });
  if (brandId) q = q.eq("brand_id", brandId);
  if (from)    q = q.gte("date", from);
  if (to)      q = q.lte("date", to);
  const { data, error } = await q;
  if (error) throw error;
  return data.map(dbPunchToApp);
}

export async function insertPunchIn(record) {
  // Guard: an employee can only have ONE open shift at a time. If they already
  // have an open punch (e.g. a forgotten clock-out from a previous day), refuse
  // to open a second one — this is enforced server-side so it can't be bypassed
  // by stale UI state. The caller should clock them out (or close the old shift)
  // first. employeeId is the app-side field on the record.
  const empId = record.employeeId;
  if (empId) {
    const { data: existing, error: chkErr } = await supabase
      .from("punch_records").select("id, date, punch_in")
      .eq("employee_id", empId).is("punch_out", null).limit(1);
    if (chkErr) throw chkErr;
    if (existing && existing.length) {
      const e = new Error("ALREADY_CLOCKED_IN");
      e.code = "ALREADY_CLOCKED_IN";
      e.openPunch = existing[0];
      throw e;
    }
  }
  const { data, error } = await supabase
    .from("punch_records").insert(appPunchToDb(record)).select().single();
  if (error) throw error;
  return dbPunchToApp(data);
}

export async function updatePunchOut(id, punchOut, hoursWorked, grossPay) {
  const { data, error } = await supabase
    .from("punch_records")
    .update({ punch_out: punchOut, hours_worked: hoursWorked, gross_pay: grossPay,
               status: "closed", updated_at: new Date().toISOString() })
    .eq("id", id).select().single();
  if (error) throw error;
  return dbPunchToApp(data);
}

export async function upsertPunchRecord(record) {
  const { data, error } = await supabase
    .from("punch_records").upsert(appPunchToDb(record), { onConflict: "id" })
    .select().single();
  if (error) throw error;
  return dbPunchToApp(data);
}

export async function deletePunchRecord(id) {
  const { error } = await supabase.from("punch_records").delete().eq("id", id);
  if (error) throw error;
  return id;
}

// Start or end an unpaid break on an open punch. action: "start" | "end".
// On end, accumulates elapsed minutes into break_minutes.
export async function setPunchBreak(id, action) {
  const { data: rows, error: e1 } = await supabase
    .from("punch_records").select("break_start, break_minutes").eq("id", id).single();
  if (e1) throw e1;
  const nowIso = new Date().toISOString();
  let patch;
  if (action === "start") {
    patch = { break_start: nowIso, break_end: null };
  } else {
    const start = rows?.break_start ? new Date(rows.break_start).getTime() : null;
    const addMins = start ? Math.max(0, Math.round((Date.now() - start) / 60000)) : 0;
    patch = { break_end: nowIso, break_minutes: (rows?.break_minutes || 0) + addMins };
  }
  const { data, error } = await supabase
    .from("punch_records").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return dbPunchToApp(data);
}

// PUNCH_AUDIT_V1 — write change entries (fire-and-forget; never blocks the save).
export async function logPunchAudit(entries) {
  if (!entries || entries.length === 0) return;
  const rows = entries.map((e, i) => ({
    id: `pa-${Date.now()}-${i}`,
    punch_id: e.punchId, field: e.field,
    old_value: e.oldValue == null ? null : String(e.oldValue),
    new_value: e.newValue == null ? null : String(e.newValue),
    reason: e.reason || "manager_amend", changed_by: e.changedBy || "unknown",
    changed_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("punch_audit").insert(rows);
  if (error) console.error("punch_audit insert failed:", error.message);
}
export async function fetchPunchAudit(punchId) {
  const { data, error } = await supabase.from("punch_audit")
    .select("*").eq("punch_id", punchId).order("changed_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.id, punchId: r.punch_id, field: r.field, oldValue: r.old_value,
    newValue: r.new_value, reason: r.reason, changedBy: r.changed_by, changedAt: r.changed_at,
  }));
}

function appPunchToDb(p) {
  return {
    id: p.id, brand_id: p.brandId, store_id: p.storeId || null,
    employee_id: p.employeeId, employee_name: p.employeeName,
    date: p.date, punch_in: p.punchIn, punch_out: p.punchOut || null,
    hours_worked: p.hoursWorked || null, hourly_rate: p.hourlyRate || 0,
    gross_pay: p.grossPay || null, notes: p.notes || "",
    status: p.status || "open", amended_by: p.amendedBy || "",
    approved: p.approved ?? false, approved_by: p.approvedBy || "",
    scheduled_start: p.scheduledStart || null, scheduled_end: p.scheduledEnd || null,
    break_start: p.breakStart || null, break_end: p.breakEnd || null,
    break_minutes: p.breakMinutes || 0,
    overtime_hours: p.overtimeHours || null,
    overtime_reason: p.overtimeReason || "",
    overtime_approved: p.overtimeApproved ?? false,
    overtime_approved_by: p.overtimeApprovedBy || "",
    overtime_rejected_reason: p.overtimeRejectedReason || "",
    photo_url_in: p.photoUrlIn || "",
    photo_url_out: p.photoUrlOut || "",
    overtime_comments: p.overtimeComments || [],
    updated_at: new Date().toISOString(),
  };
}
function dbPunchToApp(p) {
  return {
    id: p.id, brandId: p.brand_id, storeId: p.store_id || null,
    employeeId: p.employee_id, employeeName: p.employee_name,
    date: p.date, punchIn: p.punch_in, punchOut: p.punch_out,
    hoursWorked: p.hours_worked ? parseFloat(p.hours_worked) : null,
    hourlyRate: p.hourly_rate ? parseFloat(p.hourly_rate) : 0,
    grossPay: p.gross_pay ? parseFloat(p.gross_pay) : null,
    notes: p.notes, status: p.status, amendedBy: p.amended_by,
    approved: p.approved ?? false, approvedBy: p.approved_by || "",
    scheduledStart: p.scheduled_start?.slice(0,5) || null,
    scheduledEnd: p.scheduled_end?.slice(0,5) || null,
    breakStart: p.break_start || null, breakEnd: p.break_end || null,
    breakMinutes: p.break_minutes ? parseInt(p.break_minutes, 10) : 0,
    overtimeHours: p.overtime_hours ? parseFloat(p.overtime_hours) : null,
    overtimeReason: p.overtime_reason || "",
    overtimeApproved: p.overtime_approved ?? false,
    overtimeApprovedBy: p.overtime_approved_by || "",
    overtimeRejectedReason: p.overtime_rejected_reason || "",
    photoUrlIn: p.photo_url_in || "",
    photoUrlOut: p.photo_url_out || "",
    overtimeComments: p.overtime_comments || [],
    createdAt: p.created_at, updatedAt: p.updated_at,
  };
}

// ── PUNCH PHOTOS ──────────────────────────────────────────────────────────────

/** Upload a JPEG blob and return its public URL. Used by the kiosk for punch-in/out photos. */
export async function uploadPunchPhoto(blob, employeeId) {
  // Random suffix prevents URL guessing
  const random = Math.random().toString(36).slice(2, 10);
  const filename = `${employeeId}/${Date.now()}-${random}.jpg`;
  const { error } = await supabase.storage
    .from("punch-photos")
    .upload(filename, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("punch-photos").getPublicUrl(filename);
  return data.publicUrl;
}

/** Attach photo URL to a punch record (in or out). */
export async function attachPunchPhoto(recordId, photoUrl, which /* "in" | "out" */) {
  const field = which === "out" ? "photo_url_out" : "photo_url_in";
  const { error } = await supabase
    .from("punch_records")
    .update({ [field]: photoUrl, updated_at: new Date().toISOString() })
    .eq("id", recordId);
  if (error) throw error;
}

/** Append a comment to a punch record's overtime conversation thread. */
export async function addPunchOvertimeComment(recordId, comment) {
  // Fetch current comments, append, save back. Last-write-wins; fine for low-traffic conversations.
  const { data: current, error: fetchErr } = await supabase
    .from("punch_records")
    .select("overtime_comments")
    .eq("id", recordId)
    .single();
  if (fetchErr) throw fetchErr;
  const next = [...(current.overtime_comments || []), comment];
  const { data, error } = await supabase
    .from("punch_records")
    .update({ overtime_comments: next, updated_at: new Date().toISOString() })
    .eq("id", recordId)
    .select()
    .single();
  if (error) throw error;
  return dbPunchToApp(data);
}

// ════════════════════════════════════════════════════════════════════════════
// STORES + FLIPDISH HELPERS
// ════════════════════════════════════════════════════════════════════════════

function dbStoreToApp(s) {
  return {
    id:               s.id,
    brandId:          s.brand_id,
    flipdishStoreId:  s.flipdish_store_id,
    name:             s.name,
    shortName:        s.short_name,
    ownershipModel:   (s.ownership_model || "").toLowerCase().trim().replace(/\s+/g, "_"),
    siteType:         s.site_type || "shop",   // 'shop' | 'central_kitchen' | 'distribution' | 'franchise_ops'
    franchiseeName:   s.franchisee_name,
    status:           s.status,
    address:          s.address,
    city:             s.city,
    postcode:         s.postcode,
    country:          s.country,
    latitude:         s.lat ?? s.latitude,
    longitude:        s.lng ?? s.longitude,
    openedDate:       s.opened_date,
    phone:            s.phone,
    email:            s.email,
    notes:            s.notes,
    metadata:         s.metadata,
    createdAt:        s.created_at,
    updatedAt:        s.updated_at,
    archivedAt:       s.archived_at,
    kpiTargets:       s.kpi_targets || {},
    kioskPin:         s.kiosk_pin || "",
    // Whether this store currently accepts applications on /apply.
    // Defaults to true at the DB level; we coerce nullish to true here
    // defensively in case PostgREST returns null during the brief window
    // between ALTER TABLE and schema-cache reload.
    isHiring:         s.is_hiring ?? true,
    autoClockoutTime: s.auto_clockout_time || "",
    latitude:         (s.lat ?? s.latitude) == null ? null : Number(s.lat ?? s.latitude),
    longitude:        (s.lng ?? s.longitude) == null ? null : Number(s.lng ?? s.longitude),
    geofenceRadius:   s.geofence_radius == null ? 200 : Number(s.geofence_radius),
  };
}

function dbFlipdishOrderToApp(o) {
  return {
    id:                 o.id,
    flipdishStoreId:    o.store_id,
    brandId:            o.brand_id,
    state:              o.state,
    paymentAccountType: o.payment_account_type,
    orderPlacedTime:    o.order_placed_time,
    requestedForTime:   o.requested_for_time,
    acceptedTime:       o.accepted_time,
    channel:            o.channel,            // online | pos | extra (from flipdish_stores)
    customerName:       o.customer_name,
    customerId:         o.customer_id,
    customerPhone:      o.customer_phone,
    orderType:          o.order_type,
    amountTotal:        o.amount_total ? parseFloat(o.amount_total) : 0,
    amountSubtotal:     o.amount_subtotal ? parseFloat(o.amount_subtotal) : 0,
    amountTax:          o.amount_tax ? parseFloat(o.amount_tax) : 0,
    amountTip:          o.amount_tip ? parseFloat(o.amount_tip) : 0,
    amountDelivery:     o.amount_delivery ? parseFloat(o.amount_delivery) : 0,
    amountVoucher:      o.amount_voucher ? parseFloat(o.amount_voucher) : 0,
    amountServiceFee:   o.amount_service_fee ? parseFloat(o.amount_service_fee) : 0,
    itemCount:          o.item_count || 0,
    uniqueItemCount:    o.unique_item_count || 0,
    items:              o.items || [],
    voucher:            o.voucher,
    deliveryLocation:   o.delivery_location,
  };
}

function dbFlipdishStoreToApp(s) {
  return {
    id:        s.id,
    storeId:   s.store_id,
    brandId:   s.brand_id,
    name:      s.name,
    channel:   s.channel,
    currency:  s.currency,
    isActive:  s.is_active,
    menuId:    s.menu_id,
  };
}

export async function fetchStores() {
  const { data, error } = await supabase.from("stores").select("*").order("short_name");
  if (error) throw error;
  return (data || []).map(dbStoreToApp);
}

export async function fetchFlipdishStores() {
  const { data, error } = await supabase.from("flipdish_stores").select("*");
  if (error) throw error;
  return (data || []).map(dbFlipdishStoreToApp);
}

// ─── Store CRUD (admin only) ──────────────────────────────────────────────────
// All inputs use the camelCase app-shape; we translate to snake_case for the DB.
// Returns the inserted/updated row in app-shape so callers can just setState(...).

function appStoreToDb(s) {
  // Whitelist only the fields the admin form ever touches. Avoids accidentally
  // wiping metadata, raw, or other backend-managed columns.
  const row = {};
  if (s.id              !== undefined) row.id               = s.id;
  if (s.brandId         !== undefined) row.brand_id         = s.brandId;
  if (s.shortName       !== undefined) row.short_name       = s.shortName;
  if (s.name            !== undefined) row.name             = s.name;
  if (s.ownershipModel  !== undefined) row.ownership_model  = s.ownershipModel;
  if (s.siteType        !== undefined) row.site_type        = s.siteType || "shop";
  if (s.franchiseeName  !== undefined) row.franchisee_name  = s.franchiseeName || null;
  if (s.status          !== undefined) row.status           = s.status;
  if (s.address         !== undefined) row.address          = s.address || null;
  if (s.city            !== undefined) row.city             = s.city || null;
  if (s.postcode        !== undefined) row.postcode         = s.postcode || null;
  if (s.country         !== undefined) row.country          = s.country || "United Kingdom";
  if (s.phone           !== undefined) row.phone            = s.phone || null;
  if (s.email           !== undefined) row.email            = s.email || null;
  if (s.notes           !== undefined) row.notes            = s.notes || null;
  if (s.kpiTargets      !== undefined) row.kpi_targets      = s.kpiTargets || {};
  if (s.kioskPin        !== undefined) row.kiosk_pin        = s.kioskPin || null;
  if (s.isHiring        !== undefined) row.is_hiring        = !!s.isHiring;
  if (s.autoClockoutTime !== undefined) row.auto_clockout_time = s.autoClockoutTime || null;
  if (s.latitude        !== undefined) row.lat            = s.latitude === "" || s.latitude == null ? null : Number(s.latitude);
  if (s.longitude       !== undefined) row.lng            = s.longitude === "" || s.longitude == null ? null : Number(s.longitude);
  if (s.geofenceRadius  !== undefined) row.geofence_radius = s.geofenceRadius == null ? 200 : Number(s.geofenceRadius);
  return row;
}

export async function insertStore(store) {
  const row = appStoreToDb(store);
  const { data, error } = await supabase.from("stores").insert(row).select().single();
  if (error) throw error;
  return dbStoreToApp(data);
}

export async function updateStore(id, patch) {
  const row = appStoreToDb(patch);
  // Drop .single() — under some Supabase configurations (stale schema cache,
  // RLS policies that hide rows from SELECT after UPDATE), PostgREST returns
  // PGRST116 "no rows" even when the UPDATE succeeded. Using a plain array
  // response avoids the false error; we fall back to a fresh fetch if needed.
  const { data, error } = await supabase
    .from("stores").update(row).eq("id", id).select();
  if (error) throw error;
  if (data && data.length > 0) return dbStoreToApp(data[0]);
  // UPDATE succeeded but SELECT returned nothing (likely RLS) — refetch by id.
  const { data: fresh, error: fetchErr } = await supabase
    .from("stores").select("*").eq("id", id).maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!fresh) throw new Error(`Store ${id} updated but could not be retrieved — check RLS policies.`);
  return dbStoreToApp(fresh);
}

export async function deleteStore(id) {
  // Caller is responsible for unlinking flipdish_stores rows first if they
  // exist — otherwise the FK constraint will block this. We surface the error.
  const { error } = await supabase.from("stores").delete().eq("id", id);
  if (error) throw error;
  return { id };
}

// ─── Flipdish-store linkage CRUD ──────────────────────────────────────────────
// Used by the admin form to attach RMS Flipdish stores to a physical store row.
// Each Flipdish store is (RMS store_id, channel) — same physical site can have
// multiple rows for POS / online / Uber / Deliveroo etc.

export async function linkFlipdishStore(flipdishStoreId, storeId) {
  const { data, error } = await supabase
    .from("flipdish_stores")
    .update({ store_id: storeId })
    .eq("id", flipdishStoreId)
    .select().single();
  if (error) throw error;
  return dbFlipdishStoreToApp(data);
}

export async function unlinkFlipdishStore(flipdishStoreId) {
  const { data, error } = await supabase
    .from("flipdish_stores")
    .update({ store_id: null })
    .eq("id", flipdishStoreId)
    .select().single();
  if (error) throw error;
  return dbFlipdishStoreToApp(data);
}

// Backfill: link all existing flipdish_sales rows for a given brand to a store.
// Useful right after creating a new store record so its historical sales become
// visible on the dashboard.
export async function backfillSalesStoreId(brandId, storeId) {
  const { data, error } = await supabase
    .from("flipdish_sales")
    .update({ store_id: storeId })
    .eq("brand_id", brandId)
    .is("store_id", null)
    .select("sale_id");
  if (error) throw error;
  return { linked: (data || []).length };
}

// ─── Store Departments + Roles (per-store org structure) ──────────────────────
// Backed by the store_departments and store_roles tables added in Stage 1.
// Each store has its own set; managers/owners can create/edit/archive.
// We use soft delete (archived_at = now()) so historical references survive.

function dbStoreDepartmentToApp(d) {
  return {
    id:         d.id,
    storeId:    d.store_id,
    name:       d.name,
    sortOrder:  d.sort_order ?? 0,
    createdAt:  d.created_at,
    updatedAt:  d.updated_at,
    archivedAt: d.archived_at,
  };
}

function appStoreDepartmentToDb(d) {
  const row = {};
  if (d.id         !== undefined) row.id         = d.id;
  if (d.storeId    !== undefined) row.store_id   = d.storeId;
  if (d.name       !== undefined) row.name       = d.name;
  if (d.sortOrder  !== undefined) row.sort_order = d.sortOrder;
  if (d.archivedAt !== undefined) row.archived_at = d.archivedAt;
  return row;
}

function dbStoreRoleToApp(r) {
  return {
    id:                   r.id,
    storeId:              r.store_id,
    departmentId:         r.department_id,
    name:                 r.name,
    hourlyRate:           r.hourly_rate != null ? Number(r.hourly_rate) : null,
    isManagement:         r.is_management ?? false,
    sortOrder:            r.sort_order ?? 0,
    createdAt:            r.created_at,
    updatedAt:            r.updated_at,
    archivedAt:           r.archived_at,
    // When true, this role appears in the /apply form's position dropdown
    // for its store. Default false — roles aren't "open positions" by
    // definition; HQ explicitly opts in when actively recruiting.
    advertiseForHiring:   r.advertise_for_hiring ?? false,
  };
}

function appStoreRoleToDb(r) {
  const row = {};
  if (r.id                  !== undefined) row.id                   = r.id;
  if (r.storeId             !== undefined) row.store_id             = r.storeId;
  if (r.departmentId        !== undefined) row.department_id        = r.departmentId || null;
  if (r.name                !== undefined) row.name                 = r.name;
  if (r.hourlyRate          !== undefined) row.hourly_rate          = r.hourlyRate === "" || r.hourlyRate == null ? null : Number(r.hourlyRate);
  if (r.isManagement        !== undefined) row.is_management        = !!r.isManagement;
  if (r.sortOrder           !== undefined) row.sort_order           = r.sortOrder;
  if (r.archivedAt          !== undefined) row.archived_at          = r.archivedAt;
  if (r.advertiseForHiring  !== undefined) row.advertise_for_hiring = !!r.advertiseForHiring;
  return row;
}

export async function fetchStoreDepartments() {
  // We fetch ALL departments (including archived) and let the UI filter,
  // since active/archived counts are useful to display.
  const { data, error } = await supabase
    .from("store_departments")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name",       { ascending: true });
  if (error) throw error;
  return (data || []).map(dbStoreDepartmentToApp);
}

export async function fetchStoreRoles() {
  const { data, error } = await supabase
    .from("store_roles")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name",       { ascending: true });
  if (error) throw error;
  return (data || []).map(dbStoreRoleToApp);
}

export async function insertStoreDepartment(dept) {
  // ID is caller-supplied to avoid a server round-trip for the id alone.
  // Format: "dept-{storeId-tail}-{slug}" e.g. "dept-evington-road-kitchen"
  const row = appStoreDepartmentToDb({
    ...dept,
    id: dept.id || `dept-${Date.now()}`,
  });
  const { data, error } = await supabase
    .from("store_departments").insert(row).select().single();
  if (error) throw error;
  return dbStoreDepartmentToApp(data);
}

export async function updateStoreDepartment(id, patch) {
  // updated_at intentionally NOT written here — trigger handles it.
  const row = appStoreDepartmentToDb({ ...patch, updatedAt: undefined });
  // Same RLS-tolerant pattern as updateStoreRole — see explanation there.
  const { data, error } = await supabase
    .from("store_departments").update(row).eq("id", id).select();
  if (error) throw error;
  if (data && data.length > 0) return dbStoreDepartmentToApp(data[0]);
  const { data: fresh, error: fetchErr } = await supabase
    .from("store_departments").select("*").eq("id", id).maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!fresh) throw new Error(`Department ${id} updated but could not be retrieved.`);
  return dbStoreDepartmentToApp(fresh);
}

export async function archiveStoreDepartment(id) {
  // Soft delete — preserves history for any ops_team / schedules referencing it
  return updateStoreDepartment(id, { archivedAt: new Date().toISOString() });
}

export async function unarchiveStoreDepartment(id) {
  return updateStoreDepartment(id, { archivedAt: null });
}

export async function insertStoreRole(role) {
  const row = appStoreRoleToDb({
    ...role,
    id: role.id || `role-${Date.now()}`,
  });
  const { data, error } = await supabase
    .from("store_roles").insert(row).select().single();
  if (error) throw error;
  return dbStoreRoleToApp(data);
}

export async function updateStoreRole(id, patch) {
  // updated_at intentionally NOT written here — a DB trigger (added in
  // fix_store_roles_updated_at.sql) handles it server-side. Writing it
  // explicitly would also work but would race with the trigger's value.
  const row = appStoreRoleToDb({ ...patch, updatedAt: undefined });
  // Same RLS-tolerant pattern as updateStore. Dropping .single() avoids
  // false PGRST116 errors when PostgREST's schema cache is stale or RLS
  // policies hide the row from SELECT-after-UPDATE. If the response array
  // is empty, we refetch defensively before declaring failure.
  const { data, error } = await supabase
    .from("store_roles").update(row).eq("id", id).select();
  if (error) throw error;
  if (data && data.length > 0) return dbStoreRoleToApp(data[0]);
  // UPDATE worked but SELECT returned nothing — fetch fresh
  const { data: fresh, error: fetchErr } = await supabase
    .from("store_roles").select("*").eq("id", id).maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!fresh) throw new Error(`Role ${id} updated but could not be retrieved.`);
  return dbStoreRoleToApp(fresh);
}

export async function archiveStoreRole(id) {
  return updateStoreRole(id, { archivedAt: new Date().toISOString() });
}

export async function unarchiveStoreRole(id) {
  return updateStoreRole(id, { archivedAt: null });
}

// Copy-from-another-store: clone all active departments + roles from a source
// store into a target store. New IDs generated; archived items excluded.
// Returns counts so the UI can show "Copied N depts and M roles".
export async function copyStoreStructure(sourceStoreId, targetStoreId) {
  if (!sourceStoreId || !targetStoreId || sourceStoreId === targetStoreId) {
    throw new Error("Source and target stores must be different and non-empty.");
  }
  // Fetch source structure
  const [{ data: sDepts, error: e1 }, { data: sRoles, error: e2 }] = await Promise.all([
    supabase.from("store_departments").select("*").eq("store_id", sourceStoreId).is("archived_at", null),
    supabase.from("store_roles").select("*").eq("store_id", sourceStoreId).is("archived_at", null),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  // Insert departments first, recording old→new ID mapping so we can rewire
  // role.department_id correctly.
  const deptIdMap = {};
  const newDepts = (sDepts || []).map(d => {
    const newId = `dept-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    deptIdMap[d.id] = newId;
    return {
      id:         newId,
      store_id:   targetStoreId,
      name:       d.name,
      sort_order: d.sort_order || 0,
    };
  });
  if (newDepts.length > 0) {
    const { error } = await supabase.from("store_departments").insert(newDepts);
    if (error) throw error;
  }

  // Then roles, rewiring department_id through the map
  const newRoles = (sRoles || []).map(r => ({
    id:            `role-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    store_id:      targetStoreId,
    department_id: r.department_id ? (deptIdMap[r.department_id] || null) : null,
    name:          r.name,
    hourly_rate:   r.hourly_rate,
    is_management: r.is_management || false,
    sort_order:    r.sort_order || 0,
  }));
  if (newRoles.length > 0) {
    const { error } = await supabase.from("store_roles").insert(newRoles);
    if (error) throw error;
  }

  return { departments: newDepts.length, roles: newRoles.length };
}

// Pull flipdish orders for a date window — defaults to last 30 days
export async function fetchFlipdishOrders({ from, to, limit = 5000 } = {}) {
  const fromDate = from || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const toDate   = to   || new Date().toISOString();
  const { data, error } = await supabase
    .from("flipdish_orders")
    .select("*")
    .gte("order_placed_time", fromDate)
    .lte("order_placed_time", toDate)
    .order("order_placed_time", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(dbFlipdishOrderToApp);
}

export async function fetchFlipdishSyncLog(limit = 10) {
  const { data, error } = await supabase
    .from("flipdish_sync_log")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
// One stream feeds the in-app bell now and a future email layer later.
// recipient_type 'user' = users table (managers/owners/HQ); 'ops' = ops_team.
function dbNotificationToApp(n) {
  return {
    id: n.id, recipientType: n.recipient_type, recipientId: n.recipient_id,
    kind: n.kind, title: n.title, body: n.body || "", linkView: n.link_view || null,
    createdAt: n.created_at, readAt: n.read_at,
  };
}

export async function fetchNotifications({ recipientType, recipientId, limit = 30 } = {}) {
  if (!recipientType || !recipientId) return [];
  const { data, error } = await supabase.from("notifications").select("*")
    .eq("recipient_type", recipientType).eq("recipient_id", recipientId)
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []).map(dbNotificationToApp);
}

export async function markNotificationRead(id) {
  const { error } = await supabase.from("notifications")
    .update({ read_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead({ recipientType, recipientId } = {}) {
  if (!recipientType || !recipientId) return;
  const { error } = await supabase.from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_type", recipientType).eq("recipient_id", recipientId)
    .is("read_at", null);
  if (error) throw error;
}

export async function insertNotifications(rows) {
  if (!rows || rows.length === 0) return;
  const payload = rows.map(r => ({
    recipient_type: r.recipientType, recipient_id: r.recipientId,
    kind: r.kind, title: r.title, body: r.body || null, link_view: r.linkView || null,
  }));
  const { error } = await supabase.from("notifications").insert(payload);
  if (error) throw error;
  // WEB_PUSH_V2 — push is now sent SERVER-SIDE by the notify-push-webhook Edge
  // Function (fires automatically on this INSERT via a Supabase Database Webhook).
  // No browser-side sendPush here: it's more reliable and avoids double-pushing.
}

// Invoke the send-push Edge Function (background; failures are swallowed).
export async function sendPush({ recipientType, recipientId, title, body, linkView } = {}) {
  try {
    await supabase.functions.invoke("send-push", {
      body: { recipientType, recipientId, title, body, linkView },
    });
  } catch (e) { /* push is best-effort */ }
}

// WEB_PUSH_V1 — register the service worker + subscribe this device to push,
// then store the subscription. Call after the user grants notification permission.
const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY || "";
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
// Send a test notification to the CURRENT user's own device. Ensures a fresh
// subscription exists, then inserts a self-addressed notification row — which
// fires the push webhook just like a real notification. Returns the subscribe
// result so the UI can report problems (e.g. permission denied).
export async function sendTestNotification({ recipientType, recipientId } = {}) {
  if (!recipientId) return { ok: false, reason: "no-recipient" };
  // Subscribe this device first (no-op if already subscribed).
  const sub = await subscribeToPush({ recipientType, recipientId });
  if (sub && sub.ok === false) return sub;   // surface denied/unsupported to UI
  // Push to this recipient's device(s). (Endpoint-precise targeting proved
  // fragile — exact-match failures gave total:0 — so we push to the recipient,
  // which reliably reaches this device. Acceptable: only the user's own devices.)
  try {
    const { data, error } = await supabase.functions.invoke("send-push", {
      body: {
        recipientType, recipientId,
        title: "Test notification ✓",
        body: "Push notifications are working on this device.",
      },
    });
    if (error) return { ok: false, reason: String(error?.message || error) };
    // Surface the function's result so the UI can say e.g. "sent 0 — no device subscribed".
    return { ok: true, sent: data?.sent, total: data?.total, removed: data?.removed };
  } catch (e) { return { ok: false, reason: String(e?.message || e) }; }
}

// Force a clean re-subscription: drop this device's old (possibly stale)
// subscription, unsubscribe from the browser push manager, then subscribe
// fresh against the CURRENT service worker. Fixes "sent OK but nothing arrives"
// after the SW changed (old endpoint became dead).
export async function resubscribeToPush({ recipientType, recipientId } = {}) {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return { ok: false, reason: "unsupported" };
    if (Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return { ok: false, reason: "denied" };
    }
    const reg = await navigator.serviceWorker.ready;
    // Remove the browser-side subscription if present.
    try {
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        // Delete the matching DB row(s) for this endpoint first.
        try { await supabase.from("push_subscriptions").delete().eq("endpoint", existing.endpoint); } catch {}
        await existing.unsubscribe();
      }
    } catch {}
    // Also clear any other stored subs for this recipient (stale endpoints).
    try { await supabase.from("push_subscriptions").delete().eq("recipient_type", recipientType).eq("recipient_id", recipientId); } catch {}
    // Fresh subscribe.
    return await subscribeToPush({ recipientType, recipientId });
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

export async function subscribeToPush({ recipientType, recipientId } = {}) {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return { ok: false, reason: "unsupported" };
    if (!VAPID_PUBLIC_KEY) return { ok: false, reason: "no-vapid-key" };
    if (Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return { ok: false, reason: "denied" };
    }
    const reg = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
    try { await reg.update(); } catch {}   // force-check for a newer sw.js (replaces a stale one)
    // When a new SW takes control, reload once so the app runs the latest code
    // (prevents staff getting stuck on a stale cached bundle). Guarded against loops.
    if (!window.__swReloadHooked) {
      window.__swReloadHooked = true;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (window.__swReloaded) return;
        window.__swReloaded = true;
        window.location.reload();
      });
    }
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = sub.toJSON();
    await supabase.from("push_subscriptions").upsert({
      id: `ps-${recipientType}-${recipientId}-${btoa(json.endpoint).slice(0, 24)}`,
      recipient_type: recipientType, recipient_id: recipientId,
      endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth,
      user_agent: navigator.userAgent || null,
    }, { onConflict: "endpoint" });
    return { ok: true, endpoint: json.endpoint };
  } catch (e) {
    console.error("subscribeToPush failed:", e);
    return { ok: false, reason: String(e?.message || e) };
  }
}

// Notify the relevant managers/owners/HQ. Owners + hq_staff always receive;
// managers receive when the brand/store matches their assignment (or when no
// brand/store is given). FIRE-AND-FORGET: never throws — a notification
// failure must never break the action that triggered it.
export async function notifyManagers({ brandId, storeId, kind, title, body, linkView, excludeUserId } = {}) {
  try {
    const { data, error } = await supabase.from("users").select("id, role, brand_ids, store_ids");
    if (error) throw error;
    const recipients = (data || []).filter(u => {
      if (excludeUserId && u.id === excludeUserId) return false;
      if (u.role === "owner" || u.role === "hq_staff") return true;
      if (u.role === "manager") {
        const brandOk = !brandId || (u.brand_ids || []).includes(brandId);
        const storeOk = !storeId || (u.store_ids || []).includes(storeId);
        return brandOk && storeOk;
      }
      return false;
    });
    await insertNotifications(recipients.map(u => ({
      recipientType: "user", recipientId: u.id, kind, title, body, linkView,
    })));
  } catch (e) { console.error("notifyManagers failed:", e); }
}

// Notify a single employee (ops_team member). FIRE-AND-FORGET like above.
export async function notifyOpsMember(opsMemberId, { kind, title, body, linkView } = {}) {
  try {
    if (!opsMemberId) return;
    await insertNotifications([{ recipientType: "ops", recipientId: opsMemberId, kind, title, body, linkView }]);
  } catch (e) { console.error("notifyOpsMember failed:", e); }
}

// Notify several ops members at once (fire-and-forget).
export async function notifyOpsMembers(opsMemberIds, { kind, title, body, linkView } = {}) {
  try {
    const ids = [...new Set((opsMemberIds || []).filter(Boolean))];
    if (ids.length === 0) return;
    await insertNotifications(ids.map(id => ({ recipientType: "ops", recipientId: id, kind, title, body, linkView })));
  } catch (e) { console.error("notifyOpsMembers failed:", e); }
}

// Notify the recipients of an inbox message (individual, location, or broadcast).
// Excludes the sender. Resolves recipients from users + ops_team by scope.
export async function notifyMessageRecipients(msg) {
  try {
    if (!msg) return;
    const title = `New message from ${msg.fromName || "a colleague"}`;
    const body = (msg.body || msg.text || "").slice(0, 120) || "Open Communication to read.";
    const payload = { kind: "message", title, body, linkView: "comms" };
    if (msg.toScope === "individual" && msg.toPersonId) {
      // recipient may be a user OR an ops member — notify both id spaces (harmless if one misses).
      await insertNotifications([
        { recipientType: "ops",  recipientId: msg.toPersonId, ...payload },
        { recipientType: "user", recipientId: msg.toPersonId, ...payload },
      ]);
      return;
    }
    // location or all_locations -> notify ops members in scope (exclude sender)
    let q = supabase.from("ops_team").select("id, brand_id, archived_at");
    const { data, error } = await q;
    if (error) throw error;
    const recipients = (data || []).filter(m => !m.archived_at && m.id !== msg.fromId &&
      (msg.toScope === "all_locations" || (msg.toScope === "location" && m.brand_id === msg.toBrandId)));
    await insertNotifications(recipients.map(m => ({ recipientType: "ops", recipientId: m.id, ...payload })));
  } catch (e) { console.error("notifyMessageRecipients failed:", e); }
}

// Trigger a manual flipdish sync from the UI
export async function runFlipdishSync(body = {}) {
  // Calls the LIVE RMS sales sync (flipdish-rms-sync). The old "flipdish-sync"
  // function (webhook /orders pipeline) is dead — do not invoke it.
  // The function requires the shared secret (x-sync-secret); provide it via the
  // REACT_APP_SYNC_SECRET env var (set in Vercel). Note: CRA env vars are baked
  // into the public bundle — this guards against scanners, not bundle readers.
  // Empty body {} = rolling window (yesterday + today).
  const headers = {};
  if (process.env.REACT_APP_SYNC_SECRET) headers["x-sync-secret"] = process.env.REACT_APP_SYNC_SECRET;
  const { data, error } = await supabase.functions.invoke("flipdish-rms-sync", { body, headers });
  if (error) throw error;
  return data;
}

// ════════════════════════════════════════════════════════════════════════════
// FLIPDISH SALES — webhook-driven, includes POS / UberEats / Deliveroo / JustEats / FlipdishWebApp
// ════════════════════════════════════════════════════════════════════════════
function dbFlipdishSaleToApp(s) {
  return {
    saleId:         s.sale_id,
    brandId:        s.brand_id,
    orgId:          s.org_id,
    propertyId:     s.property_id,
    salesChannelId: s.sales_channel_id,
    channel:        s.channel,                    // POS | UberEats | Deliveroo | JustEats | FlipdishWebApp | FlipdishKIOSK | Web
    externalId:     s.external_id,
    status:         s.status,
    firstEventAt:   s.first_event_at,
    lastEventAt:    s.last_event_at,
    eventCount:     s.event_count || 0,
    storeId:        s.store_id,                   // our internal store_id (via property_id map)
    // RMS Reporting API fields (per-sale amounts across all channels)
    amountTotal:    s.amount_total    != null ? Number(s.amount_total)    : null,
    amountSubtotal: s.amount_subtotal != null ? Number(s.amount_subtotal) : null,
    amountTax:      s.amount_tax      != null ? Number(s.amount_tax)      : null,
    amountDiscount: s.amount_discount != null ? Number(s.amount_discount) : null,
    amountPaid:     s.amount_paid     != null ? Number(s.amount_paid)     : null,
    businessDate:   s.business_date,
    saleTime:       s.sale_time,
    propertyName:   s.property_name,
    storefrontType: s.storefront_type,
    paymentMethod:  s.payment_method,
    isCancelled:    !!s.is_cancelled,
    isFullyRefunded:!!s.is_fully_refunded,
  };
}

export async function fetchFlipdishSales({ from, to, limit = 50000, brandId = "chocoberry" } = {}) {
  // Select only the lean columns the dashboard needs — skip raw_rms, sale_items,
  // discounts_detail, receipt_lines (each ~5-50KB per row). For 30k+ rows
  // selecting * causes statement timeout.
  const cols = [
    "sale_id", "brand_id", "channel", "store_id", "status",
    "first_event_at", "last_event_at", "event_count",
    "amount_total", "amount_subtotal", "amount_tax", "amount_discount", "amount_paid",
    "business_date", "sale_time", "property_name", "storefront_type",
    "payment_method", "is_cancelled", "is_fully_refunded",
  ].join(",");

  // Default: last 35 days. App.js fetches once on mount and filters in memory,
  // so this must cover the longest UI period (30d) + a small buffer for the
  // prior-period comparison. Don't drop below 35 without first refactoring
  // App.js to re-fetch when the period selector changes.
  const effFrom = from || new Date(Date.now() - 35 * 24 * 3600 * 1000);

  // business_date is a `date` column — pass YYYY-MM-DD, not an ISO timestamp.
  // Using business_date (not first_event_at) so trading-day semantics are correct:
  // a late-night sale belongs to the day the operator considers it part of.
  const toIsoDate = (v) => {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "string") return v.slice(0, 10);
    return v;
  };

  // Page through results in 10000-row chunks (matches Supabase project's
  // max_rows setting). Five round-trips to fetch 42k rows instead of forty-three.
  // If the server cap is lower than PAGE, the first response will return fewer
  // rows than asked for — we adapt and use the actual returned size as our
  // stride, so we never wrongly bail out after a short first page.
  let PAGE = 10000;
  let actualPageSize = null;
  const out = [];
  let offset = 0;

  while (offset < limit) {
    const upper = Math.min(offset + PAGE, limit) - 1;
    let q = supabase
      .from("flipdish_sales")
      .select(cols)                                 // no count:exact — the extra COUNT(*) on first page can blow statement_timeout
      .order("business_date", { ascending: false })
      .order("sale_time",     { ascending: false }); // stable secondary sort

    if (brandId) q = q.eq("brand_id", brandId);     // default: Chocoberry only (excludes Tove)
    q = q.gte("business_date", toIsoDate(effFrom));
    if (to) q = q.lte("business_date", toIsoDate(to));
    q = q.not("amount_total", "is", null);          // excludes inert br1153 webhook rows
    q = q.range(offset, upper);

    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;          // genuinely no more rows — stop
    out.push(...data);

    // On the first response, learn the server's actual page size cap.
    // If the server returned fewer rows than we asked for, that's our stride
    // for subsequent calls — *not* a signal to stop. Only an empty response stops us.
    if (actualPageSize === null) {
      actualPageSize = data.length;
      if (actualPageSize < PAGE) PAGE = actualPageSize;
    }

    if (data.length < PAGE) break;                  // last page (smaller than the known stride)
    offset += PAGE;
  }

  // eslint-disable-next-line no-console
  console.log(`[fetchFlipdishSales] fetched ${out.length} rows across ${Math.ceil(out.length / Math.max(PAGE, 1))} page(s)`);

  return out.map(dbFlipdishSaleToApp);
}

// ────────────────────────────────────────────────────────────────────────────
// ITEMS SOLD — period-scoped fetch of sale_items, aggregated for product-mix.
// Deliberately SEPARATE from fetchFlipdishSales (which excludes sale_items for
// performance). This pulls sale_items ONLY for the chosen window and aggregates
// in-app, so the heavy JSON never loads for the whole 35-day range.
// Returns { items: [{caption, category, quantity, revenue, refunds}], totalUnits, totalRevenue }.
// ────────────────────────────────────────────────────────────────────────────
// Hour×day heatmap grid for the period (server-side).
export async function fetchSalesHeatmap({ from, to, brandId = "chocoberry" } = {}) {
  const toIsoDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "string" ? v.slice(0, 10) : v);
  const { data, error } = await supabase.rpc("agg_flipdish_heatmap", {
    p_brand_id: brandId, p_from: toIsoDate(from), p_to: toIsoDate(to),
  });
  if (error) throw error;
  return (data || []).map(r => ({ dow: Number(r.dow), hour: Number(r.hour), cnt: Number(r.cnt) || 0 }));
}

// Latest sale timestamp for a brand (for the "latest sale Xm ago" indicator).
export async function fetchLastSaleTime(brandId = "chocoberry") {
  const { data, error } = await supabase.rpc("agg_flipdish_last_sale", { p_brand_id: brandId });
  if (error) throw error;
  return data ? new Date(data) : null;
}

// Per-store raw sales for the store-detail modal — scoped to ONE store + period
// (small, lazy; only runs when a store is opened). Uses the lean column set.
export async function fetchStoreSales({ storeId, from, to, brandId = "chocoberry" } = {}) {
  if (!storeId) return [];
  const toIsoDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "string" ? v.slice(0, 10) : v);
  const { data, error } = await supabase
    .from("flipdish_sales")
    .select("sale_id, channel, amount_total, business_date, sale_time, store_id, is_cancelled")
    .eq("brand_id", brandId)
    .eq("store_id", storeId)
    .gte("business_date", toIsoDate(from))
    .lte("business_date", toIsoDate(to))
    .order("sale_time", { ascending: false });
  if (error) throw error;
  return (data || [])
    .filter(s => !s.is_cancelled)
    .map(s => ({
      saleId: s.sale_id, channel: s.channel, amountTotal: Number(s.amount_total) || 0,
      businessDate: s.business_date, saleTime: s.sale_time, storeId: s.store_id,
    }));
}

// Richer per-store sales for the comprehensive Store Analytics dashboard.
// Includes payment method, refund flags, discount, and sale_items so the
// dashboard can compute channel mix, heatmap, payments, refunds, and top items
// TRULY store-scoped (not brand-wide). Scoped to one store + period so the
// heavier sale_items column is bounded. KEEPS cancelled rows (flagged) so the
// dashboard can report cancellations/refunds.
export async function fetchStoreSalesDetailed({ storeId, from, to, brandId = "chocoberry" } = {}) {
  if (!storeId) return [];
  const toIsoDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "string" ? v.slice(0, 10) : v);
  const { data, error } = await supabase
    .from("flipdish_sales")
    .select("sale_id, channel, amount_total, amount_subtotal, amount_tax, amount_discount, business_date, sale_time, store_id, payment_method, is_cancelled, is_fully_refunded, sale_items")
    // FIX_BRAND_SCOPE_V1: store_id is globally unique; the hardcoded brand_id
    // filter ("chocoberry") silently blanked every non-Chocoberry store (e.g. Tove).
    .eq("store_id", storeId)
    .gte("business_date", toIsoDate(from))
    .lte("business_date", toIsoDate(to))
    .order("sale_time", { ascending: false });
  if (error) throw error;
  return (data || []).map(s => ({
    saleId:         s.sale_id,
    channel:        s.channel,
    amountTotal:    Number(s.amount_total) || 0,
    amountSubtotal: s.amount_subtotal != null ? Number(s.amount_subtotal) : null,
    amountTax:      s.amount_tax != null ? Number(s.amount_tax) : null,
    amountDiscount: Number(s.amount_discount) || 0,
    businessDate:   s.business_date,
    saleTime:       s.sale_time,
    storeId:        s.store_id,
    paymentMethod:  s.payment_method || "Unknown",
    isCancelled:    !!s.is_cancelled,
    isFullyRefunded:!!s.is_fully_refunded,
    saleItems:      Array.isArray(s.sale_items) ? s.sale_items : [],
  }));
}

export async function fetchItemsSold({ from, to, brandId = "chocoberry" } = {}) {
  const toIsoDate = (v) => {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "string") return v.slice(0, 10);
    return v;
  };
  const { data, error } = await supabase.rpc("agg_flipdish_items", {
    p_brand_id: brandId,
    p_from: toIsoDate(from),
    p_to:   toIsoDate(to),
  });
  if (error) throw error;
  const items = (data || []).map(r => ({
    caption:  r.caption,
    category: r.category,
    quantity: Number(r.quantity) || 0,
    revenue:  Number(r.revenue) || 0,
  }));
  const totalUnits   = items.reduce((a, i) => a + i.quantity, 0);
  const totalRevenue = items.reduce((a, i) => a + i.revenue, 0);
  return { items, totalUnits, totalRevenue, saleCount: items.length };
}

// Server-side per-store × channel sales aggregation (complete, fast — replaces
// the raw-row fetch that was truncating at the statement timeout and
// undercounting). Returns rows: { store_id, channel, sale_count, revenue }.
export async function fetchSalesAggregated({ from, to, brandId = "chocoberry" } = {}) {
  const toIsoDate = (v) => {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "string") return v.slice(0, 10);
    return v;
  };
  const { data, error } = await supabase.rpc("agg_flipdish_sales", {
    p_brand_id: brandId,
    p_from: toIsoDate(from),
    p_to:   toIsoDate(to),
  });
  if (error) throw error;
  return (data || []).map(r => ({
    storeId:   r.store_id,
    channel:   r.channel,
    saleCount: Number(r.sale_count) || 0,
    revenue:   Number(r.revenue) || 0,
  }));
}

// Day-resolved gross sales (for trend charts) — ONE call returns all days in range.
export async function fetchSalesDaily({ from, to, brandId = "chocoberry" } = {}) {
  const toIsoDate = (v) => (v instanceof Date ? v.toISOString().slice(0,10) : (typeof v === "string" ? v.slice(0,10) : v));
  const { data, error } = await supabase.rpc("agg_flipdish_sales_daily", {
    p_brand_id: brandId, p_from: toIsoDate(from), p_to: toIsoDate(to),
  });
  if (error) throw error;
  return (data || []).map(r => ({
    businessDate: String(r.business_date).slice(0,10), storeId: r.store_id, channel: r.channel,
    saleCount: Number(r.sale_count) || 0, revenue: Number(r.revenue) || 0,
  }));
}

// Time-matched sales: revenue/orders per store/channel over [from,to], counting
// only sales up to cutoffMinutes (minutes since local midnight). Pass null/1440
// for a full day. Used so "today so far" compares to "yesterday up to same time".
export async function fetchSalesToTime({ from, to, cutoffMinutes = null, brandId = "chocoberry" } = {}) {
  const toIsoDate = (v) => (v instanceof Date ? v.toISOString().slice(0,10) : (typeof v === "string" ? v.slice(0,10) : v));
  const { data, error } = await supabase.rpc("agg_flipdish_sales_to_time", {
    p_brand_id: brandId, p_from: toIsoDate(from), p_to: toIsoDate(to),
    p_cutoff_minutes: cutoffMinutes,
  });
  if (error) throw error;
  return (data || []).map(r => ({
    storeId: r.store_id, channel: r.channel,
    saleCount: Number(r.sale_count) || 0, revenue: Number(r.revenue) || 0,
  }));
}

// ── LABOUR vs REVENUE (Phase 0.3) ────────────────────────────────────────────
// Reads the labour_vs_revenue view (store_day_aggregates FULL OUTER JOIN
// labour_day_aggregates). One row per brand/store/day. NULL revenue = labour
// recorded with no sales row that day (and vice versa) — both are signals the
// report surfaces rather than hides. store_id 'unmatched' = punches with no
// store assigned (cost that would otherwise silently vanish).
export async function fetchLabourVsRevenue({ from, to } = {}) {
  let q = supabase.from("labour_vs_revenue").select("*")
    .order("business_date", { ascending: true });
  if (from) q = q.gte("business_date", from);
  if (to)   q = q.lte("business_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(r => ({
    brandId:        r.brand_id,
    storeId:        r.store_id,
    date:           r.business_date,
    revenueNet:     r.revenue_net      == null ? null : Number(r.revenue_net),
    hours:          r.hours_total      == null ? null : Number(r.hours_total),
    overtimeHours:  r.overtime_hours   == null ? null : Number(r.overtime_hours),
    labourCost:     r.labour_cost      == null ? null : Number(r.labour_cost),
    labourPct:      r.labour_pct       == null ? null : Number(r.labour_pct),
    revenuePerHour: r.revenue_per_hour == null ? null : Number(r.revenue_per_hour),
  }));
}

// ── FORECASTS (Phase 1) ──────────────────────────────────────────────────────
// store_day_forecasts keeps one row PER HORIZON per store/day (for honest
// accuracy tracking). For display we want the freshest forecast only = the
// LOWEST horizon_days row for each store/date.
export async function fetchStoreDayForecasts({ from, to } = {}) {
  let q = supabase.from("store_day_forecasts").select("*")
    .order("business_date").order("horizon_days");
  if (from) q = q.gte("business_date", from);
  if (to)   q = q.lte("business_date", to);
  const { data, error } = await q;
  if (error) throw error;
  const best = new Map();
  (data || []).forEach(r => {
    const k = `${r.brand_id}|${r.store_id}|${r.business_date}`;
    const prev = best.get(k);
    if (!prev || r.horizon_days < prev.horizon_days) best.set(k, r);
  });
  return [...best.values()].map(r => ({
    brandId:         r.brand_id,
    storeId:         r.store_id,
    date:            r.business_date,
    horizonDays:     r.horizon_days,
    forecastRevenue: Number(r.forecast_revenue) || 0,
    forecastOrders:  r.forecast_orders == null ? null : Number(r.forecast_orders),
    basisPoints:     r.basis_points,
    method:          r.method,
    factors:         r.factors || null,   // v2: {base_revenue, event_factor, event_name, weather_factor}
  }));
}

// Hourly forecast curve for ONE store/day (drill-down). The view carries one
// row set per horizon; we keep only the freshest (lowest) horizon's curve.
export async function fetchStoreHourForecasts({ storeId, date } = {}) {
  const { data, error } = await supabase.from("store_hour_forecasts").select("*")
    .eq("store_id", storeId).eq("business_date", date)
    .order("horizon_days").order("hour");
  if (error) throw error;
  const rows = data || [];
  if (!rows.length) return [];
  const freshest = rows[0].horizon_days;
  return rows.filter(r => r.horizon_days === freshest).map(r => ({
    hour:            r.hour,
    forecastRevenue: Number(r.forecast_revenue) || 0,
    typicalOrders:   r.typical_orders == null ? null : Number(r.typical_orders),
  }));
}

// Per-horizon accuracy scoreboard (MAPE). Empty until forecast days have
// passed and been scored against actuals — the UI shows "warming up" then.
export async function fetchForecastAccuracySummary() {
  const { data, error } = await supabase.from("forecast_accuracy_summary").select("*");
  if (error) throw error;
  return (data || []).map(r => ({
    horizonDays:    r.horizon_days,
    daysScored:     Number(r.days_scored) || 0,
    mapePct:        r.mape_pct == null ? null : Number(r.mape_pct),
    medianPctError: r.median_pct_error == null ? null : Number(r.median_pct_error),
  }));
}

// Accuracy split by model version — answers "did v2's factors beat plain v1?".
export async function fetchForecastAccuracyByMethod() {
  const { data, error } = await supabase.from("forecast_accuracy_by_method").select("*");
  if (error) throw error;
  return (data || []).map(r => ({
    method:      r.method,
    horizonDays: r.horizon_days,
    daysScored:  Number(r.days_scored) || 0,
    mapePct:     r.mape_pct == null ? null : Number(r.mape_pct),
  }));
}

// ── ONBOARDING BOARD (compact, all-employee fetches) ────────────────────────
export async function fetchContractStatuses() {
  const { data, error } = await supabase.from("employee_contracts")
    .select("employee_id, status, signed_at, sent_at, voided_at");
  if (error) throw error;
  return (data || []).map(r => ({ employeeId: r.employee_id, status: r.status, signedAt: r.signed_at, sentAt: r.sent_at, voidedAt: r.voided_at }));
}

export async function fetchRtwDocuments() {
  const { data, error } = await supabase.from("employee_documents")
    .select("employee_id, doc_type, required_doc_key, status, hr_approved_at, manager_approved_at, rejected_at, archived_at")
    .or("doc_type.ilike.%rtw%,required_doc_key.ilike.%rtw%");
  if (error) throw error;
  return (data || []).filter(r => !r.archived_at).map(r => ({
    employeeId: r.employee_id, status: r.status,
    hrApprovedAt: r.hr_approved_at, managerApprovedAt: r.manager_approved_at, rejectedAt: r.rejected_at,
  }));
}

export async function fetchTrainingOverview() {
  const [{ data: prog, error: e1 }, { data: mods, error: e2 }] = await Promise.all([
    supabase.from("training_progress").select("employee_id, module_id, completed_at, archived_at"),
    supabase.from("training_modules").select("id, store_id, required, archived_at"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return {
    progress: (prog || []).filter(r => !r.archived_at).map(r => ({ employeeId: r.employee_id, moduleId: r.module_id, completedAt: r.completed_at })),
    modules: (mods || []).filter(r => !r.archived_at).map(r => ({ id: r.id, storeId: r.store_id, required: !!r.required })),
  };
}

export async function fetchPolicyAcks() {
  const { data, error } = await supabase.from("policy_acknowledgements")
    .select("employee_id, policy_key");
  if (error) throw error;
  return (data || []).map(r => ({ employeeId: r.employee_id, policyKey: r.policy_key }));
}

// ── PAYMENTS (per store/day/method, for banking reconciliation) ─────────────
export async function fetchStoreDayPayments({ from, to } = {}) {
  let q = supabase.from("store_day_payments").select("*").order("business_date");
  if (from) q = q.gte("business_date", from);
  if (to)   q = q.lte("business_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(r => ({
    brandId:       r.brand_id,
    storeId:       r.store_id,
    date:          r.business_date,
    channel:       r.channel || "Unknown",
    paymentMethod: r.payment_method,
    lineType:      r.line_type,
    lines:         Number(r.lines) || 0,
    amount:        Number(r.amount) || 0,
  }));
}

// ── ITEM AGGREGATES (menu engineering, for ReportsView) ─────────────────────
export async function fetchItemDayAggregates({ from, to } = {}) {
  let q = supabase.from("item_day_aggregates").select("*").order("business_date");
  if (from) q = q.gte("business_date", from);
  if (to)   q = q.lte("business_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(r => ({
    brandId:     r.brand_id,
    storeId:     r.store_id,
    date:        r.business_date,
    category:    r.category,
    item:        r.item,
    qty:         Number(r.qty) || 0,
    revenue:     Number(r.revenue) || 0,
    refundedQty: Number(r.refunded_qty) || 0,
    compedQty:   Number(r.comped_qty) || 0,
  }));
}

// ── ASK THE DATA (Phase 3 slice 3) ──────────────────────────────────────────
export async function askData(question) {
  // Single-question Q&A against aggregates via the ask-data Edge Function.
  // Same secret pattern as runFlipdishSync; the function sends AGGREGATES ONLY
  // to the Claude API (no raw rows, no customer/employee data).
  const headers = {};
  if (process.env.REACT_APP_SYNC_SECRET) headers["x-sync-secret"] = process.env.REACT_APP_SYNC_SECRET;
  const { data, error } = await supabase.functions.invoke("ask-data", { body: { question }, headers });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "ask-data failed");
  return data.answer;
}

// ── WEEKLY NARRATIVE REPORTS (Phase 3) ──────────────────────────────────────
export async function fetchNarrativeReports({ limit = 26 } = {}) {
  const { data, error } = await supabase.from("narrative_reports")
    .select("id, week_start, week_end, body, model, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.id, weekStart: r.week_start, weekEnd: r.week_end,
    body: r.body, model: r.model, createdAt: r.created_at,
  }));
}

// ── SALES AGGREGATES (per store/day, for ReportsView) ───────────────────────
export async function fetchStoreDayAggregates({ from, to } = {}) {
  let q = supabase.from("store_day_aggregates").select("*").order("business_date");
  if (from) q = q.gte("business_date", from);
  if (to)   q = q.lte("business_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(r => ({
    brandId:        r.brand_id,
    storeId:        r.store_id,
    date:           r.business_date,
    orders:         Number(r.orders) || 0,
    revenueGross:   Number(r.revenue_gross) || 0,
    revenueNet:     Number(r.revenue_net) || 0,
    tax:            Number(r.tax) || 0,
    discounts:      Number(r.discounts) || 0,
    atv:            r.atv == null ? null : Number(r.atv),
    cancelledCount: Number(r.cancelled_count) || 0,
    refundedCount:  Number(r.refunded_count) || 0,
    byChannel:      r.by_channel || null,
    byHour:         r.by_hour || null,
  }));
}

// Scored forecast-vs-actual rows (default: 1-day-ahead forecasts only — the
// most meaningful lead time for "how did we do" reporting).
export async function fetchForecastAccuracyRows({ from, to, horizon = 1 } = {}) {
  let q = supabase.from("forecast_accuracy").select("*")
    .eq("horizon_days", horizon)
    .order("business_date", { ascending: false });
  if (from) q = q.gte("business_date", from);
  if (to)   q = q.lte("business_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(r => ({
    brandId:         r.brand_id,
    storeId:         r.store_id,
    date:            r.business_date,
    forecastRevenue: Number(r.forecast_revenue) || 0,
    actualRevenue:   r.actual_revenue == null ? null : Number(r.actual_revenue),
    error:           r.error == null ? null : Number(r.error),
    absPctError:     r.abs_pct_error == null ? null : Number(r.abs_pct_error),
    basisPoints:     r.basis_points,
  }));
}


// ════════════════════════════════════════════════════════════════════════════
// HIRING / ONBOARDING (slice 1)
// ════════════════════════════════════════════════════════════════════════════
// One row per candidate per application. Status transitions are logged via a
// DB trigger into application_status_history — no app-side logging needed.

function dbApplicationToApp(a) {
  return {
    id:                  a.id,
    brandId:             a.brand_id,
    storeId:             a.store_id,
    firstName:           a.first_name,
    lastName:            a.last_name || "",
    email:               a.email || "",
    phone:               a.phone || "",
    position:            a.position || "",
    source:              a.source || "manager_capture",
    availabilityNotes:   a.availability_notes || "",
    applicantNotes:      a.applicant_notes || "",
    status:              a.status,
    rejectionReason:     a.rejection_reason || "",
    opsTeamId:           a.ops_team_id || null,
    createdAt:           a.created_at,
    updatedAt:           a.updated_at,
    createdBy:           a.created_by || null,
    rtwVerified:         !!a.rtw_verified,
    rtwVerifiedBy:       a.rtw_verified_by || null,
    rtwVerifiedAt:       a.rtw_verified_at || null,
    // ── Slice 3 fields ────────────────────────────────────────────────────
    dateOfBirth:         a.date_of_birth || null,           // YYYY-MM-DD or null
    legalStatus:         a.legal_status || "",              // dropdown enum value
    address:             a.address || "",                   // single-line address
    relevantExperience:  a.relevant_experience || "",
    resumeText:          a.resume_text || "",
    photoUrl:            a.photo_url || null,               // public URL for display
    photoPath:           a.photo_path || null,              // storage path for deletion
    isMinor:             !!a.is_minor,                      // computed at submit time
    // ── Slice 4 fields ────────────────────────────────────────────────────
    // Track magic-link email delivery. Default 'pending' until /apply handler
    // calls setApplicationEmailStatus(). Manager surfaces this in dashboard.
    emailLinkStatus:     a.email_link_status || "pending",
    emailLinkSentAt:     a.email_link_sent_at || null,
    emailLinkError:      a.email_link_error || null,
    // ── Slice 5 ────────────────────────────────────────────────────────────
    // Soft-delete from active Hiring view. Set when application is hired
    // (linked to ops_team) or otherwise resolved. Preserved for audit.
    archivedAt:          a.archived_at || null,
  };
}

function appApplicationToDb(a) {
  // ⚠ CRITICAL: This mapper must produce a PARTIAL row that includes only
  // fields actually present in the input `a`. The old version always wrote
  // every column with `a.foo || null` defaults — which meant a status-only
  // update like updateApplication(id, { status: "in_training" }) sent
  // UPDATE ... SET email=null, phone=null, position=null, source='manager_capture', ...
  // ...wiping every field the caller didn't explicitly mention.
  //
  // The fix: each field is conditionally added based on whether the caller
  // included it in their input. Status transitions only touch status.
  // Full inserts still include every field because the caller (insertApplication)
  // passes a complete object.
  const row = {};
  if (a.id            !== undefined) row.id                   = a.id;
  if (a.brandId       !== undefined) row.brand_id             = a.brandId;
  if (a.storeId       !== undefined) row.store_id             = a.storeId;
  if (a.firstName     !== undefined) row.first_name           = a.firstName;
  if (a.lastName      !== undefined) row.last_name            = a.lastName || null;
  if (a.email         !== undefined) row.email                = a.email || null;
  if (a.phone         !== undefined) row.phone                = a.phone || null;
  if (a.position      !== undefined) row.position             = a.position || null;
  if (a.source        !== undefined) row.source               = a.source || "manager_capture";
  if (a.availabilityNotes !== undefined) row.availability_notes = a.availabilityNotes || null;
  if (a.applicantNotes!== undefined) row.applicant_notes      = a.applicantNotes || null;
  if (a.status        !== undefined) row.status               = a.status || "applied";
  if (a.rejectionReason !== undefined) row.rejection_reason   = a.rejectionReason || null;
  if (a.opsTeamId     !== undefined) row.ops_team_id          = a.opsTeamId || null;
  if (a.createdBy     !== undefined) row.created_by           = a.createdBy || null;
  if (a.rtwVerified   !== undefined) row.rtw_verified         = !!a.rtwVerified;
  if (a.rtwVerifiedBy !== undefined) row.rtw_verified_by      = a.rtwVerifiedBy || null;
  if (a.rtwVerifiedAt !== undefined) row.rtw_verified_at      = a.rtwVerifiedAt || null;
  // Slice 3
  if (a.dateOfBirth       !== undefined) row.date_of_birth       = a.dateOfBirth || null;
  if (a.legalStatus       !== undefined) row.legal_status        = a.legalStatus || null;
  if (a.address           !== undefined) row.address             = a.address || null;
  if (a.relevantExperience!== undefined) row.relevant_experience = a.relevantExperience || null;
  if (a.resumeText        !== undefined) row.resume_text         = a.resumeText || null;
  if (a.photoUrl          !== undefined) row.photo_url           = a.photoUrl || null;
  if (a.photoPath         !== undefined) row.photo_path          = a.photoPath || null;
  if (a.isMinor           !== undefined) row.is_minor            = !!a.isMinor;
  // Slice 5
  if (a.archivedAt        !== undefined) row.archived_at         = a.archivedAt;
  return row;
}

export async function fetchApplications() {
  const { data, error } = await supabase
    .from("job_applications")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(dbApplicationToApp);
}

export async function insertApplication(application) {
  // Slice 4 RLS — once RLS is enabled, anonymous /apply submissions can
  // INSERT but cannot SELECT the inserted row (no read access for anon).
  // `.insert(...).select().single()` would throw because the SELECT returns
  // empty under RLS. We handle this gracefully:
  //
  //   1. Try the normal insert+select+single (works for authenticated
  //      dashboard users with full access).
  //   2. If the select returned 0 rows (PGRST116) AND we're on anon, the
  //      INSERT did succeed — we synthesize the saved row from the input.
  //      This is safe because the caller (/apply form) generates the id
  //      client-side and doesn't depend on server-generated fields.
  const dbRow = appApplicationToDb(application);
  const { data, error } = await supabase
    .from("job_applications")
    .insert(dbRow)
    .select();
  if (error) {
    // Real error — surface it
    throw error;
  }
  if (data && data.length > 0) {
    return dbApplicationToApp(data[0]);
  }
  // INSERT succeeded but SELECT returned nothing (anon RLS path).
  // Reconstruct the saved-row shape from the input.
  return dbApplicationToApp(dbRow);
}

// Updates an application. Pass only the fields you want to change; everything
// else is left untouched. Uses the RLS-tolerant pattern: drops .single() so
// stale schema cache or RLS quirks don't cause PGRST116 false positives.
export async function updateApplication(id, patch) {
  const row = appApplicationToDb({ id, ...patch });
  delete row.id;  // Don't try to UPDATE the primary key itself
  const { data, error } = await supabase
    .from("job_applications")
    .update(row)
    .eq("id", id)
    .select();
  if (error) throw error;
  if (data && data.length > 0) return dbApplicationToApp(data[0]);
  // UPDATE worked but SELECT returned nothing — refetch defensively
  const { data: fresh, error: fetchErr } = await supabase
    .from("job_applications")
    .select("*").eq("id", id).maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!fresh) throw new Error(`Application ${id} updated but could not be retrieved.`);
  return dbApplicationToApp(fresh);
}

export async function deleteApplication(id) {
  const { error } = await supabase.from("job_applications").delete().eq("id", id);
  if (error) throw error;
}

// Convenience helper for status transitions. Wraps updateApplication with a
// status-only patch — keeps call sites readable: changeApplicationStatus(id, "in_training")
export async function changeApplicationStatus(id, newStatus, extraPatch = {}) {
  return updateApplication(id, { status: newStatus, ...extraPatch });
}

// Status history — for the timeline panel on each application
export async function fetchApplicationStatusHistory(applicationId) {
  const { data, error } = await supabase
    .from("application_status_history")
    .select("*")
    .eq("application_id", applicationId)
    .order("changed_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(r => ({
    id:            r.id,
    applicationId: r.application_id,
    fromStatus:    r.from_status,
    toStatus:      r.to_status,
    changedBy:     r.changed_by,
    changedAt:     r.changed_at,
    note:          r.note || "",
  }));
}

// ════════════════════════════════════════════════════════════════════════════
// APPLICANT PHOTO UPLOAD (slice 3)
// ════════════════════════════════════════════════════════════════════════════
// Uploads a candidate's photo to the "applicant-photos" Supabase Storage
// bucket. The bucket is public-read but write requires either anonymous
// INSERT (covered by our RLS policy for the bucket) or an authenticated user.
//
// Returns: { url, path } where:
//   - url is the public URL we store in job_applications.photo_url
//   - path is the storage path we store in job_applications.photo_path
//     (used later for GDPR-driven deletion when a candidate is rejected
//     or asks for their data to be removed)
//
// File path includes a random token + timestamp so URLs are not enumerable
// — someone can't guess "/applicant-photos/0001.jpg" to find other
// candidates' photos.

export async function uploadApplicantPhoto(file) {
  if (!file) throw new Error("No file provided");
  if (!(file instanceof File || file instanceof Blob)) throw new Error("Invalid file");

  // Pick a safe extension based on the actual content type. Some browsers
  // give "image/jpeg" for both .jpg and .jpeg uploads; we always store as .jpg.
  const extByType = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const ext = extByType[file.type] || "jpg";

  // 5 MB limit also enforced by bucket config; check client-side to fail fast
  // with a useful message rather than getting a cryptic storage error.
  const MAX_BYTES = 5 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    throw new Error(`Photo is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`);
  }
  if (!extByType[file.type]) {
    throw new Error("Only JPG, PNG, and WEBP images are accepted.");
  }

  // Path: applicants/{yyyy-mm}/{random}.ext
  // The yyyy-mm prefix lets us see at a glance when each photo was uploaded
  // and makes manual cleanup (e.g. "delete everything older than 12 months")
  // easy in Supabase Studio.
  const now    = new Date();
  const yyyyMm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const token  = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const path   = `applicants/${yyyyMm}/${token}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("applicant-photos")
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",   // 1 year — photos don't change
      upsert: false,
    });
  if (upErr) throw upErr;

  // Public URL — derived deterministically from path; doesn't require a network call
  const { data: { publicUrl } } = supabase.storage
    .from("applicant-photos")
    .getPublicUrl(path);

  return { url: publicUrl, path };
}

// Deletes an applicant photo by storage path. Used when an application is
// deleted or when a candidate requests their data removed under GDPR.
// Quietly tolerates missing files since the photo may already have been
// purged manually from Supabase Studio.
export async function deleteApplicantPhoto(path) {
  if (!path) return;
  const { error } = await supabase.storage.from("applicant-photos").remove([path]);
  if (error && error.message && !/not.found/i.test(error.message)) throw error;
}

// ════════════════════════════════════════════════════════════════════════════
// MAGIC LINK / CANDIDATE PORTAL AUTH (slice 4 session A)
// ════════════════════════════════════════════════════════════════════════════
// Wires up the candidate-facing magic-link flow:
//   - sendCandidateMagicLink() — call after /apply submission
//   - fetchMyApplications()    — for the candidate portal, returns only the
//                                 logged-in user's applications (RLS enforces)
//   - candidateSignOut()       — log out from portal
//
// Important: these are CANDIDATE-facing functions. They use Supabase Auth's
// magic-link OTP flow, which creates a Supabase user account at the
// candidate's email. Same email → same account → sees all their applications.

// Send a magic link to the candidate. Idempotent — if they already have an
// account, this just sends them a fresh login link. If they don't, creates
// one and sends.
//
// Failure handling: Supabase's default email service rate-limits at ~3
// emails/hour. Hitting that limit returns a 429 with code 'over_email_send_rate_limit'.
// We catch it and return { ok: false, retryable: true } so the caller can
// retry later or surface to manager.
//
// The shouldCreateUser:false flag would let us send only to existing users,
// but for /apply we DO want to create new accounts. Set true.
export async function sendCandidateMagicLink(email, redirectTo) {
  if (!email) return { ok: false, retryable: false, error: "No email provided" };

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        // After clicking the email link, Supabase redirects to this URL
        // with the auth tokens. Should be the /candidate route on our app.
        emailRedirectTo: redirectTo || `${window.location.origin}/candidate`,
        // Create the user if they don't already have an account
        shouldCreateUser: true,
      },
    });

    if (error) {
      // Check if it's a rate-limit error (retryable later)
      const msg = (error.message || "").toLowerCase();
      const code = (error.code || error.status || "").toString();
      const isRateLimit =
        msg.includes("rate limit") ||
        msg.includes("too many") ||
        code.includes("429") ||
        code.includes("over_email_send_rate_limit");
      return {
        ok: false,
        retryable: isRateLimit,
        error: error.message || "Failed to send magic link",
      };
    }

    return { ok: true };
  } catch (err) {
    // Network error or unexpected — treat as retryable
    return {
      ok: false,
      retryable: true,
      error: err?.message || String(err),
    };
  }
}

// Marks an application's email_link_status. Used by app code after calling
// sendCandidateMagicLink — if successful, update to 'sent'; if failed,
// update to 'failed' with the error so manager sees it in the dashboard.
//
// Errors here are swallowed silently — failure to update this status
// shouldn't break the /apply submission. The manager will just see
// 'pending' indefinitely, which is a known signal to follow up manually.
export async function setApplicationEmailStatus(applicationId, status, errorMessage) {
  if (!applicationId) return;
  if (!["pending", "sent", "failed", "delivered"].includes(status)) return;

  try {
    const row = {
      email_link_status: status,
      email_link_error:  status === "failed" ? (errorMessage || null) : null,
    };
    if (status === "sent" || status === "delivered") {
      row.email_link_sent_at = new Date().toISOString();
    }
    await supabase.from("job_applications").update(row).eq("id", applicationId);
  } catch (err) {
    // Log to console but don't propagate — the application itself is saved,
    // this is just metadata.
    console.warn("Failed to update email_link_status:", err);
  }
}

// Fetch the currently-authenticated candidate's application(s). RLS on the
// table ensures we only see rows matching the JWT email — so this query
// returns just their data without any explicit filter.
//
// Returns ALL of their applications (they could have applied to multiple
// stores or applied multiple times). UI sorts/picks accordingly.
export async function fetchMyApplications() {
  const { data, error } = await supabase
    .from("job_applications")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(dbApplicationToApp);
}

// Same as fetchApplicationStatusHistory but called from the candidate portal.
// RLS on application_status_history ensures only history rows for their own
// applications come back.
export async function fetchMyApplicationStatusHistory(applicationId) {
  return fetchApplicationStatusHistory(applicationId);
}

// Candidate-side update: lets them change their own fields. App code
// enforces which fields are editable (two-tier rules). RLS at the DB level
// ensures they can only update their own row anyway.
export async function updateMyApplication(id, patch) {
  // Use the same updateApplication helper since RLS gates access. But we
  // strip fields the candidate can never edit at any time — defence in
  // depth in case app code forgets.
  const safe = { ...patch };
  delete safe.status;           // only manager
  delete safe.opsTeamId;        // only manager
  delete safe.rtwVerified;      // only manager
  delete safe.rtwVerifiedBy;
  delete safe.rtwVerifiedAt;
  delete safe.brandId;          // derived from storeId
  delete safe.source;           // immutable post-creation
  delete safe.createdAt;
  delete safe.createdBy;
  delete safe.emailLinkStatus;  // only system
  delete safe.emailLinkSentAt;
  delete safe.emailLinkError;
  return updateApplication(id, safe);
}

// Sign out from the candidate portal. Cleans up the session.
export async function candidateSignOut() {
  await supabase.auth.signOut();
}

// Subscribe to auth state changes. The portal uses this to detect when
// the magic-link callback completes (Supabase auto-detects the tokens in
// the URL fragment and fires onAuthStateChange).
export function onCandidateAuthChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback({ event, session });
  });
  return () => subscription.unsubscribe();
}

// One-shot getter for current session — useful at mount time to check if
// the user is already logged in (returning from a magic link click).
export async function getCandidateSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// ════════════════════════════════════════════════════════════════════════════
// HIRE WORKFLOW (slice 5)
// ════════════════════════════════════════════════════════════════════════════
// Atomic-ish "hire this candidate" operation. Multiple things happen:
//   1. Look up existing ops_team entry by email (Q4 duplicate check)
//      - If found AND not archived → return { existing: true, opsTeam } so
//        UI can prompt manager: "link to existing employee?"
//      - If not found → create new ops_team entry from application data
//   2. Link application.ops_team_id → ops_team.id
//   3. Update application status to 'hired' + set archived_at = NOW
//      (hides it from active Hiring view but preserves the record)
//   4. Trigger logs the status change to application_status_history
//      (existing log_application_status_change trigger handles this)
//
// NOT atomic at the DB level — we don't have transactions in supabase-js
// for cross-table operations like this. If step 2 or 3 fails after step 1
// succeeded, we'd have an orphan ops_team entry. We mitigate by ordering:
// create ops_team LAST after archive + link, then update.
// Actually the cleanest sequence is:
//   A. Check duplicate (read-only)
//   B. Create ops_team (writes a row, but harmless if subsequent steps fail)
//   C. Update application: set ops_team_id, status='hired', archived_at=NOW
//   D. If C fails, the ops_team row is orphaned — but the application is
//      still in 'applied' or wherever it was, so manager can retry.
//      Orphan ops_team is detectable: no application points to it.
//
// Returns: { ok, opsTeam, application, existing } or throws.
//   - existing=true means the candidate's email already matched an active
//     employee and we LINKED rather than created. Manager should be told.
//   - existing=false means a fresh ops_team entry was created.

export async function hireApplicationCheck(applicationEmail) {
  // Pre-flight check: is there already an active employee with this email?
  // Used by app code BEFORE the actual hire to show the manager a confirm
  // dialog. Returns { existing: ops_team_row | null }.
  if (!applicationEmail) return { existing: null };
  const { data, error } = await supabase
    .from("ops_team")
    .select("*")
    .ilike("email", applicationEmail.trim())
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return { existing: data ? dbOpsTeamToApp(data) : null };
}

export async function hireApplication(application, options = {}) {
  // options:
  //   linkToExisting: ops_team_id  — manager confirmed to reuse existing
  //                                   employee record. Skip create.
  //   hiredByUserId:  text          — user id of the person doing the hire,
  //                                   for audit purposes in status_history
  if (!application?.id) throw new Error("Application required");
  if (!application.email?.trim()) {
    throw new Error("Email is required before hiring. Edit the application to add an email address.");
  }

  let opsTeamId;
  let opsTeam;
  let existing = false;

  if (options.linkToExisting) {
    // Manager already confirmed they want to reuse an existing employee
    // record. Skip the create — just use the provided ID.
    opsTeamId = options.linkToExisting;
    existing = true;
    // Fetch the existing record so we can return it to the caller
    const { data, error } = await supabase
      .from("ops_team").select("*").eq("id", opsTeamId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Linked employee record no longer exists.");
    opsTeam = dbOpsTeamToApp(data);
  } else {
    // Create a fresh ops_team entry from the application data. Per
    // Q6 decision: status='pending_setup' so the UI warns manager to
    // complete role/dept/hourly_rate assignment.
    //
    // Q2 explicit user decision: do NOT auto-assign role/department/etc.
    // Manager fills these later. We only copy candidate-provided data.
    opsTeamId = `emp-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const newOpsTeam = {
      id:           opsTeamId,
      brandId:      application.brandId,
      firstName:    application.firstName,
      lastName:     application.lastName,
      nickname:     "",
      department:   "",           // unset — manager assigns
      role:         "",           // unset — manager assigns
      pin:          "",           // unset — manager creates when staff member starts on POS
      color:        "#6366f1",    // default; manager can change
      hourlyRate:   0,            // unset — manager fills
      storeIds:     application.storeId ? [application.storeId] : [],
      roleId:       null,         // unset
      departmentId: null,         // unset
      // ── Slice 5 HR fields, copied from application ─────────────────────
      email:        application.email?.trim() || null,
      phone:        application.phone || null,
      dob:          application.dateOfBirth || null,
      address:      application.address || null,
      legalStatus:  application.legalStatus || null,
      photoUrl:     application.photoUrl || null,
      hrNotes:      "",
      status:       "pending_setup",  // ← key flag for the warning badge
      isTrainee:    true,             // new hires start as trainees (trainee portal)
    };
    const { data, error } = await supabase
      .from("ops_team")
      .insert(appOpsTeamToDb(newOpsTeam))
      .select()
      .maybeSingle();
    if (error) {
      // Specifically detect the unique-email-violation, which means another
      // hire raced us OR an existing row matched but our pre-check missed it.
      if (error.code === "23505" || /duplicate key/i.test(error.message || "")) {
        throw new Error(
          "An employee with this email already exists. Please use 'Link to existing employee' instead of 'Hire as new'."
        );
      }
      throw error;
    }
    opsTeam = data ? dbOpsTeamToApp(data) : newOpsTeam;
  }

  // Now update the application: link, status, archive
  const { error: updErr } = await supabase
    .from("job_applications")
    .update({
      ops_team_id:   opsTeamId,
      status:        "hired",
      archived_at:   new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    })
    .eq("id", application.id);
  if (updErr) {
    // If linking fails AND we created a fresh ops_team row above, we have
    // an orphan. Try to roll back. If the rollback fails too, surface a
    // clear message — manager can manually delete the orphan ops_team row.
    if (!existing) {
      try {
        await supabase.from("ops_team").delete().eq("id", opsTeamId);
      } catch {}
    }
    throw updErr;
  }

  return { ok: true, opsTeam, application: { ...application, opsTeamId, status: "hired", archivedAt: new Date().toISOString() }, existing };
}

// ════════════════════════════════════════════════════════════════════════════
// EMPLOYEE NOTES (slice 6)
// ════════════════════════════════════════════════════════════════════════════
// Append-only HR notes per employee. No update/delete from app — if a note
// needs correction, manager adds a new note saying "ignore prior, X is
// actually Y". This matches real HR audit-trail practice.
//
// author_name is snapshotted at write time so renaming a user later doesn't
// change historical attribution. author_id is also stored (soft ref) for
// future "show all notes by user X" reporting.

function dbEmployeeNoteToApp(n) {
  return {
    id:          n.id,
    employeeId:  n.employee_id,
    content:     n.content,
    authorId:    n.author_id || null,
    authorName:  n.author_name || "Unknown",
    createdAt:   n.created_at,
  };
}

export async function fetchEmployeeNotes(employeeId) {
  if (!employeeId) return [];
  const { data, error } = await supabase
    .from("employee_notes")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(dbEmployeeNoteToApp);
}

export async function addEmployeeNote({ employeeId, content, authorId, authorName }) {
  if (!employeeId) throw new Error("employeeId required");
  if (!content?.trim()) throw new Error("Note content cannot be empty");
  const row = {
    id:           `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    employee_id:  employeeId,
    content:      content.trim(),
    author_id:    authorId || null,
    author_name:  authorName || "Unknown",
  };
  const { data, error } = await supabase
    .from("employee_notes")
    .insert(row)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? dbEmployeeNoteToApp(data) : dbEmployeeNoteToApp(row);
}

// Fetch the job_application linked to an employee, if any. Returns null
// for legacy/manual employees with no application history.
export async function fetchLinkedApplication(employeeId) {
  if (!employeeId) return null;
  const { data, error } = await supabase
    .from("job_applications")
    .select("*")
    .eq("ops_team_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? dbApplicationToApp(data) : null;
}

// ════════════════════════════════════════════════════════════════════════════
// EMPLOYEE PAY HISTORY (slice 6 follow-up)
// ════════════════════════════════════════════════════════════════════════════
// Append-only audit trail of pay changes. Populated automatically when the
// Job Assignment tab saves AND pay actually changed, OR manually via the
// Pay History tab for backfilling old data.

function dbPayHistoryToApp(h) {
  return {
    id:            h.id,
    employeeId:    h.employee_id,
    oldAmount:     h.old_amount != null ? Number(h.old_amount) : null,
    oldPayType:    h.old_pay_type || null,
    newAmount:     Number(h.new_amount),
    newPayType:    h.new_pay_type || "hourly",
    effectiveDate: h.effective_date,
    reason:        h.reason || null,
    authorId:      h.author_id || null,
    authorName:    h.author_name || "Unknown",
    createdAt:     h.created_at,
  };
}

export async function fetchPayHistory(employeeId) {
  if (!employeeId) return [];
  const { data, error } = await supabase
    .from("employee_pay_history")
    .select("*")
    .eq("employee_id", employeeId)
    .order("effective_date", { ascending: false })
    .order("created_at",     { ascending: false });
  if (error) throw error;
  return (data || []).map(dbPayHistoryToApp);
}

// Append a pay history row. Accepts old_* as null for backfills and for
// the very first entry an employee receives.
export async function addPayHistory({
  employeeId,
  oldAmount, oldPayType,
  newAmount, newPayType,
  effectiveDate,
  reason,
  authorId, authorName,
}) {
  if (!employeeId) throw new Error("employeeId required");
  if (newAmount == null || newAmount === "") throw new Error("New amount required");
  if (!effectiveDate) throw new Error("Effective date required");
  const row = {
    id:             `ph-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    employee_id:    employeeId,
    old_amount:     oldAmount != null && oldAmount !== "" ? Number(oldAmount) : null,
    old_pay_type:   oldPayType || null,
    new_amount:     Number(newAmount),
    new_pay_type:   newPayType || "hourly",
    effective_date: effectiveDate,
    reason:         reason?.trim() || null,
    author_id:      authorId || null,
    author_name:    authorName || "Unknown",
  };
  const { data, error } = await supabase
    .from("employee_pay_history")
    .insert(row)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? dbPayHistoryToApp(data) : dbPayHistoryToApp(row);
}

// ════════════════════════════════════════════════════════════════════════════
// EMPLOYEE CERTIFICATIONS (slice 6 follow-up)
// ════════════════════════════════════════════════════════════════════════════
// Compliance training records per employee. Hardcoded type list in App.js
// (CERTIFICATION_TYPES) — `cert_type` matches one of those keys, `name` is
// a snapshot in case the hardcoded list changes later.

function dbCertificationToApp(c) {
  return {
    id:                c.id,
    employeeId:        c.employee_id,
    certType:          c.cert_type,
    name:              c.name,
    obtainedDate:      c.obtained_date,
    expiresDate:       c.expires_date || null,
    certificateNumber: c.certificate_number || null,
    issuingBody:       c.issuing_body || null,
    notes:             c.notes || null,
    createdAt:         c.created_at,
    updatedAt:         c.updated_at,
    createdById:       c.created_by_id || null,
    createdByName:     c.created_by_name || "Unknown",
    archivedAt:        c.archived_at || null,
  };
}

export async function fetchEmployeeCertifications(employeeId) {
  if (!employeeId) return [];
  const { data, error } = await supabase
    .from("employee_certifications")
    .select("*")
    .eq("employee_id", employeeId)
    .is("archived_at", null)
    .order("expires_date", { ascending: true, nullsFirst: false })
    .order("obtained_date", { ascending: false });
  if (error) throw error;
  return (data || []).map(dbCertificationToApp);
}

export async function addEmployeeCertification({
  employeeId, certType, name,
  obtainedDate, expiresDate,
  certificateNumber, issuingBody, notes,
  createdById, createdByName,
}) {
  if (!employeeId) throw new Error("employeeId required");
  if (!certType)   throw new Error("certType required");
  if (!name)       throw new Error("name required");
  if (!obtainedDate) throw new Error("obtainedDate required");
  const row = {
    id:                 `cert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    employee_id:        employeeId,
    cert_type:          certType,
    name:               name,
    obtained_date:      obtainedDate,
    expires_date:       expiresDate || null,
    certificate_number: certificateNumber?.trim() || null,
    issuing_body:       issuingBody?.trim() || null,
    notes:              notes?.trim() || null,
    created_by_id:      createdById || null,
    created_by_name:    createdByName || "Unknown",
  };
  const { data, error } = await supabase
    .from("employee_certifications")
    .insert(row)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? dbCertificationToApp(data) : dbCertificationToApp(row);
}

// Partial update — only fields explicitly in `patch` are written. Used for
// editing typos (per Q5=b). Same RLS-tolerant pattern as updateOpsTeamMember.
export async function updateEmployeeCertification(id, patch) {
  if (!id) throw new Error("id required");
  const row = {};
  if (patch.certType          !== undefined) row.cert_type          = patch.certType;
  if (patch.name              !== undefined) row.name               = patch.name;
  if (patch.obtainedDate      !== undefined) row.obtained_date      = patch.obtainedDate;
  if (patch.expiresDate       !== undefined) row.expires_date       = patch.expiresDate || null;
  if (patch.certificateNumber !== undefined) row.certificate_number = patch.certificateNumber?.trim() || null;
  if (patch.issuingBody       !== undefined) row.issuing_body       = patch.issuingBody?.trim() || null;
  if (patch.notes             !== undefined) row.notes              = patch.notes?.trim() || null;
  if (patch.archivedAt        !== undefined) row.archived_at        = patch.archivedAt;
  const { data, error } = await supabase
    .from("employee_certifications")
    .update(row)
    .eq("id", id)
    .select();
  if (error) throw error;
  if (data && data.length > 0) return dbCertificationToApp(data[0]);
  // RLS-tolerant fallback: refetch defensively
  const { data: fresh, error: fetchErr } = await supabase
    .from("employee_certifications").select("*").eq("id", id).maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!fresh) throw new Error(`Certification ${id} updated but could not be retrieved.`);
  return dbCertificationToApp(fresh);
}

// Soft-delete a certification. Per Q5=b, restricted to HQ/owner in app code;
// at DB level any authenticated user can call this (RLS not enforced on
// this table). The archive flag is preferred over hard delete so the
// compliance trail isn't lost — if you need to fully delete, do it
// manually in SQL.
export async function archiveEmployeeCertification(id) {
  if (!id) throw new Error("id required");
  return updateEmployeeCertification(id, { archivedAt: new Date().toISOString() });
}

// ════════════════════════════════════════════════════════════════════════════
// EMPLOYEE DOCUMENTS (slice 7)
// ════════════════════════════════════════════════════════════════════════════
// Files attached to an employee record. Initially used for RTW (right-to-work)
// documents — passport scans, BRP images, share code screenshots, visa stamps.
// The doc_type column allows extension to contracts, P45s, etc. later without
// schema changes (just extend the CHECK constraint).
//
// Storage strategy: reuses the existing `applicant-photos` bucket from slice 3.
// Same upload mechanism, same public URL pattern. Stored under a different
// path prefix (`employee-docs/...`) for organizational tidiness, but lives in
// the same bucket so RLS behavior is identical.

function dbEmployeeDocumentToApp(d) {
  return {
    id:             d.id,
    employeeId:     d.employee_id,
    docType:        d.doc_type,
    fileUrl:        d.file_url,
    filePath:       d.file_path,
    fileName:       d.file_name || null,
    expiryDate:     d.expiry_date || null,
    signedAt:       d.signed_at || null,
    notes:          d.notes || null,
    uploadedById:   d.uploaded_by_id || null,
    uploadedByName: d.uploaded_by_name || "Unknown",
    status:         d.status || "pending",
    reviewedById:   d.reviewed_by_id || null,
    reviewedByName: d.reviewed_by_name || null,
    reviewedAt:     d.reviewed_at || null,
    rejectionReason: d.rejection_reason || null,
    // Two-stage workflow
    requiredDocKey:   d.required_doc_key || null,
    reviewStage:      d.review_stage || "pending",
    managerApprovedById:   d.manager_approved_by_id || null,
    managerApprovedByName: d.manager_approved_by_name || null,
    managerApprovedAt:     d.manager_approved_at || null,
    hrApprovedById:        d.hr_approved_by_id || null,
    hrApprovedByName:      d.hr_approved_by_name || null,
    hrApprovedAt:          d.hr_approved_at || null,
    rejectedByName:        d.rejected_by_name || null,
    rejectedAt:            d.rejected_at || null,
    rejectedStage:         d.rejected_stage || null,
    // Contract e-signature
    signedById:            d.signed_by_id || null,
    signedByName:          d.signed_by_name || null,
    signatureStatement:    d.signature_statement || null,
    // Payslip fields (doc_type='payslip')
    payPeriodLabel: d.pay_period_label || null,
    payDate:        d.pay_date || null,
    grossPay:       d.gross_pay != null ? Number(d.gross_pay) : null,
    netPay:         d.net_pay   != null ? Number(d.net_pay)   : null,
    taxPaid:        d.tax_paid  != null ? Number(d.tax_paid)  : null,
    niPaid:         d.ni_paid   != null ? Number(d.ni_paid)   : null,
    createdAt:      d.created_at,
    updatedAt:      d.updated_at,
    archivedAt:     d.archived_at || null,
  };
}

export async function fetchEmployeeDocuments(employeeId) {
  if (!employeeId) return [];
  const { data, error } = await supabase
    .from("employee_documents")
    .select("*")
    .eq("employee_id", employeeId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(dbEmployeeDocumentToApp);
}

// Archived (superseded) document versions — the slot history. Kept on re-upload
// (never destroyed), shown only to managers/HR via the "previous versions"
// expander. Newest first.
export async function fetchArchivedDocuments(employeeId) {
  if (!employeeId) return [];
  const { data, error } = await supabase
    .from("employee_documents")
    .select("*")
    .eq("employee_id", employeeId)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(dbEmployeeDocumentToApp);
}

// Uploads a document file to Supabase Storage. Reuses the applicant-photos
// bucket for simplicity — same RLS posture (public reads, authenticated
// uploads). Path is under `employee-docs/{yyyy-mm}/{token}.{ext}` so it's
// distinguishable from applicant photos in the bucket.
//
// Returns { url, path } for the caller to store in employee_documents.
export async function uploadEmployeeDocument(file) {
  if (!file) throw new Error("No file provided");
  if (!(file instanceof File || file instanceof Blob)) throw new Error("Invalid file");

  // Accept PDF + images for RTW docs (passport scan often PDF, BRP often image,
  // share code screenshot often PNG). 10 MB is generous but reasonable for
  // a passport scan.
  const extByType = {
    "image/jpeg":      "jpg",
    "image/png":       "png",
    "image/webp":      "webp",
    "application/pdf": "pdf",
  };
  const ext = extByType[file.type];
  if (!ext) throw new Error("Only JPG, PNG, WEBP, and PDF files are accepted.");

  const MAX_BYTES = 10 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`);
  }

  const now    = new Date();
  const yyyyMm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const token  = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const path   = `employee-docs/${yyyyMm}/${token}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("applicant-photos")
    .upload(path, file, {
      contentType:  file.type,
      cacheControl: "3600",   // 1 hour — docs can be re-uploaded
      upsert:       false,
    });
  if (upErr) throw upErr;

  const { data: { publicUrl } } = supabase.storage
    .from("applicant-photos")
    .getPublicUrl(path);

  return { url: publicUrl, path };
}

// Insert a document record after the file is uploaded. Two-step pattern
// (upload, then DB insert) so we can show progress and handle upload
// failures separately from DB failures.
export async function addEmployeeDocument({
  employeeId,
  docType,
  fileUrl,
  filePath,
  fileName,
  expiryDate,
  signedAt,
  notes,
  uploadedById,
  uploadedByName,
  requiredDocKey,        // slot key, or null for a free ("other") upload
  reviewStage,           // optional initial stage (e.g. manager_approved for RTW manager-upload)
  managerApprovedBy,     // {id,name} if pre-approving at manager stage (RTW case)
}) {
  if (!employeeId) throw new Error("employeeId required");
  if (!docType)    throw new Error("docType required");
  if (!fileUrl)    throw new Error("fileUrl required");
  if (!filePath)   throw new Error("filePath required");

  // Supersede: if uploading into a slot, archive any existing CURRENT version
  // in that slot first — so the slot holds one current version + archived history.
  if (requiredDocKey) {
    const { data: existing } = await supabase
      .from("employee_documents")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("required_doc_key", requiredDocKey)
      .is("archived_at", null);
    if (existing && existing.length) {
      await supabase
        .from("employee_documents")
        .update({ archived_at: new Date().toISOString() })
        .in("id", existing.map(e => e.id));
    }
  }

  const stage = reviewStage || "pending";
  const row = {
    id:                `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    employee_id:       employeeId,
    doc_type:          docType,
    file_url:          fileUrl,
    file_path:         filePath,
    file_name:         fileName?.trim() || null,
    expiry_date:       expiryDate || null,
    signed_at:         signedAt   || null,
    notes:             notes?.trim() || null,
    uploaded_by_id:    uploadedById   || null,
    uploaded_by_name:  uploadedByName || "Unknown",
    required_doc_key:  requiredDocKey || null,
    review_stage:      stage,
    status:            stage === "hr_approved" ? "accepted" : stage === "rejected" ? "rejected" : "pending",
    manager_approved_by_id:   stage === "manager_approved" ? (managerApprovedBy?.id || null)   : null,
    manager_approved_by_name: stage === "manager_approved" ? (managerApprovedBy?.name || null) : null,
    manager_approved_at:      stage === "manager_approved" ? new Date().toISOString()          : null,
  };
  const { data, error } = await supabase
    .from("employee_documents")
    .insert(row)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? dbEmployeeDocumentToApp(data) : dbEmployeeDocumentToApp(row);
}

// ── Payslips (employee_documents with doc_type='payslip') ────────────────────
export async function fetchPayslips(employeeId) {
  if (!employeeId) return [];
  const { data, error } = await supabase
    .from("employee_documents")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("doc_type", "payslip")
    .is("archived_at", null)
    .order("pay_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(dbEmployeeDocumentToApp);
}

// Add a payslip: uploads the file (caller does upload) then inserts the row
// with optional figures. payDate/period are optional.
export async function addPayslip({ employeeId, fileUrl, filePath, fileName, payPeriodLabel, payDate, grossPay, netPay, taxPaid, niPaid, uploadedById, uploadedByName }) {
  if (!employeeId) throw new Error("employeeId required");
  if (!fileUrl || !filePath) throw new Error("file required");
  const row = {
    id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    employee_id: employeeId, doc_type: "payslip",
    file_url: fileUrl, file_path: filePath, file_name: fileName?.trim() || null,
    pay_period_label: payPeriodLabel?.trim() || null, pay_date: payDate || null,
    gross_pay: grossPay != null && grossPay !== "" ? Number(grossPay) : null,
    net_pay:   netPay   != null && netPay   !== "" ? Number(netPay)   : null,
    tax_paid:  taxPaid  != null && taxPaid  !== "" ? Number(taxPaid)  : null,
    ni_paid:   niPaid   != null && niPaid   !== "" ? Number(niPaid)   : null,
    uploaded_by_id: uploadedById || null, uploaded_by_name: uploadedByName || "Unknown",
    review_stage: "hr_approved", status: "accepted",
  };
  const { data, error } = await supabase.from("employee_documents").insert(row).select().maybeSingle();
  if (error) throw error;
  return data ? dbEmployeeDocumentToApp(data) : dbEmployeeDocumentToApp(row);
}

export async function archivePayslip(id) {
  if (!id) throw new Error("id required");
  const { error } = await supabase.from("employee_documents")
    .update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return id;
}

// ── Payslip inbox (email-ingested, awaiting manual assignment) ───────────────
const mapInbox = (r) => ({
  id: r.id, fileUrl: r.file_url, filePath: r.file_path, fileName: r.file_name || null,
  extractedName: r.extracted_name || "", extractedText: r.extracted_text || "",
  payPeriodLabel: r.pay_period_label || "", payDate: r.pay_date || null,
  matchedEmployeeId: r.matched_employee_id || null, matchConfidence: r.match_confidence || "none",
  status: r.status, fromEmail: r.from_email || "", emailSubject: r.email_subject || "",
  receivedAt: r.received_at,
});

export async function fetchPayslipInbox(status = "unmatched") {
  let q = supabase.from("payslip_inbox").select("*").order("received_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapInbox);
}

export async function countUnmatchedPayslips() {
  const { count, error } = await supabase.from("payslip_inbox")
    .select("id", { count: "exact", head: true }).eq("status", "unmatched");
  if (error) return 0;
  return count || 0;
}

// Assign a queued payslip to an employee: files it as a payslip document and
// marks the inbox row 'filed'.
export async function assignPayslip({ inboxId, employeeId, fileUrl, filePath, fileName, payPeriodLabel, payDate, filedBy }) {
  if (!inboxId || !employeeId) throw new Error("inboxId and employeeId required");
  const docId = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const { error: dErr } = await supabase.from("employee_documents").insert({
    id: docId, employee_id: employeeId, doc_type: "payslip", file_url: fileUrl, file_path: filePath,
    file_name: fileName || "payslip.pdf", pay_period_label: payPeriodLabel || null, pay_date: payDate || null,
    review_stage: "hr_approved", status: "accepted", uploaded_by_name: filedBy || "Manual assign",
  });
  if (dErr) throw dErr;
  const { error } = await supabase.from("payslip_inbox").update({
    matched_employee_id: employeeId, status: "filed", filed_doc_id: docId, filed_by: filedBy || null,
    filed_at: new Date().toISOString(),
  }).eq("id", inboxId);
  if (error) throw error;
  return docId;
}

export async function ignorePayslipInbox(inboxId) {
  const { error } = await supabase.from("payslip_inbox").update({ status: "ignored" }).eq("id", inboxId);
  if (error) throw error;
  return inboxId;
}

// Insert an inbox row from a manual (browser) upload that couldn't be
// auto-matched, so it shows in the Unmatched queue for assignment.
export async function addPayslipInboxItem({ fileUrl, filePath, fileName, extractedName, payPeriodLabel, matchConfidence }) {
  const { data, error } = await supabase.from("payslip_inbox").insert({
    file_url: fileUrl, file_path: filePath, file_name: fileName || null,
    extracted_name: extractedName || null, pay_period_label: payPeriodLabel || null,
    match_confidence: matchConfidence || "none", status: "unmatched", from_email: "Manual upload",
  }).select().maybeSingle();
  if (error) throw error;
  return data ? mapInbox(data) : null;
}
// — never hard-delete from app; manual SQL only for compliance.
//
// Note: the file in Storage is NOT deleted automatically. Use
// deleteEmployeeDocumentFile() separately if you want to purge it (e.g. for
// GDPR removal request). Default archive just hides from the active list.
export async function archiveEmployeeDocument(id) {
  if (!id) throw new Error("id required");
  const { data, error } = await supabase
    .from("employee_documents")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .select();
  if (error) throw error;
  if (data && data.length > 0) return dbEmployeeDocumentToApp(data[0]);
  // RLS-tolerant fallback
  const { data: fresh } = await supabase
    .from("employee_documents").select("*").eq("id", id).maybeSingle();
  return fresh ? dbEmployeeDocumentToApp(fresh) : null;
}

// ── Two-stage document approval ────────────────────────────────────────────
// Stage 1 (manager) → Stage 2 (HR = hq_staff/owner) → fully approved.
// Reject at either stage sends it back to the trainee (re-upload restarts).
// `status` is kept in sync for back-compat (hr_approved→accepted, else mapped).
//
// All four helpers reload the row defensively (RLS-tolerant) on return.

async function _updateDocAndReturn(id, row) {
  const { data, error } = await supabase
    .from("employee_documents").update(row).eq("id", id).select();
  if (error) throw error;
  if (data && data.length > 0) return dbEmployeeDocumentToApp(data[0]);
  const { data: fresh } = await supabase
    .from("employee_documents").select("*").eq("id", id).maybeSingle();
  return fresh ? dbEmployeeDocumentToApp(fresh) : null;
}

// Stage 1: a manager approves. Moves pending → manager_approved.
export async function managerApproveDocument(id, manager) {
  if (!id) throw new Error("id required");
  return _updateDocAndReturn(id, {
    review_stage: "manager_approved",
    status:       "pending",   // not fully accepted until HR
    manager_approved_by_id:   manager?.id || null,
    manager_approved_by_name: manager?.name || manager?.email || "Manager",
    manager_approved_at:      new Date().toISOString(),
    // clear any prior rejection
    rejected_by_id: null, rejected_by_name: null, rejected_at: null,
    rejected_stage: null, rejection_reason: null,
  });
}

// Stage 2: HR gives final approval. Requires manager_approved first (enforced
// in app UI — HR controls only show on manager_approved docs). hr_approved is
// the terminal "fully approved" state.
export async function hrApproveDocument(id, hr) {
  if (!id) throw new Error("id required");
  return _updateDocAndReturn(id, {
    review_stage: "hr_approved",
    status:       "accepted",
    hr_approved_by_id:   hr?.id || null,
    hr_approved_by_name: hr?.name || hr?.email || "HR",
    hr_approved_at:      new Date().toISOString(),
  });
}

// Reject at either stage. `stage` = 'manager' | 'hr'. Sends back to trainee.
export async function rejectDocument(id, stage, reviewer, reason) {
  if (!id) throw new Error("id required");
  return _updateDocAndReturn(id, {
    review_stage: "rejected",
    status:       "rejected",
    rejected_by_id:   reviewer?.id || null,
    rejected_by_name: reviewer?.name || reviewer?.email || "Reviewer",
    rejected_at:      new Date().toISOString(),
    rejected_stage:   stage === "hr" ? "hr" : "manager",
    rejection_reason: reason?.trim() || null,
  });
}

// Reset a document back to pending (clears all review state).
export async function resetDocumentReview(id) {
  if (!id) throw new Error("id required");
  return _updateDocAndReturn(id, {
    review_stage: "pending",
    status:       "pending",
    manager_approved_by_id: null, manager_approved_by_name: null, manager_approved_at: null,
    hr_approved_by_id: null, hr_approved_by_name: null, hr_approved_at: null,
    rejected_by_id: null, rejected_by_name: null, rejected_at: null,
    rejected_stage: null, rejection_reason: null,
  });
}

// Contract e-signature (Option A). The employee types their full name and
// agrees to a statement; we record signer identity, the exact statement, the
// timestamp, and (implicitly) the document version via its file_path. Sets
// review_stage = "signed" as the terminal state for a sign-type slot.
export async function signContractDocument(id, { signerId, signerName, statement }) {
  if (!id) throw new Error("id required");
  if (!signerName?.trim()) throw new Error("Signature name required");
  return _updateDocAndReturn(id, {
    review_stage:        "signed",
    status:              "accepted",
    signed_by_id:        signerId || null,
    signed_by_name:      signerName.trim(),
    signature_statement: statement || null,
    signed_at:           new Date().toISOString(),
  });
}

// Hard-delete the actual file from Storage (separate from DB archive).
// Used for GDPR data-removal requests.
export async function deleteEmployeeDocumentFile(path) {
  if (!path) return;
  const { error } = await supabase.storage.from("applicant-photos").remove([path]);
  if (error && error.message && !/not.found/i.test(error.message)) throw error;
}


// ════════════════════════════════════════════════════════════════════════════
// APPLICATION DUPLICATE CHECK (slice 7)
// ════════════════════════════════════════════════════════════════════════════
// Called from the Hiring view when manager expands an application — shows
// a soft warning if the email matches OTHER applications OR an existing
// employee. Helps catch repeat-applicants and returning ex-employees.
//
// Returns: { otherApplications: [...], existingEmployee: {...} | null }
// otherApplications excludes the application being viewed.
// existingEmployee includes archived employees (returning workers).

export async function findApplicationsByEmail(email, excludeId = null) {
  if (!email) return { otherApplications: [], existingEmployee: null };
  const lower = email.trim().toLowerCase();
  if (!lower) return { otherApplications: [], existingEmployee: null };

  // Other applications matching this email (case-insensitive)
  const { data: apps, error: appsErr } = await supabase
    .from("job_applications")
    .select("id, first_name, last_name, email, status, source, archived_at, created_at")
    .ilike("email", lower);
  if (appsErr) throw appsErr;
  const otherApplications = (apps || [])
    .filter(a => a.id !== excludeId)
    .map(a => ({
      id:         a.id,
      firstName:  a.first_name,
      lastName:   a.last_name,
      email:      a.email,
      status:     a.status,
      source:     a.source,
      archivedAt: a.archived_at,
      createdAt:  a.created_at,
    }));

  // Existing employee with this email (active OR archived — returning
  // workers matter here)
  const { data: emps, error: empsErr } = await supabase
    .from("ops_team")
    .select("id, first_name, last_name, email, archived_at, status")
    .ilike("email", lower)
    .limit(1);
  if (empsErr) throw empsErr;
  const existingEmployee = emps && emps.length > 0 ? {
    id:         emps[0].id,
    firstName:  emps[0].first_name,
    lastName:   emps[0].last_name,
    email:      emps[0].email,
    archivedAt: emps[0].archived_at,
    status:     emps[0].status,
  } : null;

  return { otherApplications, existingEmployee };
}

// ════════════════════════════════════════════════════════════════════════════
// TRAINING MODULES (trainee portal — step 2)
// ════════════════════════════════════════════════════════════════════════════
// Per-store training modules. A store defines its own set; trainees work
// through them. Completion state lives in a separate training_progress table
// (a later step), NOT here — a module is just the definition.
//
// Mappers are partial-aware (the project-wide rule: only write fields that are
// explicitly present, so partial updates never wipe untouched columns).
// updateTrainingModule uses .update().eq() (not upsert) to avoid the NOT NULL
// footgun on partial saves. Soft delete via archived_at; never hard-delete
// from app code.

function dbTrainingModuleToApp(m) {
  return {
    id:          m.id,
    storeId:     m.store_id,
    title:       m.title,
    description: m.description || null,
    category:    m.category || null,
    content:     m.content || null,
    sortOrder:   m.sort_order ?? 0,
    required:    m.required ?? true,
    sourceTemplateId: m.source_template_id || null,
    type:        m.type || "onboarding",
    createdAt:   m.created_at,
    updatedAt:   m.updated_at,
    archivedAt:  m.archived_at || null,
  };
}

export async function fetchTrainingModules(storeId) {
  if (!storeId) return [];
  const { data, error } = await supabase
    .from("training_modules")
    .select("*")
    .eq("store_id", storeId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(dbTrainingModuleToApp);
}

export async function addTrainingModule({
  storeId, title, description, category, content, sortOrder, required, type,
}) {
  if (!storeId) throw new Error("storeId required");
  if (!title?.trim()) throw new Error("title required");
  const row = {
    id:          `tmod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    store_id:    storeId,
    title:       title.trim(),
    description: description?.trim() || null,
    category:    category?.trim() || null,
    content:     content?.trim() || null,
    sort_order:  Number.isFinite(sortOrder) ? sortOrder : 0,
    required:    required === undefined ? true : !!required,
    type:        type === "training" ? "training" : "onboarding",
  };
  const { data, error } = await supabase
    .from("training_modules")
    .insert(row)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? dbTrainingModuleToApp(data) : dbTrainingModuleToApp(row);
}

// Partial update — only fields explicitly in `patch` are written. Uses
// .update().eq() (not upsert) so NOT NULL columns aren't required on a
// partial save. RLS-tolerant refetch fallback, same as updateEmployeeCertification.
export async function updateTrainingModule(id, patch) {
  if (!id) throw new Error("id required");
  const row = {};
  if (patch.title       !== undefined) row.title       = patch.title?.trim();
  if (patch.description !== undefined) row.description = patch.description?.trim() || null;
  if (patch.category    !== undefined) row.category    = patch.category?.trim() || null;
  if (patch.content     !== undefined) row.content     = patch.content?.trim() || null;
  if (patch.type        !== undefined) row.type        = patch.type === "training" ? "training" : "onboarding";
  if (patch.sortOrder   !== undefined) row.sort_order  = Number.isFinite(patch.sortOrder) ? patch.sortOrder : 0;
  if (patch.required    !== undefined) row.required    = !!patch.required;
  if (patch.archivedAt  !== undefined) row.archived_at = patch.archivedAt;
  const { data, error } = await supabase
    .from("training_modules")
    .update(row)
    .eq("id", id)
    .select();
  if (error) throw error;
  if (data && data.length > 0) return dbTrainingModuleToApp(data[0]);
  // RLS-tolerant fallback: refetch defensively
  const { data: fresh, error: fetchErr } = await supabase
    .from("training_modules").select("*").eq("id", id).maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!fresh) throw new Error(`Training module ${id} updated but could not be retrieved.`);
  return dbTrainingModuleToApp(fresh);
}

// Soft-delete a training module. Restricted to manager/HQ/owner in app code;
// archive preferred over hard delete so trainee progress history stays coherent.
export async function archiveTrainingModule(id) {
  if (!id) throw new Error("id required");
  return updateTrainingModule(id, { archivedAt: new Date().toISOString() });
}

// ════════════════════════════════════════════════════════════════════════════
// TRAINING PROGRESS (training content layer — step B)
// ════════════════════════════════════════════════════════════════════════════
// One row per (employee, module). Two-state completion model:
//   - completed_at: trainee ticked it done (self-serve)
//   - verified_at + verified_by: manager signed off / verified
// A manager can verify or clear; a trainee can tick or untick their own.
// Upsert keyed on the (employee_id, module_id) UNIQUE constraint.

function dbTrainingProgressToApp(p) {
  return {
    id:             p.id,
    employeeId:     p.employee_id,
    moduleId:       p.module_id,
    completedAt:    p.completed_at || null,
    verifiedAt:     p.verified_at || null,
    verifiedById:   p.verified_by_id || null,
    verifiedByName: p.verified_by_name || null,
    createdAt:      p.created_at,
    updatedAt:      p.updated_at,
    archivedAt:     p.archived_at || null,
  };
}

// All progress rows for one trainee (their completion across modules).
export async function fetchTrainingProgress(employeeId) {
  if (!employeeId) return [];
  const { data, error } = await supabase
    .from("training_progress")
    .select("*")
    .eq("employee_id", employeeId)
    .is("archived_at", null);
  if (error) throw error;
  return (data || []).map(dbTrainingProgressToApp);
}

// Internal: fetch the existing progress row (or null) for merge-before-upsert.
async function _fetchProgressRow(employeeId, moduleId) {
  const { data, error } = await supabase
    .from("training_progress")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("module_id", moduleId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// Trainee ticks / unticks a module complete. Reads the existing row first and
// merges, so this NEVER clobbers a manager's verification (the two operations
// touch different fields but share one row — a blind upsert would wipe the
// other half, same footgun as the partial-mapper bug).
export async function setModuleCompletion(employeeId, moduleId, done) {
  if (!employeeId || !moduleId) throw new Error("employeeId and moduleId required");
  const existing = await _fetchProgressRow(employeeId, moduleId);
  const row = {
    ...(existing || {}),
    id:           existing?.id || `tprog-${employeeId}-${moduleId}`,
    employee_id:  employeeId,
    module_id:    moduleId,
    completed_at: done ? new Date().toISOString() : null,
  };
  delete row.created_at; delete row.updated_at;  // let DB defaults/trigger manage
  const { data, error } = await supabase
    .from("training_progress")
    .upsert(row, { onConflict: "employee_id,module_id" })
    .select()
    .single();
  if (error) throw error;
  return dbTrainingProgressToApp(data);
}

// Manager verifies (or clears verification on) a trainee's module. Same
// merge-before-upsert so the trainee's completed_at is preserved.
export async function setModuleVerification(employeeId, moduleId, verified, manager) {
  if (!employeeId || !moduleId) throw new Error("employeeId and moduleId required");
  const existing = await _fetchProgressRow(employeeId, moduleId);
  const row = {
    ...(existing || {}),
    id:               existing?.id || `tprog-${employeeId}-${moduleId}`,
    employee_id:      employeeId,
    module_id:        moduleId,
    verified_at:      verified ? new Date().toISOString() : null,
    verified_by_id:   verified ? (manager?.id || null) : null,
    verified_by_name: verified ? (manager?.name || manager?.email || "Manager") : null,
  };
  delete row.created_at; delete row.updated_at;
  const { data, error } = await supabase
    .from("training_progress")
    .upsert(row, { onConflict: "employee_id,module_id" })
    .select()
    .single();
  if (error) throw error;
  return dbTrainingProgressToApp(data);
}

// ════════════════════════════════════════════════════════════════════════════
// TRAINING TEMPLATES (blueprint library)
// ════════════════════════════════════════════════════════════════════════════
// Reusable blueprints. A store instantiates one → a NEW store-specific
// training_modules row copied from the template. No propagation: editing a
// template later does not touch modules already created from it.

function dbTrainingTemplateToApp(t) {
  return {
    id:            t.id,
    title:         t.title,
    description:   t.description || null,
    category:      t.category || null,
    content:       t.content || null,
    required:      t.required ?? true,
    type:          t.type || "onboarding",
    createdById:   t.created_by_id || null,
    createdByName: t.created_by_name || null,
    createdAt:     t.created_at,
    updatedAt:     t.updated_at,
    archivedAt:    t.archived_at || null,
  };
}

export async function fetchTrainingTemplates() {
  const { data, error } = await supabase
    .from("training_templates")
    .select("*")
    .is("archived_at", null)
    .order("category", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw error;
  return (data || []).map(dbTrainingTemplateToApp);
}

export async function addTrainingTemplate({ title, description, category, content, required, type, manager }) {
  if (!title?.trim()) throw new Error("title required");
  const row = {
    id:              `ttpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title:           title.trim(),
    description:     description?.trim() || null,
    category:        category?.trim() || null,
    content:         content?.trim() || null,
    required:        required === undefined ? true : !!required,
    type:            type === "training" ? "training" : "onboarding",
    created_by_id:   manager?.id || null,
    created_by_name: manager?.name || manager?.email || null,
  };
  const { data, error } = await supabase
    .from("training_templates").insert(row).select().maybeSingle();
  if (error) throw error;
  return data ? dbTrainingTemplateToApp(data) : dbTrainingTemplateToApp(row);
}

export async function updateTrainingTemplate(id, patch) {
  if (!id) throw new Error("id required");
  const row = {};
  if (patch.title       !== undefined) row.title       = patch.title?.trim();
  if (patch.description !== undefined) row.description = patch.description?.trim() || null;
  if (patch.category    !== undefined) row.category    = patch.category?.trim() || null;
  if (patch.content     !== undefined) row.content     = patch.content?.trim() || null;
  if (patch.type        !== undefined) row.type        = patch.type === "training" ? "training" : "onboarding";
  if (patch.required    !== undefined) row.required    = !!patch.required;
  if (patch.archivedAt  !== undefined) row.archived_at = patch.archivedAt;
  const { data, error } = await supabase
    .from("training_templates").update(row).eq("id", id).select();
  if (error) throw error;
  if (data && data.length > 0) return dbTrainingTemplateToApp(data[0]);
  const { data: fresh, error: fErr } = await supabase
    .from("training_templates").select("*").eq("id", id).maybeSingle();
  if (fErr) throw fErr;
  if (!fresh) throw new Error(`Template ${id} updated but could not be retrieved.`);
  return dbTrainingTemplateToApp(fresh);
}

export async function archiveTrainingTemplate(id) {
  if (!id) throw new Error("id required");
  return updateTrainingTemplate(id, { archivedAt: new Date().toISOString() });
}

// Instantiate a template into a store: reads the template, writes a NEW
// store-specific module copied from it (sort_order appended, source recorded).
// Returns the created module (app-shaped). The new module is fully independent.
export async function instantiateTemplate(templateId, storeId, sortOrder) {
  if (!templateId || !storeId) throw new Error("templateId and storeId required");
  const { data: tpl, error: tErr } = await supabase
    .from("training_templates").select("*").eq("id", templateId).maybeSingle();
  if (tErr) throw tErr;
  if (!tpl) throw new Error("Template not found.");
  const row = {
    id:                 `tmod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    store_id:           storeId,
    title:              tpl.title,
    description:        tpl.description || null,
    category:           tpl.category || null,
    content:            tpl.content || null,
    required:           tpl.required ?? true,
    type:               tpl.type || "onboarding",
    sort_order:         Number.isFinite(sortOrder) ? sortOrder : 0,
    source_template_id: tpl.id,
  };
  const { data, error } = await supabase
    .from("training_modules").insert(row).select().maybeSingle();
  if (error) throw error;
  return data ? dbTrainingModuleToApp(data) : dbTrainingModuleToApp(row);
}

// ════════════════════════════════════════════════════════════════════════════
// DOCUMENT COMMENTS (onboarding documents — step 3)
// ════════════════════════════════════════════════════════════════════════════
// Per-document back-and-forth thread. Anyone with visibility can post. Unread
// tracked via read_by array (same pattern as inbox_messages). In-app only.

function dbDocumentCommentToApp(c) {
  return {
    id:         c.id,
    documentId: c.document_id,
    employeeId: c.employee_id || null,
    authorId:   c.author_id || null,
    authorName: c.author_name || "Unknown",
    authorRole: c.author_role || null,
    body:       c.body,
    readBy:     c.read_by || [],
    createdAt:  c.created_at,
  };
}

// All comments for one employee's documents (one query for the whole tab).
export async function fetchDocumentComments(employeeId) {
  if (!employeeId) return [];
  const { data, error } = await supabase
    .from("document_comments")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(dbDocumentCommentToApp);
}

// Post a comment on a document. authorRole is a display hint ('trainee'|'manager'|'hr').
// The author is recorded as having read their own comment.
export async function addDocumentComment({ documentId, employeeId, body, author, authorRole }) {
  if (!documentId) throw new Error("documentId required");
  if (!body?.trim()) throw new Error("comment body required");
  const authorId = author?.id || null;
  const row = {
    id:          `dcmt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    document_id: documentId,
    employee_id: employeeId || null,
    author_id:   authorId,
    author_name: author?.name || author?.email || "Unknown",
    author_role: authorRole || null,
    body:        body.trim(),
    read_by:     authorId ? [authorId] : [],
  };
  const { data, error } = await supabase
    .from("document_comments").insert(row).select().maybeSingle();
  if (error) throw error;
  return data ? dbDocumentCommentToApp(data) : dbDocumentCommentToApp(row);
}

// Mark a comment read by a viewer (append to read_by if absent). Mirrors
// markMessageRead. Safe to call repeatedly.
export async function markDocumentCommentRead(id, readerId) {
  if (!id || !readerId) return;
  try {
    const { data: existing } = await supabase
      .from("document_comments").select("read_by").eq("id", id).single();
    if (existing && !(existing.read_by || []).includes(readerId)) {
      await supabase
        .from("document_comments")
        .update({ read_by: [...(existing.read_by || []), readerId] })
        .eq("id", id);
    }
  } catch (err) {
    console.error("markDocumentCommentRead failed:", err);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// CONTRACT TEMPLATES (web-authored contracts — stage 1, preview only)
// ════════════════════════════════════════════════════════════════════════════
// Boilerplate authored once with {{tokens}} that fill from an employee record
// at preview time. No signing/snapshot here — that is stage 2.

function dbContractTemplateToApp(t) {
  return {
    id:            t.id,
    title:         t.title,
    description:   t.description || "",
    body:          t.body || "",
    createdById:   t.created_by_id || null,
    createdByName: t.created_by_name || null,
    createdAt:     t.created_at,
    updatedAt:     t.updated_at,
    archivedAt:    t.archived_at || null,
  };
}

export async function fetchContractTemplates() {
  const { data, error } = await supabase
    .from("contract_templates")
    .select("*")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(dbContractTemplateToApp);
}

export async function createContractTemplate({ title, description, body, author }) {
  if (!title?.trim()) throw new Error("Title is required");
  const row = {
    id:              `ctpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title:           title.trim(),
    description:     description?.trim() || null,
    body:            body || "",
    created_by_id:   author?.id || null,
    created_by_name: author?.name || author?.email || null,
  };
  const { data, error } = await supabase
    .from("contract_templates").insert(row).select().maybeSingle();
  if (error) throw error;
  return data ? dbContractTemplateToApp(data) : dbContractTemplateToApp(row);
}

export async function updateContractTemplate(id, fields) {
  if (!id) throw new Error("id required");
  const row = { updated_at: new Date().toISOString() };
  if (fields.title       !== undefined) row.title       = fields.title.trim();
  if (fields.description !== undefined) row.description = fields.description?.trim() || null;
  if (fields.body        !== undefined) row.body        = fields.body;
  const { data, error } = await supabase
    .from("contract_templates").update(row).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data ? dbContractTemplateToApp(data) : null;
}

export async function archiveContractTemplate(id) {
  if (!id) throw new Error("id required");
  const { error } = await supabase
    .from("contract_templates")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════════════════
// EMPLOYEE CONTRACTS (web-authored contracts — stage 2: send + sign)
// ════════════════════════════════════════════════════════════════════════════
// filled_body is FROZEN at send time (caller substitutes all tokens before
// calling sendContract). The signature attaches to this frozen text. We never
// recompute it — that is the compliance guarantee.

function dbEmployeeContractToApp(c) {
  return {
    id:                 c.id,
    employeeId:         c.employee_id,
    templateId:         c.template_id || null,
    title:              c.title,
    filledBody:         c.filled_body,
    fieldValues:        c.field_values || {},
    status:             c.status || "sent",
    sentById:           c.sent_by_id || null,
    sentByName:         c.sent_by_name || null,
    sentAt:             c.sent_at || null,
    signedById:         c.signed_by_id || null,
    signedByName:       c.signed_by_name || null,
    signatureStatement: c.signature_statement || null,
    signedAt:           c.signed_at || null,
    voidedAt:           c.voided_at || null,
    createdAt:          c.created_at,
    updatedAt:          c.updated_at,
  };
}

// All contracts for one employee (newest first).
export async function fetchEmployeeContracts(employeeId) {
  if (!employeeId) return [];
  const { data, error } = await supabase
    .from("employee_contracts")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(dbEmployeeContractToApp);
}

// Send a contract to an employee. filledBody MUST already be fully substituted
// (the caller freezes it). This stores the frozen text + the manual field
// values used. Status starts "sent".
export async function sendContract({ employeeId, templateId, title, filledBody, fieldValues, sentBy }) {
  if (!employeeId) throw new Error("employeeId required");
  if (!filledBody?.trim()) throw new Error("Contract body is empty");
  if (!title?.trim()) throw new Error("Title required");
  const row = {
    id:           `ectr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    employee_id:  employeeId,
    template_id:  templateId || null,
    title:        title.trim(),
    filled_body:  filledBody,            // FROZEN — exactly as the employee will see/sign
    field_values: fieldValues || {},
    status:       "sent",
    sent_by_id:   sentBy?.id || null,
    sent_by_name: sentBy?.name || sentBy?.email || null,
    sent_at:      new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("employee_contracts").insert(row).select().maybeSingle();
  if (error) throw error;
  return data ? dbEmployeeContractToApp(data) : dbEmployeeContractToApp(row);
}

// Employee signs. Does NOT touch filled_body (the frozen text the signature
// attaches to). Records signer identity + statement + timestamp.
export async function signEmployeeContract(id, { signerId, signerName, statement }) {
  if (!id) throw new Error("id required");
  if (!signerName?.trim()) throw new Error("Signature name required");
  const { data, error } = await supabase
    .from("employee_contracts")
    .update({
      status:              "signed",
      signed_by_id:        signerId || null,
      signed_by_name:      signerName.trim(),
      signature_statement: statement || null,
      signed_at:           new Date().toISOString(),
      updated_at:          new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "sent")   // guard: only an un-signed, sent contract can be signed
    .select().maybeSingle();
  if (error) throw error;
  return data ? dbEmployeeContractToApp(data) : null;
}

// Void a sent contract (e.g. wrong details). Signed contracts are NOT voidable
// here — a signed contract is a record; supersede with a new one instead.
export async function voidContract(id) {
  if (!id) throw new Error("id required");
  const { data, error } = await supabase
    .from("employee_contracts")
    .update({ status: "voided", voided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "sent")
    .select().maybeSingle();
  if (error) throw error;
  return data ? dbEmployeeContractToApp(data) : null;
}

// ════════════════════════════════════════════════════════════════════════════
// POLICY ACKNOWLEDGEMENTS (onboarding)
// ════════════════════════════════════════════════════════════════════════════
// One row per (employee, policy). The employee ticks to confirm they've read a
// policy; we record who/when/the statement — same audit shape as signing.

function dbPolicyAckToApp(a) {
  return {
    id:                 a.id,
    employeeId:         a.employee_id,
    policyKey:          a.policy_key,
    policyLabel:        a.policy_label,
    statement:          a.statement || null,
    acknowledgedByName: a.acknowledged_by_name || null,
    acknowledgedAt:     a.acknowledged_at,
  };
}

export async function fetchPolicyAcknowledgements(employeeId) {
  if (!employeeId) return [];
  const { data, error } = await supabase
    .from("policy_acknowledgements")
    .select("*")
    .eq("employee_id", employeeId);
  if (error) throw error;
  return (data || []).map(dbPolicyAckToApp);
}

// Record an acknowledgement. Upserts on (employee_id, policy_key) so re-ack
// updates rather than duplicates.
export async function acknowledgePolicy({ employeeId, policyKey, policyLabel, statement, byName }) {
  if (!employeeId || !policyKey) throw new Error("employeeId and policyKey required");
  const row = {
    id:          `pack-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    employee_id: employeeId,
    policy_key:  policyKey,
    policy_label: policyLabel || policyKey,
    statement:   statement || null,
    acknowledged_by_name: byName || null,
    acknowledged_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("policy_acknowledgements")
    .upsert(row, { onConflict: "employee_id,policy_key" })
    .select().maybeSingle();
  if (error) throw error;
  return data ? dbPolicyAckToApp(data) : dbPolicyAckToApp(row);
}

// ════════════════════════════════════════════════════════════════════════════
// ADVERTISED ROLES (hiring — advert titles, separate from store roles)
// ════════════════════════════════════════════════════════════════════════════
function dbAdvertisedRoleToApp(r) {
  return {
    id:          r.id,
    title:       r.title,
    description: r.description || "",
    active:      r.active ?? true,
    sortOrder:   r.sort_order ?? 0,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
    archivedAt:  r.archived_at || null,
  };
}

export async function fetchAdvertisedRoles() {
  const { data, error } = await supabase
    .from("advertised_roles")
    .select("*")
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw error;
  return (data || []).map(dbAdvertisedRoleToApp);
}

export async function createAdvertisedRole({ title, description, sortOrder }) {
  if (!title?.trim()) throw new Error("Title is required");
  const row = {
    id:          `adr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title:       title.trim(),
    description: description?.trim() || null,
    active:      true,
    sort_order:  sortOrder ?? 0,
  };
  const { data, error } = await supabase
    .from("advertised_roles").insert(row).select().maybeSingle();
  if (error) throw error;
  return data ? dbAdvertisedRoleToApp(data) : dbAdvertisedRoleToApp(row);
}

export async function updateAdvertisedRole(id, fields) {
  if (!id) throw new Error("id required");
  const row = { updated_at: new Date().toISOString() };
  if (fields.title       !== undefined) row.title       = fields.title.trim();
  if (fields.description !== undefined) row.description = fields.description?.trim() || null;
  if (fields.active      !== undefined) row.active      = !!fields.active;
  if (fields.sortOrder   !== undefined) row.sort_order  = fields.sortOrder;
  const { data, error } = await supabase
    .from("advertised_roles").update(row).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data ? dbAdvertisedRoleToApp(data) : null;
}

export async function archiveAdvertisedRole(id) {
  if (!id) throw new Error("id required");
  const { error } = await supabase
    .from("advertised_roles")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════════════════
// EMPLOYEE SELF-FILL LINK (public, token-based personal-details entry)
// ════════════════════════════════════════════════════════════════════════════
// A manager generates a token for an employee and shares the link. The employee
// opens it (no login) and fills PERSONAL details only. Security: the public
// update writes ONLY a fixed allow-list of fields — never role/pay/PIN/bank/
// status — regardless of what's submitted.

// Generate a long unguessable token and attach it to an employee.
export async function generateSelfFillToken(employeeId) {
  if (!employeeId) throw new Error("employeeId required");
  const rand = (typeof crypto !== "undefined" && crypto.getRandomValues)
    ? Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, "0")).join("")
    : (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36));
  const token = `sf_${rand}`;
  const { error } = await supabase
    .from("ops_team").update({ selffill_token: token }).eq("id", employeeId);
  if (error) throw error;
  return token;
}

export async function clearSelfFillToken(employeeId) {
  if (!employeeId) throw new Error("employeeId required");
  const { error } = await supabase
    .from("ops_team").update({ selffill_token: null }).eq("id", employeeId);
  if (error) throw error;
}

// PUBLIC: fetch the limited employee info needed to render the self-fill form,
// found by token. Returns only personal fields (never pay/role/pin/bank).
export async function fetchEmployeeBySelfFillToken(token) {
  if (!token) throw new Error("token required");
  const { data, error } = await supabase
    .from("ops_team")
    .select("id, first_name, last_name, nickname, email, phone, dob, gender, address, legal_status, ni_number, photo_url, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, pin, selffill_token, selffill_completed_at")
    .eq("selffill_token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    firstName: data.first_name || "",
    lastName: data.last_name || "",
    nickname: data.nickname || "",
    email: data.email || "",
    phone: data.phone || "",
    dob: data.dob || "",
    gender: data.gender || "",
    address: data.address || "",
    legalStatus: data.legal_status || "",
    niNumber: data.ni_number || "",
    photoUrl: data.photo_url || null,
    emergencyContactName: data.emergency_contact_name || "",
    emergencyContactPhone: data.emergency_contact_phone || "",
    emergencyContactRelationship: data.emergency_contact_relationship || "",
    pin: data.pin || "",
    completedAt: data.selffill_completed_at || null,
  };
}

// PUBLIC: save the employee's self-filled personal details, found by token.
// SECURITY: only the allow-listed personal columns are ever written — role,
// pay, pin, bank, status, token, etc. can NOT be set through this path even if
// included in `fields`. The .eq(token) match scopes the write to that one row.
const SELFFILL_ALLOWED = {
  firstName: "first_name", lastName: "last_name", nickname: "nickname",
  email: "email", phone: "phone", dob: "dob", gender: "gender", address: "address",
  legalStatus: "legal_status", niNumber: "ni_number", photoUrl: "photo_url",
  emergencyContactName: "emergency_contact_name",
  emergencyContactPhone: "emergency_contact_phone",
  emergencyContactRelationship: "emergency_contact_relationship",
  pin: "pin",
};
export async function isPinAvailable(pin, selfToken) {
  if (!pin) return false;
  const { data, error } = await supabase
    .from("ops_team").select("id, selffill_token").eq("pin", pin);
  if (error) throw error;
  // Free if nobody else holds it (allow the owner of this token to keep theirs)
  return !(data || []).some(r => r.selffill_token !== selfToken);
}

export async function submitSelfFill(token, fields) {
  if (!token) throw new Error("token required");
  // If a PIN is being set, enforce global uniqueness (the kiosk identifies
  // people by PIN, so two people cannot share one).
  if (fields.pin) {
    if (!/^\d{4,6}$/.test(String(fields.pin))) throw new Error("PIN must be 4 to 6 digits.");
    const free = await isPinAvailable(String(fields.pin), token);
    if (!free) throw new Error("That PIN is already in use. Please choose a different one.");
  }
  const row = { selffill_completed_at: new Date().toISOString() };
  for (const [appKey, dbCol] of Object.entries(SELFFILL_ALLOWED)) {
    if (fields[appKey] !== undefined) {
      const v = fields[appKey];
      row[dbCol] = (typeof v === "string" ? v.trim() : v) || null;
    }
  }
  const { data, error } = await supabase
    .from("ops_team").update(row).eq("selffill_token", token).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This link is no longer valid.");
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
// PAYROLL (Stage 2: NMW rates + rate resolver; Stage 3/4 add periods + export)
// ════════════════════════════════════════════════════════════════════════════

// ── Minimum wage rates ──────────────────────────────────────────────────────
export async function fetchMinimumWageRates() {
  const { data, error } = await supabase
    .from("minimum_wage_rates")
    .select("*")
    .order("effective_from", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function upsertMinimumWageRate(rate) {
  // rate: { id?, band, rate, effective_from }
  const { data, error } = await supabase
    .from("minimum_wage_rates")
    .upsert(rate, { onConflict: "band,effective_from" })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function removeMinimumWageRate(id) {
  const { error } = await supabase.from("minimum_wage_rates").delete().eq("id", id);
  if (error) throw error;
  return true;
}

// ── Rate resolver ───────────────────────────────────────────────────────────
// Compute exact age on a given date.
export function ageOnDate(dob, onDate) {
  if (!dob) return null;
  const b = new Date(dob);
  const d = new Date(onDate);
  if (isNaN(b) || isNaN(d)) return null;
  let age = d.getFullYear() - b.getFullYear();
  const m = d.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) age--;
  return age;
}

// Map an age to an NMW band. Returns '21_over' | '18_20' | 'under_18'.
export function bandForAge(age) {
  if (age == null) return null;
  if (age >= 21) return "21_over";
  if (age >= 18) return "18_20";
  return "under_18";
}

// From a preloaded rates array, find the rate for a band effective on a date.
// rates: array of { band, rate, effective_from }. Returns number or null.
export function rateForBandOnDate(rates, band, onDate) {
  if (!rates || !band) return null;
  const d = new Date(onDate);
  const candidates = rates
    .filter((r) => r.band === band && new Date(r.effective_from) <= d)
    .sort((a, b) => new Date(b.effective_from) - new Date(a.effective_from));
  return candidates.length ? Number(candidates[0].rate) : null;
}

// Resolve the hourly rate for an employee on a specific work date.
// employee: ops_team row (needs pay_basis, hourly_rate, dob).
// rates: preloaded minimum_wage_rates array.
// Returns { rate, basis, band, age, error }. error is set (and rate null) when
// a minimum-wage employee has no configured rate for their band on that date,
// or DOB is missing — we FLAG, never guess.
export function resolveHourlyRate(employee, workDate, rates) {
  // Accept BOTH the camelCase app shape (payBasis, hourlyRate, dob) and the
  // snake_case DB shape (pay_basis, hourly_rate) — callers pass either.
  const basis = employee?.payBasis ?? employee?.pay_basis ?? "fixed";
  const hourly = employee?.hourlyRate ?? employee?.hourly_rate;
  const dob = employee?.dob;
  if (basis === "fixed") {
    const r = Number(hourly);
    if ((hourly == null) || isNaN(r)) {
      return { rate: null, basis, band: null, age: null, error: "No fixed hourly_rate set for this employee." };
    }
    return { rate: r, basis, band: null, age: null, error: null };
  }
  // minimum_wage
  if (!dob) {
    return { rate: null, basis, band: null, age: null, error: "Minimum-wage employee has no date of birth set — cannot determine age band." };
  }
  const age = ageOnDate(dob, workDate);
  const band = bandForAge(age);
  if (!band) {
    return { rate: null, basis, band: null, age, error: "Could not determine age band." };
  }
  const rate = rateForBandOnDate(rates, band, workDate);
  if (rate == null) {
    return { rate: null, basis, band, age, error: `No minimum-wage rate configured for band ${band} effective on ${workDate}. Add it in the Minimum Wage admin.` };
  }
  return { rate, basis, band, age, error: null };
}

// ── Payroll periods (used in Stage 3/4) ─────────────────────────────────────
export async function fetchPayrollPeriods({ employeeId, periodStart, periodEnd } = {}) {
  let q = supabase.from("payroll_periods").select("*");
  if (employeeId) q = q.eq("employee_id", employeeId);
  if (periodStart) q = q.eq("period_start", periodStart);
  if (periodEnd) q = q.eq("period_end", periodEnd);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function upsertPayrollPeriod(period) {
  const row = { ...period, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from("payroll_periods")
    .upsert(row, { onConflict: "employee_id,period_start,period_end" })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ── Employee loans (internal only) ──────────────────────────────────────────
export async function fetchEmployeeLoans(employeeId) {
  const { data, error } = await supabase
    .from("employee_loans")
    .select("*")
    .eq("employee_id", employeeId)
    .order("entry_date", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addLoanEntry(entry) {
  // entry: { employee_id, entry_type: 'advance'|'repayment', amount, entry_date?, note?, created_by?, brand_id? }
  const { data, error } = await supabase.from("employee_loans").insert(entry).select().maybeSingle();
  if (error) throw error;
  return data;
}

export function loanBalance(entries) {
  if (!entries) return 0;
  return entries.reduce((bal, e) => bal + (e.entry_type === "advance" ? Number(e.amount) : -Number(e.amount)), 0);
}

// ── Loan request → approval → repayment workflow ────────────────────────────
const mapLoanReq = (r) => ({
  id: r.id, employeeId: r.employee_id, brandId: r.brand_id || "",
  amountRequested: Number(r.amount_requested) || 0,
  amountApproved: r.amount_approved != null ? Number(r.amount_approved) : null,
  reason: r.reason || "", status: r.status,
  installmentAmount: r.installment_amount != null ? Number(r.installment_amount) : null,
  installmentFreq: r.installment_freq || "",
  contractId: r.contract_id || null,
  decidedBy: r.decided_by || "", decidedAt: r.decided_at, declineReason: r.decline_reason || "",
  createdAt: r.created_at,
});
const mapLoanPay = (p) => ({
  id: p.id, loanId: p.loan_id, employeeId: p.employee_id,
  amount: Number(p.amount) || 0, paidDate: p.paid_date, method: p.method || "",
  note: p.note || "", status: p.status, confirmedBy: p.confirmed_by || "",
  confirmedAt: p.confirmed_at, rejectReason: p.reject_reason || "", createdAt: p.created_at,
});

export async function fetchLoanRequests({ employeeId, status } = {}) {
  let q = supabase.from("loan_requests").select("*").order("created_at", { ascending: false });
  if (employeeId) q = q.eq("employee_id", employeeId);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapLoanReq);
}

export async function fetchLoanPayments({ loanId, employeeId, status } = {}) {
  let q = supabase.from("loan_payments").select("*").order("paid_date", { ascending: false });
  if (loanId) q = q.eq("loan_id", loanId);
  if (employeeId) q = q.eq("employee_id", employeeId);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapLoanPay);
}

// Employee submits a loan request.
export async function createLoanRequest({ employeeId, brandId, amountRequested, reason }) {
  const { data, error } = await supabase.from("loan_requests").insert({
    employee_id: employeeId, brand_id: brandId || null,
    amount_requested: amountRequested, reason: reason || null, status: "pending",
  }).select().maybeSingle();
  if (error) throw error;
  return data ? mapLoanReq(data) : null;
}

// Employee cancels their own pending request.
export async function cancelLoanRequest(id) {
  const { error } = await supabase.from("loan_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "pending");
  if (error) throw error;
  return id;
}

// HQ approves: sets approved amount + installment terms, marks active, and
// writes the disbursement as an 'advance' to the employee_loans ledger.
export async function approveLoanRequest({ id, employeeId, brandId, amountApproved, installmentAmount, installmentFreq, decidedBy }) {
  const { data, error } = await supabase.from("loan_requests").update({
    status: "active", amount_approved: amountApproved,
    installment_amount: installmentAmount || null, installment_freq: installmentFreq || null,
    decided_by: decidedBy || null, decided_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", id).select().maybeSingle();
  if (error) throw error;
  // Ledger advance (drives the running balance).
  await supabase.from("employee_loans").insert({
    employee_id: employeeId, brand_id: brandId || null, entry_type: "advance",
    amount: amountApproved, note: "Loan approved", created_by: decidedBy || null,
    loan_id: id, source: "request_approved",
  });
  return data ? mapLoanReq(data) : null;
}

// Link a sent loan contract to a request, moving it to contract_sent.
export async function attachLoanContract({ id, contractId }) {
  const { data, error } = await supabase.from("loan_requests").update({
    contract_id: contractId, status: "contract_sent", updated_at: new Date().toISOString(),
  }).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data ? mapLoanReq(data) : null;
}

export async function declineLoanRequest({ id, decidedBy, declineReason }) {
  const { data, error } = await supabase.from("loan_requests").update({
    status: "declined", decided_by: decidedBy || null, decided_at: new Date().toISOString(),
    decline_reason: declineReason || null, updated_at: new Date().toISOString(),
  }).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data ? mapLoanReq(data) : null;
}

// Employee records a repayment (pending HQ confirmation).
export async function recordLoanPayment({ loanId, employeeId, amount, paidDate, method, note }) {
  const { data, error } = await supabase.from("loan_payments").insert({
    loan_id: loanId, employee_id: employeeId, amount, paid_date: paidDate || new Date().toISOString().split("T")[0],
    method: method || null, note: note || null, status: "pending",
  }).select().maybeSingle();
  if (error) throw error;
  return data ? mapLoanPay(data) : null;
}

// HQ confirms a payment: writes a 'repayment' to the ledger and, if the loan is
// fully repaid, marks the request settled.
export async function confirmLoanPayment({ paymentId, loanId, employeeId, brandId, amount, confirmedBy }) {
  const { data, error } = await supabase.from("loan_payments").update({
    status: "confirmed", confirmed_by: confirmedBy || null, confirmed_at: new Date().toISOString(),
  }).eq("id", paymentId).select().maybeSingle();
  if (error) throw error;
  await supabase.from("employee_loans").insert({
    employee_id: employeeId, brand_id: brandId || null, entry_type: "repayment",
    amount, note: "Loan repayment confirmed", created_by: confirmedBy || null,
    loan_id: loanId, source: "payment_confirmed",
  });
  // If balance now zero or below for this employee, settle any active loans.
  try {
    const entries = await fetchEmployeeLoans(employeeId);
    if (loanBalance(entries) <= 0.001) {
      await supabase.from("loan_requests").update({ status: "settled", updated_at: new Date().toISOString() })
        .eq("employee_id", employeeId).eq("status", "active");
    }
  } catch { /* non-fatal */ }
  return data ? mapLoanPay(data) : null;
}

export async function rejectLoanPayment({ paymentId, confirmedBy, rejectReason }) {
  const { data, error } = await supabase.from("loan_payments").update({
    status: "rejected", confirmed_by: confirmedBy || null, confirmed_at: new Date().toISOString(),
    reject_reason: rejectReason || null,
  }).eq("id", paymentId).select().maybeSingle();
  if (error) throw error;
  return data ? mapLoanPay(data) : null;
}


// ===== INVOICE_HELPERS_V1: invoice capture (upload → extract → review → approve) =====
export async function uploadInvoiceFile(file, entity, userId) {
  const safe = (file.name || "invoice").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const path = `${entity}/${Date.now()}_${safe}`;
  const { error: upErr } = await supabase.storage.from("invoices").upload(path, file, { upsert: false });
  if (upErr) throw upErr;
  const { data, error } = await supabase
    .from("invoices")
    .insert({ entity, image_path: path, uploaded_by: userId, status: "uploaded" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function extractInvoice(invoiceId) {
  const headers = {};
  if (process.env.REACT_APP_SYNC_SECRET) headers["x-sync-secret"] = process.env.REACT_APP_SYNC_SECRET;
  const { data, error } = await supabase.functions.invoke("INVOICE_EXTRACT_V1", {
    body: { invoice_id: invoiceId },
    headers,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "extraction failed");
  return data;
}

export async function listInvoices() {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, entity, supplier_name, invoice_number, invoice_date, due_date, paid_date, total_ex_vat, total_vat, status, payment_status, amount_paid, category, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data || [];
}

export async function getInvoiceWithLines(invoiceId) {
  const { data: inv, error: e1 } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();
  if (e1) throw e1;
  const { data: lines, error: e2 } = await supabase
    .from("invoice_lines")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("line_no", { ascending: true });
  if (e2) throw e2;
  return { invoice: inv, lines: lines || [] };
}

export async function getInvoiceFileUrl(path) {
  const { data, error } = await supabase.storage.from("invoices").createSignedUrl(path, 3600);
  if (error) throw error;
  return data?.signedUrl || null;
}

export async function saveInvoiceLine(lineId, fields) {
  const { error } = await supabase.from("invoice_lines").update(fields).eq("id", lineId);
  if (error) throw error;
}

export async function setInvoiceLineStatus(lineId, status) {
  const { error } = await supabase.from("invoice_lines").update({ status }).eq("id", lineId);
  if (error) throw error;
}

export async function searchCogsIngredients(domain, q) {
  let query = supabase.from("cogs_ingredients").select("id, name").eq("domain", domain).eq("active", true).limit(12);
  if (q && q.trim()) query = query.ilike("name", `%${q.trim()}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function updateInvoiceHeader(invoiceId, fields) {
  const { error } = await supabase.from("invoices").update(fields).eq("id", invoiceId);
  if (error) throw error;
}

export async function approveInvoiceRpc(invoiceId, userId) {
  const { data, error } = await supabase.rpc("approve_invoice", { p_invoice_id: invoiceId, p_user: userId });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function rejectInvoice(invoiceId, note) {
  const { error } = await supabase
    .from("invoices")
    .update({ status: "rejected", error_note: note || "rejected in review" })
    .eq("id", invoiceId);
  if (error) throw error;
}

export async function deleteInvoice(invoiceId) {
  // Remove the invoice and its lines. Lines first in case no cascade is set.
  await supabase.from("invoice_lines").delete().eq("invoice_id", invoiceId);
  const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
  if (error) throw error;
  return invoiceId;
}

// ── App settings (global key/value) ─────────────────────────────────────────
// ── Pay periods (approval + lock) ───────────────────────────────────────────
export async function fetchPayPeriods() {
  const { data, error } = await supabase.from("pay_periods").select("*").order("period_start", { ascending: false });
  if (error) throw error;
  return (data || []).map(dbPayPeriodToApp);
}
export async function upsertPayPeriod(pp) {
  const row = {
    id: pp.id, store_id: pp.storeId || null,
    period_start: pp.periodStart, period_end: pp.periodEnd,
    status: pp.status || "open", approved_by: pp.approvedBy || null,
    approved_at: pp.approvedAt || null, updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("pay_periods").upsert(row, { onConflict: "id" }).select().single();
  if (error) throw error;
  return dbPayPeriodToApp(data);
}
export async function deletePayPeriod(id) {
  const { error } = await supabase.from("pay_periods").delete().eq("id", id);
  if (error) throw error;
  return id;
}
function dbPayPeriodToApp(p) {
  return {
    id: p.id, storeId: p.store_id || null,
    periodStart: p.period_start, periodEnd: p.period_end,
    status: p.status || "open", approvedBy: p.approved_by || "",
    approvedAt: p.approved_at || null, createdAt: p.created_at,
  };
}

export async function fetchAppSettings() {
  const { data, error } = await supabase.from("app_settings").select("key, value");
  if (error) throw error;
  const out = {};
  (data || []).forEach(r => { out[r.key] = r.value; });
  return out;
}
export async function upsertAppSetting(key, value) {
  const { error } = await supabase.from("app_settings").upsert({ key, value: String(value) }, { onConflict: "key" });
  if (error) throw error;
  return { key, value: String(value) };
}

// ── Bank transactions (CSV import) ──────────────────────────────────────────
export async function fetchBankTransactions({ from, to } = {}) {
  let q = supabase.from("bank_transactions").select("*").order("txn_date", { ascending: false });
  if (from) q = q.gte("txn_date", from);
  if (to)   q = q.lte("txn_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(dbBankTxnToApp);
}
export async function insertBankTransactions(rows) {
  if (!rows || !rows.length) return { inserted: 0, total: 0 };
  const dbRows = rows.map(r => ({
    id: r.id, account: r.account || null, txn_date: r.txnDate,
    description: r.description || null, reference: r.reference || null,
    amount: r.amount, balance: r.balance ?? null, category: r.category || null,
    reconciled: false, dedupe_key: r.dedupeKey,
    account_id: r.accountId || null, store_id: r.storeId || null,
  }));
  const { data, error } = await supabase
    .from("bank_transactions")
    .upsert(dbRows, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select();
  if (error) throw error;
  return { inserted: (data || []).length, total: rows.length };
}
export async function updateBankTransaction(id, patch) {
  const row = {};
  if (patch.reconciled !== undefined) row.reconciled = patch.reconciled;
  if (patch.matchedTo  !== undefined) row.matched_to = patch.matchedTo || null;
  if (patch.notes      !== undefined) row.notes = patch.notes || null;
  if (patch.category   !== undefined) row.category = patch.category || null;
  const { data, error } = await supabase.from("bank_transactions").update(row).eq("id", id).select().single();
  if (error) throw error;
  return dbBankTxnToApp(data);
}
export async function deleteBankTransaction(id) {
  const { error } = await supabase.from("bank_transactions").delete().eq("id", id);
  if (error) throw error;
  return id;
}
function dbBankTxnToApp(t) {
  return {
    id: t.id, account: t.account || "", txnDate: t.txn_date,
    description: t.description || "", reference: t.reference || "",
    amount: Number(t.amount) || 0, balance: t.balance == null ? null : Number(t.balance),
    category: t.category || "", reconciled: !!t.reconciled,
    matchedTo: t.matched_to || "", notes: t.notes || "", importedAt: t.imported_at,
    accountId: t.account_id || "", storeId: t.store_id || "",
  };
}

// ── Bank accounts (per store) ───────────────────────────────────────────────
export async function fetchBankAccounts() {
  const { data, error } = await supabase.from("bank_accounts").select("*").order("name");
  if (error) throw error;
  return (data || []).map(a => ({
    id: a.id, name: a.name || "", bank: a.bank || "", storeId: a.store_id || "",
    brandId: a.brand_id || "", archived: !!a.archived, createdAt: a.created_at,
  }));
}
export async function upsertBankAccount(acc) {
  const row = {
    id: acc.id, name: acc.name, bank: acc.bank || null,
    store_id: acc.storeId || null, brand_id: acc.brandId || null,
    archived: !!acc.archived,
  };
  const { data, error } = await supabase.from("bank_accounts").upsert(row).select().single();
  if (error) throw error;
  return { id: data.id, name: data.name || "", bank: data.bank || "", storeId: data.store_id || "", brandId: data.brand_id || "", archived: !!data.archived, createdAt: data.created_at };
}
export async function deleteBankAccount(id) {
  const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
  if (error) throw error;
  return id;
}

// ── ACCOUNTS / P&L data ─────────────────────────────────────────────────────
// EOD entries within a date range (net_sales, labor_cost, cogs_cost per store/day).
export async function fetchEodForAccounts({ from, to } = {}) {
  let q = supabase.from("eod_entries")
    .select("id, brand_id, store_id, date, net_sales, labor_cost, cogs_cost, total_hours, total_orders")
    .order("date", { ascending: false });
  if (from) q = q.gte("date", from);
  if (to)   q = q.lte("date", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(e => ({
    id: e.id, brandId: e.brand_id || "", storeId: e.store_id || "", date: e.date,
    netSales: Number(e.net_sales) || 0, laborCost: Number(e.labor_cost) || 0,
    cogsCost: Number(e.cogs_cost) || 0, totalHours: Number(e.total_hours) || 0,
    totalOrders: Number(e.total_orders) || 0,
  }));
}
// Invoices within a date range (supplier costs).
export async function fetchInvoicesForAccounts({ from, to } = {}) {
  let q = supabase.from("invoices")
    .select("id, entity, supplier_name, invoice_number, invoice_date, total_ex_vat, total_vat, status, payment_status, category")
    .order("invoice_date", { ascending: false });
  if (from) q = q.gte("invoice_date", from);
  if (to)   q = q.lte("invoice_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(i => ({
    id: i.id, entity: i.entity || "", supplier: i.supplier_name || "",
    number: i.invoice_number || "", date: i.invoice_date,
    totalExVat: Number(i.total_ex_vat) || 0, totalVat: Number(i.total_vat) || 0,
    status: i.status || "", paymentStatus: i.payment_status || "unpaid", category: i.category || "",
  }));
}

// ── Categorisation (Stage 2) ────────────────────────────────────────────────
export async function fetchTxnCategories() {
  const { data, error } = await supabase.from("transaction_categories").select("*").order("sort_order");
  if (error) throw error;
  return (data || []).map(c => ({
    id: c.id, name: c.name, type: c.type || "expense", pnlLine: c.pnl_line || "overheads",
    sortOrder: c.sort_order ?? 100, archived: !!c.archived,
  }));
}
export async function upsertTxnCategory(cat) {
  const row = { id: cat.id, name: cat.name, type: cat.type || "expense", pnl_line: cat.pnlLine || "overheads", sort_order: cat.sortOrder ?? 100, archived: !!cat.archived };
  const { data, error } = await supabase.from("transaction_categories").upsert(row).select().single();
  if (error) throw error;
  return { id: data.id, name: data.name, type: data.type, pnlLine: data.pnl_line, sortOrder: data.sort_order, archived: !!data.archived };
}
export async function deleteTxnCategory(id) {
  const { error } = await supabase.from("transaction_categories").delete().eq("id", id);
  if (error) throw error;
  return id;
}

export async function fetchTxnCategoryRules() {
  const { data, error } = await supabase.from("category_rules").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({ id: r.id, matchText: r.match_text, category: r.category, source: r.source || "bank" }));
}
export async function upsertTxnCategoryRule(rule) {
  const row = { id: rule.id, match_text: (rule.matchText || "").trim().toLowerCase(), category: rule.category, source: rule.source || "bank" };
  const { data, error } = await supabase.from("category_rules").upsert(row).select().single();
  if (error) throw error;
  return { id: data.id, matchText: data.match_text, category: data.category, source: data.source };
}
export async function deleteTxnCategoryRule(id) {
  const { error } = await supabase.from("category_rules").delete().eq("id", id);
  if (error) throw error;
  return id;
}
export function applyTxnCategoryRules(description, rules) {
  const d = String(description || "").toLowerCase();
  for (const r of rules || []) {
    if (r.matchText && d.includes(r.matchText)) return r.category;
  }
  return "";
}

// ── Reconciliation (Stage 3) ────────────────────────────────────────────────
// Stored matches (bank line ↔ source items; batches share bank_txn_id).
export async function fetchReconMatches() {
  const { data, error } = await supabase.from("reconciliation_matches").select("*");
  if (error) throw error;
  return (data || []).map(m => ({
    id: m.id, bankTxnId: m.bank_txn_id, sourceType: m.source_type, sourceId: m.source_id,
    sourceLabel: m.source_label || "", amount: Number(m.amount) || 0, auto: !!m.auto, matchedAt: m.matched_at,
  }));
}
export async function addReconMatches(rows) {
  if (!rows || !rows.length) return [];
  const dbRows = rows.map(r => ({
    id: r.id || `rm-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    bank_txn_id: r.bankTxnId, source_type: r.sourceType, source_id: r.sourceId,
    source_label: r.sourceLabel || null, amount: r.amount || 0, auto: !!r.auto, matched_by: r.matchedBy || null,
  }));
  const { data, error } = await supabase.from("reconciliation_matches").insert(dbRows).select();
  if (error) throw error;
  return (data || []).map(m => ({ id: m.id, bankTxnId: m.bank_txn_id, sourceType: m.source_type, sourceId: m.source_id, sourceLabel: m.source_label || "", amount: Number(m.amount)||0, auto: !!m.auto }));
}
export async function deleteReconMatchesForTxn(bankTxnId) {
  const { error } = await supabase.from("reconciliation_matches").delete().eq("bank_txn_id", bankTxnId);
  if (error) throw error;
  return bankTxnId;
}

// Candidate sources in a date range.
export async function fetchPayrollRunsForRecon({ from, to } = {}) {
  let q = supabase.from("payroll_periods").select("employee_id, employee_name, period_start, period_end, net_pay, gross_pay");
  if (from) q = q.gte("period_end", from);
  if (to)   q = q.lte("period_end", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((p, i) => ({
    id: `pay-${p.employee_id}-${p.period_start}-${p.period_end}`,
    employeeId: p.employee_id, employeeName: p.employee_name || "",
    periodStart: p.period_start, periodEnd: p.period_end,
    amount: Number(p.net_pay ?? p.gross_pay) || 0,
  }));
}
// Flipdish card settlement totals per store/day (candidate payouts).
export async function fetchPayoutsForRecon({ from, to } = {}) {
  const pays = await fetchStoreDayPayments({ from, to }).catch(() => []);
  const byDay = {};
  (pays || []).forEach(p => {
    const m = String(p.paymentMethod || "").toLowerCase();
    if (m.includes("cash")) return; // card/online only
    const key = `${p.storeId || p.brandId}|${p.date}`;
    byDay[key] = byDay[key] || { id: `payout-${key}`, storeId: p.storeId, brandId: p.brandId, date: p.date, amount: 0 };
    byDay[key].amount += p.amount;
  });
  return Object.values(byDay);
}

export async function listStoresLite() {
  const { data, error } = await supabase.from("stores").select("id, name").order("name");
  if (error) throw error;
  return data || [];
}
// ===== end INVOICE_HELPERS_V1 =====


// ===== GBP_REVIEWS_V1: fetch Google reviews + trigger sync =====
export async function fetchGoogleReviews({ minStar, storeId } = {}) {
  let q = supabase.from("google_reviews").select("*").order("create_time", { ascending: false }).limit(300);
  if (typeof minStar === "number") q = q.lte("star_rating", minStar);
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(r => ({
    reviewId: r.review_id, storeId: r.store_id, locationId: r.location_id,
    stars: r.star_rating, comment: r.comment || "", reviewer: r.reviewer_name || "Anonymous",
    reply: r.reply_comment || null, createTime: r.create_time, updateTime: r.update_time,
    replyStatus: r.reply_status || "none", draftReply: r.draft_reply || null, replyError: r.reply_error || null,
  }));
}

export async function triggerGoogleReviewsSync() {
  const headers = {};
  if (process.env.REACT_APP_SYNC_SECRET) headers["x-sync-secret"] = process.env.REACT_APP_SYNC_SECRET;
  const { data, error } = await supabase.functions.invoke("gbp-reviews-sync", { body: {}, headers });
  if (error) throw error;
  return data;
}

export async function getGoogleReviewsSyncState() {
  const { data, error } = await supabase.from("google_reviews_sync_state").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data;
}

// ----- GBP_REPLY_V1: AI review replies -----
export async function generateReviewReplies() {
  const headers = {};
  if (process.env.REACT_APP_SYNC_SECRET) headers["x-sync-secret"] = process.env.REACT_APP_SYNC_SECRET;
  const { data, error } = await supabase.functions.invoke("gbp-reply", { body: {}, headers });
  if (error) throw error;
  return data;
}
export async function postReviewReply(reviewId, comment, userId) {
  const headers = {};
  if (process.env.REACT_APP_SYNC_SECRET) headers["x-sync-secret"] = process.env.REACT_APP_SYNC_SECRET;
  const { data, error } = await supabase.functions.invoke("gbp-reply", {
    body: { post_review_id: reviewId, comment, user_id: userId }, headers,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "post failed");
  return data;
}
// ----- end GBP_REPLY_V1 -----


// Period + store scoped reviews for the dashboard rating tile (counts + drill).
// Returns lightweight rows; date-filters on create_time. 90-day fetch for the
// rolling average, caller buckets to the selected period for the distribution.
export async function fetchReviewsForDashboard({ from, to } = {}) {
  let q = supabase.from("google_reviews")
    .select("review_id, store_id, star_rating, comment, reviewer_name, create_time, reply_comment")
    .not("star_rating", "is", null)
    .order("create_time", { ascending: false })
    .limit(5000);
  if (from) q = q.gte("create_time", from);
  if (to)   q = q.lte("create_time", to + "T23:59:59");
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(r => ({
    reviewId: r.review_id, storeId: r.store_id, stars: r.star_rating,
    comment: r.comment || "", reviewer: r.reviewer_name || "Anonymous",
    createTime: r.create_time, reply: r.reply_comment || null,
  }));
}


// Official per-store Google stats: averageRating + totalReviewCount as Google
// reports them (captured by the sync from the reviews API response). Matches the
// listing exactly, independent of how many individual reviews we've synced.
export async function fetchReviewStats() {
  const { data, error } = await supabase
    .from("google_location_stats")
    .select("store_id, average_rating, total_review_count");
  if (error) throw error;
  // a store may have >1 mapped location; pool by weighted average.
  const byStore = {};
  (data || []).forEach(r => {
    if (!r.store_id) return;
    const n = Number(r.total_review_count) || 0;
    const a = Number(r.average_rating) || 0;
    byStore[r.store_id] = byStore[r.store_id] || { storeId: r.store_id, n: 0, weighted: 0 };
    byStore[r.store_id].n += n;
    byStore[r.store_id].weighted += a * n;
  });
  return Object.values(byStore).map(s => ({
    storeId: s.storeId, n: s.n, avg: s.n > 0 ? s.weighted / s.n : 0,
    s5: 0, s4: 0, s3: 0, s2: 0, s1: 0,  // per-star counts come from synced reviews (period distribution)
  }));
}

// ===== end GBP_REVIEWS_V1 =====

// ===== COGS_V1 — cost of goods / recipe costing =============================
// Tables: cogs_ingredients, cogs_preps, cogs_prep_components,
//         cogs_products, cogs_product_components, cogs_pos_map. RLS off.

export async function fetchCogsAll() {
  const [ings, preps, prepComps, prods, prodComps, posMap] = await Promise.all([
    supabase.from("cogs_ingredients").select("*").order("name"),
    supabase.from("cogs_preps").select("*").order("name"),
    supabase.from("cogs_prep_components").select("*"),
    supabase.from("cogs_products").select("*").order("name"),
    supabase.from("cogs_product_components").select("*"),
    supabase.from("cogs_pos_map").select("*"),
  ]);
  const err = ings.error || preps.error || prepComps.error || prods.error || prodComps.error || posMap.error;
  if (err) throw err;
  const map = (r) => ({
    id: r.id, name: r.name, nameNorm: (r.name||"").trim().toLowerCase(), category: r.category,
    baseUnit: r.base_unit, packDesc: r.pack_desc, packQty: r.pack_qty, packUnit: r.pack_unit,
    packPrice: r.pack_price, supplier: r.supplier, notes: r.notes,
    costPerBaseUnit: r.cost_per_base_unit,
  });
  const mapPrep = (r) => ({
    id: r.id, name: r.name, nameNorm: (r.name||"").trim().toLowerCase(), production: r.production,
    yieldQty: r.yield_qty, yieldUnit: r.yield_unit, transferPrice: r.transfer_price, notes: r.notes,
  });
  const mapComp = (r) => ({
    id: r.id, prepId: r.prep_id, productId: r.product_id, name: r.component_name,
    kind: r.component_kind, ingredientId: r.ingredient_id, prepId2: r.prep_id ?? r.sub_prep_id,
    subPrepId: r.sub_prep_id, linkedPrepId: r.prep_id, qty: r.qty, unit: r.unit, notes: r.notes,
  });
  return {
    ingredients: (ings.data || []).map(map),
    preps: (preps.data || []).map(mapPrep),
    prepComponents: (prepComps.data || []).map(r => ({
      id: r.id, prepId: r.prep_id, name: r.component_name, kind: r.component_kind,
      ingredientId: r.ingredient_id, subPrepId: r.sub_prep_id, qty: r.qty, unit: r.unit,
    })),
    products: (prods.data || []).map(r => ({
      id: r.id, name: r.name, nameNorm: (r.name||"").trim().toLowerCase(), category: r.category, notes: r.notes,
    })),
    productComponents: (prodComps.data || []).map(r => ({
      id: r.id, productId: r.product_id, name: r.component_name, kind: r.component_kind,
      ingredientId: r.ingredient_id, prepId: r.prep_id, qty: r.qty, unit: r.unit,
    })),
    posMap: (posMap.data || []).map(r => ({
      id: r.id, posName: r.pos_name, productId: r.product_id, confirmed: r.confirmed,
    })),
  };
}

export async function updateCogsIngredient(id, patch) {
  const body = {};
  if ("packPrice" in patch) body.pack_price = patch.packPrice;
  if ("packQty"   in patch) body.pack_qty   = patch.packQty;
  if ("supplier"  in patch) body.supplier   = patch.supplier;
  if ("category"  in patch) body.category   = patch.category;
  if ("baseUnit"  in patch) body.base_unit  = patch.baseUnit;
  if ("notes"     in patch) body.notes      = patch.notes;
  body.updated_at = new Date().toISOString();
  const { error } = await supabase.from("cogs_ingredients").update(body).eq("id", id);
  if (error) throw error;
}

export async function updateCogsPrep(id, patch) {
  const body = {};
  if ("production"    in patch) body.production     = patch.production;
  if ("yieldQty"      in patch) body.yield_qty      = patch.yieldQty;
  if ("yieldUnit"     in patch) body.yield_unit     = patch.yieldUnit;
  if ("transferPrice" in patch) body.transfer_price = patch.transferPrice;
  if ("notes"         in patch) body.notes          = patch.notes;
  body.updated_at = new Date().toISOString();
  const { error } = await supabase.from("cogs_preps").update(body).eq("id", id);
  if (error) throw error;
}
// ===== end COGS_V1 =====

// ===== REVIEW_SCANS_V1 — per-staff review QR scan tracking ==================
// The redirect Edge Function logs scans into review_scans. This fetches a
// leaderboard for managers (scans per staff, optionally per store/period).
export async function fetchReviewScanStats({ since = null, storeId = null } = {}) {
  let q = supabase.from("review_scans").select("staff_id, store_id, scanned_at");
  if (since)   q = q.gte("scanned_at", since);
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(r => ({ staffId: r.staff_id, storeId: r.store_id, scannedAt: r.scanned_at }));
}
// ===== end REVIEW_SCANS_V1 =====

// ===== INVENTORY_BUILDER_V1 — store + CK inventory masters ==================
const _invMap = (r) => ({
  id: r.id, name: r.name, category: r.category, supplier: r.supplier,
  packDesc: r.pack_desc, packQty: r.pack_qty, baseUnit: r.base_unit, packPrice: r.pack_price,
  costPerBaseUnit: r.cost_per_base_unit, notes: r.notes,
  allergens: r.allergens || [], reorderPoint: r.reorder_point != null ? Number(r.reorder_point) : null,
  siteId: r.site_id || null, archivedAt: r.archived_at || null,
});
function _invBody(p) {
  const b = {};
  if ("name" in p) b.name = p.name;
  if ("category" in p) b.category = p.category;
  if ("supplier" in p) b.supplier = p.supplier;
  if ("packDesc" in p) b.pack_desc = p.packDesc;
  if ("packQty" in p) b.pack_qty = p.packQty === "" || p.packQty == null ? null : Number(p.packQty);
  if ("baseUnit" in p) b.base_unit = p.baseUnit;
  if ("packPrice" in p) b.pack_price = p.packPrice === "" || p.packPrice == null ? null : Number(p.packPrice);
  if ("notes" in p) b.notes = p.notes;
  if ("allergens" in p) b.allergens = Array.isArray(p.allergens) ? p.allergens : [];
  if ("reorderPoint" in p) b.reorder_point = p.reorderPoint === "" || p.reorderPoint == null ? null : Number(p.reorderPoint);
  if ("siteId" in p) b.site_id = p.siteId || null;
  return b;
}

export async function fetchInventory() {
  const [store, ck, cats] = await Promise.all([
    supabase.from("cogs_store_items").select("*").order("name"),
    supabase.from("cogs_ck_items").select("*").order("name"),
    supabase.from("cogs_categories").select("*"),
  ]);
  const err = store.error || ck.error || cats.error;
  if (err) throw err;
  return {
    store: (store.data || []).map(_invMap),
    ck: (ck.data || []).map(_invMap),
    categories: (cats.data || []).map(c => ({ id: c.id, scope: c.scope, name: c.name })),
  };
}

// scope: 'store' | 'ck'
export async function addInventoryItem(scope, patch) {
  const table = scope === "ck" ? "cogs_ck_items" : "cogs_store_items";
  const body = _invBody(patch);
  if (!body.name) body.name = "New item";
  const { data, error } = await supabase.from(table).insert(body).select().single();
  if (error) throw error;
  return _invMap(data);
}
export async function updateInventoryItem(scope, id, patch) {
  const table = scope === "ck" ? "cogs_ck_items" : "cogs_store_items";
  const body = _invBody(patch); body.updated_at = new Date().toISOString();
  const { error } = await supabase.from(table).update(body).eq("id", id);
  if (error) throw error;
}
export async function deleteInventoryItem(scope, id) {
  const table = scope === "ck" ? "cogs_ck_items" : "cogs_store_items";
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

// Bulk import from Excel. rows = array of {name,category,supplier,packDesc,packQty,baseUnit,packPrice,notes}.
// If wipe=true, clears the target table first (replace-all import).
export async function bulkAddInventory(scope, rows, wipe = false) {
  const table = scope === "ck" ? "cogs_ck_items" : "cogs_store_items";
  if (wipe) {
    const { error: delErr } = await supabase.from(table).delete().neq("id", 0);
    if (delErr) throw delErr;
  }
  const bodies = rows.map(r => {
    const b = _invBody(r);
    if (!b.name) b.name = "Unnamed item";
    return b;
  });
  // insert in chunks of 500 to stay within limits
  let inserted = 0;
  for (let i = 0; i < bodies.length; i += 500) {
    const chunk = bodies.slice(i, i + 500);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
  }
  // ensure any new categories exist in the category list
  const cats = [...new Set(rows.map(r => r.category).filter(Boolean))];
  for (const name of cats) {
    await supabase.from("cogs_categories").insert({ scope, name }).then(() => {}, () => {});
  }
  // ensure any new suppliers exist in the supplier list (scope supplier_store / supplier_ck)
  const supScope = scope === "ck" ? "supplier_ck" : "supplier_store";
  const suppliers = [...new Set(rows.map(r => r.supplier).filter(Boolean))];
  for (const name of suppliers) {
    await supabase.from("cogs_categories").insert({ scope: supScope, name }).then(() => {}, () => {});
  }
  return inserted;
}
export async function addCategory(scope, name) {
  const { error } = await supabase.from("cogs_categories").insert({ scope, name });
  if (error && error.code !== "23505") throw error; // ignore duplicates
}
export async function deleteCategory(id) {
  const { error } = await supabase.from("cogs_categories").delete().eq("id", id);
  if (error) throw error;
}
// ===== end INVENTORY_BUILDER_V1 =====

// ===== RECIPE_BUILDER_V1 — preps, modifiers, products =======================
export async function fetchRecipes() {
  const [preps, prepComps, mods, prods, prodComps, prodMods, variants] = await Promise.all([
    supabase.from("cogs_preps").select("*").order("name"),
    supabase.from("cogs_prep_components").select("*"),
    supabase.from("cogs_modifiers").select("*").order("group_label").order("name"),
    supabase.from("cogs_products").select("*").order("name"),
    supabase.from("cogs_product_components").select("*"),
    supabase.from("cogs_product_modifiers").select("*"),
    supabase.from("cogs_product_variants").select("*").order("sort_order"),
  ]);
  const err = preps.error || prepComps.error || mods.error || prods.error || prodComps.error || prodMods.error || variants.error;
  if (err) throw err;
  return {
    preps: (preps.data||[]).map(p => ({ id:p.id, name:p.name, yieldQty:p.yield_qty, yieldUnit:p.yield_unit, notes:p.notes })),
    prepComponents: (prepComps.data||[]).map(c => ({ id:c.id, prepId:c.prep_id, itemScope:c.item_scope, itemId:c.item_id, itemName:c.item_name, portionQty:c.portion_qty, unit:c.unit })),
    modifiers: (mods.data||[]).map(m => ({ id:m.id, name:m.name, groupLabel:m.group_label, itemScope:m.item_scope, itemId:m.item_id, itemName:m.item_name, portionQty:m.portion_qty, unit:m.unit })),
    products: (prods.data||[]).map(p => ({ id:p.id, name:p.name, category:p.category, posName:p.pos_name, notes:p.notes })),
    productVariants: (variants.data||[]).map(v => ({ id:v.id, productId:v.product_id, name:v.name, sortOrder:v.sort_order })),
    productComponents: (prodComps.data||[]).map(c => ({ id:c.id, productId:c.product_id, variantId:c.variant_id, kind:c.kind, itemScope:c.item_scope, itemId:c.item_id, prepId:c.prep_id, label:c.label, portionQty:c.portion_qty, unit:c.unit })),
    productModifiers: (prodMods.data||[]).map(m => ({ id:m.id, productId:m.product_id, modifierId:m.modifier_id })),
  };
}

// --- product variants ---
export async function addProductVariant(productId, patch = {}) {
  const { data, error } = await supabase.from("cogs_product_variants")
    .insert({ product_id: productId, name: patch.name || "New variation", sort_order: patch.sortOrder ?? 0 })
    .select().single();
  if (error) throw error;
  const newId = data.id;
  // Optionally copy the recipe from an existing variant (so the team edits
  // rather than rebuilds). copyFromVariantId may be a variant id, or null to
  // copy the base recipe (components with variant_id null).
  if ("copyFromVariantId" in patch) {
    let q = supabase.from("cogs_product_components").select("*").eq("product_id", productId);
    q = patch.copyFromVariantId == null ? q.is("variant_id", null) : q.eq("variant_id", patch.copyFromVariantId);
    const { data: src, error: sErr } = await q;
    if (sErr) throw sErr;
    if (src && src.length) {
      const rows = src.map(c => ({
        product_id: productId, variant_id: newId, kind: c.kind,
        item_scope: c.item_scope, item_id: c.item_id, prep_id: c.prep_id,
        label: c.label, portion_qty: c.portion_qty, unit: c.unit,
      }));
      const { error: iErr } = await supabase.from("cogs_product_components").insert(rows);
      if (iErr) throw iErr;
    }
  }
  return newId;
}
export async function updateProductVariant(id, patch) {
  const b = {}; if ("name" in patch) b.name = patch.name; if ("sortOrder" in patch) b.sort_order = Number(patch.sortOrder)||0;
  const { error } = await supabase.from("cogs_product_variants").update(b).eq("id", id); if (error) throw error;
}
export async function deleteProductVariant(id) {
  const { error } = await supabase.from("cogs_product_variants").delete().eq("id", id); if (error) throw error;
}
// Delete a variation but KEEP its recipe by moving its components back to the
// base (variant_id null). Used when removing the last variation so the product
// cleanly returns to a simple single-recipe product instead of losing the work.
export async function deleteVariantKeepRecipe(productId, variantId) {
  const { error: upErr } = await supabase.from("cogs_product_components")
    .update({ variant_id: null }).eq("product_id", productId).eq("variant_id", variantId);
  if (upErr) throw upErr;
  const { error } = await supabase.from("cogs_product_variants").delete().eq("id", variantId);
  if (error) throw error;
}
// Enable variations on a simple product: turn the current base recipe (components
// with variant_id null) into the first named variant, then return its id so the
// caller can add a second empty variant.
export async function enableProductVariations(productId, firstName = "Variation 1") {
  const { data: v, error: vErr } = await supabase.from("cogs_product_variants")
    .insert({ product_id: productId, name: firstName, sort_order: 0 }).select().single();
  if (vErr) throw vErr;
  const { error: upErr } = await supabase.from("cogs_product_components")
    .update({ variant_id: v.id }).eq("product_id", productId).is("variant_id", null);
  if (upErr) throw upErr;
  return v.id;
}

// --- preps ---
export async function addPrep(patch) {
  const { data, error } = await supabase.from("cogs_preps").insert({ name: patch.name || "New prep", yield_qty: patch.yieldQty ?? null, yield_unit: patch.yieldUnit ?? null }).select().single();
  if (error) throw error; return data.id;
}
export async function updatePrep(id, patch) {
  const b = {}; if ("name" in patch) b.name = patch.name; if ("yieldQty" in patch) b.yield_qty = patch.yieldQty===""?null:Number(patch.yieldQty);
  if ("yieldUnit" in patch) b.yield_unit = patch.yieldUnit; if ("notes" in patch) b.notes = patch.notes; b.updated_at = new Date().toISOString();
  const { error } = await supabase.from("cogs_preps").update(b).eq("id", id); if (error) throw error;
}
export async function deletePrep(id) { const { error } = await supabase.from("cogs_preps").delete().eq("id", id); if (error) throw error; }
export async function addPrepComponent(prepId, c) {
  const { error } = await supabase.from("cogs_prep_components").insert({ prep_id: prepId, item_scope: c.itemScope, item_id: c.itemId, item_name: c.itemName, portion_qty: c.portionQty ?? null, unit: c.unit });
  if (error) throw error;
}
export async function updatePrepComponent(id, c) {
  const b = {}; if ("portionQty" in c) b.portion_qty = c.portionQty===""?null:Number(c.portionQty); if ("unit" in c) b.unit = c.unit;
  if ("itemScope" in c) b.item_scope = c.itemScope; if ("itemId" in c) b.item_id = c.itemId; if ("itemName" in c) b.item_name = c.itemName;
  const { error } = await supabase.from("cogs_prep_components").update(b).eq("id", id); if (error) throw error;
}
export async function deletePrepComponent(id) { const { error } = await supabase.from("cogs_prep_components").delete().eq("id", id); if (error) throw error; }

// --- modifiers ---
export async function addModifier(patch) {
  const { error } = await supabase.from("cogs_modifiers").insert({ name: patch.name || "New modifier", group_label: patch.groupLabel, item_scope: patch.itemScope, item_id: patch.itemId, item_name: patch.itemName, portion_qty: patch.portionQty ?? null, unit: patch.unit });
  if (error) throw error;
}
export async function updateModifier(id, patch) {
  const b = {}; ["name","groupLabel","itemScope","itemId","itemName","unit"].forEach(k => { if (k in patch) b[{name:"name",groupLabel:"group_label",itemScope:"item_scope",itemId:"item_id",itemName:"item_name",unit:"unit"}[k]] = patch[k]; });
  if ("portionQty" in patch) b.portion_qty = patch.portionQty===""?null:Number(patch.portionQty);
  const { error } = await supabase.from("cogs_modifiers").update(b).eq("id", id); if (error) throw error;
}
export async function deleteModifier(id) { const { error } = await supabase.from("cogs_modifiers").delete().eq("id", id); if (error) throw error; }

// --- products ---
export async function addProduct(patch) {
  const { data, error } = await supabase.from("cogs_products").insert({ name: patch.name || "New product", category: patch.category, pos_name: patch.posName }).select().single();
  if (error) throw error;
  return data.id;
}
export async function updateProduct(id, patch) {
  const b = {}; if ("name" in patch) b.name = patch.name; if ("category" in patch) b.category = patch.category; if ("posName" in patch) b.pos_name = patch.posName; if ("notes" in patch) b.notes = patch.notes; b.updated_at = new Date().toISOString();
  const { error } = await supabase.from("cogs_products").update(b).eq("id", id); if (error) throw error;
}
export async function deleteProduct(id) { const { error } = await supabase.from("cogs_products").delete().eq("id", id); if (error) throw error; }
export async function addProductComponent(productId, c) {
  const { error } = await supabase.from("cogs_product_components").insert({ product_id: productId, variant_id: c.variantId ?? null, kind: c.kind, item_scope: c.itemScope, item_id: c.itemId, prep_id: c.prepId, label: c.label, portion_qty: c.portionQty ?? null, unit: c.unit });
  if (error) throw error;
}
export async function updateProductComponent(id, c) {
  const b = {}; if ("portionQty" in c) b.portion_qty = c.portionQty===""?null:Number(c.portionQty); if ("unit" in c) b.unit = c.unit;
  const { error } = await supabase.from("cogs_product_components").update(b).eq("id", id); if (error) throw error;
}
export async function updateProductComponentRef(id, c) {
  const b = {};
  if ("kind" in c) b.kind = c.kind;
  if ("itemScope" in c) b.item_scope = c.itemScope;
  if ("itemId" in c) b.item_id = c.itemId;
  if ("prepId" in c) b.prep_id = c.prepId;
  if ("label" in c) b.label = c.label;
  const { error } = await supabase.from("cogs_product_components").update(b).eq("id", id); if (error) throw error;
}
export async function deleteProductComponent(id) { const { error } = await supabase.from("cogs_product_components").delete().eq("id", id); if (error) throw error; }
export async function attachProductModifier(productId, modifierId) {
  const { error } = await supabase.from("cogs_product_modifiers").insert({ product_id: productId, modifier_id: modifierId }); if (error) throw error;
}
export async function detachProductModifier(id) { const { error } = await supabase.from("cogs_product_modifiers").delete().eq("id", id); if (error) throw error; }
// ===== end RECIPE_BUILDER_V1 =====

// ===== POS_MAPPER_V1 — per-store till name -> master product ===============
// Distinct till (item) names per store from sales, with total qty/revenue.
export async function fetchStoreTillNames(storeId) {
  let q = supabase.from("item_day_aggregates").select("item, qty, revenue").eq("store_id", storeId);
  const { data, error } = await q;
  if (error) throw error;
  const acc = {};
  (data || []).forEach(r => {
    const name = (r.item || "").trim(); if (!name) return;
    acc[name] = acc[name] || { name, qty: 0, revenue: 0 };
    acc[name].qty += Number(r.qty) || 0;
    acc[name].revenue += Number(r.revenue) || 0;
  });
  return Object.values(acc).sort((a, b) => b.revenue - a.revenue);
}

export async function fetchPosMappings(storeId = null) {
  let q = supabase.from("cogs_pos_mappings").select("*");
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(r => ({ id: r.id, storeId: r.store_id, posName: r.pos_name, productId: r.product_id }));
}

// upsert a (store, pos_name) -> product mapping
export async function setPosMapping(storeId, posName, productId) {
  const { data: existing } = await supabase
    .from("cogs_pos_mappings").select("id").eq("store_id", storeId).ilike("pos_name", posName).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("cogs_pos_mappings").update({ product_id: productId }).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("cogs_pos_mappings").insert({ store_id: storeId, pos_name: posName, product_id: productId });
    if (error) throw error;
  }
}
export async function deletePosMapping(id) {
  const { error } = await supabase.from("cogs_pos_mappings").delete().eq("id", id);
  if (error) throw error;
}
// ===== end POS_MAPPER_V1 =====

// ============================================================================
// CENTRAL KITCHEN — Phase 1: ingredients + goods-in (batch-tracked)
// ============================================================================
const mapIngredient = (r) => ({
  id: r.id, siteId: r.site_id || null, name: r.name, category: r.category || "",
  unit: r.base_unit || "kg", allergens: r.allergens || [],
  reorderPoint: r.reorder_point != null ? Number(r.reorder_point) : null,
  defaultSupplier: r.supplier || "", note: r.notes || "",
  packDesc: r.pack_desc || "", packQty: r.pack_qty, packPrice: r.pack_price,
  costPerBaseUnit: r.cost_per_base_unit != null ? Number(r.cost_per_base_unit) : null,
  archivedAt: r.archived_at || null, createdAt: r.created_at,
});
const mapGoodsIn = (r) => ({
  id: r.id, siteId: r.site_id || null, ingredientId: r.ingredient_id,
  qtyReceived: Number(r.qty_received) || 0, qtyRemaining: Number(r.qty_remaining) || 0,
  unit: r.unit || "kg", batchNo: r.batch_no || "", supplier: r.supplier || "",
  receivedDate: r.received_date, expiryDate: r.expiry_date || null,
  unitCost: r.unit_cost != null ? Number(r.unit_cost) : null,
  totalCost: r.total_cost != null ? Number(r.total_cost) : null,
  invoiceRef: r.invoice_ref || "", receivedBy: r.received_by || "", note: r.note || "",
  createdAt: r.created_at,
});

export async function fetchCkIngredients(siteId) {
  // Unified: central-kitchen ingredients live in cogs_ck_items (shared with the
  // RecipeBuilder costing). siteId is accepted but items may be unscoped (null).
  const { data, error } = await supabase.from("cogs_ck_items").select("*").is("archived_at", null).order("name");
  if (error) throw error;
  return (data || []).map(mapIngredient);
}

export async function upsertCkIngredient(ing) {
  const row = {
    name: ing.name, category: ing.category || null, base_unit: ing.unit || "kg",
    allergens: ing.allergens || [],
    reorder_point: ing.reorderPoint != null && ing.reorderPoint !== "" ? Number(ing.reorderPoint) : null,
    supplier: ing.defaultSupplier || null, notes: ing.note || null,
    site_id: ing.siteId || null,
  };
  if (ing.id) {
    const { data, error } = await supabase.from("cogs_ck_items").update(row).eq("id", ing.id).select().maybeSingle();
    if (error) throw error;
    return data ? mapIngredient(data) : null;
  }
  const { data, error } = await supabase.from("cogs_ck_items").insert(row).select().maybeSingle();
  if (error) throw error;
  return data ? mapIngredient(data) : null;
}

export async function archiveCkIngredient(id) {
  const { error } = await supabase.from("cogs_ck_items").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return id;
}

export async function fetchCkGoodsIn(siteId, { ingredientId } = {}) {
  let q = supabase.from("ck_goods_in").select("*").order("received_date", { ascending: false });
  if (siteId) q = q.eq("site_id", siteId);
  if (ingredientId) q = q.eq("ingredient_id", ingredientId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapGoodsIn);
}

export async function addCkGoodsIn(g) {
  const qty = Number(g.qtyReceived);
  const unitCost = g.unitCost != null && g.unitCost !== "" ? Number(g.unitCost) : null;
  const row = {
    id: `gin-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    site_id: g.siteId || null, ingredient_id: g.ingredientId,
    qty_received: qty, qty_remaining: qty, unit: g.unit || "kg",
    batch_no: g.batchNo || null, supplier: g.supplier || null,
    received_date: g.receivedDate || new Date().toISOString().split("T")[0],
    expiry_date: g.expiryDate || null, unit_cost: unitCost,
    total_cost: g.totalCost != null && g.totalCost !== "" ? Number(g.totalCost) : (unitCost != null ? +(unitCost * qty).toFixed(2) : null),
    invoice_ref: g.invoiceRef || null, received_by: g.receivedBy || null, note: g.note || null,
  };
  const { data, error } = await supabase.from("ck_goods_in").insert(row).select().maybeSingle();
  if (error) throw error;
  return data ? mapGoodsIn(data) : null;
}

export async function deleteCkGoodsIn(id) {
  // Remove any production-consumption rows referencing this batch first
  // (the FK would otherwise block the delete).
  await supabase.from("ck_run_consumption").delete().eq("goods_in_id", id);
  const { error } = await supabase.from("ck_goods_in").delete().eq("id", id);
  if (error) throw error;
  return id;
}

// Current stock per ingredient = sum of remaining across goods-in batches.
export function computeCkStock(ingredients, goodsIn) {
  const byIng = {};
  (goodsIn || []).forEach(g => { byIng[g.ingredientId] = (byIng[g.ingredientId] || 0) + (g.qtyRemaining || 0); });
  return (ingredients || []).map(i => ({
    ...i, stock: byIng[i.id] || 0,
    low: i.reorderPoint != null && (byIng[i.id] || 0) <= i.reorderPoint,
  }));
}

// ── Central Kitchen — categories, suppliers, bulk ingredient add ─────────────
const mapCkCat = (r) => ({ id: r.id, siteId: r.site_id||null, name: r.name, sortOrder: r.sort_order||0, archivedAt: r.archived_at||null });
const mapCkSup = (r) => ({ id: r.id, siteId: r.site_id||null, name: r.name, contact: r.contact||"", phone: r.phone||"", email: r.email||"", note: r.note||"", archivedAt: r.archived_at||null });

export async function fetchCkCategories(siteId) {
  let q = supabase.from("ck_categories").select("*").is("archived_at", null).order("sort_order").order("name");
  if (siteId) q = q.eq("site_id", siteId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapCkCat);
}
export async function upsertCkCategory(c) {
  const row = { site_id: c.siteId||null, name: c.name, sort_order: c.sortOrder||0 };
  if (c.id) { const { data, error } = await supabase.from("ck_categories").update(row).eq("id", c.id).select().maybeSingle(); if (error) throw error; return data?mapCkCat(data):null; }
  row.id = `cat-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const { data, error } = await supabase.from("ck_categories").insert(row).select().maybeSingle();
  if (error) throw error; return data?mapCkCat(data):null;
}
export async function archiveCkCategory(id) { const { error } = await supabase.from("ck_categories").update({ archived_at: new Date().toISOString() }).eq("id", id); if (error) throw error; return id; }

export async function fetchCkSuppliers(siteId) {
  let q = supabase.from("ck_suppliers").select("*").is("archived_at", null).order("name");
  if (siteId) q = q.eq("site_id", siteId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapCkSup);
}
export async function upsertCkSupplier(s) {
  const row = { site_id: s.siteId||null, name: s.name, contact: s.contact||null, phone: s.phone||null, email: s.email||null, note: s.note||null };
  if (s.id) { const { data, error } = await supabase.from("ck_suppliers").update(row).eq("id", s.id).select().maybeSingle(); if (error) throw error; return data?mapCkSup(data):null; }
  row.id = `sup-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const { data, error } = await supabase.from("ck_suppliers").insert(row).select().maybeSingle();
  if (error) throw error; return data?mapCkSup(data):null;
}
export async function archiveCkSupplier(id) { const { error } = await supabase.from("ck_suppliers").update({ archived_at: new Date().toISOString() }).eq("id", id); if (error) throw error; return id; }

// Bulk insert ingredients into the unified cogs_ck_items table.
export async function bulkAddCkIngredients(siteId, rows) {
  const clean = (rows || []).filter(r => r.name && r.name.trim()).map(r => ({
    site_id: siteId || null, name: r.name.trim(), category: r.category?.trim() || null,
    base_unit: r.unit || "kg", allergens: Array.isArray(r.allergens) ? r.allergens : [],
    reorder_point: r.reorderPoint != null && r.reorderPoint !== "" ? Number(r.reorderPoint) : null,
    supplier: r.defaultSupplier?.trim() || null,
  }));
  if (!clean.length) return 0;
  const { error } = await supabase.from("cogs_ck_items").insert(clean);
  if (error) throw error;
  return clean.length;
}

// ============================================================================
// CENTRAL KITCHEN — Phase 2: allergen engine + production runs (traceability)
// ============================================================================

// Allergens for a kitchen product = union of its component ingredients'
// allergens (auto-derived from cogs_ck_items, expanding preps) + manual
// "may contain". `components` = ck_product_components; `prepComps` = map of
// prepId -> ck_prep_components[]; `ckItems` from fetchCkIngredients().
export function deriveCkProductAllergens(product, components, ckItems, prepCompsByPrep = {}) {
  const itemAllergens = new Map((ckItems || []).map(i => [String(i.id), i.allergens || []]));
  const derived = new Set();
  (components || []).forEach(c => {
    if (c.kind === "prep" && c.prepId) {
      (prepCompsByPrep[c.prepId] || []).forEach(pc => (itemAllergens.get(String(pc.ingredientId)) || []).forEach(a => derived.add(a)));
    } else {
      (itemAllergens.get(String(c.ingredientId)) || []).forEach(a => derived.add(a));
    }
  });
  return { derived: [...derived].sort(), mayContain: (product.mayContainAllergens || []).filter(a => !derived.has(a)) };
}

const mapCkProduct = (p) => ({
  id: p.id, siteId: p.site_id || null, name: p.name, category: p.category || "",
  outputUnit: p.output_unit || "each", yieldQty: p.yield_qty != null ? Number(p.yield_qty) : null,
  shelfLifeDays: p.shelf_life_days != null ? Number(p.shelf_life_days) : null,
  minutesPerUnit: p.minutes_per_unit != null ? Number(p.minutes_per_unit) : null,
  mayContainAllergens: p.may_contain_allergens || [], note: p.note || "",
  archivedAt: p.archived_at || null,
});
const mapCkComponent = (c) => ({
  id: c.id, productId: c.product_id, kind: c.kind || "ingredient",
  ingredientId: c.ingredient_id, prepId: c.prep_id || null,
  ingredientName: c.ingredient_name || "", qty: Number(c.qty) || 0, unit: c.unit || "",
});

export async function fetchCkProducts(siteId) {
  let q = supabase.from("ck_products").select("*").is("archived_at", null).order("name");
  if (siteId) q = q.eq("site_id", siteId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapCkProduct);
}

export async function fetchCkProductComponents(productId) {
  let q = supabase.from("ck_product_components").select("*");
  if (productId) q = q.eq("product_id", productId);
  const { data, error } = await q.order("created_at");
  if (error) throw error;
  return (data || []).map(mapCkComponent);
}

export async function upsertCkProduct(p) {
  const row = {
    site_id: p.siteId || null, name: p.name, category: p.category || null,
    output_unit: p.outputUnit || "each", yield_qty: p.yieldQty === "" || p.yieldQty == null ? null : Number(p.yieldQty),
    shelf_life_days: p.shelfLifeDays === "" || p.shelfLifeDays == null ? null : Number(p.shelfLifeDays),
    minutes_per_unit: p.minutesPerUnit === "" || p.minutesPerUnit == null ? null : Number(p.minutesPerUnit),
    may_contain_allergens: p.mayContainAllergens || [], note: p.note || null,
    updated_at: new Date().toISOString(),
  };
  if (p.id) {
    const { data, error } = await supabase.from("ck_products").update(row).eq("id", p.id).select().maybeSingle();
    if (error) throw error;
    return data ? mapCkProduct(data) : null;
  }
  row.id = `ckp-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const { data, error } = await supabase.from("ck_products").insert(row).select().maybeSingle();
  if (error) throw error;
  return data ? mapCkProduct(data) : null;
}

export async function archiveCkProduct(id) {
  const { error } = await supabase.from("ck_products").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return id;
}

// Replace a product's recipe components wholesale (simplest correct semantics).
export async function setCkProductComponents(productId, components) {
  await supabase.from("ck_product_components").delete().eq("product_id", productId);
  const rows = (components || []).filter(c => (c.kind === "prep" ? c.prepId : c.ingredientId) && Number(c.qty) > 0).map(c => ({
    id: `ckc-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    product_id: productId, kind: c.kind || "ingredient",
    ingredient_id: c.kind === "prep" ? null : String(c.ingredientId),
    prep_id: c.kind === "prep" ? String(c.prepId) : null,
    ingredient_name: c.ingredientName || null, qty: Number(c.qty), unit: c.unit || null,
  }));
  if (rows.length) { const { error } = await supabase.from("ck_product_components").insert(rows); if (error) throw error; }
  return rows.length;
}

// ── Kitchen preps (reusable sub-recipes) ─────────────────────────────────────
const mapCkPrep = (p) => ({
  id: p.id, siteId: p.site_id || null, name: p.name,
  yieldQty: p.yield_qty != null ? Number(p.yield_qty) : null, yieldUnit: p.yield_unit || "kg",
  note: p.note || "", archivedAt: p.archived_at || null,
});
const mapCkPrepComp = (c) => ({
  id: c.id, prepId: c.prep_id, ingredientId: c.ingredient_id, ingredientName: c.ingredient_name || "",
  qty: Number(c.qty) || 0, unit: c.unit || "",
});

export async function fetchCkPreps(siteId) {
  let q = supabase.from("ck_preps").select("*").is("archived_at", null).order("name");
  if (siteId) q = q.eq("site_id", siteId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapCkPrep);
}

export async function fetchCkPrepComponents(prepId) {
  let q = supabase.from("ck_prep_components").select("*");
  if (prepId) q = q.eq("prep_id", prepId);
  const { data, error } = await q.order("created_at");
  if (error) throw error;
  return (data || []).map(mapCkPrepComp);
}

export async function upsertCkPrep(p) {
  const row = {
    site_id: p.siteId || null, name: p.name, yield_qty: p.yieldQty === "" || p.yieldQty == null ? null : Number(p.yieldQty),
    yield_unit: p.yieldUnit || "kg", note: p.note || null, updated_at: new Date().toISOString(),
  };
  if (p.id) {
    const { data, error } = await supabase.from("ck_preps").update(row).eq("id", p.id).select().maybeSingle();
    if (error) throw error;
    return data ? mapCkPrep(data) : null;
  }
  row.id = `ckpr-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const { data, error } = await supabase.from("ck_preps").insert(row).select().maybeSingle();
  if (error) throw error;
  return data ? mapCkPrep(data) : null;
}

export async function archiveCkPrep(id) {
  const { error } = await supabase.from("ck_preps").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return id;
}

export async function setCkPrepComponents(prepId, components) {
  await supabase.from("ck_prep_components").delete().eq("prep_id", prepId);
  const rows = (components || []).filter(c => c.ingredientId && Number(c.qty) > 0).map(c => ({
    id: `ckpc-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    prep_id: prepId, ingredient_id: String(c.ingredientId), ingredient_name: c.ingredientName || null,
    qty: Number(c.qty), unit: c.unit || null,
  }));
  if (rows.length) { const { error } = await supabase.from("ck_prep_components").insert(rows); if (error) throw error; }
  return rows.length;
}

const mapRun = (r) => ({
  id: r.id, siteId: r.site_id || null, productId: r.product_id, productName: r.product_name || "",
  plannedQty: r.planned_qty != null ? Number(r.planned_qty) : null,
  producedQty: r.produced_qty != null ? Number(r.produced_qty) : null,
  outputUnit: r.output_unit || "", runDate: r.run_date, useByDate: r.use_by_date || null,
  finishedBatchNo: r.finished_batch_no || "", allergens: r.allergens || [],
  status: r.status, note: r.note || "", runBy: r.run_by || "", createdAt: r.created_at,
});
const mapConsumption = (c) => ({
  id: c.id, runId: c.run_id, goodsInId: c.goods_in_id, ingredientId: c.ingredient_id,
  ingredientName: c.ingredient_name || "", qtyUsed: Number(c.qty_used) || 0, unit: c.unit || "", batchNo: c.batch_no || "",
});

export async function fetchProductionRuns(siteId) {
  let q = supabase.from("ck_production_runs").select("*").order("run_date", { ascending: false });
  if (siteId) q = q.eq("site_id", siteId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapRun);
}

export async function fetchRunConsumption(runId) {
  const { data, error } = await supabase.from("ck_run_consumption").select("*").eq("run_id", runId).order("created_at");
  if (error) throw error;
  return (data || []).map(mapConsumption);
}

// Plan a run's consumption from a kitchen product's recipe, expanding preps
// down to raw ingredients. Demand scales by (producedQty / product yield).
// `components` = ck_product_components; `preps` = ck_preps[]; `prepCompsByPrep`
// = map prepId -> ck_prep_components[]; `goodsIn` = ck goods-in. Pure.
export function planRunConsumption({ product, components, preps = [], prepCompsByPrep = {}, producedQty, goodsIn }) {
  const yieldQty = product?.yieldQty ? Number(product.yieldQty) : 1;
  const factor = yieldQty > 0 ? (producedQty / yieldQty) : producedQty;
  const demand = new Map(); // ingredientId -> { qty, unit, name }
  const addDemand = (ingId, name, qty, unit) => {
    const k = String(ingId); const cur = demand.get(k) || { qty: 0, unit, name };
    cur.qty += qty; demand.set(k, cur);
  };
  (components || []).forEach(c => {
    if (c.kind === "prep" && c.prepId) {
      // Expand the prep: scale its components by (qty of prep used / prep yield).
      const prep = (preps || []).find(p => String(p.id) === String(c.prepId));
      const pYield = prep?.yieldQty ? Number(prep.yieldQty) : 1;
      const prepFactor = (pYield > 0 ? (Number(c.qty) || 0) / pYield : (Number(c.qty) || 0)) * factor;
      (prepCompsByPrep[c.prepId] || []).forEach(pc => addDemand(pc.ingredientId, pc.ingredientName, (Number(pc.qty) || 0) * prepFactor, pc.unit));
    } else {
      addDemand(c.ingredientId, c.ingredientName, (Number(c.qty) || 0) * factor, c.unit);
    }
  });
  const allocations = [];
  demand.forEach((d, ingId) => {
    let need = d.qty;
    const batches = (goodsIn || [])
      .filter(g => String(g.ingredientId) === ingId && g.qtyRemaining > 0)
      .sort((a, b) => {
        const ax = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
        const bx = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
        return ax - bx; // FEFO
      });
    for (const b of batches) {
      if (need <= 0.00001) break;
      const take = Math.min(need, b.qtyRemaining);
      allocations.push({ ingredientId: ingId, ingredientName: d.name, goodsInId: b.id, batchNo: b.batchNo, qtyUsed: +take.toFixed(4), unit: d.unit, available: b.qtyRemaining, expiryDate: b.expiryDate });
      need -= take;
    }
    if (need > 0.00001) allocations.push({ ingredientId: ingId, ingredientName: d.name, goodsInId: null, batchNo: null, qtyUsed: +need.toFixed(4), unit: d.unit, shortfall: true });
  });
  return { demand: [...demand.entries()].map(([id, d]) => ({ ingredientId: id, ...d })), allocations };
}

// Create a production run: writes the run, the consumption rows, and decrements
// goods-in qty_remaining for each allocated batch. `allocations` is the final
// (possibly overridden) list from planRunConsumption.
export async function createProductionRun({ siteId, product, producedQty, runDate, useByDate, allocations, allergens, note, runBy, planId, planLineId }) {
  const batchCode = `${(product.name||"PRD").replace(/[^A-Za-z0-9]/g,"").slice(0,6).toUpperCase()}-${(runDate||new Date().toISOString().slice(0,10)).replace(/-/g,"")}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const { error: rErr } = await supabase.from("ck_production_runs").insert({
    id: runId, site_id: siteId || null, product_id: product.id, product_name: product.name,
    produced_qty: producedQty, output_unit: product.outputUnit || null,
    run_date: runDate || new Date().toISOString().slice(0,10), use_by_date: useByDate || null,
    finished_batch_no: batchCode, allergens: allergens || [], status: "completed",
    note: note || null, run_by: runBy || null, plan_id: planId || null, plan_line_id: planLineId || null,
  });
  if (rErr) throw rErr;

  // Consumption rows + decrement each goods-in batch.
  const used = (allocations || []).filter(a => a.goodsInId && a.qtyUsed > 0);
  if (used.length) {
    await supabase.from("ck_run_consumption").insert(used.map(a => ({
      id: `con-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      run_id: runId, goods_in_id: a.goodsInId, ingredient_id: a.ingredientId,
      ingredient_name: a.ingredientName, qty_used: a.qtyUsed, unit: a.unit, batch_no: a.batchNo,
    })));
    // Decrement remaining per batch (read-modify-write; low volume so fine).
    for (const a of used) {
      const { data: g } = await supabase.from("ck_goods_in").select("qty_remaining").eq("id", a.goodsInId).maybeSingle();
      if (g) {
        const next = Math.max(0, Number(g.qty_remaining) - a.qtyUsed);
        await supabase.from("ck_goods_in").update({ qty_remaining: next }).eq("id", a.goodsInId);
      }
    }
  }
  return { runId, batchCode };
}

export async function deleteProductionRun(id) {
  // Note: does not restore consumed stock (intentional — production happened).
  const { error } = await supabase.from("ck_production_runs").delete().eq("id", id);
  if (error) throw error;
  return id;
}

// ============================================================================
// CENTRAL KITCHEN — Phase 3a: dispatch Kitchen → Distribution (two-step)
// ============================================================================
const mapDispatch = (d) => ({
  id: d.id, fromSiteId: d.from_site_id || null, toSiteId: d.to_site_id || null, toSiteName: d.to_site_name || "",
  dispatchNo: d.dispatch_no || "", status: d.status, sentDate: d.sent_date, sentBy: d.sent_by || "",
  receivedDate: d.received_date || null, receivedBy: d.received_by || "", note: d.note || "", createdAt: d.created_at,
});
const mapDispatchLine = (l) => ({
  id: l.id, dispatchId: l.dispatch_id, runId: l.run_id, productId: l.product_id, productName: l.product_name || "",
  finishedBatchNo: l.finished_batch_no || "", useByDate: l.use_by_date || null, allergens: l.allergens || [],
  qtySent: Number(l.qty_sent) || 0, qtyReceived: l.qty_received != null ? Number(l.qty_received) : null, unit: l.unit || "",
});
const mapDistStock = (s) => ({
  id: s.id, siteId: s.site_id || null, dispatchLineId: s.dispatch_line_id, runId: s.run_id,
  productId: s.product_id, productName: s.product_name || "", finishedBatchNo: s.finished_batch_no || "",
  useByDate: s.use_by_date || null, allergens: s.allergens || [], qtyReceived: Number(s.qty_received) || 0,
  qtyRemaining: Number(s.qty_remaining) || 0, unit: s.unit || "", receivedDate: s.received_date,
});

export async function fetchDispatches({ fromSiteId, toSiteId, status } = {}) {
  let q = supabase.from("ck_dispatches").select("*").order("sent_date", { ascending: false });
  if (fromSiteId) q = q.eq("from_site_id", fromSiteId);
  if (toSiteId) q = q.eq("to_site_id", toSiteId);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDispatch);
}

export async function fetchDispatchLines(dispatchId) {
  let q = supabase.from("ck_dispatch_lines").select("*");
  if (dispatchId) q = q.eq("dispatch_id", dispatchId);
  const { data, error } = await q.order("created_at");
  if (error) throw error;
  return (data || []).map(mapDispatchLine);
}

// How much of each run's output has already been dispatched (sent or received,
// not cancelled). Returns map runId -> qty already dispatched.
export async function fetchDispatchedByRun() {
  const { data: lines, error } = await supabase.from("ck_dispatch_lines").select("run_id, qty_sent, dispatch_id");
  if (error) throw error;
  const { data: disp } = await supabase.from("ck_dispatches").select("id, status");
  const active = new Set((disp || []).filter(d => d.status !== "cancelled").map(d => d.id));
  const m = {};
  (lines || []).forEach(l => { if (active.has(l.dispatch_id) && l.run_id) m[l.run_id] = (m[l.run_id] || 0) + (Number(l.qty_sent) || 0); });
  return m;
}

// Create a dispatch from selected production-run lines.
// lines = [{ runId, productId, productName, finishedBatchNo, useByDate, allergens, qtySent, unit }]
export async function createDispatch({ fromSiteId, toSiteId, toSiteName, sentDate, sentBy, note, lines }) {
  const valid = (lines || []).filter(l => Number(l.qtySent) > 0);
  if (!valid.length) throw new Error("Add at least one line with a quantity.");
  const dispatchId = `dsp-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const dispatchNo = `DSP-${(sentDate||new Date().toISOString().slice(0,10)).replace(/-/g,"")}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
  const { error: dErr } = await supabase.from("ck_dispatches").insert({
    id: dispatchId, from_site_id: fromSiteId || null, to_site_id: toSiteId || null, to_site_name: toSiteName || null,
    dispatch_no: dispatchNo, status: "sent", sent_date: sentDate || new Date().toISOString().slice(0,10),
    sent_by: sentBy || null, note: note || null,
  });
  if (dErr) throw dErr;
  const { error: lErr } = await supabase.from("ck_dispatch_lines").insert(valid.map(l => ({
    id: `dl-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    dispatch_id: dispatchId, run_id: l.runId || null, product_id: l.productId || null, product_name: l.productName || null,
    finished_batch_no: l.finishedBatchNo || null, use_by_date: l.useByDate || null, allergens: l.allergens || [],
    qty_sent: Number(l.qtySent), unit: l.unit || null,
  })));
  if (lErr) throw lErr;
  return { dispatchId, dispatchNo };
}

export async function cancelDispatch(id) {
  const { error } = await supabase.from("ck_dispatches").update({ status: "cancelled" }).eq("id", id);
  if (error) throw error;
  return id;
}

// Confirm receipt at distribution. receipts = [{ lineId, qtyReceived }].
// Writes distribution stock rows for received quantities and flips status.
export async function receiveDispatch({ dispatchId, toSiteId, receivedDate, receivedBy, receipts }) {
  const lines = await fetchDispatchLines(dispatchId);
  const byId = new Map(lines.map(l => [l.id, l]));
  const stockRows = [];
  for (const r of (receipts || [])) {
    const line = byId.get(r.lineId);
    if (!line) continue;
    const qty = Number(r.qtyReceived);
    // update the line's received qty
    await supabase.from("ck_dispatch_lines").update({ qty_received: qty }).eq("id", r.lineId);
    if (qty > 0) stockRows.push({
      id: `ds-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      site_id: toSiteId || null, dispatch_line_id: line.id, run_id: line.runId, product_id: line.productId,
      product_name: line.productName, finished_batch_no: line.finishedBatchNo, use_by_date: line.useByDate,
      allergens: line.allergens || [], qty_received: qty, qty_remaining: qty, unit: line.unit,
      received_date: receivedDate || new Date().toISOString().slice(0,10),
    });
  }
  if (stockRows.length) { const { error } = await supabase.from("ck_distribution_stock").insert(stockRows); if (error) throw error; }
  const { error } = await supabase.from("ck_dispatches").update({
    status: "received", received_date: receivedDate || new Date().toISOString().slice(0,10), received_by: receivedBy || null,
  }).eq("id", dispatchId);
  if (error) throw error;
  return dispatchId;
}

export async function fetchDistributionStock(siteId) {
  let q = supabase.from("ck_distribution_stock").select("*").gt("qty_remaining", 0).order("use_by_date", { ascending: true });
  if (siteId) q = q.eq("site_id", siteId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDistStock);
}

// ============================================================================
// CENTRAL KITCHEN — weekly production planner
// ============================================================================
const mapPlan = (p) => ({
  id: p.id, siteId: p.site_id || null, name: p.name, weekStart: p.week_start || null,
  note: p.note || "", isTemplate: !!p.is_template,
  labourRate: p.labour_rate != null ? Number(p.labour_rate) : null,
  shiftHours: p.shift_hours != null ? Number(p.shift_hours) : 8,
  efficiency: p.efficiency != null ? Number(p.efficiency) : 0.8,
  archivedAt: p.archived_at || null, createdAt: p.created_at,
});
const mapPlanLine = (l) => ({
  id: l.id, planId: l.plan_id, productId: l.product_id, dow: l.dow, qty: Number(l.qty) || 0,
  producedRunId: l.produced_run_id || null,
});

export async function fetchProductionPlans(siteId, { templates = false } = {}) {
  let q = supabase.from("ck_production_plans").select("*").is("archived_at", null).eq("is_template", templates).order("week_start", { ascending: false });
  if (siteId) q = q.eq("site_id", siteId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapPlan);
}

export async function fetchPlanLines(planId) {
  const { data, error } = await supabase.from("ck_plan_lines").select("*").eq("plan_id", planId);
  if (error) throw error;
  return (data || []).map(mapPlanLine);
}

export async function upsertProductionPlan(p) {
  const row = { site_id: p.siteId || null, name: p.name, week_start: p.weekStart || null, note: p.note || null, updated_at: new Date().toISOString() };
  if ("isTemplate" in p) row.is_template = !!p.isTemplate;
  if ("labourRate" in p) row.labour_rate = p.labourRate === "" || p.labourRate == null ? null : Number(p.labourRate);
  if ("shiftHours" in p) row.shift_hours = p.shiftHours === "" || p.shiftHours == null ? null : Number(p.shiftHours);
  if ("efficiency" in p) row.efficiency = p.efficiency === "" || p.efficiency == null ? null : Number(p.efficiency);
  if (p.id) {
    const { data, error } = await supabase.from("ck_production_plans").update(row).eq("id", p.id).select().maybeSingle();
    if (error) throw error;
    return data ? mapPlan(data) : null;
  }
  row.id = `plan-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const { data, error } = await supabase.from("ck_production_plans").insert(row).select().maybeSingle();
  if (error) throw error;
  return data ? mapPlan(data) : null;
}

export async function archiveProductionPlan(id) {
  const { error } = await supabase.from("ck_production_plans").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return id;
}

// Replace all lines for a plan. lines = [{ productId, dow, qty, producedRunId? }].
export async function savePlanLines(planId, lines) {
  await supabase.from("ck_plan_lines").delete().eq("plan_id", planId);
  const rows = (lines || []).filter(l => Number(l.qty) > 0).map(l => ({
    id: `pl-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    plan_id: planId, product_id: String(l.productId), dow: l.dow, qty: Number(l.qty),
    produced_run_id: l.producedRunId || null,
  }));
  if (rows.length) { const { error } = await supabase.from("ck_plan_lines").insert(rows); if (error) throw error; }
  return rows.length;
}

// Compute the economics of a plan. Pure. For each (product, total weekly qty),
// expand recipe (incl. preps) → ingredient demand → cost (from ingredient
// cost-per-unit) and requirement vs current stock.
// products: ck_products[]; compsByProduct: map productId -> components[];
// preps: ck_preps[]; prepCompsByPrep: map prepId -> prepComponents[];
// ingredients: cogs_ck_items[] (with costPerBaseUnit + stock); plannedByProduct: map productId -> totalQty.
export function computePlanEconomics({ products, compsByProduct, preps, prepCompsByPrep, ingredients, stockByIngredient, plannedByProduct }) {
  const ingMap = new Map((ingredients || []).map(i => [String(i.id), i]));
  const demand = new Map(); // ingredientId -> qty needed
  let totalCost = 0;
  const perProduct = [];

  (products || []).forEach(prod => {
    const plannedQty = Number(plannedByProduct[prod.id] || 0);
    if (plannedQty <= 0) return;
    const yieldQty = prod.yieldQty ? Number(prod.yieldQty) : 1;
    const factor = yieldQty > 0 ? plannedQty / yieldQty : plannedQty;
    const comps = compsByProduct[prod.id] || [];
    let prodCost = 0;
    const addNeed = (ingId, qty) => {
      const k = String(ingId);
      demand.set(k, (demand.get(k) || 0) + qty);
      const it = ingMap.get(k);
      if (it && it.costPerBaseUnit != null) prodCost += qty * Number(it.costPerBaseUnit);
    };
    comps.forEach(c => {
      if (c.kind === "prep" && c.prepId) {
        const prep = (preps || []).find(p => String(p.id) === String(c.prepId));
        const pYield = prep?.yieldQty ? Number(prep.yieldQty) : 1;
        const prepFactor = (pYield > 0 ? (Number(c.qty) || 0) / pYield : (Number(c.qty) || 0)) * factor;
        (prepCompsByPrep[c.prepId] || []).forEach(pc => addNeed(pc.ingredientId, (Number(pc.qty) || 0) * prepFactor));
      } else {
        addNeed(c.ingredientId, (Number(c.qty) || 0) * factor);
      }
    });
    totalCost += prodCost;
    perProduct.push({ productId: prod.id, name: prod.name, plannedQty, outputUnit: prod.outputUnit, cost: +prodCost.toFixed(2), costPerUnit: plannedQty>0 ? +(prodCost/plannedQty).toFixed(3) : null });
  });

  const requirements = [...demand.entries()].map(([ingId, need]) => {
    const it = ingMap.get(ingId);
    const stock = Number(stockByIngredient?.[ingId] || 0);
    const toBuy = Math.max(0, need - stock);
    return {
      ingredientId: ingId, name: it?.name || ingId, unit: it?.unit || "",
      needed: +need.toFixed(3), inStock: +stock.toFixed(3), toBuy: +toBuy.toFixed(3),
      costPerUnit: it?.costPerBaseUnit != null ? Number(it.costPerBaseUnit) : null,
      buyCost: it?.costPerBaseUnit != null ? +(toBuy * Number(it.costPerBaseUnit)).toFixed(2) : null,
    };
  }).sort((a,b)=> (b.toBuy>0?1:0)-(a.toBuy>0?1:0) || a.name.localeCompare(b.name));

  const buyCost = requirements.reduce((s,r)=> s + (r.buyCost || 0), 0);
  return { totalCost: +totalCost.toFixed(2), buyCost: +buyCost.toFixed(2), perProduct, requirements };
}

// ── Planner: suggestions + planned-vs-actual ─────────────────────────────────

// Suggest weekly per-product totals from history. source: 'production' uses
// production runs in the last 7 days; 'dispatch' uses dispatch lines. Returns
// map productId -> suggested weekly qty.
export async function suggestPlanFromHistory(siteId, source = "production") {
  const since = new Date(); since.setDate(since.getDate() - 7);
  const sinceStr = since.toISOString().slice(0,10);
  const m = {};
  if (source === "dispatch") {
    const { data: disp } = await supabase.from("ck_dispatches").select("id").gte("sent_date", sinceStr).neq("status","cancelled");
    const ids = (disp||[]).map(d=>d.id);
    if (ids.length) {
      const { data: lines } = await supabase.from("ck_dispatch_lines").select("product_id, qty_sent").in("dispatch_id", ids);
      (lines||[]).forEach(l => { if (l.product_id) m[l.product_id] = (m[l.product_id]||0) + (Number(l.qty_sent)||0); });
    }
  } else {
    let q = supabase.from("ck_production_runs").select("product_id, produced_qty, run_date").gte("run_date", sinceStr).neq("status","cancelled");
    if (siteId) q = q.eq("site_id", siteId);
    const { data: rns } = await q;
    (rns||[]).forEach(r => { if (r.product_id) m[r.product_id] = (m[r.product_id]||0) + (Number(r.produced_qty)||0); });
  }
  return m;
}

// Planned vs actual for a plan: actual = production runs linked to this plan.
// Returns map productId -> actual produced qty.
export async function fetchPlanActuals(planId) {
  if (!planId) return {};
  const { data, error } = await supabase.from("ck_production_runs").select("product_id, produced_qty").eq("plan_id", planId).neq("status","cancelled");
  if (error) throw error;
  const m = {};
  (data||[]).forEach(r => { if (r.product_id) m[r.product_id] = (m[r.product_id]||0) + (Number(r.produced_qty)||0); });
  return m;
}

// ── Production scheduler: per-day jobs (item + qty + slot + staff) ────────────
const mapScheduleJob = (j) => ({
  id: j.id, planId: j.plan_id, productId: j.product_id, dow: j.dow, slot: j.slot || "morning",
  qty: Number(j.qty) || 0, staffIds: j.staff_ids || [], producedRunId: j.produced_run_id || null, note: j.note || "",
});

export async function fetchScheduleJobs(planId) {
  if (!planId) return [];
  const { data, error } = await supabase.from("ck_schedule_jobs").select("*").eq("plan_id", planId).order("dow").order("slot");
  if (error) throw error;
  return (data || []).map(mapScheduleJob);
}

// Replace all jobs for a plan. jobs = [{ productId, dow, slot, qty, staffIds, note, producedRunId? }].
export async function saveScheduleJobs(planId, jobs) {
  await supabase.from("ck_schedule_jobs").delete().eq("plan_id", planId);
  const rows = (jobs || []).filter(j => j.productId && Number(j.qty) > 0).map(j => ({
    id: j.id && String(j.id).startsWith("job-") ? j.id : `job-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    plan_id: planId, product_id: String(j.productId), dow: j.dow, slot: j.slot || "morning",
    qty: Number(j.qty), staff_ids: j.staffIds || [], produced_run_id: j.producedRunId || null, note: j.note || null,
  }));
  if (rows.length) { const { error } = await supabase.from("ck_schedule_jobs").insert(rows); if (error) throw error; }
  return rows.length;
}

// ── Allergen label scanning (food-safety): read a label, compare to stored ───
// The 14 UK allergens + keyword aliases used to detect them in OCR'd label text.
const ALLERGEN_KEYWORDS = {
  gluten: ["gluten","wheat","barley","rye","oats","spelt","kamut","malt","flour"],
  milk: ["milk","dairy","lactose","butter","cheese","cream","whey","casein","yoghurt","yogurt"],
  egg: ["egg","eggs","albumen","ovalbumin"],
  soya: ["soya","soy","soybean","soja","edamame","tofu"],
  nuts: ["nut","nuts","almond","hazelnut","walnut","cashew","pecan","pistachio","macadamia","brazil nut"],
  peanuts: ["peanut","peanuts","groundnut","arachis"],
  sesame: ["sesame","tahini","sesamum"],
  fish: ["fish","cod","salmon","tuna","anchovy","haddock","mackerel"],
  crustaceans: ["crustacean","prawn","shrimp","crab","lobster","crayfish","langoustine"],
  molluscs: ["mollusc","mollusk","mussel","oyster","clam","squid","octopus","snail","scallop","cuttlefish"],
  celery: ["celery","celeriac"],
  mustard: ["mustard"],
  lupin: ["lupin","lupine"],
  sulphites: ["sulphite","sulfite","sulphur dioxide","sulfur dioxide","so2","e220","e221","e222","e223","e224","e226","e227","e228"],
};

// Detect allergens in OCR'd label text. Returns { contains:[], mayContain:[] }.
// "May contain"/"traces" lines are classified separately from declared allergens.
export function detectAllergensInText(text) {
  const lc = (text || "").toLowerCase();
  if (!lc.trim()) return { contains: [], mayContain: [], empty: true };
  // Split into "may contain / traces" region vs the rest.
  const mayIdx = lc.search(/may contain|may also contain|not suitable for|traces of|made in a factory|made on equipment/);
  const declaredText = mayIdx >= 0 ? lc.slice(0, mayIdx) : lc;
  const mayText = mayIdx >= 0 ? lc.slice(mayIdx) : "";
  const find = (hay) => {
    const found = new Set();
    Object.entries(ALLERGEN_KEYWORDS).forEach(([allergen, words]) => {
      if (words.some(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`).test(hay))) found.add(allergen);
    });
    return [...found];
  };
  const contains = find(declaredText);
  const mayRaw = find(mayText);
  // Anything in "may contain" that's already a declared allergen stays declared.
  const mayContain = mayRaw.filter(a => !contains.includes(a));
  return { contains: contains.sort(), mayContain: mayContain.sort(), empty: false };
}

// Compare detected allergens against what's stored. Returns added/removed.
export function diffAllergens(stored = [], detected = []) {
  const s = new Set(stored), d = new Set(detected);
  return {
    added: [...d].filter(a => !s.has(a)).sort(),     // on label, not in our records
    removed: [...s].filter(a => !d.has(a)).sort(),   // in our records, not on label
    unchanged: [...d].filter(a => s.has(a)).sort(),
  };
}

// OCR a label image/PDF to raw text. Tries the dedicated LABEL_OCR Edge Function
// first (best for labels); if it isn't deployed, falls back to reusing the
// invoice extractor and concatenating its line text. Returns { text, source }.
export async function scanLabelText(file, { uploadInvoiceFile, extractInvoice, getInvoiceWithLines, entity = "central_kitchen", userId } = {}) {
  // 1) Try dedicated label OCR (Option B), if deployed.
  try {
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
    const headers = {};
    if (process.env.REACT_APP_SYNC_SECRET) headers["x-sync-secret"] = process.env.REACT_APP_SYNC_SECRET;
    const { data, error } = await supabase.functions.invoke("LABEL_OCR", { body: { image_base64: b64, mime: file.type || "image/jpeg" }, headers });
    if (!error && data?.ok && (data.text || "").trim()) return { text: data.text, source: "label_ocr" };
  } catch (_) { /* not deployed or failed → fall back */ }

  // 2) Fallback (Option A): reuse the invoice extractor pipeline.
  if (uploadInvoiceFile && extractInvoice && getInvoiceWithLines) {
    const inv = await uploadInvoiceFile(file, entity, userId);
    await extractInvoice(inv.id);
    let text = "";
    for (let i = 0; i < 10; i++) {
      const { invoice, lines } = await getInvoiceWithLines(inv.id);
      const parts = (lines || []).map(l => l.raw_description || "").filter(Boolean);
      if (invoice?.extracted_text) parts.unshift(invoice.extracted_text);
      if (parts.length) { text = parts.join("\n"); break; }
      await new Promise(r => setTimeout(r, 1500));
    }
    return { text, source: "invoice_fallback" };
  }
  return { text: "", source: "none" };
}

// ── Access control (Level 1): role × section permission matrix ───────────────
// Returns a nested map: { [role]: { [sectionKey]: allowed } }. Missing entries
// mean "use the section's built-in default" — the app handles the fallback.
export async function fetchAccessPermissions() {
  const { data, error } = await supabase.from("access_permissions").select("role, section_key, allowed");
  if (error) throw error;
  const m = {};
  (data || []).forEach(r => { (m[r.role] = m[r.role] || {})[r.section_key] = !!r.allowed; });
  return m;
}

// Set one (role, section) permission. allowed=true/false.
export async function setAccessPermission(role, sectionKey, allowed) {
  const { error } = await supabase.from("access_permissions")
    .upsert({ role, section_key: sectionKey, allowed: !!allowed, updated_at: new Date().toISOString() }, { onConflict: "role,section_key" });
  if (error) throw error;
  return { role, sectionKey, allowed: !!allowed };
}

// Bulk-set permissions. entries = [{ role, sectionKey, allowed }].
export async function setAccessPermissionsBulk(entries) {
  const rows = (entries || []).map(e => ({ role: e.role, section_key: e.sectionKey, allowed: !!e.allowed, updated_at: new Date().toISOString() }));
  if (!rows.length) return 0;
  const { error } = await supabase.from("access_permissions").upsert(rows, { onConflict: "role,section_key" });
  if (error) throw error;
  return rows.length;
}

// ── Entity access: per-person overrides ──────────────────────────────────────
// Returns { [memberId]: { [entityKey]: allowed } }.
export async function fetchEntityOverrides() {
  const { data, error } = await supabase.from("entity_access_overrides").select("member_id, entity_key, allowed");
  if (error) throw error;
  const m = {};
  (data || []).forEach(r => { (m[r.member_id] = m[r.member_id] || {})[r.entity_key] = !!r.allowed; });
  return m;
}

// Set or clear one person's override for an entity. Pass allowed=null to clear
// (fall back to role default).
export async function setEntityOverride(memberId, entityKey, allowed) {
  if (allowed === null || allowed === undefined) {
    const { error } = await supabase.from("entity_access_overrides").delete().eq("member_id", memberId).eq("entity_key", entityKey);
    if (error) throw error;
    return { memberId, entityKey, cleared: true };
  }
  const { error } = await supabase.from("entity_access_overrides")
    .upsert({ member_id: memberId, entity_key: entityKey, allowed: !!allowed, updated_at: new Date().toISOString() }, { onConflict: "member_id,entity_key" });
  if (error) throw error;
  return { memberId, entityKey, allowed: !!allowed };
}

// ── Custom roles (Level 3 access) ────────────────────────────────────────────
export async function fetchCustomRoles() {
  const { data, error } = await supabase.from("custom_roles").select("*").is("archived_at", null).order("name");
  if (error) throw error;
  return (data || []).map(r => ({ id: r.id, name: r.name, baseRole: r.base_role, description: r.description || "" }));
}

export async function upsertCustomRole(role) {
  const row = {
    name: (role.name || "").trim(),
    base_role: role.baseRole || "staff",
    description: role.description || null,
    updated_at: new Date().toISOString(),
  };
  if (role.id) row.id = role.id;
  const { data, error } = await supabase.from("custom_roles").upsert(row).select().maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, name: data.name, baseRole: data.base_role, description: data.description || "" } : null;
}

export async function archiveCustomRole(id) {
  // Unassign anyone holding it, then soft-archive the role.
  await supabase.from("ops_team").update({ role_id: null }).eq("role_id", id);
  const { error } = await supabase.from("custom_roles").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return id;
}

// Assign (or clear) a person's custom role. roleId=null clears it.
export async function setMemberCustomRole(memberId, roleId) {
  const { error } = await supabase.from("ops_team").update({ role_id: roleId || null }).eq("id", memberId);
  if (error) throw error;
  return { memberId, roleId: roleId || null };
}

// ── CASH ACCOUNTS (double-entry cash ledger, Finance entity) ─────────────────
const mapCashAccount = (a) => ({ id: a.id, name: a.name, kind: a.kind, storeId: a.store_id || null, description: a.description || "", archivedAt: a.archived_at || null });
const mapCashSource = (s) => ({ id: s.id, name: s.name, categoryId: s.category_id || null });
const mapCashExpenseType = (e) => ({ id: e.id, name: e.name, categoryId: e.category_id || null });
const mapCashLedger = (t) => ({
  id: t.id, txnDate: t.txn_date, type: t.type, amount: Number(t.amount) || 0,
  fromAccountId: t.from_account_id || null, toAccountId: t.to_account_id || null,
  sourceId: t.source_id || null, expenseTypeId: t.expense_type_id || null,
  storeId: t.store_id || null, reference: t.reference || "", createdBy: t.created_by || null,
  sourceRef: t.source_ref || null,
  createdAt: t.created_at,
});

export async function fetchCashAccounts() {
  const { data, error } = await supabase.from("cash_accounts").select("*").is("archived_at", null).order("name");
  if (error) throw error;
  return (data || []).map(mapCashAccount);
}
export async function upsertCashAccount(acc) {
  const row = { name: (acc.name||"").trim(), kind: acc.kind, store_id: acc.storeId || null, description: acc.description || null, updated_at: new Date().toISOString() };
  if (acc.id) row.id = acc.id;
  const { data, error } = await supabase.from("cash_accounts").upsert(row).select().maybeSingle();
  if (error) throw error;
  return data ? mapCashAccount(data) : null;
}
// Block archive if the account has any ledger activity (protect traceability).
export async function archiveCashAccount(id) {
  const { data: used, error: e1 } = await supabase.from("cash_ledger").select("id").or(`from_account_id.eq.${id},to_account_id.eq.${id}`).limit(1);
  if (e1) throw e1;
  if ((used || []).length) throw new Error("This account has transactions and can't be deleted (traceability). Archive it instead once you've reconciled.");
  const { error } = await supabase.from("cash_accounts").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return id;
}

export async function fetchCashSources() {
  const { data, error } = await supabase.from("cash_sources").select("*").is("archived_at", null).order("name");
  if (error) throw error;
  return (data || []).map(mapCashSource);
}
export async function upsertCashSource(s) {
  const row = { name: (s.name||"").trim(), category_id: s.categoryId || null };
  if (s.id) row.id = s.id;
  const { data, error } = await supabase.from("cash_sources").upsert(row).select().maybeSingle();
  if (error) throw error;
  return data ? mapCashSource(data) : null;
}
export async function archiveCashSource(id) {
  const { error } = await supabase.from("cash_sources").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return id;
}

export async function fetchCashExpenseTypes() {
  const { data, error } = await supabase.from("cash_expense_types").select("*").is("archived_at", null).order("name");
  if (error) throw error;
  return (data || []).map(mapCashExpenseType);
}
export async function upsertCashExpenseType(e) {
  const row = { name: (e.name||"").trim(), category_id: e.categoryId || null };
  if (e.id) row.id = e.id;
  const { data, error } = await supabase.from("cash_expense_types").upsert(row).select().maybeSingle();
  if (error) throw error;
  return data ? mapCashExpenseType(data) : null;
}
export async function archiveCashExpenseType(id) {
  const { error } = await supabase.from("cash_expense_types").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return id;
}

export async function fetchCashLedger({ from, to } = {}) {
  let q = supabase.from("cash_ledger").select("*").order("txn_date", { ascending: false }).order("created_at", { ascending: false });
  if (from) q = q.gte("txn_date", from);
  if (to) q = q.lte("txn_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapCashLedger);
}

// Record a movement. Validates the type's required accounts so the ledger
// stays consistent (every row reconciles).
export async function addCashLedgerEntry(tx) {
  const t = tx.type;
  const amt = Number(tx.amount);
  if (!t) throw new Error("Movement type required.");
  if (!(amt > 0)) throw new Error("Amount must be greater than zero.");
  if (t === "income" || t === "opening") { if (!tx.toAccountId) throw new Error("Choose the account receiving the money."); }
  if (t === "expense") { if (!tx.fromAccountId) throw new Error("Choose the account the money comes from."); }
  if (t === "transfer") {
    if (!tx.fromAccountId || !tx.toAccountId) throw new Error("Transfers need both a from and a to account.");
    if (tx.fromAccountId === tx.toAccountId) throw new Error("From and to accounts must be different.");
  }
  if (t === "adjustment" && !tx.fromAccountId && !tx.toAccountId) throw new Error("Adjustment needs an account.");
  const row = {
    txn_date: tx.txnDate || new Date().toISOString().slice(0,10),
    type: t, amount: amt,
    from_account_id: tx.fromAccountId || null,
    to_account_id: tx.toAccountId || null,
    source_id: tx.sourceId || null,
    expense_type_id: tx.expenseTypeId || null,
    store_id: tx.storeId || null,
    reference: tx.reference || null,
    created_by: tx.createdBy || null,
    source_ref: tx.sourceRef || null,
  };
  const { data, error } = await supabase.from("cash_ledger").insert(row).select().maybeSingle();
  if (error) throw error;
  return data ? mapCashLedger(data) : null;
}

export async function deleteCashLedgerEntry(id) {
  const { error } = await supabase.from("cash_ledger").delete().eq("id", id);
  if (error) throw error;
  return id;
}

// Compute balances from the ledger: credit to_account, debit from_account.
export function computeCashBalances(accounts = [], ledger = []) {
  const bal = {}; accounts.forEach(a => { bal[a.id] = 0; });
  ledger.forEach(t => {
    if (t.toAccountId   && bal[t.toAccountId]   !== undefined) bal[t.toAccountId]   += t.amount;
    if (t.fromAccountId && bal[t.fromAccountId] !== undefined) bal[t.fromAccountId] -= t.amount;
  });
  return bal;
}

// Idempotently create one revenue cash account per own (non-archived) store.
// Returns the number created. Uses store_id uniqueness to avoid duplicates.
export async function ensureStoreCashAccounts(stores = []) {
  const { data: existing, error } = await supabase.from("cash_accounts").select("store_id").not("store_id", "is", null);
  if (error) throw error;
  const have = new Set((existing || []).map(r => r.store_id));
  const toCreate = (stores || []).filter(s => !s.archivedAt && s.ownershipModel === "owned" && !have.has(s.id));
  if (!toCreate.length) return 0;
  const rows = toCreate.map(s => ({ name: `${s.shortName || s.name} — Cash`, kind: "revenue", store_id: s.id, description: "Store cash sales" }));
  const { error: insErr } = await supabase.from("cash_accounts").insert(rows);
  if (insErr) throw insErr;
  return rows.length;
}

// ── EOD cash → store cash account (idempotent, on approval) ──────────────────
// Posts the physical cash counted in an approved EOD into the store's revenue
// cash account, exactly once. Tagged with source_ref = 'eod:<entryId>' so it
// can never double-post (enforced by a unique index too). Auto-creates the
// store's cash account if missing. Returns { posted, skipped, reason? }.
export async function postEodCashDeposit(eodEntry, stores = [], createdBy = null) {
  if (!eodEntry?.id) return { posted: false, skipped: true, reason: "no entry" };
  const storeId = eodEntry.storeId || null;
  const cash = Number(eodEntry.physicalCash);
  if (!storeId) return { posted: false, skipped: true, reason: "EOD has no store" };
  if (!(cash > 0)) return { posted: false, skipped: true, reason: "no cash to deposit" };

  const ref = `eod:${eodEntry.id}`;
  // Already posted? (idempotent)
  const { data: existing, error: exErr } = await supabase.from("cash_ledger").select("id").eq("source_ref", ref).limit(1);
  if (exErr) throw exErr;
  if ((existing || []).length) return { posted: false, skipped: true, reason: "already posted" };

  // Find the store's cash account; create it if missing.
  let { data: accs, error: aErr } = await supabase.from("cash_accounts").select("id").eq("store_id", storeId).is("archived_at", null).limit(1);
  if (aErr) throw aErr;
  let accountId = (accs || [])[0]?.id;
  if (!accountId) {
    const st = (stores || []).find(s => s.id === storeId);
    const nm = st ? `${st.shortName || st.name} — Cash` : "Store — Cash";
    const { data: created, error: cErr } = await supabase.from("cash_accounts")
      .insert({ name: nm, kind: "revenue", store_id: storeId, description: "Store cash sales" })
      .select("id").maybeSingle();
    if (cErr) {
      // Race / pre-existing: re-query rather than fail.
      const { data: re } = await supabase.from("cash_accounts").select("id").eq("store_id", storeId).limit(1);
      accountId = (re || [])[0]?.id;
      if (!accountId) throw cErr;
    } else { accountId = created.id; }
  }

  // Post the deposit (income). Tagged + dated to the EOD's business date.
  const row = {
    txn_date: eodEntry.date || new Date().toISOString().slice(0,10),
    type: "income", amount: cash,
    to_account_id: accountId, store_id: storeId,
    reference: `EOD cash ${eodEntry.date || ""}`.trim(),
    created_by: createdBy || null,
    source_ref: ref,
  };
  const { error: insErr } = await supabase.from("cash_ledger").insert(row);
  if (insErr) {
    // Unique index caught a concurrent post — treat as already posted.
    if (String(insErr.message || "").toLowerCase().includes("duplicate") || insErr.code === "23505") return { posted: false, skipped: true, reason: "already posted" };
    throw insErr;
  }
  return { posted: true, skipped: false, accountId };
}

// ── EXPENSE CLAIMS (submit → approve → reconcile vs cash or bank) ─────────────
const mapExpenseClaim = (e) => ({
  id: e.id, description: e.description, amount: Number(e.amount)||0, expenseDate: e.expense_date,
  expenseTypeId: e.expense_type_id || null, categoryId: e.category_id || null, storeId: e.store_id || null,
  vendor: e.vendor || "", reference: e.reference || "",
  status: e.status || "submitted", submittedBy: e.submitted_by || "", submittedById: e.submitted_by_id || null,
  approvedBy: e.approved_by || null, approvedAt: e.approved_at || null, rejectedReason: e.rejected_reason || null,
  reconcileType: e.reconcile_type || null, cashAccountId: e.cash_account_id || null, cashLedgerId: e.cash_ledger_id || null,
  bankTxnId: e.bank_txn_id || null, reconciledBy: e.reconciled_by || null, reconciledAt: e.reconciled_at || null,
  createdAt: e.created_at, updatedAt: e.updated_at,
});

export async function fetchExpenseClaims({ status } = {}) {
  let q = supabase.from("expense_claims").select("*").order("expense_date", { ascending: false }).order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapExpenseClaim);
}

export async function submitExpenseClaim(claim) {
  const amt = Number(claim.amount);
  if (!(amt > 0)) throw new Error("Amount must be greater than zero.");
  if (!(claim.description || "").trim()) throw new Error("Describe the expense.");
  const row = {
    description: claim.description.trim(), amount: amt,
    expense_date: claim.expenseDate || new Date().toISOString().slice(0,10),
    expense_type_id: claim.expenseTypeId || null, category_id: claim.categoryId || null,
    store_id: claim.storeId || null, vendor: claim.vendor || null, reference: claim.reference || null,
    status: "submitted", submitted_by: claim.submittedBy || null, submitted_by_id: claim.submittedById || null,
    updated_at: new Date().toISOString(),
  };
  if (claim.id) row.id = claim.id;
  const { data, error } = await supabase.from("expense_claims").upsert(row).select().maybeSingle();
  if (error) throw error;
  return data ? mapExpenseClaim(data) : null;
}

export async function approveExpenseClaim(id, approvedBy) {
  const { data, error } = await supabase.from("expense_claims")
    .update({ status: "approved", approved_by: approvedBy || null, approved_at: new Date().toISOString(), rejected_reason: null, updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "submitted").select().maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Only a submitted expense can be approved.");
  return mapExpenseClaim(data);
}

export async function rejectExpenseClaim(id, reason, by) {
  const { data, error } = await supabase.from("expense_claims")
    .update({ status: "rejected", rejected_reason: reason || null, approved_by: by || null, updated_at: new Date().toISOString() })
    .eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data ? mapExpenseClaim(data) : null;
}

// Reconcile against CASH: post a cash_ledger debit from the chosen account and
// link it back to the claim. Idempotent via source_ref = 'exp:<id>'.
export async function reconcileExpenseCash(claim, cashAccountId, reconciledBy) {
  if (!claim?.id) throw new Error("Missing expense.");
  if (claim.status !== "approved") throw new Error("Approve the expense before reconciling.");
  if (!cashAccountId) throw new Error("Choose the cash account it was paid from.");
  const ref = `exp:${claim.id}`;
  // Reuse an existing ledger row if this expense was already posted.
  let ledgerId;
  const { data: existing } = await supabase.from("cash_ledger").select("id").eq("source_ref", ref).limit(1);
  if ((existing || []).length) { ledgerId = existing[0].id; }
  else {
    const { data: led, error: lErr } = await supabase.from("cash_ledger").insert({
      txn_date: claim.expenseDate || new Date().toISOString().slice(0,10),
      type: "expense", amount: Number(claim.amount),
      from_account_id: cashAccountId, expense_type_id: claim.expenseTypeId || null,
      store_id: claim.storeId || null, reference: `Expense: ${claim.description}`,
      created_by: reconciledBy || null, source_ref: ref,
    }).select("id").maybeSingle();
    if (lErr) throw lErr;
    ledgerId = led.id;
  }
  const { data, error } = await supabase.from("expense_claims")
    .update({ status: "reconciled", reconcile_type: "cash", cash_account_id: cashAccountId, cash_ledger_id: ledgerId, bank_txn_id: null, reconciled_by: reconciledBy || null, reconciled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", claim.id).select().maybeSingle();
  if (error) throw error;
  return mapExpenseClaim(data);
}

// Reconcile against BANK: link to an existing imported bank transaction.
export async function reconcileExpenseBank(claim, bankTxnId, reconciledBy) {
  if (!claim?.id) throw new Error("Missing expense.");
  if (claim.status !== "approved") throw new Error("Approve the expense before reconciling.");
  if (!bankTxnId) throw new Error("Choose the bank transaction.");
  const { data, error } = await supabase.from("expense_claims")
    .update({ status: "reconciled", reconcile_type: "bank", bank_txn_id: bankTxnId, cash_account_id: null, cash_ledger_id: null, reconciled_by: reconciledBy || null, reconciled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", claim.id).select().maybeSingle();
  if (error) {
    if (String(error.message||"").toLowerCase().includes("duplicate") || error.code === "23505") throw new Error("That bank transaction is already linked to another expense.");
    throw error;
  }
  return mapExpenseClaim(data);
}

// Undo reconciliation. Removes the cash_ledger debit if it created one.
export async function unreconcileExpenseClaim(claim, by) {
  if (!claim?.id) throw new Error("Missing expense.");
  if (claim.reconcileType === "cash" && claim.cashLedgerId) {
    await supabase.from("cash_ledger").delete().eq("id", claim.cashLedgerId);
  }
  const { data, error } = await supabase.from("expense_claims")
    .update({ status: "approved", reconcile_type: null, cash_account_id: null, cash_ledger_id: null, bank_txn_id: null, reconciled_by: null, reconciled_at: null, updated_at: new Date().toISOString() })
    .eq("id", claim.id).select().maybeSingle();
  if (error) throw error;
  return mapExpenseClaim(data);
}

export async function deleteExpenseClaim(claim) {
  if (claim?.reconcileType === "cash" && claim?.cashLedgerId) {
    await supabase.from("cash_ledger").delete().eq("id", claim.cashLedgerId);
  }
  const { error } = await supabase.from("expense_claims").delete().eq("id", claim.id);
  if (error) throw error;
  return claim.id;
}

// ── EXPENSE ACCOUNT ASSIGNMENTS (type ∩ employee → reconcile options) ─────────
// Each assignment is { accountKind:'cash'|'bank', accountId }.
export async function fetchExpenseTypeAccounts() {
  const { data, error } = await supabase.from("expense_type_accounts").select("*");
  if (error) throw error;
  const m = {}; // { expenseTypeId: [{accountKind, accountId}] }
  (data || []).forEach(r => { (m[r.expense_type_id] = m[r.expense_type_id] || []).push({ accountKind: r.account_kind, accountId: r.account_id }); });
  return m;
}
export async function setExpenseTypeAccounts(expenseTypeId, accounts = []) {
  await supabase.from("expense_type_accounts").delete().eq("expense_type_id", expenseTypeId);
  const rows = (accounts || []).map(a => ({ expense_type_id: expenseTypeId, account_kind: a.accountKind, account_id: a.accountId }));
  if (rows.length) { const { error } = await supabase.from("expense_type_accounts").insert(rows); if (error) throw error; }
  return true;
}

export async function fetchMemberExpenseAccounts() {
  const { data, error } = await supabase.from("member_expense_accounts").select("*");
  if (error) throw error;
  const m = {}; // { memberId: [{accountKind, accountId}] }
  (data || []).forEach(r => { (m[r.member_id] = m[r.member_id] || []).push({ accountKind: r.account_kind, accountId: r.account_id }); });
  return m;
}
export async function setMemberExpenseAccounts(memberId, accounts = []) {
  await supabase.from("member_expense_accounts").delete().eq("member_id", memberId);
  const rows = (accounts || []).map(a => ({ member_id: memberId, account_kind: a.accountKind, account_id: a.accountId }));
  if (rows.length) { const { error } = await supabase.from("member_expense_accounts").insert(rows); if (error) throw error; }
  return true;
}

export async function fetchExpenseExcludedStores() {
  const { data, error } = await supabase.from("expense_excluded_stores").select("store_id");
  if (error) throw error;
  return (data || []).map(r => r.store_id);
}
export async function setExpenseStoreExcluded(storeId, excluded) {
  if (excluded) {
    const { error } = await supabase.from("expense_excluded_stores").upsert({ store_id: storeId }, { onConflict: "store_id" });
    if (error) throw error;
  } else {
    const { error } = await supabase.from("expense_excluded_stores").delete().eq("store_id", storeId);
    if (error) throw error;
  }
  return true;
}

// ── EMPLOYEE EXPENSE GRANTS (types / categories / stores) ────────────────────
export async function fetchMemberExpenseTypes() {
  const { data, error } = await supabase.from("member_expense_types").select("member_id, expense_type_id");
  if (error) throw error;
  const m = {}; (data || []).forEach(r => { (m[r.member_id] = m[r.member_id] || []).push(r.expense_type_id); });
  return m;
}
export async function setMemberExpenseTypes(memberId, typeIds = []) {
  await supabase.from("member_expense_types").delete().eq("member_id", memberId);
  const rows = (typeIds || []).map(id => ({ member_id: memberId, expense_type_id: id }));
  if (rows.length) { const { error } = await supabase.from("member_expense_types").insert(rows); if (error) throw error; }
  return true;
}

export async function fetchMemberExpenseCategories() {
  const { data, error } = await supabase.from("member_expense_categories").select("member_id, category_id");
  if (error) throw error;
  const m = {}; (data || []).forEach(r => { (m[r.member_id] = m[r.member_id] || []).push(r.category_id); });
  return m;
}
export async function setMemberExpenseCategories(memberId, categoryIds = []) {
  await supabase.from("member_expense_categories").delete().eq("member_id", memberId);
  const rows = (categoryIds || []).map(id => ({ member_id: memberId, category_id: id }));
  if (rows.length) { const { error } = await supabase.from("member_expense_categories").insert(rows); if (error) throw error; }
  return true;
}

export async function fetchMemberExpenseStores() {
  const { data, error } = await supabase.from("member_expense_stores").select("member_id, store_id");
  if (error) throw error;
  const m = {}; (data || []).forEach(r => { (m[r.member_id] = m[r.member_id] || []).push(r.store_id); });
  return m;
}
export async function setMemberExpenseStores(memberId, storeIds = []) {
  await supabase.from("member_expense_stores").delete().eq("member_id", memberId);
  const rows = (storeIds || []).map(id => ({ member_id: memberId, store_id: id }));
  if (rows.length) { const { error } = await supabase.from("member_expense_stores").insert(rows); if (error) throw error; }
  return true;
}
