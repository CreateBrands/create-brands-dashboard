import { useState, useMemo, useCallback, useEffect, createContext, useContext, useRef } from "react";
import {
  supabase,
  fetchBrands, insertBrand, upsertBrand, removeBrand,
  fetchUsers,  insertUser,  upsertUser,  removeUser,
  fetchEntries, upsertEntry, upsertEntries,
  fetchIssues, insertIssue, upsertIssue, removeIssue,
  fetchMaintenanceTickets, insertMaintenanceTicket, updateMaintenanceTicket, deleteMaintenanceTicket,
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
  ChevronDown, RefreshCw, MessageSquare, Tag, MapPin, Calendar
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

// ─── Mock Data Generator ──────────────────────────────────────────────────────
function buildMockData(brands) {
  const entries = [];
  const today = new Date();
  const managers = { "cb-kitchen": "Sarah Chen", "noir-bar": "Lena Park", "the-deli": "Oliver Reeves" };
  brands.forEach(brand => {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dow = d.getDay(); const isWeekend = dow === 0 || dow === 6;
      const mult = isWeekend ? 1.25 : 0.9; const noise = () => 1 + (Math.random() - 0.5) * 0.36;
      const netSales = Math.round(brand.kpiTargets.dailyRevenue * mult * noise());
      const laborCost = Math.round(netSales * 0.28 * noise());
      const cogsCost = Math.round(netSales * 0.30 * noise());
      const totalHours = Math.round(netSales / (48 + Math.random() * 10));
      const totalOrders = Math.round(netSales / (18 + Math.random() * 8));
      const atv = totalOrders > 0 ? netSales / totalOrders : 0;
      const cashVariance = Math.random() < 0.85 ? 0 : Math.round((Math.random() - 0.5) * 80);
      const cardRevenue = Math.round(netSales * 0.82);
      const cashExpected = netSales - cardRevenue;
      const physicalCash = cashExpected + cashVariance;
      const dateStr = d.toISOString().split("T")[0];
      const fiveStar = Math.round(3 + Math.random() * 10);
      const midStar = Math.round(1 + Math.random() * 4);
      const oneStar = Math.random() < 0.3 ? Math.round(Math.random() * 2) : 0;
      entries.push({
        id: `${brand.id}-${dateStr}`,
        brandId: brand.id, brandName: brand.name, date: dateStr,
        manager: managers[brand.id] || "Manager", submittedBy: managers[brand.id] || "Manager",
        netSales, cardRevenue, cashExpected, physicalCash, cashVariance,
        varianceJustification: cashVariance !== 0 ? "Till count discrepancy noted." : "",
        openingFloat: 200, closingFloat: 200 + cashVariance,
        laborCost, cogsCost, totalHours, totalOrders, atv,
        fiveStarReviews: fiveStar, midStarReviews: midStar, oneStarReviews: oneStar,
        notes: "", maintenanceTickets: [], timestamp: d.toISOString()
      });
    }
  });
  return entries;
}

function buildMockIssues(brands) {
  const issues = [];
  const statuses = ISSUE_STATUSES;
  const priorities = ISSUE_PRIORITIES;
  const categories = ISSUE_CATEGORIES;
  const titles = ["Dishwasher not draining", "HVAC unit making noise", "Broken walk-in fridge seal", "POS system crashing", "Grease trap needs cleaning", "Ceiling light flickering", "Prep table surface damaged", "Drainage slow in kitchen", "Pest sighting near store room", "Wi-Fi router down"];
  brands.forEach((brand, bi) => {
    for (let i = 0; i < 4; i++) {
      const d = new Date(); d.setDate(d.getDate() - Math.round(Math.random() * 14));
      issues.push({
        id: `issue-${brand.id}-${i}`,
        brandId: brand.id, brandName: brand.name,
        title: titles[(bi * 4 + i) % titles.length],
        description: "Reported during shift. Requires immediate attention or scheduled maintenance.",
        category: categories[Math.floor(Math.random() * categories.length)],
        priority: priorities[Math.floor(Math.random() * priorities.length)],
        status: statuses[Math.floor(Math.random() * 3)],
        reportedBy: ["Sarah Chen", "Lena Park", "Oliver Reeves"][bi % 3],
        createdAt: d.toISOString(),
        updatedAt: d.toISOString(),
        comments: [],
        assignedTo: "",
      });
    }
  });
  return issues;
}

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

function PeriodFilterBar({ preset, onPreset, customFrom, customTo, onCustomFrom, onCustomTo }) {
  const presets = [{ key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" }, { key: "this_week", label: "This Week" }, { key: "last_week", label: "Last Week" }, { key: "custom", label: "Custom" }];
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {presets.map(p => (
        <button key={p.key} onClick={() => onPreset(p.key)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${preset === p.key ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>{p.label}</button>
      ))}
      {preset === "custom" && (
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <input type="date" value={customFrom} onChange={e => onCustomFrom(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none" />
          <span className="text-slate-500 text-xs">to</span>
          <input type="date" value={customTo} min={customFrom} onChange={e => onCustomTo(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none" />
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
      id: "import-" + brandId + "-" + date,
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

  const handleImport = () => { onImport(preview); setStep("done"); };

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
                <button onClick={handleImport} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors">
                  Import {preview.length} Rows
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
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFilterBrand("All")} className={filterBtnCls(filterBrand === "All")}>All Locations</button>
            {visibleBrands.map(b => <button key={b.id} onClick={() => setFilterBrand(filterBrand === b.id ? "All" : b.id)} className={filterBtnCls(filterBrand === b.id)}>{b.name}</button>)}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ISSUE_PRIORITIES.map(p => (
              <button key={p} onClick={() => setFilterPriority(filterPriority === p ? "All" : p)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${filterPriority === p ? "text-white border-transparent bg-slate-600" : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"}`}>{p}</button>
            ))}
          </div>
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
function LoginScreen({ users, onLogin }) {
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-slate-400 font-semibold mb-2 uppercase tracking-widest">Location</div>
          <div className="flex flex-wrap gap-2">
            {visibleBrands.map(b => (
              <button key={b.id} onClick={() => setSelectedBrandId(b.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${selectedBrandId === b.id ? "text-white border-transparent" : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"}`}
                style={selectedBrandId === b.id ? { background: b.color } : {}}>
                {b.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400 font-semibold mb-2 uppercase tracking-widest">Period</div>
          <PeriodFilterBar preset={preset} onPreset={setPreset} customFrom={customFrom} customTo={customTo} onCustomFrom={setCustomFrom} onCustomTo={setCustomTo} />
        </div>
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
      {showImport&&<ExcelUploadModal brands={brands} entries={entries} onImport={rows=>{onBulkImport(rows);}} onClose={()=>setShowImport(false)}/>}
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
export default function App() {
  // ── Session: persist logged-in user to localStorage (lightweight, not sensitive) ──
  const [currentUser, setCurrentUser] = useState(() => { try { const s=localStorage.getItem("cb_session"); return s?JSON.parse(s):null; } catch { return null; } });

  // ── All persistent data now lives in Supabase ─────────────────────────────
  const [brands,  setBrands]  = useState([]);
  const [users,   setUsers]   = useState([]);
  const [entries, setEntries] = useState([]);
  const [issues,  setIssues]  = useState([]);
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);

  // Load everything on mount
  useEffect(() => {
    async function loadAll() {
      try {
        const [b, u, e, i] = await Promise.all([
          fetchBrands(), fetchUsers(), fetchEntries(), fetchIssues()
        ]);
        setBrands(b);
        setUsers(u);
        setEntries(e);
        setIssues(i);
        setDbReady(true);
      } catch (err) {
        console.error("Supabase load error:", err);
        setDbError(err.message);
      }
    }
    loadAll();
  }, []);
  const [activeView, setActiveView] = useState("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Persist session (login state only — all data is in Supabase)
  useEffect(()=>{ try{if(currentUser)localStorage.setItem("cb_session",JSON.stringify(currentUser));else localStorage.removeItem("cb_session");}catch{} },[currentUser]);

  const handleLogin = useCallback(user => { setCurrentUser(user); setActiveView("dashboard"); }, []);
  const handleLogout = useCallback(() => { setCurrentUser(null); setActiveView("dashboard"); }, []);

  // ── Brands ────────────────────────────────────────────────────────────────
  const addBrand = useCallback(async b => {
    const saved = await insertBrand(b);
    setBrands(bs => [...bs, saved]);
  }, []);

  const updateBrand = useCallback(async b => {
    const saved = await upsertBrand(b);
    setBrands(bs => bs.map(x => x.id === saved.id ? saved : x));
  }, []);

  const deleteBrand = useCallback(async id => {
    await removeBrand(id);
    setBrands(bs => bs.filter(b => b.id !== id));
    setEntries(es => es.filter(e => e.brandId !== id));
    setUsers(us => us.map(u => ({ ...u, brandIds: u.brandIds.filter(bid => bid !== id) })));
    setIssues(is => is.filter(i => i.brandId !== id));
  }, []);

  const updateKPITargets = useCallback(async (brandId, targets) => {
    const brand = brands.find(b => b.id === brandId);
    if (!brand) return;
    const updated = { ...brand, kpiTargets: { ...brand.kpiTargets, ...targets } };
    const saved = await upsertBrand(updated);
    setBrands(bs => bs.map(b => b.id === brandId ? saved : b));
  }, [brands]);

  // ── Users ─────────────────────────────────────────────────────────────────
  const addUser = useCallback(async u => {
    const saved = await insertUser(u);
    setUsers(us => [...us, saved]);
  }, []);

  const updateUser = useCallback(async u => {
    const saved = await upsertUser(u);
    setUsers(us => us.map(x => x.id === saved.id ? saved : x));
  }, []);

  const deleteUser = useCallback(async id => {
    await removeUser(id);
    setUsers(us => us.filter(u => u.id !== id));
  }, []);

  // ── EOD Entries ───────────────────────────────────────────────────────────
  const addEntry = useCallback(async entry => {
    const saved = await upsertEntry(entry);
    setEntries(es => {
      const filtered = es.filter(e => e.id !== saved.id);
      return [...filtered, saved].sort((a, b) => a.date.localeCompare(b.date));
    });
  }, []);

  const bulkImport = useCallback(async rows => {
    const saved = await upsertEntries(rows);
    setEntries(es => {
      const map = new Map(es.map(e => [e.id, e]));
      saved.forEach(r => map.set(r.id, r));
      return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
    });
  }, []);

  // ── Issues ────────────────────────────────────────────────────────────────
  const addIssue = useCallback(async issue => {
    const saved = await insertIssue(issue);
    setIssues(is => [...is, saved]);
  }, []);

  const updateIssue = useCallback(async issue => {
    const saved = await upsertIssue(issue);
    setIssues(is => is.map(x => x.id === saved.id ? saved : x));
  }, []);

  const deleteIssue = useCallback(async id => {
    await removeIssue(id);
    setIssues(is => is.filter(i => i.id !== id));
  }, []);

  const exportData = () => {
    const data = JSON.stringify({ brands, users, entries, issues }, null, 2);
    const blob = new Blob([data], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "createbrands-export.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };
  const importData = () => {
    const input=document.createElement("input");input.type="file";input.accept=".json";
    input.onchange=e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>{try{const d=JSON.parse(ev.target.result);if(d.brands)setBrands(d.brands);if(d.users)setUsers(d.users);if(d.entries)setEntries(d.entries);if(d.issues)setIssues(d.issues);}catch{alert("Invalid JSON file.");}};reader.readAsText(file);};
    input.click();
  };
  const resetData = async () => {
    if(!window.confirm("Reset all data to defaults?"))return;
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
      <span style={{fontSize:32}}>⚠️</span>
      <strong>Could not connect to database</strong>
      <code style={{fontSize:12,color:"#94a3b8"}}>{dbError}</code>
      <p style={{fontSize:12,color:"#64748b",maxWidth:400,textAlign:"center"}}>Check your <code>REACT_APP_SUPABASE_URL</code> and <code>REACT_APP_SUPABASE_ANON_KEY</code> environment variables in Vercel.</p>
    </div>
  );

  if (!dbReady) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f172a",color:"#94a3b8",fontFamily:"sans-serif",gap:12}}>
      <span style={{fontSize:24,animation:"spin 1s linear infinite"}}>⏳</span>
      <span>Loading data…</span>
    </div>
  );

  if (!currentUser) return (
    <AuthContext.Provider value={{user:null}}>
      <LoginScreen users={users} onLogin={handleLogin}/>
    </AuthContext.Provider>
  );

  const visibleBrands = brands.filter(b=>currentUser.role==="owner"||currentUser.brandIds.includes(b.id));
  const openIssueCount = issues.filter(i=>visibleBrands.some(b=>b.id===i.brandId)&&["Open","In Progress","Awaiting Parts"].includes(i.status)).length;

  const NAV = [
    { key:"dashboard", label:"Dashboard", icon:LayoutDashboard },
    { key:"tactical", label:"Tactical Ops", icon:BarChart2 },
    { key:"eod", label:"EOD Report", icon:ClipboardList },
    { key:"issues", label:"Issues & Maintenance", icon:Wrench, badge: openIssueCount > 0 ? openIssueCount.toString() : null },
    ...(currentUser.role==="owner"?[{key:"admin",label:"Admin Panel",icon:Settings,badge:"OWNER"}]:[]),
  ];

  const titles = { dashboard:"Executive Dashboard", tactical:"Tactical Ops", eod:"EOD Report", issues:"Issues & Maintenance", admin:"Admin Panel" };
  const todayDisplay = new Date().toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"});

  const Sidebar = ({mobile=false}) => (
    <div className={`flex flex-col h-full ${mobile?"w-72":""}`}>
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-800">
        <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center"><BarChart2 size={16} className="text-white"/></div>
        <div><div className="text-sm font-bold text-white">Create Brands</div><div className="text-xs text-slate-500">Hospitality Group</div></div>
        {mobile&&<button onClick={()=>setDrawerOpen(false)} className="ml-auto text-slate-400 hover:text-white"><X size={18}/></button>}
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(n=>{
          const NIcon=n.icon;const active=activeView===n.key;
          return(
            <button key={n.key} onClick={()=>{setActiveView(n.key);setDrawerOpen(false);}}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${active?"bg-indigo-600 text-white":"text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}>
              <NIcon size={16}/>
              <span className="flex-1 text-left">{n.label}</span>
              {n.badge&&(
                <span className={`text-xs px-1.5 py-0.5 rounded-lg font-semibold ${n.badge==="OWNER"?"bg-violet-500/20 text-violet-400 border border-violet-500/30":"bg-red-500 text-white"}`}>{n.badge}</span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-slate-800 space-y-3">
        <UserChip user={currentUser} onLogout={handleLogout}/>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={exportData} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs font-semibold hover:bg-slate-700 transition-colors"><Download size={11}/>Export</button>
          {currentUser.role==="owner"&&<>
            <button onClick={importData} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs font-semibold hover:bg-slate-700 transition-colors"><Upload size={11}/>Import</button>
            <button onClick={resetData} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs font-semibold hover:bg-slate-700 hover:text-red-400 transition-colors"><RotateCcw size={11}/>Reset</button>
          </>}
        </div>
        <div className="text-xs text-slate-600">{entries.length} entries · {brands.length} locations · {issues.length} issues</div>
      </div>
    </div>
  );

  return (
    <AuthContext.Provider value={{user:currentUser}}>
      <div className="min-h-screen bg-slate-950 text-white flex">
        <aside className="hidden lg:flex w-60 flex-col bg-slate-900/80 border-r border-slate-800 flex-shrink-0"><Sidebar/></aside>
        {drawerOpen&&(
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={()=>setDrawerOpen(false)}/>
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-slate-900 border-r border-slate-800 flex flex-col"><Sidebar mobile/></div>
          </div>
        )}
        <main className="flex-1 flex flex-col min-w-0">
          <header className="flex items-center gap-4 px-5 py-4 border-b border-slate-800 bg-slate-900/50 sticky top-0 z-10 backdrop-blur-sm">
            <button onClick={()=>setDrawerOpen(true)} className="lg:hidden text-slate-400 hover:text-white"><Menu size={20}/></button>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-white">{titles[activeView]}</h1>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{todayDisplay}</span>
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>Live</span>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 flex-wrap">
              {visibleBrands.slice(0,3).map(b=>(
                <span key={b.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full" style={{background:b.color}}/>{b.name}
                </span>
              ))}
            </div>
            <div className="lg:hidden"><UserChip user={currentUser} onLogout={handleLogout} compact/></div>
          </header>
          <div className="flex-1 p-5 lg:p-6 overflow-auto">
            {activeView==="dashboard"&&<DashboardView brands={visibleBrands} entries={entries} issues={issues}/>}
            {activeView==="tactical"&&<TacticalOpsView brands={visibleBrands} entries={entries} issues={issues} users={users} onAddIssue={addIssue} onUpdateIssue={updateIssue} onDeleteIssue={deleteIssue}/>}
            {activeView==="eod"&&<EODFormView brands={visibleBrands} onAddEntry={addEntry}/>}
            {activeView==="issues"&&<IssuesView brands={brands} issues={issues} users={users} currentUser={currentUser} onAddIssue={addIssue} onUpdateIssue={updateIssue} onDeleteIssue={deleteIssue}/>}
            {activeView==="admin"&&currentUser.role==="owner"&&(
              <AdminPanelView brands={brands} users={users} entries={entries} onAddBrand={addBrand} onUpdateBrand={updateBrand} onDeleteBrand={deleteBrand} onAddUser={addUser} onUpdateUser={updateUser} onDeleteUser={deleteUser} onUpdateKPITargets={updateKPITargets} onBulkImport={bulkImport}/>
            )}
          </div>
        </main>
      </div>
    </AuthContext.Provider>
  );
}
