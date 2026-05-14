import { useState, useMemo, useCallback, useEffect, createContext, useContext, useRef } from "react";
import {
  ComposedChart, Bar, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";
import {
  Utensils, Moon, Coffee, Building2, LogOut, Menu, X, ChevronRight,
  ChevronLeft, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  Plus, Trash2, Edit, Eye, EyeOff, Download, Upload, RotateCcw,
  DollarSign, BarChart2, Users, Settings, LayoutDashboard, ClipboardList,
  Star, Wrench, Check, Info, Activity, Target, Zap,
  AlertCircle, Clock, CheckSquare, XCircle, FileSpreadsheet,
  RefreshCw, MessageSquare, MapPin
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

const ISSUE_CATEGORIES = ["Equipment", "Plumbing", "Electrical", "Safety", "Hygiene", "IT/Tech", "Structural", "Pest Control", "HVAC", "Other"];
const ISSUE_PRIORITIES = ["Critical", "High", "Medium", "Low"];
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
      const dateStr = d.toISOString().split("T")[0];
      entries.push({
        id: `${brand.id}-${dateStr}`,
        brandId: brand.id, brandName: brand.name, date: dateStr,
        manager: managers[brand.id] || "Manager", submittedBy: managers[brand.id] || "Manager",
        netSales, cardRevenue: Math.round(netSales * 0.82), cashExpected: Math.round(netSales * 0.18),
        physicalCash: Math.round(netSales * 0.18), cashVariance: 0,
        laborCost, cogsCost, totalHours, totalOrders, atv: totalOrders > 0 ? netSales / totalOrders : 0,
        fiveStarReviews: Math.round(3 + Math.random() * 10), midStarReviews: Math.round(1 + Math.random() * 4), oneStarReviews: 0,
        notes: "", maintenanceTickets: [], timestamp: d.toISOString()
      });
    }
  });
  return entries;
}

function buildMockIssues(brands) {
  const issues = [];
  brands.forEach((brand, bi) => {
    for (let i = 0; i < 2; i++) {
      const d = new Date(); d.setDate(d.getDate() - Math.round(Math.random() * 7));
      issues.push({
        id: `issue-${brand.id}-${i}`, brandId: brand.id, brandName: brand.name,
        title: "Maintenance Issue Example", description: "Standard reported maintenance task.",
        category: "Equipment", priority: "Medium", status: "Open",
        reportedBy: "Manager", createdAt: d.toISOString(), updatedAt: d.toISOString(),
        comments: [], assignedTo: "",
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
        <span className="text-sm font-semibold text-slate-400 uppercase tracking-widest">{label}</span>
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
  }, [entries, visibleBrands, todayStr]);

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
    </div>
  );
}

// ─── Tactical Ops View ────────────────────────────────────────────────────────
function TacticalOpsView({ brands, entries }) {
  const { user } = useAuth();
  const visibleBrands = brands.filter(b => user.role === "owner" || user.brandIds.includes(b.id));
  const [selectedBrandId, setSelectedBrandId] = useState(visibleBrands[0]?.id || "");
  const [preset, setPreset] = useState("this_week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ComparisonKPICard label="Net Revenue" current={cur?.netSales} previous={prev?.netSales} format="currency" icon={DollarSign} prevLabel={prevPeriod?.label} />
        <ComparisonKPICard label="Target Progress" current={targetProgress||null} previous={null} format="percent" icon={Target} alert={targetProgress>0&&targetProgress<80} />
        <ComparisonKPICard label="Prime Cost %" current={cur?.primeCost} previous={prev?.primeCost} format="percent" icon={Activity} invertDelta alert={cur&&target&&cur.primeCost>target.primeCostMax} prevLabel={prevPeriod?.label} />
        <ComparisonKPICard label="SPLH" current={cur?.splh} previous={prev?.splh} format="splh" icon={Zap} prevLabel={prevPeriod?.label} />
      </div>
      
      <AnalysisBlock title="Period-over-Period Sales & SPLH">
          <ResponsiveContainer width="100%" height={250}>
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
    netSales: "", laborCost: "", cogsCost: "", totalHours: "", totalOrders: "", atv: "", notes: ""
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const selectedBrand = visibleBrands.find(b => b.id === form.brandId);

  const handleSubmit = () => {
    if (zone < 2) { setZone(z => z + 1); return; }
    const entry = {
      id: `${form.brandId}-${form.date}-${Date.now()}`,
      brandId: form.brandId, brandName: selectedBrand?.name || "", date: form.date,
      manager: form.manager, submittedBy: form.submittedBy,
      netSales: parseFloat(form.netSales) || 0, laborCost: parseFloat(form.laborCost) || 0,
      cogsCost: parseFloat(form.cogsCost) || 0, totalHours: parseFloat(form.totalHours) || 0,
      totalOrders: parseInt(form.totalOrders) || 0, atv: parseFloat(form.atv) || 0,
      notes: form.notes, timestamp: new Date().toISOString()
    };
    onAddEntry(entry);
    setSuccess(true);
    setTimeout(() => { setSuccess(false); setZone(0); }, 2000);
  };

  const inputCls = "w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none transition-colors";
  
  if (success) return <div className="py-20 text-center text-emerald-400 font-bold">Report Submitted Successfully!</div>;

  return (
    <div className="max-w-xl mx-auto bg-slate-900/80 border border-slate-700 p-6 rounded-2xl space-y-4">
      {zone === 0 && (
        <>
          <h2 className="font-bold text-lg">Shift Details</h2>
          <select value={form.brandId} onChange={e=>set("brandId", e.target.value)} className={inputCls}>
            {visibleBrands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input type="date" value={form.date} onChange={e=>set("date", e.target.value)} className={inputCls} />
          <input value={form.manager} onChange={e=>set("manager", e.target.value)} placeholder="Manager Name" className={inputCls} />
        </>
      )}
      {zone === 1 && (
        <>
          <h2 className="font-bold text-lg">Sales & Performance</h2>
          <input type="number" value={form.netSales} onChange={e=>set("netSales", e.target.value)} placeholder="Net Sales (£)" className={inputCls} />
          <input type="number" value={form.totalOrders} onChange={e=>set("totalOrders", e.target.value)} placeholder="Total Orders" className={inputCls} />
          <input type="number" value={form.atv} onChange={e=>set("atv", e.target.value)} placeholder="ATV (£)" className={inputCls} />
        </>
      )}
      {zone === 2 && (
        <>
          <h2 className="font-bold text-lg">Labour & Costs</h2>
          <input type="number" value={form.laborCost} onChange={e=>set("laborCost", e.target.value)} placeholder="Labour Cost (£)" className={inputCls} />
          <input type="number" value={form.cogsCost} onChange={e=>set("cogsCost", e.target.value)} placeholder="COGS (£)" className={inputCls} />
          <input type="number" value={form.totalHours} onChange={e=>set("totalHours", e.target.value)} placeholder="Total Hours" className={inputCls} />
          <textarea value={form.notes} onChange={e=>set("notes", e.target.value)} placeholder="Shift Notes" className={inputCls} />
        </>
      )}
      <button onClick={handleSubmit} className="w-full bg-indigo-600 py-3 rounded-xl font-bold">{zone < 2 ? "Next" : "Submit"}</button>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ users, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    const user = users.find(u => u.email === email && u.password === password);
    if (user) onLogin(user); else setError("Invalid credentials.");
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 p-8 rounded-2xl space-y-4">
        <h1 className="text-2xl font-bold text-center">Create Brands Login</h1>
        {error && <div className="text-red-400 text-sm text-center">{error}</div>}
        <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3" />
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3" />
        <button onClick={handleSubmit} className="w-full bg-indigo-600 py-3 rounded-xl font-bold">Sign In</button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [brands, setBrands] = useState(SEED_BRANDS);
  const [users] = useState(SEED_USERS);
  const [entries, setEntries] = useState(() => buildMockData(SEED_BRANDS));
  const [activeView, setActiveView] = useState("dashboard");

  const handleLogin = (user) => setCurrentUser(user);
  const handleLogout = () => setCurrentUser(null);
  const addEntry = (entry) => setEntries(prev => [entry, ...prev]);

  if (!currentUser) return <LoginScreen users={users} onLogin={handleLogin} />;

  return (
    <AuthContext.Provider value={{user: currentUser}}>
      <div className="min-h-screen bg-slate-950 text-white flex flex-col md:flex-row">
        <aside className="w-full md:w-64 bg-slate-900 border-r border-slate-800 p-6 space-y-4">
          <div className="font-bold text-xl mb-8 flex items-center gap-2"><BarChart2 className="text-indigo-500" /> Create Brands</div>
          <nav className="space-y-1">
            <button onClick={() => setActiveView("dashboard")} className={`w-full text-left px-4 py-3 rounded-xl ${activeView === "dashboard" ? "bg-indigo-600" : "hover:bg-slate-800"}`}>Dashboard</button>
            <button onClick={() => setActiveView("tactical")} className={`w-full text-left px-4 py-3 rounded-xl ${activeView === "tactical" ? "bg-indigo-600" : "hover:bg-slate-800"}`}>Tactical Ops</button>
            <button onClick={() => setActiveView("eod")} className={`w-full text-left px-4 py-3 rounded-xl ${activeView === "eod" ? "bg-indigo-600" : "hover:bg-slate-800"}`}>EOD Report</button>
          </nav>
          <div className="pt-20">
            <div className="text-sm font-bold truncate">{currentUser.name}</div>
            <button onClick={handleLogout} className="text-xs text-slate-500 hover:text-red-400 mt-1">Sign Out</button>
          </div>
        </aside>
        <main className="flex-1 p-6 md:p-10 overflow-auto">
          {activeView === "dashboard" && <DashboardView brands={brands} entries={entries} issues={[]} />}
          {activeView === "tactical" && <TacticalOpsView brands={brands} entries={entries} />}
          {activeView === "eod" && <EODFormView brands={brands} onAddEntry={addEntry} />}
        </main>
      </div>
    </AuthContext.Provider>
  );
}
