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
    assignType: cl.assign_type || "", assignValue: cl.assign_value || "",
    color: cl.color, sortOrder: cl.sort_order,
    storeId: cl.store_id || null,
    brandId: cl.brand_id || null,
    items: items.filter(i => i.checklist_id === cl.id).map(i => ({ id: i.id, text: i.text, guide: i.guide, sortOrder: i.sort_order })),
  }));
}
export async function upsertChecklist(cl) {
  const { data, error } = await supabase.from("checklists").upsert({
    id: cl.id, name: cl.name, shift: cl.shift, default_role: cl.defaultRole || "",
    assign_type: cl.assignType || null, assign_value: cl.assignValue || null,
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
    assignType: data.assign_type || "", assignValue: data.assign_value || "",
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
    // Per-assignment rows (repeated tasks) are keyed by assignmentId||date so
    // each assignment is tracked independently. Legacy/per-task rows keep the
    // store(or brand)||checklistId||date key.
    if (row.assignment_id) {
      result[`asg::${row.assignment_id}||${row.date}`] = row.item_states || {};
    } else {
      const scope = row.store_id || row.brand_id;
      result[`${scope}||${row.checklist_id}||${row.date}`] = row.item_states || {};
    }
  });
  return result;
}
// Per-store checklist sign-off state. After Stage 6, the unique constraint
// is (store_id, checklist_id, date) — each store signs off its own copy of
// the checklist, even though the checklist template itself is chain-wide.
// This matches real operations: Evington Road completing morning open says
// nothing about whether Gipsy Lane has done theirs.
export async function upsertChecklistState(storeId, brandId, checklistId, date, itemStates, signedOffBy, signedOffAt, assignmentId) {
  if (!storeId) throw new Error("upsertChecklistState requires storeId");
  const row = {
    store_id: storeId, brand_id: brandId, checklist_id: checklistId, date,
    item_states: itemStates, signed_off_by: signedOffBy || "",
    signed_off_at: signedOffAt || null, updated_at: new Date().toISOString(),
  };
  // When an assignment id is supplied, completions are tracked PER ASSIGNMENT
  // (so repeated tasks like 5× toilet checks are independent). Conflict target
  // matches the per-assignment unique index. Without one, fall back to the
  // legacy per-task key.
  if (assignmentId) {
    row.assignment_id = assignmentId;
    const { error } = await supabase.from("checklist_states").upsert(row, { onConflict: "assignment_id,date" });
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("checklist_states").upsert(row, { onConflict: "store_id,checklist_id,date" });
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
  return { id: e.id, brand_id: e.brandId, brand_name: e.brandName, date: e.date, manager: e.manager, submitted_by: e.submittedBy, net_sales: e.netSales, card_revenue: e.cardRevenue, cash_expected: e.cashExpected, physical_cash: e.physicalCash, cash_variance: e.cashVariance, variance_justification: e.varianceJustification, opening_float: e.openingFloat, closing_float: e.closingFloat, labor_cost: e.laborCost, cogs_cost: e.cogsCost, total_hours: e.totalHours, total_orders: e.totalOrders, atv: e.atv, five_star_reviews: e.fiveStarReviews, mid_star_reviews: e.midStarReviews, one_star_reviews: e.oneStarReviews, notes: e.notes, maintenance_tickets: e.maintenanceTickets, timestamp: e.timestamp, store_id: e.storeId || null, amendments: e.amendments || [], reconciliation: e.reconciliation || [], recon_status: e.reconStatus || "open", lopay: e.lopay ?? 0, unreported_expense: e.unreportedExpense ?? 0, unreported_expense_note: e.unreportedExpenseNote ?? null };
}
function dbEntryToApp(e) {
  return { id: e.id, brandId: e.brand_id, brandName: e.brand_name, date: e.date, manager: e.manager, submittedBy: e.submitted_by, netSales: e.net_sales, cardRevenue: e.card_revenue, cashExpected: e.cash_expected, physicalCash: e.physical_cash, cashVariance: e.cash_variance, varianceJustification: e.variance_justification, openingFloat: e.opening_float, closingFloat: e.closing_float, laborCost: e.labor_cost, cogsCost: e.cogs_cost, totalHours: e.total_hours, totalOrders: e.total_orders, atv: e.atv, fiveStarReviews: e.five_star_reviews, midStarReviews: e.mid_star_reviews, oneStarReviews: e.one_star_reviews, notes: e.notes, maintenanceTickets: e.maintenance_tickets ?? [], timestamp: e.timestamp, storeId: e.store_id || null, amendments: e.amendments ?? [], reconciliation: e.reconciliation ?? [], reconStatus: e.recon_status || "open", lopay: e.lopay ?? 0, unreportedExpense: e.unreported_expense ?? 0, unreportedExpenseNote: e.unreported_expense_note ?? "" };
}

function appIssueToDb(i) { return { id: i.id, brand_id: i.brandId, brand_name: i.brandName, store_id: i.storeId || null, type: i.type || "Issue", title: i.title, description: i.description, category: i.category, priority: i.priority, status: i.status, reported_by: i.reportedBy, assigned_to: i.assignedTo, comments: i.comments, created_at: i.createdAt, updated_at: i.updatedAt }; }
function dbIssueToApp(i) { return { id: i.id, brandId: i.brand_id, brandName: i.brand_name, storeId: i.store_id || null, type: i.type || "Issue", title: i.title, description: i.description, category: i.category, priority: i.priority, status: i.status, reportedBy: i.reported_by, assignedTo: i.assigned_to, comments: i.comments ?? [], createdAt: i.created_at, updatedAt: i.updated_at }; }

function appTicketToDb(t) { return { id: t.id, brand_id: t.brandId, text: t.text, priority: t.priority, done: t.done ?? false }; }
function dbTicketToApp(t) { return { id: t.id, brandId: t.brand_id, text: t.text, priority: t.priority, done: t.done, createdAt: t.created_at }; }

function appTempUnitToDb(u) { return { id: u.id, brand_id: u.brandId, store_id: u.storeId || null, name: u.name, type: u.type, min_temp: u.min ?? null, max_temp: u.max ?? null, assign_role: u.assignRole || "", assign_type: u.assignType || null, assign_value: u.assignValue || null, updated_at: new Date().toISOString() }; }
function dbTempUnitToApp(u) { return { id: u.id, brandId: u.brand_id, storeId: u.store_id || null, name: u.name, type: u.type, min: u.min_temp, max: u.max_temp, assignRole: u.assign_role, assignType: u.assign_type || "", assignValue: u.assign_value || "" }; }

function appCleanTaskToDb(t) {
  return {
    id: t.id, name: t.name, area: t.area, freq: t.freq,
    assign_role: t.assignRole || "", notes: t.notes || "",
    assign_type: t.assignType || null, assign_value: t.assignValue || null,
    items: t.items || [],
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
    assignType: t.assign_type || "", assignValue: t.assign_value || "",
    items: Array.isArray(t.items) ? t.items : [],
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
  if (m.brandId       !== undefined) row.brand_id      = m.brandId || null;
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
  // Access/custom role lives in its own column so it never collides with job
  // roles (role_id/role_ids).
  if (m.accessRoleId  !== undefined) row.access_role_id = m.accessRoleId || null;
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
    accessRoleId: m.access_role_id || null,
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
    accessRoleId: m.access_role_id || null,
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

function appTempLogToDb(l) { return { id: l.id, brand_id: l.brandId, store_id: l.storeId || null, unit_id: l.unitId, date: l.date, time: l.time, value: l.value, is_breach: l.isBreach || false, notes: l.notes || "", logged_by: l.loggedBy || "" }; }
function dbTempLogToApp(l) { return { id: l.id, brandId: l.brand_id, storeId: l.store_id || null, unitId: l.unit_id, date: l.date, time: l.time, value: Number(l.value), isBreach: l.is_breach, notes: l.notes, loggedBy: l.logged_by }; }

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
  const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  // Retention: the chat shows a rolling 48-hour window; older rows are purged.
  // Fire-and-forget delete here is best-effort — the pg_cron job in
  // add_chat_v2.sql guarantees the wipe even if nobody opens the app.
  supabase.from("inbox_messages").delete().lt("created_at", cutoff).then(() => {}, () => {});
  const { data, error } = await supabase
    .from("inbox_messages")
    .select("*")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data.map(dbMsgToApp);
}

// Clear a whole conversation: deletes every message in the thread, for everyone.
export async function deleteChatThread({ scope, id, myId, otherId }) {
  let q = supabase.from("inbox_messages").delete();
  if (scope === "store") q = q.eq("to_scope", "store").eq("to_store_id", id);
  else if (scope === "group") q = q.eq("to_scope", "group").eq("to_group_id", id);
  else if (scope === "location") q = q.eq("to_scope", "location").eq("to_brand_id", id);
  else if (scope === "broadcast") q = q.eq("to_scope", "all_locations");
  else if (scope === "dm") q = q.eq("to_scope", "individual").or(`and(from_id.eq.${myId},to_person_id.eq.${otherId}),and(from_id.eq.${otherId},to_person_id.eq.${myId})`);
  else return;
  const { error } = await q;
  if (error) throw error;
}

// ── CHAT GROUPS (WhatsApp-style, manager-created) ──
export async function fetchChatGroups() {
  const { data } = await supabase.from("chat_groups").select("*").order("created_at");
  return (data || []).map(g => ({ id: g.id, name: g.name, memberIds: g.member_ids || [], createdBy: g.created_by, createdByName: g.created_by_name, storeId: g.store_id || null }));
}
export async function createChatGroup({ name, memberIds, createdBy, createdByName, storeId }) {
  const id = `cg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const { error } = await supabase.from("chat_groups").insert({ id, name, member_ids: memberIds || [], created_by: createdBy || null, created_by_name: createdByName || null, store_id: storeId || null });
  if (error) throw error;
  return id;
}
export async function updateChatGroup(id, { name, memberIds }) {
  const row = {};
  if (name !== undefined) row.name = name;
  if (memberIds !== undefined) row.member_ids = memberIds;
  const { error } = await supabase.from("chat_groups").update(row).eq("id", id);
  if (error) throw error;
}
export async function deleteChatGroup(id) {
  const { error } = await supabase.from("chat_groups").delete().eq("id", id);
  if (error) throw error;
}

export async function insertInboxMessage(msg) {
  const { data, error } = await supabase
    .from("inbox_messages")
    .insert(appMsgToDb(msg))
    .select().single();
  if (error) throw error;
  return dbMsgToApp(data);
}

// Patch a message's editable fields — used for reactions, edit, and soft-delete.
// Accepts camelCase keys; maps to snake_case columns. Returns the updated row.
// NOTE: requires columns reactions (jsonb), edited_at (timestamptz),
// deleted (boolean) on inbox_messages — see the migration shipped alongside.
export async function updateInboxMessageFields(id, patch) {
  if (!id || !patch) return null;
  const row = {};
  if (patch.body        !== undefined) row.body       = patch.body;
  if (patch.reactions   !== undefined) row.reactions  = patch.reactions;
  if (patch.editedAt    !== undefined) row.edited_at  = patch.editedAt;
  if (patch.deleted     !== undefined) row.deleted    = patch.deleted;
  const { data, error } = await supabase
    .from("inbox_messages").update(row).eq("id", id).select().single();
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
    to_store_id: m.toStoreId || null, to_group_id: m.toGroupId || null,
    to_person_id: m.toPersonId || null, to_person_name: m.toPersonName || null,
    subject: m.subject || "", body: m.body || "", read_by: m.readBy || [],
    attachments: m.attachments || null,
  };
}
function dbMsgToApp(m) {
  return {
    id: m.id, brandId: m.brand_id,
    fromId: m.from_id, fromName: m.from_name, fromRole: m.from_role,
    toScope: m.to_scope, toBrandId: m.to_brand_id,
    toStoreId: m.to_store_id || null, toGroupId: m.to_group_id || null,
    toPersonId: m.to_person_id, toPersonName: m.to_person_name,
    subject: m.subject, body: m.body, readBy: m.read_by || [],
    attachments: m.attachments || null,
    reactions: m.reactions || null,
    editedAt: m.edited_at || null,
    deleted: m.deleted || false,
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

// ── BUSY PERIODS (festivals / holidays the schedule flags as busy) ──
function appBusyPeriodToDb(p) {
  return {
    id: p.id, name: p.name, faith: p.faith || null,
    start_date: p.startDate, end_date: p.endDate,
    intensity: p.intensity || "busy", staffing_note: p.staffingNote || null,
    brand_id: p.brandId || null, store_id: p.storeId || null,
    created_by: p.createdBy || null, updated_at: new Date().toISOString(),
  };
}
function dbBusyPeriodToApp(p) {
  return {
    id: p.id, name: p.name, faith: p.faith || null,
    startDate: p.start_date, endDate: p.end_date,
    intensity: p.intensity || "busy", staffingNote: p.staffing_note || "",
    brandId: p.brand_id || null, storeId: p.store_id || null,
    createdBy: p.created_by || null, createdAt: p.created_at,
  };
}
export async function fetchBusyPeriods() {
  const { data, error } = await supabase.from("busy_periods").select("*").order("start_date", { ascending: true });
  if (error) throw error;
  return (data || []).map(dbBusyPeriodToApp);
}
export async function upsertBusyPeriod(p) {
  const { data, error } = await supabase.from("busy_periods").upsert(appBusyPeriodToDb(p), { onConflict: "id" }).select().single();
  if (error) throw error;
  return dbBusyPeriodToApp(data);
}
export async function removeBusyPeriod(id) {
  const { error } = await supabase.from("busy_periods").delete().eq("id", id);
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
  //
  // IMPORTANT: this guard applies ONLY when the NEW record is itself an OPEN
  // clock-in (no punch_out). A completed record — e.g. a manager's manual hours
  // entry, which always carries both punch_in and punch_out — is a historical
  // row, not a live shift, so it must NOT be blocked by an unrelated open punch.
  const empId = record.employeeId;
  const isOpenClockIn = !record.punchOut && !record.punch_out;
  if (empId && isOpenClockIn) {
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

// Auto-clockout sweep: close stale OPEN shifts that are still open past their
// store's configured auto-clockout time. Sets punch_out to that day's cutoff
// and flags status='auto_closed' for manager review. Deliberately leaves
// gross_pay NULL — hours are recorded but pay is NOT auto-calculated, so a
// manager confirms before it's paid. Returns the number of shifts closed.
// stores: app-side stores with { id, autoClockoutTime } ("HH:MM").
// ── Canonical punch-hours calculation (SINGLE SOURCE OF TRUTH) ───────────────
// Every path that turns a clock-in/out into paid hours MUST use this, so the
// failure modes are handled identically everywhere:
//   • overnight  — if out <= in, the out is the next day (never negative)
//   • breaks     — deduct break_minutes
//   • open break — if a break was started and not ended, count elapsed break time
//   • clamp      — never return below 0
// Pass ISO strings (or Date) for punchIn/punchOut. Returns
// { hours, rawHours, breakMins, overnight } with hours rounded to 2dp.
// Minimum unpaid break (minutes) required by raw shift length:
//   4h or less → 0 (paid in full, too short to enforce a break)
//   over 4h, under 6h → 15 · 6–10h → 30 · over 10h → 45
export function requiredBreakMins(rawHours) {
  if (!(rawHours > 0)) return 0;
  if (rawHours <= 4) return 0;     // shifts of 4h or less: no enforced break
  if (rawHours < 6) return 15;
  if (rawHours <= 10) return 30;
  return 45;
}

// Canonical punch-hours calc with the unpaid-break rule applied.
// breakMinutes = TOTAL punched break across any number of breaks. The deducted
// break is max(total punched, minimum-for-tier) — so longer real breaks count in
// full, and short/no breaks are bumped up to the legal minimum. All unpaid.
// Returns a clear split: { workedHours (raw clocked), breakMins (deducted),
// breakHours, payableHours, hours (=payableHours, kept for back-compat),
// punchedBreakMins, requiredBreakMins, breakEnforced, rawHours, overnight }.
export function computePunchHours({ punchIn, punchOut, breakMinutes = 0, breakStart = null, breakEnd = null, breakEndRef = null, applyBreakRule = true, breakPaid = false } = {}) {
  const EMPTY = { hours: null, payableHours: null, workedHours: null, breakHours: null, breakMins: 0, punchedBreakMins: 0, requiredBreakMins: 0, breakEnforced: false, rawHours: null, overnight: false, breakPaid: false };
  if (!punchIn || !punchOut) return EMPTY;
  // Truncate both punches to the MINUTE before diffing. The UI shows HH:MM, so
  // in 19:00:48 -> out 23:00:15 reads as "19:00-23:00" but full-precision maths
  // gives 3h59m27s -> 3.99h -> "3h 59m": staff who punched on time lose a
  // minute. Computing on the clock-face minutes makes maths match display.
  const floorMin = (ms) => Math.floor(ms / 60000) * 60000;
  const inMs = floorMin(new Date(punchIn).getTime());
  let outMs = floorMin(new Date(punchOut).getTime());
  if (isNaN(inMs) || isNaN(outMs)) return EMPTY;
  let overnight = false;
  // Overnight ONLY when the clock-out is strictly BEFORE the clock-in (e.g. in
  // 23:00, out 01:00). If they're exactly EQUAL, this is a zero-length shift (or
  // a punch_out mistakenly set equal to punch_in) — NOT a 24h overnight shift.
  // Treating equal as +24h was producing phantom "24h worked" records.
  if (outMs < inMs) { outMs += 86400000; overnight = true; }
  const rawHours = (outMs - inMs) / 3600000;

  // Total punched break (including a break still open at the reference moment).
  let punchedBreakMins = Number(breakMinutes) || 0;
  if (breakStart && !breakEnd) {
    const ref = breakEndRef ? new Date(breakEndRef).getTime() : outMs;
    const openMins = Math.max(0, Math.round((ref - new Date(breakStart).getTime()) / 60000));
    // Cap an OPEN break so a forgotten "end break" tap can't count hours of work
    // as break. Same rule as the clock-out fold: never let the total exceed the
    // required statutory break for the shift (or what was already punched).
    const reqForShift = applyBreakRule ? requiredBreakMins(rawHours) : 0;
    const cap = Math.max(reqForShift, punchedBreakMins);
    punchedBreakMins = Math.min(punchedBreakMins + openMins, cap);
  }

  // Apply the unpaid-break rule: deduct the greater of punched vs the minimum.
  const reqMins = applyBreakRule ? requiredBreakMins(rawHours) : 0;
  let breakMins = Math.max(punchedBreakMins, reqMins);
  const breakEnforced = breakMins > punchedBreakMins;   // true when we bumped up to the minimum

  // PAID BREAK OVERRIDE: a manager can mark the break as paid when it couldn't
  // be allocated to the employee. The break is still recorded (punchedBreakMins
  // is preserved for reporting), but it is NOT deducted from paid hours — the
  // worker is paid the full raw shift.
  const deductMins = breakPaid ? 0 : breakMins;

  const breakHours = Math.round((breakMins / 60) * 100) / 100;
  const payableHours = Math.round(Math.max(0, rawHours - deductMins / 60) * 100) / 100;
  return {
    hours: payableHours,            // back-compat: existing callers read .hours
    payableHours,
    workedHours: Math.round(rawHours * 100) / 100,
    breakHours,
    breakMins,                      // the break that WOULD apply (for display)
    deductedBreakMins: deductMins,  // what was actually deducted (0 if paid)
    punchedBreakMins,
    requiredBreakMins: reqMins,
    breakEnforced,
    breakPaid: !!breakPaid,
    rawHours,
    overnight,
  };
}

export async function sweepAutoClockouts(stores = []) {
  const cutoffByStore = {};
  (stores || []).forEach(s => { if (s.autoClockoutTime) cutoffByStore[s.id] = s.autoClockoutTime; });
  if (!Object.keys(cutoffByStore).length) return 0;

  const { data: open, error } = await supabase
    .from("punch_records").select("*").is("punch_out", null);
  if (error) throw error;
  if (!open || !open.length) return 0;

  const now = Date.now();
  let closed = 0;
  for (const p of open) {
    const cutoff = cutoffByStore[p.store_id];
    if (!cutoff || !p.date || !p.punch_in) continue;
    // The store cut-off moment for this shift's own date.
    const cutoffMs = new Date(`${p.date}T${cutoff}:00`).getTime();
    if (isNaN(cutoffMs)) continue;
    // Only act once the store cut-off has actually passed.
    if (now <= cutoffMs) continue;
    const pInMs = new Date(p.punch_in).getTime();

    // Decide the effective clock-out moment:
    //   • If the shift was rostered, cap at the SCHEDULED END (fairest — uses the
    //     real shift, not a blanket store time). Handle overnight schedules.
    //   • Otherwise fall back to the store cut-off.
    // We never extend hours: the cap is the EARLIER of (scheduled end, store cut-off)
    // when a schedule exists, so a forgotten punch can't be inflated past either.
    let effOutMs = cutoffMs;
    if (p.scheduled_end) {
      let schedEndMs = new Date(`${p.date}T${p.scheduled_end}:00`).getTime();
      if (!isNaN(schedEndMs)) {
        if (schedEndMs <= pInMs) schedEndMs += 86400000;   // overnight schedule
        // Use scheduled end, but never later than the store cut-off ceiling.
        effOutMs = Math.min(schedEndMs, cutoffMs);
      }
    }
    // Guard: effective out must be after clock-in, else skip (bad data).
    if (effOutMs <= pInMs) continue;

    const outIso = new Date(effOutMs).toISOString();
    const { hours } = computePunchHours({
      punchIn: p.punch_in, punchOut: outIso,
      breakMinutes: p.break_minutes, breakStart: p.break_start, breakEnd: p.break_end, breakEndRef: outIso,
    });
    const cappedAt = (p.scheduled_end && effOutMs < cutoffMs) ? "scheduled end" : "store cut-off";
    const { error: upErr } = await supabase.from("punch_records").update({
      punch_out: outIso,
      hours_worked: hours,
      gross_pay: null,                 // NOT auto-paid — manager reviews
      status: "auto_closed",
      notes: ((p.notes ? p.notes + " · " : "") + `Auto-closed at ${cappedAt} — needs review`).slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("id", p.id);
    if (!upErr) closed++;
  }
  return closed;
}

export async function updatePunchOut(id, punchOut, hoursWorked, grossPay) {
  // Close any OPEN break when clocking out, so a break left running (break_start
  // set, break_end null) can never be orphaned on a closed punch. The open break
  // is ended at the clock-out moment and its minutes folded into break_minutes.
  // (Root cause of the "2h 3m live break on a closed shift" bug.)
  const { data: existing } = await supabase
    .from("punch_records")
    .select("break_start, break_end, break_minutes, break_log, punch_in")
    .eq("id", id).single();

  // SANITY GUARD — a single café shift over 16h is physically implausible
  // (real cause is a forgotten punch, a clock anomaly, or a kiosk retry writing
  // junk — see the 4-second punches that recorded 23h). Record the hours but
  // WITHHOLD pay and flag for manager review instead of silently paying it.
  const implausible = Number(hoursWorked) > 16;
  const patch = {
    punch_out: punchOut, hours_worked: hoursWorked,
    gross_pay: implausible ? null : grossPay,
    status: implausible ? "auto_closed" : "closed",
    updated_at: new Date().toISOString(),
  };
  if (implausible) patch.notes = `Implausible duration (${Number(hoursWorked).toFixed(2)}h) — pay withheld, needs review`;

  if (existing && existing.break_start && !existing.break_end) {
    const startMs = new Date(existing.break_start).getTime();
    const outMs   = new Date(punchOut).getTime();
    // A break left OPEN at clock-out almost always means the employee forgot to
    // tap "end break" — not that they were on break for hours. Counting the full
    // break_start→clock_out span as break massively over-deducts pay (e.g. a
    // break started at 14:19 with clock-out at 23:07 recorded 8.8h of "break").
    // So we CAP the auto-closed portion at the required statutory break for the
    // shift length — they're due that much unpaid, but no more gets deducted for
    // a forgotten tap. A genuinely long break should be ended manually.
    const rawElapsed = (isNaN(startMs) || isNaN(outMs)) ? 0 : Math.max(0, Math.round((outMs - startMs) / 60000));
    const priorBreak = Number(existing.break_minutes) || 0;
    // Shift length in hours (minute-truncated in-line to mirror computePunchHours).
    const inMs = existing.punch_in ? new Date(existing.punch_in).getTime() : null;
    let shiftHrs = 0;
    if (inMs && !isNaN(outMs)) {
      let o = outMs; if (o < inMs) o += 86400000;
      shiftHrs = (o - inMs) / 3600000;
    }
    const reqMin = requiredBreakMins(shiftHrs);
    // Cap the newly-folded portion so total break can't exceed the greater of
    // the required minimum or what was already legitimately punched earlier.
    const cap = Math.max(reqMin, priorBreak);
    const foldedTotal = Math.min(priorBreak + rawElapsed, cap);
    patch.break_end = punchOut;
    patch.break_minutes = foldedTotal;
    // BREAK_LOG: record the auto-closed segment either way; mark capped when we
    // had to truncate a runaway open break, and flag for manager review.
    const _log = Array.isArray(existing.break_log) ? existing.break_log : [];
    const _capped = priorBreak + rawElapsed > cap + 5;
    patch.break_log = [..._log, {
      s: existing.break_start, e: punchOut,
      m: Math.max(0, foldedTotal - priorBreak),
      ...(_capped ? { capped: true } : {}),
    }];
    // Flag when we had to cap a runaway open break, so managers can review.
    if (_capped) {
      patch.notes = `${patch.notes ? patch.notes + " · " : ""}Open break auto-closed & capped at ${cap}m (raw ${priorBreak + rawElapsed}m — likely forgot to end break)`;
    }
  }

  const { data, error } = await supabase
    .from("punch_records")
    .update(patch)
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
    .from("punch_records").select("break_start, break_minutes, break_log").eq("id", id).single();
  if (e1) throw e1;
  const nowIso = new Date().toISOString();
  let patch;
  if (action === "start") {
    patch = { break_start: nowIso, break_end: null };
  } else {
    const start = rows?.break_start ? new Date(rows.break_start).getTime() : null;
    const addMins = start ? Math.max(0, Math.round((Date.now() - start) / 60000)) : 0;
    patch = { break_end: nowIso, break_minutes: (rows?.break_minutes || 0) + addMins };
    // BREAK_LOG: record the individual segment so views can show "3 breaks ·
    // 15m, 15m, 12m" rather than just the accumulated total.
    if (start) {
      const log = Array.isArray(rows?.break_log) ? rows.break_log : [];
      patch.break_log = [...log, { s: rows.break_start, e: nowIso, m: addMins }];
    }
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
// All manager BREAK adjustments in a date window — feeds the Breaks analysis.
export async function fetchBreakAudits({ fromIso, toIso } = {}) {
  let q = supabase.from("punch_audit").select("*")
    .in("field", ["break_minutes", "break_paid", "break_start", "break_end"])
    .order("changed_at", { ascending: false }).limit(500);
  if (fromIso) q = q.gte("changed_at", fromIso);
  if (toIso) q = q.lte("changed_at", toIso);
  const { data, error } = await q;
  if (error) throw error;
  const audits = (data || []).map(r => ({
    id: r.id, punchId: r.punch_id, field: r.field, oldValue: r.old_value,
    newValue: r.new_value, reason: r.reason, changedBy: r.changed_by, changedAt: r.changed_at,
  }));
  // Attach the shift each edit belongs to — the audit row alone is unreadable
  // ("break start → 15:30" of WHOSE shift, WHEN?).
  const ids = [...new Set(audits.map(x => x.punchId).filter(Boolean))];
  if (ids.length) {
    const { data: punches } = await supabase.from("punch_records")
      .select("id, employee_id, employee_name, date, store_id").in("id", ids);
    const byId = {};
    (punches || []).forEach(p => { byId[p.id] = p; });
    audits.forEach(x => {
      const p = byId[x.punchId];
      if (p) { x.employeeId = p.employee_id; x.employeeName = p.employee_name || ""; x.shiftDate = p.date; x.storeId = p.store_id; }
    });
  }
  return audits;
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
    break_paid: p.breakPaid ?? false,
    break_log: Array.isArray(p.breakLog) ? p.breakLog : [],
    break_claim_reason: p.breakClaimReason || "",
    break_claim_approved: p.breakClaimApproved ?? null,
    break_claim_decided_by: p.breakClaimDecidedBy || "",
    break_claim_rejected_reason: p.breakClaimRejectedReason || "",
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
    breakPaid: p.break_paid ?? false,
    breakLog: Array.isArray(p.break_log) ? p.break_log : [],
    breakClaimReason: p.break_claim_reason || "",
    breakClaimApproved: p.break_claim_approved ?? null,
    breakClaimDecidedBy: p.break_claim_decided_by || "",
    breakClaimRejectedReason: p.break_claim_rejected_reason || "",
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

// ── ANNOUNCEMENTS — audience targeting ───────────────────────────────────────
// Resolve a targeting audience to the set of ops_team member ids it reaches.
// audience = {
//   scope: "company" | "store" | "department" | "role" | "person",
//   storeIds?: [], departments?: [], roleIds?: [], memberIds?: [], brandId?
// }
// Active, non-archived members only. Returns an array of ops member ids.
export function resolveAnnouncementAudience(audience, opsTeam = []) {
  const active = (opsTeam || []).filter(m => !m.archivedAt && (m.status ? m.status === "active" : true));
  const a = audience || {};
  const inBrand = (m) => !a.brandId || m.brandId === a.brandId;
  switch (a.scope) {
    case "company":
      return active.filter(inBrand).map(m => m.id);
    case "store": {
      const set = new Set(a.storeIds || []);
      return active.filter(m => inBrand(m) && (m.storeIds || []).some(s => set.has(s))).map(m => m.id);
    }
    case "department": {
      const set = new Set((a.departments || []).map(d => String(d).toLowerCase()));
      return active.filter(m => inBrand(m) && m.department && set.has(m.department.toLowerCase())).map(m => m.id);
    }
    case "role": {
      const set = new Set(a.roleIds || []);
      return active.filter(m => inBrand(m) && (m.roleIds || []).some(r => set.has(r))).map(m => m.id);
    }
    case "person":
      return active.filter(m => (a.memberIds || []).includes(m.id)).map(m => m.id);
    default:
      return [];
  }
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

// ── Helpdesk notifications ────────────────────────────────────────────────────
// Mirrors the chat notification pattern. All fire-and-forget (never block the
// ticket write). linkView "helpdesk" routes the tap to the helpdesk view.
const HD_PRIO_TAG = (p) => (p === "Urgent" || p === "High") ? `[${p}] ` : "";

// New ticket raised → ping the managers/HQ in scope who can pick it up (and any
// already-assigned person), excluding the raiser.
export async function notifyNewHelpdeskTicket(ticket) {
  try {
    if (!ticket) return;
    const title = `${HD_PRIO_TAG(ticket.priority)}New ticket: ${ticket.title || "Untitled"}`;
    const body = `${ticket.category || "General"} · raised by ${ticket.createdByName || "a colleague"}`.slice(0, 120);
    const payload = { kind: "helpdesk", title, body, linkView: "helpdesk" };
    await notifyManagers({
      brandId: ticket.brandId || null,
      storeId: ticket.storeId || null,
      excludeUserId: ticket.createdById || null,
      ...payload,
    });
    // If it was created already-assigned, make sure the assignee hears too.
    const assignees = (ticket.assignedTo || []).filter(id => id && id !== ticket.createdById);
    if (assignees.length) {
      await insertNotifications(assignees.flatMap(id => ([
        { recipientType: "ops",  recipientId: id, ...payload },
        { recipientType: "user", recipientId: id, ...payload },
      ])));
    }
  } catch (e) { console.error("notifyNewHelpdeskTicket failed:", e); }
}

// Ticket assigned to someone → ping that assignee. `assigneeIds` is the set of
// people now assigned (we notify those who weren't assigned before).
export async function notifyHelpdeskAssignment(ticket, assigneeIds, byName) {
  try {
    if (!ticket) return;
    const ids = [...new Set((assigneeIds || []).filter(Boolean))];
    if (ids.length === 0) return;
    const title = `${HD_PRIO_TAG(ticket.priority)}Ticket assigned to you`;
    const body = `${ticket.title || "Ticket"}${byName ? ` · by ${byName}` : ""}`.slice(0, 120);
    const payload = { kind: "helpdesk", title, body, linkView: "helpdesk" };
    // assignee may be a user OR an ops member — notify both id spaces (harmless if one misses).
    await insertNotifications(ids.flatMap(id => ([
      { recipientType: "ops",  recipientId: id, ...payload },
      { recipientType: "user", recipientId: id, ...payload },
    ])));
  } catch (e) { console.error("notifyHelpdeskAssignment failed:", e); }
}

// New reply/comment on a ticket → ping the ticket creator + the assignee(s),
// excluding whoever wrote the reply.
export async function notifyHelpdeskReply(ticket, replierId, replierName) {
  try {
    if (!ticket) return;
    const targets = new Set();
    if (ticket.createdById) targets.add(ticket.createdById);
    (ticket.assignedTo || []).forEach(id => id && targets.add(id));
    targets.delete(replierId);  // don't notify the person who just replied
    const ids = [...targets].filter(Boolean);
    if (ids.length === 0) return;
    const title = `New reply: ${ticket.title || "your ticket"}`;
    const body = `${replierName || "Someone"} replied to the ticket.`.slice(0, 120);
    const payload = { kind: "helpdesk", title, body, linkView: "helpdesk" };
    await insertNotifications(ids.flatMap(id => ([
      { recipientType: "ops",  recipientId: id, ...payload },
      { recipientType: "user", recipientId: id, ...payload },
    ])));
  } catch (e) { console.error("notifyHelpdeskReply failed:", e); }
}

// ── Typing indicators (chat) ──────────────────────────────────────────────────
// Ephemeral presence over a Realtime broadcast channel — NO database writes.
// One channel per thread key. subscribeTyping returns a controller with
// `sendTyping()` (call on keypress) and `unsubscribe()` (call on cleanup).
export function subscribeTyping(threadKey, { selfId, selfName, onTypingChange }) {
  if (!threadKey) return { sendTyping() {}, unsubscribe() {} };
  const channel = supabase.channel(`typing:${threadKey}`, { config: { broadcast: { self: false } } });
  const typers = new Map();  // id -> { name, expires }
  let sweepTimer = null;

  const recompute = () => {
    const now = Date.now();
    let changed = false;
    for (const [id, info] of typers) {
      if (info.expires <= now) { typers.delete(id); changed = true; }
    }
    if (changed || typers.size > 0) {
      onTypingChange?.([...typers.values()].map(v => v.name));
    }
  };

  channel
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      if (!payload || payload.id === selfId) return;
      // each ping keeps the typer "alive" for 3.5s
      typers.set(payload.id, { name: payload.name || "Someone", expires: Date.now() + 3500 });
      onTypingChange?.([...typers.values()].map(v => v.name));
    })
    .subscribe();

  sweepTimer = setInterval(recompute, 1200);

  return {
    sendTyping() {
      channel.send({ type: "broadcast", event: "typing", payload: { id: selfId, name: selfName } });
    },
    unsubscribe() {
      if (sweepTimer) clearInterval(sweepTimer);
      try { supabase.removeChannel(channel); } catch { /* noop */ }
    },
  };
}

// ── Chat / Helpdesk attachments ───────────────────────────────────────────────
// Uploads any file type to the public `chat-attachments` bucket and returns
// { url, name, type, size } for embedding in a message or ticket comment.
// NOTE: requires a public Storage bucket named `chat-attachments` (create once
// in the Supabase dashboard; 25 MB file-size limit recommended).
export async function uploadChatAttachment(file) {
  if (!file) throw new Error("No file provided");
  if (!(file instanceof File || file instanceof Blob)) throw new Error("Invalid file");
  const MAX_BYTES = 25 * 1024 * 1024;  // 25 MB
  if (file.size > MAX_BYTES) {
    throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 25 MB.`);
  }
  const safe = (file.name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const path = `${new Date().toISOString().slice(0, 7)}/${Date.now()}_${safe}`;
  const { error: upErr } = await supabase.storage.from("chat-attachments").upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
  return { url: data.publicUrl, name: file.name || safe, type: file.type || "", size: file.size || 0 };
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
  // PHASE 4: after sales land, deplete store stock from those sales (best-effort,
  // idempotent per sale). Never let a depletion issue break the sync itself.
  try { await _depleteAllStoresRollingWindow(body); } catch (e) { console.error("post-sync depletion failed:", e.message); }
  return data;
}

// Deplete store stock for all active stores across the sync's window.
// Default window = yesterday + today (matches the rolling sync). Idempotent, so
// re-running these dates only processes sales not already deducted.
async function _depleteAllStoresRollingWindow(body = {}) {
  // Resolve the date window: explicit from/to on the body, else yesterday+today.
  const toDate = (d) => d.toISOString().slice(0, 10);
  let dates = [];
  if (body && body.from && body.to) {
    let d = new Date(body.from + "T00:00:00Z"); const end = new Date(body.to + "T00:00:00Z");
    while (d <= end) { dates.push(toDate(d)); d.setUTCDate(d.getUTCDate() + 1); }
  } else {
    const today = new Date(); const yest = new Date(); yest.setUTCDate(yest.getUTCDate() - 1);
    dates = [toDate(yest), toDate(today)];
  }
  // Active, non-CK stores only (store stock is store-scope; skip the kitchen).
  const { data: stores } = await supabase.from("stores")
    .select("id, site_type").is("archived_at", null);
  const storeIds = (stores || []).filter(s => s.site_type !== "central_kitchen").map(s => s.id);
  for (const storeId of storeIds) {
    for (const date of dates) {
      try { await depleteStoreStockFromSales(storeId, date); }
      catch (e) { console.error(`deplete ${storeId} ${date} failed:`, e.message); }
    }
  }
}

// Rebuild store_day_aggregates from already-synced flipdish_sales for a date
// range (inclusive). Use this when Flipdish backfills sales late (after an
// outage): the raw sales land in flipdish_sales and show on the dashboard, but
// the per-day aggregates that EOD Reconciliation reads aren't regenerated — so
// recon shows "no Flipdish data" for those days. This recomputes them.
// Calls the Postgres RPC rebuild_store_day_aggregates(p_from, p_to) which does
// an INSERT … SELECT … ON CONFLICT scoped to the range (idempotent).
export async function rebuildStoreDayAggregates({ from, to } = {}) {
  if (!from || !to) throw new Error("rebuildStoreDayAggregates needs from and to dates");
  const { data, error } = await supabase.rpc("rebuild_store_day_aggregates", { p_from: from, p_to: to });
  if (error) throw error;
  return data; // number of rows rebuilt
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

// ── HR POLICIES (manager-managed) ──
export async function fetchHrPolicies({ includeInactive } = {}) {
  let q = supabase.from("hr_policies").select("*").order("sort_order").order("created_at");
  if (!includeInactive) q = q.eq("active", true);
  const { data } = await q;
  return (data || []).map(p => ({ key: p.key, label: p.label, docUrl: p.doc_url || "", sortOrder: p.sort_order || 0, active: p.active !== false }));
}
export async function upsertHrPolicy({ key, label, docUrl, sortOrder, active, createdBy }) {
  const slug = key || `pol-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const row = { key: slug, label: label || "Untitled policy", doc_url: docUrl || null };
  if (sortOrder !== undefined) row.sort_order = sortOrder;
  if (active !== undefined) row.active = !!active;
  if (createdBy) row.created_by = createdBy;
  const { error } = await supabase.from("hr_policies").upsert(row, { onConflict: "key" });
  if (error) throw error;
  return slug;
}
export async function deleteHrPolicy(key) {
  // Soft-delete: deactivate so historic acknowledgements keep their meaning.
  const { error } = await supabase.from("hr_policies").update({ active: false }).eq("key", key);
  if (error) throw error;
}
export async function uploadPolicyDoc(file) {
  if (!file) throw new Error("No file provided.");
  const ext = (file.name || "policy.pdf").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage.from("policy-docs").upload(path, file, { upsert: false, contentType: file.type || "application/pdf" });
  if (error) throw error;
  const { data } = supabase.storage.from("policy-docs").getPublicUrl(path);
  return data.publicUrl;
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
export function resolveHourlyRate(employee, workDate, rates, payRatesByEmp) {
  // Accept BOTH the camelCase app shape (payBasis, hourlyRate, dob) and the
  // snake_case DB shape (pay_basis, hourly_rate) — callers pass either.
  const basis = employee?.payBasis ?? employee?.pay_basis ?? "fixed";
  const hourly = employee?.hourlyRate ?? employee?.hourly_rate;
  const dob = employee?.dob;
  if (basis === "fixed") {
    // Effective-dated rate history takes priority when present.
    const empId = employee?.id;
    const history = payRatesByEmp && empId ? payRatesByEmp[empId] : null;
    const histRate = fixedRateOnDate(history, workDate);
    if (histRate === null) {
      // Has rate history, but this shift predates the earliest effective date.
      return { rate: 0, basis, band: null, age: null, error: null, beforeEffective: true };
    }
    if (histRate !== undefined) {
      return { rate: histRate, basis, band: null, age: null, error: null };
    }
    // No history → fall back to the flat hourly_rate (legacy behaviour).
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

// ── Effective-dated employee pay rates (fixed-basis staff) ───────────────────
// Rate history: each row takes effect from effective_from. Resolver picks the
// most recent rate whose effective_from <= the shift date. Shifts before the
// earliest effective_from resolve to £0 (not yet on payroll).
export async function fetchEmployeePayRates(employeeId) {
  let q = supabase.from("employee_pay_rates").select("*");
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data, error } = await q.order("effective_from", { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({ id: r.id, employeeId: r.employee_id, rate: r.rate != null ? Number(r.rate) : null, effectiveFrom: r.effective_from, note: r.note || "" }));
}
export async function upsertEmployeePayRate(row) {
  const payload = {
    id: row.id || `epr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    employee_id: row.employeeId, rate: Number(row.rate), effective_from: row.effectiveFrom, note: row.note || null,
  };
  const { data, error } = await supabase.from("employee_pay_rates").upsert(payload, { onConflict: "employee_id,effective_from" }).select().single();
  if (error) throw error;
  return { id: data.id, employeeId: data.employee_id, rate: Number(data.rate), effectiveFrom: data.effective_from, note: data.note || "" };
}
export async function deleteEmployeePayRate(id) {
  const { error } = await supabase.from("employee_pay_rates").delete().eq("id", id);
  if (error) throw error;
}
// Pick the fixed rate in effect on workDate from a rate-history array.
// Returns null if the employee has history but the shift predates all of it.
function fixedRateOnDate(payRates, workDate) {
  if (!payRates || !payRates.length) return undefined; // no history → caller falls back to flat rate
  const d = new Date(workDate);
  const eligible = payRates
    .filter(r => new Date(r.effectiveFrom) <= d)
    .sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom));
  return eligible.length ? Number(eligible[0].rate) : null; // null = before earliest effective date
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
// Resolve a free-text invoice "entity" value (a store id/name, or "kitchen"/
// "central_kitchen") to a real entities.id. Returns null if it can't be resolved.
async function resolveEntityId(entityText) {
  if (!entityText) return null;
  const t = String(entityText).trim();
  if (t === "kitchen" || t === "central_kitchen" || t === "central-kitchen") return "central-kitchen";
  // Try as a store id first, then by name/shortName → store.brand_id is the entity id.
  const { data: byId } = await supabase.from("stores").select("brand_id").eq("id", t).maybeSingle();
  if (byId?.brand_id) return byId.brand_id;
  const { data: byName } = await supabase.from("stores").select("brand_id").or(`name.eq.${t},short_name.eq.${t}`).limit(1).maybeSingle();
  if (byName?.brand_id) return byName.brand_id;
  // Finally, maybe it's already a valid entity id.
  const { data: ent } = await supabase.from("entities").select("id").eq("id", t).maybeSingle();
  return ent?.id || null;
}

export async function uploadInvoiceFile(file, entity, userId) {
  const safe = (file.name || "invoice").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const path = `${entity}/${Date.now()}_${safe}`;
  const { error: upErr } = await supabase.storage.from("invoices").upload(path, file, { upsert: false });
  if (upErr) throw upErr;
  const entityId = await resolveEntityId(entity);
  const { data, error } = await supabase
    .from("invoices")
    .insert({ entity, entity_id: entityId, image_path: path, uploaded_by: userId, status: "uploaded" })
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
    .select("id, entity, entity_id, supplier_name, invoice_number, invoice_date, due_date, paid_date, total_ex_vat, total_vat, status, payment_status, amount_paid, category, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data || [];
}

export async function getInvoiceWithLines(invoiceId) {
  const { data: inv, error: e1 } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();
  if (e1) throw e1;
  const fetchLines = async () => {
    const { data, error } = await supabase.from("invoice_lines").select("*")
      .eq("invoice_id", invoiceId).order("line_no", { ascending: true });
    if (error) throw error;
    return data || [];
  };
  let lines = await fetchLines();
  // ── SELF-HEAL: the extractor predates order_qty and writes pack_qty_base as
  //    the multi-pack TOTAL. On every open, backfill order_qty from the
  //    extractor's own JSON and convert totals to per-pack, once per line. ──
  try {
    const raw = typeof inv.extracted_json === "string" ? JSON.parse(inv.extracted_json) : inv.extracted_json;
    const jl = Array.isArray(raw?.lines) ? raw.lines : [];
    if (jl.length) {
      const base = Math.min(...lines.map(l => Number(l.line_no)));   // 0- or 1-based
      let healed = false;
      for (const l of lines) {
        const j = jl[Number(l.line_no) - base];
        if (!j) continue;
        const upd = {};
        if (l.order_qty == null && j.order_qty != null) upd.order_qty = Number(j.order_qty);
        const n = Number(upd.order_qty ?? l.order_qty) || 0;
        const total = l.pack_qty_base != null ? Number(l.pack_qty_base) : null;
        const per = j.pack_size != null ? Number(j.pack_size) : null;
        if (total != null && per != null && n > 1 && Math.abs(total - per * n) < 1e-6 && total !== per) {
          upd.pack_qty_base = per;   // stored total → per-pack, per the JSON's own pack_size
        }
        if (Object.keys(upd).length) {
          await supabase.from("invoice_lines").update(upd).eq("id", l.id);
          healed = true;
        }
      }
      if (healed) lines = await fetchLines();
    }
  } catch { /* healing is best-effort; never block the reviewer */ }
  return { invoice: inv, lines };
}

export async function getInvoiceFileUrl(path) {
  const { data, error } = await supabase.storage.from("invoices").createSignedUrl(path, 3600);
  if (error) throw error;
  return data?.signedUrl || null;
}

// ── SUPPLIER ITEM ALIASES: names matched once, remembered everywhere ─────────
export const normItemAlias = (t) => String(t || "").toLowerCase().replace(/\s+/g, " ").trim();

export async function fetchItemAliases() {
  const { data } = await supabase.from("supplier_item_aliases").select("*");
  const m = new Map();
  (data || []).forEach(r => m.set(`${r.alias_norm}|${r.vendor || ""}`, r.store_item_id));
  return m;
}
export const lookupAlias = (aliasMap, name, vendor) => {
  const n = normItemAlias(name);
  return aliasMap.get(`${n}|${normItemAlias(vendor)}`) || aliasMap.get(`${n}|`) || null;
};
export async function fetchAliasFor(name, vendor) {
  const n = normItemAlias(name);
  const { data } = await supabase.from("supplier_item_aliases").select("store_item_id, vendor")
    .eq("alias_norm", n).limit(3);
  if (!data || !data.length) return null;
  const v = normItemAlias(vendor);
  const hit = data.find(r => (r.vendor || "") === v) || data.find(r => !r.vendor) || data[0];
  return hit?.store_item_id || null;
}
export async function fetchStoreItemName(id) {
  if (id == null) return null;
  const { data } = await supabase.from("cogs_store_items").select("name").eq("id", id).maybeSingle();
  return data?.name || null;
}

export async function upsertItemAlias({ name, vendor, storeItemId, by }) {
  if (!name || !storeItemId) return;
  const { error } = await supabase.from("supplier_item_aliases").upsert({
    alias_norm: normItemAlias(name), vendor: normItemAlias(vendor), store_item_id: String(storeItemId), created_by: by || null,
  }, { onConflict: "alias_norm,vendor" });
  if (error) console.error("alias save failed:", error.message);
}

export async function saveInvoiceLine(lineId, fields) {
  const { error } = await supabase.from("invoice_lines").update(fields).eq("id", lineId);
  if (error) throw error;
  // LEARNING: a human match teaches the alias map — this single hook covers
  // every reviewer surface (invoice inbox AND expense review use this fn).
  if (fields && fields.match_method === "human" && fields.matched_store_item_id) {
    try {
      const { data: ln } = await supabase.from("invoice_lines").select("raw_description, invoice_id").eq("id", lineId).single();
      if (ln?.raw_description) {
        const { data: inv } = await supabase.from("invoices").select("supplier_name").eq("id", ln.invoice_id).single();
        await upsertItemAlias({ name: ln.raw_description, vendor: inv?.supplier_name || "", storeItemId: fields.matched_store_item_id });
      }
    } catch (e) { console.error("alias learn failed:", e.message); }
  }
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
  // Mirror the approved invoice into the journal: Dr expense, Cr trade creditors.
  try {
    const { data: inv } = await supabase.from("invoices").select("id, entity_id, invoice_number, invoice_date, supplier_name, total_ex_vat, total_vat, category").eq("id", invoiceId).maybeSingle();
    if (inv?.entity_id) await postInvoiceJournal(inv, inv.entity_id);
  } catch (e) { /* journal mirror is non-critical */ }
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

// ── Default store scope per role ─────────────────────────────────────────────
// Stored as a single JSON blob in app_settings under "default_store_scope".
// Shape: { "<role>": "all" | "assigned" | "<storeId>" }. No schema change.
const DEFAULT_STORE_SCOPE_KEY = "default_store_scope";
export async function fetchDefaultStoreScope() {
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", DEFAULT_STORE_SCOPE_KEY).maybeSingle();
  if (error) throw error;
  try { return data?.value ? JSON.parse(data.value) : {}; } catch { return {}; }
}
export async function setDefaultStoreScopeForRole(role, scope) {
  const current = await fetchDefaultStoreScope();
  const next = { ...current };
  if (scope == null) delete next[role]; else next[role] = scope;
  const { error } = await supabase.from("app_settings").upsert({ key: DEFAULT_STORE_SCOPE_KEY, value: JSON.stringify(next) }, { onConflict: "key" });
  if (error) throw error;
  return next;
}

// ── Announcements ───────────────────────────────────────────────────────────
function dbAnnouncementToApp(a) {
  return { id: a.id, title: a.title, body: a.body || "", createdBy: a.created_by || "", createdAt: a.created_at, active: a.active !== false,
    scope: a.scope || "company", storeIds: a.store_ids || [], departments: a.departments || [],
    roleIds: a.role_ids || [], memberIds: a.member_ids || [], recipientCount: a.recipient_count || 0 };
}
export async function fetchAnnouncements() {
  const { data, error } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(dbAnnouncementToApp);
}
export async function createAnnouncement({ title, body, createdBy, audience, opsTeam = [] }) {
  // Backwards compatible: with no audience, behaves as a company-wide post.
  const aud = audience || { scope: "company" };
  const memberIds = resolveAnnouncementAudience(aud, opsTeam);
  const row = {
    id: `ann-${Date.now()}`, title, body: body || "", created_by: createdBy || null, active: true,
    scope: aud.scope || "company",
    store_ids: aud.storeIds || [], departments: aud.departments || [],
    role_ids: aud.roleIds || [], member_ids: aud.memberIds || [],
    recipient_count: memberIds.length,
  };
  const { data, error } = await supabase.from("announcements").insert(row).select().single();
  if (error) throw error;
  // Also deliver to each targeted member's notification bell + push, so a
  // targeted announcement actively reaches them (not only the ack-on-login pop).
  if (aud.scope !== "company") {
    await notifyOpsMembers(memberIds, { kind: "announcement", title, body });
  }
  return dbAnnouncementToApp(data);
}
export async function setAnnouncementActive(id, active) {
  const { error } = await supabase.from("announcements").update({ active: !!active }).eq("id", id);
  if (error) throw error;
  return id;
}
export async function deleteAnnouncement(id) {
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) throw error;
  return id;
}
// Acks the current person has recorded — used to decide whether to pop.
export async function fetchMyAnnouncementAcks(personId) {
  if (!personId) return [];
  const { data, error } = await supabase.from("announcement_acks").select("announcement_id").eq("person_id", personId);
  if (error) throw error;
  return (data || []).map(r => r.announcement_id);
}
export async function acknowledgeAnnouncement(announcementId, personId, personName) {
  if (!announcementId || !personId) return;
  const { error } = await supabase.from("announcement_acks")
    .upsert({ announcement_id: announcementId, person_id: personId, person_name: personName || "", acknowledged_at: new Date().toISOString() }, { onConflict: "announcement_id,person_id" });
  if (error) throw error;
}
// All acks for one announcement — for the owner's "who has read it" view.
export async function fetchAnnouncementAcks(announcementId) {
  const { data, error } = await supabase.from("announcement_acks").select("*").eq("announcement_id", announcementId).order("acknowledged_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({ personId: r.person_id, personName: r.person_name || "", acknowledgedAt: r.acknowledged_at }));
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
    .select("id, entity, entity_id, supplier_name, invoice_number, invoice_date, total_ex_vat, total_vat, status, payment_status, category")
    .order("invoice_date", { ascending: false });
  if (from) q = q.gte("invoice_date", from);
  if (to)   q = q.lte("invoice_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(i => ({
    id: i.id, entity: i.entity || "", entityId: i.entity_id || null, supplier: i.supplier_name || "",
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

// ===== GBP_INSIGHTS_V1: staff leaderboard + sentiment (from google_review_insights) =====
// Trigger the extraction Edge Function (processes a batch of un-analysed reviews).
export async function triggerReviewInsights(body = {}) {
  const headers = {};
  if (process.env.REACT_APP_SYNC_SECRET) headers["x-sync-secret"] = process.env.REACT_APP_SYNC_SECRET;
  const { data, error } = await supabase.functions.invoke("gbp-review-insights", { body, headers });
  if (error) throw error;
  return data;
}

// Staff leaderboard: counts how often each staff member is named in reviews,
// optionally scoped to a store and/or a date window. Aggregates client-side from
// the insights rows (staff_mentioned is a text[] per review).
export async function fetchStaffLeaderboard({ storeId = null, from = null, to = null } = {}) {
  let q = supabase.from("google_review_insights")
    .select("store_id, staff_mentioned, star_rating, staff_sentiment, create_time")
    .not("staff_mentioned", "eq", "{}")
    .limit(20000);
  if (storeId) q = q.eq("store_id", storeId);
  if (from)    q = q.gte("create_time", from);
  if (to)      q = q.lte("create_time", to + "T23:59:59");
  const { data, error } = await q;
  if (error) throw error;

  // name -> { name, mentions, stars[], stores:Set, positive }
  const tally = {};
  (data || []).forEach((r) => {
    (r.staff_mentioned || []).forEach((rawName) => {
      const name = (rawName || "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (!tally[key]) tally[key] = { name, mentions: 0, starSum: 0, starN: 0, stores: new Set(), positive: 0 };
      const t = tally[key];
      t.mentions += 1;
      if (typeof r.star_rating === "number") { t.starSum += r.star_rating; t.starN += 1; }
      if (r.store_id) t.stores.add(r.store_id);
      if (r.staff_sentiment === "positive") t.positive += 1;
    });
  });

  return Object.values(tally)
    .map((t) => ({
      name: t.name,
      mentions: t.mentions,
      avgStars: t.starN ? t.starSum / t.starN : null,
      stores: Array.from(t.stores),
      positiveRate: t.mentions ? t.positive / t.mentions : 0,
    }))
    .sort((a, b) => b.mentions - a.mentions);
}

// Coverage helper: how many text reviews are processed vs total (for the
// "analysing… X of Y" state in the UI).
export async function fetchInsightsCoverage() {
  const { count: total } = await supabase.from("google_reviews")
    .select("review_id", { count: "exact", head: true })
    .not("comment", "is", null).neq("comment", "");
  const { count: done } = await supabase.from("google_review_insights")
    .select("review_id", { count: "exact", head: true });
  return { total: total || 0, done: done || 0, remaining: Math.max(0, (total || 0) - (done || 0)) };
}
// Sentiment + theme analysis: aggregates google_review_insights into a sentiment
// split and a per-theme breakdown (with each theme's sentiment mix, so problem
// areas surface). Scoped by store and/or date window.
export async function fetchReviewSentiment({ storeId = null, from = null, to = null } = {}) {
  let q = supabase.from("google_review_insights")
    .select("store_id, sentiment, themes, star_rating, create_time")
    .limit(20000);
  if (storeId) q = q.eq("store_id", storeId);
  if (from)    q = q.gte("create_time", from);
  if (to)      q = q.lte("create_time", to + "T23:59:59");
  const { data, error } = await q;
  if (error) throw error;

  const rows = data || [];
  const sentimentCounts = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
  // theme -> { theme, total, positive, negative, neutral, mixed }
  const themeMap = {};
  let starSum = 0, starN = 0;

  rows.forEach((r) => {
    const s = r.sentiment;
    if (s && sentimentCounts[s] != null) sentimentCounts[s] += 1;
    if (typeof r.star_rating === "number") { starSum += r.star_rating; starN += 1; }
    (r.themes || []).forEach((theme) => {
      if (!themeMap[theme]) themeMap[theme] = { theme, total: 0, positive: 0, negative: 0, neutral: 0, mixed: 0 };
      themeMap[theme].total += 1;
      if (s && themeMap[theme][s] != null) themeMap[theme][s] += 1;
    });
  });

  const themes = Object.values(themeMap)
    .map((t) => ({
      ...t,
      negativeRate: t.total ? (t.negative + t.mixed) / t.total : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    total: rows.length,
    avgStars: starN ? starSum / starN : null,
    sentiment: sentimentCounts,
    themes,
  };
}
// ===== GBP_DELETIONS_V1: deleted-review monitoring =====
export async function triggerReviewDeletionCheck(body = {}) {
  const headers = {};
  if (process.env.REACT_APP_SYNC_SECRET) headers["x-sync-secret"] = process.env.REACT_APP_SYNC_SECRET;
  const { data, error } = await supabase.functions.invoke("gbp-review-deletions", { body, headers });
  if (error) throw error;
  return data;
}

// Current deletion signals: per store, Google's count vs what we have stored.
// A positive `missing` = reviews we kept that Google no longer shows (candidates
// for appeal). Also returns the count-history trend for charting drops.
export async function fetchDeletionSignals({ storeId = null } = {}) {
  // current official counts
  let sq = supabase.from("google_location_stats").select("location_id, store_id, total_review_count");
  if (storeId) sq = sq.eq("store_id", storeId);
  const { data: stats, error: se } = await sq;
  if (se) throw se;

  // stored counts per location
  let rq = supabase.from("google_reviews").select("location_id, store_id").limit(50000);
  if (storeId) rq = rq.eq("store_id", storeId);
  const { data: stored, error: re } = await rq;
  if (re) throw re;
  const storedByLoc = {};
  (stored || []).forEach(r => { storedByLoc[r.location_id] = (storedByLoc[r.location_id] || 0) + 1; });

  const signals = (stats || []).map(s => {
    const have = storedByLoc[s.location_id] || 0;
    const google = s.total_review_count ?? null;
    const missing = (typeof google === "number") ? Math.max(0, have - google) : 0;
    return { locationId: s.location_id, storeId: s.store_id, google, have, missing };
  }).sort((a, b) => b.missing - a.missing);

  // recent history for trend (last 60 snapshots overall)
  let hq = supabase.from("google_review_count_history")
    .select("location_id, store_id, total_count, snapshot_at")
    .order("snapshot_at", { ascending: false }).limit(2000);
  if (storeId) hq = hq.eq("store_id", storeId);
  const { data: history } = await hq;

  return { signals, history: history || [] };
}
// ===== end GBP_DELETIONS_V1 =====

// ===== GBP_PERFORMANCE_V1: discovery metrics (Maps/Search views, calls, etc) =====
export async function triggerPerformanceSync(body = {}) {
  const headers = {};
  if (process.env.REACT_APP_SYNC_SECRET) headers["x-sync-secret"] = process.env.REACT_APP_SYNC_SECRET;
  const { data, error } = await supabase.functions.invoke("gbp-performance-sync", { body, headers });
  if (error) throw error;
  return data;
}

// Aggregated discovery metrics per store over a window. Sums each metric and
// derives totals (impressions, actions). Used by the Store/Chain analytics panel.
export async function fetchPerformanceMetrics({ storeId = null, from = null, to = null } = {}) {
  let q = supabase.from("gbp_performance_daily")
    .select("store_id, metric_date, impr_maps_desktop, impr_maps_mobile, impr_search_desktop, impr_search_mobile, calls, directions, website_clicks, conversations, bookings, food_orders, menu_clicks")
    .limit(20000);
  if (storeId) q = q.eq("store_id", storeId);
  if (from)    q = q.gte("metric_date", from);
  if (to)      q = q.lte("metric_date", to);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data || [];

  const blank = () => ({
    imprMaps: 0, imprSearch: 0, impressions: 0,
    calls: 0, directions: 0, websiteClicks: 0, conversations: 0,
    bookings: 0, foodOrders: 0, menuClicks: 0, actions: 0,
  });
  const overall = blank();
  const byStore = {};
  const byDate = {};

  rows.forEach((r) => {
    const maps   = (r.impr_maps_desktop || 0) + (r.impr_maps_mobile || 0);
    const search = (r.impr_search_desktop || 0) + (r.impr_search_mobile || 0);
    const actions = (r.calls || 0) + (r.directions || 0) + (r.website_clicks || 0) +
                    (r.conversations || 0) + (r.bookings || 0) + (r.food_orders || 0) + (r.menu_clicks || 0);
    const add = (t) => {
      t.imprMaps += maps; t.imprSearch += search; t.impressions += maps + search;
      t.calls += r.calls || 0; t.directions += r.directions || 0; t.websiteClicks += r.website_clicks || 0;
      t.conversations += r.conversations || 0; t.bookings += r.bookings || 0;
      t.foodOrders += r.food_orders || 0; t.menuClicks += r.menu_clicks || 0; t.actions += actions;
    };
    add(overall);
    if (r.store_id) { byStore[r.store_id] = byStore[r.store_id] || blank(); add(byStore[r.store_id]); }
    if (r.metric_date) {
      byDate[r.metric_date] = byDate[r.metric_date] || { date: r.metric_date, impressions: 0, actions: 0 };
      byDate[r.metric_date].impressions += maps + search;
      byDate[r.metric_date].actions += actions;
    }
  });

  return {
    overall,
    perStore: Object.entries(byStore).map(([id, t]) => ({ storeId: id, ...t }))
      .sort((a, b) => b.impressions - a.impressions),
    trend: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
    hasData: rows.length > 0,
  };
}
// ===== end GBP_PERFORMANCE_V1 =====

// ===== GBP_POSTS_V1: bulk Local Posts to Google listings =====
export async function createLocalPosts(body = {}) {
  const headers = {};
  if (process.env.REACT_APP_SYNC_SECRET) headers["x-sync-secret"] = process.env.REACT_APP_SYNC_SECRET;
  const { data, error } = await supabase.functions.invoke("gbp-create-posts", { body, headers });
  if (error) throw error;
  return data;
}

export async function fetchPostLog({ limit = 50 } = {}) {
  const { data, error } = await supabase.from("gbp_post_log")
    .select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}
// ===== end GBP_POSTS_V1 =====

// ===== GBP_AUDIT_V1: listings completeness audit =====
export async function triggerListingsAudit(body = {}) {
  const headers = {};
  if (process.env.REACT_APP_SYNC_SECRET) headers["x-sync-secret"] = process.env.REACT_APP_SYNC_SECRET;
  const { data, error } = await supabase.functions.invoke("gbp-listings-audit", { body, headers });
  if (error) throw error;
  return data;
}

export async function fetchListingsAudit({ storeId = null } = {}) {
  let q = supabase.from("gbp_listing_audit").select("*").order("issue_count", { ascending: false });
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(r => ({
    locationId: r.location_id, storeId: r.store_id, title: r.title,
    hasHours: r.has_hours, hasWebsite: r.has_website, hasPhone: r.has_phone,
    hasDescription: r.has_description, hasSpecialHours: r.has_special_hours, isOpen: r.is_open,
    website: r.website, phone: r.phone, issues: r.issues || [], issueCount: r.issue_count,
    auditedAt: r.audited_at,
  }));
}
// ===== end GBP_AUDIT_V1 =====

// ===== GBP_COMMAND_V1: advanced command center data =====
export async function triggerChainSnapshot(body = {}) {
  const headers = {};
  if (process.env.REACT_APP_SYNC_SECRET) headers["x-sync-secret"] = process.env.REACT_APP_SYNC_SECRET;
  const { data, error } = await supabase.functions.invoke("gbp-chain-snapshot", { body, headers });
  if (error) throw error;
  return data;
}

// Chain-level snapshot history (store_id null rows) for trend charts.
export async function fetchChainSnapshotHistory({ days = 90 } = {}) {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const { data, error } = await supabase.from("gbp_chain_snapshot")
    .select("snapshot_date, rating, reviews, impressions_30d, actions_30d, scans_30d, positive_pct, listing_issues, removed_reviews")
    .is("store_id", null)
    .gte("snapshot_date", since)
    .order("snapshot_date", { ascending: true });
  if (error) throw error;
  return (data || []).map(r => ({
    date: r.snapshot_date, rating: r.rating, reviews: r.reviews,
    impressions: r.impressions_30d, actions: r.actions_30d, scans: r.scans_30d,
    positivePct: r.positive_pct, issues: r.listing_issues, removed: r.removed_reviews,
  }));
}

// Real daily impressions/actions trend (from gbp_performance_daily, has history).
export async function fetchPerformanceTrend({ days = 60, storeId = null } = {}) {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  let q = supabase.from("gbp_performance_daily")
    .select("metric_date, impr_maps_desktop, impr_maps_mobile, impr_search_desktop, impr_search_mobile, calls, directions, website_clicks, conversations, bookings, food_orders, menu_clicks")
    .gte("metric_date", since).limit(20000);
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) throw error;
  const byDate = {};
  (data || []).forEach(r => {
    const impr = (r.impr_maps_desktop||0)+(r.impr_maps_mobile||0)+(r.impr_search_desktop||0)+(r.impr_search_mobile||0);
    const act = (r.calls||0)+(r.directions||0)+(r.website_clicks||0)+(r.conversations||0)+(r.bookings||0)+(r.food_orders||0)+(r.menu_clicks||0);
    byDate[r.metric_date] = byDate[r.metric_date] || { date: r.metric_date, impressions: 0, actions: 0, foodOrders: 0 };
    byDate[r.metric_date].impressions += impr;
    byDate[r.metric_date].actions += act;
    byDate[r.metric_date].foodOrders += (r.food_orders||0);
  });
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

// Daily review-count history for the chain (sum across locations per snapshot).
export async function fetchReviewCountTrend({ days = 90 } = {}) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data, error } = await supabase.from("google_review_count_history")
    .select("total_count, snapshot_at").gte("snapshot_at", since)
    .order("snapshot_at", { ascending: true }).limit(5000);
  if (error) throw error;
  // group by day, sum counts across locations
  const byDay = {};
  (data || []).forEach(r => {
    const d = (r.snapshot_at || "").slice(0, 10);
    if (!d) return;
    byDay[d] = (byDay[d] || 0) + (r.total_count || 0);
  });
  return Object.entries(byDay).map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date));
}
// ===== end GBP_COMMAND_V1 =====

// ===== GBP_SEO_V1: per-store SEO health score =====
// Review velocity per store — counts reviews in the last 30 and 90 days.
// Recency/velocity is a top-weighted 2026 ranking signal.
export async function fetchReviewVelocity({ storeId = null } = {}) {
  const d90 = new Date(Date.now() - 90 * 864e5).toISOString();
  let q = supabase.from("google_reviews").select("store_id, create_time").gte("create_time", d90).limit(50000);
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) throw error;
  const d30ms = Date.now() - 30 * 864e5;
  const byStore = {};
  (data || []).forEach(r => {
    if (!r.store_id) return;
    byStore[r.store_id] = byStore[r.store_id] || { last30: 0, last90: 0 };
    byStore[r.store_id].last90 += 1;
    if (new Date(r.create_time).getTime() >= d30ms) byStore[r.store_id].last30 += 1;
  });
  return byStore; // { storeId: { last30, last90 } }
}

// Composite SEO health score per store (0-100), built ONLY from measurable data.
// Five weighted components mapped to Google's relevance/prominence pillars:
//   - Profile completeness (25): hours, website, phone, description, special hours
//   - Review prominence    (25): rating (vs 4.5 target) + volume
//   - Review velocity       (20): reviews in last 30d (recency signal)
//   - Collection activity   (15): scans (leading indicator of future reviews)
//   - Engagement            (15): impressions->actions conversion rate
// Returns per-store score + component breakdown + the gaps it can't measure.
export async function fetchSeoHealthScores() {
  const safe = (p) => p.then(v => v).catch(() => null);
  const [stats, audit, perf, scans, velocity] = await Promise.all([
    safe(fetchReviewStats()),
    safe(fetchListingsAudit({})),
    safe(fetchPerformanceMetrics({ from: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10) })),
    safe(fetchReviewScanStats({ since: new Date(Date.now() - 30 * 864e5).toISOString() })),
    safe(fetchReviewVelocity({})),
  ]);

  const auditByStore = {}; (audit || []).forEach(a => { auditByStore[a.storeId] = a; });
  const perfByStore = {}; (perf?.perStore || []).forEach(p => { perfByStore[p.storeId] = p; });
  const scanByStore = {};
  (Array.isArray(scans) ? scans : []).forEach(s => { if (s.storeId) scanByStore[s.storeId] = (scanByStore[s.storeId] || 0) + 1; });
  const vel = velocity || {};

  const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

  const rows = (stats || []).map(s => {
    const a = auditByStore[s.storeId];
    const p = perfByStore[s.storeId] || {};
    const scanN = scanByStore[s.storeId] || 0;
    const v = vel[s.storeId] || { last30: 0, last90: 0 };

    // 1. Completeness (25): 5 fields x 5 pts
    let completeness = 0;
    if (a) {
      completeness =
        (a.hasHours ? 5 : 0) + (a.hasWebsite ? 5 : 0) + (a.hasPhone ? 5 : 0) +
        (a.hasDescription ? 5 : 0) + (a.hasSpecialHours ? 5 : 0);
    }
    const completenessKnown = !!a;

    // 2. Prominence (25): rating vs 4.5 target (up to 15) + volume (up to 10)
    const ratingScore = s.avg ? clamp((s.avg / 4.7) * 15, 0, 15) : 0;
    const volScore = clamp(Math.log10((s.n || 0) + 1) / Math.log10(1000) * 10, 0, 10); // 1000+ reviews = full
    const prominence = ratingScore + volScore;

    // 3. Velocity (20): reviews last 30d. 15+/mo = full marks.
    const velocityScore = clamp((v.last30 / 15) * 20, 0, 20);

    // 4. Collection (15): scans last 30d. 20+/mo = full.
    const collectionScore = clamp((scanN / 20) * 15, 0, 15);

    // 5. Engagement (15): conversion rate vs 20% target.
    const conv = p.impressions > 0 ? p.actions / p.impressions : 0;
    const engagementScore = clamp((conv / 0.20) * 15, 0, 15);

    // total — if completeness unknown (no audit row), scale the rest to 100.
    let total, basis;
    if (completenessKnown) {
      total = completeness + prominence + velocityScore + collectionScore + engagementScore;
      basis = "full";
    } else {
      const partial = prominence + velocityScore + collectionScore + engagementScore; // out of 75
      total = (partial / 75) * 100;
      basis = "no_audit";
    }

    return {
      storeId: s.storeId,
      score: Math.round(total),
      basis,
      components: {
        completeness: Math.round(completeness), completenessMax: 25, completenessKnown,
        prominence: Math.round(prominence), prominenceMax: 25,
        velocity: Math.round(velocityScore), velocityMax: 20, reviews30: v.last30,
        collection: Math.round(collectionScore), collectionMax: 15, scans30: scanN,
        engagement: Math.round(engagementScore), engagementMax: 15, convPct: Math.round(conv * 1000) / 10,
      },
      rating: s.avg || 0, reviews: s.n || 0,
    };
  }).sort((a, b) => b.score - a.score);

  return {
    rows,
    // gaps we transparently can't score yet:
    unmeasured: ["Photo count & recency", "Post frequency per store", "Primary category accuracy", "NAP consistency across web"],
  };
}
// ===== end GBP_SEO_V1 =====
// ===== end GBP_INSIGHTS_V1 =====

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
    kind: r.component_kind, ingredientId: r.ingredient_id, prepId2: r.prep_id ?? (r.sub_prep_id == null ? null : Number(r.sub_prep_id)),
    subPrepId: r.sub_prep_id == null ? null : Number(r.sub_prep_id), linkedPrepId: r.prep_id, qty: r.qty, unit: r.unit, notes: r.notes,
  });
  return {
    ingredients: (ings.data || []).map(map),
    preps: (preps.data || []).map(mapPrep),
    prepComponents: (prepComps.data || []).map(r => ({
      id: r.id, prepId: r.prep_id, name: r.component_name, kind: r.component_kind,
      ingredientId: r.ingredient_id, subPrepId: r.sub_prep_id == null ? null : Number(r.sub_prep_id), qty: r.qty, unit: r.unit,
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
  costPerBaseUnit: r.cost_per_base_unit, notes: r.notes, location: r.location || null,
  distItemId: r.dist_item_id || null,
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
  if ("location" in p) b.location = p.location || null;
  if ("allergens" in p) b.allergens = Array.isArray(p.allergens) ? p.allergens : [];
  if ("reorderPoint" in p) b.reorder_point = p.reorderPoint === "" || p.reorderPoint == null ? null : Number(p.reorderPoint);
  if ("siteId" in p) b.site_id = p.siteId || null;
  // Warehouse link (Fix: previously unsaveable from the app — SQL-only).
  if ("distItemId" in p) b.dist_item_id = p.distItemId || null;
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

// Master catalogue merged with a store's overrides. Each returned store item has
// RESOLVED fields (override ?? master) used for costing/valuation, plus the raw
// override values (overrideLocation, overrideCost, ...) so the editor knows what's
// explicitly set per store vs inherited.
export async function fetchInventoryForStore(storeId) {
  const [base, settings] = await Promise.all([
    fetchInventory(),
    storeId ? supabase.from("cogs_store_item_settings").select("*").eq("store_id", storeId)
            : Promise.resolve({ data: [] }),
  ]);
  if (settings.error) throw settings.error;
  const ovById = new Map((settings.data || []).map(s => [s.item_id, s]));
  const merged = (base.store || []).map(it => {
    const o = ovById.get(it.id);
    const resolvedCost = (o && o.cost_per_base_unit != null) ? Number(o.cost_per_base_unit) : it.costPerBaseUnit;
    return {
      ...it,
      // resolved (effective) values for this store
      location:        (o && o.location != null) ? o.location : (it.location || null),
      costPerBaseUnit: resolvedCost,
      packDesc:        (o && o.pack_desc != null) ? o.pack_desc : it.packDesc,
      packQty:         (o && o.pack_qty  != null) ? o.pack_qty  : it.packQty,
      packPrice:       (o && o.pack_price!= null) ? o.pack_price: it.packPrice,
      supplier:        (o && o.supplier  != null) ? o.supplier  : it.supplier,
      // master defaults (for "inherited" display)
      masterCost: it.costPerBaseUnit, masterLocation: it.location || null,
      masterPackDesc: it.packDesc, masterPackQty: it.packQty, masterPackPrice: it.packPrice, masterSupplier: it.supplier,
      // raw overrides (null = inheriting master)
      overrideLocation:  o ? o.location : null,
      overrideCost:      o ? o.cost_per_base_unit : null,
      overridePackDesc:  o ? o.pack_desc : null,
      overridePackQty:   o ? o.pack_qty : null,
      overridePackPrice: o ? o.pack_price : null,
      overrideSupplier:  o ? o.supplier : null,
    };
  });
  return { store: merged, ck: base.ck, categories: base.categories };
}

// Set/clear a single override field for (store,item). Passing null clears that field.
// camelCase field -> column
const _OVCOL = { location:"location", costPerBaseUnit:"cost_per_base_unit", packDesc:"pack_desc", packQty:"pack_qty", packPrice:"pack_price", supplier:"supplier" };
export async function setStoreItemOverride(storeId, itemId, patch) {
  if (!storeId || !itemId) throw new Error("store and item required");
  const body = {};
  Object.entries(patch).forEach(([k, v]) => {
    if (!(k in _OVCOL)) return;
    const num = ["costPerBaseUnit","packQty","packPrice"].includes(k);
    body[_OVCOL[k]] = (v === "" || v == null) ? null : (num ? Number(v) : v);
  });
  body.updated_at = new Date().toISOString();
  const { data: existing } = await supabase.from("cogs_store_item_settings")
    .select("id").eq("store_id", storeId).eq("item_id", itemId).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("cogs_store_item_settings").update(body).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("cogs_store_item_settings")
      .insert({ store_id: storeId, item_id: itemId, ...body });
    if (error) throw error;
  }
}

export async function clearStoreItemOverride(storeId, itemId) {
  const { error } = await supabase.from("cogs_store_item_settings")
    .delete().eq("store_id", storeId).eq("item_id", itemId);
  if (error) throw error;
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
    prepComponents: (prepComps.data||[]).map(c => ({ id:c.id, prepId:c.prep_id, kind:c.component_kind||"ingredient", subPrepId:c.sub_prep_id == null ? null : Number(c.sub_prep_id), ingredientId:c.ingredient_id, componentName:c.component_name, itemScope:c.item_scope, itemId:c.item_id, itemName:c.item_name, portionQty:c.portion_qty, unit:c.unit })),
    modifiers: (mods.data||[]).map(m => ({ id:m.id, name:m.name, groupLabel:m.group_label, itemScope:m.item_scope, itemId:m.item_id, itemName:m.item_name, portionQty:m.portion_qty, unit:m.unit, sourceType:m.source_type||"item", prepId:m.prep_id, prepPortion:m.prep_portion, isGlobal:m.is_global||false, tillCaption:m.till_caption, collapseToMax:m.collapse_to_max||false })),
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
  // kind defaults to "ingredient". For a nested prep, pass kind:"prep" + subPrepId.
  const row = { prep_id: prepId, component_kind: c.kind || "ingredient",
    item_scope: c.itemScope ?? null, item_id: c.itemId ?? null, item_name: c.itemName ?? null,
    ingredient_id: c.ingredientId ?? null, sub_prep_id: c.subPrepId ?? null,
    portion_qty: c.portionQty ?? null, unit: c.unit ?? null,
    component_name: c.componentName ?? c.itemName ?? null };
  const { error } = await supabase.from("cogs_prep_components").insert(row);
  if (error) throw error;
}
export async function updatePrepComponent(id, c) {
  const b = {}; if ("portionQty" in c) b.portion_qty = c.portionQty===""?null:Number(c.portionQty); if ("unit" in c) b.unit = c.unit;
  if ("itemScope" in c) b.item_scope = c.itemScope; if ("itemId" in c) b.item_id = c.itemId; if ("itemName" in c) b.item_name = c.itemName;
  if ("kind" in c) b.component_kind = c.kind; if ("subPrepId" in c) b.sub_prep_id = c.subPrepId; if ("ingredientId" in c) b.ingredient_id = c.ingredientId;
  if ("componentName" in c) b.component_name = c.componentName;
  const { error } = await supabase.from("cogs_prep_components").update(b).eq("id", id); if (error) throw error;
}
export async function deletePrepComponent(id) { const { error } = await supabase.from("cogs_prep_components").delete().eq("id", id); if (error) throw error; }

// --- modifiers ---
export async function addModifier(patch) {
  const { error } = await supabase.from("cogs_modifiers").insert({ name: patch.name || "New modifier", group_label: patch.groupLabel, item_scope: patch.itemScope, item_id: patch.itemId, item_name: patch.itemName, portion_qty: patch.portionQty ?? null, unit: patch.unit });
  if (error) throw error;
}
export async function updateModifier(id, patch) {
  const b = {}; ["name","groupLabel","itemScope","itemId","itemName","unit","sourceType"].forEach(k => { if (k in patch) b[{name:"name",groupLabel:"group_label",itemScope:"item_scope",itemId:"item_id",itemName:"item_name",unit:"unit",sourceType:"source_type"}[k]] = patch[k]; });
  if ("portionQty" in patch) b.portion_qty = patch.portionQty===""?null:Number(patch.portionQty);
  if ("prepId" in patch) b.prep_id = patch.prepId===""||patch.prepId==null?null:Number(patch.prepId);
  if ("prepPortion" in patch) b.prep_portion = patch.prepPortion===""||patch.prepPortion==null?null:Number(patch.prepPortion);
  if ("isGlobal" in patch) b.is_global = !!patch.isGlobal;
  if ("collapseToMax" in patch) b.collapse_to_max = !!patch.collapseToMax;
  if ("tillCaption" in patch) b.till_caption = patch.tillCaption || null;
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

// Copy ALL pos→product mappings from a source store to a target store. Used when
// stores share a menu variation — map one store, then clone to its like-for-like
// siblings instead of mapping each by hand. Overwrites the target: any till name
// the source maps is set on the target to the same product; the target's own
// existing rows for those names are replaced. Returns the count copied.
export async function copyPosMappings(fromStoreId, toStoreId) {
  if (!fromStoreId || !toStoreId || fromStoreId === toStoreId) throw new Error("Pick two different stores.");
  const { data: src, error: srcErr } = await supabase
    .from("cogs_pos_mappings").select("pos_name, product_id").eq("store_id", fromStoreId);
  if (srcErr) throw srcErr;
  const rows = (src || []).filter(r => r.pos_name && r.product_id);
  if (rows.length === 0) return 0;
  // Wipe the target's existing rows for the names we're about to set, then insert
  // fresh — simplest way to "overwrite to match source" without N upserts.
  const names = rows.map(r => r.pos_name);
  const { error: delErr } = await supabase
    .from("cogs_pos_mappings").delete().eq("store_id", toStoreId).in("pos_name", names);
  if (delErr) throw delErr;
  const insert = rows.map(r => ({ store_id: toStoreId, pos_name: r.pos_name, product_id: r.product_id }));
  const BATCH = 200;
  for (let i = 0; i < insert.length; i += BATCH) {
    const { error: insErr } = await supabase.from("cogs_pos_mappings").insert(insert.slice(i, i + BATCH));
    if (insErr) throw insErr;
  }
  return rows.length;
}
// ===== end POS_MAPPER_V1 =====

// ===== MODIFIER_DISCOVERY_V1 — find uncosted modifier selections in sales ====
// Reads flipdish_sales.sale_items for a store/period, extracts nested option
// captions (the chosen modifiers), and ranks those with NO matching modifier
// yet. Heuristic: 'no ...' = exclusion (skip); >=5 distinct parents = global
// add-on; else product-scoped. Human overrides in the UI.
const _normCap = (s) => (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ").replace(/\.+$/, "");

export async function discoverModifierCandidates({ storeId, from, to } = {}) {
  if (!storeId) throw new Error("storeId required");
  const fromD = from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const toD   = to   || new Date().toISOString().slice(0, 10);
  const [sales, mods] = await Promise.all([
    (async () => {
      const PAGE = 1000, MAX_PAGES = 200;
      let all = [], pageStart = 0;
      for (let p = 0; p < MAX_PAGES; p++) {
        const { data, error } = await supabase.from("flipdish_sales")
          .select("sale_items, is_cancelled")
          .eq("store_id", storeId).gte("business_date", fromD).lte("business_date", toD)
          .order("sale_id", { ascending: true })
          .range(pageStart, pageStart + PAGE - 1);
        if (error) throw error;
        const batch = data || [];
        all = all.concat(batch);
        if (batch.length < PAGE) break;
        pageStart += PAGE;
      }
      return all;
    })(),
    (async () => {
      const { data, error } = await supabase.from("cogs_modifiers").select("name, till_caption");
      if (error) throw error; return data || [];
    })(),
  ]);
  // captions already covered by a modifier (by till_caption or name)
  const covered = new Set();
  mods.forEach(m => { covered.add(_normCap(m.till_caption || m.name)); if (m.name) covered.add(_normCap(m.name)); });

  const agg = new Map(); // child_norm -> { example, occ, parents:Set, maxPrice }
  sales.forEach(s => {
    if (s.is_cancelled) return;
    const items = Array.isArray(s.sale_items) ? s.sale_items : [];
    items.forEach(li => {
      if (li && li.isRefunded) return;
      const parentNorm = _normCap(li && li.caption);
      const kids = Array.isArray(li && li.saleItems) ? li.saleItems : [];
      kids.forEach(ch => {
        const raw = ch && ch.caption; const norm = _normCap(raw);
        if (!norm || norm === "none") return;
        let e = agg.get(norm);
        if (!e) { e = { example: raw, occ: 0, parents: new Set(), maxPrice: 0 }; agg.set(norm, e); }
        e.occ += 1; if (parentNorm) e.parents.add(parentNorm);
        const p = Number(ch && ch.unitPrice) || 0; if (p > e.maxPrice) e.maxPrice = p;
      });
    });
  });

  const sizes = new Set(["regular","small","medium","large","half","full","single","double"]);
  const out = [];
  agg.forEach((e, norm) => {
    if (covered.has(norm)) return;
    const parents = e.parents.size;
    let suggestion;
    if (norm.startsWith("no ")) suggestion = "skip";
    else if (sizes.has(norm)) suggestion = "review";
    else if (parents >= 5) suggestion = "global";
    else suggestion = "scoped";
    out.push({ caption: e.example, captionNorm: norm, occurrences: e.occ,
      distinctParents: parents, maxPrice: +e.maxPrice.toFixed(2),
      suggestGlobal: parents >= 5, suggestion });
  });
  out.sort((a, b) => b.occurrences - a.occurrences);
  return out;
}

// Create a modifier from a discovered caption. isGlobal sets the scope flag;
// till_caption stores the exact caption for clean matching (no stripping).
export async function createModifierFromCaption({ caption, isGlobal, groupLabel = null }) {
  if (!caption || !caption.trim()) throw new Error("caption required");
  const { error } = await supabase.from("cogs_modifiers").insert({
    name: caption.trim(),
    group_label: groupLabel,
    till_caption: caption.trim(),
    is_global: !!isGlobal,
    source_type: "item",
  });
  if (error) throw error;
}
// ===== end MODIFIER_DISCOVERY_V1 =====

// ===== MODIFIER_MAPPER_V1 — per-store till caption -> modifier =============
export async function fetchModifierMappings(storeId) {
  let q = supabase.from("cogs_modifier_mappings").select("*");
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q; if (error) throw error;
  return (data || []).map(r => ({ id: r.id, storeId: r.store_id, caption: r.caption, modifierId: r.modifier_id }));
}

export async function setModifierMapping(storeId, caption, modifierId) {
  if (!storeId || !caption?.trim()) throw new Error("store and caption required");
  const c = caption.trim();
  const { data: existing } = await supabase.from("cogs_modifier_mappings")
    .select("id").eq("store_id", storeId).ilike("caption", c).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("cogs_modifier_mappings").update({ modifier_id: modifierId }).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("cogs_modifier_mappings").insert({ store_id: storeId, caption: c, modifier_id: modifierId });
    if (error) throw error;
  }
}

export async function deleteModifierMapping(id) {
  const { error } = await supabase.from("cogs_modifier_mappings").delete().eq("id", id);
  if (error) throw error;
}

// All distinct modifier captions sold at a store/period, each with: occurrences,
// whether it already matches a modifier (auto by caption or via explicit mapping),
// and the mapped modifier if any. Mirrors the menu mapper's "show all" behaviour.
export async function fetchModifierCaptions({ storeId, from, to } = {}) {
  if (!storeId) throw new Error("storeId required");
  const fromD = from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const toD   = to   || new Date().toISOString().slice(0, 10);
  const norm = (s) => (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ").replace(/\.+$/, "");
  const [salesPages, mods, maps] = await Promise.all([
    (async () => {
      const PAGE = 1000, MAX = 200; let all = [], st = 0;
      for (let p = 0; p < MAX; p++) {
        const { data, error } = await supabase.from("flipdish_sales")
          .select("sale_items, is_cancelled")
          .eq("store_id", storeId).gte("business_date", fromD).lte("business_date", toD)
          .order("sale_id", { ascending: true }).range(st, st + PAGE - 1);
        if (error) throw error;
        const b = data || []; all = all.concat(b); if (b.length < PAGE) break; st += PAGE;
      }
      return all;
    })(),
    (async () => { const { data, error } = await supabase.from("cogs_modifiers").select("id, name, till_caption, is_global"); if (error) throw error; return data || []; })(),
    fetchModifierMappings(storeId),
  ]);

  // auto-match set (global/by-caption) + mapping lookup
  const autoCaps = new Set();
  mods.forEach(m => { autoCaps.add(norm(m.till_caption || m.name)); if (m.name) autoCaps.add(norm(m.name)); });
  const mapByCap = new Map(); maps.forEach(mm => mapByCap.set(norm(mm.caption), mm));
  const modNameById = new Map(mods.map(m => [m.id, m.name]));

  const agg = new Map();
  (salesPages || []).forEach(s => {
    if (s.is_cancelled) return;
    const items = Array.isArray(s.sale_items) ? s.sale_items : [];
    items.forEach(li => {
      if (li && li.isRefunded) return;
      const kids = Array.isArray(li && li.saleItems) ? li.saleItems : [];
      kids.forEach(ch => {
        const raw = ch && ch.caption; const n = norm(raw);
        if (!n || n === "none") return;
        let e = agg.get(n); if (!e) { e = { example: raw, occ: 0 }; agg.set(n, e); }
        e.occ += 1;
      });
    });
  });

  const out = [];
  agg.forEach((e, n) => {
    const mapping = mapByCap.get(n);
    const auto = autoCaps.has(n);
    out.push({
      caption: e.example, captionNorm: n, occurrences: e.occ,
      autoMatched: auto,
      mappingId: mapping ? mapping.id : null,
      mappedModifierId: mapping ? mapping.modifierId : null,
      mappedModifierName: mapping ? (modNameById.get(mapping.modifierId) || "—") : null,
      status: mapping ? "mapped" : (auto ? "auto" : "unmatched"),
    });
  });
  out.sort((a, b) => b.occurrences - a.occurrences);
  return out;
}
// ===== end MODIFIER_MAPPER_V1 =====

// ===== ACTUAL_COGS_V1 — stock counts, purchases, variance =================
export async function fetchStockCounts(storeId) {
  let q = supabase.from("cogs_stock_counts").select("*").order("count_date", { ascending: false });
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q; if (error) throw error;
  return (data || []).map(r => ({ id: r.id, storeId: r.store_id, countDate: r.count_date, status: r.status, countedBy: r.counted_by, note: r.note }));
}

export async function fetchStockCount(countId) {
  const [{ data: head, error: e1 }, { data: lines, error: e2 }] = await Promise.all([
    supabase.from("cogs_stock_counts").select("*").eq("id", countId).maybeSingle(),
    supabase.from("cogs_stock_count_lines").select("*").eq("count_id", countId),
  ]);
  if (e1) throw e1; if (e2) throw e2;
  return {
    head: head ? { id: head.id, storeId: head.store_id, countDate: head.count_date, status: head.status, countedBy: head.counted_by, note: head.note } : null,
    lines: (lines || []).map(l => ({ id: l.id, itemScope: l.item_scope, itemId: l.item_id, qty: l.qty, costPerUnit: l.cost_per_unit })),
  };
}

export async function createStockCount(storeId, countDate, countedBy) {
  const { data, error } = await supabase.from("cogs_stock_counts")
    .insert({ store_id: storeId, count_date: countDate, counted_by: countedBy || null })
    .select("id").single();
  if (error) throw error; return data.id;
}

// ── SPLIT COUNTS: section assignments ────────────────────────────────────────
// Managers partition a count into sections (by location/category) and assign
// them to staff; staff see only their sections. All ids stored as text.

export async function fetchCountAssignments(countId) {
  const { data, error } = await supabase.from("cogs_count_assignments")
    .select("*").eq("count_id", String(countId)).order("section");
  if (error) throw error;
  return (data || []).map(a => ({
    id: a.id, countId: a.count_id, groupBy: a.group_by || "location", section: a.section,
    userId: a.assignee_user_id || null, userName: a.assignee_name || "",
    status: a.status || "open", completedAt: a.completed_at || null,
  }));
}

// Replace-all save: the manager's assignment modal writes the full picture.
export async function saveCountAssignments(countId, groupBy, rows) {
  await supabase.from("cogs_count_assignments").delete().eq("count_id", String(countId));
  const ins = (rows || []).filter(r => r.section && r.userId).map(r => ({
    count_id: String(countId), group_by: groupBy || "location", section: r.section,
    assignee_user_id: r.userId, assignee_name: r.userName || "",
  }));
  if (ins.length) {
    const { error } = await supabase.from("cogs_count_assignments").insert(ins);
    if (error) throw error;
  }
  return true;
}

export async function setCountAssignmentStatus(assignmentId, done) {
  const { error } = await supabase.from("cogs_count_assignments").update({
    status: done ? "done" : "open", completed_at: done ? new Date().toISOString() : null,
  }).eq("id", assignmentId);
  if (error) throw error;
  return true;
}

// ── ORDER ROUNDS: team-filled shared order draft ─────────────────────────────
// Manager starts a round + assigns categories; staff enter needed quantities
// for their sections only; manager compiles into one sales order.

export async function fetchOpenOrderRound(storeId) {
  const { data: head } = await supabase.from("dist_order_rounds")
    .select("*").eq("store_id", storeId).eq("status", "open")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!head) return null;
  const [{ data: asg }, { data: lines }] = await Promise.all([
    supabase.from("dist_order_round_assignments").select("*").eq("round_id", head.id).order("section"),
    supabase.from("dist_order_round_lines").select("*").eq("round_id", head.id),
  ]);
  return {
    id: head.id, storeId: head.store_id, status: head.status, note: head.note || "",
    createdBy: head.created_by || null, createdByName: head.created_by_name || "",
    createdAt: head.created_at,
    assignments: (asg || []).map(a => ({
      id: a.id, section: a.section, groupBy: a.group_by || "category",
      userId: a.assignee_user_id || null,
      userName: a.assignee_name || "", status: a.status || "open",
    })),
    lines: (lines || []).map(l => ({
      id: l.id, itemId: l.item_id, qty: Number(l.qty) || 0,
      requestedBy: l.requested_by || null, requestedByName: l.requested_by_name || "",
    })),
  };
}

export async function createOrderRound(storeId, user) {
  const { data, error } = await supabase.from("dist_order_rounds")
    .insert({ store_id: storeId, status: "open", created_by: user?.id || null, created_by_name: user?.name || null })
    .select("id").single();
  if (error) throw error;
  return data.id;
}

export async function saveOrderRoundAssignments(roundId, rows, groupBy = "category") {
  await supabase.from("dist_order_round_assignments").delete().eq("round_id", roundId);
  const ins = (rows || []).filter(r => r.section && r.userId).map(r => ({
    round_id: roundId, section: r.section, group_by: groupBy,
    assignee_user_id: r.userId, assignee_name: r.userName || "",
  }));
  if (ins.length) {
    const { error } = await supabase.from("dist_order_round_assignments").insert(ins);
    if (error) throw error;
  }
  return true;
}

// One line per (round, item, user): each person's request is kept separate so
// the compiled view can show who asked for what; the manager's order sums them.
export async function setOrderRoundLine(roundId, itemId, qty, user) {
  const q = Number(qty) || 0;
  if (q <= 0) {
    await supabase.from("dist_order_round_lines").delete()
      .eq("round_id", roundId).eq("item_id", itemId).eq("requested_by", user?.id || "");
    return true;
  }
  const { error } = await supabase.from("dist_order_round_lines").upsert({
    round_id: roundId, item_id: itemId, qty: q,
    requested_by: user?.id || "", requested_by_name: user?.name || "",
    updated_at: new Date().toISOString(),
  }, { onConflict: "round_id,item_id,requested_by" });
  if (error) throw error;
  return true;
}

export async function setOrderRoundPartStatus(assignmentId, done) {
  const { error } = await supabase.from("dist_order_round_assignments").update({
    status: done ? "done" : "open", completed_at: done ? new Date().toISOString() : null,
  }).eq("id", assignmentId);
  if (error) throw error;
  return true;
}

export async function closeOrderRound(roundId, { status = "placed", soId = null } = {}) {
  const { error } = await supabase.from("dist_order_rounds").update({
    status, placed_so_id: soId,
  }).eq("id", roundId);
  if (error) throw error;
  return true;
}

export async function setStockCountLine(countId, itemScope, itemId, qty, costPerUnit) {
  const { data: existing } = await supabase.from("cogs_stock_count_lines")
    .select("id").eq("count_id", countId).eq("item_scope", itemScope).eq("item_id", itemId).maybeSingle();
  const payload = { count_id: countId, item_scope: itemScope, item_id: itemId,
    qty: qty === "" || qty == null ? null : Number(qty), cost_per_unit: costPerUnit == null ? null : Number(costPerUnit) };
  if (existing) {
    const { error } = await supabase.from("cogs_stock_count_lines").update(payload).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("cogs_stock_count_lines").insert(payload);
    if (error) throw error;
  }
}

export async function finaliseStockCount(countId, status = "finalised") {
  // Mark the count finalised.
  const { error } = await supabase.from("cogs_stock_counts").update({ status }).eq("id", countId);
  if (error) throw error;

  if (status !== "finalised") return;

  // ─── STORE-SCOPE reconciliation + variance (Phase 5) ──────────────────────
  // For store-scoped count lines: capture expected (current running store_stock)
  // vs counted, write a count_adjust movement so the running qty resets to the
  // counted truth, and store the variance on the count line. STORE ONLY — the CK
  // block below handles ck lines separately and is untouched.
  try {
    const { data: sHead } = await supabase.from("cogs_stock_counts").select("store_id").eq("id", countId).maybeSingle();
    const storeId = sHead?.store_id || null;
    const { data: allLines } = await supabase.from("cogs_stock_count_lines")
      .select("id, item_scope, item_id, qty").eq("count_id", countId);
    const storeLines = (allLines || []).filter(l => l.item_scope === "store" && l.item_id != null && l.qty != null);
    if (storeId && storeLines.length) {
      for (const l of storeLines) {
        const itemId = String(l.item_id);
        const counted = Number(l.qty) || 0;
        // Expected = current running qty (deliveries − sales since last reconcile).
        const { data: ss } = await supabase.from("store_stock")
          .select("id, qty_on_hand").eq("store_id", storeId).eq("item_id", itemId).maybeSingle();
        const expected = ss ? Number(ss.qty_on_hand) : 0;
        const variance = counted - expected;              // + = surplus, − = short
        // Write a count_adjust movement to bring running qty to the counted truth.
        if (variance !== 0 || !ss) {
          await supabase.from("store_stock_movements").insert({
            store_id: storeId, item_id: itemId, qty: variance, type: "count_adjust",
            ref: `count:${countId}`, note: `Count ${countId}: counted ${counted}, expected ${expected}`,
          });
        }
        if (ss) {
          await supabase.from("store_stock").update({ qty_on_hand: counted, updated_at: new Date().toISOString() }).eq("id", ss.id);
        } else {
          await supabase.from("store_stock").insert({ store_id: storeId, item_id: itemId, qty_on_hand: counted });
        }
      }
    }
  } catch (e) {
    console.error("Store count reconciliation failed:", e.message);
  }

  // Count = truth: reconcile CK ingredient stock to the counted quantities so the
  // Planner / production see real stock. Only for CK-scoped ingredient lines.
  try {
    const { data: head } = await supabase.from("cogs_stock_counts").select("store_id, count_date").eq("id", countId).maybeSingle();
    const { data: lines } = await supabase.from("cogs_stock_count_lines").select("item_scope, item_id, qty, cost_per_unit").eq("count_id", countId);
    const ckLines = (lines || []).filter(l => (l.item_scope === "ck" || l.item_scope == null) && l.item_id != null && l.qty != null);
    if (!ckLines.length) return;

    // The Planner reads CK goods-in filtered by the real central-kitchen site id,
    // NOT the count's store_id (which is the logical "kitchen"). Resolve it so the
    // reconciled stock is visible to production/planner.
    const { data: ckSite } = await supabase.from("stores").select("id").eq("site_type", "central_kitchen").is("archived_at", null).limit(1).maybeSingle();
    const siteId = ckSite?.id || null;
    const countDate = head?.count_date || new Date().toISOString().slice(0,10);
    // Pull each counted ingredient's base_unit so the stock row carries the right unit.
    const ids = [...new Set(ckLines.map(l => String(l.item_id)))];
    const { data: items } = await supabase.from("cogs_ck_items").select("id, base_unit").in("id", ids);
    const unitById = {}; (items || []).forEach(i => { unitById[String(i.id)] = i.base_unit || "kg"; });

    for (const l of ckLines) {
      const ingId = String(l.item_id);
      const countedQty = Number(l.qty) || 0;
      // Zero out existing remaining for this ingredient (count overwrites).
      await supabase.from("ck_goods_in").update({ qty_remaining: 0 }).eq("ingredient_id", ingId).gt("qty_remaining", 0);
      // Insert a single reconciliation batch = counted qty (skip zero counts).
      if (countedQty > 0) {
        await supabase.from("ck_goods_in").insert({
          id: `gin-cnt-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
          site_id: siteId, ingredient_id: ingId,
          qty_received: countedQty, qty_remaining: countedQty,
          unit: unitById[ingId] || "kg",
          batch_no: `COUNT-${countDate}`, supplier: "Stock count",
          received_date: countDate, expiry_date: null,
          unit_cost: l.cost_per_unit != null ? Number(l.cost_per_unit) : null,
          total_cost: null, invoice_ref: null,
          received_by: null, note: `Set by finalised stock count ${countId}`,
        });
      }
    }
  } catch (e) {
    // Don't fail the finalise if reconciliation hits an issue; surface for debugging.
    console.error("Count→stock reconciliation failed:", e);
  }
}


// Per-item quantity variance for a finalised store count (Phase 5).
// Returns each store line: counted vs expected (from the count_adjust movement
// recorded at finalise), plus the variance qty/%. Worst (most negative) first.
export async function fetchStoreCountVariance(countId) {
  const { data: head } = await supabase.from("cogs_stock_counts")
    .select("id, store_id, count_date, status").eq("id", countId).maybeSingle();
  if (!head) return { head: null, rows: [] };
  const [{ data: lines }, { data: moves }, { data: items }] = await Promise.all([
    supabase.from("cogs_stock_count_lines").select("item_scope, item_id, qty").eq("count_id", countId),
    supabase.from("store_stock_movements").select("item_id, qty, note").eq("ref", `count:${countId}`).eq("type", "count_adjust"),
    supabase.from("cogs_store_items").select("id, name, base_unit"),
  ]);
  const nameById = new Map((items || []).map(i => [String(i.id), i.name]));
  const unitById = new Map((items || []).map(i => [String(i.id), i.base_unit]));
  // variance qty came from the count_adjust movement (counted − expected)
  const adjById = new Map((moves || []).map(m => [String(m.item_id), Number(m.qty)]));
  const rows = (lines || [])
    .filter(l => l.item_scope === "store" && l.item_id != null)
    .map(l => {
      const id = String(l.item_id);
      const counted = Number(l.qty) || 0;
      const variance = adjById.has(id) ? adjById.get(id) : null;   // counted − expected
      const expected = variance != null ? counted - variance : null;
      const variancePct = (expected && expected !== 0 && variance != null) ? (variance / expected) * 100 : null;
      return { itemId: id, name: nameById.get(id) || id, unit: unitById.get(id) || "",
               counted, expected, variance, variancePct };
    })
    .sort((a, b) => (a.variance ?? 0) - (b.variance ?? 0));   // most short first
  return { head: { id: head.id, storeId: head.store_id, countDate: head.count_date, status: head.status }, rows };
}

export async function deleteStockCount(countId) {
  const { error } = await supabase.from("cogs_stock_counts").delete().eq("id", countId);
  if (error) throw error;
}

export async function fetchPurchases({ storeId, from, to } = {}) {
  let q = supabase.from("cogs_purchases").select("*").order("purchase_date", { ascending: false });
  if (storeId) q = q.eq("store_id", storeId);
  if (from) q = q.gte("purchase_date", from);
  if (to)   q = q.lte("purchase_date", to);
  const { data, error } = await q; if (error) throw error;
  return (data || []).map(r => ({ id: r.id, storeId: r.store_id, purchaseDate: r.purchase_date,
    itemScope: r.item_scope, itemId: r.item_id, qty: r.qty, totalCost: r.total_cost, supplier: r.supplier, invoiceRef: r.invoice_ref, note: r.note }));
}

export async function addPurchase(p) {
  const { error } = await supabase.from("cogs_purchases").insert({
    store_id: p.storeId, purchase_date: p.purchaseDate, item_scope: p.itemScope || "store", item_id: p.itemId,
    qty: p.qty == null || p.qty === "" ? null : Number(p.qty),
    total_cost: p.totalCost == null || p.totalCost === "" ? null : Number(p.totalCost),
    supplier: p.supplier || null, invoice_ref: p.invoiceRef || null, note: p.note || null,
  });
  if (error) throw error;
}

export async function deletePurchase(id) {
  const { error } = await supabase.from("cogs_purchases").delete().eq("id", id);
  if (error) throw error;
}

// Value a stock count = Σ(qty × cost_per_unit). Falls back to current inventory
// cost if the line has no snapshot cost.
function valueCountLines(lines, invCostByKey) {
  let total = 0;
  (lines || []).forEach(l => {
    const cpu = l.costPerUnit != null ? Number(l.costPerUnit) : (invCostByKey.get(l.itemScope + ":" + l.itemId) ?? null);
    if (cpu != null && l.qty != null) total += cpu * Number(l.qty);
  });
  return total;
}

// Actual COGS for a store over [openCount -> closeCount]:
//   opening stock value + purchases(open..close] − closing stock value
// Returns actual cogs, the two stock values, purchases total, and per-item rows.
export async function computeActualCogs({ storeId, openCountId, closeCountId } = {}) {
  if (!storeId || !openCountId || !closeCountId) throw new Error("storeId, openCountId, closeCountId required");
  const [openC, closeC, inv] = await Promise.all([
    fetchStockCount(openCountId), fetchStockCount(closeCountId), fetchInventoryForStore(storeId),
  ]);
  if (!openC.head || !closeC.head) throw new Error("count not found");
  const invCostByKey = new Map();
  (inv.store || []).forEach(x => invCostByKey.set("store:" + x.id, x.costPerBaseUnit != null ? Number(x.costPerBaseUnit) : null));
  (inv.ck || []).forEach(x => invCostByKey.set("ck:" + x.id, x.costPerBaseUnit != null ? Number(x.costPerBaseUnit) : null));
  const nameByKey = new Map();
  (inv.store || []).forEach(x => nameByKey.set("store:" + x.id, x.name));
  (inv.ck || []).forEach(x => nameByKey.set("ck:" + x.id, x.name));

  const from = openC.head.countDate, to = closeC.head.countDate;
  const purch = await fetchPurchases({ storeId, from, to });
  // exclude purchases dated exactly on the opening date? Keep (open, close] convention:
  const purchUsed = purch.filter(p => p.purchaseDate > from && p.purchaseDate <= to);

  const openValue  = valueCountLines(openC.lines, invCostByKey);
  const closeValue = valueCountLines(closeC.lines, invCostByKey);
  const purchTotal = purchUsed.reduce((a, p) => a + (Number(p.totalCost) || 0), 0);
  const actualCogs = openValue + purchTotal - closeValue;

  // per-item: opening qty/value, purchased qty/cost, closing qty/value, implied used
  const keyset = new Set();
  const openByKey = new Map(), closeByKey = new Map(), purchByKey = new Map();
  openC.lines.forEach(l => { const k=l.itemScope+":"+l.itemId; openByKey.set(k,l); keyset.add(k); });
  closeC.lines.forEach(l => { const k=l.itemScope+":"+l.itemId; closeByKey.set(k,l); keyset.add(k); });
  purchUsed.forEach(p => { const k=p.itemScope+":"+p.itemId; const e=purchByKey.get(k)||{qty:0,cost:0}; e.qty+=Number(p.qty)||0; e.cost+=Number(p.totalCost)||0; purchByKey.set(k,e); keyset.add(k); });

  const byItem = [];
  keyset.forEach(k => {
    const cpu = invCostByKey.get(k);
    const o = openByKey.get(k), c = closeByKey.get(k), pu = purchByKey.get(k) || { qty:0, cost:0 };
    const openQty = o?.qty != null ? Number(o.qty) : 0;
    const closeQty = c?.qty != null ? Number(c.qty) : 0;
    const usedQty = openQty + pu.qty - closeQty;
    const lineCogs = (o?.costPerUnit ?? cpu ?? 0) * openQty + pu.cost - (c?.costPerUnit ?? cpu ?? 0) * closeQty;
    byItem.push({ key: k, name: nameByKey.get(k) || k, openQty, purchasedQty: pu.qty, closeQty, usedQty,
      costPerUnit: cpu, actualCost: lineCogs });
  });
  byItem.sort((a, b) => b.actualCost - a.actualCost);

  return { storeId, from, to, openValue, closeValue, purchTotal, actualCogs, byItem };
}
// ===== end ACTUAL_COGS_V1 =====

// ===== INVOICE_PRICE_SYNC_V1 ==============================================
// Search the LIVE inventory (cogs_store_items) for invoice line matching.
export async function searchStoreInventory(q, limit = 12) {
  let query = supabase.from("cogs_store_items").select("id, name").order("name").limit(limit);
  if (q && q.trim()) query = query.ilike("name", `%${q.trim()}%`);
  const { data, error } = await query; if (error) throw error;
  return data || [];
}

// Detect price changes from an approved invoice. For each line matched to a
// store item with a usable unit price, compare to the item's current per-store
// cost and, if it differs beyond threshold, post a 'pending' row to the queue.
// storeId comes from invoice.entity. Returns number of changes queued.
export async function detectInvoicePriceChanges(invoiceId, { thresholdPct = 1 } = {}) {
  const { data: inv, error: e0 } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();
  if (e0) throw e0;
  const storeId = inv.entity;
  if (!storeId || storeId === "kitchen") return 0; // only store invoices update store overlay
  const { data: lines, error: e1 } = await supabase.from("invoice_lines")
    .select("*").eq("invoice_id", invoiceId);
  if (e1) throw e1;

  // current resolved per-store costs
  const invForStore = await fetchInventoryForStore(storeId);
  const costByItem = new Map(invForStore.store.map(i => [i.id, i.costPerBaseUnit]));

  let queued = 0;
  for (const ln of (lines || [])) {
    const itemId = ln.matched_store_item_id;
    if (!itemId) continue;
    const qtyBase = Number(ln.pack_qty_base);
    const priceEx = Number(ln.pack_price_ex_vat);
    if (!(qtyBase > 0) || !(priceEx >= 0)) continue;
    const newCost = priceEx / qtyBase;                 // per-base-unit from invoice
    const oldCost = costByItem.get(itemId);
    const pct = (oldCost != null && oldCost > 0) ? ((newCost - oldCost) / oldCost) * 100 : null;
    // skip if effectively unchanged
    if (oldCost != null && Math.abs(pct) < thresholdPct) continue;
    // avoid duplicate pending row for same invoice+item
    const { data: dup } = await supabase.from("cogs_price_changes")
      .select("id").eq("invoice_id", invoiceId).eq("item_id", itemId).eq("status", "pending").maybeSingle();
    if (dup) continue;
    const { error } = await supabase.from("cogs_price_changes").insert({
      store_id: storeId, item_id: itemId, old_cost: oldCost ?? null, new_cost: newCost,
      pct_change: pct, invoice_id: invoiceId, invoice_ref: inv.invoice_number || inv.reference || null,
      supplier: inv.supplier || inv.supplier_name || null,
    });
    if (error) throw error; queued++;
  }
  return queued;
}

export async function fetchPriceChanges(status = "pending") {
  let q = supabase.from("cogs_price_changes").select("*").order("detected_at", { ascending: false });
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await q; if (error) throw error;
  return (data || []).map(r => ({ id: r.id, storeId: r.store_id, itemId: r.item_id, oldCost: r.old_cost,
    newCost: r.new_cost, pctChange: r.pct_change, invoiceId: r.invoice_id, invoiceRef: r.invoice_ref,
    supplier: r.supplier, detectedAt: r.detected_at, status: r.status }));
}

// Apply a queued change: write the new cost to the store's overlay and mark applied.
export async function applyPriceChange(id, userId) {
  const { data: pc, error } = await supabase.from("cogs_price_changes").select("*").eq("id", id).single();
  if (error) throw error;
  await setStoreItemOverride(pc.store_id, pc.item_id, { costPerBaseUnit: pc.new_cost });
  const { error: e2 } = await supabase.from("cogs_price_changes")
    .update({ status: "applied", resolved_at: new Date().toISOString(), resolved_by: userId || null }).eq("id", id);
  if (e2) throw e2;
}

export async function dismissPriceChange(id, userId) {
  const { error } = await supabase.from("cogs_price_changes")
    .update({ status: "dismissed", resolved_at: new Date().toISOString(), resolved_by: userId || null }).eq("id", id);
  if (error) throw error;
}
// ===== end INVOICE_PRICE_SYNC_V1 =====

// ============================================================================
// CENTRAL KITCHEN — Phase 1: ingredients + goods-in (batch-tracked)
// ============================================================================
const mapIngredient = (r) => ({
  id: r.id, siteId: r.site_id || null, name: r.name, category: r.category || "",
  unit: r.base_unit || "kg", allergens: r.allergens || [],
  mayContain: r.may_contain_allergens || [],
  confirmedNoAllergens: r.allergens_confirmed_none === true,
  reorderPoint: r.reorder_point != null ? Number(r.reorder_point) : null,
  defaultSupplier: r.supplier || "", note: r.notes || "",
  packDesc: r.pack_desc || "", packQty: r.pack_qty, packPrice: r.pack_price,
  location: r.location || "",
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
    may_contain_allergens: ing.mayContain || [],
    allergens_confirmed_none: ing.confirmedNoAllergens === true,
    reorder_point: ing.reorderPoint != null && ing.reorderPoint !== "" ? Number(ing.reorderPoint) : null,
    supplier: ing.defaultSupplier || null, notes: ing.note || null,
    location: ing.location || null,
    pack_desc: ing.packDesc || null,
    pack_qty: ing.packQty != null && ing.packQty !== "" ? Number(ing.packQty) : null,
    pack_price: ing.packPrice != null && ing.packPrice !== "" ? Number(ing.packPrice) : null,
    // cost_per_base_unit is a GENERATED column (DB computes pack_price/pack_qty);
    // it cannot be written, so it's intentionally omitted from this payload.
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

// Edit a goods-in line. Patch may include qtyReceived, batchNo, expiryDate,
// unitCost, supplier, receivedDate, invoiceRef, note. If qtyReceived changes we
// also adjust qty_remaining by the same delta so stock stays consistent (never
// below zero). totalCost recomputes from unitCost*qtyReceived when both known.
export async function updateCkGoodsIn(id, patch) {
  const { data: cur } = await supabase.from("ck_goods_in").select("qty_received, qty_remaining").eq("id", id).maybeSingle();
  const row = {};
  if ("batchNo" in patch)     row.batch_no = patch.batchNo || null;
  if ("expiryDate" in patch)  row.expiry_date = patch.expiryDate || null;
  if ("supplier" in patch)    row.supplier = patch.supplier || null;
  if ("receivedDate" in patch) row.received_date = patch.receivedDate || null;
  if ("invoiceRef" in patch)  row.invoice_ref = patch.invoiceRef || null;
  if ("note" in patch)        row.note = patch.note || null;
  if ("receivedBy" in patch)  row.received_by = patch.receivedBy || null;
  let newQty = null, newUnitCost = null;
  if ("qtyReceived" in patch && patch.qtyReceived !== "" && patch.qtyReceived != null) {
    newQty = Number(patch.qtyReceived);
    row.qty_received = newQty;
    if (cur) {
      const delta = newQty - Number(cur.qty_received || 0);
      row.qty_remaining = Math.max(0, Number(cur.qty_remaining || 0) + delta);
    }
  }
  if ("unitCost" in patch) {
    newUnitCost = patch.unitCost === "" || patch.unitCost == null ? null : Number(patch.unitCost);
    row.unit_cost = newUnitCost;
  }
  // recompute total cost if we have both unit cost and qty
  const effQty = newQty != null ? newQty : (cur ? Number(cur.qty_received) : null);
  if (newUnitCost != null && effQty != null) row.total_cost = +(newUnitCost * effQty).toFixed(2);
  const { error } = await supabase.from("ck_goods_in").update(row).eq("id", id);
  if (error) throw error;
  return id;
}

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
// Round-trip CSV import: update existing ingredients by (case-insensitive) name
// match, create new ones. Returns { updated, created }. Computes cost_per_base_unit
// from pack qty + price when both present.
export async function upsertCkIngredientsByName(siteId, rows) {
  const clean = (rows || []).filter(r => r.name && r.name.trim());
  if (!clean.length) return { updated: 0, created: 0 };
  const { data: existing, error: e0 } = await supabase.from("cogs_ck_items").select("id, name").is("archived_at", null);
  if (e0) throw e0;
  const byName = new Map((existing || []).map(x => [x.name.trim().toLowerCase(), x.id]));

  const toRow = (r) => {
    const packQty = r.packQty != null && r.packQty !== "" ? Number(r.packQty) : null;
    const packPrice = r.packPrice != null && r.packPrice !== "" ? Number(r.packPrice) : null;
    return {
      name: r.name.trim(), category: r.category?.trim() || null, base_unit: r.unit || "kg",
      location: r.location?.trim() || null, pack_desc: r.packDesc?.trim() || null,
      pack_qty: packQty, pack_price: packPrice,
      // cost_per_base_unit is a GENERATED column — DB computes it; do not write it.
      supplier: r.defaultSupplier?.trim() || null,
      reorder_point: r.reorderPoint != null && r.reorderPoint !== "" ? Number(r.reorderPoint) : null,
      allergens: Array.isArray(r.allergens) ? r.allergens : [],
      may_contain_allergens: Array.isArray(r.mayContain) ? r.mayContain : [],
    };
  };

  let updated = 0, created = 0;
  const inserts = [];
  for (const r of clean) {
    const id = byName.get(r.name.trim().toLowerCase());
    if (id) {
      const { error } = await supabase.from("cogs_ck_items").update(toRow(r)).eq("id", id);
      if (error) throw error; updated++;
    } else {
      inserts.push({ ...toRow(r), site_id: siteId || null });
    }
  }
  if (inserts.length) {
    const { error } = await supabase.from("cogs_ck_items").insert(inserts);
    if (error) throw error; created = inserts.length;
  }
  return { updated, created };
}

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
  parLevel: p.par_level != null ? Number(p.par_level) : null,
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
    par_level: p.parLevel === "" || p.parLevel == null ? null : Number(p.parLevel),
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
export async function createProductionRun({ siteId, product, producedQty, plannedQty, runDate, useByDate, allocations, allergens, note, runBy, planId, planLineId }) {
  const batchCode = `${(product.name||"PRD").replace(/[^A-Za-z0-9]/g,"").slice(0,6).toUpperCase()}-${(runDate||new Date().toISOString().slice(0,10)).replace(/-/g,"")}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const { error: rErr } = await supabase.from("ck_production_runs").insert({
    id: runId, site_id: siteId || null, product_id: product.id, product_name: product.name,
    produced_qty: producedQty, planned_qty: plannedQty != null && plannedQty !== "" ? Number(plannedQty) : null, output_unit: product.outputUnit || null,
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

  // CK → Distribution hook (best-effort): draft a Distribution goods receipt
  // for the received lines so warehouse stock can be confirmed. Never blocks CK.
  // GUARD: surface any products with no dist_items.ck_product_id link — those
  // land in ck_distribution_stock but will NOT become sellable warehouse stock,
  // so the receiver must be told rather than the list being silently discarded.
  let unmatchedProducts = [];
  try {
    const ckLines = (receipts || []).map(r => { const l = byId.get(r.lineId); return l ? { productId: l.productId, productName: l.productName, qtyReceived: Number(r.qtyReceived) || 0, finishedBatchNo: l.finishedBatchNo, useByDate: l.useByDate } : null; }).filter(Boolean);
    if (ckLines.length) {
      const draft = await createDistDraftReceiptFromCk({ ckDispatchId: dispatchId, ckLines, receivedDate: receivedDate || new Date().toISOString().slice(0,10), createdBy: receivedBy });
      unmatchedProducts = (draft && draft.unmatched) || [];
    }
  } catch (e) { /* hook is non-blocking; draft can be created later */ }

  return { dispatchId, unmatched: unmatchedProducts };
}

export async function fetchDistributionStock(siteId) {
  let q = supabase.from("ck_distribution_stock").select("*").gt("qty_remaining", 0).order("use_by_date", { ascending: true });
  if (siteId) q = q.eq("site_id", siteId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDistStock);
}

// ============================================================================
// CENTRAL KITCHEN — outlet ordering (Phase 2)
// Outlets place orders for finished CK products; CK sees consolidated demand
// and fulfils via dispatch. States: draft → submitted → fulfilled (or cancelled).
// ============================================================================
const mapCkOrder = (o) => ({
  id: o.id, fromStoreId: o.from_store_id || null, fromStoreName: o.from_store_name || "",
  status: o.status || "draft", requestedDate: o.requested_date || null,
  createdBy: o.created_by || "", note: o.note || "", createdAt: o.created_at,
  submittedAt: o.submitted_at || null, fulfilledAt: o.fulfilled_at || null,
});
const mapCkOrderLine = (l) => ({
  id: l.id, orderId: l.order_id, productId: l.product_id, productName: l.product_name || "",
  qty: l.qty != null ? Number(l.qty) : 0, unit: l.unit || "", qtyFulfilled: l.qty_fulfilled != null ? Number(l.qty_fulfilled) : null,
});

// Fetch orders with their lines. Filter by store (outlet view) or status (CK view).
export async function fetchCkOrders({ fromStoreId, status } = {}) {
  let q = supabase.from("ck_orders").select("*").order("created_at", { ascending: false });
  if (fromStoreId) q = q.eq("from_store_id", fromStoreId);
  if (status) q = Array.isArray(status) ? q.in("status", status) : q.eq("status", status);
  const { data: orders, error } = await q;
  if (error) throw error;
  const ids = (orders || []).map(o => o.id);
  let linesByOrder = {};
  if (ids.length) {
    const { data: lines } = await supabase.from("ck_order_lines").select("*").in("order_id", ids);
    (lines || []).forEach(l => { (linesByOrder[l.order_id] = linesByOrder[l.order_id] || []).push(mapCkOrderLine(l)); });
  }
  return (orders || []).map(o => ({ ...mapCkOrder(o), lines: linesByOrder[o.id] || [] }));
}

// Create or update a draft order + replace its lines. lines = [{productId, productName, qty, unit}].
export async function saveCkOrder({ id, fromStoreId, fromStoreName, requestedDate, createdBy, note, lines }) {
  const orderId = id || `cko-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  if (id) {
    const { error } = await supabase.from("ck_orders").update({
      requested_date: requestedDate || null, note: note || null,
    }).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("ck_orders").insert({
      id: orderId, from_store_id: fromStoreId || null, from_store_name: fromStoreName || null,
      status: "draft", requested_date: requestedDate || null, created_by: createdBy || null, note: note || null,
    });
    if (error) throw error;
  }
  // Replace lines
  await supabase.from("ck_order_lines").delete().eq("order_id", orderId);
  const rows = (lines || []).filter(l => l.productId && Number(l.qty) > 0).map(l => ({
    id: `ckol-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    order_id: orderId, product_id: l.productId, product_name: l.productName || null,
    qty: Number(l.qty), unit: l.unit || null, qty_fulfilled: null,
  }));
  if (rows.length) { const { error } = await supabase.from("ck_order_lines").insert(rows); if (error) throw error; }
  return orderId;
}

export async function submitCkOrder(orderId) {
  const { error } = await supabase.from("ck_orders").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", orderId);
  if (error) throw error;
  return orderId;
}

export async function cancelCkOrder(orderId) {
  const { error } = await supabase.from("ck_orders").update({ status: "cancelled" }).eq("id", orderId);
  if (error) throw error;
  return orderId;
}

export async function deleteCkOrder(orderId) {
  const { error } = await supabase.from("ck_orders").delete().eq("id", orderId);
  if (error) throw error;
  return orderId;
}

// Mark an order fulfilled (called after the CK dispatches against it). Optionally
// records fulfilled quantities per line.
export async function fulfilCkOrder(orderId, lineFulfilments = []) {
  for (const lf of lineFulfilments) {
    if (lf.lineId != null && lf.qtyFulfilled != null) {
      await supabase.from("ck_order_lines").update({ qty_fulfilled: Number(lf.qtyFulfilled) }).eq("id", lf.lineId);
    }
  }
  const { error } = await supabase.from("ck_orders").update({ status: "fulfilled", fulfilled_at: new Date().toISOString() }).eq("id", orderId);
  if (error) throw error;
  return orderId;
}

// Consolidated demand across all submitted orders: total qty needed per product,
// with a per-outlet breakdown. Used by the CK demand view + production suggest.
export function computeCkOrderDemand(orders) {
  const byProduct = new Map(); // productId -> { productId, productName, unit, total, byStore: [{storeName, qty}] }
  (orders || []).filter(o => o.status === "submitted").forEach(o => {
    (o.lines || []).forEach(l => {
      const k = String(l.productId);
      const cur = byProduct.get(k) || { productId: l.productId, productName: l.productName, unit: l.unit, total: 0, byStore: [] };
      cur.total += Number(l.qty) || 0;
      cur.byStore.push({ storeName: o.fromStoreName || o.fromStoreId || "Outlet", qty: Number(l.qty) || 0 });
      byProduct.set(k, cur);
    });
  });
  return [...byProduct.values()].sort((a,b)=> a.productName.localeCompare(b.productName));
}

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
  return (data || []).map(r => ({ id: r.id, name: r.name, baseRole: r.base_role, description: r.description || "", scope: r.scope || null }));
}

export async function upsertCustomRole(role) {
  const row = {
    name: (role.name || "").trim(),
    base_role: role.baseRole || "staff",
    description: role.description || null,
    scope: role.scope || null,
    updated_at: new Date().toISOString(),
  };
  if (role.id) row.id = role.id;
  const { data, error } = await supabase.from("custom_roles").upsert(row).select().maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, name: data.name, baseRole: data.base_role, description: data.description || "", scope: data.scope || null } : null;
}

export async function archiveCustomRole(id) {
  // Unassign anyone holding it, then soft-archive the role.
  await supabase.from("ops_team").update({ access_role_id: null }).eq("access_role_id", id);
  const { error } = await supabase.from("custom_roles").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return id;
}

// Assign (or clear) a person's custom role. roleId=null clears it.
export async function setMemberCustomRole(memberId, roleId) {
  const { error } = await supabase.from("ops_team").update({ access_role_id: roleId || null }).eq("id", memberId);
  if (error) throw error;
  return { memberId, roleId: roleId || null };
}

// ── CASH ACCOUNTS (double-entry cash ledger, Finance entity) ─────────────────
const mapCashAccount = (a) => ({ id: a.id, name: a.name, kind: a.kind, storeId: a.store_id || null, entityId: a.entity_id || null, description: a.description || "", isPetty: a.is_petty ?? false, archivedAt: a.archived_at || null });
const mapCashSource = (s) => ({ id: s.id, name: s.name, categoryId: s.category_id || null });
const mapCashExpenseType = (e) => ({ id: e.id, name: e.name, categoryId: e.category_id || null });
const mapCashLedger = (t) => ({
  id: t.id, txnDate: t.txn_date, type: t.type, amount: Number(t.amount) || 0,
  fromAccountId: t.from_account_id || null, toAccountId: t.to_account_id || null,
  sourceId: t.source_id || null, expenseTypeId: t.expense_type_id || null,
  storeId: t.store_id || null, entityId: t.entity_id || null, reference: t.reference || "", createdBy: t.created_by || null,
  sourceRef: t.source_ref || null,
  reconciled: t.reconciled ?? false,
  reconciledAt: t.reconciled_at || null,
  reconciledBy: t.reconciled_by || null,
  createdAt: t.created_at,
});

// ============================================================================
// ENTITIES — legal entities for management accounting (Phase 1)
// A store belongs to one entity via its brand_id (entity id == brand id, 1:1).
// Financial tables carry entity_id so P&L / balance sheet report per entity.
// ============================================================================
const mapEntity = (e) => ({
  id: e.id, name: e.name, legalName: e.legal_name || "", baseCurrency: e.base_currency || "GBP",
  accountantRef: e.accountant_ref || "", active: e.active !== false,
});
export async function fetchEntities() {
  const { data, error } = await supabase.from("entities").select("*").order("name");
  if (error) throw error;
  return (data || []).map(mapEntity);
}

// ============================================================================
// CHART OF ACCOUNTS + GENERALISED JOURNAL ENTRIES (Phase 2)
// Generalises the cash_ledger two-sided pattern into full double-entry that can
// touch any account type. Convention: debit > 0, credit < 0; a journal entry's
// lines must sum to zero. Trial balance = sum of lines per account per entity.
// ============================================================================
const mapAccount = (a) => ({
  id: a.id, entityId: a.entity_id || null, code: a.code || "", name: a.name,
  type: a.type, parentId: a.parent_id || null, sourceKind: a.source_kind || null,
  sourceId: a.source_id || null, active: a.active !== false,
});
export async function fetchAccounts(entityId) {
  let q = supabase.from("accounts").select("*").eq("active", true).order("code");
  if (entityId) q = q.eq("entity_id", entityId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapAccount);
}

// Resolve a chart account for a given entity by its code (e.g. "5010"). The
// category mapping stores a chocoberry-<code> reference; at posting time we
// point at the CORRECT entity's account with the same code.
export async function resolveAccountForEntity(entityId, code) {
  if (!entityId || !code) return null;
  const { data } = await supabase.from("accounts").select("id").eq("entity_id", entityId).eq("code", code).maybeSingle();
  return data?.id || null;
}

const mapJournalEntry = (j) => ({
  id: j.id, entityId: j.entity_id || null, entryDate: j.entry_date, memo: j.memo || "",
  sourceKind: j.source_kind || null, sourceRef: j.source_ref || null, createdBy: j.created_by || null,
  createdAt: j.created_at, lines: (j.journal_lines || []).map(mapJournalLine),
});
const mapJournalLine = (l) => ({
  id: l.id, journalId: l.journal_id, accountId: l.account_id,
  amount: Number(l.amount) || 0, storeId: l.store_id || null, memo: l.memo || "",
});

// Post a balanced journal entry. lines = [{accountId, amount, storeId?, memo?}].
// Debits positive, credits negative; the lines MUST sum to (approximately) zero.
// sourceRef makes posting idempotent (skips if one already exists).
export async function postJournalEntry({ entityId, entryDate, memo, sourceKind, sourceRef, createdBy, lines }) {
  const valid = (lines || []).filter(l => l.accountId && Number(l.amount) !== 0);
  if (valid.length < 2) throw new Error("A journal entry needs at least two lines.");
  const sum = valid.reduce((a, l) => a + Number(l.amount), 0);
  if (Math.abs(sum) > 0.005) throw new Error(`Journal does not balance (sum = ${sum.toFixed(2)}). Debits must equal credits.`);
  if (sourceRef) {
    const { data: existing } = await supabase.from("journal_entries").select("id").eq("source_ref", sourceRef).limit(1);
    if ((existing || []).length) return { posted: false, skipped: true, reason: "already posted", id: existing[0].id };
  }
  const jid = `je-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const { error: hErr } = await supabase.from("journal_entries").insert({
    id: jid, entity_id: entityId || null, entry_date: entryDate || new Date().toISOString().slice(0,10),
    memo: memo || null, source_kind: sourceKind || "manual", source_ref: sourceRef || null, created_by: createdBy || null,
  });
  if (hErr) throw hErr;
  const rows = valid.map(l => ({
    id: `jl-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    journal_id: jid, account_id: l.accountId, amount: Number(l.amount),
    store_id: l.storeId || null, memo: l.memo || null,
  }));
  const { error: lErr } = await supabase.from("journal_lines").insert(rows);
  if (lErr) throw lErr;
  return { posted: true, skipped: false, id: jid };
}

export async function fetchJournalEntries({ entityId, from, to } = {}) {
  let q = supabase.from("journal_entries").select("*, journal_lines(*)").order("entry_date", { ascending: false });
  if (entityId) q = q.eq("entity_id", entityId);
  if (from) q = q.gte("entry_date", from);
  if (to) q = q.lte("entry_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapJournalEntry);
}

export async function deleteJournalEntry(id) {
  const { error } = await supabase.from("journal_entries").delete().eq("id", id);
  if (error) throw error;
  return id;
}

// Trial balance for an entity: net movement per account. Each row { account, debit,
// credit, balance }. If double-entry holds, total debits == total credits.
export async function computeTrialBalance(entityId, { from, to } = {}) {
  const [accounts, entries] = await Promise.all([
    fetchAccounts(entityId),
    fetchJournalEntries({ entityId, from, to }),
  ]);
  const byAccount = {};
  accounts.forEach(a => { byAccount[a.id] = { account: a, net: 0 }; });
  entries.forEach(j => (j.lines || []).forEach(l => {
    if (byAccount[l.accountId]) byAccount[l.accountId].net += l.amount;
  }));
  const rows = Object.values(byAccount)
    .filter(r => Math.abs(r.net) > 0.005)
    .map(r => ({ account: r.account, debit: r.net > 0 ? r.net : 0, credit: r.net < 0 ? -r.net : 0, balance: r.net }))
    .sort((a, b) => a.account.code.localeCompare(b.account.code));
  const totalDebit = rows.reduce((a, r) => a + r.debit, 0);
  const totalCredit = rows.reduce((a, r) => a + r.credit, 0);
  return { rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 };
}

// Balance sheet for an entity: arranges journal balances into Assets,
// Liabilities and Equity. Income/expense accounts don't appear directly — they
// roll up into retained earnings (net profit) inside equity, which is what makes
// the sheet balance (Assets = Liabilities + Equity). `asOf` bounds the period.
export async function computeBalanceSheet(entityId, { asOf } = {}) {
  const [accounts, entries] = await Promise.all([
    fetchAccounts(entityId),
    fetchJournalEntries({ entityId, to: asOf }),
  ]);
  const net = {};
  accounts.forEach(a => { net[a.id] = 0; });
  entries.forEach(j => (j.lines || []).forEach(l => { if (net[l.accountId] != null) net[l.accountId] += l.amount; }));

  const section = (type) => accounts
    .filter(a => a.type === type)
    .map(a => ({ account: a, balance: net[a.id] || 0 }))
    .filter(r => Math.abs(r.balance) > 0.005);

  // Assets are debit-normal (show as +balance). Liabilities & equity are
  // credit-normal (stored negative; flip sign to show the positive amount owed/held).
  const assets = section("asset").map(r => ({ ...r, amount: r.balance }));
  const liabilities = section("liability").map(r => ({ ...r, amount: -r.balance }));
  const equityAccounts = section("equity").map(r => ({ ...r, amount: -r.balance }));

  // Retained earnings = net profit = income (credit-normal) − expenses (debit-normal).
  const incomeTotal = accounts.filter(a => a.type === "income").reduce((s, a) => s + (-(net[a.id] || 0)), 0);
  const expenseTotal = accounts.filter(a => a.type === "expense").reduce((s, a) => s + (net[a.id] || 0), 0);
  const retainedEarnings = incomeTotal - expenseTotal;

  const totalAssets = assets.reduce((s, r) => s + r.amount, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.amount, 0);
  const totalEquityAccounts = equityAccounts.reduce((s, r) => s + r.amount, 0);
  const totalEquity = totalEquityAccounts + retainedEarnings;

  return {
    assets, liabilities, equityAccounts, retainedEarnings,
    incomeTotal, expenseTotal,
    totalAssets, totalLiabilities, totalEquity,
    // Balances when Assets = Liabilities + Equity.
    balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    difference: totalAssets - (totalLiabilities + totalEquity),
  };
}

// Consolidated balance sheet across multiple entities (simple sum; inter-company
// elimination comes in Phase 4). Returns the same shape with per-entity detail.
export async function computeConsolidatedBalanceSheet(entityIds = [], { asOf } = {}) {
  const sheets = await Promise.all(entityIds.map(id => computeBalanceSheet(id, { asOf }).then(s => ({ entityId: id, sheet: s }))));
  const sum = (key) => sheets.reduce((a, s) => a + s.sheet[key], 0);
  return {
    perEntity: sheets,
    totalAssets: sum("totalAssets"),
    totalLiabilities: sum("totalLiabilities"),
    totalEquity: sum("totalEquity"),
    retainedEarnings: sum("retainedEarnings"),
    balanced: Math.abs(sum("totalAssets") - (sum("totalLiabilities") + sum("totalEquity"))) < 0.01,
  };
}


// source_ref. Each helper returns the postJournalEntry result (or skips).
//
// Accounting conventions used (debit +, credit -):
//   Cash income   : Dr Cash(1010)        Cr Sales(4000)
//   Cash expense  : Dr Expense(5xxx)      Cr Cash(1010)
//   EOD takings   : Dr Cash on hand(1000) Cr Sales(4000)
//   Invoice (appr): Dr Expense(5xxx/COGS) Cr Trade creditors(2000)
//   Invoice paid  : Dr Trade creditors    Cr Cash(1010)
// Resolve the precise expense account code for a cash movement, by walking
// expense_type → category → account, then mapping to THIS entity's chart by
// code. Falls back to 5000 (COGS) if the chain is incomplete.
async function resolveExpenseCodeForType(expenseTypeId) {
  if (!expenseTypeId) return "5000";
  const { data: et } = await supabase.from("cash_expense_types").select("category_id").eq("id", expenseTypeId).maybeSingle();
  if (!et?.category_id) return "5000";
  const { data: cat } = await supabase.from("transaction_categories").select("account_id").eq("id", et.category_id).maybeSingle();
  if (!cat?.account_id) return "5000";
  // account_id is "<entity>-<code>"; pull the code suffix.
  const m = String(cat.account_id).match(/-(\d+)$/);
  return m ? m[1] : "5000";
}

export async function postCashMovementJournal(tx, entityId) {
  if (!entityId) return { posted: false, skipped: true, reason: "no entity" };
  const amt = Number(tx.amount); if (!(amt > 0)) return { posted: false, skipped: true, reason: "zero" };
  const cash = await resolveAccountForEntity(entityId, "1010");
  const sales = await resolveAccountForEntity(entityId, "4000");
  let lines = null;
  if (tx.type === "income" || tx.type === "opening") lines = [{ accountId: cash, amount: amt }, { accountId: sales, amount: -amt }];
  else if (tx.type === "expense") {
    // Route to the precise expense account from the movement's category.
    const code = await resolveExpenseCodeForType(tx.expenseTypeId);
    const expense = await resolveAccountForEntity(entityId, code) || await resolveAccountForEntity(entityId, "5000");
    lines = [{ accountId: expense, amount: amt }, { accountId: cash, amount: -amt }];
  }
  else return { posted: false, skipped: true, reason: `type ${tx.type} not auto-posted` };
  if (!lines.every(l => l.accountId)) return { posted: false, skipped: true, reason: "accounts not found" };
  return postJournalEntry({ entityId, entryDate: tx.txnDate, memo: tx.reference || `Cash ${tx.type}`, sourceKind: "cash_ledger", sourceRef: `cashmv:${tx.id || tx.sourceRef || Date.now()}`, createdBy: tx.createdBy, lines });
}

export async function postEodTakingsJournal(eodEntry, entityId) {
  if (!entityId || !eodEntry?.id) return { posted: false, skipped: true, reason: "missing" };
  const amt = Number(eodEntry.netSales); if (!(amt > 0)) return { posted: false, skipped: true, reason: "no sales" };
  const cash = await resolveAccountForEntity(entityId, "1000");
  const sales = await resolveAccountForEntity(entityId, "4000");
  if (!cash || !sales) return { posted: false, skipped: true, reason: "accounts not found" };
  return postJournalEntry({ entityId, entryDate: eodEntry.date, memo: `EOD takings ${eodEntry.date || ""}`.trim(), sourceKind: "eod", sourceRef: `eodje:${eodEntry.id}`, lines: [{ accountId: cash, amount: amt, storeId: eodEntry.storeId }, { accountId: sales, amount: -amt, storeId: eodEntry.storeId }] });
}

export async function postInvoiceJournal(invoice, entityId, { paid = false } = {}) {
  if (!entityId || !invoice?.id) return { posted: false, skipped: true, reason: "missing" };
  const amt = Number(invoice.total_ex_vat ?? invoice.totalExVat); if (!(amt > 0)) return { posted: false, skipped: true, reason: "no amount" };
  const creditors = await resolveAccountForEntity(entityId, "2000");
  if (paid) {
    const cash = await resolveAccountForEntity(entityId, "1010");
    if (!creditors || !cash) return { posted: false, skipped: true, reason: "accounts not found" };
    return postJournalEntry({ entityId, entryDate: invoice.paid_date || new Date().toISOString().slice(0,10), memo: `Paid invoice ${invoice.invoice_number || invoice.id}`, sourceKind: "invoice_paid", sourceRef: `invpaid:${invoice.id}`, lines: [{ accountId: creditors, amount: amt }, { accountId: cash, amount: -amt }] });
  }
  // Route the expense to the account matching the invoice's category (by name
  // against transaction_categories → account), falling back to COGS (5000).
  let expCode = "5000";
  if (invoice.category) {
    const { data: cat } = await supabase.from("transaction_categories").select("account_id").ilike("name", String(invoice.category).trim()).maybeSingle();
    const m = cat?.account_id ? String(cat.account_id).match(/-(\d+)$/) : null;
    if (m) expCode = m[1];
  }
  const expense = await resolveAccountForEntity(entityId, expCode) || await resolveAccountForEntity(entityId, "5000");
  if (!creditors || !expense) return { posted: false, skipped: true, reason: "accounts not found" };
  // Split VAT out to the VAT control account so it shows on the balance sheet:
  //   Dr Expense (ex-VAT) + Dr VAT control (VAT) ; Cr Trade creditors (gross).
  const vat = Number(invoice.total_vat ?? invoice.totalVat) || 0;
  const gross = amt + vat;
  const lines = [{ accountId: expense, amount: amt }];
  if (vat > 0.005) {
    const vatCtrl = await resolveAccountForEntity(entityId, "2100");
    if (vatCtrl) lines.push({ accountId: vatCtrl, amount: vat });
    else lines[0].amount = gross; // no VAT account → put whole gross to expense so it still balances
  }
  lines.push({ accountId: creditors, amount: -(lines.reduce((s, l) => s + l.amount, 0)) });
  return postJournalEntry({ entityId, entryDate: invoice.invoice_date || new Date().toISOString().slice(0,10), memo: `Invoice ${invoice.invoice_number || invoice.id} ${invoice.supplier_name || ""}`.trim(), sourceKind: "invoice", sourceRef: `inv:${invoice.id}`, lines });
}

export async function fetchCashAccounts() {
  const { data, error } = await supabase.from("cash_accounts").select("*").is("archived_at", null).order("name");
  if (error) throw error;
  return (data || []).map(mapCashAccount);
}
export async function upsertCashAccount(acc) {
  const row = { name: (acc.name||"").trim(), kind: acc.kind, store_id: acc.storeId || null, entity_id: acc.entityId || null, description: acc.description || null, updated_at: new Date().toISOString() };
  if (acc.isPetty !== undefined) row.is_petty = !!acc.isPetty;
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
    entity_id: tx.entityId || null,
    reference: tx.reference || null,
    created_by: tx.createdBy || null,
    source_ref: tx.sourceRef || null,
  };
  const { data, error } = await supabase.from("cash_ledger").insert(row).select().maybeSingle();
  if (error) throw error;
  const saved = data ? mapCashLedger(data) : null;
  // Mirror into the double-entry journal (best-effort; never block the cash save).
  if (saved && saved.entityId) {
    try { await postCashMovementJournal(saved, saved.entityId); } catch (e) { /* journal mirror is non-critical */ }
  }
  return saved;
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
      .insert({ name: nm, kind: "revenue", store_id: storeId, entity_id: (st?.brandId) || null, description: "Store cash sales" })
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
    entity_id: ((stores || []).find(s => s.id === storeId)?.brandId) || null,
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
  // Mirror the takings into the double-entry journal (Dr cash, Cr sales).
  const eodEntity = ((stores || []).find(s => s.id === storeId)?.brandId) || null;
  if (eodEntity) { try { await postEodTakingsJournal(eodEntry, eodEntity); } catch (e) { /* non-critical */ } }
  return { posted: true, skipped: false, accountId };
}

// ── EXPENSE CLAIMS (submit → approve → reconcile vs cash or bank) ─────────────
const mapExpenseClaim = (e) => ({
  id: e.id, description: e.description, amount: Number(e.amount)||0, expenseDate: e.expense_date,
  expenseTypeId: e.expense_type_id || null, categoryId: e.category_id || null, storeId: e.store_id || null,
  payeeId: e.payee_id || null,
  vendor: e.vendor || "", reference: e.reference || "", receiptUrl: e.receipt_url || null, invoiceId: e.invoice_id || null,
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

// Upload an expense receipt/invoice image. Returns a public URL stored on the
// claim. Uses the existing public photo bucket pattern.
// ── EXPENSE LINE CORRECTIONS (pre-approval) ─────────────────────────────────
// OCR misreads get fixed by a human before approval. Corrections rewrite the
// claim's itemised reference AND the matching UNRECEIVED store delivery lines
// (qty + unit cost), so the store receives true numbers. Received deliveries
// are never touched — stock already moved.
export async function applyExpenseLineCorrections({ claimId, lines }) {
  const clean = (lines || []).filter(l => (l.desc || "").trim() && Number(l.qty) > 0)
    .map(l => ({ desc: l.desc.trim(), qty: Number(l.qty), price: l.price != null ? Number(l.price) : null }));
  const { data: claim, error: cErr } = await supabase.from("expense_claims").select("*").eq("id", claimId).single();
  if (cErr || !claim) throw new Error("Expense not found.");
  if (claim.status !== "submitted") throw new Error("Only submitted (not yet approved) expenses can be corrected.");

  // 1. Rewrite the itemised reference on the claim.
  const reference = clean.map(l => `${l.qty}× ${l.desc}`).join("; ").slice(0, 500);
  const { error: uErr } = await supabase.from("expense_claims").update({ reference, updated_at: new Date().toISOString() }).eq("id", claimId);
  if (uErr) throw uErr;

  // 2. Correct the matching unreceived delivery lines (same store + the ref
  //    pattern the expense flow stamps on the deliveries it raises).
  let deliveryUpdated = 0, deliverySkipped = false;
  if (claim.store_id) {
    const refPrefix = `${claim.expense_date}-${(claim.vendor || "purchase").slice(0, 20)}`;
    // Deliveries carry the reference inside dispatch_id ("fresh:<ref>") — there
    // is no ref column. (The original lookup silently matched nothing.)
    const { data: dels, error: dErr2 } = await supabase.from("store_deliveries").select("id, status, dispatch_id")
      .eq("store_id", claim.store_id).ilike("dispatch_id", `fresh:${refPrefix}%`);
    if (dErr2) throw dErr2;
    for (const d of (dels || [])) {
      const { data: dl } = await supabase.from("store_delivery_lines").select("id, item_name, received").eq("delivery_id", d.id);
      const anyReceived = (dl || []).some(x => x.received);
      if (anyReceived) { deliverySkipped = true; continue; }
      for (const row of (dl || [])) {
        const base = (row.item_name || "").replace(/\s*\([^)]*\)\s*$/, "").trim(); // strip "(Vendor)"
        const match = clean.find(l => l.desc.trim() === base);
        if (match) {
          const upd = { qty_dispatched: match.qty };
          if (match.price != null) upd.unit_cost = match.price;
          if (match.storeItemId != null) upd.store_item_id = String(match.storeItemId);  // link = stock moves on receive (ids are bigint on invoice_lines, text here)
          const { error } = await supabase.from("store_delivery_lines").update(upd).eq("id", row.id);
          if (!error) deliveryUpdated++;
        }
      }
    }
  }
  return { reference, deliveryUpdated, deliverySkipped };
}

export async function uploadExpenseReceipt(file, submittedById) {
  const ext = (file.name && file.name.includes(".")) ? file.name.split(".").pop().toLowerCase() : "jpg";
  const random = Math.random().toString(36).slice(2, 10);
  const filename = `${submittedById || "anon"}/${Date.now()}-${random}.${ext}`;
  const { error } = await supabase.storage.from("expense-receipts").upload(filename, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("expense-receipts").getPublicUrl(filename);
  return data.publicUrl;
}

export async function submitExpenseClaim(claim) {
  const amt = Number(claim.amount);
  if (!(amt > 0)) throw new Error("Amount must be greater than zero.");
  if (!(claim.description || "").trim()) throw new Error("Describe the expense.");
  const row = {
    description: claim.description.trim(), amount: amt,
    expense_date: claim.expenseDate || new Date().toISOString().slice(0,10),
    expense_type_id: claim.expenseTypeId || null, category_id: claim.categoryId || null,
    payee_id: claim.payeeId || null,
    store_id: claim.storeId || null, invoice_id: claim.invoiceId || null, vendor: claim.vendor || null, reference: claim.reference || null,
    receipt_url: claim.receiptUrl || null,
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

// ── Cash movement reconcile/confirm ──────────────────────────────────────────
export async function setCashLedgerReconciled(id, reconciled, by = null) {
  const patch = reconciled
    ? { reconciled: true, reconciled_at: new Date().toISOString(), reconciled_by: by || null }
    : { reconciled: false, reconciled_at: null, reconciled_by: null };
  const { error } = await supabase.from("cash_ledger").update(patch).eq("id", id);
  if (error) throw error;
  return id;
}

// ── PETTY CASH FLOAT (single shared account) ─────────────────────────────────
// Ensure the one petty-cash account exists; create it if missing. Returns it.
export async function ensurePettyCashAccount() {
  const { data: existing, error: e1 } = await supabase.from("cash_accounts").select("*").eq("is_petty", true).is("archived_at", null).limit(1);
  if (e1) throw e1;
  if ((existing || []).length) return mapCashAccount(existing[0]);
  const { data, error } = await supabase.from("cash_accounts")
    .insert({ name: "Petty Cash", kind: "expense", store_id: null, is_petty: true, description: "Shared petty cash float" })
    .select().maybeSingle();
  if (error) {
    // Race: someone created it — re-fetch.
    const { data: re } = await supabase.from("cash_accounts").select("*").eq("is_petty", true).limit(1);
    if ((re || []).length) return mapCashAccount(re[0]);
    throw error;
  }
  return mapCashAccount(data);
}

// Top up petty cash: transfer from a source (shop) cash account into petty cash.
export async function topUpPettyCash({ fromAccountId, pettyAccountId, amount, txnDate, createdBy }) {
  const amt = Number(amount);
  if (!fromAccountId) throw new Error("Choose the source cash account.");
  if (!pettyAccountId) throw new Error("Petty cash account missing.");
  if (!(amt > 0)) throw new Error("Enter an amount greater than zero.");
  return addCashLedgerEntry({
    txnDate: txnDate || new Date().toISOString().slice(0,10),
    type: "transfer", amount: amt,
    fromAccountId, toAccountId: pettyAccountId,
    reference: "Petty cash top-up", createdBy: createdBy || null,
  });
}

// ── EXPENSE PAYEES (managed list; "Payment For" on the form) ──────────────────
export async function fetchExpensePayees() {
  const { data, error } = await supabase.from("expense_payees").select("*").is("archived_at", null).order("name");
  if (error) throw error;
  return (data || []).map(p => ({ id: p.id, name: p.name }));
}
export async function upsertExpensePayee(payee) {
  const row = { name: (payee.name || "").trim(), updated_at: new Date().toISOString() };
  if (!row.name) throw new Error("Payee needs a name.");
  if (payee.id) row.id = payee.id;
  const { data, error } = await supabase.from("expense_payees").upsert(row).select().maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, name: data.name } : null;
}
export async function archiveExpensePayee(id) {
  const { error } = await supabase.from("expense_payees").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return id;
}

// ── STAGE 1: STORE THEORETICAL COGS (sales × recipe cost) ────────────────────
// Reuses the recipe cost rollup (itemCost → prepCost → productBaseCost) and the
// store POS map. Returns per-store theoretical COGS for a date range plus a
// mapping-coverage figure so the number can be trusted. Read-only; does not
// touch the P&L's existing COGS (manual EOD + invoices) — shown alongside.
export async function computeStoreTheoreticalCogs({ storeId, from, to } = {}) {
  if (!storeId) throw new Error("storeId required");
  const [inv, rec, mapsRaw, salesRaw, ignoredRaw] = await Promise.all([
    fetchInventory(),
    fetchRecipes(),
    fetchPosMappings(storeId),
    (async () => {
      let q = supabase.from("item_day_aggregates").select("item, qty, revenue, business_date").eq("store_id", storeId);
      if (from) q = q.gte("business_date", from);
      if (to)   q = q.lte("business_date", to);
      const { data, error } = await q; if (error) throw error; return data || [];
    })(),
    fetchIgnoredTillNames(storeId).catch(() => []),
  ]);
  const ignoredSet = new Set((ignoredRaw || []).map(i => (i.posName || "").trim().toLowerCase()));

  // Cost rollup (ported from RecipeBuilder, identical logic).
  const itemById = new Map();
  (inv.store || []).forEach(x => itemById.set("store:" + x.id, x));
  (inv.ck || []).forEach(x => itemById.set("ck:" + x.id, x));
  const itemCost = (scope, id) => { const it = itemById.get(scope + ":" + id); return it && it.costPerBaseUnit != null ? Number(it.costPerBaseUnit) : null; };
  const prepById = new Map((rec.preps || []).map(p => [p.id, p]));
  const prepCost = (prep, _seen) => {
    if (!prep) return null;
    const seen = _seen || new Set();
    if (seen.has(prep.id)) return null; // circular reference guard
    seen.add(prep.id);
    const comps = (rec.prepComponents || []).filter(c => c.prepId === prep.id);
    let out = null;
    if (comps.length && prep.yieldQty) {
      let total = 0, ok = true;
      comps.forEach(c => {
        if (c.kind === "prep" && c.subPrepId) {
          // Nested prep: unit "batch"/blank = qty whole batches; other units (g/ml/ea) =
          // qty in the sub-prep's yield units at its per-unit cost.
          const sub = prepById.get(c.subPrepId);
          const qty = c.portionQty == null || c.portionQty === "" ? 1 : Number(c.portionQty);
          const useBatch = !c.unit || String(c.unit).trim().toLowerCase() === "batch";
          const subPerUnit = sub ? prepCost(sub, seen) : null;
          const unitCost = subPerUnit == null ? null
            : (useBatch ? (sub.yieldQty ? subPerUnit * Number(sub.yieldQty) : null) : subPerUnit);
          if (unitCost == null || isNaN(qty)) ok = false; else total += unitCost * qty;
        } else {
          const u = itemCost(c.itemScope, c.itemId);
          if (u == null || c.portionQty == null) ok = false; else total += u * Number(c.portionQty);
        }
      });
      out = ok ? total / Number(prep.yieldQty) : null;
    }
    seen.delete(prep.id); // path-based: reuse of the same sub-prep in sibling branches is fine
    return out;
  };
  const prepCostPerUnit = (prepId) => prepCost(prepById.get(prepId));
  const productCost = (productId) => {
    const comps = (rec.productComponents || []).filter(c => c.productId === productId && (c.variantId == null));
    if (!comps.length) return { cost: null, missing: 1, count: 0 };
    let total = 0, missing = 0;
    comps.forEach(c => {
      const unit = c.kind === "prep" ? prepCostPerUnit(c.prepId) : itemCost(c.itemScope, c.itemId);
      if (unit == null || c.portionQty == null) missing++; else total += unit * Number(c.portionQty);
    });
    return { cost: missing ? null : total, missing, count: comps.length };
  };

  // POS name (normalised) -> productId.
  const mapByName = new Map();
  (mapsRaw || []).forEach(m => { if (m.posName && m.productId) mapByName.set(m.posName.trim().toLowerCase(), m.productId); });
  const productCostCache = new Map();
  const costFor = (productId) => { if (!productCostCache.has(productId)) productCostCache.set(productId, productCost(productId)); return productCostCache.get(productId); };

  let cogs = 0, costedRevenue = 0, totalRevenue = 0, mappedButUncosted = 0, unmappedRevenue = 0;
  const lines = [];
  // Aggregate sales by item name across the range.
  const byItem = {};
  (salesRaw || []).forEach(r => {
    const name = (r.item || "").trim(); if (!name) return;
    byItem[name] = byItem[name] || { name, qty: 0, revenue: 0 };
    byItem[name].qty += Number(r.qty) || 0;
    byItem[name].revenue += Number(r.revenue) || 0;
  });
  Object.values(byItem).forEach(s => {
    if (ignoredSet.has(s.name.trim().toLowerCase())) return; // hidden open-item junk — excluded from coverage
    totalRevenue += s.revenue;
    const pid = mapByName.get(s.name.trim().toLowerCase());
    if (!pid) { unmappedRevenue += s.revenue; lines.push({ ...s, status: "unmapped", lineCogs: 0 }); return; }
    const pc = costFor(pid);
    const prodNm = (rec.products || []).find(p => p.id === pid)?.name || "—";
    if (pc.cost == null) {
      mappedButUncosted += s.revenue;
      const reason = pc.count === 0 ? "no recipe components" : "ingredient cost missing";
      lines.push({ ...s, status: "uncosted", lineCogs: 0, productId: pid, productName: prodNm, reason, missing: pc.missing, components: pc.count });
      return;
    }
    const lineCogs = pc.cost * s.qty;
    cogs += lineCogs; costedRevenue += s.revenue;
    lines.push({ ...s, status: "costed", productId: pid, productName: prodNm, unitCost: +pc.cost.toFixed(4), lineCogs: +lineCogs.toFixed(2) });
  });

  // Roll uncosted lines up to the product level (so you fix each product once).
  const uncostedByProduct = (() => {
    const m = {};
    lines.filter(l => l.status === "uncosted").forEach(l => {
      const k = l.productId || l.name;
      m[k] = m[k] || { productId: l.productId, productName: l.productName, reason: l.reason, revenue: 0, qty: 0, tillNames: [] };
      m[k].revenue += l.revenue; m[k].qty += l.qty; m[k].tillNames.push(l.name);
    });
    return Object.values(m).sort((a, b) => b.revenue - a.revenue);
  })();

  const coverage = totalRevenue > 0 ? costedRevenue / totalRevenue : 0;
  return {
    storeId, from: from || null, to: to || null,
    cogs: +cogs.toFixed(2),
    totalRevenue: +totalRevenue.toFixed(2),
    costedRevenue: +costedRevenue.toFixed(2),
    unmappedRevenue: +unmappedRevenue.toFixed(2),
    mappedButUncostedRevenue: +mappedButUncosted.toFixed(2),
    uncostedByProduct,
    coverage,                          // 0..1 share of revenue that is costed
    cogsPctOfCosted: costedRevenue > 0 ? cogs / costedRevenue : 0,
    lines: lines.sort((a, b) => b.revenue - a.revenue),
  };
}

// Per-distribution-item CONSUMPTION for a store over a period, derived from the
// same chain as theoretical COGS: sale → POS mapping → product → recipe
// components (incl. nested preps) → inventory items → dist_item_id. Returns a
// map { distItemId: { qtyBaseUnit, dailyAvg, weeklyAvg } } plus meta. Because it
// uses recipes, it covers BOTH finished goods and ingredients that never appear
// in sales directly (they're consumed when other products sell).
export async function computeStoreItemConsumption({ storeId, from, to, days } = {}) {
  if (!storeId) throw new Error("storeId required");
  const [inv, rec, mapsRaw, salesRaw, ignoredRaw] = await Promise.all([
    fetchInventory(),
    fetchRecipes(),
    fetchPosMappings(storeId),
    (async () => {
      let q = supabase.from("item_day_aggregates").select("item, qty, business_date").eq("store_id", storeId);
      if (from) q = q.gte("business_date", from);
      if (to)   q = q.lte("business_date", to);
      const { data, error } = await q; if (error) throw error; return data || [];
    })(),
    fetchIgnoredTillNames(storeId).catch(() => []),
  ]);
  const ignoredSet = new Set((ignoredRaw || []).map(i => (i.posName || "").trim().toLowerCase()));

  // inventory item key ("scope:id") -> distItemId. Only STORE items carry dist
  // links; CK is a separate entity (its costs/stock are never store distribution).
  const distIdByKey = new Map();
  (inv.store || []).forEach(x => { if (x.distItemId) distIdByKey.set("store:" + x.id, x.distItemId); });

  const prepById = new Map((rec.preps || []).map(p => [p.id, p]));

  // prepUsage(prepId) -> Map(itemKey -> base-unit qty consumed PER 1 YIELD-UNIT
  // of the prep). This mirrors prepCost() exactly, but accumulates quantities of
  // raw inventory items instead of cost. Cost model reference:
  //   prepCost = (Σ componentCost) / yieldQty, where an item component costs
  //   itemCost*portionQty and a nested-prep component costs (per-unit or per-batch)*qty.
  // So usage per yield-unit = (Σ componentItemQty) / yieldQty.
  const prepUsageCache = new Map();
  const prepUsage = (prepId, _seen) => {
    if (prepUsageCache.has(prepId)) return prepUsageCache.get(prepId);
    const prep = prepById.get(prepId);
    const out = new Map();
    if (!prep || !prep.yieldQty) { prepUsageCache.set(prepId, out); return out; }
    const seen = _seen || new Set();
    if (seen.has(prep.id)) return out; // circular guard
    seen.add(prep.id);
    const comps = (rec.prepComponents || []).filter(c => c.prepId === prep.id);
    comps.forEach(c => {
      if (c.kind === "prep" && c.subPrepId) {
        const sub = prepById.get(c.subPrepId);
        if (!sub) return;
        const qty = c.portionQty == null || c.portionQty === "" ? 1 : Number(c.portionQty);
        const useBatch = !c.unit || String(c.unit).trim().toLowerCase() === "batch";
        // yield-units of the sub-prep consumed by this component (in the batch):
        const subYieldUnits = useBatch ? qty * Number(sub.yieldQty || 0) : qty;
        const subUse = prepUsage(sub.id, seen); // per 1 sub yield-unit
        subUse.forEach((v, k) => out.set(k, (out.get(k) || 0) + v * subYieldUnits));
      } else {
        const key = c.itemScope + ":" + c.itemId;
        const qty = c.portionQty == null ? 0 : Number(c.portionQty);
        out.set(key, (out.get(key) || 0) + qty);
      }
    });
    // Divide the whole batch by yield to get per-yield-unit usage.
    const y = Number(prep.yieldQty);
    out.forEach((v, k) => out.set(k, v / y));
    seen.delete(prep.id);
    prepUsageCache.set(prepId, out);
    return out;
  };

  // productUsage(productId) -> Map(itemKey -> base-unit qty PER 1 PRODUCT sold).
  const productUsageCache = new Map();
  const productUsage = (productId) => {
    if (productUsageCache.has(productId)) return productUsageCache.get(productId);
    const out = new Map();
    const comps = (rec.productComponents || []).filter(c => c.productId === productId && c.variantId == null);
    comps.forEach(c => {
      const portion = c.portionQty == null ? 0 : Number(c.portionQty);
      if (c.kind === "prep" && c.prepId) {
        // Product-level prep component: portionQty is in the prep's YIELD units.
        const use = prepUsage(c.prepId); // per 1 yield-unit
        use.forEach((v, k) => out.set(k, (out.get(k) || 0) + v * portion));
      } else {
        const key = c.itemScope + ":" + c.itemId;
        out.set(key, (out.get(key) || 0) + portion);
      }
    });
    productUsageCache.set(productId, out);
    return out;
  };

  // POS name (normalised) -> productId.
  const mapByName = new Map();
  (mapsRaw || []).forEach(m => { if (m.posName && m.productId) mapByName.set(m.posName.trim().toLowerCase(), m.productId); });

  // Sales aggregated by item name across the range.
  const byItem = {};
  (salesRaw || []).forEach(r => {
    const name = (r.item || "").trim(); if (!name) return;
    byItem[name] = (byItem[name] || 0) + (Number(r.qty) || 0);
  });

  // Accumulate inventory-item consumption across all sold products.
  const invConsumed = new Map();  // "scope:id" -> base-unit qty
  let mappedSalesQty = 0, unmappedSalesQty = 0, uncostedProducts = 0;
  Object.entries(byItem).forEach(([name, qty]) => {
    if (ignoredSet.has(name.toLowerCase())) return;
    const pid = mapByName.get(name.toLowerCase());
    if (!pid) { unmappedSalesQty += qty; return; }
    mappedSalesQty += qty;
    const use = productUsage(pid);
    if (!use.size) { uncostedProducts += qty; return; }
    use.forEach((perProduct, key) => invConsumed.set(key, (invConsumed.get(key) || 0) + perProduct * qty));
  });

  // Roll inventory consumption up to distribution items.
  const nDays = days || (from && to ? (Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1)) : 28);
  const byDist = {};
  invConsumed.forEach((qtyBase, key) => {
    const distId = distIdByKey.get(key);
    if (!distId) return;
    if (!byDist[distId]) byDist[distId] = { distItemId: distId, qtyBaseUnit: 0 };
    byDist[distId].qtyBaseUnit += qtyBase;
  });
  Object.values(byDist).forEach(d => {
    d.qtyBaseUnit = Math.round(d.qtyBaseUnit * 1000) / 1000;
    d.dailyAvg = Math.round((d.qtyBaseUnit / nDays) * 1000) / 1000;
    d.weeklyAvg = Math.round((d.qtyBaseUnit / nDays) * 7 * 1000) / 1000;
  });

  return {
    storeId, from: from || null, to: to || null, days: nDays,
    byDist,
    mappedSalesQty, unmappedSalesQty, uncostedProducts,
    linkedDistItems: Object.keys(byDist).length,
  };
}

// ── COGS V2 — exact, from flipdish_sales.sale_items (base + modifiers) ───────
// Costs each sold line = product base recipe + matched modifiers. Modifier match
// precedence: product-scoped (attached to that product) first, then global add-on,
// matched by normalised caption (till_caption or name). Flags lines where a
// modifier matched a record but that record has no cost yet. Excludes refunded /
// comped / cancelled. Runs alongside computeStoreTheoreticalCogs for reconciliation.
export async function computeStoreCogsV2({ storeId, from, to } = {}) {
  if (!storeId) throw new Error("storeId required");
  const fromD = from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const toD   = to   || new Date().toISOString().slice(0, 10);
  const [inv, rec, mapsRaw, sales] = await Promise.all([
    fetchInventory(), fetchRecipes(), fetchPosMappings(storeId),
    (async () => {
      const PAGE = 1000, MAX_PAGES = 200; // up to 200k rows safety cap
      let all = [], pageStart = 0;
      for (let p = 0; p < MAX_PAGES; p++) {
        const { data, error } = await supabase.from("flipdish_sales")
          .select("sale_items, is_cancelled")
          .eq("store_id", storeId).gte("business_date", fromD).lte("business_date", toD)
          .order("sale_id", { ascending: true })
          .range(pageStart, pageStart + PAGE - 1);
        if (error) throw error;
        const batch = data || [];
        all = all.concat(batch);
        if (batch.length < PAGE) break;
        pageStart += PAGE;
      }
      return all;
    })(),
  ]);

  const norm = (s) => (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ").replace(/\.+$/, "");

  // cost rollup (same as theoretical)
  const itemById = new Map();
  (inv.store || []).forEach(x => itemById.set("store:" + x.id, x));
  (inv.ck || []).forEach(x => itemById.set("ck:" + x.id, x));
  const itemCost = (scope, id) => { const it = itemById.get(scope + ":" + id); return it && it.costPerBaseUnit != null ? Number(it.costPerBaseUnit) : null; };
  const prepById = new Map((rec.preps || []).map(p => [p.id, p]));
  const prepCost = (prep, _seen) => {
    if (!prep) return null;
    const seen = _seen || new Set();
    if (seen.has(prep.id)) return null; // circular reference guard
    seen.add(prep.id);
    const comps = (rec.prepComponents || []).filter(c => c.prepId === prep.id);
    let out = null;
    if (comps.length && prep.yieldQty) {
      let total = 0, ok = true;
      comps.forEach(c => {
        if (c.kind === "prep" && c.subPrepId) {
          // Nested prep: unit "batch"/blank = qty whole batches; other units (g/ml/ea) =
          // qty in the sub-prep's yield units at its per-unit cost.
          const sub = prepById.get(c.subPrepId);
          const qty = c.portionQty == null || c.portionQty === "" ? 1 : Number(c.portionQty);
          const useBatch = !c.unit || String(c.unit).trim().toLowerCase() === "batch";
          const subPerUnit = sub ? prepCost(sub, seen) : null;
          const unitCost = subPerUnit == null ? null
            : (useBatch ? (sub.yieldQty ? subPerUnit * Number(sub.yieldQty) : null) : subPerUnit);
          if (unitCost == null || isNaN(qty)) ok = false; else total += unitCost * qty;
        } else {
          const u = itemCost(c.itemScope, c.itemId);
          if (u == null || c.portionQty == null) ok = false; else total += u * Number(c.portionQty);
        }
      });
      out = ok ? total / Number(prep.yieldQty) : null;
    }
    seen.delete(prep.id); // path-based: reuse of the same sub-prep in sibling branches is fine
    return out;
  };
  const prepCostPerUnit = (prepId) => prepCost(prepById.get(prepId));
  const productBaseCost = (productId) => {
    const comps = (rec.productComponents || []).filter(c => c.productId === productId && (c.variantId == null));
    if (!comps.length) return { cost: 0, missing: 0, count: 0 }; // empty base = 0 (recipe may be all modifiers)
    let total = 0, missing = 0;
    comps.forEach(c => {
      const unit = c.kind === "prep" ? prepCostPerUnit(c.prepId) : itemCost(c.itemScope, c.itemId);
      if (unit == null || c.portionQty == null) missing++; else total += unit * Number(c.portionQty);
    });
    return { cost: total, missing, count: comps.length };
  };
  const modCostOf = (m) => {
    if (!m) return null;
    if (m.sourceType === "prep") { const u = prepCostPerUnit(m.prepId); return (u != null && m.prepPortion != null) ? u * Number(m.prepPortion) : null; }
    const u = itemCost(m.itemScope, m.itemId); return (u != null && m.portionQty != null) ? u * Number(m.portionQty) : null;
  };

  // modifier lookups
  const modById = new Map((rec.modifiers || []).map(m => [m.id, m]));
  // product-scoped: productId -> Map(captionNorm -> modifier)
  const scopedByProduct = new Map();
  (rec.productModifiers || []).forEach(pm => {
    const m = modById.get(pm.modifierId); if (!m || m.isGlobal) return;
    if (!scopedByProduct.has(pm.productId)) scopedByProduct.set(pm.productId, new Map());
    // match key: explicit till_caption, else the modifier name with group_label stripped, else name
    const key = m.tillCaption ? norm(m.tillCaption)
      : (m.groupLabel ? norm((m.name || "").replace(new RegExp(m.groupLabel, "i"), "")) : norm(m.name));
    scopedByProduct.get(pm.productId).set(key, m);
  });
  // global: captionNorm -> modifier
  const globalByCaption = new Map();
  (rec.modifiers || []).forEach(m => { if (m.isGlobal) globalByCaption.set(norm(m.tillCaption || m.name), m); });
  // explicit per-store caption -> modifier mappings (checked FIRST)
  const modMaps = await fetchModifierMappings(storeId).catch(() => []);
  const mappingByCaption = new Map();
  (modMaps || []).forEach(mm => { const m = modById.get(mm.modifierId); if (m) mappingByCaption.set(norm(mm.caption), m); });

  // POS name -> productId
  const mapByName = new Map();
  (mapsRaw || []).forEach(m => { if (m.posName && m.productId) mapByName.set(norm(m.posName), m.productId); });
  const productName = (id) => (rec.products || []).find(p => p.id === id)?.name || "—";

  let cogs = 0, costedRevenue = 0, totalRevenue = 0, unmappedRevenue = 0, mappedUncosted = 0;
  let modifierCogs = 0, uncostedModifierHits = 0;
  const lineAgg = {}; // productName -> rollup

  sales.forEach(s => {
    if (s.is_cancelled) return;
    const items = Array.isArray(s.sale_items) ? s.sale_items : [];
    items.forEach(li => {
      if (!li || li.isRefunded || li.isComplimented) return;
      const qty = Number(li.quantity) || 1;
      const rev = Number(li.retailPrice != null ? li.retailPrice : li.unitPrice) || 0;
      totalRevenue += rev;
      const pid = mapByName.get(norm(li.caption));
      if (!pid) { unmappedRevenue += rev; return; }
      const base = productBaseCost(pid);
      // modifiers on this line
      const kids = Array.isArray(li.saleItems) ? li.saleItems : [];
      let lineModCost = 0, lineUncostedMod = false;
      const collapseMax = {}; // group_label -> max cost among flagged chosen modifiers
      kids.forEach(ch => {
        const cn = norm(ch && ch.caption);
        if (!cn || cn === "none") return;
        const m = mappingByCaption.get(cn) || (scopedByProduct.get(pid) && scopedByProduct.get(pid).get(cn)) || globalByCaption.get(cn);
        if (!m) return; // unmatched modifier — not costed (shows in discovery)
        const c = modCostOf(m);
        if (c == null) { lineUncostedMod = true; uncostedModifierHits++; return; }
        if (m.collapseToMax) {
          // fixed-portion group (e.g. chocolate): take the single most expensive, once per group
          const g = m.groupLabel || "_collapse";
          if (collapseMax[g] == null || c > collapseMax[g]) collapseMax[g] = c;
        } else {
          lineModCost += c;
        }
      });
      Object.values(collapseMax).forEach(c => { lineModCost += c; });
      const baseCosted = base.missing === 0;
      const lineCost = (baseCosted ? base.cost : 0) + lineModCost;
      const pn = productName(pid);
      const k = pn;
      lineAgg[k] = lineAgg[k] || { productName: pn, revenue: 0, qty: 0, cogs: 0, baseUncosted: false, modUncosted: false };
      lineAgg[k].revenue += rev; lineAgg[k].qty += qty;
      if (!baseCosted) { mappedUncosted += rev; lineAgg[k].baseUncosted = true; }
      else { cogs += base.cost * qty; costedRevenue += rev; }
      cogs += lineModCost * qty; modifierCogs += lineModCost * qty;
      lineAgg[k].cogs += lineCost * qty;
      if (lineUncostedMod) lineAgg[k].modUncosted = true;
    });
  });

  return {
    storeId, from: fromD, to: toD, source: "flipdish_sales",
    cogs: +cogs.toFixed(2),
    modifierCogs: +modifierCogs.toFixed(2),
    totalRevenue: +totalRevenue.toFixed(2),
    costedRevenue: +costedRevenue.toFixed(2),
    unmappedRevenue: +unmappedRevenue.toFixed(2),
    mappedButUncostedRevenue: +mappedUncosted.toFixed(2),
    uncostedModifierHits,
    coverage: totalRevenue > 0 ? costedRevenue / totalRevenue : 0,
    cogsPctOfCosted: costedRevenue > 0 ? cogs / costedRevenue : 0,
    byProduct: Object.values(lineAgg).sort((a, b) => b.revenue - a.revenue),
  };
}

// ── SHARED RECIPE-CONSUMPTION WALKER ─────────────────────────────────────────
// The single traversal used by BOTH computeStoreItemConsumptionV2 (order-page
// planner) and depleteStoreStockFromSales (live stock deduction), so the two
// can never drift: base recipe + matched modifiers (mapping > product-scoped >
// global), collapse-to-max groups, refund/comp line exclusion, cancelled-order
// exclusion. Emits item keys as "scope:itemId" (store:/ck:) via handlers, so
// each caller decides its own rollup (V2 → dist items; depletion → store items).
export function buildRecipeConsumptionWalker(rec, mapsRaw, modMaps) {
  const norm = (s) => (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ").replace(/\.+$/, "");

  const prepById = new Map((rec.preps || []).map(p => [p.id, p]));

  // prepUsage(prepId) -> Map(itemKey -> base-unit qty per 1 YIELD-UNIT of prep).
  // Mirrors prepCost(): batch usage / yieldQty. Nested prep in "batch" unit =
  // qty*sub.yieldQty yield-units of the sub; other units = qty yield-units.
  const prepUsageCache = new Map();
  const prepUsage = (prepId, _seen) => {
    if (prepUsageCache.has(prepId)) return prepUsageCache.get(prepId);
    const prep = prepById.get(prepId);
    const out = new Map();
    if (!prep || !prep.yieldQty) { prepUsageCache.set(prepId, out); return out; }
    const seen = _seen || new Set();
    if (seen.has(prep.id)) return out;
    seen.add(prep.id);
    const comps = (rec.prepComponents || []).filter(c => c.prepId === prep.id);
    comps.forEach(c => {
      if (c.kind === "prep" && c.subPrepId) {
        const sub = prepById.get(c.subPrepId);
        if (!sub) return;
        const qty = c.portionQty == null || c.portionQty === "" ? 1 : Number(c.portionQty);
        const useBatch = !c.unit || String(c.unit).trim().toLowerCase() === "batch";
        const subYieldUnits = useBatch ? qty * Number(sub.yieldQty || 0) : qty;
        const subUse = prepUsage(sub.id, seen);
        subUse.forEach((v, k) => out.set(k, (out.get(k) || 0) + v * subYieldUnits));
      } else {
        const key = c.itemScope + ":" + c.itemId;
        const qty = c.portionQty == null ? 0 : Number(c.portionQty);
        if (qty) out.set(key, (out.get(key) || 0) + qty);
      }
    });
    const y = Number(prep.yieldQty);
    out.forEach((v, k) => out.set(k, v / y));
    seen.delete(prep.id);
    prepUsageCache.set(prepId, out);
    return out;
  };

  // productBaseUsage(productId) -> Map(itemKey -> base-unit qty per 1 product).
  const productUsageCache = new Map();
  const productBaseUsage = (productId) => {
    if (productUsageCache.has(productId)) return productUsageCache.get(productId);
    const out = new Map();
    const comps = (rec.productComponents || []).filter(c => c.productId === productId && c.variantId == null);
    comps.forEach(c => {
      const portion = c.portionQty == null ? 0 : Number(c.portionQty);
      if (c.kind === "prep" && c.prepId) {
        const use = prepUsage(c.prepId);
        use.forEach((v, k) => out.set(k, (out.get(k) || 0) + v * portion));
      } else {
        const key = c.itemScope + ":" + c.itemId;
        if (portion) out.set(key, (out.get(key) || 0) + portion);
      }
    });
    productUsageCache.set(productId, out);
    return out;
  };

  // modUsage(modifier) -> Map(itemKey -> base-unit qty for one modifier hit).
  const modUsageOf = (m) => {
    const out = new Map();
    if (!m) return out;
    if (m.sourceType === "prep") {
      if (m.prepId != null && m.prepPortion != null) {
        const use = prepUsage(m.prepId);
        use.forEach((v, k) => out.set(k, (out.get(k) || 0) + v * Number(m.prepPortion)));
      }
    } else if (m.itemScope && m.itemId != null && m.portionQty != null) {
      out.set(m.itemScope + ":" + m.itemId, Number(m.portionQty));
    }
    return out;
  };

  // Modifier lookups: explicit caption mapping > product-scoped > global.
  const modById = new Map((rec.modifiers || []).map(m => [m.id, m]));
  const scopedByProduct = new Map();
  (rec.productModifiers || []).forEach(pm => {
    const m = modById.get(pm.modifierId); if (!m || m.isGlobal) return;
    if (!scopedByProduct.has(pm.productId)) scopedByProduct.set(pm.productId, new Map());
    const key = m.tillCaption ? norm(m.tillCaption)
      : (m.groupLabel ? norm((m.name || "").replace(new RegExp(m.groupLabel, "i"), "")) : norm(m.name));
    scopedByProduct.get(pm.productId).set(key, m);
  });
  const globalByCaption = new Map();
  (rec.modifiers || []).forEach(m => { if (m.isGlobal) globalByCaption.set(norm(m.tillCaption || m.name), m); });
  const mappingByCaption = new Map();
  (modMaps || []).forEach(mm => { const m = modById.get(mm.modifierId); if (m) mappingByCaption.set(norm(mm.caption), m); });

  const mapByName = new Map();
  (mapsRaw || []).forEach(m => { if (m.posName && m.productId) mapByName.set(norm(m.posName), m.productId); });

  const productNameById = (id) => (rec.products || []).find(p => p.id === id)?.name || `#${id}`;

  // walkSale(sale, handlers) — handlers: {
  //   addUsage(useMap, mult, ctx)   REQUIRED — receives Map(itemKey -> qty) per hit
  //   onMapped(qty), onUnmapped(normCaption, qty)   optional counters
  // }
  const walkSale = (s, h) => {
    if (!s || s.is_cancelled) return;
    let items = s.sale_items;
    if (typeof items === "string") { try { items = JSON.parse(items); } catch { items = []; } }
    if (!Array.isArray(items)) items = [];
    items.forEach(li => {
      if (!li || li.isRefunded || li.isComplimented) return;
      const qty = Number(li.quantity) || 1;
      const pid = mapByName.get(norm(li.caption));
      if (!pid) { h.onUnmapped && h.onUnmapped(norm(li.caption), qty); return; }
      h.onMapped && h.onMapped(qty);
      const pn = productNameById(pid);
      h.addUsage(productBaseUsage(pid), qty, { product: pn, isMod: false });
      const kids = Array.isArray(li.saleItems) ? li.saleItems : [];
      const collapseChosen = {};
      kids.forEach(ch => {
        const cn = norm(ch && ch.caption);
        if (!cn || cn === "none") return;
        const m = mappingByCaption.get(cn) || (scopedByProduct.get(pid) && scopedByProduct.get(pid).get(cn)) || globalByCaption.get(cn);
        if (!m) return;
        const use = modUsageOf(m);
        if (!use.size) return;
        if (m.collapseToMax) {
          const g = m.groupLabel || "_collapse";
          if (!collapseChosen[g]) collapseChosen[g] = use;
        } else {
          h.addUsage(use, qty, { product: pn, isMod: true });
        }
      });
      Object.values(collapseChosen).forEach(use => h.addUsage(use, qty, { product: pn, isMod: true }));
    });
  };

  return { walkSale, norm };
}

// ── ITEM CONSUMPTION V2 — accurate, from flipdish_sales.sale_items ──────────
// Mirrors computeStoreCogsV2 EXACTLY (base recipe + matched modifiers, collapse
// groups, refund/comp exclusion) but accumulates base-unit QUANTITY of each
// inventory item, then rolls up to distribution items. This is the accurate
// consumption source (includes modifiers/add-ons that the product-base recipe
// alone misses). Returns { byDist: { distItemId: { qtyBaseUnit, dailyAvg,
// weeklyAvg } }, days, ... }.
export async function computeStoreItemConsumptionV2({ storeId, from, to, days, debugDistId, _testData } = {}) {
  if (!storeId) throw new Error("storeId required");
  const fromD = from || new Date(Date.now() - 27 * 864e5).toISOString().slice(0, 10);
  const toD   = to   || new Date().toISOString().slice(0, 10);
  const [inv, rec, mapsRaw, sales] = _testData ? [_testData.inv, _testData.rec, _testData.maps, _testData.sales] : await Promise.all([
    fetchInventory(), fetchRecipes(), fetchPosMappings(storeId),
    (async () => {
      const PAGE = 1000, MAX_PAGES = 200;
      let all = [], pageStart = 0;
      for (let p = 0; p < MAX_PAGES; p++) {
        const { data, error } = await supabase.from("flipdish_sales")
          .select("sale_items, is_cancelled")
          .eq("store_id", storeId).gte("business_date", fromD).lte("business_date", toD)
          .order("sale_id", { ascending: true })
          .range(pageStart, pageStart + PAGE - 1);
        if (error) throw error;
        const batch = data || [];
        all = all.concat(batch);
        if (batch.length < PAGE) break;
        pageStart += PAGE;
      }
      return all;
    })(),
  ]);
  // store inventory item key -> distItemId (CK excluded — separate entity).
  const distIdByKey = new Map();
  (inv.store || []).forEach(x => { if (x.distItemId) distIdByKey.set("store:" + x.id, x.distItemId); });

  const modMaps = _testData ? (_testData.modMaps || []) : await fetchModifierMappings(storeId).catch(() => []);
  // Single shared traversal (same one depleteStoreStockFromSales uses).
  const walker = buildRecipeConsumptionWalker(rec, mapsRaw, modMaps);

  // Walk actual sold lines + chosen modifiers, accumulating item consumption.
  const invConsumed = new Map();
  let mappedLines = 0, unmappedLines = 0;
  // Debug: for one target DIST item, track consumption per product and the
  // top unmapped sale captions, to locate where consumption is lost. A dist item
  // may map to several inventory keys.
  const debugKeys = new Set();
  if (debugDistId) distIdByKey.forEach((distId, key) => { if (distId === debugDistId) debugKeys.add(key); });
  const dbg = debugDistId ? { byProduct: {}, unmapped: {}, fromBase: 0, fromMod: 0 } : null;
  const addUsage = (useMap, mult, ctx) => {
    useMap.forEach((v, k) => {
      invConsumed.set(k, (invConsumed.get(k) || 0) + v * mult);
      if (dbg && debugKeys.has(k)) {
        const pn = ctx?.product || "—";
        dbg.byProduct[pn] = (dbg.byProduct[pn] || 0) + v * mult;
        if (ctx?.isMod) dbg.fromMod += v * mult; else dbg.fromBase += v * mult;
      }
    });
  };

  sales.forEach(s => walker.walkSale(s, {
    addUsage,
    onMapped: (q) => { mappedLines += q; },
    onUnmapped: (cap, q) => {
      unmappedLines += q;
      if (dbg) dbg.unmapped[cap] = (dbg.unmapped[cap] || 0) + q;
    },
  }));

  // Roll up to dist items. Also attach the INVENTORY item's base unit + case
  // size (pack_qty), which is the accurate basis for converting consumption
  // (in base units) to order units. dist_items' own pack fields can differ, so
  // the recipe/inventory pack_qty is authoritative for the conversion.
  const invByDist = new Map();
  (inv.store || []).forEach(x => { if (x.distItemId && !invByDist.has(x.distItemId)) invByDist.set(x.distItemId, x); });
  const nDays = days || (Math.max(1, Math.round((new Date(toD) - new Date(fromD)) / 864e5) + 1));
  const byDist = {};
  invConsumed.forEach((qtyBase, key) => {
    const distId = distIdByKey.get(key);
    if (!distId) return;
    if (!byDist[distId]) byDist[distId] = { distItemId: distId, qtyBaseUnit: 0 };
    byDist[distId].qtyBaseUnit += qtyBase;
  });
  Object.values(byDist).forEach(d => {
    const invItem = invByDist.get(d.distItemId);
    d.baseUnit = invItem?.baseUnit || null;         // g / ml / ea
    d.packQty = invItem?.packQty != null ? Number(invItem.packQty) : null; // base-units per order case
    d.qtyBaseUnit = Math.round(d.qtyBaseUnit * 1000) / 1000;
    d.dailyAvg = Math.round((d.qtyBaseUnit / nDays) * 1000) / 1000;
    d.weeklyAvg = Math.round((d.qtyBaseUnit / nDays) * 7 * 1000) / 1000;
  });

  return {
    storeId, from: fromD, to: toD, days: nDays, source: "flipdish_sales.sale_items",
    byDist, mappedLines, unmappedLines,
    linkedDistItems: Object.keys(byDist).length,
    debug: dbg ? {
      distId: debugDistId,
      invKeys: Array.from(debugKeys),
      totalForItem: Math.round(Array.from(debugKeys).reduce((a, k) => a + (invConsumed.get(k) || 0), 0) * 10) / 10,
      fromBase: Math.round(dbg.fromBase * 10) / 10,
      fromModifiers: Math.round(dbg.fromMod * 10) / 10,
      byProduct: Object.entries(dbg.byProduct).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([p, v]) => ({ product: p, qty: Math.round(v * 10) / 10 })),
      topUnmapped: Object.entries(dbg.unmapped).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([c, n]) => ({ caption: c, lines: n })),
    } : undefined,
  };
}

// ── TILL ORDER AUDIT — real flipdish_sales orders with full per-line COGS ────
// Same costing logic as computeStoreCogsV2, but returns each order with its
// line-by-line build-up (base + each matched modifier, collapse shown) so the
// COGS can be eyeballed for accuracy. Scoped to one store + single date.
export async function auditTillOrders({ storeId, date, channel = "POS", limit = 200 } = {}) {
  if (!storeId) throw new Error("storeId required");
  if (!date) throw new Error("date required");
  const [inv, rec, mapsRaw, salesRaw] = await Promise.all([
    fetchInventory(), fetchRecipes(), fetchPosMappings(storeId),
    (async () => {
      let q = supabase.from("flipdish_sales")
        .select("sale_id, channel, sale_time, sale_items, is_cancelled, amount_total")
        .eq("store_id", storeId).eq("business_date", date)
        .order("sale_time", { ascending: false }).limit(limit);
      if (channel && channel !== "all") q = q.eq("channel", channel);
      const { data, error } = await q; if (error) throw error; return data || [];
    })(),
  ]);

  const norm = (s) => (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ").replace(/\.+$/, "");
  const itemById = new Map();
  (inv.store || []).forEach(x => itemById.set("store:" + x.id, x));
  (inv.ck || []).forEach(x => itemById.set("ck:" + x.id, x));
  const itemCost = (scope, id) => { const it = itemById.get(scope + ":" + id); return it && it.costPerBaseUnit != null ? Number(it.costPerBaseUnit) : null; };
  const prepById = new Map((rec.preps || []).map(p => [p.id, p]));
  const prepBatchCost = (prep, _seen) => {
    if (!prep) return null;
    const seen = _seen || new Set();
    if (seen.has(prep.id)) return null;
    seen.add(prep.id);
    const comps = (rec.prepComponents || []).filter(c => c.prepId === prep.id);
    if (!comps.length) return null;
    let total = 0, ok = true;
    comps.forEach(c => {
      if (c.kind === "prep" && c.subPrepId) {
        const sub = prepById.get(c.subPrepId);
        const subBatch = sub ? prepBatchCost(sub, seen) : null;
        const qty = c.portionQty == null || c.portionQty === "" ? 1 : Number(c.portionQty);
        // unit "batch"/blank = qty whole batches; other units = qty in yield units at batchCost/yieldQty
        const useBatch = !c.unit || String(c.unit).trim().toLowerCase() === "batch";
        const unitCost = subBatch == null ? null
          : (useBatch ? subBatch : (sub && sub.yieldQty ? subBatch / Number(sub.yieldQty) : null));
        if (unitCost == null || isNaN(qty)) ok = false; else total += unitCost * qty;
      } else {
        const u = itemCost(c.itemScope, c.itemId);
        if (u == null || c.portionQty == null) ok = false; else total += u * Number(c.portionQty);
      }
    });
    seen.delete(prep.id); // path-based cycle guard: sibling reuse of a sub-prep is fine
    return ok ? total : null;
  };
  const prepCost = (prep) => {
    if (!prep || !prep.yieldQty) return null;
    const batch = prepBatchCost(prep);
    return batch != null ? batch / Number(prep.yieldQty) : null;
  };
  const prepCostPerUnit = (prepId) => prepCost(prepById.get(prepId));
  const productBaseCost = (productId) => {
    const comps = (rec.productComponents || []).filter(c => c.productId === productId && (c.variantId == null));
    if (!comps.length) return { cost: 0, missing: 0, count: 0 };
    let total = 0, missing = 0;
    comps.forEach(c => { const unit = c.kind === "prep" ? prepCostPerUnit(c.prepId) : itemCost(c.itemScope, c.itemId); if (unit == null || c.portionQty == null) missing++; else total += unit * Number(c.portionQty); });
    return { cost: total, missing, count: comps.length };
  };
  const modCostOf = (m) => {
    if (!m) return null;
    if (m.sourceType === "prep") { const u = prepCostPerUnit(m.prepId); return (u != null && m.prepPortion != null) ? u * Number(m.prepPortion) : null; }
    const u = itemCost(m.itemScope, m.itemId); return (u != null && m.portionQty != null) ? u * Number(m.portionQty) : null;
  };
  const modById = new Map((rec.modifiers || []).map(m => [m.id, m]));
  const scopedByProduct = new Map();
  (rec.productModifiers || []).forEach(pm => {
    const m = modById.get(pm.modifierId); if (!m || m.isGlobal) return;
    if (!scopedByProduct.has(pm.productId)) scopedByProduct.set(pm.productId, new Map());
    const key = m.tillCaption ? norm(m.tillCaption) : (m.groupLabel ? norm((m.name || "").replace(new RegExp(m.groupLabel, "i"), "")) : norm(m.name));
    scopedByProduct.get(pm.productId).set(key, m);
  });
  const globalByCaption = new Map();
  (rec.modifiers || []).forEach(m => { if (m.isGlobal) globalByCaption.set(norm(m.tillCaption || m.name), m); });
  const modMaps = await fetchModifierMappings(storeId).catch(() => []);
  const mappingByCaption = new Map();
  (modMaps || []).forEach(mm => { const m = modById.get(mm.modifierId); if (m) mappingByCaption.set(norm(mm.caption), m); });
  const mapByName = new Map();
  (mapsRaw || []).forEach(m => { if (m.posName && m.productId) mapByName.set(norm(m.posName), m.productId); });
  const productName = (id) => (rec.products || []).find(p => p.id === id)?.name || "—";

  const orders = (salesRaw || []).filter(s => !s.is_cancelled).map(s => {
    const items = Array.isArray(s.sale_items) ? s.sale_items : [];
    let orderCogs = 0, orderRevenue = 0;
    const lines = items.filter(li => li && !li.isRefunded && !li.isComplimented).map(li => {
      const rev = Number(li.retailPrice != null ? li.retailPrice : li.unitPrice) || 0;
      orderRevenue += rev;
      const pid = mapByName.get(norm(li.caption));
      // Even if the parent line isn't mapped to a product, it may still carry
      // costable nested modifiers (e.g. a £0 "Soft Swirl Ice Cream Tubs" parent
      // whose chosen swirl is a global modifier). So we no longer bail here —
      // we cost the base recipe only if mapped, but always descend into children.
      const base = pid != null ? productBaseCost(pid) : { cost: 0, missing: 0, count: 0 };
      const parts = pid != null ? [{ label: "base recipe", cost: base.missing === 0 ? base.cost : null, kind: "base" }] : [];
      const kids = Array.isArray(li.saleItems) ? li.saleItems : [];
      const collapseMax = {}; // group -> {cost, captions:[]}
      let modSum = 0;
      kids.forEach(ch => {
        const cn = norm(ch && ch.caption); if (!cn || cn === "none") return;
        const scoped = scopedByProduct.get(pid) && scopedByProduct.get(pid).get(cn);
        const m = mappingByCaption.get(cn) || scoped || globalByCaption.get(cn);
        if (!m) { parts.push({ label: ch.caption, cost: null, kind: "unmatched" }); return; }
        const c = modCostOf(m);
        const scope = scoped ? "scoped" : "global";
        if (m.collapseToMax) {
          const g = m.groupLabel || "_c";
          if (!collapseMax[g]) collapseMax[g] = { cost: c, captions: [ch.caption], group: g };
          else { collapseMax[g].captions.push(ch.caption); if (c != null && (collapseMax[g].cost == null || c > collapseMax[g].cost)) collapseMax[g].cost = c; }
        } else {
          if (c != null) modSum += c;
          parts.push({ label: ch.caption, cost: c, kind: scope });
        }
      });
      Object.values(collapseMax).forEach(g => {
        if (g.cost != null) modSum += g.cost;
        parts.push({ label: `${g.group} (max of ${g.captions.length}: ${g.captions.join(", ")})`, cost: g.cost, kind: "collapse" });
      });
      const lineCogs = (pid != null && base.missing === 0 ? base.cost : 0) + modSum;
      orderCogs += lineCogs;
      // mapped = true if we matched a product OR costed at least one nested modifier.
      const costedAnyMod = parts.some(p => (p.kind === "global" || p.kind === "scoped" || p.kind === "collapse") && p.cost != null);
      return {
        caption: li.caption, revenue: rev,
        mapped: pid != null || costedAnyMod,
        parentUnmapped: pid == null && costedAnyMod, // modifier costed under an unmapped parent
        baseUncosted: pid != null && base.missing > 0,
        cogs: +lineCogs.toFixed(4), parts,
      };
    });
    return {
      saleId: s.sale_id, channel: s.channel, time: s.sale_time,
      amountTotal: Number(s.amount_total) || 0,
      revenue: +orderRevenue.toFixed(2), cogs: +orderCogs.toFixed(2),
      cogsPct: orderRevenue > 0 ? orderCogs / orderRevenue : null,
      lines,
    };
  });
  return { storeId, date, channel, orderCount: orders.length, orders };
}

// Consumption counterpart of auditTillOrders: for each real order, the base-unit
// QUANTITY of each inventory/dist item consumed, line by line (base recipe +
// matched modifiers). Same recipe traversal as computeStoreItemConsumptionV2,
// so the till audit's consumption view reconciles with the stock popup.
export async function auditTillConsumption({ storeId, date, channel = "POS", limit = 200 } = {}) {
  if (!storeId) throw new Error("storeId required");
  if (!date) throw new Error("date required");
  const [inv, rec, mapsRaw, salesRaw] = await Promise.all([
    fetchInventory(), fetchRecipes(), fetchPosMappings(storeId),
    (async () => {
      let q = supabase.from("flipdish_sales")
        .select("sale_id, channel, sale_time, sale_items, is_cancelled, amount_total")
        .eq("store_id", storeId).eq("business_date", date)
        .order("sale_time", { ascending: false }).limit(limit);
      if (channel && channel !== "all") q = q.eq("channel", channel);
      const { data, error } = await q; if (error) throw error; return data || [];
    })(),
  ]);
  const norm = (s) => (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ").replace(/\.+$/, "");
  const itemById = new Map();
  (inv.store || []).forEach(x => itemById.set("store:" + x.id, x));
  const nameOf = (key) => itemById.get(key)?.name || key;
  const unitOf = (key) => itemById.get(key)?.baseUnit || "";
  const prepById = new Map((rec.preps || []).map(p => [p.id, p]));

  // prepUsage(prepId) -> Map(itemKey -> qty per 1 yield-unit). Same as engine.
  const prepUsageCache = new Map();
  const prepUsage = (prepId, _seen) => {
    if (prepUsageCache.has(prepId)) return prepUsageCache.get(prepId);
    const prep = prepById.get(prepId);
    const out = new Map();
    if (!prep || !prep.yieldQty) { prepUsageCache.set(prepId, out); return out; }
    const seen = _seen || new Set();
    if (seen.has(prep.id)) return out;
    seen.add(prep.id);
    (rec.prepComponents || []).filter(c => c.prepId === prep.id).forEach(c => {
      if (c.kind === "prep" && c.subPrepId) {
        const sub = prepById.get(c.subPrepId); if (!sub) return;
        const qty = c.portionQty == null || c.portionQty === "" ? 1 : Number(c.portionQty);
        const useBatch = !c.unit || String(c.unit).trim().toLowerCase() === "batch";
        const subYieldUnits = useBatch ? qty * Number(sub.yieldQty || 0) : qty;
        prepUsage(sub.id, seen).forEach((v, k) => out.set(k, (out.get(k) || 0) + v * subYieldUnits));
      } else {
        const qty = c.portionQty == null ? 0 : Number(c.portionQty);
        if (qty) out.set(c.itemScope + ":" + c.itemId, (out.get(c.itemScope + ":" + c.itemId) || 0) + qty);
      }
    });
    const y = Number(prep.yieldQty);
    out.forEach((v, k) => out.set(k, v / y));
    seen.delete(prep.id);
    prepUsageCache.set(prepId, out);
    return out;
  };
  const productUsageCache = new Map();
  const productBaseUsage = (productId) => {
    if (productUsageCache.has(productId)) return productUsageCache.get(productId);
    const out = new Map();
    (rec.productComponents || []).filter(c => c.productId === productId && c.variantId == null).forEach(c => {
      const portion = c.portionQty == null ? 0 : Number(c.portionQty);
      if (c.kind === "prep" && c.prepId) prepUsage(c.prepId).forEach((v, k) => out.set(k, (out.get(k) || 0) + v * portion));
      else if (portion) out.set(c.itemScope + ":" + c.itemId, (out.get(c.itemScope + ":" + c.itemId) || 0) + portion);
    });
    productUsageCache.set(productId, out);
    return out;
  };
  const modUsageOf = (m) => {
    const out = new Map();
    if (!m) return out;
    if (m.sourceType === "prep") {
      if (m.prepId != null && m.prepPortion != null) prepUsage(m.prepId).forEach((v, k) => out.set(k, (out.get(k) || 0) + v * Number(m.prepPortion)));
    } else if (m.itemScope && m.itemId != null && m.portionQty != null) out.set(m.itemScope + ":" + m.itemId, Number(m.portionQty));
    return out;
  };
  // modifier lookups (same as engine)
  const modById = new Map((rec.modifiers || []).map(m => [m.id, m]));
  const scopedByProduct = new Map();
  (rec.productModifiers || []).forEach(pm => {
    const m = modById.get(pm.modifierId); if (!m || m.isGlobal) return;
    if (!scopedByProduct.has(pm.productId)) scopedByProduct.set(pm.productId, new Map());
    const key = m.tillCaption ? norm(m.tillCaption) : (m.groupLabel ? norm((m.name || "").replace(new RegExp(m.groupLabel, "i"), "")) : norm(m.name));
    scopedByProduct.get(pm.productId).set(key, m);
  });
  const globalByCaption = new Map();
  (rec.modifiers || []).forEach(m => { if (m.isGlobal) globalByCaption.set(norm(m.tillCaption || m.name), m); });
  const modMaps = await fetchModifierMappings(storeId).catch(() => []);
  const mappingByCaption = new Map();
  (modMaps || []).forEach(mm => { const m = modById.get(mm.modifierId); if (m) mappingByCaption.set(norm(mm.caption), m); });
  const mapByName = new Map();
  (mapsRaw || []).forEach(m => { if (m.posName && m.productId) mapByName.set(norm(m.posName), m.productId); });

  const fmt = (usageMap) => Array.from(usageMap.entries())
    .map(([k, qty]) => ({ item: nameOf(k), unit: unitOf(k), qty: Math.round(qty * 1000) / 1000 }))
    .filter(x => x.qty > 0)
    .sort((a, b) => b.qty - a.qty);

  const orders = (salesRaw || []).filter(s => !s.is_cancelled).map(s => {
    const items = Array.isArray(s.sale_items) ? s.sale_items : [];
    const orderTotal = new Map();
    const lines = items.filter(li => li && !li.isRefunded && !li.isComplimented).map(li => {
      const qty = Number(li.quantity) || 1;
      const pid = mapByName.get(norm(li.caption));
      const lineUsage = new Map();
      const parts = [];
      if (pid == null) {
        parts.push({ label: li.caption, kind: "unmapped", items: [] });
      } else {
        const base = productBaseUsage(pid);
        const baseScaled = new Map(); base.forEach((v, k) => baseScaled.set(k, v * qty));
        baseScaled.forEach((v, k) => lineUsage.set(k, (lineUsage.get(k) || 0) + v));
        parts.push({ label: "base recipe", kind: "base", items: fmt(baseScaled) });
        const kids = Array.isArray(li.saleItems) ? li.saleItems : [];
        const collapse = {};
        kids.forEach(ch => {
          const cn = norm(ch && ch.caption); if (!cn || cn === "none") return;
          const m = mappingByCaption.get(cn) || (scopedByProduct.get(pid) && scopedByProduct.get(pid).get(cn)) || globalByCaption.get(cn);
          if (!m) { parts.push({ label: ch.caption, kind: "unmatched", items: [] }); return; }
          const use = modUsageOf(m); if (!use.size) return;
          const scaled = new Map(); use.forEach((v, k) => scaled.set(k, v * qty));
          const kind = m.isGlobal ? "global" : "scoped";
          if (m.collapseToMax) { const g = m.groupLabel || "_c"; if (!collapse[g]) collapse[g] = { use: scaled, label: ch.caption, kind: "collapse" }; }
          else { scaled.forEach((v, k) => lineUsage.set(k, (lineUsage.get(k) || 0) + v)); parts.push({ label: ch.caption, kind, items: fmt(scaled) }); }
        });
        Object.values(collapse).forEach(g => { g.use.forEach((v, k) => lineUsage.set(k, (lineUsage.get(k) || 0) + v)); parts.push({ label: g.label, kind: "collapse", items: fmt(g.use) }); });
      }
      lineUsage.forEach((v, k) => orderTotal.set(k, (orderTotal.get(k) || 0) + v));
      return { caption: li.caption, qty, mapped: pid != null, parts, items: fmt(lineUsage) };
    });
    return { saleId: s.sale_id, time: s.sale_time, channel: s.channel, revenue: Number(s.amount_total) || 0, items: fmt(orderTotal), lines };
  });
  return { storeId, date, channel, orderCount: orders.length, orders };
}

export async function fetchIgnoredTillNames(storeId) {
  let q = supabase.from("cogs_ignored_till_names").select("*");
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(r => ({ id: r.id, storeId: r.store_id, posName: r.pos_name }));
}
export async function ignoreTillName(storeId, posName, by = null) {
  if (!storeId || !posName?.trim()) throw new Error("store and name required");
  const name = posName.trim();
  // Already ignored? (case-insensitive, matching the functional unique index)
  const { data: existing } = await supabase.from("cogs_ignored_till_names")
    .select("id, store_id, pos_name").eq("store_id", storeId).ilike("pos_name", name).maybeSingle();
  if (existing) return { id: existing.id, storeId: existing.store_id, posName: existing.pos_name };
  const { data, error } = await supabase.from("cogs_ignored_till_names")
    .insert({ store_id: storeId, pos_name: name, created_by: by || null })
    .select().maybeSingle();
  if (error) {
    if (String(error.message || "").toLowerCase().includes("duplicate")) return null; // race: already added
    throw error;
  }
  return data ? { id: data.id, storeId: data.store_id, posName: data.pos_name } : null;
}
export async function unignoreTillName(id) {
  const { error } = await supabase.from("cogs_ignored_till_names").delete().eq("id", id);
  if (error) throw error;
  return id;
}

// ── ORDER SIMULATOR: replay real Flipdish orders, cost each basket ───────────
// Covers online/Flipdish orders only (in-store till sales aren't stored as
// individual orders). Costs each line via the same POS-name → recipe path used
// by theoretical COGS, and returns per-order COGS, sale total and margin.
export async function simulateFlipdishOrders({ storeId, from, to, limit = 1000 } = {}) {
  if (!storeId) throw new Error("storeId required");
  const [inv, rec, mapsRaw, fStores, orders, ignoredRaw] = await Promise.all([
    fetchInventory(), fetchRecipes(), fetchPosMappings(storeId), fetchFlipdishStores(),
    fetchFlipdishOrders({ from, to, limit }), fetchIgnoredTillNames(storeId).catch(() => []),
  ]);

  // Which flipdish store rows are linked to this internal store? The explicit
  // link is flipdish_stores.store_id === our store id. An order's store field
  // may carry either the flipdish row id or the flipdish RMS store id, so we
  // match against both to be safe.
  const linkedFStores = (fStores || []).filter(fs => fs.storeId === storeId);
  const fStoreIds = new Set();
  linkedFStores.forEach(fs => { if (fs.id != null) fStoreIds.add(String(fs.id)); if (fs.storeId != null) fStoreIds.add(String(fs.storeId)); });
  const orderStoreId = (o) => String(o.flipdishStoreId ?? "");

  // Cost rollup (same logic as theoretical COGS).
  const itemById = new Map();
  (inv.store || []).forEach(x => itemById.set("store:" + x.id, x));
  (inv.ck || []).forEach(x => itemById.set("ck:" + x.id, x));
  const itemCost = (scope, id) => { const it = itemById.get(scope + ":" + id); return it && it.costPerBaseUnit != null ? Number(it.costPerBaseUnit) : null; };
  const prepById = new Map((rec.preps || []).map(p => [p.id, p]));
  const prepCost = (prep, _seen) => {
    if (!prep) return null;
    const seen = _seen || new Set();
    if (seen.has(prep.id)) return null; // circular reference guard
    seen.add(prep.id);
    const comps = (rec.prepComponents || []).filter(c => c.prepId === prep.id);
    let out = null;
    if (comps.length && prep.yieldQty) {
      let total = 0, ok = true;
      comps.forEach(c => {
        if (c.kind === "prep" && c.subPrepId) {
          // Nested prep: unit "batch"/blank = qty whole batches; other units (g/ml/ea) =
          // qty in the sub-prep's yield units at its per-unit cost.
          const sub = prepById.get(c.subPrepId);
          const qty = c.portionQty == null || c.portionQty === "" ? 1 : Number(c.portionQty);
          const useBatch = !c.unit || String(c.unit).trim().toLowerCase() === "batch";
          const subPerUnit = sub ? prepCost(sub, seen) : null;
          const unitCost = subPerUnit == null ? null
            : (useBatch ? (sub.yieldQty ? subPerUnit * Number(sub.yieldQty) : null) : subPerUnit);
          if (unitCost == null || isNaN(qty)) ok = false; else total += unitCost * qty;
        } else {
          const u = itemCost(c.itemScope, c.itemId);
          if (u == null || c.portionQty == null) ok = false; else total += u * Number(c.portionQty);
        }
      });
      out = ok ? total / Number(prep.yieldQty) : null;
    }
    seen.delete(prep.id); // path-based: reuse of the same sub-prep in sibling branches is fine
    return out;
  };
  const prepCostPerUnit = (prepId) => prepCost(prepById.get(prepId));
  const productCost = (productId) => {
    const comps = (rec.productComponents || []).filter(c => c.productId === productId && (c.variantId == null));
    if (!comps.length) return null;
    let total = 0, missing = 0;
    comps.forEach(c => { const unit = c.kind === "prep" ? prepCostPerUnit(c.prepId) : itemCost(c.itemScope, c.itemId); if (unit == null || c.portionQty == null) missing++; else total += unit * Number(c.portionQty); });
    return missing ? null : total;
  };
  const prodNameById = new Map((rec.products || []).map(p => [p.id, p.name]));
  const mapByName = new Map();
  (mapsRaw || []).forEach(m => { if (m.posName && m.productId) mapByName.set(m.posName.trim().toLowerCase(), m.productId); });
  const ignoredSet = new Set((ignoredRaw || []).map(i => (i.posName || "").trim().toLowerCase()));
  const costCache = new Map();
  const costFor = (pid) => { if (!costCache.has(pid)) costCache.set(pid, productCost(pid)); return costCache.get(pid); };

  // Defensive line-field extraction (Flipdish item shapes vary).
  const lineName = (li) => (li.name || li.itemName || li.menuItemName || li.product || li.title || "").toString();
  const lineQty  = (li) => Number(li.quantity ?? li.qty ?? li.count ?? 1) || 1;
  const linePrice = (li) => Number(li.price ?? li.unitPrice ?? li.amount ?? li.total ?? 0) || 0;

  const simOrders = [];
  let totCogs = 0, totSale = 0, costedLines = 0, totalLines = 0;
  let ordersInWindow = (orders || []).length, ordersMatchedStore = 0;
  const sampleOrderStoreIds = [...new Set((orders || []).slice(0, 200).map(o => orderStoreId(o)))].slice(0, 12);
  (orders || []).forEach(o => {
    if (fStoreIds.size && !fStoreIds.has(orderStoreId(o))) return; // not this store
    ordersMatchedStore++;
    const items = Array.isArray(o.items) ? o.items : [];
    if (!items.length) return;
    let orderCogs = 0; const lines = []; let anyCosted = false;
    items.forEach(li => {
      const nm = lineName(li).trim(); if (!nm) return;
      const qty = lineQty(li), price = linePrice(li);
      totalLines++;
      const ignored = ignoredSet.has(nm.toLowerCase());
      const pid = ignored ? null : mapByName.get(nm.toLowerCase());
      let unitCost = null, status = "unmapped", prodNm = null;
      if (pid) { prodNm = prodNameById.get(pid) || null; const c = costFor(pid); if (c != null) { unitCost = c; status = "costed"; } else status = "uncosted"; }
      else if (ignored) status = "ignored";
      const lineCogs = unitCost != null ? unitCost * qty : 0;
      if (status === "costed") { anyCosted = true; costedLines++; }
      orderCogs += lineCogs;
      lines.push({ name: nm, productName: prodNm, qty, price, lineSale: +(price * qty).toFixed(2), unitCost: unitCost != null ? +unitCost.toFixed(4) : null, lineCogs: +lineCogs.toFixed(2), status });
    });
    const sale = o.amountSubtotal || o.amountTotal || lines.reduce((a, l) => a + l.lineSale, 0);
    totCogs += orderCogs; totSale += sale;
    simOrders.push({
      id: o.id, time: o.orderPlacedTime, channel: o.channel, orderType: o.orderType,
      sale: +sale.toFixed(2), cogs: +orderCogs.toFixed(2),
      gp: +(sale - orderCogs).toFixed(2), marginPct: sale > 0 ? (sale - orderCogs) / sale : null,
      anyCosted, lines,
    });
  });
  simOrders.sort((a, b) => (b.time || "").localeCompare(a.time || ""));
  return {
    storeId, from: from || null, to: to || null,
    orderCount: simOrders.length,
    totalSale: +totSale.toFixed(2), totalCogs: +totCogs.toFixed(2),
    totalGp: +(totSale - totCogs).toFixed(2),
    avgMarginPct: totSale > 0 ? (totSale - totCogs) / totSale : null,
    lineCoverage: totalLines > 0 ? costedLines / totalLines : 0,
    orders: simOrders,
    diag: {
      linkedFlipdishStores: linkedFStores.length,
      linkedIds: [...fStoreIds].slice(0, 12),
      ordersInWindow,
      ordersMatchedStore,
      sampleOrderStoreIds,
    },
  };
}

// ============================================================================
// DISTRIBUTION — PHASE 1 DATA LAYER (foundation: tax, contacts, items,
// batches, append-only stock ledger + derived on-hand/available).
// Stock is NEVER stored; on-hand is always SUM(dist_stock_movements.qty).
// Tables: dist_tax_rates, dist_contacts, dist_items, dist_batches,
//         dist_stock_movements.
// ============================================================================

const distId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ── Mappers (snake -> camel) ────────────────────────────────────────────────
const mapDistTaxRate = (r) => ({ id: r.id, name: r.name || "", percent: Number(r.percent) || 0, active: r.active !== false });
const mapDistContact = (c) => ({
  id: c.id, kind: c.kind || "customer", displayName: c.display_name || "", companyName: c.company_name || "",
  storeId: c.store_id || null, entityId: c.entity_id || null, isCentralKitchen: !!c.is_central_kitchen,
  visibleToStores: !!c.visible_to_stores,  // vendors only: may stores see/pick this supplier?
  email: c.email || "", phone: c.phone || "", billingAddress: c.billing_address || "", shippingAddress: c.shipping_address || "",
  openingBalance: Number(c.opening_balance) || 0, active: c.active !== false, createdAt: c.created_at,
  salutation: c.salutation || "", firstName: c.first_name || "", lastName: c.last_name || "",
  workPhone: c.work_phone || "", mobile: c.mobile || "", currencyCode: c.currency_code || "GBP",
  website: c.website || "", notes: c.notes || "", paymentTerms: c.payment_terms || "due_on_receipt",
  accountsPayableCode: c.accounts_payable_code || "2000", companyRegNo: c.company_reg_no || "",
  billingAttention: c.billing_attention || "", shippingAttention: c.shipping_attention || "",
});
const mapDistItem = (i) => ({
  id: i.id, sku: i.sku || "", name: i.name || "", category: i.category || "",
  packCount: i.pack_count != null ? Number(i.pack_count) : 1, packSize: i.pack_size != null ? Number(i.pack_size) : null,
  packUnit: i.pack_unit || "", taxRateId: i.tax_rate_id || null,
  sellRate: i.sell_rate != null ? Number(i.sell_rate) : null, purchaseRate: i.purchase_rate != null ? Number(i.purchase_rate) : null,
  incomeAccountCode: i.income_account_code || null, expenseAccountCode: i.expense_account_code || null,
  ckProductId: i.ck_product_id || null, hiddenFromStores: !!i.hidden_from_stores,
  reorderPoint: i.reorder_point != null ? Number(i.reorder_point) : 0, imageUrl: i.image_url || "",
  itemType: i.item_type || "warehouse", // "warehouse" (stocked) | "ck" | "fresh" (non-stocked)
  fulfilledBy: i.fulfilled_by || null,  // null = Distribution; else dist_contacts vendor id (direct supplier)
  location: i.location || "", supplier: i.supplier || "",
  tagFrequency: i.tag_frequency || "", tagCategory: i.tag_category || "",
  active: i.active !== false, createdAt: i.created_at,
});
const mapDistBatch = (b) => ({
  id: b.id, itemId: b.item_id, batchNo: b.batch_no || "", expiryDate: b.expiry_date || null, mfgDate: b.mfg_date || null,
  landedCost: Number(b.landed_cost) || 0, costMethod: b.cost_method || null, sourceKind: b.source_kind || null, createdAt: b.created_at,
});
const mapDistMovement = (m) => ({
  id: m.id, itemId: m.item_id, batchId: m.batch_id, qty: Number(m.qty) || 0, type: m.type,
  sourceKind: m.source_kind || null, sourceRef: m.source_ref || null, reasonCode: m.reason_code || null,
  movedAt: m.moved_at, createdBy: m.created_by || null,
});

// ── Tax rates ───────────────────────────────────────────────────────────────
export async function fetchDistTaxRates() {
  const { data, error } = await supabase.from("dist_tax_rates").select("*").order("percent", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapDistTaxRate);
}

// ── Contacts (customers + vendors) ──────────────────────────────────────────
export async function fetchDistContacts({ kind } = {}) {
  let q = supabase.from("dist_contacts").select("*").eq("active", true).order("display_name");
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDistContact);
}
export async function upsertDistContact(c) {
  const row = {
    id: c.id || distId("dc"), kind: c.kind || "customer", display_name: c.displayName || "",
    company_name: c.companyName || null, store_id: c.storeId || null, entity_id: c.entityId || null,
    is_central_kitchen: !!c.isCentralKitchen, visible_to_stores: !!c.visibleToStores, email: c.email || null, phone: c.phone || null,
    billing_address: c.billingAddress || null, shipping_address: c.shippingAddress || null,
    opening_balance: c.openingBalance != null && c.openingBalance !== "" ? Number(c.openingBalance) : 0,
    active: c.active !== false,
    salutation: c.salutation || null, first_name: c.firstName || null, last_name: c.lastName || null,
    work_phone: c.workPhone || null, mobile: c.mobile || null, currency_code: c.currencyCode || "GBP",
    website: c.website || null, notes: c.notes || null, payment_terms: c.paymentTerms || null,
    accounts_payable_code: c.accountsPayableCode || null, company_reg_no: c.companyRegNo || null,
    billing_attention: c.billingAttention || null, shipping_attention: c.shippingAttention || null,
  };
  const { data, error } = await supabase.from("dist_contacts").upsert(row).select().maybeSingle();
  if (error) throw error;
  return data ? mapDistContact(data) : null;
}

// ── Items ───────────────────────────────────────────────────────────────────
export async function fetchDistItems({ includeInactive } = {}) {
  let q = supabase.from("dist_items").select("*").order("name");
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDistItem);
}
// Upload a product image for a Distribution item to the 'dist-item-images'
// storage bucket and return its public URL (stored on dist_items.image_url).
// Mirrors the applicant-photos upload pattern. Bucket must exist + be public.
export async function uploadDistItemImage(file) {
  if (!file) throw new Error("No file provided.");
  // Derive a clean extension. Downloaded images often have messy names
  // (no extension, query strings like "photo.jpg?w=800", or none at all), so
  // prefer the MIME type and fall back to a sanitised filename extension.
  const mimeExt = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/gif": "gif",
    "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
    "image/bmp": "bmp", "image/tiff": "tiff", "image/avif": "avif", "image/svg+xml": "svg",
  }[(file.type || "").toLowerCase()];
  let ext = mimeExt;
  if (!ext) {
    const raw = (file.name || "").split("?")[0].split("#")[0]; // strip query/hash
    const maybe = raw.includes(".") ? raw.split(".").pop().toLowerCase() : "";
    ext = /^[a-z0-9]{1,5}$/.test(maybe) ? maybe : "jpg";        // only clean exts
  }
  const token = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const path = `items/${token}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("dist-item-images")
    .upload(path, file, { contentType: file.type || "image/jpeg", cacheControl: "3600", upsert: false });
  if (upErr) throw upErr;
  const { data: { publicUrl } } = supabase.storage.from("dist-item-images").getPublicUrl(path);
  return { url: publicUrl, path };
}

export async function upsertDistItem(i) {
  const row = {
    id: i.id || distId("di"), sku: i.sku || null, name: i.name || "", category: i.category || null,
    pack_count: i.packCount != null && i.packCount !== "" ? Number(i.packCount) : 1,
    pack_size: i.packSize != null && i.packSize !== "" ? Number(i.packSize) : null,
    pack_unit: i.packUnit || null, tax_rate_id: i.taxRateId || null,
    sell_rate: i.sellRate != null && i.sellRate !== "" ? Number(i.sellRate) : null,
    purchase_rate: i.purchaseRate != null && i.purchaseRate !== "" ? Number(i.purchaseRate) : null,
    income_account_code: i.incomeAccountCode || null, expense_account_code: i.expenseAccountCode || null,
    ck_product_id: i.ckProductId || null,
    hidden_from_stores: !!i.hiddenFromStores,
    item_type: i.itemType || (i.ckProductId ? "ck" : "warehouse"),
    fulfilled_by: i.fulfilledBy || null,
    location: i.location || null, supplier: i.supplier || null,
    tag_frequency: i.tagFrequency || null, tag_category: i.tagCategory || null,
    reorder_point: i.reorderPoint != null && i.reorderPoint !== "" ? Number(i.reorderPoint) : 0, image_url: i.imageUrl || null,
    active: i.active !== false,
  };
  const isNew = !i.id;
  // Capture the prior state for a field-level history diff (best-effort).
  let before = null;
  if (!isNew) { try { const { data: prev } = await supabase.from("dist_items").select("*").eq("id", i.id).maybeSingle(); before = prev; } catch { before = null; } }
  const { data, error } = await supabase.from("dist_items").upsert(row).select().maybeSingle();
  if (error) throw error;
  // Log history (best-effort — never block the save).
  try {
    if (isNew) {
      await logDistItemHistory(row.id, "created", "Item created", i.changedBy);
    } else if (before) {
      const detail = describeDistItemChanges(before, row);
      if (detail) await logDistItemHistory(row.id, "updated", detail, i.changedBy);
    }
  } catch { /* history is non-blocking */ }
  return data ? mapDistItem(data) : null;
}

// ── Per-store item tags (e.g. Daily/Weekly stock cadence) ────────────────────
// Global tags (supplier/location/category) live on dist_items; the Daily/Weekly
// cadence can differ per store, stored in dist_item_store_tags. Absence of a row
// means "fall back to the item's global tag_frequency".
export async function fetchStoreItemTags(storeId) {
  if (!storeId) return {};
  const { data, error } = await supabase
    .from("dist_item_store_tags")
    .select("item_id, tag_frequency, supplier, location, tag_category, disabled")
    .eq("store_id", storeId);
  if (error) throw error;
  const map = {};
  (data || []).forEach(r => {
    map[r.item_id] = {
      tagFrequency: r.tag_frequency || "",
      supplier: r.supplier || "",
      location: r.location || "",
      tagCategory: r.tag_category || "",
      disabled: !!r.disabled,
    };
  });
  return map;   // { itemId: { tagFrequency, supplier, location, tagCategory } }
}

// Set one per-store tag field for an item. `field` is one of:
// "tagFrequency" | "supplier" | "location" | "tagCategory". Empty value clears
// that field. If all 4 fields end up empty, the row is deleted (full fallback).
export async function setStoreItemTag(storeId, itemId, field, value) {
  if (!storeId || !itemId) throw new Error("store and item required");
  const colMap = { tagFrequency: "tag_frequency", supplier: "supplier", location: "location", tagCategory: "tag_category", disabled: "disabled" };
  const col = colMap[field];
  if (!col) throw new Error(`unknown tag field: ${field}`);
  const isBool = field === "disabled";
  const val = isBool ? !!value : (value || "").trim();
  // Read the current row (if any) so we can merge and know whether it becomes empty.
  const { data: existing } = await supabase.from("dist_item_store_tags")
    .select("tag_frequency, supplier, location, tag_category, disabled")
    .eq("store_id", storeId).eq("item_id", itemId).maybeSingle();
  const row = {
    tag_frequency: existing?.tag_frequency || null,
    supplier: existing?.supplier || null,
    location: existing?.location || null,
    tag_category: existing?.tag_category || null,
    disabled: !!existing?.disabled,
  };
  row[col] = isBool ? !!value : (val || null);
  const allEmpty = !row.tag_frequency && !row.supplier && !row.location && !row.tag_category && !row.disabled;
  if (allEmpty) {
    const { error } = await supabase.from("dist_item_store_tags")
      .delete().eq("store_id", storeId).eq("item_id", itemId);
    if (error) throw error;
    return { storeId, itemId, tagFrequency: "", supplier: "", location: "", tagCategory: "", disabled: false };
  }
  const { data, error } = await supabase.from("dist_item_store_tags")
    .upsert({ store_id: storeId, item_id: itemId, ...row, updated_at: new Date().toISOString() }, { onConflict: "store_id,item_id" })
    .select().maybeSingle();
  if (error) throw error;
  return {
    storeId, itemId,
    tagFrequency: data?.tag_frequency || "", supplier: data?.supplier || "",
    location: data?.location || "", tagCategory: data?.tag_category || "", disabled: !!data?.disabled,
  };
}

// ── Per-store stock planning (stock in hand / par / required) ────────────────
export async function fetchStoreItemStock(storeId, itemId) {
  if (!storeId || !itemId) return null;
  const { data, error } = await supabase.from("dist_item_store_stock")
    .select("stock_in_hand, par_level, required_stock")
    .eq("store_id", storeId).eq("item_id", itemId).maybeSingle();
  if (error) throw error;
  if (!data) return { stockInHand: null, parLevel: null, requiredStock: null };
  return {
    stockInHand:   data.stock_in_hand   != null ? Number(data.stock_in_hand)   : null,
    parLevel:      data.par_level        != null ? Number(data.par_level)        : null,
    requiredStock: data.required_stock   != null ? Number(data.required_stock)   : null,
  };
}

export async function saveStoreItemStock(storeId, itemId, patch) {
  if (!storeId || !itemId) throw new Error("store and item required");
  const num = (v) => (v === "" || v == null || isNaN(Number(v))) ? null : Number(v);
  const row = { store_id: storeId, item_id: itemId, updated_at: new Date().toISOString() };
  if ("stockInHand"   in patch) row.stock_in_hand  = num(patch.stockInHand);
  if ("parLevel"      in patch) row.par_level      = num(patch.parLevel);
  if ("requiredStock" in patch) row.required_stock = num(patch.requiredStock);
  const { data, error } = await supabase.from("dist_item_store_stock")
    .upsert(row, { onConflict: "store_id,item_id" }).select().maybeSingle();
  if (error) throw error;
  return {
    stockInHand:   data?.stock_in_hand   != null ? Number(data.stock_in_hand)   : null,
    parLevel:      data?.par_level        != null ? Number(data.par_level)        : null,
    requiredStock: data?.required_stock   != null ? Number(data.required_stock)   : null,
  };
}

// Average daily units sold for an item at a store, from Flipdish item sales
// (item_day_aggregates) over a trailing window. Matches by item name (case-
// insensitive, ignoring a trailing "-(1*30pcs)" pack suffix). Returns
// { dailyAvg, weeklyAvg, days, matchedName, totalQty } or null if no match.
export async function computeStoreItemUsage(storeId, itemName, { days = 28 } = {}) {
  if (!storeId || !itemName) return null;
  const to = new Date();
  const from = new Date(); from.setDate(from.getDate() - days);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  const { data, error } = await supabase.from("item_day_aggregates")
    .select("item, qty, business_date")
    .eq("store_id", storeId)
    .gte("business_date", fromStr).lte("business_date", toStr);
  if (error) throw error;
  const rows = data || [];
  // Normalise names for matching: lowercase, strip pack suffix + punctuation.
  const norm = (s) => String(s || "").toLowerCase().replace(/-?\s*\(\s*\d+\s*[*x×].*?\)\s*$/i, "").replace(/[^a-z0-9]+/g, " ").trim();
  const target = norm(itemName);
  if (!target) return null;
  let totalQty = 0; let matchedName = null;
  rows.forEach(r => {
    if (norm(r.item) === target) { totalQty += Number(r.qty) || 0; matchedName = matchedName || r.item; }
  });
  if (matchedName == null) return null;   // no sales match → caller shows "—"
  const dailyAvg = totalQty / days;
  return {
    dailyAvg: Math.round(dailyAvg * 100) / 100,
    weeklyAvg: Math.round(dailyAvg * 7 * 100) / 100,
    days, matchedName, totalQty,
  };
}

// Human-readable diff between the old DB row and the new row for history.
function describeDistItemChanges(before, after) {
  const fields = [
    ["name", "Name"], ["sku", "SKU"], ["category", "Category"],
    ["sell_rate", "Sell rate", "£"], ["purchase_rate", "Buy rate", "£"],
    ["reorder_point", "Reorder point"], ["pack_count", "Pack count"], ["pack_size", "Pack size"],
    ["pack_unit", "Pack unit"], ["tax_rate_id", "Tax rate"], ["active", "Status"],
    ["image_url", "Image"], ["ck_product_id", "CK link"],
  ];
  const parts = [];
  for (const [key, label, prefix = ""] of fields) {
    const a = before[key], b = after[key];
    if (String(a ?? "") === String(b ?? "")) continue;
    if (key === "active") { parts.push(`Status ${b ? "→ Active" : "→ Inactive"}`); continue; }
    if (key === "image_url") { parts.push(b ? "Image updated" : "Image removed"); continue; }
    const fmt = (v) => v == null || v === "" ? "—" : `${prefix}${v}`;
    parts.push(`${label} ${fmt(a)} → ${fmt(b)}`);
  }
  return parts.join("; ");
}

export async function logDistItemHistory(itemId, action, detail, changedBy) {
  await supabase.from("dist_item_history").insert({
    id: distId("dih"), item_id: itemId, action, detail: detail || "",
    changed_by: changedBy || "", changed_at: new Date().toISOString(),
  });
}

export async function fetchDistItemHistory(itemId) {
  const { data, error } = await supabase.from("dist_item_history")
    .select("*").eq("item_id", itemId).order("changed_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(h => ({ id: h.id, action: h.action, detail: h.detail || "",
    changedBy: h.changed_by || "", changedAt: h.changed_at }));
}

// Rich Zoho-style transactions for one item: its lines across sales orders
// (sell side) and goods receipts (buy side), with counterparty + price/total.
export async function fetchDistItemTransactions(itemId, kind = "all") {
  const out = [];
  const [customers, vendors] = await Promise.all([
    fetchDistContacts({ kind: "customer" }).catch(() => []),
    fetchDistContacts({ kind: "vendor" }).catch(() => []),
  ]);
  const custName = new Map(customers.map(c => [c.id, c.displayName]));
  const vendName = new Map(vendors.map(v => [v.id, v.displayName]));

  if (kind === "all" || kind === "sales") {
    const sos = await fetchDistSalesOrders({}).catch(() => []);
    for (const so of sos) {
      for (const l of (so.lines || [])) {
        if (l.itemId !== itemId) continue;
        const qty = Number(l.qty) || 0;
        const price = Number(l.unitPrice) || 0;
        out.push({
          date: so.orderDate, docType: "Sales Order", ref: so.soNumber || so.id,
          party: custName.get(so.customerId) || "\u2014", qty, direction: "out",
          price, total: +(qty * price).toFixed(2), status: so.status || "",
        });
      }
    }
  }
  if (kind === "all" || kind === "purchases") {
    const grns = await fetchDistGoodsReceipts().catch(() => []);
    for (const g of grns) {
      for (const l of (g.lines || [])) {
        if (l.itemId !== itemId) continue;
        const qty = Number(l.qty) || 0;
        const cost = Number(l.landedCost) || 0;
        out.push({
          date: g.receivedDate, docType: g.sourceKind === "central_kitchen" ? "CK Receipt" : "Goods Receipt",
          ref: g.grnNumber || g.id, party: g.sourceKind === "central_kitchen" ? "Central Kitchen" : (vendName.get(g.vendorId) || "\u2014"),
          qty, direction: "in", price: cost, total: +(qty * cost).toFixed(2),
          status: g.posted ? "Received" : (g.status === "draft" ? "Draft" : ""),
        });
      }
    }
  }
  out.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return out;
}

// ── Batches ─────────────────────────────────────────────────────────────────
export async function fetchDistBatches(itemId) {
  let q = supabase.from("dist_batches").select("*").order("expiry_date", { ascending: true, nullsFirst: false });
  if (itemId) q = q.eq("item_id", itemId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDistBatch);
}
export async function createDistBatch(b) {
  const row = {
    id: b.id || distId("db"), item_id: b.itemId, batch_no: b.batchNo || null,
    expiry_date: b.expiryDate || null, mfg_date: b.mfgDate || null,
    landed_cost: b.landedCost != null && b.landedCost !== "" ? Number(b.landedCost) : 0,
    cost_method: b.costMethod || null, source_kind: b.sourceKind || null,
  };
  const { data, error } = await supabase.from("dist_batches").insert(row).select().maybeSingle();
  if (error) throw error;
  return data ? mapDistBatch(data) : null;
}

// ── Stock movements (append-only; the single source of truth) ───────────────
export async function fetchDistMovements({ itemId, batchId, type } = {}) {
  let q = supabase.from("dist_stock_movements").select("*").order("moved_at", { ascending: false });
  if (itemId) q = q.eq("item_id", itemId);
  if (batchId) q = q.eq("batch_id", batchId);
  if (type) q = Array.isArray(type) ? q.in("type", type) : q.eq("type", type);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDistMovement);
}

// Insert a movement. source_ref makes it idempotent: if one already exists with
// the same ref, we skip (returns the existing) rather than double-posting.
export async function addDistMovement(m) {
  if (m.sourceRef) {
    const { data: existing } = await supabase.from("dist_stock_movements").select("*").eq("source_ref", m.sourceRef).limit(1);
    if (existing && existing.length) return mapDistMovement(existing[0]);
  }
  const row = {
    id: m.id || distId("dm"), item_id: m.itemId, batch_id: m.batchId,
    qty: Number(m.qty) || 0, type: m.type || "adjustment", source_kind: m.sourceKind || null,
    source_ref: m.sourceRef || null, reason_code: m.reasonCode || null, created_by: m.createdBy || null,
  };
  const { data, error } = await supabase.from("dist_stock_movements").insert(row).select().maybeSingle();
  if (error) throw error;
  return data ? mapDistMovement(data) : null;
}

// Seed opening stock as an 'opening' movement against an opening batch (NEVER
// copy a divergent stored figure — this posts an agreed count as a movement).
export async function seedDistOpeningStock({ itemId, qty, landedCost, expiryDate, createdBy }) {
  const batch = await createDistBatch({
    itemId, batchNo: "OPENING", expiryDate: expiryDate || null,
    landedCost: landedCost != null ? landedCost : 0, costMethod: "opening", sourceKind: "opening",
  });
  if (!batch) throw new Error("opening batch create failed");
  return addDistMovement({
    itemId, batchId: batch.id, qty: Number(qty) || 0, type: "opening",
    sourceKind: "opening", sourceRef: `distopen:${itemId}`, createdBy,
  });
}

// ── Derivations (stock is computed, never stored) ───────────────────────────
// on-hand per item = SUM(qty). Returns a Map<itemId, number>.
export async function computeDistOnHand(itemId) {
  let q = supabase.from("dist_stock_movements").select("item_id, qty");
  if (itemId) q = q.eq("item_id", itemId);
  const { data, error } = await q;
  if (error) throw error;
  const m = new Map();
  for (const r of data || []) m.set(r.item_id, (m.get(r.item_id) || 0) + (Number(r.qty) || 0));
  return m;
}

// on-hand per BATCH = SUM(qty) for that batch (drives FEFO available-by-batch).
export async function computeDistBatchOnHand(itemId) {
  let q = supabase.from("dist_stock_movements").select("batch_id, item_id, qty");
  if (itemId) q = q.eq("item_id", itemId);
  const { data, error } = await q;
  if (error) throw error;
  const m = new Map();
  for (const r of data || []) m.set(r.batch_id, (m.get(r.batch_id) || 0) + (Number(r.qty) || 0));
  return m;
}

// Full stock snapshot for the UI: per item, on-hand + committed (open SO lines)
// + available, plus a below-zero alarm flag.
export async function fetchDistStockSnapshot() {
  const [items, onHand, committed] = await Promise.all([fetchDistItems(), computeDistOnHand(), computeDistCommitted()]);
  return items.map((it) => {
    // Only "fresh" produce is non-stocked (driver sources same-day). Warehouse
    // AND CK items are stocked here — CK dispatches into Dist via a goods receipt.
    const stocked = (it.itemType || "warehouse") !== "fresh";
    if (!stocked) {
      return { ...it, stocked: false, onHand: null, committed: 0, available: null, negative: false };
    }
    const oh = onHand.get(it.id) || 0;
    const com = committed.get(it.id) || 0;
    return { ...it, stocked: true, onHand: oh, committed: com, available: oh - com, negative: oh < 0 };
  });
}

// Delete an item. SAFE: if the item has any stock movements, we archive it
// (active=false) rather than hard-delete — deleting would orphan ledger rows
// and corrupt derived stock. Only items with zero movements are hard-deleted.
export async function deleteDistItem(itemId) {
  const { data: mv } = await supabase.from("dist_stock_movements").select("id").eq("item_id", itemId).limit(1);
  if (mv && mv.length) {
    const { error } = await supabase.from("dist_items").update({ active: false }).eq("id", itemId);
    if (error) throw error;
    return { archived: true };
  }
  // No movements: safe to remove the item and any (empty) batches.
  await supabase.from("dist_batches").delete().eq("item_id", itemId);
  const { error } = await supabase.from("dist_items").delete().eq("id", itemId);
  if (error) throw error;
  return { archived: false };
}

// Is an item referenced anywhere that deleting it would corrupt history?
// Checks stock movements, order lines, goods-receipt lines, price lists, and
// COGS links. Returns the first blocking reference found, or null if orphaned.
async function distItemReference(itemId) {
  const checks = [
    ["stock movement", supabase.from("dist_stock_movements").select("id").eq("item_id", itemId).limit(1)],
    ["a sales order", supabase.from("dist_sales_order_lines").select("id").eq("item_id", itemId).limit(1)],
    ["a goods receipt", supabase.from("dist_goods_receipt_lines").select("id").eq("item_id", itemId).limit(1)],
  ];
  for (const [label, q] of checks) {
    const { data } = await q;
    if (data && data.length) return label;
  }
  return null;
}

// Preview a bulk delete of INACTIVE items: classify each as hard-deletable
// (no references) vs must-keep-archived (referenced in history).
export async function previewDeleteInactiveDistItems() {
  const { data, error } = await supabase.from("dist_items").select("id, name, sku").eq("active", false);
  if (error) throw error;
  const inactive = data || [];
  const deletable = [], blocked = [];
  for (const it of inactive) {
    const ref = await distItemReference(it.id);
    if (ref) blocked.push({ ...it, reason: ref }); else deletable.push(it);
  }
  return { total: inactive.length, deletable, blocked };
}

// Permanently delete inactive items that are safe to remove. Items referenced
// in history are LEFT in place (kept archived) so nothing breaks. Also clears
// their (empty) batches, collection links, and price-list rows first.
export async function bulkDeleteInactiveDistItems(itemIds) {
  const ids = [...new Set((itemIds || []).filter(Boolean))];
  let deleted = 0; const errors = [];
  for (const id of ids) {
    try {
      const ref = await distItemReference(id);
      if (ref) { errors.push({ id, reason: `referenced in ${ref}` }); continue; }
      // Clean up non-historical links first (safe to remove).
      await supabase.from("dist_batches").delete().eq("item_id", id);
      await supabase.from("dist_collection_items").delete().eq("item_id", id);
      await supabase.from("dist_price_list_items").delete().eq("item_id", id);
      const { error } = await supabase.from("dist_items").delete().eq("id", id);
      if (error) { errors.push({ id, reason: error.message }); continue; }
      deleted++;
    } catch (e) { errors.push({ id, reason: e.message }); }
  }
  return { deleted, errors };
}

// ============================================================================
// DISTRIBUTION — PHASE 2: BUY SIDE (vendors=contacts, POs, goods receipts,
// bills, payments) + journal bridges into Finance (entity = brand-distribution).
// Goods move ONLY at goods receipt. Money documents post journals, never stock.
// ============================================================================
const DIST_ENTITY = "brand-distribution";

// ── Mappers ──
const mapDistPO = (o) => ({
  id: o.id, poNumber: o.po_number || "", vendorId: o.vendor_id || null, status: o.status || "draft",
  orderDate: o.order_date || null, expectedDate: o.expected_date || null, note: o.note || "",
  vatMode: o.vat_mode || "exclusive", discountPercent: Number(o.discount_percent) || 0, discountType: o.discount_type || "percent", reference: o.reference || "", paymentTerms: o.payment_terms || "",
  createdBy: o.created_by || null, createdAt: o.created_at, lines: (o.dist_purchase_order_lines || []).map(mapDistPOLine),
});
const mapDistPOLine = (l) => ({ id: l.id, poId: l.po_id, itemId: l.item_id, qty: Number(l.qty) || 0, unitPrice: Number(l.unit_price) || 0, taxRateId: l.tax_rate_id || null });
const mapDistGRN = (g) => ({
  id: g.id, grnNumber: g.grn_number || "", vendorId: g.vendor_id || null, poId: g.po_id || null,
  sourceKind: g.source_kind || "vendor", receivedDate: g.received_date || null, note: g.note || "",
  status: g.status || (g.posted ? "posted" : "draft"), ckDispatchId: g.ck_dispatch_id || null,
  posted: !!g.posted, createdBy: g.created_by || null, createdAt: g.created_at, lines: (g.dist_goods_receipt_lines || []).map(mapDistGRNLine),
});
const mapDistGRNLine = (l) => ({ id: l.id, grnId: l.grn_id, itemId: l.item_id, batchId: l.batch_id, qty: Number(l.qty) || 0, landedCost: Number(l.landed_cost) || 0, batchNo: l.batch_no || "", expiryDate: l.expiry_date || null });
const mapDistBill = (b) => ({
  id: b.id, billNumber: b.bill_number || "", vendorId: b.vendor_id || null, poId: b.po_id || null, grnId: b.grn_id || null,
  billDate: b.bill_date || null, dueDate: b.due_date || null, status: b.status || "open", note: b.note || "",
  vatMode: b.vat_mode || "exclusive", discountPercent: Number(b.discount_percent) || 0, discountType: b.discount_type || "percent", reference: b.reference || "", paymentTerms: b.payment_terms || "",
  posted: !!b.posted, createdBy: b.created_by || null, createdAt: b.created_at, lines: (b.dist_bill_lines || []).map(mapDistBillLine),
});
const mapDistBillLine = (l) => ({ id: l.id, billId: l.bill_id, itemId: l.item_id, description: l.description || "", qty: Number(l.qty) || 0, unitPrice: Number(l.unit_price) || 0, taxRateId: l.tax_rate_id || null, accountCode: l.account_code || null });
const mapDistBillPay = (p) => ({
  id: p.id, paymentNumber: p.payment_number || "", vendorId: p.vendor_id || null, payDate: p.pay_date || null,
  amount: Number(p.amount) || 0, method: p.method || null, bankCode: p.bank_code || null, reference: p.reference || "",
  posted: !!p.posted, createdBy: p.created_by || null, createdAt: p.created_at, allocations: (p.dist_bill_payment_allocations || []).map(a => ({ id: a.id, billId: a.bill_id, amount: Number(a.amount) || 0 })),
});

// ── Tax helper: split a gross/net amount by an item/line tax rate ──
async function distTaxPercent(taxRateId) {
  if (!taxRateId) return 0;
  const { data } = await supabase.from("dist_tax_rates").select("percent").eq("id", taxRateId).maybeSingle();
  return Number(data?.percent) || 0;
}

// ── PURCHASE ORDERS ──
export async function fetchDistPurchaseOrders({ vendorId, status } = {}) {
  let q = supabase.from("dist_purchase_orders").select("*, dist_purchase_order_lines(*)").order("created_at", { ascending: false });
  if (vendorId) q = q.eq("vendor_id", vendorId);
  if (status) q = Array.isArray(status) ? q.in("status", status) : q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDistPO);
}
export async function createDistPurchaseOrder(po, lines = []) {
  const id = po.id || distId("dpo");
  const row = {
    id, po_number: po.poNumber || `PO-${Date.now().toString().slice(-6)}`, vendor_id: po.vendorId || null,
    status: po.status || "draft", order_date: po.orderDate || new Date().toISOString().slice(0, 10),
    expected_date: po.expectedDate || null, note: po.note || null, created_by: po.createdBy || null,
    vat_mode: po.vatMode || "exclusive", discount_percent: Number(po.discountPercent) || 0, discount_type: po.discountType || "percent",
    reference: po.reference || null, payment_terms: po.paymentTerms || null,
  };
  const { error } = await supabase.from("dist_purchase_orders").insert(row);
  if (error) throw error;
  if (lines.length) {
    const lr = lines.filter(l => l.itemId && Number(l.qty) > 0).map(l => ({
      id: distId("dpol"), po_id: id, item_id: l.itemId, qty: Number(l.qty) || 0,
      unit_price: Number(l.unitPrice) || 0, tax_rate_id: l.taxRateId || null,
    }));
    if (lr.length) { const { error: e2 } = await supabase.from("dist_purchase_order_lines").insert(lr); if (e2) throw e2; }
  }
  return id;
}
export async function setDistPurchaseOrderStatus(id, status) {
  const { error } = await supabase.from("dist_purchase_orders").update({ status }).eq("id", id);
  if (error) throw error;
}

// ── GOODS RECEIPTS (the stock-IN event + journal) ──
export async function fetchDistGoodsReceipts({ vendorId } = {}) {
  let q = supabase.from("dist_goods_receipts").select("*, dist_goods_receipt_lines(*)").order("created_at", { ascending: false });
  if (vendorId) q = q.eq("vendor_id", vendorId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDistGRN);
}
// Receive goods: for each line create a batch, write a +receipt movement, then
// post one journal Dr Stock / Cr GRNI at total landed cost. Idempotent.
export async function postDistGoodsReceipt(grn, lines = []) {
  const id = grn.id || distId("dgrn");
  const receivedDate = grn.receivedDate || new Date().toISOString().slice(0, 10);
  const head = {
    id, grn_number: grn.grnNumber || `GRN-${Date.now().toString().slice(-6)}`, vendor_id: grn.vendorId || null,
    po_id: grn.poId || null, source_kind: grn.sourceKind || "vendor", received_date: receivedDate,
    note: grn.note || null, created_by: grn.createdBy || null, posted: false,
  };
  const { error } = await supabase.from("dist_goods_receipts").insert(head);
  if (error) throw error;

  let totalValue = 0;
  for (const l of lines.filter(x => x.itemId && Number(x.qty) > 0)) {
    const batch = await createDistBatch({
      itemId: l.itemId, batchNo: l.batchNo || head.grn_number, expiryDate: l.expiryDate || null,
      landedCost: Number(l.landedCost) || 0, costMethod: grn.sourceKind === "central_kitchen" ? "ck_cost" : "vendor_bill",
      sourceKind: grn.sourceKind || "vendor",
    });
    await supabase.from("dist_goods_receipt_lines").insert({
      id: distId("dgrnl"), grn_id: id, item_id: l.itemId, batch_id: batch.id, qty: Number(l.qty) || 0,
      landed_cost: Number(l.landedCost) || 0, batch_no: l.batchNo || null, expiry_date: l.expiryDate || null,
    });
    await addDistMovement({
      itemId: l.itemId, batchId: batch.id, qty: Number(l.qty) || 0, type: "receipt",
      sourceKind: "goods_receipt", sourceRef: `distrecv:${id}:${l.itemId}:${batch.id}`, createdBy: grn.createdBy,
    });
    totalValue += (Number(l.qty) || 0) * (Number(l.landedCost) || 0);
  }

  // Journal: Dr Stock 1200 / Cr GRNI 2050 at landed cost.
  if (totalValue > 0) {
    const [stock, grni] = await Promise.all([
      resolveAccountForEntity(DIST_ENTITY, "1200"), resolveAccountForEntity(DIST_ENTITY, "2050"),
    ]);
    if (stock && grni) {
      try {
        await postJournalEntry({
          entityId: DIST_ENTITY, entryDate: receivedDate, memo: `Goods receipt ${head.grn_number}`,
          sourceKind: "dist_goods_receipt", sourceRef: `distrecv:${id}`, createdBy: grn.createdBy,
          lines: [{ accountId: stock, amount: +totalValue.toFixed(2) }, { accountId: grni, amount: -totalValue.toFixed(2) }],
        });
      } catch (e) { /* best-effort: stock already recorded; journal can be retried */ }
    }
  }
  await supabase.from("dist_goods_receipts").update({ posted: true }).eq("id", id);
  if (grn.poId) {
    const prog = await fetchDistPOReceiptProgress(grn.poId).catch(() => null);
    const poStatus = prog ? (prog.fullyReceived ? "received" : prog.partiallyReceived ? "partially_received" : "open") : "received";
    await supabase.from("dist_purchase_orders").update({ status: poStatus }).eq("id", grn.poId);
  }
  return id;
}

// ── CK → Distribution hook ──
// Build a DRAFT goods receipt from a CK dispatch. Maps each CK line's product
// to a dist_item via dist_items.ck_product_id. Unmapped products are returned
// in `unmatched` (not received). Raises NO stock/journal — review then confirm.
// Idempotent: if a receipt already exists for this ck_dispatch_id, returns it.
export async function createDistDraftReceiptFromCk({ ckDispatchId, ckLines = [], ckProducts = [], receivedDate, createdBy }) {
  // Already linked? Don't duplicate.
  const { data: existing } = await supabase.from("dist_goods_receipts").select("id").eq("ck_dispatch_id", ckDispatchId).limit(1);
  if (existing && existing.length) return { grnId: existing[0].id, alreadyExists: true, matched: 0, unmatched: [] };

  // Map CK products -> dist items.
  const items = await fetchDistItems();
  const byCk = new Map(items.filter(i => i.ckProductId).map(i => [i.ckProductId, i]));
  const matchedLines = []; const unmatched = [];
  for (const l of ckLines) {
    const qty = Number(l.qtyReceived ?? l.qty_received ?? l.qtySent ?? l.qty_sent) || 0;
    if (qty <= 0) continue;
    const item = byCk.get(l.productId || l.product_id);
    const prodName = l.productName || l.product_name || (ckProducts.find(p => p.id === (l.productId || l.product_id))?.name) || (l.productId || l.product_id);
    if (!item) { unmatched.push({ productId: l.productId || l.product_id, productName: prodName, qty }); continue; }
    matchedLines.push({
      itemId: item.id, qty,
      landedCost: Number(item.purchaseRate) || 0,           // cost basis; editable before confirm
      batchNo: l.finishedBatchNo || l.finished_batch_no || "",
      expiryDate: l.useByDate || l.use_by_date || null,
    });
  }

  const id = distId("dgrn");
  const date = receivedDate || new Date().toISOString().slice(0, 10);
  const head = {
    id, grn_number: `CKGRN-${Date.now().toString().slice(-6)}`, vendor_id: null, po_id: null,
    source_kind: "central_kitchen", received_date: date, note: "Auto-drafted from Central Kitchen dispatch",
    created_by: createdBy || null, posted: false, status: "draft", ck_dispatch_id: ckDispatchId,
  };
  const { error } = await supabase.from("dist_goods_receipts").insert(head);
  if (error) throw error;
  // Store lines WITHOUT a batch / movement (draft only).
  for (const l of matchedLines) {
    await supabase.from("dist_goods_receipt_lines").insert({
      id: distId("dgrnl"), grn_id: id, item_id: l.itemId, batch_id: null, qty: l.qty,
      landed_cost: l.landedCost, batch_no: l.batchNo || null, expiry_date: l.expiryDate || null,
    });
  }
  return { grnId: id, alreadyExists: false, matched: matchedLines.length, unmatched };
}

// Confirm a DRAFT goods receipt: create a batch + receipt movement per line and
// post Dr Stock / Cr GRNI at landed cost. Idempotent on distrecv:<id>.
export async function confirmDistGoodsReceipt(grnId, lineEdits = null) {
  const { data: g } = await supabase.from("dist_goods_receipts").select("*, dist_goods_receipt_lines(*)").eq("id", grnId).maybeSingle();
  if (!g) throw new Error("Goods receipt not found.");
  if (g.posted) return grnId; // already confirmed
  const receivedDate = g.received_date || new Date().toISOString().slice(0, 10);
  const editMap = new Map((lineEdits || []).map(e => [e.lineId, e]));

  let totalValue = 0;
  for (const ln of g.dist_goods_receipt_lines || []) {
    const edit = editMap.get(ln.id) || {};
    const qty = Number(edit.qty ?? ln.qty) || 0;
    const landedCost = Number(edit.landedCost ?? ln.landed_cost) || 0;
    if (!ln.item_id || qty <= 0) continue;
    const batch = await createDistBatch({
      itemId: ln.item_id, batchNo: ln.batch_no || g.grn_number, expiryDate: ln.expiry_date || null,
      landedCost, costMethod: g.source_kind === "central_kitchen" ? "ck_cost" : "vendor_bill", sourceKind: g.source_kind || "vendor",
    });
    await supabase.from("dist_goods_receipt_lines").update({ batch_id: batch.id, qty, landed_cost: landedCost }).eq("id", ln.id);
    await addDistMovement({
      itemId: ln.item_id, batchId: batch.id, qty, type: "receipt",
      sourceKind: "goods_receipt", sourceRef: `distrecv:${grnId}:${ln.item_id}:${batch.id}`, createdBy: g.created_by,
    });
    totalValue += qty * landedCost;
  }

  if (totalValue > 0) {
    const [stock, grni] = await Promise.all([resolveAccountForEntity(DIST_ENTITY, "1200"), resolveAccountForEntity(DIST_ENTITY, "2050")]);
    if (stock && grni) {
      try {
        await postJournalEntry({
          entityId: DIST_ENTITY, entryDate: receivedDate, memo: `Goods receipt ${g.grn_number}`,
          sourceKind: "dist_goods_receipt", sourceRef: `distrecv:${grnId}`, createdBy: g.created_by,
          lines: [{ accountId: stock, amount: +totalValue.toFixed(2) }, { accountId: grni, amount: -totalValue.toFixed(2) }],
        });
      } catch (e) { /* best-effort */ }
    }
  }
  await supabase.from("dist_goods_receipts").update({ posted: true, status: "posted" }).eq("id", grnId);
  return grnId;
}

// ── BILLS (payable + journal Dr GRNI/VAT / Cr creditors) ──
export async function fetchDistBills({ vendorId, status } = {}) {
  let q = supabase.from("dist_bills").select("*, dist_bill_lines(*)").order("created_at", { ascending: false });
  if (vendorId) q = q.eq("vendor_id", vendorId);
  if (status) q = Array.isArray(status) ? q.in("status", status) : q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDistBill);
}
export async function postDistBill(bill, lines = []) {
  const id = bill.id || distId("dbill");
  const billDate = bill.billDate || new Date().toISOString().slice(0, 10);
  const head = {
    id, bill_number: bill.billNumber || `BILL-${Date.now().toString().slice(-6)}`, vendor_id: bill.vendorId || null,
    po_id: bill.poId || null, grn_id: bill.grnId || null, bill_date: billDate, due_date: bill.dueDate || null,
    status: "open", note: bill.note || null, created_by: bill.createdBy || null, posted: false,
    vat_mode: bill.vatMode || "exclusive", discount_percent: Number(bill.discountPercent) || 0, discount_type: bill.discountType || "percent",
    reference: bill.reference || null, payment_terms: bill.paymentTerms || null,
  };
  const { error } = await supabase.from("dist_bills").insert(head);
  if (error) throw error;

  const inclusive = (bill.vatMode || "exclusive") === "inclusive";
  const discVal = Number(bill.discountPercent) || 0;
  const discType = bill.discountType || "percent";
  const validLines = lines.filter(l => Number(l.qty) !== 0 || Number(l.unitPrice) !== 0);

  // First pass: line net before discount (back VAT out if inclusive).
  const lineNets = [];
  for (const l of validLines) {
    const pct = await distTaxPercent(l.taxRateId);
    const raw = (Number(l.qty) || 0) * (Number(l.unitPrice) || 0);
    const baseNet = inclusive && pct > 0 ? raw / (1 + pct / 100) : raw;
    lineNets.push({ l, pct, baseNet });
  }
  const subtotal = lineNets.reduce((s, x) => s + x.baseNet, 0);
  // Discount factor: percent applies directly; a £ value is spread proportionally
  // across the document net (so each line is reduced by the same ratio).
  const factor = discType === "value"
    ? (subtotal > 0 ? Math.max(0, 1 - discVal / subtotal) : 1)
    : (1 - discVal / 100);

  let net = 0, vat = 0;
  for (const { l, pct, baseNet } of lineNets) {
    const lineNet = baseNet * factor;
    net += lineNet; vat += lineNet * pct / 100;
    await supabase.from("dist_bill_lines").insert({
      id: distId("dbilll"), bill_id: id, item_id: l.itemId || null, description: l.description || null,
      qty: Number(l.qty) || 0, unit_price: Number(l.unitPrice) || 0, tax_rate_id: l.taxRateId || null, account_code: l.accountCode || null,
    });
  }
  net = +net.toFixed(2); vat = +vat.toFixed(2); const gross = +(net + vat).toFixed(2);

  // Journal: Dr GRNI 2050 (net) + Dr VAT 2100 (vat) / Cr Trade creditors 2000 (gross).
  if (gross > 0) {
    const [grni, vatAcc, creditors] = await Promise.all([
      resolveAccountForEntity(DIST_ENTITY, "2050"), resolveAccountForEntity(DIST_ENTITY, "2100"), resolveAccountForEntity(DIST_ENTITY, "2000"),
    ]);
    if (grni && creditors) {
      const jlines = [{ accountId: grni, amount: net }];
      if (vat > 0 && vatAcc) jlines.push({ accountId: vatAcc, amount: vat });
      jlines.push({ accountId: creditors, amount: -gross });
      try {
        await postJournalEntry({
          entityId: DIST_ENTITY, entryDate: billDate, memo: `Bill ${head.bill_number}`,
          sourceKind: "dist_bill", sourceRef: `distbill:${id}`, createdBy: bill.createdBy, lines: jlines,
        });
      } catch (e) { /* best-effort */ }
    }
  }
  await supabase.from("dist_bills").update({ posted: true, grand_total: gross }).eq("id", id);
  return id;
}

// ── BILL PAYMENTS (settle + allocate across bills) ──
// Total already-allocated (paid) per bill id, across ALL payments. Returns a
// Map(billId -> paidAmount) so the UI can show true Amount Due = gross - paid.
export async function fetchDistBillPaidMap(billIds) {
  const m = new Map();
  const ids = (billIds || []).filter(Boolean);
  if (!ids.length) return m;
  const { data, error } = await supabase.from("dist_bill_payment_allocations").select("bill_id, amount").in("bill_id", ids);
  if (error) throw error;
  for (const r of data || []) m.set(r.bill_id, (m.get(r.bill_id) || 0) + (Number(r.amount) || 0));
  return m;
}

export async function fetchDistBillPayments({ vendorId } = {}) {
  let q = supabase.from("dist_bill_payments").select("*, dist_bill_payment_allocations(*)").order("created_at", { ascending: false });
  if (vendorId) q = q.eq("vendor_id", vendorId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDistBillPay);
}
export async function postDistBillPayment(pay, allocations = []) {
  const id = pay.id || distId("dbpay");
  const payDate = pay.payDate || new Date().toISOString().slice(0, 10);
  const amount = +(Number(pay.amount) || 0).toFixed(2);
  const head = {
    id, payment_number: pay.paymentNumber || `PAY-${Date.now().toString().slice(-6)}`, vendor_id: pay.vendorId || null,
    pay_date: payDate, amount, method: pay.method || "bank", bank_code: pay.bankCode || "1010",
    reference: pay.reference || null, notes: pay.notes || null, created_by: pay.createdBy || null, posted: false,
  };
  const { error } = await supabase.from("dist_bill_payments").insert(head);
  if (error) throw error;

  for (const a of allocations.filter(x => x.billId && Number(x.amount) > 0)) {
    await supabase.from("dist_bill_payment_allocations").insert({ id: distId("dbpa"), payment_id: id, bill_id: a.billId, amount: Number(a.amount) });
    // Update bill status by comparing total allocated to its gross (best-effort).
    const { data: allocs } = await supabase.from("dist_bill_payment_allocations").select("amount").eq("bill_id", a.billId);
    const paid = (allocs || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const { data: billRow } = await supabase.from("dist_bills").select("grand_total").eq("id", a.billId).maybeSingle();
    const gt = Number(billRow?.grand_total) || 0;
    const st = gt > 0 && paid + 0.005 >= gt ? "paid" : paid > 0 ? "part_paid" : "open";
    await supabase.from("dist_bills").update({ status: st }).eq("id", a.billId);
  }

  // Journal: Dr Trade creditors 2000 / Cr Bank (bank_code).
  if (amount > 0) {
    const [creditors, bank] = await Promise.all([
      resolveAccountForEntity(DIST_ENTITY, "2000"), resolveAccountForEntity(DIST_ENTITY, head.bank_code || "1010"),
    ]);
    if (creditors && bank) {
      try {
        await postJournalEntry({
          entityId: DIST_ENTITY, entryDate: payDate, memo: `Bill payment ${head.payment_number}`,
          sourceKind: "dist_bill_payment", sourceRef: `distbillpay:${id}`, createdBy: pay.createdBy,
          lines: [{ accountId: creditors, amount }, { accountId: bank, amount: -amount }],
        });
      } catch (e) { /* best-effort */ }
    }
  }
  await supabase.from("dist_bill_payments").update({ posted: true }).eq("id", id);
  return id;
}

// ============================================================================
// BUY-SIDE: edit/delete (with reversals) + detail aggregators — sell-side parity
// ============================================================================

// ── Purchase Orders: update + delete (POs don't post stock or journals) ──
export async function updateDistPurchaseOrder(po, lines = []) {
  if (!po.id) throw new Error("PO id required for update.");
  await supabase.from("dist_purchase_orders").update({
    vendor_id: po.vendorId || null, order_date: po.orderDate || null, expected_date: po.expectedDate || null,
    note: po.note || null, vat_mode: po.vatMode || "exclusive", discount_percent: Number(po.discountPercent) || 0,
    discount_type: po.discountType || "percent", reference: po.reference || null, payment_terms: po.paymentTerms || null,
  }).eq("id", po.id);
  await supabase.from("dist_purchase_order_lines").delete().eq("po_id", po.id);
  const lr = lines.filter(l => l.itemId && Number(l.qty) > 0).map(l => ({
    id: distId("dpol"), po_id: po.id, item_id: l.itemId, qty: Number(l.qty) || 0, unit_price: Number(l.unitPrice) || 0, tax_rate_id: l.taxRateId || null,
  }));
  if (lr.length) { const { error } = await supabase.from("dist_purchase_order_lines").insert(lr); if (error) throw error; }
  return po.id;
}
export async function deleteDistPurchaseOrder(poId) {
  const grns = await fetchDistGoodsReceipts().catch(() => []);
  if (grns.some(g => g.poId === poId)) throw new Error("Cannot delete: this PO has goods receipts. Delete those first.");
  const bills = await fetchDistBills({}).catch(() => []);
  if (bills.some(b => b.poId === poId)) throw new Error("Cannot delete: this PO has bills. Delete those first.");
  await supabase.from("dist_purchase_order_lines").delete().eq("po_id", poId);
  const { error } = await supabase.from("dist_purchase_orders").delete().eq("id", poId);
  if (error) throw error;
  return true;
}

// ── Goods Receipt: delete reverses stock (negative movements) + Dr GRNI/Cr Stock ──
export async function deleteDistGoodsReceipt(grnId) {
  const bills = await fetchDistBills({}).catch(() => []);
  if (bills.some(b => b.grnId === grnId)) throw new Error("Cannot delete: a bill references this receipt. Delete the bill first.");
  const { data: head } = await supabase.from("dist_goods_receipts").select("*").eq("id", grnId).maybeSingle();
  if (!head) throw new Error("Goods receipt not found.");
  const { data: lines } = await supabase.from("dist_goods_receipt_lines").select("*").eq("grn_id", grnId);
  let totalValue = 0;
  for (const l of lines || []) {
    // Reverse the +receipt with a -issue movement on the same batch.
    await addDistMovement({
      itemId: l.item_id, batchId: l.batch_id, qty: -Math.abs(Number(l.qty) || 0), type: "receipt_reversal",
      sourceKind: "goods_receipt_reversal", sourceRef: `distrecvREV:${grnId}:${l.item_id}:${l.batch_id}`,
    });
    totalValue += (Number(l.qty) || 0) * (Number(l.landed_cost) || 0);
  }
  if (totalValue > 0) {
    const [stock, grni] = await Promise.all([resolveAccountForEntity(DIST_ENTITY, "1200"), resolveAccountForEntity(DIST_ENTITY, "2050")]);
    if (stock && grni) {
      try {
        await postJournalEntry({ entityId: DIST_ENTITY, entryDate: new Date().toISOString().slice(0, 10),
          memo: `Reversal of goods receipt ${head.grn_number}`, sourceKind: "dist_goods_receipt_reversal",
          sourceRef: `distrecvREV:${grnId}`, lines: [{ accountId: grni, amount: +totalValue.toFixed(2) }, { accountId: stock, amount: -totalValue.toFixed(2) }] });
      } catch (e) { /* best-effort */ }
    }
  }
  // Delete the batches this GRN created, then lines + header.
  for (const l of lines || []) { if (l.batch_id) await supabase.from("dist_batches").delete().eq("id", l.batch_id); }
  await supabase.from("dist_goods_receipt_lines").delete().eq("grn_id", grnId);
  const { error } = await supabase.from("dist_goods_receipts").delete().eq("id", grnId);
  if (error) throw error;
  if (head.po_id) {
    const prog = await fetchDistPOReceiptProgress(head.po_id).catch(() => null);
    const poStatus = prog ? (prog.fullyReceived ? "received" : prog.partiallyReceived ? "partially_received" : "open") : "open";
    await supabase.from("dist_purchase_orders").update({ status: poStatus }).eq("id", head.po_id);
  }
  return true;
}

// Edit a goods receipt by reversing it (remove stock, delete batches, reverse
// the GRNI journal) then re-posting fresh. Mirrors updateDistDispatch. Blocked
// if a bill references it (delete the bill first, via deleteDistGoodsReceipt's guard).
export async function updateDistGoodsReceipt(grn, lines = []) {
  if (!grn.id) throw new Error("Goods receipt id required for update.");
  const { data: head } = await supabase.from("dist_goods_receipts").select("*").eq("id", grn.id).maybeSingle();
  if (!head) throw new Error("Goods receipt not found.");
  await deleteDistGoodsReceipt(grn.id); // guards bills + reverses stock/journal + deletes batches
  return postDistGoodsReceipt({
    vendorId: head.vendor_id, poId: head.po_id, sourceKind: head.source_kind,
    receivedDate: grn.receivedDate || head.received_date, note: grn.note ?? head.note, createdBy: head.created_by,
  }, lines);
}

// ── Bill: delete reverses Dr GRNI+VAT / Cr AP. Blocked if it has payments. ──
export async function deleteDistBill(billId) {
  const paidMap = await fetchDistBillPaidMap([billId]).catch(() => new Map());
  if ((paidMap.get(billId) || 0) > 0.005) throw new Error("Cannot delete: this bill has payments. Remove the payment first.");
  const { data: head } = await supabase.from("dist_bills").select("*").eq("id", billId).maybeSingle();
  if (!head) throw new Error("Bill not found.");
  const { data: lines } = await supabase.from("dist_bill_lines").select("*").eq("bill_id", billId);
  const mapped = (lines || []).map(l => ({ qty: l.qty, unitPrice: l.unit_price, discount: l.discount, discountType: l.discount_type, taxRateId: l.tax_rate_id }));
  const { net, vat } = await distDocNetVat({ lines: mapped, vatMode: head.vat_mode, discountValue: head.discount_percent, discountType: head.discount_type }).catch(() => ({ net: 0, vat: 0 }));
  const gross = +(net + vat).toFixed(2);
  if (gross > 0) {
    const [grni, vatAcc, ap] = await Promise.all([
      resolveAccountForEntity(DIST_ENTITY, "2050"), resolveAccountForEntity(DIST_ENTITY, "2100"), resolveAccountForEntity(DIST_ENTITY, "2000"),
    ]);
    if (grni && ap) {
      const jlines = [{ accountId: grni, amount: -net }, { accountId: ap, amount: +gross }];
      if (vat > 0 && vatAcc) jlines.push({ accountId: vatAcc, amount: -vat });
      try {
        await postJournalEntry({ entityId: DIST_ENTITY, entryDate: new Date().toISOString().slice(0, 10),
          memo: `Reversal of bill ${head.bill_number}`, sourceKind: "dist_bill_reversal",
          sourceRef: `distbillREV:${billId}`, lines: jlines });
      } catch (e) { /* best-effort */ }
    }
  }
  await supabase.from("dist_bill_lines").delete().eq("bill_id", billId);
  const { error } = await supabase.from("dist_bills").delete().eq("id", billId);
  if (error) throw error;
  return true;
}

// ── Bill payment: delete reverses Dr AP / Cr Bank + frees allocations. ──
export async function deleteDistBillPayment(payId) {
  const { data: head } = await supabase.from("dist_bill_payments").select("*").eq("id", payId).maybeSingle();
  if (!head) throw new Error("Payment not found.");
  const amount = +(Number(head.amount) || 0).toFixed(2);
  if (amount > 0) {
    const [ap, bank] = await Promise.all([resolveAccountForEntity(DIST_ENTITY, "2000"), resolveAccountForEntity(DIST_ENTITY, head.bank_code || "1010")]);
    if (ap && bank) {
      try {
        await postJournalEntry({ entityId: DIST_ENTITY, entryDate: new Date().toISOString().slice(0, 10),
          memo: `Reversal of payment ${head.payment_number || payId}`, sourceKind: "dist_bill_payment_reversal",
          sourceRef: `distbillpayREV:${payId}`, lines: [{ accountId: ap, amount: -amount }, { accountId: bank, amount }] });
      } catch (e) { /* best-effort */ }
    }
  }
  // Re-open bills this payment had settled.
  const { data: allocs } = await supabase.from("dist_bill_payment_allocations").select("bill_id").eq("payment_id", payId);
  await supabase.from("dist_bill_payment_allocations").delete().eq("payment_id", payId);
  for (const a of allocs || []) {
    const { data: rest } = await supabase.from("dist_bill_payment_allocations").select("amount").eq("bill_id", a.bill_id);
    const paid = (rest || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    await supabase.from("dist_bills").update({ status: paid > 0 ? "part_paid" : "open" }).eq("id", a.bill_id);
  }
  const { error } = await supabase.from("dist_bill_payments").delete().eq("id", payId);
  if (error) throw error;
  return true;
}

// ── Detail aggregators for buy-side drill-downs ──

// Per-PO-line receipt progress for partial receipts: received-so-far (summed
// across all goods receipts for this PO, by item) vs ordered + outstanding.
// Derived — no schema change, matching our append-only pattern.
export async function fetchDistPOReceiptProgress(poId) {
  const { data: head } = await supabase.from("dist_purchase_orders").select("*, dist_purchase_order_lines(*)").eq("id", poId).maybeSingle();
  if (!head) return null;
  const grns = await fetchDistGoodsReceipts().catch(() => []);
  const poGrns = grns.filter(g => g.poId === poId);
  const receivedByItem = new Map();
  for (const g of poGrns) for (const l of (g.lines || [])) {
    receivedByItem.set(l.itemId, (receivedByItem.get(l.itemId) || 0) + (Number(l.qty) || 0));
  }
  const remainingByItem = new Map(receivedByItem);
  const lines = (head.dist_purchase_order_lines || []).map(l => {
    const ordered = Number(l.qty) || 0;
    const pool = remainingByItem.get(l.item_id) || 0;
    const received = Math.min(ordered, pool);
    remainingByItem.set(l.item_id, Math.max(0, pool - received));
    return { poLineId: l.id, itemId: l.item_id, ordered, received: +received.toFixed(3),
      outstanding: +Math.max(0, ordered - received).toFixed(3), unitPrice: Number(l.unit_price) || 0, taxRateId: l.tax_rate_id || null };
  });
  const anyReceived = lines.some(l => l.received > 0.0005);
  const fullyReceived = lines.length > 0 && lines.every(l => l.outstanding <= 0.0005);
  return { poId, lines, fullyReceived, partiallyReceived: anyReceived && !fullyReceived };
}

export async function fetchDistPODetail(poId) {
  const { data: head } = await supabase.from("dist_purchase_orders").select("*, dist_purchase_order_lines(*)").eq("id", poId).maybeSingle();
  if (!head) return null;
  const [items, vendors, grns, bills] = await Promise.all([
    fetchDistItems().catch(() => []), fetchDistContacts({ kind: "vendor" }).catch(() => []),
    fetchDistGoodsReceipts().catch(() => []), fetchDistBills({}).catch(() => []),
  ]);
  const itemById = new Map(items.map(i => [i.id, i]));
  const vendor = vendors.find(v => v.id === head.vendor_id) || null;
  const prog = await fetchDistPOReceiptProgress(poId).catch(() => null);
  const progByLine = new Map((prog?.lines || []).map(l => [l.poLineId, l]));
  const lines = (head.dist_purchase_order_lines || []).map(l => {
    const p = progByLine.get(l.id);
    return { poLineId: l.id, itemId: l.item_id, item: itemById.get(l.item_id) || null, qty: Number(l.qty) || 0, unitPrice: Number(l.unit_price) || 0,
      received: p?.received || 0, outstanding: p ? p.outstanding : (Number(l.qty) || 0), taxRateId: l.tax_rate_id || null,
      amount: +((Number(l.qty) || 0) * (Number(l.unit_price) || 0)).toFixed(2) };
  });
  const total = +lines.reduce((s, l) => s + l.amount, 0).toFixed(2);
  return { id: head.id, poNumber: head.po_number, status: head.status, orderDate: head.order_date, expectedDate: head.expected_date,
    reference: head.reference, vendorId: head.vendor_id, vendor, lines, total,
    fullyReceived: prog?.fullyReceived || false, partiallyReceived: prog?.partiallyReceived || false,
    grns: grns.filter(g => g.poId === poId), bills: bills.filter(b => b.poId === poId) };
}

export async function fetchDistGRNDetail(grnId) {
  const { data: head } = await supabase.from("dist_goods_receipts").select("*, dist_goods_receipt_lines(*)").eq("id", grnId).maybeSingle();
  if (!head) return null;
  const [items, vendors, pos] = await Promise.all([
    fetchDistItems().catch(() => []), fetchDistContacts({ kind: "vendor" }).catch(() => []), fetchDistPurchaseOrders({}).catch(() => []),
  ]);
  const itemById = new Map(items.map(i => [i.id, i]));
  const vendor = vendors.find(v => v.id === head.vendor_id) || null;
  const po = pos.find(p => p.id === head.po_id) || null;
  const lines = (head.dist_goods_receipt_lines || []).map(l => ({ itemId: l.item_id, item: itemById.get(l.item_id) || null, batchId: l.batch_id, qty: Number(l.qty) || 0, landedCost: Number(l.landed_cost) || 0, expiryDate: l.expiry_date, amount: +((Number(l.qty) || 0) * (Number(l.landed_cost) || 0)).toFixed(2) }));
  const total = +lines.reduce((s, l) => s + l.amount, 0).toFixed(2);
  const allBills = await fetchDistBills({}).catch(() => []);
  const billed = allBills.some(b => b.grnId === grnId);
  return { id: head.id, grnNumber: head.grn_number, posted: !!head.posted, receivedDate: head.received_date, sourceKind: head.source_kind,
    poId: head.po_id, poNumber: po?.poNumber || null, vendorId: head.vendor_id, vendor, lines, total, billed };
}

export async function fetchDistBillDetail(billId) {
  const { data: head } = await supabase.from("dist_bills").select("*, dist_bill_lines(*)").eq("id", billId).maybeSingle();
  if (!head) return null;
  const [items, vendors, pos, grns, taxRates] = await Promise.all([
    fetchDistItems().catch(() => []), fetchDistContacts({ kind: "vendor" }).catch(() => []),
    fetchDistPurchaseOrders({}).catch(() => []), fetchDistGoodsReceipts().catch(() => []), fetchDistTaxRates().catch(() => []),
  ]);
  const itemById = new Map(items.map(i => [i.id, i]));
  const trById = new Map(taxRates.map(t => [t.id, t]));
  const vendor = vendors.find(v => v.id === head.vendor_id) || null;
  const po = pos.find(p => p.id === head.po_id) || null;
  const grn = grns.find(g => g.id === head.grn_id) || null;
  const lines = (head.dist_bill_lines || []).map(l => {
    const qty = Number(l.qty) || 0, rate = Number(l.unit_price) || 0, gross = qty * rate;
    const net = l.discount_type === "percent" ? gross * (1 - (Number(l.discount) || 0) / 100) : gross - (Number(l.discount) || 0);
    const pct = trById.get(l.tax_rate_id)?.percent || 0;
    return { itemId: l.item_id, item: itemById.get(l.item_id) || null, qty, rate, vatPct: pct, vat: +(net * pct / 100).toFixed(2), amount: +net.toFixed(2) };
  });
  const net = +lines.reduce((s, l) => s + l.amount, 0).toFixed(2);
  const vat = +lines.reduce((s, l) => s + l.vat, 0).toFixed(2);
  const grand = +(net + vat).toFixed(2);
  const paidMap = await fetchDistBillPaidMap([billId]).catch(() => new Map());
  const paid = paidMap.get(billId) || 0;
  const balance = +(grand - paid).toFixed(2);
  const overdue = balance > 0.005 && head.due_date && new Date(head.due_date) < new Date();
  return { id: head.id, billNumber: head.bill_number, billDate: head.bill_date, dueDate: head.due_date, reference: head.reference,
    poId: head.po_id, poNumber: po?.poNumber || null, grnId: head.grn_id, grnNumber: grn?.grnNumber || null,
    vendor, lines, net, vat, grand, paid, balance,
    status: balance <= 0.005 ? "paid" : overdue ? "overdue" : paid > 0 ? "part_paid" : "open" };
}

export async function fetchDistVendorDetail(vendorId) {
  const [pos, grns, bills, payments] = await Promise.all([
    fetchDistPurchaseOrders({ vendorId }).catch(() => []),
    fetchDistGoodsReceipts().catch(() => []),
    fetchDistBills({ vendorId }).catch(() => []),
    fetchDistBillPayments({}).catch(() => []),
  ]);
  const paidMap = await fetchDistBillPaidMap(bills.map(b => b.id)).catch(() => new Map());
  const billRows = bills.map(b => {
    const gross = b.grandTotal != null && b.grandTotal > 0 ? b.grandTotal : 0;
    const paid = paidMap.get(b.id) || 0;
    return { id: b.id, billNumber: b.billNumber, date: b.billDate, dueDate: b.dueDate, amount: gross, balance: +(gross - paid).toFixed(2) };
  }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const payable = +billRows.reduce((s, r) => s + r.balance, 0).toFixed(2);
  const poRows = pos.map(p => ({ id: p.id, poNumber: p.poNumber, date: p.orderDate, status: p.status,
    total: (p.lines || []).reduce((t, l) => t + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0) }))
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return { purchaseOrders: poRows, bills: billRows, grns: grns.filter(g => g.vendorId === vendorId), payable };
}

// Payment drill-down: resolve vendor + the bills this payment settled.
export async function fetchDistPaymentDetail(payId) {
  const { data: head } = await supabase.from("dist_bill_payments").select("*, dist_bill_payment_allocations(*)").eq("id", payId).maybeSingle();
  if (!head) return null;
  const [vendors, bills] = await Promise.all([
    fetchDistContacts({ kind: "vendor" }).catch(() => []), fetchDistBills({}).catch(() => []),
  ]);
  const vendor = vendors.find(v => v.id === head.vendor_id) || null;
  const billByid = new Map(bills.map(b => [b.id, b]));
  const allocations = (head.dist_bill_payment_allocations || []).map(a => {
    const b = billByid.get(a.bill_id);
    return { billId: a.bill_id, billNumber: b?.billNumber || "\u2014", amount: Number(a.amount) || 0 };
  });
  return {
    id: head.id, paymentNumber: head.payment_number, payDate: head.pay_date, amount: Number(head.amount) || 0,
    method: head.method, bankCode: head.bank_code, reference: head.reference || "", vendor, allocations,
  };
}
// ============================================================================

// ── Customers (reuse dist_contacts kind='customer') ──
export async function fetchDistCustomers() {
  return fetchDistContacts({ kind: "customer" });
}

// ── PRICE LISTS (customer × item × sell price) ──
const mapDistPrice = (p) => ({ id: p.id, customerId: p.customer_id, itemId: p.item_id, sellPrice: Number(p.sell_price) || 0 });
export async function fetchDistPriceList(customerId) {
  let q = supabase.from("dist_price_lists").select("*");
  if (customerId) q = q.eq("customer_id", customerId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDistPrice);
}
export async function upsertDistPrice(p) {
  const row = { id: p.id || distId("dpl"), customer_id: p.customerId, item_id: p.itemId, sell_price: Number(p.sellPrice) || 0 };
  const { data, error } = await supabase.from("dist_price_lists").upsert(row, { onConflict: "customer_id,item_id" }).select().maybeSingle();
  if (error) throw error;
  return data ? mapDistPrice(data) : null;
}
export async function deleteDistPrice(id) {
  const { error } = await supabase.from("dist_price_lists").delete().eq("id", id);
  if (error) throw error;
}
// Resolve a customer's price for an item: price-list entry first, else item default sell.
// ── STORE ORDERING PORTAL helpers ──
// Resolve the Distribution customer(s) for a store user: dist_contacts (kind
// customer) whose store_id is one of the user's storeIds. Returns [{id, name, storeId}].
export async function fetchDistCustomersForStores(storeIds = []) {
  const ids = (storeIds || []).filter(Boolean);
  if (!ids.length) return [];
  const customers = await fetchDistContacts({ kind: "customer" });
  return customers.filter(c => c.storeId && ids.includes(c.storeId)).map(c => ({ id: c.id, name: c.displayName, storeId: c.storeId }));
}

// Priced catalogue for a customer: active items + each item's resolved sell
// price (price-list entry, else item default). One round-trip for the portal.
// Deliberately returns NO stock figures — stores order blind (SoW principle).
export async function fetchDistPortalCatalogue(customerId) {
  const [itemsAll, priceList, collLinks, collections, custRow] = await Promise.all([
    fetchDistItems(),
    customerId ? fetchDistPriceList(customerId) : Promise.resolve([]),
    supabase.from("dist_collection_items").select("collection_id, item_id").then(r => r.data || []),
    fetchDistCollections().catch(() => []),
    customerId ? supabase.from("dist_contacts").select("is_central_kitchen").eq("id", customerId).maybeSingle().then(r => r.data) : Promise.resolve(null),
  ]);
  // Directional visibility. Central Kitchen sees its own ck-type items; stores
  // see everything EXCEPT items flagged hidden_from_stores (the CK ingredients).
  const orderingIsCK = !!(custRow && custRow.is_central_kitchen);
  const items = (itemsAll || []).filter(i =>
    orderingIsCK ? (i.itemType === "ck" || !i.hiddenFromStores) : !i.hiddenFromStores
  );
  const priceByItem = new Map((priceList || []).map(p => [p.itemId, p.sellPrice]));
  // Manual membership from the link table.
  const collsByItem = new Map();
  (collLinks || []).forEach(l => {
    if (!collsByItem.has(l.item_id)) collsByItem.set(l.item_id, []);
    collsByItem.get(l.item_id).push(l.collection_id);
  });
  // Smart collections: an item belongs if its category is in the rule set.
  const smart = (collections || []).filter(c => c.mode === "smart" && (c.ruleCategories || []).length);
  const smartByCat = new Map();   // lowercased category -> [collectionId]
  smart.forEach(c => (c.ruleCategories || []).forEach(cat => {
    const k = String(cat).toLowerCase();
    if (!smartByCat.has(k)) smartByCat.set(k, []);
    smartByCat.get(k).push(c.id);
  }));
  return items.filter(i => i.active !== false).map(i => {
    const manual = collsByItem.get(i.id) || [];
    const viaSmart = i.category ? (smartByCat.get(String(i.category).toLowerCase()) || []) : [];
    // Base membership: hand-picked links + smart-category matches + a manual
    // collection's own includeCategories.
    const base = new Set([...manual, ...viaSmart]);
    (collections || []).forEach(c => {
      if (c.mode === "smart") return;
      const inc = (c.includeCategories || []).map(x => x.toLowerCase());
      if (i.category && inc.includes(i.category.toLowerCase())) base.add(c.id);
    });
    // Nested: if an item is in collection X, and collection Y lists X as a child,
    // the item is also in Y — resolved transitively (with cycle protection).
    const childMap = new Map((collections || []).map(c => [c.id, (c.childCollectionIds || [])]));
    const expanded = new Set(base);
    let changed = true, guard = 0;
    while (changed && guard < 20) {
      changed = false; guard++;
      (collections || []).forEach(parent => {
        if (expanded.has(parent.id)) return;
        const kids = childMap.get(parent.id) || [];
        if (kids.some(k => expanded.has(k))) { expanded.add(parent.id); changed = true; }
      });
    }
    const collectionIds = [...expanded];
    return {
      id: i.id, sku: i.sku, name: i.name, category: i.category || "Uncategorised",
      packCount: i.packCount, packSize: i.packSize, packUnit: i.packUnit,
      taxRateId: i.taxRateId, imageUrl: i.imageUrl || "",
      supplier: i.supplier || "", location: i.location || "",
      tagFrequency: i.tagFrequency || "", tagCategory: i.tagCategory || "",
      itemType: i.itemType || "warehouse",
      fulfilledBy: i.fulfilledBy || null,   // direct supplier routing — checkout splits on this
      collectionIds,
      price: priceByItem.has(i.id) ? priceByItem.get(i.id) : (i.sellRate != null ? Number(i.sellRate) : 0),
    };
  });
}

// ── Distribution Collections (curated item groups, many-to-many) ────────────
const mapDistCollection = (c) => ({
  id: c.id, name: c.name || "", description: c.description || "",
  sortOrder: c.sort_order != null ? Number(c.sort_order) : 0,
  active: c.active !== false, createdAt: c.created_at,
  mode: c.mode || "manual", ruleCategories: c.rule_categories || [],
  includeCategories: c.include_categories || [], childCollectionIds: c.child_collection_ids || [],
});
export async function fetchDistCollections({ includeInactive } = {}) {
  let q = supabase.from("dist_collections").select("*").order("sort_order").order("name");
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDistCollection);
}
export async function upsertDistCollection(c) {
  const row = {
    id: c.id || distId("dcol"), name: c.name || "", description: c.description || null,
    sort_order: c.sortOrder != null ? Number(c.sortOrder) : 0, active: c.active !== false,
    mode: c.mode === "smart" ? "smart" : "manual",
    rule_categories: c.mode === "smart" ? (c.ruleCategories || []) : [],
    include_categories: c.mode === "smart" ? [] : (c.includeCategories || []),
    child_collection_ids: c.mode === "smart" ? [] : (c.childCollectionIds || []),
  };
  const { data, error } = await supabase.from("dist_collections").upsert(row).select().maybeSingle();
  if (error) throw error;
  return data ? mapDistCollection(data) : null;
}
export async function deleteDistCollection(id) {
  // Link rows cascade via FK on delete.
  const { error } = await supabase.from("dist_collections").delete().eq("id", id);
  if (error) throw error;
}
// Item membership for a collection.
export async function fetchDistCollectionItems(collectionId) {
  const { data, error } = await supabase.from("dist_collection_items")
    .select("item_id, sort_order").eq("collection_id", collectionId).order("sort_order");
  if (error) throw error;
  return (data || []).map(r => ({ itemId: r.item_id, sortOrder: r.sort_order }));
}
// Replace the full membership of a collection with the given item ids.
export async function setDistCollectionItems(collectionId, itemIds = []) {
  const del = await supabase.from("dist_collection_items").delete().eq("collection_id", collectionId);
  if (del.error) throw del.error;
  if (!itemIds.length) return;
  const rows = itemIds.map((itemId, idx) => ({ collection_id: collectionId, item_id: itemId, sort_order: idx }));
  const { error } = await supabase.from("dist_collection_items").insert(rows);
  if (error) throw error;
}

export async function resolveDistSellPrice(customerId, itemId) {
  if (customerId) {
    const { data } = await supabase.from("dist_price_lists").select("sell_price").eq("customer_id", customerId).eq("item_id", itemId).maybeSingle();
    if (data) return Number(data.sell_price) || 0;
  }
  const { data: it } = await supabase.from("dist_items").select("sell_rate").eq("id", itemId).maybeSingle();
  return Number(it?.sell_rate) || 0;
}

// ── SALES ORDERS ──
const mapDistSO = (o) => ({
  id: o.id, soNumber: o.so_number || "", customerId: o.customer_id || null, status: o.status || "draft",
  orderDate: o.order_date || null, expectedShip: o.expected_ship || null, paymentTerms: o.payment_terms || "",
  reference: o.reference || "", deliveryMethod: o.delivery_method || "", salesperson: o.salesperson || "",
  vatMode: o.vat_mode || "exclusive", discountPercent: Number(o.discount_percent) || 0, discountType: o.discount_type || "percent",
  shippingCharge: Number(o.shipping_charge) || 0, note: o.note || "", terms: o.terms || "",
  createdBy: o.created_by || null, createdAt: o.created_at, lines: (o.dist_sales_order_lines || []).map(mapDistSOLine),
});
const mapDistSOLine = (l) => ({ id: l.id, soId: l.so_id, itemId: l.item_id, qty: Number(l.qty) || 0, fulfilChannel: l.fulfil_channel || null, lineNote: l.line_note || "", uom: l.uom || null, unitPrice: Number(l.unit_price) || 0, discount: Number(l.discount) || 0, discountType: l.discount_type || "percent", taxRateId: l.tax_rate_id || null });

export async function fetchDistSalesOrders({ customerId, status } = {}) {
  let q = supabase.from("dist_sales_orders").select("*, dist_sales_order_lines(*)").order("created_at", { ascending: false });
  if (customerId) q = q.eq("customer_id", customerId);
  if (status) q = Array.isArray(status) ? q.in("status", status) : q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDistSO);
}
export async function createDistSalesOrder(so, lines = []) {
  const id = so.id || distId("dso");
  const row = {
    id, so_number: so.soNumber || `SO-${Date.now().toString().slice(-6)}`, customer_id: so.customerId || null,
    status: so.status || "draft", order_date: so.orderDate || new Date().toISOString().slice(0, 10),
    expected_ship: so.expectedShip || null, payment_terms: so.paymentTerms || null, reference: so.reference || null,
    delivery_method: so.deliveryMethod || null, salesperson: so.salesperson || null,
    vat_mode: so.vatMode || "exclusive", discount_percent: Number(so.discountPercent) || 0, discount_type: so.discountType || "percent",
    shipping_charge: Number(so.shippingCharge) || 0, note: so.note || null, terms: so.terms || null, created_by: so.createdBy || null,
  };
  const { error } = await supabase.from("dist_sales_orders").insert(row);
  if (error) throw error;
  const lr = lines.filter(l => l.itemId && Number(l.qty) > 0).map(l => ({
    id: distId("dsol"), so_id: id, item_id: l.itemId, qty: Number(l.qty) || 0, unit_price: Number(l.unitPrice) || 0,
    discount: Number(l.discount) || 0, discount_type: l.discountType || "percent", tax_rate_id: l.taxRateId || null,
    line_note: (l.lineNote || "").trim() || null, uom: l.uom || null,
  }));
  if (lr.length) { const { error: e2 } = await supabase.from("dist_sales_order_lines").insert(lr); if (e2) throw e2; }
  if ((so.status || "draft") === "confirmed") autoPrintSoTicket(id); // born-confirmed orders print too
  return id;
}

// Update an existing sales order: rewrite header + replace its lines. Safe
// because committed stock is derived from open SO lines (no movement cleanup).
export async function updateDistSalesOrder(so, lines = []) {
  if (!so.id) throw new Error("Sales order id required for update.");
  const row = {
    customer_id: so.customerId || null, status: so.status || "draft",
    order_date: so.orderDate || new Date().toISOString().slice(0, 10),
    expected_ship: so.expectedShip || null, payment_terms: so.paymentTerms || null, reference: so.reference || null,
    delivery_method: so.deliveryMethod || null, salesperson: so.salesperson || null,
    vat_mode: so.vatMode || "exclusive", discount_percent: Number(so.discountPercent) || 0, discount_type: so.discountType || "percent",
    shipping_charge: Number(so.shippingCharge) || 0, note: so.note || null, terms: so.terms || null,
  };
  const { error } = await supabase.from("dist_sales_orders").update(row).eq("id", so.id);
  if (error) throw error;
  // Replace lines.
  await supabase.from("dist_sales_order_lines").delete().eq("so_id", so.id);
  const lr = lines.filter(l => l.itemId && Number(l.qty) > 0).map(l => ({
    id: distId("dsol"), so_id: so.id, item_id: l.itemId, qty: Number(l.qty) || 0, unit_price: Number(l.unitPrice) || 0,
    discount: Number(l.discount) || 0, discount_type: l.discountType || "percent", tax_rate_id: l.taxRateId || null,
    line_note: (l.lineNote || "").trim() || null, uom: l.uom || null,
  }));
  if (lr.length) { const { error: e2 } = await supabase.from("dist_sales_order_lines").insert(lr); if (e2) throw e2; }
  return so.id;
}

// Delete a sales order + its lines. Blocked if it has been picked/dispatched/
// invoiced (those would leave orphaned downstream documents).
export async function deleteDistSalesOrder(soId) {
  const detail = await fetchDistSalesOrderDetail(soId).catch(() => null);
  if (detail && (detail.picks.length || detail.dispatches.length || detail.invoices.length)) {
    throw new Error("Cannot delete: this order has picks, dispatches or invoices. Cancel those first.");
  }
  await supabase.from("dist_sales_order_lines").delete().eq("so_id", soId);
  const { error } = await supabase.from("dist_sales_orders").delete().eq("id", soId);
  if (error) throw error;
  return true;
}

// Manager edits a pending order's lines before approving. Records an amendment
// note so the change is auditable (who edited, when). Lines: [{itemId, qty, uom, unitPrice, taxRateId}].
export async function editPendingOrderLines(soId, lines, editorName) {
  const { data: so } = await supabase.from("dist_sales_orders").select("*").eq("id", soId).single();
  if (!so) throw new Error("Order not found.");
  if (so.status !== "pending_approval" && so.status !== "confirmed") throw new Error("Only pending or confirmed orders can be edited here.");
  await supabase.from("dist_sales_order_lines").delete().eq("so_id", soId);
  const lr = (lines || []).filter(l => l.itemId && Number(l.qty) > 0).map(l => ({
    id: distId("dsol"), so_id: soId, item_id: l.itemId, qty: Number(l.qty) || 0,
    unit_price: Number(l.unitPrice) || 0, tax_rate_id: l.taxRateId || null, uom: l.uom || null,
  }));
  if (lr.length) { const { error } = await supabase.from("dist_sales_order_lines").insert(lr); if (error) throw error; }
  const stamp = `Edited by ${editorName || "manager"} on ${new Date().toISOString().slice(0, 10)}`;
  await supabase.from("dist_sales_orders").update({ note: [so.note, stamp].filter(Boolean).join(" · ") }).eq("id", soId);
  return soId;
}

// Merge several PENDING orders from the SAME store into the first one. Duplicate
// items have their quantities summed. The others are cancelled with a pointer note.
export async function mergePendingOrders(soIds, editorName) {
  const ids = [...new Set((soIds || []).filter(Boolean))];
  if (ids.length < 2) throw new Error("Pick at least two orders to merge.");
  const { data: sos } = await supabase.from("dist_sales_orders").select("*").in("id", ids);
  if (!sos || sos.length !== ids.length) throw new Error("Some orders not found.");
  const cust = sos[0].customer_id;
  if (!sos.every(o => o.customer_id === cust)) throw new Error("All orders must be for the same store.");
  if (!sos.every(o => o.status === "pending_approval")) throw new Error("Only pending orders can be merged.");
  const target = sos.find(o => o.id === ids[0]) || sos[0];
  const { data: allLines } = await supabase.from("dist_sales_order_lines").select("*").in("so_id", ids);
  // Sum duplicate items across all orders.
  const merged = new Map();
  (allLines || []).forEach(l => {
    const k = l.item_id;
    if (!merged.has(k)) merged.set(k, { ...l, qty: 0 });
    merged.get(k).qty = Number(merged.get(k).qty) + (Number(l.qty) || 0);
  });
  await supabase.from("dist_sales_order_lines").delete().in("so_id", ids);
  const lr = [...merged.values()].map(l => ({
    id: distId("dsol"), so_id: target.id, item_id: l.item_id, qty: Number(l.qty) || 0,
    unit_price: Number(l.unit_price) || 0, tax_rate_id: l.tax_rate_id || null, uom: l.uom || null, line_note: l.line_note || null,
  }));
  if (lr.length) { const { error } = await supabase.from("dist_sales_order_lines").insert(lr); if (error) throw error; }
  const others = ids.filter(id => id !== target.id);
  const stamp = `Merged ${others.length + 1} orders by ${editorName || "manager"} on ${new Date().toISOString().slice(0, 10)}`;
  await supabase.from("dist_sales_orders").update({ note: [target.note, stamp].filter(Boolean).join(" · ") }).eq("id", target.id);
  // Cancel the absorbed orders.
  for (const oid of others) {
    await supabase.from("dist_sales_orders").update({ status: "cancelled", note: `Merged into ${target.so_number || target.id}` }).eq("id", oid);
  }
  return target.id;
}

export async function setDistSalesOrderStatus(id, status) {
  const { error } = await supabase.from("dist_sales_orders").update({ status }).eq("id", id);
  if (error) throw error;
  if (status === "confirmed") autoPrintSoTicket(id); // warehouse ticket, fire-and-forget
}

// ── COMMITTED stock: SUM of open SO line qty per item (draft/confirmed/picking) ──
export async function computeDistCommitted(itemId) {
  const { data: orders } = await supabase.from("dist_sales_orders").select("id").in("status", ["draft", "confirmed", "picking"]);
  const openIds = (orders || []).map(o => o.id);
  const m = new Map();
  if (!openIds.length) return m;
  let q = supabase.from("dist_sales_order_lines").select("item_id, qty, so_id").in("so_id", openIds);
  if (itemId) q = q.eq("item_id", itemId);
  const { data } = await q;
  for (const r of data || []) m.set(r.item_id, (m.get(r.item_id) || 0) + (Number(r.qty) || 0));
  return m;
}

// ── CK DEMAND VIA DISTRIBUTION ───────────────────────────────────────────────
// The kitchen's "what needs making" view under the hub model: stores order from
// Dist only; CK observes that demand THROUGH Dist rather than receiving orders.
// Demand = open store SO lines for CK-type dist items; net = demand − Dist
// on-hand. No explicit Dist→CK orders exist or are needed.
export async function computeCkDemandViaDist() {
  const [items, onHand, committed] = await Promise.all([
    fetchDistItems(), computeDistOnHand(), computeDistCommitted(),
  ]);
  return items
    .filter(i => (i.itemType || "warehouse") === "ck")
    .map(i => {
      const oh = onHand.get(i.id) || 0;
      const pending = committed.get(i.id) || 0;
      return {
        distItemId: i.id, name: i.name, sku: i.sku || "",
        ckProductId: i.ckProductId || null,
        pendingQty: pending, onHand: oh,
        netToMake: Math.max(0, pending - oh),
      };
    })
    .sort((a, b) => b.netToMake - a.netToMake || b.pendingQty - a.pendingQty);
}

// ============================================================================
// DISTRIBUTION — SELL SIDE (B): FEFO allocation, picks, dispatch (stock OUT +
// COGS), invoices, payments received, credit notes. Journals via postJournalEntry.
// ============================================================================

// ── FEFO: suggest batch allocation for an item + qty (soonest expiry first) ──
// Returns [{ batchId, batchNo, expiryDate, landedCost, qty }] covering up to `need`.
export async function suggestDistFefo(itemId, need) {
  const want = Number(need) || 0;
  if (!itemId || want <= 0) return [];
  const batches = await fetchDistBatches(itemId); // already expiry asc, nullsFirst:false
  const onHand = await computeDistBatchOnHand(itemId); // Map batchId -> qty
  const out = [];
  let remaining = want;
  for (const b of batches) {
    if (remaining <= 0) break;
    const avail = onHand.get(b.id) || 0;
    if (avail <= 0) continue;
    const take = Math.min(avail, remaining);
    out.push({ batchId: b.id, batchNo: b.batchNo, expiryDate: b.expiryDate, landedCost: b.landedCost, qty: +take.toFixed(3) });
    remaining -= take;
  }
  return out; // may be short if not enough stock; caller can see total < need
}

// ── PICKS ──
const mapDistPick = (p) => ({
  id: p.id, pickNumber: p.pick_number || "", soId: p.so_id || null, customerId: p.customer_id || null,
  status: p.status || "draft", pickDate: p.pick_date || null, note: p.note || "",
  createdBy: p.created_by || null, createdAt: p.created_at, lines: (p.dist_pick_lines || []).map(mapDistPickLine),
});
const mapDistPickLine = (l) => ({ id: l.id, pickId: l.pick_id, itemId: l.item_id, batchId: l.batch_id, qty: Number(l.qty) || 0, unitPrice: Number(l.unit_price) || 0, taxRateId: l.tax_rate_id || null });

export async function fetchDistPicks({ soId, status } = {}) {
  let q = supabase.from("dist_picks").select("*, dist_pick_lines(*)").order("created_at", { ascending: false });
  if (soId) q = q.eq("so_id", soId);
  if (status) q = Array.isArray(status) ? q.in("status", status) : q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDistPick);
}
export async function createDistPick(pick, lines = []) {
  const id = pick.id || distId("dpick");
  // Guard: refuse a second active pick for the same sales order. A SO should
  // have at most one open/picked pick at a time (prevents duplicate picks).
  if (pick.soId) {
    const { data: existing } = await supabase.from("dist_picks").select("id, status").eq("so_id", pick.soId);
    if ((existing || []).some(p => p.status !== "cancelled")) {
      throw new Error("This order already has a pick. Open that pick to edit or dispatch it.");
    }
  }
  const row = {
    id, pick_number: pick.pickNumber || `PICK-${Date.now().toString().slice(-6)}`, so_id: pick.soId || null,
    customer_id: pick.customerId || null, status: pick.status || "picked", pick_date: pick.pickDate || new Date().toISOString().slice(0, 10),
    note: pick.note || null, created_by: pick.createdBy || null,
  };
  const { error } = await supabase.from("dist_picks").insert(row);
  if (error) throw error;
  // Batchless lines are allowed: fresh/CK (nonStock) AND stocked items picked
  // beyond available batches (the negative-stock dispatch override). Picks
  // never touch stock, so storing them is safe; dispatch decides movements.
  const lr = lines.filter(l => l.itemId && Number(l.qty) > 0).map(l => ({
    id: distId("dpickl"), pick_id: id, item_id: l.itemId, batch_id: l.batchId || null, qty: Number(l.qty) || 0,
    unit_price: Number(l.unitPrice) || 0, tax_rate_id: l.taxRateId || null,
  }));
  if (lr.length) { const { error: e2 } = await supabase.from("dist_pick_lines").insert(lr); if (e2) throw e2; }
  if (pick.soId) await supabase.from("dist_sales_orders").update({ status: "picking" }).eq("id", pick.soId);
  return id;
}

// Update a pick: rewrite header + replace lines. Picks don't touch stock or
// the ledger, so this is a plain rewrite (safe).
export async function updateDistPick(pick, lines = []) {
  if (!pick.id) throw new Error("Pick id required for update.");
  await supabase.from("dist_picks").update({
    pick_date: pick.pickDate || new Date().toISOString().slice(0, 10), note: pick.note || null,
  }).eq("id", pick.id);
  await supabase.from("dist_pick_lines").delete().eq("pick_id", pick.id);
  const lr = lines.filter(l => l.itemId && Number(l.qty) > 0).map(l => ({
    id: distId("dpickl"), pick_id: pick.id, item_id: l.itemId, batch_id: l.batchId, qty: Number(l.qty) || 0,
    unit_price: Number(l.unitPrice) || 0, tax_rate_id: l.taxRateId || null,
  }));
  if (lr.length) { const { error } = await supabase.from("dist_pick_lines").insert(lr); if (error) throw error; }
  return pick.id;
}

// Delete a pick. Blocked if it's already been dispatched (a dispatch references
// it). Resets its SO back to 'confirmed' so it can be re-picked.
export async function deleteDistPick(pickId) {
  const disp = await fetchDistDispatches({}).catch(() => []);
  if (disp.some(d => d.pickId === pickId)) throw new Error("Cannot delete: this pick has been dispatched. Delete the dispatch first.");
  const { data: pick } = await supabase.from("dist_picks").select("so_id").eq("id", pickId).maybeSingle();
  await supabase.from("dist_pick_lines").delete().eq("pick_id", pickId);
  const { error } = await supabase.from("dist_picks").delete().eq("id", pickId);
  if (error) throw error;
  if (pick?.so_id) await supabase.from("dist_sales_orders").update({ status: "confirmed" }).eq("id", pick.so_id);
  return true;
}
const mapDistDispatch = (d) => ({
  id: d.id, dispatchNumber: d.dispatch_number || "", pickId: d.pick_id || null, soId: d.so_id || null,
  customerId: d.customer_id || null, dispatchDate: d.dispatch_date || null, note: d.note || "",
  posted: !!d.posted, createdBy: d.created_by || null, createdAt: d.created_at, lines: (d.dist_dispatch_lines || []).map(mapDistDispatchLine),
});
const mapDistDispatchLine = (l) => ({ id: l.id, dispatchId: l.dispatch_id, itemId: l.item_id, batchId: l.batch_id, qty: Number(l.qty) || 0, landedCost: Number(l.landed_cost) || 0, unitPrice: Number(l.unit_price) || 0, taxRateId: l.tax_rate_id || null });

export async function fetchDistDispatches({ soId } = {}) {
  let q = supabase.from("dist_dispatches").select("*, dist_dispatch_lines(*)").order("created_at", { ascending: false });
  if (soId) q = q.eq("so_id", soId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDistDispatch);
}

// Detail for a pick drill-down: resolves customer, SO number, item names/images.
export async function fetchDistPickDetail(pickId) {
  const { data: head } = await supabase.from("dist_picks").select("*, dist_pick_lines(*)").eq("id", pickId).maybeSingle();
  if (!head) return null;
  const [items, customers, sos] = await Promise.all([
    fetchDistItems().catch(() => []), fetchDistContacts({ kind: "customer" }).catch(() => []), fetchDistSalesOrders({}).catch(() => []),
  ]);
  const itemById = new Map(items.map(i => [i.id, i]));
  const customer = customers.find(c => c.id === head.customer_id) || null;
  const so = sos.find(s => s.id === head.so_id) || null;
  const lines = (head.dist_pick_lines || []).map(l => ({ itemId: l.item_id, batchId: l.batch_id, qty: Number(l.qty) || 0,
    unitPrice: Number(l.unit_price) || 0, item: itemById.get(l.item_id) || null }));
  return { id: head.id, pickNumber: head.pick_number, status: head.status, pickDate: head.pick_date, note: head.note,
    soId: head.so_id, soNumber: so?.soNumber || null, customer, lines };
}

// Detail for a dispatch drill-down.
export async function fetchDistDispatchDetail(dispatchId) {
  const { data: head } = await supabase.from("dist_dispatches").select("*, dist_dispatch_lines(*)").eq("id", dispatchId).maybeSingle();
  if (!head) return null;
  const [items, customers, sos] = await Promise.all([
    fetchDistItems().catch(() => []), fetchDistContacts({ kind: "customer" }).catch(() => []), fetchDistSalesOrders({}).catch(() => []),
  ]);
  const itemById = new Map(items.map(i => [i.id, i]));
  const customer = customers.find(c => c.id === head.customer_id) || null;
  const so = sos.find(s => s.id === head.so_id) || null;
  const lines = (head.dist_dispatch_lines || []).map(l => ({ itemId: l.item_id, batchId: l.batch_id, qty: Number(l.qty) || 0,
    landedCost: Number(l.landed_cost) || 0, unitPrice: Number(l.unit_price) || 0, item: itemById.get(l.item_id) || null }));
  const cogsTotal = +lines.reduce((s, l) => s + l.qty * l.landedCost, 0).toFixed(2);
  return { id: head.id, dispatchNumber: head.dispatch_number, posted: !!head.posted, dispatchDate: head.dispatch_date,
    note: head.note, soId: head.so_id, soNumber: so?.soNumber || null, pickId: head.pick_id, customer, lines, cogsTotal };
}

// Resolve a sales order's fulfilment status across the chain for the
// Zoho-style status pillars (invoiced / paid / picked / dispatched) + detail.
export async function fetchDistSalesOrderDetail(soId) {
  const [picks, dispatches, invoices] = await Promise.all([
    fetchDistPicks({ soId }).catch(() => []),
    fetchDistDispatches({ soId }).catch(() => []),
    fetchDistInvoices({}).catch(() => []),
  ]);
  const soInvoices = invoices.filter(i => i.soId === soId);
  let paid = false;
  if (soInvoices.length) {
    const paidMap = await fetchDistInvoicePaidMap(soInvoices.map(i => i.id)).catch(() => new Map());
    paid = soInvoices.every(i => { const gt = i.grandTotal != null && i.grandTotal > 0 ? i.grandTotal : 0; const p = paidMap.get(i.id) || 0; return gt > 0 ? p + 0.005 >= gt : false; });
  }
  return {
    picks, dispatches, invoices: soInvoices,
    status: { invoiced: soInvoices.length > 0, paid, picked: picks.length > 0, dispatched: dispatches.length > 0 },
  };
}

// ── ORDER-CENTRIC FULFILMENT ENGINE ─────────────────────────────────────────
// Pick and Dispatch are TRANSITION STATES of a sales order, not standalone
// documents you create independently. These functions advance ONE order one
// stage at a time, fully server-side, each guarded so an order can never fork
// into duplicate picks/dispatches/invoices.

// Stage of an order in the fulfilment pipeline.
//   confirmed → picked → dispatched → invoiced → paid
export async function fetchDistFulfilmentBoard() {
  const [orders, picks, dispatches, invoices] = await Promise.all([
    fetchDistSalesOrders({ status: ["confirmed", "picking", "dispatched", "invoiced"] }).catch(() => []),
    fetchDistPicks({}).catch(() => []),
    fetchDistDispatches({}).catch(() => []),
    fetchDistInvoices({}).catch(() => []),
  ]);
  const paidMap = await fetchDistInvoicePaidMap(invoices.map(i => i.id)).catch(() => new Map());
  const rows = orders.map(so => {
    const pick = picks.find(p => p.soId === so.id) || null;
    const dispatch = dispatches.find(d => d.soId === so.id) || null;
    const soInvoices = invoices.filter(i => i.soId === so.id);
    const invoice = soInvoices[0] || null;
    const fullyPaid = soInvoices.length > 0 && soInvoices.every(i => {
      const gt = i.grandTotal != null && i.grandTotal > 0 ? i.grandTotal : 0;
      const p = paidMap.get(i.id) || 0; return gt > 0 ? p + 0.005 >= gt : false;
    });
    let stage = "confirmed";
    if (fullyPaid) stage = "paid";
    else if (invoice) stage = "invoiced";
    else if (dispatch) stage = "dispatched";
    else if (pick) stage = "picked";
    return {
      soId: so.id, soNumber: so.soNumber, customerId: so.customerId, orderDate: so.orderDate,
      lineCount: (so.lines || []).length, stage,
      pickId: pick?.id || null, pickNumber: pick?.pickNumber || null,
      dispatchId: dispatch?.id || null, dispatchNumber: dispatch?.dispatchNumber || null,
      invoiceId: invoice?.id || null, invoiceNumber: invoice?.invoiceNumber || null,
    };
  });
  // Order by stage (earliest first) then date.
  const rank = { confirmed: 0, picked: 1, dispatched: 2, invoiced: 3, paid: 4 };
  rows.sort((a, b) => (rank[a.stage] - rank[b.stage]) || (new Date(b.orderDate || 0) - new Date(a.orderDate || 0)));
  return rows;
}

// Advance: confirmed → picked. Auto-FEFO allocates batches for every SO line.
// Guarded: throws if a pick already exists (createDistPick also guards).
export async function advanceDistOrderToPick(soId, createdBy) {
  const so = (await fetchDistSalesOrders({})).find(s => s.id === soId);
  if (!so) throw new Error("Order not found.");
  const existing = (await fetchDistPicks({})).filter(p => p.soId === soId && p.status !== "cancelled");
  if (existing.length) throw new Error("This order already has a pick.");
  // Determine which items are non-stocked (fresh produce / CK) — those don't get
  // FEFO-allocated; the driver sources them to order, so they pass straight through.
  const allItems = await fetchDistItems().catch(() => []);
  const typeById = new Map(allItems.map(i => [i.id, i.itemType || "warehouse"]));
  // FEFO each STOCKED line; pass non-stocked lines through with a sentinel batch.
  const lines = [];
  for (const l of (so.lines || [])) {
    if (!l.itemId || !(Number(l.qty) > 0)) continue;
    const stocked = (typeById.get(l.itemId) || "warehouse") !== "fresh";
    if (!stocked) {
      // Fresh produce: one line, no batch, no stock movement on dispatch —
      // the driver sources it to order, so there's nothing to allocate.
      lines.push({ itemId: l.itemId, batchId: null, qty: Number(l.qty), unitPrice: l.unitPrice || 0, taxRateId: l.taxRateId || null, nonStock: true });
      continue;
    }
    const alloc = await suggestDistFefo(l.itemId, l.qty).catch(() => []);
    const got = alloc.reduce((s, a) => s + a.qty, 0);
    for (const a of alloc) lines.push({ itemId: l.itemId, batchId: a.batchId, qty: a.qty, unitPrice: l.unitPrice || 0, taxRateId: l.taxRateId || null });
    if (got + 0.0005 < Number(l.qty)) {
      // OVERRIDE (owner decision): physical reality wins — the van can carry
      // goods the system hasn't received yet, so a stock shortfall must not
      // block dispatch. Allocate every batch that exists and pass the
      // remainder through UNBATCHED: it still dispatches and invoices at full
      // quantity, but moves no stock and books no stock-COGS for the missing
      // portion (there is no batch to draw down — batch-level tracking cannot
      // go negative). The gap self-documents: receive the goods when they
      // arrive and counts/COGS come back into line.
      lines.push({ itemId: l.itemId, batchId: null, qty: Number(l.qty) - got, unitPrice: l.unitPrice || 0, taxRateId: l.taxRateId || null });
    }
  }
  if (!lines.length) throw new Error("Nothing to pick on this order.");
  return createDistPick({ soId, customerId: so.customerId, status: "picked", createdBy }, lines);
}

// Advance: picked → dispatched. Ships the order's pick (reduces stock, posts COGS).
// Guarded: throws if already dispatched, or if no pick exists.
export async function advanceDistOrderToDispatch(soId, createdBy, freshCosts = {}) {
  const picks = (await fetchDistPicks({})).filter(p => p.soId === soId);
  const pick = picks.find(p => p.status === "picked") || picks[0];
  if (!pick) throw new Error("This order hasn't been picked yet.");
  const existing = (await fetchDistDispatches({})).filter(d => d.soId === soId);
  if (existing.length) throw new Error("This order has already been dispatched.");
  const allItems = await fetchDistItems().catch(() => []);
  const typeById = new Map(allItems.map(i => [i.id, i.itemType || "warehouse"]));
  // Build dispatch lines. Fresh (non-stocked) lines are charged AT COST — the
  // store pays exactly what the driver paid — so their unit price is set from
  // freshCosts[itemId] (the actual supermarket cost captured at dispatch).
  const lines = (pick.lines || []).map(l => {
    const isFresh = (typeById.get(l.itemId) || "warehouse") === "fresh";
    const cost = isFresh && freshCosts[l.itemId] != null && freshCosts[l.itemId] !== "" ? Number(freshCosts[l.itemId]) : null;
    return {
      itemId: l.itemId, batchId: l.batchId, qty: l.qty,
      unitPrice: isFresh ? (cost != null ? cost : (Number(l.unitPrice) || 0)) : (Number(l.unitPrice) || 0),
      // Batchless = nothing to draw down: fresh items by design, or a stocked
      // item dispatched beyond available batches (negative-stock override).
      // Either way: dispatch + invoice at full qty, no stock movement.
      taxRateId: l.taxRateId || null, nonStock: isFresh || !l.batchId,
    };
  });
  if (!lines.length) throw new Error("This pick has no lines to dispatch.");
  const dispatchResult = await postDistDispatch({ soId, pickId: pick.id, customerId: pick.customerId, createdBy }, lines);
  // PHASE 3b: mirror the dispatch into a store_delivery (incoming) so the store
  // can receive against it. Best-effort — never blocks the dispatch.
  try {
    const dispatchId = dispatchResult && (dispatchResult.id || dispatchResult.dispatchId) ? (dispatchResult.id || dispatchResult.dispatchId) : null;
    await createStoreDeliveryFromDispatch(soId, dispatchId, lines);
    // CK customer: mirror into a CK delivery instead (each mirror checks its
    // own applicability — store fn no-ops without a store_id, CK fn no-ops
    // unless the customer is flagged is_central_kitchen).
    await createCkDeliveryFromDispatch(soId, dispatchId, lines);
  } catch (e) { console.error("delivery mirror failed:", e.message); }
  return dispatchResult;
}

// Which fresh (non-stocked) lines on a picked order still need an actual cost
// entered before dispatch? Returns [{ itemId, name, qty }] for the UI prompt.
export async function fetchFreshLinesNeedingCost(soId) {
  const picks = (await fetchDistPicks({})).filter(p => p.soId === soId);
  const pick = picks.find(p => p.status === "picked") || picks[0];
  if (!pick) return [];
  const allItems = await fetchDistItems().catch(() => []);
  const typeById = new Map(allItems.map(i => [i.id, i.itemType || "warehouse"]));
  const nameById = new Map(allItems.map(i => [i.id, i.name]));
  return (pick.lines || [])
    .filter(l => (typeById.get(l.itemId) || "warehouse") === "fresh")
    .map(l => ({ itemId: l.itemId, name: nameById.get(l.itemId) || l.itemId, qty: l.qty }));
}

// Advance: dispatched → invoiced. Bills the customer for the dispatch.
// Guarded: throws if already invoiced, or if no dispatch exists.
export async function advanceDistOrderToInvoice(soId, createdBy) {
  const dispatches = (await fetchDistDispatches({})).filter(d => d.soId === soId);
  const dispatch = dispatches[0];
  if (!dispatch) throw new Error("This order hasn't been dispatched yet.");
  const existing = (await fetchDistInvoices({})).filter(i => i.soId === soId);
  if (existing.length) throw new Error("This order has already been invoiced.");
  const lines = (dispatch.lines || []).map(l => ({ itemId: l.itemId, accountCode: "4000", qty: l.qty, unitPrice: l.unitPrice || 0, taxRateId: l.taxRateId || null }));
  if (!lines.length) throw new Error("This dispatch has no lines to invoice.");
  return postDistInvoice({ soId, dispatchId: dispatch.id, customerId: dispatch.customerId, createdBy, vatMode: "exclusive" }, lines);
}
// Dispatch: write a negative (issue) movement per line at its batch, then post
// Dr COGS 5000 / Cr Stock 1200 at total landed cost. Idempotent on distdisp:.
export async function postDistDispatch(dispatch, lines = []) {
  const id = dispatch.id || distId("ddisp");
  const dispatchDate = dispatch.dispatchDate || new Date().toISOString().slice(0, 10);
  const head = {
    id, dispatch_number: dispatch.dispatchNumber || `DISP-${Date.now().toString().slice(-6)}`, pick_id: dispatch.pickId || null,
    so_id: dispatch.soId || null, customer_id: dispatch.customerId || null, dispatch_date: dispatchDate,
    note: dispatch.note || null, created_by: dispatch.createdBy || null, posted: false,
  };
  const { error } = await supabase.from("dist_dispatches").insert(head);
  if (error) throw error;

  let cogsValue = 0;
  for (const l of lines.filter(x => x.itemId && Number(x.qty) > 0 && (x.batchId || x.nonStock))) {
    const nonStock = l.nonStock || !l.batchId;
    await supabase.from("dist_dispatch_lines").insert({
      id: distId("ddispl"), dispatch_id: id, item_id: l.itemId, batch_id: nonStock ? null : l.batchId, qty: Number(l.qty) || 0,
      landed_cost: nonStock ? 0 : (Number(l.landedCost) || 0), unit_price: Number(l.unitPrice) || 0, tax_rate_id: l.taxRateId || null,
    });
    // Non-stocked (fresh produce / CK) lines: no stock movement, no stock-based
    // COGS — the driver sourced them to order; their cost is the purchase itself.
    if (!nonStock) {
      await addDistMovement({
        itemId: l.itemId, batchId: l.batchId, qty: -Math.abs(Number(l.qty) || 0), type: "issue",
        sourceKind: "dispatch", sourceRef: `distdisp:${id}:${l.itemId}:${l.batchId}`, createdBy: dispatch.createdBy,
      });
      cogsValue += (Number(l.qty) || 0) * (Number(l.landedCost) || 0);
    }
  }

  // Journal: Dr COGS 5000 / Cr Stock 1200 at landed cost.
  if (cogsValue > 0) {
    const [cogs, stock] = await Promise.all([
      resolveAccountForEntity(DIST_ENTITY, "5000"), resolveAccountForEntity(DIST_ENTITY, "1200"),
    ]);
    if (cogs && stock) {
      try {
        await postJournalEntry({
          entityId: DIST_ENTITY, entryDate: dispatchDate, memo: `Dispatch ${head.dispatch_number}`,
          sourceKind: "dist_dispatch", sourceRef: `distdisp:${id}`, createdBy: dispatch.createdBy,
          lines: [{ accountId: cogs, amount: +cogsValue.toFixed(2) }, { accountId: stock, amount: -cogsValue.toFixed(2) }],
        });
      } catch (e) { /* best-effort: stock already moved; journal retryable */ }
    }
  }
  await supabase.from("dist_dispatches").update({ posted: true }).eq("id", id);
  if (dispatch.soId) await supabase.from("dist_sales_orders").update({ status: "dispatched" }).eq("id", dispatch.soId);
  if (dispatch.pickId) await supabase.from("dist_picks").update({ status: "dispatched" }).eq("id", dispatch.pickId);
  return id;
}

// Delete (reverse) a dispatch. Because dispatch posted stock-OUT movements + a
// COGS journal, deletion must REVERSE both, not just drop rows:
//   1. Post positive (return) movements to put stock back on each batch.
//   2. Post a reversing journal: Dr Stock 1200 / Cr COGS 5000.
//   3. Delete the dispatch lines + header.
//   4. Reset the SO/pick status so it can be re-dispatched.
// Blocked if an invoice references this dispatch (delete the invoice first).
export async function deleteDistDispatch(dispatchId) {
  const invoices = await fetchDistInvoices({}).catch(() => []);
  if (invoices.some(i => i.dispatchId === dispatchId)) throw new Error("Cannot delete: an invoice references this dispatch. Delete the invoice first.");
  const { data: head } = await supabase.from("dist_dispatches").select("*").eq("id", dispatchId).maybeSingle();
  if (!head) throw new Error("Dispatch not found.");
  const { data: lines } = await supabase.from("dist_dispatch_lines").select("*").eq("dispatch_id", dispatchId);

  // 1. Return stock to each batch (positive movement, distinct reversal ref).
  //    Batchless lines (fresh / negative-stock override) moved NO stock on
  //    dispatch, so there is nothing to return — skip them, or the movement
  //    insert dies on the batch_id not-null constraint.
  let cogsValue = 0;
  for (const l of (lines || []).filter(x => x.batch_id)) {
    await addDistMovement({
      itemId: l.item_id, batchId: l.batch_id, qty: Math.abs(Number(l.qty) || 0), type: "return",
      sourceKind: "dispatch_reversal", sourceRef: `distdispREV:${dispatchId}:${l.item_id}:${l.batch_id}`,
    });
    cogsValue += (Number(l.qty) || 0) * (Number(l.landed_cost) || 0);
  }
  // 2. Reversing journal: Dr Stock / Cr COGS.
  if (cogsValue > 0) {
    const [cogs, stock] = await Promise.all([
      resolveAccountForEntity(DIST_ENTITY, "5000"), resolveAccountForEntity(DIST_ENTITY, "1200"),
    ]);
    if (cogs && stock) {
      try {
        await postJournalEntry({
          entityId: DIST_ENTITY, entryDate: new Date().toISOString().slice(0, 10),
          memo: `Reversal of dispatch ${head.dispatch_number}`, sourceKind: "dist_dispatch_reversal",
          sourceRef: `distdispREV:${dispatchId}`,
          lines: [{ accountId: stock, amount: +cogsValue.toFixed(2) }, { accountId: cogs, amount: -cogsValue.toFixed(2) }],
        });
      } catch (e) { /* best-effort */ }
    }
  }
  // 3. Delete lines + header.
  await supabase.from("dist_dispatch_lines").delete().eq("dispatch_id", dispatchId);
  const { error } = await supabase.from("dist_dispatches").delete().eq("id", dispatchId);
  if (error) throw error;
  // 4. Reset SO + pick so the order can be re-dispatched.
  if (head.so_id) await supabase.from("dist_sales_orders").update({ status: "picking" }).eq("id", head.so_id);
  if (head.pick_id) await supabase.from("dist_picks").update({ status: "picked" }).eq("id", head.pick_id);
  return true;
}

// Edit a posted dispatch: reverse it (return stock + reversing COGS journal),
// then re-post with new lines. Keeps stock + ledger correct. Blocked if invoiced.
export async function updateDistDispatch(dispatch, lines = []) {
  if (!dispatch.id) throw new Error("Dispatch id required for update.");
  const { data: head } = await supabase.from("dist_dispatches").select("*").eq("id", dispatch.id).maybeSingle();
  if (!head) throw new Error("Dispatch not found.");
  await deleteDistDispatch(dispatch.id); // guards invoices + reverses stock/journal
  return postDistDispatch({
    soId: head.so_id, pickId: head.pick_id, customerId: head.customer_id,
    dispatchDate: dispatch.dispatchDate || head.dispatch_date, note: dispatch.note ?? head.note, createdBy: head.created_by,
  }, lines);
}

// ── INVOICES (Dr AR / Cr Sales + VAT) ──
const mapDistInvoice = (i) => ({
  id: i.id, invoiceNumber: i.invoice_number || "", customerId: i.customer_id || null, soId: i.so_id || null, dispatchId: i.dispatch_id || null,
  invoiceDate: i.invoice_date || null, dueDate: i.due_date || null, status: i.status || "open", paymentTerms: i.payment_terms || "",
  reference: i.reference || "", salesperson: i.salesperson || "", subject: i.subject || "",
  vatMode: i.vat_mode || "exclusive", discountPercent: Number(i.discount_percent) || 0, discountType: i.discount_type || "percent",
  shippingCharge: Number(i.shipping_charge) || 0, note: i.note || "", terms: i.terms || "",
  posted: !!i.posted, createdBy: i.created_by || null, createdAt: i.created_at, lines: (i.dist_invoice_lines || []).map(mapDistInvoiceLine),
});
const mapDistInvoiceLine = (l) => ({ id: l.id, invoiceId: l.invoice_id, itemId: l.item_id, description: l.description || "", qty: Number(l.qty) || 0, unitPrice: Number(l.unit_price) || 0, discount: Number(l.discount) || 0, discountType: l.discount_type || "percent", taxRateId: l.tax_rate_id || null, accountCode: l.account_code || null });

export async function fetchDistInvoices({ customerId, status } = {}) {
  let q = supabase.from("dist_invoices").select("*, dist_invoice_lines(*)").order("created_at", { ascending: false });
  if (customerId) q = q.eq("customer_id", customerId);
  if (status) q = Array.isArray(status) ? q.in("status", status) : q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDistInvoice);
}
// Shared net/vat computation honouring vat mode + document discount (% or value).
async function distDocNetVat({ lines, vatMode, discountValue, discountType }) {
  const inclusive = vatMode === "inclusive";
  const dVal = Number(discountValue) || 0;
  const dType = discountType || "percent";
  const base = [];
  for (const l of lines) {
    const pct = await distTaxPercent(l.taxRateId);
    const raw = (Number(l.qty) || 0) * (Number(l.unitPrice) || 0);
    const net = inclusive && pct > 0 ? raw / (1 + pct / 100) : raw;
    base.push({ pct, net });
  }
  const sub = base.reduce((s, x) => s + x.net, 0);
  const factor = dType === "value" ? (sub > 0 ? Math.max(0, 1 - dVal / sub) : 1) : (1 - dVal / 100);
  let net = 0, vat = 0;
  for (const { pct, net: bn } of base) { const dn = bn * factor; net += dn; vat += dn * pct / 100; }
  return { net: +net.toFixed(2), vat: +vat.toFixed(2) };
}
export async function postDistInvoice(inv, lines = []) {
  const id = inv.id || distId("dinv");
  const invoiceDate = inv.invoiceDate || new Date().toISOString().slice(0, 10);
  const head = {
    id, invoice_number: inv.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`, customer_id: inv.customerId || null,
    so_id: inv.soId || null, dispatch_id: inv.dispatchId || null, invoice_date: invoiceDate, due_date: inv.dueDate || null,
    status: "open", payment_terms: inv.paymentTerms || null, reference: inv.reference || null, salesperson: inv.salesperson || null,
    subject: inv.subject || null, vat_mode: inv.vatMode || "exclusive", discount_percent: Number(inv.discountPercent) || 0,
    discount_type: inv.discountType || "percent", shipping_charge: Number(inv.shippingCharge) || 0, note: inv.note || null,
    terms: inv.terms || null, created_by: inv.createdBy || null, posted: false,
  };
  const { error } = await supabase.from("dist_invoices").insert(head);
  if (error) throw error;
  const valid = lines.filter(l => Number(l.qty) !== 0 || Number(l.unitPrice) !== 0);
  for (const l of valid) {
    await supabase.from("dist_invoice_lines").insert({
      id: distId("dinvl"), invoice_id: id, item_id: l.itemId || null, description: l.description || null,
      qty: Number(l.qty) || 0, unit_price: Number(l.unitPrice) || 0, discount: Number(l.discount) || 0,
      discount_type: l.discountType || "percent", tax_rate_id: l.taxRateId || null, account_code: l.accountCode || null,
    });
  }
  const { net, vat } = await distDocNetVat({ lines: valid, vatMode: inv.vatMode, discountValue: inv.discountPercent, discountType: inv.discountType });
  const shipping = Number(inv.shippingCharge) || 0;
  const gross = +(net + vat + shipping).toFixed(2);

  // Journal: Dr AR 1100 / Cr Sales 4000 (net + shipping) + Cr VAT 2100.
  if (gross > 0) {
    const [ar, sales, vatAcc] = await Promise.all([
      resolveAccountForEntity(DIST_ENTITY, "1100"), resolveAccountForEntity(DIST_ENTITY, "4000"), resolveAccountForEntity(DIST_ENTITY, "2100"),
    ]);
    if (ar && sales) {
      const jlines = [{ accountId: ar, amount: gross }, { accountId: sales, amount: -(net + shipping) }];
      if (vat > 0 && vatAcc) jlines.push({ accountId: vatAcc, amount: -vat });
      try {
        await postJournalEntry({
          entityId: DIST_ENTITY, entryDate: invoiceDate, memo: `Invoice ${head.invoice_number}`,
          sourceKind: "dist_invoice", sourceRef: `distinv:${id}`, createdBy: inv.createdBy, lines: jlines,
        });
      } catch (e) { /* best-effort */ }
    }
  }
  await supabase.from("dist_invoices").update({ posted: true, grand_total: gross }).eq("id", id);
  if (inv.soId) await supabase.from("dist_sales_orders").update({ status: "invoiced" }).eq("id", inv.soId);
  try {
    const { data: cust2 } = head.customer_id ? await supabase.from("dist_contacts").select("display_name, company").eq("id", head.customer_id).single() : { data: null };
    const { data: items2 } = await supabase.from("dist_items").select("id, name, category");
    const nb = new Map((items2 || []).map(x => [x.id, x]));
    await supabase.from("ck_label_jobs").insert({ status: "queued", kind: "doc", payload: {
      title: "INVOICE", subtitle: head.invoice_number,
      meta: [`Bill to: ${cust2?.display_name || cust2?.company || ""}`, `Date: ${head.invoice_date}`, `Due: ${head.due_date || ""}`],
      lines: (lines || []).map(l => ({ name: nb.get(l.itemId)?.name || l.description || l.itemId, category: nb.get(l.itemId)?.category || "", qty: l.qty, unitPrice: l.unitPrice, amount: (Number(l.qty) || 0) * (Number(l.unitPrice) || 0) })),
      totals: [{ label: "TOTAL (ex VAT - see A4)", value: (lines || []).reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0), strong: true }],
      footer: "Create Brands Distribution",
    }, created_by: "auto" });
  } catch { /* never block invoicing */ }
  return id;
}

// Delete (reverse) an invoice. It posted Dr AR / Cr Sales (+VAT), so deletion
// posts a reversing journal (Dr Sales+VAT / Cr AR), then deletes lines+header.
// BLOCKED if any payment is allocated to it (unallocate/delete the payment first).
export async function deleteDistInvoice(invoiceId) {
  const paidMap = await fetchDistInvoicePaidMap([invoiceId]).catch(() => new Map());
  if ((paidMap.get(invoiceId) || 0) > 0.005) throw new Error("Cannot delete: this invoice has payments against it. Remove the payment first.");
  const { data: head } = await supabase.from("dist_invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!head) throw new Error("Invoice not found.");
  const { data: lines } = await supabase.from("dist_invoice_lines").select("*").eq("invoice_id", invoiceId);
  const mapped = (lines || []).map(l => ({ qty: l.qty, unitPrice: l.unit_price, discount: l.discount, discountType: l.discount_type, taxRateId: l.tax_rate_id }));
  const { net, vat } = await distDocNetVat({ lines: mapped, vatMode: head.vat_mode, discountValue: head.discount_percent, discountType: head.discount_type }).catch(() => ({ net: 0, vat: 0 }));
  const shipping = Number(head.shipping_charge) || 0;
  const gross = +(net + vat + shipping).toFixed(2);
  if (gross > 0) {
    const [ar, sales, vatAcc] = await Promise.all([
      resolveAccountForEntity(DIST_ENTITY, "1100"), resolveAccountForEntity(DIST_ENTITY, "4000"), resolveAccountForEntity(DIST_ENTITY, "2100"),
    ]);
    if (ar && sales) {
      const jlines = [{ accountId: ar, amount: -gross }, { accountId: sales, amount: +(net + shipping) }];
      if (vat > 0 && vatAcc) jlines.push({ accountId: vatAcc, amount: +vat });
      try {
        await postJournalEntry({
          entityId: DIST_ENTITY, entryDate: new Date().toISOString().slice(0, 10),
          memo: `Reversal of invoice ${head.invoice_number}`, sourceKind: "dist_invoice_reversal",
          sourceRef: `distinvREV:${invoiceId}`, lines: jlines,
        });
      } catch (e) { /* best-effort */ }
    }
  }
  await supabase.from("dist_invoice_lines").delete().eq("invoice_id", invoiceId);
  const { error } = await supabase.from("dist_invoices").delete().eq("id", invoiceId);
  if (error) throw error;
  // Reset SO so it can be re-invoiced (if no other invoices remain for it).
  if (head.so_id) {
    const others = await fetchDistInvoices({}).catch(() => []);
    if (!others.some(i => i.soId === head.so_id)) await supabase.from("dist_sales_orders").update({ status: "dispatched" }).eq("id", head.so_id);
  }
  return true;
}

// Rich invoice detail for the Zoho-style drill-down.
export async function fetchDistInvoiceDetail(invoiceId) {
  const { data: head } = await supabase.from("dist_invoices").select("*, dist_invoice_lines(*)").eq("id", invoiceId).maybeSingle();
  if (!head) return null;
  const [items, customers, sos, taxRates] = await Promise.all([
    fetchDistItems().catch(() => []), fetchDistContacts({ kind: "customer" }).catch(() => []),
    fetchDistSalesOrders({}).catch(() => []), fetchDistTaxRates().catch(() => []),
  ]);
  const itemById = new Map(items.map(i => [i.id, i]));
  const trById = new Map(taxRates.map(t => [t.id, t]));
  const customer = customers.find(c => c.id === head.customer_id) || null;
  const so = sos.find(s => s.id === head.so_id) || null;
  const lines = (head.dist_invoice_lines || []).map(l => {
    const qty = Number(l.qty) || 0, rate = Number(l.unit_price) || 0;
    const gross = qty * rate;
    const net = l.discount_type === "percent" ? gross * (1 - (Number(l.discount) || 0) / 100) : gross - (Number(l.discount) || 0);
    const pct = trById.get(l.tax_rate_id)?.percent || 0;
    const vat = +(net * pct / 100).toFixed(2);
    return { itemId: l.item_id, item: itemById.get(l.item_id) || null, qty, rate, vatPct: pct, vat, amount: +net.toFixed(2) };
  });
  const net = +lines.reduce((s, l) => s + l.amount, 0).toFixed(2);
  const vat = +lines.reduce((s, l) => s + l.vat, 0).toFixed(2);
  const shipping = Number(head.shipping_charge) || 0;
  const grand = +(net + vat + shipping).toFixed(2);
  const paidMap = await fetchDistInvoicePaidMap([invoiceId]).catch(() => new Map());
  const paid = paidMap.get(invoiceId) || 0;
  const balance = +(grand - paid).toFixed(2);
  const overdue = balance > 0.005 && head.due_date && new Date(head.due_date) < new Date();
  return {
    id: head.id, invoiceNumber: head.invoice_number, invoiceDate: head.invoice_date, dueDate: head.due_date,
    paymentTerms: head.payment_terms, reference: head.reference, soNumber: so?.soNumber || null, soId: head.so_id,
    customer, lines, net, vat, shipping, grand, paid, balance,
    status: balance <= 0.005 ? "paid" : overdue ? "overdue" : paid > 0 ? "part_paid" : "open",
  };
}

// ── PAYMENTS RECEIVED (Dr Bank / Cr AR) ──
const mapDistInvPay = (p) => ({
  id: p.id, paymentNumber: p.payment_number || "", customerId: p.customer_id || null, payDate: p.pay_date || null,
  amount: Number(p.amount) || 0, bankCharges: Number(p.bank_charges) || 0, method: p.method || null, depositCode: p.deposit_code || null,
  reference: p.reference || "", notes: p.notes || "", posted: !!p.posted, createdBy: p.created_by || null, createdAt: p.created_at,
  allocations: (p.dist_invoice_payment_allocations || []).map(a => ({ id: a.id, invoiceId: a.invoice_id, amount: Number(a.amount) || 0 })),
});
// Total already-received (paid) per invoice id, across ALL receipts.
export async function fetchDistInvoicePaidMap(invoiceIds) {
  const m = new Map();
  const ids = (invoiceIds || []).filter(Boolean);
  if (!ids.length) return m;
  const { data, error } = await supabase.from("dist_invoice_payment_allocations").select("invoice_id, amount").in("invoice_id", ids);
  if (error) throw error;
  for (const r of data || []) m.set(r.invoice_id, (m.get(r.invoice_id) || 0) + (Number(r.amount) || 0));
  return m;
}

export async function fetchDistInvoicePayments({ customerId } = {}) {
  let q = supabase.from("dist_invoice_payments").select("*, dist_invoice_payment_allocations(*)").order("created_at", { ascending: false });
  if (customerId) q = q.eq("customer_id", customerId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDistInvPay);
}

// Aggregate everything a customer detail page needs: invoices (with balance
// due), payments, sales orders, receivables, monthly income, statement lines.
// Receivables (outstanding balance) per customer id, for the customer list.
export async function fetchDistReceivablesByCustomer() {
  const m = new Map();
  try {
    const aged = await fetchDistAgedDebtors();
    for (const r of aged.rows || []) m.set(r.party, +((m.get(r.party) || 0) + (Number(r.due) || 0)).toFixed(2));
  } catch { /* best-effort */ }
  return m;
}

export async function fetchDistCustomerDetail(customerId) {
  const [invoices, payments, salesOrders, taxRates] = await Promise.all([
    fetchDistInvoices({ customerId }).catch(() => []),
    fetchDistInvoicePayments({ customerId }).catch(() => []),
    fetchDistSalesOrders({ customerId }).catch(() => []),
    fetchDistTaxRates().catch(() => []),
  ]);
  const paidMap = await fetchDistInvoicePaidMap(invoices.map(i => i.id)).catch(() => new Map());

  const invGross = (i) => {
    if (i.grandTotal != null && i.grandTotal > 0) return i.grandTotal;
    // fallback recompute
    const tr = new Map(taxRates.map(t => [t.id, Number(t.percent) || 0]));
    let net = 0, vat = 0;
    for (const l of i.lines || []) {
      const raw = (Number(l.qty) || 0) * (Number(l.unitPrice) || 0);
      net += raw; vat += raw * (tr.get(l.taxRateId) || 0) / 100;
    }
    return +(net + vat + (Number(i.shippingCharge) || 0)).toFixed(2);
  };

  const invRows = invoices.map(i => {
    const gross = invGross(i);
    const paid = paidMap.get(i.id) || 0;
    const balance = +(gross - paid).toFixed(2);
    return { id: i.id, invoiceNumber: i.invoiceNumber, soId: i.soId, date: i.invoiceDate, dueDate: i.dueDate,
      amount: gross, paid, balance, status: balance <= 0.005 ? "paid" : (i.dueDate && new Date(i.dueDate) < new Date() ? "overdue" : (paid > 0 ? "part_paid" : "open")) };
  }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const payRows = payments.map(p => ({ id: p.id, paymentNumber: p.paymentNumber, date: p.payDate,
    reference: p.reference, method: p.method, amount: Number(p.amount) || 0,
    unused: +((Number(p.amount) || 0) - (p.allocations || []).reduce((s, a) => s + (Number(a.amount) || 0), 0)).toFixed(2) }))
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const soRows = salesOrders.map(s => ({ id: s.id, soNumber: s.soNumber, date: s.orderDate, status: s.status,
    total: (s.lines || []).reduce((t, l) => t + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0) }))
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const receivables = +invRows.reduce((s, r) => s + r.balance, 0).toFixed(2);
  const invoicedTotal = +invRows.reduce((s, r) => s + r.amount, 0).toFixed(2);
  const receivedTotal = +payRows.reduce((s, r) => s + r.amount, 0).toFixed(2);

  // Monthly income (last 6 months) from invoice dates.
  const months = [];
  const now = new Date();
  for (let k = 5; k >= 0; k--) { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString("en-GB", { month: "short" }), year: d.getFullYear(), amount: 0 }); }
  const mIdx = new Map(months.map((m, i) => [m.key, i]));
  for (const r of invRows) { if (!r.date) continue; const d = new Date(r.date); const k = `${d.getFullYear()}-${d.getMonth()}`; if (mIdx.has(k)) months[mIdx.get(k)].amount += r.amount; }
  const incomeTotal = +months.reduce((s, m) => s + m.amount, 0).toFixed(2);

  // Statement lines: opening balance + invoices/payments interleaved, running balance.
  const events = [
    ...invRows.map(r => ({ date: r.date, type: "Invoice", details: `${r.invoiceNumber} - due on ${r.dueDate || r.date}`, amount: r.amount, payment: 0 })),
    ...payRows.map(p => ({ date: p.date, type: "Payment Received", details: `${p.paymentNumber}`, amount: 0, payment: p.amount })),
  ].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  let run = 0;
  const statement = events.map(e => { run += (e.amount || 0) - (e.payment || 0); return { ...e, balance: +run.toFixed(2) }; });

  return { invoices: invRows, payments: payRows, salesOrders: soRows, receivables, invoicedTotal, receivedTotal,
    months, incomeTotal, statement };
}
export async function postDistInvoicePayment(pay, allocations = []) {
  const id = pay.id || distId("dipay");
  const payDate = pay.payDate || new Date().toISOString().slice(0, 10);
  const amount = +(Number(pay.amount) || 0).toFixed(2);
  const bankCharges = +(Number(pay.bankCharges) || 0).toFixed(2);
  const head = {
    id, payment_number: pay.paymentNumber || `RCPT-${Date.now().toString().slice(-6)}`, customer_id: pay.customerId || null,
    pay_date: payDate, amount, bank_charges: bankCharges, method: pay.method || "bank", deposit_code: pay.depositCode || "1010",
    reference: pay.reference || null, notes: pay.notes || null, created_by: pay.createdBy || null, posted: false,
  };
  const { error } = await supabase.from("dist_invoice_payments").insert(head);
  if (error) throw error;
  for (const a of allocations.filter(x => x.invoiceId && Number(x.amount) > 0)) {
    await supabase.from("dist_invoice_payment_allocations").insert({ id: distId("dipa"), payment_id: id, invoice_id: a.invoiceId, amount: Number(a.amount) });
    const { data: allocs } = await supabase.from("dist_invoice_payment_allocations").select("amount").eq("invoice_id", a.invoiceId);
    const paid = (allocs || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const { data: invRow } = await supabase.from("dist_invoices").select("grand_total").eq("id", a.invoiceId).maybeSingle();
    const gt = Number(invRow?.grand_total) || 0;
    const st = gt > 0 && paid + 0.005 >= gt ? "paid" : paid > 0 ? "part_paid" : "open";
    await supabase.from("dist_invoices").update({ status: st }).eq("id", a.invoiceId);
  }

  // Journal: Dr deposit (bank/cash) + Dr bank charges 5710 / Cr AR 1100.
  if (amount > 0) {
    const [bank, ar, charges] = await Promise.all([
      resolveAccountForEntity(DIST_ENTITY, head.deposit_code || "1010"), resolveAccountForEntity(DIST_ENTITY, "1100"), resolveAccountForEntity(DIST_ENTITY, "5710"),
    ]);
    if (bank && ar) {
      const jlines = [{ accountId: bank, amount: amount }];
      if (bankCharges > 0 && charges) jlines.push({ accountId: charges, amount: bankCharges });
      jlines.push({ accountId: ar, amount: -(amount + bankCharges) });
      try {
        await postJournalEntry({
          entityId: DIST_ENTITY, entryDate: payDate, memo: `Receipt ${head.payment_number}`,
          sourceKind: "dist_invoice_payment", sourceRef: `distrcpt:${id}`, createdBy: pay.createdBy, lines: jlines,
        });
      } catch (e) { /* best-effort */ }
    }
  }
  await supabase.from("dist_invoice_payments").update({ posted: true }).eq("id", id);
  return id;
}

// Delete a payment received. It posted Dr Bank(+charges) / Cr AR, so deletion
// posts a reversing journal (Cr Bank / Dr AR), removes the allocations, recomputes
// each affected invoice's paid status, then deletes the payment.
export async function deleteDistInvoicePayment(paymentId) {
  const { data: head } = await supabase.from("dist_invoice_payments")
    .select("*, dist_invoice_payment_allocations(*)").eq("id", paymentId).maybeSingle();
  if (!head) throw new Error("Payment not found.");
  const amount = Number(head.amount) || 0;
  const bankCharges = Number(head.bank_charges) || 0;
  // Reversing journal: Cr deposit (−) + Cr charges (−) / Dr AR (+).
  if (amount > 0) {
    const [bank, ar, charges] = await Promise.all([
      resolveAccountForEntity(DIST_ENTITY, head.deposit_code || "1010"),
      resolveAccountForEntity(DIST_ENTITY, "1100"),
      resolveAccountForEntity(DIST_ENTITY, "5710"),
    ]);
    if (bank && ar) {
      const jlines = [{ accountId: bank, amount: -amount }];
      if (bankCharges > 0 && charges) jlines.push({ accountId: charges, amount: -bankCharges });
      jlines.push({ accountId: ar, amount: +(amount + bankCharges) });
      try {
        await postJournalEntry({
          entityId: DIST_ENTITY, entryDate: new Date().toISOString().slice(0, 10),
          memo: `Reversal of receipt ${head.payment_number || paymentId}`,
          sourceKind: "dist_invoice_payment_reversal", sourceRef: `distrcptREV:${paymentId}`, lines: jlines,
        });
      } catch (e) { /* best-effort */ }
    }
  }
  // Which invoices were touched, so we can recompute their status after removal.
  const touchedInvoices = [...new Set((head.dist_invoice_payment_allocations || []).map(a => a.invoice_id).filter(Boolean))];
  await supabase.from("dist_invoice_payment_allocations").delete().eq("payment_id", paymentId);
  const { error } = await supabase.from("dist_invoice_payments").delete().eq("id", paymentId);
  if (error) throw error;
  // Recompute each invoice's paid status from remaining allocations.
  for (const invId of touchedInvoices) {
    const { data: allocs } = await supabase.from("dist_invoice_payment_allocations").select("amount").eq("invoice_id", invId);
    const paid = (allocs || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const { data: invRow } = await supabase.from("dist_invoices").select("grand_total").eq("id", invId).maybeSingle();
    const gt = Number(invRow?.grand_total) || 0;
    const st = gt > 0 && paid + 0.005 >= gt ? "paid" : paid > 0 ? "part_paid" : "open";
    await supabase.from("dist_invoices").update({ status: st }).eq("id", invId);
  }
  return { deleted: true };
}
const mapDistCN = (c) => ({
  id: c.id, cnNumber: c.cn_number || "", customerId: c.customer_id || null, invoiceId: c.invoice_id || null,
  cnDate: c.cn_date || null, status: c.status || "open", reference: c.reference || "", salesperson: c.salesperson || "", subject: c.subject || "",
  vatMode: c.vat_mode || "exclusive", discountPercent: Number(c.discount_percent) || 0, discountType: c.discount_type || "percent",
  note: c.note || "", posted: !!c.posted, createdBy: c.created_by || null, createdAt: c.created_at, lines: (c.dist_credit_note_lines || []).map(mapDistCNLine),
});
const mapDistCNLine = (l) => ({ id: l.id, cnId: l.cn_id, itemId: l.item_id, description: l.description || "", qty: Number(l.qty) || 0, unitPrice: Number(l.unit_price) || 0, discount: Number(l.discount) || 0, discountType: l.discount_type || "percent", taxRateId: l.tax_rate_id || null, accountCode: l.account_code || null });

export async function fetchDistCreditNotes({ customerId } = {}) {
  let q = supabase.from("dist_credit_notes").select("*, dist_credit_note_lines(*)").order("created_at", { ascending: false });
  if (customerId) q = q.eq("customer_id", customerId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDistCN);
}
export async function postDistCreditNote(cn, lines = []) {
  const id = cn.id || distId("dcn");
  const cnDate = cn.cnDate || new Date().toISOString().slice(0, 10);
  const head = {
    id, cn_number: cn.cnNumber || `CN-${Date.now().toString().slice(-6)}`, customer_id: cn.customerId || null,
    invoice_id: cn.invoiceId || null, cn_date: cnDate, status: cn.status || "open", reference: cn.reference || null,
    salesperson: cn.salesperson || null, subject: cn.subject || null, vat_mode: cn.vatMode || "exclusive",
    discount_percent: Number(cn.discountPercent) || 0, discount_type: cn.discountType || "percent", note: cn.note || null,
    created_by: cn.createdBy || null, posted: false,
  };
  const { error } = await supabase.from("dist_credit_notes").insert(head);
  if (error) throw error;
  const valid = lines.filter(l => Number(l.qty) !== 0 || Number(l.unitPrice) !== 0);
  for (const l of valid) {
    await supabase.from("dist_credit_note_lines").insert({
      id: distId("dcnl"), cn_id: id, item_id: l.itemId || null, description: l.description || null,
      qty: Number(l.qty) || 0, unit_price: Number(l.unitPrice) || 0, discount: Number(l.discount) || 0,
      discount_type: l.discountType || "percent", tax_rate_id: l.taxRateId || null, account_code: l.accountCode || null,
    });
  }
  const { net, vat } = await distDocNetVat({ lines: valid, vatMode: cn.vatMode, discountValue: cn.discountPercent, discountType: cn.discountType });
  const gross = +(net + vat).toFixed(2);

  // Journal: Dr Sales 4000 (net) + Dr VAT 2100 / Cr AR 1100 (gross). Reverses a sale.
  if (gross > 0) {
    const [sales, vatAcc, ar] = await Promise.all([
      resolveAccountForEntity(DIST_ENTITY, "4000"), resolveAccountForEntity(DIST_ENTITY, "2100"), resolveAccountForEntity(DIST_ENTITY, "1100"),
    ]);
    if (sales && ar) {
      const jlines = [{ accountId: sales, amount: net }];
      if (vat > 0 && vatAcc) jlines.push({ accountId: vatAcc, amount: vat });
      jlines.push({ accountId: ar, amount: -gross });
      try {
        await postJournalEntry({
          entityId: DIST_ENTITY, entryDate: cnDate, memo: `Credit note ${head.cn_number}`,
          sourceKind: "dist_credit_note", sourceRef: `distcn:${id}`, createdBy: cn.createdBy, lines: jlines,
        });
      } catch (e) { /* best-effort */ }
    }
  }
  await supabase.from("dist_credit_notes").update({ posted: true }).eq("id", id);
  return id;
}

// Delete a credit note. It posted Dr Sales+VAT / Cr AR, so deletion posts a
// reversing journal (Cr Sales+VAT / Dr AR), then deletes lines + header.
export async function deleteDistCreditNote(cnId) {
  const { data: head } = await supabase.from("dist_credit_notes").select("*").eq("id", cnId).maybeSingle();
  if (!head) throw new Error("Credit note not found.");
  const { data: lines } = await supabase.from("dist_credit_note_lines").select("*").eq("cn_id", cnId);
  const mapped = (lines || []).map(l => ({ qty: l.qty, unitPrice: l.unit_price, discount: l.discount, discountType: l.discount_type, taxRateId: l.tax_rate_id }));
  const { net, vat } = await distDocNetVat({ lines: mapped, vatMode: head.vat_mode, discountValue: head.discount_percent, discountType: head.discount_type }).catch(() => ({ net: 0, vat: 0 }));
  const gross = +(net + vat).toFixed(2);
  if (gross > 0) {
    const [sales, vatAcc, ar] = await Promise.all([
      resolveAccountForEntity(DIST_ENTITY, "4000"), resolveAccountForEntity(DIST_ENTITY, "2100"), resolveAccountForEntity(DIST_ENTITY, "1100"),
    ]);
    if (sales && ar) {
      const jlines = [{ accountId: sales, amount: -net }];
      if (vat > 0 && vatAcc) jlines.push({ accountId: vatAcc, amount: -vat });
      jlines.push({ accountId: ar, amount: +gross });
      try {
        await postJournalEntry({
          entityId: DIST_ENTITY, entryDate: new Date().toISOString().slice(0, 10),
          memo: `Reversal of credit note ${head.cn_number || cnId}`,
          sourceKind: "dist_credit_note_reversal", sourceRef: `distcnREV:${cnId}`, lines: jlines,
        });
      } catch (e) { /* best-effort */ }
    }
  }
  await supabase.from("dist_credit_note_lines").delete().eq("cn_id", cnId);
  const { error } = await supabase.from("dist_credit_notes").delete().eq("id", cnId);
  if (error) throw error;
  return { deleted: true };
}
// Stock valuation, batch expiry, aged debtors/creditors, Distribution P&L,
// reorder report. No new write paths.
// ============================================================================

// ── STOCK VALUATION: per item, on-hand × weighted batch cost ──
// Uses batch-level on-hand × each batch's landed cost for an accurate value.
export async function fetchDistStockValuation() {
  const [items, batchOnHand] = await Promise.all([fetchDistItems(), computeDistBatchOnHand()]);
  // batchOnHand: Map(batchId -> qty). Need each batch's item + cost.
  const { data: batchRows } = await supabase.from("dist_batches").select("id, item_id, landed_cost, batch_no, expiry_date");
  const batchById = new Map((batchRows || []).map(b => [b.id, b]));
  const byItem = new Map();
  for (const [batchId, qty] of batchOnHand.entries()) {
    const b = batchById.get(batchId); if (!b) continue;
    const cur = byItem.get(b.item_id) || { qty: 0, value: 0 };
    cur.qty += qty; cur.value += qty * (Number(b.landed_cost) || 0);
    byItem.set(b.item_id, cur);
  }
  const rows = items.map(it => {
    const agg = byItem.get(it.id) || { qty: 0, value: 0 };
    const avgCost = agg.qty > 0 ? agg.value / agg.qty : (Number(it.purchaseRate) || 0);
    return { itemId: it.id, sku: it.sku, name: it.name, category: it.category, onHand: +agg.qty.toFixed(3), avgCost: +avgCost.toFixed(4), value: +agg.value.toFixed(2), negative: agg.qty < 0 };
  });
  const totalValue = +rows.reduce((s, r) => s + r.value, 0).toFixed(2);
  return { rows, totalValue };
}

// ── BATCH EXPIRY: batches with on-hand > 0, soonest expiry first ──
export async function fetchDistExpiryReport(withinDays = null) {
  const [batchOnHand, items] = await Promise.all([computeDistBatchOnHand(), fetchDistItems()]);
  const itemById = new Map(items.map(i => [i.id, i]));
  const { data: batchRows } = await supabase.from("dist_batches").select("id, item_id, batch_no, expiry_date, landed_cost");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rows = [];
  for (const b of batchRows || []) {
    const qty = batchOnHand.get(b.id) || 0;
    if (qty <= 0) continue;
    const it = itemById.get(b.item_id);
    let daysLeft = null, status = "ok";
    if (b.expiry_date) {
      daysLeft = Math.round((new Date(b.expiry_date) - today) / 86400000);
      status = daysLeft < 0 ? "expired" : daysLeft <= 7 ? "critical" : daysLeft <= 30 ? "soon" : "ok";
    }
    rows.push({ batchId: b.id, itemId: b.item_id, sku: it?.sku || "", name: it?.name || b.item_id, batchNo: b.batch_no || "", expiryDate: b.expiry_date || null, daysLeft, status, qty: +qty.toFixed(3), valueAtRisk: +(qty * (Number(b.landed_cost) || 0)).toFixed(2) });
  }
  rows.sort((a, b) => { if (a.expiryDate == null) return 1; if (b.expiryDate == null) return -1; return new Date(a.expiryDate) - new Date(b.expiryDate); });
  const filtered = withinDays != null ? rows.filter(r => r.daysLeft != null && r.daysLeft <= withinDays) : rows;
  return { rows: filtered, expiredCount: rows.filter(r => r.status === "expired").length, criticalCount: rows.filter(r => r.status === "critical").length };
}

// ── AGED CREDITORS: unpaid bills bucketed by age from due date (else bill date) ──
export async function fetchDistAgedCreditors(asOf = null) {
  const ref = asOf ? new Date(asOf) : new Date(); ref.setHours(0, 0, 0, 0);
  const bills = await fetchDistBills({ status: ["open", "part_paid"] });
  const paid = await fetchDistBillPaidMap(bills.map(b => b.id));
  const taxRates = await fetchDistTaxRates();
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, older: 0 };
  const rows = bills.map(b => {
    const gross = b.grandTotal != null && b.grandTotal > 0 ? b.grandTotal : distReportDocGross(b, taxRates);
    const due = +(gross - (paid.get(b.id) || 0)).toFixed(2);
    if (due <= 0.005) return null;
    const ageDate = b.dueDate || b.billDate;
    const days = ageDate ? Math.round((ref - new Date(ageDate)) / 86400000) : 0;
    const bucket = days <= 0 ? "current" : days <= 30 ? "d30" : days <= 60 ? "d60" : days <= 90 ? "d90" : "older";
    buckets[bucket] += due;
    return { id: b.id, ref: b.billNumber, party: b.vendorId, date: b.billDate, dueDate: b.dueDate, due, days, bucket };
  }).filter(Boolean);
  for (const k in buckets) buckets[k] = +buckets[k].toFixed(2);
  return { rows, buckets, total: +rows.reduce((s, r) => s + r.due, 0).toFixed(2) };
}

// ── AGED DEBTORS: unpaid invoices bucketed by age ──
export async function fetchDistAgedDebtors(asOf = null) {
  const ref = asOf ? new Date(asOf) : new Date(); ref.setHours(0, 0, 0, 0);
  const invoices = await fetchDistInvoices({ status: ["open", "part_paid"] });
  const paid = await fetchDistInvoicePaidMap(invoices.map(i => i.id));
  const taxRates = await fetchDistTaxRates();
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, older: 0 };
  const rows = invoices.map(i => {
    const gross = (i.grandTotal != null && i.grandTotal > 0 ? i.grandTotal : distReportDocGross(i, taxRates)) + (Number(i.shippingCharge) || 0) * (i.grandTotal > 0 ? 0 : 1);
    const due = +(gross - (paid.get(i.id) || 0)).toFixed(2);
    if (due <= 0.005) return null;
    const ageDate = i.dueDate || i.invoiceDate;
    const days = ageDate ? Math.round((ref - new Date(ageDate)) / 86400000) : 0;
    const bucket = days <= 0 ? "current" : days <= 30 ? "d30" : days <= 60 ? "d60" : days <= 90 ? "d90" : "older";
    buckets[bucket] += due;
    return { id: i.id, ref: i.invoiceNumber, party: i.customerId, date: i.invoiceDate, dueDate: i.dueDate, due, days, bucket };
  }).filter(Boolean);
  for (const k in buckets) buckets[k] = +buckets[k].toFixed(2);
  return { rows, buckets, total: +rows.reduce((s, r) => s + r.due, 0).toFixed(2) };
}

// Fallback gross for older docs without a stored grand_total.
function distReportDocGross(doc, taxRates) {
  const inclusive = doc.vatMode === "inclusive";
  const dVal = Number(doc.discountPercent) || 0; const dType = doc.discountType || "percent";
  let sub = 0; const base = [];
  for (const l of doc.lines || []) {
    const pct = (taxRates.find(t => t.id === l.taxRateId)?.percent) || 0;
    const raw = (Number(l.qty) || 0) * (Number(l.unitPrice) || 0);
    const net = inclusive && pct > 0 ? raw / (1 + pct / 100) : raw;
    base.push({ pct, net }); sub += net;
  }
  const factor = dType === "value" ? (sub > 0 ? Math.max(0, 1 - dVal / sub) : 1) : (1 - dVal / 100);
  let net = 0, vat = 0;
  for (const { pct, net: bn } of base) { const dn = bn * factor; net += dn; vat += dn * pct / 100; }
  return +(net + vat).toFixed(2);
}

// ── DISTRIBUTION P&L: income vs expense from journal lines over a range ──
export async function fetchDistPnL({ from, to } = {}) {
  const [entries, accounts] = await Promise.all([
    fetchJournalEntries({ entityId: "brand-distribution", from, to }), fetchAccounts("brand-distribution"),
  ]);
  const acctById = new Map(accounts.map(a => [a.id, a]));
  const income = new Map(); const expense = new Map();
  for (const e of entries) {
    for (const l of e.lines) {
      const a = acctById.get(l.accountId); if (!a) continue;
      // Income accounts are credit-normal (negative amount = revenue); expense debit-normal.
      if (a.type === "income") {
        const cur = income.get(a.code) || { code: a.code, name: a.name, amount: 0 };
        cur.amount += -l.amount; income.set(a.code, cur);
      } else if (a.type === "expense") {
        const cur = expense.get(a.code) || { code: a.code, name: a.name, amount: 0 };
        cur.amount += l.amount; expense.set(a.code, cur);
      }
    }
  }
  const incomeRows = [...income.values()].map(r => ({ ...r, amount: +r.amount.toFixed(2) })).filter(r => r.amount !== 0).sort((a, b) => a.code.localeCompare(b.code));
  const expenseRows = [...expense.values()].map(r => ({ ...r, amount: +r.amount.toFixed(2) })).filter(r => r.amount !== 0).sort((a, b) => a.code.localeCompare(b.code));
  const totalIncome = +incomeRows.reduce((s, r) => s + r.amount, 0).toFixed(2);
  const totalExpense = +expenseRows.reduce((s, r) => s + r.amount, 0).toFixed(2);
  const cogs = +expenseRows.filter(r => r.code === "5000").reduce((s, r) => s + r.amount, 0).toFixed(2);
  return { incomeRows, expenseRows, totalIncome, totalExpense, cogs, grossProfit: +(totalIncome - cogs).toFixed(2), netProfit: +(totalIncome - totalExpense).toFixed(2) };
}

// ── REORDER REPORT: items at/below reorder point (available <= reorder_point) ──
export async function fetchDistReorderReport() {
  const snap = await fetchDistStockSnapshot();
  return snap.filter(it => it.stocked !== false && (Number(it.reorderPoint) || 0) > 0 && it.available <= (Number(it.reorderPoint) || 0))
    .map(it => ({ itemId: it.id, sku: it.sku, name: it.name, onHand: it.onHand, committed: it.committed, available: it.available, reorderPoint: Number(it.reorderPoint) || 0, shortfall: +((Number(it.reorderPoint) || 0) - it.available).toFixed(3) }));
}

// ── DISTRIBUTION GLOBAL SEARCH INDEX ─────────────────────────────────────────
// Loads the searchable entities once (parallel), returning lightweight records
// the client filters in-memory. One batch load per search-open, not per keystroke.
export async function fetchDistSearchIndex() {
  const [items, contacts, sos, pos, invoices, bills] = await Promise.all([
    fetchDistItems().catch(() => []),
    fetchDistContacts().catch(() => []),
    fetchDistSalesOrders({}).catch(() => []),
    fetchDistPurchaseOrders({}).catch(() => []),
    fetchDistInvoices({}).catch(() => []),
    fetchDistBills({}).catch(() => []),
  ]);
  const out = [];
  (items || []).forEach(i => out.push({ kind: "item", id: i.id, title: i.name, sub: i.sku || "", view: "dist-items" }));
  (contacts || []).forEach(c => out.push({ kind: c.kind === "vendor" ? "vendor" : "customer", id: c.id, title: c.displayName, sub: c.email || c.phone || "", view: c.kind === "vendor" ? "dist-vendors" : "dist-customers" }));
  (sos || []).forEach(s => out.push({ kind: "sales order", id: s.id, title: s.soNumber, sub: s.customerId || "", view: "dist-sales-orders", docType: "so" }));
  (pos || []).forEach(p => out.push({ kind: "purchase order", id: p.id, title: p.poNumber, sub: p.vendorId || "", view: "dist-pos", docType: "po" }));
  (invoices || []).forEach(i => out.push({ kind: "invoice", id: i.id, title: i.invoiceNumber, sub: i.customerId || "", view: "dist-invoices", docType: "invoice" }));
  (bills || []).forEach(b => out.push({ kind: "bill", id: b.id, title: b.billNumber, sub: b.vendorId || "", view: "dist-bills", docType: "bill" }));
  return out;
}

// ── DISTRIBUTION DASHBOARD ───────────────────────────────────────────────────
// One coordinated fetch for the Distribution home: headline KPIs + the
// "needs attention" lists. Reuses the existing (optimised) report functions and
// runs them in parallel — far lighter than the dashboard firing many separate
// fetches, and avoids adding to DB I/O pressure.
export async function fetchDistDashboard() {
  const [valuation, reorder, debtors, creditors, board, openPOs] = await Promise.all([
    fetchDistStockValuation().catch(() => ({ rows: [], totalValue: 0 })),
    fetchDistReorderReport().catch(() => []),
    fetchDistAgedDebtors().catch(() => ({ rows: [], buckets: {}, total: 0 })),
    fetchDistAgedCreditors().catch(() => ({ rows: [], buckets: {}, total: 0 })),
    fetchDistFulfilmentBoard().catch(() => []),
    fetchDistPurchaseOrders({ status: ["open", "partially_received"] }).catch(() => []),
  ]);

  // Overdue split out of the aged reports (anything not in the "current" bucket).
  const overdueInvoices = (debtors.rows || []).filter(r => r.bucket !== "current");
  const overdueBills = (creditors.rows || []).filter(r => r.bucket !== "current");
  const overdueInvoicesTotal = +overdueInvoices.reduce((s, r) => s + r.due, 0).toFixed(2);
  const overdueBillsTotal = +overdueBills.reduce((s, r) => s + r.due, 0).toFixed(2);

  // Fulfilment pipeline: count orders at each active stage.
  const pipeline = { confirmed: 0, picked: 0, dispatched: 0, invoiced: 0 };
  (board || []).forEach(r => { if (pipeline[r.stage] != null) pipeline[r.stage] += 1; });
  const ordersToFulfil = (board || []).filter(r => r.stage !== "paid").length;

  return {
    kpis: {
      stockValue: valuation.totalValue || 0,
      stockItems: (valuation.rows || []).filter(r => r.onHand !== 0).length,
      negativeStock: (valuation.rows || []).filter(r => r.negative).length,
      receivables: debtors.total || 0,
      payables: creditors.total || 0,
      lowStockCount: (reorder || []).length,
      posToReceive: (openPOs || []).length,
      ordersToFulfil,
    },
    needsAttention: {
      lowStock: (reorder || []).slice(0, 8),
      overdueInvoices: overdueInvoices.slice(0, 8),
      overdueInvoicesTotal, overdueInvoicesCount: overdueInvoices.length,
      overdueBills: overdueBills.slice(0, 8),
      overdueBillsTotal, overdueBillsCount: overdueBills.length,
      posToReceive: (openPOs || []).slice(0, 8),
    },
    pipeline,
    debtorBuckets: debtors.buckets || {},
    creditorBuckets: creditors.buckets || {},
  };
}

// ============================================================================
// AGENTIC AI LAYER
// Principle: deterministic code computes EVERY number; Claude only writes prose.
// The Agent Inbox (agent_tasks) is the human-in-the-loop approval surface.
// ============================================================================

const agentId = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const agentGbp = (n) => `£${(Number(n) || 0).toFixed(2)}`;

// ── Agent Inbox CRUD ────────────────────────────────────────────────────────
const mapAgentTask = (t) => ({
  id: t.id, agent: t.agent, kind: t.kind, title: t.title, body: t.body || "",
  status: t.status, severity: t.severity || "info", brandId: t.brand_id, storeId: t.store_id,
  customerId: t.customer_id, payload: t.payload || {}, savings: t.savings != null ? Number(t.savings) : null,
  resultRef: t.result_ref, createdBy: t.created_by, reviewedBy: t.reviewed_by,
  createdAt: t.created_at, reviewedAt: t.reviewed_at,
});

export async function fetchAgentTasks({ status, agent, limit = 50 } = {}) {
  let q = supabase.from("agent_tasks").select("*").order("created_at", { ascending: false }).limit(limit);
  if (status) q = q.eq("status", status);
  if (agent) q = q.eq("agent", agent);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapAgentTask);
}

export async function createAgentTask(t) {
  const row = {
    id: t.id || agentId("atask"), agent: t.agent, kind: t.kind, title: t.title, body: t.body || null,
    status: t.status || "pending", severity: t.severity || "info", brand_id: t.brandId || null,
    store_id: t.storeId || null, customer_id: t.customerId || null, payload: t.payload || {},
    savings: t.savings != null ? Number(t.savings) : null, created_by: t.createdBy || "agent",
  };
  const { data, error } = await supabase.from("agent_tasks").insert(row).select().maybeSingle();
  if (error) throw error;
  return data ? mapAgentTask(data) : null;
}

export async function updateAgentTaskStatus(id, status, { reviewedBy, resultRef } = {}) {
  const patch = { status, reviewed_at: new Date().toISOString() };
  if (reviewedBy) patch.reviewed_by = reviewedBy;
  if (resultRef) patch.result_ref = resultRef;
  const { error } = await supabase.from("agent_tasks").update(patch).eq("id", id);
  if (error) throw error;
  return true;
}

export async function logAgentMetric(m) {
  const row = {
    id: agentId("amet"), agent: m.agent, task_id: m.taskId || null, store_id: m.storeId || null,
    metric: m.metric, forecast: m.forecast != null ? Number(m.forecast) : null,
    actual: m.actual != null ? Number(m.actual) : null, value: m.value != null ? Number(m.value) : null, note: m.note || null,
  };
  const { error } = await supabase.from("agent_metrics").insert(row);
  if (error) throw error;
  return true;
}

// ── Autonomy settings (Nory-style Assistant vs Agent mode, per agent) ────────
// Stored in app_settings key "agent_autonomy": { ordering: {mode, autoMaxValue}, profit_watch: {mode}, ... }
export async function fetchAgentAutonomy() {
  const s = await fetchAppSettings().catch(() => ({}));
  try { return s?.agent_autonomy ? JSON.parse(s.agent_autonomy) : {}; } catch { return {}; }
}
export async function saveAgentAutonomy(cfg) {
  await upsertAppSetting("agent_autonomy", JSON.stringify(cfg || {}));
  return true;
}

// Profit Watch targets: { labourPct (default), cogsPct, byStore: { storeId: labourPct } }
export async function fetchProfitTargets() {
  const s = await fetchAppSettings().catch(() => ({}));
  let t = { labourPct: 30, cogsPct: 30, byStore: {} };
  try { if (s?.profit_targets) t = { ...t, ...JSON.parse(s.profit_targets) }; } catch (_) {}
  if (!t.byStore) t.byStore = {};
  return t;
}
export async function saveProfitTargets(t) {
  await upsertAppSetting("profit_targets", JSON.stringify(t || {}));
  return true;
}

// ── Shared Claude helper (server-side; numbers already computed, Claude only phrases) ──
// Reuses the same Edge-Function + secret pattern as askData. Falls back to a
// deterministic string if the LLM is unavailable, so an agent NEVER blocks on it.
export async function agentPhrase({ system, prompt, fallback }) {
  try {
    const headers = {};
    if (process.env.REACT_APP_SYNC_SECRET) headers["x-sync-secret"] = process.env.REACT_APP_SYNC_SECRET;
    const { data, error } = await supabase.functions.invoke("agent-llm", { body: { system, prompt }, headers });
    if (error) throw error;
    if (data?.ok && data.text) return data.text;
    throw new Error(data?.error || "no text");
  } catch (e) {
    return fallback || "";
  }
}

// ── ORDERING ASSISTANT ──────────────────────────────────────────────────────
// Deterministic demand forecast per item from a customer's order history, compared
// to live stock, producing draft PO lines. All maths here in code; no LLM numbers.
export function forecastItemDemand(orderHistory, { lookbackOrders = 8 } = {}) {
  // Simple, explainable baseline: average qty per recent order, per item.
  const recent = (orderHistory || []).slice(0, lookbackOrders);
  const totals = new Map(); // itemId -> { sum, orders }
  recent.forEach(o => {
    (o.lines || []).forEach(l => {
      if (!l.itemId) return;
      const cur = totals.get(l.itemId) || { sum: 0, orders: 0 };
      cur.sum += Number(l.qty) || 0; cur.orders += 1;
      totals.set(l.itemId, cur);
    });
  });
  const out = new Map(); // itemId -> forecast qty (avg per order, rounded up)
  totals.forEach((v, id) => { out.set(id, Math.ceil(v.sum / recent.length)); });
  return out; // Map itemId -> expected qty next order
}

// Build draft order lines: forecast demand minus what's already available.
export async function buildOrderingDraft({ customerId }) {
  const [orders, stock, catalogue] = await Promise.all([
    fetchDistSalesOrders({ customerId }).catch(() => []),
    fetchDistStockSnapshot().catch(() => []),
    fetchDistPortalCatalogue(customerId).catch(() => []),
  ]);
  const valid = (orders || []).filter(o => o.status !== "cancelled");
  const demand = forecastItemDemand(valid);
  const stockById = new Map((stock || []).map(s => [s.id, s]));
  const catById = new Map((catalogue || []).map(c => [c.id, c]));
  const lines = [];
  demand.forEach((qty, itemId) => {
    const st = stockById.get(itemId);
    const available = st ? Number(st.available) || 0 : 0;
    const gap = Math.max(0, qty - available);          // only order the shortfall
    if (gap <= 0) return;
    const cat = catById.get(itemId) || st || {};
    lines.push({
      itemId, name: cat.name || st?.name || itemId, forecast: qty, available,
      qty: gap, unitPrice: Number(cat.price != null ? cat.price : st?.sellRate) || 0,
      taxRateId: cat.taxRateId || st?.taxRateId || null,
    });
  });
  lines.sort((a, b) => b.qty - a.qty);
  const estValue = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  return { customerId, lines, estValue, basisOrders: valid.length };
}

// Run the Ordering Assistant for a customer: build draft, phrase a note, post to Inbox.
export async function runOrderingAssistant({ customerId, customerName, createdBy }) {
  const draft = await buildOrderingDraft({ customerId });
  if (!draft.lines.length) return null; // nothing to order — no noise in the Inbox
  const top = draft.lines.slice(0, 6).map(l => `${l.name}: order ${l.qty} (need ~${l.forecast}, have ${l.available})`).join("; ");
  const fallback = `Suggested order for ${customerName || "this store"} based on the last ${draft.basisOrders} orders: ${draft.lines.length} item(s), about ${agentGbp(draft.estValue)} ex VAT. ${top}.`;
  const body = await agentPhrase({
    system: "You write a one-paragraph, plain-English rationale for a restaurant supply order. Be concise and practical. Do NOT invent or change any numbers you are given.",
    prompt: `Draft order for ${customerName || "a store"}. Based on the last ${draft.basisOrders} orders. Lines (item: order qty, forecast need, currently available): ${draft.lines.map(l => `${l.name}: order ${l.qty}, need ${l.forecast}, have ${l.available}`).join("; ")}. Total about ${agentGbp(draft.estValue)} ex VAT. Write one short paragraph explaining the suggestion.`,
    fallback,
  });
  return createAgentTask({
    agent: "ordering", kind: "draft_order", customerId,
    title: `Suggested order: ${customerName || "store"} — ${draft.lines.length} items, ${agentGbp(draft.estValue)}`,
    body, severity: "action", payload: { lines: draft.lines, estValue: draft.estValue, basisOrders: draft.basisOrders },
    savings: null, createdBy: createdBy || "agent",
  });
}

// Approve a drafted order → create the real sales order via the existing flow.
export async function approveOrderingTask(task, { reviewedBy } = {}) {
  const lines = (task.payload?.lines || []).map(l => ({
    itemId: l.itemId, qty: Number(l.qty) || 0, unitPrice: Number(l.unitPrice) || 0, taxRateId: l.taxRateId || null,
    discount: 0, discountType: "percent",
  })).filter(l => l.itemId && l.qty > 0);
  if (!lines.length) throw new Error("This draft has no orderable lines.");
  const soId = await createDistSalesOrder({
    customerId: task.customerId, status: "confirmed", orderDate: new Date().toISOString().slice(0, 10),
    vatMode: "exclusive", createdBy: reviewedBy || "agent", note: "Created from Ordering Assistant suggestion",
  }, lines);
  await updateAgentTaskStatus(task.id, "approved", { reviewedBy, resultRef: soId });
  return soId;
}

// ── PROFIT WATCH ────────────────────────────────────────────────────────────
// Pull per-store daily figures for a date from the existing reporting layer:
// labour% from the labour_vs_revenue view; COGS% target from settings. Targets
// come from app_settings key "profit_targets" ({labourPct, cogsPct}) or defaults.
export async function fetchProfitWatchInputs(day) {
  const [labour, settings, stores] = await Promise.all([
    fetchLabourVsRevenue({ from: day, to: day }).catch(() => []),
    fetchAppSettings().catch(() => ({})),
    fetchStores().catch(() => []),
  ]);
  let targets = { labourPct: 30, cogsPct: 30, byStore: {} };
  try { if (settings?.profit_targets) targets = { ...targets, ...JSON.parse(settings.profit_targets) }; } catch (_) {}
  const storeName = new Map((stores || []).map(s => [s.id, s.shortName || s.name]));
  // Per-site labour target if set, else the default. cogsTarget stays default.
  const labourTargetFor = (storeId) => {
    const per = targets.byStore && targets.byStore[storeId];
    return per != null && per !== "" ? Number(per) : Number(targets.labourPct) || 30;
  };
  // One row per store for the day. COGS% left null unless a daily COGS source is
  // wired per store; labour% drives the initial Profit Watch. (COGS can be added.)
  return (labour || []).filter(r => r.storeId && r.storeId !== "unmatched" && r.labourPct != null).map(r => ({
    storeId: r.storeId, storeName: storeName.get(r.storeId) || r.storeId, date: r.date,
    labourPct: r.labourPct, labourTarget: labourTargetFor(r.storeId),
    cogsPct: null, cogsTarget: targets.cogsPct,
  }));
}

// Deterministic variance finder across sites, then Claude writes the morning brief.
// Uses whatever daily figures are available; each variance is computed in code.
export async function runProfitWatch({ date, createdBy } = {}) {
  const day = date || new Date().toISOString().slice(0, 10);
  // Pull the day's per-store figures from the existing reporting layer.
  const rows = await fetchProfitWatchInputs(day).catch(() => []);
  if (!rows || !rows.length) return null;
  // Rank by absolute variance against target (labour % over, COGS % over).
  const flagged = rows.map(r => {
    const hasLabour = r.labourPct != null;
    const hasCogs = r.cogsPct != null;
    // Guard: a very low labour% almost always means punches aren't fully recorded
    // yet for that day, not a real efficiency win. Treat <8% as incomplete data.
    const labourLooksComplete = hasLabour && Number(r.labourPct) >= 8;
    const labourVar = labourLooksComplete ? (Number(r.labourPct) - (Number(r.labourTarget) || 0)) : null;
    const cogsVar = hasCogs ? (Number(r.cogsPct) - (Number(r.cogsTarget) || 0)) : null;
    // Asymmetric thresholds: overspend costs money so flag early (>= +3pts);
    // running under target is rarely a problem, so only flag a BIG under (<= -8pts),
    // which usually signals incomplete data worth checking rather than a real win.
    const OVER = 3, UNDER = 8;
    const labourFlagged = labourVar != null && (labourVar >= OVER || labourVar <= -UNDER);
    const cogsFlagged = cogsVar != null && (cogsVar >= OVER || cogsVar <= -UNDER);
    const worst = Math.max(labourFlagged ? Math.abs(labourVar) : 0, cogsFlagged ? Math.abs(cogsVar) : 0);
    return { ...r, labourVar, cogsVar, worst, labourFlagged, cogsFlagged };
  }).filter(r => r.labourFlagged || r.cogsFlagged)
    .sort((a, b) => b.worst - a.worst);
  if (!flagged.length) return null;
  const detail = flagged.slice(0, 8).map(r => {
    const bits = [];
    if (r.labourFlagged) bits.push(`labour ${r.labourVar > 0 ? "+" : ""}${r.labourVar.toFixed(1)}pts`);
    if (r.cogsFlagged) bits.push(`COGS ${r.cogsVar > 0 ? "+" : ""}${r.cogsVar.toFixed(1)}pts`);
    return `${r.storeName || r.storeId}: ${bits.join(", ")}`;
  }).join("; ");
  const fallback = `Profit Watch for ${day}: ${flagged.length} site(s) off target. ${detail}.`;
  const body = await agentPhrase({
    system: "You are a restaurant profit analyst writing a short morning brief for the owner. Be specific and practical, name the sites and the fix. Note that labour OVER target means overspending on staff; a big UNDER may mean incomplete timekeeping data. Do NOT invent numbers — use only those given.",
    prompt: `Date ${day}. Sites off target (variance in percentage points vs target): ${detail}. Write a short brief (3-5 sentences) highlighting the biggest issues and a suggested action for each.`,
    fallback,
  });
  // Supersede any earlier PENDING Profit Watch card for the SAME day, so re-runs
  // replace rather than pile up duplicates in the inbox.
  try {
    const { data: dupes } = await supabase.from("agent_tasks").select("id, payload")
      .eq("agent", "profit_watch").eq("status", "pending");
    for (const d of (dupes || [])) {
      if (d.payload && d.payload.date === day) await supabase.from("agent_tasks").update({ status: "superseded" }).eq("id", d.id);
    }
  } catch (_) {}
  const task = await createAgentTask({
    agent: "profit_watch", kind: "brief",
    title: `Profit Watch ${day} — ${flagged.length} site(s) off target`,
    body, severity: "warn", payload: { date: day, flagged },
    createdBy: createdBy || "agent",
  });
  // MEASUREMENT LOOP: log each flagged site's variance so trends build over time
  // (e.g. "London Road over target 4 of last 7 days"). Best-effort; never blocks.
  for (const r of flagged) {
    if (r.labourFlagged) {
      await logAgentMetric({
        agent: "profit_watch", taskId: task?.id, storeId: r.storeId, metric: "labour_variance",
        forecast: Number(r.labourTarget) || 0, actual: Number(r.labourPct) || 0, value: r.labourVar,
        note: `${day} ${r.storeName || r.storeId} labour ${r.labourVar > 0 ? "+" : ""}${r.labourVar.toFixed(1)}pts`,
      }).catch(() => {});
    }
  }
  return task;
}

// Trend helper: how often has each site been flagged over target recently?
// Reads agent_metrics for the labour_variance metric over the last N days.
export async function fetchProfitWatchTrends({ days = 14 } = {}) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data, error } = await supabase.from("agent_metrics")
    .select("store_id, value, actual, forecast, created_at, note")
    .eq("agent", "profit_watch").eq("metric", "labour_variance")
    .gte("created_at", since).order("created_at", { ascending: false });
  if (error) throw error;
  const byStore = {}; // store_id -> { overCount, underCount, days, lastValue }
  (data || []).forEach(m => {
    const s = byStore[m.store_id] || { overCount: 0, underCount: 0, days: 0, lastValue: null };
    s.days += 1;
    if (Number(m.value) > 0) s.overCount += 1; else s.underCount += 1;
    if (s.lastValue == null) s.lastValue = Number(m.value);
    byStore[m.store_id] = s;
  });
  return byStore;
}

// ── RECONCILIATION ASSISTANT — DISABLED ──────────────────────────────────────
// NOTE: disabled deliberately. A true delivery reconciliation needs the actual
// Flipdish PAYOUT feed (what Flipdish deposited, net of commission). The only
// "settlement" data in the app (store_day_payments) is IN-STORE EOD card takings,
// which is a different revenue stream from flipdish_sales (online delivery) — so
// comparing them produced a large, meaningless "gap" (really commission + stream
// mismatch). Re-enable only once a real payout/settlement source is wired.
export async function runReconciliationAssistant({ from, to, createdBy } = {}) {
  return null; // no comparable payout data available yet — see runReconciliationAssistant_v2
}

// ── FLIPDISH PAYOUT SYNC + PROBE ─────────────────────────────────────────────
// Probe: answers "do my credentials have payout permissions?" without writing.
// Reads the function's JSON body even on non-2xx, so the real error shows.
async function invokePayoutFn(payload) {
  const url = `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/flipdish-payout-sync`;
  const anon = process.env.REACT_APP_SUPABASE_ANON_KEY;
  const headers = { "content-type": "application/json", authorization: `Bearer ${anon}`, apikey: anon };
  if (process.env.REACT_APP_SYNC_SECRET) headers["x-sync-secret"] = process.env.REACT_APP_SYNC_SECRET;
  let resp;
  try { resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) }); }
  catch (e) { return { ok: false, error: `network: ${e.message}` }; }
  let data = null;
  try { data = await resp.json(); } catch { data = { ok: false, error: `HTTP ${resp.status} (no JSON body)` }; }
  if (!resp.ok && data && data.ok === undefined) data = { ok: false, error: data.error || `HTTP ${resp.status}` };
  return data;
}
export async function probeFlipdishPayouts({ from, to } = {}) {
  return invokePayoutFn({ probe: true, from, to });
}
// Sync: pulls payouts into flipdish_payouts.
export async function syncFlipdishPayouts({ from, to, withDetail, maxDetail } = {}) {
  return invokePayoutFn({ from, to, withDetail, maxDetail });
}
export async function fetchFlipdishPayouts({ from, to } = {}) {
  // Filter by paid_on (CreatedDate) — period_end comes back as a 1970 placeholder
  // from Flipdish's list view, so filtering on it would exclude everything.
  let q = supabase.from("flipdish_payouts").select("*").order("paid_on", { ascending: false });
  if (from) q = q.gte("paid_on", from);
  if (to) q = q.lte("paid_on", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(p => ({
    id: p.id, flipdishId: p.flipdish_id, storeId: p.store_id, accountName: p.account_name, destinationBank: p.destination_bank,
    status: p.status, periodStart: p.period_start, periodEnd: p.period_end, paidOn: p.paid_on, currency: p.currency, payoutType: p.payout_type,
    totalRevenue: Number(p.total_revenue) || 0, onlineSales: Number(p.online_sales) || 0, posSales: Number(p.pos_sales) || 0,
    cashCollected: Number(p.cash_collected) || 0, fees: Number(p.fees) || 0, onlineFees: Number(p.online_fees) || 0, posFees: Number(p.pos_fees) || 0,
    adjustments: Number(p.adjustments) || 0, chargebacks: Number(p.chargebacks) || 0, otherCharges: Number(p.other_charges) || 0,
    openingBalance: Number(p.opening_balance) || 0, closingBalance: Number(p.closing_balance) || 0,
    payoutAmount: Number(p.payout_amount) || 0, orderCount: p.order_count || 0,
  }));
}

// Fetch per-store payout breakdown (the detail rows that let us reconcile).
export async function fetchFlipdishPayoutStores() {
  const { data, error } = await supabase.from("flipdish_payout_stores").select("*").limit(5000);
  if (error) throw error;
  return (data || []).map(s => ({
    id: s.id, payoutId: s.payout_id, storeId: s.store_id, storeName: s.store_name,
    revenue: Number(s.revenue) || 0, cashRevenue: Number(s.cash_revenue) || 0,
    fees: Number(s.fees) || 0, adjustments: Number(s.adjustments) || 0, totalPayout: Number(s.total_payout) || 0,
    // Authoritative /properties data (per payout):
    summaryTotal: s.summary_total != null ? Number(s.summary_total) : null,
    openingBalance: Number(s.opening_balance) || 0, closingBalance: Number(s.closing_balance) || 0,
    balanceRepaid: Number(s.balance_repaid) || 0, chargebacks: Number(s.chargebacks) || 0,
    otherTransactions: Number(s.other_transactions) || 0, refundsCard: Number(s.refunds_card) || 0,
    refundsCash: Number(s.refunds_cash) || 0,
  }));
}

// TRUE reconciliation: verify Payout = Revenue + CashRevenue + Fees + Adjustments
// for every per-store breakdown row. Flags only rows where the formula DOESN'T
// hold — a genuine unexplained discrepancy. Proven on real data to net to zero.
export async function runPayoutReconciliation({ createdBy } = {}) {
  const rows = await fetchFlipdishPayoutStores().catch(() => []);
  if (!rows.length) return null;
  const bad = [];
  let checked = 0;
  // Group store rows by payout. The /properties Summary is stored on every store
  // row of a payout, so read it once per payout. Authoritative check: the sum of
  // store payouts must equal Flipdish's own Summary.Total (which already includes
  // balance carryover, chargebacks, refunds).
  const byPayout = new Map();
  rows.forEach(r => {
    const p = byPayout.get(r.payoutId) || { payoutId: r.payoutId, storePayoutSum: 0, summaryTotal: null,
      opening: r.openingBalance, closing: r.closingBalance, repaid: r.balanceRepaid, chargebacks: r.chargebacks, names: new Set() };
    p.storePayoutSum += r.totalPayout;
    if (r.storeName) p.names.add(r.storeName);
    if (p.summaryTotal == null && r.summaryTotal != null) p.summaryTotal = r.summaryTotal;
    byPayout.set(r.payoutId, p);
  });
  byPayout.forEach(p => {
    if (p.summaryTotal == null) return; // no /properties data yet — needs detail sync
    checked++;
    const name = [...p.names][0] || p.payoutId;
    const residual = +(p.storePayoutSum - p.summaryTotal).toFixed(2);
    if (Math.abs(residual) > 1) {
      bad.push({ storeName: name, expected: p.summaryTotal, payout: p.storePayoutSum, residual, repaid: p.repaid, chargebacks: p.chargebacks });
    }
  });
  try {
    const { data: dupes } = await supabase.from("agent_tasks").select("id").eq("agent", "reconciliation").eq("status", "pending");
    for (const d of (dupes || [])) await supabase.from("agent_tasks").update({ status: "superseded" }).eq("id", d.id);
  } catch (_) {}
  if (!checked) return null; // nothing had authoritative data yet
  if (!bad.length) {
    return createAgentTask({
      agent: "reconciliation", kind: "brief",
      title: `Payouts reconciled - ${checked} payout(s) all balance`,
      body: `Checked ${checked} payouts against Flipdish's own authoritative totals (revenue, cash, fees, balance carryover, chargebacks all included). Every one reconciles. No discrepancies.`,
      severity: "info", payload: { reconciled: true, checked }, createdBy: createdBy || "agent",
    });
  }
  bad.sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual));
  const totalResidual = +bad.reduce((s, b) => s + b.residual, 0).toFixed(2);
  const detail = bad.slice(0, 8).map(b => `${b.storeName}: stores sum ${agentGbp(b.payout)} vs Flipdish total ${agentGbp(b.expected)}, off ${agentGbp(b.residual)}`).join("; ");
  const fallback = `Payout reconciliation: ${bad.length} payout(s) where the store breakdown doesn't match Flipdish's own total, ${agentGbp(totalResidual)} off. ${detail}.`;
  const body = await agentPhrase({
    system: "You write a reconciliation brief for a restaurant owner. These are payouts where the per-store breakdown doesn't sum to Flipdish's own authoritative payout total, a genuine data discrepancy worth querying. Do NOT invent numbers.",
    prompt: `Payouts not reconciling: ${detail}. Total off ${agentGbp(totalResidual)}. Write 3-4 sentences on what to check.`,
    fallback,
  });
  const task = await createAgentTask({
    agent: "reconciliation", kind: "brief",
    title: `Payout reconciliation - ${bad.length} payout(s) off, ${agentGbp(totalResidual)}`,
    body, severity: "action",
    payload: { reconRows: bad.map(b => ({ account: b.storeName, revenue: b.expected, fees: 0, paid: b.payout, reasons: [`stores sum ${agentGbp(b.payout)} vs Flipdish total ${agentGbp(b.expected)}, off ${agentGbp(b.residual)}`] })) },
    savings: Math.abs(totalResidual), createdBy: createdBy || "agent",
  });
  await logAgentMetric({ agent: "reconciliation", taskId: task?.id, metric: "unexplained_residual", value: totalResidual, note: `${bad.length}/${checked} payouts` }).catch(() => {});
  return task;
}

// ── RECONCILIATION ASSISTANT v2 (real Flipdish payout data) ──────────────────
// The payout list gives net Amount + revenue/fee components per legal entity.
// We do NOT assert Flipdish's full internal formula (it involves VAT/tax
// remittance not fully exposed in the list view — asserting it would produce
// false "gaps"). Instead we flag only CLEAR anomalies worth a human look:
//   • unusually high effective fee rate (possible overcharge)
//   • negative closing balance (you owed Flipdish — money comes off next payout)
//   • chargebacks present
// This surfaces real things to check without inventing reconciliation errors.
export async function runReconciliationAssistant_v2({ from, to, createdBy } = {}) {
  const end = to || new Date().toISOString().slice(0, 10);
  const start = from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const payouts = await fetchFlipdishPayouts({ from: start, to: end }).catch(() => []);
  if (!payouts.length) return null;
  // Supersede any earlier pending reconciliation card — it's a rolling summary.
  try {
    const { data: dupes } = await supabase.from("agent_tasks").select("id").eq("agent", "reconciliation").eq("status", "pending");
    for (const d of (dupes || [])) await supabase.from("agent_tasks").update({ status: "superseded" }).eq("id", d.id);
  } catch (_) {}

  const flags = [];
  payouts.forEach(p => {
    const revenue = p.totalRevenue || 0;
    const feeAbs = Math.abs(p.fees || 0);
    const feeRate = revenue > 0 ? (feeAbs / revenue) * 100 : 0;
    const reasons = [];
    if (feeRate > 8) reasons.push(`fee rate ${feeRate.toFixed(1)}% (high)`);
    if ((p.closingBalance || 0) < -10) reasons.push(`owed Flipdish ${agentGbp(Math.abs(p.closingBalance))} (deducted next payout)`);
    if (Math.abs(p.chargebacks || 0) > 1) reasons.push(`chargebacks ${agentGbp(Math.abs(p.chargebacks))}`);
    if ((p.payoutAmount || 0) < 0) reasons.push(`negative payout ${agentGbp(p.payoutAmount)}`);
    if (reasons.length) flags.push({ account: p.accountName, payout: p.payoutAmount, revenue, fees: p.fees, reasons });
  });

  const totalPaid = +payouts.reduce((s, p) => s + (p.payoutAmount || 0), 0).toFixed(2);
  const totalFees = +payouts.reduce((s, p) => s + Math.abs(p.fees || 0), 0).toFixed(2);
  if (!flags.length) {
    // Nothing anomalous — post a light summary so you still see payouts landed.
    return createAgentTask({
      agent: "reconciliation", kind: "brief",
      title: `Payouts synced — ${payouts.length} payout(s), ${agentGbp(totalPaid)} net`,
      body: `${payouts.length} Flipdish payouts from ${start} to ${end}: ${agentGbp(totalPaid)} net paid, ${agentGbp(totalFees)} total fees. Nothing looks anomalous. Tap through to review by entity.`,
      severity: "info", payload: { summary: true, count: payouts.length, totalPaid, totalFees },
      createdBy: createdBy || "agent",
    });
  }
  flags.sort((a, b) => (b.reasons.length - a.reasons.length));
  const detail = flags.slice(0, 8).map(f => `${f.account}: ${f.reasons.join(", ")} (paid ${agentGbp(f.payout)})`).join("; ");
  const fallback = `Payout review ${start} to ${end}: ${flags.length} payout(s) worth a look. ${detail}.`;
  const body = await agentPhrase({
    system: "You write a short payout-review brief for a restaurant owner. These are Flipdish payouts with something worth checking (high fees, negative balances, chargebacks). Do NOT claim money is missing — just flag what to review. Do NOT invent numbers.",
    prompt: `Flipdish payouts worth reviewing: ${detail}. Total net paid across all payouts ${agentGbp(totalPaid)}, total fees ${agentGbp(totalFees)}. Write 3-4 sentences on what to check.`,
    fallback,
  });
  const task = await createAgentTask({
    agent: "reconciliation", kind: "brief",
    title: `Payout review — ${flags.length} payout(s) to check`,
    body, severity: "action",
    payload: { reconRows: flags.map(f => ({ account: f.account, revenue: f.revenue, fees: f.fees, paid: f.payout, reasons: f.reasons })), flags, totalPaid, totalFees },
    createdBy: createdBy || "agent",
  });
  await logAgentMetric({ agent: "reconciliation", taskId: task?.id, metric: "payouts_reviewed", value: totalPaid, note: `${payouts.length} payouts, ${flags.length} flagged` }).catch(() => {});
  return task;
}
export async function runReconciliationAssistant_DISABLED({ from, to, createdBy } = {}) {
  const end = to || new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const start = from || new Date(Date.now() - 9 * 864e5).toISOString().slice(0, 10); // ~1 week window
  const [sales, payouts, stores] = await Promise.all([
    fetchFlipdishSales({ from: start, to: end }).catch(() => []),
    fetchPayoutsForRecon({ from: start, to: end }).catch(() => []),
    fetchStores().catch(() => []),
  ]);
  const storeName = new Map((stores || []).map(s => [s.id, s.shortName || s.name]));

  // Aggregate SOLD per store/day (card/online only — exclude cash; count paid sales).
  const soldByKey = new Map();
  (sales || []).forEach(s => {
    const ch = String(s.channel || s.storefrontType || "").toLowerCase();
    if (ch.includes("cash")) return;
    const date = (s.businessDate || s.business_date || "").slice(0, 10);
    const storeId = s.storeId || s.store_id;
    if (!date || !storeId) return;
    const key = `${storeId}|${date}`;
    soldByKey.set(key, (soldByKey.get(key) || 0) + (Number(s.amountPaid ?? s.amount_paid ?? s.amountTotal ?? s.amount_total) || 0));
  });
  // Settled per store/day.
  const settledByKey = new Map();
  (payouts || []).forEach(p => { settledByKey.set(`${p.storeId || p.brandId}|${p.date}`, (settledByKey.get(`${p.storeId || p.brandId}|${p.date}`) || 0) + (Number(p.amount) || 0)); });

  // Gap per key. Flag where sold materially exceeds settled (money owed/missing).
  // Threshold: gap over £5 AND over 3% of the day's sales, to skip rounding noise.
  const gaps = [];
  soldByKey.forEach((sold, key) => {
    const settled = settledByKey.get(key) || 0;
    const gap = +(sold - settled).toFixed(2);
    if (gap > 5 && gap > sold * 0.03) {
      const [storeId, date] = key.split("|");
      gaps.push({ storeId, storeName: storeName.get(storeId) || storeId, date, sold: +sold.toFixed(2), settled: +settled.toFixed(2), gap });
    }
  });
  if (!gaps.length) return null;
  gaps.sort((a, b) => b.gap - a.gap);
  const totalGap = +gaps.reduce((s, g) => s + g.gap, 0).toFixed(2);
  const detail = gaps.slice(0, 8).map(g => `${g.storeName} ${g.date}: sold ${agentGbp(g.sold)}, settled ${agentGbp(g.settled)}, gap ${agentGbp(g.gap)}`).join("; ");
  const fallback = `Reconciliation ${start} to ${end}: ${gaps.length} day(s) where sales exceed settlement by more than expected, totalling ${agentGbp(totalGap)}. ${detail}.`;
  const body = await agentPhrase({
    system: "You write a short reconciliation brief for a restaurant owner. Explain that these are days where card/online sales exceed what was settled to the bank, which may mean delayed payouts, chargebacks, or missing money to chase. Do NOT invent numbers — use only those given.",
    prompt: `Reconciliation window ${start} to ${end}. Days where sales exceed settlement: ${detail}. Total gap ${agentGbp(totalGap)}. Write 3-5 sentences explaining what to check and prioritise.`,
    fallback,
  });
  const task = await createAgentTask({
    agent: "reconciliation", kind: "brief",
    title: `Reconciliation — ${gaps.length} day(s), ${agentGbp(totalGap)} to check`,
    body, severity: "action", payload: { from: start, to: end, gaps, totalGap },
    savings: totalGap, createdBy: createdBy || "agent",
  });
  // Measurement loop: log the total gap surfaced, so recovered money is trackable.
  await logAgentMetric({ agent: "reconciliation", taskId: task?.id, metric: "gap_surfaced", value: totalGap, note: `${start}..${end} ${gaps.length} days` }).catch(() => {});
  return task;
}

// ── PRESENCE CHECKS (PRESENCE_V1) — mid-shift location verification ──────────
// The presence-check-sweep pg_cron job randomly asks on-shift mobile staff
// (max 2 per shift, >=90 min apart, only staff with a push subscription) to
// confirm their location. The staff app polls fetchPendingPresenceCheck while
// a punch is open, captures GPS once on response, and records distance to the
// store. Results render on the punch's pay-breakdown timeline in T&A.
const mapPresenceCheck = (r) => ({
  id: r.id, punchId: r.punch_id, employeeId: r.employee_id, storeId: r.store_id,
  requestedAt: r.requested_at, expiresAt: r.expires_at, respondedAt: r.responded_at,
  latitude: r.latitude, longitude: r.longitude, accuracyM: r.accuracy_m,
  distanceM: r.distance_m, status: r.status,
});
export async function fetchPendingPresenceCheck(employeeId) {
  if (!employeeId) return null;
  const { data, error } = await supabase.from("presence_checks").select("*")
    .eq("employee_id", employeeId).eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("requested_at", { ascending: false }).limit(1);
  if (error) throw error;
  const r = (data || [])[0];
  return r ? mapPresenceCheck(r) : null;
}
export async function fetchPresenceChecks(punchId) {
  if (!punchId) return [];
  const { data, error } = await supabase.from("presence_checks").select("*")
    .eq("punch_id", punchId).order("requested_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(mapPresenceCheck);
}
export async function respondPresenceCheck({ id, latitude, longitude, accuracyM, distanceM, status }) {
  const { error } = await supabase.from("presence_checks").update({
    responded_at: new Date().toISOString(),
    latitude: latitude ?? null, longitude: longitude ?? null,
    accuracy_m: accuracyM ?? null, distance_m: distanceM ?? null,
    status: status || "ok",
  }).eq("id", id).eq("status", "pending");
  if (error) throw error;
}

// Manager-triggered location check (on-demand "where are you now?"). Inserts a
// pending check + a notification row — the notification webhook pushes it to
// the employee's phone; their response lands on the same presence_checks row.
export async function requestPresenceCheck({ punchId, employeeId, storeId }) {
  if (!punchId || !employeeId) throw new Error("Missing punch or employee.");
  const { error } = await supabase.from("presence_checks").insert({
    punch_id: punchId, employee_id: employeeId, store_id: storeId || null,
    expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
  });
  if (error) throw error;
  await insertNotifications([{
    recipientType: "ops", recipientId: employeeId, kind: "presence",
    title: "Location check 📍",
    body: "Please open the app and confirm your location within 10 minutes.",
    linkView: "ops-tasks",
  }]);
}

// ── VEHICLE TRACKING (DRIVER_TRACK_V1) — shift-bounded breadcrumbs ────────────
// Company-device Driver Mode streams positions ONLY while a punch is open
// (contractual, disclosed tracking of company vehicles). Rows carry the punch
// id so the trail is auditable per shift; a nightly cron purges old rows
// (data minimisation). Drivers are identified by department containing
// "driver" or "delivery".
const mapVehiclePos = (r) => ({
  id: r.id, punchId: r.punch_id, employeeId: r.employee_id, storeId: r.store_id,
  latitude: r.latitude, longitude: r.longitude, accuracyM: r.accuracy_m,
  speedMps: r.speed_mps, recordedAt: r.recorded_at,
});
export async function insertVehiclePosition({ punchId, employeeId, storeId, latitude, longitude, accuracyM, speedMps }) {
  if (!punchId || latitude == null || longitude == null) return;
  const { error } = await supabase.from("vehicle_positions").insert({
    punch_id: punchId, employee_id: employeeId || null, store_id: storeId || null,
    latitude, longitude, accuracy_m: accuracyM ?? null, speed_mps: speedMps ?? null,
  });
  if (error) throw error;
}
export async function fetchVehicleTrail(punchId, { limit = 500 } = {}) {
  if (!punchId) return [];
  const { data, error } = await supabase.from("vehicle_positions").select("*")
    .eq("punch_id", punchId).order("recorded_at", { ascending: true }).limit(limit);
  if (error) throw error;
  return (data || []).map(mapVehiclePos);
}

// ── ORDER RECORDINGS (ORDER_REC_V1) — voice record at table/till ─────────────
// Staff record the customer stating their order; a dispute is resolved by
// replaying the clip. Clips live in the PRIVATE order-recordings bucket
// (played back via short-lived signed URLs) and auto-purge after 30 days via
// cron — keep signage up: "orders may be recorded for accuracy".
const mapOrderRec = (r) => ({
  id: r.id, storeId: r.store_id, employeeId: r.employee_id, employeeName: r.employee_name,
  tableRef: r.table_ref, durationSecs: r.duration_secs, audioPath: r.audio_path,
  mimeType: r.mime_type, createdAt: r.created_at,
});
export async function uploadOrderRecording({ storeId, employeeId, employeeName, tableRef, durationSecs, blob, mimeType }) {
  if (!blob || !storeId) throw new Error("Nothing to save.");
  const ext = (mimeType || "").includes("mp4") ? "m4a" : "webm";
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  const path = `${storeId}/${day}/or-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("order-recordings")
    .upload(path, blob, { upsert: false, contentType: mimeType || "audio/webm" });
  if (upErr) throw upErr;
  const { error } = await supabase.from("order_recordings").insert({
    store_id: storeId, employee_id: employeeId || null, employee_name: employeeName || null,
    table_ref: tableRef || null, duration_secs: durationSecs ?? null,
    audio_path: path, mime_type: mimeType || "audio/webm",
  });
  if (error) throw error;
  return path;
}
export async function fetchOrderRecordings({ date, storeIds } = {}) {
  let q = supabase.from("order_recordings").select("*").order("created_at", { ascending: false }).limit(300);
  if (date) {
    const next = new Date(date + "T00:00:00"); next.setDate(next.getDate() + 1);
    const nextStr = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}-${String(next.getDate()).padStart(2,"0")}`;
    q = q.gte("created_at", date + "T00:00:00").lt("created_at", nextStr + "T00:00:00");
  }
  if (storeIds && storeIds.length) q = q.in("store_id", storeIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapOrderRec);
}
export async function getOrderRecordingUrl(path) {
  const { data, error } = await supabase.storage.from("order-recordings").createSignedUrl(path, 3600);
  if (error) throw error;
  return data?.signedUrl;
}

// ── SMALLWARE / ASSET INVENTORY (SMALLWARE_V1) ───────────────────────────────
// Per-store counted assets (crockery, cutlery, glassware, tablets, headsets…).
// Items belong to a category and a store, carry a current + minimum stock and an
// optional photo. Staff REPORT breakages (pending); a manager APPROVES, which
// atomically reduces the count and logs the movement. Managers also do counts
// (recount sets an absolute figure, logged as an adjustment).
//   smallware_categories(id, name, sort)
//   smallware_items(id, store_id, brand_id, category_id, name, description,
//                   current_stock, min_stock, photo_url, archived_at)
//   smallware_movements(id, item_id, store_id, kind, qty_delta, reason,
//                       status, reported_by, approved_by, created_at, resolved_at)
//     kind: "breakage" | "count" | "add" | "adjust"
//     status: "pending" | "approved" | "rejected" (counts/adds are auto-approved)

const mapSwCategory = (r) => ({ id: r.id, name: r.name, sort: r.sort ?? 0, parentId: r.parent_id || null });
const mapSwItem = (r) => ({
  id: r.id, storeId: r.store_id, brandId: r.brand_id, categoryId: r.category_id,
  name: r.name, description: r.description, currentStock: Number(r.current_stock) || 0,
  minStock: Number(r.min_stock) || 0, photoUrl: r.photo_url, archivedAt: r.archived_at,
});
const mapSwMovement = (r) => ({
  id: r.id, itemId: r.item_id, storeId: r.store_id, kind: r.kind,
  qtyDelta: Number(r.qty_delta) || 0, reason: r.reason, status: r.status,
  reportedBy: r.reported_by, approvedBy: r.approved_by,
  createdAt: r.created_at, resolvedAt: r.resolved_at,
});

export async function fetchSmallwareCategories() {
  const { data, error } = await supabase.from("smallware_categories").select("*").order("sort").order("name");
  if (error) throw error;
  return (data || []).map(mapSwCategory);
}
export async function upsertSmallwareCategory(cat) {
  const row = { id: cat.id || `swc-${Date.now()}`, name: cat.name, sort: cat.sort ?? 0, parent_id: cat.parentId || null };
  const { data, error } = await supabase.from("smallware_categories").upsert(row, { onConflict: "id" }).select().single();
  if (error) throw error;
  return mapSwCategory(data);
}
export async function deleteSmallwareCategory(id) {
  const { error } = await supabase.from("smallware_categories").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchSmallwareItems(storeIds = null) {
  let q = supabase.from("smallware_items").select("*").is("archived_at", null).order("name");
  if (storeIds && storeIds.length) q = q.in("store_id", storeIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapSwItem);
}
export async function upsertSmallwareItem(item) {
  const row = {
    id: item.id || `swi-${Date.now()}`,
    store_id: item.storeId, brand_id: item.brandId || null, category_id: item.categoryId || null,
    name: item.name, description: item.description || "",
    current_stock: item.currentStock ?? 0, min_stock: item.minStock ?? 0,
    photo_url: item.photoUrl || null, archived_at: item.archivedAt || null,
  };
  const { data, error } = await supabase.from("smallware_items").upsert(row, { onConflict: "id" }).select().single();
  if (error) throw error;
  return mapSwItem(data);
}
export async function archiveSmallwareItem(id) {
  const { error } = await supabase.from("smallware_items").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
export async function uploadSmallwarePhoto(file) {
  const ext = (file.name && file.name.includes(".")) ? file.name.split(".").pop().toLowerCase() : "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const { error } = await supabase.storage.from("smallware-photos").upload(filename, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("smallware-photos").getPublicUrl(filename);
  return data.publicUrl;
}

export async function fetchSmallwareMovements({ storeIds = null, status = null, itemId = null, limit = 200 } = {}) {
  let q = supabase.from("smallware_movements").select("*").order("created_at", { ascending: false }).limit(limit);
  if (storeIds && storeIds.length) q = q.in("store_id", storeIds);
  if (status) q = q.eq("status", status);
  if (itemId) q = q.eq("item_id", itemId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapSwMovement);
}

// Staff report a breakage — logged as PENDING, count unchanged until approved.
export async function reportSmallwareBreakage({ itemId, storeId, qty, reason, reportedBy }) {
  const n = Math.abs(Math.round(Number(qty) || 0));
  if (!(n > 0)) throw new Error("Breakage quantity must be at least 1.");
  const row = {
    id: `swm-${Date.now()}`, item_id: itemId, store_id: storeId, kind: "breakage",
    qty_delta: -n, reason: reason || "", status: "pending", reported_by: reportedBy || "Staff",
  };
  const { data, error } = await supabase.from("smallware_movements").insert(row).select().single();
  if (error) throw error;
  return mapSwMovement(data);
}

// Manager approves a pending breakage — atomically reduce the item count (never
// below 0) and mark the movement approved. Re-reads the item to avoid races.
export async function approveSmallwareBreakage(movementId, approvedBy) {
  const { data: mv, error: e1 } = await supabase.from("smallware_movements").select("*").eq("id", movementId).single();
  if (e1) throw e1;
  if (!mv || mv.status !== "pending") throw new Error("This breakage has already been resolved.");
  const { data: item, error: e2 } = await supabase.from("smallware_items").select("current_stock").eq("id", mv.item_id).single();
  if (e2) throw e2;
  const newStock = Math.max(0, (Number(item.current_stock) || 0) + Number(mv.qty_delta));
  const { error: e3 } = await supabase.from("smallware_items").update({ current_stock: newStock }).eq("id", mv.item_id);
  if (e3) throw e3;
  const { data, error: e4 } = await supabase.from("smallware_movements")
    .update({ status: "approved", approved_by: approvedBy || "Manager", resolved_at: new Date().toISOString() })
    .eq("id", movementId).select().single();
  if (e4) throw e4;
  return mapSwMovement(data);
}
export async function rejectSmallwareBreakage(movementId, approvedBy) {
  const { data, error } = await supabase.from("smallware_movements")
    .update({ status: "rejected", approved_by: approvedBy || "Manager", resolved_at: new Date().toISOString() })
    .eq("id", movementId).eq("status", "pending").select().single();
  if (error) throw error;
  return mapSwMovement(data);
}

// Manager sets an absolute counted figure — logs the delta as an approved
// "count" movement and writes the new stock. This is the periodic recount.
export async function recountSmallwareItem({ itemId, storeId, newCount, countedBy }) {
  const n = Math.max(0, Math.round(Number(newCount) || 0));
  const { data: item, error: e1 } = await supabase.from("smallware_items").select("current_stock").eq("id", itemId).single();
  if (e1) throw e1;
  const delta = n - (Number(item.current_stock) || 0);
  const { error: e2 } = await supabase.from("smallware_items").update({ current_stock: n }).eq("id", itemId);
  if (e2) throw e2;
  if (delta !== 0) {
    await supabase.from("smallware_movements").insert({
      id: `swm-${Date.now()}`, item_id: itemId, store_id: storeId, kind: "count",
      qty_delta: delta, reason: "Recount", status: "approved",
      reported_by: countedBy || "Manager", approved_by: countedBy || "Manager",
      resolved_at: new Date().toISOString(),
    });
  }
  return n;
}

// ── PACKAGING ORDER FULFILMENT (PACKORDER_V1) ────────────────────────────────
// Long-lead procurement of packaging from Distribution. An order has:
//   • line items  — product + quantity + quoted unit price, linked to a
//                    dist_items row so receipts land in distribution inventory.
//   • shipments   — partial or full dispatches; each carries specific line
//                    quantities and its own stage (sea/air/received…), so stock
//                    can sit split between supplier facility and destination.
//   • payments    — many per order, tracked against the quoted total.
// Marking a shipment "received" posts an idempotent receipt movement per line
// into dist_stock_movements, updating distribution inventory automatically.
//
//   packaging_orders(id, ref, supplier, brand_id, stage, quoted_total,
//                    currency, notes, order_date, expected_date, created_at)
//   packaging_order_lines(id, order_id, dist_item_id, name, spec, qty,
//                         unit_price, notes)
//   packaging_shipments(id, order_id, ref, method, stage, qty_json,
//                       shipped_date, eta_date, received_date, received_at,
//                       notes, created_at)   -- qty_json: {lineId: qty}
//   packaging_payments(id, order_id, amount, currency, paid_date, method,
//                      reference, notes, created_at)
//
// ORDER stages: design | design_approval | quotation | order_placed |
//               in_production | ready | partially_shipped | shipped |
//               partially_received | received | closed | cancelled
// SHIPMENT stages: at_supplier | shipped_sea | shipped_air | at_destination |
//                  received

export const PACKORDER_STAGES = [
  { key: "design",           label: "Design" },
  { key: "design_approval",  label: "Design Approval" },
  { key: "quotation",        label: "Quotation" },
  { key: "order_placed",     label: "Order Placed" },
  { key: "in_production",    label: "In Production" },
  { key: "ready",            label: "Order Ready" },
  { key: "partially_shipped",label: "Partially Shipped" },
  { key: "shipped",          label: "Shipped" },
  { key: "partially_received",label: "Partially Received" },
  { key: "received",         label: "Received" },
  { key: "closed",           label: "Closed" },
  { key: "cancelled",        label: "Cancelled" },
];
export const PACKSHIP_STAGES = [
  { key: "at_supplier",    label: "At Supplier Facility" },
  { key: "shipped_sea",    label: "Shipped (Sea)" },
  { key: "shipped_air",    label: "Shipped (Air)" },
  { key: "at_destination", label: "At Destination" },
  { key: "received",       label: "Received at Facility" },
];

const mapPackOrder = (r) => ({
  id: r.id, ref: r.ref, supplier: r.supplier, brandId: r.brand_id, stage: r.stage,
  quotedTotal: Number(r.quoted_total) || 0, currency: r.currency || "GBP", notes: r.notes,
  orderDate: r.order_date, expectedDate: r.expected_date, createdAt: r.created_at,
});
const mapPackLine = (r) => ({
  id: r.id, orderId: r.order_id, distItemId: r.dist_item_id, name: r.name, spec: r.spec,
  qty: Number(r.qty) || 0, unitPrice: Number(r.unit_price) || 0, notes: r.notes,
});
const mapPackShipment = (r) => ({
  id: r.id, orderId: r.order_id, ref: r.ref, method: r.method, stage: r.stage,
  qtyByLine: r.qty_json || {}, shippedDate: r.shipped_date, etaDate: r.eta_date,
  receivedDate: r.received_date, receivedAt: r.received_at, notes: r.notes, createdAt: r.created_at,
});
const mapPackPayment = (r) => ({
  id: r.id, orderId: r.order_id, amount: Number(r.amount) || 0, currency: r.currency || "GBP",
  paidDate: r.paid_date, method: r.method, reference: r.reference, notes: r.notes, createdAt: r.created_at,
});

export async function fetchPackagingOrders({ brandId } = {}) {
  let q = supabase.from("packaging_orders").select("*").order("created_at", { ascending: false });
  if (brandId) q = q.eq("brand_id", brandId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapPackOrder);
}
export async function fetchPackagingOrderDetail(orderId) {
  const [o, lines, ships, pays] = await Promise.all([
    supabase.from("packaging_orders").select("*").eq("id", orderId).single(),
    supabase.from("packaging_order_lines").select("*").eq("order_id", orderId).order("created_at"),
    supabase.from("packaging_shipments").select("*").eq("order_id", orderId).order("created_at"),
    supabase.from("packaging_payments").select("*").eq("order_id", orderId).order("paid_date"),
  ]);
  if (o.error) throw o.error;
  return {
    order: mapPackOrder(o.data),
    lines: (lines.data || []).map(mapPackLine),
    shipments: (ships.data || []).map(mapPackShipment),
    payments: (pays.data || []).map(mapPackPayment),
  };
}
export async function upsertPackagingOrder(order) {
  const row = {
    id: order.id || `po-${Date.now()}`, ref: order.ref || null, supplier: order.supplier || "",
    brand_id: order.brandId || null, stage: order.stage || "design",
    quoted_total: order.quotedTotal ?? 0, currency: order.currency || "GBP", notes: order.notes || "",
    order_date: order.orderDate || null, expected_date: order.expectedDate || null,
  };
  const { data, error } = await supabase.from("packaging_orders").upsert(row, { onConflict: "id" }).select().single();
  if (error) throw error;
  return mapPackOrder(data);
}
export async function deletePackagingOrder(orderId) {
  // Cascade children first (no FK cascade assumed).
  await supabase.from("packaging_payments").delete().eq("order_id", orderId);
  await supabase.from("packaging_shipments").delete().eq("order_id", orderId);
  await supabase.from("packaging_order_lines").delete().eq("order_id", orderId);
  const { error } = await supabase.from("packaging_orders").delete().eq("id", orderId);
  if (error) throw error;
}

export async function upsertPackagingLine(line) {
  const row = {
    id: line.id || `pol-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    order_id: line.orderId, dist_item_id: line.distItemId || null, name: line.name || "",
    spec: line.spec || "", qty: line.qty ?? 0, unit_price: line.unitPrice ?? 0, notes: line.notes || "",
  };
  const { data, error } = await supabase.from("packaging_order_lines").upsert(row, { onConflict: "id" }).select().single();
  if (error) throw error;
  return mapPackLine(data);
}
export async function deletePackagingLine(id) {
  const { error } = await supabase.from("packaging_order_lines").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertPackagingShipment(ship) {
  const row = {
    id: ship.id || `pos-${Date.now()}`, order_id: ship.orderId, ref: ship.ref || null,
    method: ship.method || "sea", stage: ship.stage || "at_supplier",
    qty_json: ship.qtyByLine || {}, shipped_date: ship.shippedDate || null,
    eta_date: ship.etaDate || null, received_date: ship.receivedDate || null,
    received_at: ship.receivedAt || null, notes: ship.notes || "",
  };
  const { data, error } = await supabase.from("packaging_shipments").upsert(row, { onConflict: "id" }).select().single();
  if (error) throw error;
  return mapPackShipment(data);
}
export async function deletePackagingShipment(id) {
  const { error } = await supabase.from("packaging_shipments").delete().eq("id", id);
  if (error) throw error;
}

// Mark a shipment received: set its stage/received_date, then post an idempotent
// receipt movement per line into distribution inventory. Idempotency via
// source_ref = packorder:{shipmentId}:{lineId}, so re-marking never doubles stock.
export async function receivePackagingShipment({ shipmentId, receivedBy }) {
  const { data: sh, error: e1 } = await supabase.from("packaging_shipments").select("*").eq("id", shipmentId).single();
  if (e1) throw e1;
  const { data: lines, error: e2 } = await supabase.from("packaging_order_lines").select("*").eq("order_id", sh.order_id);
  if (e2) throw e2;
  const qtyByLine = sh.qty_json || {};
  const posted = [];
  for (const line of (lines || [])) {
    const qty = Number(qtyByLine[line.id]) || 0;
    if (qty > 0 && line.dist_item_id) {
      try {
        // Idempotency: skip if this line's receipt movement already exists.
        const ref = `packorder:${shipmentId}:${line.id}`;
        const { data: existing } = await supabase.from("dist_stock_movements").select("id").eq("source_ref", ref).limit(1);
        if (existing && existing.length) { posted.push({ lineId: line.id, itemId: line.dist_item_id, qty, skipped: true }); continue; }
        // Movements require a batch. Create one per received line, using the
        // line's unit price as landed cost so packaging costing carries through.
        const batch = await createDistBatch({
          itemId: line.dist_item_id, batchNo: `PKG-${sh.ref || shipmentId}`,
          landedCost: Number(line.unit_price) || 0, costMethod: "receipt", sourceKind: "packaging_order",
        });
        const mv = await addDistMovement({
          itemId: line.dist_item_id, batchId: batch ? batch.id : null, qty, type: "receipt",
          sourceKind: "packaging_order", sourceRef: ref, createdBy: receivedBy || "System",
        });
        if (mv) posted.push({ lineId: line.id, itemId: line.dist_item_id, qty });
      } catch (e) { /* one line failing shouldn't block the rest */ }
    }
  }
  const { data, error } = await supabase.from("packaging_shipments")
    .update({ stage: "received", received_date: new Date().toISOString().slice(0,10), received_at: new Date().toISOString() })
    .eq("id", shipmentId).select().single();
  if (error) throw error;
  return { shipment: mapPackShipment(data), posted };
}

export async function addPackagingPayment(pay) {
  const row = {
    id: pay.id || `pop-${Date.now()}`, order_id: pay.orderId, amount: pay.amount ?? 0,
    currency: pay.currency || "GBP", paid_date: pay.paidDate || new Date().toISOString().slice(0,10),
    method: pay.method || "", reference: pay.reference || "", notes: pay.notes || "",
  };
  const { data, error } = await supabase.from("packaging_payments").insert(row).select().single();
  if (error) throw error;
  return mapPackPayment(data);
}
export async function deletePackagingPayment(id) {
  const { error } = await supabase.from("packaging_payments").delete().eq("id", id);
  if (error) throw error;
}

// Per-line stage rollup: for each line, how much is ordered vs allocated to
// shipments in each stage bucket (at supplier / in transit / received).
export function computePackLineStatus(lines, shipments) {
  const inTransitStages = new Set(["shipped_sea", "shipped_air", "at_destination"]);
  return (lines || []).map(line => {
    let received = 0, inTransit = 0, atSupplier = 0, shippedTotal = 0;
    (shipments || []).forEach(sh => {
      const q = Number((sh.qtyByLine || {})[line.id]) || 0;
      if (q <= 0) return;
      if (sh.stage === "received") { received += q; shippedTotal += q; }
      else if (inTransitStages.has(sh.stage)) { inTransit += q; shippedTotal += q; }
      else if (sh.stage === "at_supplier") { atSupplier += q; }
    });
    const notYetShipped = Math.max(0, (Number(line.qty) || 0) - shippedTotal - atSupplier);
    return { line, ordered: Number(line.qty) || 0, received, inTransit, atSupplier, notYetShipped };
  });
}

// PACKORDER dashboard aggregate — comprehensive supply-chain visibility.
// Rolls every line of every order up by stage (units AND value), attaches live
// distribution on-hand stock + coverage, flags risk (overdue ETAs, unlinked
// lines, payment gaps), and summarises by supplier and by order.
export async function fetchPackagingDashboard({ includeClosed = false } = {}) {
  const orders = await fetchPackagingOrders();
  const active = includeClosed ? orders : orders.filter(o => o.stage !== "closed" && o.stage !== "cancelled");
  const [onHand, distItems] = await Promise.all([computeDistOnHand(), fetchDistItems().catch(() => [])]);
  const details = await Promise.all(active.map(o => fetchPackagingOrderDetail(o.id).catch(() => null)));
  const itemName = new Map(distItems.map(i => [i.id, i.name]));
  const itemReorder = new Map(distItems.map(i => [i.id, i.reorderPoint != null ? Number(i.reorderPoint) : 0]));
  const inTransitStages = new Set(["shipped_sea", "shipped_air", "at_destination"]);
  const today = new Date().toISOString().slice(0, 10);

  const byItem = new Map();
  const bySupplier = new Map();
  const orderRows = [];
  let quotedTotal = 0, paidTotal = 0;
  const stageUnits = {}; // stageKey -> units (order-level stage bucket by value)
  const stageValue = {};
  const stageCounts = {};

  details.forEach((d, idx) => {
    if (!d) return;
    const o = active[idx];
    const status = computePackLineStatus(d.lines, d.shipments);
    const orderPaid = d.payments.reduce((a, p) => a + p.amount, 0);
    const orderLinesValue = d.lines.reduce((a, l) => a + l.qty * l.unitPrice, 0);
    quotedTotal += o.quotedTotal || 0;
    paidTotal += orderPaid;
    stageCounts[o.stage] = (stageCounts[o.stage] || 0) + 1;
    stageValue[o.stage] = (stageValue[o.stage] || 0) + (o.quotedTotal || 0);

    // per-order rollup for the order table + risk flags
    let ordUnits = 0, ordReceived = 0, ordInTransit = 0, ordAtSupplier = 0, ordNotShipped = 0, unlinked = 0;
    status.forEach(st => {
      ordUnits += st.ordered; ordReceived += st.received; ordInTransit += st.inTransit;
      ordAtSupplier += st.atSupplier; ordNotShipped += st.notYetShipped;
      if (!st.line.distItemId) unlinked++;
      const key = st.line.distItemId || `unlinked:${o.id}:${st.line.id}`;
      if (!byItem.has(key)) byItem.set(key, {
        distItemId: st.line.distItemId || null,
        name: st.line.distItemId ? (itemName.get(st.line.distItemId) || st.line.name) : st.line.name,
        linked: !!st.line.distItemId, ordered: 0, atSupplier: 0, inTransit: 0,
        receivedViaOrders: 0, notYetShipped: 0, value: 0, orderRefs: new Set(),
      });
      const row = byItem.get(key);
      row.ordered += st.ordered; row.atSupplier += st.atSupplier; row.inTransit += st.inTransit;
      row.receivedViaOrders += st.received; row.notYetShipped += st.notYetShipped;
      row.value += st.line.qty * st.line.unitPrice;
      row.orderRefs.add(o.ref || o.id);
    });

    // supplier rollup
    const sup = o.supplier || "Unknown supplier";
    if (!bySupplier.has(sup)) bySupplier.set(sup, { supplier: sup, orders: 0, quoted: 0, paid: 0, units: 0, received: 0 });
    const sr = bySupplier.get(sup);
    sr.orders++; sr.quoted += o.quotedTotal || 0; sr.paid += orderPaid; sr.units += ordUnits; sr.received += ordReceived;

    // risk flags
    const overdue = o.expectedDate && o.expectedDate < today && !["received","closed","cancelled"].includes(o.stage);
    const paymentGap = (o.quotedTotal || 0) - orderPaid;
    orderRows.push({
      id: o.id, ref: o.ref, supplier: o.supplier, stage: o.stage,
      quotedTotal: o.quotedTotal || 0, paid: orderPaid, outstanding: paymentGap,
      orderDate: o.orderDate, expectedDate: o.expectedDate, overdue,
      units: ordUnits, received: ordReceived, inTransit: ordInTransit,
      atSupplier: ordAtSupplier, notShipped: ordNotShipped,
      pctReceived: ordUnits > 0 ? Math.round((ordReceived / ordUnits) * 100) : 0,
      unlinked, lineCount: d.lines.length, shipmentCount: d.shipments.length,
    });
  });

  const items = [...byItem.values()].map(r => {
    const oh = r.distItemId ? (onHand.get(r.distItemId) || 0) : null;
    const incoming = r.atSupplier + r.inTransit + r.notYetShipped;
    const reorderPoint = r.distItemId ? (itemReorder.get(r.distItemId) || 0) : 0;
    // Reorder signal: compare stock to the reorder point, but credit what's
    // already on the way — you only need to place a NEW order if neither on-hand
    // nor incoming covers the reorder point.
    //   order_now  : at/below reorder point AND nothing inbound to cover it
    //   inbound_ok : at/below reorder point but incoming will cover it
    //   ok         : above reorder point
    //   no_threshold: reorder point not set (can't advise)
    let reorderStatus = "no_threshold";
    if (oh != null && reorderPoint > 0) {
      if (oh > reorderPoint) reorderStatus = "ok";
      else if (oh + incoming > reorderPoint) reorderStatus = "inbound_ok";
      else reorderStatus = "order_now";
    }
    return {
      ...r, orderRefs: [...r.orderRefs], onHand: oh, incoming, reorderPoint, reorderStatus,
      projected: oh == null ? null : oh + incoming, // stock once everything lands
    };
  }).sort((a, b) => {
    // Reorder-critical items float to the top, then by incoming volume.
    const rank = { order_now: 0, inbound_ok: 1, ok: 2, no_threshold: 3 };
    return (rank[a.reorderStatus] - rank[b.reorderStatus]) || (b.incoming - a.incoming) || a.name.localeCompare(b.name);
  });

  const totals = items.reduce((t, r) => ({
    ordered: t.ordered + r.ordered, atSupplier: t.atSupplier + r.atSupplier,
    inTransit: t.inTransit + r.inTransit, received: t.received + r.receivedViaOrders,
    notYetShipped: t.notYetShipped + r.notYetShipped, value: t.value + r.value,
  }), { ordered: 0, atSupplier: 0, inTransit: 0, received: 0, notYetShipped: 0, value: 0 });

  // ── EXCEPTIONS ("action list") — the prioritised things needing attention,
  //    ranked by severity then financial impact. This is the top-of-dashboard
  //    decision accelerator: red = breached, amber = at risk.
  const exceptions = [];
  const dayMs = 86400000;
  const nowT = Date.now();
  // Shipment-level ETA risk across all active orders.
  const shipmentsFlat = [];
  details.forEach((d, idx) => {
    if (!d) return;
    const o = active[idx];
    d.shipments.forEach(sh => {
      const units = Object.values(sh.qtyByLine || {}).reduce((a, q) => a + (Number(q) || 0), 0);
      const inTransit = ["shipped_sea", "shipped_air", "at_destination"].includes(sh.stage);
      let etaRisk = null;
      if (inTransit && sh.etaDate) {
        const daysToEta = Math.round((new Date(sh.etaDate).getTime() - nowT) / dayMs);
        if (daysToEta < 0) etaRisk = { level: "red", label: `ETA passed ${Math.abs(daysToEta)}d ago`, days: daysToEta };
        else if (daysToEta <= 7) etaRisk = { level: "amber", label: `arriving in ${daysToEta}d`, days: daysToEta };
      }
      shipmentsFlat.push({ orderId: o.id, orderRef: o.ref, supplier: o.supplier, stage: sh.stage, method: sh.method, ref: sh.ref, units, etaDate: sh.etaDate, etaRisk });
      if (etaRisk && etaRisk.level === "red") {
        exceptions.push({ level: "red", kind: "shipment_late", orderId: o.id,
          title: `${sh.ref || "Shipment"} on ${o.ref || "order"} is overdue`,
          detail: `${units.toLocaleString()} units · ETA was ${sh.etaDate} · ${o.supplier || "supplier"}`,
          weight: units });
      }
    });
  });
  // Order-level: overdue expected date.
  orderRows.filter(o => o.overdue).forEach(o => exceptions.push({
    level: "red", kind: "order_overdue", orderId: o.id,
    title: `${o.ref || "Order"} is past its expected date`,
    detail: `expected ${o.expectedDate} · ${o.units.toLocaleString()} units · ${o.pctReceived}% received`,
    weight: o.quotedTotal }));
  // Item-level: stockout risk — 0 (or below) on hand while units still upstream.
  items.filter(r => r.linked && r.onHand != null && r.onHand <= 0 && r.incoming > 0).forEach(r => exceptions.push({
    level: r.inTransit > 0 ? "amber" : "red", kind: "stockout_risk", itemId: r.distItemId,
    title: `${r.name}: out of stock, ${r.incoming.toLocaleString()} incoming`,
    detail: r.inTransit > 0 ? `${r.inTransit.toLocaleString()} in transit — watch coverage` : `nothing in transit — ${(r.atSupplier + r.notYetShipped).toLocaleString()} still at supplier/unshipped`,
    weight: r.value }));
  // Item-level: reorder needed — at/below reorder point with nothing inbound to
  // cover it (and not already caught by the stock-out rule above).
  items.filter(r => r.reorderStatus === "order_now" && r.onHand > 0).forEach(r => exceptions.push({
    level: "amber", kind: "reorder_now", itemId: r.distItemId,
    title: `${r.name}: time to reorder`,
    detail: `${r.onHand.toLocaleString()} on hand · reorder point ${r.reorderPoint.toLocaleString()} · nothing inbound`,
    weight: r.reorderPoint }));
  // Payment: large outstanding balance on orders already received.
  orderRows.filter(o => o.outstanding > 0.01 && ["received","partially_received"].includes(o.stage)).forEach(o => exceptions.push({
    level: "amber", kind: "payment_due", orderId: o.id,
    title: `${o.ref || "Order"}: ${o.pctReceived}% received but balance owing`,
    detail: `outstanding ${(o.outstanding).toFixed(2)} to ${o.supplier || "supplier"}`,
    weight: o.outstanding }));
  const sevRank = { red: 0, amber: 1 };
  exceptions.sort((a, b) => (sevRank[a.level] - sevRank[b.level]) || (b.weight - a.weight));

  return {
    items,
    totals,
    orders: orderRows.sort((a, b) => (b.overdue - a.overdue) || (a.expectedDate || "").localeCompare(b.expectedDate || "")),
    shipments: shipmentsFlat,
    suppliers: [...bySupplier.values()].sort((a, b) => b.quoted - a.quoted),
    stageCounts, stageValue,
    orderCount: active.length,
    exceptions,
    finance: { quotedTotal, paidTotal, outstanding: quotedTotal - paidTotal },
    risk: {
      overdue: orderRows.filter(o => o.overdue).length,
      unlinkedLines: orderRows.reduce((a, o) => a + o.unlinked, 0),
      unpaidOrders: orderRows.filter(o => o.outstanding > 0.01).length,
      redCount: exceptions.filter(e => e.level === "red").length,
      amberCount: exceptions.filter(e => e.level === "amber").length,
    },
  };
}

// ORDER PAGE BUILDER: fetch every collection with its ordered item ids, so the
// builder can render department → collection → items and drag to reorder.
export async function fetchDistCollectionsWithItems() {
  const [collections, links, items] = await Promise.all([
    fetchDistCollections({ includeInactive: true }).catch(() => []),
    supabase.from("dist_collection_items").select("collection_id, item_id, sort_order").then(r => r.data || []),
    fetchDistItems().catch(() => []),
  ]);
  const itemById = new Map(items.map(i => [i.id, i]));
  const byColl = new Map(collections.map(c => [c.id, []]));
  links.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).forEach(l => {
    if (byColl.has(l.collection_id) && itemById.has(l.item_id)) byColl.get(l.collection_id).push(l.item_id);
  });
  return { collections, itemsByCollection: Object.fromEntries(byColl), items };
}

// ORDER FULFILMENT QUEUE BY ITEM TYPE — for the CK entity (ck items) and the
// Finance/driver entity (fresh produce). Returns OPEN orders that contain at
// least one line of the given item type, with ONLY those lines (so CK staff /
// drivers see exactly what they must prepare or buy per order, no other items).
export async function fetchDistOrdersByItemType(itemType, { includeDone = false } = {}) {
  const openStatuses = includeDone
    ? ["confirmed", "picking", "dispatched", "invoiced"]
    : ["confirmed", "picking"]; // not yet dispatched = still to fulfil
  const [orders, items, customers, board] = await Promise.all([
    fetchDistSalesOrders({ status: openStatuses }).catch(() => []),
    fetchDistItems({ includeInactive: true }).catch(() => []),
    fetchDistContacts({ kind: "customer" }).catch(() => []),
    fetchDistFulfilmentBoard().catch(() => []),
  ]);
  const checks = await fetchDistFulfilChecks(orders.map(o => o.id)).catch(() => new Set());
  const itemById = new Map(items.map(i => [i.id, i]));
  const custById = new Map(customers.map(c => [c.id, c]));
  const stageBySo = new Map(board.map(b => [b.soId, b.stage]));
  const effType = (i) => (i && (i.itemType || (i.ckProductId ? "ck" : "warehouse"))) || "warehouse";

  const out = [];
  for (const so of orders) {
    const matchLines = (so.lines || [])
      // Channel-aware: the fresh list shows lines whose RESOLVED channel is
      // fresh (item-type default or explicit override); other typed views show
      // their native type minus anything detached or diverted to the fresh shop.
      .filter(l => {
        const t = effType(itemById.get(l.itemId));
        const ch = l.fulfilChannel || (t === "fresh" ? "fresh" : "warehouse");
        if (itemType === "fresh") return ch === "fresh";
        return t === itemType && ch !== "detached" && ch !== "fresh";
      })
      .map(l => {
        const it = itemById.get(l.itemId);
        return { itemId: l.itemId, name: it?.name || l.itemId, sku: it?.sku || "", category: it?.category || "", qty: l.qty, uom: l.uom || null, packUnit: it?.packUnit, packSize: it?.packSize != null ? Number(it.packSize) : null, packCount: it?.packCount != null ? Number(it.packCount) : null || "" };
      });
    if (!matchLines.length) continue; // order has none of this type — skip
    const withDone = matchLines.map(l => ({ ...l, done: checks.has(`${so.id}:${l.itemId}`), bought: (checks.bought || {})[`${so.id}:${l.itemId}`] || null, doneAt: (checks.doneAt || {})[`${so.id}:${l.itemId}`] || null }));
    // Fulfilled date = when the LAST line of this order was ticked bought.
    const doneStamps = withDone.map(l => l.doneAt).filter(Boolean).sort();
    const fulfilledAt = withDone.length && withDone.every(l => l.done) && doneStamps.length ? doneStamps[doneStamps.length - 1] : null;
    const cust = custById.get(so.customerId);
    out.push({
      soId: so.id, soNumber: so.soNumber, orderDate: so.orderDate, wantedDate: so.expectedShip || so.orderDate || null, fulfilledAt,
      customerId: so.customerId, customerName: cust?.displayName || cust?.companyName || "—",
      storeId: cust?.storeId || null,
      stage: stageBySo.get(so.id) || so.status || "confirmed",
      lines: withDone,
      allDone: withDone.length > 0 && withDone.every(l => l.done),
      totalUnits: matchLines.reduce((s, l) => s + (Number(l.qty) || 0), 0),
    });
  }
  // Oldest orders first (most urgent to fulfil).
  out.sort((a, b) => String(a.orderDate || "").localeCompare(String(b.orderDate || "")));
  return out;
}

// ── FULFILMENT CHECK-OFF (per order-line) ───────────────────────────────────
// Presence of a (so_id,item_id) row = that line is marked ready/done.
export async function fetchDistFulfilChecks(soIds = []) {
  if (!soIds.length) { const st = new Set(); st.bought = {}; return st; }
  const { data, error } = await supabase.from("dist_fulfil_checks").select("so_id, item_id, bought_qty, bought_uom, done_at").in("so_id", soIds);
  if (error) throw error;
  const st = new Set((data || []).map(r => `${r.so_id}:${r.item_id}`));
  st.bought = {};   // "soId:itemId" -> { qty, uom } where the driver recorded actuals
  st.doneAt = {};   // "soId:itemId" -> when it was ticked bought (the fulfilment date)
  (data || []).forEach(r => {
    if (r.bought_qty != null || r.bought_uom) st.bought[`${r.so_id}:${r.item_id}`] = { qty: r.bought_qty != null ? Number(r.bought_qty) : null, uom: r.bought_uom || null };
    if (r.done_at) st.doneAt[`${r.so_id}:${r.item_id}`] = r.done_at;
  });
  return st;
}
// Mark or unmark a single order-line.
// ── ORDER AMENDMENTS: store proposes changes, Distribution approves ──────────
// A placed order can be reopened by the store while it hasn't been picked.
// The proposal (a FULL replacement line set) sits pending; Dist approves
// (lines swapped) or rejects (original stands). One pending per order.

// ── CK LABEL QUEUE: jobs the mC-Print3 pulls via CloudPRNT ──────────────────
export async function enqueueCkLabelJob(run, copies, user) {
  const { error } = await supabase.from("ck_label_jobs").insert({
    status: "queued",
    payload: {
      productName: run.productName, batchNo: run.finishedBatchNo,
      useBy: run.useByDate || null, madeDate: run.runDate,
      qty: run.producedQty, unit: run.outputUnit || "",
      allergens: run.allergens || [], copies: Math.max(1, Number(copies) || 1),
      brand: "Create Brands",
    },
    created_by: user?.name || user?.id || null,
  });
  if (error) throw error;
  return true;
}

// AUTO-PRINT: fire-and-forget warehouse ticket for a confirmed SO. Fetches
// the minimal data itself; never blocks or fails the business operation.
export async function autoPrintSoTicket(soId) {
  try {
    const { data: so } = await supabase.from("dist_sales_orders").select("*, dist_sales_order_lines(*)").eq("id", soId).single();
    if (!so) return;
    const [{ data: cust }, { data: items }] = await Promise.all([
      so.customer_id ? supabase.from("dist_contacts").select("display_name, company").eq("id", so.customer_id).single() : Promise.resolve({ data: null }),
      supabase.from("dist_items").select("id, name, category"),
    ]);
    const itemInfo = new Map((items || []).map(i => [i.id, i]));
    const lines = (so.dist_sales_order_lines || []).map(l => {
      const qty = Number(l.qty) || 0; const rate = Number(l.unit_price) || 0;
      const disc = Number(l.discount) || 0; const gross = qty * rate;
      const info = itemInfo.get(l.item_id);
      return { name: info?.name || l.item_id, category: info?.category || "", qty, unitPrice: rate,
        note: l.line_note || "",
        amount: l.discount_type === "percent" ? gross * (1 - disc / 100) : gross - disc };
    });
    const net = lines.reduce((a, l) => a + l.amount, 0);
    await supabase.from("ck_label_jobs").insert({ status: "queued", kind: "doc", payload: {
      title: "SALES ORDER", subtitle: so.so_number,
      meta: [`Customer: ${cust?.display_name || cust?.company || ""}`, `Date: ${so.order_date || ""}`, `Status: CONFIRMED`],
      lines, totals: [{ label: "Net (ex VAT/ship)", value: net, strong: true }],
      note: so.note || "", footer: "Create Brands Distribution",
    }, created_by: "auto" });
  } catch { /* printing must never break order flow */ }
}

// Receipt-style document (SO / invoice) on the warehouse Star printer.
export async function enqueueDistDocPrint(payload, user) {
  const { error } = await supabase.from("ck_label_jobs").insert({
    status: "queued", kind: "doc", payload,
    created_by: user?.name || user?.id || null,
  });
  if (error) throw error;
  return true;
}

// Per-store ordering preferences kept in app_settings as JSON blobs.
export async function fetchStoreOrderPrefs(storeId) {
  const all = await fetchAppSettings().catch(() => ({}));
  const read = (k) => { try { return JSON.parse(all[k] || "null"); } catch { return null; } };
  return {
    approvers: read(`order_approvers:${storeId}`) || [],          // ops_team member ids who may approve staff orders
    roundDefaults: read(`round_defaults:${storeId}`) || {},       // { basis: "category"|"location" }
    locations: read(`order_locations:${storeId}`) || [],          // managed location names for this store
  };
}
export async function saveStoreOrderPrefs(storeId, prefs) {
  if (prefs.approvers !== undefined) await upsertAppSetting(`order_approvers:${storeId}`, JSON.stringify(prefs.approvers || []));
  if (prefs.roundDefaults !== undefined) await upsertAppSetting(`round_defaults:${storeId}`, JSON.stringify(prefs.roundDefaults || {}));
  if (prefs.locations !== undefined) await upsertAppSetting(`order_locations:${storeId}`, JSON.stringify(prefs.locations || []));
}

// Staff-submitted orders awaiting a manager's decision for one customer.
export async function fetchPendingApprovalSos(customerId) {
  if (!customerId) return [];
  const { data } = await supabase.from("dist_sales_orders")
    .select("id, so_number, order_date, created_by, note, dist_sales_order_lines(id)")
    .eq("customer_id", customerId).eq("status", "pending_approval")
    .order("created_at", { ascending: true });
  return (data || []).map(r => ({ id: r.id, soNumber: r.so_number, orderDate: r.order_date, createdBy: r.created_by, note: r.note || "", lineCount: (r.dist_sales_order_lines || []).length }));
}

// Latest fresh-purchase delivery per store (last few days) — lets the fresh
// board show whether a bought order's receipts became a delivery and whether
// the store has received it.
export async function fetchRecentFreshDeliveries(days = 4) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase.from("store_deliveries")
    .select("id, store_id, status, dispatched_at, dispatch_id")
    .ilike("dispatch_id", "fresh:%").gte("dispatched_at", since)
    .order("dispatched_at", { ascending: false });
  const byStore = {};
  (data || []).forEach(d => { if (!byStore[d.store_id]) byStore[d.store_id] = { status: d.status, at: d.dispatched_at }; });
  return byStore;
}

// ── DETACH SO LINES: fresh / direct-supplier lines invoiced separately ──────
// Removes the checked groups' lines from the order outright — they're bought
// and invoiced through their own channel (driver expense or direct supplier),
// so keeping them on the Dist SO double-represents them. Guarded: only
// CONFIRMED orders, never after picking, never emptying the order.
export async function detachSoLines({ soId, lineIds, label, user }) {
  if (!lineIds || !lineIds.length) throw new Error("Nothing selected to detach.");
  const { data: so } = await supabase.from("dist_sales_orders").select("status, note").eq("id", soId).single();
  if (!so || so.status !== "confirmed") throw new Error("Only confirmed, unfulfilled orders can be detached from.");
  const { data: picks } = await supabase.from("dist_picks").select("id").eq("so_id", soId).limit(1);
  if (picks && picks.length) throw new Error("This order has already been picked — delete the pick first.");
  const { data: allLines } = await supabase.from("dist_sales_order_lines").select("id").eq("so_id", soId);
  if ((allLines || []).length <= lineIds.length) throw new Error("That would remove every line — cancel the order instead.");
  // GUARD (added after the 2026-07-24 incident): detaching deletes the lines,
  // and the drivers' fresh board shops FROM those lines. Detaching before the
  // shopping is done erases the drivers' list. Require every selected line to
  // be marked bought (or the item non-fresh) before it can leave the order.
  const { data: selLines } = await supabase.from("dist_sales_order_lines").select("id, item_id").in("id", lineIds);
  const selItemIds = (selLines || []).map(l => l.item_id);
  if (selItemIds.length) {
    const { data: freshItems } = await supabase.from("dist_items").select("id").in("id", selItemIds).eq("item_type", "fresh");
    const freshIds = new Set((freshItems || []).map(x => x.id));
    if (freshIds.size) {
      const { data: checks } = await supabase.from("dist_fulfil_checks").select("item_id").eq("so_id", soId).in("item_id", [...freshIds]);
      const done = new Set((checks || []).map(c => c.item_id));
      const notBought = [...freshIds].filter(x => !done.has(x));
      if (notBought.length) throw new Error(`${notBought.length} fresh line${notBought.length !== 1 ? "s haven't" : " hasn't"} been bought yet — the drivers still need them on the fresh board. Mark them bought first (or detach after the shopping run).`);
    }
  }
  const { error } = await supabase.from("dist_sales_order_lines").delete().in("id", lineIds).eq("so_id", soId);
  if (error) throw error;
  const stamp = `Detached (invoiced separately): ${label} — ${lineIds.length} line${lineIds.length !== 1 ? "s" : ""} removed by ${user?.name || "Dist"} ${new Date().toISOString().slice(0, 10)}`;
  await supabase.from("dist_sales_orders").update({ note: so.note ? `${so.note} · ${stamp}` : stamp }).eq("id", soId);
  return true;
}

// ── FULFILMENT CHANNEL: who fulfils an SO line (explicit, overridable) ──────
export const resolveFulfilChannel = (line, itemType) =>
  line?.fulfilChannel || ((itemType || "warehouse") === "fresh" ? "fresh" : "warehouse");

export async function setLineFulfilChannel(lineId, channel) {
  const val = ["warehouse", "fresh", "detached"].includes(channel) ? channel : null;
  const { error } = await supabase.from("dist_sales_order_lines")
    .update({ fulfil_channel: val }).eq("id", lineId);
  if (error) throw error;
}

export async function fetchOrderAmendment(soId) {
  const { data } = await supabase.from("dist_order_amendments").select("*")
    .eq("so_id", soId).order("requested_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return mapAmendment(data);
}

export async function fetchAmendmentsForOrders(soIds = []) {
  if (!soIds.length) return {};
  const { data } = await supabase.from("dist_order_amendments").select("*")
    .in("so_id", soIds).order("requested_at", { ascending: false });
  const m = {};
  (data || []).forEach(r => { if (!m[r.so_id]) m[r.so_id] = mapAmendment(r); }); // latest wins
  return m;
}

const mapAmendment = (r) => ({
  id: r.id, soId: r.so_id, storeId: r.store_id, status: r.status,
  lines: Array.isArray(r.proposed_lines) ? r.proposed_lines : [],
  note: r.note || "", requestedBy: r.requested_by_name || r.requested_by || "",
  requestedAt: r.requested_at, decidedBy: r.decided_by || "", decidedAt: r.decided_at,
  decisionNote: r.decision_note || "",
});

export async function fetchOrderLinesLight(soId) {
  const { data, error } = await supabase.from("dist_sales_order_lines")
    .select("item_id, qty, unit_price, tax_rate_id").eq("so_id", soId);
  if (error) throw error;
  return (data || []).map(l => ({ itemId: l.item_id, qty: Number(l.qty) || 0, unitPrice: Number(l.unit_price) || 0, taxRateId: l.tax_rate_id || null }));
}

export async function requestOrderAmendment({ soId, storeId, lines, note, user }) {
  const existing = await fetchOrderAmendment(soId);
  if (existing && existing.status === "pending") throw new Error("This order already has changes awaiting approval.");
  const { data: so } = await supabase.from("dist_sales_orders").select("status").eq("id", soId).single();
  if (!so || so.status !== "confirmed") throw new Error("This order can no longer be amended — it's already being fulfilled.");
  const clean = (lines || []).filter(l => l.itemId && Number(l.qty) > 0)
    .map(l => ({ itemId: l.itemId, qty: Number(l.qty), unitPrice: Number(l.unitPrice) || 0, taxRateId: l.taxRateId || null }));
  if (!clean.length) throw new Error("An amended order needs at least one item — cancel the order instead if nothing is wanted.");
  const { error } = await supabase.from("dist_order_amendments").insert({
    so_id: soId, store_id: storeId || null, status: "pending", proposed_lines: clean,
    note: note || null, requested_by: user?.id || null, requested_by_name: user?.name || "",
  });
  if (error) throw error;
  return true;
}

export async function cancelOrderAmendment(amendmentId) {
  const { error } = await supabase.from("dist_order_amendments")
    .update({ status: "cancelled" }).eq("id", amendmentId).eq("status", "pending");
  if (error) throw error;
  return true;
}

export async function decideOrderAmendment(amendmentId, approve, user, note) {
  const { data: am, error: aErr } = await supabase.from("dist_order_amendments")
    .select("*").eq("id", amendmentId).single();
  if (aErr || !am) throw new Error("Amendment not found.");
  if (am.status !== "pending") throw new Error("This amendment was already decided.");
  if (approve) {
    // Never rewrite an order the warehouse has started on.
    const { data: picks } = await supabase.from("dist_picks").select("id").eq("so_id", am.so_id).limit(1);
    if (picks && picks.length) throw new Error("This order has already been picked — delete the pick first, or reject the amendment.");
    const { data: so } = await supabase.from("dist_sales_orders").select("status, note").eq("id", am.so_id).single();
    if (!so || so.status !== "confirmed") throw new Error("Order is no longer in an amendable state.");
    const proposed = Array.isArray(am.proposed_lines) ? am.proposed_lines : [];
    const { error: dErr } = await supabase.from("dist_sales_order_lines").delete().eq("so_id", am.so_id);
    if (dErr) throw dErr;
    const lr = proposed.map(l => ({
      id: distId("dsol"), so_id: am.so_id, item_id: l.itemId, qty: Number(l.qty) || 0,
      unit_price: Number(l.unitPrice) || 0, tax_rate_id: l.taxRateId || null, discount: 0, discount_type: "percent",
    }));
    if (lr.length) { const { error: iErr } = await supabase.from("dist_sales_order_lines").insert(lr); if (iErr) throw iErr; }
    const stamp = `Amended per store request (approved by ${user?.name || user?.id || "Dist"} ${new Date().toISOString().slice(0, 10)})`;
    await supabase.from("dist_sales_orders").update({ note: so.note ? `${so.note} · ${stamp}` : stamp }).eq("id", am.so_id);
  }
  const { error } = await supabase.from("dist_order_amendments").update({
    status: approve ? "approved" : "rejected", decided_by: user?.name || user?.id || null,
    decided_at: new Date().toISOString(), decision_note: note || null,
  }).eq("id", amendmentId);
  if (error) throw error;
  return { applied: !!approve };
}

// ── CK ORDER CLAIMS: which cook is producing for which order ─────────────────
// Mirrors fresh claims on its own table (one order can carry BOTH a fresh
// claim and a CK claim — different people, different lines).
export async function fetchCkClaims() {
  const { data, error } = await supabase.from("dist_ck_claims").select("*");
  if (error) throw error;
  const m = {};
  (data || []).forEach(r => { m[r.so_id] = { makerId: r.maker_id, makerName: r.maker_name || "" }; });
  return m;
}
export async function setCkClaim(soId, user) {
  if (!user) {
    const { error } = await supabase.from("dist_ck_claims").delete().eq("so_id", soId);
    if (error) throw error;
    return true;
  }
  const { error } = await supabase.from("dist_ck_claims").upsert({
    so_id: soId, maker_id: user.id, maker_name: user.name || "", claimed_at: new Date().toISOString(),
  }, { onConflict: "so_id" });
  if (error) throw error;
  return true;
}

// ── FRESH ORDER CLAIMS: which driver is shopping which order ─────────────────
export async function fetchFreshClaims() {
  const { data, error } = await supabase.from("dist_fresh_claims").select("*");
  if (error) throw error;
  const m = {};
  (data || []).forEach(r => { m[r.so_id] = { driverId: r.driver_id, driverName: r.driver_name || "" }; });
  return m;
}
export async function setFreshClaim(soId, user) {
  if (!user) {
    const { error } = await supabase.from("dist_fresh_claims").delete().eq("so_id", soId);
    if (error) throw error;
    return true;
  }
  const { error } = await supabase.from("dist_fresh_claims").upsert({
    so_id: soId, driver_id: user.id, driver_name: user.name || "", claimed_at: new Date().toISOString(),
  }, { onConflict: "so_id" });
  if (error) throw error;
  return true;
}

// Ticking must never fail because of WHO ticked: if the write is rejected
// (e.g. a constraint on done_by that driver-app ids don't satisfy), retry
// once without attribution — the tick is the business fact, the name is nice-to-have.
async function upsertFulfilRows(rows) {
  let { error } = await supabase.from("dist_fulfil_checks").upsert(rows, { onConflict: "so_id,item_id" });
  if (error) {
    ({ error } = await supabase.from("dist_fulfil_checks").upsert(rows.map(r => ({ ...r, done_by: null })), { onConflict: "so_id,item_id" }));
  }
  if (error) throw error;
}

export async function setDistFulfilCheck(soId, itemId, done, userId, bought) {
  if (done) {
    await upsertFulfilRows([{ so_id: soId, item_id: itemId, done_by: userId || null, done_at: new Date().toISOString(),
      bought_qty: bought?.qty != null ? Number(bought.qty) : null, bought_uom: bought?.uom || null }]);
  } else {
    const { error } = await supabase.from("dist_fulfil_checks").delete().eq("so_id", soId).eq("item_id", itemId);
    if (error) throw error;
  }
}
// Mark/unmark every given item on one order in a single call.
export async function setDistFulfilOrderChecks(soId, itemIds = [], done, userId, boughtByItem) {
  if (!itemIds.length) return;
  if (done) {
    await upsertFulfilRows(itemIds.map(itemId => ({ so_id: soId, item_id: itemId, done_by: userId || null, done_at: new Date().toISOString(),
      bought_qty: boughtByItem?.[itemId]?.qty != null ? Number(boughtByItem[itemId].qty) : null, bought_uom: boughtByItem?.[itemId]?.uom || null })));
  } else {
    const { error } = await supabase.from("dist_fulfil_checks").delete().eq("so_id", soId).in("item_id", itemIds);
    if (error) throw error;
  }
}
// Mark/unmark one item across ALL the given orders (for the combined view).
export async function setDistFulfilItemChecks(itemId, soIds = [], done, userId, boughtBySo) {
  if (!soIds.length) return;
  if (done) {
    const rows = soIds.map(soId => ({ so_id: soId, item_id: itemId, done_by: userId || null, done_at: new Date().toISOString(),
      bought_qty: boughtBySo?.[soId]?.qty != null ? Number(boughtBySo[soId].qty) : null, bought_uom: boughtBySo?.[soId]?.uom || null }));
    await upsertFulfilRows(rows);
  } else {
    const { error } = await supabase.from("dist_fulfil_checks").delete().eq("item_id", itemId).in("so_id", soIds);
    if (error) throw error;
  }
}

// ── SALES CATEGORIES (Breakfast / Dinner / Desserts / Hot Drinks / Cold Drinks) ──
// Flipdish sale items already carry a menu category (e.g. "Matcha Range",
// "Cold Coffee"). Rather than mapping hundreds of products, we map each Flipdish
// CATEGORY → one of the five sales buckets. The map lives in app_settings.
export const SALES_CATEGORIES = ["Breakfast", "Dinner", "Desserts", "Hot Drinks", "Cold Drinks"];

// Distinct Flipdish categories that actually appear in sales over a period,
// with their revenue — so the mapping screen only shows real, in-use categories.
export async function fetchFlipdishCategories({ from, to, brandId = "chocoberry" } = {}) {
  // Item-level aggregation can hit the server statement timeout over long
  // windows. Try the requested window; if it times out, shrink and retry so the
  // mapper still gets a usable category list.
  const toDate = to instanceof Date ? to : new Date(to || Date.now());
  const spanDays = (() => {
    const f = from instanceof Date ? from : new Date(from);
    const d = Math.round((toDate - f) / 86400000);
    return isNaN(d) || d < 1 ? 14 : d;
  })();
  const attempts = [spanDays, 7, 3, 1].filter((v, i, a) => a.indexOf(v) === i && v >= 1);

  let items = null, lastErr = null;
  for (const days of attempts) {
    const f = new Date(toDate); f.setDate(f.getDate() - days);
    try {
      const res = await fetchItemsSold({ from: f, to: toDate, brandId });
      items = res.items || [];
      break;
    } catch (e) {
      lastErr = e;
      const msg = (e?.message || "").toLowerCase();
      // Only retry-smaller on timeouts; rethrow anything else.
      if (!msg.includes("timeout") && !msg.includes("canceling statement")) throw e;
    }
  }
  if (items === null) throw (lastErr || new Error("Could not load sales items."));

  const byCat = new Map();
  let uncategorised = 0;
  for (const it of items) {
    const rawCat = it.category ?? it.Category ?? it.categoryName ?? it.menuSection ?? "";
    const cat = String(rawCat || "").trim();
    if (!cat) { uncategorised++; continue; }
    const cur = byCat.get(cat) || { category: cat, revenue: 0, quantity: 0 };
    cur.revenue += Number(it.revenue) || 0;
    cur.quantity += Number(it.quantity) || 0;
    byCat.set(cat, cur);
  }
  const rows = Array.from(byCat.values())
    .map(c => ({ ...c, revenue: +c.revenue.toFixed(2) }))
    .sort((a, b) => b.revenue - a.revenue);
  rows._itemCount = items.length;
  rows._uncategorised = uncategorised;
  return rows;
}

// The map has two layers: Flipdish category → bucket, and an optional item-name
// → bucket override (for items whose Flipdish category is blank/Uncategorised).
// Item-name overrides win over the category mapping.
export async function fetchSalesCategoryMap() {
  const s = await fetchAppSettings().catch(() => ({}));
  let parsed = {};
  try { parsed = s?.sales_category_map ? JSON.parse(s.sales_category_map) : {}; } catch { parsed = {}; }
  // Back-compat: an older flat map is just the category layer.
  if (parsed && (parsed.categories || parsed.items)) return { categories: parsed.categories || {}, items: parsed.items || {} };
  return { categories: parsed || {}, items: {} };
}
export async function saveSalesCategoryMap(map) {
  const norm = (map && (map.categories || map.items)) ? { categories: map.categories || {}, items: map.items || {} } : { categories: map || {}, items: {} };
  await upsertAppSetting("sales_category_map", JSON.stringify(norm));
}

// Items sold within a given Flipdish category (for drilling into Uncategorised).
export async function fetchItemsInCategory({ from, to, brandId = "chocoberry", category } = {}) {
  const toDate = to instanceof Date ? to : new Date(to || Date.now());
  const attempts = [14, 7, 3, 1];
  let items = null, lastErr = null;
  for (const days of attempts) {
    const f = new Date(toDate); f.setDate(f.getDate() - days);
    try { const res = await fetchItemsSold({ from: f, to: toDate, brandId }); items = res.items || []; break; }
    catch (e) { lastErr = e; const m = (e?.message||"").toLowerCase(); if (!m.includes("timeout") && !m.includes("canceling statement")) throw e; }
  }
  if (items === null) throw (lastErr || new Error("Could not load items."));
  const want = String(category || "").trim().toLowerCase();
  return items
    .filter(it => {
      const c = String(it.category || "").trim().toLowerCase();
      return want === "uncategorised" ? (!c || c === "uncategorised") : c === want;
    })
    .map(it => ({ caption: it.caption || "Unknown item", revenue: +(Number(it.revenue)||0).toFixed(2), quantity: Number(it.quantity)||0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

// Roll aggregated items-sold (each with a Flipdish category) into the five
// buckets using the category map. Unmapped categories → "Uncategorised".
export function rollItemsSoldByCategory(items, categoryMap) {
  // categoryMap may be the two-layer shape { categories, items } or a legacy flat
  // category map. Item-name overrides take priority over the category mapping.
  const catLayer = (categoryMap && categoryMap.categories) ? categoryMap.categories : (categoryMap || {});
  const itemLayer = (categoryMap && categoryMap.items) ? categoryMap.items : {};
  const out = {};
  for (const c of SALES_CATEGORIES) out[c] = { category: c, revenue: 0, quantity: 0 };
  out["Uncategorised"] = { category: "Uncategorised", revenue: 0, quantity: 0 };
  for (const it of (items || [])) {
    const nameKey = (it.caption || it.name || "").trim().toLowerCase();
    const fdCat = (it.category || "Uncategorised").trim() || "Uncategorised";
    const bucket = itemLayer[nameKey] || catLayer[fdCat] || "Uncategorised";
    const b = out[bucket] || out["Uncategorised"];
    b.revenue += Number(it.revenue) || 0;
    b.quantity += Number(it.quantity) || 0;
  }
  const total = Object.values(out).reduce((s, b) => s + b.revenue, 0);
  return {
    total: +total.toFixed(2),
    rows: Object.values(out)
      .map(b => ({ ...b, revenue: +b.revenue.toFixed(2), pct: total > 0 ? b.revenue / total : 0 }))
      .filter(b => b.revenue > 0 || b.category !== "Uncategorised")
      .sort((a, b) => b.revenue - a.revenue),
  };
}

// ── DELIVEROO PERFORMANCE (weekly CSV upload) ───────────────────────────────
// Parses the set of Deliveroo weekly report CSVs into one row per store and
// upserts them. Store name is matched to internal stores by fuzzy name.
const _csvParse = (text) => {
  // Minimal RFC-4180-ish parser (handles quoted fields + commas).
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i+1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.length && r.some(x => x !== ""));
};
const _toRows = (text) => {
  const raw = _csvParse(text);
  if (!raw.length) return [];
  const head = raw[0].map(h => h.trim());
  return raw.slice(1).map(r => { const o = {}; head.forEach((h, i) => o[h] = (r[i] ?? "").trim()); return o; });
};
const _num = (v) => { const n = parseFloat(String(v ?? "").replace(/[£,%]/g, "")); return isNaN(n) ? 0 : n; };
const _norm = (s) => String(s || "").toLowerCase()
  .replace(/^chocoberry\s*[-–(]*\s*/, "")            // brand prefix + optional bracket
  .replace(/\b(rd)\b/g, "road").replace(/\b(st)\b/g, "street")
  .replace(/\b(ave|av)\b/g, "avenue").replace(/\b(ln)\b/g, "lane")
  .replace(/\b(sq)\b/g, "square").replace(/\b(pk)\b/g, "park")
  .replace(/[^a-z0-9]/g, "").trim();

// files: { performance, orders, items_sold, customers, speed_summary,
//          availability_open_rate, rejected_orders, rejected_by_reason } (text)
export function parseDeliverooReports(files, { weekStart, weekEnd } = {}) {
  const bySite = new Map();
  const ensure = (site) => {
    if (!site || /^all sites$/i.test(site)) return null;
    if (!bySite.has(site)) bySite.set(site, { site_name: site });
    return bySite.get(site);
  };

  // Performance
  _toRows(files.performance || "").forEach(r => {
    const s = ensure(r["Site"]); if (!s) return;
    s.gross_sales = _num(r["Gross sales"]);
    s.orders_delivered = _num(r["Orders delivered"]);
    s.avg_order_value = _num(r["Average order value"]);
    s.avg_rating = r["Average customer rating"] ? _num(r["Average customer rating"]) : null;
  });
  // Customers
  _toRows(files.customers || "").forEach(r => {
    const s = ensure(r["Site"]); if (!s) return;
    s.orders_new = _num(r["Orders from new customers"]);
    s.orders_repeat = _num(r["Orders from repeat customers (2-4 orders)"]);
    s.orders_frequent = _num(r["Orders from frequent customers (over 4 orders)"]);
    s.orders_offers = _num(r["Orders with Marketer offers"]);
    s.orders_rewards = _num(r["Orders from Rewards"]);
    s.menu_conversion = _num(r["Menu conversion (% orders / menu views)"]);
  });
  // Speed summary
  _toRows(files.speed_summary || "").forEach(r => {
    const s = ensure(r["Restaurant name"]); if (!s) return;
    s.busy_mode_pct = _num(r["Busy mode usage"]);
    s.prep_time_mins = _num(r["Prep time (mins)"]);
    s.rider_wait_mins = _num(r["Rider wait time past target (mins)"]);
    s.rider_wait_gt5_pct = _num(r["% Rider wait time past target >5 mins"]);
    s.rider_wait_gt10_pct = _num(r["% Rider wait time past target >10 mins"]);
    s.avg_order_duration_mins = _num(r["Average total order duration (mins)"]);
  });
  // Orders — economics + cancellation/rejection counts + item mix by site
  const orderAgg = new Map();
  _toRows(files.orders || "").forEach(r => {
    const site = r["Restaurant name"]; if (!site) return;
    const a = orderAgg.get(site) || { subtotal: 0, commissionable: 0, commission: 0, commission_vat: 0, cancelled: 0, rejected: 0 };
    const lineSub = _num(r["Subtotal"]);
    const lineComm = _num(r["Deliveroo commission"]);
    a.subtotal += lineSub;
    a.commission += lineComm;
    a.commission_vat += _num(r["VAT on Deliveroo commission"]);
    const st = (r["Order status"] || "").toLowerCase();
    if (st.includes("cancel")) a.cancelled++;
    else if (st.includes("reject")) a.rejected++;
    // Commission is only charged on completed orders — use their subtotal as the
    // rate denominator so cancelled/rejected (£0-commission) rows don't dilute it.
    else a.commissionable += lineSub;
    orderAgg.set(site, a);
  });
  orderAgg.forEach((a, site) => {
    const s = ensure(site); if (!s) return;
    const base = a.commissionable > 0 ? a.commissionable : a.subtotal;   // fallback safety
    s.subtotal = +a.subtotal.toFixed(2);
    s.commission = +a.commission.toFixed(2);
    s.commission_vat = +a.commission_vat.toFixed(2);
    s.commission_total = +(a.commission + a.commission_vat).toFixed(2);   // true cost incl VAT
    s.commission_pct = base > 0 ? +(a.commission / base * 100).toFixed(1) : 0;
    s.commission_total_pct = base > 0 ? +((a.commission + a.commission_vat) / base * 100).toFixed(1) : 0;
    s.orders_cancelled = a.cancelled;
    s.orders_rejected = a.rejected;
  });
  // Items sold — top items per site (exclude Modifiers with 0 price noise)
  const itemsBySite = new Map();
  _toRows(files.items_sold || "").forEach(r => {
    const site = r["Restaurant name"]; if (!site) return;
    const list = itemsBySite.get(site) || [];
    list.push({ category: r["Category"], name: r["Item name"], qty: _num(r["Quantity"]), revenue: _num(r["Subtotal"]) });
    itemsBySite.set(site, list);
  });
  itemsBySite.forEach((list, site) => {
    const s = ensure(site); if (!s) return;
    s.items_sold = list.filter(i => i.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 30);
  });
  // Availability — open rate (Total column, "All sites" excluded); daily rows so take store total avg
  const openBySite = new Map();
  _toRows(files.availability_open_rate || "").forEach(r => {
    const site = r["Restaurant name"]; if (!site || /^all sites$/i.test(site)) return;
    const arr = openBySite.get(site) || []; arr.push(_num(r["Total"])); openBySite.set(site, arr);
  });
  openBySite.forEach((arr, site) => { const s = ensure(site); if (!s) return; s.open_rate_pct = arr.length ? +(arr.reduce((x, y) => x + y, 0) / arr.length).toFixed(1) : null; });
  // Rejected orders % (Metric = "% of orders rejected", Total col)
  _toRows(files.rejected_orders || "").forEach(r => {
    const site = r["Site"]; if (!site || /^all sites$/i.test(site)) return;
    if ((r["Metric"] || "").toLowerCase().includes("rejected")) { const s = ensure(site); if (s) s.rejected_pct = _num(r["Total"]); }
  });
  // Rejection reasons per site
  _toRows(files.rejected_by_reason || "").forEach(r => {
    const site = r["Site"]; if (!site || /^all sites$/i.test(site)) return;
    const reason = r["Rejection reason"]; if (!reason || reason === "All") return;
    const s = ensure(site); if (!s) return;
    s.rejection_reasons = s.rejection_reasons || [];
    s.rejection_reasons.push({ reason, count: _num(r["Total rejected orders"]), value: _num(r["Order value of rejected orders"]) });
  });

  // Day × daypart grids — keep the full matrix per store for heatmaps.
  const DAYPARTS = ["Breakfast (04:00 - 11:00)", "Lunch (11:00 - 14:00)", "Interpeak (14:00 - 17:00)", "Dinner (17:00 - 00:00)", "Late night (00:00 - 04:00)"];
  const DP_SHORT = ["Breakfast", "Lunch", "Afternoon", "Dinner", "Late"];
  const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const parseGrid = (text, siteKey) => {
    const grids = new Map();
    _toRows(text || "").forEach(r => {
      const site = r[siteKey]; if (!site || /^all sites$/i.test(site)) return;
      const day = r["Day of week"]; if (!day) return;
      const g = grids.get(site) || {};
      g[day] = DAYPARTS.map(dp => _num(r[dp]));
      grids.set(site, g);
    });
    // Convert to ordered 7×5 matrix
    const out = new Map();
    grids.forEach((g, site) => { out.set(site, DAYS.map(d => g[d] || [0,0,0,0,0])); });
    return out;
  };
  const prepGrid = parseGrid(files.prep_time, "Restaurant name");
  const riderGrid = parseGrid(files.rider_wait, "Restaurant name");
  const openGrid = parseGrid(files.availability_open_rate, "Restaurant name");
  prepGrid.forEach((grid, site) => { const s = ensure(site); if (s) s.prep_grid = grid; });
  riderGrid.forEach((grid, site) => { const s = ensure(site); if (s) s.rider_grid = grid; });
  openGrid.forEach((grid, site) => { const s = ensure(site); if (s) s.open_grid = grid; });

  // Rejection heatmap: Site × daypart (the "% of orders rejected" + value rows)
  _toRows(files.rejected_orders || "").forEach(r => {
    const site = r["Site"]; if (!site || /^all sites$/i.test(site)) return;
    const metric = (r["Metric"] || "").toLowerCase();
    const s = ensure(site); if (!s) return;
    const vals = DAYPARTS.map(dp => _num(r[dp]));
    if (metric.includes("value")) s.reject_value_by_daypart = vals;
    else if (metric.includes("rejected")) s.reject_pct_by_daypart = vals;
  });

  return Array.from(bySite.values())
    .map(s => ({
      week_start: weekStart || null, week_end: weekEnd || null,
      gross_sales: 0, orders_delivered: 0, avg_order_value: 0, avg_rating: null,
      subtotal: 0, commission: 0, commission_pct: 0, orders_cancelled: 0, orders_rejected: 0,
      items_sold: s.items_sold || [], rejection_reasons: s.rejection_reasons || [],
      prep_grid: s.prep_grid || null, rider_grid: s.rider_grid || null, open_grid: s.open_grid || null,
      reject_pct_by_daypart: s.reject_pct_by_daypart || null, reject_value_by_daypart: s.reject_value_by_daypart || null,
      ...s,
    }))
    // Drop sites with no real activity that week (e.g. appear only in a
    // zero-filled availability report).
    .filter(s => s.gross_sales > 0 || s.orders_delivered > 0 || s.subtotal > 0);
}

// Match to internal stores and upsert.
export async function saveDeliverooPerformance(parsedRows, stores = []) {
  // Build a lookup from several normalised keys per store (name + shortName),
  // so Deliveroo's "Chocoberry - Banbury" matches a store named "Banbury",
  // "Chocoberry Banbury", etc. Also keep a list for a contains() fallback.
  const idx = new Map();
  const storeList = [];
  for (const st of stores) {
    const keys = new Set([_norm(st.name), _norm(st.shortName)].filter(Boolean));
    keys.forEach(k => { if (k && !idx.has(k)) idx.set(k, st); });
    const short = _norm(st.shortName) || _norm(st.name);
    if (short) storeList.push({ st, key: short });
  }
  const matchStore = (siteName) => {
    const n = _norm(siteName);
    if (idx.has(n)) return idx.get(n);
    let best = null;
    for (const { st, key } of storeList) {
      if (key.length >= 3 && (n.includes(key) || key.includes(n))) { best = st; break; }
    }
    return best;
  };
  const rows = parsedRows.map(r => {
    const match = matchStore(r.site_name);
    return {
      id: `dlv-${r.week_end || "na"}-${_norm(r.site_name)}`,
      week_start: r.week_start, week_end: r.week_end,
      site_name: r.site_name, store_id: match?.id || null, brand_id: match?.brandId || null,
      gross_sales: r.gross_sales || 0, orders_delivered: r.orders_delivered || 0,
      avg_order_value: r.avg_order_value || 0, avg_rating: r.avg_rating ?? null,
      subtotal: r.subtotal || 0, commission: r.commission || 0, commission_pct: r.commission_pct || 0,
      commission_vat: r.commission_vat || 0, commission_total: r.commission_total || 0, commission_total_pct: r.commission_total_pct || 0,
      orders_cancelled: r.orders_cancelled || 0, orders_rejected: r.orders_rejected || 0,
      orders_new: r.orders_new || 0, orders_repeat: r.orders_repeat || 0, orders_frequent: r.orders_frequent || 0,
      orders_offers: r.orders_offers || 0, orders_rewards: r.orders_rewards || 0, menu_conversion: r.menu_conversion ?? null,
      busy_mode_pct: r.busy_mode_pct ?? null, prep_time_mins: r.prep_time_mins ?? null, rider_wait_mins: r.rider_wait_mins ?? null,
      rider_wait_gt5_pct: r.rider_wait_gt5_pct ?? null, rider_wait_gt10_pct: r.rider_wait_gt10_pct ?? null,
      avg_order_duration_mins: r.avg_order_duration_mins ?? null,
      open_rate_pct: r.open_rate_pct ?? null, rejected_pct: r.rejected_pct ?? null,
      items_sold: r.items_sold || [], rejection_reasons: r.rejection_reasons || [],
      prep_grid: r.prep_grid || null, rider_grid: r.rider_grid || null, open_grid: r.open_grid || null,
      reject_pct_by_daypart: r.reject_pct_by_daypart || null, reject_value_by_daypart: r.reject_value_by_daypart || null,
      uploaded_at: new Date().toISOString(),
    };
  });
  const { error } = await supabase.from("deliveroo_performance").upsert(rows, { onConflict: "week_end,site_name" });
  if (error) throw error;
  return rows.length;
}

export async function fetchDeliverooPerformance({ weekEnd, storeId } = {}) {
  let q = supabase.from("deliveroo_performance").select("*");
  if (weekEnd) q = q.eq("week_end", weekEnd);
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q.order("gross_sales", { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function fetchDeliverooWeeks() {
  const { data, error } = await supabase.from("deliveroo_performance").select("week_end").order("week_end", { ascending: false });
  if (error) throw error;
  return Array.from(new Set((data || []).map(r => r.week_end)));
}

// ── UBER EATS PERFORMANCE (weekly CSV upload) ───────────────────────────────
// Parses Uber Eats weekly exports (financial statement + ratings + order
// history + inaccurate items) into one row per store. Reuses the CSV helpers
// (_csvParse, _toRows, _num, _norm) defined for the Deliveroo parser above.
export function parseUberEatsReports(files, { weekStart, weekEnd } = {}) {
  const SHOP = "Shop name as per Uber Eats manager";
  const SALES = "Total item sales including VAT";
  const FEE = "Uber service fee after Uber service fee promotion is applied (including VAT)";
  const REFUND = "Amount merchants are responsible for refunding customers when they report order errors (incl. VAT)";
  const bySite = new Map();
  const ensure = (site) => {
    if (!site || /^(shop name|order date|order status)$/i.test(site)) return null;
    if (!bySite.has(site)) bySite.set(site, { site_name: site });
    return bySite.get(site);
  };

  // Financial statement — the core economics.
  const MEMBER = "Uber membership status of the customer who placed the order";
  const PLATFORM = "The platform from which the customer ordered, (i.e. iOS, Android, Uber Eats Web)";
  const FULFIL = "The mode of order fulfilment, whether it was delivery by courier via the Uber network, delivery by merchant, pick-up by customer or eat-in";
  const fin = new Map();
  _toRows(files.statement || "").forEach(r => {
    const site = r[SHOP]; if (!site) return;
    const status = (r[Object.keys(r).find(k => k.startsWith("Either: Completed")) || ""] || "").toLowerCase();
    const a = fin.get(site) || { sales: 0, fee: 0, refund: 0, payout: 0, orders: 0, cancelled: 0, refunded: 0, chargeback: 0, uberOne: 0, memberN: 0, ch: {}, ff: {} };
    a.sales += _num(r[SALES]);
    a.fee += _num(r[FEE]);            // negative in the file
    a.refund += _num(r[REFUND]);
    const payoutKey = Object.keys(r).find(k => k.startsWith("Total payout"));
    a.payout += _num(r[payoutKey]);
    if (status.includes("dispute")) { a.chargeback++; }
    else if (status.includes("cancel")) a.cancelled++;
    else if (status.includes("refund")) a.refunded++;
    else a.orders++;
    // Membership + channel + fulfilment (skip the stray descriptive header row).
    const mem = (r[MEMBER] || "").trim();
    if (mem && mem !== "Customer Uber Membership Status") { a.memberN++; if (/uber one/i.test(mem)) a.uberOne++; }
    const plat = (r[PLATFORM] || "").trim();
    if (plat && plat !== "Order channel") a.ch[plat] = (a.ch[plat] || 0) + 1;
    const ff = (r[FULFIL] || "").trim();
    if (ff && ff.length > 3) a.ff[ff] = (a.ff[ff] || 0) + 1;
    fin.set(site, a);
  });
  fin.forEach((a, site) => {
    const s = ensure(site); if (!s) return;
    s.sales_incl_vat = +a.sales.toFixed(2);
    s.service_fee = +Math.abs(a.fee).toFixed(2);              // store as positive cost
    s.service_fee_pct = a.sales > 0 ? +(Math.abs(a.fee) / a.sales * 100).toFixed(1) : 0;
    s.merchant_refunds = +Math.abs(a.refund).toFixed(2);
    s.payout = +a.payout.toFixed(2);
    s.orders = a.orders;
    s.orders_cancelled = a.cancelled;
    s.orders_refunded = a.refunded;
    s.orders_chargeback = a.chargeback;
    s.avg_order_value = a.orders > 0 ? +(a.sales / a.orders).toFixed(2) : 0;
    s.uber_one_pct = a.memberN > 0 ? +(a.uberOne / a.memberN * 100).toFixed(1) : null;
    // Channel mix (top few) + fulfilment mix as compact objects.
    s.channel_mix = a.ch; s.fulfil_mix = a.ff;
  });

  // Ratings — star breakdown + average + individual reviews for drill-down.
  const ratings = new Map();
  _toRows(files.ratings || "").forEach(r => {
    const site = r["Restaurant"]; if (!site) return;
    const v = Math.round(_num(r["Rating value"])); if (v < 1 || v > 5) return;
    const a = ratings.get(site) || { 1:0,2:0,3:0,4:0,5:0, sum:0, n:0, reviews: [] };
    a[v]++; a.sum += v; a.n++;
    const comment = (r["Comment"] || "").trim();
    const tags = (r["Rating tags"] || "").trim();
    // Keep reviews that carry a comment or tags (the useful ones to read).
    if (comment || tags) {
      a.reviews.push({
        stars: v, comment: comment.slice(0, 300),
        tags: tags ? tags.split(",").map(t => t.trim().replace(/^restaurant_/, "").replace(/_/g, " ")).filter(Boolean).slice(0, 4) : [],
        date: (r["Rating date"] || "").trim(),
      });
    }
    ratings.set(site, a);
  });
  ratings.forEach((a, site) => {
    const s = ensure(site); if (!s) return;
    s.rating_5 = a[5]; s.rating_4 = a[4]; s.rating_3 = a[3]; s.rating_2 = a[2]; s.rating_1 = a[1];
    s.avg_rating = a.n > 0 ? +(a.sum / a.n).toFixed(2) : null;
    // Store reviews worst-first (most actionable), cap to keep the row small.
    s.reviews = a.reviews.sort((x, y) => x.stars - y.stars).slice(0, 40);
  });

  // Order history — prep + delivery times + day×hour sales grid + peak hours.
  const oh = new Map();
  _toRows(files.order_history || "").forEach(r => {
    const site = r["Restaurant"]; if (!site) return;
    const a = oh.get(site) || { prep: 0, prepN: 0, dur: 0, durN: 0, grid: null, hourTot: null };
    const prep = _num(r["Original prep time"]); if (prep > 0) { a.prep += prep; a.prepN++; }
    const dur = _num(r["Order duration"]); if (dur > 0) { a.dur += dur; a.durN++; }
    // Day-of-week × hour sales grid (7 rows Mon–Sun × 24 hours) from the order
    // timestamp and ticket size, mirroring Uber's "Sales by hour" heatmap.
    const ts = r["Time customer ordered"] || r["Date ordered"];
    const ticket = _num(r["Ticket size"]);
    if (ts) {
      const d = new Date(ts.replace(" ", "T"));
      if (!isNaN(d.getTime())) {
        if (!a.grid) { a.grid = Array.from({length:7},()=>new Array(24).fill(0)); a.hourTot = new Array(24).fill(0); }
        const dow = (d.getDay() + 6) % 7;    // Mon=0 … Sun=6
        const hr = d.getHours();
        a.grid[dow][hr] += ticket;
        a.hourTot[hr] += ticket;
      }
    }
    oh.set(site, a);
  });
  oh.forEach((a, site) => {
    const s = ensure(site); if (!s) return;
    s.avg_prep_mins = a.prepN > 0 ? +(a.prep / a.prepN).toFixed(1) : null;
    s.avg_delivery_mins = a.durN > 0 ? +(a.dur / a.durN).toFixed(1) : null;
    if (a.grid) {
      s.sales_hour_grid = a.grid.map(row => row.map(v => +v.toFixed(2)));
      // Peak / off-peak hour from the hourly totals.
      const ht = a.hourTot;
      let peak = 0, off = 0;
      for (let h = 1; h < 24; h++) { if (ht[h] > ht[peak]) peak = h; if (ht[h] > 0 && (ht[off] === 0 || ht[h] < ht[off])) off = h; }
      s.peak_hour = peak; s.offpeak_hour = off;
    }
  });

  // Inaccurate items — top missing/wrong items per store.
  const inacc = new Map();
  _toRows(files.top_inaccurate || "").forEach(r => {
    const site = r["Restaurant"]; if (!site) return;
    const list = inacc.get(site) || [];
    list.push({ item: r["Inaccurate items"] || r["Inaccurate Customisations"] || "Unknown", issue: r["Item issue"] || r["Order issue"] || "", count: _num(r["Count"]) });
    inacc.set(site, list);
  });
  inacc.forEach((list, site) => {
    const s = ensure(site); if (!s) return;
    const agg = {};
    list.forEach(x => { const k = x.item + "|" + x.issue; agg[k] = agg[k] || { ...x, count: 0 }; agg[k].count += x.count; });
    s.inaccurate_items = Object.values(agg).sort((a, b) => b.count - a.count).slice(0, 15);
  });

  // Inaccurate orders — per-order detail (issue, items, refund) for drill-down.
  const inaccOrders = new Map();
  _toRows(files.inaccurate_orders || "").forEach(r => {
    const site = r["Restaurant"]; if (!site) return;
    const list = inaccOrders.get(site) || [];
    const items = (r["Inaccurate items"] || r["Inaccurate Customisations"] || "").trim();
    list.push({
      issue: (r["Order issue"] || "").replace(/_/g, " ").toLowerCase(),
      items: items.slice(0, 80),
      ticket: _num(r["Ticket size"]),
      refundMerchant: _num(r["Refund Covered by Merchant"]),
      refundTotal: _num(r["Customer refunded"]),
      feedback: (r["Customer feedback"] || "").trim().slice(0, 140),
      date: (r["Time customer ordered"] || "").split(" ")[0] || "",
    });
    inaccOrders.set(site, list);
  });
  inaccOrders.forEach((list, site) => {
    const s = ensure(site); if (!s) return;
    s.inaccurate_orders = list.sort((a, b) => b.refundMerchant - a.refundMerchant).slice(0, 30);
  });

  return Array.from(bySite.values())
    .map(s => ({
      week_start: weekStart || null, week_end: weekEnd || null,
      sales_incl_vat: 0, orders: 0, service_fee: 0, service_fee_pct: 0, payout: 0,
      inaccurate_items: s.inaccurate_items || [], items_sold: [],
      reviews: s.reviews || [], inaccurate_orders: s.inaccurate_orders || [],
      sales_hour_grid: s.sales_hour_grid || null, peak_hour: s.peak_hour ?? null, offpeak_hour: s.offpeak_hour ?? null,
      orders_chargeback: s.orders_chargeback || 0, uber_one_pct: s.uber_one_pct ?? null,
      channel_mix: s.channel_mix || {}, fulfil_mix: s.fulfil_mix || {},
      ...s,
    }))
    .filter(s => s.sales_incl_vat > 0 || s.orders > 0);
}

export async function saveUberEatsPerformance(parsedRows, stores = []) {
  const idx = new Map();
  const storeList = [];
  for (const st of stores) {
    [_norm(st.name), _norm(st.shortName)].filter(Boolean).forEach(k => { if (k && !idx.has(k)) idx.set(k, st); });
    const short = _norm(st.shortName) || _norm(st.name);
    if (short) storeList.push({ st, key: short });
  }
  const matchStore = (siteName) => {
    const n = _norm(siteName);
    if (idx.has(n)) return idx.get(n);
    for (const { st, key } of storeList) if (key.length >= 3 && (n.includes(key) || key.includes(n))) return st;
    return null;
  };
  const rows = parsedRows.map(r => {
    const match = matchStore(r.site_name);
    return {
      id: `ube-${r.week_end || "na"}-${_norm(r.site_name)}`,
      week_start: r.week_start, week_end: r.week_end,
      site_name: r.site_name, store_id: match?.id || null, brand_id: match?.brandId || null,
      sales_incl_vat: r.sales_incl_vat || 0, orders: r.orders || 0, avg_order_value: r.avg_order_value || 0,
      service_fee: r.service_fee || 0, service_fee_pct: r.service_fee_pct || 0,
      merchant_refunds: r.merchant_refunds || 0, payout: r.payout || 0,
      orders_cancelled: r.orders_cancelled || 0, orders_refunded: r.orders_refunded || 0,
      avg_rating: r.avg_rating ?? null,
      rating_5: r.rating_5 || 0, rating_4: r.rating_4 || 0, rating_3: r.rating_3 || 0, rating_2: r.rating_2 || 0, rating_1: r.rating_1 || 0,
      avg_prep_mins: r.avg_prep_mins ?? null, avg_delivery_mins: r.avg_delivery_mins ?? null,
      downtime_mins: r.downtime_mins || 0,
      items_sold: r.items_sold || [], inaccurate_items: r.inaccurate_items || [],
      reviews: r.reviews || [], inaccurate_orders: r.inaccurate_orders || [],
      sales_hour_grid: r.sales_hour_grid || null, peak_hour: r.peak_hour ?? null, offpeak_hour: r.offpeak_hour ?? null,
      orders_chargeback: r.orders_chargeback || 0, uber_one_pct: r.uber_one_pct ?? null,
      channel_mix: r.channel_mix || {}, fulfil_mix: r.fulfil_mix || {},
      uploaded_at: new Date().toISOString(),
    };
  });
  const { error } = await supabase.from("ubereats_performance").upsert(rows, { onConflict: "week_end,site_name" });
  if (error) throw error;
  return rows.length;
}

export async function fetchUberEatsPerformance({ weekEnd, storeId } = {}) {
  let q = supabase.from("ubereats_performance").select("*");
  if (weekEnd) q = q.eq("week_end", weekEnd);
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q.order("sales_incl_vat", { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function fetchUberEatsWeeks() {
  const { data, error } = await supabase.from("ubereats_performance").select("week_end").order("week_end", { ascending: false });
  if (error) throw error;
  return Array.from(new Set((data || []).map(r => r.week_end)));
}

// ─── PHASE 3b: Store goods-receipt backend ──────────────────────────────────
// When Dist dispatches, snapshot the dispatch into a store_delivery (status
// 'incoming'). Store staff then receive against it. This NEVER modifies the
// dispatch. Store-only — no CK involvement.

// Resolve the store_id for a dist sales order (via customer→store link).
async function _storeIdForSalesOrder(soId) {
  try {
    const { data: so } = await supabase.from("dist_sales_orders")
      .select("customer_id").eq("id", soId).maybeSingle();
    if (!so || !so.customer_id) return null;
    const { data: contact } = await supabase.from("dist_contacts")
      .select("store_id").eq("id", so.customer_id).maybeSingle();
    return contact ? contact.store_id : null;
  } catch { return null; }
}

// Create a store_delivery from a set of dispatched lines. Resolves each dist
// item to its store item via cogs_store_items.dist_item_id (Phase 1 link).
// Best-effort: logs and returns null on failure so it never breaks the dispatch.
export async function createStoreDeliveryFromDispatch(soId, dispatchId, dispatchLines) {
  try {
    const storeId = await _storeIdForSalesOrder(soId);
    if (!storeId) { console.warn("store delivery: no store for SO", soId); return null; }

    // Map dist_item_id → store item (id + name) for the lines we're delivering.
    const allIds = [...new Set((dispatchLines || []).map(l => l.itemId).filter(Boolean))];
    const distById = new Map();
    const typeById = new Map();
    if (allIds.length) {
      const { data: di } = await supabase.from("dist_items").select("id, name, item_type").in("id", allIds);
      (di || []).forEach(d => { distById.set(d.id, d.name); typeById.set(d.id, d.item_type || "warehouse"); });
    }
    // FRESH lines never ride the warehouse delivery: the driver already bought
    // and delivered them (expense -> fresh-purchase delivery). Copying them here
    // would have the store receive the same strawberries TWICE - double stock,
    // double purchases. The SO keeps its fresh lines for the order record; the
    // store's physical receipt of them lives on the fresh delivery.
    // Per-line channel from the SO wins over item type: an item overridden to
    // 'warehouse' rides the van even if fresh-typed; 'fresh'/'detached' never do.
    const { data: soLines } = await supabase.from("dist_sales_order_lines")
      .select("item_id, fulfil_channel, line_note").eq("so_id", soId);
    const chanByItem = new Map((soLines || []).map(x => [x.item_id, x.fulfil_channel]));
    const noteByItem = new Map((soLines || []).filter(x => x.line_note).map(x => [x.item_id, x.line_note]));
    const rideVan = (itemId) => {
      const ch = chanByItem.get(itemId);
      if (ch) return ch === "warehouse";
      return typeById.get(itemId) !== "fresh";
    };
    const deliverable = (dispatchLines || []).filter(l => rideVan(l.itemId));
    if (!deliverable.length) return null; // everything on this dispatch was fresh - nothing for the van
    const distIds = [...new Set(deliverable.map(l => l.itemId).filter(Boolean))];
    const { data: storeItems } = await supabase.from("cogs_store_items")
      .select("id, name, dist_item_id").in("dist_item_id", distIds.length ? distIds : ["__none__"]);
    const storeByDist = new Map((storeItems || []).map(s => [s.dist_item_id, s]));

    // Header
    const { data: deliv, error: hErr } = await supabase.from("store_deliveries")
      .insert({ store_id: storeId, dist_order_id: soId, dispatch_id: dispatchId || null,
                status: "incoming", dispatched_at: new Date().toISOString() })
      .select().single();
    if (hErr) { console.error("store delivery header failed:", hErr.message); return null; }

    // Lines
    const lineRows = deliverable.map(l => {
      const si = storeByDist.get(l.itemId);
      return {
        delivery_id: deliv.id,
        dist_item_id: l.itemId || null,
        store_item_id: si ? si.id : null,
        item_name: (si && si.name) || distById.get(l.itemId) || "Item",
        qty_dispatched: Number(l.qty) || 0,
        qty_received: null,
        unit_cost: l.unitPrice != null ? Number(l.unitPrice) : null,
        line_note: noteByItem.get(l.itemId) || null,
      };
    });
    if (lineRows.length) {
      const { error: lErr } = await supabase.from("store_delivery_lines").insert(lineRows);
      if (lErr) console.error("store delivery lines failed:", lErr.message);
    }
    return deliv.id;
  } catch (e) {
    console.error("createStoreDeliveryFromDispatch error:", e.message);
    return null;
  }
}

// The store's incoming / in-progress deliveries (what's on the way).
export async function fetchIncomingDeliveries(storeId) {
  const { data, error } = await supabase.from("store_deliveries")
    .select("*").eq("store_id", storeId).in("status", ["incoming", "receiving"])
    .order("dispatched_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Full detail of one delivery (header + lines).
export async function fetchStoreDeliveryDetail(deliveryId) {
  const [{ data: head }, { data: lines }] = await Promise.all([
    supabase.from("store_deliveries").select("*").eq("id", deliveryId).maybeSingle(),
    supabase.from("store_delivery_lines").select("*").eq("delivery_id", deliveryId).order("id"),
  ]);
  return { head, lines: lines || [] };
}

// Save received quantities as staff enter them (before final confirm).
// lines = [{ id, qtyReceived, unitCost? }]
export async function saveDeliveryReceipt(deliveryId, lines) {
  for (const l of (lines || [])) {
    const patch = { qty_received: l.qtyReceived != null ? Number(l.qtyReceived) : null,
                    received: l.qtyReceived != null && Number(l.qtyReceived) > 0 };
    if (l.unitCost != null && l.unitCost !== "") patch.unit_cost = Number(l.unitCost);
    await supabase.from("store_delivery_lines").update(patch).eq("id", l.id);
  }
  await supabase.from("store_deliveries").update({ status: "receiving" }).eq("id", deliveryId);
  return true;
}

// CONFIRM: add received qty to store_stock, write receipt movements, update
// moving cost, flag shortfalls. This is the moment stock actually rises.
// Ensure a store inventory item exists for a given dist item. Returns its id.
// Used when a store orders a dist item that has no store counterpart yet — we
// create one from the dist item's details so received stock has somewhere to land.
// Store-scope only (never CK). Idempotent: reuses an existing linked store item.
async function ensureStoreItemForDistItem(distItemId, fallbackName, unitCost) {
  if (!distItemId) return null;
  // Already linked?
  const { data: existing } = await supabase.from("cogs_store_items")
    .select("id").eq("dist_item_id", distItemId).limit(1).maybeSingle();
  if (existing) return existing.id;
  // Pull the dist item's details to copy across.
  const { data: di } = await supabase.from("dist_items")
    .select("name, sku, category, pack_count, pack_size, pack_unit, purchase_rate")
    .eq("id", distItemId).maybeSingle();
  const name = (di?.name || fallbackName || "Unnamed item").trim();
  const packCount = di?.pack_count != null ? Number(di.pack_count) : 1;
  const packSize = di?.pack_size != null ? Number(di.pack_size) : null;
  const packUnit = di?.pack_unit || "";
  const packDesc = packSize != null ? `${packCount}*${packSize}${packUnit}` : `${packCount}${packUnit?("*"+packUnit):""}`;
  const packPrice = unitCost != null ? Number(unitCost) : (di?.purchase_rate != null ? Number(di.purchase_rate) : null);
  const body = {
    name, category: di?.category || "Other Items", base_unit: packUnit || "ea",
    pack_desc: packDesc, pack_qty: (packSize != null ? packSize * packCount : packCount),
    pack_price: packPrice, dist_item_id: distItemId,
  };
  const { data: created, error } = await supabase.from("cogs_store_items").insert(body).select("id").single();
  if (error) { console.error("ensureStoreItemForDistItem failed:", error.message); return null; }
  return created.id;
}

// ── DIRECT SUPPLIERS: per-store overrides + direct orders ────────────────────
// Items carry a global fulfilled_by (null = Distribution); stores can override
// per item. Checkout groups the cart by resolved supplier: Dist lines → normal
// sales order; each direct group → a direct_order + an incoming store delivery
// (supplier_name set, so receiving auto-writes purchases under that supplier).

export async function fetchStoreSupplierOverrides(storeId) {
  const { data, error } = await supabase.from("store_item_suppliers")
    .select("*").eq("store_id", storeId);
  if (error) throw error;
  const m = {};
  (data || []).forEach(r => { m[r.item_id] = r.vendor_id; }); // null = force Distribution
  return m;
}

export async function setStoreSupplierOverride(storeId, itemId, vendorId) {
  if (vendorId === undefined) {
    await supabase.from("store_item_suppliers").delete().eq("store_id", storeId).eq("item_id", itemId);
    return true;
  }
  const { error } = await supabase.from("store_item_suppliers")
    .upsert({ store_id: storeId, item_id: itemId, vendor_id: vendorId }, { onConflict: "store_id,item_id" });
  if (error) throw error;
  return true;
}

// groups: { vendorId: { vendorName, items: [{ itemId, name, qty }] } }
export async function createDirectOrders(storeId, groups, user) {
  const created = [];
  for (const [vendorId, g] of Object.entries(groups || {})) {
    const items = (g && g.items) || [];
    if (!items.length) continue;
    const { data: head, error: hErr } = await supabase.from("direct_orders").insert({
      store_id: storeId, vendor_id: vendorId, vendor_name: g.vendorName || "",
      status: "placed", created_by: user?.id || null, created_by_name: user?.name || null,
    }).select().single();
    if (hErr) throw hErr;
    const { error: lErr } = await supabase.from("direct_order_lines")
      .insert(items.map(it => ({ order_id: head.id, item_id: it.itemId, item_name: it.name || "", qty: Number(it.qty) || 0 })));
    if (lErr) console.error("direct order lines failed:", lErr.message);
    // Raise the incoming delivery so the store receives it exactly like a Dist
    // delivery — item links intact, so stock + purchase records work; the
    // supplier name flows onto the purchase records at confirmation.
    try {
      const { data: deliv } = await supabase.from("store_deliveries").insert({
        store_id: storeId, dist_order_id: null, dispatch_id: `direct:${head.id}`,
        supplier_name: g.vendorName || "Supplier",
        status: "incoming", dispatched_at: new Date().toISOString(),
      }).select().single();
      if (deliv) {
        await supabase.from("store_delivery_lines").insert(items.map(it => ({
          delivery_id: deliv.id, dist_item_id: it.itemId, store_item_id: null,
          item_name: it.name || "Item", qty_dispatched: Number(it.qty) || 0, unit_cost: null,
        })));
      }
    } catch (e) { console.error("direct delivery failed:", e.message); }
    created.push({ orderId: head.id, vendorId, vendorName: g.vendorName, items });
  }
  return created;
}

export async function fetchDirectOrders({ storeId, status } = {}) {
  let q = supabase.from("direct_orders").select("*").order("created_at", { ascending: false }).limit(100);
  if (storeId) q = q.eq("store_id", storeId);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// ── FRESH PURCHASE → STORE DELIVERIES ────────────────────────────────────────
// When a driver buys produce (Tesco/Costco run) and allocates receipt line
// items to stores, each store gets a normal incoming delivery: same list, same
// receive flow, same shortfall flags as Distribution dispatches. Lines carry
// no dist/store item link (fresh is unstocked), so receiving records expected
// vs received without stock side effects.
export async function createFreshPurchaseDeliveries(perStore, meta = {}) {
  const created = [];
  for (const [storeId, s] of Object.entries(perStore || {})) {
    const items = (s && s.items) || [];
    if (!storeId || !items.length) continue;
    const { data: deliv, error: hErr } = await supabase.from("store_deliveries")
      .insert({ store_id: storeId, dist_order_id: null,
                dispatch_id: meta.ref ? `fresh:${meta.ref}` : "fresh-purchase",
                status: "incoming", dispatched_at: new Date().toISOString() })
      .select().single();
    if (hErr) { console.error("fresh delivery header failed:", hErr.message); continue; }
    // Alias lookup: names a human has matched before link straight to the
    // real store item — receiving then moves inventory instead of orphaning.
    let aliasMap = null;
    try { aliasMap = await fetchItemAliases(); } catch { aliasMap = new Map(); }
    const rows = items.map(it => ({
      delivery_id: deliv.id, dist_item_id: null,
      store_item_id: it.storeItemId || lookupAlias(aliasMap, it.desc, meta.vendor) || null,
      item_name: `${it.desc || "Item"}${meta.vendor ? ` (${meta.vendor})` : ""}`,
      qty_dispatched: Number(it.units) || 0,
      unit_cost: it.price != null ? Number(it.price) : null,
    }));
    const { error: lErr } = await supabase.from("store_delivery_lines").insert(rows);
    if (lErr) console.error("fresh delivery lines failed:", lErr.message);
    created.push({ storeId, deliveryId: deliv.id });
  }
  return created;
}

export async function confirmStoreDelivery(deliveryId, receivedBy) {
  const { head, lines } = await fetchStoreDeliveryDetail(deliveryId);
  if (!head) throw new Error("Delivery not found.");
  if (head.status === "confirmed") throw new Error("This delivery is already confirmed.");
  const storeId = head.store_id;
  let shortfalls = 0;

  for (const l of lines) {
    const recv = l.qty_received != null ? Number(l.qty_received) : 0;
    // Resolve the store item. If this dist item has no store counterpart yet,
    // create one on the fly so the received stock has somewhere to land
    // (dist catalogue is larger than store inventory; ordering a dist-only item
    // must not silently vanish on receipt).
    let storeItemId = l.store_item_id;
    if (!storeItemId && recv > 0 && l.dist_item_id) {
      storeItemId = await ensureStoreItemForDistItem(l.dist_item_id, l.item_name, l.unit_cost);
      if (storeItemId) {
        // backfill the link on the delivery line for traceability
        await supabase.from("store_delivery_lines").update({ store_item_id: storeItemId }).eq("id", l.id);
      }
    }
    if (storeItemId && recv > 0) {
      // Movement (ledger)
      await supabase.from("store_stock_movements").insert({
        store_id: storeId, item_id: storeItemId, qty: recv, type: "receipt",
        ref: `delivery-${deliveryId}`, unit_cost: l.unit_cost != null ? Number(l.unit_cost) : null,
        note: `Received on delivery ${deliveryId}`, created_by: receivedBy || null,
      });
      // ACCOUNTS: auto-record the received goods into the store's purchases
      // register (cogs_purchases) so Actual COGS (opening + purchases − closing)
      // picks them up without re-keying. Ref ties back to the delivery.
      // Fresh-purchase lines (no store item) are deliberately EXCLUDED — their
      // cost is already in Finance as the driver's card expense; recording them
      // here too would double-count food cost.
      try {
        await supabase.from("cogs_purchases").insert({
          store_id: storeId, purchase_date: new Date().toISOString().slice(0, 10),
          item_scope: "store", item_id: storeItemId,
          qty: recv,
          total_cost: l.unit_cost != null ? Math.round(Number(l.unit_cost) * recv * 100) / 100 : null,
          supplier: head.supplier_name || "Distribution", invoice_ref: `delivery-${deliveryId}`,
          note: l.item_name || null,
        });
      } catch (e) { console.error("auto purchase record failed:", e.message); }
      // Upsert live level (qty += recv; moving cost := latest delivery cost if given)
      const { data: existing } = await supabase.from("store_stock")
        .select("id, qty_on_hand").eq("store_id", storeId).eq("item_id", storeItemId).maybeSingle();
      if (existing) {
        const patch = { qty_on_hand: Number(existing.qty_on_hand) + recv, updated_at: new Date().toISOString() };
        if (l.unit_cost != null) patch.moving_cost = Number(l.unit_cost);
        await supabase.from("store_stock").update(patch).eq("id", existing.id);
      } else {
        await supabase.from("store_stock").insert({
          store_id: storeId, item_id: storeItemId, qty_on_hand: recv,
          moving_cost: l.unit_cost != null ? Number(l.unit_cost) : null,
        });
      }
    }
    // Shortfall flag (dispatched > received)
    const shortQty = Math.max((Number(l.qty_dispatched) || 0) - recv, 0);
    if (shortQty > 0) {
      shortfalls++;
      await supabase.from("store_delivery_lines").update({ short_reported: true }).eq("id", l.id);
    }
  }

  await supabase.from("store_deliveries").update({
    status: "confirmed", received_at: new Date().toISOString(), received_by: receivedBy || null,
  }).eq("id", deliveryId);

  // Direct-supplier delivery: mark its order received too.
  if (typeof head.dispatch_id === "string" && head.dispatch_id.startsWith("direct:")) {
    const doId = Number(head.dispatch_id.slice(7));
    if (doId) { try { await supabase.from("direct_orders").update({ status: "received" }).eq("id", doId); } catch { /* best-effort */ } }
  }

  return { confirmed: true, shortfalls };
}

// The store's receipt for a given sales order — attached to the order so
// Dist sees exactly what the store says arrived, line by line, short flags
// included. Null until the dispatch mirror created the delivery.
export async function fetchOrderStoreReceipt(soId) {
  const { data: deliv } = await supabase.from("store_deliveries")
    .select("*").eq("dist_order_id", soId).order("dispatched_at", { ascending: false }).limit(1).maybeSingle();
  if (!deliv) return null;
  const { data: lines } = await supabase.from("store_delivery_lines")
    .select("*").eq("delivery_id", deliv.id).order("item_name");
  return {
    id: deliv.id, status: deliv.status, receivedAt: deliv.received_at || null,
    receivedBy: deliv.received_by || "", supplierName: deliv.supplier_name || null,
    lines: (lines || []).map(l => ({
      id: l.id, itemName: l.item_name || "Item",
      qtySent: Number(l.qty_dispatched) || 0,
      qtyReceived: l.qty_received != null ? Number(l.qty_received) : null,
      short: !!l.short_reported,
    })),
  };
}

// Shortfall report for Dist: confirmed deliveries with any short line.
export async function fetchDeliveryShortfalls({ storeId } = {}) {
  let q = supabase.from("store_delivery_lines")
    .select("*, store_deliveries!inner(store_id, dist_order_id, status, received_at)")
    .gt("short_qty", 0);
  const { data, error } = await q;
  if (error) throw error;
  let rows = (data || []).filter(r => r.store_deliveries && r.store_deliveries.status === "confirmed");
  if (storeId) rows = rows.filter(r => r.store_deliveries.store_id === storeId);
  return rows;
}

// ─── DIST → CENTRAL KITCHEN RECEIVING BRIDGE ────────────────────────────────
// Mirrors the store pattern for the CK customer (dist_contacts.is_central_kitchen):
// dispatch → ck_delivery (incoming) → CK confirms received quantities →
// ck_goods_in FEFO batches (dispatch unit costs feed CK costing), shortfall
// flags when received < dispatched. Resolution via cogs_ck_items.dist_item_id
// with the same auto-create safety net the stores get.

async function _ckSiteId() {
  const { data } = await supabase.from("stores").select("id")
    .eq("site_type", "central_kitchen").is("archived_at", null).limit(1).maybeSingle();
  return data?.id || null;
}

async function _isCkSalesOrder(soId) {
  try {
    const { data: so } = await supabase.from("dist_sales_orders")
      .select("customer_id").eq("id", soId).maybeSingle();
    if (!so?.customer_id) return false;
    const { data: c } = await supabase.from("dist_contacts")
      .select("is_central_kitchen").eq("id", so.customer_id).maybeSingle();
    return !!c?.is_central_kitchen;
  } catch { return false; }
}

// Convert a dispatched line to the kitchen-facing quantity + unit.
// A case = pack_count × pack_size pack_unit (e.g. 1×15 L). The kitchen enters
// received amounts in that unit (L/kg/pcs), not in cases.
export function ckLineEquivalent(line) {
  const count = Number(line.pack_count ?? line.packCount) || 1;
  const size = line.pack_size ?? line.packSize;
  const unit = (line.pack_unit ?? line.packUnit) || "ea";
  const perCase = size != null ? count * Number(size) : count;
  const cases = Number(line.qty_dispatched ?? line.qtyDispatched) || 0;
  return { perCase, unit, equivalent: cases * perCase };
}

// Best-effort mirror at dispatch time. Returns the delivery id or null.
export async function createCkDeliveryFromDispatch(soId, dispatchId, dispatchLines) {
  try {
    if (!(await _isCkSalesOrder(soId))) return null;
    const siteId = await _ckSiteId();
    const distIds = [...new Set((dispatchLines || []).map(l => l.itemId).filter(Boolean))];
    const distById = new Map();
    if (distIds.length) {
      const { data: di } = await supabase.from("dist_items")
        .select("id, name, pack_count, pack_size, pack_unit").in("id", distIds);
      (di || []).forEach(d => distById.set(d.id, d));
    }
    const { data: ckItems } = await supabase.from("cogs_ck_items")
      .select("id, name, dist_item_id").in("dist_item_id", distIds.length ? distIds : ["__none__"]).is("archived_at", null);
    const ckByDist = new Map((ckItems || []).map(s => [s.dist_item_id, s]));

    const { data: deliv, error: hErr } = await supabase.from("ck_deliveries")
      .insert({ site_id: siteId, dist_order_id: soId, dispatch_id: dispatchId || null,
                status: "incoming", dispatched_at: new Date().toISOString() })
      .select().single();
    if (hErr) { console.error("ck delivery header failed:", hErr.message); return null; }

    const lineRows = (dispatchLines || []).map(l => {
      const di = distById.get(l.itemId) || {};
      const ck = ckByDist.get(l.itemId);
      return {
        delivery_id: deliv.id,
        dist_item_id: l.itemId || null,
        ck_item_id: ck ? ck.id : null,
        item_name: (ck && ck.name) || di.name || "Item",
        qty_dispatched: Number(l.qty) || 0,
        pack_count: di.pack_count != null ? Number(di.pack_count) : 1,
        pack_size: di.pack_size != null ? Number(di.pack_size) : null,
        pack_unit: di.pack_unit || "",
        unit_price: l.unitPrice != null ? Number(l.unitPrice) : null,
      };
    });
    if (lineRows.length) {
      const { error: lErr } = await supabase.from("ck_delivery_lines").insert(lineRows);
      if (lErr) console.error("ck delivery lines failed:", lErr.message);
    }
    return deliv.id;
  } catch (e) {
    console.error("createCkDeliveryFromDispatch error:", e.message);
    return null;
  }
}

export async function fetchIncomingCkDeliveries(siteId) {
  let q = supabase.from("ck_deliveries").select("*").in("status", ["incoming", "receiving"])
    .order("dispatched_at", { ascending: false });
  if (siteId) q = q.eq("site_id", siteId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchCkDeliveryDetail(deliveryId) {
  const [{ data: head }, { data: lines }] = await Promise.all([
    supabase.from("ck_deliveries").select("*").eq("id", deliveryId).maybeSingle(),
    supabase.from("ck_delivery_lines").select("*").eq("delivery_id", deliveryId).order("id"),
  ]);
  return { head, lines: lines || [] };
}

export async function saveCkDeliveryReceipt(deliveryId, lines) {
  for (const l of (lines || [])) {
    await supabase.from("ck_delivery_lines").update({
      qty_received: l.qtyReceived != null && l.qtyReceived !== "" ? Number(l.qtyReceived) : null,
      recv_unit: l.recvUnit || "",
    }).eq("id", l.id);
  }
  await supabase.from("ck_deliveries").update({ status: "receiving" }).eq("id", deliveryId);
  return true;
}

// Ensure a CK ingredient exists for a dist item (mirror of the store version).
async function ensureCkItemForDistItem(distItemId, fallbackName) {
  if (!distItemId) return null;
  const { data: existing } = await supabase.from("cogs_ck_items")
    .select("id").eq("dist_item_id", distItemId).limit(1).maybeSingle();
  if (existing) return existing.id;
  const { data: di } = await supabase.from("dist_items")
    .select("name, category, pack_count, pack_size, pack_unit, purchase_rate")
    .eq("id", distItemId).maybeSingle();
  const name = (di?.name || fallbackName || "Unnamed item").trim();
  const packCount = di?.pack_count != null ? Number(di.pack_count) : 1;
  const packSize = di?.pack_size != null ? Number(di.pack_size) : null;
  const packUnit = di?.pack_unit || "ea";
  const body = {
    name, category: di?.category || "Other Items", base_unit: packUnit,
    pack_desc: packSize != null ? `${packCount}*${packSize}${packUnit}` : `${packCount}${packUnit ? "*" + packUnit : ""}`,
    pack_qty: packSize != null ? packSize * packCount : packCount,
    pack_price: di?.purchase_rate != null ? Number(di.purchase_rate) : null,
    dist_item_id: distItemId,
  };
  const { data: created, error } = await supabase.from("cogs_ck_items").insert(body).select("id").single();
  if (error) { console.error("ensureCkItemForDistItem failed:", error.message); return null; }
  return created.id;
}

// CONFIRM: each received line becomes a ck_goods_in FEFO batch — qty in the
// kitchen unit, unit cost derived from the dispatch price per case, supplier
// "Distribution", ref back to the delivery. Shortfalls flagged when the
// received amount is below the dispatched equivalent.
export async function confirmCkDelivery(deliveryId, receivedBy) {
  const { head, lines } = await fetchCkDeliveryDetail(deliveryId);
  if (!head) throw new Error("Delivery not found.");
  if (head.status === "confirmed") throw new Error("This delivery is already confirmed.");
  const siteId = head.site_id || await _ckSiteId();
  const today = new Date().toISOString().slice(0, 10);
  let shortfalls = 0;

  for (const l of lines) {
    const { perCase, unit, equivalent } = ckLineEquivalent(l);
    const recv = l.qty_received != null ? Number(l.qty_received) : 0;
    const recvUnit = l.recv_unit || unit;

    let ckItemId = l.ck_item_id;
    if (!ckItemId && recv > 0 && l.dist_item_id) {
      ckItemId = await ensureCkItemForDistItem(l.dist_item_id, l.item_name);
      if (ckItemId) await supabase.from("ck_delivery_lines").update({ ck_item_id: ckItemId }).eq("id", l.id);
    }
    if (ckItemId && recv > 0) {
      // £ per kitchen unit = £ per case ÷ units per case.
      const unitCost = (l.unit_price != null && perCase > 0) ? +(Number(l.unit_price) / perCase).toFixed(4) : null;
      await supabase.from("ck_goods_in").insert({
        id: `gin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        site_id: siteId, ingredient_id: String(ckItemId),
        qty_received: recv, qty_remaining: recv, unit: recvUnit,
        batch_no: `DEL-${deliveryId}-${l.id}`, supplier: "Distribution",
        received_date: today, unit_cost: unitCost,
        total_cost: unitCost != null ? +(unitCost * recv).toFixed(2) : null,
        invoice_ref: `dist-delivery-${deliveryId}`, received_by: receivedBy || null,
        note: `Received from Distribution (order ${head.dist_order_id || "?"})`,
      });
      await supabase.from("ck_delivery_lines").update({ unit_cost: unitCost }).eq("id", l.id);
    }
    if (recv + 0.0005 < equivalent) {
      shortfalls++;
      await supabase.from("ck_delivery_lines").update({ short_reported: true }).eq("id", l.id);
    }
  }

  await supabase.from("ck_deliveries").update({
    status: "confirmed", received_at: new Date().toISOString(), received_by: receivedBy || null,
  }).eq("id", deliveryId);
  return { confirmed: true, shortfalls };
}

// ─── PHASE 4: COGS depletion of store stock (the DOWN side) ──────────────────
// Near-real-time, idempotent. Walks flipdish_sales → POS map → product recipe
// (ingredients + preps, STORE-SCOPE ONLY — never CK) → writes negative 'cogs'
// movements to store_stock_movements and decrements store_stock.
// Idempotency: each sale deducts exactly once, tracked by movement ref
// 'sale:{sale_id}'. Safe to re-run — already-deducted sales are skipped.

// Deplete store stock from a store's sales for a given date (idempotent).
// Returns { processed, skipped, movements }.
export async function depleteStoreStockFromSales(storeId, date) {
  if (!storeId || !date) throw new Error("storeId and date required.");

  const [recipes, mapsRaw, modMaps, salesRes] = await Promise.all([
    fetchRecipes(),
    fetchPosMappings(storeId).catch(() => []),
    fetchModifierMappings(storeId).catch(() => []),
    supabase.from("flipdish_sales")
      .select("sale_id, sale_items, is_cancelled, business_date")
      .eq("store_id", storeId).eq("business_date", date),
  ]);
  const sales = (salesRes.data || []).filter(s => !s.is_cancelled);
  if (!sales.length) return { processed: 0, skipped: 0, movements: 0 };

  // SAME traversal as the order-page planner (computeStoreItemConsumptionV2):
  // base recipe + matched modifiers + collapse groups + refund/comp exclusion,
  // and the RMS line shape (li.caption/quantity — the old walker read li.name,
  // which RMS lines don't carry, so it silently deducted nothing). Only
  // store-scoped keys deplete store stock; CK keys are ignored by design.
  const walker = buildRecipeConsumptionWalker(recipes, mapsRaw, modMaps);

  // Which sales already deducted? (idempotency by ref)
  const saleIds = sales.map(s => `sale:${s.sale_id}`);
  const doneRefs = new Set();
  if (saleIds.length) {
    const { data: existing } = await supabase.from("store_stock_movements")
      .select("ref").eq("store_id", storeId).eq("type", "cogs").in("ref", saleIds);
    (existing || []).forEach(r => doneRefs.add(r.ref));
  }

  let processed = 0, skipped = 0, movements = 0;
  for (const sale of sales) {
    const ref = `sale:${sale.sale_id}`;
    if (doneRefs.has(ref)) { skipped++; continue; }

    // Aggregate store-item consumption for this whole sale (walker emits
    // "scope:itemId" keys; only store-scoped ones deplete store stock).
    const consume = new Map(); // storeItemId -> qty
    walker.walkSale(sale, {
      addUsage: (useMap, mult) => {
        useMap.forEach((v, k) => {
          if (!k.startsWith("store:")) return;
          const itemId = k.slice(6);
          consume.set(itemId, (consume.get(itemId) || 0) + v * mult);
        });
      },
    });

    if (consume.size === 0) { processed++; continue; } // nothing store-scoped to deduct

    // Write negative movements + decrement live stock.
    for (const [itemId, qty] of consume.entries()) {
      if (!(qty > 0)) continue;
      await supabase.from("store_stock_movements").insert({
        store_id: storeId, item_id: itemId, qty: -qty, type: "cogs",
        ref, note: `COGS depletion from sale ${sale.sale_id}`,
      });
      movements++;
      const { data: ss } = await supabase.from("store_stock")
        .select("id, qty_on_hand").eq("store_id", storeId).eq("item_id", itemId).maybeSingle();
      if (ss) {
        await supabase.from("store_stock").update({ qty_on_hand: Number(ss.qty_on_hand) - qty, updated_at: new Date().toISOString() }).eq("id", ss.id);
      } else {
        // No stock row yet → create one at negative (visible as oversold until a count/delivery).
        await supabase.from("store_stock").insert({ store_id: storeId, item_id: itemId, qty_on_hand: -qty });
      }
    }
    processed++;
  }
  return { processed, skipped, movements };
}

// ─── RECIPE CARDS — office creates, all stores view ─────────────────────────
// List cards for the browse view (published only by default).
export async function fetchRecipeCards({ includeUnpublished = false } = {}) {
  let q = supabase.from("recipe_cards").select("id, name, main_category, category, published, updated_at").order("name");
  if (!includeUnpublished) q = q.eq("published", true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Full card (with its data JSON) for the viewer/editor.
export async function fetchRecipeCard(id) {
  const { data, error } = await supabase.from("recipe_cards").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

// Create or update a card. Pass id to update, omit to create.
export async function saveRecipeCard({ id, name, mainCategory, category, data, published = true, createdBy }) {
  const fields = { name, main_category: mainCategory || null, category: category || null, data, published };
  if (id) {
    const { data: row, error } = await supabase.from("recipe_cards")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) throw error;
    return row;
  }
  const { data: row, error } = await supabase.from("recipe_cards")
    .insert({ ...fields, created_by: createdBy || null })
    .select().single();
  if (error) throw error;
  return row;
}

export async function deleteRecipeCard(id) {
  const { error } = await supabase.from("recipe_cards").delete().eq("id", id);
  if (error) throw error;
  return id;
}

// Duplicate a card (copies all fields, appends "(copy)" to the name).
export async function duplicateRecipeCard(id) {
  const { data: src, error: e1 } = await supabase.from("recipe_cards").select("*").eq("id", id).maybeSingle();
  if (e1) throw e1;
  if (!src) throw new Error("Recipe not found.");
  const data = src.data || {};
  const newName = `${src.name || "Untitled"} (copy)`;
  const { data: row, error } = await supabase.from("recipe_cards")
    .insert({ name: newName, main_category: src.main_category, category: src.category,
      data: { ...data, name: newName }, published: src.published })
    .select().single();
  if (error) throw error;
  return row;
}

// Rename / re-file a card (name, main_category, category) without touching the design.
// TREE-LEVEL OPS — categories are derived from recipe fields, so these bulk-update.
export async function renameRecipeMainCategory(oldMain, newMain) {
  const q = supabase.from("recipe_cards").update({ main_category: newMain || null, updated_at: new Date().toISOString() });
  const { error } = oldMain ? await q.eq("main_category", oldMain) : await q.is("main_category", null);
  if (error) throw error; return true;
}
export async function renameRecipeCategory(main, oldCat, newCat) {
  let q = supabase.from("recipe_cards").update({ category: newCat || null, updated_at: new Date().toISOString() });
  q = main ? q.eq("main_category", main) : q.is("main_category", null);
  q = oldCat ? q.eq("category", oldCat) : q.is("category", null);
  const { error } = await q; if (error) throw error; return true;
}
export async function moveRecipeCard(id, { mainCategory, category }) {
  const { error } = await supabase.from("recipe_cards")
    .update({ main_category: mainCategory || null, category: category || null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error; return true;
}
export async function deleteRecipeMainCategory(main) {
  const q = supabase.from("recipe_cards").delete();
  const { error } = main ? await q.eq("main_category", main) : await q.is("main_category", null);
  if (error) throw error; return true;
}
export async function deleteRecipeCategory(main, cat) {
  let q = supabase.from("recipe_cards").delete();
  q = main ? q.eq("main_category", main) : q.is("main_category", null);
  q = cat ? q.eq("category", cat) : q.is("category", null);
  const { error } = await q; if (error) throw error; return true;
}
export async function createRecipeInCategory(mainCategory, category, name) {
  const nm = name || "New recipe";
  const data = { name:nm, script:"Build", brand:"choco-tini", time:"", crockery:"", photo:null,
    style:{ accent:"#844429", headBar:"#E4C9AE", panel:"#FBF6EC", iconSize:48, stepCols:3, showBands:true, showTimeBadge:true },
    steps:[], ingredients:[], tools:[] };
  const { data: row, error } = await supabase.from("recipe_cards")
    .insert({ name:nm, main_category:mainCategory||null, category:category||null, data, published:true })
    .select().single();
  if (error) throw error; return row;
}

export async function renameRecipeCard(id, { name, mainCategory, category }) {
  const patch = { updated_at: new Date().toISOString() };
  if (name !== undefined) patch.name = name;
  if (mainCategory !== undefined) patch.main_category = mainCategory || null;
  if (category !== undefined) patch.category = category || null;
  // keep data.name in sync if the display name changed
  if (name !== undefined) {
    const { data: src } = await supabase.from("recipe_cards").select("data").eq("id", id).maybeSingle();
    if (src?.data) patch.data = { ...src.data, name };
  }
  const { data: row, error } = await supabase.from("recipe_cards").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return row;
}


// ===== FLEET_FUEL_V1 — fuel-card control for distribution vans ===============
// Flow: driver enters the odometer BEFORE filling (validated against the van's
// last recorded reading), shows the reg+mileage kiosk card to the attendant so
// the number Allstar records is the number in our system, then completes the
// fill with litres/£/receipt photo. Flags are computed automatically at
// completion; abandoned pending fills are themselves flagged.

const _vehicleMap = (r) => ({
  id: r.id, reg: r.reg, label: r.label || "", fuelType: r.fuel_type || "diesel",
  tankLitres: r.tank_litres != null ? Number(r.tank_litres) : null,
  cardNumber: r.card_number || "", active: r.active ?? true,
  createdAt: r.created_at, updatedAt: r.updated_at,
});
const _fuelTxnMap = (r) => ({
  id: r.id, vehicleId: r.vehicle_id, driverId: r.driver_id, driverName: r.driver_name || "",
  status: r.status, startedAt: r.started_at, completedAt: r.completed_at,
  odometer: r.odometer != null ? Number(r.odometer) : null,
  litres: r.litres != null ? Number(r.litres) : null,
  amount: r.amount != null ? Number(r.amount) : null,
  station: r.station || "", receiptUrl: r.receipt_url || "",
  lat: r.lat != null ? Number(r.lat) : null, lng: r.lng != null ? Number(r.lng) : null,
  miles: r.miles != null ? Number(r.miles) : null, mpg: r.mpg != null ? Number(r.mpg) : null,
  source: r.source || "driver_log", flags: r.flags || [],
  flagStatus: r.flag_status || "ok", reviewNote: r.review_note || "", reviewedBy: r.reviewed_by || "",
});

export async function fetchFleetVehicles({ includeInactive = false } = {}) {
  let q = supabase.from("fleet_vehicles").select("*").order("reg");
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(_vehicleMap);
}

export async function upsertFleetVehicle(v) {
  const row = {
    id: v.id || `fv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    reg: (v.reg || "").trim().toUpperCase(), label: v.label || "",
    fuel_type: v.fuelType || "diesel",
    tank_litres: v.tankLitres === "" || v.tankLitres == null ? null : Number(v.tankLitres),
    card_number: v.cardNumber || "", active: v.active ?? true,
    updated_at: new Date().toISOString(),
  };
  if (!row.reg) throw new Error("Registration is required.");
  const { data, error } = await supabase.from("fleet_vehicles").upsert(row).select().single();
  if (error) throw error;
  return _vehicleMap(data);
}

// Last COMPLETED fill for a vehicle — the odometer baseline for validation.
async function _lastCompletedFill(vehicleId, beforeIso = null) {
  let q = supabase.from("fuel_transactions").select("*")
    .eq("vehicle_id", vehicleId).eq("status", "complete")
    .order("completed_at", { ascending: false }).limit(1);
  if (beforeIso) q = q.lt("completed_at", beforeIso);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data ? _fuelTxnMap(data) : null;
}

// Step 1 — driver enters odometer at the van, before walking to the kiosk.
// Validates against the van's last reading (hard block: can't go backwards).
// If the driver already has a pending fill, it's returned so they can resume.
export async function startFuelFill({ vehicleId, driverId, driverName, odometer, lat = null, lng = null }) {
  if (!vehicleId) throw new Error("Pick a vehicle first.");
  const odo = Number(odometer);
  if (!odo || odo <= 0) throw new Error("Enter the odometer reading from the dashboard.");
  // Resume an existing pending fill for this driver (any vehicle).
  const { data: mine } = await supabase.from("fuel_transactions").select("*")
    .eq("driver_id", driverId).eq("status", "pending")
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (mine) return { txn: _fuelTxnMap(mine), resumed: true };
  const last = await _lastCompletedFill(vehicleId);
  if (last && last.odometer != null && odo < last.odometer) {
    throw new Error(`That reading (${odo.toLocaleString()}) is LOWER than this van's last recorded mileage (${last.odometer.toLocaleString()}). Check the dashboard and try again.`);
  }
  const row = {
    id: `ft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    vehicle_id: vehicleId, driver_id: driverId || null, driver_name: driverName || "",
    status: "pending", started_at: new Date().toISOString(),
    odometer: odo, lat, lng, source: "driver_log",
  };
  const { data, error } = await supabase.from("fuel_transactions").insert(row).select().single();
  if (error) throw error;
  return { txn: _fuelTxnMap(data), resumed: false };
}

export async function cancelFuelFill(id) {
  const { error } = await supabase.from("fuel_transactions").delete().eq("id", id).eq("status", "pending");
  if (error) throw error;
}

export async function uploadFuelReceipt(file) {
  if (!file) return "";
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" }[(file.type || "").toLowerCase()] || "jpg";
  const token = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const path = `receipts/${token}.${ext}`;
  const { error } = await supabase.storage.from("fuel-receipts")
    .upload(path, file, { contentType: file.type || "image/jpeg", cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from("fuel-receipts").getPublicUrl(path);
  return publicUrl;
}

// Step 3 — after paying: litres, £, station, receipt photo. Flags computed here.
export async function completeFuelFill(id, { litres, amount, station = "", receiptFile = null }) {
  const L = Number(litres), A = Number(amount);
  if (!L || L <= 0) throw new Error("Enter the litres from the pump/receipt.");
  if (!A || A <= 0) throw new Error("Enter the £ amount from the receipt.");
  const { data: txnRow, error: tErr } = await supabase.from("fuel_transactions").select("*").eq("id", id).maybeSingle();
  if (tErr) throw tErr;
  if (!txnRow) throw new Error("This fill can't be found — start again.");
  if (txnRow.status === "complete") throw new Error("This fill is already logged.");
  const txn = _fuelTxnMap(txnRow);
  const { data: vRow } = await supabase.from("fleet_vehicles").select("*").eq("id", txn.vehicleId).maybeSingle();
  const vehicle = vRow ? _vehicleMap(vRow) : null;

  let receiptUrl = "";
  try { receiptUrl = await uploadFuelReceipt(receiptFile); } catch (e) { console.warn("receipt upload failed:", e.message); }

  // ── Flags ──────────────────────────────────────────────────────────────────
  const flags = [];
  if (vehicle?.tankLitres && L > vehicle.tankLitres * 1.05) {
    flags.push(`Overfill: ${L}L exceeds the van's ${vehicle.tankLitres}L tank`);
  }
  const nowIso = new Date().toISOString();
  const prev = await _lastCompletedFill(txn.vehicleId, nowIso);
  let miles = null, mpg = null;
  if (prev) {
    const hoursSince = (Date.now() - new Date(prev.completedAt).getTime()) / 36e5;
    if (hoursSince < 6) flags.push(`Second fill within ${Math.round(hoursSince * 10) / 10}h of the previous one`);
    if (prev.odometer != null && txn.odometer != null) {
      miles = Math.round((txn.odometer - prev.odometer) * 10) / 10;
      if (miles <= 0) flags.push("Odometer has not increased since the last fill");
      else {
        if (miles > 1200) flags.push(`Implausible mileage jump: ${miles.toLocaleString()} miles since last fill`);
        mpg = Math.round((miles / (L / 4.54609)) * 10) / 10;
        // Rolling MPG norm: median of this van's last completed fills with mpg.
        const { data: hist } = await supabase.from("fuel_transactions").select("mpg")
          .eq("vehicle_id", txn.vehicleId).eq("status", "complete").not("mpg", "is", null)
          .order("completed_at", { ascending: false }).limit(8);
        const samples = (hist || []).map(h => Number(h.mpg)).filter(x => x > 0);
        if (samples.length >= 3) {
          const sorted = [...samples].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)];
          if (median > 0 && Math.abs(mpg - median) / median > 0.35) {
            flags.push(`MPG ${mpg} is ${mpg < median ? "well below" : "well above"} this van's norm (~${median})`);
          }
        }
      }
    }
  }
  // Long gap between starting the fill and completing it (> 2h) is suspicious.
  const startedH = (Date.now() - new Date(txn.startedAt).getTime()) / 36e5;
  if (startedH > 2) flags.push(`Completed ${Math.round(startedH * 10) / 10}h after the odometer was entered`);

  const patch = {
    status: "complete", completed_at: nowIso, litres: L, amount: A,
    station: station || "", receipt_url: receiptUrl,
    miles, mpg, flags, flag_status: flags.length ? "flagged" : "ok",
    updated_at: nowIso,
  };
  const { data, error } = await supabase.from("fuel_transactions").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return _fuelTxnMap(data);
}

// Admin fetch. Also sweeps stale pending fills (>2h) into expired+flagged —
// someone entered a mileage, fuelled, and never logged the amount.
// ── VEHICLE MILEAGE (shift bookends) ─────────────────────────────────────────
// Odometer at clock-in and clock-out, enforced for drivers. The highest known
// reading (mileage logs ∪ fuel logs) is the floor for the next entry — same
// hard-block the fuel flow uses, so odometers can only go forward.

export async function lastVehicleOdometer(vehicleId) {
  const [{ data: m }, { data: f }] = await Promise.all([
    supabase.from("vehicle_mileage_logs").select("odometer").eq("vehicle_id", vehicleId)
      .order("odometer", { ascending: false }).limit(1),
    supabase.from("fuel_transactions").select("odometer").eq("vehicle_id", vehicleId)
      .order("odometer", { ascending: false }).limit(1),
  ]);
  const a = m && m[0] ? Number(m[0].odometer) : null;
  const b = f && f[0] ? Number(f[0].odometer) : null;
  if (a == null && b == null) return null;
  return Math.max(a ?? -Infinity, b ?? -Infinity);
}

export async function addVehicleMileage({ vehicleId, memberId, memberName, kind, odometer, punchId }) {
  const { data, error } = await supabase.from("vehicle_mileage_logs").insert({
    vehicle_id: vehicleId, member_id: memberId || null, member_name: memberName || null,
    kind, odometer: Number(odometer), punch_id: punchId || null,
  }).select().single();
  if (error) throw error;
  return data;
}

// The vehicle a shift is CURRENTLY on: latest start-type log for the punch
// (shift_start, or vehicle_swap_in after a mid-shift change).
export async function currentPunchVehicle(punchId) {
  const { data } = await supabase.from("vehicle_mileage_logs").select("vehicle_id, kind, odometer, logged_at")
    .eq("punch_id", punchId).in("kind", ["shift_start", "vehicle_swap_in"])
    .order("logged_at", { ascending: false }).limit(1);
  return data && data[0] ? { vehicleId: data[0].vehicle_id, odometer: data[0].odometer } : null;
}

export async function fetchVehicleMileageLogs({ days = 14 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase.from("vehicle_mileage_logs")
    .select("*").gte("logged_at", since).order("logged_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchFuelTransactions({ vehicleId = null, days = 30, flaggedOnly = false } = {}) {
  const cutoff = new Date(Date.now() - 2 * 36e5).toISOString();
  await supabase.from("fuel_transactions")
    .update({ status: "expired", flag_status: "flagged", flags: ["Started but never completed — odometer entered, no amount logged"], updated_at: new Date().toISOString() })
    .eq("status", "pending").lt("started_at", cutoff);
  const fromIso = new Date(Date.now() - days * 864e5).toISOString();
  let q = supabase.from("fuel_transactions").select("*").gte("started_at", fromIso)
    .order("started_at", { ascending: false }).limit(500);
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  if (flaggedOnly) q = q.eq("flag_status", "flagged");
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(_fuelTxnMap);
}

export async function fetchMyPendingFill(driverId) {
  const { data, error } = await supabase.from("fuel_transactions").select("*")
    .eq("driver_id", driverId).eq("status", "pending")
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? _fuelTxnMap(data) : null;
}

// Manager resolves a flagged transaction with a note (mirrors break claims).
export async function reviewFuelTransaction(id, { note, reviewedBy }) {
  const { error } = await supabase.from("fuel_transactions")
    .update({ flag_status: "explained", review_note: note || "", reviewed_by: reviewedBy || "", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
// ===== end FLEET_FUEL_V1 =====
