// ─── supabase.js ─────────────────────────────────────────────────────────────
// 1. npm install @supabase/supabase-js
// 2. Create a .env file in your project root with:
//      REACT_APP_SUPABASE_URL=https://xxxx.supabase.co
//      REACT_APP_SUPABASE_ANON_KEY=your-anon-key
// 3. Replace the localStorage calls in App.js with the hooks below.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

// ─── BRANDS ──────────────────────────────────────────────────────────────────

export async function fetchBrands() {
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .order("name");
  if (error) throw error;
  // Reshape: kpi_targets (DB snake_case) → kpiTargets (app camelCase)
  return data.map(dbBrandToApp);
}

export async function insertBrand(brand) {
  const { data, error } = await supabase
    .from("brands")
    .insert(appBrandToDb(brand))
    .select()
    .single();
  if (error) throw error;
  return dbBrandToApp(data);
}

export async function upsertBrand(brand) {
  const { data, error } = await supabase
    .from("brands")
    .upsert(appBrandToDb(brand))
    .select()
    .single();
  if (error) throw error;
  return dbBrandToApp(data);
}

export async function removeBrand(id) {
  const { error } = await supabase.from("brands").delete().eq("id", id);
  if (error) throw error;
}

// ─── USERS ───────────────────────────────────────────────────────────────────
// NOTE: passwords are stored as plain text here to match the existing app.
// For production you should use Supabase Auth (supabase.auth.signUp / signIn).

export async function fetchUsers() {
  const { data, error } = await supabase.from("users").select("*").order("name");
  if (error) throw error;
  return data.map(dbUserToApp);
}

export async function insertUser(user) {
  const { data, error } = await supabase
    .from("users")
    .insert(appUserToDb(user))
    .select()
    .single();
  if (error) throw error;
  return dbUserToApp(data);
}

export async function upsertUser(user) {
  const { data, error } = await supabase
    .from("users")
    .upsert(appUserToDb(user))
    .select()
    .single();
  if (error) throw error;
  return dbUserToApp(data);
}

export async function removeUser(id) {
  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) throw error;
}

// ─── EOD ENTRIES ─────────────────────────────────────────────────────────────

export async function fetchEntries() {
  const { data, error } = await supabase
    .from("eod_entries")
    .select("*")
    .order("date");
  if (error) throw error;
  return data.map(dbEntryToApp);
}

export async function upsertEntry(entry) {
  const { data, error } = await supabase
    .from("eod_entries")
    .upsert(appEntryToDb(entry))
    .select()
    .single();
  if (error) throw error;
  return dbEntryToApp(data);
}

export async function upsertEntries(entries) {
  const { data, error } = await supabase
    .from("eod_entries")
    .upsert(entries.map(appEntryToDb))
    .select();
  if (error) throw error;
  return data.map(dbEntryToApp);
}

// ─── ISSUES ──────────────────────────────────────────────────────────────────

export async function fetchIssues() {
  const { data, error } = await supabase
    .from("issues")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(dbIssueToApp);
}

export async function insertIssue(issue) {
  const { data, error } = await supabase
    .from("issues")
    .insert(appIssueToDb(issue))
    .select()
    .single();
  if (error) throw error;
  return dbIssueToApp(data);
}

export async function upsertIssue(issue) {
  const { data, error } = await supabase
    .from("issues")
    .upsert(appIssueToDb(issue))
    .select()
    .single();
  if (error) throw error;
  return dbIssueToApp(data);
}

export async function removeIssue(id) {
  const { error } = await supabase.from("issues").delete().eq("id", id);
  if (error) throw error;
}

// ─── Shape converters (app ↔ DB) ─────────────────────────────────────────────

function appBrandToDb(b) {
  return {
    id: b.id,
    name: b.name,
    icon_key: b.iconKey,
    color: b.color,
    address: b.address,
    kpi_targets: b.kpiTargets, // stored as JSONB
  };
}

function dbBrandToApp(b) {
  return {
    id: b.id,
    name: b.name,
    iconKey: b.icon_key,
    color: b.color,
    address: b.address,
    kpiTargets: b.kpi_targets,
  };
}

function appUserToDb(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    password: u.password, // see note above about plain-text passwords
    role: u.role,
    brand_ids: u.brandIds, // stored as text[]
    avatar: u.avatar,
  };
}

function dbUserToApp(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    password: u.password,
    role: u.role,
    brandIds: u.brand_ids,
    avatar: u.avatar,
  };
}

function appEntryToDb(e) {
  return {
    id: e.id,
    brand_id: e.brandId,
    brand_name: e.brandName,
    date: e.date,
    manager: e.manager,
    submitted_by: e.submittedBy,
    net_sales: e.netSales,
    card_revenue: e.cardRevenue,
    cash_expected: e.cashExpected,
    physical_cash: e.physicalCash,
    cash_variance: e.cashVariance,
    variance_justification: e.varianceJustification,
    opening_float: e.openingFloat,
    closing_float: e.closingFloat,
    labor_cost: e.laborCost,
    cogs_cost: e.cogsCost,
    total_hours: e.totalHours,
    total_orders: e.totalOrders,
    atv: e.atv,
    five_star_reviews: e.fiveStarReviews,
    mid_star_reviews: e.midStarReviews,
    one_star_reviews: e.oneStarReviews,
    notes: e.notes,
    maintenance_tickets: e.maintenanceTickets, // JSONB
    timestamp: e.timestamp,
  };
}

function dbEntryToApp(e) {
  return {
    id: e.id,
    brandId: e.brand_id,
    brandName: e.brand_name,
    date: e.date,
    manager: e.manager,
    submittedBy: e.submitted_by,
    netSales: e.net_sales,
    cardRevenue: e.card_revenue,
    cashExpected: e.cash_expected,
    physicalCash: e.physical_cash,
    cashVariance: e.cash_variance,
    varianceJustification: e.variance_justification,
    openingFloat: e.opening_float,
    closingFloat: e.closing_float,
    laborCost: e.labor_cost,
    cogsCost: e.cogs_cost,
    totalHours: e.total_hours,
    totalOrders: e.total_orders,
    atv: e.atv,
    fiveStarReviews: e.five_star_reviews,
    midStarReviews: e.mid_star_reviews,
    oneStarReviews: e.one_star_reviews,
    notes: e.notes,
    maintenanceTickets: e.maintenance_tickets ?? [],
    timestamp: e.timestamp,
  };
}

function appIssueToDb(i) {
  return {
    id: i.id,
    brand_id: i.brandId,
    brand_name: i.brandName,
    title: i.title,
    description: i.description,
    category: i.category,
    priority: i.priority,
    status: i.status,
    reported_by: i.reportedBy,
    assigned_to: i.assignedTo,
    comments: i.comments, // JSONB
    created_at: i.createdAt,
    updated_at: i.updatedAt,
  };
}

function dbIssueToApp(i) {
  return {
    id: i.id,
    brandId: i.brand_id,
    brandName: i.brand_name,
    title: i.title,
    description: i.description,
    category: i.category,
    priority: i.priority,
    status: i.status,
    reportedBy: i.reported_by,
    assignedTo: i.assigned_to,
    comments: i.comments ?? [],
    createdAt: i.created_at,
    updatedAt: i.updated_at,
  };
}
