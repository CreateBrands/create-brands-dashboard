import { useState, useMemo, useCallback, useEffect, createContext, useContext, useRef } from "react";
import {
  supabase,
  fetchBrands, insertBrand, upsertBrand, removeBrand,
  fetchUsers,  insertUser,  upsertUser,  removeUser,
  fetchEntries, upsertEntry, upsertEntries,
  fetchIssues, insertIssue, upsertIssue, removeIssue,
  fetchMaintenanceTickets, insertMaintenanceTicket, updateMaintenanceTicket, deleteMaintenanceTicket,
  fetchChecklists, upsertChecklist, removeChecklist,
  fetchTempUnits, upsertTempUnit, removeTempUnit,
  fetchCleaningTasks, upsertCleaningTask, removeCleaningTask,
  fetchAssignments, upsertAssignment, removeAssignment,
  fetchOpsTeam, upsertOpsTeamMember, removeOpsTeamMember, updateOpsTeamMember,
  fetchTempLogs, insertTempLog,
  fetchDeliveries, insertDelivery,
  fetchChecklistStates, upsertChecklistState,
  fetchAuditTrail, insertAuditEntry, clearAuditTrail,
  fetchAvailability, insertAvailability, upsertAvailability, removeAvailability,
  fetchSchedules, upsertSchedule, removeSchedule,
  fetchShiftPresets, upsertShiftPreset, removeShiftPreset, publishWeekSchedules,
  fetchPunchRecords, insertPunchIn, updatePunchOut, upsertPunchRecord, uploadPunchPhoto, attachPunchPhoto, addPunchOvertimeComment,
  fetchStores, fetchFlipdishStores, fetchFlipdishOrders, fetchFlipdishSyncLog, fetchFlipdishSales, runFlipdishSync,
  insertStore, updateStore, deleteStore, linkFlipdishStore, unlinkFlipdishStore, backfillSalesStoreId,
  fetchStoreDepartments, fetchStoreRoles,
  insertStoreDepartment, updateStoreDepartment, archiveStoreDepartment, unarchiveStoreDepartment,
  insertStoreRole, updateStoreRole, archiveStoreRole, unarchiveStoreRole,
  copyStoreStructure,
  fetchHelpdeskTickets, insertHelpdeskTicket, upsertHelpdeskTicket, removeHelpdeskTicket,
  fetchInboxMessages, insertInboxMessage, markMessageRead,
  // Hiring / Onboarding (slice 1)
  fetchApplications, insertApplication, updateApplication, deleteApplication,
  changeApplicationStatus, fetchApplicationStatusHistory,
  // Slice 3: photo upload + delete
  uploadApplicantPhoto, deleteApplicantPhoto,
  // Slice 4: candidate portal magic link
  sendCandidateMagicLink, setApplicationEmailStatus,
  // Slice 5: hire workflow
  hireApplication, hireApplicationCheck,
  // Slice 6: employee profile
  fetchEmployeeNotes, addEmployeeNote, fetchLinkedApplication,
  // Slice 6 follow-up: pay history
  fetchPayHistory, addPayHistory,
  // Slice 6 follow-up: certifications
  fetchEmployeeCertifications, addEmployeeCertification,
  updateEmployeeCertification, archiveEmployeeCertification,
  // Slice 7 stage 3: RTW / compliance documents
  fetchEmployeeDocuments, uploadEmployeeDocument, addEmployeeDocument,
  archiveEmployeeDocument,
  // Slice 7 stage 4: apply-time duplicate detection
  findApplicationsByEmail,
} from "./supabase";
import {
  ComposedChart, Bar, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";
import {
  Utensils, Moon, Coffee, Building2, LogOut, Menu, X, ChevronRight,
  ChevronLeft, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  Plus, Trash2, Edit, Eye, EyeOff, Download, Upload, RotateCcw,
  DollarSign, BarChart2, Users, Settings, LayoutDashboard, ClipboardList,
  Star, Wrench, Check, Info, Shield, Activity, Target, Zap,
  AlertCircle, Clock, CheckSquare, XCircle, Filter, FileSpreadsheet,
  ChevronDown, RefreshCw, MessageSquare, Tag, MapPin, Calendar,
  Thermometer, Truck, Clipboard, ShieldCheck, ScrollText, ListChecks, Hash, UserCheck, CalendarDays,
  LifeBuoy, Inbox, Send, Bell, ChevronUp, ChevronDown as ChevronDownIcon, UserPlus, AtSign,
  Globe, FileText, ChefHat, PoundSterling, Search
} from "lucide-react";

// ─── Lazy-load cache for Flipdish sales ───────────────────────────────────────
// Chain Performance loads ~40k rows. Fetching that on every app mount made
// the whole app slow for users who only use Today's Tasks or Temperatures.
// This module-scope cache lets the data load once when Chain Performance is
// first opened, then reuses for 5 minutes. invalidateFlipdishSalesCache() is
// called after a manual Sync so the next render fetches fresh.
const FLIPDISH_SALES_TTL_MS = 5 * 60 * 1000;   // 5 minutes
let _flipdishSalesCache = null;                 // { data, fetchedAt }
let _flipdishSalesCacheBuster = 0;              // bumped by invalidate()
function invalidateFlipdishSalesCache() {
  _flipdishSalesCache = null;
  _flipdishSalesCacheBuster += 1;
}
async function fetchFlipdishSalesCached() {
  const now = Date.now();
  if (_flipdishSalesCache && (now - _flipdishSalesCache.fetchedAt) < FLIPDISH_SALES_TTL_MS) {
    return _flipdishSalesCache.data;
  }
  const data = await fetchFlipdishSales();
  _flipdishSalesCache = { data, fetchedAt: now };
  return data;
}
function getFlipdishSalesCacheBuster() {
  return _flipdishSalesCacheBuster;
}

// ─── Global font + style injection ────────────────────────────────────────────
// Runs once per page load. Adds Inter from Google Fonts + a few base style overrides.
if (typeof document !== "undefined" && !document.getElementById("cb-global-style")) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap";
  document.head.appendChild(link);
  const style = document.createElement("style");
  style.id = "cb-global-style";
  style.textContent = `
    html, body, #root { font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-feature-settings: "cv11", "ss01", "ss03"; background: #020617; color: #f1f5f9; }
    /* Tabular numerals globally on times, money, hours, percentages */
    .tabular-nums, [class*="font-mono"] { font-variant-numeric: tabular-nums; }
    /* Tighter heading rendering */
    h1, h2, h3, h4 { letter-spacing: -0.01em; }
    /* Smoother scrollbars in chrome panels */
    *::-webkit-scrollbar { width: 8px; height: 8px; }
    *::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.2); border-radius: 4px; }
    *::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,0.4); }
    *::-webkit-scrollbar-track { background: transparent; }
  `;
  document.head.appendChild(style);
}

// ─── Auth Context ─────────────────────────────────────────────────────────────
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

// ─── Icon Map ─────────────────────────────────────────────────────────────────
const ICON_MAP = { Utensils, Moon, Coffee, Building2 };

// ─── Seed Data ────────────────────────────────────────────────────────────────
const SEED_BRANDS = [
  { id: "cb-kitchen", name: "CB Kitchen", iconKey: "Utensils", color: "#6366f1", address: "12 Soho Square, London", kpiTargets: { dailyRevenue: 4800, primeCostMax: 60, laborPctMax: 30, cogsPctMax: 32, netMarginMin: 35, splhMin: 45, avgStarMin: 4.0, cashVarianceMax: 25 } },
  { id: "noir-bar", name: "Noir Bar", iconKey: "Moon", color: "#10b981", address: "88 Brick Lane, London", kpiTargets: { dailyRevenue: 3200, primeCostMax: 60, laborPctMax: 30, cogsPctMax: 32, netMarginMin: 35, splhMin: 45, avgStarMin: 4.0, cashVarianceMax: 25 } },
  { id: "the-deli", name: "The Deli", iconKey: "Coffee", color: "#f59e0b", address: "5 Columbia Road, London", kpiTargets: { dailyRevenue: 2100, primeCostMax: 60, laborPctMax: 30, cogsPctMax: 32, netMarginMin: 35, splhMin: 45, avgStarMin: 4.0, cashVarianceMax: 25 } }
];

const SEED_USERS = [
  { id: "u1", name: "Alex Morgan", email: "owner@createbrands.co.uk", password: "owner123", role: "owner", brandIds: ["cb-kitchen", "noir-bar", "the-deli"], avatar: "AM" },
  { id: "u2", name: "Sarah Chen", email: "sarah@createbrands.co.uk", password: "manager123", role: "manager", brandIds: ["cb-kitchen"], avatar: "SC" },
  { id: "u3", name: "Lena Park", email: "lena@createbrands.co.uk", password: "manager123", role: "manager", brandIds: ["noir-bar"], avatar: "LP" },
  { id: "u4", name: "Oliver Reeves", email: "oliver@createbrands.co.uk", password: "manager123", role: "manager", brandIds: ["the-deli"], avatar: "OR" }
];

// Issue categories and priorities
const ISSUE_CATEGORIES = ["Equipment", "Plumbing", "Electrical", "Safety", "Hygiene", "IT/Tech", "Structural", "Pest Control", "HVAC", "Other"];
const ISSUE_PRIORITIES = ["Critical", "High", "Medium", "Low"];
const ISSUE_TYPES = ["Issue", "Maintenance"];
const ISSUE_STATUSES = ["Open", "In Progress", "Awaiting Parts", "Resolved", "Closed"];

const STATUS_CONFIG = {
  "Open": { color: "red", icon: AlertCircle },
  "In Progress": { color: "amber", icon: RefreshCw },
  "Awaiting Parts": { color: "indigo", icon: Clock },
  "Resolved": { color: "emerald", icon: CheckCircle },
  "Closed": { color: "slate", icon: XCircle },
};

const PRIORITY_CONFIG = {
  "Critical": { color: "red" },
  "High": { color: "amber" },
  "Medium": { color: "indigo" },
  "Low": { color: "slate" },
};


// ─── Period Utilities ─────────────────────────────────────────────────────────
function getMonday(d) { const dt = new Date(d); const day = dt.getDay(); dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day)); return dt; }
function fmtDate(d) { return d.toISOString().split("T")[0]; }

// Role helpers (single source of truth used by every view).
//   isOwnerRole — only the actual owner. Reserved for: system config (Admin),
//     adding/removing HQ staff, owner-only destructive actions.
//   isHqOrAbove — owner OR hq_staff. Used for: chain-wide visibility, edit
//     access to operational data, and Chain Performance view.
// Manager and Staff fall through both checks; they get store-scoped access.
function isOwnerRole(role) { return role === "owner"; }
function isHqOrAbove(role) { return role === "owner" || role === "hq_staff"; }

function resolvePeriod(preset, customFrom, customTo) {
  const today = new Date(); today.setHours(0,0,0,0);
  const yest = new Date(today); yest.setDate(yest.getDate()-1);
  const mon = getMonday(today);
  const lastMon = new Date(mon); lastMon.setDate(lastMon.getDate()-7);
  const lastSun = new Date(mon); lastSun.setDate(lastSun.getDate()-1);
  switch (preset) {
    case "today": return { from: fmtDate(today), to: fmtDate(today), label: "Today" };
    case "yesterday": return { from: fmtDate(yest), to: fmtDate(yest), label: "Yesterday" };
    case "this_week": return { from: fmtDate(mon), to: fmtDate(today), label: "This Week" };
    case "last_week": return { from: fmtDate(lastMon), to: fmtDate(lastSun), label: "Last Week" };
    case "custom": return { from: customFrom, to: customTo, label: "Custom Period" };
    default: return { from: fmtDate(today), to: fmtDate(today), label: "Today" };
  }
}

function resolvePrevPeriod(preset, customFrom, customTo) {
  const today = new Date(); today.setHours(0,0,0,0);
  const yest = new Date(today); yest.setDate(yest.getDate()-1);
  const twoDaysAgo = new Date(today); twoDaysAgo.setDate(twoDaysAgo.getDate()-2);
  const mon = getMonday(today);
  const lastMon = new Date(mon); lastMon.setDate(lastMon.getDate()-7);
  const lastSun = new Date(mon); lastSun.setDate(lastSun.getDate()-1);
  const weekBefore = new Date(lastMon); weekBefore.setDate(weekBefore.getDate()-7);
  const weekBeforeSun = new Date(lastMon); weekBeforeSun.setDate(weekBeforeSun.getDate()-1);
  switch (preset) {
    case "today": return { from: fmtDate(yest), to: fmtDate(yest), label: "Yesterday" };
    case "yesterday": return { from: fmtDate(twoDaysAgo), to: fmtDate(twoDaysAgo), label: "2 Days Ago" };
    case "this_week": return { from: fmtDate(lastMon), to: fmtDate(lastSun), label: "Last Week" };
    case "last_week": return { from: fmtDate(weekBefore), to: fmtDate(weekBeforeSun), label: "Week Before" };
    case "custom": {
      if (!customFrom || !customTo) return null;
      const f = new Date(customFrom), t = new Date(customTo);
      const diff = t - f;
      return { from: fmtDate(new Date(f - diff - 86400000)), to: fmtDate(new Date(f - 86400000)), label: "Prior Period" };
    }
    default: return null;
  }
}

function filterEntries(entries, from, to) { if (!from || !to) return []; return entries.filter(e => e.date >= from && e.date <= to); }

function aggregateEntries(filtered) {
  if (!filtered.length) return null;
  const netSales = filtered.reduce((a, e) => a + (e.netSales||0), 0);
  const laborCost = filtered.reduce((a, e) => a + (e.laborCost||0), 0);
  const cogsCost = filtered.reduce((a, e) => a + (e.cogsCost||0), 0);
  const totalHours = filtered.reduce((a, e) => a + (e.totalHours||0), 0);
  const totalOrders = filtered.reduce((a, e) => a + (e.totalOrders||0), 0);
  const primeCost = netSales > 0 ? ((laborCost + cogsCost) / netSales) * 100 : 0;
  const netMargin = netSales > 0 ? ((netSales - laborCost - cogsCost) / netSales) * 100 : 0;
  const splh = totalHours > 0 ? netSales / totalHours : 0;
  const laborPct = netSales > 0 ? (laborCost / netSales) * 100 : 0;
  const cogsPct = netSales > 0 ? (cogsCost / netSales) * 100 : 0;
  const atv = totalOrders > 0 ? netSales / totalOrders : 0;
  return { netSales, laborCost, cogsCost, totalHours, totalOrders, primeCost, netMargin, splh, laborPct, cogsPct, atv };
}

// ─── Per-day-of-week target math ──────────────────────────────────────────────
// Store kpiTargets shape (from Stage 4b migration):
//   { monday:    { revenue, orders, hours },
//     tuesday:   { revenue, orders, hours }, ...
//     sunday:    { revenue, orders, hours },
//     ratios:    { primeCostMax, atvTarget, laborCostMax } }
//
// For a date range, the expected target is the SUM of each date's day-of-week
// target. E.g. a Mon–Sun period sums all 7 days' targets, a single Saturday
// returns just Saturday's value, a "this week so far" period sums only the
// days that have actually happened.
const DOW_KEYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

// Iterate dates in [from, to] inclusive. Returns an array of ISO date strings.
// from/to are "YYYY-MM-DD". Naive: no DST concerns since we're not crossing
// timezones, just day-counting in UTC.
function datesInRange(from, to) {
  if (!from || !to) return [];
  const out = [];
  // Parse as UTC midnight to avoid the off-by-one from local timezones near
  // UTC boundaries (this dashboard runs in BST/GMT, but we keep it timezone-safe).
  const d = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// Returns { revenue, orders, hours } summed across all dates in [from, to]
// for the given store's per-day targets. Returns null if no kpiTargets set
// (so calling code can show graceful "—" instead of zeros that look like a
// failure to hit target).
function sumStoreTargetsForPeriod(storeKpiTargets, from, to) {
  if (!storeKpiTargets || typeof storeKpiTargets !== "object") return null;
  // Quick sanity: does this object have ANY day-of-week keys populated?
  const anyDayPresent = DOW_KEYS.some(k => storeKpiTargets[k]);
  if (!anyDayPresent) return null;

  let revenue = 0, orders = 0, hours = 0, daysWithTargets = 0;
  datesInRange(from, to).forEach(dateStr => {
    const dow = new Date(dateStr + "T00:00:00Z").getUTCDay();  // 0=Sun..6=Sat
    const dayTarget = storeKpiTargets[DOW_KEYS[dow]];
    if (dayTarget) {
      revenue += Number(dayTarget.revenue) || 0;
      orders  += Number(dayTarget.orders)  || 0;
      hours   += Number(dayTarget.hours)   || 0;
      daysWithTargets++;
    }
  });
  return daysWithTargets > 0 ? { revenue, orders, hours, daysWithTargets } : null;
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtCurrency = v => v == null ? "—" : `£${Math.round(v).toLocaleString()}`;
const fmtPct = v => v == null ? "—" : `${v.toFixed(1)}%`;
const fmtSPLH = v => v == null ? "—" : `£${v.toFixed(2)}`;
const fmtNum = v => v == null ? "—" : Math.round(v).toLocaleString();
function formatKPI(v, format) {
  if (v == null) return "—";
  if (format === "currency") return fmtCurrency(v);
  if (format === "percent") return fmtPct(v);
  if (format === "splh") return fmtSPLH(v);
  return fmtNum(v);
}

// ─── Shared Components ────────────────────────────────────────────────────────
function Badge({ label, color = "slate" }) {
  const colors = {
    green: "bg-emerald-500/25 text-emerald-400 border border-emerald-500/30",
    red: "bg-red-500/25 text-red-400 border border-red-500/30",
    amber: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
    slate: "bg-slate-700 text-slate-700 border border-slate-600",
    indigo: "bg-indigo-950/30 text-indigo-400 border border-indigo-500/30",
    violet: "bg-violet-500/20 text-violet-400 border border-violet-500/30",
    fuchsia: "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30",
    emerald: "bg-emerald-500/25 text-emerald-400 border border-emerald-500/30",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${colors[color] || colors.slate}`}>{label}</span>;
}

function RoleBadge({ role }) {
  if (role === "owner")    return <Badge label="Owner"    color="violet" />;
  if (role === "hq_staff") return <Badge label="HQ Staff" color="fuchsia" />;
  if (role === "staff")    return <Badge label="Staff"    color="slate" />;
  return <Badge label="Manager" color="indigo" />;
}

// ─── Reusable Empty State ─────────────────────────────────────────────────────
function EmptyState({ icon: Icon = Info, title, message, action, accent = "slate" }) {
  const accents = {
    slate: "text-slate-500",
    indigo: "text-indigo-400",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    sky: "text-sky-400",
  };
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className={`w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800/60 flex items-center justify-center mb-4 ${accents[accent]}`}>
        <Icon size={24}/>
      </div>
      <div className="text-base font-bold text-white mb-1">{title}</div>
      {message && <div className="text-sm text-slate-600 max-w-sm">{message}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, accent = "indigo", alert = false }) {
  const accents = {
    indigo: "from-indigo-600/20 to-indigo-600/5 border-indigo-500/30",
    emerald: "from-emerald-600/20 to-emerald-600/5 border-emerald-500/30",
    amber: "from-amber-600/20 to-amber-600/5 border-amber-500/30",
    red: "from-red-600/20 to-red-600/5 border-red-500/30",
    sky: "from-sky-600/20 to-sky-600/5 border-sky-500/30",
    slate: "from-slate-700/40 to-slate-700/10 border-slate-700",
  };
  const iconColors = { indigo: "text-indigo-400", emerald: "text-emerald-400", amber: "text-amber-400", red: "text-red-400", sky: "text-sky-400", slate: "text-slate-600" };
  const eff = alert ? "red" : accent;
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${accents[eff]} border p-5 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-widest">{label}</span>
        {Icon && <Icon size={16} className={iconColors[eff]} />}
      </div>
      <div className="text-2xl font-bold text-white tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-600">{sub}</div>}
    </div>
  );
}

function AnalysisBlock({ title, children, className = "", action }) {
  return (
    <div className={`rounded-2xl bg-slate-900 border border-slate-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ComparisonKPICard({ label, current, previous, format, icon: Icon, invertDelta = false, alert = false, subCurrent, prevLabel = "Prior" }) {
  const currentVal = formatKPI(current, format);
  const previousVal = previous != null ? formatKPI(previous, format) : null;
  let deltaEl = null;
  if (current != null && previous != null && previous !== 0) {
    const delta = ((current - previous) / Math.abs(previous)) * 100;
    const isPositive = invertDelta ? delta < 0 : delta > 0;
    const sign = delta >= 0 ? "+" : "";
    deltaEl = (
      <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-semibold ${isPositive ? "bg-emerald-500/25 text-emerald-400" : "bg-red-500/25 text-red-400"}`}>
        {isPositive ? <TrendingUp size={10}/> : <TrendingDown size={10}/>} {sign}{delta.toFixed(1)}% vs {prevLabel}
      </span>
    );
  }
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-2 ${alert ? "bg-red-950/20 border-red-500/30" : "bg-slate-900 border-slate-700"}`}>
      <div className="flex items-center gap-2">
        {Icon && <Icon size={13} className="text-slate-600" />}
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-widest">{label}</span>
      </div>
      <div className={`text-xl font-bold ${alert ? "text-red-400" : "text-white"}`}>{currentVal}</div>
      {subCurrent && <div className="text-xs text-slate-500">{subCurrent}</div>}
      {deltaEl}
      {previousVal && (
        <div className="border-t border-slate-700 pt-2 mt-1 text-xs text-slate-500">
          Prior: <span className="text-slate-600 font-medium">{previousVal}</span>
        </div>
      )}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs shadow-xl">
      <div className="text-slate-400 mb-1 font-medium">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}:</span>
          <span className="text-white font-semibold">{typeof p.value === "number" ? (p.name?.includes("£") || p.name?.includes("Revenue") || p.name?.includes("Sales") ? `£${Math.round(p.value).toLocaleString()}` : p.value.toFixed(1)) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Shared Dropdown Primitives ──────────────────────────────────────────────

// Styled <select> wrapper used everywhere for location and period pickers
function SelectDropdown({ value, onChange, children, className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none w-full bg-slate-900 border border-slate-700 rounded-xl pl-3.5 pr-8 py-2 text-sm text-white font-medium focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 cursor-pointer transition-colors hover:border-slate-600"
      >
        {children}
      </select>
      <ChevronDownIcon size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"/>
    </div>
  );
}

// Location dropdown — shows a colour dot next to each brand
function LocationDropdown({ brands, value, onChange, allLabel = null, className = "" }) {
  if (brands.length <= 1 && !allLabel) return null; // single brand = no picker needed
  return (
    <SelectDropdown value={value} onChange={onChange} className={className}>
      {allLabel && <option value="all">{allLabel}</option>}
      {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
    </SelectDropdown>
  );
}

// Store-scope dropdown — used by every store-filtered operational view.
// Value "all" means "merge all stores I can see"; otherwise it's a store id.
//   stores  — the list the user can see (caller already passes visibleStores)
//   brands  — for showing "Chocoberry · Cardiff" style labels when multi-brand
// Returns null if there are 0 stores (caller renders an empty state).
// Hidden entirely for single-store managers (no choice to make).
function StoreScopeDropdown({ stores, brands, value, onChange, className = "" }) {
  if (!stores || stores.length === 0) return null;
  if (stores.length === 1) return null; // one store = nothing to pick
  // For multi-brand contexts (owner/HQ seeing Chocoberry + Tove), prefix the
  // brand. For single-brand contexts (Sumit only sees Chocoberry stores),
  // just show the store name.
  const brandsInScope = new Set(stores.map(s => s.brandId));
  const showBrandPrefix = brandsInScope.size > 1;
  const brandName = (id) => brands.find(b => b.id === id)?.name || id;
  const sorted = [...stores].sort((a, b) =>
    (a.shortName || a.name || "").localeCompare(b.shortName || b.name || "")
  );
  return (
    <SelectDropdown value={value} onChange={onChange} className={className}>
      <option value="all">All my stores ({stores.length})</option>
      {sorted.map(s => (
        <option key={s.id} value={s.id}>
          {showBrandPrefix ? `${brandName(s.brandId)} · ${s.shortName || s.name}` : (s.shortName || s.name)}
        </option>
      ))}
    </SelectDropdown>
  );
}

// Ownership filter — owner/HQ only. Lets the user narrow operational views
// to just the stores they have direct control over (owned), exclude franchises,
// etc. Default is "owned" because that's what HQ cares about day-to-day.
// Managers never see this — their store_ids list is already the right scope.
//
// Returns null when the role isn't owner/HQ, or when there's nothing to filter
// (single-ownership-type set, e.g. all 24 stores are franchise = no point).
function OwnershipFilterDropdown({ stores, value, onChange, role, className = "" }) {
  if (!isHqOrAbove(role)) return null;
  if (!stores || stores.length === 0) return null;
  const counts = stores.reduce((m, s) => {
    const k = s.ownershipModel || "other";
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});
  const types = Object.keys(counts);
  // No useful filter when there's only one ownership type in scope
  if (types.length <= 1) return null;
  return (
    <SelectDropdown value={value} onChange={onChange} className={className}>
      <option value="owned">Owned ({counts.owned || 0})</option>
      <option value="joint_venture">Joint Venture ({counts.joint_venture || 0})</option>
      <option value="franchise">Franchise ({counts.franchise || 0})</option>
      <option value="all">All ownership ({stores.length})</option>
    </SelectDropdown>
  );
}

// applyOwnershipFilter — used by views to narrow visibleStores by the
// ownership filter. Returns stores unchanged when filter === "all" or when
// the user isn't owner/HQ (managers' scope is already correct).
function applyOwnershipFilter(stores, ownership, role) {
  if (!isHqOrAbove(role)) return stores;
  if (ownership === "all") return stores;
  return stores.filter(s => (s.ownershipModel || "") === ownership);
}

// Period dropdown — collapses all the preset buttons into one <select>
function PeriodFilterBar({ preset, onPreset, customFrom, customTo, onCustomFrom, onCustomTo }) {
  const presets = [
    { key: "today",     label: "Today" },
    { key: "yesterday", label: "Yesterday" },
    { key: "this_week", label: "This Week" },
    { key: "last_week", label: "Last Week" },
    { key: "custom",    label: "Custom range…" },
  ];
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <SelectDropdown value={preset} onChange={onPreset} className="w-40">
        {presets.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
      </SelectDropdown>
      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <input type="date" value={customFrom} onChange={e => onCustomFrom(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none" />
          <span className="text-slate-500 text-xs">→</span>
          <input type="date" value={customTo} min={customFrom} onChange={e => onCustomTo(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none" />
        </div>
      )}
    </div>
  );
}

// ─── Excel helpers ────────────────────────────────────────────────────────────
function useXLSX() {
  const [XLSX, setXLSX] = useState(null);
  useEffect(() => {
    if (window.XLSX) { setXLSX(window.XLSX); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    script.onload = () => setXLSX(window.XLSX);
    document.head.appendChild(script);
  }, []);
  return XLSX;
}

const EOD_COLUMNS = [
  { key: "date",                  label: "Date (YYYY-MM-DD)",     hint: "2024-01-15", required: true  },
  { key: "brandId",               label: "Brand ID",               hint: "cb-kitchen", required: true  },
  { key: "brandName",             label: "Brand Name",             hint: "CB Kitchen", required: false },
  { key: "manager",               label: "Manager on Duty",        hint: "Sarah Chen", required: false },
  { key: "submittedBy",           label: "Submitted By",           hint: "Sarah Chen", required: false },
  { key: "netSales",              label: "Net Sales (GBP)",        hint: "4500",       required: true  },
  { key: "cardRevenue",           label: "Card Revenue (GBP)",     hint: "3700",       required: false },
  { key: "cashExpected",          label: "Cash Expected (GBP)",    hint: "800",        required: false },
  { key: "physicalCash",          label: "Physical Cash (GBP)",    hint: "800",        required: false },
  { key: "cashVariance",          label: "Cash Variance (GBP)",    hint: "0",          required: false },
  { key: "varianceJustification", label: "Variance Justification", hint: "",           required: false },
  { key: "openingFloat",          label: "Opening Float (GBP)",    hint: "200",        required: false },
  { key: "closingFloat",          label: "Closing Float (GBP)",    hint: "200",        required: false },
  { key: "laborCost",             label: "Labour Cost (GBP)",      hint: "1260",       required: true  },
  { key: "cogsCost",              label: "COGS (GBP)",             hint: "1350",       required: true  },
  { key: "totalHours",            label: "Total Hours",            hint: "32",         required: true  },
  { key: "totalOrders",           label: "Total Orders",           hint: "210",        required: true  },
  { key: "atv",                   label: "ATV (GBP)",              hint: "21.43",      required: false },
  { key: "fiveStarReviews",       label: "5-Star Reviews",         hint: "8",          required: false },
  { key: "midStarReviews",        label: "2-4 Star Reviews",       hint: "2",          required: false },
  { key: "oneStarReviews",        label: "1-Star Reviews",         hint: "0",          required: false },
  { key: "notes",                 label: "Shift Notes",            hint: "Good shift", required: false },
];

function parseRowToEntry(row, brands) {
  const norm = {};
  Object.keys(row).forEach(k => { norm[k.toLowerCase().replace(/[\s()]/g, "").replace(/gbp/g, "")] = row[k]; });
  const get = (...keys) => { for (const k of keys) { if (norm[k] !== undefined && norm[k] !== "") return norm[k]; } return ""; };

  const rawDate = get("date");
  let date = "";
  if (rawDate instanceof Date) {
    date = rawDate.toISOString().split("T")[0];
  } else {
    date = String(rawDate || "").trim();
    // handle Excel serial numbers
    if (/^\d{5}$/.test(date)) {
      const d = new Date(Math.round((parseFloat(date) - 25569) * 86400 * 1000));
      date = d.toISOString().split("T")[0];
    }
  }

  const brandId = String(get("brandid") || "").trim();
  const ns = parseFloat(get("netsales")) || 0;

  const errs = [];
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) errs.push("invalid date (must be YYYY-MM-DD)");
  if (!brands.find(b => b.id === brandId))          errs.push("unknown brandId \"" + brandId + "\"");
  if (!ns)                                           errs.push("Net Sales is missing or zero");
  if (errs.length) return { ok: false, errs };

  const totalOrders = parseInt(get("totalorders")) || 0;
  const calcATV = totalOrders > 0 ? ns / totalOrders : 0;

  return {
    ok: true,
    entry: {
      id: brandId + "-" + date,
      brandId,
      brandName: brands.find(b => b.id === brandId)?.name || String(get("brandname") || ""),
      date,
      manager:               String(get("manager") || ""),
      submittedBy:           String(get("submittedby") || ""),
      netSales:              ns,
      cardRevenue:           parseFloat(get("cardrevenue"))           || 0,
      cashExpected:          parseFloat(get("cashexpected"))          || 0,
      physicalCash:          parseFloat(get("physicalcash"))          || 0,
      cashVariance:          parseFloat(get("cashvariance"))          || 0,
      varianceJustification: String(get("variancejustification")      || ""),
      openingFloat:          parseFloat(get("openingfloat"))          || 200,
      closingFloat:          parseFloat(get("closingfloat"))          || 200,
      laborCost:             parseFloat(get("labourcost") || get("laborcost")) || 0,
      cogsCost:              parseFloat(get("cogs"))                  || 0,
      totalHours:            parseFloat(get("totalhours"))            || 0,
      totalOrders,
      atv:                   parseFloat(get("atv"))                   || calcATV,
      fiveStarReviews:       parseInt(get("5starreviews"))            || 0,
      midStarReviews:        parseInt(get("24starreviews"))           || 0,
      oneStarReviews:        parseInt(get("1starreviews"))            || 0,
      notes:                 String(get("shiftnotes") || get("notes") || ""),
      maintenanceTickets: [],
      timestamp: new Date().toISOString(),
    }
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ─── EOD Excel Import Modal ───────────────────────────────────────────────────
function ExcelUploadModal({ brands, entries, onImport, onClose }) {
  const XLSX = useXLSX();
  const [preview, setPreview] = useState([]);
  const [errors,  setErrors]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [step,    setStep]    = useState("upload");
  const fileRef = useRef();

  const downloadTemplate = () => {
    if (!XLSX) { alert("Excel library loading, please try again in a moment."); return; }
    const headers = EOD_COLUMNS.map(c => c.label);
    const example = EOD_COLUMNS.map(c => c.hint);
    const brandInfo = ["Brand IDs available:", ...brands.map(b => b.id + " = " + b.name)];
    const ws = XLSX.utils.aoa_to_sheet([headers, example, brandInfo]);
    ws["!cols"] = EOD_COLUMNS.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "EOD Template");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(new Blob([buf], { type: "application/octet-stream" }), "createbrands-eod-template.xlsx");
  };

  const exportEOD = () => {
    if (!XLSX) { alert("Excel library loading, please try again in a moment."); return; }
    const headers = EOD_COLUMNS.map(c => c.label);
    const rows = entries.map(e => EOD_COLUMNS.map(c => e[c.key] !== undefined ? e[c.key] : ""));
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = EOD_COLUMNS.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "EOD Data");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(new Blob([buf], { type: "application/octet-stream" }), "createbrands-eod-" + new Date().toISOString().slice(0,10) + ".xlsx");
  };

  const handleFile = (f) => {
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (!XLSX) throw new Error("Excel library not loaded yet.");
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const validEntries = [], errs = [];
        jsonRows.forEach((row, i) => {
          const result = parseRowToEntry(row, brands);
          if (result.ok) validEntries.push(result.entry);
          else result.errs.forEach(msg => errs.push("Row " + (i + 2) + ": " + msg));
        });
        setPreview(validEntries);
        setErrors(errs);
        setStep("preview");
      } catch (err) {
        setErrors(["Could not parse file: " + err.message]);
        setStep("preview");
      }
      setLoading(false);
    };
    reader.readAsArrayBuffer(f);
  };

  const handleImport = async () => {
    setLoading(true);
    try {
      await onImport(preview);
      setStep("done");
    } catch (err) {
      setErrors([`Save failed: ${err.message}`]);
      setStep("preview");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-emerald-400"/>
            <h3 className="font-bold text-white">EOD Data — Excel Import / Export</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {step === "upload" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={exportEOD} className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 text-sm font-semibold hover:bg-emerald-600/30 transition-colors">
                  <Download size={15}/> Export EOD Data (.xlsx)
                </button>
                <button onClick={downloadTemplate} className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-700 text-sm font-semibold hover:bg-slate-700 transition-colors">
                  <FileSpreadsheet size={15}/> Download Blank Template
                </button>
              </div>
              <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-4 space-y-2">
                <div className="font-semibold text-indigo-300 text-sm flex items-center gap-2"><Info size={13}/>How to import historical data</div>
                <ul className="text-xs text-slate-600 space-y-1 list-disc ml-4">
                  <li>Download the blank template and fill in one EOD entry per row</li>
                  <li>Accepts <strong className="text-slate-700">.xlsx</strong> or <strong className="text-slate-700">.csv</strong></li>
                  <li>Required columns: Date, Brand ID, Net Sales, Labour Cost, COGS, Total Hours, Total Orders</li>
                  <li>Brand IDs: <span className="font-mono text-slate-700">{brands.map(b => b.id).join(", ")}</span></li>
                  <li>Same date + brand ID will overwrite any existing entry</li>
                </ul>
              </div>
              <div onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl p-10 text-center cursor-pointer transition-colors group">
                <Upload size={28} className="mx-auto text-slate-600 group-hover:text-indigo-400 mb-3 transition-colors"/>
                <div className="text-sm text-slate-600 group-hover:text-slate-700">{loading ? "Reading file…" : "Click to upload .xlsx or .csv"}</div>
                <div className="text-xs text-slate-600 mt-1">One EOD entry per row</div>
                <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden" onChange={e => e.target.files[0] && handleFile(e.target.files[0])}/>
              </div>
              {!XLSX && <div className="text-xs text-amber-400 text-center flex items-center justify-center gap-1"><RefreshCw size={11} className="animate-spin"/>Loading Excel library…</div>}
            </>
          )}

          {step === "preview" && (
            <>
              {errors.length > 0 && (
                <div className="bg-red-950/20 border border-red-500/30 rounded-xl p-4 space-y-1">
                  <div className="text-sm font-semibold text-red-400 flex items-center gap-2"><AlertTriangle size={14}/>Errors ({errors.length})</div>
                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                    {errors.map((e, i) => <div key={i} className="text-xs text-red-400">{e}</div>)}
                  </div>
                </div>
              )}
              {preview.length > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-emerald-400"/>
                    <span className="text-sm text-slate-700 font-semibold">{preview.length} valid rows ready to import</span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-700">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-slate-800">
                        {["Date","Brand","Net Sales","Labour","COGS","Hours","Orders","ATV","5★","2-4★","1★"].map(h =>
                          <th key={h} className="px-3 py-2 text-left text-slate-600 font-semibold whitespace-nowrap">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {preview.slice(0, 10).map((r, i) => (
                          <tr key={i} className="border-t border-slate-800/60 hover:bg-slate-800/40">
                            <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.date}</td>
                            <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.brandName || r.brandId}</td>
                            <td className="px-3 py-2 text-slate-700">{fmtCurrency(r.netSales)}</td>
                            <td className="px-3 py-2 text-slate-700">{fmtCurrency(r.laborCost)}</td>
                            <td className="px-3 py-2 text-slate-700">{fmtCurrency(r.cogsCost)}</td>
                            <td className="px-3 py-2 text-slate-700">{r.totalHours}</td>
                            <td className="px-3 py-2 text-slate-700">{r.totalOrders}</td>
                            <td className="px-3 py-2 text-slate-700">{fmtCurrency(r.atv)}</td>
                            <td className="px-3 py-2 text-emerald-400">{r.fiveStarReviews}</td>
                            <td className="px-3 py-2 text-amber-400">{r.midStarReviews}</td>
                            <td className="px-3 py-2 text-red-400">{r.oneStarReviews}</td>
                          </tr>
                        ))}
                        {preview.length > 10 && (
                          <tr><td colSpan={11} className="px-3 py-2 text-slate-500 text-center">…and {preview.length - 10} more rows</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {preview.length === 0 && <div className="text-center text-slate-600 text-sm py-4">No valid rows found. Fix the errors and re-upload.</div>}
            </>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/25 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle size={28} className="text-emerald-400"/>
              </div>
              <div className="text-base font-bold text-white">Import Complete</div>
              <div className="text-sm text-slate-600">{preview.length} EOD entries imported successfully.</div>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-slate-700">
          {step === "upload" && <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700 transition-colors">Close</button>}
          {step === "preview" && (
            <>
              <button onClick={() => { setStep("upload"); setPreview([]); setErrors([]); }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700 transition-colors">Re-upload</button>
              {preview.length > 0 && (
                <button onClick={handleImport} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                  {loading ? "Saving to database…" : `Import ${preview.length} Rows`}
                </button>
              )}
            </>
          )}
          {step === "done" && <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 transition-colors">Done</button>}
        </div>
      </div>
    </div>
  );
}

// ─── Issue Form Modal ─────────────────────────────────────────────────────────
function IssueFormModal({ issue, brands, users, currentUser, visibleBrands, defaultType, onSave, onClose }) {
  const isEdit = !!issue;
  const [form, setForm] = useState({
    brandId: issue?.brandId || visibleBrands[0]?.id || "",
    type: issue?.type || defaultType || "Issue",
    title: issue?.title || "",
    description: issue?.description || "",
    category: issue?.category || ISSUE_CATEGORIES[0],
    priority: issue?.priority || "Medium",
    status: issue?.status || "Open",
    assignedTo: issue?.assignedTo || "",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const inputCls = "w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none";
  const selCls = `${inputCls}`;

  const handleSave = () => {
    if (!form.title.trim()) return;
    const brand = brands.find(b => b.id === form.brandId);
    const now = new Date().toISOString();
    onSave({
      id: issue?.id || `issue-${Date.now()}`,
      ...form,
      brandName: brand?.name || "",
      reportedBy: issue?.reportedBy || currentUser.name,
      createdAt: issue?.createdAt || now,
      updatedAt: now,
      comments: issue?.comments || [],
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h3 className="font-bold text-white">{isEdit ? `Edit ${form.type}` : `Report New ${form.type}`}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
          {!isEdit && (
            <div>
              <label className="text-xs text-slate-600 font-semibold mb-1.5 block">Location</label>
              <div className="flex flex-wrap gap-2">
                {visibleBrands.map(b => (
                  <button key={b.id} onClick={() => set("brandId", b.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${form.brandId === b.id ? "text-white border-transparent" : "bg-slate-800 text-slate-600 border-slate-700 hover:bg-slate-700"}`}
                    style={form.brandId === b.id ? { background: b.color } : {}}>
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-slate-600 font-semibold mb-1.5 block">Type</label>
            <div className="flex gap-2">
              {ISSUE_TYPES.map(t => (
                <button key={t} onClick={() => set("type", t)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${form.type === t ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-slate-600 hover:bg-slate-700"}`}>
                  {t === "Issue" ? "🔴 Issue" : "🔧 Maintenance"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-600 font-semibold mb-1.5 block">Title *</label>
            <input value={form.title} onChange={e => set("title", e.target.value)} placeholder={form.type === "Maintenance" ? "Brief description of the maintenance task" : "Brief description of the issue"} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-600 font-semibold mb-1.5 block">Full Description</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="Provide full details, location within the venue, impact on operations…" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-600 font-semibold mb-1.5 block">Category</label>
              <select value={form.category} onChange={e => set("category", e.target.value)} className={selCls}>
                {ISSUE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-600 font-semibold mb-1.5 block">Priority</label>
              <select value={form.priority} onChange={e => set("priority", e.target.value)} className={selCls}>
                {ISSUE_PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          {isEdit && (
            <>
              <div>
                <label className="text-xs text-slate-600 font-semibold mb-1.5 block">Status</label>
                <select value={form.status} onChange={e => set("status", e.target.value)} className={selCls}>
                  {ISSUE_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-600 font-semibold mb-1.5 block">Assigned To</label>
                <select value={form.assignedTo} onChange={e => set("assignedTo", e.target.value)} className={selCls}>
                  <option value="">— Unassigned —</option>
                  {(users || []).map(u => (
                    <option key={u.id} value={u.name}>{u.name} ({u.role})</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-slate-700">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!form.title.trim()} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-40 transition-colors">
            {isEdit ? "Save Changes" : `Report ${form.type}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Issue Detail Modal ───────────────────────────────────────────────────────
function IssueDetailModal({ issue, brands, users, currentUser, onUpdate, onClose }) {
  const [status, setStatus] = useState(issue.status);
  const [assignedTo, setAssignedTo] = useState(issue.assignedTo || "");
  const [comment, setComment] = useState("");
  const [localIssue, setLocalIssue] = useState(issue);

  const brand = brands.find(b => b.id === issue.brandId);
  const StatusIcon = STATUS_CONFIG[status]?.icon || AlertCircle;

  const handleStatusChange = (newStatus) => {
    setStatus(newStatus);
    const updated = { ...localIssue, status: newStatus, assignedTo, updatedAt: new Date().toISOString() };
    setLocalIssue(updated);
    onUpdate(updated);
  };

  const handleAddComment = () => {
    if (!comment.trim()) return;
    const newComment = { id: Date.now(), author: currentUser.name, text: comment.trim(), createdAt: new Date().toISOString() };
    const updated = { ...localIssue, comments: [...(localIssue.comments || []), newComment], updatedAt: new Date().toISOString() };
    setLocalIssue(updated);
    onUpdate(updated);
    setComment("");
  };

  const handleAssignSave = () => {
    const updated = { ...localIssue, assignedTo, updatedAt: new Date().toISOString() };
    setLocalIssue(updated);
    onUpdate(updated);
  };

  const sc = STATUS_CONFIG[status];
  const pc = PRIORITY_CONFIG[issue.priority];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: "85vh" }}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-700 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge label={issue.priority} color={pc.color} />
              <Badge label={issue.category} color="slate" />
              {brand && <span className="text-xs text-slate-500 flex items-center gap-1"><MapPin size={10}/>{brand.name}</span>}
            </div>
            <h3 className="font-bold text-white text-base">{issue.title}</h3>
            <div className="text-xs text-slate-500 mt-1">Reported by {issue.reportedBy} · {new Date(issue.createdAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white flex-shrink-0"><X size={18}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Description */}
          {issue.description && (
            <div>
              <div className="text-xs text-slate-600 font-semibold mb-2 uppercase tracking-widest">Description</div>
              <div className="text-sm text-slate-700 bg-slate-800/40 rounded-xl p-3 border border-slate-800/60">{issue.description}</div>
            </div>
          )}

          {/* Status Control */}
          <div>
            <div className="text-xs text-slate-600 font-semibold mb-2 uppercase tracking-widest">Status</div>
            <div className="flex flex-wrap gap-2">
              {ISSUE_STATUSES.map(s => {
                const cfg = STATUS_CONFIG[s];
                const SIcon = cfg.icon;
                return (
                  <button key={s} onClick={() => handleStatusChange(s)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${status === s ? `bg-${cfg.color}-600 border-${cfg.color}-500 text-white` : "bg-slate-800 border-slate-700 text-slate-600 hover:bg-slate-700"}`}
                    style={status === s ? { background: { red:"#dc2626", amber:"#d97706", indigo:"#4f46e5", emerald:"#059669", slate:"#475569" }[cfg.color], borderColor: "transparent" } : {}}>
                    <SIcon size={11}/>{s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Assignment */}
          <div>
            <div className="text-xs text-slate-600 font-semibold mb-2 uppercase tracking-widest">Assigned To</div>
            <div className="flex gap-2">
              <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none">
                <option value="">— Unassigned —</option>
                {(users || []).map(u => (
                  <option key={u.id} value={u.name}>{u.name} ({u.role})</option>
                ))}
              </select>
              <button onClick={handleAssignSave} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-colors">Assign</button>
            </div>
            {localIssue.assignedTo && <div className="text-xs text-slate-500 mt-1">Assigned to: <span className="text-indigo-400 font-semibold">{localIssue.assignedTo}</span></div>}
          </div>

          {/* Comments */}
          <div>
            <div className="text-xs text-slate-600 font-semibold mb-2 uppercase tracking-widest">Comments & Updates ({localIssue.comments?.length || 0})</div>
            <div className="space-y-2 mb-3">
              {(localIssue.comments || []).length === 0 && <div className="text-xs text-slate-600 py-2">No comments yet</div>}
              {(localIssue.comments || []).map(c => (
                <div key={c.id} className="bg-slate-950 border border-slate-800/60 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-slate-700">{c.author}</span>
                    <span className="text-xs text-slate-600">{new Date(c.createdAt).toLocaleString("en-GB", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })}</span>
                  </div>
                  <div className="text-xs text-slate-600">{c.text}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment or update…" onKeyDown={e => e.key === "Enter" && handleAddComment()}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none" />
              <button onClick={handleAddComment} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-colors flex items-center gap-1">
                <MessageSquare size={12}/> Post
              </button>
            </div>
          </div>

          {/* Last Updated */}
          <div className="text-xs text-slate-600 flex items-center gap-1">
            <Clock size={10}/> Last updated: {new Date(localIssue.updatedAt).toLocaleString("en-GB", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Issues Tracker View ──────────────────────────────────────────────────────
function IssuesView({ brands, stores, visibleStoreIds, issues, users, currentUser, onAddIssue, onUpdateIssue, onDeleteIssue }) {
  const { user } = useAuth();

  const allVisibleStores = useMemo(
    () => (stores || []).filter(s => visibleStoreIds?.includes(s.id) && !s.archivedAt),
    [stores, visibleStoreIds]
  );
  const [ownership, setOwnership] = useState(isHqOrAbove(user.role) ? "owned" : "all");
  const visibleStores = useMemo(
    () => applyOwnershipFilter(allVisibleStores, ownership, user.role),
    [allVisibleStores, ownership, user.role]
  );

  const [selStore, setSelStore] = useState("all");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [newIssueType, setNewIssueType] = useState("Issue");
  const [detailIssue, setDetailIssue] = useState(null);
  const [editIssue, setEditIssue] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  // Reset selStore if it falls out of scope (ownership change)
  useEffect(() => {
    if (selStore !== "all" && !visibleStores.some(s => s.id === selStore)) {
      setSelStore("all");
    }
  }, [visibleStores, selStore]);

  const inScopeStoreIds = useMemo(() => new Set(visibleStores.map(s => s.id)), [visibleStores]);
  const visibleBrandIds = useMemo(() => new Set(visibleStores.map(s => s.brandId)), [visibleStores]);

  // visibleBrands kept for backward-compat with downstream IssueFormModal that
  // still uses brand chips for issue authorship. Falls out of scope cleanly
  // when a manager has no brands.
  const visibleBrands = useMemo(
    () => brands.filter(b => visibleBrandIds.has(b.id) || isHqOrAbove(user.role) || user.brandIds?.includes(b.id)),
    [brands, visibleBrandIds, user.role, user.brandIds]
  );

  // Per the design decision: store managers see only their stores' issues.
  // Owner/HQ see everything in scope. A row with no storeId (legacy) is
  // accepted if its brandId matches a brand in the user's store set OR if
  // the user is HQ/owner.
  const inScope = (i) => {
    if (i.storeId) {
      if (selStore === "all") return inScopeStoreIds.has(i.storeId);
      return i.storeId === selStore;
    }
    // Legacy issue without storeId: brand-level fallback.
    if (isHqOrAbove(user.role)) return true;
    return visibleBrandIds.has(i.brandId);
  };

  const visibleIssues = issues.filter(issue => {
    if (!inScope(issue)) return false;
    if (filterStatus !== "All" && issue.status !== filterStatus) return false;
    if (filterPriority !== "All" && issue.priority !== filterPriority) return false;
    if (filterType !== "All" && (issue.type || "Issue") !== filterType) return false;
    return true;
  }).sort((a, b) => {
    const pOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const statusCounts = ISSUE_STATUSES.reduce((acc, s) => { acc[s] = issues.filter(i => inScope(i) && i.status === s).length; return acc; }, {});

  const filterBtnCls = (active) => `px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${active ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-600 hover:bg-slate-700"}`;

  if (allVisibleStores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <CheckSquare size={32} className="mb-3 text-slate-700"/>
        <div className="text-sm font-semibold">No stores assigned to your account.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {ISSUE_STATUSES.map(s => {
          const cfg = STATUS_CONFIG[s];
          const SIcon = cfg.icon;
          const colorMap = { red: "from-red-600/20 to-red-600/5 border-red-500/30 text-red-400", amber: "from-amber-600/20 to-amber-600/5 border-amber-500/30 text-amber-400", indigo: "from-indigo-600/20 to-indigo-600/5 border-indigo-500/30 text-indigo-400", emerald: "from-emerald-600/20 to-emerald-600/5 border-emerald-500/30 text-emerald-400", slate: "from-slate-700/40 to-slate-700/10 border-slate-700 text-slate-600" };
          return (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? "All" : s)}
              className={`rounded-2xl bg-gradient-to-br border p-4 text-left transition-all ${colorMap[cfg.color]} ${filterStatus === s ? "ring-2 ring-white/20" : ""}`}>
              <div className="flex items-center justify-between mb-2">
                <SIcon size={14} />
                <span className="text-2xl font-bold text-white">{statusCounts[s]}</span>
              </div>
              <div className="text-xs font-semibold text-slate-600">{s}</div>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFilterType("All")} className={filterBtnCls(filterType === "All")}>All Types</button>
            <button onClick={() => setFilterType("Issue")} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${filterType === "Issue" ? "bg-red-600 text-white" : "bg-slate-800 text-slate-600 hover:bg-slate-700"}`}>🔴 Issues</button>
            <button onClick={() => setFilterType("Maintenance")} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${filterType === "Maintenance" ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-600 hover:bg-slate-700"}`}>🔧 Maintenance</button>
          </div>
          <div className="flex flex-wrap gap-1.5 ml-auto">
            <button onClick={() => { setNewIssueType("Issue"); setShowForm(true); }} className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white rounded-xl px-3 py-2 text-xs font-semibold transition-colors">
              <Plus size={12}/> Report Issue
            </button>
            <button onClick={() => { setNewIssueType("Maintenance"); setShowForm(true); }} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl px-3 py-2 text-xs font-semibold transition-colors">
              <Plus size={12}/> Add Maintenance
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StoreScopeDropdown stores={visibleStores} brands={brands} value={selStore} onChange={setSelStore} className="w-64"/>
          <SelectDropdown value={filterPriority} onChange={setFilterPriority} className="w-36">
            <option value="All">All Priorities</option>
            {ISSUE_PRIORITIES.map(p => <option key={p}>{p}</option>)}
          </SelectDropdown>
        </div>
      </div>

      {/* Issues List */}
      {visibleIssues.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <CheckSquare size={32} className="mb-3 text-slate-700" />
          <div className="text-sm font-semibold">No issues match your filters</div>
          <div className="text-xs mt-1">Try adjusting the filters above or report a new issue</div>
        </div>
      )}
      <div className="space-y-3">
        {visibleIssues.map(issue => {
          const brand = brands.find(b => b.id === issue.brandId);
          const store = issue.storeId ? stores?.find(s => s.id === issue.storeId) : null;
          const sc = STATUS_CONFIG[issue.status];
          const pc = PRIORITY_CONFIG[issue.priority];
          const SIcon = sc?.icon || AlertCircle;
          const statusColors = { red: "#dc2626", amber: "#d97706", indigo: "#4f46e5", emerald: "#059669", slate: "#475569" };

          return (
            <div key={issue.id} className="bg-slate-900 border border-slate-700 rounded-2xl p-4 hover:border-slate-600 transition-all">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: (statusColors[sc?.color] || "#475569") + "25" }}>
                  <SIcon size={18} style={{ color: statusColors[sc?.color] || "#94a3b8" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {(issue.type||"Issue") === "Maintenance" ? <Badge label="🔧 Maintenance" color="amber"/> : <Badge label="🔴 Issue" color="red"/>}
                        <Badge label={issue.priority} color={pc.color} />
                        <Badge label={issue.category} color="slate" />
                        <Badge label={issue.status} color={sc.color} />
                        {brand && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: brand.color }} />
                            {brand.name}{store ? ` · ${store.shortName || store.name}` : ""}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-white">{issue.title}</div>
                      {issue.description && <div className="text-xs text-slate-600 mt-0.5 line-clamp-1">{issue.description}</div>}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                        <span>by {issue.reportedBy}</span>
                        <span>{new Date(issue.createdAt).toLocaleDateString("en-GB", { day:"numeric", month:"short" })}</span>
                        {issue.assignedTo && <span className="text-indigo-400">→ {issue.assignedTo}</span>}
                        {(issue.comments?.length || 0) > 0 && <span className="flex items-center gap-1"><MessageSquare size={10}/>{issue.comments.length}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => setDetailIssue(issue)} className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 text-slate-700 hover:bg-slate-700 transition-colors">View</button>
                      <button onClick={() => setEditIssue(issue)} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"><Edit size={13}/></button>
                      {isHqOrAbove(user.role) && (
                        <button onClick={() => setDeleteId(issue.id)} className="p-1.5 rounded-xl bg-slate-800 text-slate-600 hover:text-red-400 hover:bg-red-950/20 transition-colors"><Trash2 size={13}/></button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      {showForm && <IssueFormModal brands={brands} currentUser={currentUser} visibleBrands={visibleBrands} defaultType={newIssueType} onSave={onAddIssue} onClose={() => setShowForm(false)} />}
      {editIssue && <IssueFormModal issue={editIssue} brands={brands} users={users} currentUser={currentUser} visibleBrands={visibleBrands} onSave={issue => { onUpdateIssue(issue); setEditIssue(null); }} onClose={() => setEditIssue(null)} />}
      {detailIssue && <IssueDetailModal issue={detailIssue} brands={brands} users={users} currentUser={currentUser} onUpdate={updated => { onUpdateIssue(updated); setDetailIssue(updated); }} onClose={() => setDetailIssue(null)} />}
      {deleteId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/25 flex items-center justify-center flex-shrink-0"><AlertTriangle size={18} className="text-red-400"/></div>
              <div className="text-sm text-slate-700">Delete this issue? This cannot be undone.</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700 transition-colors">Cancel</button>
              <button onClick={() => { onDeleteIssue(deleteId); setDeleteId(null); }} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
// ─── Employee Login Screen ────────────────────────────────────────────────────
// PIN-based login: pick your name from a list, enter your 4–6 digit PIN.
function EmployeeLoginScreen({ opsTeam, brands, onLogin, onSwitchToManager }) {
  const [selectedMember, setSelectedMember] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  const brand = selectedMember ? brands.find(b => b.id === selectedMember.brandId) : null;

  const handlePinDigit = (digit) => {
    if (pin.length >= 6) return;
    setPin(p => p + digit);
    setError("");
  };

  const handleBackspace = () => setPin(p => p.slice(0, -1));

  const handleSubmit = () => {
    if (!selectedMember) return;
    if (pin === selectedMember.pin) {
      onLogin({
        id: selectedMember.id,
        name: `${selectedMember.firstName} ${selectedMember.lastName}`.trim(),
        role: "employee",
        brandIds: [selectedMember.brandId],
        avatar: (selectedMember.firstName[0] + (selectedMember.lastName?.[0] || "")).toUpperCase(),
        opsTeamMemberId: selectedMember.id,
        employeeRole: selectedMember.role,
        color: selectedMember.color,
      });
    } else {
      setError("Incorrect PIN. Try again.");
      setShake(true);
      setPin("");
      setTimeout(() => setShake(false), 600);
    }
  };

  const handleClear = () => { setSelectedMember(null); setPin(""); setError(""); };

  // Group team members by brand
  const byBrand = brands.map(b => ({
    brand: b,
    members: opsTeam.filter(m => m.brandId === b.id),
  })).filter(g => g.members.length > 0);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-600/20 border border-indigo-500/30 rounded-2xl px-4 py-2 mb-4">
            <BarChart2 size={18} className="text-indigo-400"/>
            <span className="text-indigo-300 font-bold text-sm tracking-wide">CREATE BRANDS</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Team Sign In</h1>
          <p className="text-slate-600 text-sm mt-1">Select your name and enter your PIN</p>
        </div>

        {!selectedMember ? (
          /* ── Step 1: Pick name ── */
          <div className="space-y-4">
            {byBrand.map(({ brand: b, members }) => (
              <div key={b.id}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: b.color }}/>
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">{b.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {members.map(m => (
                    <button key={m.id} onClick={() => { setSelectedMember(m); setPin(""); setError(""); }}
                      className="flex items-center gap-3 bg-slate-900 border border-slate-700 hover:border-indigo-500/30 hover:bg-slate-800 rounded-2xl p-4 transition-all text-left group">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all"
                        style={{ background: (m.color || "#6366f1") + "30", color: m.color || "#6366f1" }}>
                        {m.firstName[0]}{m.lastName?.[0] || ""}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">{m.firstName} {m.lastName}</div>
                        <div className="text-xs text-slate-500 truncate">{m.role}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {opsTeam.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm">
                No team members set up yet. Ask your manager to add staff in Ops Settings.
              </div>
            )}
          </div>
        ) : (
          /* ── Step 2: Enter PIN ── */
          <div className="space-y-5">
            {/* Selected user */}
            <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-2xl p-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold flex-shrink-0"
                style={{ background: (selectedMember.color || "#6366f1") + "30", color: selectedMember.color || "#6366f1" }}>
                {selectedMember.firstName[0]}{selectedMember.lastName?.[0] || ""}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold text-white">{selectedMember.firstName} {selectedMember.lastName}</div>
                <div className="text-xs text-slate-600">{selectedMember.role} · {brand?.name}</div>
              </div>
              <button onClick={handleClear} className="text-slate-500 hover:text-slate-700 transition-colors p-1">
                <X size={16}/>
              </button>
            </div>

            {/* PIN dots */}
            <div className="flex justify-center gap-3">
              {Array.from({ length: Math.max(4, pin.length + (pin.length < 6 ? 1 : 0)) }).map((_, i) => (
                <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${
                  i < pin.length
                    ? "bg-indigo-500 border-indigo-500"
                    : "bg-transparent border-slate-600"
                } ${shake ? "animate-bounce" : ""}`}/>
              ))}
            </div>

            {error && (
              <div className="flex items-center justify-center gap-2 text-red-400 text-sm font-semibold">
                <AlertTriangle size={13}/> {error}
              </div>
            )}

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-3">
              {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((key, idx) => {
                if (key === "") return <div key={idx}/>;
                return (
                  <button key={key} onClick={() => key === "⌫" ? handleBackspace() : handlePinDigit(key)}
                    className={`h-16 rounded-2xl text-xl font-bold transition-all active:scale-95 ${
                      key === "⌫"
                        ? "bg-slate-800 text-slate-600 hover:bg-slate-700 hover:text-white"
                        : "bg-slate-800 text-white hover:bg-slate-700"
                    }`}>
                    {key}
                  </button>
                );
              })}
            </div>

            {/* Submit */}
            <button onClick={handleSubmit} disabled={pin.length < 4}
              className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base transition-all active:scale-98">
              Sign In
            </button>
          </div>
        )}

        {/* Switch to manager login */}
        <div className="text-center">
          <button onClick={onSwitchToManager} className="text-xs text-slate-600 hover:text-slate-600 transition-colors">
            Manager / Owner sign in →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Employee Shell ───────────────────────────────────────────────────────────
// Restricted layout shown to employees — only ops-relevant views, no financial data.
function EmployeeShell({ currentUser, brands, stores = [], opsTeam, assignments, checklists, tempUnits,
  cleaningTasks, auditTrail, checklistStates, tempLogs, deliveries, issues,
  onSignOff, onChecklistItemToggle, onTempLog, onDeliveryAdd, onAddIssue, onUpdateIssue,
  hdTickets, onAddHdTicket, onUpdateHdTicket, messages, onSendMessage, onMarkRead,
  availability, onAddAvailability, onUpdateAvailability,
  schedules, punchRecords, onAmendPunch, onAddPunchComment,
  onLogout }) {

  const brand = brands.find(b => b.id === currentUser.brandIds[0]);
  const [activeView, setActiveView] = useState("ops-tasks");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const overdueCount = assignments.filter(a =>
    currentUser.brandIds.includes(a.brandId) && isActiveToday(a) && isOverdue(a)
  ).length;

  const NAV = [
    { key: "ops-tasks",      label: "Today's Tasks",    icon: ListChecks,  badge: overdueCount > 0 ? overdueCount.toString() : null },
    { key: "ops-temps",      label: "Temperature Log",  icon: Thermometer },
    { key: "ops-deliveries", label: "Deliveries",       icon: Truck },
    { key: "ops-network",    label: "Ops Status",       icon: ShieldCheck },
    { key: "issues",         label: "Report Issue",     icon: Wrench },
    { key: "comms", label: "Communication", icon: MessageSquare, badge: (() => {
        const myId = currentUser.id; const myOpsId = currentUser.opsTeamMemberId || currentUser.id;
        const unread = (messages || []).filter(m => {
          if (m.fromId === myId || m.fromId === myOpsId) return false;
          if (m.toScope === "all_locations") return true;
          if (m.toScope === "location" && currentUser.brandIds.includes(m.toBrandId)) return true;
          if (m.toScope === "individual" && (m.toPersonId === myId || m.toPersonId === myOpsId)) return true;
          return false;
        }).filter(m => !m.readBy?.includes(myId)).length;
        return unread > 0 ? unread.toString() : null;
      })() },
  ];

  const titles = {
    "ops-tasks":      "Today's Tasks",
    "ops-temps":      "Temperature Log",
    "ops-deliveries": "Deliveries",
    "ops-network":    "Ops Status",
    "issues":         "Report an Issue",
    "comms":          "Communication",
    "availability":   "Availability",
    "emp-schedule":   "My Schedule",
  };

  const NavBar = () => (
    <nav className="flex items-center gap-1 overflow-x-auto px-3 py-2 bg-slate-900 border-b border-slate-800/60">
      {NAV.map(n => {
        const NIcon = n.icon; const active = activeView === n.key;
        return (
          <button key={n.key} onClick={() => { setActiveView(n.key); setDrawerOpen(false); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 relative ${active ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-800 hover:text-white"}`}>
            <NIcon size={13}/>{n.label}
            {n.badge && <span className="ml-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">{n.badge}</span>}
          </button>
        );
      })}
    </nav>
  );

  // Employee-filtered versions
  const myBrands = brands.filter(b => currentUser.brandIds.includes(b.id));
  const myIssues = issues.filter(i => currentUser.brandIds.includes(i.brandId));

  return (
    <AuthContext.Provider value={{ user: currentUser }}>
      <div className="min-h-screen bg-slate-950 text-white flex flex-col">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/60 bg-slate-900 sticky top-0 z-10">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <BarChart2 size={15} className="text-white"/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white truncate">{currentUser.name}</div>
            <div className="text-xs text-slate-500">{currentUser.employeeRole} · {brand?.name || "—"}</div>
          </div>
          <div className="flex items-center gap-2">
            {brand && <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-700"><span className="w-1.5 h-1.5 rounded-full" style={{ background: brand.color }}/>{brand.name}</span>}
            <button onClick={onLogout} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-slate-600 hover:text-red-400 hover:bg-red-950/20 text-xs font-semibold transition-all">
              <LogOut size={13}/> Sign out
            </button>
          </div>
        </header>

        {/* Nav bar */}
        <NavBar />

        {/* Content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {activeView === "ops-tasks" && (
            <TodaysTasks
              brands={myBrands} assignments={assignments} checklists={checklists}
              tempUnits={tempUnits} cleaningTasks={cleaningTasks} auditTrail={auditTrail}
              checklistStates={checklistStates} onSignOff={onSignOff}
              onChecklistItemToggle={onChecklistItemToggle}
            />
          )}
          {activeView === "ops-temps" && (
            <TemperatureLog
              brands={myBrands} tempUnits={tempUnits} tempLogs={tempLogs} onLog={onTempLog}
            />
          )}
          {activeView === "ops-deliveries" && (
            <DeliveriesView
              brands={myBrands} deliveries={deliveries} onAdd={onDeliveryAdd}
            />
          )}
          {activeView === "ops-network" && (
            <OpsNetworkDashboard
              brands={myBrands}
              stores={stores}
              visibleStoreIds={(stores || []).filter(s => !s.archivedAt && (isHqOrAbove(currentUser?.role) || (currentUser?.storeIds || []).includes(s.id))).map(s => s.id)}
              assignments={assignments} auditTrail={auditTrail}
              opsTeam={opsTeam} checklists={checklists} tempUnits={tempUnits}
              cleaningTasks={cleaningTasks}
            />
          )}
          {activeView === "issues" && (
            <EmployeeIssueReporter
              brands={myBrands} issues={myIssues} currentUser={currentUser}
              onAdd={onAddIssue} onUpdate={onUpdateIssue}
            />
          )}

          {activeView === "comms" && (
            <CommunicationView
              currentUser={currentUser} brands={myBrands} stores={stores} opsTeam={opsTeam} users={[]}
              messages={messages || []} onSend={onSendMessage} onMarkRead={onMarkRead}
              tickets={hdTickets || []} onAddTicket={onAddHdTicket} onUpdateTicket={onUpdateHdTicket} onDeleteTicket={() => {}}
              availability={availability || []} onAddAvailability={onAddAvailability} onUpdateAvailability={onUpdateAvailability}
              schedules={schedules || []} shiftPresets={[]} onAddSchedule={() => {}} onDeleteSchedule={() => {}} onPublishWeek={() => {}}
              punchRecords={punchRecords || []} onUpdatePunchRecord={onAmendPunch} onAddPunchComment={onAddPunchComment}
              isEmployee={true}
            />
          )}
        </main>
      </div>
    </AuthContext.Provider>
  );
}

// ─── Employee Issue Reporter ──────────────────────────────────────────────────
// Simplified issue reporting for employees — just report + see your own reports.
function EmployeeIssueReporter({ brands, issues, currentUser, onAdd, onUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setFormState] = useState({ brandId: brands[0]?.id || "", title: "", description: "", category: ISSUE_CATEGORIES[0], priority: "Medium" });
  const set = (k, v) => setFormState(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    const brand = brands.find(b => b.id === form.brandId);
    onAdd({
      id: `issue-${Date.now()}`,
      brandId: form.brandId,
      brandName: brand?.name || "",
      title: form.title.trim(),
      description: form.description,
      category: form.category,
      priority: form.priority,
      status: "Open",
      type: "Issue",
      reportedBy: currentUser.name,
      assignedTo: "",
      comments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setFormState({ brandId: brands[0]?.id || "", title: "", description: "", category: ISSUE_CATEGORIES[0], priority: "Medium" });
    setShowForm(false);
  };

  const myIssues = [...issues]
    .filter(i => i.reportedBy === currentUser.name)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const priorityColor = p => ({ Critical: "red", High: "amber", Medium: "indigo", Low: "slate" }[p] || "slate");
  const statusColor  = s => ({ Open: "red", "In Progress": "amber", "Awaiting Parts": "indigo", Resolved: "emerald", Closed: "slate" }[s] || "slate");

  return (
    <div className="space-y-5 max-w-xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">Report an Issue</h2>
          <p className="text-xs text-slate-600 mt-0.5">Let your manager know about anything that needs attention</p>
        </div>
        <button onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors">
          <Plus size={14}/> {showForm ? "Cancel" : "New Report"}
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white">New Issue Report</h3>
          {brands.length > 1 && (
            <div><label className={labelCls}>Location</label>
              <div className="flex flex-wrap gap-2">{brands.map(b => <button key={b.id} onClick={() => set("brandId", b.id)} className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${form.brandId === b.id ? "text-white border-transparent" : "bg-slate-800 text-slate-600 border-slate-700 hover:bg-slate-700"}`} style={form.brandId === b.id ? { background: b.color } : {}}>{b.name}</button>)}</div>
            </div>
          )}
          <div><label className={labelCls}>What's the issue? *</label>
            <input value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Dishwasher not draining" className={inputCls}/>
          </div>
          <div><label className={labelCls}>More details</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={3} placeholder="Describe what happened, when you noticed it, any relevant info…" className={`${inputCls} resize-none`}/>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>Category</label>
              <select value={form.category} onChange={e => set("category", e.target.value)} className={inputCls}>
                {ISSUE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>How urgent?</label>
              <select value={form.priority} onChange={e => set("priority", e.target.value)} className={inputCls}>
                {ISSUE_PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <button onClick={handleSubmit} disabled={!form.title.trim()}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-sm transition-colors">
            Submit Report
          </button>
        </div>
      )}

      {/* My recent reports */}
      {myIssues.length > 0 && (
        <div>
          <div className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-3">Your Recent Reports</div>
          <div className="space-y-3">
            {myIssues.slice(0, 10).map(issue => (
              <div key={issue.id} className="bg-slate-900 border border-slate-700 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">{issue.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{new Date(issue.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Badge label={issue.priority} color={priorityColor(issue.priority)}/>
                    <Badge label={issue.status} color={statusColor(issue.status)}/>
                  </div>
                </div>
                {issue.description && <div className="text-xs text-slate-600 mt-2 line-clamp-2">{issue.description}</div>}
                {issue.assignedTo && <div className="text-xs text-indigo-400 mt-1.5">→ Assigned to {issue.assignedTo}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {myIssues.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <Wrench size={32} className="mb-3 text-slate-700"/>
          <div className="text-sm font-semibold">No reports yet</div>
          <div className="text-xs mt-1">Use the button above to report an issue</div>
        </div>
      )}
    </div>
  );
}


function LoginScreen({ users, onLogin, onSwitchToEmployee }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    setError(""); setLoading(true);
    setTimeout(() => {
      const user = users.find(u => u.email === email && u.password === password);
      if (user) onLogin(user); else { setError("Invalid email or password."); setLoading(false); }
    }, 600);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-600/20 border border-indigo-500/30 rounded-2xl px-4 py-2 mb-4">
            <BarChart2 size={18} className="text-indigo-400"/>
            <span className="text-indigo-300 font-bold text-sm tracking-wide">CREATE BRANDS</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Sign In</h1>
          <p className="text-slate-600 text-sm mt-1">Portfolio Dashboard</p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-950/20/50 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 text-sm">
              <AlertTriangle size={14}/> {error}
            </div>
          )}
          <div>
            <label className="text-xs text-slate-600 font-semibold mb-1.5 block">Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@createbrands.co.uk"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition-colors" />
          </div>
          <div>
            <label className="text-xs text-slate-600 font-semibold mb-1.5 block">Password</label>
            <div className="relative">
              <input value={password} onChange={e => setPassword(e.target.value)} type={showPass ? "text" : "password"} placeholder="••••••••"
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition-colors pr-10" />
              <button onClick={() => setShowPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                {showPass ? <EyeOff size={14}/> : <Eye size={14}/>}
              </button>
            </div>
          </div>
          <button onClick={handleSubmit} disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </div>
        {onSwitchToEmployee && (
          <div className="text-center">
            <button onClick={onSwitchToEmployee} className="text-xs text-slate-600 hover:text-slate-600 transition-colors">
              ← Back to team sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard View ───────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
// CHAIN PERFORMANCE VIEW — Chocoberry HQ rollup dashboard
// ═══════════════════════════════════════════════════════════════════════════════
function ChainPerformanceView({ brands, stores, flipdishStores, flipdishSyncLog, entries, currentUser, onRefreshSync }) {
  // Self-fetched sales (lazy-loaded, cached for 5 min). When the user clicks
  // Sync Now, invalidateFlipdishSalesCache() bumps the cache buster, which
  // re-runs this effect and fetches fresh.
  const [flipdishSales, setFlipdishSales] = useState([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState(null);
  const cacheBuster = getFlipdishSalesCacheBuster();
  useEffect(() => {
    let cancelled = false;
    setSalesLoading(true);
    fetchFlipdishSalesCached()
      .then(data => { if (!cancelled) { setFlipdishSales(data); setSalesError(null); }})
      .catch(err  => { if (!cancelled) { setSalesError(err.message || String(err)); }})
      .finally(()  => { if (!cancelled) { setSalesLoading(false); }});
    return () => { cancelled = true; };
  }, [cacheBuster]);

  // Webhook-era orders are no longer fetched anywhere. Kept as an empty array
  // so the few remaining .filter()/.forEach() references downstream (in dead
  // codepaths that populate unused row fields) don't crash.
  const flipdishOrders = [];
  const [period,        setPeriod]        = useState("week");  // today | yesterday | this_week | last_week | week | month | custom
  const [customFrom,    setCustomFrom]    = useState("");
  const [customTo,      setCustomTo]      = useState("");
  const [ownerFilter,   setOwnerFilter]   = useState("all");    // all | owned | joint_venture | franchise
  const [statusFilter,  setStatusFilter]  = useState("operational");
  const [storeDetailId, setStoreDetailId] = useState(null);
  const [sortBy,        setSortBy]        = useState("revenue"); // revenue | orders | atv | delta
  const [syncing,       setSyncing]       = useState(false);
  const [search,        setSearch]        = useState("");

  // ── Period range ─────────────────────────────────────────────────────────
  const now = new Date();
  const today = new Date(now); today.setHours(0,0,0,0);
  const toLocalDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const fmtMoney = (n) => "£" + (n || 0).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtMoneyDec = (n) => "£" + (n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (n) => (n >= 0 ? "+" : "") + n.toFixed(0) + "%";

  const { fromDate, toDate, prevFromDate, prevToDate, periodLabel } = useMemo(() => {
    let from, to, prevFrom, prevTo, label;
    const endOfToday = new Date(today); endOfToday.setHours(23,59,59,999);

    // Helper: start of current week (Monday 00:00) — UK convention.
    const startOfThisWeek = () => {
      const d = new Date(today);
      const dow = d.getDay();                 // 0=Sun..6=Sat
      const daysFromMonday = (dow + 6) % 7;   // Mon=0, Tue=1, ... Sun=6
      d.setDate(d.getDate() - daysFromMonday);
      return d;                                // already at 00:00 from `today`
    };

    if (period === "today") {
      from = new Date(today); to = endOfToday; label = "today";
      // Compare to same weekday last week
      prevFrom = new Date(today); prevFrom.setDate(prevFrom.getDate() - 7);
      prevTo   = new Date(prevFrom); prevTo.setHours(23,59,59,999);
    } else if (period === "yesterday") {
      from = new Date(today); from.setDate(from.getDate() - 1);
      to   = new Date(from);  to.setHours(23,59,59,999);
      label = "yesterday";
      prevFrom = new Date(from); prevFrom.setDate(prevFrom.getDate() - 7);
      prevTo   = new Date(prevFrom); prevTo.setHours(23,59,59,999);
    } else if (period === "this_week") {
      from = startOfThisWeek();
      to   = endOfToday;
      label = "this week";
      // Prior period: same number of elapsed days, ending the day before this week started
      const span = to - from;
      prevTo   = new Date(from.getTime() - 1);
      prevFrom = new Date(prevTo.getTime() - span);
    } else if (period === "last_week") {
      const thisMon = startOfThisWeek();
      from = new Date(thisMon); from.setDate(from.getDate() - 7);                  // last Monday 00:00
      to   = new Date(thisMon); to.setMilliseconds(to.getMilliseconds() - 1);      // last Sunday 23:59:59.999
      label = "last week";
      prevTo   = new Date(from.getTime() - 1);
      prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - 6); prevFrom.setHours(0,0,0,0);
    } else if (period === "week") {
      from = new Date(today); from.setDate(from.getDate() - 6); to = endOfToday;
      label = "last 7 days";
      prevTo = new Date(from.getTime() - 1);
      prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - 6); prevFrom.setHours(0,0,0,0);
    } else if (period === "month") {
      from = new Date(today); from.setDate(from.getDate() - 29); to = endOfToday;
      label = "last 30 days";
      prevTo = new Date(from.getTime() - 1);
      prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - 29); prevFrom.setHours(0,0,0,0);
    } else {
      from = customFrom ? new Date(customFrom + "T00:00:00") : new Date(today);
      to   = customTo   ? new Date(customTo   + "T23:59:59") : endOfToday;
      label = customFrom && customTo ? `${customFrom} – ${customTo}` : "custom range";
      const span = to - from;
      prevTo = new Date(from.getTime() - 1);
      prevFrom = new Date(prevTo.getTime() - span);
    }
    return { fromDate: from, toDate: to, prevFromDate: prevFrom, prevToDate: prevTo, periodLabel: label };
  }, [period, customFrom, customTo, today.getTime()]);

  // ── Filter orders to this period ─────────────────────────────────────────
  const periodOrders = useMemo(() => flipdishOrders.filter(o => {
    if (!o.orderPlacedTime) return false;
    const t = new Date(o.orderPlacedTime);
    return t >= fromDate && t <= toDate;
  }), [flipdishOrders, fromDate.getTime(), toDate.getTime()]);

  const prevOrders = useMemo(() => flipdishOrders.filter(o => {
    if (!o.orderPlacedTime) return false;
    const t = new Date(o.orderPlacedTime);
    return t >= prevFromDate && t <= prevToDate;
  }), [flipdishOrders, prevFromDate.getTime(), prevToDate.getTime()]);

  // ── Filter sales (POS / UberEats / Deliveroo / JustEats / FlipdishWebApp) ─
  // Filter on businessDate (the trading day) to match the server-side query
  // and operator intent. Using firstEventAt instead would mis-bucket late-night
  // sales that spill across midnight UTC.
  const periodSales = useMemo(() => flipdishSales.filter(s => {
    if (!s.businessDate) return false;
    const t = new Date(s.businessDate + "T12:00:00");   // noon avoids TZ-edge bugs
    return t >= fromDate && t <= toDate;
  }), [flipdishSales, fromDate.getTime(), toDate.getTime()]);

  const prevSales = useMemo(() => flipdishSales.filter(s => {
    if (!s.businessDate) return false;
    const t = new Date(s.businessDate + "T12:00:00");
    return t >= prevFromDate && t <= prevToDate;
  }), [flipdishSales, prevFromDate.getTime(), prevToDate.getTime()]);

  // ── Map flipdish_store_id → physical store ───────────────────────────────
  const fsToStore = useMemo(() => {
    const map = {};
    flipdishStores.forEach(fs => { map[fs.id] = { storeId: fs.storeId, channel: fs.channel }; });
    return map;
  }, [flipdishStores]);

  // ── Filter visible stores by ownership + status ──────────────────────────
  const visibleStores = useMemo(() => stores.filter(s => {
    if (s.brandId !== "chocoberry") return false;
    if (ownerFilter !== "all" && s.ownershipModel !== ownerFilter) return false;
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (search && !s.shortName?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [stores, ownerFilter, statusFilter, search]);

  // ── Per-store rollup ─────────────────────────────────────────────────────
  const storeMetrics = useMemo(() => {
    const init = (id) => ({
      storeId: id, revenue: 0, orders: 0, items: 0,
      online: 0, pos: 0, extra: 0,
      prevRevenue: 0, prevOrders: 0,
      // Per-channel sale counts AND revenue (from RMS Reporting API)
      salePos: 0,    revPos: 0,
      saleUber: 0,   revUber: 0,
      saleDeli: 0,   revDeli: 0,
      saleJe: 0,     revJe: 0,
      saleFda: 0,    revFda: 0,
      saleKiosk: 0,  revKiosk: 0,
      totalSales: 0, salesRevenue: 0,
      prevTotalSales: 0, prevSalesRevenue: 0,
    });
    const m = {};
    visibleStores.forEach(s => { m[s.id] = init(s.id); });

    periodOrders.forEach(o => {
      const link = fsToStore[o.flipdishStoreId];
      if (!link?.storeId || !m[link.storeId]) return;
      m[link.storeId].revenue += o.amountTotal || 0;
      m[link.storeId].orders += 1;
      m[link.storeId].items += o.itemCount || 0;
      const ch = link.channel || "extra";
      if (ch === "online") m[link.storeId].online += o.amountTotal || 0;
      else if (ch === "pos") m[link.storeId].pos += o.amountTotal || 0;
      else m[link.storeId].extra += o.amountTotal || 0;
    });
    prevOrders.forEach(o => {
      const link = fsToStore[o.flipdishStoreId];
      if (!link?.storeId || !m[link.storeId]) return;
      m[link.storeId].prevRevenue += o.amountTotal || 0;
      m[link.storeId].prevOrders += 1;
    });

    // RMS sales: count + sum amount_total per channel per store
    periodSales.forEach(s => {
      if (!s.storeId || !m[s.storeId]) return;
      const amt = s.amountTotal || 0;
      m[s.storeId].totalSales   += 1;
      m[s.storeId].salesRevenue += amt;
      switch (s.channel) {
        case "POS":            m[s.storeId].salePos++;   m[s.storeId].revPos   += amt; break;
        case "UberEats":       m[s.storeId].saleUber++;  m[s.storeId].revUber  += amt; break;
        case "Deliveroo":      m[s.storeId].saleDeli++;  m[s.storeId].revDeli  += amt; break;
        case "JustEats":       m[s.storeId].saleJe++;    m[s.storeId].revJe    += amt; break;
        case "FlipdishWebApp": m[s.storeId].saleFda++;   m[s.storeId].revFda   += amt; break;
        case "FlipdishKIOSK":  m[s.storeId].saleKiosk++; m[s.storeId].revKiosk += amt; break;
      }
    });
    prevSales.forEach(s => {
      if (!s.storeId || !m[s.storeId]) return;
      m[s.storeId].prevTotalSales   += 1;
      m[s.storeId].prevSalesRevenue += s.amountTotal || 0;
    });
    return m;
  }, [visibleStores, periodOrders, prevOrders, periodSales, prevSales, fsToStore]);

  // Sortable rows for the leaderboard
  const leaderboard = useMemo(() => {
    const rows = visibleStores.map(s => {
      const m = storeMetrics[s.id] || {
        revenue: 0, orders: 0, items: 0, prevRevenue: 0, prevOrders: 0,
        online: 0, pos: 0, extra: 0,
        salePos: 0, saleUber: 0, saleDeli: 0, saleJe: 0, saleFda: 0, saleKiosk: 0,
        revPos: 0, revUber: 0, revDeli: 0, revJe: 0, revFda: 0, revKiosk: 0,
        totalSales: 0, salesRevenue: 0,
        prevTotalSales: 0, prevSalesRevenue: 0,
      };
      // Total revenue = RMS salesRevenue (which already includes Web/Kiosk via FlipdishWebApp/FlipdishKIOSK).
      // We do NOT add m.revenue from flipdish_orders because RMS already covers those channels.
      const totalRevenue = m.salesRevenue;
      const prevTotalRevenue = m.prevSalesRevenue;
      const totalOrders = m.totalSales;       // RMS captures every channel
      const prevTotalOrders = m.prevTotalSales;
      const atv = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      const deltaPct = prevTotalRevenue > 0
        ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100
        : (totalRevenue > 0 ? 100 : 0);
      const ordersDelta = prevTotalOrders > 0
        ? ((totalOrders - prevTotalOrders) / prevTotalOrders) * 100
        : (totalOrders > 0 ? 100 : 0);
      return { store: s, ...m, totalRevenue, prevTotalRevenue, totalOrders, prevTotalOrders, atv, deltaPct, ordersDelta };
    });
    rows.sort((a, b) => {
      if (sortBy === "revenue") return b.totalRevenue - a.totalRevenue;
      if (sortBy === "orders")  return b.totalOrders  - a.totalOrders;
      if (sortBy === "atv")     return b.atv          - a.atv;
      if (sortBy === "delta")   return b.deltaPct     - a.deltaPct;
      return 0;
    });
    return rows;
  }, [visibleStores, storeMetrics, sortBy]);

  // ── Chain-level totals ───────────────────────────────────────────────────
  const totals = useMemo(() => {
    let revenue = 0, prevRevenue = 0;
    let orders = 0, prevOrders = 0;
    let revPos = 0, revUber = 0, revDeli = 0, revJe = 0, revFda = 0, revKiosk = 0;
    let salePos = 0, saleUber = 0, saleDeli = 0, saleJe = 0, saleFda = 0, saleKiosk = 0;
    leaderboard.forEach(r => {
      revenue       += r.totalRevenue;
      prevRevenue   += r.prevTotalRevenue;
      orders        += r.totalOrders;
      prevOrders    += r.prevTotalOrders;
      salePos += r.salePos; saleUber += r.saleUber; saleDeli += r.saleDeli;
      saleJe  += r.saleJe;  saleFda  += r.saleFda;  saleKiosk += r.saleKiosk;
      revPos  += r.revPos;  revUber  += r.revUber;  revDeli  += r.revDeli;
      revJe   += r.revJe;   revFda   += r.revFda;   revKiosk += r.revKiosk;
    });
    const atv         = orders > 0 ? revenue / orders : 0;
    const prevAtv     = prevOrders > 0 ? prevRevenue / prevOrders : 0;
    const revDelta    = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : (revenue > 0 ? 100 : 0);
    const orderDelta  = prevOrders  > 0 ? ((orders  - prevOrders)  / prevOrders)  * 100 : (orders  > 0 ? 100 : 0);
    const atvDelta    = prevAtv     > 0 ? ((atv     - prevAtv)     / prevAtv)     * 100 : 0;
    const activeStores = leaderboard.filter(r => r.totalOrders > 0).length;
    return {
      revenue, orders, atv,
      revPos, revUber, revDeli, revJe, revFda, revKiosk,
      salePos, saleUber, saleDeli, saleJe, saleFda, saleKiosk,
      revDelta, orderDelta, atvDelta, activeStores,
    };
  }, [leaderboard]);

  // ── Hour-of-day heatmap ──────────────────────────────────────────────────
  // Reads from periodSales (RMS) using sale_time. Webhook orders are no longer
  // the source of truth.
  const hourHeatmap = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));  // [dayOfWeek][hour] = order count
    periodSales.forEach(s => {
      if (!s.saleTime) return;
      const t = new Date(s.saleTime);
      const dow = (t.getDay() + 6) % 7;  // Monday=0
      grid[dow][t.getHours()] += 1;
    });
    return grid;
  }, [periodSales]);
  const maxHourCount = useMemo(() => Math.max(1, ...hourHeatmap.flat()), [hourHeatmap]);

  // ── Top items chain-wide ─────────────────────────────────────────────────
  // Currently disabled. Item-level data lives in flipdish_sales.sale_items
  // (JSONB, 5-50KB per row). We deliberately don't fetch that column — adding
  // it back would push initial dashboard load over ~1GB of transfer for the
  // 30-day window. To re-enable cleanly, build a Postgres RPC that aggregates
  // top items server-side and returns ~10 rows. Until then, return [] so the
  // section renders as empty (caller already gates on .length > 0).
  const topItems = useMemo(() => [], []);

  // ── EOD reconciliation: compare flipdish revenue vs eod_entries.net_sales ──
  const reconciliation = useMemo(() => {
    const fromStr = toLocalDate(fromDate);
    const toStr   = toLocalDate(toDate);
    const periodEod = entries.filter(e => e.date >= fromStr && e.date <= toStr);
    const eodRevenue = periodEod.reduce((a, e) => a + (e.netSales || 0), 0);
    const diff = totals.revenue - eodRevenue;
    const diffPct = eodRevenue > 0 ? (diff / eodRevenue) * 100 : 0;
    const ok = Math.abs(diffPct) <= 5;
    return { eodRevenue, flipdishRevenue: totals.revenue, diff, diffPct, ok, eodCount: periodEod.length };
  }, [entries, fromDate, toDate, totals.revenue]);

  // ── Last sync indicator ──────────────────────────────────────────────────
  // Last sync: derive from the actual ingested data, not from flipdish_sync_log.
  // The log stopped being written when we switched ingestion paths from the
  // webhook /orders endpoint to the RMS Reporting API. The freshest signal is
  // the max sale_time on rows we actually have — that proves the sync ran AND
  // returned data, in one number.
  // Note: flipdishSales rows don't include rms_synced_at in the lean column
  // set, so we use sale_time (the latest sale we know about) as a proxy.
  const lastSyncDate = useMemo(() => {
    let maxTs = 0;
    for (const s of flipdishSales) {
      if (!s.saleTime) continue;
      const t = new Date(s.saleTime).getTime();
      if (t > maxTs) maxTs = t;
    }
    return maxTs ? new Date(maxTs) : null;
  }, [flipdishSales]);
  const minsSinceSync = lastSyncDate ? Math.floor((Date.now() - lastSyncDate.getTime()) / 60000) : null;

  const handleSync = async () => {
    setSyncing(true);
    try { await onRefreshSync(); }
    finally { setSyncing(false); }
  };

  // ── Open store detail modal ──────────────────────────────────────────────
  const detailStore = storeDetailId ? stores.find(s => s.id === storeDetailId) : null;

  // Loading & error guards — show before the main dashboard renders, since
  // every section below depends on flipdishSales being populated.
  if (salesLoading && flipdishSales.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-base font-bold text-white">Chain Performance</h2>
          <div className="text-xs text-slate-500 mt-0.5">Loading sales data…</div>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="text-slate-400 text-sm">⏳ Fetching ~40k rows · this takes a few seconds on first open</div>
        </div>
      </div>
    );
  }
  if (salesError) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-base font-bold text-white">Chain Performance</h2>
        </div>
        <div className="rounded-xl bg-rose-950/40 border border-rose-900/60 p-4">
          <div className="text-sm font-semibold text-rose-300 mb-1">Couldn't load sales data</div>
          <div className="text-xs text-rose-200/70">{salesError}</div>
          <button
            onClick={() => { invalidateFlipdishSalesCache(); window.location.reload(); }}
            className="mt-3 px-3 py-1.5 rounded-lg bg-rose-900/50 hover:bg-rose-800/70 text-rose-100 text-xs font-semibold"
          >Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header + filters ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-white">Chain Performance</h2>
          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
            <span>Chocoberry · {visibleStores.length} {visibleStores.length === 1 ? "store" : "stores"}</span>
            <span className="text-slate-700">·</span>
            <span>{periodLabel}</span>
            {minsSinceSync !== null && (
              <>
                <span className="text-slate-700">·</span>
                <span className={minsSinceSync > 360 ? "text-amber-400" : "text-emerald-400"}
                      title="Time since the latest sale we have data for. Stays green during quiet hours.">
                  {minsSinceSync < 60
                    ? `Latest sale ${minsSinceSync}m ago`
                    : `Latest sale ${Math.floor(minsSinceSync / 60)}h ${minsSinceSync % 60}m ago`}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50">
            {syncing ? "Syncing…" : <><RefreshCw size={13}/> Sync now</>}
          </button>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/60 text-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="this_week">This week</option>
            <option value="last_week">Last week</option>
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
            <option value="custom">Custom range…</option>
          </select>
          {period === "custom" && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-2 py-2 rounded-xl bg-slate-900/80 border border-slate-700/60 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                aria-label="From date"
              />
              <span className="text-slate-500 text-xs">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-2 py-2 rounded-xl bg-slate-900/80 border border-slate-700/60 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                aria-label="To date"
              />
            </>
          )}
        </div>
      </div>

      {/* ── Top stat cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Revenue"
          value={fmtMoney(totals.revenue)}
          sub={`${fmtPct(totals.revDelta)} vs prior · all channels`}
          icon={PoundSterling}
          accent={totals.revDelta >= 0 ? "emerald" : "amber"}
        />
        <StatCard
          label="Orders"
          value={totals.orders.toLocaleString("en-GB")}
          sub={`${totals.salePos} POS · ${totals.saleUber + totals.saleDeli + totals.saleJe} marketplace · ${totals.saleFda + totals.saleKiosk} digital`}
          icon={ListChecks}
          accent={totals.orderDelta >= 0 ? "emerald" : "amber"}
        />
        <StatCard
          label="Avg Ticket"
          value={fmtMoneyDec(totals.atv)}
          sub={`${fmtPct(totals.atvDelta)} vs prior · chain-wide`}
          icon={ChefHat}
          accent="sky"
        />
        <StatCard
          label="Active stores"
          value={`${totals.activeStores} / ${visibleStores.length}`}
          sub={`${visibleStores.length - totals.activeStores} no orders this period`}
          icon={Globe}
          accent="indigo"
        />
      </div>

      {/* ── Reconciliation banner: Flipdish vs EOD ───────────────────────── */}
      {reconciliation.eodCount > 0 && (
        <div className={`rounded-2xl border p-3 flex items-center gap-3 flex-wrap ${
          reconciliation.ok
            ? "bg-emerald-950/20 border-emerald-500/30"
            : "bg-amber-950/30 border-amber-500/40"
        }`}>
          <div className={reconciliation.ok ? "text-emerald-400" : "text-amber-400"}>
            {reconciliation.ok ? <CheckCircle size={18}/> : <AlertTriangle size={18}/>}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-bold ${reconciliation.ok ? "text-emerald-300" : "text-amber-300"}`}>
              {reconciliation.ok
                ? "Flipdish ↔ EOD reconciled"
                : `Mismatch: Flipdish ${fmtPct(reconciliation.diffPct)} vs EOD reports`}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Flipdish: {fmtMoney(reconciliation.flipdishRevenue)} · EOD: {fmtMoney(reconciliation.eodRevenue)} ({reconciliation.eodCount} reports) · Diff: {fmtMoneyDec(reconciliation.diff)}
            </div>
          </div>
        </div>
      )}

      {/* ── Filters bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <SelectDropdown value={ownerFilter} onChange={setOwnerFilter} className="w-44">
          <option value="all">All ownership</option>
          <option value="owned">Owned only</option>
          <option value="joint_venture">Joint venture</option>
          <option value="franchise">Franchise</option>
        </SelectDropdown>
        <SelectDropdown value={statusFilter} onChange={setStatusFilter} className="w-40">
          <option value="operational">Operational</option>
          <option value="all">All statuses</option>
          <option value="closed">Closed</option>
          <option value="pre_opening">Pre-opening</option>
          <option value="test">Test/System</option>
        </SelectDropdown>
        <input
          type="search"
          placeholder="Search store…"
          value={search}
          onChange={e=>setSearch(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-700 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none w-40"
        />
      </div>

      {/* ── Store leaderboard table ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/60 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-white">Store leaderboard</h3>
          <div className="text-xs text-slate-500">Click a row for details</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/60 border-b border-slate-800/40">
              <tr>
                <th className="text-left px-4 py-2 text-slate-500 font-semibold uppercase tracking-widest">Store</th>
                <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-widest cursor-pointer hover:text-white"
                    onClick={()=>setSortBy("revenue")}>
                  Revenue {sortBy==="revenue" && "↓"}
                </th>
                <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-widest cursor-pointer hover:text-white"
                    onClick={()=>setSortBy("orders")}>
                  Orders {sortBy==="orders" && "↓"}
                </th>
                <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-widest cursor-pointer hover:text-white"
                    onClick={()=>setSortBy("atv")}>
                  ATV {sortBy==="atv" && "↓"}
                </th>
                <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-widest cursor-pointer hover:text-white"
                    onClick={()=>setSortBy("delta")}>
                  Δ {sortBy==="delta" && "↓"}
                </th>
                <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase tracking-widest">Channels</th>
                <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase tracking-widest">Type</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length === 0 && (
                <tr><td colSpan="7" className="text-center py-10 text-slate-500">No stores match the filters</td></tr>
              )}
              {leaderboard.map(r => {
                // Channel mini-bar: count-based across all 6 channels
                const chanCounts = [
                  { key: "pos",   count: r.salePos,   color: "bg-emerald-500", label: "POS" },
                  { key: "uber",  count: r.saleUber,  color: "bg-teal-500",    label: "UberEats" },
                  { key: "deli",  count: r.saleDeli,  color: "bg-cyan-500",    label: "Deliveroo" },
                  { key: "je",    count: r.saleJe,    color: "bg-orange-500",  label: "JustEat" },
                  { key: "fda",   count: r.saleFda,   color: "bg-pink-500",    label: "Web" },
                  { key: "kiosk", count: r.saleKiosk, color: "bg-indigo-500",  label: "Kiosk" },
                ];
                const channelTotal = chanCounts.reduce((a, c) => a + c.count, 0);
                return (
                  <tr key={r.store.id}
                    onClick={()=>setStoreDetailId(r.store.id)}
                    className="border-b border-slate-800/30 hover:bg-slate-800/40 cursor-pointer transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="font-bold text-white">{r.store.shortName || r.store.name}</div>
                      <div className="text-xs text-slate-500">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${
                          r.store.status === "operational" ? "bg-emerald-500" :
                          r.store.status === "closed" ? "bg-red-500" :
                          r.store.status === "pre_opening" ? "bg-amber-500" :
                          "bg-slate-600"
                        }`}/>
                        {r.store.status}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-white font-bold tabular-nums">{fmtMoney(r.totalRevenue)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-300 tabular-nums">{r.totalOrders.toLocaleString("en-GB")}</td>
                    <td className="px-3 py-2.5 text-right text-slate-300 tabular-nums">{r.totalOrders > 0 ? fmtMoneyDec(r.atv) : "—"}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                      r.totalOrders === 0 ? "text-slate-600" :
                      r.deltaPct >= 5 ? "text-emerald-400" :
                      r.deltaPct <= -5 ? "text-red-400" :
                      "text-slate-400"
                    }`}>{r.totalOrders === 0 ? "—" : fmtPct(r.deltaPct)}</td>
                    <td className="px-3 py-2.5">
                      {channelTotal === 0 ? (
                        <span className="text-slate-600">—</span>
                      ) : (
                        <div className="flex items-center gap-0.5 w-32" title={chanCounts.filter(c => c.count > 0).map(c => `${c.label}: ${c.count}`).join(" · ")}>
                          {chanCounts.map(c => c.count > 0 && (
                            <div key={c.key} className={`h-2 rounded-sm ${c.color}`} style={{ width: `${(c.count / channelTotal) * 100}%` }}/>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        r.store.ownershipModel === "owned" ? "bg-indigo-950/30 text-indigo-400" :
                        r.store.ownershipModel === "joint_venture" ? "bg-sky-950/30 text-sky-400" :
                        "bg-amber-950/30 text-amber-400"
                      }`}>
                        {r.store.ownershipModel === "joint_venture" ? "JV" : r.store.ownershipModel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {leaderboard.length > 0 && (
              <tfoot className="bg-indigo-950/30 border-t border-indigo-500/30">
                <tr>
                  <td className="px-4 py-3 font-bold text-white">Chain total</td>
                  <td className="px-3 py-3 text-right text-white font-black tabular-nums">{fmtMoney(totals.revenue)}</td>
                  <td className="px-3 py-3 text-right text-white font-bold tabular-nums">{totals.orders.toLocaleString("en-GB")}</td>
                  <td className="px-3 py-3 text-right text-white font-bold tabular-nums">{totals.orders > 0 ? fmtMoneyDec(totals.atv) : "—"}</td>
                  <td className={`px-3 py-3 text-right font-bold tabular-nums ${totals.revDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtPct(totals.revDelta)}</td>
                  <td colSpan="2"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Two-column: heatmap + channel breakdown + top items ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Heatmap */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
          <h3 className="text-sm font-bold text-white mb-3">When orders come in</h3>
          <div className="text-xs text-slate-500 mb-3">Hourly order density across the chain · darker = busier</div>
          <div className="overflow-x-auto">
            <div className="min-w-[500px]">
              {/* Header */}
              <div className="grid gap-0.5 mb-1" style={{ gridTemplateColumns: "32px repeat(24, 1fr)" }}>
                <div></div>
                {Array.from({length: 24}, (_, h) => (
                  <div key={h} className="text-center text-xs text-slate-600 font-mono py-0.5">{h % 3 === 0 ? String(h).padStart(2,"0") : ""}</div>
                ))}
              </div>
              {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((dow, i) => (
                <div key={dow} className="grid gap-0.5 mb-0.5" style={{ gridTemplateColumns: "32px repeat(24, 1fr)" }}>
                  <div className="text-xs text-slate-500 font-semibold pr-2 text-right py-1">{dow}</div>
                  {hourHeatmap[i].map((count, h) => {
                    const intensity = count / maxHourCount;
                    return (
                      <div key={h} className="rounded-sm h-5"
                        style={{
                          background: count === 0 ? "rgba(15,23,42,0.5)" : `rgba(99,102,241,${0.15 + intensity * 0.7})`,
                        }}
                        title={`${dow} ${String(h).padStart(2,"0")}:00 — ${count} orders`}/>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Channel split */}
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
          <h3 className="text-sm font-bold text-white mb-3">Channel split</h3>
          <div className="text-xs text-slate-500 mb-4">{periodLabel} revenue by source</div>
          {totals.revenue === 0 ? (
            <div className="text-sm text-slate-500 italic">No orders this period</div>
          ) : (
            <div className="space-y-3">
              <ChannelRow label="POS"        value={totals.revPos}   total={totals.revenue} color="bg-emerald-500" textColor="text-emerald-400"/>
              <ChannelRow label="UberEats"   value={totals.revUber}  total={totals.revenue} color="bg-teal-500"    textColor="text-teal-400"/>
              <ChannelRow label="Deliveroo"  value={totals.revDeli}  total={totals.revenue} color="bg-cyan-500"    textColor="text-cyan-400"/>
              <ChannelRow label="JustEat"    value={totals.revJe}    total={totals.revenue} color="bg-orange-500"  textColor="text-orange-400"/>
              <ChannelRow label="Flipdish Web" value={totals.revFda} total={totals.revenue} color="bg-pink-500"    textColor="text-pink-400"/>
              <ChannelRow label="Kiosk"      value={totals.revKiosk} total={totals.revenue} color="bg-indigo-500"  textColor="text-indigo-400"/>
            </div>
          )}
        </div>
      </div>

      {/* ── Top items table ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/60">
          <h3 className="text-sm font-bold text-white">Top items chain-wide</h3>
          <div className="text-xs text-slate-500 mt-0.5">Bestsellers across all visible stores · {periodLabel}</div>
        </div>
        {topItems.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">No item data this period</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-900/60 border-b border-slate-800/40">
              <tr>
                <th className="text-left px-4 py-2 text-slate-500 font-semibold uppercase tracking-widest w-8">#</th>
                <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase tracking-widest">Item</th>
                <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-widest">Sold</th>
                <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-widest">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topItems.map((it, idx) => (
                <tr key={it.name} className="border-b border-slate-800/30">
                  <td className="px-4 py-2 text-slate-500 font-bold">{idx + 1}</td>
                  <td className="px-3 py-2 text-white">{it.name}</td>
                  <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{it.qty}</td>
                  <td className="px-3 py-2 text-right text-emerald-400 font-semibold tabular-nums">{fmtMoney(it.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Store detail modal ───────────────────────────────────────────── */}
      {detailStore && (
        <StoreDetailModal
          store={detailStore}
          flipdishStores={flipdishStores}
          flipdishSales={flipdishSales}
          fromDate={fromDate}
          toDate={toDate}
          periodLabel={periodLabel}
          onClose={()=>setStoreDetailId(null)}
        />
      )}
    </div>
  );
}

// ─── Channel breakdown row ─────────────────────────────────────────────────────
function ChannelRow({ label, value, total, color, textColor }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-400 font-semibold">{label}</span>
        <span className={`${textColor} font-bold tabular-nums`}>£{value.toLocaleString("en-GB", { maximumFractionDigits: 0 })} <span className="text-slate-500 font-normal">{pct.toFixed(0)}%</span></span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }}/>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Per-store drill-down modal
// ═══════════════════════════════════════════════════════════════════════════════
function StoreDetailModal({ store, flipdishStores, flipdishSales, fromDate, toDate, periodLabel, onClose }) {
  const fmtMoney = (n) => "£" + (n || 0).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtMoneyDec = (n) => "£" + (n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Flipdish stores for THIS physical store (used to display linked IDs at the bottom)
  const myFsIds = useMemo(() =>
    flipdishStores.filter(fs => fs.storeId === store.id).map(fs => fs.id),
  [flipdishStores, store.id]);

  // Sales for THIS store in the period — match on internal store_id (already
  // resolved upstream by the sync from property_id), filter by businessDate
  // to match the trading-day semantics used everywhere else on the dashboard.
  const sales = useMemo(() => flipdishSales.filter(s => {
    if (s.storeId !== store.id) return false;
    if (!s.businessDate) return false;
    const t = new Date(s.businessDate + "T12:00:00");
    return t >= fromDate && t <= toDate;
  }), [flipdishSales, store.id, fromDate.getTime(), toDate.getTime()]);

  const revenue = sales.reduce((a, s) => a + (s.amountTotal || 0), 0);
  const atv = sales.length > 0 ? revenue / sales.length : 0;

  // Daily revenue series — keyed on businessDate so each calendar trading day
  // is one bar regardless of late-night sales crossing midnight UTC.
  const daily = useMemo(() => {
    const m = {};
    sales.forEach(s => {
      const d = s.businessDate;
      if (!d) return;
      if (!m[d]) m[d] = { date: d, revenue: 0, orders: 0 };
      m[d].revenue += s.amountTotal || 0;
      m[d].orders  += 1;
    });
    return Object.values(m).sort((a, b) => a.date.localeCompare(b.date));
  }, [sales]);

  // Channel breakdown for this store. Uses the `channel` field on the sale
  // directly (POS / UberEats / Deliveroo / JustEats / FlipdishWebApp / etc.),
  // which is the right grain — the same store can take orders across multiple
  // channels and we want to see the mix.
  const channels = useMemo(() => {
    const m = {};
    sales.forEach(s => {
      const ch = s.channel || "Other";
      m[ch] = (m[ch] || 0) + (s.amountTotal || 0);
    });
    return Object.entries(m)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [sales]);

  return (
    <Modal title={store.shortName || store.name} onClose={onClose} maxW="max-w-3xl"
      footer={<button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Close</button>}>
      <div className="space-y-4">
        <div className="text-xs text-slate-400">{periodLabel} · {store.status} · {store.ownershipModel}</div>

        {/* Top metrics */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-800/60 rounded-xl p-3">
            <div className="text-xs text-slate-500 font-semibold uppercase tracking-widest">Revenue</div>
            <div className="text-xl font-black text-white tabular-nums mt-1">{fmtMoney(revenue)}</div>
          </div>
          <div className="bg-slate-800/60 rounded-xl p-3">
            <div className="text-xs text-slate-500 font-semibold uppercase tracking-widest">Orders</div>
            <div className="text-xl font-black text-white tabular-nums mt-1">{sales.length}</div>
          </div>
          <div className="bg-slate-800/60 rounded-xl p-3">
            <div className="text-xs text-slate-500 font-semibold uppercase tracking-widest">Avg ticket</div>
            <div className="text-xl font-black text-white tabular-nums mt-1">{sales.length > 0 ? fmtMoneyDec(atv) : "—"}</div>
          </div>
        </div>

        {/* Daily revenue mini-chart (sparkline-style bars) */}
        {daily.length > 0 && (
          <div>
            <div className="text-xs text-slate-400 font-semibold mb-2">Daily revenue</div>
            <div className="flex items-end gap-1 h-24 bg-slate-800/40 rounded-xl p-3">
              {(() => {
                const max = Math.max(...daily.map(d => d.revenue), 1);
                return daily.map(d => (
                  <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${d.date} · ${fmtMoney(d.revenue)} · ${d.orders} orders`}>
                    <div className="w-full rounded-sm bg-indigo-500/70 hover:bg-indigo-400 transition-colors" style={{ height: `${(d.revenue / max) * 100}%`, minHeight: 2 }} />
                  </div>
                ));
              })()}
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 px-1">
              <span>{daily[0]?.date}</span>
              <span>{daily[daily.length - 1]?.date}</span>
            </div>
          </div>
        )}

        {/* Channel split */}
        {channels.length > 0 && (
          <div>
            <div className="text-xs text-slate-400 font-semibold mb-2">Channel split</div>
            <div className="space-y-1.5">
              {channels.map(c => (
                <ChannelRow key={c.name} label={c.name} value={c.value} total={revenue} color="bg-indigo-500" textColor="text-indigo-300" />
              ))}
            </div>
          </div>
        )}

        {/* Linked Flipdish IDs */}
        <div className="text-xs text-slate-500">
          Linked Flipdish stores: {myFsIds.length === 0 ? "none" : myFsIds.join(", ")}
        </div>
      </div>
    </Modal>
  );
}


function DashboardView({ brands, entries, issues }) {
  const { user } = useAuth();
  const visibleBrands = brands.filter(b => isHqOrAbove(user.role) || user.brandIds.includes(b.id));
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = fmtDate(today);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate()-6);
  const weekAgoStr = fmtDate(weekAgo);

  const todayEntries = entries.filter(e => e.date === todayStr && visibleBrands.some(b => b.id === e.brandId));
  const weekEntries = entries.filter(e => e.date >= weekAgoStr && e.date <= todayStr && visibleBrands.some(b => b.id === e.brandId));

  const todayAgg = aggregateEntries(todayEntries);
  const weekAgg = aggregateEntries(weekEntries);
  const useLatest = todayAgg || weekAgg;

  const chartData = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate()-i);
      const ds = fmtDate(d);
      const de = entries.filter(e => e.date === ds && visibleBrands.some(b => b.id === e.brandId));
      const agg = aggregateEntries(de);
      days.push({ date: ds.slice(5), revenue: agg?.netSales || 0, laborPct: agg?.laborPct || 0, primeCost: agg?.primeCost || 0 });
    }
    return days;
  }, [entries, visibleBrands]);

  const pieData = visibleBrands.map(b => {
    const be = weekEntries.filter(e => e.brandId === b.id);
    return { name: b.name, value: be.reduce((a, e) => a + e.netSales, 0), color: b.color };
  }).filter(p => p.value > 0);

  const openIssues = issues.filter(i => visibleBrands.some(b => b.id === i.brandId) && i.status === "Open").length;
  const criticalIssues = issues.filter(i => visibleBrands.some(b => b.id === i.brandId) && i.priority === "Critical" && !["Resolved","Closed"].includes(i.status)).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Today's Revenue" value={todayAgg ? fmtCurrency(todayAgg.netSales) : "No Data"} sub={`${todayEntries.length} reports`} icon={PoundSterling} accent="indigo" />
        <StatCard label="Wage Cost %" value={useLatest ? fmtPct(useLatest.laborPct) : "—"} sub={useLatest && useLatest.laborPct > 35 ? "Above target (35%)" : "On target (≤35%)"} icon={Users} accent={useLatest && useLatest.laborPct > 35 ? "amber" : "emerald"} alert={useLatest && useLatest.laborPct > 40} />
        <StatCard label="Prime Cost %" value={useLatest ? fmtPct(useLatest.primeCost) : "—"} sub="Labour + COGS" icon={Activity} accent={useLatest && useLatest.primeCost > 60 ? "red" : "emerald"} alert={useLatest && useLatest.primeCost > 65} />
        <StatCard label="Avg Spend / Cover" value={useLatest && useLatest.atv > 0 ? fmtCurrency(useLatest.atv) : "—"} sub={useLatest ? `${fmtNum(useLatest.totalOrders)} covers` : "Average ticket"} icon={ChefHat} accent="sky" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="SPLH" value={useLatest ? fmtSPLH(useLatest.splh) : "—"} sub="Sales per labour hr · target ≥£8" icon={Zap} accent={useLatest && useLatest.splh >= 8 ? "emerald" : useLatest && useLatest.splh >= 5 ? "amber" : "red"} />
        <StatCard label="Net Margin" value={useLatest ? fmtPct(useLatest.netMargin) : "—"} sub="After labour + COGS" icon={TrendingUp} accent={useLatest && useLatest.netMargin >= 15 ? "emerald" : "amber"} />
        <StatCard label="Labour Hours" value={useLatest ? `${useLatest.totalHours.toFixed(0)}h` : "—"} sub="This week" icon={Clock} accent="indigo" />
        <StatCard label="Open Issues" value={openIssues} sub={criticalIssues > 0 ? `${criticalIssues} critical` : "All under control"} icon={AlertCircle} accent={criticalIssues > 0 ? "red" : "slate"} alert={criticalIssues > 0} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <AnalysisBlock title="14-Day Revenue & Cost Trend" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={v => `£${(v/1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={v => `${v.toFixed(0)}%`} />
              <Tooltip content={<ChartTooltip/>} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              <Bar yAxisId="left" dataKey="revenue" name="£ Revenue" fill="#6366f1" opacity={0.85} radius={[3,3,0,0]} />
              <Line yAxisId="right" type="monotone" dataKey="laborPct" name="Labour %" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="primeCost" name="Prime Cost %" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </AnalysisBlock>
        <AnalysisBlock title="7-Day Revenue Split">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip content={<ChartTooltip/>} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col gap-1.5 mt-2">
            {pieData.map((d, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ background: d.color }} /><span className="text-slate-600">{d.name}</span></div>
                <span className="text-slate-700 font-semibold">{fmtCurrency(d.value)}</span>
              </div>
            ))}
          </div>
        </AnalysisBlock>
      </div>

      {/* Active Issues Summary */}
      {issues.filter(i => visibleBrands.some(b => b.id === i.brandId) && !["Resolved","Closed"].includes(i.status)).length > 0 && (
        <AnalysisBlock title="Active Issues Requiring Attention">
          <div className="space-y-2">
            {issues.filter(i => visibleBrands.some(b => b.id === i.brandId) && !["Resolved","Closed"].includes(i.status)).slice(0, 5).map(issue => {
              const sc = STATUS_CONFIG[issue.status];
              const pc = PRIORITY_CONFIG[issue.priority];
              const brand = brands.find(b => b.id === issue.brandId);
              return (
                <div key={issue.id} className="flex items-center gap-3 py-2 border-b border-slate-800/60 last:border-0">
                  <Badge label={issue.priority} color={pc.color} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-200 truncate">{issue.title}</div>
                    <div className="text-xs text-slate-500">{brand?.name}</div>
                  </div>
                  <Badge label={issue.status} color={sc.color} />
                </div>
              );
            })}
          </div>
        </AnalysisBlock>
      )}
    </div>
  );
}

// ─── Tactical Ops View ────────────────────────────────────────────────────────
// Single-store performance deep-dive. Replaces the old single-brand view.
// KPIs are computed against the SELECTED STORE's per-day-of-week targets:
// the period target is the sum of each day's day-of-week target across the
// actual dates in the range — so e.g. a "this week" target on a 7-day window
// is Mon+Tue+Wed+Thu+Fri+Sat+Sun targets summed, while "today" only counts
// today's day-of-week.
//
// Sales entries (EOD reports) are looked up by storeId, with brand fallback
// for legacy rows that don't have storeId set yet.
function TacticalOpsView({ brands, stores, visibleStoreIds, entries, issues, users, onAddIssue, onUpdateIssue, onDeleteIssue }) {
  const { user } = useAuth();

  // Standard store-scope pattern. Owner/HQ default to Owned ownership.
  const allVisibleStores = useMemo(
    () => (stores || []).filter(s => visibleStoreIds?.includes(s.id) && !s.archivedAt),
    [stores, visibleStoreIds]
  );
  const [ownership, setOwnership] = useState(isHqOrAbove(user.role) ? "owned" : "all");
  const visibleScopedStores = useMemo(
    () => applyOwnershipFilter(allVisibleStores, ownership, user.role),
    [allVisibleStores, ownership, user.role]
  );
  const sortedStores = useMemo(
    () => [...visibleScopedStores].sort((a, b) =>
      (a.brandId || "").localeCompare(b.brandId || "") ||
      (a.shortName || a.name || "").localeCompare(b.shortName || b.name || "")),
    [visibleScopedStores]
  );

  const [selectedStoreId, setSelectedStoreId] = useState(sortedStores[0]?.id || "");
  useEffect(() => {
    // Auto-pick or auto-reset when the scope changes
    if (!selectedStoreId && sortedStores[0]) setSelectedStoreId(sortedStores[0].id);
    if (selectedStoreId && !sortedStores.some(s => s.id === selectedStoreId)) {
      setSelectedStoreId(sortedStores[0]?.id || "");
    }
  }, [sortedStores, selectedStoreId]);

  const [preset, setPreset] = useState("this_week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [tickets, setTickets] = useState({});
  const [ticketText, setTicketText] = useState("");
  const [ticketPriority, setTicketPriority] = useState("Medium");
  const [detailTicket, setDetailTicket] = useState(null);
  const [editTicket, setEditTicket] = useState(null);

  const selectedStore = sortedStores.find(s => s.id === selectedStoreId) || null;
  const selectedBrand = selectedStore ? brands.find(b => b.id === selectedStore.brandId) : null;

  // Derive maintenance tickets from issues prop.
  // Store-keyed issues match by storeId; legacy ones (no storeId) fall back
  // to brand-matching so old issues still appear in their natural place.
  useEffect(() => {
    if (!selectedStore || !issues) return;
    const storeMaintenance = issues
      .filter(i => (i.type || "Issue") === "Maintenance")
      .filter(i => i.storeId
        ? i.storeId === selectedStore.id
        : i.brandId === selectedStore.brandId)
      .map(i => ({ id: i.id, brandId: i.brandId, storeId: i.storeId, text: i.title, priority: i.priority, done: ["Resolved","Closed"].includes(i.status), createdAt: i.createdAt, _issueRef: i }));
    setTickets(t => ({ ...t, [selectedStore.id]: storeMaintenance }));
  }, [selectedStore, issues]);

  const period = resolvePeriod(preset, customFrom, customTo);
  const prevPeriod = resolvePrevPeriod(preset, customFrom, customTo);

  // EOD entries scoped to the selected store. Legacy entries (no storeId)
  // fall back to brand-matching so historical data still shows up.
  const storeEntries = useMemo(() => {
    if (!selectedStore) return [];
    return entries.filter(e => e.storeId
      ? e.storeId === selectedStore.id
      : e.brandId === selectedStore.brandId);
  }, [entries, selectedStore]);

  const curFiltered = filterEntries(storeEntries, period.from, period.to);
  const prevFiltered = prevPeriod ? filterEntries(storeEntries, prevPeriod.from, prevPeriod.to) : [];
  const cur = aggregateEntries(curFiltered);
  const prev = aggregateEntries(prevFiltered);
  const dayCount = curFiltered.length;

  // Per-day-of-week target math. If the store has no kpiTargets, both
  // periodTargets and ratios are null and the UI gracefully degrades.
  const ratios = selectedStore?.kpiTargets?.ratios || null;
  const periodTargets = useMemo(
    () => selectedStore ? sumStoreTargetsForPeriod(selectedStore.kpiTargets, period.from, period.to) : null,
    [selectedStore, period.from, period.to]
  );
  const totalTarget = periodTargets?.revenue || 0;
  const targetProgress = totalTarget > 0 && cur ? (cur.netSales / totalTarget) * 100 : 0;

  const chartData = useMemo(() => {
    return Array.from({ length: Math.max(curFiltered.length, prevFiltered.length) }, (_, i) => {
      const ce = curFiltered[i]; const pe = prevFiltered[i];
      return { idx: `Day ${i+1}`, curSales: ce?.netSales || null, prevSales: pe?.netSales || null, curSPLH: ce ? ce.netSales/(ce.totalHours||1) : null, prevSPLH: pe ? pe.netSales/(pe.totalHours||1) : null };
    });
  }, [curFiltered, prevFiltered]);

  const primeCostDays = curFiltered.map(e => ({ date: e.date.slice(5), primeCost: ((e.laborCost+e.cogsCost)/(e.netSales||1))*100 }));
  const storeTickets = tickets[selectedStoreId] || [];

  const addTicket = async (text, priority) => {
    if (!selectedStore) return;
    const now = new Date().toISOString();
    const issue = {
      id: `maint-${Date.now()}`,
      brandId: selectedStore.brandId,
      brandName: selectedBrand?.name || "",
      storeId: selectedStore.id,
      type: "Maintenance",
      title: text,
      description: "",
      category: "Other",
      priority,
      status: "Open",
      reportedBy: user.name,
      assignedTo: "",
      comments: [],
      createdAt: now,
      updatedAt: now,
    };
    await onAddIssue(issue);
    // tickets state updates via the useEffect watching issues prop
  };

  const toggleTicket = async (id) => {
    const ticket = storeTickets.find(tk => tk.id === id);
    if (!ticket) return;
    const newStatus = ticket.done ? "Open" : "Resolved";
    await onUpdateIssue({ ...ticket._issueRef, status: newStatus, updatedAt: new Date().toISOString() });
  };

  const deleteTicket = async (id) => {
    await onDeleteIssue(id);
  };

  if (allVisibleStores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <BarChart2 size={32} className="mb-3 text-slate-700"/>
        <div className="text-sm font-semibold">No stores assigned to your account.</div>
      </div>
    );
  }

  const showBrandPrefix = new Set(sortedStores.map(s => s.brandId)).size > 1;

  return (
    <div className="space-y-6">
      {/* Top controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedStoreId}
          onChange={e => setSelectedStoreId(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer min-w-[200px]"
        >
          {sortedStores.length === 0 && <option value="">No stores</option>}
          {sortedStores.map(s => {
            const b = brands.find(br => br.id === s.brandId);
            return <option key={s.id} value={s.id}>{showBrandPrefix && b ? `${b.name} · ` : ""}{s.shortName || s.name}</option>;
          })}
        </select>
        <PeriodFilterBar preset={preset} onPreset={setPreset} customFrom={customFrom} customTo={customTo} onCustomFrom={setCustomFrom} onCustomTo={setCustomTo}/>
      </div>

      {selectedStore && (
        <div className="bg-slate-950 border border-slate-700 rounded-2xl px-5 py-3 flex flex-wrap items-center gap-4">
          <span className="text-sm font-bold text-white">{period.label}</span>
          <span className="text-xs text-slate-500">{period.from} → {period.to}</span>
          <span className="text-xs text-slate-600">{dayCount} reports</span>
          {periodTargets ? (
            <span className="text-xs text-slate-600">Period target: {fmtCurrency(periodTargets.revenue)} over {periodTargets.daysWithTargets} day{periodTargets.daysWithTargets !== 1 ? "s" : ""}</span>
          ) : (
            <span className="text-xs text-amber-400">No targets set — <a className="underline" href="#admin">edit in Admin → KPI Targets</a></span>
          )}
          {!prevFiltered.length && <Badge label="No prior data" color="amber" />}
        </div>
      )}

      {/* KPI cards. Target Progress and Prime Cost % gracefully show "—" when
          targets are missing, so the page is still useful without them. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ComparisonKPICard label="Net Revenue" current={cur?.netSales} previous={prev?.netSales} format="currency" icon={DollarSign} prevLabel={prevPeriod?.label} />
        <ComparisonKPICard label="Target Progress" current={periodTargets ? (targetProgress || null) : null} previous={null} format="percent" icon={Target} alert={periodTargets && targetProgress>0 && targetProgress<80} />
        <ComparisonKPICard label="Prime Cost %" current={cur?.primeCost} previous={prev?.primeCost} format="percent" icon={Activity} invertDelta alert={cur && ratios && cur.primeCost > ratios.primeCostMax} prevLabel={prevPeriod?.label} />
        <ComparisonKPICard label="SPLH" current={cur?.splh} previous={prev?.splh} format="splh" icon={Zap} prevLabel={prevPeriod?.label} />
        <ComparisonKPICard label="Net Margin" current={cur?.netMargin} previous={prev?.netMargin} format="percent" icon={TrendingUp} prevLabel={prevPeriod?.label} />
        <ComparisonKPICard label="Labour Cost" current={cur?.laborCost} previous={prev?.laborCost} format="currency" icon={Users} invertDelta subCurrent={cur?`${cur.laborPct.toFixed(1)}% of sales`:undefined} prevLabel={prevPeriod?.label} />
        <ComparisonKPICard label="Total Orders" current={cur?.totalOrders} previous={prev?.totalOrders} format="number" icon={BarChart2} prevLabel={prevPeriod?.label} />
        <ComparisonKPICard label="ATV" current={cur?.atv} previous={prev?.atv} format="splh" icon={DollarSign} prevLabel={prevPeriod?.label} />
      </div>

      {chartData.length > 0 && (
        <AnalysisBlock title="Period-over-Period Sales & SPLH">
          <div className="mb-4 flex gap-4">
            {["curSales","prevSales"].map((k,i) => {
              const total = k==="curSales" ? cur?.netSales : prev?.netSales;
              const pct = totalTarget>0&&total ? Math.min(100,(total/totalTarget)*100) : 0;
              const col = pct>=100?"#10b981":pct>=80?"#6366f1":"#ef4444";
              return (
                <div key={k} className="flex-1">
                  <div className="text-xs text-slate-600 mb-1">{i===0?period.label:prevPeriod?.label||"Prior"}: {fmtCurrency(total)}</div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{width:`${pct}%`,background:col}}/></div>
                </div>
              );
            })}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData} margin={{top:5,right:20,left:0,bottom:0}}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3"/>
              <XAxis dataKey="idx" tick={{fill:"#64748b",fontSize:10}}/>
              <YAxis yAxisId="left" tick={{fill:"#64748b",fontSize:10}} tickFormatter={v=>`£${(v/1000).toFixed(0)}k`}/>
              <YAxis yAxisId="right" orientation="right" tick={{fill:"#64748b",fontSize:10}} tickFormatter={v=>`£${v.toFixed(0)}`}/>
              <Tooltip content={<ChartTooltip/>}/>
              <Legend wrapperStyle={{fontSize:11,color:"#94a3b8"}}/>
              <Bar yAxisId="left" dataKey="curSales" name="£ Current" fill="#6366f1" opacity={0.85} radius={[3,3,0,0]}/>
              <Bar yAxisId="left" dataKey="prevSales" name="£ Prior" fill="#475569" opacity={0.6} radius={[3,3,0,0]}/>
              <Line yAxisId="right" type="monotone" dataKey="curSPLH" name="SPLH Current" stroke="#10b981" strokeWidth={2} dot={false}/>
              <Line yAxisId="right" type="monotone" dataKey="prevSPLH" name="SPLH Prior" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false}/>
            </ComposedChart>
          </ResponsiveContainer>
        </AnalysisBlock>
      )}

      {primeCostDays.length > 1 && (
        <AnalysisBlock title="Daily Prime Cost % Trend">
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={primeCostDays} margin={{top:5,right:20,left:0,bottom:0}}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3"/>
              <XAxis dataKey="date" tick={{fill:"#64748b",fontSize:10}}/>
              <YAxis tick={{fill:"#64748b",fontSize:10}} tickFormatter={v=>`${v.toFixed(0)}%`}/>
              <Tooltip content={<ChartTooltip/>}/>
              {ratios && <ReferenceLine y={ratios.primeCostMax} stroke="#ef4444" strokeDasharray="4 2" label={{value:`Max ${ratios.primeCostMax}%`,fill:"#ef4444",fontSize:10}}/>}
              <Bar dataKey="primeCost" name="Prime Cost %" radius={[3,3,0,0]}>
                {primeCostDays.map((d,i) => <Cell key={i} fill={ratios && d.primeCost > ratios.primeCostMax ? "#ef4444" : "#6366f1"}/>)}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </AnalysisBlock>
      )}

      <AnalysisBlock title="Maintenance Ticketing Desk" action={<Badge label={selectedStore ? `${selectedBrand?.name || ""}${selectedBrand ? " · " : ""}${selectedStore.shortName || selectedStore.name}` : ""} color="slate"/>}>
        <div className="flex gap-2 mb-4 flex-wrap">
          <input value={ticketText} onChange={e=>setTicketText(e.target.value)} placeholder="Describe the issue…" className="flex-1 min-w-48 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"/>
          <select value={ticketPriority} onChange={e=>setTicketPriority(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none">
            <option>High</option><option>Medium</option><option>Low</option>
          </select>
          <button onClick={()=>{if(ticketText.trim()){addTicket(ticketText.trim(),ticketPriority);setTicketText("");}}} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2 text-sm font-semibold flex items-center gap-1.5 transition-colors"><Plus size={14}/>Add</button>
        </div>
        {storeTickets.length===0&&<div className="text-slate-500 text-sm text-center py-4">No tickets raised</div>}
        <div className="space-y-2">
          {storeTickets.map(tk=>(
            <div key={tk.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${tk.done?"bg-slate-900/20 border-slate-700/30 opacity-50":"bg-slate-900 border-slate-700"}`}>
              <button onClick={()=>toggleTicket(tk.id)} className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${tk.done?"bg-emerald-600 border-emerald-500":"border-slate-600 hover:border-emerald-500"}`}>{tk.done&&<Check size={12} className="text-white"/>}</button>
              <span className={`flex-1 text-sm ${tk.done?"line-through text-slate-500":"text-slate-700"}`}>{tk.text}</span>
              {tk._issueRef?.assignedTo && <span className="text-xs text-indigo-400 hidden sm:block">→ {tk._issueRef.assignedTo}</span>}
              <Badge label={tk.priority} color={tk.priority==="Critical"?"red":tk.priority==="High"?"amber":tk.priority==="Medium"?"indigo":"slate"}/>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={()=>setDetailTicket(tk._issueRef)} className="px-2 py-1 rounded-lg bg-slate-700 text-slate-700 text-xs font-semibold hover:bg-slate-600 transition-colors">View</button>
                <button onClick={()=>setEditTicket(tk._issueRef)} className="p-1.5 rounded-lg bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600 transition-colors"><Edit size={12}/></button>
                <button onClick={()=>deleteTicket(tk.id)} className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-950/20 rounded-lg transition-colors"><Trash2 size={12}/></button>
              </div>
            </div>
          ))}
        </div>
      </AnalysisBlock>

      {/* Modals */}
      {detailTicket && <IssueDetailModal issue={detailTicket} brands={brands} users={users} currentUser={user} onUpdate={updated => { onUpdateIssue(updated); setDetailTicket(updated); }} onClose={() => setDetailTicket(null)} />}
      {editTicket && <IssueFormModal issue={editTicket} brands={brands} users={users} currentUser={user} visibleBrands={brands} onSave={updated => { onUpdateIssue(updated); setEditTicket(null); }} onClose={() => setEditTicket(null)} />}
    </div>
  );
}

// ─── EOD Form ─────────────────────────────────────────────────────────────────
function EODFormView({ brands, stores, visibleStoreIds, onAddEntry }) {
  const { user } = useAuth();

  const allVisibleStores = useMemo(
    () => (stores || []).filter(s => visibleStoreIds?.includes(s.id) && !s.archivedAt),
    [stores, visibleStoreIds]
  );
  const [ownership, setOwnership] = useState(isHqOrAbove(user.role) ? "owned" : "all");
  const visibleStores = useMemo(
    () => applyOwnershipFilter(allVisibleStores, ownership, user.role),
    [allVisibleStores, ownership, user.role]
  );

  // Sort stores alphabetically (matches your "default to alpha first" decision
  // for multi-store managers).
  const sortedStores = useMemo(
    () => [...visibleStores].sort((a, b) => (a.shortName || a.name || "").localeCompare(b.shortName || b.name || "")),
    [visibleStores]
  );

  const [zone, setZone] = useState(0);
  const [success, setSuccess] = useState(false);
  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    storeId: sortedStores[0]?.id || "",
    date: today, manager: user.name, submittedBy: user.name,
    netSales: "", cardRevenue: "", cashExpected: "", physicalCash: "", varianceJustification: "",
    openingFloat: 200, closingFloat: 200,
    totalOrders: "", atv: "",
    fiveStarReviews: "", midStarReviews: "", oneStarReviews: "",
    laborCost: "", cogsCost: "", totalHours: "", notes: ""
  });

  // If the picked store falls out of scope (ownership change, role change),
  // reset to the first available store. Avoids submitting against a stale id.
  useEffect(() => {
    if (form.storeId && !sortedStores.some(s => s.id === form.storeId)) {
      setForm(f => ({ ...f, storeId: sortedStores[0]?.id || "" }));
    } else if (!form.storeId && sortedStores[0]) {
      setForm(f => ({ ...f, storeId: sortedStores[0].id }));
    }
  }, [sortedStores, form.storeId]);

  const set = (k, v) => setForm(f => {
    const updated = { ...f, [k]: v };
    // Auto-calculate ATV when netSales or totalOrders changes
    if (k === "netSales" || k === "totalOrders") {
      const ns = parseFloat(k === "netSales" ? v : updated.netSales) || 0;
      const to = parseInt(k === "totalOrders" ? v : updated.totalOrders) || 0;
      updated.atv = to > 0 ? (ns / to).toFixed(2) : "";
    }
    return updated;
  });

  const selectedStore = sortedStores.find(s => s.id === form.storeId);
  const selectedBrand = selectedStore ? brands.find(b => b.id === selectedStore.brandId) : null;
  const ns = parseFloat(form.netSales) || 0;
  const lc = parseFloat(form.laborCost) || 0;
  const cc = parseFloat(form.cogsCost) || 0;
  const th = parseFloat(form.totalHours) || 0;
  const pc = parseFloat(form.physicalCash) || 0;
  const ce = parseFloat(form.cashExpected) || 0;
  const variance = pc - ce;
  const hasVariance = Math.abs(variance) > 0;
  const primeCostPct = ns > 0 ? ((lc + cc) / ns) * 100 : 0;
  const splh = th > 0 ? ns / th : 0;

  const zones = ["Identity", "Revenue", "Quality", "People & Risk"];

  const handleSubmit = () => {
    if (zone < 3) { setZone(z => z + 1); return; }
    if (!selectedStore) { alert("Please pick a store first."); return; }
    if (hasVariance && !form.varianceJustification.trim()) { alert("Please provide a variance justification."); return; }
    const entry = {
      id: `${selectedStore.id}-${form.date}-${Date.now()}`,
      brandId: selectedBrand?.id || selectedStore.brandId,
      brandName: selectedBrand?.name || "",
      storeId: selectedStore.id,
      date: form.date,
      manager: form.manager, submittedBy: form.submittedBy,
      netSales: ns, cardRevenue: parseFloat(form.cardRevenue)||0,
      cashExpected: ce, physicalCash: pc, cashVariance: variance,
      varianceJustification: form.varianceJustification,
      openingFloat: form.openingFloat, closingFloat: form.closingFloat,
      laborCost: lc, cogsCost: cc, totalHours: th,
      totalOrders: parseInt(form.totalOrders)||0,
      atv: parseFloat(form.atv)||0,
      fiveStarReviews: parseInt(form.fiveStarReviews)||0,
      midStarReviews: parseInt(form.midStarReviews)||0,
      oneStarReviews: parseInt(form.oneStarReviews)||0,
      notes: form.notes, maintenanceTickets: [], timestamp: new Date().toISOString()
    };
    onAddEntry(entry);
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false); setZone(0);
      setForm({ storeId: sortedStores[0]?.id||"", date: today, manager: user.name, submittedBy: user.name, netSales:"", cardRevenue:"", cashExpected:"", physicalCash:"", varianceJustification:"", openingFloat:200, closingFloat:200, totalOrders:"", atv:"", fiveStarReviews:"", midStarReviews:"", oneStarReviews:"", laborCost:"", cogsCost:"", totalHours:"", notes:"" });
    }, 2500);
  };

  if (success) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/25 border border-emerald-500/30 flex items-center justify-center"><CheckCircle size={32} className="text-emerald-400"/></div>
      <div className="text-xl font-bold text-white">Report Submitted</div>
      <div className="text-slate-600 text-sm">EOD entry saved. Resetting form…</div>
    </div>
  );

  // No stores in scope at all (manager unassigned, or HQ filter returns 0)
  if (allVisibleStores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <FileText size={32} className="mb-3 text-slate-700"/>
        <div className="text-sm font-semibold">No stores assigned to your account.</div>
        <div className="text-xs text-slate-600 mt-1">Ask an admin to assign you to one or more stores.</div>
      </div>
    );
  }

  const inputCls = "w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition-colors";
  const labelCls = "text-xs text-slate-600 font-semibold mb-1.5 block";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Ownership filter — owner/HQ only; lets them narrow which stores
          appear in Zone 1's picker. Default is "Owned". */}
      {isHqOrAbove(user.role) && allVisibleStores.length > 1 && (
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-600">Scope: <strong className="text-slate-300">{sortedStores.length}</strong> store{sortedStores.length === 1 ? "" : "s"}</div>
        </div>
      )}

      <div className="flex gap-2">
        {zones.map((z,i) => (
          <button key={i} onClick={() => i < zone && setZone(i)}
            className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${i===zone?"bg-indigo-600 text-white":i<zone?"bg-emerald-600/30 text-emerald-400 cursor-pointer hover:bg-emerald-600/40":"bg-slate-800 text-slate-500"}`}>
            {i<zone&&<span className="mr-1">✓</span>}{z}
          </button>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4">
        {/* Zone 1 */}
        {zone === 0 && (
          <>
            <h2 className="text-base font-bold text-white mb-2">Zone 1 — Identity</h2>
            <div>
              <div className={labelCls}>Store</div>
              <div className="flex flex-wrap gap-2">
                {sortedStores.map(s => {
                  const b = brands.find(br => br.id === s.brandId);
                  const showBrand = new Set(sortedStores.map(x => x.brandId)).size > 1;
                  return (
                    <button key={s.id} onClick={() => set("storeId", s.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${form.storeId===s.id?"text-white border-transparent":"bg-slate-800 text-slate-600 border-slate-700 hover:bg-slate-700"}`}
                      style={form.storeId===s.id?{background: b?.color || "#6366f1"}:{}}>
                      {showBrand && b ? `${b.name} · ` : ""}{s.shortName || s.name}
                    </button>
                  );
                })}
              </div>
              {sortedStores.length === 0 && <div className="text-xs text-slate-600 mt-2">No stores in current filter. Try changing the ownership filter above.</div>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>Date</label><input type="date" value={form.date} onChange={e=>set("date",e.target.value)} max={today} className={inputCls}/></div>
              <div><label className={labelCls}>Manager on Duty</label><input value={form.manager} onChange={e=>set("manager",e.target.value)} className={inputCls}/></div>
            </div>
            <div><label className={labelCls}>Submitted By</label><input value={form.submittedBy} onChange={e=>set("submittedBy",e.target.value)} className={inputCls}/></div>
          </>
        )}

        {/* Zone 2 */}
        {zone === 1 && (
          <>
            <h2 className="text-base font-bold text-white mb-2">Zone 2 — Revenue</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>Net Sales (£)</label><input type="number" value={form.netSales} onChange={e=>set("netSales",e.target.value)} className={inputCls} placeholder="0.00"/></div>
              <div><label className={labelCls}>Card Revenue (£)</label><input type="number" value={form.cardRevenue} onChange={e=>set("cardRevenue",e.target.value)} className={inputCls} placeholder="0.00"/></div>
              <div><label className={labelCls}>Cash Expected (£)</label><input type="number" value={form.cashExpected} onChange={e=>set("cashExpected",e.target.value)} className={inputCls} placeholder="0.00"/></div>
              <div><label className={labelCls}>Physical Cash (£)</label><input type="number" value={form.physicalCash} onChange={e=>set("physicalCash",e.target.value)} className={inputCls} placeholder="0.00"/></div>
              <div><label className={labelCls}>Total Orders</label><input type="number" value={form.totalOrders} onChange={e=>set("totalOrders",e.target.value)} className={inputCls} placeholder="0"/></div>
              <div>
                <label className={labelCls}>ATV (£) <span className="text-slate-600 font-normal">— auto-calculated</span></label>
                <input type="number" value={form.atv} onChange={e=>set("atv",e.target.value)} className={`${inputCls} bg-slate-800/40`} placeholder="0.00"/>
              </div>
            </div>
            {hasVariance && (
              <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold mb-2">
                  <AlertTriangle size={14}/> Cash Variance: {variance>=0?"+":""}£{variance.toFixed(2)}
                </div>
                <label className={labelCls}>Justification (required)</label>
                <textarea value={form.varianceJustification} onChange={e=>set("varianceJustification",e.target.value)} className={`${inputCls} h-20 resize-none`} placeholder="Explain the variance…"/>
              </div>
            )}
          </>
        )}

        {/* Zone 3 */}
        {zone === 2 && (
          <>
            <h2 className="text-base font-bold text-white mb-2">Zone 3 — Quality</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelCls}><span className="flex items-center gap-1"><Star size={11} className="text-emerald-400"/>5-Star Reviews</span></label>
                <input type="number" value={form.fiveStarReviews} onChange={e=>set("fiveStarReviews",e.target.value)} className={inputCls} placeholder="0"/>
              </div>
              <div>
                <label className={labelCls}><span className="flex items-center gap-1"><Star size={11} className="text-amber-400"/>2–4 Star Reviews</span></label>
                <input type="number" value={form.midStarReviews} onChange={e=>set("midStarReviews",e.target.value)} className={inputCls} placeholder="0"/>
              </div>
              <div>
                <label className={labelCls}><span className="flex items-center gap-1"><Star size={11} className="text-red-400"/>1-Star Reviews</span></label>
                <input type="number" value={form.oneStarReviews} onChange={e=>set("oneStarReviews",e.target.value)} className={inputCls} placeholder="0"/>
              </div>
            </div>
            {/* Review summary */}
            {(parseInt(form.fiveStarReviews)||0) + (parseInt(form.midStarReviews)||0) + (parseInt(form.oneStarReviews)||0) > 0 && (() => {
              const total = (parseInt(form.fiveStarReviews)||0)+(parseInt(form.midStarReviews)||0)+(parseInt(form.oneStarReviews)||0);
              const fivePct = total > 0 ? ((parseInt(form.fiveStarReviews)||0)/total*100).toFixed(0) : 0;
              const onePct = total > 0 ? ((parseInt(form.oneStarReviews)||0)/total*100).toFixed(0) : 0;
              return (
                <div className="bg-slate-950 border border-slate-800/60 rounded-xl p-4">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-600">{total} total reviews</span>
                    <span className="text-emerald-400 font-semibold">{fivePct}% five-star</span>
                  </div>
                  <div className="flex gap-1 h-2">
                    <div className="rounded-full bg-emerald-500 transition-all" style={{width:`${fivePct}%`}}/>
                    <div className="rounded-full bg-amber-500 transition-all" style={{width:`${100-parseInt(fivePct)-parseInt(onePct)}%`}}/>
                    <div className="rounded-full bg-red-500 transition-all" style={{width:`${onePct}%`}}/>
                  </div>
                  {parseInt(form.oneStarReviews) > 0 && (
                    <div className="flex items-center gap-2 mt-2 text-red-400 text-xs"><AlertTriangle size={12}/>{form.oneStarReviews} 1-star review(s) — follow up recommended</div>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {/* Zone 4 */}
        {zone === 3 && (
          <>
            <h2 className="text-base font-bold text-white mb-2">Zone 4 — People & Risk</h2>
            <div className="grid grid-cols-3 gap-4">
              <div><label className={labelCls}>Labour Cost (£)</label><input type="number" value={form.laborCost} onChange={e=>set("laborCost",e.target.value)} className={inputCls} placeholder="0.00"/></div>
              <div><label className={labelCls}>COGS (£)</label><input type="number" value={form.cogsCost} onChange={e=>set("cogsCost",e.target.value)} className={inputCls} placeholder="0.00"/></div>
              <div><label className={labelCls}>Total Hours</label><input type="number" value={form.totalHours} onChange={e=>set("totalHours",e.target.value)} className={inputCls} placeholder="0"/></div>
            </div>
            {ns > 0 && lc > 0 && cc > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div className={`rounded-xl border p-3 ${primeCostPct>(selectedBrand?.kpiTargets?.primeCostMax||60)?"bg-red-950/20 border-red-500/30":"bg-emerald-950/20 border-emerald-500/30"}`}>
                  <div className="text-xs text-slate-600 mb-1">Prime Cost %</div>
                  <div className={`text-lg font-bold ${primeCostPct>(selectedBrand?.kpiTargets?.primeCostMax||60)?"text-red-400":"text-emerald-400"}`}>{primeCostPct.toFixed(1)}%</div>
                </div>
                <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-xl p-3">
                  <div className="text-xs text-slate-600 mb-1">SPLH</div>
                  <div className="text-lg font-bold text-indigo-400">{fmtSPLH(splh)}</div>
                </div>
              </div>
            )}
            <div><label className={labelCls}>Shift Notes</label><textarea value={form.notes} onChange={e=>set("notes",e.target.value)} className={`${inputCls} h-24 resize-none`} placeholder="Any notable events, incidents or handover notes…"/></div>
          </>
        )}
      </div>

      <div className="flex gap-3">
        {zone > 0 && <button onClick={()=>setZone(z=>z-1)} className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700 transition-colors flex items-center gap-2"><ChevronLeft size={14}/>Back</button>}
        <button onClick={handleSubmit} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors flex items-center justify-center gap-2">
          {zone < 3 ? <><span>Next</span><ChevronRight size={14}/></> : <><CheckCircle size={14}/> Submit Report</>}
        </button>
      </div>
    </div>
  );
}

// ─── Modals (KPI, Location, User, ConfirmDelete) ───────────────────────────
function KPITargetModal({ brand, onSave, onClose }) {
  const [t, setT] = useState({ ...brand.kpiTargets });
  const fields = [
    { key:"dailyRevenue", label:"Daily Revenue Target", unit:"£", step:100 },
    { key:"primeCostMax", label:"Prime Cost Max", unit:"%", step:1 },
    { key:"laborPctMax", label:"Labour % Max", unit:"%", step:1 },
    { key:"cogsPctMax", label:"COGS % Max", unit:"%", step:1 },
    { key:"netMarginMin", label:"Net Margin Min", unit:"%", step:1 },
    { key:"splhMin", label:"SPLH Min", unit:"£", step:1 },
    { key:"avgStarMin", label:"Avg Star Min", unit:"★", step:0.1 },
    { key:"cashVarianceMax", label:"Cash Variance Max", unit:"£", step:5 },
  ];
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h3 className="font-bold text-white">KPI Targets — {brand.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {fields.map(f => (
            <div key={f.key} className="flex items-center justify-between gap-4">
              <div className="text-sm text-slate-700">{f.label}</div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500">{f.unit}</span>
                <input type="number" value={t[f.key]} step={f.step} onChange={e=>setT(p=>({...p,[f.key]:parseFloat(e.target.value)||0}))}
                  className="w-24 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-white text-right focus:border-indigo-500 focus:outline-none"/>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-slate-700">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700 transition-colors">Cancel</button>
          <button onClick={()=>{onSave(brand.id,t);onClose();}} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 transition-colors">Save</button>
        </div>
      </div>
    </div>
  );
}

function LocationEditorModal({ brand, onSave, onClose }) {
  const isCreate = !brand;
  const [name, setName] = useState(brand?.name||"");
  const [address, setAddress] = useState(brand?.address||"");
  const [iconKey, setIconKey] = useState(brand?.iconKey||"Utensils");
  const [color, setColor] = useState(brand?.color||"#6366f1");
  const icons = [{key:"Utensils",label:"Restaurant"},{key:"Moon",label:"Bar"},{key:"Coffee",label:"Café"},{key:"Building2",label:"Other"}];
  const colors = ["#6366f1","#10b981","#f59e0b","#ef4444","#ec4899","#14b8a6","#f97316","#8b5cf6"];
  const BIcon = ICON_MAP[iconKey]||Building2;
  const handleSave = () => {
    if (!name.trim()) return;
    // Brand-level kpiTargets is deprecated — store-level targets replace it.
    // We omit kpiTargets entirely from the save payload; appBrandToDb already
    // stopped writing it. Existing brand records keep whatever's in the DB
    // until that column is dropped.
    onSave({ id:brand?.id||`brand-${Date.now()}`, name:name.trim(), address, iconKey, color });
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h3 className="font-bold text-white">{isCreate?"Add Brand":`Edit — ${brand.name}`}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
          <div className="text-xs text-slate-600">A brand is a chain (e.g. Chocoberry). To add a physical store, use the Stores tab. KPI targets are set per-store in the KPI Targets tab.</div>
          <div><label className="text-xs text-slate-600 font-semibold mb-1.5 block">Name *</label><input value={name} onChange={e=>setName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"/></div>
          <div><label className="text-xs text-slate-600 font-semibold mb-1.5 block">Address</label><input value={address} onChange={e=>setAddress(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"/></div>
          <div>
            <label className="text-xs text-slate-600 font-semibold mb-1.5 block">Icon</label>
            <div className="flex gap-2 flex-wrap">
              {icons.map(ic=>{const Ic=ICON_MAP[ic.key];return(<button key={ic.key} onClick={()=>setIconKey(ic.key)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${iconKey===ic.key?"bg-indigo-600 border-indigo-500 text-white":"bg-slate-800 border-slate-700 text-slate-600 hover:bg-slate-700"}`}><Ic size={13}/>{ic.label}</button>);})}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-600 font-semibold mb-1.5 block">Colour</label>
            <div className="flex gap-2 flex-wrap">{colors.map(c=><button key={c} onClick={()=>setColor(c)} className={`w-8 h-8 rounded-xl border-2 transition-all ${color===c?"border-white scale-110":"border-transparent"}`} style={{background:c}}/>)}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800/60 rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:color+"30"}}><BIcon size={16} style={{color}}/></div>
            <div><div className="text-sm font-semibold text-white">{name||"Brand Name"}</div><div className="text-xs text-slate-600">{address||"Address"}</div></div>
          </div>
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-slate-700">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!name.trim()} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-40 transition-colors">{isCreate?"Create":"Save"}</button>
        </div>
      </div>
    </div>
  );
}

function UserEditorModal({ user: editUser, brands, stores = [], onSave, onClose }) {
  const isCreate = !editUser;
  const [name, setName] = useState(editUser?.name||"");
  const [email, setEmail] = useState(editUser?.email||"");
  const [password, setPassword] = useState(editUser?.password||"");
  const [showPass, setShowPass] = useState(false);
  const [role, setRole] = useState(editUser?.role||"manager");
  const [storeIds, setStoreIds] = useState(editUser?.storeIds || []);
  const [storeSearch, setStoreSearch] = useState("");

  const avatar = name.trim().split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2)||"??";

  // Active stores grouped by brand for the picker. Archived stores excluded
  // so managers can't be assigned to a store that's been retired.
  const activeStores = useMemo(
    () => stores.filter(s => !s.archivedAt),
    [stores]
  );
  const storesByBrand = useMemo(() => {
    const m = {};
    activeStores.forEach(s => { (m[s.brandId] = m[s.brandId] || []).push(s); });
    Object.values(m).forEach(arr => arr.sort((a, b) => (a.shortName || a.name).localeCompare(b.shortName || b.name)));
    return m;
  }, [activeStores]);
  const matchesSearch = (s) => {
    const q = storeSearch.trim().toLowerCase();
    if (!q) return true;
    return (s.shortName || "").toLowerCase().includes(q) || (s.name || "").toLowerCase().includes(q);
  };

  const toggleStore = id => setStoreIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const toggleAllInBrand = (brandId, allSelected) => {
    const idsInBrand = (storesByBrand[brandId] || []).map(s => s.id);
    if (allSelected) {
      setStoreIds(ids => ids.filter(x => !idsInBrand.includes(x)));
    } else {
      setStoreIds(ids => Array.from(new Set([...ids, ...idsInBrand])));
    }
  };

  const handleSave = () => {
    if (!name.trim() || !email.trim()) return;
    // For owner/HQ: brandIds = all brands (global). For manager: derive
    // brandIds from selected storeIds (parent brand of each store) so legacy
    // brand-level checks still work during transition.
    const derivedBrandIds = isHqOrAbove(role)
      ? brands.map(b => b.id)
      : Array.from(new Set(storeIds.map(sid => stores.find(s => s.id === sid)?.brandId).filter(Boolean)));
    onSave({
      id: editUser?.id || `u-${Date.now()}`,
      name: name.trim(),
      email: email.trim(),
      password,
      role,
      brandIds: derivedBrandIds,
      storeIds: isHqOrAbove(role) ? [] : storeIds,   // HQ/owner are global; storeIds empty by convention
      avatar,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h3 className="font-bold text-white">{isCreate?"Add User":`Edit — ${editUser.name}`}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
          <div className="flex items-center gap-3 bg-slate-950 border border-slate-800/60 rounded-xl p-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-300 flex items-center justify-center text-sm font-bold">{avatar}</div>
            <div><div className="text-sm font-semibold text-white">{name||"Full Name"}</div><div className="text-xs text-slate-600">{email||"email"}</div></div>
          </div>
          <div><label className="text-xs text-slate-600 font-semibold mb-1.5 block">Full Name *</label><input value={name} onChange={e=>setName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"/></div>
          <div><label className="text-xs text-slate-600 font-semibold mb-1.5 block">Email *</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"/></div>
          <div>
            <label className="text-xs text-slate-600 font-semibold mb-1.5 block">Password *</label>
            <div className="relative">
              <input type={showPass?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none pr-10"/>
              <button onClick={()=>setShowPass(p=>!p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">{showPass?<EyeOff size={14}/>:<Eye size={14}/>}</button>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-600 font-semibold mb-1.5 block">Role</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                {key:"manager",  label:"Manager"},
                {key:"hq_staff", label:"HQ Staff"},
                {key:"owner",    label:"Owner"},
              ].map(r => (
                <button key={r.key} onClick={()=>setRole(r.key)} className={`py-2 rounded-xl text-xs font-semibold border transition-all ${role===r.key?"bg-indigo-600 border-indigo-500 text-white":"bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"}`}>{r.label}</button>
              ))}
            </div>
            <div className="text-[10px] text-slate-600 mt-1.5">
              {role==="owner"   && "Full system access. Can add/remove HQ staff."}
              {role==="hq_staff"&& "Global access to all brands and stores. No system config."}
              {role==="manager" && "Access limited to assigned stores only."}
            </div>
          </div>
          {role==="manager" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-slate-600 font-semibold block">Stores</label>
                <span className="text-[10px] text-slate-600">{storeIds.length} selected</span>
              </div>
              <input
                type="text"
                value={storeSearch}
                onChange={e => setStoreSearch(e.target.value)}
                placeholder="Search stores…"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none mb-2"
              />
              <div className="space-y-3 max-h-72 overflow-y-auto">
                {Object.entries(storesByBrand).map(([brandId, brandStores]) => {
                  const brand = brands.find(b => b.id === brandId);
                  const filtered = brandStores.filter(matchesSearch);
                  if (filtered.length === 0) return null;
                  const selectedInBrand = filtered.filter(s => storeIds.includes(s.id)).length;
                  const allSelected = selectedInBrand === filtered.length;
                  const partial = selectedInBrand > 0 && !allSelected;
                  return (
                    <div key={brandId}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          {brand && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background: brand.color}}/>}
                          <span className="text-[11px] uppercase tracking-widest font-bold text-slate-500">{brand?.name || brandId}</span>
                          <span className="text-[10px] text-slate-600">{selectedInBrand}/{filtered.length}{partial ? " (partial)" : ""}</span>
                        </div>
                        <button onClick={() => toggleAllInBrand(brandId, allSelected)} className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300">
                          {allSelected ? "Clear all" : "Select all"}
                        </button>
                      </div>
                      <div className="space-y-1">
                        {filtered.map(s => {
                          const checked = storeIds.includes(s.id);
                          return (
                            <button key={s.id} onClick={() => toggleStore(s.id)} className={`w-full flex items-center justify-between rounded-xl border px-3 py-2 transition-all ${checked?"bg-indigo-600/20 border-indigo-500/30":"bg-slate-950 border-slate-800/60 hover:bg-slate-800"}`}>
                              <div className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked?"bg-indigo-600 border-indigo-500":"border-slate-600"}`}>
                                  {checked && <Check size={11} className="text-white"/>}
                                </div>
                                <span className="text-sm text-slate-200">{s.shortName || s.name}</span>
                              </div>
                              {s.ownershipModel && <span className="text-[10px] text-slate-600 uppercase">{s.ownershipModel === "joint_venture" ? "JV" : s.ownershipModel}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {activeStores.length === 0 && <div className="text-xs text-slate-600 text-center py-6">No stores exist yet. Add some in the Stores tab first.</div>}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-slate-700">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!name.trim()||!email.trim()} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-40 transition-colors">{isCreate?"Create":"Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
function AdminPanelView({
  brands, users, entries,
  stores = [], flipdishStores = [],
  onAddBrand, onUpdateBrand, onDeleteBrand,
  onAddUser, onUpdateUser, onDeleteUser,
  onAddStore, onUpdateStore, onDeleteStore,
  onLinkFlipdish, onUnlinkFlipdish, onBackfillStoreSales,
  onUpdateKPITargets, onBulkImport
}) {
  const [tab, setTab] = useState("locations");
  const [locModal, setLocModal] = useState(null);
  const [userModal, setUserModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [showImport, setShowImport] = useState(false);

  const tabs = [
    {key:"brands",   label:"Brands"},
    {key:"stores",   label:"Stores"},
    {key:"managers", label:"Managers & Access"},
    {key:"kpis",     label:"KPI Targets"},
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 bg-slate-900 border border-slate-700 rounded-2xl p-1.5">
          {tabs.map(t=><button key={t.key} onClick={()=>setTab(t.key)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab===t.key?"bg-indigo-600 text-white":"text-slate-400 hover:text-white"}`}>{t.label}</button>)}
        </div>
        <button onClick={()=>setShowImport(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors">
          <FileSpreadsheet size={14}/> Bulk Import
        </button>
      </div>

      {tab==="brands"&&(
        <div className="space-y-4">
          <div className="text-xs text-slate-600 mb-2">
            Brands are chains (e.g. Chocoberry, Tove). To add or edit individual physical stores like Evington Road or Cardiff, use the <strong className="text-slate-400">Stores</strong> tab.
          </div>
          <div className="flex justify-end"><button onClick={()=>setLocModal("new")} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"><Plus size={14}/>Add Brand</button></div>
          {brands.map(b=>{
            const BIcon=ICON_MAP[b.iconKey]||Building2;
            const storeCount=stores.filter(s=>s.brandId===b.id && !s.archivedAt).length;
            const managerCount=users.filter(u=>u.role==="manager"&&(u.storeIds||[]).some(sid=>stores.find(s=>s.id===sid)?.brandId===b.id)).length;
            return(
              <div key={b.id} className="flex items-center gap-4 bg-slate-900 border border-slate-700 rounded-2xl px-5 py-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:b.color+"25"}}><BIcon size={18} style={{color:b.color}}/></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white">{b.name}</div>
                  <div className="text-xs text-slate-600">{b.address}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{storeCount} store{storeCount!==1?"s":""} · {managerCount} manager{managerCount!==1?"s":""}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={()=>setLocModal(b)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"><Edit size={14}/></button>
                  <button onClick={()=>setDeleteModal({msg:`Delete "${b.name}"? This cannot be undone.`,fn:()=>onDeleteBrand(b.id)})} className="p-2 rounded-xl bg-slate-800 text-slate-600 hover:text-red-400 hover:bg-red-950/20 transition-colors"><Trash2 size={14}/></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab==="stores"&&(
        <StoreManagementSection
          brands={brands}
          stores={stores}
          flipdishStores={flipdishStores}
          onAddStore={onAddStore}
          onUpdateStore={onUpdateStore}
          onDeleteStore={onDeleteStore}
          onLinkFlipdish={onLinkFlipdish}
          onUnlinkFlipdish={onUnlinkFlipdish}
          onBackfillStoreSales={onBackfillStoreSales}
        />
      )}

      {tab==="managers"&&(
        <div className="space-y-4">
          <div className="flex justify-end"><button onClick={()=>setUserModal("new")} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"><Plus size={14}/>Add Manager</button></div>
          {users.map(u=>(
            <div key={u.id} className="flex items-center gap-4 bg-slate-900 border border-slate-700 rounded-2xl px-5 py-4">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-300 flex items-center justify-center text-sm font-bold flex-shrink-0">{u.avatar}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-bold text-white">{u.name}</span><RoleBadge role={u.role}/></div>
                <div className="text-xs text-slate-600">{u.email}</div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {isHqOrAbove(u.role) ? (
                    <Badge label="All Locations" color={u.role==="owner"?"violet":"fuchsia"}/>
                  ) : (() => {
                    const assigned = (u.storeIds || []).map(sid => stores.find(s => s.id === sid)).filter(Boolean);
                    if (assigned.length === 0) return <Badge label="⚠ No stores assigned" color="amber"/>;
                    // Up to 4 store chips, then "+N more"
                    const shown = assigned.slice(0, 4);
                    const rest = assigned.length - shown.length;
                    return <>
                      {shown.map(s => <Badge key={s.id} label={s.shortName || s.name} color="slate"/>)}
                      {rest > 0 && <Badge label={`+${rest} more`} color="slate"/>}
                    </>;
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={()=>setUserModal(u)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"><Edit size={14}/></button>
                {u.role!=="owner"&&<button onClick={()=>setDeleteModal({msg:`Delete user "${u.name}"?`,fn:()=>onDeleteUser(u.id)})} className="p-2 rounded-xl bg-slate-800 text-slate-600 hover:text-red-400 hover:bg-red-950/20 transition-colors"><Trash2 size={14}/></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab==="kpis"&&(
        <StoreKPIPanel
          brands={brands}
          stores={stores.filter(s => !s.archivedAt)}
          onSaveStoreKPIs={async (storeId, kpiTargets) => {
            // Calls the existing updateStore handler with just kpiTargets;
            // appStoreToDb whitelists only what's set, so the rest is preserved.
            return onUpdateStore(storeId, { kpiTargets });
          }}
        />
      )}

      {locModal&&<LocationEditorModal brand={locModal==="new"?null:locModal} onSave={locModal==="new"?onAddBrand:onUpdateBrand} onClose={()=>setLocModal(null)}/>}
      {userModal&&<UserEditorModal user={userModal==="new"?null:userModal} brands={brands} stores={stores} onSave={userModal==="new"?onAddUser:onUpdateUser} onClose={()=>setUserModal(null)}/>}
      {deleteModal&&(
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-red-500/25 flex items-center justify-center flex-shrink-0"><AlertTriangle size={18} className="text-red-400"/></div><div className="text-sm text-slate-700">{deleteModal.msg}</div></div>
            <div className="flex gap-3"><button onClick={()=>setDeleteModal(null)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700 transition-colors">Cancel</button><button onClick={()=>{deleteModal.fn();setDeleteModal(null);}} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500 transition-colors">Delete</button></div>
          </div>
        </div>
      )}
      {showImport&&<ExcelUploadModal brands={brands} entries={entries} onImport={async rows=>{ await onBulkImport(rows); }} onClose={()=>setShowImport(false)}/>}
    </div>
  );
}

// ─── Per-Store KPI Panel (Admin → KPI Targets tab) ────────────────────────────
// Replaces the old brand-level KPI editor. Each store now has its own targets
// for the volume metrics (revenue, orders, hours) which vary by day of week,
// plus a flat block of ratio targets (prime cost %, ATV, labour %) which don't.
//
// Storage shape (stores.kpi_targets jsonb):
//   { monday: { revenue, orders, hours }, ..., sunday: {...},
//     ratios: { primeCostMax, atvTarget, laborCostMax } }
//
// UI: filter by brand + ownership + search; edit-button opens a modal where
// the whole week + ratios are edited at once.
function StoreKPIPanel({ brands, stores, onSaveStoreKPIs }) {
  const [brandFilter, setBrandFilter] = useState("all");
  const [search, setSearch]           = useState("");
  const [editing, setEditing]         = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stores
      .filter(s => brandFilter === "all" || s.brandId === brandFilter)
      .filter(s => !q || (s.shortName || "").toLowerCase().includes(q) || (s.name || "").toLowerCase().includes(q))
      .sort((a, b) => (a.brandId || "").localeCompare(b.brandId || "") || (a.shortName || "").localeCompare(b.shortName || ""));
  }, [stores, brandFilter, search]);

  // Weekly summary numbers for the row — sum of per-day revenue & orders, used
  // so you can see at a glance how each store's targets stack up.
  const weeklyTotals = (kt) => {
    const days = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
    let rev = 0, ord = 0, hrs = 0;
    days.forEach(d => {
      const day = kt?.[d] || {};
      rev += Number(day.revenue) || 0;
      ord += Number(day.orders)  || 0;
      hrs += Number(day.hours)   || 0;
    });
    return { rev, ord, hrs };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 bg-amber-950/20 border border-amber-500/30 rounded-xl px-4 py-2.5">
        <AlertTriangle size={14} className="text-amber-400 flex-shrink-0"/>
        <span className="text-sm text-amber-300">Each store has its own targets. Volume targets (revenue, orders, hours) vary by day of week — weekends typically higher.</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={brandFilter}
          onChange={e => setBrandFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="all">All brands ({stores.length})</option>
          {brands.map(b => (
            <option key={b.id} value={b.id}>
              {b.name} ({stores.filter(s => s.brandId === b.id).length})
            </option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search store…"
          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 w-56"
        />
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-900/60 border-b border-slate-800">
            <tr>
              <th className="text-left px-4 py-2.5 text-slate-500 font-semibold uppercase tracking-widest">Store</th>
              <th className="text-left px-3 py-2.5 text-slate-500 font-semibold uppercase tracking-widest">Brand</th>
              <th className="text-right px-3 py-2.5 text-slate-500 font-semibold uppercase tracking-widest">Weekly Revenue</th>
              <th className="text-right px-3 py-2.5 text-slate-500 font-semibold uppercase tracking-widest">Weekly Orders</th>
              <th className="text-right px-3 py-2.5 text-slate-500 font-semibold uppercase tracking-widest">Weekly Hours</th>
              <th className="text-right px-3 py-2.5 text-slate-500 font-semibold uppercase tracking-widest">Prime Cost Max</th>
              <th className="text-right px-4 py-2.5 text-slate-500 font-semibold uppercase tracking-widest"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-slate-500">No stores match the current filter.</td></tr>
            )}
            {filtered.map(s => {
              const brand = brands.find(b => b.id === s.brandId);
              const totals = weeklyTotals(s.kpiTargets);
              const ratios = s.kpiTargets?.ratios || {};
              return (
                <tr key={s.id} className="border-b border-slate-800/40 hover:bg-slate-800/30">
                  <td className="px-4 py-2.5">
                    <div className="text-sm text-white font-semibold">{s.shortName || s.name}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{brand?.name || s.brandId}</td>
                  <td className="px-3 py-2.5 text-right text-slate-200 tabular-nums">{fmtCurrency(totals.rev)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-200 tabular-nums">{totals.ord || "—"}</td>
                  <td className="px-3 py-2.5 text-right text-slate-200 tabular-nums">{totals.hrs || "—"}</td>
                  <td className="px-3 py-2.5 text-right text-slate-200 tabular-nums">{ratios.primeCostMax != null ? `${ratios.primeCostMax}%` : "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => setEditing(s)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
                    >Edit Targets</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <StoreKPIModal
          store={editing}
          brand={brands.find(b => b.id === editing.brandId)}
          onSave={async (kpiTargets) => {
            await onSaveStoreKPIs(editing.id, kpiTargets);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ─── Store KPI Modal (edits one store's per-day targets at once) ──────────────
function StoreKPIModal({ store, brand, onSave, onClose }) {
  const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
  const DAY_LABELS = { monday:"Mon", tuesday:"Tue", wednesday:"Wed", thursday:"Thu", friday:"Fri", saturday:"Sat", sunday:"Sun" };

  // Seed form from current store targets, defaulting any missing day/ratio
  // to zero so the inputs are controlled even on a brand-new store.
  const seed = useMemo(() => {
    const kt = store?.kpiTargets || {};
    const days = {};
    DAYS.forEach(d => {
      days[d] = {
        revenue: kt[d]?.revenue ?? 0,
        orders:  kt[d]?.orders  ?? 0,
        hours:   kt[d]?.hours   ?? 0,
      };
    });
    return {
      ...days,
      ratios: {
        primeCostMax:  kt.ratios?.primeCostMax  ?? 60,
        atvTarget:     kt.ratios?.atvTarget     ?? 18,
        laborCostMax:  kt.ratios?.laborCostMax  ?? 25,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id]);

  const [form, setForm] = useState(seed);
  const [saving, setSaving] = useState(false);

  const setDay = (day, field, val) => setForm(f => ({ ...f, [day]: { ...f[day], [field]: val === "" ? 0 : Number(val) } }));
  const setRatio = (field, val) => setForm(f => ({ ...f, ratios: { ...f.ratios, [field]: val === "" ? 0 : Number(val) } }));

  const totals = useMemo(() => {
    let rev = 0, ord = 0, hrs = 0;
    DAYS.forEach(d => {
      rev += Number(form[d]?.revenue) || 0;
      ord += Number(form[d]?.orders)  || 0;
      hrs += Number(form[d]?.hours)   || 0;
    });
    return { rev, ord, hrs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  // "Copy Mon to all days" — a sanity shortcut for stores where targets don't
  // actually vary by day. Cheaper than typing the same 3 values 7 times.
  const copyMondayToAll = () => {
    setForm(f => {
      const mon = f.monday;
      const next = { ...f };
      DAYS.forEach(d => { next[d] = { ...mon }; });
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); }
    finally { setSaving(false); }
  };

  const cellCls = "w-full px-2 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700 text-sm text-white text-right tabular-nums focus:outline-none focus:border-indigo-500";

  return (
    <Modal
      title={`KPI Targets — ${store.shortName || store.name}${brand ? ` · ${brand.name}` : ""}`}
      onClose={onClose}
      maxW="max-w-3xl"
      footer={
        <div className="flex gap-2 w-full">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50">{saving ? "Saving…" : "Save targets"}</button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-slate-500">Volume targets per day. Weekends usually higher.</div>
          <button onClick={copyMondayToAll} className="text-xs font-semibold text-indigo-400 hover:text-indigo-300">Copy Mon → all days</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-3 py-2 text-slate-500 font-semibold">Day</th>
                <th className="text-right px-3 py-2 text-slate-500 font-semibold">Revenue (£)</th>
                <th className="text-right px-3 py-2 text-slate-500 font-semibold">Orders</th>
                <th className="text-right px-3 py-2 text-slate-500 font-semibold">Hours</th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map(d => (
                <tr key={d} className="border-b border-slate-800/50">
                  <td className="px-3 py-1.5 text-slate-300 font-semibold">{DAY_LABELS[d]}</td>
                  <td className="px-1 py-1.5">
                    <input type="number" min="0" step="50" value={form[d]?.revenue ?? 0}
                      onChange={e => setDay(d, "revenue", e.target.value)} className={cellCls}/>
                  </td>
                  <td className="px-1 py-1.5">
                    <input type="number" min="0" step="1" value={form[d]?.orders ?? 0}
                      onChange={e => setDay(d, "orders", e.target.value)} className={cellCls}/>
                  </td>
                  <td className="px-1 py-1.5">
                    <input type="number" min="0" step="1" value={form[d]?.hours ?? 0}
                      onChange={e => setDay(d, "hours", e.target.value)} className={cellCls}/>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-700 bg-slate-900/40">
                <td className="px-3 py-2 text-slate-200 font-semibold">Weekly total</td>
                <td className="px-3 py-2 text-right text-slate-200 font-bold tabular-nums">{fmtCurrency(totals.rev)}</td>
                <td className="px-3 py-2 text-right text-slate-200 font-bold tabular-nums">{totals.ord}</td>
                <td className="px-3 py-2 text-right text-slate-200 font-bold tabular-nums">{totals.hrs}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <div className="text-xs text-slate-500 mb-2">Efficiency ratios. These apply across the whole week.</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">Prime Cost Max (%)</label>
              <input type="number" min="0" max="100" step="1" value={form.ratios.primeCostMax}
                onChange={e => setRatio("primeCostMax", e.target.value)} className={cellCls + " text-left"}/>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">ATV Target (£)</label>
              <input type="number" min="0" step="0.5" value={form.ratios.atvTarget}
                onChange={e => setRatio("atvTarget", e.target.value)} className={cellCls + " text-left"}/>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">Labour % Max</label>
              <input type="number" min="0" max="100" step="1" value={form.ratios.laborCostMax}
                onChange={e => setRatio("laborCostMax", e.target.value)} className={cellCls + " text-left"}/>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Store Management (under Admin Panel) ─────────────────────────────────────
// Admin-only screen for managing the canonical stores table. Lets the owner:
//   - browse all stores (optionally filtered by brand)
//   - add a new store (e.g. opening a new branch, or onboarding a new brand)
//   - edit an existing store's metadata (name, ownership, status, address...)
//   - delete a store (only if no flipdish_stores reference it)
//   - link/unlink Flipdish RMS storefronts to a physical store record
//   - backfill historical sales when a new store is added after data exists
//
// Two-pane layout: filter + table on the left, edit/add form modal on demand.
function StoreManagementSection({
  brands, stores, flipdishStores,
  onAddStore, onUpdateStore, onDeleteStore,
  onLinkFlipdish, onUnlinkFlipdish, onBackfillStoreSales,
}) {
  const [brandFilter, setBrandFilter]   = useState("all");
  const [search, setSearch]             = useState("");
  const [editing, setEditing]           = useState(null);   // store row being edited, or "new"
  const [linkModal, setLinkModal]       = useState(null);   // store row whose Flipdish links we're managing
  const [confirmDelete, setConfirmDelete] = useState(null); // store row pending delete confirmation
  const [busy, setBusy]                 = useState(false);

  const filteredStores = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stores
      .filter(s => brandFilter === "all" || s.brandId === brandFilter)
      .filter(s => !q || (s.shortName || "").toLowerCase().includes(q) || (s.name || "").toLowerCase().includes(q) || (s.id || "").toLowerCase().includes(q))
      .sort((a,b) => (a.brandId || "").localeCompare(b.brandId || "") || (a.shortName || "").localeCompare(b.shortName || ""));
  }, [stores, brandFilter, search]);

  const linkCounts = useMemo(() => {
    const m = {};
    flipdishStores.forEach(fs => {
      if (!fs.storeId) return;
      m[fs.storeId] = (m[fs.storeId] || 0) + 1;
    });
    return m;
  }, [flipdishStores]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try { await onDeleteStore(confirmDelete.id); setConfirmDelete(null); }
    catch (_) { /* toast already shown by handler */ }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={brandFilter}
            onChange={e => setBrandFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">All brands ({stores.length})</option>
            {brands.map(b => (
              <option key={b.id} value={b.id}>
                {b.name} ({stores.filter(s => s.brandId === b.id).length})
              </option>
            ))}
          </select>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search store…"
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 w-56"
          />
        </div>
        <button
          onClick={() => setEditing("new")}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
        >
          <Plus size={14}/> Add Store
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-900/60 border-b border-slate-800">
            <tr>
              <th className="text-left px-4 py-2.5 text-slate-500 font-semibold uppercase tracking-widest">Store</th>
              <th className="text-left px-3 py-2.5 text-slate-500 font-semibold uppercase tracking-widest">Brand</th>
              <th className="text-left px-3 py-2.5 text-slate-500 font-semibold uppercase tracking-widest">Ownership</th>
              <th className="text-left px-3 py-2.5 text-slate-500 font-semibold uppercase tracking-widest">Status</th>
              <th className="text-right px-3 py-2.5 text-slate-500 font-semibold uppercase tracking-widest">Flipdish links</th>
              <th className="text-right px-4 py-2.5 text-slate-500 font-semibold uppercase tracking-widest"></th>
            </tr>
          </thead>
          <tbody>
            {filteredStores.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-slate-500">No stores match the current filter.</td></tr>
            )}
            {filteredStores.map(s => {
              const brand = brands.find(b => b.id === s.brandId);
              const linkCount = linkCounts[s.id] || 0;
              return (
                <tr key={s.id} className="border-b border-slate-800/40 hover:bg-slate-800/30">
                  <td className="px-4 py-2.5">
                    <div className="text-sm text-white font-semibold">{s.shortName || s.name}</div>
                    <div className="text-[10px] text-slate-600">{s.id}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{brand?.name || s.brandId}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                      s.ownershipModel === "owned"         ? "bg-indigo-950/30 text-indigo-400" :
                      s.ownershipModel === "joint_venture" ? "bg-sky-950/30 text-sky-400" :
                                                              "bg-slate-800/60 text-slate-400"
                    }`}>
                      {s.ownershipModel === "joint_venture" ? "JV" : s.ownershipModel || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[11px] ${
                      s.status === "operational" ? "text-emerald-400" :
                      s.status === "test"        ? "text-amber-400" :
                      s.status === "pre_opening" ? "text-sky-400" :
                                                    "text-slate-500"
                    }`}>● {s.status || "—"}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => setLinkModal(s)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold tabular-nums"
                    >
                      {linkCount} linked
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => setEditing(s)}
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 mr-1"
                      title="Edit"
                    ><Edit size={13}/></button>
                    <button
                      onClick={() => setConfirmDelete(s)}
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-600 hover:text-red-400 hover:bg-red-950/20"
                      title="Delete"
                    ><Trash2 size={13}/></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <StoreEditModal
          brands={brands}
          store={editing === "new" ? null : editing}
          existingIds={stores.map(s => s.id)}
          onSave={async (payload) => {
            if (editing === "new") {
              const saved = await onAddStore(payload);
              // Offer to backfill historical sales for this brand if any
              // unlinked rows exist. Use a confirm() — it's an admin-only
              // screen so an extra modal isn't worth the code.
              // eslint-disable-next-line no-restricted-globals
              if (confirm(`Backfill any unlinked historical ${payload.brandId} sales to "${saved.shortName}"? (Safe — only updates rows currently with no store_id.)`)) {
                try { await onBackfillStoreSales(payload.brandId, saved.id); } catch (e) { /* toast in handler */ }
              }
            } else {
              await onUpdateStore(editing.id, payload);
            }
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {linkModal && (
        <FlipdishLinkModal
          store={linkModal}
          flipdishStores={flipdishStores}
          onLink={onLinkFlipdish}
          onUnlink={onUnlinkFlipdish}
          onClose={() => setLinkModal(null)}
        />
      )}

      {confirmDelete && (
        <Modal
          title={`Delete "${confirmDelete.shortName || confirmDelete.name}"?`}
          onClose={() => setConfirmDelete(null)}
          maxW="max-w-md"
          footer={
            <div className="flex gap-2 w-full">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button>
              <button onClick={handleDelete} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500 disabled:opacity-50">{busy ? "Deleting…" : "Delete"}</button>
            </div>
          }
        >
          <p className="text-sm text-slate-300">
            This will remove the store from the dashboard. Historical sales rows
            keep their data but lose their link to this store.
          </p>
          {(linkCounts[confirmDelete.id] || 0) > 0 && (
            <p className="text-xs text-amber-400 mt-3">
              ⚠ This store has {linkCounts[confirmDelete.id]} linked Flipdish storefront(s).
              You may need to unlink them first if the delete fails.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── Store Edit/Add modal ─────────────────────────────────────────────────────
function StoreEditModal({ store, brands, existingIds, onSave, onClose }) {
  const isNew = !store;
  const [form, setForm] = useState({
    id:              store?.id              || "",
    brandId:         store?.brandId         || brands[0]?.id || "",
    shortName:       store?.shortName       || "",
    name:            store?.name            || "",
    ownershipModel:  store?.ownershipModel  || "owned",
    franchiseeName:  store?.franchiseeName  || "",
    status:          store?.status          || "operational",
    address:         store?.address         || "",
    city:            store?.city            || "",
    postcode:        store?.postcode        || "",
    country:         store?.country         || "United Kingdom",
    phone:           store?.phone           || "",
    email:           store?.email           || "",
    notes:           store?.notes           || "",
    // Per-store kiosk PIN. Tablets at this store use this PIN to register
    // themselves. Owner/HQ + the store's manager can set/change it. Empty
    // means kiosk login is disabled for this store.
    kioskPin:        store?.kioskPin        || "",
    // Whether this store accepts applications on the public /apply form.
    // Default true for new stores; preserve existing value for edits.
    // Setting false hides the store from the public dropdown immediately —
    // useful for pausing applications when fully staffed.
    isHiring:        store?.isHiring !== undefined ? store.isHiring : true,
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Auto-derive the id from short name (only for new stores; established ids
  // shouldn't change because flipdish_sales references them).
  useEffect(() => {
    if (!isNew) return;
    if (!form.shortName) return;
    const slug = form.shortName.toLowerCase().trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    setForm(f => ({ ...f, id: f.id && f.id !== `store-${slug.slice(0, -1)}` ? f.id : `store-${slug}` }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.shortName, isNew]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    setError(null);
    // Validation
    if (!form.shortName.trim()) return setError("Short name is required.");
    if (!form.name.trim())      return setError("Full name is required.");
    if (!form.brandId)          return setError("Pick a brand.");
    if (isNew && !form.id)      return setError("Couldn't derive an ID — try a different short name.");
    if (isNew && existingIds.includes(form.id)) {
      return setError(`A store with id "${form.id}" already exists. Edit that one or pick a different short name.`);
    }
    // Kiosk PIN must be 4-6 digits, or empty (disables kiosk login for store).
    if (form.kioskPin && !/^\d{4,6}$/.test(form.kioskPin.trim())) {
      return setError("Kiosk PIN must be 4 to 6 digits.");
    }
    setSaving(true);
    try { await onSave(form); }
    catch (e) { setError(e.message || String(e)); setSaving(false); }
  };

  return (
    <Modal
      title={isNew ? "Add new store" : `Edit ${form.shortName}`}
      onClose={onClose}
      maxW="max-w-2xl"
      footer={
        <div className="flex gap-2 w-full">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50">
            {saving ? "Saving…" : (isNew ? "Add Store" : "Save changes")}
          </button>
        </div>
      }
    >
      {error && <div className="mb-3 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900 text-red-300 text-xs">{error}</div>}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Short name *">
          <input value={form.shortName} onChange={set("shortName")} className={fieldCls} placeholder="e.g. Cardiff" />
        </Field>
        <Field label="Full name *">
          <input value={form.name} onChange={set("name")} className={fieldCls} placeholder="e.g. Chocoberry Cardiff" />
        </Field>

        <Field label="Brand *">
          <select value={form.brandId} onChange={set("brandId")} className={fieldCls}>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Store ID">
          <input
            value={form.id}
            onChange={set("id")}
            disabled={!isNew}
            className={fieldCls + (isNew ? "" : " opacity-50 cursor-not-allowed")}
            placeholder="auto-derived from short name"
          />
        </Field>

        <Field label="Ownership *">
          <select value={form.ownershipModel} onChange={set("ownershipModel")} className={fieldCls}>
            <option value="owned">Owned</option>
            <option value="joint_venture">Joint Venture</option>
            <option value="franchise">Franchise</option>
          </select>
        </Field>
        <Field label="Status *">
          <select value={form.status} onChange={set("status")} className={fieldCls}>
            <option value="operational">Operational</option>
            <option value="pre_opening">Pre-opening</option>
            <option value="test">Test (hidden from leaderboard)</option>
            <option value="closed">Closed</option>
          </select>
        </Field>

        {form.ownershipModel === "franchise" && (
          <Field label="Franchisee name" full>
            <input value={form.franchiseeName} onChange={set("franchiseeName")} className={fieldCls} placeholder="Person/company running this franchise" />
          </Field>
        )}

        <Field label="Address" full>
          <input value={form.address} onChange={set("address")} className={fieldCls} placeholder="Street + number" />
        </Field>
        <Field label="City">
          <input value={form.city} onChange={set("city")} className={fieldCls} />
        </Field>
        <Field label="Postcode">
          <input value={form.postcode} onChange={set("postcode")} className={fieldCls} />
        </Field>
        <Field label="Country">
          <input value={form.country} onChange={set("country")} className={fieldCls} />
        </Field>
        <Field label="Phone">
          <input value={form.phone} onChange={set("phone")} className={fieldCls} placeholder="+44…" />
        </Field>
        <Field label="Email" full>
          <input value={form.email} onChange={set("email")} className={fieldCls} type="email" />
        </Field>
        <Field label="Kiosk PIN (4–6 digits)" full>
          <input
            value={form.kioskPin}
            onChange={set("kioskPin")}
            maxLength={6}
            placeholder="e.g. 4827"
            className={fieldCls}
            inputMode="numeric"
            pattern="[0-9]*"
          />
          <div className="text-[10px] text-slate-500 mt-1">
            Tablets at this store enter this PIN once to register as the store's kiosk.
            Changing it invalidates any tablets currently registered — they'll need to re-enter the new PIN.
            Leave blank to disable kiosk login for this store.
          </div>
        </Field>
        <Field label="Accepting applications" full>
          <label className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-slate-800/40 border border-slate-700 cursor-pointer hover:bg-slate-800/70">
            <input
              type="checkbox"
              checked={!!form.isHiring}
              onChange={e => setForm(f => ({ ...f, isHiring: e.target.checked }))}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-200">
                {form.isHiring ? "Visible on /apply" : "Hidden from /apply"}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                When ticked, this store appears in the public job application form dropdown. Untick to pause new applications when fully staffed.
              </div>
            </div>
          </label>
        </Field>
        <Field label="Notes" full>
          <textarea value={form.notes} onChange={set("notes")} className={fieldCls + " min-h-[60px]"} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}

const fieldCls = "w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500";
function Field({ label, children, full }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">{label}</label>
      {children}
    </div>
  );
}

// ─── Flipdish linkage modal ───────────────────────────────────────────────────
// Shows the list of all flipdish_stores; user clicks to link/unlink to the
// currently-edited store. Linked rows for THIS store appear first.
function FlipdishLinkModal({ store, flipdishStores, onLink, onUnlink, onClose }) {
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...flipdishStores]
      .filter(fs => !q || (fs.name || "").toLowerCase().includes(q) || String(fs.id || "").includes(q))
      .sort((a, b) => {
        // Linked to THIS store first, then unlinked, then linked to others
        const aMine = a.storeId === store.id ? 0 : a.storeId ? 2 : 1;
        const bMine = b.storeId === store.id ? 0 : b.storeId ? 2 : 1;
        if (aMine !== bMine) return aMine - bMine;
        return (a.name || "").localeCompare(b.name || "");
      });
  }, [flipdishStores, search, store.id]);

  const toggle = async (fs) => {
    setBusyId(fs.id);
    try {
      if (fs.storeId === store.id) await onUnlink(fs.id);
      else                          await onLink(fs.id, store.id);
    } catch (_) { /* toast in handler */ }
    finally { setBusyId(null); }
  };

  return (
    <Modal
      title={`Link Flipdish storefronts to "${store.shortName}"`}
      onClose={onClose}
      maxW="max-w-2xl"
      footer={<button onClick={onClose} className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Done</button>}
    >
      <div className="text-xs text-slate-500 mb-3">
        Flipdish RMS storefronts are channel-specific (POS / online / Uber / Deliveroo).
        One physical store can have several. Click to link or unlink.
      </div>
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search Flipdish storefronts…"
        className="w-full px-3 py-2 mb-3 rounded-lg bg-slate-800/60 border border-slate-700 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
      />
      <div className="max-h-96 overflow-y-auto space-y-1.5">
        {sorted.length === 0 && <div className="text-center py-6 text-slate-500 text-sm">No Flipdish storefronts match.</div>}
        {sorted.map(fs => {
          const linkedHere = fs.storeId === store.id;
          const linkedElse = fs.storeId && !linkedHere;
          return (
            <div key={fs.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${linkedHere ? "bg-indigo-950/40 border border-indigo-900/60" : "bg-slate-800/40 border border-slate-800"}`}>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{fs.name || "(unnamed)"}</div>
                <div className="text-[10px] text-slate-500">id {fs.id} · {fs.channel || "—"}{linkedElse ? ` · linked to ${fs.storeId}` : ""}</div>
              </div>
              <button
                onClick={() => toggle(fs)}
                disabled={busyId === fs.id || (linkedElse && !linkedHere)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  linkedHere ? "bg-rose-600/30 text-rose-300 hover:bg-rose-600/40"
                            : linkedElse ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                                          : "bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/40"
                }`}
              >
                {busyId === fs.id ? "…" : linkedHere ? "Unlink" : linkedElse ? "linked elsewhere" : "Link"}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ─── User Chip ────────────────────────────────────────────────────────────────
function UserChip({ user, onLogout, compact }) {
  return (
    <div className={`flex items-center ${compact?"gap-2":"gap-3"}`}>
      <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-300 flex items-center justify-center text-sm font-bold flex-shrink-0">{user.avatar}</div>
      {!compact&&(
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">{user.name}</div>
          <RoleBadge role={user.role}/>
        </div>
      )}
      <button onClick={onLogout} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-950/20"><LogOut size={14}/></button>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

// ─── Ops imports patch (added to existing imports at top) ─────────────────────
// NOTE: Also add these to the import line at the top of the file:
// fetchChecklists, upsertChecklist, removeChecklist,
// fetchTempUnits, upsertTempUnit, removeTempUnit,
// fetchCleaningTasks, upsertCleaningTask, removeCleaningTask,
// fetchAssignments, upsertAssignment, removeAssignment,
// fetchOpsTeam, upsertOpsTeamMember, removeOpsTeamMember,
// fetchTempLogs, insertTempLog,
// fetchDeliveries, insertDelivery,
// fetchChecklistStates, upsertChecklistState,
// fetchAuditTrail, insertAuditEntry, clearAuditTrail,

// ─── Ops constants ────────────────────────────────────────────────────────────
const TEMP_ICON = { fridge: "🧊", freezer: "❄️", hot: "🔥" };

function getTodayStr() { return new Date().toISOString().split("T")[0]; }
function nowTimeStr() { const n = new Date(); return n.getHours().toString().padStart(2,"0") + ":" + n.getMinutes().toString().padStart(2,"0"); }
function isActiveToday(a) {
  const f = a.freq, d = new Date().getDay();
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  if (f === "daily") return true;
  if (f === "weekdays") return d >= 1 && d <= 5;
  if (f === "weekends") return d === 0 || d === 6;
  if (f === "weekly") return a.weekday === days[d];
  if (f === "once") return a.date === getTodayStr();
  if (f === "custom") return (a.customDays || []).includes(days[d]);
  return true;
}
function isWindowOpen(a) {
  if (!a.winStart) return true;
  const [h,m] = a.winStart.split(":").map(Number);
  const now = new Date(); return now.getHours()*60+now.getMinutes() >= h*60+m;
}
function isOverdue(a) {
  if (!a.winEnd) return false;
  const [h,m] = a.winEnd.split(":").map(Number);
  const now = new Date(); return now.getHours()*60+now.getMinutes() > h*60+m;
}
function tempLimitText(u) {
  if (u.min != null && u.max != null) return `${u.min}°C–${u.max}°C`;
  if (u.min != null) return `Min ${u.min}°C`;
  if (u.max != null) return `Max ${u.max}°C`;
  return "No limit";
}
function checkTemp(u, v) {
  const n = parseFloat(v);
  if (u.min != null && n < u.min) return false;
  if (u.max != null && n > u.max) return false;
  return true;
}

// ─── Ops shared helpers ───────────────────────────────────────────────────────
const inputCls = "w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition-colors";
const labelCls = "text-xs text-slate-600 font-semibold mb-1.5 block";

function Modal({ title, onClose, children, footer, maxW = "max-w-lg" }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`bg-slate-900 border border-slate-700 rounded-2xl w-full ${maxW} flex flex-col`} style={{ maxHeight: "85vh" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 flex-shrink-0">
          <h3 className="font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex gap-3 px-5 py-4 border-t border-slate-700 flex-shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

function OpsConfirmModal({ message, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/25 flex items-center justify-center flex-shrink-0"><AlertTriangle size={18} className="text-red-400"/></div>
          <div className="text-sm text-slate-700">{message}</div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">Cancel</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500">Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Ops Network Dashboard ────────────────────────────────────────────────────
function OpsNetworkDashboard({ brands, stores, visibleStoreIds, assignments, auditTrail, opsTeam, checklists = [], tempUnits = [], cleaningTasks = [] }) {
  const { user } = useAuth();

  // Same store-scope pattern as ComplianceView. Owner/HQ default to "owned".
  const allVisibleStores = useMemo(
    () => (stores || []).filter(s => visibleStoreIds?.includes(s.id) && !s.archivedAt),
    [stores, visibleStoreIds]
  );
  const [ownership, setOwnership] = useState(isHqOrAbove(user.role) ? "owned" : "all");
  const visibleStores = useMemo(
    () => applyOwnershipFilter(allVisibleStores, ownership, user.role),
    [allVisibleStores, ownership, user.role]
  );

  const sortedStores = useMemo(
    () => [...visibleStores].sort((a, b) =>
      (a.brandId || "").localeCompare(b.brandId || "") ||
      (a.shortName || a.name || "").localeCompare(b.shortName || b.name || "")),
    [visibleStores]
  );

  const todayStr = getTodayStr();

  // Per-store metrics with the same legacy-split logic from ComplianceView.
  // Legacy rows (no store_id) get distributed evenly across the brand's
  // visible stores so the dashboard isn't dominated by zeros.
  const rowFor = (store) => {
    const direct = assignments.filter(a => a.storeId === store.id && isActiveToday(a));
    const brandStoresInScope = sortedStores.filter(s => s.brandId === store.brandId);
    const legacyBrand = assignments.filter(a => !a.storeId && a.brandId === store.brandId && isActiveToday(a));
    const legacyShare = brandStoresInScope.length > 0 ? legacyBrand.length / brandStoresInScope.length : 0;

    const la = direct.length + Math.round(legacyShare);
    const od = direct.filter(isOverdue).length;

    const directDone = auditTrail.filter(t =>
      t.storeId === store.id && t.date === todayStr && t.action.includes("sign-off")
    ).length;
    const legacyDoneBrand = auditTrail.filter(t =>
      !t.storeId && t.brandId === store.brandId && t.date === todayStr && t.action.includes("sign-off")
    ).length;
    const done = directDone + Math.round(brandStoresInScope.length > 0 ? legacyDoneBrand / brandStoresInScope.length : 0);

    const rate = la > 0 ? Math.round((done / la) * 100) : 0;
    const rag = od > 0 ? "red" : (la > 0 && done >= la) ? "green" : "amber";
    return { la, od, done, rate, rag };
  };

  // Aggregate top-line stats from the per-store rows so the cards and the
  // table can't disagree.
  const aggregates = useMemo(() => {
    const rows = sortedStores.map(rowFor);
    return {
      totalScheduled: rows.reduce((a, r) => a + r.la, 0),
      totalOverdue:   rows.reduce((a, r) => a + r.od, 0),
      totalCompleted: rows.reduce((a, r) => a + r.done, 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedStores, assignments, auditTrail]);

  if (allVisibleStores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <MapPin size={32} className="mb-3 text-slate-700"/>
        <div className="text-sm font-semibold">No stores assigned to your account.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs text-slate-600">{sortedStores.length} store{sortedStores.length === 1 ? "" : "s"}</div>
      </div>

      {aggregates.totalOverdue > 0 && (
        <div className="bg-red-950/20 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5"/>
          <div>
            <div className="text-sm font-bold text-red-400">{aggregates.totalOverdue} overdue assignment{aggregates.totalOverdue > 1 ? "s" : ""} require action</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Stores" value={sortedStores.length} sub="In view" icon={MapPin} accent="indigo"/>
        <StatCard label="Assignments Today" value={aggregates.totalScheduled} sub="All stores" icon={ClipboardList} accent="indigo"/>
        <StatCard label="Overdue" value={aggregates.totalOverdue} sub={aggregates.totalOverdue ? "Action needed" : "All on time"} icon={Clock} accent={aggregates.totalOverdue ? "red" : "emerald"} alert={aggregates.totalOverdue > 0}/>
        <StatCard label="Completed Today" value={aggregates.totalCompleted} sub="Sign-offs" icon={CheckCircle} accent="emerald"/>
      </div>

      <AnalysisBlock title="All Stores — Live Status">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700">
                {["Store","Brand","Scheduled","Overdue","Completed","Rate","RAG"].map(h =>
                  <th key={h} className="px-3 py-2 text-left text-slate-600 font-semibold">{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedStores.map(store => {
                const brand = brands.find(b => b.id === store.brandId);
                const { la, od, done, rate, rag } = rowFor(store);
                const ragColors = { red: "red", green: "green", amber: "amber" };
                return (
                  <tr key={store.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: (brand?.color || "#6366f1") + "25", color: brand?.color || "#6366f1" }}>
                          {(store.shortName || store.name || "?").slice(0, 2)}
                        </div>
                        <span className="font-semibold text-slate-200">{store.shortName || store.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-500">{brand?.name || store.brandId}</td>
                    <td className="px-3 py-3 text-slate-700 font-semibold">{la}</td>
                    <td className="px-3 py-3">{od ? <Badge label={`⚠ ${od}`} color="red"/> : <Badge label="✓ On time" color="green"/>}</td>
                    <td className="px-3 py-3 text-slate-700">{done}</td>
                    <td className="px-3 py-3"><span className={`font-bold font-mono ${rate>=80?"text-emerald-400":rate>=50?"text-amber-400":"text-red-400"}`}>{la ? rate+"%" : "—"}</span></td>
                    <td className="px-3 py-3"><Badge label={rag === "red" ? "Red" : rag === "green" ? "Green" : "Amber"} color={ragColors[rag]}/></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AnalysisBlock>
    </div>
  );
}

// ─── Today's Tasks ────────────────────────────────────────────────────────────
function TodaysTasks({ brands, stores, visibleStoreIds, assignments, checklists, tempUnits, cleaningTasks, auditTrail, checklistStates, onSignOff, onChecklistItemToggle }) {
  const { user } = useAuth();

  // visibleStores = the stores this user can see (already filtered upstream
  // via visibleStoreIds passed from App). For owner/HQ this is every active
  // store; for managers it's just their assigned stores.
  const allVisibleStores = useMemo(
    () => (stores || []).filter(s => visibleStoreIds?.includes(s.id) && !s.archivedAt),
    [stores, visibleStoreIds]
  );

  // Ownership filter — applied on top of allVisibleStores. Default to "owned"
  // for owner/HQ (the day-to-day operational subset). No-op for managers.
  const [ownership, setOwnership] = useState(isHqOrAbove(user.role) ? "owned" : "all");
  const visibleStores = useMemo(
    () => applyOwnershipFilter(allVisibleStores, ownership, user.role),
    [allVisibleStores, ownership, user.role]
  );

  // The visible brands set follows from the stores in scope. We also
  // continue to honour user.brandIds for any rows without a store_id yet
  // (transitional: pre-Stage-5 inserts had brand_id only).
  const visibleBrands = useMemo(() => {
    const brandIdsInScope = new Set(visibleStores.map(s => s.brandId));
    return (brands || []).filter(b => brandIdsInScope.has(b.id) || isHqOrAbove(user.role) || user.brandIds?.includes(b.id));
  }, [brands, visibleStores, user.role, user.brandIds]);

  const [selStore, setSelStore] = useState("all");
  const [expandedId, setExpandedId] = useState(null);

  // If the chosen store falls out of scope (e.g. ownership filter narrows
  // and removes it), reset to "all" so we don't show a stale empty state.
  useEffect(() => {
    if (selStore !== "all" && !visibleStores.some(s => s.id === selStore)) {
      setSelStore("all");
    }
  }, [visibleStores, selStore]);

  // Set of store ids in active scope — used for "all my stores" matching.
  const inScopeStoreIds = useMemo(() => new Set(visibleStores.map(s => s.id)), [visibleStores]);
  const visibleBrandIds = useMemo(() => new Set(visibleStores.map(s => s.brandId)), [visibleStores]);

  // Active assignments today, scoped to either the chosen store or all stores
  // currently in scope. Backward-compat: a row with no storeId falls back to
  // a brandId match against the brands implied by visibleStores.
  const inScope = (a) => {
    if (a.storeId) {
      if (selStore === "all") return inScopeStoreIds.has(a.storeId);
      return a.storeId === selStore;
    }
    // Legacy row without storeId: fall back to brand match. Only relevant
    // until Stage 6 makes store_id NOT NULL.
    return visibleBrandIds.has(a.brandId);
  };
  const bAssigns = (assignments || []).filter(a => inScope(a) && isActiveToday(a));
  const overdue = bAssigns.filter(isOverdue);

  const getTaskName = (type, taskId) => {
    if (type === "checklist") return checklists.find(c => c.id === taskId)?.name || taskId;
    if (type === "temp") return tempUnits.find(t => t.id === taskId)?.name || taskId;
    if (type === "cleaning") return cleaningTasks.find(t => t.id === taskId)?.name || taskId;
    return "Delivery check";
  };
  const typeIcons = { checklist: "📋", cleaning: "🧹", temp: "🌡️", delivery: "🚚" };

  // Empty-state when the user has no assigned stores (only managers/staff
  // can hit this — owner/HQ always have all stores in scope).
  if (allVisibleStores.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <ClipboardList size={32} className="mb-3 text-slate-700"/>
          <div className="text-sm font-semibold">No stores assigned to your account.</div>
          <div className="text-xs text-slate-600 mt-1">Ask an admin to assign you to one or more stores.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <StoreScopeDropdown stores={visibleStores} brands={brands} value={selStore} onChange={setSelStore} className="w-64"/>
      </div>
      {overdue.length > 0 && <div className="bg-red-950/20 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3"><AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5"/><div className="text-sm font-bold text-red-400">{overdue.length} overdue — action required</div></div>}
      {bAssigns.length === 0 && <div className="flex flex-col items-center justify-center py-16 text-slate-500"><ClipboardList size={32} className="mb-3 text-slate-700"/><div className="text-sm font-semibold">No assignments {selStore === "all" ? "across your stores" : "for this store"} today</div></div>}
      <div className="space-y-3">
        {bAssigns.map(a => {
          const od = isOverdue(a); const taskName = getTaskName(a.type, a.taskId);
          const cl = a.type === "checklist" ? checklists.find(c => c.id === a.taskId) : null;
          const doneToday = auditTrail.some(t => t.brandId === a.brandId && t.date === getTodayStr() && t.detail?.includes(taskName));
          // Stable key — includes storeId when present so per-store checklist
          // state doesn't collide across stores sharing a brand.
          const stateKey = `${a.storeId || a.brandId}||${a.taskId}||${getTodayStr()}`;
          const clState = checklistStates[stateKey] || {};
          const totalItems = cl?.items?.length || 0;
          const doneItems = totalItems ? Object.values(clState).filter(Boolean).length : 0;
          const pct = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;
          const isExp = expandedId === a.id;
          // Show the store name on each task when the dropdown is on "all" so
          // it's clear which store each item belongs to.
          const storeBadge = selStore === "all" && a.storeId
            ? (stores.find(s => s.id === a.storeId)?.shortName || null)
            : null;
          return (
            <div key={a.id} className={`rounded-2xl border overflow-hidden ${od ? "border-red-500/30 bg-red-950/20/10" : doneToday ? "border-emerald-500/30 bg-emerald-950/20/10" : "border-slate-700 bg-slate-900"}`}>
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-base flex-shrink-0">{typeIcons[a.type] || "📋"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-sm font-bold text-white">{taskName}{storeBadge && <span className="ml-2 text-xs font-normal text-slate-500">· {storeBadge}</span>}</div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {od && <Badge label="OVERDUE" color="red"/>}
                        {doneToday && <Badge label="✓ Complete" color="emerald"/>}
                        {cl && <button onClick={() => setExpandedId(isExp ? null : a.id)} className="text-xs text-indigo-400 hover:text-indigo-300">{isExp ? "Collapse" : "Open"}</button>}
                        {!doneToday && <button onClick={() => onSignOff(a, taskName)} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors">Sign off</button>}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Window: {a.winStart}–{a.winEnd}{a.role ? ` · 🎭 ${a.role}` : ""}</div>
                    {cl && totalItems > 0 && <div className="mt-2"><div className="flex justify-between text-xs text-slate-600 mb-1"><span>{doneItems}/{totalItems} items</span><span>{pct}%</span></div><div className="h-1.5 bg-slate-800 rounded-full"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }}/></div></div>}
                  </div>
                </div>
              </div>
              {cl && isExp && (
                <div className="border-t border-slate-700 p-4 space-y-2">
                  {cl.items.map(item => {
                    const checked = !!clState[item.id];
                    return (
                      <div key={item.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${checked ? "bg-emerald-950/20 border-emerald-500/20" : "bg-slate-800/40 border-slate-800/60"}`}>
                        <button onClick={() => onChecklistItemToggle(stateKey, item.id, !checked)} className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border mt-0.5 transition-colors ${checked ? "bg-emerald-600 border-emerald-500" : "border-slate-600 hover:border-emerald-500"}`}>{checked && <Check size={11} className="text-white"/>}</button>
                        <div className="flex-1 min-w-0"><div className={`text-sm ${checked ? "line-through text-slate-500" : "text-slate-200"}`}>{item.text}</div>{item.guide && <div className="text-xs text-slate-500 mt-0.5">{item.guide}</div>}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Temperature Log ──────────────────────────────────────────────────────────
function TemperatureLog({ brands, stores, visibleStoreIds, tempUnits, tempLogs, onLog }) {
  const { user } = useAuth();

  const allVisibleStores = useMemo(
    () => (stores || []).filter(s => visibleStoreIds?.includes(s.id) && !s.archivedAt),
    [stores, visibleStoreIds]
  );
  const [ownership, setOwnership] = useState(isHqOrAbove(user.role) ? "owned" : "all");
  const visibleStores = useMemo(
    () => applyOwnershipFilter(allVisibleStores, ownership, user.role),
    [allVisibleStores, ownership, user.role]
  );
  const [selStore, setSelStore] = useState("all");

  // Reset selStore if it falls out of scope after ownership change
  useEffect(() => {
    if (selStore !== "all" && !visibleStores.some(s => s.id === selStore)) {
      setSelStore("all");
    }
  }, [visibleStores, selStore]);

  const inScopeStoreIds = useMemo(() => new Set(visibleStores.map(s => s.id)), [visibleStores]);
  const visibleBrandIds = useMemo(() => new Set(visibleStores.map(s => s.brandId)), [visibleStores]);

  const inScope = (row) => {
    if (row.storeId) {
      if (selStore === "all") return inScopeStoreIds.has(row.storeId);
      return row.storeId === selStore;
    }
    return visibleBrandIds.has(row.brandId);
  };

  const scopedUnits = (tempUnits || []).filter(inScope);
  const scopedLogs  = (tempLogs  || []).filter(l => inScope(l) && l.date === getTodayStr());
  const getLatest = unitId => scopedLogs.filter(l => l.unitId === unitId).sort((a,b) => b.time.localeCompare(a.time))[0];

  // For inserts: when "all", default to first store with units; otherwise use selected
  const writeStoreId = selStore !== "all"
    ? selStore
    : (scopedUnits[0]?.storeId || visibleStores[0]?.id || null);
  const writeBrandId = writeStoreId
    ? (visibleStores.find(s => s.id === writeStoreId)?.brandId || null)
    : null;

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ unitId: "", value: "", notes: "", time: nowTimeStr() });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  if (allVisibleStores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <Thermometer size={32} className="mb-3 text-slate-700"/>
        <div className="text-sm font-semibold">No stores assigned to your account.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StoreScopeDropdown stores={visibleStores} brands={brands} value={selStore} onChange={setSelStore} className="w-64"/>
        </div>
        <button onClick={() => { setForm({ unitId: scopedUnits[0]?.id || "", value: "", notes: "", time: nowTimeStr() }); setShowForm(true); }} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"><Plus size={14}/> Log Reading</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {scopedUnits.map(unit => {
          const latest = getLatest(unit.id);
          const ok = latest ? checkTemp(unit, latest.value) : null;
          const storeBadge = selStore === "all" && unit.storeId
            ? (stores.find(s => s.id === unit.storeId)?.shortName || null)
            : null;
          return (
            <div key={unit.id} className={`rounded-2xl border p-4 ${latest && !ok ? "bg-red-950/20 border-red-500/30" : latest && ok ? "bg-emerald-950/20 border-emerald-500/30" : "bg-slate-900 border-slate-700"}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2"><span className="text-lg">{TEMP_ICON[unit.type] || "🌡️"}</span><div><div className="text-sm font-bold text-white">{unit.name}{storeBadge && <span className="ml-2 text-xs font-normal text-slate-500">· {storeBadge}</span>}</div><div className="text-xs text-slate-500">{tempLimitText(unit)}</div></div></div>
                {latest && (ok ? <Badge label="✓ OK" color="green"/> : <Badge label="⚠ BREACH" color="red"/>)}
              </div>
              {latest ? <div className="text-2xl font-bold mb-1" style={{ color: ok ? "#10b981" : "#ef4444" }}>{latest.value}°C</div> : <div className="text-xl font-bold text-slate-600 mb-1">No reading</div>}
              <div className="text-xs text-slate-500">{latest ? `Logged ${latest.time} by ${latest.loggedBy}` : "Not logged today"}</div>
            </div>
          );
        })}
        {scopedUnits.length === 0 && <div className="col-span-3 flex flex-col items-center justify-center py-12 text-slate-500"><Thermometer size={28} className="mb-2 text-slate-700"/><div className="text-sm">No temperature units {selStore === "all" ? "across your stores" : "for this store"}</div><div className="text-xs mt-1">Add units in Ops Settings</div></div>}
      </div>
      {scopedLogs.length > 0 && <AnalysisBlock title="HACCP Log — Today"><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-slate-700">{["Unit","Time","Reading","Limit","By","Status"].map(h => <th key={h} className="px-3 py-2 text-left text-slate-600 font-semibold">{h}</th>)}</tr></thead><tbody>{[...scopedLogs].sort((a,b) => b.time.localeCompare(a.time)).map(log => { const unit = tempUnits.find(u => u.id === log.unitId); const ok = unit ? checkTemp(unit, log.value) : true; return <tr key={log.id} className="border-b border-slate-800/60"><td className="px-3 py-2 text-slate-700">{unit?.name || log.unitId}</td><td className="px-3 py-2 text-slate-600 font-mono">{log.time}</td><td className="px-3 py-2"><span className={`font-bold font-mono ${ok ? "text-emerald-400" : "text-red-400"}`}>{log.value}°C</span></td><td className="px-3 py-2 text-slate-500">{unit ? tempLimitText(unit) : "—"}</td><td className="px-3 py-2 text-slate-600">{log.loggedBy}</td><td className="px-3 py-2">{ok ? <Badge label="✓ OK" color="green"/> : <Badge label="⚠ Breach" color="red"/>}</td></tr>; })}</tbody></table></div></AnalysisBlock>}
      {showForm && (
        <Modal title="Log Temperature Reading" onClose={() => setShowForm(false)} footer={<><button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">Cancel</button><button onClick={() => { if (!form.unitId || form.value === "") return; const unit = scopedUnits.find(u => u.id === form.unitId); const breach = unit ? !checkTemp(unit, form.value) : false; onLog({ id: `tl-${Date.now()}`, brandId: unit?.brandId || writeBrandId, storeId: unit?.storeId || writeStoreId, unitId: form.unitId, value: parseFloat(form.value), isBreach: breach, notes: form.notes, time: form.time, date: getTodayStr(), loggedBy: user.name || "Manager" }); setShowForm(false); }} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500">Save Reading</button></>}>
          <div className="space-y-4">
            <div><label className={labelCls}>Unit</label><select value={form.unitId} onChange={e => set("unitId", e.target.value)} className={inputCls}>{scopedUnits.map(u => { const sn = stores?.find(s => s.id === u.storeId)?.shortName; return <option key={u.id} value={u.id}>{u.name}{sn ? ` · ${sn}` : ""} ({u.type})</option>; })}</select></div>
            <div className="grid grid-cols-2 gap-4"><div><label className={labelCls}>Temperature (°C)</label><input type="number" step="0.1" value={form.value} onChange={e => set("value", e.target.value)} placeholder="e.g. 4.5" className={inputCls}/></div><div><label className={labelCls}>Time</label><input type="time" value={form.time} onChange={e => set("time", e.target.value)} className={inputCls}/></div></div>
            {form.unitId && form.value !== "" && (() => { const unit = scopedUnits.find(u => u.id === form.unitId); const ok = unit ? checkTemp(unit, form.value) : true; return <div className={`rounded-xl border p-3 ${ok ? "bg-emerald-950/20 border-emerald-500/30" : "bg-red-950/20 border-red-500/30"}`}><div className={`text-sm font-bold ${ok ? "text-emerald-400" : "text-red-400"}`}>{ok ? "✓ Within safe range" : "⚠ BREACH — corrective action required"}</div>{unit && <div className="text-xs text-slate-600 mt-0.5">Limit: {tempLimitText(unit)}</div>}</div>; })()}
            <div><label className={labelCls}>Notes</label><input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any observations…" className={inputCls}/></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Deliveries View ──────────────────────────────────────────────────────────
function DeliveriesView({ brands, stores, visibleStoreIds, deliveries, onAdd }) {
  const { user } = useAuth();

  const allVisibleStores = useMemo(
    () => (stores || []).filter(s => visibleStoreIds?.includes(s.id) && !s.archivedAt),
    [stores, visibleStoreIds]
  );
  const [ownership, setOwnership] = useState(isHqOrAbove(user.role) ? "owned" : "all");
  const visibleStores = useMemo(
    () => applyOwnershipFilter(allVisibleStores, ownership, user.role),
    [allVisibleStores, ownership, user.role]
  );
  const [selStore, setSelStore] = useState("all");

  useEffect(() => {
    if (selStore !== "all" && !visibleStores.some(s => s.id === selStore)) {
      setSelStore("all");
    }
  }, [visibleStores, selStore]);

  const inScopeStoreIds = useMemo(() => new Set(visibleStores.map(s => s.id)), [visibleStores]);
  const visibleBrandIds = useMemo(() => new Set(visibleStores.map(s => s.brandId)), [visibleStores]);

  const inScope = (d) => {
    if (d.storeId) {
      if (selStore === "all") return inScopeStoreIds.has(d.storeId);
      return d.storeId === selStore;
    }
    return visibleBrandIds.has(d.brandId);
  };

  const scopedDeliveries = (deliveries || [])
    .filter(inScope)
    .sort((a, b) => b.timestamp?.localeCompare(a.timestamp || "") || 0);

  // For new inserts: if a specific store is selected use it; otherwise default
  // to the first store in the user's filtered list.
  const writeStoreId = selStore !== "all" ? selStore : (visibleStores[0]?.id || null);
  const writeStore   = writeStoreId ? visibleStores.find(s => s.id === writeStoreId) : null;
  const writeBrandId = writeStore?.brandId || null;

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ supplier: "", items: "", temp: "", tempOk: "yes", condition: "good", driver: "", notes: "", time: nowTimeStr() });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  if (allVisibleStores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <Truck size={32} className="mb-3 text-slate-700"/>
        <div className="text-sm font-semibold">No stores assigned to your account.</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StoreScopeDropdown stores={visibleStores} brands={brands} value={selStore} onChange={setSelStore} className="w-64"/>
        </div>
        <button onClick={() => { setForm({ supplier: "", items: "", temp: "", tempOk: "yes", condition: "good", driver: "", notes: "", time: nowTimeStr() }); setShowForm(true); }} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"><Plus size={14}/> Log Delivery</button>
      </div>
      {scopedDeliveries.length === 0 && <div className="flex flex-col items-center justify-center py-16 text-slate-500"><Truck size={32} className="mb-3 text-slate-700"/><div className="text-sm font-semibold">No deliveries logged {selStore === "all" ? "across your stores" : "for this store"}</div></div>}
      <div className="space-y-3">{scopedDeliveries.map(d => {
        const storeBadge = selStore === "all" && d.storeId
          ? (stores.find(s => s.id === d.storeId)?.shortName || null)
          : null;
        return <div key={d.id} className="bg-slate-900 border border-slate-700 rounded-2xl p-4"><div className="text-sm font-bold text-white">{d.supplier}{storeBadge && <span className="ml-2 text-xs font-normal text-slate-500">· {storeBadge}</span>}</div><div className="text-xs text-slate-600 mt-0.5">{d.items}</div><div className="flex gap-2 mt-2 flex-wrap"><Badge label={d.date} color="slate"/><Badge label={d.time} color="slate"/>{d.temp && <Badge label={`${d.temp}°C`} color={d.tempOk === "yes" ? "green" : "red"}/>}<Badge label={d.condition === "good" ? "✓ Good" : `⚠ ${d.condition}`} color={d.condition === "good" ? "green" : "amber"}/><Badge label={`By ${d.loggedBy}`} color="slate"/></div>{d.notes && <div className="text-xs text-slate-500 mt-1.5 italic">{d.notes}</div>}</div>;
      })}</div>
      {showForm && (
        <Modal title={`Log Delivery${writeStore ? ` — ${writeStore.shortName}` : ""}`} onClose={() => setShowForm(false)} footer={<><button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">Cancel</button><button onClick={() => { if (!form.supplier || !writeStoreId) return; onAdd({ id: `del-${Date.now()}`, brandId: writeBrandId, storeId: writeStoreId, ...form, date: getTodayStr(), timestamp: new Date().toISOString(), loggedBy: user.name || "Manager" }); setShowForm(false); }} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500">Save</button></>}>
          <div className="space-y-4">
            {selStore === "all" && visibleStores.length > 1 && <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 text-xs text-amber-300">📍 Logging for <strong>{writeStore?.shortName || "—"}</strong>. Switch the store filter above to log for a different store.</div>}
            <div><label className={labelCls}>Supplier *</label><input value={form.supplier} onChange={e => set("supplier", e.target.value)} className={inputCls} placeholder="e.g. Fresh Direct"/></div>
            <div><label className={labelCls}>Items delivered</label><textarea value={form.items} onChange={e => set("items", e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="List items…"/></div>
            <div className="grid grid-cols-2 gap-4"><div><label className={labelCls}>Delivery time</label><input type="time" value={form.time} onChange={e => set("time", e.target.value)} className={inputCls}/></div><div><label className={labelCls}>Temp check (°C)</label><input type="number" step="0.1" value={form.temp} onChange={e => set("temp", e.target.value)} className={inputCls} placeholder="Optional"/></div></div>
            <div className="grid grid-cols-2 gap-4"><div><label className={labelCls}>Temp acceptable?</label><select value={form.tempOk} onChange={e => set("tempOk", e.target.value)} className={inputCls}><option value="yes">Yes</option><option value="no">No — rejected</option></select></div><div><label className={labelCls}>Condition</label><select value={form.condition} onChange={e => set("condition", e.target.value)} className={inputCls}><option value="good">Good</option><option value="damaged">Damaged</option><option value="short">Short delivery</option><option value="rejected">Rejected</option></select></div></div>
            <div><label className={labelCls}>Driver name</label><input value={form.driver} onChange={e => set("driver", e.target.value)} className={inputCls} placeholder="Optional"/></div>
            <div><label className={labelCls}>Notes</label><textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="Any issues…"/></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Assignments View ─────────────────────────────────────────────────────────
function AssignmentFormModal({ brands, stores = [], checklists, tempUnits, cleaningTasks, item, onSave, onClose }) {
  const allowedStores = useMemo(
    () => (stores || []).filter(s => !s.archivedAt && s.ownershipModel === "owned"),
    [stores]
  );

  const [form, setForm] = useState({
    storeId: item?.storeId || allowedStores[0]?.id || "",
    brandId: item?.brandId || "",   // derived from store on save
    type: item?.type || "checklist",
    taskId: item?.taskId || "",
    role: item?.role || "",
    personId: item?.personId || "",
    freq: item?.freq || "daily",
    weekday: item?.weekday || "Monday",
    date: item?.date || "",
    customDays: item?.customDays || [],
    winStart: item?.winStart || "08:00",
    winEnd: item?.winEnd || "10:00",
    priority: item?.priority || "normal",
    notes: item?.notes || "",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const selectedStore = allowedStores.find(s => s.id === form.storeId);

  // Filter equipment/tasks to the selected store. Checklists + cleaning tasks
  // are currently chain-wide (no store_id yet) — show all of them. Temp units
  // now have store_id — filter to the picked store (with fallback for legacy
  // brand-only rows).
  const taskOptions = () => {
    if (form.type === "checklist") return checklists.map(c => ({ id: c.id, label: `${c.name} (${c.shift})` }));
    if (form.type === "temp") {
      return tempUnits
        .filter(t => {
          if (t.storeId) return t.storeId === form.storeId;
          // Legacy temp unit (no storeId yet): fall back to brand match
          return !t.brandId || t.brandId === selectedStore?.brandId;
        })
        .map(t => ({ id: t.id, label: t.name }));
    }
    if (form.type === "cleaning") return cleaningTasks.map(t => ({ id: t.id, label: `${t.name} — ${t.area}` }));
    return [{ id: "delivery", label: "Delivery check" }];
  };

  const showBrandPrefix = new Set(allowedStores.map(s => s.brandId)).size > 1;
  const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  const handleSave = () => {
    if (!form.taskId || !form.role) return;
    if (!form.storeId) { alert("Please pick a store."); return; }
    onSave({
      id: item?.id || `as-${Date.now()}`,
      ...form,
      brandId: selectedStore?.brandId || form.brandId,
    });
  };

  return (
    <Modal title={item ? "Edit Assignment" : "New Assignment"} onClose={onClose} maxW="max-w-xl"
      footer={<><button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">Cancel</button><button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500">{item ? "Save" : "Create"}</button></>}>
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Store *</label>
          {allowedStores.length === 0 ? (
            <div className="text-xs text-amber-400 bg-amber-950/30 border border-amber-500/30 rounded-lg px-3 py-2">No owned stores available.</div>
          ) : (
            <select value={form.storeId} onChange={e => { set("storeId", e.target.value); set("taskId", ""); }} className={inputCls}>
              <option value="">— Pick a store —</option>
              {allowedStores.map(s => {
                const b = brands.find(br => br.id === s.brandId);
                return <option key={s.id} value={s.id}>{showBrandPrefix && b ? `${b.name} · ` : ""}{s.shortName || s.name}</option>;
              })}
            </select>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4"><div><label className={labelCls}>Task Type</label><select value={form.type} onChange={e => { set("type", e.target.value); set("taskId", ""); }} className={inputCls}><option value="checklist">Checklist</option><option value="cleaning">Cleaning</option><option value="temp">Temperature</option><option value="delivery">Delivery</option></select></div><div><label className={labelCls}>Task</label><select value={form.taskId} onChange={e => set("taskId", e.target.value)} className={inputCls}><option value="">— Select —</option>{taskOptions().map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div></div>
        <div className="grid grid-cols-2 gap-4"><div><label className={labelCls}>Role *</label><input value={form.role} onChange={e => set("role", e.target.value)} placeholder="e.g. Shift Leader" className={inputCls}/></div><div><label className={labelCls}>Priority</label><select value={form.priority} onChange={e => set("priority", e.target.value)} className={inputCls}><option value="critical">Critical</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></div></div>
        <div><label className={labelCls}>Frequency</label><select value={form.freq} onChange={e => set("freq", e.target.value)} className={inputCls}><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekends">Weekends</option><option value="weekly">Weekly</option><option value="once">One-off</option><option value="custom">Custom days</option></select></div>
        {form.freq === "weekly" && <div><label className={labelCls}>Day of week</label><select value={form.weekday} onChange={e => set("weekday", e.target.value)} className={inputCls}>{["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(d => <option key={d}>{d}</option>)}</select></div>}
        {form.freq === "once" && <div><label className={labelCls}>Date</label><input type="date" value={form.date} onChange={e => set("date", e.target.value)} className={inputCls}/></div>}
        {form.freq === "custom" && <div><label className={labelCls}>Custom days</label><div className="flex gap-2 flex-wrap">{days.map(d => <button key={d} onClick={() => set("customDays", form.customDays.includes(d) ? form.customDays.filter(x => x !== d) : [...form.customDays, d])} className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${form.customDays.includes(d) ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-slate-600"}`}>{d}</button>)}</div></div>}
        <div className="grid grid-cols-2 gap-4"><div><label className={labelCls}>Window Start</label><input type="time" value={form.winStart} onChange={e => set("winStart", e.target.value)} className={inputCls}/></div><div><label className={labelCls}>Window End</label><input type="time" value={form.winEnd} onChange={e => set("winEnd", e.target.value)} className={inputCls}/></div></div>
        <div><label className={labelCls}>Notes</label><textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="Any instructions…"/></div>
      </div>
    </Modal>
  );
}

function AssignmentsView({ brands, stores, assignments, checklists, tempUnits, cleaningTasks, opsTeam, auditTrail, onAdd, onEdit, onDelete }) {
  const { user } = useAuth();
  const vb = brands.filter(b => isHqOrAbove(user.role) || user.brandIds.includes(b.id));
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const getTaskName = (type, taskId) => {
    if (type === "checklist") return checklists.find(c => c.id === taskId)?.name || taskId;
    if (type === "temp") return tempUnits.find(t => t.id === taskId)?.name || taskId;
    if (type === "cleaning") return cleaningTasks.find(t => t.id === taskId)?.name || taskId;
    return "Delivery check";
  };
  const visible = assignments.filter(a => {
    if (!vb.some(b => b.id === a.brandId)) return false;
    if (filter === "overdue") return isActiveToday(a) && isOverdue(a);
    if (filter !== "all") return a.type === filter;
    return true;
  });
  const overdueCnt = assignments.filter(a => vb.some(b => b.id === a.brandId) && isActiveToday(a) && isOverdue(a)).length;
  const tabs = [{ key: "all", label: "All" }, { key: "checklist", label: "Checklists" }, { key: "cleaning", label: "Cleaning" }, { key: "temp", label: "Temperature" }, { key: "delivery", label: "Deliveries" }, { key: "overdue", label: `⚠ Overdue${overdueCnt ? ` (${overdueCnt})` : ""}` }];
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SelectDropdown value={filter} onChange={setFilter} className="w-44">
          {tabs.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </SelectDropdown>
        {/* Issue 1: Managers can CREATE assignments for their stores; only
            HQ/owner can edit or delete existing ones. The store picker in
            AssignmentFormModal already limits options to owned stores for
            managers, so they can't create assignments at stores they don't
            manage. */}
        <button onClick={() => { setEditItem(null); setShowForm(true); }} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"><Plus size={14}/> New Assignment</button>
      </div>
      {visible.length === 0 && <div className="flex flex-col items-center justify-center py-16 text-slate-500"><ClipboardList size={32} className="mb-3 text-slate-700"/><div className="text-sm">No assignments found</div></div>}
      <div className="space-y-3">{visible.map(a => {
        const brand = brands.find(b => b.id === a.brandId);
        const od = isActiveToday(a) && isOverdue(a);
        const done = auditTrail.some(t => t.date === getTodayStr() && t.brandId === a.brandId && t.detail?.includes(getTaskName(a.type, a.taskId)));
        return (
          <div key={a.id} className={`rounded-2xl border p-4 ${od ? "bg-red-950/20 border-red-500/30" : "bg-slate-900 border-slate-700"}`}>
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${od ? "bg-red-500/25" : "bg-slate-800"}`}>{{ checklist: "📋", cleaning: "🧹", temp: "🌡️", delivery: "🚚" }[a.type] || "📋"}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div><div className="text-sm font-bold text-white">{getTaskName(a.type, a.taskId)}</div><div className="flex items-center gap-2 mt-1 flex-wrap">{brand && <span className="text-xs text-slate-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{background:brand.color}}/>{brand.name}</span>}<span className="text-xs text-slate-500">Window: {a.winStart}–{a.winEnd}</span>{od && <Badge label="⚠ OVERDUE" color="red"/>}{done && <Badge label="✓ Done today" color="emerald"/>}</div><div className="flex gap-2 mt-1.5 flex-wrap">{a.role && <Badge label={`🎭 ${a.role}`} color="violet"/>}<Badge label={a.freq} color="slate"/><Badge label={a.priority} color={a.priority==="critical"?"red":a.priority==="high"?"amber":"slate"}/></div></div>
                  {isHqOrAbove(user.role) && <div className="flex gap-1.5 flex-shrink-0"><button onClick={() => { setEditItem(a); setShowForm(true); }} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"><Edit size={13}/></button><button onClick={() => setDeleteId(a.id)} className="p-1.5 rounded-xl bg-slate-800 text-slate-600 hover:text-red-400 hover:bg-red-950/20"><Trash2 size={13}/></button></div>}
                </div>
              </div>
            </div>
          </div>
        );
      })}</div>
      {showForm && <AssignmentFormModal brands={vb} stores={stores} checklists={checklists} tempUnits={tempUnits} cleaningTasks={cleaningTasks} item={editItem} onSave={item => { editItem ? onEdit(item) : onAdd(item); setShowForm(false); }} onClose={() => setShowForm(false)}/>}
      {deleteId && <OpsConfirmModal message="Delete this assignment?" onConfirm={() => onDelete(deleteId)} onClose={() => setDeleteId(null)}/>}
    </div>
  );
}

// ─── Hiring View ──────────────────────────────────────────────────────────────
// Slice 1 of the staff onboarding pipeline. Lets managers + HQ + owner:
//   - Capture candidates manually (walk-ins, referrals, phone enquiries)
//   - Move them through the workflow: applied → reviewing → in_training → hired
//   - Reject/withdraw at any stage
//   - See timeline of status changes per candidate
//
// Phases 2+ will add: public application form, document uploads, magic-link
// trainee/employee portal, per-employee profile, salary/asset/disciplinary
// records. The schema is forward-compatible — slice 1 just doesn't expose
// those fields yet.
//
// Visibility rules:
//   - Managers see only applications at their stores
//   - HQ + owner see everything (with the store-scope filter dropdown to focus)
//
// The CRUD is intentionally permissive — slice 1 doesn't gate by ownership
// or block transitions. Managers + HQ + owner can all do all transitions.
// The application's store_id determines which store it belongs to, and
// scope filtering handles "what should I see".

const APPLICATION_STATUSES = [
  { key: "applied",            label: "Applied",          color: "slate"   },
  { key: "manager_reviewing",  label: "Reviewing",        color: "amber"   },
  { key: "in_training",        label: "In Training",      color: "indigo"  },
  { key: "hired",              label: "Hired",            color: "green"   },
  { key: "rejected",           label: "Rejected",         color: "red"     },
  { key: "withdrawn",          label: "Withdrawn",        color: "slate"   },
];

// Valid next-states from each state. Drives the "Move to..." buttons.
// Terminal states (hired, rejected, withdrawn) have no forward transitions.
const APPLICATION_TRANSITIONS = {
  applied:           ["manager_reviewing", "rejected", "withdrawn"],
  manager_reviewing: ["in_training", "rejected", "withdrawn"],
  in_training:       ["hired", "rejected", "withdrawn"],
  hired:             [],
  rejected:          [],
  withdrawn:         [],
};

// UK-specific legal status options for the application form. Hardcoded per
// product spec — these are sufficient for current UK hospitality hiring.
// If the list needs to change (e.g. T2 Visa rebranded to Skilled Worker),
// edit this constant and redeploy. The values are stored as strings in
// job_applications.legal_status so we don't need a DB migration on changes.
const LEGAL_STATUS_OPTIONS = [
  { value: "international_student",      label: "International student" },
  { value: "post_graduate_work_permit",  label: "Post graduate work permit" },
  { value: "british",                    label: "British citizen" },
  { value: "eu_national",                label: "EU national (settled/pre-settled)" },
  { value: "t2_work_permit",             label: "T2 work permit" },
];

// Returns true if a YYYY-MM-DD date string represents someone under 18.
// Used at submission time to set the is_minor flag (UK employment law has
// restricted hours for 16-17 year olds; under-16 employment is illegal in
// hospitality). Returns false for invalid/missing dates — the form's
// required validation handles the missing case.
function isUnder18(dobString) {
  if (!dobString) return false;
  const dob = new Date(dobString);
  if (isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age < 18;
}

// Slice 6 follow-up — pay type metadata. Used by the Job Assignment tab,
// edit modal, and any display that needs to render an employee's pay.
//
// `unitLabel` is what shows in the rate input ("£/hour", "£/month").
// `suffix` shows when displaying a current rate ("£15.00/hour", "£3,000/month").
// Amounts are still stored in the hourly_rate column regardless of type;
// the column is "amount in whatever unit pay_type says".
const PAY_TYPE_OPTIONS = [
  { value: "hourly",  label: "Hourly",          unitLabel: "£/hour",  suffix: "/hour",  step: "0.25", placeholder: "e.g. 12.50" },
  { value: "monthly", label: "Monthly salary",  unitLabel: "£/month", suffix: "/month", step: "50",   placeholder: "e.g. 2500"  },
  { value: "annual",  label: "Annual salary",   unitLabel: "£/year",  suffix: "/year",  step: "500",  placeholder: "e.g. 32000" },
];

function getPayTypeMeta(payType) {
  return PAY_TYPE_OPTIONS.find(o => o.value === payType) || PAY_TYPE_OPTIONS[0];
}

// Format an employee's pay for display. e.g. £12.50/hour, £2,500/month, —
function formatPayDisplay(amount, payType) {
  if (!amount || amount <= 0) return "—";
  const meta = getPayTypeMeta(payType);
  // Hourly shows 2 decimals; salary uses thousands separator
  const formatted = payType === "hourly"
    ? `£${amount.toFixed(2)}`
    : `£${amount.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
  return `${formatted}${meta.suffix}`;
}

// For schedule cost calculations: returns a per-hour cost figure regardless
// of how the employee is paid. Hourly = the rate directly. Monthly =
// approximate per-hour cost assuming UK standard ~173 hours/month (40h × 52w / 12m).
// Annual = same but ÷ 12 first.
//
// IMPORTANT: this is for ESTIMATION only. Actual labour cost for a salaried
// employee is fixed regardless of hours; this approximation is what they
// COST PER HOUR ON AVERAGE so the schedule view's "cost" totals remain
// useful. UI should be clear that for salaried staff this is an estimate.
const HOURS_PER_MONTH_APPROX = 173;  // UK standard FTE
function effectiveHourlyRate(member) {
  if (!member) return 0;
  const amount = member.hourlyRate || 0;
  if (amount <= 0) return 0;
  switch (member.payType) {
    case "monthly": return amount / HOURS_PER_MONTH_APPROX;
    case "annual":  return amount / 12 / HOURS_PER_MONTH_APPROX;
    case "hourly":
    default:        return amount;
  }
}

// Slice 6 follow-up — common UK hospitality certifications.
// Q3 = (a): hardcoded list. Manager picks from these; the cert_type is the
// stable identifier in the DB, the label is what's shown.
//
// Expanding the list later doesn't break old records — each saved
// certification snapshots its `name` so even if we rename or remove types,
// historical entries keep displaying correctly.
//
// `defaultValidityMonths` is an optional default — when manager picks a
// type, we auto-fill the expires_date to obtained_date + this many months.
// They can override before saving.
const CERTIFICATION_TYPES = [
  { value: "food_hygiene_lvl_1", label: "Food Hygiene Level 1",          defaultValidityMonths: 36 },
  { value: "food_hygiene_lvl_2", label: "Food Hygiene Level 2",          defaultValidityMonths: 36 },
  { value: "food_hygiene_lvl_3", label: "Food Hygiene Level 3",          defaultValidityMonths: 36 },
  { value: "allergens",          label: "Allergens Training",            defaultValidityMonths: 36 },
  { value: "first_aid_work",     label: "First Aid at Work",             defaultValidityMonths: 36 },
  { value: "first_aid_emerg",    label: "Emergency First Aid at Work",   defaultValidityMonths: 36 },
  { value: "personal_license",   label: "Personal License (Alcohol)",    defaultValidityMonths: null  /* generally lifetime in UK */ },
  { value: "manual_handling",    label: "Manual Handling",               defaultValidityMonths: 12 },
  { value: "fire_safety",        label: "Fire Safety / Fire Marshal",    defaultValidityMonths: 12 },
  { value: "health_safety",      label: "Health & Safety General",       defaultValidityMonths: 36 },
  { value: "haccp",              label: "HACCP",                         defaultValidityMonths: 36 },
  { value: "other",              label: "Other (specify in name)",       defaultValidityMonths: null },
];

function getCertTypeMeta(typeValue) {
  return CERTIFICATION_TYPES.find(t => t.value === typeValue) || CERTIFICATION_TYPES[CERTIFICATION_TYPES.length - 1];
}

// Returns "valid" / "expiring" (within 30 days) / "expired" / "no_expiry"
// for a certification. Drives the color badge in the cert list.
function getCertExpiryStatus(expiresDate) {
  if (!expiresDate) return "no_expiry";
  const exp = new Date(expiresDate);
  if (isNaN(exp.getTime())) return "no_expiry";
  const now = new Date();
  const daysUntil = Math.floor((exp - now) / (1000 * 60 * 60 * 24));
  if (daysUntil < 0) return "expired";
  if (daysUntil <= 30) return "expiring";
  return "valid";
}


function HiringView({
  brands, stores, storeRoles, storeDepartments, visibleStoreIds,
  applications, opsTeam, currentUser,
  onAdd, onUpdate, onSetStatus, onDelete,
  onAddOpsTeam, onOpenEmployeeProfile,
}) {
  const [showForm, setShowForm]   = useState(false);
  const [editItem, setEditItem]   = useState(null);
  const [deleteId, setDeleteId]   = useState(null);
  const [storeScope, setStoreScope] = useState("all");   // "all" or a specific store id
  const [statusFilter, setStatusFilter] = useState("active");   // "active" (non-terminal) | "all" | specific status
  const [expandedId, setExpandedId] = useState(null);
  const [statusHistory, setStatusHistory] = useState({});   // { applicationId: [...] }

  // Visible applications: filtered by user scope + UI filters.
  // For managers, only their stores count. For HQ/owner, all visible stores.
  // "Show archived" toggle — when off (default), archived applications are
  // hidden everywhere except the explicit "Archived" filter. Slice 5
  // archives applications on hire so the active Hiring view stays clean.
  const [showArchived, setShowArchived] = useState(false);

  // Slice 6 — manager-side filtering UI state.
  //
  //   searchRaw     : raw text the user has typed (renders the input)
  //   searchTerm    : debounced lowercase version used for actual filtering
  //                   (kept separate so typing doesn't re-render on every key)
  //   sortMode      : "newest" / "oldest" / "name" — drives the sort order
  //   showEmailFailed: when true, only applications with email_link_status="failed"
  //   showMinorsOnly : when true, only applications flagged is_minor=true
  //
  // All four filters are AND-combined with the existing store/status/archived
  // filters. None of them affect the source data — purely client-side view.
  const [searchRaw,       setSearchRaw]       = useState("");
  const [searchTerm,      setSearchTerm]      = useState("");
  const [sortMode,        setSortMode]        = useState("newest");
  const [showEmailFailed, setShowEmailFailed] = useState(false);
  const [showMinorsOnly,  setShowMinorsOnly]  = useState(false);

  // Debounce search input. 200ms delay so the list doesn't re-filter on
  // every keystroke when the user is typing fast. Long enough to feel
  // responsive, short enough not to feel laggy.
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchRaw.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [searchRaw]);

  const visible = useMemo(() => {
    const filtered = applications.filter(app => {
      // Scope: must be at a store the user can see
      if (!visibleStoreIds?.includes(app.storeId)) return false;
      // Store scope dropdown
      if (storeScope !== "all" && app.storeId !== storeScope) return false;
      // Slice 5 — archived hidden by default unless user opted in OR the
      // current status filter specifically asks for them
      if (app.archivedAt && !showArchived && statusFilter !== "hired") return false;
      // Status filter
      if (statusFilter === "active") {
        if (["hired", "rejected", "withdrawn"].includes(app.status)) return false;
      } else if (statusFilter !== "all") {
        if (app.status !== statusFilter) return false;
      }
      // Slice 6 chip filters
      if (showEmailFailed && app.emailLinkStatus !== "failed") return false;
      if (showMinorsOnly  && !app.isMinor) return false;
      // Slice 6 text search — across name, email, phone, position
      if (searchTerm) {
        const haystack = [
          app.firstName, app.lastName,
          app.email, app.phone, app.position,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(searchTerm)) return false;
      }
      return true;
    });
    // Slice 6 — sort. Done after filter so we sort the smallest list possible.
    // Stable sort: same-timestamp rows keep their relative order from the
    // source applications array (which is itself ordered by created_at desc
    // from the supabase fetch).
    const sorted = [...filtered];
    if (sortMode === "oldest") {
      sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sortMode === "name") {
      sorted.sort((a, b) =>
        `${a.firstName || ""} ${a.lastName || ""}`.trim().toLowerCase()
        .localeCompare(`${b.firstName || ""} ${b.lastName || ""}`.trim().toLowerCase())
      );
    } else {
      // "newest" — array already comes in newest-first from fetchApplications.
      // Sort defensively in case state was mutated by edits.
      sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return sorted;
  }, [applications, visibleStoreIds, storeScope, statusFilter, showArchived,
      searchTerm, sortMode, showEmailFailed, showMinorsOnly]);

  // Counts for the chip filters — show "(N)" next to each option so manager
  // sees how many would match before clicking. Scoped to the user's visible
  // stores so counts match what they could see anyway. Doesn't apply the
  // search/sort/other-chip filters — the count reflects "if I click this
  // chip alone".
  const chipCounts = useMemo(() => {
    const scoped = applications.filter(a =>
      visibleStoreIds?.includes(a.storeId) && (!a.archivedAt || showArchived)
    );
    return {
      emailFailed: scoped.filter(a => a.emailLinkStatus === "failed").length,
      minors:      scoped.filter(a => a.isMinor).length,
    };
  }, [applications, visibleStoreIds, showArchived]);

  // Counts per status for the filter chips. Archived applications count
  // towards their original status (e.g. a hired+archived row counts under "hired").
  const statusCounts = useMemo(() => {
    const scoped = applications.filter(a => visibleStoreIds?.includes(a.storeId));
    const out = { all: scoped.length };
    out.active = scoped.filter(a => !["hired", "rejected", "withdrawn"].includes(a.status)).length;
    for (const s of APPLICATION_STATUSES) out[s.key] = scoped.filter(a => a.status === s.key).length;
    return out;
  }, [applications, visibleStoreIds]);

  // Lazy-load status history when a row is expanded
  const handleExpand = async (app) => {
    if (expandedId === app.id) { setExpandedId(null); return; }
    setExpandedId(app.id);
    if (!statusHistory[app.id]) {
      try {
        const history = await fetchApplicationStatusHistory(app.id);
        setStatusHistory(prev => ({ ...prev, [app.id]: history }));
      } catch (err) {
        console.error("Failed to load status history:", err);
      }
    }
  };

  // Hire workflow state (slice 5, refined).
  // Two paths after the duplicate check fires:
  //   - hireLinkDialog: simple "Link to existing employee" confirm dialog
  //     (only when a matching email is found in active ops_team)
  //   - hirePrefillApp: opens the OpsTeamMemberFormModal pre-filled with
  //     the application data, so manager completes role/dept/wages in one
  //     screen. On save, we create ops_team AND archive the application.
  const [hireLinkDialog, setHireLinkDialog] = useState(null);  // { app, existing } | null
  const [hirePrefillApp, setHirePrefillApp] = useState(null);  // application | null
  const [hireBusy, setHireBusy]             = useState(false);
  const [hireError, setHireError]           = useState(null);

  // Slice 6 follow-up — magic-link retry state. We track which application
  // is currently being retried so we can disable just THAT button (not all
  // of them) and show a short-lived "Sent" / "Failed" indicator inline.
  //   retryingId: id of the app currently in-flight (string | null)
  //   retryResult: { id, ok, message } for the last completed retry, shown
  //                briefly next to the button as feedback
  const [retryingId,  setRetryingId]  = useState(null);
  const [retryResult, setRetryResult] = useState(null);  // { id, ok, message } | null

  // Slice 5 rule: only manager-or-above can transition to hired. We check
  // the current user's role against the visibility helper. Staff can still
  // do other transitions (reviewing, in_training, reject, withdraw).
  const canHire = isHqOrAbove(currentUser?.role) || currentUser?.role === "manager";

  const handleTransition = async (app, newStatus) => {
    if (newStatus === "rejected") {
      const reason = prompt(`Reason for rejecting ${app.firstName} ${app.lastName || ""}? (Optional but recommended for audit)`);
      if (reason === null) return;   // user hit Cancel
      await onSetStatus(app.id, newStatus, { rejectionReason: reason || "(no reason given)" });
    } else if (newStatus === "hired") {
      // Slice 5 — special path. Gate by role, then check duplicates.
      if (!canHire) {
        alert("Only managers and HQ can hire candidates. Please ask your manager to complete this step.");
        return;
      }
      if (!app.email?.trim()) {
        alert("This applicant has no email recorded. Please edit the application and add an email before hiring (we use email to detect duplicates and link to existing employees).");
        return;
      }
      setHireBusy(true);
      setHireError(null);
      try {
        const { existing } = await hireApplicationCheck(app.email);
        if (existing) {
          // Duplicate found — show the simple link dialog
          setHireLinkDialog({ app, existing });
        } else {
          // Fresh hire — open the prefilled ops_team modal
          setHirePrefillApp(app);
        }
      } catch (err) {
        console.error("Hire check failed:", err);
        setHireError(err?.message || "Could not check for existing employee. Try again.");
        // Surface error via alert since no modal is open yet
        alert(`Hire check failed: ${err?.message || err}`);
      } finally {
        setHireBusy(false);
      }
      return;
    } else {
      await onSetStatus(app.id, newStatus);
    }
    // Refresh history if expanded (non-hire transitions only — hire refreshes
    // via the dialog's onConfirm flow)
    if (expandedId === app.id) {
      const history = await fetchApplicationStatusHistory(app.id);
      setStatusHistory(prev => ({ ...prev, [app.id]: history }));
    }
  };

  // Called from the hire LINK dialog. Manager confirmed that an existing
  // employee record matches — link the application to that record and
  // archive it, no new ops_team entry created.
  const confirmLinkToExisting = async () => {
    if (!hireLinkDialog) return;
    setHireBusy(true);
    setHireError(null);
    try {
      await hireApplication(hireLinkDialog.app, {
        linkToExisting: hireLinkDialog.existing.id,
        hiredByUserId:  currentUser?.id,
      });
      setHireLinkDialog(null);
      try { await onUpdate(hireLinkDialog.app.id, {}); } catch {}
    } catch (err) {
      console.error("Link to existing failed:", err);
      setHireError(err?.message || "Could not link. Try again.");
    } finally {
      setHireBusy(false);
    }
  };

  // Called from the prefilled OpsTeamMemberFormModal when manager saves.
  // The modal already produced a complete ops_team payload (with HR fields
  // pre-filled from the application). We create the ops_team row, then
  // link + archive the application.
  const confirmHireWithNewEmployee = async (opsTeamPayload) => {
    if (!hirePrefillApp) return;
    setHireBusy(true);
    setHireError(null);
    try {
      // Create the ops_team row first
      const created = await onAddOpsTeam(opsTeamPayload);
      const opsTeamId = created?.id || opsTeamPayload.id;
      // Now archive the application + link to the new employee row
      await hireApplication(hirePrefillApp, {
        linkToExisting: opsTeamId,   // we just created it, reuse the path
        hiredByUserId:  currentUser?.id,
      });
      setHirePrefillApp(null);
      try { await onUpdate(hirePrefillApp.id, {}); } catch {}
      // Slice 6 — jump straight to the new employee's profile so manager
      // can immediately add notes, verify details, etc. Skip if the navigation
      // helper isn't provided (defensive — shouldn't happen in production).
      if (onOpenEmployeeProfile) {
        onOpenEmployeeProfile(opsTeamId);
      }
    } catch (err) {
      console.error("Hire (new employee) failed:", err);
      alert(`Hiring failed: ${err?.message || err}\n\nThe employee record may have been created but the application wasn't archived. Check Ops Team and Hiring view, and adjust manually if needed.`);
    } finally {
      setHireBusy(false);
    }
  };

  // Slice 6 follow-up — retry sending the candidate's magic-link email.
  // Same code path as the initial send during /apply submission. If the
  // initial send failed (typically Supabase free-tier rate limit), the
  // manager can click "Retry" to attempt again.
  //
  // Behavior:
  //   - Disables only THIS application's button while in-flight
  //   - Updates email_link_status in DB (sent / failed)
  //   - Shows a short-lived inline result ("Sent" / "Failed: rate limit")
  //   - Triggers parent refetch so the badge updates on success
  const handleRetryLink = useCallback(async (app) => {
    if (!app?.email) {
      alert("Cannot retry — application has no email address.");
      return;
    }
    setRetryingId(app.id);
    setRetryResult(null);
    try {
      const result = await sendCandidateMagicLink(app.email);
      if (result.ok) {
        await setApplicationEmailStatus(app.id, "sent");
        setRetryResult({ id: app.id, ok: true, message: "Sent" });
      } else {
        await setApplicationEmailStatus(app.id, "failed", result.error);
        setRetryResult({ id: app.id, ok: false, message: result.error || "Failed" });
      }
      // Trigger parent refresh so the badge updates
      try { await onUpdate(app.id, {}); } catch {}
    } catch (err) {
      console.error("Retry link unexpected error:", err);
      setRetryResult({ id: app.id, ok: false, message: err?.message || "Unexpected error" });
    } finally {
      setRetryingId(null);
      // Clear the result indicator after a few seconds so it doesn't
      // linger and look like the next click also failed
      setTimeout(() => setRetryResult(r => r?.id === app.id ? null : r), 4000);
    }
  }, [onUpdate]);

  const allowedStores = useMemo(
    () => stores.filter(s => visibleStoreIds?.includes(s.id) && !s.archivedAt),
    [stores, visibleStoreIds]
  );
  const showBrandPrefix = new Set(allowedStores.map(s => s.brandId)).size > 1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Hiring</h1>
          <p className="text-sm text-slate-500">
            {isHqOrAbove(currentUser?.role)
              ? "All candidate applications across the chain."
              : "Candidates applying to your stores."}
          </p>
        </div>
        <button onClick={() => { setEditItem(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold">
          <Plus size={14}/> Add Candidate
        </button>
      </div>

      {/* Slice 6 — search + sort row. Sits above the existing scope/status
          row so it's the first thing manager interacts with. Search is the
          most common workflow ("find Sarah's application"); sort matters
          when application volume builds up. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"/>
          <input
            type="search"
            value={searchRaw}
            onChange={e => setSearchRaw(e.target.value)}
            placeholder="Search by name, email, phone, or position…"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
          />
        </div>
        <select
          value={sortMode}
          onChange={e => setSortMode(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500"
          title="Sort applications"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {allowedStores.length > 1 && (
          <select value={storeScope} onChange={e => setStoreScope(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 min-w-[180px]">
            <option value="all">All my stores ({allowedStores.length})</option>
            {allowedStores.map(s => {
              const b = brands.find(br => br.id === s.brandId);
              return <option key={s.id} value={s.id}>{showBrandPrefix && b ? `${b.name} · ` : ""}{s.shortName || s.name}</option>;
            })}
          </select>
        )}
        {/* Status filter chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={statusFilter === "active"}    onClick={() => setStatusFilter("active")}   label={`Active (${statusCounts.active})`}/>
          <FilterChip active={statusFilter === "all"}       onClick={() => setStatusFilter("all")}      label={`All (${statusCounts.all})`}/>
          {APPLICATION_STATUSES.map(s => statusCounts[s.key] > 0 && (
            <FilterChip key={s.key} active={statusFilter === s.key} onClick={() => setStatusFilter(s.key)}
              label={`${s.label} (${statusCounts[s.key]})`}/>
          ))}
          {/* Slice 6 — flag chips. Only render if there are matching rows
              so the chip doesn't sit there showing "(0)" for chains that
              never hit these edge cases. */}
          {chipCounts.emailFailed > 0 && (
            <FilterChip
              active={showEmailFailed}
              onClick={() => setShowEmailFailed(v => !v)}
              label={`✉ Email failed (${chipCounts.emailFailed})`}
            />
          )}
          {chipCounts.minors > 0 && (
            <FilterChip
              active={showMinorsOnly}
              onClick={() => setShowMinorsOnly(v => !v)}
              label={`⚠ Under 18 (${chipCounts.minors})`}
            />
          )}
          {/* Slice 5 — toggle archived visibility. Hidden by default. */}
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
              className="rounded"
            />
            Show archived
          </label>
        </div>
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500 bg-slate-900/40 border border-slate-800 rounded-2xl">
          <UserPlus size={32} className="mb-3 text-slate-700"/>
          {searchTerm || showEmailFailed || showMinorsOnly ? (
            <>
              <div className="text-sm font-semibold">No applications match these filters</div>
              <div className="text-xs text-slate-600 mt-1">
                Try clearing the search box{(showEmailFailed || showMinorsOnly) && " or chip filters"} above.
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold">No applications yet</div>
              <div className="text-xs text-slate-600 mt-1">Click "Add Candidate" to capture a new application.</div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(app => {
            const store  = stores.find(s => s.id === app.storeId);
            const brand  = brands.find(b => b.id === app.brandId);
            const status = APPLICATION_STATUSES.find(s => s.key === app.status) || { label: app.status, color: "slate" };
            const transitions = APPLICATION_TRANSITIONS[app.status] || [];
            const isExpanded = expandedId === app.id;
            const history = statusHistory[app.id] || [];

            return (
              <div key={app.id} className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
                {/* Summary row — click to expand */}
                <div onClick={() => handleExpand(app)}
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-800/50 transition-colors">
                  {/* Avatar (initials) */}
                  <div className="w-10 h-10 rounded-xl bg-indigo-950 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-sm flex-shrink-0">
                    {(app.firstName?.[0] || "?")}{app.lastName?.[0] || ""}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-sm font-bold text-white">{app.firstName} {app.lastName}</div>
                      <Badge label={status.label} color={status.color}/>
                      {app.position && <span className="text-xs text-slate-500">· {app.position}</span>}
                      {/* Slice 4: surface magic-link failures so manager
                          can follow up manually. We only render the badge
                          when something's not normal — 'sent' is silent. */}
                      {app.emailLinkStatus === "failed" && (
                        <span
                          title={app.emailLinkError || "Magic link could not be sent. Candidate may not have received their portal link."}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-800 text-amber-300 font-semibold"
                        >
                          ✉ link failed
                        </span>
                      )}
                      {app.emailLinkStatus === "pending" && app.source === "public_form" && (
                        <span
                          title="Magic link send in progress or not yet attempted."
                          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400"
                        >
                          ✉ link pending
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {showBrandPrefix && brand ? `${brand.name} · ` : ""}{store?.shortName || store?.name || app.storeId}
                      {app.email && ` · ${app.email}`}
                      {app.phone && ` · ${app.phone}`}
                    </div>
                  </div>
                  <ChevronDownIcon size={16} className={`text-slate-500 transition-transform flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`}/>
                </div>

                {/* Expanded section */}
                {isExpanded && (
                  <div className="border-t border-slate-800 p-4 space-y-4 bg-slate-950/40">
                    {/* Slice 7 stage 4: warn manager if this email matches other
                        applications or an existing employee. Self-contained —
                        fetches on mount (i.e. when the row is expanded). Manager-
                        only info; never shown to the candidate. */}
                    <DuplicateWarning email={app.email} excludeId={app.id}/>

                    {/* Top row: photo (if uploaded) + key details */}
                    <div className="flex items-start gap-4">
                      {app.photoUrl && (
                        <a
                          href={app.photoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="flex-shrink-0 block"
                          title="Click to view full size"
                        >
                          <img
                            src={app.photoUrl}
                            alt={`${app.firstName} ${app.lastName}`}
                            className="w-24 h-24 object-cover rounded-xl border border-slate-700"
                          />
                        </a>
                      )}
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                        <DetailField label="Position"    value={app.position || "—"}/>
                        <DetailField label="Source"      value={app.source || "—"}/>
                        <DetailField label="Email"       value={app.email || "—"}/>
                        <DetailField label="Phone"       value={app.phone || "—"}/>
                        <DetailField label="Date of Birth"
                          value={app.dateOfBirth
                            ? `${new Date(app.dateOfBirth).toLocaleDateString("en-GB")}${app.isMinor ? " ⚠ UNDER 18" : ""}`
                            : "—"
                          }
                        />
                        <DetailField label="Legal Status"
                          value={LEGAL_STATUS_OPTIONS.find(o => o.value === app.legalStatus)?.label || app.legalStatus || "—"}
                        />
                        <DetailField label="RTW Verified" value={app.rtwVerified ? "✓ Yes" : "✗ No"}/>
                        <DetailField label="Applied On"  value={new Date(app.createdAt).toLocaleDateString("en-GB")}/>
                      </div>
                    </div>

                    {/* Wider fields full-width below */}
                    {app.address              && <DetailField label="Address"              value={app.address} full/>}
                    {app.availabilityNotes    && <DetailField label="Availability"         value={app.availabilityNotes} full/>}
                    {app.relevantExperience   && <DetailField label="Relevant Experience"  value={app.relevantExperience} full/>}
                    {app.resumeText && (
                      <div className="col-span-full">
                        <div className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold mb-1.5">Resume / CV</div>
                        <pre className="text-xs text-slate-200 bg-slate-950 border border-slate-800 rounded-xl p-3 max-h-64 overflow-y-auto whitespace-pre-wrap font-mono">{app.resumeText}</pre>
                      </div>
                    )}
                    {app.applicantNotes    && <DetailField label="Notes"        value={app.applicantNotes}    full/>}
                    {app.status === "rejected" && app.rejectionReason &&
                      <DetailField label="Rejection Reason" value={app.rejectionReason} full/>
                    }

                    {/* Status transition buttons */}
                    {transitions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <span className="text-xs text-slate-500">Move to:</span>
                        {transitions.map(t => {
                          const tinfo = APPLICATION_STATUSES.find(s => s.key === t);
                          const isReject = t === "rejected" || t === "withdrawn";
                          return (
                            <button key={t} onClick={(e) => { e.stopPropagation(); handleTransition(app, t); }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                isReject
                                  ? "bg-slate-800 text-slate-400 hover:bg-red-950/40 hover:text-red-300"
                                  : "bg-indigo-950/40 text-indigo-300 hover:bg-indigo-600 hover:text-white"
                              }`}>
                              {tinfo?.label || t}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Edit / Delete / Retry link */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button onClick={(e) => { e.stopPropagation(); setEditItem(app); setShowForm(true); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700">
                        <Edit size={11}/> Edit details
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteId(app.id); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-500 text-xs font-semibold hover:bg-red-950/40 hover:text-red-300">
                        <Trash2 size={11}/> Delete
                      </button>
                      {/* Slice 6 follow-up — retry magic link.
                          ⚠ Currently the candidate portal route (/candidate)
                          does not exist — slice 4 was rolled back. Clicking
                          retry will send an email but the link leads to a
                          404. Kept here for when the portal is built. */}
                      {app.email && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!window.confirm(
                              "Heads up: the candidate portal isn't built yet. " +
                              "If you send this link, the candidate will get an email " +
                              "but clicking it leads nowhere useful.\n\n" +
                              "Send anyway? (Useful for testing the email infrastructure.)"
                            )) return;
                            handleRetryLink(app);
                          }}
                          disabled={retryingId === app.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 disabled:opacity-50"
                          title={app.emailLinkStatus === "failed"
                            ? `Last attempt failed: ${app.emailLinkError || "unknown reason"}. ⚠ Portal not live — link won't work yet.`
                            : "⚠ Portal not live yet — link will 404."}
                        >
                          {retryingId === app.id
                            ? "Sending…"
                            : app.emailLinkStatus === "failed"
                              ? <>✉ Retry link</>
                              : <>✉ Re-send link</>
                          }
                        </button>
                      )}
                      {/* Inline result indicator. Auto-clears after 4s. */}
                      {retryResult?.id === app.id && (
                        <span className={`flex items-center px-2 py-1 rounded-lg text-xs font-semibold ${
                          retryResult.ok
                            ? "bg-emerald-950/40 text-emerald-300"
                            : "bg-amber-950/40 text-amber-300"
                        }`}>
                          {retryResult.ok ? "✓ Sent" : `✗ ${retryResult.message}`}
                        </span>
                      )}
                    </div>

                    {/* Status timeline */}
                    {history.length > 0 && (
                      <div className="pt-3 border-t border-slate-800">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Timeline</div>
                        <div className="space-y-1.5">
                          {history.map(h => (
                            <div key={h.id} className="flex items-start gap-2 text-xs">
                              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0"/>
                              <div className="flex-1">
                                <div className="text-slate-300">
                                  {h.fromStatus
                                    ? <>Moved from <span className="font-semibold">{APPLICATION_STATUSES.find(s=>s.key===h.fromStatus)?.label || h.fromStatus}</span> to <span className="font-semibold">{APPLICATION_STATUSES.find(s=>s.key===h.toStatus)?.label || h.toStatus}</span></>
                                    : <>Application created with status <span className="font-semibold">{APPLICATION_STATUSES.find(s=>s.key===h.toStatus)?.label || h.toStatus}</span></>
                                  }
                                </div>
                                <div className="text-slate-600">{new Date(h.changedAt).toLocaleString("en-GB")}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && <ApplicationFormModal
        brands={brands} stores={allowedStores} storeRoles={storeRoles} item={editItem}
        onSave={async (data) => {
          if (editItem) { await onUpdate(editItem.id, data); }
          else          { await onAdd(data); }
          setShowForm(false); setEditItem(null);
        }}
        onClose={() => { setShowForm(false); setEditItem(null); }}
      />}

      {deleteId && <OpsConfirmModal
        message="Delete this application? This permanently removes the record and its history."
        onConfirm={async () => { await onDelete(deleteId); setDeleteId(null); }}
        onClose={() => setDeleteId(null)}
      />}

      {/* Slice 5 (refined) — Link-to-existing dialog. Shown only when the
          candidate's email already matches an active ops_team entry. Manager
          confirms to link the application to that record rather than
          creating a duplicate employee. */}
      {hireLinkDialog && (
        <Modal
          title="Link to existing employee?"
          onClose={() => { if (!hireBusy) { setHireLinkDialog(null); setHireError(null); } }}
          maxW="max-w-lg"
          footer={
            <div className="flex gap-2 w-full">
              <button
                onClick={() => { setHireLinkDialog(null); setHireError(null); }}
                disabled={hireBusy}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmLinkToExisting}
                disabled={hireBusy}
                className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-500 disabled:opacity-50"
              >
                {hireBusy ? "Working…" : "Link to existing"}
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-sm text-slate-200">
            {hireError && (
              <div className="px-3 py-2 rounded-lg bg-red-950/40 border border-red-900 text-red-300 text-xs">
                {hireError}
              </div>
            )}
            <div className="text-amber-300 bg-amber-950/30 border border-amber-900/50 rounded-xl p-3 text-xs">
              <div className="font-semibold mb-1">⚠ Matching employee found</div>
              <div className="text-slate-300">
                An active employee with email <span className="font-mono text-amber-200">{hireLinkDialog.app.email}</span> already exists in Ops Team. We'll link this application to the existing record rather than creating a duplicate.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs">
                <div className="text-slate-500 uppercase tracking-wider text-[10px] mb-1">This application</div>
                <div className="font-semibold text-slate-200">{hireLinkDialog.app.firstName} {hireLinkDialog.app.lastName}</div>
                <div className="text-slate-500 mt-1">{hireLinkDialog.app.email}</div>
                <div className="text-slate-500">Applied for: {hireLinkDialog.app.position || "—"}</div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs">
                <div className="text-slate-500 uppercase tracking-wider text-[10px] mb-1">Existing employee</div>
                <div className="font-semibold text-slate-200">{hireLinkDialog.existing.firstName} {hireLinkDialog.existing.lastName}</div>
                <div className="text-slate-500 mt-1">{hireLinkDialog.existing.role || "(no role)"} · {hireLinkDialog.existing.department || "(no department)"}</div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Slice 5 (refined) — Prefilled OpsTeam modal for the FRESH hire path.
          Pre-fills name/email/phone/DOB/address/legal-status from the
          application. Manager completes store, role, department, hourly
          rate. On save, calls confirmHireWithNewEmployee which creates the
          ops_team row AND archives the application atomically. */}
      {hirePrefillApp && (
        <OpsTeamMemberFormModal
          item={null}
          prefillApplication={hirePrefillApp}
          brands={brands}
          stores={stores}
          visibleStoreIds={visibleStoreIds}
          storeDepartments={storeDepartments}
          storeRoles={storeRoles}
          opsTeam={opsTeam}
          onSave={confirmHireWithNewEmployee}
          onClose={() => { if (!hireBusy) setHirePrefillApp(null); }}
        />
      )}
    </div>
  );
}

// Small key/value pair used inside the expanded row
// Slice 7 stage 4 — apply-time duplicate warning.
// Rendered inside the expanded application panel. On mount, looks up the
// applicant's email against other applications and existing employees and
// shows a soft amber warning if anything matches. Purely informational —
// it never blocks any action, and it's only ever seen by the manager
// (Q5: the candidate must not learn about other applicants on the same email).
//
// Fails silently: a lookup error just renders nothing rather than disrupting
// the panel. No email → nothing to check → renders nothing.
function DuplicateWarning({ email, excludeId }) {
  const [result, setResult] = useState(null);  // { otherApplications, existingEmployee } | null
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!email?.trim()) { setResult(null); return; }
    setLoading(true);
    findApplicationsByEmail(email, excludeId)
      .then(r => { if (!cancelled) setResult(r); })
      .catch(err => { console.error("Duplicate check failed:", err); if (!cancelled) setResult(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [email, excludeId]);

  if (loading || !result) return null;

  const { otherApplications = [], existingEmployee = null } = result;
  if (otherApplications.length === 0 && !existingEmployee) return null;

  return (
    <div className="bg-amber-950/30 border border-amber-800/70 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
        <AlertTriangle size={14}/> Possible duplicate
      </div>

      {existingEmployee && (
        <div className="text-xs text-amber-200/90">
          This email matches an existing employee:{" "}
          <span className="font-semibold">
            {existingEmployee.firstName} {existingEmployee.lastName}
          </span>
          {existingEmployee.archivedAt
            ? <span className="text-amber-300/70"> (archived — possible returning worker)</span>
            : <span className="text-amber-300/70"> (active)</span>}
          . Consider linking to the existing record rather than creating a duplicate.
        </div>
      )}

      {otherApplications.length > 0 && (
        <div className="text-xs text-amber-200/90">
          This email also appears on {otherApplications.length} other application{otherApplications.length === 1 ? "" : "s"}:
          <ul className="mt-1 space-y-0.5">
            {otherApplications.map(o => {
              const st = APPLICATION_STATUSES.find(s => s.key === o.status);
              return (
                <li key={o.id} className="text-amber-100/80">
                  · {o.firstName} {o.lastName}
                  {" — "}
                  <span className="text-amber-300/80">{st?.label || o.status}</span>
                  {o.archivedAt && <span className="text-amber-300/60"> (archived)</span>}
                  <span className="text-amber-400/50"> · {new Date(o.createdAt).toLocaleDateString("en-GB")}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value, full }) {
  return (
    <div className={full ? "col-span-2 md:col-span-3" : ""}>
      <div className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold mb-0.5">{label}</div>
      <div className="text-xs text-slate-200">{value}</div>
    </div>
  );
}

// Filter chip — clickable pill, highlighted when active
function FilterChip({ active, onClick, label }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
        active ? "bg-indigo-600 text-white" : "bg-slate-900 text-slate-400 border border-slate-700 hover:text-slate-200"
      }`}>
      {label}
    </button>
  );
}

// ─── Employee Profile View (slice 6) ──────────────────────────────────────────
// Per-employee detail page with three tabs: Personal & HR, Linked Application,
// Notes. Reached by clicking an employee row in Ops Team list, or via the
// URL hash #employee/{id}. Closes back to Ops Team via the X / back button.
//
// Scope notes:
//   - Edits to hire_date and HR fields go through onUpdateEmployee (same
//     path as the existing edit modal — re-uses the partial-update mapper)
//   - Notes are append-only — no edit/delete from this UI
//   - Linked Application is read-only — if the manager wants to edit the
//     original application, they navigate back to Hiring view
//   - For legacy employees with no linked application, the tab shows an
//     empty state explaining "added manually, no application history"
function EmployeeProfileView({
  employeeId, brands, stores, storeRoles, storeDepartments,
  opsTeam, currentUser, onUpdateEmployee, onClose,
}) {
  const employee = useMemo(
    () => opsTeam.find(m => m.id === employeeId),
    [opsTeam, employeeId]
  );

  const [tab, setTab] = useState("personal");
  const [linkedApp, setLinkedApp] = useState(null);
  const [linkedAppLoading, setLinkedAppLoading] = useState(true);
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);

  // Edit state for hire date + HR fields. Lifted out of individual inputs so
  // the manager can edit several fields and Save once. Initialised from
  // employee record; reset when employee changes (e.g. navigated to another).
  const [editHr, setEditHr] = useState(null);
  const [savingHr, setSavingHr] = useState(false);

  useEffect(() => {
    if (!employee) return;
    setEditHr({
      hireDate:    employee.hireDate    || "",
      email:       employee.email       || "",
      phone:       employee.phone       || "",
      dob:         employee.dob         || "",
      address:     employee.address     || "",
      legalStatus: employee.legalStatus || "",
      hrNotes:     employee.hrNotes     || "",
      // Slice 7 — emergency contact
      emergencyContactName:         employee.emergencyContactName         || "",
      emergencyContactPhone:        employee.emergencyContactPhone        || "",
      emergencyContactRelationship: employee.emergencyContactRelationship || "",
      // Slice 7 — probation
      probationEndDate: employee.probationEndDate || "",
      probationStatus:  employee.probationStatus  || "in_progress",
    });
  }, [employee?.id]);  // re-init on employee swap, not on every prop tick

  // Load linked application + notes when employee changes
  useEffect(() => {
    let cancelled = false;
    if (!employeeId) return;
    setLinkedAppLoading(true);
    setNotesLoading(true);
    fetchLinkedApplication(employeeId)
      .then(app => { if (!cancelled) setLinkedApp(app); })
      .catch(err => { console.error("Linked app load failed:", err); })
      .finally(() => { if (!cancelled) setLinkedAppLoading(false); });
    fetchEmployeeNotes(employeeId)
      .then(ns => { if (!cancelled) setNotes(ns); })
      .catch(err => { console.error("Notes load failed:", err); })
      .finally(() => { if (!cancelled) setNotesLoading(false); });
    return () => { cancelled = true; };
  }, [employeeId]);

  // Derived hire date display: explicit override > linked application's
  // archived_at (the actual hire moment) > nothing
  const derivedHireDate = employee?.hireDate || linkedApp?.archivedAt?.slice(0, 10) || null;

  if (!employee) {
    return (
      <div className="space-y-4">
        <button onClick={onClose} className="text-sm text-slate-400 hover:text-white flex items-center gap-2">
          <ChevronLeft size={16}/> Back to Ops Team
        </button>
        <div className="flex flex-col items-center justify-center py-16 text-slate-500 bg-slate-900/40 border border-slate-800 rounded-2xl">
          <AlertCircle size={32} className="mb-3 text-slate-700"/>
          <div className="text-sm font-semibold">Employee not found</div>
          <div className="text-xs text-slate-600 mt-1">They may have been deleted or you don't have access.</div>
        </div>
      </div>
    );
  }

  const primaryStore = stores.find(s => s.id === employee.storeIds?.[0]);
  const brand        = brands.find(b => b.id === employee.brandId);
  const roleLabel    = storeRoles.find(r => r.id === employee.roleId)?.name || employee.role || "";
  const deptLabel    = storeDepartments.find(d => d.id === employee.departmentId)?.name || employee.department || "";

  const handleSaveHr = async () => {
    if (!editHr) return;
    setSavingHr(true);
    try {
      // Slice 7 — if probation status is in_progress and no end date set,
      // auto-fill to hireDate + 90 days. This way the manager doesn't have
      // to manually set the date for every new hire.
      let probEndDate = editHr.probationEndDate || null;
      if (!probEndDate
          && (editHr.probationStatus === "in_progress")
          && (editHr.hireDate || employee.hireDate || derivedHireDate)) {
        const hireSrc = editHr.hireDate || employee.hireDate || derivedHireDate;
        const hireD = new Date(hireSrc);
        if (!isNaN(hireD.getTime())) {
          hireD.setDate(hireD.getDate() + 90);
          probEndDate = hireD.toISOString().slice(0, 10);
        }
      }

      // Use partial update — only the HR fields. Other fields (role, pin,
      // storeIds, etc.) untouched thanks to the partial-aware mapper.
      await onUpdateEmployee({
        id:          employee.id,
        hireDate:    editHr.hireDate    || null,
        email:       editHr.email       || null,
        phone:       editHr.phone       || null,
        dob:         editHr.dob         || null,
        address:     editHr.address     || null,
        legalStatus: editHr.legalStatus || null,
        hrNotes:     editHr.hrNotes     || null,
        // Slice 7 — emergency contact
        emergencyContactName:         editHr.emergencyContactName         || null,
        emergencyContactPhone:        editHr.emergencyContactPhone        || null,
        emergencyContactRelationship: editHr.emergencyContactRelationship || null,
        // Slice 7 — probation
        probationEndDate: probEndDate,
        probationStatus:  editHr.probationStatus || "in_progress",
      });
    } catch (err) {
      console.error("HR save failed:", err);
      alert(`Could not save: ${err?.message || err}`);
    } finally {
      setSavingHr(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button onClick={onClose} className="text-sm text-slate-400 hover:text-white flex items-center gap-2">
        <ChevronLeft size={16}/> Back to Ops Team
      </button>

      {/* Header card */}
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
        <div className="flex items-start gap-4">
          {/* Photo or initials */}
          {employee.photoUrl ? (
            <img
              src={employee.photoUrl}
              alt={`${employee.firstName} ${employee.lastName}`}
              className="w-20 h-20 rounded-xl object-cover border border-slate-700 flex-shrink-0"
            />
          ) : (
            <div
              className="w-20 h-20 rounded-xl flex items-center justify-center text-2xl font-bold flex-shrink-0"
              style={{ background: (employee.color || "#6366f1") + "30", color: employee.color || "#6366f1" }}
            >
              {employee.firstName[0]}{employee.lastName?.[0] || ""}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-2xl font-bold text-white">{employee.firstName} {employee.lastName}</h1>
              {employee.status === "pending_setup" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-800 text-amber-300 font-semibold">
                  ⚠ Pending setup
                </span>
              )}
              {employee.archivedAt && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 font-semibold">
                  Archived
                </span>
              )}
            </div>
            {employee.nickname && <div className="text-sm text-slate-500 mb-2">"{employee.nickname}"</div>}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div><div className="text-slate-600 uppercase tracking-wider text-[10px]">Role</div><div className="text-slate-200 mt-0.5">{roleLabel || "—"}</div></div>
              <div><div className="text-slate-600 uppercase tracking-wider text-[10px]">Department</div><div className="text-slate-200 mt-0.5">{deptLabel || "—"}</div></div>
              <div><div className="text-slate-600 uppercase tracking-wider text-[10px]">Store</div><div className="text-slate-200 mt-0.5">{primaryStore ? `${brand?.name ? brand.name + " · " : ""}${primaryStore.shortName || primaryStore.name}` : "—"}</div></div>
              <div><div className="text-slate-600 uppercase tracking-wider text-[10px]">Pay</div><div className="text-slate-200 mt-0.5">{formatPayDisplay(employee.hourlyRate, employee.payType)}</div></div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800 flex-wrap">
        {[
          { key: "personal",    label: "Personal & HR" },
          { key: "job",         label: "Job Assignment" },
          { key: "pay",         label: "Pay History" },
          { key: "certs",       label: "Certifications" },
          { key: "application", label: linkedApp ? "Linked Application" : "Linked Application (none)" },
          { key: "documents",   label: "Documents" },
          { key: "notes",       label: `Notes${notes.length > 0 ? ` (${notes.length})` : ""}` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.key
                ? "text-white border-indigo-500"
                : "text-slate-500 border-transparent hover:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "personal" && editHr && (
        <PersonalHrTab
          editHr={editHr} setEditHr={setEditHr}
          derivedHireDate={derivedHireDate}
          linkedApp={linkedApp}
          onSave={handleSaveHr} saving={savingHr}
        />
      )}

      {tab === "job" && (
        <JobAssignmentTab
          employee={employee}
          stores={stores}
          storeRoles={storeRoles}
          storeDepartments={storeDepartments}
          opsTeam={opsTeam}
          onUpdateEmployee={onUpdateEmployee}
          currentUser={currentUser}
        />
      )}

      {tab === "pay" && (
        <PayHistoryTab
          employeeId={employeeId}
          employee={employee}
          currentUser={currentUser}
        />
      )}

      {tab === "certs" && (
        <CertificationsTab
          employeeId={employeeId}
          currentUser={currentUser}
        />
      )}

      {tab === "application" && (
        <LinkedApplicationTab
          linkedApp={linkedApp}
          loading={linkedAppLoading}
          stores={stores}
        />
      )}

      {tab === "documents" && (
        <DocumentsTab
          employeeId={employeeId}
          currentUser={currentUser}
        />
      )}

      {tab === "notes" && (
        <NotesTab
          employeeId={employeeId}
          notes={notes} setNotes={setNotes}
          loading={notesLoading}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}

// Tab 1 — Personal & HR
function PersonalHrTab({ editHr, setEditHr, derivedHireDate, linkedApp, onSave, saving }) {
  const set = (k, v) => setEditHr(s => ({ ...s, [k]: v }));
  const labelCls = "block text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1";
  const inputCls = "w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500";

  // Show whether hire date is overridden or derived. If editHr.hireDate
  // matches the derived value, it's not really "overridden".
  const isExplicitOverride = !!editHr.hireDate && editHr.hireDate !== (derivedHireDate || "");

  return (
    <div className="space-y-4 bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div>
        <label className={labelCls}>Hire date</label>
        <input
          type="date"
          value={editHr.hireDate}
          onChange={e => set("hireDate", e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className={`${inputCls} cursor-pointer`}
          onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
        />
        <div className="text-[10px] text-slate-600 mt-1">
          {linkedApp
            ? <>Default: {derivedHireDate ? new Date(derivedHireDate).toLocaleDateString("en-GB") : "—"} (from linked application's hire date). Override above if different.{isExplicitOverride && <span className="text-amber-400"> · Override active</span>}</>
            : <>No linked application — set this manually.</>
          }
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Email</label><input type="email" value={editHr.email} onChange={e => set("email", e.target.value)} className={inputCls}/></div>
        <div><label className={labelCls}>Phone</label><input value={editHr.phone} onChange={e => set("phone", e.target.value)} className={inputCls}/></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Date of birth</label>
          <input
            type="date"
            value={editHr.dob}
            onChange={e => set("dob", e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className={`${inputCls} cursor-pointer`}
            onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
          />
          {editHr.dob && isUnder18(editHr.dob) && (
            <div className="text-[10px] text-amber-400 mt-0.5">⚠ Under 18 — restricted hours apply.</div>
          )}
        </div>
        <div>
          <label className={labelCls}>Legal status</label>
          <select value={editHr.legalStatus} onChange={e => set("legalStatus", e.target.value)} className={inputCls}>
            <option value="">— Not set —</option>
            {LEGAL_STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Address</label>
        <input value={editHr.address} onChange={e => set("address", e.target.value)} className={inputCls} placeholder="Street, town, postcode"/>
      </div>

      <div>
        <label className={labelCls}>HR notes</label>
        <textarea
          value={editHr.hrNotes}
          onChange={e => set("hrNotes", e.target.value)}
          rows={3}
          placeholder="Internal HR notes about this employee (e.g. preferred contact times, visa expiry date). Different from the Notes tab which is append-only."
          className={`${inputCls} resize-none`}
        />
        <div className="text-[10px] text-slate-600 mt-1">
          One-line free-form notes editable any time. For dated, append-only entries, use the Notes tab.
        </div>
      </div>

      {/* ── Emergency contact (slice 7) ── */}
      <div className="pt-4 border-t border-slate-800">
        <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-3">
          Emergency contact
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Name</label>
            <input
              value={editHr.emergencyContactName || ""}
              onChange={e => set("emergencyContactName", e.target.value)}
              placeholder="Full name of next-of-kin"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Relationship</label>
            <input
              value={editHr.emergencyContactRelationship || ""}
              onChange={e => set("emergencyContactRelationship", e.target.value)}
              placeholder="e.g. Spouse, Parent, Sibling, Friend"
              className={inputCls}
            />
          </div>
        </div>
        <div className="mt-3">
          <label className={labelCls}>Phone</label>
          <input
            type="tel"
            value={editHr.emergencyContactPhone || ""}
            onChange={e => set("emergencyContactPhone", e.target.value)}
            placeholder="Contact number"
            className={inputCls}
          />
          <div className="text-[10px] text-slate-600 mt-1">
            Who we call if this employee has an incident at work. Required by H&amp;S best practice.
          </div>
        </div>
      </div>

      {/* ── Probation (slice 7) ── */}
      <div className="pt-4 border-t border-slate-800">
        <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-3">
          Probation
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Status</label>
            <select
              value={editHr.probationStatus || "in_progress"}
              onChange={e => set("probationStatus", e.target.value)}
              className={inputCls}
            >
              <option value="in_progress">In progress</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
              <option value="extended">Extended</option>
              <option value="not_applicable">Not applicable</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>End date</label>
            <input
              type="date"
              value={editHr.probationEndDate || ""}
              onChange={e => set("probationEndDate", e.target.value)}
              className={`${inputCls} cursor-pointer`}
              onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
              disabled={editHr.probationStatus === "not_applicable"}
            />
            <div className="text-[10px] text-slate-600 mt-1">
              {editHr.probationStatus === "not_applicable"
                ? "Not applicable — no probation period."
                : editHr.probationEndDate
                  ? (() => {
                      const end = new Date(editHr.probationEndDate);
                      const now = new Date();
                      const daysLeft = Math.floor((end - now) / (1000 * 60 * 60 * 24));
                      if (isNaN(end.getTime())) return "Invalid date.";
                      if (editHr.probationStatus === "passed") return "Probation completed.";
                      if (editHr.probationStatus === "failed") return "Probation review failed.";
                      if (daysLeft < 0)  return `Past probation by ${Math.abs(daysLeft)} days. Review needed.`;
                      if (daysLeft <= 14) return `⚠ Review due in ${daysLeft} days.`;
                      return `${daysLeft} days remaining.`;
                    })()
                  : "Auto-fills to hire date + 90 days on save."
              }
            </div>
          </div>
        </div>
        {/* Quick action: mark probation passed (most common review outcome) */}
        {editHr.probationStatus === "in_progress" && editHr.probationEndDate && (() => {
          const end = new Date(editHr.probationEndDate);
          const now = new Date();
          const daysLeft = Math.floor((end - now) / (1000 * 60 * 60 * 24));
          // Show the quick-action button if probation end is within 14 days
          // OR already past. Otherwise hide to keep UI uncluttered.
          if (isNaN(end.getTime())) return null;
          if (daysLeft > 14) return null;
          return (
            <div className="mt-3 flex gap-2 flex-wrap">
              <button
                onClick={() => set("probationStatus", "passed")}
                type="button"
                className="px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-900 text-emerald-300 text-xs font-semibold hover:bg-emerald-900/40"
              >
                ✓ Mark probation passed
              </button>
              <button
                onClick={() => set("probationStatus", "extended")}
                type="button"
                className="px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-900 text-amber-300 text-xs font-semibold hover:bg-amber-900/40"
              >
                Extend probation
              </button>
            </div>
          );
        })()}
      </div>

      <div className="flex justify-end">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// Tab 1.5 — Job Assignment (slice 6 follow-up).
// Edits the "operational" fields: which store(s) the employee works at,
// their role within the store's structure, derived department, hourly rate,
// management flag, kiosk PIN, and avatar colour. Lifted out of the existing
// edit modal so the employee profile becomes the canonical view.
//
// PIN uniqueness check: PINs must be globally unique across the org so the
// kiosk can identify staff from PIN alone (Q6 from kiosk auth design).
// Validated here with a soft warning rather than a hard block — the save
// will fail with a DB-level uniqueness error if the user persists.
function JobAssignmentTab({ employee, stores, storeRoles, storeDepartments, opsTeam, onUpdateEmployee, currentUser }) {
  const COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#a78bfa","#ec4899"];

  // Only owned, non-archived stores — same rule as the edit modal.
  // Franchise / JV stores excluded; if you ever need staff there, separate
  // workflow.
  const allowedStores = useMemo(
    () => (stores || []).filter(s => !s.archivedAt && s.ownershipModel === "owned"),
    [stores]
  );

  const [form, setFormState] = useState({
    primaryStoreId: employee.storeIds?.[0] || "",
    alsoStoreIds:   (employee.storeIds || []).slice(1),
    roleId:         employee.roleId || "",
    roleText:       employee.role || "",      // free-text fallback if no roleId match
    deptText:       employee.department || "",
    payType:        employee.payType || "hourly",
    hourlyRate:     employee.hourlyRate || 0,
    pin:            employee.pin || "",
    color:          employee.color || COLORS[0],
    // We don't expose isManagement here because it's derived from the role
    // (store_roles.is_management) — editing it on the employee record would
    // diverge from the source of truth. If a manager wants to change someone
    // to a management role, they pick a different role.
  });
  const set = (k, v) => setFormState(f => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);

  // Reset form when the employee changes (e.g. navigating between profiles)
  useEffect(() => {
    setFormState({
      primaryStoreId: employee.storeIds?.[0] || "",
      alsoStoreIds:   (employee.storeIds || []).slice(1),
      roleId:         employee.roleId || "",
      roleText:       employee.role || "",
      deptText:       employee.department || "",
      payType:        employee.payType || "hourly",
      hourlyRate:     employee.hourlyRate || 0,
      pin:            employee.pin || "",
      color:          employee.color || COLORS[0],
    });
  }, [employee?.id]);

  // Roles available for the primary store. We filter by store so manager
  // doesn't accidentally assign a role from a different store's structure.
  const rolesForStore = useMemo(
    () => (storeRoles || []).filter(r => r.storeId === form.primaryStoreId && !r.archivedAt),
    [storeRoles, form.primaryStoreId]
  );

  // When role is picked, auto-fill department from the role's department_id.
  const selectedRole = rolesForStore.find(r => r.id === form.roleId);
  const derivedDept  = selectedRole
    ? storeDepartments.find(d => d.id === selectedRole.departmentId)
    : null;

  // PIN duplicate check across the whole org (excluding self).
  // Surfaced as a warning, not a hard block — the DB-level uniqueness
  // constraint (if any) will catch genuine attempts to duplicate.
  const pinConflict = form.pin && (opsTeam || []).find(
    m => m.id !== employee.id && m.pin && m.pin === form.pin
  );

  const handleSave = async () => {
    if (!form.primaryStoreId) {
      alert("Please pick a primary store.");
      return;
    }
    setSaving(true);
    try {
      // Combine primary + also stores. De-duplicate in case manager picked
      // the primary in the "also" list too.
      const allStoreIds = [
        form.primaryStoreId,
        ...form.alsoStoreIds.filter(id => id && id !== form.primaryStoreId),
      ];

      // Status logic: if this employee was "pending_setup" and now has a
      // role assigned, flip to "active". If they had a role and we're just
      // updating other fields, keep current status. Don't touch archived.
      const willHaveRole = !!(selectedRole?.id || form.roleText.trim());
      const newStatus = employee.status === "pending_setup" && willHaveRole
        ? "active"
        : undefined;  // undefined = "don't change" via partial mapper

      // Derive brandId from primary store (legacy field still used in some
      // brand-keyed reports).
      const primary = allowedStores.find(s => s.id === form.primaryStoreId);
      const newBrandId = primary?.brandId || employee.brandId;

      await onUpdateEmployee({
        id:           employee.id,
        brandId:      newBrandId,
        storeIds:     allStoreIds,
        roleId:       selectedRole?.id || null,
        departmentId: derivedDept?.id || null,
        role:         selectedRole?.name || form.roleText.trim() || "",
        department:   derivedDept?.name || form.deptText.trim() || "",
        payType:      form.payType,
        hourlyRate:   parseFloat(form.hourlyRate) || 0,
        pin:          form.pin || "",
        color:        form.color,
        ...(newStatus ? { status: newStatus } : {}),
      });

      // Auto-capture pay history if pay actually changed.
      // Q3 = (a): only on actual change, no no-op rows.
      // Q2 = (b): effective_date defaults to today (the moment of save).
      //          A future tab feature could let manager backdate before saving.
      const oldAmount  = employee.hourlyRate || 0;
      const oldPayType = employee.payType || "hourly";
      const newAmount  = parseFloat(form.hourlyRate) || 0;
      const newPayType = form.payType || "hourly";
      const payChanged = oldAmount !== newAmount || oldPayType !== newPayType;
      if (payChanged) {
        try {
          await addPayHistory({
            employeeId:    employee.id,
            // Only set old_* if there was a previous non-zero pay. For
            // brand-new hires with no prior rate, leave old as null —
            // the history shows "Initial pay: £X".
            oldAmount:     oldAmount > 0 ? oldAmount : null,
            oldPayType:    oldAmount > 0 ? oldPayType : null,
            newAmount,
            newPayType,
            effectiveDate: new Date().toISOString().slice(0, 10),
            reason:        null,   // auto-capture has no reason; manager can edit via manual entry if needed
            authorId:      currentUser?.id,
            authorName:    currentUser?.name || currentUser?.email || "Unknown",
          });
        } catch (histErr) {
          // Don't fail the whole save if history insert fails — the pay
          // change has already been recorded in ops_team. Just log it.
          console.error("Pay history auto-capture failed:", histErr);
        }
      }
    } catch (err) {
      console.error("Job assignment save failed:", err);
      alert(`Could not save: ${err?.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const labelCls = "block text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1";
  const inputCls = "w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500";

  return (
    <div className="space-y-4 bg-slate-900 border border-slate-800 rounded-2xl p-5">
      {employee.status === "pending_setup" && (
        <div className="bg-amber-950/30 border border-amber-900/50 rounded-xl px-3 py-2 text-xs text-amber-300">
          <span className="font-semibold">⚠ Pending setup.</span> Fill in role and hourly rate, then save — status will flip to active.
        </div>
      )}

      <div>
        <label className={labelCls}>Primary store *</label>
        <select value={form.primaryStoreId} onChange={e => set("primaryStoreId", e.target.value)} className={inputCls}>
          <option value="">— Pick a store —</option>
          {allowedStores.map(s => (
            <option key={s.id} value={s.id}>{s.shortName || s.name}</option>
          ))}
        </select>
        <div className="text-[10px] text-slate-600 mt-1">
          The store this employee is primarily based at. Changing this also changes which roles are available below.
        </div>
      </div>

      <div>
        <label className={labelCls}>Also works at</label>
        <div className="space-y-1.5">
          {allowedStores
            .filter(s => s.id !== form.primaryStoreId)
            .map(s => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.alsoStoreIds.includes(s.id)}
                  onChange={e => {
                    if (e.target.checked) {
                      set("alsoStoreIds", [...form.alsoStoreIds, s.id]);
                    } else {
                      set("alsoStoreIds", form.alsoStoreIds.filter(id => id !== s.id));
                    }
                  }}
                  className="rounded"
                />
                {s.shortName || s.name}
              </label>
            ))}
        </div>
        {allowedStores.length <= 1 && (
          <div className="text-[10px] text-slate-600 mt-1">Only one store available — this employee can't be a floater.</div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Role *</label>
          {rolesForStore.length === 0 ? (
            <input
              value={form.roleText}
              onChange={e => set("roleText", e.target.value)}
              placeholder="e.g. Barista"
              className={inputCls}
            />
          ) : (
            <select
              value={form.roleId}
              onChange={e => set("roleId", e.target.value)}
              className={inputCls}
            >
              <option value="">— Pick a role —</option>
              {rolesForStore.map(r => (
                <option key={r.id} value={r.id}>{r.name}{r.isManagement ? " (mgmt)" : ""}</option>
              ))}
            </select>
          )}
          {rolesForStore.length === 0 && form.primaryStoreId && (
            <div className="text-[10px] text-amber-400 mt-1">⚠ No roles defined for this store. Add roles in Structure tab first.</div>
          )}
        </div>
        <div>
          <label className={labelCls}>Department</label>
          <div className={`${inputCls} text-slate-500`}>
            {derivedDept?.name || form.deptText || "— Auto-set from role —"}
          </div>
          <div className="text-[10px] text-slate-600 mt-1">Derived from role's department.</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Pay type</label>
          <select
            value={form.payType}
            onChange={e => set("payType", e.target.value)}
            className={inputCls}
          >
            {PAY_TYPE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div className="text-[10px] text-slate-600 mt-1">
            {form.payType === "hourly"
              ? "Paid per hour worked. Standard for shift staff."
              : "Fixed pay regardless of hours. Standard for salaried managers."}
          </div>
        </div>
        <div>
          <label className={labelCls}>Amount ({getPayTypeMeta(form.payType).unitLabel})</label>
          <input
            type="number"
            step={getPayTypeMeta(form.payType).step}
            min="0"
            value={form.hourlyRate}
            onChange={e => set("hourlyRate", e.target.value)}
            placeholder={getPayTypeMeta(form.payType).placeholder}
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Kiosk PIN</label>
          <input
            value={form.pin}
            onChange={e => set("pin", e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="4–6 digits"
            inputMode="numeric"
            className={inputCls}
          />
          {pinConflict && (
            <div className="text-[10px] text-amber-400 mt-1">
              ⚠ This PIN is already used by {pinConflict.firstName} {pinConflict.lastName}. PINs must be unique.
            </div>
          )}
        </div>
        <div>
          {/* Empty cell to keep grid balanced (formerly held hourly rate) */}
        </div>
      </div>

      <div>
        <label className={labelCls}>Avatar colour</label>
        <div className="flex gap-2">
          {COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => set("color", c)}
              className={`w-8 h-8 rounded-lg border-2 transition-all ${
                form.color === c ? "border-white scale-110" : "border-transparent opacity-70 hover:opacity-100"
              }`}
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving || !form.primaryStoreId}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// Tab 1.6 — Pay History (slice 6 follow-up).
// Append-only list of pay changes. Auto-populated when Job Assignment tab
// saves AND pay actually changed; manually populatable for backfilling
// historical data from before the system tracked it.
//
// Read-only after creation (Q4=a). Mistakes get a new entry referencing
// the original — same audit-trail logic as Notes.
function PayHistoryTab({ employeeId, employee, currentUser }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Manual entry form state (for backfilling historical changes).
  // Defaults reasonable for "I'm backfilling a pay change I forgot to record":
  //   - new_amount/type prefilled to current (manager edits as needed)
  //   - effective_date blank (must be set — backfills are inherently past-dated)
  //   - reason blank
  const [draftEntry, setDraftEntry] = useState({
    oldAmount:     "",
    oldPayType:    "hourly",
    newAmount:     employee?.hourlyRate ? String(employee.hourlyRate) : "",
    newPayType:    employee?.payType || "hourly",
    effectiveDate: "",
    reason:        "",
  });
  const setDraft = (k, v) => setDraftEntry(s => ({ ...s, [k]: v }));
  const [submitting, setSubmitting] = useState(false);

  // Load history when employee changes
  useEffect(() => {
    let cancelled = false;
    if (!employeeId) return;
    setLoading(true);
    fetchPayHistory(employeeId)
      .then(rows => { if (!cancelled) setHistory(rows); })
      .catch(err => { console.error("Pay history load failed:", err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employeeId]);

  const handleAddManual = async () => {
    if (!draftEntry.newAmount || isNaN(parseFloat(draftEntry.newAmount))) {
      alert("Please enter a valid new amount.");
      return;
    }
    if (!draftEntry.effectiveDate) {
      alert("Please set the effective date for this historical entry.");
      return;
    }
    setSubmitting(true);
    try {
      const inserted = await addPayHistory({
        employeeId,
        oldAmount:     draftEntry.oldAmount ? parseFloat(draftEntry.oldAmount) : null,
        oldPayType:    draftEntry.oldAmount ? draftEntry.oldPayType : null,
        newAmount:     parseFloat(draftEntry.newAmount),
        newPayType:    draftEntry.newPayType,
        effectiveDate: draftEntry.effectiveDate,
        reason:        draftEntry.reason,
        authorId:      currentUser?.id,
        authorName:    currentUser?.name || currentUser?.email || "Unknown",
      });
      // Insert into local list; resort defensively (server-sorted on next load)
      setHistory(prev => [inserted, ...prev].sort(
        (a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate)
      ));
      // Reset form, hide it
      setDraftEntry({
        oldAmount: "", oldPayType: "hourly",
        newAmount: employee?.hourlyRate ? String(employee.hourlyRate) : "",
        newPayType: employee?.payType || "hourly",
        effectiveDate: "", reason: "",
      });
      setShowAddForm(false);
    } catch (err) {
      console.error("Pay history manual entry failed:", err);
      alert(`Could not save: ${err?.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  const labelCls = "block text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1";
  const inputCls = "w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500";

  return (
    <div className="space-y-4">
      {/* Header + add button */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          Pay changes are recorded automatically when saved on the Job Assignment tab. Add a manual entry to backfill historical changes.
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700 flex-shrink-0"
          >
            + Add historical entry
          </button>
        )}
      </div>

      {/* Manual entry form (collapsible) */}
      {showAddForm && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Add historical pay change</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Previous amount (optional)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={draftEntry.oldAmount}
                onChange={e => setDraft("oldAmount", e.target.value)}
                placeholder="Leave blank for initial pay"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Previous pay type</label>
              <select
                value={draftEntry.oldPayType}
                onChange={e => setDraft("oldPayType", e.target.value)}
                className={inputCls}
                disabled={!draftEntry.oldAmount}
              >
                {PAY_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>New amount *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={draftEntry.newAmount}
                onChange={e => setDraft("newAmount", e.target.value)}
                placeholder="e.g. 13.00"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>New pay type *</label>
              <select
                value={draftEntry.newPayType}
                onChange={e => setDraft("newPayType", e.target.value)}
                className={inputCls}
              >
                {PAY_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Effective date *</label>
            <input
              type="date"
              value={draftEntry.effectiveDate}
              onChange={e => setDraft("effectiveDate", e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className={`${inputCls} cursor-pointer`}
              onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
            />
            <div className="text-[10px] text-slate-600 mt-1">When this rate started applying. For backfills, set to the actual historical date.</div>
          </div>
          <div>
            <label className={labelCls}>Reason (optional)</label>
            <input
              value={draftEntry.reason}
              onChange={e => setDraft("reason", e.target.value)}
              placeholder="e.g. Annual review, Promotion to senior barista, NMW increase"
              className={inputCls}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setShowAddForm(false)}
              disabled={submitting}
              className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAddManual}
              disabled={submitting}
              className="px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Add entry"}
            </button>
          </div>
        </div>
      )}

      {/* History list */}
      {loading ? (
        <div className="text-sm text-slate-500 text-center py-6">Loading pay history…</div>
      ) : history.length === 0 ? (
        <div className="text-sm text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
          <div className="font-semibold text-slate-400 mb-1">No pay history yet</div>
          <div className="text-xs text-slate-600">Changes made via the Job Assignment tab will appear here automatically.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map(h => (
            <div key={h.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-slate-200">
                  {h.oldAmount != null
                    ? <><span className="text-slate-500">{formatPayDisplay(h.oldAmount, h.oldPayType)}</span>{" → "}<span className="text-emerald-300 font-semibold">{formatPayDisplay(h.newAmount, h.newPayType)}</span></>
                    : <><span className="text-slate-500 italic">Initial pay: </span><span className="text-emerald-300 font-semibold">{formatPayDisplay(h.newAmount, h.newPayType)}</span></>
                  }
                </div>
                <div className="text-xs text-slate-500 flex-shrink-0">
                  Effective {new Date(h.effectiveDate).toLocaleDateString("en-GB")}
                </div>
              </div>
              {h.reason && (
                <div className="text-xs text-slate-400 mt-1.5 italic">"{h.reason}"</div>
              )}
              <div className="text-[10px] text-slate-600 mt-2">
                Recorded by {h.authorName} · {new Date(h.createdAt).toLocaleString("en-GB")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Tab 1.7 — Certifications (slice 6 follow-up).
// Compliance training records. Each cert has type, name, obtained date,
// expiry date, certificate number, issuing body. Color-coded by expiry
// status: green (valid), amber (expiring within 30 days), red (expired).
//
// Edit allowed for typos (Q5=b). Soft delete (archive) restricted to
// HQ/owner in this UI — enforced in app code, not at DB level.
function CertificationsTab({ employeeId, currentUser }) {
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingCert, setEditingCert] = useState(null);  // cert object | "new" | null
  const isHqOrOwner = currentUser?.role === "owner" || currentUser?.role === "hq_staff";

  useEffect(() => {
    let cancelled = false;
    if (!employeeId) return;
    setLoading(true);
    fetchEmployeeCertifications(employeeId)
      .then(rows => { if (!cancelled) setCerts(rows); })
      .catch(err => { console.error("Certs load failed:", err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employeeId]);

  const handleSave = async (cert) => {
    try {
      if (cert.id) {
        const updated = await updateEmployeeCertification(cert.id, cert);
        setCerts(prev => prev.map(c => c.id === updated.id ? updated : c));
      } else {
        const created = await addEmployeeCertification({
          employeeId,
          certType:          cert.certType,
          name:              cert.name,
          obtainedDate:      cert.obtainedDate,
          expiresDate:       cert.expiresDate,
          certificateNumber: cert.certificateNumber,
          issuingBody:       cert.issuingBody,
          notes:             cert.notes,
          createdById:       currentUser?.id,
          createdByName:     currentUser?.name || currentUser?.email || "Unknown",
        });
        setCerts(prev => [created, ...prev]);
      }
      setEditingCert(null);
    } catch (err) {
      console.error("Cert save failed:", err);
      alert(`Could not save: ${err?.message || err}`);
    }
  };

  const handleArchive = async (cert) => {
    if (!isHqOrOwner) {
      alert("Only HQ and owners can archive certifications. Edit instead if you need to fix a typo.");
      return;
    }
    if (!window.confirm(`Archive "${cert.name}"?\n\nThis hides the certification from the active list. The record is preserved in the database for compliance.`)) return;
    try {
      await archiveEmployeeCertification(cert.id);
      setCerts(prev => prev.filter(c => c.id !== cert.id));
    } catch (err) {
      console.error("Cert archive failed:", err);
      alert(`Could not archive: ${err?.message || err}`);
    }
  };

  // Summary: count of expiring + expired so manager sees at a glance
  const summary = useMemo(() => {
    let expiring = 0, expired = 0;
    certs.forEach(c => {
      const s = getCertExpiryStatus(c.expiresDate);
      if (s === "expiring") expiring++;
      else if (s === "expired") expired++;
    });
    return { expiring, expired };
  }, [certs]);

  return (
    <div className="space-y-4">
      {/* Header + summary + add */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-xs text-slate-500">
          Compliance training records. {certs.length === 0 ? "No certifications recorded yet." : `${certs.length} on file.`}
          {summary.expiring > 0 && <span className="text-amber-400 font-semibold"> · {summary.expiring} expiring soon</span>}
          {summary.expired > 0 && <span className="text-red-400 font-semibold"> · {summary.expired} expired</span>}
        </div>
        {editingCert === null && (
          <button
            onClick={() => setEditingCert("new")}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500"
          >
            + Add certification
          </button>
        )}
      </div>

      {/* Editor form (collapsible) */}
      {editingCert !== null && (
        <CertEditorForm
          item={editingCert === "new" ? null : editingCert}
          onSave={handleSave}
          onCancel={() => setEditingCert(null)}
        />
      )}

      {/* List */}
      {loading ? (
        <div className="text-sm text-slate-500 text-center py-6">Loading certifications…</div>
      ) : certs.length === 0 && editingCert === null ? (
        <div className="text-sm text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
          <div className="font-semibold text-slate-400 mb-1">No certifications yet</div>
          <div className="text-xs text-slate-600">Click "Add certification" to record training completed.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {certs.map(c => {
            const status = getCertExpiryStatus(c.expiresDate);
            const badgeColor = {
              valid:     "bg-emerald-950/40 border-emerald-900 text-emerald-300",
              expiring:  "bg-amber-950/40 border-amber-800 text-amber-300",
              expired:   "bg-red-950/40 border-red-900 text-red-300",
              no_expiry: "bg-slate-800 border-slate-700 text-slate-400",
            }[status];
            const badgeLabel = {
              valid:     "Valid",
              expiring:  "⚠ Expiring soon",
              expired:   "✗ Expired",
              no_expiry: "No expiry",
            }[status];
            return (
              <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-sm font-semibold text-slate-200">{c.name}</div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${badgeColor}`}>
                        {badgeLabel}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Obtained {new Date(c.obtainedDate).toLocaleDateString("en-GB")}
                      {c.expiresDate && <> · Expires {new Date(c.expiresDate).toLocaleDateString("en-GB")}</>}
                      {c.issuingBody && <> · {c.issuingBody}</>}
                    </div>
                    {c.certificateNumber && (
                      <div className="text-[11px] text-slate-600 mt-0.5">Cert #: {c.certificateNumber}</div>
                    )}
                    {c.notes && (
                      <div className="text-xs text-slate-400 italic mt-1.5">"{c.notes}"</div>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => setEditingCert(c)}
                      className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                      title="Edit"
                    >
                      <Edit size={13}/>
                    </button>
                    {isHqOrOwner && (
                      <button
                        onClick={() => handleArchive(c)}
                        className="p-2 rounded-xl bg-slate-800 text-slate-600 hover:text-red-400 hover:bg-red-950/20"
                        title="Archive (HQ/owner only)"
                      >
                        <Trash2 size={13}/>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Helper component — the certification add/edit form. Sub-component of
// CertificationsTab; lifted out so it can manage its own state without
// re-rendering the whole tab on every keystroke.
function CertEditorForm({ item, onSave, onCancel }) {
  const [form, setFormState] = useState({
    id:                item?.id || null,
    certType:          item?.certType || "food_hygiene_lvl_2",
    name:              item?.name || "",
    obtainedDate:      item?.obtainedDate || "",
    expiresDate:       item?.expiresDate || "",
    certificateNumber: item?.certificateNumber || "",
    issuingBody:       item?.issuingBody || "",
    notes:             item?.notes || "",
  });
  const set = (k, v) => setFormState(f => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);

  // When user picks a type, auto-fill the name from the type's label
  // (unless they've already typed a custom name). For "other" type, leave
  // name as-is so they can type their own.
  useEffect(() => {
    if (form.certType === "other") return;
    const meta = getCertTypeMeta(form.certType);
    // Only auto-fill if name is currently empty OR matches a different type's label
    const looksLikePresetLabel = CERTIFICATION_TYPES.some(t => t.label === form.name);
    if (!form.name || looksLikePresetLabel) {
      setFormState(f => ({ ...f, name: meta.label }));
    }
  }, [form.certType]);

  // When user picks obtained date AND type has a default validity, auto-fill
  // expiry. They can override before saving.
  useEffect(() => {
    if (!form.obtainedDate) return;
    if (form.expiresDate) return;   // don't overwrite if already set
    const meta = getCertTypeMeta(form.certType);
    if (!meta.defaultValidityMonths) return;
    const obtained = new Date(form.obtainedDate);
    if (isNaN(obtained.getTime())) return;
    const expires = new Date(obtained);
    expires.setMonth(expires.getMonth() + meta.defaultValidityMonths);
    setFormState(f => ({ ...f, expiresDate: expires.toISOString().slice(0, 10) }));
  }, [form.obtainedDate, form.certType]);

  const handleSubmit = async () => {
    if (!form.name?.trim()) { alert("Please enter a name for this certification."); return; }
    if (!form.obtainedDate) { alert("Please enter the date this certification was obtained."); return; }
    setSaving(true);
    try {
      await onSave({
        ...form,
        name: form.name.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  const labelCls = "block text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1";
  const inputCls = "w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
      <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
        {item ? "Edit certification" : "Add certification"}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Type *</label>
          <select
            value={form.certType}
            onChange={e => set("certType", e.target.value)}
            className={inputCls}
          >
            {CERTIFICATION_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Display name *</label>
          <input
            value={form.name}
            onChange={e => set("name", e.target.value)}
            placeholder={form.certType === "other" ? "Type the certification name" : "Auto-filled from type"}
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Obtained date *</label>
          <input
            type="date"
            value={form.obtainedDate}
            onChange={e => set("obtainedDate", e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className={`${inputCls} cursor-pointer`}
            onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
          />
        </div>
        <div>
          <label className={labelCls}>Expires date</label>
          <input
            type="date"
            value={form.expiresDate}
            onChange={e => set("expiresDate", e.target.value)}
            className={`${inputCls} cursor-pointer`}
            onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
          />
          <div className="text-[10px] text-slate-600 mt-1">
            {getCertTypeMeta(form.certType).defaultValidityMonths
              ? `Auto-filled from type's typical validity. Override if your certificate says different.`
              : `Leave blank if this certification doesn't expire.`
            }
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Certificate number</label>
          <input
            value={form.certificateNumber}
            onChange={e => set("certificateNumber", e.target.value)}
            placeholder="As printed on certificate"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Issuing body</label>
          <input
            value={form.issuingBody}
            onChange={e => set("issuingBody", e.target.value)}
            placeholder="e.g. Highfield, RSPH"
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Notes</label>
        <textarea
          value={form.notes}
          onChange={e => set("notes", e.target.value)}
          rows={2}
          placeholder="Any additional info (e.g. training provider, course details)"
          className={`${inputCls} resize-none`}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : (item ? "Save changes" : "Add certification")}
        </button>
      </div>
    </div>
  );
}

// Tab 1.8 — Documents (slice 7 stage 3).
// Right-to-work and compliance document storage. Each doc has a type
// (passport / BRP / share code / visa / other), an uploaded file, optional
// expiry date, certificate/reference number (stored in notes), and free notes.
// Color-coded by expiry status — same green/amber/red pattern as the
// Certifications tab (reuses getCertExpiryStatus).
//
// Upload is two-step: uploadEmployeeDocument(file) → { url, path }, then
// addEmployeeDocument({...}) with the returned IDs. Soft delete (archive)
// is HQ/owner only, enforced in app code. The file in Storage is NOT purged
// on archive — that's a separate GDPR action.
const RTW_DOC_TYPES = [
  { value: "rtw_passport",   label: "Passport" },
  { value: "rtw_brp",        label: "Biometric Residence Permit (BRP)" },
  { value: "rtw_share_code", label: "Share code" },
  { value: "rtw_visa",       label: "Visa" },
  { value: "rtw_other",      label: "Other RTW document" },
];
function getDocTypeLabel(value) {
  return RTW_DOC_TYPES.find(t => t.value === value)?.label || value;
}

function DocumentsTab({ employeeId, currentUser }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const isHqOrOwner = currentUser?.role === "owner" || currentUser?.role === "hq_staff";

  useEffect(() => {
    let cancelled = false;
    if (!employeeId) return;
    setLoading(true);
    fetchEmployeeDocuments(employeeId)
      .then(rows => { if (!cancelled) setDocs(rows); })
      .catch(err => { console.error("Documents load failed:", err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employeeId]);

  const handleAdd = async ({ file, docType, expiryDate, referenceNumber, notes }) => {
    // Two-step: upload file first, then insert the DB record. If the DB insert
    // fails after upload, the file is orphaned in Storage — acceptable for now
    // (no incident observed), flagged for a future cleanup job.
    const { url, path } = await uploadEmployeeDocument(file);
    const created = await addEmployeeDocument({
      employeeId,
      docType,
      fileUrl:        url,
      filePath:       path,
      fileName:       file.name,
      expiryDate:     expiryDate || null,
      // Reference/certificate number is folded into notes so we don't need a
      // separate column. Prefixed so it's machine-findable later if needed.
      notes:          [referenceNumber ? `Ref: ${referenceNumber}` : "", notes || ""].filter(Boolean).join(" — ") || null,
      uploadedById:   currentUser?.id,
      uploadedByName: currentUser?.name || currentUser?.email || "Unknown",
    });
    setDocs(prev => [created, ...prev]);
    setAdding(false);
  };

  const handleArchive = async (doc) => {
    if (!isHqOrOwner) {
      alert("Only HQ and owners can remove documents.");
      return;
    }
    if (!window.confirm(`Archive "${getDocTypeLabel(doc.docType)}"?\n\nThis hides the document from the active list. The record and file are preserved for compliance — use a GDPR purge to delete permanently.`)) return;
    try {
      await archiveEmployeeDocument(doc.id);
      setDocs(prev => prev.filter(d => d.id !== doc.id));
    } catch (err) {
      console.error("Document archive failed:", err);
      alert(`Could not archive: ${err?.message || err}`);
    }
  };

  // Sort by expiry: expired first, then expiring soon, then valid/no-expiry.
  // Within a group, soonest expiry first.
  const sortedDocs = useMemo(() => {
    const rank = { expired: 0, expiring: 1, valid: 2, no_expiry: 3 };
    return [...docs].sort((a, b) => {
      const ra = rank[getCertExpiryStatus(a.expiryDate)];
      const rb = rank[getCertExpiryStatus(b.expiryDate)];
      if (ra !== rb) return ra - rb;
      if (a.expiryDate && b.expiryDate) return new Date(a.expiryDate) - new Date(b.expiryDate);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [docs]);

  const summary = useMemo(() => {
    let expiring = 0, expired = 0;
    docs.forEach(d => {
      const s = getCertExpiryStatus(d.expiryDate);
      if (s === "expiring") expiring++;
      else if (s === "expired") expired++;
    });
    return { expiring, expired };
  }, [docs]);

  return (
    <div className="space-y-4">
      {/* Header + summary + add */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-xs text-slate-500">
          Right-to-work &amp; compliance documents. {docs.length === 0 ? "None on file yet." : `${docs.length} on file.`}
          {summary.expiring > 0 && <span className="text-amber-400 font-semibold"> · {summary.expiring} expiring soon</span>}
          {summary.expired > 0 && <span className="text-red-400 font-semibold"> · {summary.expired} expired</span>}
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500"
          >
            + Upload document
          </button>
        )}
      </div>

      {/* Upload form (collapsible) */}
      {adding && (
        <DocUploadForm
          onSave={handleAdd}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* List */}
      {loading ? (
        <div className="text-sm text-slate-500 text-center py-6">Loading documents…</div>
      ) : docs.length === 0 && !adding ? (
        <div className="text-sm text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
          <div className="font-semibold text-slate-400 mb-1">No documents yet</div>
          <div className="text-xs text-slate-600">Click "Upload document" to add a right-to-work record (passport, BRP, share code, visa).</div>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedDocs.map(d => {
            const status = getCertExpiryStatus(d.expiryDate);
            const badgeColor = {
              valid:     "bg-emerald-950/40 border-emerald-900 text-emerald-300",
              expiring:  "bg-amber-950/40 border-amber-800 text-amber-300",
              expired:   "bg-red-950/40 border-red-900 text-red-300",
              no_expiry: "bg-slate-800 border-slate-700 text-slate-400",
            }[status];
            const badgeLabel = {
              valid:     "Valid",
              expiring:  "⚠ Expiring soon",
              expired:   "✗ Expired",
              no_expiry: "No expiry",
            }[status];
            return (
              <div key={d.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileText size={14} className="text-slate-500 flex-shrink-0"/>
                      <div className="text-sm font-semibold text-slate-200">{getDocTypeLabel(d.docType)}</div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${badgeColor}`}>
                        {badgeLabel}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Uploaded {new Date(d.createdAt).toLocaleDateString("en-GB")} by {d.uploadedByName}
                      {d.expiryDate && <> · Expires {new Date(d.expiryDate).toLocaleDateString("en-GB")}</>}
                    </div>
                    {d.fileName && (
                      <div className="text-[11px] text-slate-600 mt-0.5 truncate">{d.fileName}</div>
                    )}
                    {d.notes && (
                      <div className="text-xs text-slate-400 italic mt-1.5">"{d.notes}"</div>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <a
                      href={d.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                      title="View document"
                    >
                      <Eye size={13}/>
                    </a>
                    {isHqOrOwner && (
                      <button
                        onClick={() => handleArchive(d)}
                        className="p-2 rounded-xl bg-slate-800 text-slate-600 hover:text-red-400 hover:bg-red-950/20"
                        title="Archive (HQ/owner only)"
                      >
                        <Trash2 size={13}/>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Helper component — the document upload form. Sub-component of DocumentsTab.
// Handles file selection + validation client-side before the two-step upload.
function DocUploadForm({ onSave, onCancel }) {
  const [docType, setDocType]         = useState("rtw_passport");
  const [file, setFile]               = useState(null);
  const [expiryDate, setExpiryDate]   = useState("");
  const [referenceNumber, setRefNum]  = useState("");
  const [notes, setNotes]             = useState("");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  const ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf";
  const VALID_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

  const handleFile = (f) => {
    setError("");
    if (!f) { setFile(null); return; }
    if (!VALID_TYPES.includes(f.type)) {
      setError("Only JPG, PNG, WEBP, or PDF files are accepted.");
      setFile(null);
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError(`File is too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`);
      setFile(null);
      return;
    }
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!file) { setError("Please choose a file to upload."); return; }
    setSaving(true);
    setError("");
    try {
      await onSave({ file, docType, expiryDate, referenceNumber, notes });
    } catch (err) {
      console.error("Document upload failed:", err);
      setError(err?.message || "Upload failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const labelCls = "block text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1";
  const inputCls = "w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
      <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
        Upload right-to-work document
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Document type *</label>
          <select
            value={docType}
            onChange={e => setDocType(e.target.value)}
            className={inputCls}
          >
            {RTW_DOC_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Expiry date</label>
          <input
            type="date"
            value={expiryDate}
            onChange={e => setExpiryDate(e.target.value)}
            className={`${inputCls} cursor-pointer`}
            onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
          />
          <div className="text-[10px] text-slate-600 mt-1">
            Leave blank if this document doesn't expire (e.g. a UK passport you only need on file).
          </div>
        </div>
      </div>

      <div>
        <label className={labelCls}>File * <span className="text-slate-600 normal-case tracking-normal">(JPG, PNG, WEBP, or PDF — max 10 MB)</span></label>
        <input
          type="file"
          accept={ACCEPT}
          onChange={e => handleFile(e.target.files?.[0] || null)}
          className="w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-indigo-600 file:text-white file:text-xs file:font-semibold file:cursor-pointer hover:file:bg-indigo-500"
        />
        {file && (
          <div className="text-[11px] text-emerald-400 mt-1.5 flex items-center gap-1.5">
            <FileText size={12}/> {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Reference / share code</label>
          <input
            value={referenceNumber}
            onChange={e => setRefNum(e.target.value)}
            placeholder="e.g. passport no. or share code"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any additional info"
            className={inputCls}
          />
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || !file}
          className="px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 disabled:opacity-50 flex items-center gap-1.5"
        >
          <Upload size={13}/> {saving ? "Uploading…" : "Upload document"}
        </button>
      </div>
    </div>
  );
}

// Tab 2 — Linked Application (read-only)
function LinkedApplicationTab({ linkedApp, loading, stores }) {
  if (loading) {
    return (
      <div className="text-sm text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
        Loading linked application…
      </div>
    );
  }
  if (!linkedApp) {
    return (
      <div className="text-sm text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-2">
        <div className="font-semibold text-slate-400">No linked application</div>
        <div className="text-xs text-slate-600">This employee was added manually rather than through the hiring workflow.</div>
      </div>
    );
  }
  const store = stores.find(s => s.id === linkedApp.storeId);
  return (
    <div className="space-y-4 bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
        <DetailField label="Applied for"  value={linkedApp.position || "—"}/>
        <DetailField label="Applied via"  value={linkedApp.source === "public_form" ? "Public /apply form" : "Manager capture"}/>
        <DetailField label="Applied on"   value={new Date(linkedApp.createdAt).toLocaleDateString("en-GB")}/>
        <DetailField label="Hired on"     value={linkedApp.archivedAt ? new Date(linkedApp.archivedAt).toLocaleDateString("en-GB") : "—"}/>
        <DetailField label="Store"        value={store?.shortName || store?.name || "—"}/>
        <DetailField label="Status"       value={linkedApp.status || "—"}/>
      </div>
      {linkedApp.relevantExperience && <DetailField label="Relevant experience" value={linkedApp.relevantExperience} full/>}
      {linkedApp.resumeText && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold mb-1.5">Resume / CV at time of application</div>
          <pre className="text-xs text-slate-200 bg-slate-950 border border-slate-800 rounded-xl p-3 max-h-64 overflow-y-auto whitespace-pre-wrap font-mono">{linkedApp.resumeText}</pre>
        </div>
      )}
      <div className="text-[10px] text-slate-600 italic">
        Read-only snapshot. The current employee record (Personal & HR tab) may have been updated since.
      </div>
    </div>
  );
}

// Tab 3 — Notes (append-only)
function NotesTab({ employeeId, notes, setNotes, loading, currentUser }) {
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const handlePost = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      const newNote = await addEmployeeNote({
        employeeId,
        content:    draft,
        authorId:   currentUser?.id,
        authorName: currentUser?.name || currentUser?.email || "Unknown",
      });
      setNotes(prev => [newNote, ...prev]);
      setDraft("");
    } catch (err) {
      console.error("Note post failed:", err);
      alert(`Could not save note: ${err?.message || err}`);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* New note composer */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Add a note about this employee… (e.g. trained on espresso machine today; agreed to swap shifts with Alice next Friday)"
          rows={3}
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
        />
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-slate-600">
            Notes are append-only. To correct an old note, add a new one referencing it.
          </div>
          <button
            onClick={handlePost}
            disabled={posting || !draft.trim()}
            className="px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 disabled:opacity-50"
          >
            {posting ? "Posting…" : "Add note"}
          </button>
        </div>
      </div>

      {/* Notes list */}
      {loading ? (
        <div className="text-sm text-slate-500 text-center py-6">Loading notes…</div>
      ) : notes.length === 0 ? (
        <div className="text-sm text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
          No notes yet. Add the first one above.
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map(n => (
            <div key={n.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <div className="text-sm text-slate-200 whitespace-pre-wrap">{n.content}</div>
              <div className="text-[10px] text-slate-600 mt-2">
                {n.authorName} · {new Date(n.createdAt).toLocaleString("en-GB")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Application Form Modal ───────────────────────────────────────────────────
function ApplicationFormModal({ brands, stores, storeRoles, item, onSave, onClose }) {
  // Decide initial positionChoice for edits. If the existing position string
  // exactly matches one of the current store's advertised role names,
  // pre-select that role. If it matches a role that's NOT advertised
  // (e.g. captured before advertising was toggled), still pre-select it
  // so we don't lose the data. If no match, treat as "Other"-style free text.
  const initialChoice = (() => {
    if (!item?.position) return "";
    const matchingRole = (storeRoles || []).find(r =>
      r.storeId === item.storeId && !r.archivedAt && r.name === item.position
    );
    return matchingRole ? item.position : "__other__";
  })();

  const [form, setForm] = useState({
    firstName:           item?.firstName           || "",
    lastName:            item?.lastName            || "",
    email:               item?.email               || "",
    phone:               item?.phone               || "",
    position:            item?.position            || "",
    positionChoice:      initialChoice,
    storeId:             item?.storeId             || stores[0]?.id || "",
    availabilityNotes:   item?.availabilityNotes   || "",
    applicantNotes:      item?.applicantNotes      || "",
    rtwVerified:         item?.rtwVerified         || false,
    source:              item?.source              || "manager_capture",
    // ── Slice 3 fields (all optional in this modal — manager fills what they can) ──
    dateOfBirth:         item?.dateOfBirth         || "",
    legalStatus:         item?.legalStatus         || "",
    address:             item?.address             || "",
    relevantExperience:  item?.relevantExperience  || "",
    resumeText:          item?.resumeText          || "",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const showBrandPrefix = new Set(stores.map(s => s.brandId)).size > 1;

  // Roles for the currently-selected store. Internal modal shows ALL active
  // roles regardless of advertise_for_hiring (since the manager is capturing
  // a walk-in, not picking from a public listing). This matches existing
  // behaviour and avoids breaking the manager's flow when they want to
  // capture a candidate for a role that isn't publicly advertised yet.
  const availableRoles = useMemo(
    () => (storeRoles || []).filter(r => r.storeId === form.storeId && !r.archivedAt),
    [storeRoles, form.storeId]
  );
  const useRoleDropdown = !!form.storeId && availableRoles.length > 0;

  // If the manager changes the store, the previously-chosen role may not
  // exist at the new store. Reset positionChoice; keep position text only
  // if they were typing it freely ("__other__"), otherwise clear it too.
  useEffect(() => {
    setForm(f => ({
      ...f,
      positionChoice: "",
      position: f.positionChoice === "__other__" ? f.position : "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.storeId]);

  const handleSave = () => {
    if (!form.firstName.trim()) { alert("First name is required."); return; }
    if (!form.storeId)          { alert("Please pick a store."); return; }
    const store = stores.find(s => s.id === form.storeId);
    onSave({
      id:                  item?.id || `app-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      brandId:             store?.brandId || item?.brandId,
      storeId:             form.storeId,
      firstName:           form.firstName.trim(),
      lastName:            form.lastName.trim(),
      email:               form.email.trim(),
      phone:               form.phone.trim(),
      position:            form.position.trim(),
      availabilityNotes:   form.availabilityNotes.trim(),
      applicantNotes:      form.applicantNotes.trim(),
      source:              form.source,
      rtwVerified:         form.rtwVerified,
      status:              item?.status || "applied",
      // Slice 3 — pass through (server-side null-tolerates blanks)
      dateOfBirth:         form.dateOfBirth || null,
      legalStatus:         form.legalStatus || "",
      address:             form.address.trim(),
      relevantExperience:  form.relevantExperience.trim(),
      resumeText:          form.resumeText.trim(),
      isMinor:             isUnder18(form.dateOfBirth),
      // Preserve photo if editing — modal doesn't upload, so keep existing URL
      photoUrl:            item?.photoUrl || null,
      photoPath:           item?.photoPath || null,
    });
  };

  return (
    <Modal title={item ? `Edit Application — ${item.firstName} ${item.lastName || ""}` : "New Application"} onClose={onClose} maxW="max-w-2xl"
      footer={<>
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">Cancel</button>
        <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500">{item ? "Save" : "Create"}</button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>First Name *</label><input value={form.firstName} onChange={e => set("firstName", e.target.value)} className={inputCls}/></div>
          <div><label className={labelCls}>Last Name</label><input value={form.lastName} onChange={e => set("lastName", e.target.value)} className={inputCls}/></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>Email</label><input type="email" value={form.email} onChange={e => set("email", e.target.value)} className={inputCls}/></div>
          <div><label className={labelCls}>Phone</label><input value={form.phone} onChange={e => set("phone", e.target.value)} className={inputCls}/></div>
        </div>
        <div>
          <label className={labelCls}>Store *</label>
          <select value={form.storeId} onChange={e => set("storeId", e.target.value)} className={inputCls}>
            <option value="">— Pick a store —</option>
            {stores.map(s => {
              const b = brands.find(br => br.id === s.brandId);
              return <option key={s.id} value={s.id}>{showBrandPrefix && b ? `${b.name} · ` : ""}{s.shortName || s.name}</option>;
            })}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Position</label>
            {useRoleDropdown ? (
              <>
                <select
                  value={form.positionChoice}
                  onChange={e => {
                    const v = e.target.value;
                    if (v === "__other__") {
                      setForm(f => ({ ...f, positionChoice: v, position: "" }));
                    } else {
                      setForm(f => ({ ...f, positionChoice: v, position: v }));
                    }
                  }}
                  className={inputCls}
                >
                  <option value="">— Pick a role —</option>
                  {availableRoles.map(r => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                  <option value="__other__">Other (specify)</option>
                </select>
                {form.positionChoice === "__other__" && (
                  <input
                    value={form.position}
                    onChange={e => set("position", e.target.value)}
                    placeholder="Type the position"
                    className={`${inputCls} mt-2`}
                  />
                )}
              </>
            ) : (
              <input
                value={form.position}
                onChange={e => set("position", e.target.value)}
                placeholder={form.storeId ? "No roles defined for this store yet" : "Pick a store first"}
                className={inputCls}
              />
            )}
          </div>
          <div>
            <label className={labelCls}>Source</label>
            <select value={form.source} onChange={e => set("source", e.target.value)} className={inputCls}>
              <option value="manager_capture">Manager captured</option>
              <option value="referral">Referral</option>
              <option value="walk_in">Walk-in</option>
              <option value="public_form">Public form</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Availability</label>
          <input value={form.availabilityNotes} onChange={e => set("availabilityNotes", e.target.value)} placeholder="e.g. Weekends only, full-time, mornings…" className={inputCls}/>
        </div>
        {/* Slice 3 — extra candidate info. All optional in this internal
            modal: manager captures what they have, candidate can fill in
            the rest via the upcoming candidate portal. */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Date of Birth</label>
            <input
              type="date"
              value={form.dateOfBirth}
              onChange={e => set("dateOfBirth", e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className={inputCls}
            />
            {form.dateOfBirth && isUnder18(form.dateOfBirth) && (
              <div className="text-[11px] text-amber-400 mt-1">⚠ Applicant under 18 — restricted hours apply.</div>
            )}
          </div>
          <div>
            <label className={labelCls}>Legal Status</label>
            <select value={form.legalStatus} onChange={e => set("legalStatus", e.target.value)} className={inputCls}>
              <option value="">— Not set —</option>
              {LEGAL_STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Address</label>
          <input value={form.address} onChange={e => set("address", e.target.value)} placeholder="Street, town, postcode" className={inputCls}/>
        </div>
        <div>
          <label className={labelCls}>Relevant Experience</label>
          <textarea value={form.relevantExperience} onChange={e => set("relevantExperience", e.target.value)} rows={3} placeholder="Previous hospitality / customer-service experience…" className={`${inputCls} resize-none`}/>
        </div>
        <div>
          <label className={labelCls}>Resume / CV (paste)</label>
          <textarea value={form.resumeText} onChange={e => set("resumeText", e.target.value)} rows={5} placeholder="Optional — paste resume text here if available." className={`${inputCls} resize-none font-mono text-xs`}/>
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <textarea value={form.applicantNotes} onChange={e => set("applicantNotes", e.target.value)} rows={2} placeholder="Anything else relevant…" className={`${inputCls} resize-none`}/>
        </div>
        <div className="flex items-start gap-3 bg-slate-950 border border-slate-800 rounded-xl p-3">
          <input type="checkbox" id="rtw-verified" checked={form.rtwVerified} onChange={e => set("rtwVerified", e.target.checked)} className="mt-0.5"/>
          <label htmlFor="rtw-verified" className="flex-1 cursor-pointer">
            <div className="text-sm font-semibold text-slate-200">Right-to-work verified</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Tick if you've seen and recorded valid RTW documents. Required before any paid work, including trial shifts.</div>
          </label>
        </div>
      </div>
    </Modal>
  );
}

// ─── Compliance View ──────────────────────────────────────────────────────────
function ComplianceView({ brands, stores, visibleStoreIds, assignments, auditTrail }) {
  const { user } = useAuth();

  const allVisibleStores = useMemo(
    () => (stores || []).filter(s => visibleStoreIds?.includes(s.id) && !s.archivedAt),
    [stores, visibleStoreIds]
  );
  const [ownership, setOwnership] = useState(isHqOrAbove(user.role) ? "owned" : "all");
  const visibleStores = useMemo(
    () => applyOwnershipFilter(allVisibleStores, ownership, user.role),
    [allVisibleStores, ownership, user.role]
  );

  // Stores sorted alphabetically within their brand for stable display.
  const sortedStores = useMemo(
    () => [...visibleStores].sort((a, b) =>
      (a.brandId || "").localeCompare(b.brandId || "") ||
      (a.shortName || a.name || "").localeCompare(b.shortName || b.name || "")),
    [visibleStores]
  );

  // For each store, find its in-scope assignments + completions.
  //   - Store-keyed assignments are direct.
  //   - Legacy assignments without store_id are counted against the BRAND
  //     they belong to. That brand-level count gets divided evenly across
  //     the brand's stores so the rolldown is at least consistent.
  // The same logic applies to audit trail sign-off rows.
  const rowFor = (store) => {
    // Direct store assignments
    const direct = assignments.filter(a => a.storeId === store.id && isActiveToday(a));
    // Brand-fallback assignments (no store_id) — fairly split across brand stores
    const brandStores = sortedStores.filter(s => s.brandId === store.brandId);
    const legacyBrand = assignments.filter(a => !a.storeId && a.brandId === store.brandId && isActiveToday(a));
    const legacyShare = brandStores.length > 0 ? legacyBrand.length / brandStores.length : 0;

    const la = direct.length + Math.round(legacyShare);
    const od = direct.filter(isOverdue).length;

    const directDone = auditTrail.filter(t =>
      t.storeId === store.id && t.date === getTodayStr() && t.action.includes("sign-off")
    ).length;
    const legacyDoneBrand = auditTrail.filter(t =>
      !t.storeId && t.brandId === store.brandId && t.date === getTodayStr() && t.action.includes("sign-off")
    ).length;
    const done = directDone + Math.round(brandStores.length > 0 ? legacyDoneBrand / brandStores.length : 0);

    const rate = la > 0 ? Math.round((done / la) * 100) : 0;
    const rag = od > 0 ? "red" : (la > 0 && rate >= 80) ? "green" : "amber";
    return { la, od, done, rate, rag };
  };

  if (allVisibleStores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <CheckSquare size={32} className="mb-3 text-slate-700"/>
        <div className="text-sm font-semibold">No stores assigned to your account.</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs text-slate-600">{sortedStores.length} store{sortedStores.length === 1 ? "" : "s"}</div>
      </div>
      <AnalysisBlock title="Compliance Overview — Today">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700">
                {["Store","Brand","Assignments","Overdue","Completed","Rate","RAG"].map(h =>
                  <th key={h} className="px-3 py-2 text-left text-slate-600 font-semibold">{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedStores.map(store => {
                const brand = brands.find(b => b.id === store.brandId);
                const { la, od, done, rate, rag } = rowFor(store);
                return (
                  <tr key={store.id} className="border-b border-slate-800/60">
                    <td className="px-3 py-3 font-semibold text-slate-200">{store.shortName || store.name}</td>
                    <td className="px-3 py-3 text-slate-500">{brand?.name || store.brandId}</td>
                    <td className="px-3 py-3 text-slate-700">{la}</td>
                    <td className="px-3 py-3">{od ? <Badge label={`⚠ ${od}`} color="red"/> : <Badge label="✓ 0" color="green"/>}</td>
                    <td className="px-3 py-3 text-slate-700">{done}</td>
                    <td className="px-3 py-3"><span className={`font-bold font-mono ${rate>=80?"text-emerald-400":rate>=50?"text-amber-400":"text-red-400"}`}>{la ? rate+"%" : "—"}</span></td>
                    <td className="px-3 py-3"><Badge label={rag === "red" ? "Red" : rag === "green" ? "Green" : "Amber"} color={rag}/></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AnalysisBlock>
    </div>
  );
}

// ─── Audit Trail View ─────────────────────────────────────────────────────────
function AuditTrailView({ brands, stores, visibleStoreIds, auditTrail, onClear }) {
  const { user } = useAuth();

  // Standard store-scope pattern (same as every other refactored view).
  // visibleStoreIds is HQ/owner = all, manager = their assigned stores.
  const allVisibleStores = useMemo(
    () => (stores || []).filter(s => visibleStoreIds?.includes(s.id) && !s.archivedAt),
    [stores, visibleStoreIds]
  );
  const [ownership, setOwnership] = useState(isHqOrAbove(user.role) ? "owned" : "all");
  const visibleStores = useMemo(
    () => applyOwnershipFilter(allVisibleStores, ownership, user.role),
    [allVisibleStores, ownership, user.role]
  );
  const [selStore, setSelStore] = useState("all");
  useEffect(() => {
    if (selStore !== "all" && !visibleStores.some(s => s.id === selStore)) {
      setSelStore("all");
    }
  }, [visibleStores, selStore]);

  const inScopeStoreIds = useMemo(() => new Set(visibleStores.map(s => s.id)), [visibleStores]);
  const visibleBrandIds = useMemo(() => new Set(visibleStores.map(s => s.brandId)), [visibleStores]);

  // Audit rows may or may not have storeId yet (older logs only had brandId).
  // Store-keyed rows win; legacy rows fall back to brand membership.
  const inScope = (t) => {
    if (t.storeId) {
      if (selStore === "all") return inScopeStoreIds.has(t.storeId);
      return t.storeId === selStore;
    }
    if (isHqOrAbove(user.role)) return true;
    return visibleBrandIds.has(t.brandId);
  };

  const visible = auditTrail
    .filter(inScope)
    .sort((a, b) => b.timestamp?.localeCompare(a.timestamp || "") || 0);

  const actionColor = action =>
    action.includes("sign-off") || action.includes("completed") ? "text-emerald-400"
    : action.includes("breach")  ? "text-red-400"
    : action.includes("logged")  ? "text-amber-400"
    : "text-indigo-400";

  if (allVisibleStores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <ScrollText size={32} className="mb-3 text-slate-700"/>
        <div className="text-sm font-semibold">No stores assigned to your account.</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <StoreScopeDropdown stores={visibleStores} brands={brands} value={selStore} onChange={setSelStore} className="w-64"/>
        </div>
        {isHqOrAbove(user.role) && <button onClick={onClear} className="text-xs text-red-400 hover:text-red-300">Clear all entries</button>}
      </div>
      {visible.length === 0 && <div className="flex flex-col items-center justify-center py-16 text-slate-500"><ScrollText size={32} className="mb-3 text-slate-700"/><div className="text-sm font-semibold">No audit entries yet</div></div>}
      <AnalysisBlock title={`Audit Trail — ${visible.length} entries`}>
        <div className="space-y-3">{visible.slice(0,100).map(t => {
          const brand = brands.find(b => b.id === t.brandId);
          const store = t.storeId ? stores?.find(s => s.id === t.storeId) : null;
          return (
            <div key={t.id} className="flex items-start gap-3 py-2.5 border-b border-slate-800/60 last:border-0">
              <div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 bg-indigo-400"/>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold ${actionColor(t.action)}`}>
                  {t.action}
                  {brand && ` — ${brand.name}`}
                  {store && <span className="text-slate-500"> · {store.shortName || store.name}</span>}
                </div>
                <div className="text-xs text-slate-600 mt-0.5">{t.detail}</div>
                <div className="text-xs text-slate-600 mt-0.5 font-mono">{t.date} {t.time} · By: {t.by}</div>
              </div>
            </div>
          );
        })}</div>
      </AnalysisBlock>
    </div>
  );
}

// ─── Ops Settings View ────────────────────────────────────────────────────────
// ─── Ops Settings modals (proper top-level components — no hooks-in-callbacks) ──

function TempUnitFormModal({ item, brands, stores = [], onSave, onClose }) {
  // Same logic as OpsTeamMemberFormModal: temp units are physical equipment
  // installed at company-owned stores. Franchise/JV stores manage their own.
  const allowedStores = useMemo(
    () => (stores || []).filter(s => !s.archivedAt && s.ownershipModel === "owned"),
    [stores]
  );

  const [form, setFormState] = useState({
    name: item?.name || "", type: item?.type || "fridge",
    storeId: item?.storeId || allowedStores[0]?.id || "",
    brandId: item?.brandId || "",   // legacy fallback; we derive from store on save
    min: item?.min ?? "", max: item?.max ?? "",
    assignRole: item?.assignRole || "",
  });
  const set = (k, v) => setFormState(f => ({ ...f, [k]: v }));

  const showBrandPrefix = new Set(allowedStores.map(s => s.brandId)).size > 1;

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (!form.storeId)     { alert("Please pick a store."); return; }
    const store = allowedStores.find(s => s.id === form.storeId);
    onSave({
      id: item?.id || `tu-${Date.now()}`,
      ...form,
      brandId: store?.brandId || form.brandId,  // derived from the selected store
      min: form.min !== "" ? parseFloat(form.min) : null,
      max: form.max !== "" ? parseFloat(form.max) : null,
    });
  };

  return (
    <Modal title={item ? `Edit — ${item.name}` : "Add Temp Unit"} onClose={onClose}
      footer={<><button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">Cancel</button><button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500">{item ? "Save" : "Add"}</button></>}>
      <div className="space-y-4">
        <div><label className={labelCls}>Name *</label><input value={form.name} onChange={e => set("name", e.target.value)} className={inputCls}/></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>Type</label><select value={form.type} onChange={e => set("type", e.target.value)} className={inputCls}><option value="fridge">Fridge 🧊</option><option value="freezer">Freezer ❄️</option><option value="hot">Hot Hold 🔥</option></select></div>
          <div>
            <label className={labelCls}>Store *</label>
            {allowedStores.length === 0 ? (
              <div className="text-xs text-amber-400 bg-amber-950/30 border border-amber-500/30 rounded-lg px-3 py-2">No owned stores available.</div>
            ) : (
              <select value={form.storeId} onChange={e => set("storeId", e.target.value)} className={inputCls}>
                <option value="">— Pick a store —</option>
                {allowedStores.map(s => {
                  const b = brands.find(br => br.id === s.brandId);
                  return <option key={s.id} value={s.id}>{showBrandPrefix && b ? `${b.name} · ` : ""}{s.shortName || s.name}</option>;
                })}
              </select>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>Min temp (°C)</label><input type="number" step="0.5" value={form.min} onChange={e => set("min", e.target.value)} placeholder="Leave blank if none" className={inputCls}/></div>
          <div><label className={labelCls}>Max temp (°C)</label><input type="number" step="0.5" value={form.max} onChange={e => set("max", e.target.value)} placeholder="Leave blank if none" className={inputCls}/></div>
        </div>
        <div><label className={labelCls}>Responsible Role</label><input value={form.assignRole} onChange={e => set("assignRole", e.target.value)} placeholder="e.g. Head Chef" className={inputCls}/></div>
      </div>
    </Modal>
  );
}

function CleaningTaskFormModal({ item, brands = [], stores = [], onSave, onClose }) {
  // Per-store cleaning tasks. brand_id is derived from the chosen store
  // so legacy code that filters by brand still works.
  const allowedStores = useMemo(
    () => (stores || []).filter(s => !s.archivedAt && s.ownershipModel === "owned"),
    [stores]
  );
  const [form, setFormState] = useState({
    name: item?.name || "", area: item?.area || "Kitchen",
    freq: item?.freq || "Daily - Opening",
    assignRole: item?.assignRole || "", notes: item?.notes || "",
    storeId: item?.storeId || allowedStores[0]?.id || "",
    brandId: item?.brandId || "",
  });
  const set = (k, v) => setFormState(f => ({ ...f, [k]: v }));
  const showBrandPrefix = new Set(allowedStores.map(s => s.brandId)).size > 1;

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (!form.storeId)     { alert("Please pick a store."); return; }
    const store = allowedStores.find(s => s.id === form.storeId);
    onSave({
      id: item?.id || `ct-${Date.now()}`,
      ...form,
      brandId: store?.brandId || form.brandId,
    });
  };
  return (
    <Modal title={item ? `Edit — ${item.name}` : "Add Cleaning Task"} onClose={onClose}
      footer={<><button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">Cancel</button><button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500">{item ? "Save" : "Add"}</button></>}>
      <div className="space-y-4">
        <div><label className={labelCls}>Task Name *</label><input value={form.name} onChange={e => set("name", e.target.value)} className={inputCls}/></div>
        <div>
          <label className={labelCls}>Store *</label>
          {allowedStores.length === 0 ? (
            <div className="text-xs text-amber-400 bg-amber-950/30 border border-amber-500/30 rounded-lg px-3 py-2">No owned stores available.</div>
          ) : (
            <select value={form.storeId} onChange={e => set("storeId", e.target.value)} className={inputCls}>
              <option value="">— Pick a store —</option>
              {allowedStores.map(s => {
                const b = brands.find(br => br.id === s.brandId);
                return <option key={s.id} value={s.id}>{showBrandPrefix && b ? `${b.name} · ` : ""}{s.shortName || s.name}</option>;
              })}
            </select>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>Area</label><input value={form.area} onChange={e => set("area", e.target.value)} placeholder="Kitchen, FOH…" className={inputCls}/></div>
          <div><label className={labelCls}>Frequency</label><input value={form.freq} onChange={e => set("freq", e.target.value)} placeholder="Daily - Opening…" className={inputCls}/></div>
        </div>
        <div><label className={labelCls}>Assigned Role</label><input value={form.assignRole} onChange={e => set("assignRole", e.target.value)} placeholder="e.g. Kitchen Porter" className={inputCls}/></div>
        <div><label className={labelCls}>Notes</label><textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="Instructions…"/></div>
      </div>
    </Modal>
  );
}

function OpsTeamMemberFormModal({
  item, brands,
  // New: store-driven structure
  stores = [], visibleStoreIds = [],
  storeDepartments = [], storeRoles = [],
  // Existing roster — used to check PIN uniqueness across the whole org
  // (Q6 from kiosk auth design: PINs must be globally unique so the kiosk
  // can identify staff from PIN alone, regardless of which store they're
  // punching in at).
  opsTeam = [],
  // ── Slice 5 (refined) ─────────────────────────────────────────────────
  // When set, the modal opens pre-filled with this application's data, the
  // title indicates a hire flow, and the Save button creates an ops_team
  // entry AND archives the application atomically. When null/undefined, the
  // modal behaves like the existing add/edit flow.
  prefillApplication = null,
  onSave, onClose,
}) {
  const COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#a78bfa","#ec4899"];

  // Stores a manager (or owner/HQ) can assign staff to.
  //
  // IMPORTANT: This is intentionally NOT the same as the user's "scope" of
  // stores they can manage. A manager only manages 2 stores, but a staff
  // member they're adding might be a floater who works across several owned
  // stores company-wide. The dropdown therefore shows ALL owned stores
  // (excluding archived), regardless of who's adding the team member.
  //
  // Franchise / joint-venture stores are excluded — those are managed by
  // their own teams, not company HQ. If you ever need to add staff at a JV
  // or franchise store, that's a separate workflow.
  const allowedStores = useMemo(
    () => (stores || []).filter(s => !s.archivedAt && s.ownershipModel === "owned"),
    [stores]
  );

  // Initial form. Three sources of seed data, in priority order:
  //   1. Existing item (edit mode)
  //   2. Prefill from application (hire flow)
  //   3. Blank (manual add)
  const initialPrimary =
    item?.storeIds?.[0] ||
    prefillApplication?.storeId ||
    "";
  const initialAlsoAt  = (item?.storeIds || []).slice(1);

  const [form, setFormState] = useState({
    // Identity — seed from item OR application
    firstName:    item?.firstName    || prefillApplication?.firstName    || "",
    lastName:     item?.lastName     || prefillApplication?.lastName     || "",
    nickname:     item?.nickname     || "",
    pin:          item?.pin          || "",
    payType:      item?.payType      || "hourly",
    hourlyRate:   item?.hourlyRate   || 0,
    primaryStoreId: initialPrimary,
    alsoStoreIds:   initialAlsoAt,
    roleId:       item?.roleId       || "",
    // Legacy free-text fields kept so old rows still render — once a roleId
    // is picked these become derived from the role/department records.
    roleText:     item?.role         || "",
    deptText:     item?.department   || "",
    // ── Slice 5 HR fields (now editable from ops_team modal) ─────────────
    email:        item?.email        || prefillApplication?.email        || "",
    phone:        item?.phone        || prefillApplication?.phone        || "",
    dob:          item?.dob          || prefillApplication?.dateOfBirth  || "",
    address:      item?.address      || prefillApplication?.address      || "",
    legalStatus:  item?.legalStatus  || prefillApplication?.legalStatus  || "",
  });
  const set = (k, v) => setFormState(f => ({ ...f, [k]: v }));

  // If the primary store changes, clear the role (the role might not exist
  // under the new store). User can re-pick.
  const setPrimaryStore = (sid) => {
    setFormState(f => ({
      ...f,
      primaryStoreId: sid,
      // Drop the also-at stores that don't include this one
      alsoStoreIds: f.alsoStoreIds.filter(x => x !== sid),
      roleId: "",
    }));
  };

  // Roles available under the selected primary store (excluding archived).
  const rolesInStore = useMemo(() => {
    if (!form.primaryStoreId) return [];
    return storeRoles
      .filter(r => r.storeId === form.primaryStoreId && !r.archivedAt)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
  }, [storeRoles, form.primaryStoreId]);

  // Group roles by department for the dropdown, so users can see structure
  const rolesGrouped = useMemo(() => {
    const groups = new Map();
    const unassigned = [];
    rolesInStore.forEach(r => {
      if (r.departmentId) {
        if (!groups.has(r.departmentId)) groups.set(r.departmentId, []);
        groups.get(r.departmentId).push(r);
      } else {
        unassigned.push(r);
      }
    });
    return { groups, unassigned };
  }, [rolesInStore]);

  // Auto-derive the department from the selected role
  const selectedRole = rolesInStore.find(r => r.id === form.roleId) || null;
  const derivedDept = selectedRole?.departmentId
    ? storeDepartments.find(d => d.id === selectedRole.departmentId)
    : null;

  // When a role is picked AND it has an hourly rate, suggest it (only if
  // current value is 0 / empty — don't clobber a manually-entered rate)
  useEffect(() => {
    if (selectedRole?.hourlyRate != null && (!form.hourlyRate || Number(form.hourlyRate) === 0)) {
      setFormState(f => ({ ...f, hourlyRate: selectedRole.hourlyRate }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.roleId]);

  // Stores allowed for the "also works at" multi-select: anything in scope
  // except the primary.
  const alsoCandidates = useMemo(
    () => allowedStores.filter(s => s.id !== form.primaryStoreId),
    [allowedStores, form.primaryStoreId]
  );
  const toggleAlsoStore = (id) => {
    setFormState(f => ({
      ...f,
      alsoStoreIds: f.alsoStoreIds.includes(id)
        ? f.alsoStoreIds.filter(x => x !== id)
        : [...f.alsoStoreIds, id],
    }));
  };

  const showBrandPrefix = new Set(allowedStores.map(s => s.brandId)).size > 1;
  const storeLabel = (s) => {
    const b = brands.find(br => br.id === s.brandId);
    return showBrandPrefix && b ? `${b.name} · ${s.shortName || s.name}` : (s.shortName || s.name);
  };

  const handleSave = () => {
    if (!form.firstName.trim()) return;
    if (!form.primaryStoreId)   { alert("Please pick a primary store."); return; }
    if (rolesInStore.length > 0 && !form.roleId) {
      alert("Please pick a role. (If this store has no roles defined yet, add one under Ops Setup → Structure first.)");
      return;
    }
    // Q6: PIN uniqueness check across the whole org. The kiosk identifies
    // staff by PIN alone, so two people can't share one. We skip checking
    // against the current item being edited (so re-saving without changing
    // PIN doesn't trip the check).
    if (form.pin && form.pin.trim()) {
      const trimmed = form.pin.trim();
      if (!/^\d{4,6}$/.test(trimmed)) {
        alert("PIN must be 4 to 6 digits.");
        return;
      }
      const collision = opsTeam.find(m =>
        m.id !== item?.id &&
        (m.pin || "").trim() === trimmed
      );
      if (collision) {
        alert(`PIN ${trimmed} is already used by ${collision.firstName} ${collision.lastName}. PINs must be unique across the company so the kiosk can identify staff. Pick a different one.`);
        return;
      }
    }

    // Derive brandId from the primary store so legacy brand-keyed code keeps
    // working during transition.
    const primaryStore = allowedStores.find(s => s.id === form.primaryStoreId);
    const brandId = primaryStore?.brandId || item?.brandId || prefillApplication?.brandId || "";

    // Combine primary + also stores into a single array, primary first.
    const storeIds = [form.primaryStoreId, ...form.alsoStoreIds.filter(Boolean)].filter(Boolean);

    // Per Q3 (lenient): a hire-flow save with role+dept STILL blank is OK.
    // We mark the record pending_setup so the warning badge appears in Ops
    // Team list, nudging manager to complete later. Manual add/edit doesn't
    // touch status (keeps existing behaviour intact for non-hire flows).
    const isHireFlow = !!prefillApplication;
    const hasRoleAssigned = !!(selectedRole?.id || form.roleText?.trim());
    const computedStatus = isHireFlow
      ? (hasRoleAssigned ? "active" : "pending_setup")
      : (item?.status || "active");

    onSave({
      id: item?.id || `ot-${Date.now()}`,
      firstName: form.firstName.trim(),
      lastName:  form.lastName.trim(),
      nickname:  form.nickname.trim(),
      pin:       form.pin,
      payType:   form.payType || "hourly",
      hourlyRate: parseFloat(form.hourlyRate) || 0,
      color:     item?.color || COLORS[Math.floor(Math.random() * COLORS.length)],
      brandId,
      storeIds,
      roleId:        selectedRole?.id || null,
      departmentId:  derivedDept?.id   || null,
      // Mirror the text fields too — keeps old reports/badges working until
      // they migrate to FK-based lookups.
      role:       selectedRole?.name || form.roleText || "",
      department: derivedDept?.name  || form.deptText || "",
      // ── Slice 5 HR fields ──────────────────────────────────────────────
      email:       form.email?.trim()       || null,
      phone:       form.phone?.trim()       || null,
      dob:         form.dob                 || null,
      address:     form.address?.trim()     || null,
      legalStatus: form.legalStatus         || null,
      // photo_url preserved from item (for edit) or application (for hire).
      // Not editable in this modal — managed via the application or future
      // employee profile page.
      photoUrl:    item?.photoUrl           || prefillApplication?.photoUrl   || null,
      status:      computedStatus,
      // Slice 6 — set hireDate to today for hire-flow saves so the
      // employee profile shows a sensible default. Manager can override
      // later in the profile UI. For edits (no prefillApplication, item exists),
      // preserve whatever's already set.
      hireDate:    isHireFlow
                     ? new Date().toISOString().slice(0, 10)
                     : (item?.hireDate || undefined),
    });
  };

  return (
    <Modal
      title={
        prefillApplication
          ? `Hire — ${prefillApplication.firstName} ${prefillApplication.lastName || ""}`
          : (item ? `Edit — ${item.firstName} ${item.lastName}` : "Add Team Member")
      }
      onClose={onClose}
      maxW="max-w-lg"
      footer={
        <>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">Cancel</button>
          <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500">
            {prefillApplication ? "Hire" : (item ? "Save" : "Add")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Hire-flow banner — explains that this is from an application,
            with a soft note about what's pre-filled vs what manager fills */}
        {prefillApplication && (
          <div className="bg-indigo-950/40 border border-indigo-900/60 rounded-xl p-3 text-xs">
            <div className="text-indigo-200 font-semibold mb-1">Hiring {prefillApplication.firstName} {prefillApplication.lastName}</div>
            <div className="text-slate-400">
              Fields are pre-filled from their application. Complete the
              <span className="text-amber-300 font-semibold"> store, role, department, and hourly rate </span>
              below. You can save with these blank — they'll be flagged
              "pending setup" in the Ops Team list for you to finish later.
            </div>
          </div>
        )}

        {/* Identity */}
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>First Name *</label><input value={form.firstName} onChange={e => set("firstName", e.target.value)} className={inputCls}/></div>
          <div><label className={labelCls}>Last Name</label><input value={form.lastName} onChange={e => set("lastName", e.target.value)} className={inputCls}/></div>
        </div>
        <div>
          <label className={labelCls}>Nickname / Preferred name</label>
          <input value={form.nickname} onChange={e => set("nickname", e.target.value)} placeholder="e.g. Jimmy" className={inputCls}/>
        </div>

        {/* Slice 5 — HR / Contact fields. Editable for ALL ops_team members
            (not just hire flow) so manager can update phone/address etc
            on existing staff without needing a separate HR module.
            Pre-filled from application when hire flow opens this modal. */}
        <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 space-y-3">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Contact & HR</div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Email</label><input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="alice@example.com" className={inputCls}/></div>
            <div><label className={labelCls}>Phone</label><input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="07123 456789" className={inputCls}/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Date of Birth</label>
              <input
                type="date"
                value={form.dob}
                onChange={e => set("dob", e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className={`${inputCls} cursor-pointer`}
                onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
              />
              {form.dob && isUnder18(form.dob) && (
                <div className="text-[10px] text-amber-400 mt-0.5">⚠ Under 18 — restricted hours apply.</div>
              )}
            </div>
            <div>
              <label className={labelCls}>Legal Status</label>
              <select value={form.legalStatus} onChange={e => set("legalStatus", e.target.value)} className={inputCls}>
                <option value="">— Not set —</option>
                {LEGAL_STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Address</label>
            <input value={form.address} onChange={e => set("address", e.target.value)} placeholder="Street, town, postcode" className={inputCls}/>
          </div>
        </div>

        {/* Store assignment */}
        <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 space-y-3">
          <div>
            <label className={labelCls}>Primary Store *</label>
            {allowedStores.length === 0 ? (
              <div className="text-xs text-amber-400 bg-amber-950/30 border border-amber-500/30 rounded-lg px-3 py-2">
                No stores in your scope. Ask an admin to assign you to stores first.
              </div>
            ) : (
              <select value={form.primaryStoreId} onChange={e => setPrimaryStore(e.target.value)} className={inputCls}>
                <option value="">— Pick a store —</option>
                {allowedStores.map(s => <option key={s.id} value={s.id}>{storeLabel(s)}</option>)}
              </select>
            )}
          </div>

          {form.primaryStoreId && alsoCandidates.length > 0 && (
            <div>
              <label className={labelCls}>Also works at (optional)</label>
              <div className="flex flex-wrap gap-1.5">
                {alsoCandidates.map(s => {
                  const checked = form.alsoStoreIds.includes(s.id);
                  return (
                    <button
                      key={s.id} onClick={() => toggleAlsoStore(s.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${checked ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"}`}
                    >
                      {checked && <span className="mr-1">✓</span>}{storeLabel(s)}
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] text-slate-600 mt-1.5">For staff who cover multiple sites. Primary store is where they're rostered by default.</div>
            </div>
          )}
        </div>

        {/* Role + auto-derived department */}
        {form.primaryStoreId && (
          <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 space-y-3">
            <div>
              <label className={labelCls}>Role *</label>
              {rolesInStore.length === 0 ? (
                <div className="text-xs text-amber-400 bg-amber-950/30 border border-amber-500/30 rounded-lg px-3 py-2">
                  This store has no roles defined yet. Go to <strong>Ops Setup → Structure</strong> to add some, then come back.
                </div>
              ) : (
                <select value={form.roleId} onChange={e => set("roleId", e.target.value)} className={inputCls}>
                  <option value="">— Pick a role —</option>
                  {/* Roles grouped by department */}
                  {storeDepartments
                    .filter(d => d.storeId === form.primaryStoreId && !d.archivedAt)
                    .filter(d => rolesGrouped.groups.has(d.id))
                    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name))
                    .map(d => (
                      <optgroup key={d.id} label={d.name}>
                        {rolesGrouped.groups.get(d.id).map(r => (
                          <option key={r.id} value={r.id}>{r.name}{r.hourlyRate != null ? ` (£${r.hourlyRate.toFixed(2)}/hr)` : ""}</option>
                        ))}
                      </optgroup>
                    ))
                  }
                  {/* Unassigned-to-department roles */}
                  {rolesGrouped.unassigned.length > 0 && (
                    <optgroup label="Other">
                      {rolesGrouped.unassigned.map(r => (
                        <option key={r.id} value={r.id}>{r.name}{r.hourlyRate != null ? ` (£${r.hourlyRate.toFixed(2)}/hr)` : ""}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
            </div>
            {selectedRole && (
              <div className="text-xs text-slate-500">
                Department: <strong className="text-slate-300">{derivedDept?.name || "—"}</strong>
                {selectedRole.isManagement && <span className="ml-2"><Badge label="Management" color="indigo"/></span>}
              </div>
            )}
          </div>
        )}

        {/* PIN + pay type + rate */}
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>PIN (4–6 digits)</label><input value={form.pin} onChange={e => set("pin", e.target.value)} maxLength={6} placeholder="e.g. 1234" className={inputCls}/></div>
          <div>
            <label className={labelCls}>Pay type</label>
            <select
              value={form.payType}
              onChange={e => set("payType", e.target.value)}
              className={inputCls}
            >
              {PAY_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Amount ({getPayTypeMeta(form.payType).unitLabel})</label>
          <input
            type="number"
            step={getPayTypeMeta(form.payType).step}
            min="0"
            value={form.hourlyRate}
            onChange={e => set("hourlyRate", e.target.value)}
            placeholder={getPayTypeMeta(form.payType).placeholder}
            className={inputCls}
          />
          {form.payType === "hourly" && selectedRole?.hourlyRate != null && Number(form.hourlyRate) !== Number(selectedRole.hourlyRate) && (
            <div className="text-[10px] text-slate-600 mt-1">
              Role default: £{selectedRole.hourlyRate.toFixed(2)}/hr
              {" — "}
              <button onClick={() => set("hourlyRate", selectedRole.hourlyRate)} className="text-indigo-400 hover:text-indigo-300 underline">use role default</button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ChecklistSettingsFormModal({ item, brands = [], stores = [], onSave, onClose }) {
  const allowedStores = useMemo(
    () => (stores || []).filter(s => !s.archivedAt && s.ownershipModel === "owned"),
    [stores]
  );
  const [name, setName] = useState(item?.name || "");
  const [shift, setShift] = useState(item?.shift || "Opening");
  const [defaultRole, setDefaultRole] = useState(item?.defaultRole || "");
  const [storeId, setStoreId] = useState(item?.storeId || allowedStores[0]?.id || "");
  const [items, setItems] = useState(item?.items || []);
  const addItem = () => setItems(its => [...its, { id: `ci-${Date.now()}`, text: "", guide: "" }]);
  const showBrandPrefix = new Set(allowedStores.map(s => s.brandId)).size > 1;

  const handleSave = () => {
    if (!name.trim()) return;
    if (!storeId)    { alert("Please pick a store."); return; }
    const store = allowedStores.find(s => s.id === storeId);
    onSave({
      id: item?.id || `cl-${Date.now()}`,
      name: name.trim(),
      shift, defaultRole,
      storeId, brandId: store?.brandId || null,
      items: items.filter(i => i.text.trim()),
    });
  };
  return (
    <Modal title={item ? `Edit — ${item.name}` : "New Checklist"} onClose={onClose} maxW="max-w-2xl"
      footer={<><button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">Cancel</button><button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500">{item ? "Save" : "Create"}</button></>}>
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Store *</label>
          {allowedStores.length === 0 ? (
            <div className="text-xs text-amber-400 bg-amber-950/30 border border-amber-500/30 rounded-lg px-3 py-2">No owned stores available.</div>
          ) : (
            <select value={storeId} onChange={e => setStoreId(e.target.value)} className={inputCls}>
              <option value="">— Pick a store —</option>
              {allowedStores.map(s => {
                const b = brands.find(br => br.id === s.brandId);
                return <option key={s.id} value={s.id}>{showBrandPrefix && b ? `${b.name} · ` : ""}{s.shortName || s.name}</option>;
              })}
            </select>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>Name *</label><input value={name} onChange={e => setName(e.target.value)} className={inputCls}/></div>
          <div><label className={labelCls}>Shift</label><select value={shift} onChange={e => setShift(e.target.value)} className={inputCls}><option>Opening</option><option>Mid-shift</option><option>Closing</option><option>Any</option></select></div>
        </div>
        <div><label className={labelCls}>Default Role</label><input value={defaultRole} onChange={e => setDefaultRole(e.target.value)} placeholder="e.g. Shift Leader" className={inputCls}/></div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={labelCls}>Items</label>
            <button onClick={addItem} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"><Plus size={12}/> Add item</button>
          </div>
          <div className="space-y-2">
            {items.map(it => (
              <div key={it.id} className="flex items-start gap-2 bg-slate-950 rounded-xl p-3">
                <div className="flex-1 space-y-1.5">
                  <input value={it.text} onChange={e => setItems(its => its.map(x => x.id === it.id ? { ...x, text: e.target.value } : x))} placeholder="Checklist item…" className={inputCls}/>
                  <input value={it.guide} onChange={e => setItems(its => its.map(x => x.id === it.id ? { ...x, guide: e.target.value } : x))} placeholder="Guidance note…" className={`${inputCls} text-xs py-1.5`}/>
                </div>
                <button onClick={() => setItems(its => its.filter(x => x.id !== it.id))} className="text-slate-600 hover:text-red-400 mt-2"><X size={14}/></button>
              </div>
            ))}
            {items.length === 0 && <div className="text-xs text-slate-500 text-center py-4">No items yet — click Add item above</div>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Per-store structure: Departments + Roles ─────────────────────────────────
// Lives under Ops Setup → Structure. Lets the owner/HQ/store-manager build the
// org structure for each store: which departments exist (Kitchen, FOH, Deliveries)
// and which roles within each (Head Chef, Barista, Server).
//
// Permissions:
//   - Owner/HQ: see and edit every store
//   - Store Manager: see and edit only the stores in their storeIds
//   - Staff: would see read-only (not currently routed here)
//
// Soft delete via archived_at — preserves history for opsTeam members who
// were previously assigned to a now-removed role.
function StructureSection({
  brands, stores, visibleStoreIds, departments, roles, opsTeam, currentUser,
  onAddDept, onUpdateDept, onArchiveDept, onUnarchiveDept,
  onAddRole, onUpdateRole, onArchiveRole, onUnarchiveRole,
  onCopyStructure,
}) {
  const allVisibleStores = useMemo(
    () => (stores || []).filter(s => visibleStoreIds?.includes(s.id) && !s.archivedAt),
    [stores, visibleStoreIds]
  );
  const [storeId, setStoreId] = useState("");
  useEffect(() => {
    if (!storeId && allVisibleStores[0]) setStoreId(allVisibleStores[0].id);
    if (storeId && !allVisibleStores.some(s => s.id === storeId)) setStoreId(allVisibleStores[0]?.id || "");
  }, [allVisibleStores, storeId]);

  const [showArchived, setShowArchived] = useState(false);
  const [deptModal,    setDeptModal]    = useState(null);  // dept being edited, "new" for create
  const [roleModal,    setRoleModal]    = useState(null);  // role being edited, or { isNew: true, deptId }
  const [confirmAction, setConfirmAction] = useState(null); // { msg, fn }
  const [copyOpen,     setCopyOpen]     = useState(false);

  const selectedStore = allVisibleStores.find(s => s.id === storeId) || null;

  // Filter to selected store, optionally include archived
  const visibleDepts = useMemo(() => {
    return departments
      .filter(d => d.storeId === storeId)
      .filter(d => showArchived || !d.archivedAt)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
  }, [departments, storeId, showArchived]);

  const visibleRoles = useMemo(() => {
    return roles
      .filter(r => r.storeId === storeId)
      .filter(r => showArchived || !r.archivedAt)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
  }, [roles, storeId, showArchived]);

  const rolesByDept = useMemo(() => {
    const m = { _unassigned: [] };
    visibleRoles.forEach(r => {
      const key = r.departmentId || "_unassigned";
      (m[key] = m[key] || []).push(r);
    });
    return m;
  }, [visibleRoles]);

  // Count opsTeam members per role/dept — useful to show "X staff" and to
  // warn before archiving something that's still in use.
  const teamCountByRole = useMemo(() => {
    const m = {};
    (opsTeam || []).forEach(member => {
      if (member.roleId) m[member.roleId] = (m[member.roleId] || 0) + 1;
    });
    return m;
  }, [opsTeam]);

  const teamCountByDept = useMemo(() => {
    const m = {};
    (opsTeam || []).forEach(member => {
      if (member.departmentId) m[member.departmentId] = (m[member.departmentId] || 0) + 1;
    });
    return m;
  }, [opsTeam]);

  // Stores the user could copy from — any store EXCEPT the currently-selected one
  // that already has some structure defined. Limits to user's accessible stores.
  const copyableSources = useMemo(() => {
    return allVisibleStores
      .filter(s => s.id !== storeId)
      .filter(s => departments.some(d => d.storeId === s.id && !d.archivedAt))
      .sort((a, b) => (a.shortName || a.name).localeCompare(b.shortName || b.name));
  }, [allVisibleStores, storeId, departments]);

  if (allVisibleStores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <Settings size={32} className="mb-3 text-slate-700"/>
        <div className="text-sm font-semibold">No stores assigned to your account.</div>
      </div>
    );
  }

  const showBrandPrefix = new Set(allVisibleStores.map(s => s.brandId)).size > 1;

  return (
    <div className="space-y-5">
      {/* Top bar — store picker + actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={storeId}
            onChange={e => setStoreId(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer min-w-[200px]"
          >
            {allVisibleStores.map(s => {
              const b = brands.find(br => br.id === s.brandId);
              return <option key={s.id} value={s.id}>{showBrandPrefix && b ? `${b.name} · ` : ""}{s.shortName || s.name}</option>;
            })}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="rounded"/>
            Show archived
          </label>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {copyableSources.length > 0 && visibleDepts.filter(d => !d.archivedAt).length === 0 && (
            <button onClick={() => setCopyOpen(true)} className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 px-3 py-2 rounded-xl border border-indigo-500/30 bg-indigo-950/30">
              📋 Copy structure from another store
            </button>
          )}
          <button onClick={() => setDeptModal("new")} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold">
            <Plus size={14}/> Add Department
          </button>
        </div>
      </div>

      {/* Empty state for new store */}
      {visibleDepts.length === 0 && !showArchived && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500 bg-slate-900/40 border border-slate-800 rounded-2xl">
          <Settings size={32} className="mb-3 text-slate-700"/>
          <div className="text-sm font-semibold">No departments yet for {selectedStore?.shortName || "this store"}</div>
          <div className="text-xs text-slate-600 mt-1 max-w-md text-center">
            Start by adding departments (Kitchen, FOH, etc.), then create roles within each one.
            {copyableSources.length > 0 && <> Or copy the structure from another store using the button above.</>}
          </div>
        </div>
      )}

      {/* Departments + nested roles */}
      <div className="space-y-3">
        {visibleDepts.map(dept => {
          const deptRoles = (rolesByDept[dept.id] || []);
          const deptStaff = teamCountByDept[dept.id] || 0;
          return (
            <div key={dept.id} className={`bg-slate-900 border rounded-2xl ${dept.archivedAt ? "border-slate-800 opacity-60" : "border-slate-700"}`}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="text-sm font-bold text-white truncate">{dept.name}</div>
                  {dept.archivedAt && <Badge label="Archived" color="slate"/>}
                  <span className="text-xs text-slate-500">{deptRoles.filter(r => !r.archivedAt).length} role{deptRoles.filter(r => !r.archivedAt).length !== 1 ? "s" : ""}</span>
                  {deptStaff > 0 && <span className="text-xs text-slate-600">· {deptStaff} staff</span>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {!dept.archivedAt && (
                    <button onClick={() => setRoleModal({ isNew: true, deptId: dept.id })}
                      className="text-xs font-semibold text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700">
                      + Role
                    </button>
                  )}
                  {!dept.archivedAt && (
                    <button onClick={() => setDeptModal(dept)}
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"><Edit size={13}/></button>
                  )}
                  {dept.archivedAt ? (
                    <button onClick={() => onUnarchiveDept(dept.id)}
                      className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700">
                      Restore
                    </button>
                  ) : (
                    <button onClick={() => setConfirmAction({
                      msg: deptStaff > 0
                        ? `Archive "${dept.name}"? ${deptStaff} staff member(s) currently belong to it. They'll keep their record but the department will be hidden.`
                        : `Archive "${dept.name}"?`,
                      fn: () => onArchiveDept(dept.id),
                    })} className="p-1.5 rounded-lg bg-slate-800 text-slate-600 hover:text-red-400 hover:bg-red-950/20"><Trash2 size={13}/></button>
                  )}
                </div>
              </div>
              {/* Roles in this department */}
              {deptRoles.length === 0 ? (
                <div className="px-4 py-3 text-xs text-slate-600 italic">No roles in this department yet.</div>
              ) : (
                <div className="divide-y divide-slate-800/60">
                  {deptRoles.map(role => {
                    const staffCount = teamCountByRole[role.id] || 0;
                    return (
                      <div key={role.id} className={`flex items-center justify-between px-4 py-2 ${role.archivedAt ? "opacity-60" : ""}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="text-sm text-white truncate">{role.name}</div>
                          {role.isManagement && <Badge label="Management" color="indigo"/>}
                          {role.advertiseForHiring && !role.archivedAt && <Badge label="Hiring" color="green"/>}
                          {role.archivedAt && <Badge label="Archived" color="slate"/>}
                          {role.hourlyRate != null && <span className="text-xs text-slate-500 tabular-nums">£{role.hourlyRate.toFixed(2)}/hr</span>}
                          {staffCount > 0 && <span className="text-xs text-slate-600">· {staffCount} staff</span>}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {!role.archivedAt && (
                            <button onClick={() => setRoleModal(role)}
                              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"><Edit size={13}/></button>
                          )}
                          {role.archivedAt ? (
                            <button onClick={() => onUnarchiveRole(role.id)}
                              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700">
                              Restore
                            </button>
                          ) : (
                            <button onClick={() => setConfirmAction({
                              msg: staffCount > 0
                                ? `Archive role "${role.name}"? ${staffCount} staff member(s) hold this role.`
                                : `Archive role "${role.name}"?`,
                              fn: () => onArchiveRole(role.id),
                            })} className="p-1.5 rounded-lg bg-slate-800 text-slate-600 hover:text-red-400 hover:bg-red-950/20"><Trash2 size={13}/></button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Roles with no department (unassigned bucket) */}
        {(rolesByDept._unassigned || []).length > 0 && (
          <div className="bg-slate-900 border border-slate-700 rounded-2xl">
            <div className="px-4 py-3 border-b border-slate-800">
              <div className="text-sm font-semibold text-slate-400">Unassigned roles</div>
              <div className="text-xs text-slate-600 mt-0.5">These roles aren't in any department. Edit them to assign.</div>
            </div>
            <div className="divide-y divide-slate-800/60">
              {rolesByDept._unassigned.map(role => {
                const staffCount = teamCountByRole[role.id] || 0;
                return (
                  <div key={role.id} className="flex items-center justify-between px-4 py-2">
                    <div className="flex items-center gap-3"><div className="text-sm text-white">{role.name}</div>{role.hourlyRate != null && <span className="text-xs text-slate-500 tabular-nums">£{role.hourlyRate.toFixed(2)}/hr</span>}{staffCount > 0 && <span className="text-xs text-slate-600">· {staffCount} staff</span>}</div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setRoleModal(role)} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"><Edit size={13}/></button>
                      <button onClick={() => setConfirmAction({ msg: `Archive role "${role.name}"?`, fn: () => onArchiveRole(role.id) })} className="p-1.5 rounded-lg bg-slate-800 text-slate-600 hover:text-red-400 hover:bg-red-950/20"><Trash2 size={13}/></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {deptModal && (
        <DepartmentEditorModal
          dept={deptModal === "new" ? null : deptModal}
          storeId={storeId}
          onSave={async (payload) => {
            if (deptModal === "new") await onAddDept(payload);
            else                      await onUpdateDept(deptModal.id, payload);
            setDeptModal(null);
          }}
          onClose={() => setDeptModal(null)}
        />
      )}

      {roleModal && (
        <RoleEditorModal
          role={roleModal.isNew ? null : roleModal}
          storeId={storeId}
          presetDeptId={roleModal.isNew ? roleModal.deptId : null}
          departments={visibleDepts.filter(d => !d.archivedAt)}
          onSave={async (payload) => {
            if (roleModal.isNew) await onAddRole(payload);
            else                  await onUpdateRole(roleModal.id, payload);
            setRoleModal(null);
          }}
          onClose={() => setRoleModal(null)}
        />
      )}

      {confirmAction && (
        <Modal
          title="Confirm"
          onClose={() => setConfirmAction(null)}
          maxW="max-w-md"
          footer={
            <div className="flex gap-2 w-full">
              <button onClick={() => setConfirmAction(null)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button>
              <button onClick={async () => { await confirmAction.fn(); setConfirmAction(null); }} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500">Archive</button>
            </div>
          }
        >
          <p className="text-sm text-slate-300">{confirmAction.msg}</p>
          <p className="text-xs text-slate-500 mt-2">Archived items are hidden but kept for history. You can restore them later.</p>
        </Modal>
      )}

      {copyOpen && (
        <CopyStructureModal
          sources={copyableSources}
          brands={brands}
          targetStore={selectedStore}
          onCopy={async (sourceId) => {
            await onCopyStructure(sourceId, storeId);
            setCopyOpen(false);
          }}
          onClose={() => setCopyOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Department editor ────────────────────────────────────────────────────────
function DepartmentEditorModal({ dept, storeId, onSave, onClose }) {
  const isCreate = !dept;
  const [name, setName] = useState(dept?.name || "");
  const [sortOrder, setSortOrder] = useState(dept?.sortOrder ?? 0);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        ...(dept || {}),
        storeId,
        name: name.trim(),
        sortOrder: Number(sortOrder) || 0,
      });
    } finally { setSaving(false); }
  };

  return (
    <Modal
      title={isCreate ? "Add Department" : `Edit — ${dept.name}`}
      onClose={onClose}
      maxW="max-w-md"
      footer={
        <div className="flex gap-2 w-full">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim()} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50">{saving ? "Saving…" : (isCreate ? "Create" : "Save")}</button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">Department name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Kitchen, FOH, Deliveries" className={fieldCls}/>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">Sort order</label>
          <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} className={fieldCls}/>
          <div className="text-[10px] text-slate-600 mt-1">Lower numbers appear first. Useful to put Kitchen above FOH, etc.</div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Role editor ──────────────────────────────────────────────────────────────
function RoleEditorModal({ role, storeId, presetDeptId, departments, onSave, onClose }) {
  const isCreate = !role;
  const [name, setName]           = useState(role?.name || "");
  const [departmentId, setDeptId] = useState(role?.departmentId || presetDeptId || "");
  const [isManagement, setMgmt]   = useState(role?.isManagement || false);
  // Slice 3 — whether this role appears in /apply form's position dropdown
  // for this store. Default off for both new and existing roles (existing
  // roles that haven't been opted in get false from the DB default).
  const [advertiseForHiring, setAdvertise] = useState(!!role?.advertiseForHiring);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);

  // hourlyRate and sortOrder are no longer editable from this modal per
  // user request. We still preserve the existing values on save so we don't
  // accidentally null out data that's used by scheduling / payroll reports.
  // New roles get hourlyRate=null and sortOrder=0 by default (matching DB).
  const preservedHourlyRate = role?.hourlyRate ?? null;
  const preservedSortOrder  = role?.sortOrder ?? 0;

  const handleSave = async () => {
    if (!name.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await onSave({
        ...(role || {}),
        storeId,
        departmentId: departmentId || null,
        name: name.trim(),
        hourlyRate: preservedHourlyRate,
        isManagement,
        sortOrder: preservedSortOrder,
        advertiseForHiring,
      });
    } catch (err) {
      // Surface the error visibly. Without this, the modal silently stays
      // open with no indication of what went wrong — the exact "Save button
      // doesn't work" symptom that was reported. Now we show a clear message
      // and keep the form filled so the user can retry without re-entering.
      console.error("Role save failed:", err);
      setError(err?.message || "Could not save. Try again.");
      setSaving(false);
      return;   // don't fall through to finally → keep saving=false above
    }
    setSaving(false);
  };

  return (
    <Modal
      title={isCreate ? "Add Role" : `Edit — ${role.name}`}
      onClose={onClose}
      maxW="max-w-md"
      footer={
        <div className="flex gap-2 w-full">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim()} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50">{saving ? "Saving…" : (isCreate ? "Create" : "Save")}</button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-950/40 border border-red-900 text-red-300 text-xs">
            {error}
          </div>
        )}
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">Role name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Head Chef, Barista, Server" className={fieldCls}/>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">Department</label>
          <select value={departmentId} onChange={e => setDeptId(e.target.value)} className={fieldCls}>
            <option value="">— None —</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isManagement} onChange={e => setMgmt(e.target.checked)} className="rounded"/>
            <span className="text-sm text-slate-300">Management role</span>
          </label>
          <div className="text-[10px] text-slate-600 mt-0.5 ml-6">Used for permission checks and shift authority.</div>
        </div>
        <div className="bg-indigo-950/30 border border-indigo-900/50 rounded-xl p-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={advertiseForHiring} onChange={e => setAdvertise(e.target.checked)} className="rounded mt-0.5"/>
            <div className="flex-1">
              <span className="text-sm text-slate-200 font-semibold">Advertise on /apply form</span>
              <div className="text-[10px] text-slate-500 mt-0.5">
                When ticked, this role appears in the public job application form's position dropdown for this store. Untick once the position is filled to stop accepting applications for it.
              </div>
            </div>
          </label>
        </div>
      </div>
    </Modal>
  );
}

// ─── Copy structure modal ─────────────────────────────────────────────────────
function CopyStructureModal({ sources, brands, targetStore, onCopy, onClose }) {
  const [sourceId, setSourceId] = useState(sources[0]?.id || "");
  const [copying, setCopying] = useState(false);

  const handleCopy = async () => {
    if (!sourceId) return;
    setCopying(true);
    try { await onCopy(sourceId); }
    finally { setCopying(false); }
  };

  return (
    <Modal
      title={`Copy structure to ${targetStore?.shortName || "this store"}`}
      onClose={onClose}
      maxW="max-w-md"
      footer={
        <div className="flex gap-2 w-full">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button>
          <button onClick={handleCopy} disabled={copying || !sourceId} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50">{copying ? "Copying…" : "Copy"}</button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-300">Pick a store to copy departments and roles from. New copies are created — the source store is unchanged.</p>
        <select value={sourceId} onChange={e => setSourceId(e.target.value)} className={fieldCls}>
          {sources.map(s => {
            const b = brands.find(br => br.id === s.brandId);
            return <option key={s.id} value={s.id}>{b ? `${b.name} · ` : ""}{s.shortName || s.name}</option>;
          })}
        </select>
        <p className="text-xs text-slate-500">Hourly rates are copied but should be reviewed for the new store.</p>
      </div>
    </Modal>
  );
}

// ─── Per-store Checklists list (used in Ops Setup → Checklists tab) ──────────
// Same shape as the Structure tab: pick a store, see THAT store's checklists.
// "All my stores" is intentionally not offered here because the screen is
// configuration-focused — you create/edit at one store at a time.
function ChecklistListSection({ brands, stores, visibleStoreIds, checklists, onNew, onEdit, onDelete }) {
  const allVisibleStores = useMemo(
    () => (stores || []).filter(s => visibleStoreIds?.includes(s.id) && !s.archivedAt && s.ownershipModel === "owned"),
    [stores, visibleStoreIds]
  );
  const [storeId, setStoreId] = useState("");
  useEffect(() => {
    if (!storeId && allVisibleStores[0]) setStoreId(allVisibleStores[0].id);
    if (storeId && !allVisibleStores.some(s => s.id === storeId)) setStoreId(allVisibleStores[0]?.id || "");
  }, [allVisibleStores, storeId]);

  const visible = useMemo(
    () => checklists.filter(cl => cl.storeId === storeId)
                    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name)),
    [checklists, storeId]
  );

  if (allVisibleStores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <CheckSquare size={32} className="mb-3 text-slate-700"/>
        <div className="text-sm font-semibold">No owned stores available.</div>
      </div>
    );
  }

  const showBrandPrefix = new Set(allVisibleStores.map(s => s.brandId)).size > 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <select
          value={storeId}
          onChange={e => setStoreId(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer min-w-[200px]"
        >
          {allVisibleStores.map(s => {
            const b = brands.find(br => br.id === s.brandId);
            return <option key={s.id} value={s.id}>{showBrandPrefix && b ? `${b.name} · ` : ""}{s.shortName || s.name}</option>;
          })}
        </select>
        <button onClick={onNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold">
          <Plus size={14}/> New Checklist
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-slate-900/40 border border-slate-800 rounded-2xl">
          <CheckSquare size={32} className="mb-3 text-slate-700"/>
          <div className="text-sm font-semibold">No checklists for this store yet</div>
          <div className="text-xs text-slate-600 mt-1">Click "New Checklist" to add one.</div>
        </div>
      ) : (
        visible.map(cl => (
          <div key={cl.id} className="bg-slate-900 border border-slate-700 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-white">{cl.name}</div>
                <div className="flex gap-2 mt-1.5">
                  <Badge label={cl.shift} color="slate"/>
                  {cl.defaultRole && <Badge label={`🎭 ${cl.defaultRole}`} color="violet"/>}
                  <Badge label={`${cl.items.length} items`} color="slate"/>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => onEdit(cl)} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"><Edit size={13}/></button>
                <button onClick={() => onDelete(cl)} className="p-1.5 rounded-xl bg-slate-800 text-slate-600 hover:text-red-400 hover:bg-red-950/20"><Trash2 size={13}/></button>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              {cl.items.map(it => (
                <div key={it.id} className="flex items-center gap-2 text-xs text-slate-600"><Check size={10} className="text-slate-600"/>{it.text}</div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Per-store Cleaning Tasks list (used in Ops Setup → Cleaning tab) ────────
function CleaningTaskListSection({ brands, stores, visibleStoreIds, cleaningTasks, onNew, onEdit, onDelete }) {
  const allVisibleStores = useMemo(
    () => (stores || []).filter(s => visibleStoreIds?.includes(s.id) && !s.archivedAt && s.ownershipModel === "owned"),
    [stores, visibleStoreIds]
  );
  const [storeId, setStoreId] = useState("");
  useEffect(() => {
    if (!storeId && allVisibleStores[0]) setStoreId(allVisibleStores[0].id);
    if (storeId && !allVisibleStores.some(s => s.id === storeId)) setStoreId(allVisibleStores[0]?.id || "");
  }, [allVisibleStores, storeId]);

  const visible = useMemo(
    () => cleaningTasks.filter(t => t.storeId === storeId),
    [cleaningTasks, storeId]
  );
  const areas = useMemo(() => [...new Set(visible.map(t => t.area))].sort(), [visible]);

  if (allVisibleStores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <CheckSquare size={32} className="mb-3 text-slate-700"/>
        <div className="text-sm font-semibold">No owned stores available.</div>
      </div>
    );
  }

  const showBrandPrefix = new Set(allVisibleStores.map(s => s.brandId)).size > 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <select
          value={storeId}
          onChange={e => setStoreId(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer min-w-[200px]"
        >
          {allVisibleStores.map(s => {
            const b = brands.find(br => br.id === s.brandId);
            return <option key={s.id} value={s.id}>{showBrandPrefix && b ? `${b.name} · ` : ""}{s.shortName || s.name}</option>;
          })}
        </select>
        <button onClick={onNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold">
          <Plus size={14}/> Add Task
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-slate-900/40 border border-slate-800 rounded-2xl">
          <CheckSquare size={32} className="mb-3 text-slate-700"/>
          <div className="text-sm font-semibold">No cleaning tasks for this store yet</div>
          <div className="text-xs text-slate-600 mt-1">Click "Add Task" to create one.</div>
        </div>
      ) : (
        areas.map(area => (
          <div key={area} className="space-y-2">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-widest">{area}</div>
            {visible.filter(t => t.area === area).map(t => (
              <div key={t.id} className="flex items-center gap-4 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white">{t.name}</div>
                  <div className="text-xs text-slate-600">{t.freq}{t.assignRole ? ` · 🎭 ${t.assignRole}` : ""}</div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => onEdit(t)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"><Edit size={13}/></button>
                  <button onClick={() => onDelete(t)} className="p-2 rounded-xl bg-slate-800 text-slate-600 hover:text-red-400 hover:bg-red-950/20"><Trash2 size={13}/></button>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function OpsSettingsView({
  brands, stores = [], visibleStoreIds = [],
  storeDepartments = [], storeRoles = [],
  checklists, tempUnits, cleaningTasks, opsTeam, shiftPresets = [],
  onAddChecklist, onUpdateChecklist, onDeleteChecklist,
  onAddTempUnit, onUpdateTempUnit, onDeleteTempUnit,
  onAddCleanTask, onUpdateCleanTask, onDeleteCleanTask,
  onAddOpsTeam, onUpdateOpsTeam, onDeleteOpsTeam,
  onAddShiftPreset, onUpdateShiftPreset, onDeleteShiftPreset,
  onAddStoreDepartment, onUpdateStoreDepartment, onArchiveStoreDepartment, onUnarchiveStoreDepartment,
  onAddStoreRole, onUpdateStoreRole, onArchiveStoreRole, onUnarchiveStoreRole,
  onCopyStoreStructure,
  onOpenEmployeeProfile,         // slice 6 — open profile drill-down from team row
  currentUser
}) {
  const [tab, setTab] = useState("structure");
  const [clModal, setClModal] = useState(null);
  const [tuModal, setTuModal] = useState(null);
  const [ctModal, setCtModal] = useState(null);
  const [tmModal, setTmModal] = useState(null);
  const [delTarget, setDelTarget] = useState(null);
  // Slice 6 follow-up — filter the team list to only employees needing
  // setup completion. Toggleable banner. Default off so list shows everyone.
  // Auto-enabled if user navigated here via the sidebar badge (deep-link).
  const [showOnlyPending, setShowOnlyPending] = useState(false);
  // "Structure" combines departments + roles in one screen since roles belong
  // to departments. Listed first because it's the per-store identity that
  // everything else hangs off of.
  const tabs = [
    { key: "structure",  label: "Structure" },
    { key: "checklists", label: "Checklists" },
    { key: "tempunits",  label: "Temp Units" },
    { key: "cleaning",   label: "Cleaning Tasks" },
    { key: "team",       label: "Ops Team" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-2 bg-slate-900 border border-slate-700 rounded-2xl p-1.5 w-fit flex-wrap">
        {tabs.map(t => <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t.key ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}>{t.label}</button>)}
      </div>

      {tab === "structure" && (
        <StructureSection
          brands={brands}
          stores={stores}
          visibleStoreIds={visibleStoreIds}
          departments={storeDepartments}
          roles={storeRoles}
          opsTeam={opsTeam}
          currentUser={currentUser}
          onAddDept={onAddStoreDepartment}
          onUpdateDept={onUpdateStoreDepartment}
          onArchiveDept={onArchiveStoreDepartment}
          onUnarchiveDept={onUnarchiveStoreDepartment}
          onAddRole={onAddStoreRole}
          onUpdateRole={onUpdateStoreRole}
          onArchiveRole={onArchiveStoreRole}
          onUnarchiveRole={onUnarchiveStoreRole}
          onCopyStructure={onCopyStoreStructure}
        />
      )}

      {tab === "checklists" && (
        <ChecklistListSection
          brands={brands}
          stores={stores}
          visibleStoreIds={visibleStoreIds}
          checklists={checklists}
          onNew={() => setClModal("new")}
          onEdit={cl => setClModal(cl)}
          onDelete={cl => setDelTarget({ msg: `Delete "${cl.name}"?`, fn: () => onDeleteChecklist(cl.id) })}
        />
      )}

      {tab === "tempunits" && (
        <div className="space-y-4">
          <div className="flex justify-end"><button onClick={() => setTuModal("new")} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold"><Plus size={14}/> Add Unit</button></div>
          {tempUnits.map(u => {
            const brand = brands.find(b => b.id === u.brandId);
            const store = u.storeId ? stores.find(s => s.id === u.storeId) : null;
            return (
              <div key={u.id} className="flex items-center gap-4 bg-slate-900 border border-slate-700 rounded-2xl px-5 py-4">
                <span className="text-xl">{TEMP_ICON[u.type] || "🌡️"}</span>
                <div className="flex-1 min-w-0"><div className="text-sm font-bold text-white">{u.name}</div><div className="text-xs text-slate-600">{brand?.name}{store ? ` · ${store.shortName || store.name}` : ""} · {tempLimitText(u)}{u.assignRole ? ` · 🎭 ${u.assignRole}` : ""}</div></div>
                <div className="flex gap-1.5">
                  <button onClick={() => setTuModal(u)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"><Edit size={13}/></button>
                  <button onClick={() => setDelTarget({ msg: `Delete "${u.name}"?`, fn: () => onDeleteTempUnit(u.id) })} className="p-2 rounded-xl bg-slate-800 text-slate-600 hover:text-red-400 hover:bg-red-950/20"><Trash2 size={13}/></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "cleaning" && (
        <CleaningTaskListSection
          brands={brands}
          stores={stores}
          visibleStoreIds={visibleStoreIds}
          cleaningTasks={cleaningTasks}
          onNew={() => setCtModal("new")}
          onEdit={t => setCtModal(t)}
          onDelete={t => setDelTarget({ msg: `Delete "${t.name}"?`, fn: () => onDeleteCleanTask(t.id) })}
        />
      )}

      {tab === "team" && (
        <div className="space-y-6">
          <ShiftPresetManager
            brands={brands} shiftPresets={shiftPresets}
            onAdd={onAddShiftPreset} onUpdate={onUpdateShiftPreset} onDelete={onDeleteShiftPreset}
            currentUser={currentUser}
          />
          <div className="border-t border-slate-700 pt-4 space-y-4">

          {/* Slice 6 follow-up — pending-setup banner.
              Counts only employees the current user can affect (matches
              the scope used for the sidebar badge in App.js). Shows nothing
              when zero pending — silent good state. */}
          {(() => {
            const isHq = currentUser?.role === "owner" || currentUser?.role === "hq_staff";
            const pending = opsTeam.filter(m => {
              if (m.status !== "pending_setup" || m.archivedAt) return false;
              if (isHq) return true;
              const primary = m.storeIds?.[0];
              return primary && (currentUser?.storeIds || []).includes(primary);
            });
            if (pending.length === 0) return null;
            return (
              <div className="bg-amber-950/30 border border-amber-900/50 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <AlertCircle size={18} className="text-amber-400 flex-shrink-0"/>
                  <div className="min-w-0">
                    <div className="text-sm text-amber-200 font-semibold">
                      {pending.length} {pending.length === 1 ? "employee needs" : "employees need"} setup completion
                    </div>
                    <div className="text-[11px] text-amber-300/70 mt-0.5">
                      Hired but missing role, department, or hourly rate. Click to complete each one.
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowOnlyPending(v => !v)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    showOnlyPending
                      ? "bg-amber-700 text-amber-100 hover:bg-amber-600"
                      : "bg-amber-900/50 text-amber-200 hover:bg-amber-900 border border-amber-800"
                  }`}
                >
                  {showOnlyPending ? "Show all" : "Show only pending"}
                </button>
              </div>
            );
          })()}

          <div className="flex justify-end"><button onClick={() => setTmModal("new")} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold"><Plus size={14}/> Add Member</button></div>
          {(showOnlyPending
            ? opsTeam.filter(m => m.status === "pending_setup" && !m.archivedAt)
            : opsTeam
          ).map(m => {
            const brand = brands.find(b => b.id === m.brandId);
            // Prefer the per-store assignment if present; fall back to brand
            // for legacy rows.
            const primaryStore = (m.storeIds && m.storeIds[0])
              ? stores.find(s => s.id === m.storeIds[0])
              : null;
            const extraStoreCount = Math.max(0, (m.storeIds || []).length - 1);
            // Role + department come from FKs if linked, else legacy text
            const roleLabel = storeRoles.find(r => r.id === m.roleId)?.name || m.role || "";
            const deptLabel = storeDepartments.find(d => d.id === m.departmentId)?.name || m.department || "";
            const locationLabel = primaryStore
              ? `${brand?.name ? brand.name + " · " : ""}${primaryStore.shortName || primaryStore.name}${extraStoreCount > 0 ? ` +${extraStoreCount}` : ""}`
              : (brand?.name || "");
            return (
              <div
                key={m.id}
                className="flex items-center gap-4 bg-slate-900 border border-slate-700 rounded-2xl px-5 py-4 hover:border-slate-600 transition-colors cursor-pointer"
                onClick={() => onOpenEmployeeProfile?.(m.id)}
                title="Click to open profile"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: (m.color || "#6366f1") + "30", color: m.color || "#6366f1" }}>{m.firstName[0]}{m.lastName?.[0] || ""}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-bold text-white">{m.firstName} {m.lastName}{m.nickname ? <span className="text-slate-600 font-normal ml-1">({m.nickname})</span> : ""}</div>
                    {/* Slice 5 — pending_setup badge nudges manager to complete
                        role/department/hourly_rate assignment for newly-hired
                        employees that came in via the hire workflow. */}
                    {m.status === "pending_setup" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-800 text-amber-300 font-semibold">
                        ⚠ Pending setup
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-600">{[roleLabel, deptLabel, locationLabel].filter(Boolean).join(" · ") || (m.status === "pending_setup" ? "Click to open profile and complete setup (role, department, hourly rate)" : "")}</div>
                  {!primaryStore && (m.storeIds?.length || 0) === 0 && (
                    <div className="text-[10px] text-amber-500 mt-0.5">⚠ Not yet linked to a store — click to set</div>
                  )}
                </div>
                {/* stopPropagation on action buttons so clicking edit/delete
                    doesn't ALSO open the profile (the row-click handler) */}
                <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setTmModal(m)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700" title="Edit basic details"><Edit size={13}/></button>
                  <button onClick={() => setDelTarget({ msg: `Delete ${m.firstName} ${m.lastName}?`, fn: () => onDeleteOpsTeam(m.id) })} className="p-2 rounded-xl bg-slate-800 text-slate-600 hover:text-red-400 hover:bg-red-950/20" title="Delete"><Trash2 size={13}/></button>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {clModal && (
        <ChecklistSettingsFormModal
          item={clModal === "new" ? null : clModal}
          brands={brands}
          stores={stores}
          onSave={item => { clModal === "new" ? onAddChecklist(item) : onUpdateChecklist(item); setClModal(null); }}
          onClose={() => setClModal(null)}
        />
      )}
      {tuModal && (
        <TempUnitFormModal
          item={tuModal === "new" ? null : tuModal}
          brands={brands}
          stores={stores}
          onSave={item => { tuModal === "new" ? onAddTempUnit(item) : onUpdateTempUnit(item); setTuModal(null); }}
          onClose={() => setTuModal(null)}
        />
      )}
      {ctModal && (
        <CleaningTaskFormModal
          item={ctModal === "new" ? null : ctModal}
          brands={brands}
          stores={stores}
          onSave={item => { ctModal === "new" ? onAddCleanTask(item) : onUpdateCleanTask(item); setCtModal(null); }}
          onClose={() => setCtModal(null)}
        />
      )}
      {tmModal && (
        <OpsTeamMemberFormModal
          item={tmModal === "new" ? null : tmModal}
          brands={brands}
          stores={stores}
          visibleStoreIds={visibleStoreIds}
          storeDepartments={storeDepartments}
          storeRoles={storeRoles}
          opsTeam={opsTeam}
          onSave={item => { tmModal === "new" ? onAddOpsTeam(item) : onUpdateOpsTeam(item); setTmModal(null); }}
          onClose={() => setTmModal(null)}
        />
      )}
      {delTarget && <OpsConfirmModal message={delTarget.msg} onConfirm={delTarget.fn} onClose={() => setDelTarget(null)}/>}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPDESK — Ticket System
// ═══════════════════════════════════════════════════════════════════════════════

const HELPDESK_CATEGORIES = ["General","Equipment","IT / Tech","Cleaning","HR","Health & Safety","Stock","Training","Other"];
const HELPDESK_PRIORITIES  = ["Urgent","High","Normal","Low"];
const HELPDESK_STATUSES    = ["Open","In Progress","Pending","Resolved","Closed"];
const HD_STATUS_COLOR = { Open:"red", "In Progress":"amber", Pending:"indigo", Resolved:"emerald", Closed:"slate" };
const HD_PRIORITY_COLOR = { Urgent:"red", High:"amber", Normal:"indigo", Low:"slate" };

// ── Ticket Detail Modal (managers/owners) ─────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// AVAILABILITY — Employee submission + Manager review
// ═══════════════════════════════════════════════════════════════════════════════

const DAYS_OF_WEEK = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const AVAIL_STATUS_COLOR = { pending:"amber", approved:"emerald", rejected:"red", amended:"indigo" };
const AVAIL_STATUS_ICON  = { pending:"⏳", approved:"✓", rejected:"✗", amended:"✎" };

function fmtAvailDate(a) {
  if (a.type === "one_off")   return a.date ? new Date(a.date).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"}) : "—";
  if (a.type === "weekly")    return a.dayOfWeek || "—";
  if (a.type === "recurring") return `${a.startDate ? new Date(a.startDate).toLocaleDateString("en-GB",{day:"numeric",month:"short"}) : "?"} – ${a.endDate ? new Date(a.endDate).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}) : "?"}`;
  return "—";
}

function fmtAvailTime(a) {
  const st = (a.status === "amended" && a.amendedStartTime) ? a.amendedStartTime : a.startTime;
  const et = (a.status === "amended" && a.amendedEndTime)   ? a.amendedEndTime   : a.endTime;
  return `${st || "09:00"} – ${et || "17:00"}`;
}

// ── Availability: standalone picker components (top-level — no hooks-in-functions) ──

function AvailCalendarPicker({ value, minDate, onSelect, onClose }) {
  // Use local date string to avoid UTC/BST shifting
  const toLocal = (d) => {
    const y = d.getFullYear(), mo = String(d.getMonth()+1).padStart(2,"0"), dd = String(d.getDate()).padStart(2,"0");
    return `${y}-${mo}-${dd}`;
  };

  const initMonth = () => {
    const d = value ? new Date(value + "T00:00:00") : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  };
  const [calMonth, setCalMonth] = useState(initMonth);
  const prevMonth = () => setCalMonth(m => new Date(m.getFullYear(), m.getMonth()-1, 1));
  const nextMonth = () => setCalMonth(m => new Date(m.getFullYear(), m.getMonth()+1, 1));

  const year  = calMonth.getFullYear();
  const month = calMonth.getMonth();
  // getDay(): 0=Sun,1=Mon,...,6=Sat → Mon-start offset
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const todayStr = toLocal(new Date()); // local today

  // Build cell array: null for padding, dateStr for real days
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="absolute z-50 top-full mt-1 left-0 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3 w-72"
      onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-2 px-1">
        <button onClick={prevMonth} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
          <ChevronLeft size={15}/>
        </button>
        <div className="text-sm font-bold text-white">
          {calMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        </div>
        <button onClick={nextMonth} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
          <ChevronRight size={15}/>
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d => (
          <div key={d} className="text-center text-xs font-semibold text-slate-500 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={i}/>;
          const isSelected  = dateStr === value;
          const isToday     = dateStr === todayStr;
          const isDisabled  = minDate && dateStr < minDate;
          return (
            <button key={i} disabled={isDisabled}
              onClick={() => { onSelect(dateStr); }}
              className={`h-8 w-full rounded-lg text-xs font-medium transition-all ${
                isDisabled  ? "text-slate-700 cursor-not-allowed" :
                isSelected  ? "bg-indigo-600 text-white font-bold" :
                isToday     ? "border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/20" :
                              "text-slate-700 hover:bg-slate-800"
              }`}>
              {parseInt(dateStr.split("-")[2])}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 pt-2 border-t border-slate-800/60">
        <button onClick={() => { onSelect(""); onClose(); }} className="text-xs text-slate-500 hover:text-slate-700 transition-colors">Clear</button>
        <button onClick={onClose} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">Done</button>
      </div>
    </div>
  );
}

function AvailDateField({ label, value, onChange, minDate, placeholder }) {
  const [open, setOpen] = useState(false);
  const display = value
    ? new Date(value + "T00:00:00").toLocaleDateString("en-GB", { weekday:"short", day:"numeric", month:"short", year:"numeric" })
    : placeholder || "Select date";
  return (
    <div className="relative">
      {/* Entire block is clickable — label + input row */}
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="w-full text-left group">
        {label && (
          <div className={`${labelCls} group-hover:text-slate-700 transition-colors`}>{label}</div>
        )}
        <div className={`${inputCls} flex items-center justify-between w-full ${!value ? "text-slate-500" : "text-white"}`}>
          <span className="truncate">{display}</span>
          <Calendar size={14} className="text-slate-600 flex-shrink-0 ml-2"/>
        </div>
      </button>
      {open && (
        <AvailCalendarPicker
          value={value} minDate={minDate}
          onSelect={v => { onChange(v); if (v) setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function AvailTimeField({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [hh, mm] = (value || "09:00").split(":").map(Number);
  const hours   = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 15, 30, 45];
  const hhRef = useRef(null);
  const mmRef = useRef(null);

  useEffect(() => {
    if (open) {
      // Scroll selected hour/minute into view
      setTimeout(() => {
        hhRef.current?.children[hh]?.scrollIntoView({ block: "center" });
        mmRef.current?.children[minutes.indexOf(mm < 8 ? 0 : mm < 23 ? 15 : mm < 38 ? 30 : 45)]?.scrollIntoView({ block: "center" });
      }, 50);
    }
  }, [open]);

  return (
    <div className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="w-full text-left group">
        {label && (
          <div className={`${labelCls} group-hover:text-slate-700 transition-colors`}>{label}</div>
        )}
        <div className={`${inputCls} flex items-center justify-between w-full`}>
          <span className="text-white font-mono">{value || "09:00"}</span>
          <Clock size={14} className="text-slate-600 flex-shrink-0 ml-2"/>
        </div>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3 w-52"
          onClick={e => e.stopPropagation()}>
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="text-xs font-semibold text-slate-600 text-center mb-1">Hour</div>
              <div className="max-h-44 overflow-y-auto space-y-0.5 scroll-smooth" ref={hhRef}>
                {hours.map(h => (
                  <button key={h}
                    onClick={() => onChange(`${String(h).padStart(2,"0")}:${String(mm).padStart(2,"0")}`)}
                    className={`w-full text-center text-sm py-1.5 rounded-lg transition-all font-mono ${hh === h ? "bg-indigo-600 text-white font-bold" : "text-slate-700 hover:bg-slate-800"}`}>
                    {String(h).padStart(2,"0")}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-px bg-slate-800"/>
            <div className="flex-1">
              <div className="text-xs font-semibold text-slate-600 text-center mb-1">Min</div>
              <div className="space-y-0.5" ref={mmRef}>
                {minutes.map(m => (
                  <button key={m}
                    onClick={() => onChange(`${String(hh).padStart(2,"0")}:${String(m).padStart(2,"0")}`)}
                    className={`w-full text-center text-sm py-1.5 rounded-lg transition-all font-mono ${mm === m ? "bg-indigo-600 text-white font-bold" : "text-slate-700 hover:bg-slate-800"}`}>
                    {String(m).padStart(2,"0")}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={() => setOpen(false)}
            className="w-full mt-3 pt-2 border-t border-slate-800/60 text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function EmployeeAvailabilityForm({ brands, currentUser, onSubmit, onCancel }) {
  const myBrands  = brands.filter(b => currentUser.brandIds.includes(b.id));
  const [brandId, setBrandId]   = useState(myBrands[0]?.id || "");
  const [type,    setType]      = useState("one_off");
  const [available, setAvailable] = useState(true);
  const [form, setFormState]    = useState({
    date: "", dayOfWeek: "Monday", startDate: "", endDate: "",
    startTime: "09:00", endTime: "17:00", notes: "",
  });
  const set = (k, v) => setFormState(f => ({ ...f, [k]: v }));

  const isValid = () => {
    if (type === "one_off")   return !!form.date;
    if (type === "weekly")    return !!form.dayOfWeek;
    if (type === "recurring") return !!form.startDate && !!form.endDate;
    return false;
  };

  const handleSubmit = () => {
    if (!isValid()) return;
    onSubmit({
      id: `av-${Date.now()}`,
      brandId,
      employeeId:   currentUser.opsTeamMemberId || currentUser.id,
      employeeName: currentUser.name,
      type, available,
      date:       type === "one_off"   ? form.date      : null,
      dayOfWeek:  type === "weekly"    ? form.dayOfWeek : null,
      startDate:  type === "recurring" ? form.startDate : null,
      endDate:    type === "recurring" ? form.endDate   : null,
      startTime:   form.startTime,
      endTime:     form.endTime,
      notes:       form.notes,
      status:      "pending",
      managerNotes: "",
      createdAt:   new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/60/80 bg-slate-900 flex-shrink-0">
        <button onClick={onCancel} className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
          <ChevronLeft size={18}/>
        </button>
        <div className="text-sm font-bold text-white">Submit Availability</div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Location */}
        {myBrands.length > 1 && (
          <div>
            <label className={labelCls}>Location</label>
            <LocationDropdown brands={myBrands} value={brandId} onChange={setBrandId} className="w-full"/>
          </div>
        )}

        {/* Available / Unavailable */}
        <div>
          <label className={labelCls}>I am…</label>
          <div className="flex gap-2">
            <button onClick={() => setAvailable(true)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${available ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-800 border-slate-700 text-slate-600 hover:bg-slate-700"}`}>
              ✓ Available
            </button>
            <button onClick={() => setAvailable(false)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${!available ? "bg-red-600 border-red-500 text-white" : "bg-slate-800 border-slate-700 text-slate-600 hover:bg-slate-700"}`}>
              ✗ Unavailable
            </button>
          </div>
        </div>

        {/* Schedule type */}
        <div>
          <label className={labelCls}>Schedule type</label>
          <div className="flex gap-2">
            {[{key:"one_off",label:"One-off"},{key:"weekly",label:"Every week"},{key:"recurring",label:"Date range"}].map(t => (
              <button key={t.key} onClick={() => setType(t.key)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all ${type === t.key ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-slate-600 hover:bg-slate-700"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date pickers */}
        {type === "one_off" && (
          <AvailDateField label="Date" value={form.date} onChange={v => set("date", v)} placeholder="Select a date"/>
        )}
        {type === "weekly" && (
          <div>
            <label className={labelCls}>Day of week</label>
            <div className="grid grid-cols-4 gap-2">
              {DAYS_OF_WEEK.map(d => (
                <button key={d} onClick={() => set("dayOfWeek", d)}
                  className={`py-2.5 rounded-xl text-xs font-semibold border transition-all ${form.dayOfWeek === d ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-slate-600 hover:bg-slate-700"}`}>
                  {d.slice(0,3)}
                </button>
              ))}
            </div>
          </div>
        )}
        {type === "recurring" && (
          <div className="grid grid-cols-2 gap-3">
            <AvailDateField label="From" value={form.startDate} onChange={v => set("startDate", v)} placeholder="Start date"/>
            <AvailDateField label="To" value={form.endDate} onChange={v => set("endDate", v)} minDate={form.startDate} placeholder="End date"/>
          </div>
        )}

        {/* Time pickers */}
        <div className="grid grid-cols-2 gap-3">
          <AvailTimeField label="Start time" value={form.startTime} onChange={v => set("startTime", v)}/>
          <AvailTimeField label="End time"   value={form.endTime}   onChange={v => set("endTime",   v)}/>
        </div>

        {/* Notes */}
        <div>
          <label className={labelCls}>Notes (optional)</label>
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
            rows={3} placeholder="Any additional context…" className={`${inputCls} resize-none`}/>
        </div>
      </div>

      <div className="flex-shrink-0 p-4 border-t border-slate-800/60/80">
        <button onClick={handleSubmit} disabled={!isValid()}
          className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2">
          <Send size={14}/> Submit Availability
        </button>
        {!isValid() && (
          <div className="text-xs text-slate-500 text-center mt-2">
            {type === "one_off" ? "Please select a date" : type === "recurring" ? "Please select start and end dates" : ""}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Employee: My Availability List ────────────────────────────────────────────
// ── Shared: Availability Detail Modal (comments + re-submit for rejected) ────
function AvailabilityDetailModal({ item, currentUser, onUpdate, onClose }) {
  const [comment, setComment]     = useState("");
  const [localItem, setLocalItem] = useState(item);
  const [showResubmit, setShowResubmit] = useState(false);
  const isManager = currentUser.role === "manager" || isHqOrAbove(currentUser.role);
  const isRejected = localItem.status === "rejected";
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localItem.comments?.length]);

  const handleAddComment = () => {
    const text = comment.trim();
    if (!text) return;
    const newComment = {
      id: `ac-${Date.now()}`,
      author: currentUser.name,
      authorRole: currentUser.role,
      text,
      createdAt: new Date().toISOString(),
    };
    const updated = {
      ...localItem,
      comments: [...(localItem.comments || []), newComment],
      updatedAt: new Date().toISOString(),
    };
    setLocalItem(updated);
    onUpdate(updated);
    setComment("");
  };

  // Group comments by date
  const grouped = [];
  let lastDate = null;
  (localItem.comments || []).forEach(c => {
    const d = new Date(c.createdAt).toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" });
    if (d !== lastDate) { grouped.push({ type:"date", label:d }); lastDate=d; }
    grouped.push({ type:"comment", c });
  });

  const statusBg = {
    pending:  "bg-amber-950/20 border-amber-500/30",
    approved: "bg-emerald-950/20 border-emerald-500/30",
    rejected: "bg-red-950/20 border-red-500/30",
    amended:  "bg-indigo-950/30 border-indigo-500/30",
  }[localItem.status] || "bg-slate-900 border-slate-700";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg flex flex-col" style={{maxHeight:"90vh"}}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white truncate">{localItem.employeeName}</div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Badge label={`${AVAIL_STATUS_ICON[localItem.status]} ${localItem.status.charAt(0).toUpperCase()+localItem.status.slice(1)}`} color={AVAIL_STATUS_COLOR[localItem.status]}/>
              <Badge label={localItem.available ? "✓ Available" : "✗ Unavailable"} color={localItem.available ? "emerald" : "red"}/>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all flex-shrink-0">
            <X size={16}/>
          </button>
        </div>

        {/* Availability summary card */}
        <div className={`mx-4 mt-4 rounded-xl border p-3 ${statusBg} flex-shrink-0`}>
          <div className="text-sm font-bold text-white">{fmtAvailDate(localItem)}</div>
          <div className="text-xs text-slate-600 mt-0.5">{fmtAvailTime(localItem)}</div>
          {localItem.notes && <div className="text-xs text-slate-500 mt-1 italic">"{localItem.notes}"</div>}
          {localItem.status === "amended" && (
            <div className="mt-2 text-xs text-indigo-300 space-y-0.5">
              {localItem.amendedDate && <div>✎ Date → {new Date(localItem.amendedDate).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}</div>}
              {localItem.amendedDayOfWeek && <div>✎ Day → {localItem.amendedDayOfWeek}</div>}
              {(localItem.amendedStartTime||localItem.amendedEndTime) && <div>✎ Time → {localItem.amendedStartTime||localItem.startTime}–{localItem.amendedEndTime||localItem.endTime}</div>}
            </div>
          )}
          {localItem.managerNotes && (
            <div className="mt-2 pt-2 border-t border-white/10 text-xs text-slate-600 italic">
              Manager note: "{localItem.managerNotes}"
            </div>
          )}
        </div>

        {/* Re-submit option for rejected items (employee only) */}
        {isRejected && !isManager && (
          <div className="mx-4 mt-3 flex-shrink-0">
            {!showResubmit ? (
              <button onClick={() => setShowResubmit(true)}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                <RefreshCw size={14}/> Re-submit with changes
              </button>
            ) : (
              <div className="bg-slate-950 rounded-xl p-3 space-y-3">
                <div className="text-xs font-bold text-slate-700">Re-submit availability</div>
                <div className="grid grid-cols-2 gap-2">
                  <AvailDateField label="New date" value={localItem.date || ""} onChange={v => setLocalItem(x => ({...x, date: v}))} placeholder="Select date"/>
                  <div/>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <AvailTimeField label="Start" value={localItem.startTime} onChange={v => setLocalItem(x => ({...x, startTime: v}))}/>
                  <AvailTimeField label="End"   value={localItem.endTime}   onChange={v => setLocalItem(x => ({...x, endTime:   v}))}/>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowResubmit(false)} className="flex-1 py-2 rounded-xl bg-slate-700 text-slate-700 text-xs font-semibold hover:bg-slate-600 transition-colors">Cancel</button>
                  <button onClick={() => {
                    const updated = { ...localItem, status: "pending", managerNotes: "", updatedAt: new Date().toISOString() };
                    setLocalItem(updated); onUpdate(updated); setShowResubmit(false);
                  }} className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-colors">Re-submit</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Comment thread */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 min-h-0">
          {grouped.length === 0 && (
            <div className="flex flex-col items-center justify-center h-24 text-slate-600">
              <MessageSquare size={20} className="mb-2 text-slate-700"/>
              <div className="text-xs text-center">
                {isManager ? "Add a note for the employee below" : "Message your manager about this — type below and hit Enter"}
              </div>
            </div>
          )}
          {grouped.map((item, idx) => {
            if (item.type === "date") {
              return (
                <div key={`d-${idx}`} className="flex items-center justify-center my-2">
                  <span className="bg-slate-800 border border-slate-700 text-slate-500 text-xs px-3 py-0.5 rounded-full">{item.label}</span>
                </div>
              );
            }
            const c = item.c;
            const isMe = c.author === currentUser.name;
            const isStaff = c.authorRole === "manager" || c.authorRole === "owner";
            const av = avatarFor(c.author);
            return (
              <div key={c.id} className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                {!isMe && (
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mb-0.5"
                    style={{ background: av.bg + "30", color: av.bg }}>
                    {av.initials}
                  </div>
                )}
                <div className={`max-w-[75%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                  {!isMe && (
                    <div className="text-xs font-semibold mb-0.5 px-1" style={{ color: av.bg }}>
                      {c.author}{isStaff && <span className="text-slate-500 font-normal ml-1">· {c.authorRole}</span>}
                    </div>
                  )}
                  <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    isMe
                      ? "bg-indigo-600 text-white rounded-br-md"
                      : isStaff
                        ? "bg-slate-700 text-slate-100 border border-slate-600/60 rounded-bl-md"
                        : "bg-slate-800 text-slate-100 border border-slate-700 rounded-bl-md"
                  }`}>{c.text}</div>
                  <div className="text-xs text-slate-600 mt-0.5 px-1">
                    {new Date(c.createdAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}
                  </div>
                </div>
                {isMe && <div className="w-6 flex-shrink-0"/>}
              </div>
            );
          })}
          <div ref={bottomRef}/>
        </div>

        {/* Message input */}
        <div className="flex-shrink-0 px-3 py-3 border-t border-slate-800/60/80 bg-slate-900/40">
          {!isManager && (
            <div className="text-xs text-slate-500 mb-2 px-1">
              💬 Reply to your manager
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
              placeholder={isManager ? "Add a note or update for the employee…" : "Type your message here…"}
              rows={2}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl px-3 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none resize-none max-h-24 transition-colors"
            />
            <button onClick={handleAddComment} disabled={!comment.trim()}
              className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 flex items-center justify-center transition-all active:scale-95 flex-shrink-0">
              <Send size={15} className="text-white ml-0.5"/>
            </button>
          </div>
          <div className="text-xs text-slate-700 mt-1 px-1">Enter to send · Shift+Enter for new line</div>
        </div>
      </div>
    </div>
  );
}

// ── Employee: My Availability View ────────────────────────────────────────────
function EmployeeAvailabilityView({ brands, currentUser, availability, onAdd, onUpdate }) {
  const myId = currentUser.opsTeamMemberId || currentUser.id;
  const [showForm,   setShowForm]   = useState(false);
  const [detailItem, setDetailItem] = useState(null);

  const myAvail = availability
    .filter(a => a.employeeId === myId)
    .sort((a, b) => new Date(b.updatedAt||b.createdAt) - new Date(a.updatedAt||a.createdAt));

  const myBrands = brands.filter(b => currentUser.brandIds.includes(b.id));

  // Keep detail item in sync with live availability prop (realtime updates)
  useEffect(() => {
    if (detailItem) {
      const fresh = availability.find(a => a.id === detailItem.id);
      if (fresh && JSON.stringify(fresh) !== JSON.stringify(detailItem)) setDetailItem(fresh);
    }
  }, [availability]);

  if (showForm) {
    return (
      <EmployeeAvailabilityForm
        brands={myBrands} currentUser={currentUser}
        onSubmit={a => { onAdd(a); setShowForm(false); }}
        onCancel={() => setShowForm(false)}
      />
    );
  }

  const hasUnreadComment = (a) =>
    (a.comments || []).some(c => (c.authorRole === "manager" || c.authorRole === "owner") && c.author !== currentUser.name);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">My Availability</h2>
          <p className="text-xs text-slate-600 mt-0.5">Submit your availability for your manager to review</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors">
          <Plus size={14}/> Add Availability
        </button>
      </div>

      {myAvail.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <Calendar size={32} className="mb-3 text-slate-700"/>
          <div className="text-sm font-semibold">No availability submitted yet</div>
          <div className="text-xs mt-1 text-slate-600">Tap the button above to get started</div>
        </div>
      )}

      <div className="space-y-3">
        {myAvail.map(a => {
          const hasComment = hasUnreadComment(a);
          const commentCount = (a.comments||[]).length;
          return (
            <button key={a.id} onClick={() => setDetailItem(a)}
              className={`w-full text-left rounded-2xl border p-4 transition-all hover:border-slate-500/60 ${
                a.status === "approved" ? "bg-emerald-950/20 border-emerald-500/30" :
                a.status === "rejected" ? "bg-red-950/20 border-red-500/30" :
                a.status === "amended"  ? "bg-indigo-950/30 border-indigo-500/30" :
                "bg-slate-900 border-slate-700"
              }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge label={`${AVAIL_STATUS_ICON[a.status]} ${a.status.charAt(0).toUpperCase()+a.status.slice(1)}`} color={AVAIL_STATUS_COLOR[a.status]}/>
                    <Badge label={a.available ? "✓ Available" : "✗ Unavailable"} color={a.available ? "emerald" : "red"}/>
                    <Badge label={a.type === "one_off" ? "One-off" : a.type === "weekly" ? "Weekly" : "Date Range"} color="slate"/>
                  </div>
                  <div className="text-sm font-bold text-white">{fmtAvailDate(a)}</div>
                  <div className="text-xs text-slate-600">{fmtAvailTime(a)}</div>
                  <div className="flex items-center gap-3 mt-1.5">
                    {commentCount > 0 && (
                      <span className={`flex items-center gap-1 text-xs ${hasComment ? "text-indigo-400 font-semibold" : "text-slate-500"}`}>
                        <MessageSquare size={11}/>{commentCount} {hasComment && "· Manager replied"}
                      </span>
                    )}
                    {a.status === "rejected" && (
                      <span className="text-xs text-red-400 font-semibold">Tap to re-submit →</span>
                    )}
                  </div>
                </div>
                {/* Always-visible open button */}
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-xs font-semibold">
                    <MessageSquare size={11}/>
                    {commentCount > 0 ? `Reply (${commentCount})` : "Open"}
                  </div>
                </div>
              </div>
              {a.managerNotes && a.status !== "pending" && (
                <div className={`mt-2 text-xs italic px-1 ${a.status === "rejected" ? "text-red-400" : a.status === "amended" ? "text-indigo-400" : "text-slate-500"}`}>
                  Manager: "{a.managerNotes}"
                </div>
              )}
              <div className="text-xs text-slate-600 mt-1.5">
                Submitted {new Date(a.createdAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}
              </div>
            </button>
          );
        })}
      </div>

      {detailItem && (
        <AvailabilityDetailModal
          item={detailItem} currentUser={currentUser}
          onUpdate={updated => { onUpdate(updated); setDetailItem(updated); }}
          onClose={() => setDetailItem(null)}
        />
      )}
    </div>
  );
}

// ── Manager: Amend Modal ──────────────────────────────────────────────────────
function AmendAvailabilityModal({ item, onSave, onClose }) {
  const [form, setFormState] = useState({
    amendedDate:      item.amendedDate      || item.date        || "",
    amendedDayOfWeek: item.amendedDayOfWeek || item.dayOfWeek   || "Monday",
    amendedStartTime: item.amendedStartTime || item.startTime   || "09:00",
    amendedEndTime:   item.amendedEndTime   || item.endTime     || "17:00",
    managerNotes:     item.managerNotes     || "",
  });
  const set = (k, v) => setFormState(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    onSave({
      ...item, status: "amended",
      amendedDate:      item.type === "one_off"   ? form.amendedDate       : null,
      amendedDayOfWeek: item.type === "weekly"    ? form.amendedDayOfWeek  : null,
      amendedStartTime: form.amendedStartTime,
      amendedEndTime:   form.amendedEndTime,
      managerNotes:     form.managerNotes,
      updatedAt:        new Date().toISOString(),
    });
    onClose();
  };

  return (
    <Modal title="Amend Availability" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">Cancel</button>
        <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500">Save Amendment</button>
      </>}>
      <div className="space-y-4">
        <div className="bg-slate-950 rounded-xl p-3 text-xs text-slate-600 space-y-1">
          <div><span className="font-semibold text-slate-700">{item.employeeName}</span> · {item.type === "one_off" ? "One-off" : item.type === "weekly" ? "Weekly" : "Date Range"}</div>
          <div>Original: {fmtAvailDate(item)} · {item.startTime}–{item.endTime}</div>
        </div>
        {item.type === "one_off" && (
          <AvailDateField label="Amended Date" value={form.amendedDate} onChange={v => set("amendedDate", v)} placeholder="Select new date"/>
        )}
        {item.type === "weekly" && (
          <div><label className={labelCls}>Amended Day</label>
            <div className="grid grid-cols-4 gap-2">
              {DAYS_OF_WEEK.map(d => (
                <button key={d} onClick={() => set("amendedDayOfWeek", d)}
                  className={`py-2 rounded-xl text-xs font-semibold border transition-all ${form.amendedDayOfWeek === d ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-slate-600 hover:bg-slate-700"}`}>
                  {d.slice(0,3)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <AvailTimeField label="Amended Start" value={form.amendedStartTime} onChange={v => set("amendedStartTime", v)}/>
          <AvailTimeField label="Amended End"   value={form.amendedEndTime}   onChange={v => set("amendedEndTime",   v)}/>
        </div>
        <div><label className={labelCls}>Note to employee</label>
          <textarea value={form.managerNotes} onChange={e => set("managerNotes", e.target.value)}
            rows={3} placeholder="Explain the change…" className={`${inputCls} resize-none`}/>
        </div>
      </div>
    </Modal>
  );
}

// ── Manager: Add Availability for Employee ────────────────────────────────────
function AddAvailabilityModal({ brands, opsTeam, onSave, onClose }) {
  const [form, setFormState] = useState({
    brandId: brands[0]?.id || "", employeeId: "", type: "one_off",
    available: true, date: "", dayOfWeek: "Monday",
    startDate: "", endDate: "", startTime: "09:00", endTime: "17:00",
    notes: "", managerNotes: "",
  });
  const set = (k, v) => setFormState(f => ({ ...f, [k]: v }));
  const brandMembers   = opsTeam.filter(m => m.brandId === form.brandId);
  const selectedMember = opsTeam.find(m => m.id === form.employeeId);

  const isValid = () => {
    if (!form.employeeId) return false;
    if (form.type === "one_off")   return !!form.date;
    if (form.type === "weekly")    return !!form.dayOfWeek;
    if (form.type === "recurring") return !!form.startDate && !!form.endDate;
    return false;
  };

  const handleSave = () => {
    if (!isValid()) return;
    onSave({
      id: `av-${Date.now()}`,
      brandId: form.brandId,
      employeeId: form.employeeId,
      employeeName: selectedMember ? `${selectedMember.firstName} ${selectedMember.lastName}`.trim() : "",
      type: form.type, available: form.available,
      date:       form.type === "one_off"   ? form.date       : null,
      dayOfWeek:  form.type === "weekly"    ? form.dayOfWeek  : null,
      startDate:  form.type === "recurring" ? form.startDate  : null,
      endDate:    form.type === "recurring" ? form.endDate    : null,
      startTime: form.startTime, endTime: form.endTime,
      notes: form.notes, status: "approved",
      managerNotes: form.managerNotes || "Added by manager",
      comments: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <Modal title="Add Employee Availability" onClose={onClose} maxW="max-w-lg"
      footer={<>
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">Cancel</button>
        <button onClick={handleSave} disabled={!isValid()} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-40">Add</button>
      </>}>
      <div className="space-y-4">
        <div><label className={labelCls}>Location</label>
          <LocationDropdown brands={brands} value={form.brandId} onChange={v => { set("brandId", v); set("employeeId", ""); }} className="w-full"/>
        </div>
        <div><label className={labelCls}>Employee *</label>
          <SelectDropdown value={form.employeeId} onChange={v => set("employeeId", v)} className="w-full">
            <option value="">— Select employee —</option>
            {brandMembers.map(m => <option key={m.id} value={m.id}>{m.firstName} {m.lastName} · {m.role}</option>)}
          </SelectDropdown>
        </div>
        <div><label className={labelCls}>Availability</label>
          <div className="flex gap-2">
            <button onClick={() => set("available", true)} className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${form.available ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-800 border-slate-700 text-slate-600 hover:bg-slate-700"}`}>✓ Available</button>
            <button onClick={() => set("available", false)} className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${!form.available ? "bg-red-600 border-red-500 text-white" : "bg-slate-800 border-slate-700 text-slate-600 hover:bg-slate-700"}`}>✗ Unavailable</button>
          </div>
        </div>
        <div><label className={labelCls}>Schedule Type</label>
          <div className="flex gap-2">
            {[{key:"one_off",label:"One-off"},{key:"weekly",label:"Weekly"},{key:"recurring",label:"Date Range"}].map(t => (
              <button key={t.key} onClick={() => set("type", t.key)} className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${form.type === t.key ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-slate-600 hover:bg-slate-700"}`}>{t.label}</button>
            ))}
          </div>
        </div>
        {form.type === "one_off"   && <AvailDateField label="Date" value={form.date} onChange={v => set("date", v)} placeholder="Select date"/>}
        {form.type === "weekly"    && <div><label className={labelCls}>Day</label><div className="grid grid-cols-4 gap-2">{DAYS_OF_WEEK.map(d => <button key={d} onClick={() => set("dayOfWeek", d)} className={`py-2 rounded-xl text-xs font-semibold border transition-all ${form.dayOfWeek === d ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-slate-600 hover:bg-slate-700"}`}>{d.slice(0,3)}</button>)}</div></div>}
        {form.type === "recurring" && <div className="grid grid-cols-2 gap-3"><AvailDateField label="From" value={form.startDate} onChange={v => set("startDate", v)} placeholder="Start date"/><AvailDateField label="To" value={form.endDate} onChange={v => set("endDate", v)} minDate={form.startDate} placeholder="End date"/></div>}
        <div className="grid grid-cols-2 gap-3">
          <AvailTimeField label="Start Time" value={form.startTime} onChange={v => set("startTime", v)}/>
          <AvailTimeField label="End Time"   value={form.endTime}   onChange={v => set("endTime",   v)}/>
        </div>
        <div><label className={labelCls}>Notes</label><textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="Any notes…"/></div>
      </div>
    </Modal>
  );
}

// ── Manager: Availability Tracker ─────────────────────────────────────────────
function ManagerAvailabilityView({ brands, opsTeam, availability, currentUser, onUpdate, onAdd, onDelete }) {
  const { user } = useAuth();
  const vb = brands.filter(b => isHqOrAbove(user.role) || user.brandIds.includes(b.id));
  const [filterBrand,    setFilterBrand]    = useState("all");
  const [filterStatus,   setFilterStatus]   = useState("pending");
  const [filterType,     setFilterType]     = useState("all");
  const [filterEmployee, setFilterEmployee] = useState("all");
  const [amendModal,     setAmendModal]     = useState(null);
  const [addModal,       setAddModal]       = useState(false);
  const [rejectModal,    setRejectModal]    = useState(null);
  const [rejectNote,     setRejectNote]     = useState("");
  const [detailItem,     setDetailItem]     = useState(null);
  const [viewMode,       setViewMode]       = useState("list");

  // Keep detail in sync with realtime updates
  useEffect(() => {
    if (detailItem) {
      const fresh = availability.find(a => a.id === detailItem.id);
      if (fresh && JSON.stringify(fresh) !== JSON.stringify(detailItem)) setDetailItem(fresh);
    }
  }, [availability]);

  const visible = availability.filter(a => {
    if (!vb.some(b => b.id === a.brandId)) return false;
    if (filterBrand    !== "all" && a.brandId    !== filterBrand)    return false;
    if (filterStatus   !== "all" && a.status     !== filterStatus)   return false;
    if (filterType     !== "all" && a.type       !== filterType)     return false;
    if (filterEmployee !== "all" && a.employeeId !== filterEmployee) return false;
    return true;
  }).sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (b.status === "pending" && a.status !== "pending") return 1;
    return new Date(b.updatedAt||b.createdAt) - new Date(a.updatedAt||a.createdAt);
  });

  const pendingCount = availability.filter(a => vb.some(b => b.id === a.brandId) && a.status === "pending").length;
  const handleApprove = (a) => onUpdate({ ...a, status: "approved", updatedAt: new Date().toISOString() });
  const handleReject  = (a, note) => onUpdate({ ...a, status: "rejected", managerNotes: note, updatedAt: new Date().toISOString() });

  const employeeOptions = [...new Map(
    availability.filter(a => vb.some(b => b.id === a.brandId)).map(a => [a.employeeId, { id: a.employeeId, name: a.employeeName }])
  ).values()];

  const statusColor = s => ({ pending:"amber", approved:"emerald", rejected:"red", amended:"indigo" }[s]||"slate");

  const today = new Date();
  const [calWeekOffset, setCalWeekOffset] = useState(0);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1 + calWeekOffset * 7);
  const weekDays = DAYS_OF_WEEK.map((_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });

  const getAvailForDay = (date) => {
    const y=date.getFullYear(),mo=String(date.getMonth()+1).padStart(2,"0"),dd=String(date.getDate()).padStart(2,"0");
    const dateStr = `${y}-${mo}-${dd}`;
    const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];
    return availability.filter(a => {
      if (!vb.some(b => b.id === a.brandId)) return false;
      if (a.status === "rejected") return false;
      if (a.type === "one_off") return a.date === dateStr;
      if (a.type === "weekly") return (a.amendedDayOfWeek || a.dayOfWeek) === dayName;
      if (a.type === "recurring") return a.startDate <= dateStr && a.endDate >= dateStr;
      return false;
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-white">Availability Tracker</h2>
          {pendingCount > 0 && <div className="text-xs text-amber-400 mt-0.5">{pendingCount} pending review</div>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-900 border border-slate-700 rounded-xl p-0.5 gap-0.5">
            <button onClick={() => setViewMode("list")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode==="list"?"bg-indigo-600 text-white":"text-slate-400 hover:text-white"}`}>List</button>
            <button onClick={() => setViewMode("calendar")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode==="calendar"?"bg-indigo-600 text-white":"text-slate-400 hover:text-white"}`}>Week</button>
          </div>
          <button onClick={() => setAddModal(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors">
            <Plus size={14}/> Add
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <LocationDropdown brands={vb} value={filterBrand} onChange={setFilterBrand} allLabel="All Locations" className="w-40"/>
        <SelectDropdown value={filterStatus} onChange={setFilterStatus} className="w-36">
          <option value="all">All Status</option>
          <option value="pending">⏳ Pending</option>
          <option value="approved">✓ Approved</option>
          <option value="rejected">✗ Rejected</option>
          <option value="amended">✎ Amended</option>
        </SelectDropdown>
        <SelectDropdown value={filterType} onChange={setFilterType} className="w-36">
          <option value="all">All Types</option>
          <option value="one_off">One-off</option>
          <option value="weekly">Weekly</option>
          <option value="recurring">Date Range</option>
        </SelectDropdown>
        <SelectDropdown value={filterEmployee} onChange={setFilterEmployee} className="w-44">
          <option value="all">All Employees</option>
          {employeeOptions.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </SelectDropdown>
      </div>

      {viewMode === "list" && (
        <>
          {visible.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Calendar size={32} className="mb-3 text-slate-700"/>
              <div className="text-sm font-semibold">No availability records found</div>
            </div>
          )}
          <div className="space-y-3">
            {visible.map(a => {
              const brand = brands.find(b => b.id === a.brandId);
              const commentCount = (a.comments||[]).length;
              const hasEmployeeComment = (a.comments||[]).some(c => c.authorRole === "employee");
              return (
                <div key={a.id} className={`rounded-2xl border p-4 ${
                  a.status === "pending"  ? "bg-amber-950/20 border-amber-500/30" :
                  a.status === "approved" ? "bg-emerald-950/20/10 border-emerald-500/20" :
                  a.status === "rejected" ? "bg-red-950/20/10 border-red-500/20" :
                  "bg-indigo-950/10 border-indigo-500/20"
                }`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <div className="text-sm font-bold text-white">{a.employeeName}</div>
                        <Badge label={`${AVAIL_STATUS_ICON[a.status]} ${a.status.charAt(0).toUpperCase()+a.status.slice(1)}`} color={statusColor(a.status)}/>
                        <Badge label={a.available ? "✓ Available" : "✗ Unavailable"} color={a.available ? "emerald" : "red"}/>
                        <Badge label={a.type === "one_off" ? "One-off" : a.type === "weekly" ? "Weekly" : "Date Range"} color="slate"/>
                        {brand && <span className="text-xs text-slate-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{background:brand.color}}/>{brand.name}</span>}
                      </div>
                      <div className="text-sm font-semibold text-slate-200">{fmtAvailDate(a)}</div>
                      <div className="text-xs text-slate-600">{fmtAvailTime(a)}</div>
                      {a.notes && <div className="text-xs text-slate-500 mt-1 italic">"{a.notes}"</div>}
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {commentCount > 0 && (
                          <button onClick={() => setDetailItem(a)}
                            className={`flex items-center gap-1 text-xs transition-colors ${hasEmployeeComment ? "text-amber-400 font-semibold hover:text-amber-300" : "text-slate-500 hover:text-slate-700"}`}>
                            <MessageSquare size={11}/>{commentCount} {hasEmployeeComment && "· Employee commented"}
                          </button>
                        )}
                        <div className="text-xs text-slate-600">Submitted {new Date(a.createdAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      {a.status === "pending" && (
                        <>
                          <button onClick={() => handleApprove(a)} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors">✓ Approve</button>
                          <button onClick={() => { setRejectModal(a); setRejectNote(""); }} className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors">✗ Reject</button>
                          <button onClick={() => setAmendModal(a)} className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors">✎ Amend</button>
                        </>
                      )}
                      <button onClick={() => setDetailItem(a)} className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5">
                        <MessageSquare size={11}/> Chat
                      </button>
                      {a.status !== "pending" && (
                        <div className="flex gap-1.5">
                          <button onClick={() => setAmendModal(a)} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors" title="Amend"><Edit size={13}/></button>
                          <button onClick={() => onDelete(a.id)} className="p-1.5 rounded-xl bg-slate-800 text-slate-600 hover:text-red-400 hover:bg-red-950/20 transition-colors" title="Delete"><Trash2 size={13}/></button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {viewMode === "calendar" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button onClick={() => setCalWeekOffset(w => w-1)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"><ChevronLeft size={16}/></button>
            <div className="text-sm font-semibold text-white">
              {weekDays[0].toLocaleDateString("en-GB",{day:"numeric",month:"short"})} – {weekDays[6].toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}
            </div>
            <button onClick={() => setCalWeekOffset(w => w+1)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"><ChevronRight size={16}/></button>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map((day, idx) => {
              const dayAvail = getAvailForDay(day);
              const isToday  = day.toDateString() === new Date().toDateString();
              return (
                <div key={idx} className={`rounded-xl border p-2 min-h-24 ${isToday ? "border-indigo-500/30 bg-indigo-950/30" : "border-slate-800/60 bg-slate-900/40"}`}>
                  <div className={`text-xs font-bold mb-1.5 ${isToday ? "text-indigo-400" : "text-slate-600"}`}>
                    <div>{DAYS_OF_WEEK[idx].slice(0,3)}</div>
                    <div className={`text-sm ${isToday ? "text-indigo-300" : "text-slate-700"}`}>{day.getDate()}</div>
                  </div>
                  <div className="space-y-1">
                    {dayAvail.map(a => (
                      <button key={a.id} onClick={() => setDetailItem(a)}
                        className={`w-full text-xs rounded-lg px-1.5 py-1 truncate font-medium text-left transition-all ${a.available ? "bg-emerald-500/25 text-emerald-300 hover:bg-emerald-500/30" : "bg-red-500/25 text-red-300 hover:bg-red-500/30"}`}
                        title={`${a.employeeName} · ${fmtAvailTime(a)}`}>
                        {a.employeeName.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-500/40"/> Available</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-500/40"/> Unavailable</div>
          </div>
        </div>
      )}

      {/* Detail / comment modal */}
      {detailItem && (
        <AvailabilityDetailModal
          item={detailItem} currentUser={currentUser}
          onUpdate={updated => { onUpdate(updated); setDetailItem(updated); }}
          onClose={() => setDetailItem(null)}
        />
      )}

      {amendModal && (
        <AmendAvailabilityModal item={amendModal}
          onSave={updated => { onUpdate(updated); setAmendModal(null); }}
          onClose={() => setAmendModal(null)}/>
      )}
      {rejectModal && (
        <Modal title="Reject Availability" onClose={() => setRejectModal(null)}
          footer={<>
            <button onClick={() => setRejectModal(null)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">Cancel</button>
            <button onClick={() => { handleReject(rejectModal, rejectNote); setRejectModal(null); }} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500">Reject</button>
          </>}>
          <div className="space-y-3">
            <div className="bg-slate-950 rounded-xl p-3 text-xs text-slate-600">
              <div className="font-semibold text-slate-700 mb-1">{rejectModal.employeeName}</div>
              <div>{fmtAvailDate(rejectModal)} · {fmtAvailTime(rejectModal)}</div>
            </div>
            <div><label className={labelCls}>Reason (optional)</label>
              <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                rows={3} placeholder="Explain to the employee why this was rejected…" className={`${inputCls} resize-none`}/>
            </div>
          </div>
        </Modal>
      )}
      {addModal && (
        <AddAvailabilityModal brands={vb} opsTeam={opsTeam}
          onSave={a => { onAdd(a); setAddModal(false); }}
          onClose={() => setAddModal(false)}/>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPDESK — WhatsApp-style ticket chat
// ═══════════════════════════════════════════════════════════════════════════════

function fmtTicketTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7)  return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Shared chat panel — used by both manager and employee
function TicketChatPanel({ ticket, currentUser, onSendComment, isManager, onStatusChange, onAssign, onAssignToggle, allPeople, brands, stores = [], canAssign = true }) {
  // Backward-compat: if a caller still passes onAssignToggle (older code), we
  // fall through to it. New code should use onAssign with single-assignee
  // semantics — handler picks a person ID and the modal updates the ticket.
  const assignHandler = onAssign || onAssignToggle;
  const [body, setBody]         = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const bottomRef               = useRef(null);
  const brand = brands.find(b => b.id === ticket.brandId);
  const ticketStore = ticket.storeId ? stores.find(s => s.id === ticket.storeId) : null;
  const statusColors = { Open:"#dc2626","In Progress":"#d97706",Pending:"#4f46e5",Resolved:"#059669",Closed:"#475569" };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ticket.comments?.length]);

  const handleSend = () => {
    const text = body.trim();
    if (!text) return;
    onSendComment(ticket, {
      id: `cmt-${Date.now()}`,
      author: currentUser.name,
      authorRole: currentUser.role,
      text,
      createdAt: new Date().toISOString(),
    });
    setBody("");
  };

  // Group comments by date
  const grouped = [];
  let lastDate = null;
  (ticket.comments || []).forEach(c => {
    const d = new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    if (d !== lastDate) { grouped.push({ type: "date", label: d }); lastDate = d; }
    grouped.push({ type: "comment", c });
  });

  const isClosed = ticket.status === "Closed";

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/60/80 bg-slate-900 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white truncate">{ticket.title}</div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <Badge label={ticket.status} color={HD_STATUS_COLOR[ticket.status] || "slate"}/>
            <Badge label={ticket.priority} color={HD_PRIORITY_COLOR[ticket.priority] || "slate"}/>
            <Badge label={ticket.category} color="slate"/>
            {brand && <span className="text-xs text-slate-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{background:brand.color}}/>{brand.name}{ticketStore ? ` · ${ticketStore.shortName || ticketStore.name}` : ""}</span>}
          </div>
        </div>
        {isManager && (
          <button onClick={() => setShowInfo(s => !s)}
            className={`p-2 rounded-xl transition-all ${showInfo ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}
            title="Ticket details">
            <Info size={15}/>
          </button>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Chat messages */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
            {/* Original description */}
            {ticket.description && (
              <div className="flex justify-center mb-3">
                <div className="bg-slate-950 border border-slate-800/60 rounded-2xl px-4 py-3 max-w-[80%] text-sm text-slate-700 text-center">
                  <div className="text-xs text-slate-500 mb-1">Raised by {ticket.createdByName}</div>
                  {ticket.description}
                </div>
              </div>
            )}
            {ticket.assignedTo?.length > 0 && (
              <div className="flex justify-center mb-2">
                <span className="bg-indigo-950/10 border border-indigo-500/20 text-indigo-300 text-xs px-3 py-1 rounded-full">
                  Assigned to {ticket.assignedTo.join(", ")}
                </span>
              </div>
            )}
            {grouped.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 text-slate-600">
                <MessageSquare size={24} className="mb-2 text-slate-700"/>
                <div className="text-xs">No messages yet — send the first one</div>
              </div>
            )}
            {grouped.map((item, idx) => {
              if (item.type === "date") {
                return (
                  <div key={`d-${idx}`} className="flex items-center justify-center my-3">
                    <span className="bg-slate-800 border border-slate-700 text-slate-600 text-xs px-3 py-1 rounded-full">{item.label}</span>
                  </div>
                );
              }
              const c   = item.c;
              const isMe = c.author === currentUser.name;
              const isStaff = c.authorRole === "manager" || c.authorRole === "owner";
              const av = avatarFor(c.author);
              return (
                <div key={c.id} className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                  {!isMe && (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mb-0.5"
                      style={{ background: av.bg + "30", color: av.bg }}>
                      {av.initials}
                    </div>
                  )}
                  <div className={`max-w-[70%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    {!isMe && (
                      <div className="text-xs font-semibold mb-0.5 px-1 flex items-center gap-1.5" style={{ color: av.bg }}>
                        {c.author}
                        {isStaff && <span className="text-xs text-slate-500 font-normal">· {c.authorRole}</span>}
                      </div>
                    )}
                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      isMe
                        ? "bg-indigo-600 text-white rounded-br-md"
                        : isStaff
                          ? "bg-slate-700 text-slate-100 border border-slate-600/60 rounded-bl-md"
                          : "bg-slate-800 text-slate-100 border border-slate-700 rounded-bl-md"
                    }`}>{c.text}</div>
                    <div className={`text-xs text-slate-600 mt-0.5 px-1 ${isMe ? "text-right" : "text-left"}`}>
                      {new Date(c.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  {isMe && <div className="w-7 flex-shrink-0"/>}
                </div>
              );
            })}
            <div ref={bottomRef}/>
          </div>

          {/* Input bar */}
          {isClosed ? (
            <div className="flex-shrink-0 px-4 py-3 border-t border-slate-800/60/80 text-center text-xs text-slate-600">
              This ticket is closed
            </div>
          ) : (
            <div className="flex-shrink-0 px-3 py-3 border-t border-slate-800/60/80 bg-slate-900/40">
              <div className="flex items-end gap-2">
                <textarea value={body} onChange={e => setBody(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Type a message…" rows={1}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none resize-none max-h-28 transition-colors"/>
                <button onClick={handleSend} disabled={!body.trim()}
                  className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 flex items-center justify-center transition-all active:scale-95 flex-shrink-0">
                  <Send size={15} className="text-white ml-0.5"/>
                </button>
              </div>
              <div className="text-xs text-slate-700 mt-1 px-1">Enter to send · Shift+Enter for new line</div>
            </div>
          )}
        </div>

        {/* Manager info side panel */}
        {isManager && showInfo && (
          <div className="w-56 flex-shrink-0 border-l border-slate-800/60/80 bg-slate-900/40 overflow-y-auto p-4 space-y-4">
            <div>
              <div className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Status</div>
              <div className="space-y-1">
                {HELPDESK_STATUSES.map(s => (
                  <button key={s} onClick={() => onStatusChange(ticket, s)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${ticket.status === s ? "text-white" : "text-slate-600 hover:bg-slate-800"}`}
                    style={ticket.status === s ? { background: statusColors[s] } : {}}>{s}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Assigned To</div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {!canAssign && (
                  <div className="text-[10px] text-slate-600 italic px-2 py-1">Only Owner/HQ can change assignee.</div>
                )}
                {allPeople.map(p => {
                  // Single-assignee semantics: only the first element of
                  // assignedTo is the active assignee. We accept legacy rows
                  // that stored names instead of IDs by checking both.
                  const assignedId = (ticket.assignedTo || [])[0];
                  const assigned = assignedId === p.id || assignedId === p.name;
                  return (
                    <button key={p.id} onClick={() => canAssign && assignHandler(ticket, p.id, p.name)} disabled={!canAssign}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-all ${assigned ? "bg-indigo-600/20 text-indigo-300" : "text-slate-500 hover:bg-slate-950"} ${!canAssign ? "opacity-60 cursor-not-allowed" : ""}`}>
                      <span className="truncate">{p.name}{p.role ? <span className="text-slate-600 ml-1">({p.role})</span> : ""}</span>
                      {assigned && <Check size={11} className="text-indigo-400 flex-shrink-0"/>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="text-xs text-slate-600 space-y-1 border-t border-slate-800/60 pt-3">
              <div>Raised by {ticket.createdByName}</div>
              <div>{new Date(ticket.createdAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</div>
              <div>{ticket.comments?.length || 0} message{ticket.comments?.length !== 1 ? "s" : ""}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// New ticket form — used in employee view
function NewTicketForm({ brands, stores = [], currentUser, onSubmit, onCancel }) {
  const myBrands = brands.filter(b => currentUser.brandIds.includes(b.id));
  // Stores in scope for the user — picks from storeIds (for staff/managers)
  // or all owned stores (for owner/HQ). Lets them raise a ticket at a
  // specific store, or leave it as "General/HQ" (no store).
  const myStores = useMemo(() => {
    const all = (stores || []).filter(s => !s.archivedAt);
    if (isHqOrAbove(currentUser?.role)) return all;
    const ids = currentUser?.storeIds || [];
    return all.filter(s => ids.includes(s.id));
  }, [stores, currentUser]);
  // Default store: first one assigned to user, or "" (general) if no stores
  const [storeId, setStoreId] = useState(myStores[0]?.id || "");
  // brandId is derived from storeId when one is picked, otherwise user picks
  const [brandId, setBrandId] = useState(myBrands[0]?.id || "");
  const [form, setFormState]  = useState({ title: "", description: "", category: "General", priority: "Normal" });
  const set = (k, v) => setFormState(f => ({ ...f, [k]: v }));

  // When store changes, also update brandId to the store's brand
  const setStoreAndBrand = (sid) => {
    setStoreId(sid);
    if (sid) {
      const s = myStores.find(x => x.id === sid);
      if (s?.brandId) setBrandId(s.brandId);
    }
  };

  const showBrandPrefix = new Set(myStores.map(s => s.brandId)).size > 1;

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    const brand = myBrands.find(b => b.id === brandId);
    onSubmit({
      id: `hd-${Date.now()}`,
      brandId,
      brandName: brand?.name || "",
      storeId: storeId || null,
      ...form,
      title: form.title.trim(),
      status: "Open",
      createdById: currentUser.opsTeamMemberId || currentUser.id,
      createdByName: currentUser.name,
      assignedTo: [],   // Q1: starts unassigned for HQ triage
      comments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/60/80 bg-slate-900 flex-shrink-0">
        <button onClick={onCancel} className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
          <ChevronLeft size={18}/>
        </button>
        <div className="text-sm font-bold text-white">New Ticket</div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Store picker — replaces the old brand picker when stores are present.
            Optional: "General / HQ" lets you raise a ticket with no store. */}
        {myStores.length > 0 && (
          <div>
            <label className={labelCls}>Store</label>
            <select value={storeId} onChange={e => setStoreAndBrand(e.target.value)} className={inputCls}>
              <option value="">— General / HQ (no specific store) —</option>
              {myStores.map(s => {
                const b = brands.find(br => br.id === s.brandId);
                return <option key={s.id} value={s.id}>{showBrandPrefix && b ? `${b.name} · ` : ""}{s.shortName || s.name}</option>;
              })}
            </select>
          </div>
        )}
        {/* Brand picker fallback — only shown when no store is picked AND
            user has multiple brands (rare, mostly HQ/owner). */}
        {!storeId && myBrands.length > 1 && (
          <div><label className={labelCls}>Brand</label>
            <LocationDropdown brands={myBrands} value={brandId} onChange={setBrandId} className="w-full"/>
          </div>
        )}
        <div><label className={labelCls}>What do you need help with? *</label>
          <input value={form.title} onChange={e => set("title", e.target.value)}
            placeholder="Brief summary…" autoFocus className={inputCls}/>
        </div>
        <div><label className={labelCls}>Details</label>
          <textarea value={form.description} onChange={e => set("description", e.target.value)}
            rows={4} placeholder="Describe the problem in full…" className={`${inputCls} resize-none`}/>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Category</label>
            <SelectDropdown value={form.category} onChange={v => set("category", v)} className="w-full">
              {HELPDESK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </SelectDropdown>
          </div>
          <div><label className={labelCls}>Urgency</label>
            <SelectDropdown value={form.priority} onChange={v => set("priority", v)} className="w-full">
              {HELPDESK_PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </SelectDropdown>
          </div>
        </div>
      </div>
      <div className="flex-shrink-0 p-4 border-t border-slate-800/60/80">
        <button onClick={handleSubmit} disabled={!form.title.trim()}
          className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2">
          <Send size={14}/> Submit Ticket
        </button>
      </div>
    </div>
  );
}

// ── Manager Helpdesk ──────────────────────────────────────────────────────────
function HelpdeskManagerView({ brands, stores = [], visibleStoreIds = [], tickets, opsTeam, users, currentUser, onUpdate, onDelete }) {
  const { user } = useAuth();

  // Store scope (same pattern as other views). Used for: which tickets the
  // user CAN see + which people can be assigned + which stores show in the
  // ticket location chip.
  const allVisibleStores = useMemo(
    () => (stores || []).filter(s => visibleStoreIds?.includes(s.id) && !s.archivedAt),
    [stores, visibleStoreIds]
  );
  const [ownership, setOwnership] = useState(isHqOrAbove(user.role) ? "owned" : "all");
  const visibleScopedStores = useMemo(
    () => applyOwnershipFilter(allVisibleStores, ownership, user.role),
    [allVisibleStores, ownership, user.role]
  );
  const [selStore, setSelStore] = useState("all");
  useEffect(() => {
    if (selStore !== "all" && !visibleScopedStores.some(s => s.id === selStore)) {
      setSelStore("all");
    }
  }, [visibleScopedStores, selStore]);
  const inScopeStoreIds = useMemo(() => new Set(visibleScopedStores.map(s => s.id)), [visibleScopedStores]);
  const visibleBrandIds = useMemo(() => new Set(visibleScopedStores.map(s => s.brandId)), [visibleScopedStores]);
  const canAssign = isHqOrAbove(user.role);   // Q6 — only owner/HQ can assign

  // ── Bucket filter (replaces "see everything" mental model) ────────────────
  // - mine:        tickets assigned to me (default for managers)
  // - unassigned:  tickets with no assignee (HQ triage queue)
  // - all:         everything in scope (HQ overview, managers can flip to it)
  const defaultBucket = canAssign ? "unassigned" : "mine";
  const [bucket, setBucket] = useState(defaultBucket);

  const [filterStatus,   setFilterStatus]   = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [search,         setSearch]         = useState("");
  const [activeTicket,   setActiveTicket]   = useState(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  // Assignment candidates: anyone in the org. We label each with role so HQ
  // can pick "Aishwarya (Manager)". Excludes archived stores' employees.
  // For Q7: anyone can raise; for assignment we limit to internal staff.
  const allPeople = useMemo(() => {
    const internalUsers = users
      .filter(u => u.role !== "employee")
      .map(u => ({ id: u.id, name: u.name, role: u.role, kind: "user" }));
    const opsMembers = opsTeam.map(m => ({
      id: m.id,
      name: `${m.firstName} ${m.lastName}`.trim(),
      role: m.role || "Staff",
      kind: "ops",
    }));
    return [...internalUsers, ...opsMembers];
  }, [users, opsTeam]);

  // Scope predicate. Store-keyed tickets match by storeId; legacy
  // brand-keyed (storeId NULL) match by brand membership. Tickets with
  // NULL both are visible to owner/HQ as "general/HQ" tickets.
  const inScope = (t) => {
    if (t.storeId) {
      if (selStore === "all") return inScopeStoreIds.has(t.storeId);
      return t.storeId === selStore;
    }
    if (isHqOrAbove(user.role)) return true;                  // owner/HQ see general/HQ
    return t.brandId && visibleBrandIds.has(t.brandId);       // managers: brand fallback
  };

  // Keep active ticket in sync with live state — no refresh needed
  useEffect(() => {
    if (activeTicket) {
      const fresh = tickets.find(t => t.id === activeTicket.id);
      if (fresh) setActiveTicket(fresh);
    }
  }, [tickets]);

  // Visible list = scope ∩ bucket ∩ status/priority/search.
  const myId = currentUser?.id;
  const myOpsId = currentUser?.opsTeamMemberId || currentUser?.id;
  const isAssignedToMe = (t) => {
    const a = t.assignedTo || [];
    return a.includes(myId) || a.includes(myOpsId) || a.includes(currentUser?.name);
  };

  const visible = tickets.filter(t => {
    if (!inScope(t)) return false;
    if (bucket === "mine"       && !isAssignedToMe(t))                  return false;
    if (bucket === "unassigned" && (t.assignedTo || []).length > 0)     return false;
    if (filterStatus   !== "all" && t.status   !== filterStatus)        return false;
    if (filterPriority !== "all" && t.priority !== filterPriority)      return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
        !t.createdByName.toLowerCase().includes(search.toLowerCase()))  return false;
    return true;
  }).sort((a, b) => {
    const prio = { Urgent:0, High:1, Normal:2, Low:3 };
    if (a.status === "Closed" && b.status !== "Closed") return 1;
    if (b.status === "Closed" && a.status !== "Closed") return -1;
    return (prio[a.priority] - prio[b.priority]) || new Date(b.updatedAt||b.createdAt) - new Date(a.updatedAt||a.createdAt);
  });

  // Counts for the bucket strip — computed against scope (NOT bucket itself).
  const scopeTickets = useMemo(() => tickets.filter(inScope), [tickets, inScope]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bucketCounts = useMemo(() => ({
    mine:       scopeTickets.filter(isAssignedToMe).length,
    unassigned: scopeTickets.filter(t => (t.assignedTo || []).length === 0).length,
    all:        scopeTickets.length,
  }), [scopeTickets, currentUser?.id]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSendComment = (ticket, comment) => {
    const updated = { ...ticket, comments: [...(ticket.comments||[]), comment], updatedAt: new Date().toISOString() };
    onUpdate(updated); setActiveTicket(updated);
  };
  const handleStatusChange = (ticket, status) => {
    const updated = { ...ticket, status, updatedAt: new Date().toISOString() };
    onUpdate(updated); setActiveTicket(updated);
  };
  // Single-assignee assignment (Q2). Clicking a person SETS them as the sole
  // assignee. Clicking the current assignee unassigns. Reassignment generates
  // an audit comment (Q4).
  const handleAssign = (ticket, personId, personName) => {
    if (!canAssign) return;
    const wasAssigned = (ticket.assignedTo || [])[0];
    let newAssignment;
    let auditText;
    if (wasAssigned === personId) {
      newAssignment = [];
      auditText = `Unassigned (was ${personName}) — by ${currentUser?.name || "system"}`;
    } else {
      newAssignment = [personId];
      const wasPerson = allPeople.find(p => p.id === wasAssigned);
      auditText = wasAssigned
        ? `Reassigned from ${wasPerson?.name || "previous"} to ${personName} — by ${currentUser?.name || "system"}`
        : `Assigned to ${personName} — by ${currentUser?.name || "system"}`;
    }
    const auditComment = {
      id: `c-${Date.now()}`,
      author: "System",
      text: auditText,
      isSystem: true,
      createdAt: new Date().toISOString(),
    };
    const updated = {
      ...ticket,
      assignedTo: newAssignment,
      comments: [...(ticket.comments || []), auditComment],
      updatedAt: new Date().toISOString(),
    };
    onUpdate(updated);
    setActiveTicket(updated);
  };

  // ── UI ────────────────────────────────────────────────────────────────────

  const counts = HELPDESK_STATUSES.reduce((acc, s) => {
    acc[s] = scopeTickets.filter(t => t.status === s).length;
    return acc;
  }, {});
  const statusDot = s => ({ Open:"bg-red-400","In Progress":"bg-amber-400",Pending:"bg-indigo-400",Resolved:"bg-emerald-400",Closed:"bg-slate-600" }[s]||"bg-slate-600");

  if (allVisibleStores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <LifeBuoy size={32} className="mb-3 text-slate-700"/>
        <div className="text-sm font-semibold">No stores assigned to your account.</div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-[500px] rounded-2xl overflow-hidden border border-slate-800/60/80 bg-slate-950">
      {/* Left panel */}
      <div className={`flex flex-col border-r border-slate-800/60/80 bg-slate-900 flex-shrink-0 w-full lg:w-80 xl:w-96 ${mobileShowChat ? "hidden lg:flex" : "flex"}`}>
        <div className="px-4 py-3.5 border-b border-slate-800/60/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-white">Help Desk</div>
            <div className="flex items-center gap-1">
              {HELPDESK_STATUSES.map(s => (
                <button key={s} onClick={() => setFilterStatus(filterStatus === s ? "all" : s)} title={s}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${statusDot(s)} ${filterStatus === s ? "ring-2 ring-white/50 scale-125" : "opacity-40 hover:opacity-70"}`}/>
              ))}
            </div>
          </div>
          {/* Bucket selector — the main navigation */}
          <div className="flex gap-1 bg-slate-950 rounded-xl p-1">
            {[
              { key:"mine",       label:"My queue",   count:bucketCounts.mine },
              ...(canAssign ? [{ key:"unassigned", label:"Unassigned", count:bucketCounts.unassigned }] : []),
              { key:"all",        label:"All",        count:bucketCounts.all },
            ].map(b => (
              <button key={b.key} onClick={() => setBucket(b.key)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${bucket === b.key ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}>
                {b.label}
                <span className={`px-1.5 rounded-full text-[10px] ${bucket === b.key ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-500"}`}>{b.count}</span>
              </button>
            ))}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets…"
            className="w-full bg-slate-950 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none transition-colors"/>
          <div className="flex gap-2 flex-wrap">
            <StoreScopeDropdown stores={visibleScopedStores} brands={brands} value={selStore} onChange={setSelStore} className="flex-1 min-w-[140px]"/>
            <SelectDropdown value={filterPriority} onChange={setFilterPriority} className="flex-1 min-w-[100px]">
              <option value="all">All Priorities</option>
              {HELPDESK_PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </SelectDropdown>
          </div>
        </div>
        {/* Status count strip */}
        <div className="flex gap-2 px-4 py-2 border-b border-slate-800/60/50 overflow-x-auto">
          {HELPDESK_STATUSES.map(s => (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${filterStatus === s ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-700"}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${statusDot(s)}`}/>{counts[s]||0} {s}
            </button>
          ))}
        </div>
        {/* Ticket list */}
        <div className="flex-1 overflow-y-auto">
          {visible.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 px-4">
              <LifeBuoy size={28} className="mb-2 text-slate-700"/>
              <div className="text-sm font-semibold text-center">No tickets in this view</div>
              {bucket === "unassigned" && <div className="text-xs text-slate-700 mt-1 text-center">Triage queue empty</div>}
              {bucket === "mine"       && <div className="text-xs text-slate-700 mt-1 text-center">Nothing assigned to you</div>}
            </div>
          )}
          {visible.map(ticket => {
            const isActive = activeTicket?.id === ticket.id;
            const brand = brands.find(b => b.id === ticket.brandId);
            const store = ticket.storeId ? stores.find(s => s.id === ticket.storeId) : null;
            const lastComment = ticket.comments?.[ticket.comments.length-1];
            const assignedPerson = allPeople.find(p => p.id === (ticket.assignedTo || [])[0]);
            return (
              <button key={ticket.id} onClick={() => { setActiveTicket(ticket); setMobileShowChat(true); }}
                className={`w-full flex items-start gap-3 px-4 py-3.5 border-b border-slate-800/60 transition-all text-left ${isActive ? "bg-indigo-600/15" : "hover:bg-slate-800/40"}`}>
                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${statusDot(ticket.status)}`}/>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <div className="text-sm font-semibold text-white truncate">{ticket.title}</div>
                    <div className="text-xs text-slate-600 flex-shrink-0">{fmtTicketTime(ticket.updatedAt||ticket.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge label={ticket.priority} color={HD_PRIORITY_COLOR[ticket.priority]||"slate"}/>
                    {brand && <span className="text-xs text-slate-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{background:brand.color}}/>{brand.name}{store ? ` · ${store.shortName || store.name}` : ""}</span>}
                    {(ticket.assignedTo || []).length === 0
                      ? <Badge label="Unassigned" color="amber"/>
                      : assignedPerson && <span className="text-xs text-indigo-300">→ {assignedPerson.name}</span>}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {lastComment ? `${lastComment.author}: ${lastComment.text}` : ticket.description||"No messages yet"}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-600">by {ticket.createdByName}</span>
                    {ticket.comments?.length > 0 && <span className="flex items-center gap-1 text-xs text-slate-600"><MessageSquare size={10}/>{ticket.comments.length}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      {/* Right panel */}
      <div className={`flex-1 flex flex-col min-w-0 ${!mobileShowChat ? "hidden lg:flex" : "flex"}`}>
        {!activeTicket ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-3">
            <LifeBuoy size={32} className="text-slate-700"/>
            <div className="text-base font-semibold text-slate-500">Select a ticket</div>
          </div>
        ) : (
          <>
            <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b border-slate-800/60/80 bg-slate-900/40">
              <button onClick={() => setMobileShowChat(false)} className="p-1.5 text-slate-400 hover:text-white"><ChevronLeft size={18}/></button>
              <span className="text-xs text-slate-600">Back to tickets</span>
            </div>
            <TicketChatPanel
              ticket={activeTicket} currentUser={currentUser}
              onSendComment={handleSendComment} onStatusChange={handleStatusChange}
              onAssign={handleAssign} allPeople={allPeople} brands={brands} stores={stores}
              isManager={true} canAssign={canAssign}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── Employee Helpdesk ─────────────────────────────────────────────────────────
function EmployeeHelpdeskView({ brands, stores = [], tickets, currentUser, onAdd, onUpdate }) {
  const myBrands = brands.filter(b => currentUser.brandIds.includes(b.id));
  const [activeTicket,   setActiveTicket]   = useState(null);
  const [showNewForm,    setShowNewForm]    = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [bucket,         setBucket]         = useState("mine");   // "mine" | "assigned"

  const myId    = currentUser.opsTeamMemberId || currentUser.id;
  const myAltId = currentUser.id;

  // Tickets I raised
  const raisedByMe = tickets
    .filter(t => t.createdById === myId || t.createdById === myAltId)
    .filter(t => t.status !== "Closed");

  // Tickets assigned to me (single-assignee — check first element; also
  // tolerate legacy rows that stored names)
  const assignedToMe = tickets.filter(t => {
    const first = (t.assignedTo || [])[0];
    if (!first) return false;
    return first === myId || first === myAltId || first === currentUser.name;
  }).filter(t => t.status !== "Closed");

  const sortByRecent = arr => arr.slice().sort((a, b) =>
    new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  const myTickets = bucket === "mine" ? sortByRecent(raisedByMe) : sortByRecent(assignedToMe);

  // Sync activeTicket with live tickets prop
  useEffect(() => {
    if (activeTicket) {
      const fresh = tickets.find(t => t.id === activeTicket.id);
      if (fresh && JSON.stringify(fresh) !== JSON.stringify(activeTicket)) {
        setActiveTicket(fresh);
      }
    }
  }, [tickets]);

  const handleSendComment = (ticket, comment) => {
    const updated = { ...ticket, comments: [...(ticket.comments||[]), comment], updatedAt: new Date().toISOString() };
    onUpdate(updated); setActiveTicket(updated);
  };

  const statusDot = s => ({ Open:"bg-red-400","In Progress":"bg-amber-400",Pending:"bg-indigo-400",Resolved:"bg-emerald-400",Closed:"bg-slate-600" }[s]||"bg-slate-600");

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-[500px] rounded-2xl overflow-hidden border border-slate-800/60/80 bg-slate-950">
      {/* Left panel */}
      <div className={`flex flex-col border-r border-slate-800/60/80 bg-slate-900 flex-shrink-0 w-full lg:w-72 ${mobileShowChat ? "hidden lg:flex" : "flex"}`}>
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800/60/80">
          <div>
            <div className="text-sm font-bold text-white">Help Desk</div>
            {myTickets.length > 0 && <div className="text-xs text-slate-500">{myTickets.length} open</div>}
          </div>
          <button onClick={() => { setShowNewForm(true); setActiveTicket(null); setMobileShowChat(true); }}
            className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center transition-all shadow-md" title="New ticket">
            <Plus size={17} className="text-white"/>
          </button>
        </div>
        {/* Bucket: My raised tickets vs Tickets assigned to me */}
        <div className="flex gap-1 bg-slate-950 mx-4 mt-3 rounded-xl p-1">
          <button onClick={() => { setBucket("mine"); setActiveTicket(null); }}
            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${bucket === "mine" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}>
            Raised by me
            <span className={`px-1.5 rounded-full text-[10px] ${bucket === "mine" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-500"}`}>{raisedByMe.length}</span>
          </button>
          <button onClick={() => { setBucket("assigned"); setActiveTicket(null); }}
            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${bucket === "assigned" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}>
            Assigned to me
            <span className={`px-1.5 rounded-full text-[10px] ${bucket === "assigned" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-500"}`}>{assignedToMe.length}</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto mt-3">
          {myTickets.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 px-4">
              <LifeBuoy size={28} className="mb-2 text-slate-700"/>
              <div className="text-sm font-semibold text-center">{bucket === "mine" ? "No open tickets" : "Nothing assigned to you"}</div>
              {bucket === "mine" && <div className="text-xs text-slate-700 text-center mt-1">Tap + to raise one</div>}
            </div>
          )}
          {myTickets.map(ticket => {
            const isActive = activeTicket?.id === ticket.id;
            const lastComment = ticket.comments?.[ticket.comments.length-1];
            const hasManagerReply = ticket.comments?.some(c => c.authorRole === "manager" || c.authorRole === "owner");
            return (
              <button key={ticket.id} onClick={() => { setActiveTicket(ticket); setShowNewForm(false); setMobileShowChat(true); }}
                className={`w-full flex items-start gap-3 px-4 py-3.5 border-b border-slate-800/60 transition-all text-left ${isActive ? "bg-indigo-600/15" : "hover:bg-slate-800/40"}`}>
                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${statusDot(ticket.status)}`}/>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <div className="text-sm font-semibold text-white truncate">{ticket.title}</div>
                    <div className="text-xs text-slate-600 flex-shrink-0">{fmtTicketTime(ticket.updatedAt||ticket.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge label={ticket.status} color={HD_STATUS_COLOR[ticket.status]||"slate"}/>
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {lastComment ? `${lastComment.author === currentUser.name ? "You" : lastComment.author}: ${lastComment.text}` : ticket.description||"No messages yet"}
                  </div>
                  {hasManagerReply && <div className="text-xs text-indigo-400 mt-1 flex items-center gap-1"><MessageSquare size={10}/> Manager replied</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      {/* Right panel */}
      <div className={`flex-1 flex flex-col min-w-0 ${!mobileShowChat ? "hidden lg:flex" : "flex"}`}>
        {showNewForm ? (
          <NewTicketForm brands={brands} stores={stores} currentUser={currentUser}
            onSubmit={ticket => { onAdd(ticket); setShowNewForm(false); }}
            onCancel={() => { setShowNewForm(false); setMobileShowChat(false); }}/>
        ) : activeTicket ? (
          <>
            <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b border-slate-800/60/80 bg-slate-900/40">
              <button onClick={() => setMobileShowChat(false)} className="p-1.5 text-slate-400 hover:text-white"><ChevronLeft size={18}/></button>
              <span className="text-xs text-slate-600">Back to my tickets</span>
            </div>
            <TicketChatPanel ticket={activeTicket} currentUser={currentUser}
              onSendComment={handleSendComment} onStatusChange={() => {}} onAssign={() => {}}
              allPeople={[]} brands={brands} stores={stores} isManager={false} canAssign={false}/>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-3">
            <LifeBuoy size={32} className="text-slate-700"/>
            <div className="text-base font-semibold text-slate-500">Select a ticket</div>
            <div className="text-sm text-slate-600">or tap + to raise a new one</div>
          </div>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// INBOX — Messaging System
// ═══════════════════════════════════════════════════════════════════════════════

// ── Compose Message Modal ──────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// INBOX — WhatsApp-style chat
// ═══════════════════════════════════════════════════════════════════════════════

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtChatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7)  return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function fmtChatFull(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Build a unique conversation "thread key" from a message so we can group them
function threadKey(msg, myId, myOpsId) {
  if (msg.toScope === "individual") {
    // DM — key is sorted pair of sender + recipient
    const ids = [msg.fromId, msg.toPersonId].sort();
    return `dm:${ids[0]}:${ids[1]}`;
  }
  if (msg.toScope === "location") return `loc:${msg.toBrandId}`;
  return "broadcast:all";
}

// Build avatar initials + colour from a name
function avatarFor(name = "", color = "") {
  const initials = name.trim().split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "??";
  const colours  = ["#6366f1","#10b981","#f59e0b","#ef4444","#a78bfa","#ec4899","#14b8a6","#f97316"];
  if (color) return { initials, bg: color };
  // deterministic colour from name
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return { initials, bg: colours[Math.abs(h) % colours.length] };
}

// ── New Chat / Compose ────────────────────────────────────────────────────────
function NewChatModal({ currentUser, brands, opsTeam, users, onStart, onClose }) {
  const [search, setSearch] = useState("");
  const isOwner   = isHqOrAbove(currentUser.role);
  const myBrands  = brands.filter(b => currentUser.brandIds.includes(b.id));

  // All people I can message
  const people = [
    ...users
      .filter(u => u.id !== currentUser.id && (isOwner || u.brandIds?.some(bid => currentUser.brandIds.includes(bid))))
      .map(u => ({ id: u.id, name: u.name, sub: u.role, type: "user" })),
    ...opsTeam
      .filter(m => isOwner || currentUser.brandIds.includes(m.brandId))
      .map(m => {
        const b = brands.find(x => x.id === m.brandId);
        return { id: m.id, name: `${m.firstName} ${m.lastName}`.trim(), sub: `${m.role}${b ? " · " + b.name : ""}`, type: "ops" };
      }),
  ];

  // Groups (channels)
  const groups = [
    ...myBrands.map(b => ({ id: `loc:${b.id}`, name: b.name, sub: "Whole location", type: "location", color: b.color })),
    ...(isOwner ? [{ id: "broadcast:all", name: "All Locations", sub: "Everyone in the group", type: "broadcast" }] : []),
  ];

  const allOptions = [...groups, ...people];
  const filtered   = allOptions.filter(o => o.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Modal title="New Chat" onClose={onClose}>
      <div className="space-y-3">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search people or channels…"
          autoFocus
          className={inputCls}
        />
        <div className="space-y-1 max-h-80 overflow-y-auto -mx-1 px-1">
          {filtered.length === 0 && (
            <div className="text-xs text-slate-500 text-center py-6">No matches</div>
          )}
          {filtered.map(o => {
            const av = avatarFor(o.name, o.color || "");
            const icon = o.type === "location" ? "📍" : o.type === "broadcast" ? "📢" : null;
            return (
              <button key={o.id} onClick={() => onStart(o)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-950 transition-all text-left">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ background: av.bg + "30", color: av.bg }}>
                  {icon || av.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white">{o.name}</div>
                  <div className="text-xs text-slate-500">{o.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

// ── Chat Thread (the right panel) ─────────────────────────────────────────────
function ChatThread({ thread, messages, currentUser, brands, onSend, onMarkRead }) {
  const [body, setBody] = useState("");
  const bottomRef = useRef(null);
  const myId    = currentUser.id;
  const myOpsId = currentUser.opsTeamMemberId || currentUser.id;

  // Filter messages for this thread
  const threadMsgs = messages
    .filter(m => threadKey(m, myId, myOpsId) === thread.key)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // Mark unread on mount / when thread changes
  useEffect(() => {
    threadMsgs.forEach(m => {
      const isForMe = m.fromId !== myId && m.fromId !== myOpsId;
      if (isForMe && !m.readBy?.includes(myId)) onMarkRead(m.id, myId);
    });
  }, [thread.key]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMsgs.length]);

  const handleSend = () => {
    const text = body.trim();
    if (!text) return;
    const msg = {
      id:        `msg-${Date.now()}`,
      brandId:   thread.type === "location" ? thread.brandId : null,
      fromId:    myId, fromName: currentUser.name, fromRole: currentUser.role,
      toScope:   thread.type === "location" ? "location" : thread.type === "broadcast" ? "all_locations" : "individual",
      toBrandId: thread.type === "location" ? thread.brandId : null,
      toPersonId:   thread.type === "dm" ? thread.personId   : null,
      toPersonName: thread.type === "dm" ? thread.personName : null,
      subject: thread.name, body: text,
      readBy:  [myId],
      createdAt: new Date().toISOString(),
    };
    onSend(msg);
    setBody("");
  };

  // Group messages by date
  const grouped = [];
  let lastDate = null;
  threadMsgs.forEach(m => {
    const d = new Date(m.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    if (d !== lastDate) { grouped.push({ type: "date", label: d }); lastDate = d; }
    grouped.push({ type: "msg", msg: m });
  });

  return (
    <div className="flex flex-col h-full">
      {/* Thread messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {threadMsgs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-600">
            <MessageSquare size={32} className="mb-3 text-slate-700"/>
            <div className="text-sm font-semibold">No messages yet</div>
            <div className="text-xs mt-1">Send the first message below</div>
          </div>
        )}
        {grouped.map((item, idx) => {
          if (item.type === "date") {
            return (
              <div key={`date-${idx}`} className="flex items-center justify-center my-3">
                <span className="bg-slate-800 border border-slate-700 text-slate-600 text-xs px-3 py-1 rounded-full">{item.label}</span>
              </div>
            );
          }
          const m   = item.msg;
          const isMe = m.fromId === myId || m.fromId === myOpsId;
          const av  = avatarFor(m.fromName);
          return (
            <div key={m.id} className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
              {/* Avatar — only show for others */}
              {!isMe && (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mb-0.5"
                  style={{ background: av.bg + "30", color: av.bg }}>
                  {av.initials}
                </div>
              )}
              <div className={`max-w-[72%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                {/* Sender name for group threads (not DMs) */}
                {!isMe && thread.type !== "dm" && (
                  <div className="text-xs font-semibold mb-0.5 px-1" style={{ color: av.bg }}>{m.fromName}</div>
                )}
                {/* Bubble */}
                <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                  isMe
                    ? "bg-indigo-600 text-white rounded-br-md"
                    : "bg-slate-800 text-slate-100 border border-slate-700 rounded-bl-md"
                }`}>
                  {m.body}
                </div>
                {/* Timestamp + read receipt */}
                <div className={`flex items-center gap-1 mt-0.5 px-1 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                  <span className="text-xs text-slate-600">{fmtChatFull(m.createdAt)}</span>
                  {isMe && (
                    <span className="text-xs text-slate-600">
                      {(m.readBy?.length || 0) > 1 ? "✓✓" : "✓"}
                    </span>
                  )}
                </div>
              </div>
              {/* Spacer for my messages */}
              {isMe && <div className="w-7 flex-shrink-0"/>}
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 px-3 py-3 border-t border-slate-800/60/80 bg-slate-900">
        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none resize-none max-h-32 transition-colors"
            style={{ lineHeight: "1.5" }}
          />
          <button
            onClick={handleSend}
            disabled={!body.trim()}
            className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all active:scale-95 flex-shrink-0"
          >
            <Send size={16} className="text-white ml-0.5"/>
          </button>
        </div>
        <div className="text-xs text-slate-700 mt-1 px-1">Enter to send · Shift+Enter for new line</div>
      </div>
    </div>
  );
}

// ── Main InboxView ─────────────────────────────────────────────────────────────
function InboxView({ currentUser, brands, opsTeam, users, messages, onSend, onMarkRead }) {
  const [activeThread, setActiveThread] = useState(null);
  const [newChat, setNewChat]           = useState(false);
  const [search, setSearch]             = useState("");
  const [mobileShowThread, setMobileShowThread] = useState(false);

  const myId    = currentUser.id;
  const myOpsId = currentUser.opsTeamMemberId || currentUser.id;
  const myBrandIds = currentUser.brandIds || [];

  // Determine if a message is visible to me (either sent or received)
  const isVisible = (msg) => {
    if (msg.fromId === myId || msg.fromId === myOpsId) return true;
    if (msg.toScope === "all_locations") return true;
    if (msg.toScope === "location" && myBrandIds.includes(msg.toBrandId)) return true;
    if (msg.toScope === "individual" && (msg.toPersonId === myId || msg.toPersonId === myOpsId)) return true;
    return false;
  };

  const myMessages = messages.filter(isVisible);

  // Group messages into threads (conversations)
  const threadMap = {};
  myMessages.forEach(m => {
    const key = threadKey(m, myId, myOpsId);
    if (!threadMap[key]) {
      // Build thread meta
      let name, sub, type, brandId, personId, personName, color;
      if (m.toScope === "all_locations") {
        name = "All Locations"; sub = "Group broadcast"; type = "broadcast"; color = "#6366f1";
      } else if (m.toScope === "location") {
        const b = brands.find(x => x.id === m.toBrandId);
        name = b?.name || "Location"; sub = "Location channel"; type = "location"; brandId = m.toBrandId; color = b?.color || "#6366f1";
      } else {
        // DM — the "other" person
        const isFromMe = m.fromId === myId || m.fromId === myOpsId;
        name = isFromMe ? (m.toPersonName || "Unknown") : m.fromName;
        const otherId = isFromMe ? m.toPersonId : m.fromId;
        const otherPerson = [...users, ...opsTeam.map(o => ({ ...o, id: o.id, name: `${o.firstName} ${o.lastName}`.trim() }))].find(p => p.id === otherId);
        sub = otherPerson?.role || otherPerson?.employeeRole || "";
        type = "dm"; personId = otherId; personName = name;
      }
      threadMap[key] = { key, name, sub, type, brandId, personId, personName, color, messages: [] };
    }
    threadMap[key].messages.push(m);
  });

  // Sort threads by latest message
  const threads = Object.values(threadMap).sort((a, b) => {
    const aLast = a.messages[a.messages.length - 1]?.createdAt || "";
    const bLast = b.messages[b.messages.length - 1]?.createdAt || "";
    return new Date(bLast) - new Date(aLast);
  });

  const filtered = threads.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  const totalUnread = threads.reduce((sum, t) => {
    return sum + t.messages.filter(m => {
      const isForMe = m.fromId !== myId && m.fromId !== myOpsId;
      return isForMe && !m.readBy?.includes(myId);
    }).length;
  }, 0);

  const handleStartChat = (option) => {
    setNewChat(false);
    let key, name, sub, type, brandId, personId, personName, color;
    if (option.type === "location") {
      const bId = option.id.replace("loc:", "");
      const b = brands.find(x => x.id === bId);
      key = `loc:${bId}`; name = b?.name || "Location"; sub = "Location channel";
      type = "location"; brandId = bId; color = b?.color;
    } else if (option.type === "broadcast") {
      key = "broadcast:all"; name = "All Locations"; sub = "Group broadcast"; type = "broadcast"; color = "#6366f1";
    } else {
      const ids = [myId, option.id].sort();
      key = `dm:${ids[0]}:${ids[1]}`; name = option.name; sub = option.sub;
      type = "dm"; personId = option.id; personName = option.name;
    }
    setActiveThread({ key, name, sub, type, brandId, personId, personName, color, messages: threadMap[key]?.messages || [] });
    setMobileShowThread(true);
  };

  const handleThreadClick = (thread) => {
    setActiveThread(thread);
    setMobileShowThread(true);
  };

  const getThreadUnread = (thread) =>
    thread.messages.filter(m => m.fromId !== myId && m.fromId !== myOpsId && !m.readBy?.includes(myId)).length;

  const getLastMsg = (thread) => thread.messages[thread.messages.length - 1];

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-[500px] rounded-2xl overflow-hidden border border-slate-800/60/80 bg-slate-950">

      {/* ── Left panel: thread list ─────────────────────────────────────────── */}
      <div className={`flex flex-col border-r border-slate-800/60/80 bg-slate-900 flex-shrink-0
        ${mobileShowThread ? "hidden" : "flex"} w-full lg:flex lg:w-80 xl:w-96`}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800/60/80">
          <div>
            <div className="text-sm font-bold text-white">Messages</div>
            {totalUnread > 0 && <div className="text-xs text-indigo-400">{totalUnread} unread</div>}
          </div>
          <button onClick={() => setNewChat(true)}
            className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center transition-all shadow-md"
            title="New chat">
            <Plus size={18} className="text-white"/>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2.5 border-b border-slate-800/60/50">
          <div className="relative">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full bg-slate-950 border border-slate-700/50 rounded-xl pl-3 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none transition-colors"/>
          </div>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 px-4">
              <MessageSquare size={28} className="mb-2 text-slate-700"/>
              <div className="text-sm font-semibold text-center">{search ? "No matches" : "No conversations yet"}</div>
              <div className="text-xs mt-1 text-center text-slate-700">Tap + to start a new chat</div>
            </div>
          )}
          {filtered.map(thread => {
            const last    = getLastMsg(thread);
            const unread  = getThreadUnread(thread);
            const isActive = activeThread?.key === thread.key;
            const av = avatarFor(thread.name, thread.color || "");
            const icon = thread.type === "location" ? "📍" : thread.type === "broadcast" ? "📢" : null;
            return (
              <button key={thread.key} onClick={() => handleThreadClick(thread)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-800/60 transition-all text-left ${isActive ? "bg-indigo-600/15" : "hover:bg-slate-800/40"}`}>
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ background: av.bg + "25", color: av.bg }}>
                    {icon || av.initials}
                  </div>
                  {unread > 0 && (
                    <div className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-indigo-500 border-2 border-slate-900 flex items-center justify-center">
                      <span className="text-white text-xs font-bold leading-none">{unread > 9 ? "9+" : unread}</span>
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <div className={`text-sm truncate ${unread > 0 ? "font-bold text-white" : "font-semibold text-slate-200"}`}>{thread.name}</div>
                    <div className="text-xs text-slate-600 flex-shrink-0">{last ? fmtChatTime(last.createdAt) : ""}</div>
                  </div>
                  <div className={`text-xs truncate mt-0.5 ${unread > 0 ? "text-slate-700 font-medium" : "text-slate-500"}`}>
                    {last
                      ? `${last.fromId === myId || last.fromId === myOpsId ? "You: " : ""}${last.body}`
                      : <span className="italic text-slate-600">No messages yet</span>
                    }
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right panel: active chat ─────────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col min-w-0 ${!mobileShowThread ? "hidden" : "flex"} lg:flex`}>
        {!activeThread ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-3">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
              <MessageSquare size={28} className="text-slate-600"/>
            </div>
            <div className="text-base font-semibold text-slate-500">Select a conversation</div>
            <div className="text-sm text-slate-600">or tap + to start a new chat</div>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/60/80 bg-slate-900 flex-shrink-0">
              {/* Back button on mobile */}
              <button onClick={() => setMobileShowThread(false)} className="lg:hidden p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors">
                <ChevronLeft size={20}/>
              </button>
              {/* Avatar */}
              {(() => {
                const av = avatarFor(activeThread.name, activeThread.color || "");
                const icon = activeThread.type === "location" ? "📍" : activeThread.type === "broadcast" ? "📢" : null;
                return (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ background: av.bg + "25", color: av.bg }}>
                    {icon || av.initials}
                  </div>
                );
              })()}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white">{activeThread.name}</div>
                <div className="text-xs text-slate-500">{activeThread.sub}</div>
              </div>
            </div>
            {/* Messages + input */}
            <ChatThread
              thread={activeThread}
              messages={messages}
              currentUser={currentUser}
              brands={brands}
              onSend={msg => { onSend(msg); }}
              onMarkRead={onMarkRead}
            />
          </>
        )}
      </div>

      {/* New chat modal */}
      {newChat && (
        <NewChatModal
          currentUser={currentUser} brands={brands} opsTeam={opsTeam} users={users}
          onStart={handleStartChat}
          onClose={() => setNewChat(false)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMUNICATION HUB — Chat + Help Desk in one panel
// ═══════════════════════════════════════════════════════════════════════════════
function CommunicationView({
  currentUser, brands, stores = [], opsTeam, users,
  messages, onSend, onMarkRead,
  tickets, onAddTicket, onUpdateTicket, onDeleteTicket,
  availability, onAddAvailability, onUpdateAvailability,
  schedules, shiftPresets, onAddSchedule, onDeleteSchedule, onPublishWeek,
  punchRecords, onUpdatePunchRecord, onAddPunchComment,
  onUpdateBrand,
  isEmployee,
}) {
  const [tab, setTab] = useState("helpdesk");

  const myId    = currentUser.id;
  const myOpsId = currentUser.opsTeamMemberId || currentUser.id;
  const myBrandIds = currentUser.brandIds || [];

  const inboxUnread = messages.filter(m => {
    if (m.fromId === myId || m.fromId === myOpsId) return false;
    if (m.toScope === "all_locations") return true;
    if (m.toScope === "location" && myBrandIds.includes(m.toBrandId)) return true;
    if (m.toScope === "individual" && (m.toPersonId === myId || m.toPersonId === myOpsId)) return true;
    return false;
  }).filter(m => !m.readBy?.includes(myId)).length;

  const hdBadge = isEmployee
    ? tickets.filter(t => t.createdById === myOpsId && ["Open","In Progress","Pending"].includes(t.status)).length
    : tickets.filter(t => brands.some(b => b.id === t.brandId) && t.status === "Open").length;

  const pendingAvail = isEmployee
    ? (availability||[]).filter(a => a.employeeId === myOpsId && a.status === "pending").length
    : (availability||[]).filter(a => brands.some(b => b.id === a.brandId) && a.status === "pending").length;

  const TABS = [
    { key: "helpdesk",     label: "Help Desk",    icon: LifeBuoy,      badge: hdBadge > 0 ? hdBadge : null },
    { key: "chat",         label: "Chat",          icon: MessageSquare, badge: inboxUnread > 0 ? inboxUnread : null },
    { key: "availability", label: "Availability",  icon: Calendar,      badge: pendingAvail > 0 ? pendingAvail : null },
    ...(!isEmployee ? [
      { key: "schedule", label: "Schedule", icon: CalendarDays, badge: null },
    ] : [
      { key: "emp-schedule", label: "My Schedule", icon: CalendarDays, badge: null },
      { key: "my-hours",     label: "My Hours",    icon: Clock,         badge: (() => {
        const records = (punchRecords||[]).filter(r => (r.employeeId===myOpsId||r.employeeId===myId));
        const count = records.filter(r => {
          const hasOT = (r.overtimeHours||0) > 0;
          if (!hasOT) return false;
          // Conclusion reached — nothing to do
          if (r.overtimeApproved || r.overtimeRejectedReason) return false;
          // No reason yet — employee needs to start
          if (!r.overtimeReason && (r.overtimeComments?.length||0) === 0) return true;
          // Last comment was from the manager → employee's turn
          const cs = r.overtimeComments || [];
          if (cs.length > 0 && cs[cs.length-1].authorRole === "manager") return true;
          return false;
        }).length;
        return count > 0 ? count.toString() : null;
      })() },
    ]),
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] min-h-[500px]">
      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-2xl p-1 mb-4 flex-wrap">
        {TABS.map(t => {
          const TIcon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                tab === t.key ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}>
              <TIcon size={13}/>
              {t.label}
              {t.badge && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold leading-none ${tab === t.key ? "bg-slate-900/20 text-white" : "bg-red-500 text-white"}`}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Panels */}
      <div className="flex-1 min-h-0 overflow-auto">
        {tab === "helpdesk" && (
          isEmployee
            ? <EmployeeHelpdeskView brands={brands} stores={stores} tickets={tickets} currentUser={currentUser} onAdd={onAddTicket} onUpdate={onUpdateTicket}/>
            : <HelpdeskManagerView  brands={brands} stores={stores} visibleStoreIds={(stores || []).filter(s => !s.archivedAt && (isHqOrAbove(currentUser?.role) || (currentUser?.storeIds || []).includes(s.id))).map(s => s.id)} tickets={tickets} opsTeam={opsTeam} users={users} currentUser={currentUser} onUpdate={onUpdateTicket} onDelete={onDeleteTicket}/>
        )}
        {tab === "chat" && (
          <InboxView currentUser={currentUser} brands={brands} opsTeam={opsTeam} users={users} messages={messages} onSend={onSend} onMarkRead={onMarkRead}/>
        )}
        {tab === "availability" && (
          isEmployee
            ? <EmployeeAvailabilityView brands={brands} currentUser={currentUser} availability={availability||[]} onAdd={onAddAvailability} onUpdate={onUpdateAvailability}/>
            : <ManagerAvailabilityView  brands={brands} opsTeam={opsTeam} availability={availability||[]} currentUser={currentUser} onUpdate={onUpdateAvailability} onAdd={onAddAvailability} onDelete={id => onUpdateAvailability({id, status:"rejected"})}/>
        )}
        {tab === "schedule" && !isEmployee && (
          <ScheduleView
            brands={brands}
            stores={stores}
            visibleStoreIds={(stores || []).filter(s => !s.archivedAt && (isHqOrAbove(currentUser?.role) || (currentUser?.storeIds || []).includes(s.id))).map(s => s.id)}
            opsTeam={opsTeam}
            schedules={schedules||[]} availability={availability||[]} shiftPresets={shiftPresets||[]}
            punchRecords={punchRecords||[]} currentUser={currentUser}
            onAdd={onAddSchedule} onUpdate={onAddSchedule} onDelete={onDeleteSchedule}
            onPublish={onPublishWeek} onUpdateBrand={onUpdateBrand}
          />
        )}
        {tab === "emp-schedule" && isEmployee && (
          <EmployeeScheduleView currentUser={currentUser} brands={brands} opsTeam={opsTeam} schedules={schedules||[]}/>
        )}
        {tab === "my-hours" && isEmployee && (
          <EmployeeHoursView currentUser={currentUser} brands={brands} schedules={schedules||[]} punchRecords={punchRecords||[]} onUpdate={onUpdatePunchRecord} onAddComment={onAddPunchComment}/>
        )}
      </div>
    </div>
  );
}


// ─── SCHEDULING ───────────────────────────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULING — Custom Presets + Draft/Publish + Employee View
// ═══════════════════════════════════════════════════════════════════════════════

const PRESET_COLORS = ["#f59e0b","#6366f1","#10b981","#8b5cf6","#ef4444","#ec4899","#14b8a6","#f97316","#64748b"];

// ── Shift Preset Manager (lives inside Ops Settings) ──────────────────────────
function ShiftPresetManager({ brands, shiftPresets, onAdd, onUpdate, onDelete, currentUser }) {
  const vb = brands.filter(b => isHqOrAbove(currentUser.role) || currentUser.brandIds.includes(b.id));
  const [brandId, setBrandId] = useState(vb[0]?.id || "");
  const [editing, setEditing] = useState(null); // null | "new" | preset object
  const [form, setFormState] = useState({ name:"", startTime:"08:00", endTime:"16:00", color: PRESET_COLORS[0] });
  const set = (k,v) => setFormState(f=>({...f,[k]:v}));

  const brandPresets = shiftPresets.filter(p => p.brandId === brandId).sort((a,b)=>a.sortOrder-b.sortOrder);

  const openNew = () => {
    setEditing("new");
    setFormState({ name:"", startTime:"08:00", endTime:"16:00", color: PRESET_COLORS[brandPresets.length % PRESET_COLORS.length] });
  };
  const openEdit = (p) => {
    setEditing(p);
    setFormState({ name:p.name, startTime:p.startTime, endTime:p.endTime, color:p.color });
  };
  const handleSave = () => {
    if (!form.name.trim()) return;
    const payload = { ...form, brandId, sortOrder: editing === "new" ? brandPresets.length : editing.sortOrder,
      id: editing === "new" ? `sp-${Date.now()}` : editing.id };
    editing === "new" ? onAdd(payload) : onUpdate(payload);
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-sm font-bold text-white">Shift Presets</div>
          <div className="text-xs text-slate-500 mt-0.5">Custom shift types per location — used in the schedule builder</div>
        </div>
        <div className="flex items-center gap-2">
          {vb.length > 1 && <LocationDropdown brands={vb} value={brandId} onChange={v=>{setBrandId(v);setEditing(null);}} className="w-44"/>}
          <button onClick={openNew} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors">
            <Plus size={12}/> New Preset
          </button>
        </div>
      </div>

      {/* Preset list */}
      {brandPresets.length === 0 && editing !== "new" && (
        <div className="text-xs text-slate-500 py-4 text-center">No presets yet — click New Preset to create one</div>
      )}
      <div className="space-y-2">
        {brandPresets.map(p => (
          <div key={p.id} className="flex items-center gap-3 bg-slate-800/40 rounded-xl px-4 py-3 border border-slate-800/60">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:p.color}}/>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white">{p.name}</div>
              <div className="text-xs text-slate-600">{p.startTime} – {p.endTime}</div>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg bg-slate-700 text-slate-400 hover:text-white transition-colors"><Edit size={12}/></button>
              <button onClick={() => onDelete(p.id)} className="p-1.5 rounded-lg bg-slate-700 text-slate-600 hover:text-red-400 transition-colors"><Trash2 size={12}/></button>
            </div>
          </div>
        ))}
      </div>

      {/* Inline edit / new form */}
      {editing && (
        <div className="bg-slate-950 border border-slate-700 rounded-2xl p-4 space-y-3">
          <div className="text-xs font-bold text-slate-700">{editing === "new" ? "New Preset" : `Edit — ${editing.name}`}</div>
          <div><label className={labelCls}>Preset Name *</label>
            <input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. Early Morning, Split Shift…" className={inputCls} autoFocus/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <AvailTimeField label="Start time" value={form.startTime} onChange={v=>set("startTime",v)}/>
            <AvailTimeField label="End time"   value={form.endTime}   onChange={v=>set("endTime",v)}/>
          </div>
          <div>
            <label className={labelCls}>Colour</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={()=>set("color",c)}
                  className={`w-7 h-7 rounded-lg transition-all ${form.color===c?"ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110":""}`}
                  style={{background:c}}/>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={()=>setEditing(null)} className="flex-1 py-2 rounded-xl bg-slate-700 text-slate-700 text-xs font-semibold hover:bg-slate-600">Cancel</button>
            <button onClick={handleSave} disabled={!form.name.trim()} className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 disabled:opacity-40">Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shift Form Modal (uses custom presets) ────────────────────────────────────
function ShiftFormModal({ date, slot, brandId, storeId, memberId, memberName, filterRole, filterDept, opsTeam, availability, shiftPresets, schedules = [], currentUser, onSave, onDelete, onClose }) {
  const isEdit = !!slot;
  const brandPresets = shiftPresets.filter(p => p.brandId === brandId);

  const [employeeId, setEmployeeId] = useState(slot?.employeeId || memberId || "");
  const [shift,      setShift]      = useState(slot?.shift || (brandPresets[0]?.name || "Custom"));
  const [startTime,  setStartTime]  = useState(slot?.startTime || brandPresets[0]?.startTime || "08:00");
  const [endTime,    setEndTime]    = useState(slot?.endTime   || brandPresets[0]?.endTime   || "16:00");
  const [notes,      setNotes]      = useState(slot?.notes || "");
  const [copyDays,   setCopyDays]   = useState(new Set());  // YYYY-MM-DD strings of additional days to clone to

  // Members shown for assignment: scoped to the current store (multi-store
  // staff included via store_ids array contains storeId), with brand fallback.
  const brandMembers = opsTeam.filter(m => {
    const ids = m.storeIds || [];
    const inScope = ids.length > 0 ? (storeId && ids.includes(storeId)) : m.brandId === brandId;
    if (!inScope) return false;
    if (filterDept && filterDept !== "all" && m.department !== filterDept) return false;
    if (filterRole && filterRole !== "all" && m.role !== filterRole) return false;
    return true;
  });

  const handlePresetClick = (preset) => {
    setShift(preset.name);
    setStartTime(preset.startTime);
    setEndTime(preset.endTime);
  };

  // Availability for selected employee
  const memberAvail = availability.filter(a => {
    if (a.employeeId !== employeeId || a.status === "rejected") return false;
    const dayName = DAYS_OF_WEEK[new Date(date+"T00:00:00").getDay()===0?6:new Date(date+"T00:00:00").getDay()-1];
    if (a.type === "one_off") return a.date === date;
    if (a.type === "weekly") return (a.amendedDayOfWeek||a.dayOfWeek) === dayName;
    if (a.type === "recurring") return a.startDate <= date && a.endDate >= date;
    return false;
  });
  const isAvailable   = memberAvail.some(a => a.available);
  const isUnavailable = memberAvail.some(a => !a.available);
  const availWindow   = memberAvail.find(a => a.available);

  // ── Conflict detection: existing shifts for this employee on any target day ──
  const hasShiftOnDate = (empId, dStr) =>
    schedules.some(s =>
      s.employeeId === empId && s.date === dStr &&
      s.brandId === brandId && s.status !== "cancelled" &&
      (!slot || s.id !== slot.id) // when editing, ignore the slot itself
    );
  const primaryConflict   = employeeId && hasShiftOnDate(employeeId, date);
  const copyDayConflicts  = employeeId
    ? [...copyDays].filter(d => d !== date && hasShiftOnDate(employeeId, d))
    : [];
  const anyConflict       = primaryConflict || copyDayConflicts.length > 0;
  const conflictMsg = primaryConflict
    ? `${memberName || "This employee"} already has a shift on ${new Date(date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"short"})}`
    : copyDayConflicts.length > 0
      ? `${memberName || "This employee"} already has a shift on ${copyDayConflicts.length === 1
          ? new Date(copyDayConflicts[0]+"T12:00:00").toLocaleDateString("en-GB",{weekday:"long",day:"numeric"})
          : copyDayConflicts.length + " of the selected days"}`
      : "";

  const handleSave = () => {
    if (!employeeId) return;
    if (anyConflict) return; // belt + braces — also disabled via Save button
    const member = opsTeam.find(m => m.id === employeeId);
    const ws = new Date(date+"T00:00:00");
    ws.setDate(ws.getDate() - (ws.getDay()===0?6:ws.getDay()-1));
    const wsStr = [ws.getFullYear(),String(ws.getMonth()+1).padStart(2,"0"),String(ws.getDate()).padStart(2,"0")].join("-");
    const baseName = member ? `${member.firstName} ${member.lastName}`.trim() : memberName||"";
    const baseSlot = {
      brandId, storeId: storeId || (slot?.storeId || null),
      employeeId, employeeName: baseName,
      shift, startTime, endTime,
      role: member?.role || filterRole || "",
      department: member?.department || filterDept || "",
      notes, status: slot?.status || "scheduled",
      published: slot?.published ?? false,
      weekStart: wsStr,
      createdBy: currentUser.name,
    };
    // Save primary
    onSave({ ...baseSlot, id: slot?.id || `sch-${Date.now()}`, date });
    // Save copies for additional days
    [...copyDays].forEach((d, idx) => {
      if (d === date) return;
      onSave({
        ...baseSlot,
        id: `sch-${Date.now()}-${idx}-${Math.random().toString(36).slice(2,6)}`,
        date: d,
        published: false,
      });
    });
  };

  const selectedMember = opsTeam.find(m => m.id === employeeId);
  const activePreset = brandPresets.find(p => p.name === shift);
  const dateDisplay = new Date(date+"T00:00:00").toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});

  return (
    <Modal title={isEdit ? "Edit Shift" : "Add Shift"} onClose={onClose} maxW="max-w-sm"
      footer={<>
        {isEdit && onDelete && (
          <button onClick={() => { onDelete(slot.id); onClose(); }}
            className="p-2.5 rounded-xl bg-red-950/20 border border-red-500/30 text-red-400 hover:bg-red-950/20/60 transition-colors" title="Delete shift">
            <Trash2 size={16}/>
          </button>
        )}
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">Cancel</button>
        <button onClick={handleSave} disabled={!employeeId || anyConflict} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-40">
          {isEdit ? "Save changes" : "Add Shift"}
        </button>
      </>}>
      <div className="space-y-4">
        {/* Context */}
        <div className="bg-slate-950 rounded-xl px-4 py-3 space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Calendar size={13} className="text-slate-600"/>{dateDisplay}
          </div>
          {selectedMember && (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                style={{background:(selectedMember.color||"#6366f1")+"30",color:selectedMember.color||"#6366f1"}}>
                {selectedMember.firstName[0]}{selectedMember.lastName?.[0]||""}
              </div>
              <span className="text-sm font-semibold text-slate-200">
                {selectedMember.nickname||selectedMember.firstName} {!selectedMember.nickname&&selectedMember.lastName}
              </span>
              <span className="text-xs text-slate-500">{selectedMember.role}{selectedMember.department?` · ${selectedMember.department}`:""}</span>
            </div>
          )}
        </div>

        {/* Employee picker (only when no member context) */}
        {!memberId && (
          <div><label className={labelCls}>Employee *</label>
            <SelectDropdown value={employeeId} onChange={setEmployeeId} className="w-full">
              <option value="">— Select employee —</option>
              {brandMembers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName}{m.nickname?` (${m.nickname})`:""} · {m.role}
                </option>
              ))}
            </SelectDropdown>
          </div>
        )}

        {/* Availability */}
        {employeeId && (
          <div className={`rounded-xl px-3 py-2.5 text-xs font-semibold flex items-center gap-2 ${
            isUnavailable ? "bg-red-950/20 border border-red-500/30 text-red-300" :
            isAvailable   ? "bg-emerald-950/20 border border-emerald-500/30 text-emerald-300" :
            "bg-slate-800/40 border border-slate-800/60 text-slate-500"
          }`}>
            <span className="text-base">{isUnavailable?"⚠️":isAvailable?"✅":"ℹ️"}</span>
            <span>{isUnavailable?"Marked unavailable this day":isAvailable?`Available${availWindow?` · ${availWindow.startTime}–${availWindow.endTime}`:""}` : "No availability submitted"}</span>
          </div>
        )}

        {/* Conflict warning: employee already has a shift on this day or any copy day */}
        {anyConflict && (
          <div className="flex items-start gap-2 bg-red-950/20 border border-red-500/30 rounded-xl px-3 py-2.5 text-xs">
            <span className="text-base flex-shrink-0">🚫</span>
            <div className="flex-1">
              <div className="text-red-400 font-bold">Conflict — can't save</div>
              <div className="text-red-300 mt-0.5">{conflictMsg}.</div>
              {copyDayConflicts.length > 0 && copyDayConflicts.length > 1 && (
                <div className="text-red-300/80 mt-1">
                  Conflicting days: {copyDayConflicts.map(d => new Date(d+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric"})).join(", ")}
                </div>
              )}
              <div className="text-slate-600 mt-1">Edit the existing shift instead, or remove the conflicting day from "Also create on…" below.</div>
            </div>
          </div>
        )}

        {/* Shift presets */}
        <div>
          <label className={labelCls}>Shift{brandPresets.length === 0 ? " — add presets in Ops Setup" : ""}</label>
          {brandPresets.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {brandPresets.map(p => (
                <button key={p.id} onClick={() => handlePresetClick(p)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${shift===p.name?"text-white border-transparent":"bg-slate-800 border-slate-700 text-slate-600 hover:bg-slate-700"}`}
                  style={shift===p.name?{background:p.color}:{}}>
                  {p.name}
                  <span className="ml-1 opacity-60">{p.startTime}–{p.endTime}</span>
                </button>
              ))}
              <button onClick={()=>setShift("Custom")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${shift==="Custom"?"bg-slate-600 border-slate-500 text-white":"bg-slate-800 border-slate-700 text-slate-600 hover:bg-slate-700"}`}>
                Custom
              </button>
            </div>
          ) : (
            <input value={shift} onChange={e=>setShift(e.target.value)} placeholder="e.g. Morning" className={inputCls}/>
          )}
        </div>

        {/* Times */}
        <div className="grid grid-cols-2 gap-3">
          <AvailTimeField label="Start" value={startTime} onChange={setStartTime}/>
          <AvailTimeField label="End"   value={endTime}   onChange={setEndTime}/>
        </div>

        {/* Notes */}
        <div><label className={labelCls}>Notes (optional)</label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}
            placeholder="Any shift notes…" className={`${inputCls} resize-none`}/>
        </div>

        {/* Copy to other days (only on new shifts) */}
        {!isEdit && (() => {
          // Build the 7 days of the same week
          const baseDate = new Date(date+"T00:00:00");
          const dow = baseDate.getDay()===0?6:baseDate.getDay()-1;
          const monday = new Date(baseDate); monday.setDate(baseDate.getDate() - dow);
          const days = Array.from({length:7},(_,i)=>{ const d=new Date(monday); d.setDate(monday.getDate()+i); return d; });
          const toStr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
          return (
            <div>
              <label className={labelCls}>Also create this shift on…</label>
              <div className="flex flex-wrap gap-1.5">
                {days.map((d, idx) => {
                  const dStr = toStr(d);
                  const isBase = dStr === date;
                  const active = copyDays.has(dStr);
                  return (
                    <button key={dStr} type="button"
                      onClick={()=>{
                        if (isBase) return;
                        setCopyDays(prev => { const n = new Set(prev); if (n.has(dStr)) n.delete(dStr); else n.add(dStr); return n; });
                      }}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        isBase ? "bg-indigo-600 text-white cursor-default" :
                        active ? "bg-indigo-600/20 border border-indigo-400 text-indigo-300" :
                        "bg-slate-800 border border-slate-700 text-slate-600 hover:bg-slate-700"
                      }`}>
                      {DAYS_OF_WEEK[idx].slice(0,3)} {d.getDate()}{isBase && " ★"}
                    </button>
                  );
                })}
              </div>
              {copyDays.size > 0 && (
                <div className="text-xs text-indigo-400 mt-2">
                  Will create {copyDays.size + 1} shifts total
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </Modal>
  );
}

// ── Manager Schedule View ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULE VIEW — production-grade with totals, costs, copy-week, conflicts
// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULE VIEW — totals, costs, copy-week, conflicts, coverage, drag-resize,
// auto-fill, forecasted SPLH, lock, multi-select bulk, mobile day view
// ═══════════════════════════════════════════════════════════════════════════════
function ScheduleView({ brands, stores, visibleStoreIds, opsTeam, schedules, availability, shiftPresets, currentUser, punchRecords = [], onAdd, onUpdate, onDelete, onPublish, onUpdateBrand, onUpdateStore }) {
  const { user } = useAuth();

  // Store-first scoping (the new pattern). We pick a SINGLE store for the
  // schedule view — scheduling is inherently per-site, you don't run one
  // rota across multiple stores. Owner/HQ can also use the ownership filter
  // to narrow which stores appear in the picker.
  const allVisibleStores = useMemo(
    () => (stores || []).filter(s => visibleStoreIds?.includes(s.id) && !s.archivedAt),
    [stores, visibleStoreIds]
  );
  const [ownership, setOwnership] = useState(isHqOrAbove(user.role) ? "owned" : "all");
  const visibleStores = useMemo(
    () => applyOwnershipFilter(allVisibleStores, ownership, user.role),
    [allVisibleStores, ownership, user.role]
  );
  const sortedStores = useMemo(
    () => [...visibleStores].sort((a, b) => (a.shortName || a.name || "").localeCompare(b.shortName || b.name || "")),
    [visibleStores]
  );

  // Selected store. Default to first alphabetically (per your earlier decision).
  // For legacy brandId-keyed code below, we derive brandId from the picked store.
  const [storeId, setStoreId] = useState("");
  useEffect(() => {
    if (!storeId && sortedStores[0]) setStoreId(sortedStores[0].id);
    if (storeId && !sortedStores.some(s => s.id === storeId)) setStoreId(sortedStores[0]?.id || "");
  }, [sortedStores, storeId]);

  // Derived brandId for downstream code that's still brand-keyed.
  // ScheduleView uses brandId everywhere — we keep that working by deriving
  // it from the selected store. The hundreds of lines below don't need to
  // change individually.
  const selectedStore = sortedStores.find(s => s.id === storeId) || null;
  const brandId = selectedStore?.brandId || "";

  // Legacy variable name kept so downstream JSX referencing `vb` still works.
  const vb = useMemo(
    () => brands.filter(b => visibleStores.some(s => s.brandId === b.id)),
    [brands, visibleStores]
  );

  const [weekOffset, setWeekOffset] = useState(0);
  const [filterDept, setFilterDept] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [filterShift,setFilterShift]= useState("all");
  const [shiftModal, setShiftModal] = useState(null);
  const [deleteId,   setDeleteId]   = useState(null);
  const [viewMode,   setViewMode]   = useState("week");  // week | list | coverage
  const [publishing, setPublishing] = useState(false);
  const [copying,    setCopying]    = useState(false);
  const [showCosts,  setShowCosts]  = useState(true);
  const [locked,     setLocked]     = useState(true);    // edits locked when published
  const [selected,   setSelected]   = useState(new Set()); // multi-select shift IDs
  const [autofillModal, setAutofillModal] = useState(null);
  const [salesModal,    setSalesModal]    = useState(false);
  const [bulkDeleting,  setBulkDeleting]  = useState(false);
  const [resizingShift, setResizingShift] = useState(null); // { id, startX, originalEndTime }
  const [mobileDay,     setMobileDay]     = useState(0);    // 0-6 for mobile day view
  const [isMobile,      setIsMobile]      = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Date helpers ───────────────────────────────────────────────────────────
  const today = new Date(); today.setHours(0,0,0,0);
  const toLocalDateStr = (d) => { const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),dd=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${dd}`; };
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - (today.getDay()===0?6:today.getDay()-1) + weekOffset*7);
  const weekStartStr = toLocalDateStr(weekStart);
  const weekDays = Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(weekStart.getDate()+i);return d;});
  const weekDayStrs = weekDays.map(d=>toLocalDateStr(d));

  // ── Membership / filters ───────────────────────────────────────────────────
  // Members are filtered by store membership now (multi-store-staff supported
  // via ops_team.store_ids text[]). Falls back to brandId match for any legacy
  // ops_team row that doesn't yet have storeIds populated.
  const brandMembers = opsTeam.filter(m => {
    const ids = m.storeIds || [];
    if (ids.length > 0) return ids.includes(storeId);
    return m.brandId === brandId;  // legacy fallback
  });
  const allDepts = [...new Set(brandMembers.map(m=>m.department).filter(Boolean))];
  const allRoles = [...new Set(brandMembers.map(m=>m.role).filter(Boolean))];
  // Presets are still brand-scoped (a brand's shift templates apply to all its
  // stores). If you want store-specific presets later, we'd add a per-store
  // override layer here.
  const brandPresets = shiftPresets.filter(p=>p.brandId===brandId);
  const allShiftNames = [...new Set(brandPresets.map(p=>p.name))];

  const filteredMembers = brandMembers.filter(m=>{
    if (filterDept!=="all" && m.department!==filterDept) return false;
    if (filterRole!=="all" && m.role!==filterRole) return false;
    return true;
  });

  // ── This week's schedules ──────────────────────────────────────────────────
  // Match by storeId when the row has one (new), else by brandId (legacy).
  // During the transition some schedules may still have brand_id only — they
  // still show, attached to their brand's first store implicitly.
  const matchesScope = (s) => {
    if (s.storeId) return s.storeId === storeId;
    return s.brandId === brandId;
  };
  const weekSchedules = schedules.filter(s=>
    matchesScope(s) && weekDayStrs.includes(s.date) &&
    (filterShift==="all" || s.shift===filterShift) &&
    (filterDept==="all" || s.department===filterDept) &&
    (filterRole==="all" || s.role===filterRole)
  );
  const allWeekSlots = schedules.filter(s=>matchesScope(s) && weekDayStrs.includes(s.date));
  const isWeekPublished = allWeekSlots.length > 0 && allWeekSlots.every(s=>s.published);
  const isDraft = allWeekSlots.length > 0 && !isWeekPublished;
  const editLocked = isWeekPublished && locked;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const calcShiftHours = (start, end) => {
    if (!start || !end) return 0;
    const s = new Date("2000-01-01T"+start+":00");
    const e = new Date("2000-01-01T"+end+":00");
    const hrs = (e - s) / 3600000;
    return hrs < 0 ? hrs + 24 : hrs;
  };
  const getSlotsFor = (memberId, dateStr) => weekSchedules.filter(s=>s.employeeId===memberId && s.date===dateStr && s.status!=="cancelled");
  const getAvailFor = (memberId, dateStr) => {
    const dayName = DAYS_OF_WEEK[new Date(dateStr+"T00:00:00").getDay()===0?6:new Date(dateStr+"T00:00:00").getDay()-1];
    return availability.filter(a=>{
      if (a.employeeId!==memberId||a.status==="rejected") return false;
      if (a.type==="one_off") return a.date===dateStr;
      if (a.type==="weekly") return (a.amendedDayOfWeek||a.dayOfWeek)===dayName;
      if (a.type==="recurring") return a.startDate<=dateStr&&a.endDate>=dateStr;
      return false;
    });
  };
  const getPresetColor = (shiftName) => brandPresets.find(p=>p.name===shiftName)?.color || "#6366f1";

  // ── Conflict detection ─────────────────────────────────────────────────────
  const getSlotConflict = (slot, member) => {
    if (!slot || !member) return null;
    const avails = getAvailFor(member.id, slot.date);
    if (avails.some(a=>!a.available)) return "unavailable";
    const availWin = avails.find(a=>a.available);
    if (availWin && availWin.startTime && availWin.endTime) {
      if (slot.startTime < availWin.startTime || slot.endTime > availWin.endTime) return "outside-window";
    }
    return null;
  };

  // ── Totals: per employee, per day, week ─────────────────────────────────────
  const employeeTotals = filteredMembers.map(member => {
    let hours = 0, cost = 0;
    weekDayStrs.forEach(d => {
      const slots = getSlotsFor(member.id, d);
      slots.forEach(s => {
        const h = calcShiftHours(s.startTime, s.endTime);
        hours += h;
        cost += h * effectiveHourlyRate(member);
      });
    });
    return { member, hours, cost };
  });

  const dailyTotals = weekDayStrs.map(d => {
    let hours = 0, cost = 0, headcount = 0;
    filteredMembers.forEach(m => {
      const slots = getSlotsFor(m.id, d);
      if (slots.length > 0) headcount++;
      slots.forEach(s => {
        const h = calcShiftHours(s.startTime, s.endTime);
        hours += h;
        cost += h * effectiveHourlyRate(m);
      });
    });
    let actualHours = 0, actualCost = 0;
    punchRecords.filter(p => {
      // Match by store first, fall back to brand for legacy punches
      const inScope = p.storeId ? p.storeId === storeId : p.brandId === brandId;
      return inScope && p.date === d && p.status !== "open";
    }).forEach(p => {
      actualHours += p.hoursWorked || 0;
      actualCost += p.grossPay || 0;
    });
    return { date: d, hours, cost, headcount, actualHours, actualCost };
  });

  const weekTotals = {
    hours: dailyTotals.reduce((a,d) => a + d.hours, 0),
    cost: dailyTotals.reduce((a,d) => a + d.cost, 0),
    actualHours: dailyTotals.reduce((a,d) => a + d.actualHours, 0),
    actualCost: dailyTotals.reduce((a,d) => a + d.actualCost, 0),
    totalShifts: allWeekSlots.filter(s => s.status !== "cancelled").length,
  };

  // ── Sales forecast — now stored on selectedStore.kpiTargets.salesForecasts[date] ───
  // Moved from brand-level since per-day targets are now per-store.
  const brand = brands.find(b => b.id === brandId);
  const salesForecasts = selectedStore?.kpiTargets?.salesForecasts || {};
  const dailySales = weekDayStrs.map(d => parseFloat(salesForecasts[d]) || 0);
  const weekSalesForecast = dailySales.reduce((a,n) => a+n, 0);
  const splh = weekTotals.cost > 0 ? weekSalesForecast / weekTotals.cost : 0; // sales per £1 labour cost
  const splhRating = splh === 0 ? "" : splh >= 8 ? "green" : splh >= 5 ? "amber" : "red";

  const fmtHrs = (h) => h ? `${Math.floor(h)}h${h%1?` ${Math.round((h%1)*60)}m`:""}` : "0h";
  const fmtMoney = (n) => "£" + (n||0).toFixed(2);

  // ── Coverage matrix ────────────────────────────────────────────────────────
  const coverageMatrix = useMemo(() => {
    const hours = Array.from({length:24}, (_, i) => i);
    return weekDayStrs.map(dateStr => {
      const counts = hours.map(h => {
        let count = 0;
        filteredMembers.forEach(m => {
          const slots = getSlotsFor(m.id, dateStr);
          slots.forEach(s => {
            const startH = parseInt(s.startTime.slice(0,2));
            const endH = parseInt(s.endTime.slice(0,2));
            if (endH > startH) { if (h >= startH && h < endH) count++; }
            else { if (h >= startH || h < endH) count++; }
          });
        });
        return count;
      });
      return { date: dateStr, counts };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDayStrs.join(","), filteredMembers.map(m=>m.id).join(","), JSON.stringify(weekSchedules.map(s=>s.id+s.startTime+s.endTime))]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    setPublishing(true);
    // New shape: publish a single store's week, not the whole brand. Schedules
    // outside this store aren't touched even if they share the brand.
    await onPublish({ storeId, weekStart: weekStartStr, published: !isWeekPublished });
    setPublishing(false);
    if (!isWeekPublished) setLocked(true);
  };

  const handleCopyWeek = async () => {
    if (allWeekSlots.length === 0) return;
    setCopying(true);
    try {
      for (const s of allWeekSlots.filter(s=>s.status!=="cancelled")) {
        const srcDate = new Date(s.date+"T00:00:00");
        const tgtDate = new Date(srcDate); tgtDate.setDate(srcDate.getDate()+7);
        const tgtStr = toLocalDateStr(tgtDate);
        await onAdd({
          ...s,
          id: `sch-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
          date: tgtStr,
          published: false,
          status: "scheduled",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      setWeekOffset(w => w + 1);
    } finally { setCopying(false); }
  };

  // ── Drag-to-resize ─────────────────────────────────────────────────────────
  const handleResizeStart = (e, slot) => {
    if (editLocked) return;
    e.stopPropagation(); e.preventDefault();
    setResizingShift({ id: slot.id, slot, startX: e.clientX || e.touches?.[0]?.clientX || 0, originalEndTime: slot.endTime });
  };
  useEffect(() => {
    if (!resizingShift) return;
    const onMove = (e) => {
      const x = e.clientX || e.touches?.[0]?.clientX || 0;
      const deltaX = x - resizingShift.startX;
      const minutesPerPx = 4; // rough: every 4px = 15 mins
      const deltaMins = Math.round(deltaX / minutesPerPx / 15) * 15;
      if (deltaMins === 0) return;
      const [hh, mm] = resizingShift.originalEndTime.split(":").map(Number);
      const total = hh*60 + mm + deltaMins;
      const clamped = Math.max(15, Math.min(24*60-1, total));
      const newH = String(Math.floor(clamped/60)).padStart(2,"0");
      const newM = String(clamped%60).padStart(2,"0");
      const newEnd = `${newH}:${newM}`;
      if (newEnd !== resizingShift.slot.endTime) {
        // Live update visual (will be saved on mouseup)
        setResizingShift(r => r ? { ...r, currentEnd: newEnd } : r);
      }
    };
    const onUp = async () => {
      if (resizingShift?.currentEnd && resizingShift.currentEnd !== resizingShift.originalEndTime) {
        await onAdd({ ...resizingShift.slot, endTime: resizingShift.currentEnd, updatedAt: new Date().toISOString() });
      }
      setResizingShift(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [resizingShift, onAdd]);

  // ── Multi-select ───────────────────────────────────────────────────────────
  const toggleSelect = (id, e) => {
    e?.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      for (const id of selected) await onDelete(id);
      setSelected(new Set());
    } finally { setBulkDeleting(false); }
  };

  const pendingAvail = availability.filter(a=>vb.some(b=>b.id===a.brandId)&&a.status==="pending").length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* ── Top stats / totals strip ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-3">
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-widest">Scheduled hours</div>
          <div className="text-xl font-black text-white mt-1">{fmtHrs(weekTotals.hours)}</div>
          <div className="text-xs text-slate-500 mt-0.5">{weekTotals.totalShifts} shifts</div>
        </div>
        <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-3">
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-widest">Scheduled wages</div>
          <div className="text-xl font-black text-white mt-1">{fmtMoney(weekTotals.cost)}</div>
          <div className="text-xs text-slate-500 mt-0.5">Forecast</div>
        </div>
        <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-3">
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-widest">Actual hours</div>
          <div className="text-xl font-black text-white mt-1">{fmtHrs(weekTotals.actualHours)}</div>
          <div className={`text-xs mt-0.5 font-semibold ${
            weekTotals.actualHours > weekTotals.hours * 1.05 ? "text-red-400" :
            weekTotals.actualHours < weekTotals.hours * 0.95 ? "text-amber-400" : "text-emerald-400"
          }`}>
            {weekTotals.hours ? `${((weekTotals.actualHours/weekTotals.hours - 1)*100).toFixed(0)}%` : "—"} vs plan
          </div>
        </div>
        <button onClick={()=>setSalesModal(true)} className="bg-slate-900 border border-slate-800/60 rounded-2xl p-3 text-left hover:border-indigo-500/30 transition-colors">
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-widest">SPLH forecast</div>
          {weekSalesForecast > 0 ? (
            <>
              <div className={`text-xl font-black mt-1 ${
                splhRating === "green" ? "text-emerald-400" : splhRating === "amber" ? "text-amber-400" : "text-red-400"
              }`}>£{splh.toFixed(1)}</div>
              <div className="text-xs text-slate-500 mt-0.5">sales / £1 labour</div>
            </>
          ) : (
            <>
              <div className="text-base font-bold text-slate-600 mt-1">Set forecast →</div>
              <div className="text-xs text-slate-500 mt-0.5">tap to enter daily sales</div>
            </>
          )}
        </button>
      </div>

      {/* ── Header / actions ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {allWeekSlots.length > 0 && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isWeekPublished ? "bg-emerald-500/25 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
              {isWeekPublished ? "✓ Published" : "Draft"}
            </span>
          )}
          {editLocked && (
            <button onClick={()=>setLocked(false)}
              className="flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-600 hover:text-amber-400 transition-colors"
              title="Schedule is locked — click to allow edits">
              🔒 Locked
            </button>
          )}
          {isWeekPublished && !locked && (
            <button onClick={()=>setLocked(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors">
              🔓 Editing — lock again
            </button>
          )}
          {pendingAvail > 0 && <span className="text-xs text-amber-400">· {pendingAvail} availability pending</span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={()=>setShowCosts(s=>!s)} className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5">
            {showCosts ? <Eye size={13}/> : <EyeOff size={13}/>} Costs
          </button>
          <button onClick={()=>setAutofillModal({})} disabled={editLocked}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 hover:bg-indigo-600/20 text-indigo-300 text-xs font-semibold transition-colors disabled:opacity-40" title="Auto-fill shifts from availability">
            <Zap size={13}/> Auto-fill
          </button>
          {!isMobile && (
            <div className="flex bg-slate-900 border border-slate-700 rounded-xl p-0.5 gap-0.5">
              <button onClick={()=>setViewMode("week")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode==="week"?"bg-indigo-600 text-white":"text-slate-400 hover:text-white"}`}>Week</button>
              <button onClick={()=>setViewMode("list")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode==="list"?"bg-indigo-600 text-white":"text-slate-400 hover:text-white"}`}>List</button>
              <button onClick={()=>setViewMode("coverage")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode==="coverage"?"bg-indigo-600 text-white":"text-slate-400 hover:text-white"}`}>Coverage</button>
            </div>
          )}
          {allWeekSlots.length > 0 && !editLocked && (
            <button onClick={handleCopyWeek} disabled={copying}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-700 text-xs font-semibold transition-colors disabled:opacity-50">
              {copying ? "…" : <><Plus size={13}/> Copy → next</>}
            </button>
          )}
          {allWeekSlots.length > 0 && (
            <button onClick={handlePublish} disabled={publishing}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                isWeekPublished ? "bg-slate-700 hover:bg-slate-600 text-slate-700" : "bg-emerald-600 hover:bg-emerald-500 text-white"
              } disabled:opacity-50`}>
              {publishing ? "…" : isWeekPublished ? "Unpublish" : "Publish Week"}
            </button>
          )}
        </div>
      </div>

      {/* ── Bulk action bar ─────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-indigo-950/30 border border-indigo-500/30 rounded-xl px-4 py-2.5">
          <span className="text-sm font-bold text-white">{selected.size} shift{selected.size!==1?"s":""} selected</span>
          <div className="flex-1"/>
          <button onClick={clearSelection} className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-700 text-xs font-semibold transition-colors">Clear</button>
          <button onClick={handleBulkDelete} disabled={bulkDeleting || editLocked}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors disabled:opacity-40">
            <Trash2 size={13}/> Delete selected
          </button>
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        {sortedStores.length > 1 && (
          <SelectDropdown value={storeId} onChange={setStoreId} className="w-56">
            {sortedStores.map(s => {
              const b = brands.find(br => br.id === s.brandId);
              const showBrand = new Set(sortedStores.map(x => x.brandId)).size > 1;
              return <option key={s.id} value={s.id}>{showBrand && b ? `${b.name} · ` : ""}{s.shortName || s.name}</option>;
            })}
          </SelectDropdown>
        )}
        {allDepts.length > 0 && <SelectDropdown value={filterDept} onChange={setFilterDept} className="w-36"><option value="all">All Depts</option>{allDepts.map(d=><option key={d}>{d}</option>)}</SelectDropdown>}
        {allRoles.length > 0 && <SelectDropdown value={filterRole} onChange={setFilterRole} className="w-36"><option value="all">All Roles</option>{allRoles.map(r=><option key={r}>{r}</option>)}</SelectDropdown>}
        {allShiftNames.length > 0 && <SelectDropdown value={filterShift} onChange={setFilterShift} className="w-36"><option value="all">All Shifts</option>{allShiftNames.map(n=><option key={n}>{n}</option>)}</SelectDropdown>}
      </div>

      {/* ── Draft banner ────────────────────────────────────────────────── */}
      {isDraft && (
        <div className="flex items-center gap-3 bg-amber-950/20 border border-amber-500/30 rounded-xl px-4 py-3">
          <span className="text-amber-400 text-sm">⚠ This week is in draft — employees cannot see it yet.</span>
          <button onClick={handlePublish} className="ml-auto px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors">Publish now</button>
        </div>
      )}

      {/* ── Week nav ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button onClick={()=>setWeekOffset(w=>w-1)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"><ChevronLeft size={16}/></button>
        <div className="flex items-center gap-3">
          <button onClick={()=>setWeekOffset(0)} className="text-sm font-semibold text-white hover:text-indigo-400 transition-colors">
            {weekDays[0].toLocaleDateString("en-GB",{day:"numeric",month:"short"})} – {weekDays[6].toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}
          </button>
          {weekOffset !== 0 && <button onClick={()=>setWeekOffset(0)} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold">Today →</button>}
        </div>
        <button onClick={()=>setWeekOffset(w=>w+1)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"><ChevronRight size={16}/></button>
      </div>

      {/* ── Mobile day-swipe view ─────────────────────────────────────────── */}
      {isMobile && (
        <div className="space-y-3">
          {/* Day pills */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {weekDays.map((day,idx)=>{
              const isToday = toLocalDateStr(day)===toLocalDateStr(today);
              const active = mobileDay === idx;
              return (
                <button key={idx} onClick={()=>setMobileDay(idx)}
                  className={`flex-shrink-0 px-3 py-2 rounded-xl text-center transition-all ${
                    active ? "bg-indigo-600 text-white" :
                    isToday ? "bg-indigo-950/30 border border-indigo-500/30 text-indigo-300" :
                    "bg-slate-900 text-slate-600"
                  }`}>
                  <div className="text-xs font-semibold">{DAYS_OF_WEEK[idx].slice(0,3)}</div>
                  <div className="text-base font-bold">{day.getDate()}</div>
                </button>
              );
            })}
          </div>
          {/* Day content */}
          {(() => {
            const dateStr = weekDayStrs[mobileDay];
            const dt = dailyTotals[mobileDay];
            const daySlots = weekSchedules.filter(s=>s.date===dateStr).sort((a,b)=>a.startTime.localeCompare(b.startTime));
            return (
              <div className="space-y-3">
                {/* Day totals */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-900 rounded-xl p-3 text-center">
                    <div className="text-xs text-slate-500">Hours</div>
                    <div className="text-base font-bold text-white">{fmtHrs(dt.hours)}</div>
                  </div>
                  {showCosts && (
                    <div className="bg-slate-900 rounded-xl p-3 text-center">
                      <div className="text-xs text-slate-500">Wages</div>
                      <div className="text-base font-bold text-emerald-400">{fmtMoney(dt.cost)}</div>
                    </div>
                  )}
                  <div className="bg-slate-900 rounded-xl p-3 text-center">
                    <div className="text-xs text-slate-500">On shift</div>
                    <div className="text-base font-bold text-white">{dt.headcount}</div>
                  </div>
                </div>

                {/* Add shift */}
                <button onClick={()=>!editLocked && setShiftModal({date:dateStr})} disabled={editLocked}
                  className="w-full py-2.5 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-sm font-semibold disabled:opacity-40 hover:bg-indigo-600/20 transition-colors flex items-center justify-center gap-2">
                  <Plus size={14}/> Add shift
                </button>

                {/* Shifts list */}
                {daySlots.length===0
                  ? <div className="text-center py-8 text-slate-500 text-sm italic">No shifts scheduled</div>
                  : daySlots.map(s=>{
                      const member = opsTeam.find(m=>m.id===s.employeeId);
                      const conflict = getSlotConflict(s, member);
                      const hrs = calcShiftHours(s.startTime, s.endTime);
                      return (
                        <div key={s.id} className={`bg-slate-900 rounded-xl p-3 border ${conflict ? "border-red-500/30" : "border-slate-800/60"}`}
                          onClick={()=>!editLocked && setShiftModal({date:dateStr,slot:s,memberId:s.employeeId,memberName:s.employeeName})}>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:getPresetColor(s.shift)}}/>
                            <div className="text-sm font-bold text-white truncate">{s.employeeName}</div>
                            {!s.published && <span className="text-xs text-amber-400 font-semibold ml-auto">Draft</span>}
                          </div>
                          <div className="text-xs text-slate-600">{s.shift} · {s.startTime}–{s.endTime} · {hrs.toFixed(1)}h</div>
                          {conflict && <div className="text-xs text-red-400 font-semibold mt-1">⚠ {conflict==="unavailable"?"Employee unavailable":"Outside availability"}</div>}
                          {showCosts && member?.hourlyRate > 0 && <div className="text-xs text-emerald-400 font-semibold mt-1">{fmtMoney(hrs * effectiveHourlyRate(member))}</div>}
                        </div>
                      );
                    })
                }
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Desktop week grid ─────────────────────────────────────────────── */}
      {!isMobile && viewMode==="week" && (
        <div className="overflow-x-auto">
          <div className="min-w-[920px]">
            <div className="grid gap-1 mb-2" style={{gridTemplateColumns:"180px repeat(7, 1fr) 110px"}}>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest px-2 py-2">Employee</div>
              {weekDays.map((day,idx)=>{
                const isToday = toLocalDateStr(day)===toLocalDateStr(today);
                const dt = dailyTotals[idx];
                return (
                  <div key={idx} className={`text-center rounded-xl py-2 ${isToday?"bg-indigo-600/20 border border-indigo-500/30":"bg-slate-900/40"}`}>
                    <div className={`text-xs font-semibold ${isToday?"text-indigo-300":"text-slate-600"}`}>{DAYS_OF_WEEK[idx].slice(0,3)}</div>
                    <div className={`text-sm font-bold ${isToday?"text-indigo-300":"text-slate-700"}`}>{day.getDate()}</div>
                    {dt.headcount > 0 && <div className="text-xs text-slate-500 mt-0.5">{dt.headcount} on shift</div>}
                  </div>
                );
              })}
              <div className="text-center rounded-xl py-2 bg-slate-900/40">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total</div>
              </div>
            </div>

            {filteredMembers.length===0 && <div className="text-center py-10 text-slate-500 text-sm">No team members match filters</div>}

            {filteredMembers.map((member, mIdx)=>{
              const empTotal = employeeTotals[mIdx];
              return (
                <div key={member.id} className="grid gap-1 mb-1.5" style={{gridTemplateColumns:"180px repeat(7, 1fr) 110px"}}>
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-900 rounded-xl">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{background:(member.color||"#6366f1")+"30",color:member.color||"#6366f1"}}>
                      {member.firstName[0]}{member.lastName?.[0]||""}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-white truncate">{member.nickname||member.firstName} {!member.nickname&&member.lastName}</div>
                      <div className="text-xs text-slate-500 truncate">{member.department||member.role}</div>
                    </div>
                  </div>

                  {weekDays.map((day,dIdx)=>{
                    const dateStr = toLocalDateStr(day);
                    const slots   = getSlotsFor(member.id, dateStr);
                    const avails  = getAvailFor(member.id, dateStr);
                    const isAvail = avails.some(a=>a.available);
                    const availWindow = avails.find(a=>a.available);
                    const isToday = toLocalDateStr(day)===toLocalDateStr(today);
                    return (
                      <div key={dIdx}
                        className={`relative rounded-xl min-h-16 p-1.5 border transition-all cursor-pointer group ${isToday?"border-indigo-500/30 bg-indigo-950/10":"border-slate-800/60 bg-slate-900/30 hover:bg-slate-800/40"}`}
                        onClick={()=>!editLocked && setShiftModal({date:dateStr,memberId:member.id,memberName:`${member.firstName} ${member.lastName}`.trim()})}>
                        {/* Availability strip — thin bar, hover for details */}
                        {avails.length>0 && (
                          <div className={`w-full rounded-full h-1 mb-1 ${
                            isAvail ? "bg-emerald-500" : "bg-red-500"
                          }`}
                          title={isAvail
                            ? (availWindow?`Available ${availWindow.startTime}–${availWindow.endTime}`:"Available")
                            : "Marked unavailable"}/>
                        )}
                        <div className="space-y-0.5">
                          {slots.map(s=>{
                            const conflict = getSlotConflict(s, member);
                            const hrs = calcShiftHours(s.startTime, s.endTime);
                            const isSelected = selected.has(s.id);
                            const displayEnd = resizingShift?.id === s.id && resizingShift?.currentEnd ? resizingShift.currentEnd : s.endTime;
                            return (
                              <div key={s.id}
                                onClick={e=>{
                                  e.stopPropagation();
                                  if (e.shiftKey) toggleSelect(s.id, e);
                                  else if (!editLocked) setShiftModal({date:dateStr,slot:s,memberId:member.id,memberName:`${member.firstName} ${member.lastName}`.trim()});
                                }}
                                className={`relative text-xs rounded-md px-1.5 py-0.5 font-bold truncate cursor-pointer transition-all hover:opacity-80 ${conflict?"ring-1 ring-red-500/60":""} ${isSelected?"ring-2 ring-indigo-400":""}`}
                                style={{background:getPresetColor(s.shift)+"40",color:getPresetColor(s.shift)}}
                                title={`${s.shift}: ${s.startTime}–${displayEnd} · ${hrs.toFixed(1)}h${s.published?"":" (draft)"} · Shift-click to multi-select${editLocked?"":" · Drag right edge to resize"}`}>
                                {conflict && <span className="absolute -top-0.5 -left-0.5 w-2 h-2 rounded-full bg-red-500 border border-slate-950"/>}
                                {s.startTime}–{displayEnd}{!s.published&&" ✎"}
                                {/* Resize handle */}
                                {!editLocked && (
                                  <span
                                    onMouseDown={e=>handleResizeStart(e,s)}
                                    onTouchStart={e=>handleResizeStart(e,s)}
                                    className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-slate-900/30 rounded-r-md"/>
                                )}
                              </div>
                            );
                          })}
                          {slots.length===0&&<div className="hidden group-hover:flex items-center justify-center h-6 text-slate-600 hover:text-slate-600"><Plus size={12}/></div>}
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex flex-col items-center justify-center px-2 py-1.5 bg-slate-900/40 rounded-xl border border-slate-800/60">
                    <div className="text-sm font-bold text-white">{fmtHrs(empTotal.hours)}</div>
                    {showCosts && member.hourlyRate > 0 && (
                      <div className="text-xs text-emerald-400 font-semibold">{fmtMoney(empTotal.cost)}</div>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="grid gap-1 mt-3 pt-3 border-t border-slate-800/60" style={{gridTemplateColumns:"180px repeat(7, 1fr) 110px"}}>
              <div className="flex flex-col justify-center px-2">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Daily</div>
                <div className="text-xs text-slate-600">hours / wages / sales</div>
              </div>
              {dailyTotals.map((dt, idx) => (
                <div key={idx} className="rounded-xl py-2 px-1 bg-slate-900 border border-slate-800/60 text-center">
                  <div className="text-sm font-bold text-white">{fmtHrs(dt.hours)}</div>
                  {showCosts && <div className="text-xs text-emerald-400 font-semibold">{fmtMoney(dt.cost)}</div>}
                  {dailySales[idx] > 0 && <div className="text-xs text-indigo-400 mt-0.5">{fmtMoney(dailySales[idx])}</div>}
                  {dt.actualHours > 0 && <div className="text-xs text-slate-500 mt-0.5">act {fmtHrs(dt.actualHours)}</div>}
                </div>
              ))}
              <div className="rounded-xl py-2 px-1 bg-indigo-950/30 border border-indigo-500/30 text-center">
                <div className="text-sm font-black text-white">{fmtHrs(weekTotals.hours)}</div>
                {showCosts && <div className="text-xs text-emerald-300 font-bold">{fmtMoney(weekTotals.cost)}</div>}
              </div>
            </div>

            <div className="flex items-center gap-4 mt-4 text-xs text-slate-500 flex-wrap">
              <div className="flex items-center gap-1.5"><div className="w-8 h-1 rounded-full bg-emerald-500"/> Available</div>
              <div className="flex items-center gap-1.5"><div className="w-8 h-1 rounded-full bg-red-500"/> Unavailable</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500"/> Conflict</div>
              <div className="flex items-center gap-1.5"><span className="text-slate-600">✎</span> Draft</div>
              <div className="flex items-center gap-1.5"><span className="text-slate-600">⇨</span> Drag right edge of shift to resize</div>
              <div className="flex items-center gap-1.5"><span className="text-slate-600">⇧</span>+click for multi-select</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Desktop list view ─────────────────────────────────────────────── */}
      {!isMobile && viewMode==="list" && (
        <div className="space-y-3">
          {weekDays.map((day, dIdx)=>{
            const dateStr = toLocalDateStr(day);
            const daySlots = weekSchedules.filter(s=>s.date===dateStr).sort((a,b)=>a.startTime.localeCompare(b.startTime));
            const isToday = toLocalDateStr(day)===toLocalDateStr(today);
            const dt = dailyTotals[dIdx];
            return (
              <div key={dateStr} className={`rounded-2xl border overflow-hidden ${isToday?"border-indigo-500/30":"border-slate-800/60"}`}>
                <div className={`flex items-center justify-between px-4 py-2.5 ${isToday?"bg-indigo-950/30":"bg-slate-900"}`}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className={`text-sm font-bold ${isToday?"text-indigo-300":"text-slate-700"}`}>
                      {day.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"short"})}
                    </div>
                    {dt.hours > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-600">{fmtHrs(dt.hours)}</span>
                        {showCosts && <span className="text-emerald-400 font-semibold">{fmtMoney(dt.cost)}</span>}
                        {dailySales[dIdx] > 0 && <span className="text-indigo-400">forecast {fmtMoney(dailySales[dIdx])}</span>}
                        <span className="text-slate-600">·</span>
                        <span className="text-slate-500">{dt.headcount} on shift</span>
                      </div>
                    )}
                  </div>
                  {!editLocked && (
                    <button onClick={()=>setShiftModal({date:dateStr})} className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
                      <Plus size={12}/> Add shift
                    </button>
                  )}
                </div>
                {daySlots.length===0
                  ? <div className="px-4 py-3 text-xs text-slate-600 italic">No shifts scheduled</div>
                  : <div className="divide-y divide-slate-800/40">
                      {daySlots.map(s=>{
                        const member = opsTeam.find(m=>m.id===s.employeeId);
                        const conflict = getSlotConflict(s, member);
                        const hrs = calcShiftHours(s.startTime, s.endTime);
                        const isSelected = selected.has(s.id);
                        return (
                          <div key={s.id}
                            onClick={e=>{ if (e.shiftKey) toggleSelect(s.id, e); }}
                            className={`flex items-center gap-3 px-4 py-3 ${s.status==="cancelled"?"opacity-50":""} ${isSelected?"bg-indigo-950/30":""}`}>
                            <input type="checkbox" checked={isSelected} onChange={e=>{e.stopPropagation();toggleSelect(s.id,e);}}
                              className="rounded border-slate-600 bg-slate-800 text-indigo-300 focus:ring-indigo-500"/>
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:getPresetColor(s.shift)}}/>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold text-white">{s.employeeName}</div>
                                {!s.published&&<span className="text-xs text-amber-400 font-semibold">Draft</span>}
                                {conflict && <span className="text-xs text-red-400 font-semibold">⚠ {conflict==="unavailable"?"Unavailable":"Outside availability"}</span>}
                              </div>
                              <div className="text-xs text-slate-600">{s.shift} · {s.startTime}–{s.endTime} · {hrs.toFixed(1)}h{s.role?` · ${s.role}`:""}</div>
                              {s.notes&&<div className="text-xs text-slate-500 italic mt-0.5">{s.notes}</div>}
                            </div>
                            {showCosts && member?.hourlyRate > 0 && (
                              <div className="text-xs text-emerald-400 font-semibold flex-shrink-0">{fmtMoney(hrs * effectiveHourlyRate(member))}</div>
                            )}
                            {!editLocked && (
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button onClick={e=>{e.stopPropagation();setShiftModal({date:dateStr,slot:s,memberId:s.employeeId,memberName:s.employeeName});}} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"><Edit size={13}/></button>
                                <button onClick={e=>{e.stopPropagation();setDeleteId(s.id);}} className="p-1.5 rounded-xl bg-slate-800 text-slate-600 hover:text-red-400 hover:bg-red-950/20 transition-colors"><Trash2 size={13}/></button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                }
              </div>
            );
          })}
        </div>
      )}

      {/* ── Coverage view ─────────────────────────────────────────────────── */}
      {!isMobile && viewMode==="coverage" && (
        <div className="space-y-3">
          <div className="text-xs text-slate-500">Hour-by-hour staffing heatmap. Darker = more people on shift.</div>
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid gap-1 mb-2" style={{gridTemplateColumns:"100px repeat(24, 1fr)"}}>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest px-2 py-1.5">Day</div>
                {Array.from({length:24},(_,h)=>(
                  <div key={h} className="text-center text-xs text-slate-500 font-mono py-1">{String(h).padStart(2,"0")}</div>
                ))}
              </div>
              {coverageMatrix.map((row, idx) => {
                const day = weekDays[idx];
                const isToday = toLocalDateStr(day)===toLocalDateStr(today);
                const maxCount = Math.max(...row.counts, 1);
                return (
                  <div key={row.date} className="grid gap-1 mb-1" style={{gridTemplateColumns:"100px repeat(24, 1fr)"}}>
                    <div className={`flex items-center px-2 py-1.5 rounded-xl text-xs font-semibold ${isToday?"bg-indigo-950/30 text-indigo-300":"bg-slate-900 text-slate-700"}`}>
                      {day.toLocaleDateString("en-GB",{weekday:"short",day:"numeric"})}
                    </div>
                    {row.counts.map((c, h) => {
                      const intensity = c / maxCount;
                      return (
                        <div key={h}
                          className="rounded text-center text-xs font-bold py-1.5 transition-all"
                          style={{
                            background: c === 0 ? "rgb(15,23,42)" : `rgba(99,102,241,${0.15 + intensity*0.6})`,
                            color: c === 0 ? "#475569" : intensity > 0.5 ? "white" : "#a5b4fc",
                          }}
                          title={`${c} ${c===1?"person":"people"} working at ${String(h).padStart(2,"0")}:00`}>
                          {c || ""}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {shiftModal && !editLocked && (
        <ShiftFormModal
          date={shiftModal.date} slot={shiftModal.slot||null} brandId={brandId} storeId={storeId}
          memberId={shiftModal.memberId||null} memberName={shiftModal.memberName||""}
          filterRole={filterRole!=="all"?filterRole:""} filterDept={filterDept!=="all"?filterDept:""}
          opsTeam={opsTeam} availability={availability} shiftPresets={shiftPresets} schedules={schedules} currentUser={currentUser}
          onSave={s=>{onAdd(s);setShiftModal(null);}}
          onDelete={id=>{onDelete(id);setShiftModal(null);}}
          onClose={()=>setShiftModal(null)}
        />
      )}
      {deleteId && <OpsConfirmModal message="Delete this shift?" onConfirm={()=>{onDelete(deleteId);setDeleteId(null);}} onClose={()=>setDeleteId(null)}/>}
      {autofillModal && (
        <AutofillShiftsModal
          weekDays={weekDays} weekDayStrs={weekDayStrs} brandId={brandId} storeId={storeId}
          opsTeam={filteredMembers} availability={availability} shiftPresets={brandPresets}
          existingSchedules={weekSchedules}
          currentUser={currentUser}
          onApply={async (shifts) => {
            for (const s of shifts) await onAdd(s);
            setAutofillModal(null);
          }}
          onClose={()=>setAutofillModal(null)}
        />
      )}
      {salesModal && (
        <SalesForecastModal
          brand={brand} store={selectedStore} weekDays={weekDays} weekDayStrs={weekDayStrs}
          onSave={async (forecasts) => {
            // Sales forecasts now live on the store's kpi_targets, not brand's.
            if (!onUpdateStore || !selectedStore) return;
            const newKpi = {
              ...(selectedStore.kpiTargets || {}),
              salesForecasts: { ...(selectedStore.kpiTargets?.salesForecasts || {}), ...forecasts },
            };
            await onUpdateStore(selectedStore.id, { kpiTargets: newKpi });
            setSalesModal(false);
          }}
          onClose={()=>setSalesModal(false)}
        />
      )}
    </div>
  );
}

// ── Autofill Shifts Modal — proposes shifts based on availability ─────────────
function AutofillShiftsModal({ weekDays, weekDayStrs, brandId, storeId, opsTeam, availability, shiftPresets, existingSchedules, currentUser, onApply, onClose }) {
  const [presetId,    setPresetId]    = useState(shiftPresets[0]?.id || "");
  const [selectedDays, setSelectedDays] = useState(new Set(weekDayStrs));
  const [skipIfHasShift, setSkipIfHasShift] = useState(true);
  const [respectAvailWindow, setRespectAvailWindow] = useState(true);

  const preset = shiftPresets.find(p => p.id === presetId);

  // Build proposals
  const proposals = useMemo(() => {
    if (!preset) return [];
    const out = [];
    weekDayStrs.forEach(dateStr => {
      if (!selectedDays.has(dateStr)) return;
      const dayName = DAYS_OF_WEEK[new Date(dateStr+"T00:00:00").getDay()===0?6:new Date(dateStr+"T00:00:00").getDay()-1];
      opsTeam.forEach(m => {
        // Already scheduled this day?
        const hasShift = existingSchedules.some(s => s.employeeId === m.id && s.date === dateStr && s.status !== "cancelled");
        if (skipIfHasShift && hasShift) return;
        // Available?
        const avails = availability.filter(a => {
          if (a.employeeId !== m.id || a.status === "rejected") return false;
          if (a.type === "one_off") return a.date === dateStr;
          if (a.type === "weekly") return (a.amendedDayOfWeek||a.dayOfWeek) === dayName;
          if (a.type === "recurring") return a.startDate <= dateStr && a.endDate >= dateStr;
          return false;
        });
        if (avails.some(a => !a.available)) return; // explicitly unavailable
        const availWin = avails.find(a => a.available);
        if (avails.length > 0 && !availWin) return; // no positive availability
        if (respectAvailWindow && availWin && availWin.startTime && availWin.endTime) {
          if (preset.startTime < availWin.startTime || preset.endTime > availWin.endTime) return;
        }
        if (avails.length === 0) return; // no availability submitted - skip
        out.push({ memberId: m.id, memberName: `${m.firstName} ${m.lastName}`.trim(), date: dateStr, preset });
      });
    });
    return out;
  }, [preset?.id, JSON.stringify([...selectedDays]), skipIfHasShift, respectAvailWindow, JSON.stringify(opsTeam.map(m=>m.id))]);

  const [excluded, setExcluded] = useState(new Set());
  const toggleExclude = (key) => setExcluded(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const proposalsActive = proposals.filter(p => !excluded.has(`${p.memberId}-${p.date}`));

  const handleApply = () => {
    const ws = new Date(weekDays[0]); ws.setHours(0,0,0,0);
    const wsStr = [ws.getFullYear(),String(ws.getMonth()+1).padStart(2,"0"),String(ws.getDate()).padStart(2,"0")].join("-");
    const shifts = proposalsActive.map(p => {
      const member = opsTeam.find(m => m.id === p.memberId);
      return {
        id: `sch-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
        brandId, storeId: storeId || null,
        date: p.date, employeeId: p.memberId, employeeName: p.memberName,
        shift: p.preset.name, startTime: p.preset.startTime, endTime: p.preset.endTime,
        role: member?.role || "", department: member?.department || "",
        notes: "", status: "scheduled", published: false,
        weekStart: wsStr, createdBy: currentUser.name,
      };
    });
    onApply(shifts);
  };

  return (
    <Modal title="Auto-fill shifts from availability" onClose={onClose} maxW="max-w-2xl"
      footer={<>
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">Cancel</button>
        <button onClick={handleApply} disabled={proposalsActive.length === 0}
          className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-bold">
          Create {proposalsActive.length} shift{proposalsActive.length!==1?"s":""}
        </button>
      </>}>
      <div className="space-y-4">
        <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-xl p-3">
          <div className="text-xs text-indigo-300">
            For each day & employee selected, propose a shift if they've marked themselves available and aren't already scheduled.
          </div>
        </div>

        {/* Preset picker */}
        <div>
          <label className={labelCls}>Shift template</label>
          <div className="flex flex-wrap gap-2">
            {shiftPresets.map(p => (
              <button key={p.id} onClick={()=>setPresetId(p.id)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                  presetId === p.id ? "border-transparent text-white" : "bg-slate-800 text-slate-600 border-slate-700 hover:bg-slate-700"
                }`}
                style={presetId === p.id ? { background: p.color } : {}}>
                {p.name} · {p.startTime}–{p.endTime}
              </button>
            ))}
            {shiftPresets.length === 0 && <div className="text-xs text-slate-500 italic">No shift presets — create some in Ops Setup first.</div>}
          </div>
        </div>

        {/* Days */}
        <div>
          <label className={labelCls}>Days</label>
          <div className="flex flex-wrap gap-2">
            {weekDays.map((d, idx) => {
              const dStr = weekDayStrs[idx];
              const active = selectedDays.has(dStr);
              return (
                <button key={dStr} onClick={()=>setSelectedDays(prev=>{const n=new Set(prev);if(n.has(dStr))n.delete(dStr);else n.add(dStr);return n;})}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold ${active?"bg-indigo-600 text-white":"bg-slate-800 text-slate-600 hover:bg-slate-700"}`}>
                  {DAYS_OF_WEEK[idx].slice(0,3)} {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Options */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input type="checkbox" checked={skipIfHasShift} onChange={e=>setSkipIfHasShift(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-indigo-300"/>
            Skip employees who already have a shift on that day
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input type="checkbox" checked={respectAvailWindow} onChange={e=>setRespectAvailWindow(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-indigo-300"/>
            Only propose if shift fits within their availability window
          </label>
        </div>

        {/* Preview */}
        <div>
          <div className={labelCls}>Preview ({proposalsActive.length} of {proposals.length} active)</div>
          {proposals.length === 0 ? (
            <div className="text-xs text-slate-500 italic py-4 text-center">No proposals — no eligible employees or no availability submitted. Try toggling the options above.</div>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-1 bg-slate-900/40 rounded-xl p-2">
              {proposals.map(p => {
                const key = `${p.memberId}-${p.date}`;
                const isExcl = excluded.has(key);
                return (
                  <button key={key} onClick={()=>toggleExclude(key)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${isExcl?"bg-slate-800/40 opacity-50":"bg-slate-800 hover:bg-slate-700"}`}>
                    <input type="checkbox" checked={!isExcl} readOnly className="rounded border-slate-600 bg-slate-800 text-indigo-300 pointer-events-none"/>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background: p.preset.color}}/>
                    <div className="flex-1 text-left text-slate-200 font-semibold">{p.memberName}</div>
                    <div className="text-slate-600">{new Date(p.date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric"})}</div>
                    <div className="text-slate-600 font-mono">{p.preset.startTime}–{p.preset.endTime}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Sales Forecast Modal ──────────────────────────────────────────────────────
function SalesForecastModal({ brand, store, weekDays, weekDayStrs, onSave, onClose }) {
  // Read existing forecasts from the store first (new home), brand as fallback
  // for any legacy data still living on the brand.
  const existing = store?.kpiTargets?.salesForecasts || brand?.kpiTargets?.salesForecasts || {};
  const [forecasts, setForecasts] = useState(() => {
    const out = {};
    weekDayStrs.forEach(d => { out[d] = existing[d] ? String(existing[d]) : ""; });
    return out;
  });
  const total = Object.values(forecasts).reduce((a,v) => a + (parseFloat(v)||0), 0);

  return (
    <Modal title="Sales forecast for this week" onClose={onClose} maxW="max-w-md"
      footer={<>
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">Cancel</button>
        <button onClick={()=>onSave(forecasts)} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold">Save Forecast</button>
      </>}>
      <div className="space-y-3">
        <div className="text-xs text-slate-600">
          Enter forecasted sales for each day. We'll calculate Sales Per Labour Hour (SPLH) — target £8+ per £1 spent on wages.
        </div>
        {weekDays.map((d, idx) => {
          const dStr = weekDayStrs[idx];
          return (
            <div key={dStr} className="flex items-center gap-3">
              <div className="text-xs text-slate-600 w-32">
                {d.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}
              </div>
              <div className="flex-1 flex items-center gap-2">
                <span className="text-slate-500 text-sm">£</span>
                <input type="number" step="0.01" value={forecasts[dStr]}
                  onChange={e=>setForecasts(f=>({...f,[dStr]:e.target.value}))}
                  placeholder="0.00" className={inputCls}/>
              </div>
            </div>
          );
        })}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800/60">
          <span className="text-sm font-semibold text-slate-700">Week total</span>
          <span className="text-lg font-black text-emerald-400">£{total.toFixed(2)}</span>
        </div>
      </div>
    </Modal>
  );
}

// ── Employee Schedule View ────────────────────────────────────────────────────
function EmployeeScheduleView({ currentUser, brands, opsTeam, schedules }) {
  const myId = currentUser.opsTeamMemberId || currentUser.id;
  const myBrandId = currentUser.brandIds[0];
  const myMember = opsTeam.find(m => m.id === myId);
  const myDept = myMember?.department || "";

  // Use local date (not UTC) so BST/timezone doesn't shift the day
  const toLocalDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  };

  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
  const todayStr    = toLocalDateStr(today);
  const tomorrowStr = toLocalDateStr(tomorrow);

  const [viewDate, setViewDate] = useState(todayStr);
  const viewLabel = viewDate === todayStr ? "Today" : "Tomorrow";

  // Only published schedules for this brand on this date
  const daySchedules = schedules.filter(s =>
    s.brandId === myBrandId && s.date === viewDate &&
    !!s.published &&
    s.status !== "cancelled"
  );

  // My own shifts — match by opsTeamMemberId OR currentUser.id
  const myShifts = daySchedules.filter(s =>
    s.employeeId === myId || s.employeeId === currentUser.id
  );

  // Colleague shifts — everyone else at same location, same day
  // Grouped: same dept first, then others
  const colleagueShifts = daySchedules.filter(s =>
    s.employeeId !== myId && s.employeeId !== currentUser.id
  );
  const sameDeptShifts  = myDept ? colleagueShifts.filter(s => s.department === myDept) : [];
  const otherDeptShifts = myDept ? colleagueShifts.filter(s => s.department !== myDept) : colleagueShifts;

  const brand = brands.find(b => b.id === myBrandId);

  const ShiftCard = ({ shift, isMe }) => {
    const member = opsTeam.find(m => m.id === shift.employeeId);
    // Issue 3: Other employees stay fully anonymous — role/badge color only,
    // never name. If no role is set on the member or shift, fall back to a
    // generic label rather than leaking the name.
    const displayName = isMe
      ? (myMember?.nickname || myMember?.firstName || shift.employeeName)
      : (member?.role || shift.role || "Team Member");
    // Coloured badge dot to give visual variety without identity. Use the
    // member's stored color when available so each role has a consistent hue.
    const badgeColor = isMe
      ? (myMember?.color || "#6366f1")
      : (member?.color || "#64748b");
    return (
      <div className={`rounded-2xl border p-4 ${isMe ? "bg-indigo-950/30 border-indigo-500/30" : "bg-slate-900 border-slate-700"}`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{background:badgeColor+"30",color:badgeColor}}>
            {/* Show initials only for self; show a role icon dot for others */}
            {isMe
              ? `${(myMember?.firstName||"?")[0]}${myMember?.lastName?.[0]||""}`
              : <span className="w-2.5 h-2.5 rounded-full" style={{background:badgeColor}}/>
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-bold ${isMe ? "text-indigo-300" : "text-slate-200"}`}>
              {isMe ? `${displayName} (You)` : displayName}
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              {shift.shift} · {shift.startTime} – {shift.endTime}
            </div>
            {shift.notes && isMe && <div className="text-xs text-slate-500 italic mt-1">{shift.notes}</div>}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-sm font-bold text-white">{shift.startTime}</div>
            <div className="text-xs text-slate-500">– {shift.endTime}</div>
          </div>
        </div>
      </div>
    );
  };

  // Issue 3: "Coming Up This Week" was removed per spec. Staff see only
  // today/tomorrow. The Today/Tomorrow toggle above is enough — anything
  // further out is operationally noise and surfacing the personal schedule
  // a week ahead encourages staff to check in less often.

  return (
    <div className="space-y-5 max-w-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">My Schedule</h2>
          {brand && <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{background:brand.color}}/>{brand.name}</div>}
        </div>
      </div>

      {/* Today / Tomorrow toggle */}
      <div className="flex bg-slate-900 border border-slate-700 rounded-2xl p-1 gap-1 w-fit">
        <button onClick={()=>setViewDate(todayStr)}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${viewDate===todayStr?"bg-indigo-600 text-white":"text-slate-400 hover:text-white"}`}>
          Today
        </button>
        <button onClick={()=>setViewDate(tomorrowStr)}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${viewDate===tomorrowStr?"bg-indigo-600 text-white":"text-slate-400 hover:text-white"}`}>
          Tomorrow
        </button>
      </div>

      {/* Date display */}
      <div className="text-xs text-slate-500">
        {new Date(viewDate+"T12:00:00").toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
      </div>

      {/* My shifts for selected day */}
      <div>
        <div className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Your Shifts</div>
        {myShifts.length === 0
          ? <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 text-center text-slate-500 text-sm">Not scheduled {viewLabel.toLowerCase()}</div>
          : <div className="space-y-2">{myShifts.map(s=><ShiftCard key={s.id} shift={s} isMe={true}/>)}</div>
        }
      </div>

      {/* Department shifts for selected day */}
      {sameDeptShifts.length > 0 && (
        <div>
          <div className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">{myDept} Team {viewLabel}</div>
          <div className="space-y-2">{sameDeptShifts.map(s=><ShiftCard key={s.id} shift={s} isMe={false}/>)}</div>
        </div>
      )}

      {/* Other colleagues */}
      {otherDeptShifts.length > 0 && (
        <div>
          <div className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Also Working {viewLabel}</div>
          <div className="space-y-2">{otherDeptShifts.map(s=><ShiftCard key={s.id} shift={s} isMe={false}/>)}</div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// KIOSK — Punch In / Punch Out (tablet-optimised, /kiosk route)
// ═══════════════════════════════════════════════════════════════════════════════

function KioskApp({ opsTeam, brands, stores = [], currentStore, punchRecords, schedules = [], onPunchIn, onPunchOut, onLogout }) {
  const [pin,         setPin]       = useState("");
  const [matched,     setMatched]   = useState(null); // ops_team member
  const [error,       setError]     = useState("");
  const [shake,       setShake]     = useState(false);
  const [lastAction,  setLastAction]= useState(null); // { type:"in"|"out", name, time }
  const [clock,       setClock]     = useState(new Date());
  const [submitting,  setSubmitting]= useState(false);
  const submittingRef = useRef(false);
  // Camera
  const videoRef       = useRef(null);
  const canvasRef      = useRef(null);
  const streamRef      = useRef(null);
  const [cameraReady,  setCameraReady] = useState(false);
  const [cameraError,  setCameraError] = useState(false);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Camera startup — request front camera once on mount
  useEffect(() => {
    let cancelled = false;
    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera not supported");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(()=>{});
        }
        setCameraReady(true); setCameraError(false);
      } catch (err) {
        console.warn("Camera unavailable:", err);
        setCameraError(true); setCameraReady(false);
      }
    }
    startCamera();
    return () => {
      cancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Watchdog: every 1 second, if the video element lost its stream (e.g., paused after overlay flipped),
  // re-attach and play. Keeps the live preview working forever without page refresh.
  useEffect(() => {
    const watchdog = setInterval(() => {
      if (!streamRef.current || !videoRef.current) return;
      const v = videoRef.current;
      if (v.srcObject !== streamRef.current) {
        v.srcObject = streamRef.current;
      }
      if (v.paused || v.readyState < 2) {
        v.play().catch(()=>{});
      }
    }, 1000);
    return () => clearInterval(watchdog);
  }, []);

  // Capture a still frame as JPEG blob (returns null on failure)
  const capturePhoto = () => new Promise((resolve) => {
    try {
      if (!cameraReady || !videoRef.current || !canvasRef.current) { resolve(null); return; }
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const w = video.videoWidth || 640, h = video.videoHeight || 480;
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, w, h);
      canvas.toBlob(blob => resolve(blob), "image/jpeg", 0.72);
    } catch { resolve(null); }
  });

  // Auto-clear last action message after 5 seconds
  useEffect(() => {
    if (!lastAction) return;
    const t = setTimeout(() => {
      setLastAction(null); setPin(""); setMatched(null);
      submittingRef.current = false; setSubmitting(false);
    }, 5000);
    return () => clearTimeout(t);
  }, [lastAction]);

  const handleDigit = (d) => {
    if (matched) return; // already confirmed — waiting for auto-clear
    if (pin.length >= 6) return;
    setError("");
    const next = pin + d;
    setPin(next);

    // Auto-match when 4+ digits entered
    if (next.length >= 4) {
      const found = opsTeam.find(m => m.pin && m.pin === next);
      if (found) {
        setMatched(found);
        setError("");
      }
    }
  };

  const handleBackspace = () => {
    if (matched) return;
    setPin(p => p.slice(0, -1));
    setError("");
    setMatched(null);
  };

  const handleClear = () => { setPin(""); setMatched(null); setError(""); };

  const handleConfirm = async () => {
    if (submittingRef.current) return;
    if (!matched) {
      setError("PIN not recognised");
      setShake(true);
      setTimeout(() => { setShake(false); setPin(""); }, 600);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);

    // Capture the photo SYNCHRONOUSLY (well, in a microtask) — runs in parallel with UI
    const photoBlobPromise = capturePhoto();

    const toLocalDate = () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    };
    const todayStr = toLocalDate();
    const openRecord = punchRecords.find(r =>
      r.employeeId === matched.id && r.date === todayStr && r.status === "open"
    );
    const now = new Date().toISOString();
    const recordId = openRecord?.id || `pr-${Date.now()}`;
    const isOut = !!openRecord;

    // Show success immediately
    if (isOut) {
      const punchInTime = new Date(openRecord.punchIn);
      const hoursWorked = Math.round(((Date.now() - punchInTime.getTime()) / 3600000) * 100) / 100;
      const grossPay    = matched.hourlyRate ? Math.round(hoursWorked * matched.hourlyRate * 100) / 100 : null;
      // Compute overtime & unscheduled flag for the success screen
      const scheduledStart = openRecord.scheduledStart;
      const scheduledEnd   = openRecord.scheduledEnd;
      let overtimeHrs = 0;
      const isUnscheduled = !scheduledStart || !scheduledEnd;
      if (scheduledStart && scheduledEnd) {
        const ss = new Date(openRecord.date+"T"+scheduledStart+":00");
        const se = new Date(openRecord.date+"T"+scheduledEnd  +":00");
        const schedHours = se <= ss ? (se-ss+86400000)/3600000 : (se-ss)/3600000;
        const overByTotal = Math.max(0, hoursWorked - schedHours);
        // Out-of-window check
        const pIn = punchInTime.getTime();
        const pOut = Date.now();
        let ssMs = ss.getTime(), seMs = se.getTime();
        if (seMs <= ssMs) seMs += 86400000;
        const overlapStart = Math.max(pIn, ssMs);
        const overlapEnd   = Math.min(pOut, seMs);
        const overlapMs    = Math.max(0, overlapEnd - overlapStart);
        const outOfWindow = Math.max(0, (pOut - pIn - overlapMs) / 3600000);
        overtimeHrs = Math.round(Math.max(overByTotal, outOfWindow) * 100) / 100;
      }
      setLastAction({ type: "out", name: matched.nickname || matched.firstName, time: new Date(), hours: hoursWorked, overtimeHrs, isUnscheduled });
      onPunchOut(openRecord.id, now, hoursWorked, grossPay)
        .catch(err => console.error("PunchOut failed:", err));
    } else {
      // Look up the employee's published schedule for today AT THIS KIOSK'S STORE.
      // A cover shift might be at a different store than usual; we want to
      // match the schedule that's relevant for *this* punch location, falling
      // back to a brand-keyed match for legacy schedules without storeId.
      const todaysSched = schedules.find(s =>
        s.employeeId === matched.id && s.date === todayStr && s.published &&
        (s.storeId ? s.storeId === currentStore?.id : s.brandId === (currentStore?.brandId || matched.brandId))
      );
      setLastAction({ type: "in", name: matched.nickname || matched.firstName, time: new Date() });
      onPunchIn({
        id: recordId,
        // brandId + storeId come from the kiosk's registered store — this is
        // the location of work, not the staff's home store. A staff member
        // covering at another store records their punch against the kiosk's
        // store. (storeId is NOT NULL on punch_records per Stage 6, so this
        // is required — missing it was the root cause of Issue 2.)
        brandId: currentStore?.brandId || matched.brandId,
        storeId: currentStore?.id || null,
        employeeId: matched.id,
        employeeName: `${matched.firstName} ${matched.lastName}`.trim(),
        date: todayStr,
        punchIn: now, punchOut: null, hoursWorked: null,
        hourlyRate: matched.hourlyRate || 0, grossPay: null,
        notes: "", status: "open", amendedBy: "",
        // Schedule lookup uses the kiosk's store — if employee has a published
        // shift at this store today, lock it in for overtime calc.
        scheduledStart: todaysSched?.startTime || null,
        scheduledEnd:   todaysSched?.endTime   || null,
      }).catch(err => console.error("PunchIn failed:", err));
    }

    // Upload photo in the background — doesn't block anything
    photoBlobPromise.then(async blob => {
      if (!blob) return; // camera failed → record flagged as "no photo" automatically
      try {
        const url = await uploadPunchPhoto(blob, matched.id);
        // Small delay to ensure the punch record exists in DB before we update it
        await new Promise(r => setTimeout(r, 800));
        await attachPunchPhoto(recordId, url, isOut ? "out" : "in");
      } catch (err) { console.warn("Photo upload failed:", err); }
    });
  };

  const fmtTime = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fmtDate = (d) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // Success screen
  // Success overlay state — instead of returning early (which unmounts the camera),
  // we render the kiosk normally and place the success screen as an absolute overlay.
  const showSuccessOverlay = !!lastAction;
  const successIsIn   = lastAction?.type === "in";
  const successHasOT  = (lastAction?.overtimeHrs || 0) > 0;
  const successUnsched = !!lastAction?.isUnscheduled;

  // Check if matched employee is currently clocked in
  const toLocalDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  };
  const todayStr = toLocalDate();
  const openRecord = matched ? punchRecords.find(r =>
    r.employeeId === matched.id && r.date === todayStr && r.status === "open"
  ) : null;
  const isClockedIn = !!openRecord;

  // Q10: small store name in corner. Long-press (1.5s) starts a logout
  // confirmation — manager can switch tablet to a different store.
  const [logoutPromptOpen, setLogoutPromptOpen] = useState(false);
  const logoutHoldRef = useRef(null);
  const startLogoutHold = () => {
    if (logoutHoldRef.current) return;
    logoutHoldRef.current = setTimeout(() => {
      setLogoutPromptOpen(true);
      logoutHoldRef.current = null;
    }, 1500);
  };
  const cancelLogoutHold = () => {
    if (logoutHoldRef.current) { clearTimeout(logoutHoldRef.current); logoutHoldRef.current = null; }
  };
  const confirmLogout = () => {
    setLogoutPromptOpen(false);
    onLogout?.();
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 select-none relative">
      {/* Q10: corner store badge — small, unobtrusive. Long-press 1.5s to
          trigger the logout flow (so casual taps don't accidentally
          unregister the tablet). */}
      {currentStore && (
        <button
          onMouseDown={startLogoutHold} onMouseUp={cancelLogoutHold} onMouseLeave={cancelLogoutHold}
          onTouchStart={startLogoutHold} onTouchEnd={cancelLogoutHold} onTouchCancel={cancelLogoutHold}
          className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/60 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          title="Long-press to switch store"
        >
          📍 {currentStore.shortName || currentStore.name}
        </button>
      )}

      {/* Logout confirmation overlay */}
      {logoutPromptOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full">
            <div className="text-white font-bold text-lg mb-2">Unregister this kiosk?</div>
            <div className="text-slate-400 text-sm mb-5">
              This tablet will be removed from <span className="font-semibold text-white">{currentStore?.shortName || currentStore?.name}</span> and
              will need to enter the kiosk PIN again to register — to this or a different store.
            </div>
            <div className="flex gap-2">
              <button onClick={() => setLogoutPromptOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">
                Cancel
              </button>
              <button onClick={confirmLogout}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500">
                Unregister
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden capture canvas */}
      <canvas ref={canvasRef} className="hidden"/>

      {/* Header */}
      <div className="mb-6 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-black text-lg">CB</span>
          </div>
          <span className="text-white font-bold text-xl">Create Brands</span>
        </div>
        <div className="text-3xl font-black text-white tabular-nums">{fmtTime(clock)}</div>
        <div className="text-slate-600 text-sm mt-0.5">{fmtDate(clock)}</div>
      </div>

      {/* Camera preview */}
      <div className="relative mb-4">
        <video
          ref={videoRef}
          autoPlay playsInline muted
          className={`w-32 h-32 rounded-full object-cover border-2 transition-all ${
            cameraReady ? "border-emerald-500/40" : cameraError ? "border-red-500/40 opacity-30" : "border-slate-700/60 opacity-40"
          }`}
          style={{ transform: "scaleX(-1)" }}
        />
        {/* Status dot */}
        <div className={`absolute bottom-1 right-1 w-3 h-3 rounded-full border-2 border-slate-950 ${
          cameraReady ? "bg-emerald-9500" : cameraError ? "bg-red-9500" : "bg-amber-9500"
        }`}/>
      </div>
      {/* Privacy notice */}
      <div className="text-xs text-slate-500 text-center mb-4 max-w-xs">
        {cameraError
          ? <span className="text-amber-400">⚠ Camera unavailable — clock-in will still work but won't be verified by photo</span>
          : "A photo is taken at clock-in for verification"}
      </div>

      {/* PIN display */}
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="text-slate-600 text-sm mb-3 uppercase tracking-widest font-semibold">Enter PIN</div>

          {/* PIN dots */}
          <div className={`flex justify-center gap-4 mb-3 ${shake ? "animate-bounce" : ""}`}>
            {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
              <div key={i} className={`w-5 h-5 rounded-full border-2 transition-all ${
                i < pin.length
                  ? matched ? "bg-emerald-9500 border-emerald-400" : "bg-indigo-9500 border-indigo-400"
                  : "bg-transparent border-slate-600"
              }`}/>
            ))}
          </div>

          {/* Matched name */}
          {matched && (
            <div className={`rounded-2xl px-6 py-4 mx-4 border ${isClockedIn ? "bg-amber-950 border-amber-500/30" : "bg-emerald-950 border-emerald-500/40"}`}>
              <div className="text-xl font-bold text-white">{matched.firstName} {matched.lastName}</div>
              <div className="text-sm mt-0.5 font-semibold">
                {isClockedIn
                  ? <span className="text-amber-400">⏱ Currently clocked in — tap to Clock Out</span>
                  : <span className="text-emerald-400">Ready to Clock In</span>
                }
              </div>
              {isClockedIn && openRecord && (
                <div className="text-xs text-slate-600 mt-1">
                  In at {new Date(openRecord.punchIn).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-red-400 text-sm font-semibold mt-2">{error}</div>
          )}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3">
          {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((key, idx) => {
            if (key === "") return <div key={idx}/>;
            return (
              <button key={key}
                onClick={() => key === "⌫" ? handleBackspace() : handleDigit(key)}
                className={`h-20 rounded-2xl text-2xl font-bold transition-all active:scale-95 touch-manipulation ${
                  key === "⌫"
                    ? "bg-slate-800 text-slate-600 hover:bg-slate-700"
                    : "bg-slate-800 text-white hover:bg-slate-700"
                }`}>
                {key}
              </button>
            );
          })}
        </div>

        {/* Confirm / Clear */}
        <div className="space-y-3">
          <button onClick={handleConfirm}
            disabled={!matched}
            className={`w-full py-5 rounded-2xl text-xl font-black transition-all active:scale-98 touch-manipulation ${
              submitting ? "bg-slate-700 text-slate-500 cursor-not-allowed" :
              matched
                ? isClockedIn
                  ? "bg-amber-9500 hover:bg-amber-400 text-white"
                  : "bg-emerald-600 hover:bg-emerald-9500 text-white"
                : "bg-slate-800 text-slate-600 cursor-not-allowed"
            }`}>
            {submitting ? "Processing…" : matched
              ? isClockedIn ? "⏹ Clock Out" : "▶ Clock In"
              : "Enter PIN"}
          </button>
          {pin.length > 0 && (
            <button onClick={handleClear}
              className="w-full py-3 rounded-2xl bg-slate-900 text-slate-500 text-sm font-semibold hover:bg-slate-800 transition-colors touch-manipulation">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Success overlay — kept on top so video element underneath stays mounted */}
      {showSuccessOverlay && (
        <div className={`absolute inset-0 flex flex-col items-center justify-center p-8 z-50 ${
          successIsIn ? "bg-emerald-950" : successHasOT || successUnsched ? "bg-red-950" : "bg-slate-950"
        }`}>
          <div className="text-center space-y-6 max-w-sm w-full">
            <div className={`text-5xl font-black mb-2 ${successIsIn ? "text-emerald-300" : "text-white"}`}>
              {successIsIn ? "Clocked In ✓" : "Clocked Out ✓"}
            </div>
            <div className="text-3xl font-bold text-white">{lastAction.name}</div>
            <div className="text-xl text-slate-600">{fmtTime(lastAction.time)}</div>

            {!successIsIn && (
              <div className="bg-black/30 rounded-2xl p-5 space-y-3 text-left">
                {lastAction.hours != null && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 text-sm">Hours worked</span>
                    <span className="text-white text-lg font-bold">
                      {Math.floor(lastAction.hours)}h {String(Math.round((lastAction.hours % 1)*60)).padStart(2,"0")}m
                    </span>
                  </div>
                )}
                {(successHasOT || successUnsched) && (
                  <div className="pt-3 border-t border-white/10">
                    <div className="text-red-300 font-bold text-sm mb-1">
                      ⚠ {successUnsched ? "Unscheduled shift" : `${lastAction.overtimeHrs.toFixed(2)}h extra time`}
                    </div>
                    <div className="text-slate-700 text-xs">
                      {successUnsched
                        ? "This shift wasn't scheduled. Open the app → My Hours to submit a reason for your manager to approve."
                        : "You worked outside your scheduled hours. Open the app → My Hours to submit a reason for your manager to approve."}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="text-slate-600 text-sm">Returning to kiosk in a moment…</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIME & ATTENDANCE — Manager view
// ═══════════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════════
// TIME & ATTENDANCE — Manager view with approval + overtime comparison
// ═══════════════════════════════════════════════════════════════════════════════

function TimeAttendanceView({ brands, stores, visibleStoreIds, opsTeam, schedules, punchRecords, currentUser, onUpdate, onAdd, onDelete, onAddComment }) {
  const { user } = useAuth();

  // Store-first scoping. Owner/HQ get the ownership filter (defaults to
  // Owned). Managers/staff see only their assigned stores; no ownership
  // filter applies because their scope is already correct.
  const allVisibleStores = useMemo(
    () => (stores || []).filter(s => visibleStoreIds?.includes(s.id) && !s.archivedAt),
    [stores, visibleStoreIds]
  );
  const [ownership, setOwnership] = useState(isHqOrAbove(user.role) ? "owned" : "all");
  const visibleStores = useMemo(
    () => applyOwnershipFilter(allVisibleStores, ownership, user.role),
    [allVisibleStores, ownership, user.role]
  );
  const [selStore, setSelStore] = useState("all");
  useEffect(() => {
    if (selStore !== "all" && !visibleStores.some(s => s.id === selStore)) {
      setSelStore("all");
    }
  }, [visibleStores, selStore]);
  const inScopeStoreIds = useMemo(() => new Set(visibleStores.map(s => s.id)), [visibleStores]);
  const visibleBrandIds = useMemo(() => new Set(visibleStores.map(s => s.brandId)), [visibleStores]);

  // Legacy vb kept for the schedule-lookup logic below — punches reference
  // schedules by brandId, and during transition not every row has store_id.
  const vb = useMemo(
    () => brands.filter(b => visibleBrandIds.has(b.id) || isHqOrAbove(user.role) || user.brandIds?.includes(b.id)),
    [brands, visibleBrandIds, user.role, user.brandIds]
  );

  // Common predicate for "is this record in the user's current scope?"
  // Store-keyed rows win; legacy brand-keyed rows fall back to brand membership.
  const inScope = (r) => {
    if (r.storeId) {
      if (selStore === "all") return inScopeStoreIds.has(r.storeId);
      return r.storeId === selStore;
    }
    return vb.some(b => b.id === r.brandId);
  };

  const toLocalDate = (d) => {
    const dt = d || new Date();
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
  };
  const getWeekBounds = (offset = 0) => {
    const today = new Date(); today.setHours(0,0,0,0);
    const day = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const mon = new Date(today); mon.setDate(today.getDate() - day + offset * 7);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: toLocalDate(mon), to: toLocalDate(sun) };
  };
  const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "—";
  const fmtDur  = (hrs) => {
    if (hrs == null || hrs <= 0) return "—";
    const h = Math.floor(hrs), m = Math.round((hrs - h) * 60);
    return `${h}h ${String(m).padStart(2,"0")}m`;
  };
  const calcOvertimeHours = (r) => {
    if (!r.punchIn || !r.punchOut) return 0;
    if (!r.scheduledStart || !r.scheduledEnd) return 0;
    const actualMs = new Date(r.punchOut) - new Date(r.punchIn);
    const actualHours = actualMs / 3600000;
    const schedStart = new Date(r.date + "T" + r.scheduledStart + ":00");
    const schedEnd   = new Date(r.date + "T" + r.scheduledEnd   + ":00");
    const schedHours = schedEnd <= schedStart
      ? (schedEnd - schedStart + 86400000) / 3600000
      : (schedEnd - schedStart) / 3600000;
    // Component 1: total hours worked > scheduled hours
    const overByTotal = Math.max(0, actualHours - schedHours);
    // Component 2: hours worked OUTSIDE the scheduled window (early start or late end)
    // This catches "clocked in 5h before scheduled time" type cases
    const pIn  = new Date(r.punchIn).getTime();
    const pOut = new Date(r.punchOut).getTime();
    let ssMs = schedStart.getTime(), seMs = schedEnd.getTime();
    if (seMs <= ssMs) seMs += 86400000; // overnight
    // Overlap between punch window and schedule window
    const overlapStart = Math.max(pIn, ssMs);
    const overlapEnd   = Math.min(pOut, seMs);
    const overlapMs    = Math.max(0, overlapEnd - overlapStart);
    const outOfWindowHours = Math.max(0, (actualMs - overlapMs) / 3600000);
    // Report whichever is larger — covers both "worked extra" and "worked at wrong time"
    return Math.round(Math.max(overByTotal, outOfWindowHours) * 100) / 100;
  };
  const calcUnscheduled = (r) => {
    if (!r.scheduledStart && !r.scheduledEnd) return true; // no schedule at all
    return false;
  };

  const [weekOffset,     setWeekOffset]     = useState(0);
  const [filterEmployee, setFilterEmployee] = useState("all");
  const [tab,            setTab]            = useState("records");
  const [amendModal,     setAmendModal]     = useState(null);
  const [rejectOTModal,  setRejectOTModal]  = useState(null);
  const [addManualModal, setAddManualModal] = useState(false);
  const [photoModal,     setPhotoModal]     = useState(null);
  const [expanded,       setExpanded]       = useState(new Set());  // record ids that are expanded
  const toggleExpanded = (id) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const { from, to } = getWeekBounds(weekOffset);

  const visible = punchRecords.filter(r => {
    if (!inScope(r)) return false;
    if (filterEmployee !== "all" && r.employeeId !== filterEmployee) return false;
    if (r.date < from || r.date > to) return false;
    return true;
  }).sort((a, b) => new Date(b.punchIn) - new Date(a.punchIn));

  const employees = [...new Map(
    punchRecords.filter(r => inScope(r))
      .map(r => [r.employeeId, { id: r.employeeId, name: r.employeeName }])
  ).values()];

  // Enrich each record with schedule data
  const enriched = visible.map(r => {
    const daySchedules = schedules.filter(s =>
      s.brandId === r.brandId && s.employeeId === r.employeeId && s.date === r.date && s.published
    );
    const sched = daySchedules[0] || null;
    const scheduledStart = r.scheduledStart || sched?.startTime || null;
    const scheduledEnd   = r.scheduledEnd   || sched?.endTime   || null;
    // Always recalculate fresh — DB value may be stale if schedule changed
    const overtimeHrs    = calcOvertimeHours({ ...r, scheduledStart, scheduledEnd });
    const isUnscheduled  = !sched && !r.scheduledStart;
    return { ...r, scheduledStart, scheduledEnd, sched, overtimeHrs, isUnscheduled };
  });

  // Summary per employee
  const summary = {};
  enriched.forEach(r => {
    if (!summary[r.employeeId]) {
      const m = opsTeam.find(x => x.id === r.employeeId);
      summary[r.employeeId] = { name: r.employeeName, role: m?.role || "",
        hourlyRate: m?.hourlyRate || r.hourlyRate || 0,
        totalHours: 0, regularHours: 0, overtimeHours: 0, approvedOT: 0,
        totalPay: 0, days: 0, pendingApproval: 0, pendingOT: 0 };
    }
    const s = summary[r.employeeId];
    if (r.hoursWorked) { s.totalHours += r.hoursWorked; s.days += 1; }
    if (!r.approved && r.status === "closed") s.pendingApproval += 1;
    if (r.overtimeHrs > 0 && !r.overtimeApproved) s.pendingOT += 1;
    const approvedOT = (r.overtimeApproved && r.overtimeHrs > 0) ? r.overtimeHrs : 0;
    s.approvedOT += approvedOT;
  });
  Object.values(summary).forEach(s => {
    s.regularHours  = s.totalHours;
    s.overtimeHours = s.approvedOT; // only count manager-approved OT
    s.totalPay      = Math.round((s.totalHours * s.hourlyRate) * 100) / 100;
  });

  const totalPay        = Object.values(summary).reduce((a, s) => a + s.totalPay, 0);
  const totalHours      = Object.values(summary).reduce((a, s) => a + s.totalHours, 0);
  const pendingApproval = enriched.filter(r => !r.approved && r.status === "closed").length;
  const pendingOT       = enriched.filter(r => r.overtimeHrs > 0 && !r.overtimeApproved && r.overtimeReason).length;

  const handleApprove = (r) => onUpdate({ ...r,
    approved: true, approvedBy: currentUser.name,
    scheduledStart: r.scheduledStart, scheduledEnd: r.scheduledEnd,
    overtimeHours: r.overtimeHrs, updatedAt: new Date().toISOString() });

  const handleApproveOT = (r) => onUpdate({ ...r,
    overtimeApproved: true, overtimeApprovedBy: currentUser.name,
    overtimeHours: r.overtimeHrs,
    approved: true, approvedBy: r.approvedBy || currentUser.name,  // also approve the hours
    updatedAt: new Date().toISOString() });

  const handleRejectOT = (r, reason) => onUpdate({ ...r,
    overtimeApproved: false, overtimeHours: 0,
    overtimeReason: r.overtimeReason,
    overtimeRejectedReason: reason || "",
    approved: true, approvedBy: r.approvedBy || currentUser.name,  // hours still get approved (the regular portion); just the OT is rejected
    updatedAt: new Date().toISOString() });

  return (
    <div className="space-y-5">
      {/* Top stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-3">
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-widest">Hours worked</div>
          <div className="text-xl font-black text-white mt-1 tabular-nums">{totalHours.toFixed(1)}<span className="text-base text-slate-500 font-bold ml-1">h</span></div>
          <div className="text-xs text-slate-500 mt-0.5">this week</div>
        </div>
        <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-3">
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-widest">Total pay</div>
          <div className="text-xl font-black text-emerald-400 mt-1 tabular-nums">£{totalPay.toFixed(2)}</div>
          <div className="text-xs text-slate-500 mt-0.5">incl. approved OT</div>
        </div>
        <div className={`bg-slate-900 border rounded-2xl p-3 ${pendingApproval > 0 ? "border-amber-500/30" : "border-slate-800/60"}`}>
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-widest">Pending approval</div>
          <div className={`text-xl font-black mt-1 tabular-nums ${pendingApproval > 0 ? "text-amber-400" : "text-white"}`}>{pendingApproval}</div>
          <div className="text-xs text-slate-500 mt-0.5">{pendingApproval === 1 ? "record" : "records"}</div>
        </div>
        <div className={`bg-slate-900 border rounded-2xl p-3 ${pendingOT > 0 ? "border-red-500/30" : "border-slate-800/60"}`}>
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-widest">Overtime to review</div>
          <div className={`text-xl font-black mt-1 tabular-nums ${pendingOT > 0 ? "text-red-400" : "text-white"}`}>{pendingOT}</div>
          <div className="text-xs text-slate-500 mt-0.5">awaiting decision</div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-white">Time & Attendance</h2>
          <div className="text-xs text-slate-500 mt-0.5">Approve hours, review overtime, and amend records</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setAddManualModal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-700 text-xs font-semibold transition-colors"><Plus size={13}/> Manual Entry</button>
          <div className="flex bg-slate-900 border border-slate-700 rounded-xl p-0.5 gap-0.5">
            <button onClick={()=>setTab("records")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab==="records"?"bg-indigo-600 text-white":"text-slate-400 hover:text-white"}`}>Records</button>
            <button onClick={()=>setTab("summary")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab==="summary"?"bg-indigo-600 text-white":"text-slate-400 hover:text-white"}`}>Summary</button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <StoreScopeDropdown stores={visibleStores} brands={brands} value={selStore} onChange={setSelStore} className="w-64"/>
        <SelectDropdown value={filterEmployee} onChange={setFilterEmployee} className="w-44">
          <option value="all">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </SelectDropdown>
      </div>

      {/* Week nav */}
      <div className="flex items-center justify-between">
        <button onClick={()=>setWeekOffset(w=>w-1)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"><ChevronLeft size={16}/></button>
        <div className="text-sm font-semibold text-white">
          {new Date(from+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"})} – {new Date(to+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}
          {weekOffset === 0 && <span className="ml-2 text-xs text-indigo-400">This week</span>}
        </div>
        <button onClick={()=>setWeekOffset(w=>w+1)} disabled={weekOffset>=0} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"><ChevronRight size={16}/></button>
      </div>

      {/* ── Records ── */}
      {tab === "records" && (
        <div className="space-y-3">
          {enriched.length === 0 && (
            <EmptyState icon={Clock} title="No clock-in records this week"
              message="Once your team starts clocking in at the kiosk, records will appear here for you to approve. You can also add hours manually using the button above."/>
          )}
          {enriched.map(r => {
            const brand  = brands.find(b => b.id === r.brandId);
            const store  = r.storeId ? stores?.find(s => s.id === r.storeId) : null;
            const member = opsTeam.find(m => m.id === r.employeeId);
            const hasOT  = r.overtimeHrs > 0;
            const needsApproval = r.status === "closed" && !r.approved;
            const isRejected = r.overtimeApproved === false && !!r.overtimeRejectedReason;
            const needsOTApproval = hasOT && r.overtimeReason && !r.overtimeApproved && !isRejected;
            // A record is "settled" when there's nothing left to action:
            //   - punch is approved AND
            //   - either no overtime OR overtime has been approved/rejected
            const isSettled = r.approved && (!hasOT || r.overtimeApproved || isRejected) && r.status !== "open";
            const isExpanded = expanded.has(r.id);

            // ── Collapsed view for settled records ──
            if (isSettled && !isExpanded) {
              return (
                <div key={r.id}
                  onClick={()=>toggleExpanded(r.id)}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-900/40 border border-slate-800/60 hover:bg-slate-900 cursor-pointer transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600/20 flex items-center justify-center text-xs font-bold text-indigo-400 flex-shrink-0">
                    {(member?.firstName?.[0]||"?")}{member?.lastName?.[0]||""}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate">{r.employeeName}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(r.date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}
                      {brand && <> · <span style={{color:brand.color}}>{brand.name}</span></>}
                      {store && <span className="text-slate-600"> · {store.shortName || store.name}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-white tabular-nums">{fmtDur(r.hoursWorked)}</div>
                    {r.grossPay && <div className="text-xs text-emerald-400 tabular-nums">£{r.grossPay.toFixed(2)}</div>}
                  </div>
                  {hasOT && r.overtimeApproved && <span className="text-xs text-emerald-400 font-semibold flex-shrink-0">OT ✓</span>}
                  {isRejected && <span className="text-xs text-red-400 font-semibold flex-shrink-0">OT ✗</span>}
                  {!hasOT && r.approved && <span className="text-xs text-emerald-400 font-semibold flex-shrink-0">✓</span>}
                  <ChevronDown size={14} className="text-slate-600 flex-shrink-0"/>
                </div>
              );
            }
            return (
              <div key={r.id} className={`rounded-2xl border p-4 space-y-3 ${
                needsApproval || needsOTApproval ? "bg-amber-950/20 border-amber-500/30" :
                r.status === "open" ? "bg-slate-900/40 border-slate-800/60" :
                "bg-slate-900 border-slate-700"
              }`}>
                {/* Top row */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{background:(member?.color||"#6366f1")+"30",color:member?.color||"#6366f1"}}>
                      {r.employeeName.split(" ").map(w=>w[0]).join("").slice(0,2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-bold text-white">{r.employeeName}</div>
                        {r.approved && <Badge label="✓ Approved" color="emerald"/>}
                        {needsApproval && <Badge label="Needs approval" color="amber"/>}
                        {r.status === "open" && <Badge label="Still clocked in" color="amber"/>}
                        {r.isUnscheduled && <Badge label="Unscheduled" color="red"/>}
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5">
                        {new Date(r.date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}
                        {brand && <span className="ml-2"><span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{background:brand.color}}/>{brand.name}</span>}
                        {store && <span className="ml-2 text-slate-700">· {store.shortName || store.name}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {r.status === "open" && (
                      <button onClick={()=>setAmendModal(r)} className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors">⏹ Clock Out</button>
                    )}
                    {needsApproval && (
                      <button onClick={()=>handleApprove(r)} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors">✓ Approve</button>
                    )}
                    <button onClick={()=>setAmendModal(r)} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors" title="Amend"><Edit size={13}/></button>
                    {isSettled && (
                      <button onClick={()=>toggleExpanded(r.id)} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors" title="Collapse"><ChevronUp size={13}/></button>
                    )}
                  </div>
                </div>

                {/* Schedule vs Actual comparison */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Scheduled */}
                  <div className="bg-slate-950 rounded-xl p-3">
                    <div className="text-xs font-semibold text-slate-600 mb-1.5">📅 Scheduled</div>
                    {r.scheduledStart ? (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Start</span>
                          <span className="text-slate-700 font-mono">{r.scheduledStart}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">End</span>
                          <span className="text-slate-700 font-mono">{r.scheduledEnd || "—"}</span>
                        </div>
                        {r.sched && (
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Shift</span>
                            <span className="text-slate-700">{r.sched.shift}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-red-400 font-semibold">No schedule found</div>
                    )}
                  </div>

                  {/* Actual */}
                  <div className="bg-slate-950 rounded-xl p-3">
                    <div className="text-xs font-semibold text-slate-600 mb-1.5">⏱ Actual</div>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">In</span>
                        <div className="flex items-center gap-2">
                          {r.photoUrlIn && (
                            <button onClick={() => setPhotoModal({ url: r.photoUrlIn, label: `${r.employeeName} — Clock In`, time: fmtTime(r.punchIn) })}
                              className="px-1.5 py-0.5 rounded bg-emerald-950/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-950/20/60 transition-colors" title="View clock-in photo">📷</button>
                          )}
                          {!r.photoUrlIn && r.punchIn && (
                            <span className="text-xs text-amber-500/60" title="No photo captured">⚠</span>
                          )}
                          <span className="text-white font-mono font-bold">{fmtTime(r.punchIn)}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Out</span>
                        <div className="flex items-center gap-2">
                          {r.photoUrlOut && (
                            <button onClick={() => setPhotoModal({ url: r.photoUrlOut, label: `${r.employeeName} — Clock Out`, time: fmtTime(r.punchOut) })}
                              className="px-1.5 py-0.5 rounded bg-emerald-950/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-950/20/60 transition-colors" title="View clock-out photo">📷</button>
                          )}
                          {!r.photoUrlOut && r.punchOut && (
                            <span className="text-xs text-amber-500/60" title="No photo captured">⚠</span>
                          )}
                          <span className={`font-mono font-bold ${r.punchOut ? "text-white" : "text-amber-400"}`}>{r.punchOut ? fmtTime(r.punchOut) : "Still in"}</span>
                        </div>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Hours</span>
                        <span className="text-white font-bold">{fmtDur(r.hoursWorked)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Overtime section */}
                {hasOT && (
                  <div className={`rounded-xl p-3 border space-y-3 ${r.overtimeApproved ? "bg-emerald-950/20 border-emerald-500/20" : "bg-red-950/20 border-red-500/20"}`}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-red-400 mb-1">
                          ⏱ {r.overtimeHrs.toFixed(2)}h overtime
                          {r.overtimeApproved && <span className="text-emerald-400 ml-2">✓ Approved by {r.overtimeApprovedBy}</span>}
                          {r.overtimeApproved === false && r.overtimeRejectedReason && <span className="text-red-400 ml-2">✗ Rejected</span>}
                        </div>
                        {!r.overtimeReason && (r.overtimeComments?.length || 0) === 0 && (
                          <div className="text-xs text-slate-500">Awaiting employee reason</div>
                        )}
                        {r.overtimeApproved === false && r.overtimeRejectedReason && (
                          <div className="text-xs text-red-300 mt-1">Final note: "{r.overtimeRejectedReason}"</div>
                        )}
                      </div>
                      {/* Approve/reject OT */}
                      {needsOTApproval && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button onClick={()=>handleApproveOT(r)} className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors">✓ Approve OT</button>
                          <button onClick={()=>setRejectOTModal(r)} className="px-2.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors">✗ Reject</button>
                        </div>
                      )}
                    </div>
                    {/* Conversation thread */}
                    {(r.overtimeReason || (r.overtimeComments?.length || 0) > 0) && onAddComment && (
                      <OvertimeConversation record={r} currentUser={currentUser} isEmployee={false} onAddComment={onAddComment} compact/>
                    )}
                    {/* Gross pay with/without OT */}
                    {r.hourlyRate > 0 && r.punchOut && (
                      <div className="mt-2 pt-2 border-t border-white/10 flex gap-4 text-xs">
                        <span className="text-slate-600">Scheduled pay: <span className="text-white font-bold">£{(r.scheduledStart && r.scheduledEnd ? (((new Date("2000-01-01T"+r.scheduledEnd) - new Date("2000-01-01T"+r.scheduledStart))/3600000)*r.hourlyRate) : 0).toFixed(2)}</span></span>
                        {r.overtimeApproved && <span className="text-emerald-400">+OT: <span className="font-bold">£{(r.overtimeHrs * r.hourlyRate).toFixed(2)}</span></span>}
                      </div>
                    )}
                  </div>
                )}

                {/* Unscheduled shift */}
                {r.isUnscheduled && r.status === "closed" && (
                  <div className="bg-red-950/20 border border-red-500/20 rounded-xl p-3">
                    <div className="text-xs font-bold text-red-400 mb-0.5">⚠ Unscheduled shift — {fmtDur(r.hoursWorked)}</div>
                    <div className="text-xs text-slate-500">No matching published schedule found for this date</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Summary ── */}
      {tab === "summary" && (
        <div className="space-y-3">
          {Object.entries(summary).length === 0 && <div className="text-center py-12 text-slate-500 text-sm">No records this week</div>}
          {Object.entries(summary).map(([empId, s]) => (
            <div key={empId} className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold text-white">{s.name}</div>
                    {s.pendingApproval > 0 && <Badge label={`${s.pendingApproval} pending`} color="amber"/>}
                    {s.pendingOT > 0 && <Badge label={`${s.pendingOT} OT pending`} color="red"/>}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">{s.role} · {s.days} days worked</div>
                </div>
                <div className="flex gap-4 text-right flex-wrap">
                  <div><div className="text-xs text-slate-500">Regular</div><div className="text-sm font-bold text-white">{fmtDur(s.regularHours)}</div></div>
                  {s.overtimeHours > 0 && <div><div className="text-xs text-slate-500">Approved OT</div><div className="text-sm font-bold text-amber-400">{fmtDur(s.overtimeHours)}</div></div>}
                  <div><div className="text-xs text-slate-500">Total</div><div className="text-sm font-bold text-white">{fmtDur(s.totalHours)}</div></div>
                  <div><div className="text-xs text-slate-500">Rate</div><div className="text-sm font-bold text-slate-700">£{(s.hourlyRate||0).toFixed(2)}/hr</div></div>
                  <div><div className="text-xs text-slate-500">Gross Pay</div><div className="text-sm font-bold text-emerald-400">£{(s.totalPay||0).toFixed(2)}</div></div>
                </div>
              </div>
            </div>
          ))}
          {Object.entries(summary).length > 0 && (
            <div className="rounded-2xl bg-indigo-950/30 border border-indigo-500/30 px-5 py-4 flex items-center justify-between">
              <div className="text-sm font-bold text-white">Week Total</div>
              <div className="flex gap-6 text-right">
                <div><div className="text-xs text-slate-500">Hours</div><div className="text-sm font-bold text-white">{fmtDur(totalHours)}</div></div>
                <div><div className="text-xs text-slate-500">Gross Pay</div><div className="text-lg font-black text-emerald-400">£{totalPay.toFixed(2)}</div></div>
              </div>
            </div>
          )}
        </div>
      )}

      {amendModal && (
        <AmendPunchModal record={amendModal}
          onSave={updated => { onUpdate(updated); setAmendModal(null); }}
          onDelete={id => { onDelete(id); setAmendModal(null); }}
          onClose={() => setAmendModal(null)}
        />
      )}
      {rejectOTModal && (
        <RejectOTModal record={rejectOTModal}
          onReject={handleRejectOT}
          onClose={() => setRejectOTModal(null)}
        />
      )}
      {addManualModal && (
        <AddManualHoursModal brands={vb} opsTeam={opsTeam} currentUser={currentUser}
          onSave={r => { onAdd(r); setAddManualModal(false); }}
          onClose={() => setAddManualModal(false)}
        />
      )}
      {photoModal && (
        <Modal title={photoModal.label} onClose={() => setPhotoModal(null)} maxW="max-w-md">
          <div className="space-y-3">
            <img src={photoModal.url} alt="Punch verification" className="w-full rounded-2xl border border-slate-700"
              style={{ transform: "scaleX(-1)" }}
            />
            <div className="text-center text-xs text-slate-500">
              Captured at <span className="text-slate-700 font-semibold">{photoModal.time}</span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Amend Punch Modal ─────────────────────────────────────────────────────────

// ── Amend Punch Modal — full manager controls ─────────────────────────────────
function AmendPunchModal({ record, onSave, onDelete, onClose }) {
  const toTimeStr = (iso) => iso ? new Date(iso).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "";
  const [punchInTime,  setPunchInTime]  = useState(toTimeStr(record.punchIn));
  const [punchOutTime, setPunchOutTime] = useState(toTimeStr(record.punchOut));
  const [notes,        setNotes]        = useState(record.notes || "");
  const [confirmDel,   setConfirmDel]   = useState(false);

  const handleSave = () => {
    const dateBase    = record.date + "T";
    const newPunchIn  = new Date(dateBase + punchInTime  + ":00").toISOString();
    const newPunchOut = punchOutTime ? new Date(dateBase + punchOutTime + ":00").toISOString() : null;
    const hoursWorked = newPunchOut ? Math.round(((new Date(newPunchOut)-new Date(newPunchIn))/3600000)*100)/100 : null;
    const grossPay    = hoursWorked && record.hourlyRate ? Math.round(hoursWorked*record.hourlyRate*100)/100 : null;
    onSave({ ...record, punchIn: newPunchIn, punchOut: newPunchOut, hoursWorked, grossPay, notes,
             status: punchOutTime ? "amended" : "open", approved: false, updatedAt: new Date().toISOString() });
  };

  const handleForceClockOut = () => {
    const now = new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
    setPunchOutTime(now);
  };

  return (
    <Modal title={`Amend — ${record.employeeName}`} onClose={onClose}
      footer={<>
        {confirmDel ? (
          <>
            <div className="flex-1 text-xs text-red-400 font-semibold self-center">Delete this record?</div>
            <button onClick={() => setConfirmDel(false)} className="px-3 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">No</button>
            <button onClick={() => { onDelete(record.id); onClose(); }} className="px-3 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500">Delete</button>
          </>
        ) : (
          <>
            <button onClick={() => setConfirmDel(true)} className="p-2.5 rounded-xl bg-red-950/20 border border-red-500/30 text-red-400 hover:bg-red-950/20/60 transition-colors" title="Delete record"><Trash2 size={15}/></button>
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">Cancel</button>
            <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500">Save</button>
          </>
        )}
      </>}>
      <div className="space-y-4">
        <div className="bg-slate-950 rounded-xl px-4 py-3 text-xs text-slate-600">
          {record.employeeName} · {new Date(record.date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <AvailTimeField label="Clock In"  value={punchInTime}  onChange={setPunchInTime}/>
          <AvailTimeField label="Clock Out" value={punchOutTime} onChange={setPunchOutTime}/>
        </div>
        {/* Force clock out now */}
        {record.status === "open" && (
          <button onClick={handleForceClockOut}
            className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
            ⏹ Force Clock Out Now
          </button>
        )}
        <div><label className={labelCls}>Notes</label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}
            placeholder="Reason for amendment…" className={`${inputCls} resize-none`}/>
        </div>
      </div>
    </Modal>
  );
}

// ── OT Reject Modal — manager gives reason for rejection ──────────────────────
function RejectOTModal({ record, onReject, onClose }) {
  const [reason, setReason] = useState("");
  return (
    <Modal title="Reject Overtime" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">Cancel</button>
        <button onClick={() => { onReject(record, reason); onClose(); }}
          className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500">Reject</button>
      </>}>
      <div className="space-y-3">
        <div className="bg-slate-950 rounded-xl p-3 text-xs text-slate-600">
          <div className="font-semibold text-slate-700">{record.employeeName}</div>
          <div>{record.overtimeHrs?.toFixed(2)}h overtime — Employee reason: "{record.overtimeReason}"</div>
        </div>
        <div><label className={labelCls}>Reason for rejection</label>
          <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3}
            placeholder="Explain why this overtime is not approved…" className={`${inputCls} resize-none`} autoFocus/>
        </div>
      </div>
    </Modal>
  );
}

// ── Add Manual Hours Modal ────────────────────────────────────────────────────
// ── Overtime Conversation Thread — shared by employee and manager views ───────
function OvertimeConversation({ record, currentUser, isEmployee, onAddComment, compact = false }) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const comments = record.overtimeComments || [];
  // Show initial reason as first message if present and no comments yet
  const allMessages = (record.overtimeReason && comments.length === 0)
    ? [{ id: "initial", authorId: record.employeeId, authorName: record.employeeName, authorRole: "employee", body: record.overtimeReason, at: record.updatedAt || record.createdAt }]
    : comments;

  const handleSend = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    const comment = {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      authorId: currentUser.id,
      authorName: currentUser.name || currentUser.firstName || "User",
      authorRole: isEmployee ? "employee" : "manager",
      body: text,
      at: new Date().toISOString(),
    };
    setBody("");
    try { await onAddComment(record.id, comment); }
    finally { setSending(false); }
  };

  const decided = record.overtimeApproved || (record.overtimeApproved === false && record.overtimeRejectedReason);
  const fmtAt = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="space-y-2">
      {allMessages.length > 0 && (
        <div className={`space-y-2 ${compact ? "max-h-48" : "max-h-64"} overflow-y-auto pr-1`}>
          {allMessages.map(c => {
            const isMine = c.authorId === currentUser.id;
            const isFromManager = c.authorRole === "manager";
            return (
              <div key={c.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                  isMine
                    ? "bg-indigo-600 text-white"
                    : isFromManager
                      ? "bg-amber-950/20 border border-amber-500/30 text-amber-100"
                      : "bg-slate-800 text-slate-200"
                }`}>
                  <div className="text-xs font-semibold mb-0.5 opacity-80">
                    {c.authorName}{isFromManager && !isMine ? " · Manager" : ""}
                  </div>
                  <div className="text-xs whitespace-pre-wrap break-words">{c.body}</div>
                  <div className="text-xs opacity-60 mt-1">{fmtAt(c.at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!decided && (
        <div className="flex gap-2">
          <input
            value={body} onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={isEmployee ? "Reply to your manager…" : "Reply to employee…"}
            className={`flex-1 ${inputCls} text-xs`}
            disabled={sending}
          />
          <button onClick={handleSend} disabled={!body.trim() || sending}
            className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold transition-colors flex-shrink-0">
            {sending ? "…" : "Send"}
          </button>
        </div>
      )}
      {decided && (
        <div className="text-xs text-slate-500 italic text-center py-1">
          {record.overtimeApproved ? "Conversation closed — overtime approved" : "Conversation closed — overtime not approved"}
        </div>
      )}
    </div>
  );
}

function AddManualHoursModal({ brands, opsTeam, currentUser, onSave, onClose }) {
  const vb = brands.filter(b => isHqOrAbove(currentUser.role) || currentUser.brandIds.includes(b.id));
  const [brandId,   setBrandId]   = useState(vb[0]?.id || "");
  const [empId,     setEmpId]     = useState("");
  const [date,      setDate]      = useState("");
  const [punchIn,   setPunchIn]   = useState("08:00");
  const [punchOut,  setPunchOut]  = useState("16:00");
  const [notes,     setNotes]     = useState("Manual entry by manager");

  const members = opsTeam.filter(m => m.brandId === brandId);
  const member  = opsTeam.find(m => m.id === empId);
  const hoursWorked = punchIn && punchOut ? Math.round(((new Date("2000-01-01T"+punchOut)-new Date("2000-01-01T"+punchIn))/3600000)*100)/100 : null;

  const handleSave = () => {
    if (!empId || !date) return;
    const dateBase = date + "T";
    const grossPay = hoursWorked && member?.hourlyRate ? Math.round(hoursWorked*member.hourlyRate*100)/100 : null;
    onSave({
      id: `pr-${Date.now()}`, brandId,
      employeeId: empId, employeeName: `${member.firstName} ${member.lastName}`.trim(),
      date, punchIn: new Date(dateBase+punchIn+":00").toISOString(),
      punchOut: new Date(dateBase+punchOut+":00").toISOString(),
      hoursWorked, hourlyRate: member?.hourlyRate || 0, grossPay,
      notes, status: "amended", approved: true, approvedBy: currentUser.name,
      amendedBy: currentUser.name,
    });
    onClose();
  };

  return (
    <Modal title="Add Manual Hours" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-700 text-sm font-semibold hover:bg-slate-700">Cancel</button>
        <button onClick={handleSave} disabled={!empId||!date} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-40">Add Entry</button>
      </>}>
      <div className="space-y-4">
        {vb.length > 1 && <div><label className={labelCls}>Location</label><LocationDropdown brands={vb} value={brandId} onChange={v=>{setBrandId(v);setEmpId("");}} className="w-full"/></div>}
        <div><label className={labelCls}>Employee *</label>
          <SelectDropdown value={empId} onChange={setEmpId} className="w-full">
            <option value="">— Select —</option>
            {members.map(m=><option key={m.id} value={m.id}>{m.firstName} {m.lastName} · {m.role}</option>)}
          </SelectDropdown>
        </div>
        <AvailDateField label="Date *" value={date} onChange={setDate} placeholder="Select date"/>
        <div className="grid grid-cols-2 gap-3">
          <AvailTimeField label="Clock In"  value={punchIn}  onChange={setPunchIn}/>
          <AvailTimeField label="Clock Out" value={punchOut} onChange={setPunchOut}/>
        </div>
        {hoursWorked !== null && (
          <div className="text-xs text-slate-600 px-1">
            Hours: <span className="text-white font-bold">{hoursWorked.toFixed(2)}h</span>
            {member?.hourlyRate > 0 && <span className="ml-3">Pay: <span className="text-emerald-400 font-bold">£{(hoursWorked*member.hourlyRate).toFixed(2)}</span></span>}
          </div>
        )}
        <div><label className={labelCls}>Notes</label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`}/>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMPLOYEE HOURS VIEW — own records + overtime reason submission
// ═══════════════════════════════════════════════════════════════════════════════
function EmployeeHoursView({ currentUser, brands, schedules, punchRecords, onUpdate, onAddComment }) {
  const myId      = currentUser.opsTeamMemberId || currentUser.id;
  const myBrandId = currentUser.brandIds[0];

  const toLocalDate = (d) => {
    const dt = d || new Date();
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
  };
  const getWeekBounds = (offset = 0) => {
    const today = new Date(); today.setHours(0,0,0,0);
    const day = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const mon = new Date(today); mon.setDate(today.getDate() - day + offset * 7);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: toLocalDate(mon), to: toLocalDate(sun) };
  };
  const fmtDur = (hrs) => {
    if (!hrs || hrs <= 0) return "—";
    const h = Math.floor(hrs), m = Math.round((hrs - h) * 60);
    return `${h}h ${String(m).padStart(2,"0")}m`;
  };

  const [weekOffset,    setWeekOffset]   = useState(0);
  const [reasonInputs,  setReasonInputs] = useState({});
  const [expanded,      setExpanded]     = useState(new Set());
  const toggleExpanded  = (id) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const { from, to } = getWeekBounds(weekOffset);

  const myRecords = punchRecords.filter(r =>
    (r.employeeId === myId || r.employeeId === currentUser.id) &&
    r.brandId === myBrandId && r.date >= from && r.date <= to
  ).sort((a,b) => new Date(b.punchIn) - new Date(a.punchIn));

  const enriched = myRecords.map(r => {
    const sched = schedules.find(s =>
      s.brandId === r.brandId && s.employeeId === myId && s.date === r.date && s.published
    );
    const scheduledStart = r.scheduledStart || sched?.startTime || null;
    const scheduledEnd   = r.scheduledEnd   || sched?.endTime   || null;
    // Overtime = max of (actual hours - scheduled hours) OR (hours worked outside scheduled window)
    // This catches both "stayed late" AND "came in completely outside scheduled time"
    let overtimeHrs = 0;
    if (r.punchIn && r.punchOut && scheduledStart && scheduledEnd) {
      const actualMs = new Date(r.punchOut) - new Date(r.punchIn);
      const actualHours = actualMs / 3600000;
      const ss = new Date(r.date+"T"+scheduledStart+":00");
      const se = new Date(r.date+"T"+scheduledEnd  +":00");
      const schedHours = se <= ss ? (se-ss+86400000)/3600000 : (se-ss)/3600000;
      const overByTotal = Math.max(0, actualHours - schedHours);
      // Out-of-window: time worked outside the scheduled window
      const pIn = new Date(r.punchIn).getTime();
      const pOut = new Date(r.punchOut).getTime();
      let ssMs = ss.getTime(), seMs = se.getTime();
      if (seMs <= ssMs) seMs += 86400000;
      const overlapStart = Math.max(pIn, ssMs);
      const overlapEnd   = Math.min(pOut, seMs);
      const overlapMs    = Math.max(0, overlapEnd - overlapStart);
      const outOfWindow = Math.max(0, (actualMs - overlapMs) / 3600000);
      overtimeHrs = Math.round(Math.max(overByTotal, outOfWindow) * 100) / 100;
    }
    const isUnscheduled = !sched && !r.scheduledStart;
    return { ...r, scheduledStart, scheduledEnd, sched, overtimeHrs, isUnscheduled };
  });

  const totalHours = enriched.reduce((a,r) => a + (r.hoursWorked||0), 0);
  const approvedOT = enriched.filter(r => r.overtimeApproved).reduce((a,r) => a + (r.overtimeHrs||0), 0);
  const brand = brands.find(b => b.id === myBrandId);

  const handleSubmitReason = (r) => {
    const reason = (reasonInputs[r.id] || "").trim();
    if (!reason) return;
    onUpdate({ ...r, overtimeReason: reason, updatedAt: new Date().toISOString() });
    setReasonInputs(prev => ({ ...prev, [r.id]: "" }));
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-white">My Hours</h2>
          {brand && <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{background:brand.color}}/>{brand.name}</div>}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-600">{fmtDur(totalHours)} this week</span>
          {approvedOT > 0 && <span className="text-amber-400 font-semibold">+ {fmtDur(approvedOT)} approved OT</span>}
        </div>
      </div>

      {/* Week nav */}
      <div className="flex items-center justify-between">
        <button onClick={()=>setWeekOffset(w=>w-1)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"><ChevronLeft size={16}/></button>
        <div className="text-sm font-semibold text-white">
          {new Date(from+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"})} – {new Date(to+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}
          {weekOffset === 0 && <span className="ml-2 text-xs text-indigo-400">This week</span>}
        </div>
        <button onClick={()=>setWeekOffset(w=>w+1)} disabled={weekOffset>=0} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"><ChevronRight size={16}/></button>
      </div>

      {enriched.length === 0 && (
        <EmptyState icon={Clock} title="No hours this week"
          message="Once you clock in at the kiosk, your shifts will appear here. You'll also be prompted to give a reason for any overtime or unscheduled shifts."/>
      )}

      <div className="space-y-3">
        {enriched.map(r => {
          const hasOT       = r.overtimeHrs > 0;
          const needsReason = (hasOT || r.isUnscheduled) && !r.overtimeReason;
          const awaitingApproval = (hasOT || r.isUnscheduled) && r.overtimeReason && !r.overtimeApproved && !r.overtimeRejectedReason;
          const rejected    = r.overtimeApproved === false && !!r.overtimeRejectedReason;
          // Needs attention from employee:
          //   - needsReason (haven't given one yet)
          //   - awaitingApproval (in active conversation — they may want to add a follow-up)
          //   - currently clocked in
          // Settled (collapsible):
          //   - rejected (decided, employee can't change it)
          //   - approved OT (decided positively)
          //   - normal record with no OT
          const needsAttention = needsReason || awaitingApproval || r.status === "open";
          const isExpanded = expanded.has(r.id);

          // ── Collapsed view ──
          if (!needsAttention && !isExpanded) {
            return (
              <div key={r.id}
                onClick={()=>toggleExpanded(r.id)}
                className="flex items-center justify-between gap-3 bg-slate-900/40 border border-slate-800/60 rounded-xl px-4 py-2.5 hover:bg-slate-900 cursor-pointer transition-colors">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-600 w-20 flex-shrink-0">
                    {new Date(r.date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}
                  </div>
                  <div className="text-sm font-bold text-white tabular-nums flex-shrink-0">{fmtDur(r.hoursWorked)}</div>
                  {hasOT && r.overtimeApproved && <span className="text-xs text-emerald-400 font-semibold">+ OT approved</span>}
                  {rejected && <span className="text-xs text-slate-500 font-semibold">OT not approved</span>}
                </div>
                {r.approved && !rejected && <span className="text-xs text-emerald-400 font-semibold flex-shrink-0">✓</span>}
                {!r.approved && <span className="text-xs text-amber-400 font-semibold flex-shrink-0">Pending</span>}
                <ChevronDown size={14} className="text-slate-600 flex-shrink-0"/>
              </div>
            );
          }

          // ── Expanded mode ──
          return (
            <div key={r.id} className={`rounded-2xl border p-4 space-y-3 ${
              needsReason   ? "bg-red-950/20 border-red-500/30" :
              rejected      ? "bg-slate-900 border-slate-700" :
              awaitingApproval ? "bg-amber-950/20 border-amber-500/30" :
              "bg-slate-900 border-slate-700"
            }`}>
              {/* Date + status */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm font-bold text-white">
                  {new Date(r.date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"short"})}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {r.approved && !hasOT && <Badge label="✓ Approved" color="emerald"/>}
                  {!r.approved && r.status === "closed" && !hasOT && <Badge label="Pending approval" color="amber"/>}
                  {r.status === "open" && <Badge label="Clocked in" color="amber"/>}
                  {!needsAttention && isExpanded && (
                    <button onClick={()=>toggleExpanded(r.id)} className="p-1 rounded-lg bg-slate-950 text-slate-400 hover:text-white transition-colors" title="Collapse"><ChevronUp size={13}/></button>
                  )}
                </div>
              </div>

              {/* Hours summary — NO scheduled times shown to employee */}
              <div className="bg-slate-950 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-600">Hours worked</div>
                  <div className="text-lg font-black text-white tabular-nums">{fmtDur(r.hoursWorked)}</div>
                </div>
              </div>

              {/* Overtime / unscheduled — ONLY shown if it exists */}
              {(hasOT || r.isUnscheduled) && (
                <div className={`rounded-xl p-3 border space-y-2 ${
                  r.overtimeApproved ? "bg-emerald-950/20 border-emerald-500/20" :
                  rejected ? "bg-slate-800/40 border-slate-800/60" :
                  needsReason ? "bg-red-950/20 border-red-500/30" :
                  "bg-amber-950/20 border-amber-500/20"
                }`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold ${
                      r.overtimeApproved ? "text-emerald-400" :
                      rejected ? "text-slate-600" :
                      "text-red-400"
                    }`}>
                      ⏱ {r.isUnscheduled ? "Unscheduled shift" : `${r.overtimeHrs.toFixed(2)}h extra time`}
                    </span>
                    {r.overtimeApproved && <Badge label={`✓ Approved`} color="emerald"/>}
                    {awaitingApproval && <Badge label="Awaiting manager approval" color="amber"/>}
                    {rejected && <Badge label="Not approved" color="slate"/>}
                  </div>

                  {r.overtimeApproved && (
                    <div className="text-xs text-emerald-300">This extra time has been approved and will count towards your pay.</div>
                  )}

                  {rejected && (
                    <div className="text-xs text-slate-600">
                      <div className="font-semibold text-slate-700 mb-0.5">Not approved</div>
                      {r.overtimeRejectedReason && <div className="italic">Manager final note: "{r.overtimeRejectedReason}"</div>}
                    </div>
                  )}

                  {/* Initial reason prompt — shown only if no reason yet AND no comments yet */}
                  {needsReason && (r.overtimeComments?.length || 0) === 0 && (
                    <div className="space-y-2">
                      <div className="text-xs text-red-300 font-semibold">
                        {r.isUnscheduled
                          ? "This shift wasn't in your schedule. Please provide a reason so your manager can approve it."
                          : "You worked outside your scheduled hours. Please explain why so your manager can approve the extra time."}
                      </div>
                      <textarea
                        value={reasonInputs[r.id] || ""}
                        onChange={e => setReasonInputs(prev => ({...prev, [r.id]: e.target.value}))}
                        rows={2}
                        placeholder={r.isUnscheduled
                          ? "e.g. Cover for absent colleague, manager asked me to come in…"
                          : "e.g. Helped cover during busy service, manager asked me to stay…"}
                        className={`${inputCls} resize-none text-xs`}
                      />
                      <button
                        onClick={() => handleSubmitReason(r)}
                        disabled={!(reasonInputs[r.id]||"").trim()}
                        className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold transition-colors">
                        Submit Reason
                      </button>
                    </div>
                  )}

                  {/* Conversation thread — once a reason exists OR there are comments */}
                  {(r.overtimeReason || (r.overtimeComments?.length || 0) > 0) && onAddComment && (
                    <OvertimeConversation record={r} currentUser={currentUser} isEmployee={true} onAddComment={onAddComment}/>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}



// ── KioskShell ────────────────────────────────────────────────────────────────
// Per-store kiosk auth flow:
//   1. On first load, check localStorage for a registered storeId.
//   2. If present AND that store still exists AND its kioskPin still matches,
//      the kiosk is registered — show the main numpad.
//   3. If not, show the "Register this kiosk to a store" screen — manager
//      enters store kiosk PIN, we match it against all stores, lock the
//      tablet to whichever store's PIN matched.
//   4. Failed attempts are rate-limited (5 wrong PINs → 5 min lockout).
//   5. Audit trail logs every register / logout / failed attempt.
const KIOSK_STORAGE_KEY = "cb_kiosk_registered_store_id";
const KIOSK_LOCKOUT_KEY = "cb_kiosk_pin_lockout";

function KioskShell() {
  const [opsTeam,      setOpsTeam]      = useState([]);
  const [brands,       setBrands]       = useState([]);
  const [stores,       setStores]       = useState([]);
  const [punchRecords, setPunchRecords] = useState([]);
  const [schedules,    setSchedules]    = useState([]);
  const [ready,        setReady]        = useState(false);
  // Kiosk registration: which store does this tablet currently represent?
  // null = needs to register; set = locked to that store.
  const [registeredStoreId, setRegisteredStoreId] = useState(null);
  const inFlightRef = useRef(new Set()); // employees currently being punched in

  useEffect(() => {
    Promise.all([fetchOpsTeam(), fetchBrands(), fetchStores(), fetchPunchRecords(), fetchSchedules()])
      .then(([team, br, sts, punches, scheds]) => {
        setOpsTeam(team); setBrands(br); setStores(sts);
        setPunchRecords(punches); setSchedules(scheds || []);
        // Hydrate any previously-registered storeId from localStorage,
        // but only if that store still exists. (Store may have been deleted
        // or archived since tablet was last used.)
        try {
          const saved = localStorage.getItem(KIOSK_STORAGE_KEY);
          if (saved && sts.some(s => s.id === saved && !s.archivedAt)) {
            setRegisteredStoreId(saved);
          } else if (saved) {
            // Stale — clear it
            localStorage.removeItem(KIOSK_STORAGE_KEY);
          }
        } catch { /* localStorage might be blocked */ }
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  useEffect(() => {
    const ch = supabase.channel("kiosk:punch_records")
      .on("postgres_changes", { event: "*", schema: "public", table: "punch_records" }, (payload) => {
        const { eventType, new: r, old: oldRow } = payload;
        if (eventType === "DELETE") { setPunchRecords(ps => ps.filter(p => p.id !== oldRow.id)); return; }
        const p = { id: r.id, brandId: r.brand_id, storeId: r.store_id, employeeId: r.employee_id, employeeName: r.employee_name,
          date: r.date, punchIn: r.punch_in, punchOut: r.punch_out,
          hoursWorked: r.hours_worked ? parseFloat(r.hours_worked) : null,
          hourlyRate: r.hourly_rate ? parseFloat(r.hourly_rate) : 0,
          notes: r.notes, status: r.status, approved: r.approved,
          scheduledStart: r.scheduled_start?.slice(0,5) || null,
          scheduledEnd: r.scheduled_end?.slice(0,5) || null,
          createdAt: r.created_at, updatedAt: r.updated_at };
        if (eventType === "INSERT") setPunchRecords(ps => ps.some(x => x.id === p.id) ? ps : [p, ...ps]);
        if (eventType === "UPDATE") setPunchRecords(ps => ps.map(x => x.id === p.id ? p : x));
      }).subscribe();
    const interval = setInterval(() => {
      fetchPunchRecords().then(setPunchRecords).catch(()=>{});
    }, 15000);
    return () => {
      clearInterval(interval);
      supabase.removeChannel(ch);
    };
  }, []);

  // Punch handlers — both stamp the current kiosk's storeId. punch_records.store_id
  // is NOT NULL per Stage 6, so this is required for the INSERT to succeed.
  // (This was the cause of Issue 2 — kiosk had no storeId, INSERT failed silently.)
  const handlePunchIn  = async (record) => {
    if (inFlightRef.current.has(record.employeeId)) return;
    const alreadyOpen = punchRecords.some(p => p.employeeId === record.employeeId && p.date === record.date && p.status === "open");
    if (alreadyOpen) return;
    inFlightRef.current.add(record.employeeId);
    try {
      // Belt-and-braces: caller (KioskApp) should already have set storeId
      // from the kiosk's registered store, but stamp defensively here too.
      const withStore = { ...record, storeId: record.storeId || registeredStoreId };
      if (!withStore.storeId) throw new Error("Kiosk has no registered store — cannot record punch.");
      const saved = await insertPunchIn(withStore);
      setPunchRecords(ps => ps.some(p => p.id === saved.id) ? ps : [saved, ...ps]);
    } catch (err) {
      console.error("PunchIn failed:", err);
      alert(`Clock-in failed: ${err.message || err}`);
    } finally {
      inFlightRef.current.delete(record.employeeId);
    }
  };
  const handlePunchOut = async (id, punchOut, hoursWorked, grossPay) => {
    try {
      const saved = await updatePunchOut(id, punchOut, hoursWorked, grossPay);
      setPunchRecords(ps => ps.map(p => p.id === saved.id ? saved : p));
    } catch (err) {
      console.error("PunchOut failed:", err);
      alert(`Clock-out failed: ${err.message || err}`);
    }
  };

  // Kiosk registration: matches the entered PIN against any store's kioskPin,
  // locks the tablet to that store on success, writes audit entry.
  const handleRegister = async (pin) => {
    const trimmed = (pin || "").trim();
    if (!trimmed) return { ok: false, error: "Enter a PIN." };
    const match = stores.find(s => !s.archivedAt && (s.kioskPin || "").trim() === trimmed);
    if (!match) {
      // Audit the failure for owner visibility
      try {
        await insertAuditEntry({
          id: `at-${Date.now()}`,
          action: "kiosk-pin-failed",
          detail: `Wrong kiosk PIN attempt from tablet (entered ${trimmed.length} digits)`,
          by: "kiosk-device",
          brandId: null,
          storeId: null,
          date: new Date().toISOString().split("T")[0],
          time: new Date().toTimeString().slice(0, 8),
        });
      } catch { /* don't block on audit failure */ }
      return { ok: false, error: "Wrong PIN." };
    }
    // Success — lock the tablet to this store
    try { localStorage.setItem(KIOSK_STORAGE_KEY, match.id); } catch {}
    setRegisteredStoreId(match.id);
    try {
      await insertAuditEntry({
        id: `at-${Date.now()}`,
        action: "kiosk-registered",
        detail: `Kiosk registered at ${match.shortName || match.name}`,
        by: "kiosk-device",
        brandId: match.brandId,
        storeId: match.id,
        date: new Date().toISOString().split("T")[0],
        time: new Date().toTimeString().slice(0, 8),
      });
    } catch { /* don't block on audit failure */ }
    return { ok: true, store: match };
  };

  // Manager logs out the kiosk so it can be re-registered at a different store.
  // We log this too so owner can see in audit trail.
  const handleLogout = async () => {
    const current = stores.find(s => s.id === registeredStoreId);
    try { localStorage.removeItem(KIOSK_STORAGE_KEY); } catch {}
    setRegisteredStoreId(null);
    if (current) {
      try {
        await insertAuditEntry({
          id: `at-${Date.now()}`,
          action: "kiosk-logout",
          detail: `Kiosk unregistered from ${current.shortName || current.name}`,
          by: "kiosk-device",
          brandId: current.brandId,
          storeId: current.id,
          date: new Date().toISOString().split("T")[0],
          time: new Date().toTimeString().slice(0, 8),
        });
      } catch {}
    }
  };

  if (!ready) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f172a",color:"#94a3b8",fontFamily:"sans-serif",gap:16}}>
      <div style={{width:56,height:56,borderRadius:14,background:"#4f46e5",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:900,fontSize:20}}>CB</div>
      <span style={{fontSize:15}}>Loading kiosk…</span>
    </div>
  );

  // Not yet registered → show registration screen.
  if (!registeredStoreId) {
    return <KioskRegister onRegister={handleRegister}/>;
  }

  // Registered → main kiosk. Pass the store + a logout handler so the corner
  // gesture can switch stores when needed.
  const currentStore = stores.find(s => s.id === registeredStoreId);
  return (
    <KioskApp
      opsTeam={opsTeam}
      brands={brands}
      stores={stores}
      currentStore={currentStore}
      punchRecords={punchRecords}
      schedules={schedules}
      onPunchIn={handlePunchIn}
      onPunchOut={handlePunchOut}
      onLogout={handleLogout}
    />
  );
}

// ─── Kiosk Registration Screen ────────────────────────────────────────────────
// Shown when a tablet hasn't been registered to a store yet. Manager enters
// the store's kiosk PIN to claim the tablet. Rate limited: 5 wrong tries
// triggers a 5-minute lockout stored in localStorage (per-device only — not
// real security, just speed-bump for casual misuse).
function KioskRegister({ onRegister }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [now, setNow] = useState(Date.now());

  // Restore any active lockout from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KIOSK_LOCKOUT_KEY);
      if (saved) {
        const until = Number(saved);
        if (until > Date.now()) setLockedUntil(until);
        else localStorage.removeItem(KIOSK_LOCKOUT_KEY);
      }
    } catch {}
  }, []);

  // Tick clock during lockout so countdown updates
  useEffect(() => {
    if (lockedUntil <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const isLocked = lockedUntil > now;
  const lockedSecs = Math.ceil((lockedUntil - now) / 1000);

  const handleDigit = (d) => {
    if (isLocked || success) return;
    setError("");
    if (pin.length < 6) setPin(p => p + d);
  };
  const handleBackspace = () => {
    if (isLocked || success) return;
    setError("");
    setPin(p => p.slice(0, -1));
  };
  const handleSubmit = async () => {
    if (isLocked || success) return;
    if (pin.length < 4) { setError("PIN is at least 4 digits."); return; }
    const result = await onRegister(pin);
    if (result.ok) {
      setSuccess(result.store);
      // Shell takes over from here — render won't matter
    } else {
      setError(result.error || "Wrong PIN.");
      setPin("");
      const next = attempts + 1;
      setAttempts(next);
      if (next >= 5) {
        const until = Date.now() + 5 * 60 * 1000;
        setLockedUntil(until);
        setAttempts(0);
        try { localStorage.setItem(KIOSK_LOCKOUT_KEY, String(until)); } catch {}
      }
    }
  };

  return (
    <div style={{
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      height:"100vh", background:"#0f172a", color:"#e2e8f0", fontFamily:"sans-serif",
      padding:24, gap:20,
    }}>
      <div style={{width:64,height:64,borderRadius:16,background:"#4f46e5",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:900,fontSize:22}}>CB</div>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:22, fontWeight:800, color:"white"}}>Register this kiosk</div>
        <div style={{fontSize:13, color:"#94a3b8", marginTop:6, maxWidth:340}}>
          Enter the store's Kiosk PIN to register this tablet. Once registered, staff at this store will be able to clock in and out here.
        </div>
      </div>

      {isLocked ? (
        <div style={{background:"#7f1d1d40", border:"1px solid #dc262660", borderRadius:14, padding:"14px 22px", color:"#fca5a5", fontWeight:700, fontSize:14, textAlign:"center"}}>
          Too many wrong attempts.<br/>Locked for {Math.floor(lockedSecs/60)}:{String(lockedSecs%60).padStart(2,"0")}
        </div>
      ) : (
        <>
          {/* PIN dots */}
          <div style={{display:"flex", gap:14}}>
            {Array.from({length:Math.max(4, pin.length)}).map((_, i) => (
              <div key={i} style={{
                width:18, height:18, borderRadius:"50%",
                border:"2px solid", borderColor: i<pin.length ? "#6366f1" : "#475569",
                background: i<pin.length ? "#6366f1" : "transparent",
              }}/>
            ))}
          </div>
          {error && <div style={{color:"#f87171", fontSize:13, fontWeight:600}}>{error}</div>}

          {/* Numpad */}
          <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:10, width:240}}>
            {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((key, i) => {
              if (key === "") return <div key={i}/>;
              return (
                <button key={key}
                  onClick={() => key === "⌫" ? handleBackspace() : handleDigit(key)}
                  style={{
                    height:64, fontSize:22, fontWeight:700,
                    background:"#1e293b", color:"white", border:"1px solid #334155",
                    borderRadius:14, cursor:"pointer",
                  }}>{key}</button>
              );
            })}
          </div>

          <button onClick={handleSubmit}
            disabled={pin.length < 4}
            style={{
              padding:"12px 28px", fontSize:14, fontWeight:700,
              background: pin.length < 4 ? "#334155" : "#4f46e5",
              color:"white", border:"none", borderRadius:14,
              cursor: pin.length < 4 ? "not-allowed" : "pointer",
            }}>
            Register tablet
          </button>
        </>
      )}
    </div>
  );
}

const IS_KIOSK = window.location.pathname === "/kiosk" ||
                 window.location.hash === "#kiosk" ||
                 window.location.search.includes("kiosk");

// Public job application form — anyone with the URL can submit. No auth.
// Like kiosk, runs as a separate shell that doesn't load the dashboard JS
// for authenticated users. Detected the same way.
const IS_APPLY = window.location.pathname === "/apply" ||
                 window.location.pathname === "/apply/" ||
                 window.location.hash === "#apply";

// ── ApplyShell — Public Job Application Form ─────────────────────────────────
// Renders at /apply for anonymous users. Optionally pre-locks the store
// via ?store=store-id URL parameter — useful for store-specific job ads
// that should only accept applications for one location.
//
// Fields collected (per slice 2 spec):
//   - firstName, lastName, email, phone (all required)
//   - store (required — pre-locked if URL param present)
//   - position (required, free text)
//   - availability (required, free text)
//   - right to work declaration (required, yes/no — manager verifies later)
//   - tell us about yourself (optional)
//
// Anti-spam:
//   - Honeypot field (hidden, bots fill it, humans don't)
//   - Rate limit via localStorage (1 submission per browser per 5 minutes)
//   - Soft duplicate detection (if email matches existing app in same store
//     in last 30 days, warn user before submission — they can override)
//
// On submit: insert directly into job_applications via the supabase client.
// Source is hard-coded to "public_form" so managers can distinguish from
// manually-captured walk-ins.

const APPLY_RATE_LIMIT_KEY = "cb_apply_last_submit";
const APPLY_RATE_LIMIT_MS  = 5 * 60 * 1000;   // 5 minutes between submissions

function ApplyShell() {
  const [stores,      setStores]      = useState([]);
  const [brands,      setBrands]      = useState([]);
  const [storeRoles,  setStoreRoles]  = useState([]);   // per-store roles, used to populate the position dropdown
  const [existingApps, setExistingApps] = useState([]);  // for duplicate detection
  const [ready,       setReady]       = useState(false);
  const [loadError,   setLoadError]   = useState(null);
  const [submitted,   setSubmitted]   = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Pre-locked store from URL (e.g. /apply?store=store-evington-road)
  const urlParams = new URLSearchParams(window.location.search);
  const lockedStoreId = urlParams.get("store");

  // Form state. `position` is the saved value (whatever ends up in the DB);
  // `positionChoice` is the dropdown selection — either a real role name or
  // the literal "__other__" sentinel which means "show free-text input below".
  const [form, setForm] = useState({
    firstName:         "",
    lastName:          "",
    email:             "",
    phone:             "",
    storeId:           lockedStoreId || "",
    position:          "",
    positionChoice:    "",
    applicantNotes:    "",
    honeypot:          "",   // bots fill this; humans don't
    // ── Slice 3 fields ────────────────────────────────────────────────────
    // Note: availabilityNotes and rtwDeclaration removed from the public form
    // per spec — legal_status now covers RTW context, and we ask candidates
    // about availability in the interview rather than the form. Both fields
    // still exist on the DB schema (nullable) and in the internal modal so
    // managers can capture them for walk-ins if useful.
    dateOfBirth:        "",   // YYYY-MM-DD from <input type="date">
    legalStatus:        "",   // matches a value from LEGAL_STATUS_OPTIONS
    address:            "",
    relevantExperience: "",
    resumeText:         "",
    photoFile:          null, // File object pending upload; replaced with URL on submit
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    // Load stores + brands + roles + existing applications. Anonymous reads
    // are fine since RLS is off and these tables don't contain PII (the
    // existing-apps fetch is the only one that does, but we only use it
    // for email-match duplicate detection — never display it back).
    Promise.all([
      fetchStores(),
      fetchBrands(),
      fetchStoreRoles().catch(() => []),
      fetchApplications().catch(() => []),
    ]).then(([sts, brs, roles, apps]) => {
      setStores(sts || []);
      setBrands(brs || []);
      setStoreRoles(roles || []);
      // Only keep recent applications to limit memory + irrelevant matches
      const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
      setExistingApps((apps || []).filter(a => new Date(a.createdAt).getTime() > cutoff));
      setReady(true);
    }).catch(err => {
      setLoadError(err.message || "Could not load form.");
      setReady(true);
    });
  }, []);

  // Stores the public form can apply to: operational, owned, not archived,
  // and currently flagged as hiring. Managers/HQ toggle is_hiring on each
  // store via the admin StoreEditModal to pause new applications when fully
  // staffed.
  //
  // Note: a manager who pre-locks a store via ?store=X but that store has
  // is_hiring=false will fall through to the "no stores accepting" empty
  // state below — by design, so links to closed stores stop accepting
  // applications immediately.
  const availableStores = useMemo(
    () => (stores || []).filter(s =>
      !s.archivedAt &&
      s.ownershipModel === "owned" &&
      s.isHiring !== false   // accept true OR null (defensive vs schema-cache lag)
    ),
    [stores]
  );

  // If URL pre-locked a store, verify it's a valid choice. If not, fall back to free pick.
  const lockedStore = lockedStoreId && availableStores.find(s => s.id === lockedStoreId);
  const isLocked    = !!lockedStore;

  // Multi-brand prefix in dropdown
  const showBrandPrefix = new Set(availableStores.map(s => s.brandId)).size > 1;

  // Roles available for the currently-selected store, filtered to those
  // explicitly flagged for hiring. This is the public form — we deliberately
  // don't expose every operational role (someone in scheduling shouldn't
  // unintentionally show up as a vacancy). HQ/managers toggle the
  // advertise_for_hiring checkbox in Ops Setup → Structure to control what's
  // open for applications.
  const availableRoles = useMemo(
    () => (storeRoles || []).filter(r =>
      r.storeId === form.storeId &&
      !r.archivedAt &&
      r.advertiseForHiring === true
    ),
    [storeRoles, form.storeId]
  );
  // Whether to render the position field as a dropdown vs an empty state.
  // Slice 3: per spec, there's no "Other (specify)" fallback — if no role
  // is advertised for this store, candidate cannot apply for an arbitrary
  // position. They'd see an empty-state message and pick a different store.
  const useRoleDropdown = !!form.storeId && availableRoles.length > 0;

  // When the user changes store, their previously-chosen role no longer makes
  // sense (it belonged to a different store). Reset the position choice so
  // they pick again. Cheap to do reactively rather than threading through
  // every store-change handler.
  useEffect(() => {
    setForm(f => ({ ...f, positionChoice: "", position: f.positionChoice === "__other__" ? f.position : "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.storeId]);

  // Validate form. All slice 3 fields are required for public submissions per
  // product spec; the only optional field on the public form is the existing
  // free-form "tell us about yourself" applicantNotes.
  const validate = () => {
    if (!form.firstName.trim())          return "Please enter your first name.";
    if (!form.lastName.trim())           return "Please enter your last name.";
    if (!form.email.trim())              return "Please enter your email address.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "That doesn't look like a valid email address.";
    if (!form.phone.trim())              return "Please enter your phone number.";
    if (!form.dateOfBirth)               return "Please enter your date of birth.";
    // Sanity-check DOB — reject anything ridiculous (after today, before 1900)
    const dobDate = new Date(form.dateOfBirth);
    if (isNaN(dobDate.getTime()))        return "That doesn't look like a valid date.";
    if (dobDate > new Date())            return "Date of birth can't be in the future.";
    if (dobDate.getFullYear() < 1900)    return "Please check your date of birth.";
    if (!form.legalStatus)               return "Please select your legal status.";
    if (!form.address.trim())            return "Please enter your address.";
    if (!form.storeId)                   return "Please pick a store you'd like to work at.";
    if (!form.position.trim())           return "Please pick a position to apply for.";
    if (!form.relevantExperience.trim()) return "Please share any relevant experience.";
    if (!form.resumeText.trim())         return "Please paste your CV / resume into the box.";
    if (!form.photoFile)                 return "Please upload a photo.";
    return null;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setSubmitError(null);

    // Honeypot — if bot filled this hidden field, silently "succeed" without inserting
    if (form.honeypot) {
      console.warn("Honeypot triggered — likely bot submission.");
      setSubmitted(true);   // show success page anyway so bot thinks it worked
      return;
    }

    // Rate limit (per browser)
    try {
      const last = Number(localStorage.getItem(APPLY_RATE_LIMIT_KEY) || 0);
      if (last && Date.now() - last < APPLY_RATE_LIMIT_MS) {
        const waitSec = Math.ceil((APPLY_RATE_LIMIT_MS - (Date.now() - last)) / 1000);
        setSubmitError(`Please wait ${Math.ceil(waitSec/60)} minute(s) before submitting another application.`);
        return;
      }
    } catch { /* localStorage blocked — proceed */ }

    const validationError = validate();
    if (validationError) { setSubmitError(validationError); return; }

    // Soft duplicate detection — warn user, let them proceed if they confirm
    const emailLower = form.email.trim().toLowerCase();
    const dupe = existingApps.find(a =>
      (a.email || "").toLowerCase() === emailLower &&
      a.storeId === form.storeId &&
      !["rejected", "withdrawn"].includes(a.status)
    );
    if (dupe) {
      const proceed = window.confirm(
        "It looks like you've already applied to this store recently. Submitting again will create a new application. Continue?"
      );
      if (!proceed) return;
    }

    // Build & insert. We upload the photo FIRST so that if anything goes
    // wrong with photo upload, we haven't inserted a half-broken application
    // record that needs cleaning up. If photo upload succeeds but DB insert
    // fails, we have a stray photo in storage — a minor cost (manually
    // cleanable from Supabase Studio) compared to having a DB row pointing
    // at a non-existent image.
    const store = availableStores.find(s => s.id === form.storeId);
    setSubmitting(true);
    try {
      let photoUrl = null;
      let photoPath = null;
      if (form.photoFile) {
        const { url, path } = await uploadApplicantPhoto(form.photoFile);
        photoUrl  = url;
        photoPath = path;
      }

      const applicationId = `app-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      const candidateEmail = form.email.trim();

      await insertApplication({
        id:                  applicationId,
        brandId:             store?.brandId,
        storeId:             form.storeId,
        firstName:           form.firstName.trim(),
        lastName:            form.lastName.trim(),
        email:               candidateEmail,
        phone:               form.phone.trim(),
        position:            form.position.trim(),
        // availabilityNotes intentionally omitted — public form no longer
        // asks for it; managers capture availability in the interview.
        applicantNotes:      form.applicantNotes.trim(),
        source:              "public_form",
        status:              "applied",
        // rtwVerified stays false at submission — manager confirms after seeing
        // documents. We get RTW signal from legal_status now instead of a
        // separate yes/no question.
        rtwVerified:         false,
        createdBy:           null,    // anonymous submission
        // Slice 3 fields
        dateOfBirth:         form.dateOfBirth,
        legalStatus:         form.legalStatus,
        address:             form.address.trim(),
        relevantExperience:  form.relevantExperience.trim(),
        resumeText:          form.resumeText.trim(),
        photoUrl:            photoUrl,
        photoPath:           photoPath,
        isMinor:             isUnder18(form.dateOfBirth),
      });

      // Slice 4: fire-and-forget magic link send. Deliberately NOT awaited —
      // candidate sees the "thanks" screen immediately regardless of email
      // outcome. If the send fails (rate limit, network), manager will see
      // a "email pending" flag in the dashboard and can follow up manually.
      // ⚠ DISABLED: Auto-send magic link on /apply submission.
      //
      // This was originally part of slice 4 (candidate portal). When the
      // candidate portal RLS was rolled back, the /candidate route was
      // removed, but this send code stayed. The result: every public_form
      // application sends an email whose link leads to a 404 (or worse,
      // ERR_CONNECTION_REFUSED if the link was generated from localhost dev).
      //
      // Keep the manager-side retry button (it's harmless — same dead link,
      // but at least it's an explicit choice). Auto-sending on every form
      // submission was creating broken experiences for real candidates.
      //
      // Re-enable when the candidate portal is built (slice 4 properly).
      //
      // Application is still saved with email_link_status='pending' (the
      // DB default). When the portal exists, we can backfill links for
      // any pending applications.
      //
      // (async () => {
      //   try {
      //     const result = await sendCandidateMagicLink(candidateEmail);
      //     await setApplicationEmailStatus(
      //       applicationId,
      //       result.ok ? "sent" : "failed",
      //       result.ok ? null : result.error,
      //     );
      //   } catch (err) {
      //     console.warn("Magic link send error (non-blocking):", err);
      //   }
      // })();

      try { localStorage.setItem(APPLY_RATE_LIMIT_KEY, String(Date.now())); } catch {}
      setSubmitted(true);
    } catch (err) {
      console.error("Application submit failed:", err);
      setSubmitError(err?.message
        ? `Something went wrong: ${err.message}`
        : "Something went wrong saving your application. Please try again, or contact the store directly if the problem continues."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render: loading ────────────────────────────────────────────────────────
  if (!ready) {
    return (
      <div style={applyContainerStyle}>
        <div style={{ color: "#94a3b8", fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  // ─── Render: load error (DB unreachable) ────────────────────────────────────
  if (loadError) {
    return (
      <div style={applyContainerStyle}>
        <ApplyCard>
          <h1 style={applyHeadingStyle}>Application form unavailable</h1>
          <p style={applyTextStyle}>
            We couldn't load the form right now. Please try again later, or contact the store directly.
          </p>
          <code style={{ fontSize: 11, color: "#64748b", marginTop: 12, display: "block" }}>{loadError}</code>
        </ApplyCard>
      </div>
    );
  }

  // ─── Render: success state ──────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={applyContainerStyle}>
        <ApplyCard>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <h1 style={applyHeadingStyle}>Thanks, {form.firstName}!</h1>
          <p style={applyTextStyle}>
            We've received your application. The store team will be in touch soon — usually within a few days.
          </p>
          <p style={{ ...applyTextStyle, fontSize: 13, color: "#64748b", marginTop: 20 }}>
            Please keep an eye on your email ({form.email}) and phone for our response.
          </p>
        </ApplyCard>
      </div>
    );
  }

  // ─── Render: no operational stores ──────────────────────────────────────────
  if (availableStores.length === 0) {
    return (
      <div style={applyContainerStyle}>
        <ApplyCard>
          <h1 style={applyHeadingStyle}>Not accepting applications right now</h1>
          <p style={applyTextStyle}>
            We're not accepting new applications at this time. Please check back later.
          </p>
        </ApplyCard>
      </div>
    );
  }

  // ─── Render: form ───────────────────────────────────────────────────────────
  return (
    <div style={applyContainerStyle}>
      <ApplyCard wide>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#4f46e5", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: 14 }}>CB</div>
            <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>Job Application</span>
          </div>
          <h1 style={applyHeadingStyle}>Join the team</h1>
          <p style={applyTextStyle}>
            {isLocked
              ? <>Applying to <strong style={{ color: "white" }}>{lockedStore.shortName || lockedStore.name}</strong>. Fill in the form below and we'll be in touch.</>
              : "Fill in the form below and we'll be in touch. All fields marked * are required."
            }
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Honeypot — hidden via CSS, bots fill it, humans don't */}
          <input
            type="text"
            name="website"
            value={form.honeypot}
            onChange={e => set("honeypot", e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
            aria-hidden="true"
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <ApplyField label="First name *">
              <input style={applyInputStyle} value={form.firstName} onChange={e => set("firstName", e.target.value)} maxLength={50}/>
            </ApplyField>
            <ApplyField label="Last name *">
              <input style={applyInputStyle} value={form.lastName} onChange={e => set("lastName", e.target.value)} maxLength={50}/>
            </ApplyField>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <ApplyField label="Email *">
              <input style={applyInputStyle} type="email" value={form.email} onChange={e => set("email", e.target.value)} maxLength={100} autoComplete="email"/>
            </ApplyField>
            <ApplyField label="Phone *">
              <input style={applyInputStyle} type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} maxLength={20} autoComplete="tel"/>
            </ApplyField>
          </div>

          <ApplyField label="Which store would you like to work at? *">
            {isLocked ? (
              <input style={{ ...applyInputStyle, color: "#94a3b8", cursor: "not-allowed" }} value={lockedStore.shortName || lockedStore.name} disabled/>
            ) : (
              <select style={applyInputStyle} value={form.storeId} onChange={e => set("storeId", e.target.value)}>
                <option value="">— Choose a store —</option>
                {availableStores.map(s => {
                  const b = brands.find(br => br.id === s.brandId);
                  return <option key={s.id} value={s.id}>{showBrandPrefix && b ? `${b.name} · ` : ""}{s.shortName || s.name}</option>;
                })}
              </select>
            )}
          </ApplyField>

          <ApplyField
            label="Position you're applying for *"
            hint={useRoleDropdown
              ? "Pick the role you'd like to apply for."
              : "No open positions at this store right now. Try another store."
            }
          >
            {useRoleDropdown ? (
              <select
                style={applyInputStyle}
                value={form.positionChoice}
                onChange={e => {
                  // Slice 3: positionChoice and position always mirror — no
                  // "Other" fallback. Candidate can only apply for advertised
                  // roles. If their role isn't listed, they pick a different
                  // store or wait until it's advertised.
                  const v = e.target.value;
                  setForm(f => ({ ...f, positionChoice: v, position: v }));
                }}
              >
                <option value="">— Choose a position —</option>
                {availableRoles.map(r => (
                  <option key={r.id} value={r.name}>{r.name}</option>
                ))}
              </select>
            ) : (
              <div style={{
                padding: "12px 14px", borderRadius: 10,
                background: "#1e293b", border: "1px solid #334155",
                color: "#94a3b8", fontSize: 13,
              }}>
                {form.storeId
                  ? "No open positions at this store right now. Please pick a different store."
                  : "Pick a store first to see available positions."
                }
              </div>
            )}
          </ApplyField>

          <ApplyField label="Date of birth *" hint="Click anywhere on the field to open the date picker.">
            <input
              style={{ ...applyInputStyle, cursor: "pointer" }}
              type="date"
              value={form.dateOfBirth}
              onChange={e => set("dateOfBirth", e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              // Click anywhere on the input opens the native picker (Chrome /
              // Edge / Firefox 119+). Older browsers fall back to the default
              // calendar-icon-only behaviour. showPicker may throw if it
              // doesn't have user-activation context, so guard with ?.()
              onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
              onFocus={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
            />
            {form.dateOfBirth && isUnder18(form.dateOfBirth) && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#fbbf24" }}>
                Note: applicants under 18 have legally restricted working hours.
                Manager will discuss this with you.
              </div>
            )}
          </ApplyField>

          <ApplyField label="Legal status in the UK *" hint="Choose the option that best describes your current immigration status.">
            <select
              style={applyInputStyle}
              value={form.legalStatus}
              onChange={e => set("legalStatus", e.target.value)}
            >
              <option value="">— Choose your status —</option>
              {LEGAL_STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </ApplyField>

          <ApplyField label="Your address *" hint="Street, town, postcode — all on one line is fine.">
            <input
              style={applyInputStyle}
              value={form.address}
              onChange={e => set("address", e.target.value)}
              maxLength={200}
              placeholder="e.g. 12 Main Street, Leicester, LE5 6DN"
            />
          </ApplyField>

          <ApplyField label="Relevant experience *" hint="Briefly tell us about your hospitality / customer service experience.">
            <textarea
              style={{ ...applyInputStyle, minHeight: 100, resize: "vertical" }}
              value={form.relevantExperience}
              onChange={e => set("relevantExperience", e.target.value)}
              maxLength={2000}
              placeholder="e.g. 2 years as a barista at X, 1 year waiting tables at Y…"
            />
          </ApplyField>

          <ApplyField label="Paste your CV / resume *" hint="Plain text only. Paste from a Word doc or notepad.">
            <textarea
              style={{ ...applyInputStyle, minHeight: 180, resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 12 }}
              value={form.resumeText}
              onChange={e => set("resumeText", e.target.value)}
              maxLength={20000}
              placeholder="Education, work history, skills, references…"
            />
          </ApplyField>

          <ApplyField label="Upload a photo *" hint="Headshot or clear photo of yourself. Max 5 MB. JPG, PNG, or WEBP.">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={e => {
                const f = e.target.files?.[0];
                if (!f) { set("photoFile", null); return; }
                if (f.size > 5 * 1024 * 1024) {
                  setSubmitError(`Photo is too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`);
                  e.target.value = "";   // reset the input so they can re-pick
                  return;
                }
                setSubmitError(null);
                set("photoFile", f);
              }}
              style={{ ...applyInputStyle, padding: "8px 10px", color: "#94a3b8" }}
            />
            {form.photoFile && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                {/* Live preview using object URL — revoked when form unmounts naturally */}
                <img
                  src={URL.createObjectURL(form.photoFile)}
                  alt="Preview"
                  style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid #334155" }}
                />
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  {form.photoFile.name} · {(form.photoFile.size / 1024).toFixed(0)} KB
                </div>
              </div>
            )}
          </ApplyField>

          <ApplyField label="Anything else you'd like to share?" hint="Optional — anything that doesn't fit elsewhere.">
            <textarea style={{ ...applyInputStyle, minHeight: 70, resize: "vertical" }} value={form.applicantNotes} onChange={e => set("applicantNotes", e.target.value)} maxLength={1000}/>
          </ApplyField>

          {submitError && (
            <div style={{ background: "#7f1d1d40", border: "1px solid #dc262660", color: "#fca5a5", padding: "10px 14px", borderRadius: 10, fontSize: 13 }}>
              {submitError}
            </div>
          )}

          <button type="submit" disabled={submitting} style={{
            marginTop: 8, padding: "14px 20px", borderRadius: 12,
            background: submitting ? "#334155" : "#4f46e5", color: "white",
            border: "none", fontSize: 15, fontWeight: 700,
            cursor: submitting ? "not-allowed" : "pointer",
            transition: "background 0.15s",
          }}>
            {submitting ? "Submitting…" : "Submit application"}
          </button>

          <p style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginTop: 4 }}>
            By submitting, you agree to us storing your information for recruitment purposes.
          </p>
        </form>
      </ApplyCard>
    </div>
  );
}

// ─── ApplyShell helper components (inline styles to avoid Tailwind dependency) ─
// The apply page uses inline styles instead of Tailwind classes because it
// runs as a separate shell and we want it self-contained — if someone screws
// up Tailwind purging later, this page should still look correct.

const applyContainerStyle = {
  minHeight: "100vh",
  background: "#0f172a",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
};

const applyHeadingStyle = {
  color: "white",
  fontSize: 24,
  fontWeight: 800,
  margin: 0,
  marginBottom: 8,
};

const applyTextStyle = {
  color: "#94a3b8",
  fontSize: 14,
  lineHeight: 1.5,
  margin: 0,
};

const applyInputStyle = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#0f172a",
  border: "1px solid #334155",
  color: "white",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

function ApplyCard({ children, wide }) {
  return (
    <div style={{
      background: "#1e293b",
      border: "1px solid #334155",
      borderRadius: 16,
      padding: 32,
      maxWidth: wide ? 560 : 440,
      width: "100%",
      boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
    }}>
      {children}
    </div>
  );
}

function ApplyField({ label, hint, children }) {
  return (
    <div>
      <label style={{ display: "block", color: "#cbd5e1", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ color: "#64748b", fontSize: 11, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

// ── Sidebar Component ─────────────────────────────────────────────────────────
function Sidebar({ navGroups, activeView, setActiveView, currentUser, onLogout, collapsed, setCollapsed,
                    actualUser = null, users = [], onImpersonate = null, isImpersonating = false }) {
  // Only an actual owner gets the view-as picker. Impersonated views never show it
  // (avoid the "view as X → view as Y" rabbit hole).
  const canImpersonate = actualUser?.role === "owner" && onImpersonate;
  const impersonationTargets = canImpersonate
    ? users.filter(u => u.id !== actualUser.id).sort((a, b) => {
        const order = { hq_staff: 0, manager: 1, staff: 2, owner: 3 };
        return (order[a.role] ?? 9) - (order[b.role] ?? 9) || (a.name || "").localeCompare(b.name || "");
      })
    : [];

  return (
    <div className={`flex flex-col h-full bg-slate-950 border-r border-slate-800/60 transition-all duration-300 ${collapsed ? "w-16" : "w-56"}`}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800/60">
        <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <BarChart2 size={16} className="text-white"/>
        </div>
        {!collapsed && <div><div className="text-sm font-black text-white">Create Brands</div><div className="text-xs text-slate-500">Hospitality Group</div></div>}
        <button onClick={() => setCollapsed(c => !c)} className="ml-auto text-slate-600 hover:text-slate-700 p-1 rounded-lg">
          {collapsed ? <ChevronRight size={14}/> : <ChevronLeft size={14}/>}
        </button>
      </div>
      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
        {navGroups.map(g => (
          <div key={g.group}>
            {!collapsed && <div className="text-xs font-bold text-slate-600 uppercase tracking-widest px-2 pt-3 pb-1">{g.group}</div>}
            {g.items.map(n => {
              const NIcon = n.icon;
              const active = activeView === n.key;
              return (
                <button key={n.key} onClick={() => setActiveView(n.key)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold transition-all ${active ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
                  <NIcon size={15} className="flex-shrink-0"/>
                  {!collapsed && <span className="flex-1 text-left truncate">{n.label}</span>}
                  {!collapsed && n.badge && <span className="text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none font-bold">{n.badge}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* View-as picker (owner only, expanded sidebar only) */}
      {canImpersonate && !collapsed && (
        <div className="border-t border-slate-800/60 px-3 py-2">
          <label className="block text-[10px] uppercase tracking-widest text-slate-600 font-semibold mb-1">View as</label>
          <select
            value={isImpersonating ? currentUser.id : ""}
            onChange={e => onImpersonate(e.target.value || null)}
            className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="">— Myself (owner) —</option>
            {impersonationTargets.map(u => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.role === "hq_staff" ? "HQ" : u.role}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* User */}
      <div className="border-t border-slate-800/60 p-3">
        <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
          <div className="w-7 h-7 rounded-lg bg-indigo-600/20 flex items-center justify-center text-xs font-bold text-indigo-400 flex-shrink-0">{currentUser.avatar || currentUser.name?.[0] || "?"}</div>
          {!collapsed && <div className="flex-1 min-w-0"><div className="text-xs font-semibold text-white truncate">{currentUser.name}</div><div className="text-xs text-indigo-400 font-semibold uppercase">{currentUser.role}</div></div>}
          {!collapsed && <button onClick={onLogout} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-950/20"><LogOut size={14}/></button>}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // actualUser = who really logged in (persisted to localStorage).
  // impersonatedUserId = if set, owner is viewing the app AS another user.
  // currentUser (consumed by every view below) is the *effective* user —
  //   either actualUser, or the impersonated user object if owner is "viewing as".
  // Only an actual owner can impersonate. Impersonation is client-side only:
  //   Supabase queries still run as the actual user, so RLS isn't bypassed —
  //   this is a UI preview, not a real auth swap.
  const [actualUser, setActualUser] = useState(() => {
    try { const s = localStorage.getItem("cb_session"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [impersonatedUserId, setImpersonatedUserId] = useState(() => {
    try { return localStorage.getItem("cb_impersonate") || null; } catch { return null; }
  });
  const [loginMode, setLoginMode] = useState("employee");

  const [brands,         setBrands]         = useState([]);
  const [users,          setUsers]          = useState([]);
  const [entries,        setEntries]        = useState([]);
  const [issues,         setIssues]         = useState([]);
  const [dbReady,        setDbReady]        = useState(false);
  const [dbError,        setDbError]        = useState(null);
  const [checklists,      setChecklists]     = useState([]);
  const [tempUnits,       setTempUnits]      = useState([]);
  const [cleaningTasks,   setCleaningTasks]  = useState([]);
  const [assignments,     setAssignments]    = useState([]);
  const [opsTeam,         setOpsTeam]        = useState([]);
  const [tempLogs,        setTempLogs]       = useState([]);
  const [deliveries,      setDeliveries]     = useState([]);
  const [checklistStates, setChecklistStates]= useState({});
  const [auditTrail,      setAuditTrail]     = useState([]);
  const [hdTickets,       setHdTickets]      = useState([]);
  const [messages,        setMessages]       = useState([]);
  const [availability,    setAvailability]   = useState([]);
  const [schedules,       setSchedules]      = useState([]);
  const [shiftPresets,    setShiftPresets]   = useState([]);
  const [punchRecords,    setPunchRecords]   = useState([]);
  // Hiring / Onboarding (slice 1)
  const [applications,    setApplications]   = useState([]);
  const [stores,            setStores]            = useState([]);
  const [storeDepartments,  setStoreDepartments]  = useState([]);
  const [storeRoles,        setStoreRoles]        = useState([]);
  const [flipdishStores,    setFlipdishStores]    = useState([]);
  const [flipdishSyncLog,   setFlipdishSyncLog]   = useState([]);
  // flipdishOrders and flipdishSales used to be App-level state. They're now
  // lazy-loaded inside ChainPerformanceView itself — see fetchFlipdishSalesCached.
  const [toast,           setToast]          = useState(null);
  const [activeView,      setActiveView]     = useState("dashboard");
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);

  // Slice 6 — employee profile view. When a manager clicks an employee in
  // Ops Team, we set selectedEmployeeId and switch activeView to
  // "employee-profile". URL hash (#employee/emp-id) is synced for back-button
  // support without restructuring the whole app to URL routing.
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);

  // Sync hash → state on mount AND on browser back/forward. Allows direct
  // links like https://create-brands-dashboard.vercel.app/#employee/emp-xyz
  useEffect(() => {
    const applyHash = () => {
      const m = window.location.hash.match(/^#employee\/(.+)$/);
      if (m) {
        setSelectedEmployeeId(m[1]);
        setActiveView("employee-profile");
      }
    };
    applyHash();   // initial
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  // Open an employee profile from anywhere (typically Ops Team list).
  // Updates state AND hash so the user can use back button.
  const openEmployeeProfile = useCallback(id => {
    setSelectedEmployeeId(id);
    setActiveView("employee-profile");
    // Use replaceState if we're already in a profile view (avoids stacking
    // history entries); pushState otherwise so back button works.
    const newHash = `#employee/${id}`;
    if (window.location.hash.startsWith("#employee/")) {
      window.history.replaceState(null, "", newHash);
    } else {
      window.history.pushState(null, "", newHash);
    }
  }, []);

  // Close the profile and return to Ops Team list.
  const closeEmployeeProfile = useCallback(() => {
    setSelectedEmployeeId(null);
    setActiveView("ops-settings");   // closest existing view for ops/team admin
    if (window.location.hash.startsWith("#employee/")) {
      window.history.pushState(null, "", window.location.pathname);
    }
  }, []);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500);
  }, []);

  // Live clock for topbar (ticks every 30s, no need for second precision in topbar)
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    Promise.all([
      fetchBrands(), fetchUsers(), fetchEntries(), fetchIssues(),
      fetchChecklists(), fetchTempUnits(), fetchCleaningTasks(), fetchAssignments(),
      fetchOpsTeam(), fetchTempLogs(), fetchDeliveries(), fetchChecklistStates(),
      fetchAuditTrail(), fetchHelpdeskTickets(), fetchInboxMessages(),
      fetchAvailability(), fetchSchedules(), fetchShiftPresets(), fetchPunchRecords(),
      fetchStores(), fetchFlipdishStores(), fetchFlipdishSyncLog(),
      fetchStoreDepartments(), fetchStoreRoles(),
      fetchApplications(),
      // NOTE: flipdishSales and flipdishOrders are NOT fetched here. They're
      // ~40k rows of POS+marketplace data and were forcing every user to wait
      // even if they never opened Chain Performance. ChainPerformanceView now
      // fetches its own data on mount (with a 5-min cache, see fetchSalesCached).
    ]).then(([b,u,e,i,cl,tu,ct,as,ot,tl,dl,cs,at,hd,msgs,avail,scheds,spreset,punches, st, fs, fsl, sdepts, sroles, apps]) => {
      setBrands(b); setUsers(u); setEntries(e); setIssues(i);
      setChecklists(cl); setTempUnits(tu); setCleaningTasks(ct); setAssignments(as);
      setOpsTeam(ot); setTempLogs(tl); setDeliveries(dl);
      setChecklistStates(cs || {});
      setAuditTrail(at); setHdTickets(hd); setMessages(msgs); setAvailability(avail);
      setSchedules(scheds); setShiftPresets(spreset); setPunchRecords(punches);
      setStores(st); setFlipdishStores(fs); setFlipdishSyncLog(fsl);
      setStoreDepartments(sdepts || []); setStoreRoles(sroles || []);
      setApplications(apps || []);
      setDbReady(true);
    }).catch(err => { setDbError(err.message); });
  }, []);

  useEffect(() => {
    if (!dbReady) return;
    const punchChannel = supabase.channel("realtime:punch_records")
      .on("postgres_changes", { event: "*", schema: "public", table: "punch_records" }, (payload) => {
        const { eventType, new: r, old: oldRow } = payload;
        if (eventType === "DELETE") { setPunchRecords(ps => ps.filter(p => p.id !== oldRow.id)); return; }
        const p = { id: r.id, brandId: r.brand_id, employeeId: r.employee_id, employeeName: r.employee_name,
          date: r.date, punchIn: r.punch_in, punchOut: r.punch_out,
          hoursWorked: r.hours_worked ? parseFloat(r.hours_worked) : null,
          hourlyRate: r.hourly_rate ? parseFloat(r.hourly_rate) : 0,
          grossPay: r.gross_pay ? parseFloat(r.gross_pay) : null,
          notes: r.notes, status: r.status,
          approved: r.approved ?? false, approvedBy: r.approved_by || "",
          scheduledStart: r.scheduled_start?.slice(0,5) || null,
          scheduledEnd: r.scheduled_end?.slice(0,5) || null,
          overtimeHours: r.overtime_hours ? parseFloat(r.overtime_hours) : null,
          overtimeReason: r.overtime_reason || "",
          overtimeApproved: r.overtime_approved ?? false,
          overtimeApprovedBy: r.overtime_approved_by || "",
          overtimeRejectedReason: r.overtime_rejected_reason || "",
          photoUrlIn: r.photo_url_in || "",
          photoUrlOut: r.photo_url_out || "",
          overtimeComments: r.overtime_comments || [],
          createdAt: r.created_at, updatedAt: r.updated_at };
        if (eventType === "INSERT") setPunchRecords(ps => ps.some(x => x.id === p.id) ? ps : [p, ...ps]);
        if (eventType === "UPDATE") setPunchRecords(ps => ps.map(x => x.id === p.id ? p : x));
      }).subscribe();
    const schedChannel = supabase.channel("realtime:schedules")
      .on("postgres_changes", { event: "*", schema: "public", table: "schedules" }, (payload) => {
        const { eventType, new: r, old: oldRow } = payload;
        if (eventType === "DELETE") { setSchedules(ss => ss.filter(s => s.id !== oldRow.id)); return; }
        const s = { id: r.id, brandId: r.brand_id, employeeId: r.employee_id, employeeName: r.employee_name,
          date: r.date, shift: r.shift, startTime: r.start_time?.slice(0,5)||"08:00",
          endTime: r.end_time?.slice(0,5)||"16:00", role: r.role, department: r.department,
          notes: r.notes, status: r.status, published: r.published ?? false, weekStart: r.week_start||null,
          createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at };
        if (eventType === "INSERT") setSchedules(ss => ss.some(x => x.id === s.id) ? ss : [s, ...ss]);
        if (eventType === "UPDATE") setSchedules(ss => ss.map(x => x.id === s.id ? s : x));
      }).subscribe();
    const availChannel = supabase.channel("realtime:availability")
      .on("postgres_changes", { event: "*", schema: "public", table: "availability" }, (payload) => {
        const { eventType, new: r, old: oldRow } = payload;
        if (eventType === "DELETE") { setAvailability(av => av.filter(a => a.id !== oldRow.id)); return; }
        const a = { id: r.id, brandId: r.brand_id, employeeId: r.employee_id, employeeName: r.employee_name,
          type: r.type, date: r.date, dayOfWeek: r.day_of_week, startDate: r.start_date,
          endDate: r.end_date, startTime: r.start_time?.slice(0,5), endTime: r.end_time?.slice(0,5),
          available: r.available, status: r.status, comments: r.comments || [],
          amendedDayOfWeek: r.amended_day_of_week, amendedStartTime: r.amended_start_time?.slice(0,5),
          amendedEndTime: r.amended_end_time?.slice(0,5), createdAt: r.created_at, updatedAt: r.updated_at };
        if (eventType === "INSERT") setAvailability(av => av.some(x => x.id === a.id) ? av : [a, ...av]);
        if (eventType === "UPDATE") setAvailability(av => av.map(x => x.id === a.id ? a : x));
      }).subscribe();
    const ticketChannel = supabase.channel("realtime:helpdesk_tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "helpdesk_tickets" }, (payload) => {
        const { eventType, new: r, old: oldRow } = payload;
        if (eventType === "DELETE") { setHdTickets(ts => ts.filter(t => t.id !== oldRow.id)); return; }
        const t = { id: r.id, brandId: r.brand_id, title: r.title, description: r.description,
          status: r.status, priority: r.priority, category: r.category,
          createdById: r.created_by_id, createdByName: r.created_by_name,
          assignedTo: r.assigned_to, comments: r.comments || [],
          createdAt: r.created_at, updatedAt: r.updated_at };
        if (eventType === "INSERT") setHdTickets(ts => ts.some(x => x.id === t.id) ? ts : [t, ...ts]);
        if (eventType === "UPDATE") setHdTickets(ts => ts.map(x => x.id === t.id ? t : x));
      }).subscribe();
    const msgChannel = supabase.channel("realtime:inbox_messages")
      .on("postgres_changes", { event: "*", schema: "public", table: "inbox_messages" }, (payload) => {
        const { eventType, new: r } = payload;
        if (eventType === "INSERT") {
          const m = { id: r.id, brandId: r.brand_id, fromId: r.from_id, fromName: r.from_name,
            toScope: r.to_scope, toBrandId: r.to_brand_id, toPersonId: r.to_person_id,
            body: r.body, readBy: r.read_by || [], createdAt: r.created_at };
          setMessages(ms => ms.some(x => x.id === m.id) ? ms : [m, ...ms]);
        }
      }).subscribe();
    const interval = setInterval(() => {
      fetchHelpdeskTickets().then(setHdTickets).catch(()=>{});
      fetchAvailability().then(setAvailability).catch(()=>{});
      fetchPunchRecords().then(setPunchRecords).catch(()=>{});  // belt + braces: catch any missed realtime updates
    }, 30000);
    return () => {
      clearInterval(interval);
      supabase.removeChannel(punchChannel); supabase.removeChannel(schedChannel);
      supabase.removeChannel(availChannel); supabase.removeChannel(ticketChannel);
      supabase.removeChannel(msgChannel);
    };
  }, [dbReady]);

  // ── Login / logout / impersonation ─────────────────────────────────────────
  const handleLogin  = useCallback(user => {
    setActualUser(user);
    setImpersonatedUserId(null);
    localStorage.setItem("cb_session", JSON.stringify(user));
    localStorage.removeItem("cb_impersonate");
  }, []);
  const handleLogout = useCallback(() => {
    setActualUser(null);
    setImpersonatedUserId(null);
    localStorage.removeItem("cb_session");
    localStorage.removeItem("cb_impersonate");
    setLoginMode("employee");
  }, []);

  // currentUser = the effective user (actual user, or impersonated if owner is "viewing as").
  // Every existing view reads `currentUser` — we don't have to rename anything downstream.
  const currentUser = useMemo(() => {
    if (!actualUser) return null;
    // Only an owner can impersonate. Anyone else: ignore impersonation state.
    if (actualUser.role !== "owner") return actualUser;
    if (!impersonatedUserId) return actualUser;
    const target = users.find(u => u.id === impersonatedUserId);
    return target || actualUser;   // fall back if the impersonated user vanishes
  }, [actualUser, impersonatedUserId, users]);

  const isImpersonating = !!impersonatedUserId && actualUser?.role === "owner" && currentUser?.id !== actualUser?.id;

  const handleImpersonate = useCallback(userId => {
    if (!actualUser || actualUser.role !== "owner") return;
    if (!userId || userId === actualUser.id) {
      setImpersonatedUserId(null);
      localStorage.removeItem("cb_impersonate");
    } else {
      setImpersonatedUserId(userId);
      localStorage.setItem("cb_impersonate", userId);
    }
  }, [actualUser]);

  // ── Role / access helpers (used by sidebar gating and view filters) ────────
  const isOwner    = currentUser?.role === "owner";
  const isHQ       = currentUser?.role === "owner" || currentUser?.role === "hq_staff";
  const isManager  = currentUser?.role === "manager";
  const isStaff    = currentUser?.role === "staff";

  // visibleStores: which stores can the current user see?
  //   Owner & HQ Staff → all non-archived stores
  //   Manager & Staff  → only stores listed in their store_ids
  const visibleStores = useMemo(() => {
    if (!currentUser) return [];
    const active = stores.filter(s => !s.archivedAt);
    if (isHQ) return active;
    const ids = currentUser.storeIds || [];
    if (ids.length === 0) return [];
    return active.filter(s => ids.includes(s.id));
  }, [currentUser, stores, isHQ]);

  const visibleStoreIds = useMemo(() => visibleStores.map(s => s.id), [visibleStores]);

  const addAudit = useCallback(async (action, detail, who, brandId, storeId) => {
    try {
      const now = new Date();
      const e = {
        id: `at-${Date.now()}`,
        action, detail,
        by: who,                 // matches appAuditToDb -> performed_by
        brandId,
        storeId: storeId || null,
        date: now.toISOString().split("T")[0],
        time: now.toTimeString().slice(0, 8),
        timestamp: now.toISOString(),
      };
      await insertAuditEntry(e);
      setAuditTrail(at => [e, ...at]);
    } catch {}
  }, []);

  const addEntry     = useCallback(async e=>{const s=await upsertEntry(e);setEntries(es=>{const idx=es.findIndex(x=>x.id===s.id);return idx>=0?es.map((x,i)=>i===idx?s:x):[s,...es];});}, []);
  const addIssue     = useCallback(async i=>{const s=await insertIssue(i);setIssues(is=>[s,...is]);}, []);
  const updateIssue  = useCallback(async i=>{const s=await upsertIssue(i);setIssues(is=>is.map(x=>x.id===s.id?s:x));}, []);
  const deleteIssue  = useCallback(async id=>{await removeIssue(id);setIssues(is=>is.filter(x=>x.id!==id));}, []);
  // ── Hiring / Applications CRUD ────────────────────────────────────────────
  // Slice 1: managers + HQ + owner can all add, edit, change status of
  // applications. Server-side schema validates the status enum, so bad
  // values get rejected at write time. Status changes are auto-logged
  // by the DB trigger — no app-side audit calls needed.
  const addApplication = useCallback(async app => {
    const saved = await insertApplication({ ...app, createdBy: currentUser?.id });
    setApplications(prev => [saved, ...prev]);
    showToast("Application added");
    return saved;
  }, [currentUser?.id, showToast]);
  const updateApplicationRow = useCallback(async (id, patch) => {
    const saved = await updateApplication(id, patch);
    setApplications(prev => prev.map(x => x.id === id ? saved : x));
    showToast("Application updated");
    return saved;
  }, [showToast]);
  const setApplicationStatus = useCallback(async (id, newStatus, extraPatch = {}) => {
    const saved = await changeApplicationStatus(id, newStatus, extraPatch);
    setApplications(prev => prev.map(x => x.id === id ? saved : x));
    return saved;
  }, []);
  const deleteApplicationRow = useCallback(async id => {
    await deleteApplication(id);
    setApplications(prev => prev.filter(x => x.id !== id));
    showToast("Application deleted");
  }, [showToast]);
  const addBrand     = useCallback(async b=>{const s=await insertBrand(b);setBrands(bs=>[...bs,s]);showToast("Brand added");}, [showToast]);
  const updateBrand  = useCallback(async b=>{const s=await upsertBrand(b);setBrands(bs=>bs.map(x=>x.id===s.id?s:x));showToast("Updated");}, [showToast]);
  const deleteBrand  = useCallback(async id=>{await removeBrand(id);setBrands(bs=>bs.filter(x=>x.id!==id));showToast("Deleted");}, [showToast]);
  const addUser      = useCallback(async u=>{const s=await insertUser(u);setUsers(us=>[...us,s]);showToast("User added");}, [showToast]);
  const updateUser   = useCallback(async u=>{const s=await upsertUser(u);setUsers(us=>us.map(x=>x.id===s.id?s:x));showToast("Updated");}, [showToast]);
  const deleteUser   = useCallback(async id=>{await removeUser(id);setUsers(us=>us.filter(x=>x.id!==id));showToast("Deleted");}, [showToast]);
  // ── Store CRUD (admin) ────────────────────────────────────────────────────
  const addStore = useCallback(async s => {
    const saved = await insertStore(s);
    setStores(prev => [...prev, saved].sort((a,b)=>(a.shortName||"").localeCompare(b.shortName||"")));
    showToast("Store added");
    return saved;
  }, [showToast]);
  const updateStoreRow = useCallback(async (id, patch) => {
    const saved = await updateStore(id, patch);
    setStores(prev => prev.map(x => x.id === id ? saved : x));
    showToast("Store updated");
    return saved;
  }, [showToast]);
  const deleteStoreRow = useCallback(async id => {
    try {
      await deleteStore(id);
      setStores(prev => prev.filter(x => x.id !== id));
      showToast("Store deleted");
    } catch (err) {
      // Most common failure: flipdish_stores rows still reference this store.
      // Surface a clear message instead of the raw Postgres error.
      const msg = /foreign key|violates/.test(err.message || "")
        ? "Can't delete — unlink Flipdish stores first."
        : `Couldn't delete: ${err.message}`;
      showToast(msg, "error");
      throw err;
    }
  }, [showToast]);
  const linkFlipdishToStore = useCallback(async (flipdishStoreId, storeId) => {
    const saved = await linkFlipdishStore(flipdishStoreId, storeId);
    setFlipdishStores(prev => prev.map(x => x.id === saved.id ? saved : x));
    showToast("Linked");
    return saved;
  }, [showToast]);
  const unlinkFlipdishFromStore = useCallback(async flipdishStoreId => {
    const saved = await unlinkFlipdishStore(flipdishStoreId);
    setFlipdishStores(prev => prev.map(x => x.id === saved.id ? saved : x));
    showToast("Unlinked");
    return saved;
  }, [showToast]);
  const backfillStoreSales = useCallback(async (brandId, storeId) => {
    const { linked } = await backfillSalesStoreId(brandId, storeId);
    invalidateFlipdishSalesCache();
    showToast(`Linked ${linked} historical sales`);
    return linked;
  }, [showToast]);

  // ── Store department CRUD ─────────────────────────────────────────────────
  const addStoreDepartment = useCallback(async d => {
    const saved = await insertStoreDepartment(d);
    setStoreDepartments(prev => [...prev, saved]);
    showToast("Department added");
    return saved;
  }, [showToast]);
  const updateStoreDepartmentRow = useCallback(async (id, patch) => {
    const saved = await updateStoreDepartment(id, patch);
    setStoreDepartments(prev => prev.map(x => x.id === id ? saved : x));
    showToast("Department updated");
    return saved;
  }, [showToast]);
  const archiveStoreDepartmentRow = useCallback(async id => {
    const saved = await archiveStoreDepartment(id);
    setStoreDepartments(prev => prev.map(x => x.id === id ? saved : x));
    showToast("Department archived");
    return saved;
  }, [showToast]);
  const unarchiveStoreDepartmentRow = useCallback(async id => {
    const saved = await unarchiveStoreDepartment(id);
    setStoreDepartments(prev => prev.map(x => x.id === id ? saved : x));
    showToast("Department restored");
    return saved;
  }, [showToast]);

  // ── Store role CRUD ───────────────────────────────────────────────────────
  const addStoreRole = useCallback(async r => {
    const saved = await insertStoreRole(r);
    setStoreRoles(prev => [...prev, saved]);
    showToast("Role added");
    return saved;
  }, [showToast]);
  const updateStoreRoleRow = useCallback(async (id, patch) => {
    const saved = await updateStoreRole(id, patch);
    setStoreRoles(prev => prev.map(x => x.id === id ? saved : x));
    showToast("Role updated");
    return saved;
  }, [showToast]);
  const archiveStoreRoleRow = useCallback(async id => {
    const saved = await archiveStoreRole(id);
    setStoreRoles(prev => prev.map(x => x.id === id ? saved : x));
    showToast("Role archived");
    return saved;
  }, [showToast]);
  const unarchiveStoreRoleRow = useCallback(async id => {
    const saved = await unarchiveStoreRole(id);
    setStoreRoles(prev => prev.map(x => x.id === id ? saved : x));
    showToast("Role restored");
    return saved;
  }, [showToast]);

  // Copy from another store, then refetch to get new IDs + parent links
  const copyStructureFromStore = useCallback(async (sourceId, targetId) => {
    const result = await copyStoreStructure(sourceId, targetId);
    // Re-fetch both lists since inserts batched without per-row select returns
    const [d, r] = await Promise.all([fetchStoreDepartments(), fetchStoreRoles()]);
    setStoreDepartments(d || []);
    setStoreRoles(r || []);
    showToast(`Copied ${result.departments} departments and ${result.roles} roles`);
    return result;
  }, [showToast]);
  const updateKPITargets = useCallback(async(brandId,targets)=>{const s=await upsertBrand({...brands.find(b=>b.id===brandId),kpiTargets:targets});setBrands(bs=>bs.map(x=>x.id===s.id?s:x));showToast("KPI saved");}, [brands,showToast]);
  const handleBulkImport = useCallback(async rows=>{const saved=await upsertEntries(rows);setEntries(es=>{const m=new Map(es.map(x=>[x.id,x]));saved.forEach(s=>m.set(s.id,s));return[...m.values()];});showToast(`${saved.length} entries imported`);}, [showToast]);
  const addChecklist    = useCallback(async c=>{const s=await upsertChecklist(c);setChecklists(cs=>cs.some(x=>x.id===s.id)?cs.map(x=>x.id===s.id?s:x):[...cs,s]);showToast("Saved");}, [showToast]);
  const updateChecklist = useCallback(async c=>{const s=await upsertChecklist(c);setChecklists(cs=>cs.map(x=>x.id===s.id?s:x));showToast("Updated");}, [showToast]);
  const deleteChecklist = useCallback(async id=>{await removeChecklist(id);setChecklists(cs=>cs.filter(x=>x.id!==id));showToast("Deleted");}, [showToast]);
  const addTempUnit     = useCallback(async u=>{const s=await upsertTempUnit(u);setTempUnits(ts=>ts.some(x=>x.id===s.id)?ts.map(x=>x.id===s.id?s:x):[...ts,s]);showToast("Saved");}, [showToast]);
  const updateTempUnit  = useCallback(async u=>{const s=await upsertTempUnit(u);setTempUnits(ts=>ts.map(x=>x.id===s.id?s:x));showToast("Updated");}, [showToast]);
  const deleteTempUnit  = useCallback(async id=>{await removeTempUnit(id);setTempUnits(ts=>ts.filter(x=>x.id!==id));showToast("Deleted");}, [showToast]);
  const addCleanTask    = useCallback(async t=>{const s=await upsertCleaningTask(t);setCleaningTasks(ts=>ts.some(x=>x.id===s.id)?ts.map(x=>x.id===s.id?s:x):[...ts,s]);showToast("Saved");}, [showToast]);
  const updateCleanTask = useCallback(async t=>{const s=await upsertCleaningTask(t);setCleaningTasks(ts=>ts.map(x=>x.id===s.id?s:x));showToast("Updated");}, [showToast]);
  const deleteCleanTask = useCallback(async id=>{await removeCleaningTask(id);setCleaningTasks(ts=>ts.filter(x=>x.id!==id));showToast("Deleted");}, [showToast]);
  const addAssignment    = useCallback(async a=>{const s=await upsertAssignment(a);setAssignments(as=>as.some(x=>x.id===s.id)?as.map(x=>x.id===s.id?s:x):[...as,s]);showToast("Saved");}, [showToast]);
  const updateAssignment = useCallback(async a=>{const s=await upsertAssignment(a);setAssignments(as=>as.map(x=>x.id===s.id?s:x));showToast("Updated");}, [showToast]);
  const deleteAssignment = useCallback(async id=>{await removeAssignment(id);setAssignments(as=>as.filter(x=>x.id!==id));showToast("Deleted");}, [showToast]);
  const addOpsTeam    = useCallback(async m=>{const s=await upsertOpsTeamMember(m);setOpsTeam(ts=>ts.some(x=>x.id===s.id)?ts.map(x=>x.id===s.id?s:x):[...ts,s]);showToast("Saved"); return s;}, [showToast]);
  const updateOpsTeam = useCallback(async m=>{const s=await upsertOpsTeamMember(m);setOpsTeam(ts=>ts.map(x=>x.id===s.id?s:x));showToast("Updated");}, [showToast]);
  // Slice 6 follow-up — true partial update for the profile-page tabs.
  // The profile passes only the fields it wants to change; this preserves
  // everything else (brand_id, role, storeIds, etc.) instead of failing
  // NOT NULL constraints like the upsert path would.
  //
  // Accepts EITHER (id, patch) or a single object with .id — callers in
  // PersonalHrTab and JobAssignmentTab already use the single-object form.
  const patchOpsTeam = useCallback(async (idOrObj, maybePatch) => {
    const id    = typeof idOrObj === "string" ? idOrObj : idOrObj?.id;
    const patch = typeof idOrObj === "string" ? maybePatch : (() => {
      const { id: _strip, ...rest } = idOrObj || {};
      return rest;
    })();
    if (!id) throw new Error("patchOpsTeam: missing id");
    const s = await updateOpsTeamMember(id, patch);
    setOpsTeam(ts => ts.map(x => x.id === s.id ? s : x));
    showToast("Updated");
    return s;
  }, [showToast]);
  const deleteOpsTeam = useCallback(async id=>{await removeOpsTeamMember(id);setOpsTeam(ts=>ts.filter(x=>x.id!==id));showToast("Deleted");}, [showToast]);
  const handleTempLog     = useCallback(async l=>{const s=await insertTempLog(l);setTempLogs(ls=>[s,...ls]);}, []);
  const handleDeliveryAdd = useCallback(async d=>{const s=await insertDelivery(d);setDeliveries(ds=>[s,...ds]);}, []);
  const handleChecklistItemToggle = useCallback(async (stateKey,itemId,val)=>{
    const newState={...(checklistStates[stateKey]||{}),[itemId]:val};
    setChecklistStates(s=>({...s,[stateKey]:newState}));
    // stateKey first segment is "store_id || brand_id" — set by the
    // consumer at the call site. After Stage 6, that means it's a storeId
    // for all NEW assignments (they're store-keyed via NOT NULL). Resolve
    // which kind it is by checking the stores list, so legacy brand-scoped
    // checklists still work.
    const [scopeId,checklistId,date]=stateKey.split("||");
    const matchingStore=stores.find(s=>s.id===scopeId);
    if (!matchingStore) {
      // Legacy/orphan path: scopeId is a brandId. Skip the write since
      // checklist_states.store_id is now NOT NULL — we can't represent this
      // record any more without a storeId. (In practice this branch is
      // unreachable after Stage 6 since all assignments now require storeId.)
      console.warn(`Skipping checklist toggle: no matching store for scope "${scopeId}". Assignment may pre-date Stage 5.`);
      return;
    }
    await upsertChecklistState(matchingStore.id, matchingStore.brandId, checklistId, date, newState, "", null);
  }, [checklistStates, stores]);
  const handleSignOff = useCallback(async(assignment)=>{
    try {
      const now=new Date().toISOString();
      const d=now.split("T")[0];
      // Assignments are now NOT NULL on store_id, so this is always present
      // for new rows. We still tolerate missing storeId on possible legacy
      // assignments by warning rather than silently failing.
      if (!assignment.storeId) {
        showToast("Cannot sign off: assignment has no store linked. Re-create it.", "error");
        return;
      }
      const stateKey=`${assignment.storeId}||${assignment.taskId}||${d}`;
      await upsertChecklistState(assignment.storeId, assignment.brandId, assignment.taskId, d, checklistStates[stateKey]||{}, currentUser?.name||"Manager", now);
      await addAudit("sign-off",`${assignment.checklistName||"Task"} completed`,currentUser?.name||"Manager",assignment.brandId,assignment.storeId);
      showToast("✓ Signed off");
    } catch(err){showToast(err.message,"error");}
  }, [checklistStates,currentUser,addAudit,showToast]);
  const handleClearAudit = useCallback(async()=>{try{await clearAuditTrail();setAuditTrail([]);showToast("Cleared");}catch(err){showToast(err.message,"error");}}, [showToast]);
  const addAvailability    = useCallback(async a=>{const s=await insertAvailability(a);setAvailability(av=>av.some(x=>x.id===s.id)?av.map(x=>x.id===s.id?s:x):[s,...av]);}, []);
  const updateAvailability = useCallback(async a=>{const s=await upsertAvailability(a);setAvailability(av=>av.map(x=>x.id===s.id?s:x));}, []);
  const deleteAvailability = useCallback(async id=>{await removeAvailability(id);setAvailability(av=>av.filter(x=>x.id!==id));}, []);
  const addSchedule    = useCallback(async s=>{const saved=await upsertSchedule(s);setSchedules(ss=>ss.some(x=>x.id===saved.id)?ss.map(x=>x.id===saved.id?saved:x):[saved,...ss]);}, []);
  const deleteSchedule = useCallback(async id=>{await removeSchedule(id);setSchedules(ss=>ss.filter(x=>x.id!==id));}, []);
  const handlePublishWeek = useCallback(async (arg1, weekStart, published) => {
    try {
      // Two calling shapes supported:
      //   new: handlePublishWeek({ storeId, weekStart, published })
      //   legacy: handlePublishWeek(brandId, weekStart, published)
      const opts = (typeof arg1 === "object" && arg1 !== null)
        ? arg1
        : { brandId: arg1, weekStart, published };
      await publishWeekSchedules(opts);
      const we = new Date(opts.weekStart + "T00:00:00");
      we.setDate(we.getDate() + 6);
      const weStr = [we.getFullYear(), String(we.getMonth() + 1).padStart(2, "0"), String(we.getDate()).padStart(2, "0")].join("-");
      const inWeek = (s) => s.date >= opts.weekStart && s.date <= weStr;
      const inScope = (s) => opts.storeId
        ? (s.storeId === opts.storeId || (!s.storeId && s.brandId === brands.find(b => stores.some(st => st.id === opts.storeId && st.brandId === b.id))?.id))
        : s.brandId === opts.brandId;
      setSchedules(ss => ss.map(s => (inScope(s) && inWeek(s)) ? { ...s, published: opts.published } : s));
      showToast(opts.published ? "Schedule published ✓" : "Schedule unpublished");
    } catch (err) { showToast("Failed: " + err.message, "error"); }
  }, [showToast, brands, stores]);
  const addShiftPreset    = useCallback(async p=>{try{const s=await upsertShiftPreset(p);setShiftPresets(ps=>[...ps,s]);showToast(`"${p.name}" added`);}catch(err){showToast(err.message,"error");}}, [showToast]);
  const updateShiftPreset = useCallback(async p=>{try{const s=await upsertShiftPreset(p);setShiftPresets(ps=>ps.map(x=>x.id===s.id?s:x));showToast("Updated");}catch(err){showToast(err.message,"error");}}, [showToast]);
  const deleteShiftPreset = useCallback(async id=>{try{await removeShiftPreset(id);setShiftPresets(ps=>ps.filter(p=>p.id!==id));showToast("Deleted");}catch(err){showToast(err.message,"error");}}, [showToast]);
  const handlePunchIn   = useCallback(async record=>{try{const saved=await insertPunchIn(record);setPunchRecords(ps=>[saved,...ps]);}catch(err){console.error("PunchIn failed:",err);}}, []);
  const handlePunchOut  = useCallback(async(id,punchOut,hoursWorked,grossPay)=>{try{const saved=await updatePunchOut(id,punchOut,hoursWorked,grossPay);setPunchRecords(ps=>ps.map(p=>p.id===saved.id?saved:p));}catch(err){console.error("PunchOut failed:",err);}}, []);
  const handleAmendPunch = useCallback(async record=>{try{const saved=await upsertPunchRecord(record);setPunchRecords(ps=>ps.map(p=>p.id===saved.id?saved:p));showToast("Amended");}catch(err){showToast("Failed: "+err.message,"error");}}, [showToast]);

  const handleFlipdishSync = useCallback(async () => {
    try {
      showToast("Starting Flipdish sync…");
      await runFlipdishSync({});  // default: last 7 days
      // Bust the lazy-load cache so the next Chain Performance render fetches fresh.
      // If the user is currently *on* Chain Performance, the view re-reads via
      // its own effect (keyed on the cache-bust counter) and shows new data.
      invalidateFlipdishSalesCache();
      setFlipdishSyncLog(await fetchFlipdishSyncLog());
      showToast("Sync complete");
    } catch (err) {
      showToast("Sync failed: " + err.message, "error");
    }
  }, [showToast]);
  const handleAddPunchComment = useCallback(async (recordId, comment) => {
    try {
      const saved = await addPunchOvertimeComment(recordId, comment);
      setPunchRecords(ps => ps.map(p => p.id === saved.id ? saved : p));
    } catch (err) { showToast("Couldn't post comment: " + err.message, "error"); }
  }, [showToast]);
  const removeSchedulePunchRecord = useCallback(async(id)=>{try{const{error}=await supabase.from("punch_records").delete().eq("id",id);if(error)throw error;setPunchRecords(ps=>ps.filter(p=>p.id!==id));showToast("Deleted");}catch(err){showToast("Failed: "+err.message,"error");}}, [showToast]);
  const addHdTicket    = useCallback(async t=>{const s=await insertHelpdeskTicket(t);setHdTickets(ts=>ts.some(x=>x.id===s.id)?ts.map(x=>x.id===s.id?s:x):[s,...ts]);}, []);
  const updateHdTicket = useCallback(async t=>{const s=await upsertHelpdeskTicket(t);setHdTickets(ts=>ts.map(x=>x.id===s.id?s:x));}, []);
  const deleteHdTicket = useCallback(async id=>{await removeHelpdeskTicket(id);setHdTickets(ts=>ts.filter(x=>x.id!==id));}, []);
  const sendMessage    = useCallback(async m=>{const s=await insertInboxMessage(m);setMessages(ms=>ms.some(x=>x.id===s.id)?ms:[s,...ms]);}, []);
  const handleMarkRead = useCallback(async(msgId,userId)=>{await markMessageRead(msgId,userId);setMessages(ms=>ms.map(m=>m.id===msgId?{...m,readBy:[...(m.readBy||[]),userId]}:m));}, []);

  // Kiosk guard — all hooks ran above
  if (IS_APPLY) return <ApplyShell />;
  if (IS_KIOSK) return <KioskShell />;

  if (dbError) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f172a",color:"#f87171",fontFamily:"sans-serif",gap:12}}>
      <span style={{fontSize:32}}>⚠️</span><strong>Could not connect to database</strong>
      <code style={{fontSize:12,color:"#94a3b8"}}>{dbError}</code>
    </div>
  );
  if (!dbReady) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f172a",color:"#94a3b8",fontFamily:"sans-serif",gap:12}}>
      <span style={{fontSize:24}}>⏳</span><span>Loading data…</span>
    </div>
  );

  if (!currentUser) {
    if (loginMode === "manager") return (
      <AuthContext.Provider value={{ user: null }}>
        <LoginScreen users={users} onLogin={handleLogin} onSwitchToEmployee={() => setLoginMode("employee")}/>
      </AuthContext.Provider>
    );
    return (
      <AuthContext.Provider value={{ user: null }}>
        <EmployeeLoginScreen opsTeam={opsTeam} brands={brands} onLogin={handleLogin} onSwitchToManager={() => setLoginMode("manager")}/>
      </AuthContext.Provider>
    );
  }

  if (currentUser.role === "employee") {
    const myBrands = brands.filter(b => currentUser.brandIds.includes(b.id));
    return (
      <AuthContext.Provider value={{ user: currentUser }}>
        <EmployeeShell
          currentUser={currentUser} brands={myBrands} stores={stores} opsTeam={opsTeam}
          assignments={assignments} checklists={checklists} tempUnits={tempUnits}
          cleaningTasks={cleaningTasks} auditTrail={auditTrail} checklistStates={checklistStates}
          tempLogs={tempLogs} deliveries={deliveries} issues={issues.filter(i=>currentUser.brandIds.includes(i.brandId))}
          onSignOff={handleSignOff} onChecklistItemToggle={handleChecklistItemToggle}
          onTempLog={handleTempLog} onDeliveryAdd={handleDeliveryAdd}
          onAddIssue={addIssue} onUpdateIssue={updateIssue}
          hdTickets={hdTickets} onAddHdTicket={addHdTicket} onUpdateHdTicket={updateHdTicket}
          messages={messages} onSendMessage={sendMessage} onMarkRead={handleMarkRead}
          availability={availability} onAddAvailability={addAvailability} onUpdateAvailability={updateAvailability}
          schedules={schedules} punchRecords={punchRecords} onAmendPunch={handleAmendPunch} onAddPunchComment={handleAddPunchComment}
          onLogout={handleLogout}
        />
      </AuthContext.Provider>
    );
  }

  // Manager / Owner
  const visibleBrands = brands.filter(b => isHqOrAbove(currentUser.role) || currentUser.brandIds.includes(b.id));
  const openIssueCount = issues.filter(i => visibleBrands.some(b=>b.id===i.brandId) && ["Open","In Progress","Awaiting Parts"].includes(i.status)).length;
  const inboxUnread = messages.filter(m => {
    if (m.fromId===currentUser.id) return false;
    if (m.toScope==="all_locations") return true;
    if (m.toScope==="location" && currentUser.brandIds.includes(m.toBrandId)) return true;
    if (m.toScope==="individual" && m.toPersonId===currentUser.id) return true;
    return false;
  }).filter(m => !m.readBy?.includes(currentUser.id)).length;
  const pendingAvail = availability.filter(a => visibleBrands.some(b=>b.id===a.brandId) && a.status==="pending").length;
  const commsBadge = inboxUnread + pendingAvail;

  // Hiring badge: count applications in active (non-terminal) states that
  // are relevant to the current user's scope. For managers, only their stores;
  // for HQ/owner, everywhere. We only count "needs action" states — applied
  // and manager_reviewing — so the badge represents "things waiting for me",
  // not just "stuff in pipeline".
  const hiringBadge = applications.filter(a => {
    if (!["applied", "manager_reviewing"].includes(a.status)) return false;
    if (isHqOrAbove(currentUser.role)) return true;
    return (currentUser.storeIds || []).includes(a.storeId);
  }).length;

  // Slice 6 follow-up — pending-setup count. Employees hired through the
  // slice 5 flow without role/dept/wages assigned get status="pending_setup"
  // (set by OpsTeamMemberFormModal when hire-flow save has blank role).
  // Surface this so manager remembers to complete setup; without surfacing
  // these employees can sit indefinitely in incomplete state.
  //
  // Scope rules match hiring badge: HQ/owner sees all; manager sees only
  // employees primarily based at one of their stores. We check the FIRST
  // store in storeIds (the "primary" per modal save logic) so floater staff
  // assigned to a manager's store as secondary don't trigger their badge.
  const pendingSetupCount = opsTeam.filter(m => {
    if (m.status !== "pending_setup") return false;
    if (m.archivedAt) return false;
    if (isHqOrAbove(currentUser.role)) return true;
    const primary = m.storeIds?.[0];
    return primary && (currentUser.storeIds || []).includes(primary);
  }).length;

  // Nav items declared with optional `roles` array. If omitted, all roles see it.
  // Filtered by current user's role; empty groups dropped so the sidebar doesn't
  // render an orphan header. Recomputed every render — cheap, no hook needed.
  const NAV_GROUPS_RAW = [
    { group: "OVERVIEW", items: [
      { key: "dashboard",   label: "Dashboard",     icon: BarChart2 },
      { key: "chain",       label: "Chain Performance", icon: Globe, roles: ["owner", "hq_staff"] },
      { key: "tactical",    label: "Performance",   icon: TrendingUp },
      { key: "ops-network", label: "Ops Overview",  icon: Activity },
    ]},
    { group: "TODAY", items: [
      { key: "ops-tasks",      label: "Today's Tasks",   icon: CheckSquare },
      { key: "ops-temps",      label: "Temperatures",    icon: Thermometer },
      { key: "ops-deliveries", label: "Deliveries",      icon: Truck },
      { key: "eod",            label: "EOD Report",      icon: FileText },
    ]},
    { group: "PEOPLE", items: [
      { key: "time-attend",  label: "Time & Attendance", icon: Clock },
      { key: "comms",        label: "Communication",     icon: MessageSquare, badge: commsBadge > 0 ? commsBadge.toString() : null },
      { key: "ops-assigns",  label: "Assignments",       icon: Clipboard },
      { key: "hiring",       label: "Hiring",            icon: UserPlus, badge: hiringBadge > 0 ? hiringBadge.toString() : null },
    ]},
    { group: "MAINTENANCE", items: [
      { key: "issues",  label: "Issues",  icon: Wrench, badge: openIssueCount > 0 ? openIssueCount.toString() : null },
    ]},
    { group: "COMPLIANCE", items: [
      { key: "ops-compliance", label: "Compliance",  icon: Shield },
      { key: "ops-audit",      label: "Audit Trail", icon: ScrollText },
    ]},
    { group: "SETUP", items: [
      { key: "ops-settings", label: "Ops Setup", icon: Settings, badge: pendingSetupCount > 0 ? pendingSetupCount.toString() : null },
      { key: "admin",        label: "Admin",     icon: Users, roles: ["owner"] },
    ]},
  ];

  const NAV_GROUPS = NAV_GROUPS_RAW
    .map(g => ({ ...g, items: g.items.filter(item => !item.roles || item.roles.includes(currentUser?.role)) }))
    .filter(g => g.items.length > 0);

  // If after role-filtering the current activeView is no longer in the menu
  // (e.g. owner impersonated into a manager while sitting on Chain Performance),
  // fall back to the first allowed view at render-time. No state change needed —
  // we just pick a different view to render this pass. The user can click the
  // sidebar to "stick" a different view if they want.
  const effectiveActiveView = (() => {
    const allowedKeys = NAV_GROUPS.flatMap(g => g.items.map(i => i.key));
    if (allowedKeys.length === 0) return activeView;
    if (allowedKeys.includes(activeView)) return activeView;
    // Slice 6 — employee-profile is a "drill-down" view, not in the sidebar
    // nav. Allow it through if the user landed on it from Ops Team or a deep
    // link, even though no sidebar nav matches it.
    if (activeView === "employee-profile") return activeView;
    return allowedKeys[0];
  })();

  const titles = { dashboard:"Executive Dashboard", chain:"Chain Performance", tactical:"Performance", eod:"EOD Report",
    issues:"Issues", "ops-network":"Ops Overview", "ops-tasks":"Today's Tasks",
    "ops-temps":"Temperature Log", "ops-deliveries":"Deliveries", "ops-assigns":"Assignments",
    "ops-compliance":"Compliance", "ops-audit":"Audit Trail", "ops-settings":"Ops Setup",
    admin:"Admin", comms:"Communication", "time-attend":"Time & Attendance",
    "employee-profile":"Employee Profile", hiring:"Hiring" };

  const currentUser_ctx = currentUser;

  return (
    <AuthContext.Provider value={{ user: currentUser_ctx }}>
      <div className="flex h-screen bg-slate-950 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          navGroups={NAV_GROUPS} activeView={effectiveActiveView} setActiveView={setActiveView}
          currentUser={currentUser} onLogout={handleLogout}
          collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed}
          actualUser={actualUser} users={users} onImpersonate={handleImpersonate} isImpersonating={isImpersonating}
        />
        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Impersonation banner — visible when an owner is viewing as someone else */}
          {isImpersonating && (
            <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center gap-3 text-amber-200">
              <span className="text-sm">⚠</span>
              <span className="text-xs font-semibold flex-1">
                Viewing as <span className="text-amber-100">{currentUser.name}</span>
                <span className="text-amber-200/60 font-normal"> · {currentUser.role === "hq_staff" ? "HQ Staff" : currentUser.role}</span>
                <span className="text-amber-200/60 font-normal"> · UI preview only, writes still go through your owner account</span>
              </span>
              <button
                onClick={() => handleImpersonate(null)}
                className="text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 px-3 py-1 rounded-lg transition-colors"
              >
                Return to Owner
              </button>
            </div>
          )}
          {/* Topbar */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800/60 bg-slate-950/80 flex-shrink-0">
            <div>
              <h1 className="text-sm font-bold text-white">{titles[effectiveActiveView] || effectiveActiveView}</h1>
              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                <span>{now.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</span>
                <span className="text-slate-700">·</span>
                <span className="tabular-nums font-semibold text-slate-600">{now.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {(() => {
                // Show how many staff are currently clocked in across visible brands
                const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
                const onShift = punchRecords.filter(p => visibleBrands.some(b=>b.id===p.brandId) && p.date === todayStr && p.status === "open").length;
                return onShift > 0 ? (
                  <div className="flex items-center gap-1.5 text-xs text-indigo-300 font-semibold bg-indigo-950/30 border border-indigo-500/30 rounded-full px-2.5 py-0.5">
                    <UserCheck size={12}/>
                    <span className="tabular-nums">{onShift}</span> on shift
                  </div>
                ) : null;
              })()}
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/><span>Live</span></div>
              {inboxUnread > 0 && <div className="text-xs bg-red-500 text-white rounded-full px-2 py-0.5 font-bold">{inboxUnread} unread</div>}
            </div>
          </div>
          {/* Content */}
          <main className="flex-1 overflow-y-auto p-6">
            {effectiveActiveView === "dashboard"      && <DashboardView brands={visibleBrands} entries={entries} issues={issues}/>}
            {effectiveActiveView === "chain"           && (currentUser.role === "owner" || currentUser.role === "hq_staff") && <ChainPerformanceView brands={visibleBrands} stores={stores} flipdishStores={flipdishStores} flipdishSyncLog={flipdishSyncLog} entries={entries} currentUser={currentUser} onRefreshSync={handleFlipdishSync}/>}
            {effectiveActiveView === "tactical"       && <TacticalOpsView brands={visibleBrands} stores={stores} visibleStoreIds={visibleStoreIds} entries={entries} issues={issues} users={users} onAddIssue={addIssue} onUpdateIssue={updateIssue} onDeleteIssue={deleteIssue}/>}
            {effectiveActiveView === "eod"            && <EODFormView brands={visibleBrands} stores={stores} visibleStoreIds={visibleStoreIds} onAddEntry={addEntry}/>}
            {effectiveActiveView === "issues"         && <IssuesView brands={visibleBrands} stores={stores} visibleStoreIds={visibleStoreIds} issues={issues} users={users} currentUser={currentUser} onAddIssue={addIssue} onUpdateIssue={updateIssue} onDeleteIssue={deleteIssue}/>}
            {effectiveActiveView === "ops-tasks"      && <TodaysTasks brands={visibleBrands} stores={stores} visibleStoreIds={visibleStoreIds} assignments={assignments} checklists={checklists} tempUnits={tempUnits} cleaningTasks={cleaningTasks} auditTrail={auditTrail} checklistStates={checklistStates} onSignOff={handleSignOff} onChecklistItemToggle={handleChecklistItemToggle}/>}
            {effectiveActiveView === "ops-temps"      && <TemperatureLog brands={visibleBrands} stores={stores} visibleStoreIds={visibleStoreIds} tempUnits={tempUnits} tempLogs={tempLogs} onLog={handleTempLog}/>}
            {effectiveActiveView === "ops-deliveries" && <DeliveriesView brands={visibleBrands} stores={stores} visibleStoreIds={visibleStoreIds} deliveries={deliveries} onAdd={handleDeliveryAdd}/>}
            {effectiveActiveView === "ops-network"    && <OpsNetworkDashboard brands={visibleBrands} stores={stores} visibleStoreIds={visibleStoreIds} assignments={assignments} auditTrail={auditTrail} opsTeam={opsTeam} checklists={checklists} tempUnits={tempUnits} cleaningTasks={cleaningTasks}/>}
            {effectiveActiveView === "ops-compliance" && <ComplianceView brands={visibleBrands} stores={stores} visibleStoreIds={visibleStoreIds} assignments={assignments} auditTrail={auditTrail}/>}
            {effectiveActiveView === "ops-audit"      && <AuditTrailView brands={visibleBrands} stores={stores} visibleStoreIds={visibleStoreIds} auditTrail={auditTrail} onClear={handleClearAudit}/>}
            {effectiveActiveView === "ops-assigns"    && <AssignmentsView brands={visibleBrands} stores={stores} assignments={assignments} checklists={checklists} tempUnits={tempUnits} cleaningTasks={cleaningTasks} opsTeam={opsTeam} auditTrail={auditTrail} onAdd={addAssignment} onEdit={updateAssignment} onDelete={deleteAssignment}/>}
            {effectiveActiveView === "hiring"         && <HiringView
              brands={visibleBrands} stores={stores} storeRoles={storeRoles} storeDepartments={storeDepartments} visibleStoreIds={visibleStoreIds}
              applications={applications} opsTeam={opsTeam} currentUser={currentUser}
              onAdd={addApplication} onUpdate={updateApplicationRow}
              onSetStatus={setApplicationStatus} onDelete={deleteApplicationRow}
              onAddOpsTeam={addOpsTeam}
              onOpenEmployeeProfile={openEmployeeProfile}
            />}
            {effectiveActiveView === "employee-profile" && selectedEmployeeId && <EmployeeProfileView
              employeeId={selectedEmployeeId}
              brands={visibleBrands} stores={stores}
              storeRoles={storeRoles} storeDepartments={storeDepartments}
              opsTeam={opsTeam} currentUser={currentUser}
              onUpdateEmployee={patchOpsTeam}
              onClose={closeEmployeeProfile}
            />}
            {effectiveActiveView === "ops-settings"   && <OpsSettingsView
              brands={visibleBrands} stores={stores} visibleStoreIds={visibleStoreIds}
              storeDepartments={storeDepartments} storeRoles={storeRoles}
              checklists={checklists} tempUnits={tempUnits}
              cleaningTasks={cleaningTasks} opsTeam={opsTeam} shiftPresets={shiftPresets}
              onAddChecklist={addChecklist} onUpdateChecklist={updateChecklist} onDeleteChecklist={deleteChecklist}
              onAddTempUnit={addTempUnit} onUpdateTempUnit={updateTempUnit} onDeleteTempUnit={deleteTempUnit}
              onAddCleanTask={addCleanTask} onUpdateCleanTask={updateCleanTask} onDeleteCleanTask={deleteCleanTask}
              onAddOpsTeam={addOpsTeam} onUpdateOpsTeam={updateOpsTeam} onDeleteOpsTeam={deleteOpsTeam}
              onOpenEmployeeProfile={openEmployeeProfile}
              onAddShiftPreset={addShiftPreset} onUpdateShiftPreset={updateShiftPreset} onDeleteShiftPreset={deleteShiftPreset}
              onAddStoreDepartment={addStoreDepartment} onUpdateStoreDepartment={updateStoreDepartmentRow}
              onArchiveStoreDepartment={archiveStoreDepartmentRow} onUnarchiveStoreDepartment={unarchiveStoreDepartmentRow}
              onAddStoreRole={addStoreRole} onUpdateStoreRole={updateStoreRoleRow}
              onArchiveStoreRole={archiveStoreRoleRow} onUnarchiveStoreRole={unarchiveStoreRoleRow}
              onCopyStoreStructure={copyStructureFromStore}
              currentUser={currentUser}
            />}
            {effectiveActiveView === "time-attend"    && <TimeAttendanceView
              brands={visibleBrands} stores={stores} visibleStoreIds={visibleStoreIds} opsTeam={opsTeam} schedules={schedules}
              punchRecords={punchRecords} currentUser={currentUser}
              onUpdate={handleAmendPunch} onAdd={handlePunchIn} onDelete={removeSchedulePunchRecord}
              onAddComment={handleAddPunchComment}
            />}
            {effectiveActiveView === "admin"          && currentUser.role === "owner" && <AdminPanelView
              brands={brands} users={users} entries={entries}
              stores={stores} flipdishStores={flipdishStores}
              onAddBrand={addBrand} onUpdateBrand={updateBrand} onDeleteBrand={deleteBrand}
              onAddUser={addUser} onUpdateUser={updateUser} onDeleteUser={deleteUser}
              onAddStore={addStore} onUpdateStore={updateStoreRow} onDeleteStore={deleteStoreRow}
              onLinkFlipdish={linkFlipdishToStore} onUnlinkFlipdish={unlinkFlipdishFromStore}
              onBackfillStoreSales={backfillStoreSales}
              onUpdateKPITargets={updateKPITargets} onBulkImport={handleBulkImport}
            />}
            {effectiveActiveView === "comms" && <CommunicationView
              currentUser={currentUser} brands={visibleBrands} stores={stores} opsTeam={opsTeam} users={users}
              messages={messages} onSend={sendMessage} onMarkRead={handleMarkRead}
              tickets={hdTickets} onAddTicket={addHdTicket} onUpdateTicket={updateHdTicket} onDeleteTicket={deleteHdTicket}
              availability={availability} onAddAvailability={addAvailability} onUpdateAvailability={updateAvailability}
              schedules={schedules} shiftPresets={shiftPresets} onAddSchedule={addSchedule} onDeleteSchedule={deleteSchedule} onPublishWeek={handlePublishWeek}
              punchRecords={punchRecords} onUpdatePunchRecord={handleAmendPunch}
              onUpdateBrand={updateBrand}
              isEmployee={false}
            />}
          </main>
        </div>
        {/* Toast */}
        {toast && (
          <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-2xl flex items-center gap-3 ${toast.type==="error"?"bg-red-600 text-white":"bg-emerald-600 text-white"}`}>
            {toast.type==="error"?"✗":"✓"} {toast.msg}
          </div>
        )}
      </div>
    </AuthContext.Provider>
  );
}
