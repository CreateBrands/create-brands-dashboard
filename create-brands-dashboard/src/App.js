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
  fetchOpsTeam, upsertOpsTeamMember, removeOpsTeamMember,
  fetchTempLogs, insertTempLog,
  fetchDeliveries, insertDelivery,
  fetchChecklistStates, upsertChecklistState,
  fetchAuditTrail, insertAuditEntry, clearAuditTrail,
  fetchAvailability, insertAvailability, upsertAvailability, removeAvailability,
  fetchHelpdeskTickets, insertHelpdeskTicket, upsertHelpdeskTicket, removeHelpdeskTicket,
  fetchInboxMessages, insertInboxMessage, markMessageRead,
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
  Thermometer, Truck, Clipboard, ShieldCheck, ScrollText, ListChecks, Hash, UserCheck,
  LifeBuoy, Inbox, Send, Bell, ChevronUp, ChevronDown as ChevronDownIcon, UserPlus, AtSign
} from "lucide-react";

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
    green: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    red: "bg-red-500/20 text-red-400 border border-red-500/30",
    amber: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
    slate: "bg-slate-700 text-slate-300 border border-slate-600",
    indigo: "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30",
    violet: "bg-violet-500/20 text-violet-400 border border-violet-500/30",
    emerald: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${colors[color] || colors.slate}`}>{label}</span>;
}

function RoleBadge({ role }) {
  return role === "owner" ? <Badge label="Owner" color="violet" /> : <Badge label="Manager" color="indigo" />;
}

function StatCard({ label, value, sub, icon: Icon, accent = "indigo", alert = false }) {
  const accents = {
    indigo: "from-indigo-600/20 to-indigo-600/5 border-indigo-500/30",
    emerald: "from-emerald-600/20 to-emerald-600/5 border-emerald-500/30",
    amber: "from-amber-600/20 to-amber-600/5 border-amber-500/30",
    red: "from-red-600/20 to-red-600/5 border-red-500/30",
    slate: "from-slate-700/40 to-slate-700/10 border-slate-600/30",
  };
  const iconColors = { indigo: "text-indigo-400", emerald: "text-emerald-400", amber: "text-amber-400", red: "text-red-400", slate: "text-slate-400" };
  const eff = alert ? "red" : accent;
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${accents[eff]} border p-5 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{label}</span>
        {Icon && <Icon size={16} className={iconColors[eff]} />}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function AnalysisBlock({ title, children, className = "", action }) {
  return (
    <div className={`rounded-2xl bg-slate-900/60 border border-slate-700/60 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
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
      <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-semibold ${isPositive ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
        {isPositive ? <TrendingUp size={10}/> : <TrendingDown size={10}/>} {sign}{delta.toFixed(1)}% vs {prevLabel}
      </span>
    );
  }
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-2 ${alert ? "bg-red-950/30 border-red-500/30" : "bg-slate-900/60 border-slate-700/60"}`}>
      <div className="flex items-center gap-2">
        {Icon && <Icon size={13} className="text-slate-400" />}
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
      <div className={`text-xl font-bold ${alert ? "text-red-400" : "text-white"}`}>{currentVal}</div>
      {subCurrent && <div className="text-xs text-slate-500">{subCurrent}</div>}
      {deltaEl}
      {previousVal && (
        <div className="border-t border-slate-700/60 pt-2 mt-1 text-xs text-slate-500">
          Prior: <span className="text-slate-400 font-medium">{previousVal}</span>
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
      <ChevronDownIcon size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
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
                <button onClick={downloadTemplate} className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors">
                  <FileSpreadsheet size={15}/> Download Blank Template
                </button>
              </div>
              <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-4 space-y-2">
                <div className="font-semibold text-indigo-300 text-sm flex items-center gap-2"><Info size={13}/>How to import historical data</div>
                <ul className="text-xs text-slate-400 space-y-1 list-disc ml-4">
                  <li>Download the blank template and fill in one EOD entry per row</li>
                  <li>Accepts <strong className="text-slate-300">.xlsx</strong> or <strong className="text-slate-300">.csv</strong></li>
                  <li>Required columns: Date, Brand ID, Net Sales, Labour Cost, COGS, Total Hours, Total Orders</li>
                  <li>Brand IDs: <span className="font-mono text-slate-300">{brands.map(b => b.id).join(", ")}</span></li>
                  <li>Same date + brand ID will overwrite any existing entry</li>
                </ul>
              </div>
              <div onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl p-10 text-center cursor-pointer transition-colors group">
                <Upload size={28} className="mx-auto text-slate-600 group-hover:text-indigo-400 mb-3 transition-colors"/>
                <div className="text-sm text-slate-400 group-hover:text-slate-300">{loading ? "Reading file…" : "Click to upload .xlsx or .csv"}</div>
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
                <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-4 space-y-1">
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
                    <span className="text-sm text-slate-300 font-semibold">{preview.length} valid rows ready to import</span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-700">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-slate-800/80">
                        {["Date","Brand","Net Sales","Labour","COGS","Hours","Orders","ATV","5★","2-4★","1★"].map(h =>
                          <th key={h} className="px-3 py-2 text-left text-slate-400 font-semibold whitespace-nowrap">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {preview.slice(0, 10).map((r, i) => (
                          <tr key={i} className="border-t border-slate-800 hover:bg-slate-800/40">
                            <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{r.date}</td>
                            <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{r.brandName || r.brandId}</td>
                            <td className="px-3 py-2 text-slate-300">{fmtCurrency(r.netSales)}</td>
                            <td className="px-3 py-2 text-slate-300">{fmtCurrency(r.laborCost)}</td>
                            <td className="px-3 py-2 text-slate-300">{fmtCurrency(r.cogsCost)}</td>
                            <td className="px-3 py-2 text-slate-300">{r.totalHours}</td>
                            <td className="px-3 py-2 text-slate-300">{r.totalOrders}</td>
                            <td className="px-3 py-2 text-slate-300">{fmtCurrency(r.atv)}</td>
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
              {preview.length === 0 && <div className="text-center text-slate-400 text-sm py-4">No valid rows found. Fix the errors and re-upload.</div>}
            </>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle size={28} className="text-emerald-400"/>
              </div>
              <div className="text-base font-bold text-white">Import Complete</div>
              <div className="text-sm text-slate-400">{preview.length} EOD entries imported successfully.</div>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-slate-700">
          {step === "upload" && <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors">Close</button>}
          {step === "preview" && (
            <>
              <button onClick={() => { setStep("upload"); setPreview([]); setErrors([]); }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors">Re-upload</button>
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
              <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Location</label>
              <div className="flex flex-wrap gap-2">
                {visibleBrands.map(b => (
                  <button key={b.id} onClick={() => set("brandId", b.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${form.brandId === b.id ? "text-white border-transparent" : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"}`}
                    style={form.brandId === b.id ? { background: b.color } : {}}>
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Type</label>
            <div className="flex gap-2">
              {ISSUE_TYPES.map(t => (
                <button key={t} onClick={() => set("type", t)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${form.type === t ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"}`}>
                  {t === "Issue" ? "🔴 Issue" : "🔧 Maintenance"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Title *</label>
            <input value={form.title} onChange={e => set("title", e.target.value)} placeholder={form.type === "Maintenance" ? "Brief description of the maintenance task" : "Brief description of the issue"} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Full Description</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="Provide full details, location within the venue, impact on operations…" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Category</label>
              <select value={form.category} onChange={e => set("category", e.target.value)} className={selCls}>
                {ISSUE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Priority</label>
              <select value={form.priority} onChange={e => set("priority", e.target.value)} className={selCls}>
                {ISSUE_PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          {isEdit && (
            <>
              <div>
                <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Status</label>
                <select value={form.status} onChange={e => set("status", e.target.value)} className={selCls}>
                  {ISSUE_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Assigned To</label>
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
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors">Cancel</button>
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
              <div className="text-xs text-slate-400 font-semibold mb-2 uppercase tracking-widest">Description</div>
              <div className="text-sm text-slate-300 bg-slate-800/40 rounded-xl p-3 border border-slate-700/40">{issue.description}</div>
            </div>
          )}

          {/* Status Control */}
          <div>
            <div className="text-xs text-slate-400 font-semibold mb-2 uppercase tracking-widest">Status</div>
            <div className="flex flex-wrap gap-2">
              {ISSUE_STATUSES.map(s => {
                const cfg = STATUS_CONFIG[s];
                const SIcon = cfg.icon;
                return (
                  <button key={s} onClick={() => handleStatusChange(s)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${status === s ? `bg-${cfg.color}-600 border-${cfg.color}-500 text-white` : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"}`}
                    style={status === s ? { background: { red:"#dc2626", amber:"#d97706", indigo:"#4f46e5", emerald:"#059669", slate:"#475569" }[cfg.color], borderColor: "transparent" } : {}}>
                    <SIcon size={11}/>{s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Assignment */}
          <div>
            <div className="text-xs text-slate-400 font-semibold mb-2 uppercase tracking-widest">Assigned To</div>
            <div className="flex gap-2">
              <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
                className="flex-1 bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none">
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
            <div className="text-xs text-slate-400 font-semibold mb-2 uppercase tracking-widest">Comments & Updates ({localIssue.comments?.length || 0})</div>
            <div className="space-y-2 mb-3">
              {(localIssue.comments || []).length === 0 && <div className="text-xs text-slate-600 py-2">No comments yet</div>}
              {(localIssue.comments || []).map(c => (
                <div key={c.id} className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-slate-300">{c.author}</span>
                    <span className="text-xs text-slate-600">{new Date(c.createdAt).toLocaleString("en-GB", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })}</span>
                  </div>
                  <div className="text-xs text-slate-400">{c.text}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment or update…" onKeyDown={e => e.key === "Enter" && handleAddComment()}
                className="flex-1 bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none" />
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
function IssuesView({ brands, issues, users, currentUser, onAddIssue, onUpdateIssue, onDeleteIssue }) {
  const { user } = useAuth();
  const visibleBrands = brands.filter(b => user.role === "owner" || user.brandIds.includes(b.id));
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterBrand, setFilterBrand] = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [newIssueType, setNewIssueType] = useState("Issue");
  const [detailIssue, setDetailIssue] = useState(null);
  const [editIssue, setEditIssue] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const visibleIssues = issues.filter(issue => {
    if (!visibleBrands.some(b => b.id === issue.brandId)) return false;
    if (filterStatus !== "All" && issue.status !== filterStatus) return false;
    if (filterBrand !== "All" && issue.brandId !== filterBrand) return false;
    if (filterPriority !== "All" && issue.priority !== filterPriority) return false;
    if (filterType !== "All" && (issue.type || "Issue") !== filterType) return false;
    return true;
  }).sort((a, b) => {
    const pOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const statusCounts = ISSUE_STATUSES.reduce((acc, s) => { acc[s] = issues.filter(i => visibleBrands.some(b => b.id === i.brandId) && i.status === s).length; return acc; }, {});

  const filterBtnCls = (active) => `px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${active ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {ISSUE_STATUSES.map(s => {
          const cfg = STATUS_CONFIG[s];
          const SIcon = cfg.icon;
          const colorMap = { red: "from-red-600/20 to-red-600/5 border-red-500/30 text-red-400", amber: "from-amber-600/20 to-amber-600/5 border-amber-500/30 text-amber-400", indigo: "from-indigo-600/20 to-indigo-600/5 border-indigo-500/30 text-indigo-400", emerald: "from-emerald-600/20 to-emerald-600/5 border-emerald-500/30 text-emerald-400", slate: "from-slate-700/40 to-slate-700/10 border-slate-600/30 text-slate-400" };
          return (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? "All" : s)}
              className={`rounded-2xl bg-gradient-to-br border p-4 text-left transition-all ${colorMap[cfg.color]} ${filterStatus === s ? "ring-2 ring-white/20" : ""}`}>
              <div className="flex items-center justify-between mb-2">
                <SIcon size={14} />
                <span className="text-2xl font-bold text-white">{statusCounts[s]}</span>
              </div>
              <div className="text-xs font-semibold text-slate-400">{s}</div>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFilterType("All")} className={filterBtnCls(filterType === "All")}>All Types</button>
            <button onClick={() => setFilterType("Issue")} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${filterType === "Issue" ? "bg-red-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>🔴 Issues</button>
            <button onClick={() => setFilterType("Maintenance")} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${filterType === "Maintenance" ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>🔧 Maintenance</button>
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
          <LocationDropdown brands={visibleBrands} value={filterBrand} onChange={setFilterBrand} allLabel="All Locations" className="w-44"/>
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
          const sc = STATUS_CONFIG[issue.status];
          const pc = PRIORITY_CONFIG[issue.priority];
          const SIcon = sc?.icon || AlertCircle;
          const statusColors = { red: "#dc2626", amber: "#d97706", indigo: "#4f46e5", emerald: "#059669", slate: "#475569" };

          return (
            <div key={issue.id} className="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-4 hover:border-slate-600 transition-all">
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
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: brand.color }} />{brand.name}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-white">{issue.title}</div>
                      {issue.description && <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">{issue.description}</div>}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                        <span>by {issue.reportedBy}</span>
                        <span>{new Date(issue.createdAt).toLocaleDateString("en-GB", { day:"numeric", month:"short" })}</span>
                        {issue.assignedTo && <span className="text-indigo-400">→ {issue.assignedTo}</span>}
                        {(issue.comments?.length || 0) > 0 && <span className="flex items-center gap-1"><MessageSquare size={10}/>{issue.comments.length}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => setDetailIssue(issue)} className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors">View</button>
                      <button onClick={() => setEditIssue(issue)} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"><Edit size={13}/></button>
                      {user.role === "owner" && (
                        <button onClick={() => setDeleteId(issue.id)} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors"><Trash2 size={13}/></button>
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
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0"><AlertTriangle size={18} className="text-red-400"/></div>
              <div className="text-sm text-slate-300">Delete this issue? This cannot be undone.</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors">Cancel</button>
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
          <p className="text-slate-400 text-sm mt-1">Select your name and enter your PIN</p>
        </div>

        {!selectedMember ? (
          /* ── Step 1: Pick name ── */
          <div className="space-y-4">
            {byBrand.map(({ brand: b, members }) => (
              <div key={b.id}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: b.color }}/>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{b.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {members.map(m => (
                    <button key={m.id} onClick={() => { setSelectedMember(m); setPin(""); setError(""); }}
                      className="flex items-center gap-3 bg-slate-900/80 border border-slate-700/60 hover:border-indigo-500/50 hover:bg-slate-800/80 rounded-2xl p-4 transition-all text-left group">
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
            <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-700/60 rounded-2xl p-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold flex-shrink-0"
                style={{ background: (selectedMember.color || "#6366f1") + "30", color: selectedMember.color || "#6366f1" }}>
                {selectedMember.firstName[0]}{selectedMember.lastName?.[0] || ""}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold text-white">{selectedMember.firstName} {selectedMember.lastName}</div>
                <div className="text-xs text-slate-400">{selectedMember.role} · {brand?.name}</div>
              </div>
              <button onClick={handleClear} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
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
                        ? "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
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
          <button onClick={onSwitchToManager} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
            Manager / Owner sign in →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Employee Shell ───────────────────────────────────────────────────────────
// Restricted layout shown to employees — only ops-relevant views, no financial data.
function EmployeeShell({ currentUser, brands, opsTeam, assignments, checklists, tempUnits,
  cleaningTasks, auditTrail, checklistStates, tempLogs, deliveries, issues,
  onSignOff, onChecklistItemToggle, onTempLog, onDeliveryAdd, onAddIssue, onUpdateIssue,
  hdTickets, onAddHdTicket, onUpdateHdTicket, messages, onSendMessage, onMarkRead,
  availability, onAddAvailability,
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
    { key: "availability", label: "Availability", icon: Calendar },
    { key: "comms", label: "Communication", icon: MessageSquare, badge: (() => {
        const myId = currentUser.id; const myOpsId = currentUser.opsTeamMemberId || currentUser.id;
        const hdOpen = (hdTickets || []).filter(t => t.createdById === myOpsId && t.status !== "Closed").length;
        const unread = (messages || []).filter(m => {
          if (m.fromId === myId || m.fromId === myOpsId) return false;
          if (m.toScope === "all_locations") return true;
          if (m.toScope === "location" && currentUser.brandIds.includes(m.toBrandId)) return true;
          if (m.toScope === "individual" && (m.toPersonId === myId || m.toPersonId === myOpsId)) return true;
          return false;
        }).filter(m => !m.readBy?.includes(myId)).length;
        const total = hdOpen + unread; return total > 0 ? total.toString() : null;
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
  };

  const NavBar = () => (
    <nav className="flex items-center gap-1 overflow-x-auto px-3 py-2 bg-slate-900/80 border-b border-slate-800">
      {NAV.map(n => {
        const NIcon = n.icon; const active = activeView === n.key;
        return (
          <button key={n.key} onClick={() => { setActiveView(n.key); setDrawerOpen(false); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 relative ${active ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}>
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
        <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/80 sticky top-0 z-10">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <BarChart2 size={15} className="text-white"/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white truncate">{currentUser.name}</div>
            <div className="text-xs text-slate-500">{currentUser.employeeRole} · {brand?.name || "—"}</div>
          </div>
          <div className="flex items-center gap-2">
            {brand && <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300"><span className="w-1.5 h-1.5 rounded-full" style={{ background: brand.color }}/>{brand.name}</span>}
            <button onClick={onLogout} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-950/30 text-xs font-semibold transition-all">
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
              brands={myBrands} assignments={assignments} auditTrail={auditTrail}
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
          {activeView === "availability" && (
            <EmployeeAvailabilityView
              brands={myBrands} currentUser={currentUser}
              availability={availability || []} onAdd={onAddAvailability}
            />
          )}
          {activeView === "comms" && (
            <CommunicationView
              currentUser={currentUser} brands={myBrands} opsTeam={opsTeam} users={[]}
              messages={messages || []} onSend={onSendMessage} onMarkRead={onMarkRead}
              tickets={hdTickets || []} onAddTicket={onAddHdTicket} onUpdateTicket={onUpdateHdTicket} onDeleteTicket={() => {}}
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
          <p className="text-xs text-slate-400 mt-0.5">Let your manager know about anything that needs attention</p>
        </div>
        <button onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors">
          <Plus size={14}/> {showForm ? "Cancel" : "New Report"}
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900/80 border border-slate-700/60 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white">New Issue Report</h3>
          {brands.length > 1 && (
            <div><label className={labelCls}>Location</label>
              <div className="flex flex-wrap gap-2">{brands.map(b => <button key={b.id} onClick={() => set("brandId", b.id)} className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${form.brandId === b.id ? "text-white border-transparent" : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"}`} style={form.brandId === b.id ? { background: b.color } : {}}>{b.name}</button>)}</div>
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
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Your Recent Reports</div>
          <div className="space-y-3">
            {myIssues.slice(0, 10).map(issue => (
              <div key={issue.id} className="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-4">
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
                {issue.description && <div className="text-xs text-slate-400 mt-2 line-clamp-2">{issue.description}</div>}
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
          <p className="text-slate-400 text-sm mt-1">Portfolio Dashboard</p>
        </div>
        <div className="bg-slate-900/80 border border-slate-700/60 rounded-2xl p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-950/50 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 text-sm">
              <AlertTriangle size={14}/> {error}
            </div>
          )}
          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@createbrands.co.uk"
              className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition-colors" />
          </div>
          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Password</label>
            <div className="relative">
              <input value={password} onChange={e => setPassword(e.target.value)} type={showPass ? "text" : "password"} placeholder="••••••••"
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition-colors pr-10" />
              <button onClick={() => setShowPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
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
            <button onClick={onSwitchToEmployee} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
              ← Back to team sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard View ───────────────────────────────────────────────────────────
function DashboardView({ brands, entries, issues }) {
  const { user } = useAuth();
  const visibleBrands = brands.filter(b => user.role === "owner" || user.brandIds.includes(b.id));
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
        <StatCard label="Today's Revenue" value={todayAgg ? fmtCurrency(todayAgg.netSales) : "No Data"} sub={`${todayEntries.length} reports`} icon={DollarSign} accent="indigo" />
        <StatCard label="Prime Cost %" value={useLatest ? fmtPct(useLatest.primeCost) : "—"} sub="Labour + COGS" icon={Activity} accent={useLatest && useLatest.primeCost > 60 ? "red" : "emerald"} alert={useLatest && useLatest.primeCost > 60} />
        <StatCard label="Open Issues" value={openIssues} sub={criticalIssues > 0 ? `${criticalIssues} critical` : "All under control"} icon={AlertCircle} accent={criticalIssues > 0 ? "red" : "slate"} alert={criticalIssues > 0} />
        <StatCard label="SPLH" value={useLatest ? fmtSPLH(useLatest.splh) : "—"} sub="Sales per labour hr" icon={Zap} accent="amber" />
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
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ background: d.color }} /><span className="text-slate-400">{d.name}</span></div>
                <span className="text-slate-300 font-semibold">{fmtCurrency(d.value)}</span>
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
                <div key={issue.id} className="flex items-center gap-3 py-2 border-b border-slate-700/40 last:border-0">
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
function TacticalOpsView({ brands, entries, issues, users, onAddIssue, onUpdateIssue, onDeleteIssue }) {
  const { user } = useAuth();
  const visibleBrands = brands.filter(b => user.role === "owner" || user.brandIds.includes(b.id));
  const [selectedBrandId, setSelectedBrandId] = useState(visibleBrands[0]?.id || "");
  const [preset, setPreset] = useState("this_week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [tickets, setTickets] = useState({});
  const [ticketText, setTicketText] = useState("");
  const [ticketPriority, setTicketPriority] = useState("Medium");
  const [detailTicket, setDetailTicket] = useState(null);
  const [editTicket, setEditTicket] = useState(null);

  // Derive maintenance tickets from issues prop (same source of truth as Issues & Maintenance page)
  useEffect(() => {
    if (!selectedBrandId || !issues) return;
    const brandMaintenance = issues
      .filter(i => i.brandId === selectedBrandId && (i.type || "Issue") === "Maintenance")
      .map(i => ({ id: i.id, brandId: i.brandId, text: i.title, priority: i.priority, done: ["Resolved","Closed"].includes(i.status), createdAt: i.createdAt, _issueRef: i }));
    setTickets(t => ({ ...t, [selectedBrandId]: brandMaintenance }));
  }, [selectedBrandId, issues]);

  const selectedBrand = visibleBrands.find(b => b.id === selectedBrandId);
  const period = resolvePeriod(preset, customFrom, customTo);
  const prevPeriod = resolvePrevPeriod(preset, customFrom, customTo);
  const brandEntries = entries.filter(e => e.brandId === selectedBrandId);
  const curFiltered = filterEntries(brandEntries, period.from, period.to);
  const prevFiltered = prevPeriod ? filterEntries(brandEntries, prevPeriod.from, prevPeriod.to) : [];
  const cur = aggregateEntries(curFiltered);
  const prev = aggregateEntries(prevFiltered);
  const dayCount = curFiltered.length;
  const target = selectedBrand?.kpiTargets;
  const totalTarget = target ? target.dailyRevenue * dayCount : 0;
  const targetProgress = totalTarget > 0 && cur ? (cur.netSales / totalTarget) * 100 : 0;

  const chartData = useMemo(() => {
    return Array.from({ length: Math.max(curFiltered.length, prevFiltered.length) }, (_, i) => {
      const ce = curFiltered[i]; const pe = prevFiltered[i];
      return { idx: `Day ${i+1}`, curSales: ce?.netSales || null, prevSales: pe?.netSales || null, curSPLH: ce ? ce.netSales/(ce.totalHours||1) : null, prevSPLH: pe ? pe.netSales/(pe.totalHours||1) : null };
    });
  }, [curFiltered, prevFiltered]);

  const primeCostDays = curFiltered.map(e => ({ date: e.date.slice(5), primeCost: ((e.laborCost+e.cogsCost)/(e.netSales||1))*100 }));
  const brandTickets = tickets[selectedBrandId] || [];
  const brand = selectedBrand;

  const addTicket = async (text, priority) => {
    const now = new Date().toISOString();
    const issue = {
      id: `maint-${Date.now()}`,
      brandId: selectedBrandId,
      brandName: brand?.name || "",
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
    // tickets state will auto-update via the useEffect watching issues prop
  };

  const toggleTicket = async (id) => {
    const ticket = brandTickets.find(tk => tk.id === id);
    if (!ticket) return;
    const newStatus = ticket.done ? "Open" : "Resolved";
    await onUpdateIssue({ ...ticket._issueRef, status: newStatus, updatedAt: new Date().toISOString() });
    // tickets state will auto-update via the useEffect watching issues prop
  };

  const deleteTicket = async (id) => {
    await onDeleteIssue(id);
    // tickets state will auto-update via the useEffect watching issues prop
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <LocationDropdown brands={visibleBrands} value={selectedBrandId} onChange={setSelectedBrandId} className="w-44"/>
        <PeriodFilterBar preset={preset} onPreset={setPreset} customFrom={customFrom} customTo={customTo} onCustomFrom={setCustomFrom} onCustomTo={setCustomTo}/>
      </div>

      {selectedBrand && (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl px-5 py-3 flex flex-wrap items-center gap-4">
          <span className="text-sm font-bold text-white">{period.label}</span>
          <span className="text-xs text-slate-500">{period.from} → {period.to}</span>
          <span className="text-xs text-slate-400">{dayCount} reports</span>
          {target && <span className="text-xs text-slate-400">Daily target: {fmtCurrency(target.dailyRevenue)}</span>}
          {!prevFiltered.length && <Badge label="No prior data" color="amber" />}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ComparisonKPICard label="Net Revenue" current={cur?.netSales} previous={prev?.netSales} format="currency" icon={DollarSign} prevLabel={prevPeriod?.label} />
        <ComparisonKPICard label="Target Progress" current={targetProgress||null} previous={null} format="percent" icon={Target} alert={targetProgress>0&&targetProgress<80} />
        <ComparisonKPICard label="Prime Cost %" current={cur?.primeCost} previous={prev?.primeCost} format="percent" icon={Activity} invertDelta alert={cur&&target&&cur.primeCost>target.primeCostMax} prevLabel={prevPeriod?.label} />
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
                  <div className="text-xs text-slate-400 mb-1">{i===0?period.label:prevPeriod?.label||"Prior"}: {fmtCurrency(total)}</div>
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
              {target && <ReferenceLine y={target.primeCostMax} stroke="#ef4444" strokeDasharray="4 2" label={{value:`Max ${target.primeCostMax}%`,fill:"#ef4444",fontSize:10}}/>}
              <Bar dataKey="primeCost" name="Prime Cost %" radius={[3,3,0,0]}>
                {primeCostDays.map((d,i) => <Cell key={i} fill={target&&d.primeCost>target.primeCostMax?"#ef4444":"#6366f1"}/>)}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </AnalysisBlock>
      )}

      <AnalysisBlock title="Maintenance Ticketing Desk" action={<Badge label={selectedBrand?.name||""} color="slate"/>}>
        <div className="flex gap-2 mb-4 flex-wrap">
          <input value={ticketText} onChange={e=>setTicketText(e.target.value)} placeholder="Describe the issue…" className="flex-1 min-w-48 bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"/>
          <select value={ticketPriority} onChange={e=>setTicketPriority(e.target.value)} className="bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none">
            <option>High</option><option>Medium</option><option>Low</option>
          </select>
          <button onClick={()=>{if(ticketText.trim()){addTicket(ticketText.trim(),ticketPriority);setTicketText("");}}} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2 text-sm font-semibold flex items-center gap-1.5 transition-colors"><Plus size={14}/>Add</button>
        </div>
        {brandTickets.length===0&&<div className="text-slate-500 text-sm text-center py-4">No tickets raised</div>}
        <div className="space-y-2">
          {brandTickets.map(tk=>(
            <div key={tk.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${tk.done?"bg-slate-900/20 border-slate-700/30 opacity-50":"bg-slate-900/60 border-slate-700/60"}`}>
              <button onClick={()=>toggleTicket(tk.id)} className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${tk.done?"bg-emerald-600 border-emerald-500":"border-slate-600 hover:border-emerald-500"}`}>{tk.done&&<Check size={12} className="text-white"/>}</button>
              <span className={`flex-1 text-sm ${tk.done?"line-through text-slate-500":"text-slate-300"}`}>{tk.text}</span>
              {tk._issueRef?.assignedTo && <span className="text-xs text-indigo-400 hidden sm:block">→ {tk._issueRef.assignedTo}</span>}
              <Badge label={tk.priority} color={tk.priority==="Critical"?"red":tk.priority==="High"?"amber":tk.priority==="Medium"?"indigo":"slate"}/>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={()=>setDetailTicket(tk._issueRef)} className="px-2 py-1 rounded-lg bg-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-600 transition-colors">View</button>
                <button onClick={()=>setEditTicket(tk._issueRef)} className="p-1.5 rounded-lg bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600 transition-colors"><Edit size={12}/></button>
                <button onClick={()=>deleteTicket(tk.id)} className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors"><Trash2 size={12}/></button>
              </div>
            </div>
          ))}
        </div>
      </AnalysisBlock>

      {/* Modals */}
      {detailTicket && <IssueDetailModal issue={detailTicket} brands={brands} users={users} currentUser={user} onUpdate={updated => { onUpdateIssue(updated); setDetailTicket(updated); }} onClose={() => setDetailTicket(null)} />}
      {editTicket && <IssueFormModal issue={editTicket} brands={brands} users={users} currentUser={user} visibleBrands={visibleBrands} onSave={updated => { onUpdateIssue(updated); setEditTicket(null); }} onClose={() => setEditTicket(null)} />}
    </div>
  );
}

// ─── EOD Form ─────────────────────────────────────────────────────────────────
function EODFormView({ brands, onAddEntry }) {
  const { user } = useAuth();
  const visibleBrands = brands.filter(b => user.role === "owner" || user.brandIds.includes(b.id));
  const [zone, setZone] = useState(0);
  const [success, setSuccess] = useState(false);
  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    brandId: visibleBrands[0]?.id || "", date: today, manager: user.name, submittedBy: user.name,
    netSales: "", cardRevenue: "", cashExpected: "", physicalCash: "", varianceJustification: "",
    openingFloat: 200, closingFloat: 200,
    totalOrders: "", atv: "",
    fiveStarReviews: "", midStarReviews: "", oneStarReviews: "",
    laborCost: "", cogsCost: "", totalHours: "", notes: ""
  });

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

  const selectedBrand = visibleBrands.find(b => b.id === form.brandId);
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
    if (hasVariance && !form.varianceJustification.trim()) { alert("Please provide a variance justification."); return; }
    const entry = {
      id: `${form.brandId}-${form.date}-${Date.now()}`,
      brandId: form.brandId, brandName: selectedBrand?.name || "", date: form.date,
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
      setForm({ brandId: visibleBrands[0]?.id||"", date: today, manager: user.name, submittedBy: user.name, netSales:"", cardRevenue:"", cashExpected:"", physicalCash:"", varianceJustification:"", openingFloat:200, closingFloat:200, totalOrders:"", atv:"", fiveStarReviews:"", midStarReviews:"", oneStarReviews:"", laborCost:"", cogsCost:"", totalHours:"", notes:"" });
    }, 2500);
  };

  if (success) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center"><CheckCircle size={32} className="text-emerald-400"/></div>
      <div className="text-xl font-bold text-white">Report Submitted</div>
      <div className="text-slate-400 text-sm">EOD entry saved. Resetting form…</div>
    </div>
  );

  const inputCls = "w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition-colors";
  const labelCls = "text-xs text-slate-400 font-semibold mb-1.5 block";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex gap-2">
        {zones.map((z,i) => (
          <button key={i} onClick={() => i < zone && setZone(i)}
            className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${i===zone?"bg-indigo-600 text-white":i<zone?"bg-emerald-600/30 text-emerald-400 cursor-pointer hover:bg-emerald-600/40":"bg-slate-800 text-slate-500"}`}>
            {i<zone&&<span className="mr-1">✓</span>}{z}
          </button>
        ))}
      </div>

      <div className="bg-slate-900/80 border border-slate-700/60 rounded-2xl p-6 space-y-4">
        {/* Zone 1 */}
        {zone === 0 && (
          <>
            <h2 className="text-base font-bold text-white mb-2">Zone 1 — Identity</h2>
            <div>
              <div className={labelCls}>Location</div>
              <div className="flex flex-wrap gap-2">
                {visibleBrands.map(b => (
                  <button key={b.id} onClick={() => set("brandId",b.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${form.brandId===b.id?"text-white border-transparent":"bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"}`}
                    style={form.brandId===b.id?{background:b.color}:{}}>
                    {b.name}
                  </button>
                ))}
              </div>
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
              <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-4">
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
                <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-400">{total} total reviews</span>
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
                <div className={`rounded-xl border p-3 ${primeCostPct>(selectedBrand?.kpiTargets?.primeCostMax||60)?"bg-red-950/30 border-red-500/30":"bg-emerald-950/30 border-emerald-500/30"}`}>
                  <div className="text-xs text-slate-400 mb-1">Prime Cost %</div>
                  <div className={`text-lg font-bold ${primeCostPct>(selectedBrand?.kpiTargets?.primeCostMax||60)?"text-red-400":"text-emerald-400"}`}>{primeCostPct.toFixed(1)}%</div>
                </div>
                <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-xl p-3">
                  <div className="text-xs text-slate-400 mb-1">SPLH</div>
                  <div className="text-lg font-bold text-indigo-400">{fmtSPLH(splh)}</div>
                </div>
              </div>
            )}
            <div><label className={labelCls}>Shift Notes</label><textarea value={form.notes} onChange={e=>set("notes",e.target.value)} className={`${inputCls} h-24 resize-none`} placeholder="Any notable events, incidents or handover notes…"/></div>
          </>
        )}
      </div>

      <div className="flex gap-3">
        {zone > 0 && <button onClick={()=>setZone(z=>z-1)} className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors flex items-center gap-2"><ChevronLeft size={14}/>Back</button>}
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
              <div className="text-sm text-slate-300">{f.label}</div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500">{f.unit}</span>
                <input type="number" value={t[f.key]} step={f.step} onChange={e=>setT(p=>({...p,[f.key]:parseFloat(e.target.value)||0}))}
                  className="w-24 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-white text-right focus:border-indigo-500 focus:outline-none"/>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-slate-700">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors">Cancel</button>
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
  const [dailyRevenue, setDailyRevenue] = useState(brand?.kpiTargets?.dailyRevenue||3000);
  const icons = [{key:"Utensils",label:"Restaurant"},{key:"Moon",label:"Bar"},{key:"Coffee",label:"Café"},{key:"Building2",label:"Other"}];
  const colors = ["#6366f1","#10b981","#f59e0b","#ef4444","#ec4899","#14b8a6","#f97316","#8b5cf6"];
  const BIcon = ICON_MAP[iconKey]||Building2;
  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ id:brand?.id||`brand-${Date.now()}`, name:name.trim(), address, iconKey, color, kpiTargets:{...(brand?.kpiTargets||{primeCostMax:60,laborPctMax:30,cogsPctMax:32,netMarginMin:35,splhMin:45,avgStarMin:4.0,cashVarianceMax:25}),dailyRevenue:parseFloat(dailyRevenue)||3000} });
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h3 className="font-bold text-white">{isCreate?"Add Location":`Edit — ${brand.name}`}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
          <div><label className="text-xs text-slate-400 font-semibold mb-1.5 block">Name *</label><input value={name} onChange={e=>setName(e.target.value)} className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"/></div>
          <div><label className="text-xs text-slate-400 font-semibold mb-1.5 block">Address</label><input value={address} onChange={e=>setAddress(e.target.value)} className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"/></div>
          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Icon</label>
            <div className="flex gap-2 flex-wrap">
              {icons.map(ic=>{const Ic=ICON_MAP[ic.key];return(<button key={ic.key} onClick={()=>setIconKey(ic.key)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${iconKey===ic.key?"bg-indigo-600 border-indigo-500 text-white":"bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"}`}><Ic size={13}/>{ic.label}</button>);})}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Colour</label>
            <div className="flex gap-2 flex-wrap">{colors.map(c=><button key={c} onClick={()=>setColor(c)} className={`w-8 h-8 rounded-xl border-2 transition-all ${color===c?"border-white scale-110":"border-transparent"}`} style={{background:c}}/>)}</div>
          </div>
          <div><label className="text-xs text-slate-400 font-semibold mb-1.5 block">Daily Revenue Target (£)</label><input type="number" value={dailyRevenue} onChange={e=>setDailyRevenue(e.target.value)} step={100} className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"/></div>
          <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:color+"30"}}><BIcon size={16} style={{color}}/></div>
            <div><div className="text-sm font-semibold text-white">{name||"Location Name"}</div><div className="text-xs text-slate-400">{address||"Address"}</div></div>
          </div>
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-slate-700">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!name.trim()} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-40 transition-colors">{isCreate?"Create":"Save"}</button>
        </div>
      </div>
    </div>
  );
}

function UserEditorModal({ user: editUser, brands, onSave, onClose }) {
  const isCreate = !editUser;
  const [name, setName] = useState(editUser?.name||"");
  const [email, setEmail] = useState(editUser?.email||"");
  const [password, setPassword] = useState(editUser?.password||"");
  const [showPass, setShowPass] = useState(false);
  const [role, setRole] = useState(editUser?.role||"manager");
  const [brandIds, setBrandIds] = useState(editUser?.brandIds||[]);
  const avatar = name.trim().split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2)||"??";
  const toggleBrand = id => setBrandIds(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);
  const handleSave = () => {
    if (!name.trim()||!email.trim()) return;
    onSave({ id:editUser?.id||`u-${Date.now()}`, name:name.trim(), email:email.trim(), password, role, brandIds:role==="owner"?brands.map(b=>b.id):brandIds, avatar });
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h3 className="font-bold text-white">{isCreate?"Add Manager":`Edit — ${editUser.name}`}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
          <div className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/40 rounded-xl p-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/30 text-indigo-300 flex items-center justify-center text-sm font-bold">{avatar}</div>
            <div><div className="text-sm font-semibold text-white">{name||"Full Name"}</div><div className="text-xs text-slate-400">{email||"email"}</div></div>
          </div>
          <div><label className="text-xs text-slate-400 font-semibold mb-1.5 block">Full Name *</label><input value={name} onChange={e=>setName(e.target.value)} className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"/></div>
          <div><label className="text-xs text-slate-400 font-semibold mb-1.5 block">Email *</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"/></div>
          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Password *</label>
            <div className="relative">
              <input type={showPass?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none pr-10"/>
              <button onClick={()=>setShowPass(p=>!p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">{showPass?<EyeOff size={14}/>:<Eye size={14}/>}</button>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Role</label>
            <div className="flex gap-2">
              {["manager","owner"].map(r=><button key={r} onClick={()=>setRole(r)} className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all capitalize ${role===r?"bg-indigo-600 border-indigo-500 text-white":"bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"}`}>{r}</button>)}
            </div>
          </div>
          {role==="manager"&&(
            <div>
              <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Location Access</label>
              <div className="space-y-2">
                {brands.map(b=>(
                  <button key={b.id} onClick={()=>toggleBrand(b.id)} className={`w-full flex items-center justify-between rounded-xl border px-3 py-2.5 transition-all ${brandIds.includes(b.id)?"bg-indigo-600/20 border-indigo-500/30":"bg-slate-800/60 border-slate-700/40 hover:bg-slate-700/60"}`}>
                    <span className="text-sm text-slate-300">{b.name}</span>
                    {brandIds.includes(b.id)&&<Check size={14} className="text-indigo-400"/>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-slate-700">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!name.trim()||!email.trim()} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-40 transition-colors">{isCreate?"Create":"Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
function AdminPanelView({ brands, users, entries, onAddBrand, onUpdateBrand, onDeleteBrand, onAddUser, onUpdateUser, onDeleteUser, onUpdateKPITargets, onBulkImport }) {
  const [tab, setTab] = useState("locations");
  const [kpiModal, setKpiModal] = useState(null);
  const [locModal, setLocModal] = useState(null);
  const [userModal, setUserModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [showImport, setShowImport] = useState(false);

  const tabs = [{key:"locations",label:"Locations"},{key:"managers",label:"Managers & Access"},{key:"kpis",label:"KPI Targets"}];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 bg-slate-900/60 border border-slate-700/60 rounded-2xl p-1.5">
          {tabs.map(t=><button key={t.key} onClick={()=>setTab(t.key)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab===t.key?"bg-indigo-600 text-white":"text-slate-400 hover:text-slate-200"}`}>{t.label}</button>)}
        </div>
        <button onClick={()=>setShowImport(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors">
          <FileSpreadsheet size={14}/> Bulk Import
        </button>
      </div>

      {tab==="locations"&&(
        <div className="space-y-4">
          <div className="flex justify-end"><button onClick={()=>setLocModal("new")} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"><Plus size={14}/>Add Location</button></div>
          {brands.map(b=>{
            const BIcon=ICON_MAP[b.iconKey]||Building2;
            const managerCount=users.filter(u=>u.role==="manager"&&u.brandIds.includes(b.id)).length;
            return(
              <div key={b.id} className="flex items-center gap-4 bg-slate-900/60 border border-slate-700/60 rounded-2xl px-5 py-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:b.color+"25"}}><BIcon size={18} style={{color:b.color}}/></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white">{b.name}</div>
                  <div className="text-xs text-slate-400">{b.address}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Target: {fmtCurrency(b.kpiTargets.dailyRevenue)}/day · {managerCount} manager{managerCount!==1?"s":""}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={()=>setKpiModal(b)} className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors">KPIs</button>
                  <button onClick={()=>setLocModal(b)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"><Edit size={14}/></button>
                  <button onClick={()=>setDeleteModal({msg:`Delete "${b.name}"? This cannot be undone.`,fn:()=>onDeleteBrand(b.id)})} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors"><Trash2 size={14}/></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab==="managers"&&(
        <div className="space-y-4">
          <div className="flex justify-end"><button onClick={()=>setUserModal("new")} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"><Plus size={14}/>Add Manager</button></div>
          {users.map(u=>(
            <div key={u.id} className="flex items-center gap-4 bg-slate-900/60 border border-slate-700/60 rounded-2xl px-5 py-4">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/30 text-indigo-300 flex items-center justify-center text-sm font-bold flex-shrink-0">{u.avatar}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-bold text-white">{u.name}</span><RoleBadge role={u.role}/></div>
                <div className="text-xs text-slate-400">{u.email}</div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {u.role==="owner"?<Badge label="All Locations" color="violet"/>:brands.filter(b=>u.brandIds.includes(b.id)).map(b=><Badge key={b.id} label={b.name} color="slate"/>)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={()=>setUserModal(u)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"><Edit size={14}/></button>
                {u.role!=="owner"&&<button onClick={()=>setDeleteModal({msg:`Delete user "${u.name}"?`,fn:()=>onDeleteUser(u.id)})} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors"><Trash2 size={14}/></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab==="kpis"&&(
        <div className="space-y-4">
          <div className="flex items-center gap-2 bg-amber-950/30 border border-amber-500/30 rounded-xl px-4 py-2.5">
            <AlertTriangle size={14} className="text-amber-400 flex-shrink-0"/>
            <span className="text-sm text-amber-300">Changes to KPI targets take effect immediately across all dashboards.</span>
          </div>
          {brands.map(b=>{
            const t=b.kpiTargets;
            return(
              <div key={b.id} className="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-bold text-white">{b.name}</div>
                  <button onClick={()=>setKpiModal(b)} className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors">Edit Targets</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[{label:"Daily Revenue",value:fmtCurrency(t.dailyRevenue)},{label:"Prime Cost Max",value:`${t.primeCostMax}%`},{label:"Labour % Max",value:`${t.laborPctMax}%`},{label:"COGS % Max",value:`${t.cogsPctMax}%`},{label:"Net Margin Min",value:`${t.netMarginMin}%`},{label:"SPLH Min",value:`£${t.splhMin}`},{label:"Avg Star Min",value:`${t.avgStarMin}★`},{label:"Cash Variance Max",value:`£${t.cashVarianceMax}`}].map(item=>(
                    <div key={item.label} className="bg-slate-800/60 rounded-xl p-3">
                      <div className="text-xs text-slate-400 mb-1">{item.label}</div>
                      <div className="text-sm font-bold text-white">{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {kpiModal&&<KPITargetModal brand={kpiModal} onSave={onUpdateKPITargets} onClose={()=>setKpiModal(null)}/>}
      {locModal&&<LocationEditorModal brand={locModal==="new"?null:locModal} onSave={locModal==="new"?onAddBrand:onUpdateBrand} onClose={()=>setLocModal(null)}/>}
      {userModal&&<UserEditorModal user={userModal==="new"?null:userModal} brands={brands} onSave={userModal==="new"?onAddUser:onUpdateUser} onClose={()=>setUserModal(null)}/>}
      {deleteModal&&(
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0"><AlertTriangle size={18} className="text-red-400"/></div><div className="text-sm text-slate-300">{deleteModal.msg}</div></div>
            <div className="flex gap-3"><button onClick={()=>setDeleteModal(null)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors">Cancel</button><button onClick={()=>{deleteModal.fn();setDeleteModal(null);}} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500 transition-colors">Delete</button></div>
          </div>
        </div>
      )}
      {showImport&&<ExcelUploadModal brands={brands} entries={entries} onImport={async rows=>{ await onBulkImport(rows); }} onClose={()=>setShowImport(false)}/>}
    </div>
  );
}

// ─── User Chip ────────────────────────────────────────────────────────────────
function UserChip({ user, onLogout, compact }) {
  return (
    <div className={`flex items-center ${compact?"gap-2":"gap-3"}`}>
      <div className="w-8 h-8 rounded-xl bg-indigo-600/30 text-indigo-300 flex items-center justify-center text-sm font-bold flex-shrink-0">{user.avatar}</div>
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
const labelCls = "text-xs text-slate-400 font-semibold mb-1.5 block";

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
          <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0"><AlertTriangle size={18} className="text-red-400"/></div>
          <div className="text-sm text-slate-300">{message}</div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500">Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Ops Network Dashboard ────────────────────────────────────────────────────
function OpsNetworkDashboard({ brands, assignments, auditTrail, opsTeam, checklists = [], tempUnits = [], cleaningTasks = [] }) {
  const { user } = useAuth();
  const vb = brands.filter(b => user.role === "owner" || user.brandIds.includes(b.id));
  const todayA = assignments.filter(a => vb.some(b => b.id === a.brandId) && isActiveToday(a));
  const overdue = todayA.filter(isOverdue);
  const completed = auditTrail.filter(t => t.date === getTodayStr() && t.action.includes("sign-off") && vb.some(b => b.id === t.brandId)).length;
  const ragFor = brand => {
    const la = assignments.filter(a => a.brandId === brand.id && isActiveToday(a));
    const od = la.filter(isOverdue);
    const done = auditTrail.filter(t => t.brandId === brand.id && t.date === getTodayStr() && t.action.includes("sign-off")).length;
    if (od.length) return "red";
    if (done === la.length && la.length > 0) return "green";
    return "amber";
  };
  return (
    <div className="space-y-6">
      {overdue.length > 0 && <div className="bg-red-950/30 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3"><AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5"/><div><div className="text-sm font-bold text-red-400">{overdue.length} overdue assignment{overdue.length > 1 ? "s" : ""} require action</div></div></div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Locations" value={vb.length} sub="Active" icon={MapPin} accent="indigo"/>
        <StatCard label="Assignments Today" value={todayA.length} sub="All sites" icon={ClipboardList} accent="indigo"/>
        <StatCard label="Overdue" value={overdue.length} sub={overdue.length ? "Action needed" : "All on time"} icon={Clock} accent={overdue.length ? "red" : "emerald"} alert={overdue.length > 0}/>
        <StatCard label="Completed Today" value={completed} sub="Sign-offs" icon={CheckCircle} accent="emerald"/>
      </div>
      <AnalysisBlock title="All Locations — Live Status">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-700">{["Location","Scheduled","Overdue","Completed","Rate","RAG"].map(h => <th key={h} className="px-3 py-2 text-left text-slate-400 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {vb.map(brand => {
                const la = assignments.filter(a => a.brandId === brand.id && isActiveToday(a));
                const od = la.filter(isOverdue);
                const done = auditTrail.filter(t => t.brandId === brand.id && t.date === getTodayStr() && t.action.includes("sign-off")).length;
                const rate = la.length ? Math.round((done / la.length) * 100) : 0;
                const rag = ragFor(brand);
                const ragColors = { red: "red", green: "green", amber: "amber" };
                return (
                  <tr key={brand.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                    <td className="px-3 py-3"><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: brand.color + "25", color: brand.color }}>{brand.name.slice(0,2)}</div><span className="font-semibold text-slate-200">{brand.name}</span></div></td>
                    <td className="px-3 py-3 text-slate-300 font-semibold">{la.length}</td>
                    <td className="px-3 py-3">{od.length ? <Badge label={`⚠ ${od.length}`} color="red"/> : <Badge label="✓ On time" color="green"/>}</td>
                    <td className="px-3 py-3 text-slate-300">{done}</td>
                    <td className="px-3 py-3"><span className={`font-bold font-mono ${rate>=80?"text-emerald-400":rate>=50?"text-amber-400":"text-red-400"}`}>{la.length ? rate+"%" : "—"}</span></td>
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
function TodaysTasks({ brands, assignments, checklists, tempUnits, cleaningTasks, auditTrail, checklistStates, onSignOff, onChecklistItemToggle }) {
  const { user } = useAuth();
  const vb = brands.filter(b => user.role === "owner" || user.brandIds.includes(b.id));
  const [selBrand, setSelBrand] = useState(vb[0]?.id || "");
  const [expandedId, setExpandedId] = useState(null);
  const bAssigns = assignments.filter(a => a.brandId === selBrand && isActiveToday(a));
  const overdue = bAssigns.filter(isOverdue);
  const getTaskName = (type, taskId) => {
    if (type === "checklist") return checklists.find(c => c.id === taskId)?.name || taskId;
    if (type === "temp") return tempUnits.find(t => t.id === taskId)?.name || taskId;
    if (type === "cleaning") return cleaningTasks.find(t => t.id === taskId)?.name || taskId;
    return "Delivery check";
  };
  const typeIcons = { checklist: "📋", cleaning: "🧹", temp: "🌡️", delivery: "🚚" };
  return (
    <div className="space-y-6">
      <LocationDropdown brands={vb} value={selBrand} onChange={setSelBrand} className="w-48"/>
      {overdue.length > 0 && <div className="bg-red-950/30 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3"><AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5"/><div className="text-sm font-bold text-red-400">{overdue.length} overdue — action required</div></div>}
      {bAssigns.length === 0 && <div className="flex flex-col items-center justify-center py-16 text-slate-500"><ClipboardList size={32} className="mb-3 text-slate-700"/><div className="text-sm font-semibold">No assignments for this location today</div></div>}
      <div className="space-y-3">
        {bAssigns.map(a => {
          const od = isOverdue(a); const taskName = getTaskName(a.type, a.taskId);
          const cl = a.type === "checklist" ? checklists.find(c => c.id === a.taskId) : null;
          const doneToday = auditTrail.some(t => t.brandId === a.brandId && t.date === getTodayStr() && t.detail?.includes(taskName));
          const stateKey = `${a.brandId}||${a.taskId}||${getTodayStr()}`;
          const clState = checklistStates[stateKey] || {};
          const totalItems = cl?.items?.length || 0;
          const doneItems = totalItems ? Object.values(clState).filter(Boolean).length : 0;
          const pct = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;
          const isExp = expandedId === a.id;
          return (
            <div key={a.id} className={`rounded-2xl border overflow-hidden ${od ? "border-red-500/30 bg-red-950/10" : doneToday ? "border-emerald-500/30 bg-emerald-950/10" : "border-slate-700/60 bg-slate-900/60"}`}>
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-base flex-shrink-0">{typeIcons[a.type] || "📋"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-sm font-bold text-white">{taskName}</div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {od && <Badge label="OVERDUE" color="red"/>}
                        {doneToday && <Badge label="✓ Complete" color="emerald"/>}
                        {cl && <button onClick={() => setExpandedId(isExp ? null : a.id)} className="text-xs text-indigo-400 hover:text-indigo-300">{isExp ? "Collapse" : "Open"}</button>}
                        {!doneToday && <button onClick={() => onSignOff(a, taskName)} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors">Sign off</button>}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Window: {a.winStart}–{a.winEnd}{a.role ? ` · 🎭 ${a.role}` : ""}</div>
                    {cl && totalItems > 0 && <div className="mt-2"><div className="flex justify-between text-xs text-slate-400 mb-1"><span>{doneItems}/{totalItems} items</span><span>{pct}%</span></div><div className="h-1.5 bg-slate-800 rounded-full"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }}/></div></div>}
                  </div>
                </div>
              </div>
              {cl && isExp && (
                <div className="border-t border-slate-700/60 p-4 space-y-2">
                  {cl.items.map(item => {
                    const checked = !!clState[item.id];
                    return (
                      <div key={item.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${checked ? "bg-emerald-950/20 border-emerald-500/20" : "bg-slate-800/40 border-slate-700/40"}`}>
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
function TemperatureLog({ brands, tempUnits, tempLogs, onLog }) {
  const { user } = useAuth();
  const vb = brands.filter(b => user.role === "owner" || user.brandIds.includes(b.id));
  const [selBrand, setSelBrand] = useState(vb[0]?.id || "");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ unitId: "", value: "", notes: "", time: nowTimeStr() });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const brandUnits = tempUnits.filter(u => u.brandId === selBrand);
  const todayLogs = tempLogs.filter(l => l.brandId === selBrand && l.date === getTodayStr());
  const getLatest = unitId => todayLogs.filter(l => l.unitId === unitId).sort((a,b) => b.time.localeCompare(a.time))[0];
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <LocationDropdown brands={vb} value={selBrand} onChange={setSelBrand} className="w-48"/>
        <button onClick={() => { setForm({ unitId: brandUnits[0]?.id || "", value: "", notes: "", time: nowTimeStr() }); setShowForm(true); }} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"><Plus size={14}/> Log Reading</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {brandUnits.map(unit => {
          const latest = getLatest(unit.id);
          const ok = latest ? checkTemp(unit, latest.value) : null;
          return (
            <div key={unit.id} className={`rounded-2xl border p-4 ${latest && !ok ? "bg-red-950/20 border-red-500/30" : latest && ok ? "bg-emerald-950/20 border-emerald-500/30" : "bg-slate-900/60 border-slate-700/60"}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2"><span className="text-lg">{TEMP_ICON[unit.type] || "🌡️"}</span><div><div className="text-sm font-bold text-white">{unit.name}</div><div className="text-xs text-slate-500">{tempLimitText(unit)}</div></div></div>
                {latest && (ok ? <Badge label="✓ OK" color="green"/> : <Badge label="⚠ BREACH" color="red"/>)}
              </div>
              {latest ? <div className="text-2xl font-bold mb-1" style={{ color: ok ? "#10b981" : "#ef4444" }}>{latest.value}°C</div> : <div className="text-xl font-bold text-slate-600 mb-1">No reading</div>}
              <div className="text-xs text-slate-500">{latest ? `Logged ${latest.time} by ${latest.loggedBy}` : "Not logged today"}</div>
            </div>
          );
        })}
        {brandUnits.length === 0 && <div className="col-span-3 flex flex-col items-center justify-center py-12 text-slate-500"><Thermometer size={28} className="mb-2 text-slate-700"/><div className="text-sm">No temperature units for this location</div><div className="text-xs mt-1">Add units in Ops Settings</div></div>}
      </div>
      {todayLogs.length > 0 && <AnalysisBlock title="HACCP Log — Today"><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-slate-700">{["Unit","Time","Reading","Limit","By","Status"].map(h => <th key={h} className="px-3 py-2 text-left text-slate-400 font-semibold">{h}</th>)}</tr></thead><tbody>{[...todayLogs].sort((a,b) => b.time.localeCompare(a.time)).map(log => { const unit = tempUnits.find(u => u.id === log.unitId); const ok = unit ? checkTemp(unit, log.value) : true; return <tr key={log.id} className="border-b border-slate-800"><td className="px-3 py-2 text-slate-300">{unit?.name || log.unitId}</td><td className="px-3 py-2 text-slate-400 font-mono">{log.time}</td><td className="px-3 py-2"><span className={`font-bold font-mono ${ok ? "text-emerald-400" : "text-red-400"}`}>{log.value}°C</span></td><td className="px-3 py-2 text-slate-500">{unit ? tempLimitText(unit) : "—"}</td><td className="px-3 py-2 text-slate-400">{log.loggedBy}</td><td className="px-3 py-2">{ok ? <Badge label="✓ OK" color="green"/> : <Badge label="⚠ Breach" color="red"/>}</td></tr>; })}</tbody></table></div></AnalysisBlock>}
      {showForm && (
        <Modal title="Log Temperature Reading" onClose={() => setShowForm(false)} footer={<><button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button><button onClick={() => { if (!form.unitId || form.value === "") return; const unit = brandUnits.find(u => u.id === form.unitId); const breach = unit ? !checkTemp(unit, form.value) : false; onLog({ id: `tl-${Date.now()}`, brandId: selBrand, unitId: form.unitId, value: parseFloat(form.value), isBreach: breach, notes: form.notes, time: form.time, date: getTodayStr(), loggedBy: user.name || "Manager" }); setShowForm(false); }} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500">Save Reading</button></>}>
          <div className="space-y-4">
            <div><label className={labelCls}>Unit</label><select value={form.unitId} onChange={e => set("unitId", e.target.value)} className={inputCls}>{brandUnits.map(u => <option key={u.id} value={u.id}>{u.name} ({u.type})</option>)}</select></div>
            <div className="grid grid-cols-2 gap-4"><div><label className={labelCls}>Temperature (°C)</label><input type="number" step="0.1" value={form.value} onChange={e => set("value", e.target.value)} placeholder="e.g. 4.5" className={inputCls}/></div><div><label className={labelCls}>Time</label><input type="time" value={form.time} onChange={e => set("time", e.target.value)} className={inputCls}/></div></div>
            {form.unitId && form.value !== "" && (() => { const unit = brandUnits.find(u => u.id === form.unitId); const ok = unit ? checkTemp(unit, form.value) : true; return <div className={`rounded-xl border p-3 ${ok ? "bg-emerald-950/30 border-emerald-500/30" : "bg-red-950/30 border-red-500/30"}`}><div className={`text-sm font-bold ${ok ? "text-emerald-400" : "text-red-400"}`}>{ok ? "✓ Within safe range" : "⚠ BREACH — corrective action required"}</div>{unit && <div className="text-xs text-slate-400 mt-0.5">Limit: {tempLimitText(unit)}</div>}</div>; })()}
            <div><label className={labelCls}>Notes</label><input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any observations…" className={inputCls}/></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Deliveries View ──────────────────────────────────────────────────────────
function DeliveriesView({ brands, deliveries, onAdd }) {
  const { user } = useAuth();
  const vb = brands.filter(b => user.role === "owner" || user.brandIds.includes(b.id));
  const [selBrand, setSelBrand] = useState(vb[0]?.id || "");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ supplier: "", items: "", temp: "", tempOk: "yes", condition: "good", driver: "", notes: "", time: nowTimeStr() });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const brandDeliveries = deliveries.filter(d => d.brandId === selBrand).sort((a,b) => b.timestamp?.localeCompare(a.timestamp || "") || 0);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <LocationDropdown brands={vb} value={selBrand} onChange={setSelBrand} className="w-48"/>
        <button onClick={() => { setForm({ supplier: "", items: "", temp: "", tempOk: "yes", condition: "good", driver: "", notes: "", time: nowTimeStr() }); setShowForm(true); }} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"><Plus size={14}/> Log Delivery</button>
      </div>
      {brandDeliveries.length === 0 && <div className="flex flex-col items-center justify-center py-16 text-slate-500"><Truck size={32} className="mb-3 text-slate-700"/><div className="text-sm font-semibold">No deliveries logged</div></div>}
      <div className="space-y-3">{brandDeliveries.map(d => <div key={d.id} className="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-4"><div className="text-sm font-bold text-white">{d.supplier}</div><div className="text-xs text-slate-400 mt-0.5">{d.items}</div><div className="flex gap-2 mt-2 flex-wrap"><Badge label={d.date} color="slate"/><Badge label={d.time} color="slate"/>{d.temp && <Badge label={`${d.temp}°C`} color={d.tempOk === "yes" ? "green" : "red"}/>}<Badge label={d.condition === "good" ? "✓ Good" : `⚠ ${d.condition}`} color={d.condition === "good" ? "green" : "amber"}/><Badge label={`By ${d.loggedBy}`} color="slate"/></div>{d.notes && <div className="text-xs text-slate-500 mt-1.5 italic">{d.notes}</div>}</div>)}</div>
      {showForm && (
        <Modal title="Log Delivery" onClose={() => setShowForm(false)} footer={<><button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button><button onClick={() => { if (!form.supplier) return; onAdd({ id: `del-${Date.now()}`, brandId: selBrand, ...form, date: getTodayStr(), timestamp: new Date().toISOString(), loggedBy: user.name || "Manager" }); setShowForm(false); }} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500">Save</button></>}>
          <div className="space-y-4">
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
function AssignmentFormModal({ brands, checklists, tempUnits, cleaningTasks, item, onSave, onClose }) {
  const [form, setForm] = useState({ brandId: item?.brandId || brands[0]?.id || "", type: item?.type || "checklist", taskId: item?.taskId || "", role: item?.role || "", personId: item?.personId || "", freq: item?.freq || "daily", weekday: item?.weekday || "Monday", date: item?.date || "", customDays: item?.customDays || [], winStart: item?.winStart || "08:00", winEnd: item?.winEnd || "10:00", priority: item?.priority || "normal", notes: item?.notes || "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const taskOptions = () => {
    if (form.type === "checklist") return checklists.map(c => ({ id: c.id, label: `${c.name} (${c.shift})` }));
    if (form.type === "temp") return tempUnits.filter(t => !t.brandId || t.brandId === form.brandId).map(t => ({ id: t.id, label: t.name }));
    if (form.type === "cleaning") return cleaningTasks.map(t => ({ id: t.id, label: `${t.name} — ${t.area}` }));
    return [{ id: "delivery", label: "Delivery check" }];
  };
  const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  return (
    <Modal title={item ? "Edit Assignment" : "New Assignment"} onClose={onClose} maxW="max-w-xl" footer={<><button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button><button onClick={() => { if (!form.taskId || !form.role) return; onSave({ id: item?.id || `as-${Date.now()}`, ...form }); }} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500">{item ? "Save" : "Create"}</button></>}>
      <div className="space-y-4">
        <div><label className={labelCls}>Location</label><select value={form.brandId} onChange={e => set("brandId", e.target.value)} className={inputCls}>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-4"><div><label className={labelCls}>Task Type</label><select value={form.type} onChange={e => { set("type", e.target.value); set("taskId", ""); }} className={inputCls}><option value="checklist">Checklist</option><option value="cleaning">Cleaning</option><option value="temp">Temperature</option><option value="delivery">Delivery</option></select></div><div><label className={labelCls}>Task</label><select value={form.taskId} onChange={e => set("taskId", e.target.value)} className={inputCls}><option value="">— Select —</option>{taskOptions().map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div></div>
        <div className="grid grid-cols-2 gap-4"><div><label className={labelCls}>Role *</label><input value={form.role} onChange={e => set("role", e.target.value)} placeholder="e.g. Shift Leader" className={inputCls}/></div><div><label className={labelCls}>Priority</label><select value={form.priority} onChange={e => set("priority", e.target.value)} className={inputCls}><option value="critical">Critical</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></div></div>
        <div><label className={labelCls}>Frequency</label><select value={form.freq} onChange={e => set("freq", e.target.value)} className={inputCls}><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekends">Weekends</option><option value="weekly">Weekly</option><option value="once">One-off</option><option value="custom">Custom days</option></select></div>
        {form.freq === "weekly" && <div><label className={labelCls}>Day of week</label><select value={form.weekday} onChange={e => set("weekday", e.target.value)} className={inputCls}>{["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(d => <option key={d}>{d}</option>)}</select></div>}
        {form.freq === "once" && <div><label className={labelCls}>Date</label><input type="date" value={form.date} onChange={e => set("date", e.target.value)} className={inputCls}/></div>}
        {form.freq === "custom" && <div><label className={labelCls}>Custom days</label><div className="flex gap-2 flex-wrap">{days.map(d => <button key={d} onClick={() => set("customDays", form.customDays.includes(d) ? form.customDays.filter(x => x !== d) : [...form.customDays, d])} className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${form.customDays.includes(d) ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400"}`}>{d}</button>)}</div></div>}
        <div className="grid grid-cols-2 gap-4"><div><label className={labelCls}>Window Start</label><input type="time" value={form.winStart} onChange={e => set("winStart", e.target.value)} className={inputCls}/></div><div><label className={labelCls}>Window End</label><input type="time" value={form.winEnd} onChange={e => set("winEnd", e.target.value)} className={inputCls}/></div></div>
        <div><label className={labelCls}>Notes</label><textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="Any instructions…"/></div>
      </div>
    </Modal>
  );
}

function AssignmentsView({ brands, assignments, checklists, tempUnits, cleaningTasks, opsTeam, auditTrail, onAdd, onEdit, onDelete }) {
  const { user } = useAuth();
  const vb = brands.filter(b => user.role === "owner" || user.brandIds.includes(b.id));
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
        {user.role === "owner" && <button onClick={() => { setEditItem(null); setShowForm(true); }} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"><Plus size={14}/> New Assignment</button>}
      </div>
      {visible.length === 0 && <div className="flex flex-col items-center justify-center py-16 text-slate-500"><ClipboardList size={32} className="mb-3 text-slate-700"/><div className="text-sm">No assignments found</div></div>}
      <div className="space-y-3">{visible.map(a => {
        const brand = brands.find(b => b.id === a.brandId);
        const od = isActiveToday(a) && isOverdue(a);
        const done = auditTrail.some(t => t.date === getTodayStr() && t.brandId === a.brandId && t.detail?.includes(getTaskName(a.type, a.taskId)));
        return (
          <div key={a.id} className={`rounded-2xl border p-4 ${od ? "bg-red-950/20 border-red-500/30" : "bg-slate-900/60 border-slate-700/60"}`}>
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${od ? "bg-red-500/20" : "bg-slate-800"}`}>{{ checklist: "📋", cleaning: "🧹", temp: "🌡️", delivery: "🚚" }[a.type] || "📋"}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div><div className="text-sm font-bold text-white">{getTaskName(a.type, a.taskId)}</div><div className="flex items-center gap-2 mt-1 flex-wrap">{brand && <span className="text-xs text-slate-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{background:brand.color}}/>{brand.name}</span>}<span className="text-xs text-slate-500">Window: {a.winStart}–{a.winEnd}</span>{od && <Badge label="⚠ OVERDUE" color="red"/>}{done && <Badge label="✓ Done today" color="emerald"/>}</div><div className="flex gap-2 mt-1.5 flex-wrap">{a.role && <Badge label={`🎭 ${a.role}`} color="violet"/>}<Badge label={a.freq} color="slate"/><Badge label={a.priority} color={a.priority==="critical"?"red":a.priority==="high"?"amber":"slate"}/></div></div>
                  {user.role === "owner" && <div className="flex gap-1.5 flex-shrink-0"><button onClick={() => { setEditItem(a); setShowForm(true); }} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"><Edit size={13}/></button><button onClick={() => setDeleteId(a.id)} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-950/30"><Trash2 size={13}/></button></div>}
                </div>
              </div>
            </div>
          </div>
        );
      })}</div>
      {showForm && <AssignmentFormModal brands={vb} checklists={checklists} tempUnits={tempUnits} cleaningTasks={cleaningTasks} item={editItem} onSave={item => { editItem ? onEdit(item) : onAdd(item); setShowForm(false); }} onClose={() => setShowForm(false)}/>}
      {deleteId && <OpsConfirmModal message="Delete this assignment?" onConfirm={() => onDelete(deleteId)} onClose={() => setDeleteId(null)}/>}
    </div>
  );
}

// ─── Compliance View ──────────────────────────────────────────────────────────
function ComplianceView({ brands, assignments, auditTrail }) {
  const { user } = useAuth();
  const vb = brands.filter(b => user.role === "owner" || user.brandIds.includes(b.id));
  return (
    <div className="space-y-5">
      <AnalysisBlock title="Compliance Overview — Today">
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-slate-700">{["Location","Assignments","Overdue","Completed","Rate","RAG"].map(h => <th key={h} className="px-3 py-2 text-left text-slate-400 font-semibold">{h}</th>)}</tr></thead><tbody>{vb.map(brand => {
          const la = assignments.filter(a => a.brandId === brand.id && isActiveToday(a));
          const od = la.filter(isOverdue);
          const done = auditTrail.filter(t => t.brandId === brand.id && t.date === getTodayStr() && t.action.includes("sign-off")).length;
          const rate = la.length ? Math.round((done / la.length) * 100) : 0;
          const rag = od.length ? "red" : rate >= 80 ? "green" : "amber";
          return <tr key={brand.id} className="border-b border-slate-800"><td className="px-3 py-3 font-semibold text-slate-200">{brand.name}</td><td className="px-3 py-3 text-slate-300">{la.length}</td><td className="px-3 py-3">{od.length ? <Badge label={`⚠ ${od.length}`} color="red"/> : <Badge label="✓ 0" color="green"/>}</td><td className="px-3 py-3 text-slate-300">{done}</td><td className="px-3 py-3"><span className={`font-bold font-mono ${rate>=80?"text-emerald-400":rate>=50?"text-amber-400":"text-red-400"}`}>{la.length ? rate+"%" : "—"}</span></td><td className="px-3 py-3"><Badge label={rag === "red" ? "Red" : rag === "green" ? "Green" : "Amber"} color={rag}/></td></tr>;
        })}</tbody></table></div>
      </AnalysisBlock>
    </div>
  );
}

// ─── Audit Trail View ─────────────────────────────────────────────────────────
function AuditTrailView({ brands, auditTrail, onClear }) {
  const { user } = useAuth();
  const vb = brands.filter(b => user.role === "owner" || user.brandIds.includes(b.id));
  const [filterBrand, setFilterBrand] = useState("all");
  const visible = auditTrail.filter(t => filterBrand === "all" || t.brandId === filterBrand).sort((a,b) => b.timestamp?.localeCompare(a.timestamp || "") || 0);
  const actionColor = action => action.includes("sign-off") || action.includes("completed") ? "text-emerald-400" : action.includes("breach") ? "text-red-400" : action.includes("logged") ? "text-amber-400" : "text-indigo-400";
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <LocationDropdown brands={vb} value={filterBrand} onChange={setFilterBrand} allLabel="All Locations" className="w-44"/>
        {user.role === "owner" && <button onClick={onClear} className="text-xs text-red-400 hover:text-red-300">Clear all entries</button>}
      </div>
      {visible.length === 0 && <div className="flex flex-col items-center justify-center py-16 text-slate-500"><ScrollText size={32} className="mb-3 text-slate-700"/><div className="text-sm font-semibold">No audit entries yet</div></div>}
      <AnalysisBlock title={`Audit Trail — ${visible.length} entries`}>
        <div className="space-y-3">{visible.slice(0,100).map(t => { const brand = brands.find(b => b.id === t.brandId); return <div key={t.id} className="flex items-start gap-3 py-2.5 border-b border-slate-700/40 last:border-0"><div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 bg-indigo-400"/><div className="flex-1 min-w-0"><div className={`text-sm font-semibold ${actionColor(t.action)}`}>{t.action}{brand ? ` — ${brand.name}` : ""}</div><div className="text-xs text-slate-400 mt-0.5">{t.detail}</div><div className="text-xs text-slate-600 mt-0.5 font-mono">{t.date} {t.time} · By: {t.by}</div></div></div>; })}</div>
      </AnalysisBlock>
    </div>
  );
}

// ─── Ops Settings View ────────────────────────────────────────────────────────
// ─── Ops Settings modals (proper top-level components — no hooks-in-callbacks) ──

function TempUnitFormModal({ item, brands, onSave, onClose }) {
  const [form, setFormState] = useState({
    name: item?.name || "", type: item?.type || "fridge",
    brandId: item?.brandId || brands[0]?.id || "",
    min: item?.min ?? "", max: item?.max ?? "",
    assignRole: item?.assignRole || "",
  });
  const set = (k, v) => setFormState(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave({
      id: item?.id || `tu-${Date.now()}`, ...form,
      min: form.min !== "" ? parseFloat(form.min) : null,
      max: form.max !== "" ? parseFloat(form.max) : null,
    });
  };
  return (
    <Modal title={item ? `Edit — ${item.name}` : "Add Temp Unit"} onClose={onClose}
      footer={<><button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button><button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500">{item ? "Save" : "Add"}</button></>}>
      <div className="space-y-4">
        <div><label className={labelCls}>Name *</label><input value={form.name} onChange={e => set("name", e.target.value)} className={inputCls}/></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>Type</label><select value={form.type} onChange={e => set("type", e.target.value)} className={inputCls}><option value="fridge">Fridge 🧊</option><option value="freezer">Freezer ❄️</option><option value="hot">Hot Hold 🔥</option></select></div>
          <div><label className={labelCls}>Location</label><select value={form.brandId} onChange={e => set("brandId", e.target.value)} className={inputCls}>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
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

function CleaningTaskFormModal({ item, onSave, onClose }) {
  const [form, setFormState] = useState({
    name: item?.name || "", area: item?.area || "Kitchen",
    freq: item?.freq || "Daily - Opening",
    assignRole: item?.assignRole || "", notes: item?.notes || "",
  });
  const set = (k, v) => setFormState(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave({ id: item?.id || `ct-${Date.now()}`, ...form });
  };
  return (
    <Modal title={item ? `Edit — ${item.name}` : "Add Cleaning Task"} onClose={onClose}
      footer={<><button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button><button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500">{item ? "Save" : "Add"}</button></>}>
      <div className="space-y-4">
        <div><label className={labelCls}>Task Name *</label><input value={form.name} onChange={e => set("name", e.target.value)} className={inputCls}/></div>
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

function OpsTeamMemberFormModal({ item, brands, onSave, onClose }) {
  const COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#a78bfa","#ec4899"];
  const [form, setFormState] = useState({
    firstName: item?.firstName || "", lastName: item?.lastName || "",
    role: item?.role || "", brandId: item?.brandId || brands[0]?.id || "",
    pin: item?.pin || "",
  });
  const set = (k, v) => setFormState(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.firstName.trim()) return;
    onSave({ id: item?.id || `ot-${Date.now()}`, ...form, color: item?.color || COLORS[Math.floor(Math.random() * COLORS.length)] });
  };
  return (
    <Modal title={item ? `Edit — ${item.firstName} ${item.lastName}` : "Add Team Member"} onClose={onClose}
      footer={<><button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button><button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500">{item ? "Save" : "Add"}</button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>First Name *</label><input value={form.firstName} onChange={e => set("firstName", e.target.value)} className={inputCls}/></div>
          <div><label className={labelCls}>Last Name</label><input value={form.lastName} onChange={e => set("lastName", e.target.value)} className={inputCls}/></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>Role</label><input value={form.role} onChange={e => set("role", e.target.value)} placeholder="e.g. Head Chef" className={inputCls}/></div>
          <div><label className={labelCls}>Location</label><select value={form.brandId} onChange={e => set("brandId", e.target.value)} className={inputCls}>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        </div>
        <div><label className={labelCls}>PIN (optional)</label><input value={form.pin} onChange={e => set("pin", e.target.value)} maxLength={6} placeholder="4–6 digits" className={inputCls}/></div>
      </div>
    </Modal>
  );
}

function ChecklistSettingsFormModal({ item, onSave, onClose }) {
  const [name, setName] = useState(item?.name || "");
  const [shift, setShift] = useState(item?.shift || "Opening");
  const [defaultRole, setDefaultRole] = useState(item?.defaultRole || "");
  const [items, setItems] = useState(item?.items || []);
  const addItem = () => setItems(its => [...its, { id: `ci-${Date.now()}`, text: "", guide: "" }]);
  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ id: item?.id || `cl-${Date.now()}`, name: name.trim(), shift, defaultRole, items: items.filter(i => i.text.trim()) });
  };
  return (
    <Modal title={item ? `Edit — ${item.name}` : "New Checklist"} onClose={onClose} maxW="max-w-2xl"
      footer={<><button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button><button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500">{item ? "Save" : "Create"}</button></>}>
      <div className="space-y-4">
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
              <div key={it.id} className="flex items-start gap-2 bg-slate-800/60 rounded-xl p-3">
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

function OpsSettingsView({ brands, checklists, tempUnits, cleaningTasks, opsTeam, onAddChecklist, onUpdateChecklist, onDeleteChecklist, onAddTempUnit, onUpdateTempUnit, onDeleteTempUnit, onAddCleanTask, onUpdateCleanTask, onDeleteCleanTask, onAddOpsTeam, onUpdateOpsTeam, onDeleteOpsTeam }) {
  const [tab, setTab] = useState("checklists");
  const [clModal, setClModal] = useState(null);
  const [tuModal, setTuModal] = useState(null);
  const [ctModal, setCtModal] = useState(null);
  const [tmModal, setTmModal] = useState(null);
  const [delTarget, setDelTarget] = useState(null);
  const tabs = [{ key: "checklists", label: "Checklists" }, { key: "tempunits", label: "Temp Units" }, { key: "cleaning", label: "Cleaning Tasks" }, { key: "team", label: "Ops Team" }];

  return (
    <div className="space-y-6">
      <div className="flex gap-2 bg-slate-900/60 border border-slate-700/60 rounded-2xl p-1.5 w-fit flex-wrap">
        {tabs.map(t => <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t.key ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>{t.label}</button>)}
      </div>

      {tab === "checklists" && (
        <div className="space-y-4">
          <div className="flex justify-end"><button onClick={() => setClModal("new")} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold"><Plus size={14}/> New Checklist</button></div>
          {checklists.map(cl => (
            <div key={cl.id} className="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-white">{cl.name}</div>
                  <div className="flex gap-2 mt-1.5"><Badge label={cl.shift} color="slate"/>{cl.defaultRole && <Badge label={`🎭 ${cl.defaultRole}`} color="violet"/>}<Badge label={`${cl.items.length} items`} color="slate"/></div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => setClModal(cl)} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"><Edit size={13}/></button>
                  <button onClick={() => setDelTarget({ msg: `Delete "${cl.name}"?`, fn: () => onDeleteChecklist(cl.id) })} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-950/30"><Trash2 size={13}/></button>
                </div>
              </div>
              <div className="mt-3 space-y-1">{cl.items.map(it => <div key={it.id} className="flex items-center gap-2 text-xs text-slate-400"><Check size={10} className="text-slate-600"/>{it.text}</div>)}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "tempunits" && (
        <div className="space-y-4">
          <div className="flex justify-end"><button onClick={() => setTuModal("new")} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold"><Plus size={14}/> Add Unit</button></div>
          {tempUnits.map(u => {
            const brand = brands.find(b => b.id === u.brandId);
            return (
              <div key={u.id} className="flex items-center gap-4 bg-slate-900/60 border border-slate-700/60 rounded-2xl px-5 py-4">
                <span className="text-xl">{TEMP_ICON[u.type] || "🌡️"}</span>
                <div className="flex-1 min-w-0"><div className="text-sm font-bold text-white">{u.name}</div><div className="text-xs text-slate-400">{brand?.name} · {tempLimitText(u)}{u.assignRole ? ` · 🎭 ${u.assignRole}` : ""}</div></div>
                <div className="flex gap-1.5">
                  <button onClick={() => setTuModal(u)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"><Edit size={13}/></button>
                  <button onClick={() => setDelTarget({ msg: `Delete "${u.name}"?`, fn: () => onDeleteTempUnit(u.id) })} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-950/30"><Trash2 size={13}/></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "cleaning" && (
        <div className="space-y-4">
          <div className="flex justify-end"><button onClick={() => setCtModal("new")} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold"><Plus size={14}/> Add Task</button></div>
          {[...new Set(cleaningTasks.map(t => t.area))].sort().map(area => (
            <div key={area} className="space-y-2">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{area}</div>
              {cleaningTasks.filter(t => t.area === area).map(t => (
                <div key={t.id} className="flex items-center gap-4 bg-slate-900/60 border border-slate-700/60 rounded-xl px-4 py-3">
                  <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-white">{t.name}</div><div className="text-xs text-slate-400">{t.freq}{t.assignRole ? ` · 🎭 ${t.assignRole}` : ""}</div></div>
                  <div className="flex gap-1.5">
                    <button onClick={() => setCtModal(t)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"><Edit size={13}/></button>
                    <button onClick={() => setDelTarget({ msg: `Delete "${t.name}"?`, fn: () => onDeleteCleanTask(t.id) })} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-950/30"><Trash2 size={13}/></button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === "team" && (
        <div className="space-y-4">
          <div className="flex justify-end"><button onClick={() => setTmModal("new")} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold"><Plus size={14}/> Add Member</button></div>
          {opsTeam.map(m => {
            const brand = brands.find(b => b.id === m.brandId);
            return (
              <div key={m.id} className="flex items-center gap-4 bg-slate-900/60 border border-slate-700/60 rounded-2xl px-5 py-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: (m.color || "#6366f1") + "30", color: m.color || "#6366f1" }}>{m.firstName[0]}{m.lastName?.[0] || ""}</div>
                <div className="flex-1 min-w-0"><div className="text-sm font-bold text-white">{m.firstName} {m.lastName}</div><div className="text-xs text-slate-400">{m.role} · {brand?.name || "—"}</div></div>
                <div className="flex gap-1.5">
                  <button onClick={() => setTmModal(m)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"><Edit size={13}/></button>
                  <button onClick={() => setDelTarget({ msg: `Delete ${m.firstName} ${m.lastName}?`, fn: () => onDeleteOpsTeam(m.id) })} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-950/30"><Trash2 size={13}/></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {clModal && (
        <ChecklistSettingsFormModal
          item={clModal === "new" ? null : clModal}
          onSave={item => { clModal === "new" ? onAddChecklist(item) : onUpdateChecklist(item); setClModal(null); }}
          onClose={() => setClModal(null)}
        />
      )}
      {tuModal && (
        <TempUnitFormModal
          item={tuModal === "new" ? null : tuModal}
          brands={brands}
          onSave={item => { tuModal === "new" ? onAddTempUnit(item) : onUpdateTempUnit(item); setTuModal(null); }}
          onClose={() => setTuModal(null)}
        />
      )}
      {ctModal && (
        <CleaningTaskFormModal
          item={ctModal === "new" ? null : ctModal}
          onSave={item => { ctModal === "new" ? onAddCleanTask(item) : onUpdateCleanTask(item); setCtModal(null); }}
          onClose={() => setCtModal(null)}
        />
      )}
      {tmModal && (
        <OpsTeamMemberFormModal
          item={tmModal === "new" ? null : tmModal}
          brands={brands}
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

// ── Employee: Submit Availability ─────────────────────────────────────────────
function EmployeeAvailabilityForm({ brands, currentUser, onSubmit, onCancel }) {
  const myBrands = brands.filter(b => currentUser.brandIds.includes(b.id));
  const [brandId,    setBrandId]  = useState(myBrands[0]?.id || "");
  const [type,       setType]     = useState("one_off");
  const [available,  setAvailable]= useState(true);
  const [form, setFormState]      = useState({
    date: "", dayOfWeek: "Monday", startDate: "", endDate: "",
    startTime: "09:00", endTime: "17:00", notes: "",
  });
  const set = (k, v) => setFormState(f => ({ ...f, [k]: v }));

  // ── Inline calendar picker ────────────────────────────────────────────────
  const [calField,      setCalField]   = useState(null);  // "date"|"startDate"|"endDate"|null
  const [calMonth,      setCalMonth]   = useState(() => { const d = new Date(); d.setDate(1); return d; });

  const openCal = (field) => {
    const existing = form[field];
    if (existing) { const d = new Date(existing + "T00:00:00"); d.setDate(1); setCalMonth(d); }
    else { const d = new Date(); d.setDate(1); setCalMonth(d); }
    setCalField(field);
  };

  const selectDay = (dateStr) => {
    set(calField, dateStr);
    // for recurring: if picking startDate, auto-open endDate next
    if (calField === "startDate") {
      setTimeout(() => openCal("endDate"), 0);
    } else {
      setCalField(null);
    }
  };

  const prevMonth = () => setCalMonth(m => { const d = new Date(m); d.setMonth(d.getMonth()-1); return d; });
  const nextMonth = () => setCalMonth(m => { const d = new Date(m); d.setMonth(d.getMonth()+1); return d; });

  const renderCalendar = (field) => {
    const year  = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const offset = firstDay === 0 ? 6 : firstDay - 1; // Mon-start offset
    const today  = new Date().toISOString().split("T")[0];
    const selected = form[field];
    const minDate  = field === "endDate" ? form.startDate : "";

    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(month+1).padStart(2,"0");
      const dd = String(d).padStart(2,"0");
      cells.push(`${year}-${mm}-${dd}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <div className="absolute z-50 top-full mt-1 left-0 bg-slate-900 border border-slate-700 rounded-2xl shadow-xl p-3 w-72">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-2 px-1">
          <button onClick={prevMonth} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"><ChevronLeft size={15}/></button>
          <div className="text-sm font-bold text-white">
            {calMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </div>
          <button onClick={nextMonth} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"><ChevronRight size={15}/></button>
        </div>
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d => (
            <div key={d} className="text-center text-xs font-semibold text-slate-500 py-1">{d}</div>
          ))}
        </div>
        {/* Day cells */}
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((dateStr, i) => {
            if (!dateStr) return <div key={i}/>;
            const isSelected = dateStr === selected;
            const isToday    = dateStr === today;
            const isDisabled = minDate && dateStr < minDate;
            const isInRange  = field === "endDate" && form.startDate && dateStr > form.startDate && dateStr < selected;
            return (
              <button key={i} disabled={isDisabled}
                onClick={() => selectDay(dateStr)}
                className={`h-8 w-full rounded-lg text-xs font-medium transition-all ${
                  isDisabled  ? "text-slate-700 cursor-not-allowed" :
                  isSelected  ? "bg-indigo-600 text-white font-bold" :
                  isInRange   ? "bg-indigo-600/20 text-indigo-300" :
                  isToday     ? "border border-indigo-500/50 text-indigo-300 hover:bg-indigo-600/20" :
                  "text-slate-300 hover:bg-slate-800"
                }`}>
                {parseInt(dateStr.split("-")[2])}
              </button>
            );
          })}
        </div>
        {/* Clear */}
        <div className="flex justify-between mt-2 pt-2 border-t border-slate-800">
          <button onClick={() => { set(calField, ""); setCalField(null); }} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Clear</button>
          <button onClick={() => setCalField(null)} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-semibold">Done</button>
        </div>
      </div>
    );
  };

  // ── Styled time picker ────────────────────────────────────────────────────
  const TimePickerField = ({ label, value, onChange }) => {
    const [open, setOpen] = useState(false);
    const [hh, mm] = (value || "09:00").split(":").map(Number);

    const hours   = Array.from({length:24},(_,i)=>i);
    const minutes = [0,15,30,45];

    return (
      <div className="relative">
        <label className={labelCls}>{label}</label>
        <button onClick={() => setOpen(o => !o)}
          className={`${inputCls} text-left flex items-center justify-between`}>
          <span>{value || "09:00"}</span>
          <Clock size={14} className="text-slate-400"/>
        </button>
        {open && (
          <div className="absolute z-50 top-full mt-1 left-0 bg-slate-900 border border-slate-700 rounded-2xl shadow-xl p-3 w-52">
            <div className="flex gap-2">
              {/* Hours */}
              <div className="flex-1">
                <div className="text-xs font-semibold text-slate-400 text-center mb-1">Hour</div>
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {hours.map(h => (
                    <button key={h} onClick={() => { onChange(`${String(h).padStart(2,"0")}:${String(mm).padStart(2,"0")}`); }}
                      className={`w-full text-center text-sm py-1 rounded-lg transition-all ${hh===h ? "bg-indigo-600 text-white font-bold" : "text-slate-300 hover:bg-slate-800"}`}>
                      {String(h).padStart(2,"0")}
                    </button>
                  ))}
                </div>
              </div>
              {/* Minutes */}
              <div className="flex-1">
                <div className="text-xs font-semibold text-slate-400 text-center mb-1">Min</div>
                <div className="space-y-0.5">
                  {minutes.map(m => (
                    <button key={m} onClick={() => { onChange(`${String(hh).padStart(2,"0")}:${String(m).padStart(2,"0")}`); }}
                      className={`w-full text-center text-sm py-1 rounded-lg transition-all ${mm===m ? "bg-indigo-600 text-white font-bold" : "text-slate-300 hover:bg-slate-800"}`}>
                      {String(m).padStart(2,"0")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="w-full mt-2 pt-2 border-t border-slate-800 text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">Done</button>
          </div>
        )}
      </div>
    );
  };

  // ── Date button helper ────────────────────────────────────────────────────
  const DateButton = ({ label, field, placeholder }) => (
    <div className="relative">
      <label className={labelCls}>{label}</label>
      <button onClick={() => calField === field ? setCalField(null) : openCal(field)}
        className={`${inputCls} text-left flex items-center justify-between ${!form[field] ? "text-slate-500" : "text-white"}`}>
        <span>{form[field] ? new Date(form[field]+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"}) : placeholder}</span>
        <Calendar size={14} className="text-slate-400 flex-shrink-0"/>
      </button>
      {calField === field && renderCalendar(field)}
    </div>
  );

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
      brandId, employeeId: currentUser.opsTeamMemberId || currentUser.id,
      employeeName: currentUser.name, type, available,
      date:       type === "one_off"   ? form.date      : null,
      dayOfWeek:  type === "weekly"    ? form.dayOfWeek : null,
      startDate:  type === "recurring" ? form.startDate : null,
      endDate:    type === "recurring" ? form.endDate   : null,
      startTime: form.startTime, endTime: form.endTime,
      notes: form.notes, status: "pending",
      managerNotes: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="flex flex-col h-full" onClick={() => { if (calField) setCalField(null); }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/80 bg-slate-900/60 flex-shrink-0">
        <button onClick={onCancel} className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
          <ChevronLeft size={18}/>
        </button>
        <div className="text-sm font-bold text-white">Submit Availability</div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5" onClick={e => e.stopPropagation()}>
        {/* Location */}
        {myBrands.length > 1 && (
          <div><label className={labelCls}>Location</label>
            <LocationDropdown brands={myBrands} value={brandId} onChange={setBrandId} className="w-full"/>
          </div>
        )}

        {/* Available / Unavailable */}
        <div>
          <label className={labelCls}>I am…</label>
          <div className="flex gap-2">
            <button onClick={() => setAvailable(true)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${available ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"}`}>
              ✓ Available
            </button>
            <button onClick={() => setAvailable(false)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${!available ? "bg-red-600 border-red-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"}`}>
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
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all ${type === t.key ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date pickers */}
        {type === "one_off" && (
          <DateButton label="Date" field="date" placeholder="Select a date"/>
        )}
        {type === "weekly" && (
          <div>
            <label className={labelCls}>Day of week</label>
            <div className="grid grid-cols-4 gap-2">
              {DAYS_OF_WEEK.map(d => (
                <button key={d} onClick={() => set("dayOfWeek", d)}
                  className={`py-2 rounded-xl text-xs font-semibold border transition-all ${form.dayOfWeek === d ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"}`}>
                  {d.slice(0,3)}
                </button>
              ))}
            </div>
          </div>
        )}
        {type === "recurring" && (
          <div className="grid grid-cols-2 gap-3">
            <DateButton label="From" field="startDate" placeholder="Start date"/>
            <DateButton label="To"   field="endDate"   placeholder="End date"/>
          </div>
        )}

        {/* Time pickers */}
        <div className="grid grid-cols-2 gap-3">
          <TimePickerField label="Start time" value={form.startTime} onChange={v => set("startTime", v)}/>
          <TimePickerField label="End time"   value={form.endTime}   onChange={v => set("endTime",   v)}/>
        </div>

        {/* Notes */}
        <div>
          <label className={labelCls}>Notes (optional)</label>
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
            rows={3} placeholder="Any additional context…" className={`${inputCls} resize-none`}/>
        </div>
      </div>

      <div className="flex-shrink-0 p-4 border-t border-slate-800/80">
        <button onClick={handleSubmit} disabled={!isValid()}
          className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2">
          <Send size={14}/> Submit Availability
        </button>
      </div>
    </div>
  );
}

// ── Employee: My Availability List ────────────────────────────────────────────
function EmployeeAvailabilityView({ brands, currentUser, availability, onAdd }) {
  const myId = currentUser.opsTeamMemberId || currentUser.id;
  const [showForm, setShowForm] = useState(false);
  const myAvail = availability
    .filter(a => a.employeeId === myId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const myBrands = brands.filter(b => currentUser.brandIds.includes(b.id));

  if (showForm) {
    return (
      <div className="h-full">
        <EmployeeAvailabilityForm
          brands={myBrands} currentUser={currentUser}
          onSubmit={a => { onAdd(a); setShowForm(false); }}
          onCancel={() => setShowForm(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">My Availability</h2>
          <p className="text-xs text-slate-400 mt-0.5">Submit your availability for your manager to review</p>
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
        {myAvail.map(a => (
          <div key={a.id} className={`rounded-2xl border p-4 ${
            a.status === "approved" ? "bg-emerald-950/20 border-emerald-500/30" :
            a.status === "rejected" ? "bg-red-950/20 border-red-500/30" :
            a.status === "amended"  ? "bg-indigo-950/20 border-indigo-500/30" :
            "bg-slate-900/60 border-slate-700/60"
          }`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge label={`${AVAIL_STATUS_ICON[a.status]} ${a.status.charAt(0).toUpperCase()+a.status.slice(1)}`} color={AVAIL_STATUS_COLOR[a.status]}/>
                  <Badge label={a.available ? "✓ Available" : "✗ Unavailable"} color={a.available ? "emerald" : "red"}/>
                  <Badge label={a.type === "one_off" ? "One-off" : a.type === "weekly" ? "Weekly" : "Date Range"} color="slate"/>
                </div>
                <div className="text-sm font-bold text-white mt-1">{fmtAvailDate(a)}</div>
                <div className="text-xs text-slate-400 mt-0.5">{fmtAvailTime(a)}</div>
                {a.notes && <div className="text-xs text-slate-500 mt-1 italic">{a.notes}</div>}
              </div>
            </div>
            {/* Manager response */}
            {a.status === "amended" && (
              <div className="mt-3 bg-indigo-950/40 border border-indigo-500/20 rounded-xl p-3">
                <div className="text-xs font-bold text-indigo-400 mb-1">✎ Manager amended your submission</div>
                <div className="text-xs text-slate-300">
                  {a.amendedDate && <div>Date changed to: {new Date(a.amendedDate).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}</div>}
                  {a.amendedDayOfWeek && <div>Day changed to: {a.amendedDayOfWeek}</div>}
                  {(a.amendedStartTime || a.amendedEndTime) && <div>Time changed to: {a.amendedStartTime||a.startTime} – {a.amendedEndTime||a.endTime}</div>}
                </div>
                {a.managerNotes && <div className="text-xs text-slate-400 mt-1 italic">"{a.managerNotes}"</div>}
              </div>
            )}
            {a.status === "rejected" && a.managerNotes && (
              <div className="mt-3 bg-red-950/30 border border-red-500/20 rounded-xl p-3">
                <div className="text-xs font-bold text-red-400 mb-1">✗ Rejected</div>
                <div className="text-xs text-slate-400 italic">"{a.managerNotes}"</div>
              </div>
            )}
            {a.status === "approved" && a.managerNotes && (
              <div className="mt-2 text-xs text-slate-400 italic">"{a.managerNotes}"</div>
            )}
            <div className="text-xs text-slate-600 mt-2">Submitted {new Date(a.createdAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
          </div>
        ))}
      </div>
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
      ...item,
      status: "amended",
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
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button>
        <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500">Save Amendment</button>
      </>}>
      <div className="space-y-4">
        <div className="bg-slate-800/50 rounded-xl p-3 text-xs text-slate-400 space-y-1">
          <div><span className="font-semibold text-slate-300">{item.employeeName}</span> · {item.type === "one_off" ? "One-off" : item.type === "weekly" ? "Weekly" : "Date Range"}</div>
          <div>Original: {fmtAvailDate(item)} · {item.startTime}–{item.endTime}</div>
        </div>
        {item.type === "one_off" && (
          <div><label className={labelCls}>Amended Date</label>
            <input type="date" value={form.amendedDate} onChange={e => set("amendedDate", e.target.value)} className={inputCls}/>
          </div>
        )}
        {item.type === "weekly" && (
          <div><label className={labelCls}>Amended Day</label>
            <SelectDropdown value={form.amendedDayOfWeek} onChange={v => set("amendedDayOfWeek", v)} className="w-full">
              {DAYS_OF_WEEK.map(d => <option key={d}>{d}</option>)}
            </SelectDropdown>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Amended Start</label>
            <input type="time" value={form.amendedStartTime} onChange={e => set("amendedStartTime", e.target.value)} className={inputCls}/>
          </div>
          <div><label className={labelCls}>Amended End</label>
            <input type="time" value={form.amendedEndTime} onChange={e => set("amendedEndTime", e.target.value)} className={inputCls}/>
          </div>
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
  const brandMembers = opsTeam.filter(m => m.brandId === form.brandId);
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
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <Modal title="Add Employee Availability" onClose={onClose} maxW="max-w-lg"
      footer={<>
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button>
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
        <div>
          <label className={labelCls}>Availability</label>
          <div className="flex gap-2">
            <button onClick={() => set("available", true)} className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${form.available ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"}`}>✓ Available</button>
            <button onClick={() => set("available", false)} className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${!form.available ? "bg-red-600 border-red-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"}`}>✗ Unavailable</button>
          </div>
        </div>
        <div>
          <label className={labelCls}>Schedule Type</label>
          <div className="flex gap-2">
            {[{key:"one_off",label:"One-off"},{key:"weekly",label:"Weekly"},{key:"recurring",label:"Date Range"}].map(t => (
              <button key={t.key} onClick={() => set("type", t.key)} className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${form.type === t.key ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"}`}>{t.label}</button>
            ))}
          </div>
        </div>
        {form.type === "one_off"   && <div><label className={labelCls}>Date</label><input type="date" value={form.date} onChange={e => set("date", e.target.value)} className={inputCls}/></div>}
        {form.type === "weekly"    && <div><label className={labelCls}>Day</label><SelectDropdown value={form.dayOfWeek} onChange={v => set("dayOfWeek", v)} className="w-full">{DAYS_OF_WEEK.map(d => <option key={d}>{d}</option>)}</SelectDropdown></div>}
        {form.type === "recurring" && <div className="grid grid-cols-2 gap-3"><div><label className={labelCls}>From</label><input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} className={inputCls}/></div><div><label className={labelCls}>To</label><input type="date" value={form.endDate} min={form.startDate} onChange={e => set("endDate", e.target.value)} className={inputCls}/></div></div>}
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Start Time</label><input type="time" value={form.startTime} onChange={e => set("startTime", e.target.value)} className={inputCls}/></div>
          <div><label className={labelCls}>End Time</label><input type="time" value={form.endTime} onChange={e => set("endTime", e.target.value)} className={inputCls}/></div>
        </div>
        <div><label className={labelCls}>Notes</label><textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="Any notes…"/></div>
      </div>
    </Modal>
  );
}

// ── Manager: Availability Tracker ────────────────────────────────────────────
function ManagerAvailabilityView({ brands, opsTeam, availability, currentUser, onUpdate, onAdd, onDelete }) {
  const { user } = useAuth();
  const vb = brands.filter(b => user.role === "owner" || user.brandIds.includes(b.id));
  const [filterBrand,    setFilterBrand]    = useState("all");
  const [filterStatus,   setFilterStatus]   = useState("pending");
  const [filterType,     setFilterType]     = useState("all");
  const [filterEmployee, setFilterEmployee] = useState("all");
  const [amendModal,     setAmendModal]     = useState(null);
  const [addModal,       setAddModal]       = useState(false);
  const [rejectModal,    setRejectModal]    = useState(null);
  const [rejectNote,     setRejectNote]     = useState("");
  const [viewMode,       setViewMode]       = useState("list"); // list | calendar

  const visible = availability.filter(a => {
    if (!vb.some(b => b.id === a.brandId)) return false;
    if (filterBrand    !== "all" && a.brandId    !== filterBrand)    return false;
    if (filterStatus   !== "all" && a.status     !== filterStatus)   return false;
    if (filterType     !== "all" && a.type       !== filterType)     return false;
    if (filterEmployee !== "all" && a.employeeId !== filterEmployee) return false;
    return true;
  }).sort((a, b) => {
    // pending first, then by date submitted
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (b.status === "pending" && a.status !== "pending") return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const pendingCount = availability.filter(a => vb.some(b => b.id === a.brandId) && a.status === "pending").length;

  const handleApprove = (a) => onUpdate({ ...a, status: "approved", updatedAt: new Date().toISOString() });
  const handleReject  = (a, note) => onUpdate({ ...a, status: "rejected", managerNotes: note, updatedAt: new Date().toISOString() });

  // Unique employees in visible availability
  const employeeOptions = [...new Map(
    availability.filter(a => vb.some(b => b.id === a.brandId)).map(a => [a.employeeId, { id: a.employeeId, name: a.employeeName }])
  ).values()];

  const statusColor = s => ({ pending:"amber", approved:"emerald", rejected:"red", amended:"indigo" }[s]||"slate");

  // Calendar view - show availability by week
  const today = new Date();
  const [calWeekOffset, setCalWeekOffset] = useState(0);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1 + calWeekOffset * 7);
  const weekDays = DAYS_OF_WEEK.map((_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });

  const getAvailForDay = (date) => {
    const dateStr = date.toISOString().split("T")[0];
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
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-white">Availability Tracker</h2>
          {pendingCount > 0 && <div className="text-xs text-amber-400 mt-0.5">{pendingCount} pending review</div>}
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex bg-slate-900/80 border border-slate-700/60 rounded-xl p-0.5 gap-0.5">
            <button onClick={() => setViewMode("list")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode==="list"?"bg-indigo-600 text-white":"text-slate-400 hover:text-slate-200"}`}>List</button>
            <button onClick={() => setViewMode("calendar")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode==="calendar"?"bg-indigo-600 text-white":"text-slate-400 hover:text-slate-200"}`}>Week</button>
          </div>
          <button onClick={() => setAddModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors">
            <Plus size={14}/> Add
          </button>
        </div>
      </div>

      {/* Filters */}
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

      {/* ── List View ── */}
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
              return (
                <div key={a.id} className={`rounded-2xl border p-4 ${
                  a.status === "pending"  ? "bg-amber-950/20 border-amber-500/30" :
                  a.status === "approved" ? "bg-emerald-950/10 border-emerald-500/20" :
                  a.status === "rejected" ? "bg-red-950/10 border-red-500/20" :
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
                      <div className="text-xs text-slate-400">{fmtAvailTime(a)}</div>
                      {a.notes && <div className="text-xs text-slate-500 mt-1 italic">"{a.notes}"</div>}
                      {a.status === "amended" && (
                        <div className="text-xs text-indigo-400 mt-1">
                          ✎ Amended: {a.amendedDate ? new Date(a.amendedDate).toLocaleDateString("en-GB",{day:"numeric",month:"short"}) : a.amendedDayOfWeek || ""}{(a.amendedStartTime||a.amendedEndTime) ? ` · ${a.amendedStartTime||a.startTime}–${a.amendedEndTime||a.endTime}` : ""}
                        </div>
                      )}
                      {a.managerNotes && <div className="text-xs text-slate-500 mt-1 italic">Note: "{a.managerNotes}"</div>}
                      <div className="text-xs text-slate-600 mt-1.5">Submitted {new Date(a.createdAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      {a.status === "pending" && (
                        <>
                          <button onClick={() => handleApprove(a)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors">
                            ✓ Approve
                          </button>
                          <button onClick={() => { setRejectModal(a); setRejectNote(""); }}
                            className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors">
                            ✗ Reject
                          </button>
                          <button onClick={() => setAmendModal(a)}
                            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors">
                            ✎ Amend
                          </button>
                        </>
                      )}
                      {a.status !== "pending" && (
                        <div className="flex gap-1.5">
                          <button onClick={() => setAmendModal(a)} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors" title="Amend"><Edit size={13}/></button>
                          <button onClick={() => onDelete(a.id)} className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors" title="Delete"><Trash2 size={13}/></button>
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

      {/* ── Week Calendar View ── */}
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
                <div key={idx} className={`rounded-xl border p-2 min-h-24 ${isToday ? "border-indigo-500/50 bg-indigo-950/20" : "border-slate-800/60 bg-slate-900/40"}`}>
                  <div className={`text-xs font-bold mb-1.5 ${isToday ? "text-indigo-400" : "text-slate-400"}`}>
                    <div>{DAYS_OF_WEEK[idx].slice(0,3)}</div>
                    <div className={`text-sm ${isToday ? "text-indigo-300" : "text-slate-300"}`}>{day.getDate()}</div>
                  </div>
                  <div className="space-y-1">
                    {dayAvail.map(a => {
                      const av = avatarFor(a.employeeName);
                      return (
                        <div key={a.id} className={`text-xs rounded-lg px-1.5 py-1 truncate font-medium ${a.available ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}
                          title={`${a.employeeName} · ${fmtAvailTime(a)}`}>
                          {a.employeeName.split(" ")[0]}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-500/40"/> Available</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-500/40"/> Unavailable</div>
          </div>
        </div>
      )}

      {/* Modals */}
      {amendModal && (
        <AmendAvailabilityModal item={amendModal}
          onSave={updated => { onUpdate(updated); setAmendModal(null); }}
          onClose={() => setAmendModal(null)}/>
      )}
      {rejectModal && (
        <Modal title="Reject Availability" onClose={() => setRejectModal(null)}
          footer={<>
            <button onClick={() => setRejectModal(null)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button>
            <button onClick={() => { handleReject(rejectModal, rejectNote); setRejectModal(null); }} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500">Reject</button>
          </>}>
          <div className="space-y-3">
            <div className="bg-slate-800/50 rounded-xl p-3 text-xs text-slate-400">
              <div className="font-semibold text-slate-300 mb-1">{rejectModal.employeeName}</div>
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
function TicketChatPanel({ ticket, currentUser, onSendComment, isManager, onStatusChange, onAssignToggle, allPeople, brands }) {
  const [body, setBody]         = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const bottomRef               = useRef(null);
  const brand = brands.find(b => b.id === ticket.brandId);
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
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/80 bg-slate-900/60 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white truncate">{ticket.title}</div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <Badge label={ticket.status} color={HD_STATUS_COLOR[ticket.status] || "slate"}/>
            <Badge label={ticket.priority} color={HD_PRIORITY_COLOR[ticket.priority] || "slate"}/>
            <Badge label={ticket.category} color="slate"/>
            {brand && <span className="text-xs text-slate-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{background:brand.color}}/>{brand.name}</span>}
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
                <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl px-4 py-3 max-w-[80%] text-sm text-slate-300 text-center">
                  <div className="text-xs text-slate-500 mb-1">Raised by {ticket.createdByName}</div>
                  {ticket.description}
                </div>
              </div>
            )}
            {ticket.assignedTo?.length > 0 && (
              <div className="flex justify-center mb-2">
                <span className="bg-indigo-950/60 border border-indigo-500/20 text-indigo-300 text-xs px-3 py-1 rounded-full">
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
                    <span className="bg-slate-800/80 border border-slate-700/60 text-slate-400 text-xs px-3 py-1 rounded-full">{item.label}</span>
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
                          : "bg-slate-800 text-slate-100 border border-slate-700/60 rounded-bl-md"
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
            <div className="flex-shrink-0 px-4 py-3 border-t border-slate-800/80 text-center text-xs text-slate-600">
              This ticket is closed
            </div>
          ) : (
            <div className="flex-shrink-0 px-3 py-3 border-t border-slate-800/80 bg-slate-900/40">
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
          <div className="w-56 flex-shrink-0 border-l border-slate-800/80 bg-slate-900/40 overflow-y-auto p-4 space-y-4">
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Status</div>
              <div className="space-y-1">
                {HELPDESK_STATUSES.map(s => (
                  <button key={s} onClick={() => onStatusChange(ticket, s)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${ticket.status === s ? "text-white" : "text-slate-400 hover:bg-slate-800"}`}
                    style={ticket.status === s ? { background: statusColors[s] } : {}}>{s}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Assigned To</div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {allPeople.map(p => {
                  const assigned = ticket.assignedTo?.includes(p.name);
                  return (
                    <button key={p.id} onClick={() => onAssignToggle(ticket, p.name)}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-all ${assigned ? "bg-indigo-600/20 text-indigo-300" : "text-slate-500 hover:bg-slate-800/60"}`}>
                      <span className="truncate">{p.name}</span>
                      {assigned && <Check size={11} className="text-indigo-400 flex-shrink-0"/>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="text-xs text-slate-600 space-y-1 border-t border-slate-800 pt-3">
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
function NewTicketForm({ brands, currentUser, onSubmit, onCancel }) {
  const myBrands = brands.filter(b => currentUser.brandIds.includes(b.id));
  const [brandId, setBrandId] = useState(myBrands[0]?.id || "");
  const [form, setFormState]  = useState({ title: "", description: "", category: "General", priority: "Normal" });
  const set = (k, v) => setFormState(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    const brand = myBrands.find(b => b.id === brandId);
    onSubmit({
      id: `hd-${Date.now()}`, brandId, brandName: brand?.name || "",
      ...form, title: form.title.trim(),
      status: "Open",
      createdById: currentUser.opsTeamMemberId || currentUser.id,
      createdByName: currentUser.name,
      assignedTo: [], comments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/80 bg-slate-900/60 flex-shrink-0">
        <button onClick={onCancel} className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
          <ChevronLeft size={18}/>
        </button>
        <div className="text-sm font-bold text-white">New Ticket</div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {myBrands.length > 1 && (
          <div><label className={labelCls}>Location</label>
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
      <div className="flex-shrink-0 p-4 border-t border-slate-800/80">
        <button onClick={handleSubmit} disabled={!form.title.trim()}
          className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2">
          <Send size={14}/> Submit Ticket
        </button>
      </div>
    </div>
  );
}

// ── Manager Helpdesk ──────────────────────────────────────────────────────────
function HelpdeskManagerView({ brands, tickets, opsTeam, users, currentUser, onUpdate, onDelete }) {
  const { user } = useAuth();
  const vb = brands.filter(b => user.role === "owner" || user.brandIds.includes(b.id));
  const [filterStatus,   setFilterStatus]   = useState("all");
  const [filterBrand,    setFilterBrand]    = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [search,         setSearch]         = useState("");
  const [activeTicket,   setActiveTicket]   = useState(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const allPeople = [
    ...users.filter(u => u.role !== "employee").map(u => ({ id: u.id, name: u.name, role: u.role })),
    ...opsTeam.map(m => ({ id: m.id, name: `${m.firstName} ${m.lastName}`.trim(), role: m.role })),
  ];

  // Keep active ticket in sync with live state — no refresh needed
  useEffect(() => {
    if (activeTicket) {
      const fresh = tickets.find(t => t.id === activeTicket.id);
      if (fresh) setActiveTicket(fresh);
    }
  }, [tickets]);

  const visible = tickets.filter(t => {
    if (!vb.some(b => b.id === t.brandId)) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterBrand  !== "all" && t.brandId !== filterBrand) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
        !t.createdByName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    const prio = { Urgent:0, High:1, Normal:2, Low:3 };
    if (a.status === "Closed" && b.status !== "Closed") return 1;
    if (b.status === "Closed" && a.status !== "Closed") return -1;
    return (prio[a.priority] - prio[b.priority]) || new Date(b.updatedAt||b.createdAt) - new Date(a.updatedAt||a.createdAt);
  });

  const handleSendComment = (ticket, comment) => {
    const updated = { ...ticket, comments: [...(ticket.comments||[]), comment], updatedAt: new Date().toISOString() };
    onUpdate(updated); setActiveTicket(updated);
  };
  const handleStatusChange = (ticket, status) => {
    const updated = { ...ticket, status, updatedAt: new Date().toISOString() };
    onUpdate(updated); setActiveTicket(updated);
  };
  const handleAssignToggle = (ticket, name) => {
    const assignedTo = ticket.assignedTo?.includes(name)
      ? ticket.assignedTo.filter(n => n !== name)
      : [...(ticket.assignedTo||[]), name];
    const updated = { ...ticket, assignedTo, updatedAt: new Date().toISOString() };
    onUpdate(updated); setActiveTicket(updated);
  };

  const counts = HELPDESK_STATUSES.reduce((acc, s) => {
    acc[s] = tickets.filter(t => vb.some(b => b.id === t.brandId) && t.status === s).length;
    return acc;
  }, {});

  const statusDot = s => ({ Open:"bg-red-400","In Progress":"bg-amber-400",Pending:"bg-indigo-400",Resolved:"bg-emerald-400",Closed:"bg-slate-600" }[s]||"bg-slate-600");

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-[500px] rounded-2xl overflow-hidden border border-slate-800/80 bg-slate-950">
      {/* Left panel */}
      <div className={`flex flex-col border-r border-slate-800/80 bg-slate-900/80 flex-shrink-0 w-full lg:w-80 xl:w-96 ${mobileShowChat ? "hidden lg:flex" : "flex"}`}>
        <div className="px-4 py-3.5 border-b border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-white">Help Desk</div>
            <div className="flex items-center gap-1">
              {HELPDESK_STATUSES.map(s => (
                <button key={s} onClick={() => setFilterStatus(filterStatus === s ? "all" : s)} title={s}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${statusDot(s)} ${filterStatus === s ? "ring-2 ring-white/50 scale-125" : "opacity-40 hover:opacity-70"}`}/>
              ))}
            </div>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets…"
            className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none transition-colors"/>
          <div className="flex gap-2">
            <LocationDropdown brands={vb} value={filterBrand} onChange={setFilterBrand} allLabel="All Locations" className="flex-1"/>
            <SelectDropdown value={filterPriority} onChange={setFilterPriority} className="flex-1">
              <option value="all">All Priorities</option>
              {HELPDESK_PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </SelectDropdown>
          </div>
        </div>
        {/* Status count strip */}
        <div className="flex gap-2 px-4 py-2 border-b border-slate-800/50 overflow-x-auto">
          {HELPDESK_STATUSES.map(s => (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${filterStatus === s ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${statusDot(s)}`}/>{counts[s]||0} {s}
            </button>
          ))}
        </div>
        {/* Ticket list */}
        <div className="flex-1 overflow-y-auto">
          {visible.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 px-4">
              <LifeBuoy size={28} className="mb-2 text-slate-700"/>
              <div className="text-sm font-semibold text-center">No tickets found</div>
            </div>
          )}
          {visible.map(ticket => {
            const isActive = activeTicket?.id === ticket.id;
            const brand = brands.find(b => b.id === ticket.brandId);
            const lastComment = ticket.comments?.[ticket.comments.length-1];
            return (
              <button key={ticket.id} onClick={() => { setActiveTicket(ticket); setMobileShowChat(true); }}
                className={`w-full flex items-start gap-3 px-4 py-3.5 border-b border-slate-800/40 transition-all text-left ${isActive ? "bg-indigo-600/15" : "hover:bg-slate-800/40"}`}>
                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${statusDot(ticket.status)}`}/>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <div className="text-sm font-semibold text-white truncate">{ticket.title}</div>
                    <div className="text-xs text-slate-600 flex-shrink-0">{fmtTicketTime(ticket.updatedAt||ticket.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge label={ticket.priority} color={HD_PRIORITY_COLOR[ticket.priority]||"slate"}/>
                    {brand && <span className="text-xs text-slate-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{background:brand.color}}/>{brand.name}</span>}
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
            <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b border-slate-800/80 bg-slate-900/40">
              <button onClick={() => setMobileShowChat(false)} className="p-1.5 text-slate-400 hover:text-white"><ChevronLeft size={18}/></button>
              <span className="text-xs text-slate-400">Back to tickets</span>
            </div>
            <TicketChatPanel ticket={activeTicket} currentUser={currentUser}
              onSendComment={handleSendComment} onStatusChange={handleStatusChange}
              onAssignToggle={handleAssignToggle} allPeople={allPeople} brands={brands} isManager={true}/>
          </>
        )}
      </div>
    </div>
  );
}

// ── Employee Helpdesk ─────────────────────────────────────────────────────────
function EmployeeHelpdeskView({ brands, tickets, currentUser, onAdd, onUpdate }) {
  const myBrands = brands.filter(b => currentUser.brandIds.includes(b.id));
  const [activeTicket,   setActiveTicket]   = useState(null);
  const [showNewForm,    setShowNewForm]    = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const myId = currentUser.opsTeamMemberId || currentUser.id;
  const myTickets = tickets
    .filter(t => t.createdById === myId && t.status !== "Closed")
    .sort((a, b) => new Date(b.updatedAt||b.createdAt) - new Date(a.updatedAt||a.createdAt));

  // KEY FIX: sync activeTicket with live tickets prop → no manual refresh needed
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
    <div className="flex h-[calc(100vh-120px)] min-h-[500px] rounded-2xl overflow-hidden border border-slate-800/80 bg-slate-950">
      {/* Left panel */}
      <div className={`flex flex-col border-r border-slate-800/80 bg-slate-900/80 flex-shrink-0 w-full lg:w-72 ${mobileShowChat ? "hidden lg:flex" : "flex"}`}>
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800/80">
          <div>
            <div className="text-sm font-bold text-white">My Tickets</div>
            {myTickets.length > 0 && <div className="text-xs text-slate-500">{myTickets.length} open</div>}
          </div>
          <button onClick={() => { setShowNewForm(true); setActiveTicket(null); setMobileShowChat(true); }}
            className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center transition-all shadow-md" title="New ticket">
            <Plus size={17} className="text-white"/>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {myTickets.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 px-4">
              <LifeBuoy size={28} className="mb-2 text-slate-700"/>
              <div className="text-sm font-semibold text-center">No open tickets</div>
              <div className="text-xs text-slate-700 text-center mt-1">Tap + to raise one</div>
            </div>
          )}
          {myTickets.map(ticket => {
            const isActive = activeTicket?.id === ticket.id;
            const lastComment = ticket.comments?.[ticket.comments.length-1];
            const hasManagerReply = ticket.comments?.some(c => c.authorRole === "manager" || c.authorRole === "owner");
            return (
              <button key={ticket.id} onClick={() => { setActiveTicket(ticket); setShowNewForm(false); setMobileShowChat(true); }}
                className={`w-full flex items-start gap-3 px-4 py-3.5 border-b border-slate-800/40 transition-all text-left ${isActive ? "bg-indigo-600/15" : "hover:bg-slate-800/40"}`}>
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
          <NewTicketForm brands={myBrands} currentUser={currentUser}
            onSubmit={ticket => { onAdd(ticket); setShowNewForm(false); }}
            onCancel={() => { setShowNewForm(false); setMobileShowChat(false); }}/>
        ) : activeTicket ? (
          <>
            <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b border-slate-800/80 bg-slate-900/40">
              <button onClick={() => setMobileShowChat(false)} className="p-1.5 text-slate-400 hover:text-white"><ChevronLeft size={18}/></button>
              <span className="text-xs text-slate-400">Back to my tickets</span>
            </div>
            <TicketChatPanel ticket={activeTicket} currentUser={currentUser}
              onSendComment={handleSendComment} onStatusChange={() => {}} onAssignToggle={() => {}}
              allPeople={[]} brands={brands} isManager={false}/>
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
  const isOwner   = currentUser.role === "owner";
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
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800/60 transition-all text-left">
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
                <span className="bg-slate-800/80 border border-slate-700/60 text-slate-400 text-xs px-3 py-1 rounded-full">{item.label}</span>
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
                    : "bg-slate-800 text-slate-100 border border-slate-700/60 rounded-bl-md"
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
      <div className="flex-shrink-0 px-3 py-3 border-t border-slate-800/80 bg-slate-900/60">
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
    <div className="flex h-[calc(100vh-120px)] min-h-[500px] rounded-2xl overflow-hidden border border-slate-800/80 bg-slate-950">

      {/* ── Left panel: thread list ─────────────────────────────────────────── */}
      <div className={`flex flex-col border-r border-slate-800/80 bg-slate-900/80 flex-shrink-0
        ${mobileShowThread ? "hidden" : "flex"} w-full lg:flex lg:w-80 xl:w-96`}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800/80">
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
        <div className="px-3 py-2.5 border-b border-slate-800/50">
          <div className="relative">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-3 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none transition-colors"/>
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
                className={`w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-800/40 transition-all text-left ${isActive ? "bg-indigo-600/15" : "hover:bg-slate-800/40"}`}>
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
                  <div className={`text-xs truncate mt-0.5 ${unread > 0 ? "text-slate-300 font-medium" : "text-slate-500"}`}>
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
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/80 bg-slate-900/60 flex-shrink-0">
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
  currentUser, brands, opsTeam, users,
  messages, onSend, onMarkRead,
  tickets, onAddTicket, onUpdateTicket, onDeleteTicket,
  isEmployee,
}) {
  const [tab, setTab] = useState("helpdesk"); // Help Desk opens first

  // Badge counts
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
    ? tickets.filter(t => t.createdById === myOpsId && t.status !== "Closed").length
    : tickets.filter(t => brands.some(b => b.id === t.brandId) && ["Open","In Progress"].includes(t.status)).length;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] min-h-[500px]">
      {/* ── Toggle bar ── */}
      <div className="flex items-center gap-2 mb-4">
        {/* Radio-style pill toggle */}
        <div className="flex items-center bg-slate-900/80 border border-slate-700/60 rounded-2xl p-1 gap-1">
          <button
            onClick={() => setTab("chat")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === "chat"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <MessageSquare size={14}/>
            Chat
            {inboxUnread > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold leading-none ${tab === "chat" ? "bg-white/20 text-white" : "bg-indigo-500 text-white"}`}>
                {inboxUnread}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("helpdesk")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === "helpdesk"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <LifeBuoy size={14}/>
            Help Desk
            {hdBadge > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold leading-none ${tab === "helpdesk" ? "bg-white/20 text-white" : "bg-red-500 text-white"}`}>
                {hdBadge}
              </span>
            )}
          </button>
        </div>
        <div className="text-xs text-slate-600 hidden sm:block">
          {tab === "chat" ? "Messaging & group channels" : "Support tickets & requests"}
        </div>
      </div>

      {/* ── Panel ── */}
      <div className="flex-1 min-h-0">
        {tab === "chat" && (
          <InboxView
            currentUser={currentUser} brands={brands} opsTeam={opsTeam} users={users}
            messages={messages} onSend={onSend} onMarkRead={onMarkRead}
          />
        )}
        {tab === "helpdesk" && (
          isEmployee
            ? <EmployeeHelpdeskView
                brands={brands} tickets={tickets} currentUser={currentUser}
                onAdd={onAddTicket} onUpdate={onUpdateTicket}
              />
            : <HelpdeskManagerView
                brands={brands} tickets={tickets} opsTeam={opsTeam} users={users}
                currentUser={currentUser} onUpdate={onUpdateTicket} onDelete={onDeleteTicket}
              />
        )}
      </div>
    </div>
  );
}


// ─── Main App (merged: live financial + new ops) ───────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(() => { try { const s=localStorage.getItem("cb_session"); return s?JSON.parse(s):null; } catch { return null; } });

  // ── Financial state (Supabase) ────────────────────────────────────────────
  const [brands,  setBrands]  = useState([]);
  const [users,   setUsers]   = useState([]);
  const [entries, setEntries] = useState([]);
  const [issues,  setIssues]  = useState([]);
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);

  // ── Ops state (Supabase) ──────────────────────────────────────────────────
  const [checklists,      setChecklists]      = useState([]);
  const [tempUnits,       setTempUnits]       = useState([]);
  const [cleaningTasks,   setCleaningTasks]   = useState([]);
  const [assignments,     setAssignments]     = useState([]);
  const [opsTeam,         setOpsTeam]         = useState([]);
  const [tempLogs,        setTempLogs]        = useState([]);
  const [deliveries,      setDeliveries]      = useState([]);
  const [checklistStates, setChecklistStates] = useState({});
  const [auditTrail,      setAuditTrail]      = useState([]);
  const [hdTickets,       setHdTickets]       = useState([]);
  const [messages,        setMessages]        = useState([]);
  const [availability,    setAvailability]    = useState([]);

  const [activeView, setActiveView] = useState("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loginMode, setLoginMode] = useState("employee"); // "employee" | "manager"
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [toast, setToast] = useState(null); // { msg, type: "success"|"error" }

  // ── Load everything on mount ──────────────────────────────────────────────
  useEffect(() => {
    async function loadAll() {
      try {
        const [b, u, e, i, cl, tu, ct, as, ot, tl, dl, cs, at, hd, msgs, avail] = await Promise.all([
          fetchBrands(), fetchUsers(), fetchEntries(), fetchIssues(),
          fetchChecklists(), fetchTempUnits(), fetchCleaningTasks(), fetchAssignments(),
          fetchOpsTeam(), fetchTempLogs(), fetchDeliveries(), fetchChecklistStates(), fetchAuditTrail(),
          fetchHelpdeskTickets(), fetchInboxMessages(), fetchAvailability(),
        ]);
        setBrands(b); setUsers(u); setEntries(e); setIssues(i);
        setChecklists(cl); setTempUnits(tu); setCleaningTasks(ct); setAssignments(as);
        setOpsTeam(ot); setTempLogs(tl); setDeliveries(dl); setChecklistStates(cs); setAuditTrail(at);
        setHdTickets(hd); setMessages(msgs); setAvailability(avail);
        setDbReady(true);
      } catch (err) {
        console.error("Supabase load error:", err);
        setDbError(err.message);
      }
    }
    loadAll();
  }, []);

  // ── Supabase Realtime + polling fallback ─────────────────────────────────────
  // Realtime: instant updates when rows change in DB.
  // Polling: 30s fallback — catches updates if Realtime isn't enabled on the table.
  useEffect(() => {
    if (!dbReady) return;

    // 30-second polling fallback for availability (in case Realtime not enabled yet)
    const pollAvailability = async () => {
      try {
        const fresh = await fetchAvailability();
        setAvailability(fresh);
      } catch (err) {
        console.warn("Availability poll failed:", err.message);
      }
    };
    const pollTickets = async () => {
      try {
        const fresh = await fetchHelpdeskTickets();
        setHdTickets(fresh);
      } catch (err) {
        console.warn("Ticket poll failed:", err.message);
      }
    };
    const interval = setInterval(() => {
      pollAvailability();
      pollTickets();
    }, 30000);

    // Subscribe to helpdesk_tickets changes
    const ticketChannel = supabase
      .channel("realtime:helpdesk_tickets")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "helpdesk_tickets",
      }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "INSERT") {
          const ticket = {
            id: newRow.id, brandId: newRow.brand_id, title: newRow.title,
            description: newRow.description, category: newRow.category,
            priority: newRow.priority, status: newRow.status,
            createdById: newRow.created_by_id, createdByName: newRow.created_by_name,
            assignedTo: newRow.assigned_to || [], comments: newRow.comments || [],
            createdAt: newRow.created_at, updatedAt: newRow.updated_at,
          };
          setHdTickets(ts => {
            if (ts.some(t => t.id === ticket.id)) return ts;
            return [ticket, ...ts];
          });
        } else if (eventType === "UPDATE") {
          const ticket = {
            id: newRow.id, brandId: newRow.brand_id, title: newRow.title,
            description: newRow.description, category: newRow.category,
            priority: newRow.priority, status: newRow.status,
            createdById: newRow.created_by_id, createdByName: newRow.created_by_name,
            assignedTo: newRow.assigned_to || [], comments: newRow.comments || [],
            createdAt: newRow.created_at, updatedAt: newRow.updated_at,
          };
          setHdTickets(ts => ts.map(t => t.id === ticket.id ? ticket : t));
        } else if (eventType === "DELETE") {
          setHdTickets(ts => ts.filter(t => t.id !== oldRow.id));
        }
      })
      .subscribe();

    // Subscribe to inbox_messages changes
    const msgChannel = supabase
      .channel("realtime:inbox_messages")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "inbox_messages",
      }, (payload) => {
        const r = payload.new;
        const msg = {
          id: r.id, brandId: r.brand_id,
          fromId: r.from_id, fromName: r.from_name, fromRole: r.from_role,
          toScope: r.to_scope, toBrandId: r.to_brand_id,
          toPersonId: r.to_person_id, toPersonName: r.to_person_name,
          subject: r.subject, body: r.body, readBy: r.read_by || [],
          createdAt: r.created_at,
        };
        setMessages(ms => {
          if (ms.some(m => m.id === msg.id)) return ms;
          return [msg, ...ms];
        });
      })
      .subscribe();

    // Subscribe to availability changes
    const availChannel = supabase
      .channel("realtime:availability")
      .on("postgres_changes", { event: "*", schema: "public", table: "availability" }, (payload) => {
        const { eventType, new: r, old: oldRow } = payload;
        if (eventType === "DELETE") { setAvailability(as => as.filter(a => a.id !== oldRow.id)); return; }
        const a = {
          id: r.id, brandId: r.brand_id, employeeId: r.employee_id, employeeName: r.employee_name,
          type: r.type, date: r.date, dayOfWeek: r.day_of_week, startDate: r.start_date, endDate: r.end_date,
          startTime: r.start_time?.slice(0,5)||"09:00", endTime: r.end_time?.slice(0,5)||"17:00",
          available: r.available, notes: r.notes, status: r.status, managerNotes: r.manager_notes||"",
          amendedStartTime: r.amended_start_time?.slice(0,5)||null, amendedEndTime: r.amended_end_time?.slice(0,5)||null,
          amendedDate: r.amended_date||null, amendedDayOfWeek: r.amended_day_of_week||null,
          createdAt: r.created_at, updatedAt: r.updated_at,
        };
        if (eventType === "INSERT") setAvailability(as => as.some(x => x.id === a.id) ? as : [a, ...as]);
        if (eventType === "UPDATE") setAvailability(as => as.map(x => x.id === a.id ? a : x));
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(ticketChannel);
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(availChannel);
    };
  }, [dbReady]);

  useEffect(() => { try { if(currentUser) localStorage.setItem("cb_session",JSON.stringify(currentUser)); else localStorage.removeItem("cb_session"); } catch {} }, [currentUser]);

  const handleLogin  = useCallback(user => {
    setCurrentUser(user);
    setActiveView(user.role === "employee" ? "ops-tasks" : "dashboard");
  }, []);
  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    setActiveView("dashboard");
    setLoginMode("employee"); // always return to employee screen after logout
  }, []);

  // ── Audit helper ──────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const addAudit = useCallback(async (action, detail, by, brandId) => {
    const entry = { brandId: brandId || null, action, detail: detail || "", by: by || "System", date: getTodayStr(), time: nowTimeStr(), timestamp: new Date().toISOString() };
    await insertAuditEntry(entry);
    setAuditTrail(t => [{ id: `local-${Date.now()}`, ...entry }, ...t].slice(0, 500));
  }, []);

  // ── Brands ────────────────────────────────────────────────────────────────
  const addBrand = useCallback(async b => { try { const saved = await insertBrand(b); setBrands(bs => [...bs, saved]); showToast(`${b.name} added`); } catch (err) { showToast("Failed to add location: " + err.message, "error"); } }, [showToast]);
  const updateBrand = useCallback(async b => { try { const saved = await upsertBrand(b); setBrands(bs => bs.map(x => x.id === saved.id ? saved : x)); showToast(`${b.name} updated`); } catch (err) { showToast("Failed to update location: " + err.message, "error"); } }, [showToast]);
  const deleteBrand = useCallback(async id => { try { await removeBrand(id); setBrands(bs => bs.filter(b => b.id !== id)); setEntries(es => es.filter(e => e.brandId !== id)); setUsers(us => us.map(u => ({ ...u, brandIds: u.brandIds.filter(bid => bid !== id) }))); setIssues(is => is.filter(i => i.brandId !== id)); setAssignments(as => as.filter(a => a.brandId !== id)); showToast("Location deleted"); } catch (err) { showToast("Failed to delete location: " + err.message, "error"); } }, [showToast]);
  const updateKPITargets = useCallback(async (brandId, targets) => { try { const brand = brands.find(b => b.id === brandId); if (!brand) return; const updated = { ...brand, kpiTargets: { ...brand.kpiTargets, ...targets } }; const saved = await upsertBrand(updated); setBrands(bs => bs.map(b => b.id === brandId ? saved : b)); showToast("KPI targets saved"); } catch (err) { showToast("Failed to save KPI targets: " + err.message, "error"); } }, [brands, showToast]);

  // ── Users ─────────────────────────────────────────────────────────────────
  const addUser    = useCallback(async u => { try { const saved = await insertUser(u); setUsers(us => [...us, saved]); showToast(`${u.name} added`); } catch (err) { showToast("Failed to add user: " + err.message, "error"); } }, [showToast]);
  const updateUser = useCallback(async u => { try { const saved = await upsertUser(u); setUsers(us => us.map(x => x.id === saved.id ? saved : x)); showToast(`${u.name} updated`); } catch (err) { showToast("Failed to update user: " + err.message, "error"); } }, [showToast]);
  const deleteUser = useCallback(async id => { try { await removeUser(id); setUsers(us => us.filter(u => u.id !== id)); showToast("User removed"); } catch (err) { showToast("Failed to remove user: " + err.message, "error"); } }, [showToast]);

  // ── EOD Entries ───────────────────────────────────────────────────────────
  const addEntry = useCallback(async entry => {
    try {
      const saved = await upsertEntry(entry);
      setEntries(es => { const f = es.filter(e => e.id !== saved.id); return [...f, saved].sort((a,b) => a.date.localeCompare(b.date)); });
      showToast("EOD report saved");
    } catch (err) {
      showToast("Failed to save EOD report: " + err.message, "error");
    }
  }, [showToast]);
  const bulkImport = useCallback(async rows => { try { const saved = await upsertEntries(rows); setEntries(es => { const map = new Map(es.map(e => [e.id, e])); saved.forEach(r => map.set(r.id, r)); return [...map.values()].sort((a,b) => a.date.localeCompare(b.date)); }); showToast(`${rows.length} entries imported`); } catch (err) { showToast("Import failed: " + err.message, "error"); } }, [showToast]);

  // ── Issues ────────────────────────────────────────────────────────────────
  const addIssue    = useCallback(async issue => { try { const saved = await insertIssue(issue); setIssues(is => [...is, saved]); showToast("Issue reported"); } catch (err) { showToast("Failed to report issue: " + err.message, "error"); } }, [showToast]);
  const updateIssue = useCallback(async issue => { try { const saved = await upsertIssue(issue); setIssues(is => is.map(x => x.id === saved.id ? saved : x)); } catch (err) { showToast("Failed to update issue: " + err.message, "error"); } }, [showToast]);
  const deleteIssue = useCallback(async id => { try { await removeIssue(id); setIssues(is => is.filter(i => i.id !== id)); showToast("Issue deleted"); } catch (err) { showToast("Failed to delete issue: " + err.message, "error"); } }, [showToast]);

  // ── Checklists ────────────────────────────────────────────────────────────
  const addChecklist    = useCallback(async cl => { try { const saved = await upsertChecklist(cl); setChecklists(cs => [...cs, saved]); showToast(`"${cl.name}" checklist created`); } catch (err) { showToast("Failed to save checklist: " + err.message, "error"); } }, [showToast]);
  const updateChecklist = useCallback(async cl => { try { const saved = await upsertChecklist(cl); setChecklists(cs => cs.map(x => x.id === saved.id ? saved : x)); showToast(`"${cl.name}" updated`); } catch (err) { showToast("Failed to update checklist: " + err.message, "error"); } }, [showToast]);
  const deleteChecklist = useCallback(async id => { try { await removeChecklist(id); setChecklists(cs => cs.filter(c => c.id !== id)); showToast("Checklist deleted"); } catch (err) { showToast("Failed to delete checklist: " + err.message, "error"); } }, [showToast]);

  // ── Temp Units ────────────────────────────────────────────────────────────
  const addTempUnit    = useCallback(async u => { try { const saved = await upsertTempUnit(u); setTempUnits(ts => [...ts, saved]); showToast(`"${u.name}" added`); } catch (err) { showToast("Failed to add temp unit: " + err.message, "error"); } }, [showToast]);
  const updateTempUnit = useCallback(async u => { try { const saved = await upsertTempUnit(u); setTempUnits(ts => ts.map(x => x.id === saved.id ? saved : x)); showToast(`"${u.name}" updated`); } catch (err) { showToast("Failed to update temp unit: " + err.message, "error"); } }, [showToast]);
  const deleteTempUnit = useCallback(async id => { try { await removeTempUnit(id); setTempUnits(ts => ts.filter(u => u.id !== id)); showToast("Temp unit deleted"); } catch (err) { showToast("Failed to delete temp unit: " + err.message, "error"); } }, [showToast]);

  // ── Cleaning Tasks ────────────────────────────────────────────────────────
  const addCleanTask    = useCallback(async t => { try { const saved = await upsertCleaningTask(t); setCleaningTasks(ts => [...ts, saved]); showToast(`"${t.name}" added`); } catch (err) { showToast("Failed to add cleaning task: " + err.message, "error"); } }, [showToast]);
  const updateCleanTask = useCallback(async t => { try { const saved = await upsertCleaningTask(t); setCleaningTasks(ts => ts.map(x => x.id === saved.id ? saved : x)); showToast(`"${t.name}" updated`); } catch (err) { showToast("Failed to update cleaning task: " + err.message, "error"); } }, [showToast]);
  const deleteCleanTask = useCallback(async id => { try { await removeCleaningTask(id); setCleaningTasks(ts => ts.filter(t => t.id !== id)); showToast("Cleaning task deleted"); } catch (err) { showToast("Failed to delete cleaning task: " + err.message, "error"); } }, [showToast]);

  // ── Assignments ───────────────────────────────────────────────────────────
  const addAssignment    = useCallback(async a => { try { const saved = await upsertAssignment(a); setAssignments(as => [...as, saved]); showToast("Assignment created"); } catch (err) { showToast("Failed to create assignment: " + err.message, "error"); } }, [showToast]);
  const updateAssignment = useCallback(async a => { try { const saved = await upsertAssignment(a); setAssignments(as => as.map(x => x.id === saved.id ? saved : x)); showToast("Assignment updated"); } catch (err) { showToast("Failed to update assignment: " + err.message, "error"); } }, [showToast]);
  const deleteAssignment = useCallback(async id => { try { await removeAssignment(id); setAssignments(as => as.filter(a => a.id !== id)); showToast("Assignment deleted"); } catch (err) { showToast("Failed to delete assignment: " + err.message, "error"); } }, [showToast]);

  // ── Ops Team ──────────────────────────────────────────────────────────────
  const addOpsTeam = useCallback(async m => {
    try {
      const saved = await upsertOpsTeamMember(m);
      setOpsTeam(ms => [...ms, saved]);
      showToast(`${saved.firstName} ${saved.lastName} added to team`);
    } catch (err) {
      console.error("addOpsTeam failed:", err);
      showToast("Failed to add team member: " + err.message, "error");
    }
  }, [showToast]);

  const updateOpsTeam = useCallback(async m => {
    try {
      const saved = await upsertOpsTeamMember(m);
      setOpsTeam(ms => ms.map(x => x.id === saved.id ? saved : x));
      showToast(`${saved.firstName} ${saved.lastName} updated`);
    } catch (err) {
      console.error("updateOpsTeam failed:", err);
      showToast("Failed to update team member: " + err.message, "error");
    }
  }, [showToast]);

  const deleteOpsTeam = useCallback(async id => {
    try {
      await removeOpsTeamMember(id);
      setOpsTeam(ms => ms.filter(m => m.id !== id));
      showToast("Team member removed");
    } catch (err) {
      console.error("deleteOpsTeam failed:", err);
      showToast("Failed to remove team member: " + err.message, "error");
    }
  }, [showToast]);

  // ── Temp Logs ─────────────────────────────────────────────────────────────
  const handleTempLog = useCallback(async log => {
    try {
      const saved = await insertTempLog(log);
      setTempLogs(ls => [...ls, saved]);
      const unit = tempUnits.find(u => u.id === log.unitId);
      await addAudit(saved.isBreach ? "breach" : "logged", `${unit?.name || log.unitId}: ${log.value}°C${saved.isBreach ? " — BREACH" : ""}`, log.loggedBy, log.brandId);
      if (saved.isBreach) showToast(`⚠ Temperature breach logged for ${unit?.name || log.unitId}`, "error");
      else showToast("Temperature reading saved");
    } catch (err) { showToast("Failed to save temperature reading: " + err.message, "error"); }
  }, [tempUnits, addAudit, showToast]);

  // ── Deliveries ────────────────────────────────────────────────────────────
  const handleDeliveryAdd = useCallback(async d => {
    try {
      const saved = await insertDelivery(d);
      setDeliveries(ds => [...ds, saved]);
      await addAudit("logged", `Delivery from ${d.supplier} — ${d.condition}`, d.loggedBy, d.brandId);
      showToast("Delivery logged successfully");
    } catch (err) { showToast("Failed to log delivery: " + err.message, "error"); }
  }, [addAudit, showToast]);

  // ── Checklist sign-off ────────────────────────────────────────────────────
  const handleSignOff = useCallback(async (assignment, taskName) => {
    try {
      const now = new Date().toISOString();
      const stateKey = `${assignment.brandId}||${assignment.taskId}||${getTodayStr()}`;
      await upsertChecklistState(assignment.brandId, assignment.taskId, getTodayStr(), checklistStates[stateKey] || {}, currentUser?.name || "Manager", now);
      await addAudit("sign-off", `${taskName} completed`, currentUser?.name || "Manager", assignment.brandId);
      showToast(`✓ ${taskName} signed off`);
    } catch (err) { showToast("Sign-off failed: " + err.message, "error"); }
  }, [checklistStates, currentUser, addAudit, showToast]);

  // ── Checklist item toggle ─────────────────────────────────────────────────
  const handleChecklistItemToggle = useCallback(async (stateKey, itemId, val) => {
    const newState = { ...(checklistStates[stateKey] || {}), [itemId]: val };
    setChecklistStates(s => ({ ...s, [stateKey]: newState }));
    const [brandId, checklistId, date] = stateKey.split("||");
    await upsertChecklistState(brandId, checklistId, date || getTodayStr(), newState, "", null);
  }, [checklistStates]);

  const handleClearAudit = useCallback(async () => {
    try {
      await clearAuditTrail();
      setAuditTrail([]);
      showToast("Audit trail cleared");
    } catch (err) { showToast("Failed to clear audit trail: " + err.message, "error"); }
  }, [showToast]);

  // ── Availability ─────────────────────────────────────────────────────────────
  const addAvailability = useCallback(async a => {
    try { const saved = await insertAvailability(a); setAvailability(as => [saved, ...as]); showToast("Availability submitted"); }
    catch (err) { showToast("Failed to submit: " + err.message, "error"); }
  }, [showToast]);

  const updateAvailability = useCallback(async a => {
    try { const saved = await upsertAvailability(a); setAvailability(as => as.map(x => x.id === saved.id ? saved : x)); showToast("Availability updated"); }
    catch (err) { showToast("Failed to update: " + err.message, "error"); }
  }, [showToast]);

  const deleteAvailability = useCallback(async id => {
    try { await removeAvailability(id); setAvailability(as => as.filter(a => a.id !== id)); showToast("Availability deleted"); }
    catch (err) { showToast("Failed to delete: " + err.message, "error"); }
  }, [showToast]);

  // ── Helpdesk ─────────────────────────────────────────────────────────────────
  const addHdTicket = useCallback(async t => {
    try { const saved = await insertHelpdeskTicket(t); setHdTickets(ts => [saved, ...ts]); showToast("Ticket submitted"); }
    catch (err) { showToast("Failed to submit ticket: " + err.message, "error"); }
  }, [showToast]);

  const updateHdTicket = useCallback(async t => {
    try { const saved = await upsertHelpdeskTicket(t); setHdTickets(ts => ts.map(x => x.id === saved.id ? saved : x)); }
    catch (err) { showToast("Failed to update ticket: " + err.message, "error"); }
  }, [showToast]);

  const deleteHdTicket = useCallback(async id => {
    try { await removeHelpdeskTicket(id); setHdTickets(ts => ts.filter(t => t.id !== id)); showToast("Ticket deleted"); }
    catch (err) { showToast("Failed to delete ticket: " + err.message, "error"); }
  }, [showToast]);

  // ── Inbox ─────────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async msg => {
    try { const saved = await insertInboxMessage(msg); setMessages(ms => [saved, ...ms]); showToast("Message sent"); }
    catch (err) { showToast("Failed to send: " + err.message, "error"); }
  }, [showToast]);

  const handleMarkRead = useCallback(async (id, readerId) => {
    await markMessageRead(id, readerId);
    setMessages(ms => ms.map(m => m.id === id && !m.readBy?.includes(readerId) ? { ...m, readBy: [...(m.readBy || []), readerId] } : m));
  }, []);

  // ── Data utilities ────────────────────────────────────────────────────────
  const exportData = () => {
    const data = JSON.stringify({ brands, users, entries, issues }, null, 2);
    const blob = new Blob([data], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "createbrands-export.json"; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 100);
  };
  const importData = () => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".json";
    input.onchange = e => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = ev => { try { const d = JSON.parse(ev.target.result); if (d.brands) setBrands(d.brands); if (d.users) setUsers(d.users); if (d.entries) setEntries(d.entries); if (d.issues) setIssues(d.issues); } catch { alert("Invalid JSON file."); } }; reader.readAsText(file); }; input.click();
  };
  const resetData = async () => {
    // Called after user confirms via ConfirmModal — no window.confirm needed
    await supabase.from("eod_entries").delete().neq("id","__none__");
    await supabase.from("issues").delete().neq("id","__none__");
    await supabase.from("users").delete().neq("id","__none__");
    await supabase.from("brands").delete().neq("id","__none__");
    const savedBrands = await Promise.all(SEED_BRANDS.map(insertBrand));
    const savedUsers  = await Promise.all(SEED_USERS.map(insertUser));
    setBrands(savedBrands); setUsers(savedUsers); setEntries([]); setIssues([]);
    localStorage.removeItem("cb_session"); setCurrentUser(null);
  };

  if (dbError) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f172a",color:"#f87171",fontFamily:"sans-serif",gap:12}}>
      <span style={{fontSize:32}}>⚠️</span><strong>Could not connect to database</strong>
      <code style={{fontSize:12,color:"#94a3b8"}}>{dbError}</code>
      <p style={{fontSize:12,color:"#64748b",maxWidth:400,textAlign:"center"}}>Check your <code>REACT_APP_SUPABASE_URL</code> and <code>REACT_APP_SUPABASE_ANON_KEY</code> environment variables.</p>
    </div>
  );

  if (!dbReady) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f172a",color:"#94a3b8",fontFamily:"sans-serif",gap:12}}>
      <span style={{fontSize:24}}>⏳</span><span>Loading data…</span>
    </div>
  );

  if (!currentUser) {
    if (loginMode === "manager") {
      return (
        <AuthContext.Provider value={{ user: null }}>
          <LoginScreen
            users={users}
            onLogin={handleLogin}
            onSwitchToEmployee={() => setLoginMode("employee")}
          />
        </AuthContext.Provider>
      );
    }
    return (
      <AuthContext.Provider value={{ user: null }}>
        <EmployeeLoginScreen
          opsTeam={opsTeam}
          brands={brands}
          onLogin={handleLogin}
          onSwitchToManager={() => setLoginMode("manager")}
        />
      </AuthContext.Provider>
    );
  }

  // ── Employee shell — restricted view ───────────────────────────────────────
  if (currentUser.role === "employee") {
    return (
      <EmployeeShell
        currentUser={currentUser}
        brands={brands}
        opsTeam={opsTeam}
        assignments={assignments}
        checklists={checklists}
        tempUnits={tempUnits}
        cleaningTasks={cleaningTasks}
        auditTrail={auditTrail}
        checklistStates={checklistStates}
        tempLogs={tempLogs}
        deliveries={deliveries}
        issues={issues}
        onSignOff={handleSignOff}
        onChecklistItemToggle={handleChecklistItemToggle}
        onTempLog={handleTempLog}
        onDeliveryAdd={handleDeliveryAdd}
        onAddIssue={addIssue}
        onUpdateIssue={updateIssue}
        hdTickets={hdTickets}
        onAddHdTicket={addHdTicket}
        onUpdateHdTicket={updateHdTicket}
        availability={availability}
        onAddAvailability={addAvailability}
        messages={messages}
        onSendMessage={sendMessage}
        onMarkRead={handleMarkRead}
        onLogout={handleLogout}
      />
    );
  }

  const visibleBrands = brands.filter(b => currentUser.role === "owner" || currentUser.brandIds.includes(b.id));
  const openIssueCount = issues.filter(i => visibleBrands.some(b => b.id === i.brandId) && ["Open","In Progress","Awaiting Parts"].includes(i.status)).length;
  const overdueOpsCount = assignments.filter(a => visibleBrands.some(b => b.id === a.brandId) && isActiveToday(a) && isOverdue(a)).length;

  // ── Badge helpers (memoised) ─────────────────────────────────────────────
  const hdOpenCount = hdTickets.filter(t => visibleBrands.some(b => b.id === t.brandId) && ["Open","In Progress"].includes(t.status)).length;
  const inboxUnread = (() => {
    const myId = currentUser.id;
    return messages.filter(m => {
      if (m.fromId === myId) return false;
      if (m.toScope === "all_locations") return true;
      if (m.toScope === "location" && visibleBrands.some(b => b.id === m.toBrandId)) return true;
      if (m.toScope === "individual" && m.toPersonId === myId) return true;
      return false;
    }).filter(m => !m.readBy?.includes(myId)).length;
  })();

  const NAV_GROUPS = [
    {
      group: "Overview",
      items: [
        { key: "dashboard", label: "Dashboard",     icon: LayoutDashboard },
        { key: "tactical",  label: "Performance",   icon: BarChart2 },
      ],
    },
    {
      group: "Daily Ops",
      items: [
        { key: "ops-tasks",      label: "Today's Tasks",   icon: ListChecks,  badge: overdueOpsCount > 0 ? overdueOpsCount.toString() : null },
        { key: "eod",            label: "EOD Report",       icon: ClipboardList },
        { key: "ops-temps",      label: "Temperatures",     icon: Thermometer },
        { key: "ops-deliveries", label: "Deliveries",       icon: Truck },
        { key: "ops-network",    label: "Ops Overview",     icon: ShieldCheck },
        { key: "ops-compliance", label: "Compliance",       icon: CheckSquare },
      ],
    },
    {
      group: "Team",
      items: [
        { key: "comms",        label: "Communication", icon: MessageSquare, badge: (() => { const total = (hdOpenCount > 0 ? hdOpenCount : 0) + (inboxUnread > 0 ? inboxUnread : 0); return total > 0 ? total.toString() : null; })() },
        { key: "availability", label: "Availability",  icon: Calendar,      badge: (() => { const pending = availability.filter(a => visibleBrands.some(b => b.id === a.brandId) && a.status === "pending").length; return pending > 0 ? pending.toString() : null; })() },
        { key: "issues",       label: "Issues",        icon: Wrench,        badge: openIssueCount > 0 ? openIssueCount.toString() : null },
      ],
    },
    {
      group: "Settings",
      items: [
        { key: "ops-assigns",  label: "Assignments",   icon: Clipboard },
        { key: "ops-settings", label: "Ops Setup",     icon: Settings },
        { key: "ops-audit",    label: "Audit Trail",   icon: ScrollText },
        ...(currentUser.role === "owner" ? [{ key: "admin", label: "Admin", icon: Users, badge: "OWNER" }] : []),
      ],
    },
  ];

  const titles = { dashboard: "Executive Dashboard", tactical: "Performance", eod: "EOD Report", issues: "Issues & Maintenance", "ops-network": "Ops Overview", "ops-tasks": "Today's Tasks", "ops-temps": "Temperature Log", "ops-deliveries": "Deliveries", "ops-assigns": "Assignments", "ops-compliance": "Compliance", "ops-audit": "Audit Trail", "ops-settings": "Ops Setup", admin: "Admin", helpdesk: "Help Desk", inbox: "Inbox", comms: "Communication", availability: "Availability" };
  const todayDisplay = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  const Sidebar = ({ mobile = false }) => {
    // Find which group the current activeView belongs to
    const activeGroup = NAV_GROUPS.find(g => g.items.some(n => n.key === activeView))?.group;

    const [collapsed, setCollapsed] = useState(() => {
      // Start all collapsed except the group containing the active view
      return NAV_GROUPS.reduce((acc, g) => {
        acc[g.group] = g.group !== activeGroup;
        return acc;
      }, {});
    });

    // Auto-expand the active group whenever activeView changes
    useEffect(() => {
      if (activeGroup) {
        setCollapsed(c => ({ ...c, [activeGroup]: false }));
      }
    }, [activeGroup]);

    const toggleGroup = (g) => setCollapsed(c => ({ ...c, [g]: !c[g] }));
    const groupIcons = { Overview: LayoutDashboard, "Daily Ops": Activity, Team: Users, Settings: Settings };

    return (
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800/80">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg flex-shrink-0">
            <BarChart2 size={15} className="text-white"/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white leading-tight">Create Brands</div>
            <div className="text-xs text-slate-500 leading-tight">Hospitality Group</div>
          </div>
          {mobile && (
            <button onClick={() => setDrawerOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-all flex-shrink-0">
              <X size={16}/>
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {NAV_GROUPS.map(({ group, items }) => {
            const GIcon = groupIcons[group] || LayoutDashboard;
            const isCollapsed = collapsed[group];
            return (
              <div key={group}>
                {/* Group header — clickable to collapse */}
                <button
                  onClick={() => toggleGroup(group)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-500 hover:text-slate-300 transition-all group mb-0.5"
                >
                  <GIcon size={12} className="flex-shrink-0"/>
                  <span className="flex-1 text-left text-xs font-bold uppercase tracking-widest">{group}</span>
                  <ChevronDownIcon size={12} className={`transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}/>
                </button>

                {/* Nav items */}
                {!isCollapsed && (
                  <div className="space-y-0.5 mb-2">
                    {items.map(n => {
                      const NIcon = n.icon;
                      const active = activeView === n.key;
                      return (
                        <button key={n.key}
                          onClick={() => { setActiveView(n.key); setDrawerOpen(false); }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                            active
                              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-900/50"
                              : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
                          }`}
                        >
                          <NIcon size={14} className="flex-shrink-0"/>
                          <span className="flex-1 text-left">{n.label}</span>
                          {n.badge && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-md font-bold leading-none ${
                              n.badge === "OWNER"
                                ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                                : "bg-red-500 text-white"
                            }`}>{n.badge}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-slate-800/80 space-y-3">
          <UserChip user={currentUser} onLogout={handleLogout}/>
          {/* Data tools — owner only */}
          {currentUser.role === "owner" && (
            <div className="flex gap-1.5">
              <button onClick={exportData} title="Export data" className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-slate-800/80 text-slate-400 text-xs font-semibold hover:bg-slate-700 hover:text-slate-200 transition-all">
                <Download size={11}/> Export
              </button>
              <button onClick={importData} title="Import data" className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-slate-800/80 text-slate-400 text-xs font-semibold hover:bg-slate-700 hover:text-slate-200 transition-all">
                <Upload size={11}/> Import
              </button>
              <button onClick={() => setResetConfirmOpen(true)} title="Reset data" className="p-1.5 rounded-lg bg-slate-800/80 text-slate-500 text-xs font-semibold hover:bg-red-950/40 hover:text-red-400 transition-all">
                <RotateCcw size={11}/>
              </button>
            </div>
          )}
          {currentUser.role !== "owner" && (
            <button onClick={exportData} className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg bg-slate-800/80 text-slate-400 text-xs font-semibold hover:bg-slate-700 transition-all">
              <Download size={11}/> Export
            </button>
          )}
          <div className="text-xs text-slate-600 text-center tabular-nums">{brands.length} locations · {issues.length} issues</div>
        </div>
      </div>
    );
  };

  return (
    <AuthContext.Provider value={{user:currentUser}}>
      <div className="min-h-screen bg-slate-950 text-white flex">
        <aside className="hidden lg:flex w-60 flex-col bg-slate-900/80 border-r border-slate-800 flex-shrink-0"><Sidebar/></aside>
        {drawerOpen && <div className="fixed inset-0 z-50 lg:hidden"><div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)}/><div className="absolute left-0 top-0 bottom-0 w-72 bg-slate-900 border-r border-slate-800 flex flex-col"><Sidebar mobile/></div></div>}
        <main className="flex-1 flex flex-col min-w-0">
          <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/80 bg-slate-900/60 sticky top-0 z-10 backdrop-blur-sm">
            <button onClick={() => setDrawerOpen(true)} className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"><Menu size={18}/></button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="text-sm font-bold text-white">{titles[activeView] || activeView}</h1>
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                  <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"/>Live
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{todayDisplay}</div>
            </div>
            {/* Notification badges in header for quick access */}
            {(hdOpenCount > 0 || inboxUnread > 0) && (
              <div className="hidden sm:flex items-center gap-2">
                {hdOpenCount > 0 && <button onClick={() => setActiveView("helpdesk")} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-all"><LifeBuoy size={12}/>{hdOpenCount} ticket{hdOpenCount > 1 ? "s" : ""}</button>}
                {inboxUnread > 0 && <button onClick={() => setActiveView("inbox")} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold hover:bg-indigo-500/20 transition-all"><Inbox size={12}/>{inboxUnread} unread</button>}
              </div>
            )}
            <div className="lg:hidden"><UserChip user={currentUser} onLogout={handleLogout} compact/></div>
          </header>
          <div className="flex-1 p-5 lg:p-6 overflow-auto">
            {activeView === "dashboard"       && <DashboardView brands={visibleBrands} entries={entries} issues={issues}/>}
            {activeView === "tactical"        && <TacticalOpsView brands={visibleBrands} entries={entries} issues={issues} users={users} onAddIssue={addIssue} onUpdateIssue={updateIssue} onDeleteIssue={deleteIssue}/>}
            {activeView === "eod"             && <EODFormView brands={visibleBrands} onAddEntry={addEntry}/>}
            {activeView === "issues"          && <IssuesView brands={brands} issues={issues} users={users} currentUser={currentUser} onAddIssue={addIssue} onUpdateIssue={updateIssue} onDeleteIssue={deleteIssue}/>}
            {activeView === "ops-network"     && <OpsNetworkDashboard brands={visibleBrands} assignments={assignments} auditTrail={auditTrail} opsTeam={opsTeam} checklists={checklists} tempUnits={tempUnits} cleaningTasks={cleaningTasks}/>}
            {activeView === "ops-tasks"       && <TodaysTasks brands={visibleBrands} assignments={assignments} checklists={checklists} tempUnits={tempUnits} cleaningTasks={cleaningTasks} auditTrail={auditTrail} checklistStates={checklistStates} onSignOff={handleSignOff} onChecklistItemToggle={handleChecklistItemToggle}/>}
            {activeView === "ops-temps"       && <TemperatureLog brands={visibleBrands} tempUnits={tempUnits} tempLogs={tempLogs} onLog={handleTempLog}/>}
            {activeView === "ops-deliveries"  && <DeliveriesView brands={visibleBrands} deliveries={deliveries} onAdd={handleDeliveryAdd}/>}
            {activeView === "ops-assigns"     && <AssignmentsView brands={brands} assignments={assignments} checklists={checklists} tempUnits={tempUnits} cleaningTasks={cleaningTasks} opsTeam={opsTeam} auditTrail={auditTrail} onAdd={addAssignment} onEdit={updateAssignment} onDelete={deleteAssignment}/>}
            {activeView === "ops-compliance"  && <ComplianceView brands={visibleBrands} assignments={assignments} auditTrail={auditTrail}/>}
            {activeView === "ops-audit"       && <AuditTrailView brands={visibleBrands} auditTrail={auditTrail} onClear={handleClearAudit}/>}
            {activeView === "ops-settings"    && <OpsSettingsView brands={brands} checklists={checklists} tempUnits={tempUnits} cleaningTasks={cleaningTasks} opsTeam={opsTeam} onAddChecklist={addChecklist} onUpdateChecklist={updateChecklist} onDeleteChecklist={deleteChecklist} onAddTempUnit={addTempUnit} onUpdateTempUnit={updateTempUnit} onDeleteTempUnit={deleteTempUnit} onAddCleanTask={addCleanTask} onUpdateCleanTask={updateCleanTask} onDeleteCleanTask={deleteCleanTask} onAddOpsTeam={addOpsTeam} onUpdateOpsTeam={updateOpsTeam} onDeleteOpsTeam={deleteOpsTeam}/>}
            {activeView === "availability" && <ManagerAvailabilityView
              brands={visibleBrands} opsTeam={opsTeam} availability={availability}
              currentUser={currentUser}
              onUpdate={updateAvailability} onAdd={addAvailability} onDelete={deleteAvailability}
            />}
            {activeView === "comms" && <CommunicationView
              currentUser={currentUser} brands={visibleBrands} opsTeam={opsTeam} users={users}
              messages={messages} onSend={sendMessage} onMarkRead={handleMarkRead}
              tickets={hdTickets} onAddTicket={addHdTicket} onUpdateTicket={updateHdTicket} onDeleteTicket={deleteHdTicket}
              isEmployee={false}
            />}
            {activeView === "admin" && currentUser.role === "owner" && <AdminPanelView brands={brands} users={users} entries={entries} onAddBrand={addBrand} onUpdateBrand={updateBrand} onDeleteBrand={deleteBrand} onAddUser={addUser} onUpdateUser={updateUser} onDeleteUser={deleteUser} onUpdateKPITargets={updateKPITargets} onBulkImport={bulkImport}/>}
          </div>
        </main>
      </div>
    {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border text-sm font-semibold transition-all ${toast.type === "error" ? "bg-red-950 border-red-500/50 text-red-300" : "bg-emerald-950 border-emerald-500/50 text-emerald-300"}`}>
          {toast.type === "error" ? <AlertTriangle size={15}/> : <CheckCircle size={15}/>}
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100"><X size={13}/></button>
        </div>
      )}
      {resetConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0"><AlertTriangle size={18} className="text-red-400"/></div>
              <div className="text-sm text-slate-300">This will wipe all data and restore seed defaults. This cannot be undone.</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setResetConfirmOpen(false)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700">Cancel</button>
              <button onClick={async () => { setResetConfirmOpen(false); await resetData(); }} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500">Reset All Data</button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}
