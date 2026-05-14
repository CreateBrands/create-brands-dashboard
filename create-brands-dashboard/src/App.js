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
  { id: "u1", name: "Atif Razzaq", email: "owner@createbrands.co.uk", password: "owner123", role: "owner", brandIds: ["cb-kitchen", "noir-bar", "the-deli"], avatar: "AR" },
  { id: "u2", name: "Sarah Chen", email: "sarah@createbrands.co.uk", password: "manager123", role: "manager", brandIds: ["cb-kitchen"], avatar: "SC" },
  { id: "u3", name: "Lena Park", email: "lena@createbrands.co.uk", password: "manager123", role: "manager", brandIds: ["noir-bar"], avatar: "LP" },
  { id: "u4", name: "Oliver Reeves", email: "oliver@createbrands.co.uk", password: "manager123", role: "manager", brandIds: ["the-deli"], avatar: "OR" }
];

// ─── Formatting Helpers ──────────────────────────────────────────────────────────
const fmtCurrency = v => v == null ? "—" : `£${Math.round(v).toLocaleString()}`;
const fmtPct = v => v == null ? "—" : `${v.toFixed(1)}%`;
const fmtSPLH = v => v == null ? "—" : `£${v.toFixed(2)}`;
const fmtDate = d => d.toISOString().split("T")[0];

function aggregateEntries(filtered) {
  if (!filtered.length) return null;
  const netSales = filtered.reduce((a, e) => a + (e.netSales||0), 0);
  const laborCost = filtered.reduce((a, e) => a + (e.laborCost||0), 0);
  const cogsCost = filtered.reduce((a, e) => a + (e.cogsCost||0), 0);
  const totalHours = filtered.reduce((a, e) => a + (e.totalHours||0), 0);
  const primeCost = netSales > 0 ? ((laborCost + cogsCost) / netSales) * 100 : 0;
  const splh = totalHours > 0 ? netSales / totalHours : 0;
  const laborPct = netSales > 0 ? (laborCost / netSales) * 100 : 0;
  return { netSales, laborCost, cogsCost, totalHours, primeCost, splh, laborPct };
}

// ─── Mock Data Generator ──────────────────────────────────────────────────────
function buildMockData(brands) {
  const entries = [];
  const today = new Date();
  brands.forEach(brand => {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = fmtDate(d);
      const dow = d.getDay(); const isWeekend = dow === 0 || dow === 6;
      const mult = isWeekend ? 1.25 : 0.9; const noise = () => 1 + (Math.random() - 0.5) * 0.36;
      const netSales = Math.round(brand.kpiTargets.dailyRevenue * mult * noise());
      const laborCost = Math.round(netSales * 0.28 * noise());
      const cogsCost = Math.round(netSales * 0.30 * noise());
      const totalHours = Math.round(netSales / (48 + Math.random() * 10));
      entries.push({
        id: `${brand.id}-${ds}`, brandId: brand.id, brandName: brand.name, date: ds,
        netSales, laborCost, cogsCost, totalHours, timestamp: d.toISOString()
      });
    }
  });
  return entries;
}

// ─── Period Utilities ──────────────────────────────────────────────────────────
function getMonday(d) { const dt = new Date(d); const day = dt.getDay(); dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day)); return dt; }
function filterEntries(entries, from, to) { if (!from || !to) return []; return entries.filter(e => e.date >= from && e.date <= to); }

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
  const mon = getMonday(today);
  const lastMon = new Date(mon); lastMon.setDate(lastMon.getDate()-7);
  const lastSun = new Date(mon); lastSun.setDate(lastSun.getDate()-1);
  const weekBefore = new Date(lastMon); weekBefore.setDate(weekBefore.getDate()-7);
  const weekBeforeSun = new Date(lastMon); weekBeforeSun.setDate(weekBeforeSun.getDate()-1);
  switch (preset) {
    case "this_week": return { from: fmtDate(lastMon), to: fmtDate(lastSun), label: "Last Week" };
    case "last_week": return { from: fmtDate(weekBefore), to: fmtDate(weekBeforeSun), label: "Week Before" };
    default: return null;
  }
}

// ─── Components ───────────────────────────────────────────────────────────────
function Badge({ label, color = "slate" }) {
  const colors = {
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    violet: "bg-violet-50 text-violet-600 border-violet-100",
    slate: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold border ${colors[color] || colors.slate}`}>{label}</span>;
}

function StatCard({ label, value, sub, icon: Icon, accent = "indigo", alert = false }) {
  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-2 transition-all hover:shadow-md ${alert ? "bg-red-50 border-red-100" : "bg-white border-slate-200"}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</span>
        {Icon && <Icon size={18} className={alert ? "text-red-500" : "text-indigo-600"} />}
      </div>
      <div className={`text-2xl font-bold ${alert ? "text-red-700" : "text-slate-900"}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function ComparisonKPICard({ label, current, previous, format, icon: Icon, prevLabel = "Prior" }) {
  const currentVal = format === "currency" ? fmtCurrency(current) : format === "percent" ? fmtPct(current) : format === "splh" ? fmtSPLH(current) : current;
  const previousVal = previous != null ? (format === "currency" ? fmtCurrency(previous) : format === "percent" ? fmtPct(previous) : previous) : null;
  
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={14} className="text-slate-400" />}
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-xl font-bold text-slate-900">{currentVal}</div>
      {previousVal && <div className="text-xs text-slate-400">Vs {prevLabel}: {previousVal}</div>}
    </div>
  );
}

function PeriodFilterBar({ preset, onPreset, customFrom, customTo, onCustomFrom, onCustomTo }) {
  const presets = [{ key: "today", label: "Today" }, { key: "this_week", label: "This Week" }, { key: "last_week", label: "Last Week" }, { key: "custom", label: "Custom" }];
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {presets.map(p => (
        <button key={p.key} onClick={() => onPreset(p.key)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${preset === p.key ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{p.label}</button>
      ))}
    </div>
  );
}

// ─── MAIN VIEWS ──────────────────────────────────────────────────────────────

function DashboardView({ entries }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = fmtDate(today);
  const todayEntries = entries.filter(e => e.date === todayStr);
  const agg = aggregateEntries(todayEntries);

  const chartData = useMemo(() => {
    const data = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = fmtDate(d);
      const de = entries.filter(e => e.date === ds);
      const a = aggregateEntries(de);
      data.push({ date: ds.slice(5), revenue: a?.netSales || 0, prime: a?.primeCost || 0 });
    }
    return data;
  }, [entries]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Today's Revenue" value={fmtCurrency(agg?.netSales || 0)} icon={DollarSign} />
        <StatCard label="Prime Cost %" value={fmtPct(agg?.primeCost || 0)} icon={Activity} alert={agg?.primeCost > 65} />
        <StatCard label="SPLH" value={fmtSPLH(agg?.splh || 0)} icon={Zap} />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 mb-6 uppercase tracking-wider">14-Day Performance</h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="date" tick={{fill:"#64748b", fontSize:11}} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={{fill:"#64748b", fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v => `£${v/1000}k`} />
            <YAxis yAxisId="right" orientation="right" tick={{fill:"#64748b", fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip contentStyle={{backgroundColor:"#ffffff", border:"1px solid #e2e8f0", borderRadius:"12px"}} />
            <Bar yAxisId="left" dataKey="revenue" fill="#6366f1" radius={[4,4,0,0]} barSize={35} />
            <Line yAxisId="right" type="monotone" dataKey="prime" stroke="#10b981" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TacticalOpsView({ brands, entries }) {
  const { user } = useAuth();
  const visibleBrands = brands.filter(b => user.role === "owner" || user.brandIds.includes(b.id));
  const [selectedId, setSelectedId] = useState(visibleBrands[0]?.id || "");
  const [preset, setPreset] = useState("this_week");
  
  const period = resolvePeriod(preset);
  const prevPeriod = resolvePrevPeriod(preset);
  const brandEntries = entries.filter(e => e.brandId === selectedId);
  const cur = aggregateEntries(filterEntries(brandEntries, period.from, period.to));
  const prev = prevPeriod ? aggregateEntries(filterEntries(brandEntries, prevPeriod.from, prevPeriod.to)) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div className="flex gap-2">
          {visibleBrands.map(b => (
            <button key={b.id} onClick={() => setSelectedId(b.id)} className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${selectedId === b.id ? "bg-white border-indigo-600 text-indigo-600 shadow-sm" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{b.name}</button>
          ))}
        </div>
        <PeriodFilterBar preset={preset} onPreset={setPreset} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <ComparisonKPICard label="Net Revenue" current={cur?.netSales} previous={prev?.netSales} format="currency" icon={DollarSign} />
        <ComparisonKPICard label="Prime Cost" current={cur?.primeCost} previous={prev?.primeCost} format="percent" icon={Activity} />
        <ComparisonKPICard label="SPLH" current={cur?.splh} previous={prev?.splh} format="splh" icon={Zap} />
        <ComparisonKPICard label="Labour %" current={cur?.laborPct} previous={prev?.laborPct} format="percent" icon={Users} />
      </div>
      <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center text-slate-400 font-medium italic">Operational Drill-down for {period.label} active.</div>
    </div>
  );
}

function EODFormView({ brands, onAddEntry }) {
  const { user } = useAuth();
  const visibleBrands = brands.filter(b => user.role === "owner" || user.brandIds.includes(b.id));
  const [zone, setZone] = useState(0);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({ brandId: visibleBrands[0]?.id || "", date: fmtDate(new Date()), netSales: "", laborCost: "", cogsCost: "", totalHours: "" });

  const inputCls = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:bg-white transition-all outline-none text-slate-900";

  const handleSubmit = () => {
    if (zone < 1) { setZone(z => z + 1); return; }
    onAddEntry({ ...form, id: Date.now(), netSales: parseFloat(form.netSales), laborCost: parseFloat(form.laborCost), cogsCost: parseFloat(form.cogsCost), totalHours: parseFloat(form.totalHours) });
    setSuccess(true);
    setTimeout(() => { setSuccess(false); setZone(0); }, 2000);
  };

  if (success) return <div className="py-20 text-center text-emerald-600 font-bold bg-white border border-slate-200 rounded-3xl shadow-sm">Report Saved Successfully!</div>;

  return (
    <div className="max-w-xl mx-auto bg-white border border-slate-200 p-8 rounded-3xl space-y-6 shadow-sm">
      <h2 className="text-xl font-bold text-slate-900">{zone === 0 ? "Shift Details" : "Financials"}</h2>
      {zone === 0 && (
        <div className="space-y-4">
          <select value={form.brandId} onChange={e=>setForm({...form, brandId: e.target.value})} className={inputCls}>
            {visibleBrands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input type="date" value={form.date} onChange={e=>setForm({...form, date: e.target.value})} className={inputCls} />
        </div>
      )}
      {zone === 1 && (
        <div className="space-y-4">
          <input type="number" placeholder="Net Sales (£)" value={form.netSales} onChange={e=>setForm({...form, netSales: e.target.value})} className={inputCls} />
          <input type="number" placeholder="Labour Cost (£)" value={form.laborCost} onChange={e=>setForm({...form, laborCost: e.target.value})} className={inputCls} />
          <input type="number" placeholder="Total Hours" value={form.totalHours} onChange={e=>setForm({...form, totalHours: e.target.value})} className={inputCls} />
        </div>
      )}
      <button onClick={handleSubmit} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-100">{zone === 0 ? "Next" : "Submit Report"}</button>
    </div>
  );
}

function AdminPanelView({ brands, onAddBrand }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><h2 className="text-xl font-bold text-slate-900">Brand Portfolio</h2><p className="text-sm text-slate-500">Manage locations and target KPIs</p></div>
        <button onClick={() => onAddBrand()} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 flex items-center gap-2"><Plus size={18}/> New Venue</button>
      </div>
      <div className="grid gap-4">
        {brands.map(b => (
          <div key={b.id} className="bg-white border border-slate-200 p-5 rounded-2xl flex items-center justify-between hover:shadow-md transition-all">
            <div className="flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><Building2 size={22}/></div>
            <div><div className="font-bold text-slate-900">{b.name}</div><div className="text-xs text-slate-500 font-medium">{b.address}</div></div></div>
            <div className="flex gap-2"><button className="p-2.5 text-slate-400 hover:text-indigo-600 bg-slate-50 rounded-xl transition-colors"><Edit size={16}/></button><button className="p-2.5 text-slate-400 hover:text-red-600 bg-slate-50 rounded-xl transition-colors"><Trash2 size={16}/></button></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoginScreen({ users, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-sm bg-white border border-slate-200 p-10 rounded-[2.5rem] space-y-8 shadow-xl shadow-slate-200/50">
        <div className="text-center space-y-3">
          <div className="inline-flex p-4 bg-indigo-600 rounded-[1.2rem] shadow-lg shadow-indigo-200"><BarChart2 size={28} className="text-white" /></div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Create Brands</h1>
          <p className="text-slate-500 text-sm font-medium">Group Operations Portal</p>
        </div>
        {error && <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl text-xs font-bold text-center">{error}</div>}
        <div className="space-y-4">
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email Address" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm outline-none text-slate-900" />
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm outline-none text-slate-900" />
          <button onClick={() => {
            const user = users.find(u => u.email === email && u.password === password);
            if(user) onLogin(user); else setError("Incorrect login details");
          }} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-100 mt-2">Sign In</button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP LOGIC ──────────────────────────────────────────────────────────

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeView, setActiveView] = useState("dashboard");
  const [brands, setBrands] = useState(SEED_BRANDS);
  const [entries, setEntries] = useState(() => buildMockData(SEED_BRANDS));

  if (!currentUser) return <LoginScreen users={SEED_USERS} onLogin={setCurrentUser} />;

  const NAV = [
    { key: "dashboard", label: "Executive Summary", icon: LayoutDashboard },
    { key: "tactical", label: "Operations", icon: BarChart2 },
    { key: "eod", label: "Submit EOD", icon: ClipboardList },
    ...(currentUser.role === "owner" ? [{ key: "admin", label: "Brand Settings", icon: Settings }] : []),
  ];

  return (
    <AuthContext.Provider value={{user: currentUser}}>
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row font-sans">
        <aside className="w-full md:w-72 bg-white border-r border-slate-200 p-8 flex flex-col shadow-sm z-20">
          <div className="flex items-center gap-3 font-black text-xl mb-12 text-slate-900 tracking-tight">
            <div className="p-2 bg-indigo-600 rounded-xl"><BarChart2 size={18} className="text-white"/></div>
            Create Brands
          </div>
          <nav className="flex-1 space-y-2">
            {NAV.map(n => (
              <button key={n.key} onClick={() => setActiveView(n.key)} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl text-sm font-bold transition-all ${activeView === n.key ? "bg-indigo-50 text-indigo-600 shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}>
                <n.icon size={18} className={activeView === n.key ? "text-indigo-600" : "text-slate-400"}/> {n.label}
              </button>
            ))}
          </nav>
          <div className="mt-auto pt-8 border-t border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-sm border border-slate-200">{currentUser.avatar}</div>
              <div className="min-w-0">
                <div className="text-sm font-black text-slate-900 truncate">{currentUser.name}</div>
                <Badge label={currentUser.role} color={currentUser.role==="owner"?"violet":"indigo"} />
              </div>
            </div>
            <button onClick={() => setCurrentUser(null)} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-red-100 text-xs font-black text-red-500 bg-red-50 hover:bg-red-100 transition-all uppercase tracking-widest"><LogOut size={14}/> Sign Out</button>
          </div>
        </aside>
        <main className="flex-1 p-8 md:p-12 overflow-auto">
          <header className="mb-12">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight capitalize">{activeView.replace("_", " ")}</h1>
            <p className="text-slate-500 font-medium mt-1">Portfolio management portal active.</p>
          </header>
          {activeView === "dashboard" && <DashboardView entries={entries} />}
          {activeView === "tactical" && <TacticalOpsView brands={brands} entries={entries} />}
          {activeView === "eod" && <EODFormView brands={brands} onAddEntry={e => setEntries([e, ...entries])} />}
          {activeView === "admin" && currentUser.role === "owner" && <AdminPanelView brands={brands} onAddBrand={() => alert("Logic initialized.")} />}
        </main>
      </div>
    </AuthContext.Provider>
  );
}