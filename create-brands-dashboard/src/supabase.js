// ─── supabase.js ─────────────────────────────────────────────────────────────
// Complete file — existing financial functions + new OpsHub functions.
// Replace your current supabase.js with this file entirely.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

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
  return { id: e.id, brand_id: e.brandId, brand_name: e.brandName, date: e.date, manager: e.manager, submitted_by: e.submittedBy, net_sales: e.netSales, card_revenue: e.cardRevenue, cash_expected: e.cashExpected, physical_cash: e.physicalCash, cash_variance: e.cashVariance, variance_justification: e.varianceJustification, opening_float: e.openingFloat, closing_float: e.closingFloat, labor_cost: e.laborCost, cogs_cost: e.cogsCost, total_hours: e.totalHours, total_orders: e.totalOrders, atv: e.atv, five_star_reviews: e.fiveStarReviews, mid_star_reviews: e.midStarReviews, one_star_reviews: e.oneStarReviews, notes: e.notes, maintenance_tickets: e.maintenanceTickets, timestamp: e.timestamp };
}
function dbEntryToApp(e) {
  return { id: e.id, brandId: e.brand_id, brandName: e.brand_name, date: e.date, manager: e.manager, submittedBy: e.submitted_by, netSales: e.net_sales, cardRevenue: e.card_revenue, cashExpected: e.cash_expected, physicalCash: e.physical_cash, cashVariance: e.cash_variance, varianceJustification: e.variance_justification, openingFloat: e.opening_float, closingFloat: e.closing_float, laborCost: e.labor_cost, cogsCost: e.cogs_cost, totalHours: e.total_hours, totalOrders: e.total_orders, atv: e.atv, fiveStarReviews: e.five_star_reviews, midStarReviews: e.mid_star_reviews, oneStarReviews: e.one_star_reviews, notes: e.notes, maintenanceTickets: e.maintenance_tickets ?? [], timestamp: e.timestamp };
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

function appAssignmentToDb(a) { return { id: a.id, brand_id: a.brandId, store_id: a.storeId || null, type: a.type, task_id: a.taskId, role: a.role || "", person_id: a.personId || "", freq: a.freq, weekday: a.weekday || null, once_date: a.date || null, custom_days: a.customDays || [], win_start: a.winStart, win_end: a.winEnd, priority: a.priority, notes: a.notes || "", updated_at: new Date().toISOString() }; }
function dbAssignmentToApp(a) { return { id: a.id, brandId: a.brand_id, storeId: a.store_id || null, type: a.type, taskId: a.task_id, role: a.role, personId: a.person_id, freq: a.freq, weekday: a.weekday, date: a.once_date, customDays: a.custom_days || [], winStart: a.win_start, winEnd: a.win_end, priority: a.priority, notes: a.notes }; }

function appOpsTeamToDb(m) {
  return {
    id: m.id, brand_id: m.brandId,
    first_name: m.firstName, last_name: m.lastName || "",
    nickname: m.nickname || "", department: m.department || "",
    role: m.role, pin: m.pin || "", color: m.color || "#6366f1",
    hourly_rate: m.hourlyRate || 0,
    // New store-aware fields. store_ids: text[] — a staff member may work at
    // several stores (the floating-barista case). role_id/department_id are
    // optional references into store_roles/store_departments.
    store_ids: m.storeIds || [],
    role_id: m.roleId || null,
    department_id: m.departmentId || null,
    updated_at: new Date().toISOString(),
  };
}
function dbOpsTeamToApp(m) {
  return {
    id: m.id, brandId: m.brand_id,
    firstName: m.first_name, lastName: m.last_name,
    nickname: m.nickname || "", department: m.department || "",
    role: m.role, pin: m.pin, color: m.color,
    hourlyRate: m.hourly_rate != null ? parseFloat(m.hourly_rate) : 0,
    storeIds: m.store_ids || [],
    roleId: m.role_id || null,
    departmentId: m.department_id || null,
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
  // Append readerId to read_by array if not already present
  const { error } = await supabase.rpc("mark_message_read", { msg_id: id, reader_id: readerId })
    .catch(() => null); // graceful fallback if RPC not set up
  // Fallback: fetch + update
  if (error || true) {
    const { data: existing } = await supabase.from("inbox_messages").select("read_by").eq("id", id).single();
    if (existing && !existing.read_by.includes(readerId)) {
      await supabase.from("inbox_messages").update({ read_by: [...existing.read_by, readerId] }).eq("id", id);
    }
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
    franchiseeName:   s.franchisee_name,
    status:           s.status,
    address:          s.address,
    city:             s.city,
    postcode:         s.postcode,
    country:          s.country,
    latitude:         s.latitude,
    longitude:        s.longitude,
    openedDate:       s.opened_date,
    phone:            s.phone,
    email:            s.email,
    notes:            s.notes,
    metadata:         s.metadata,
    createdAt:        s.created_at,
    updatedAt:        s.updated_at,
    archivedAt:       s.archived_at,
    kpiTargets:       s.kpi_targets || {},
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
  const { data, error } = await supabase
    .from("stores").update(row).eq("id", id).select().single();
  if (error) throw error;
  return dbStoreToApp(data);
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
    id:            r.id,
    storeId:       r.store_id,
    departmentId:  r.department_id,
    name:          r.name,
    hourlyRate:    r.hourly_rate != null ? Number(r.hourly_rate) : null,
    isManagement:  r.is_management ?? false,
    sortOrder:     r.sort_order ?? 0,
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
    archivedAt:    r.archived_at,
  };
}

function appStoreRoleToDb(r) {
  const row = {};
  if (r.id            !== undefined) row.id            = r.id;
  if (r.storeId       !== undefined) row.store_id      = r.storeId;
  if (r.departmentId  !== undefined) row.department_id = r.departmentId || null;
  if (r.name          !== undefined) row.name          = r.name;
  if (r.hourlyRate    !== undefined) row.hourly_rate   = r.hourlyRate === "" || r.hourlyRate == null ? null : Number(r.hourlyRate);
  if (r.isManagement  !== undefined) row.is_management = !!r.isManagement;
  if (r.sortOrder     !== undefined) row.sort_order    = r.sortOrder;
  if (r.archivedAt    !== undefined) row.archived_at   = r.archivedAt;
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
  const row = appStoreDepartmentToDb({ ...patch, updatedAt: undefined });
  row.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("store_departments").update(row).eq("id", id).select().single();
  if (error) throw error;
  return dbStoreDepartmentToApp(data);
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
  const row = appStoreRoleToDb({ ...patch, updatedAt: undefined });
  row.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("store_roles").update(row).eq("id", id).select().single();
  if (error) throw error;
  return dbStoreRoleToApp(data);
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

// Trigger a manual flipdish sync from the UI
export async function runFlipdishSync(body = {}) {
  const { data, error } = await supabase.functions.invoke("flipdish-sync", { body });
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
