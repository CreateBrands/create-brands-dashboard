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

// ─── Mock Data Generator ──────────────────────────────────────────────────────
function buildMockData(brands) {
  const entries = [];
  const today = new Date();
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
        netSales, laborCost, cogsCost, totalHours, totalOrders, atv: totalOrders > 0 ? netSales / totalOrders : 0,
        timestamp: d.toISOString()
      });
    }
  });
  return entries;
}

// ─── Formatting Helpers ──────────────────────────────────────────────────────────
const fmtCurrency = v => v == null ? "—" : `£${Math.round(v).toLocaleString()}`;
const fmtPct = v => v == null ? "—" : `${v.toFixed(1)}%`;
const fmtSPLH = v => v == null ? "—" : `£${v.toFixed(2)}`;
const fmtNum = v => v == null ? "—" : Math.round(v).toLocaleString();
function fmtDate(d) { return d.toISOString().split("T")[0]; }

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

// ─── Period Utilities ──────────────────────────────────────────────────────────
function getMonday(d) { const dt = new Date(d); const day = dt.getDay(); dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day)); return dt; }
function resolvePeriod(preset) {
  const today = new Date(); today.setHours(0,0,0,0);
  const mon = getMonday(today);
  const lastMon = new Date(mon); lastMon.setDate(lastMon.getDate()-7);
  const lastSun = new Date(mon); lastSun.setDate(lastSun.getDate()-1);
  switch (preset) {
    case "this_week": return { from: fmtDate(mon), to: fmtDate(today), label: "This Week" };
    case "last_week": return { from: fmtDate(lastMon), to: fmtDate(lastSun), label: "Last Week" };
    default: return { from: fmtDate(today), to: fmtDate(today), label: "Today" };
  }
}

// ─── Components ───────────────────────────────────────────────────────────────
function Badge({ label, color = "slate" }) {
  const colors = {
    indigo: "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30",
    emerald: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    violet: "bg-violet-500/20 text-violet-400 border border-violet-500/30",
  };
  return <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold border ${colors[color]}`}>{label}</span>;
}

function StatCard({ label, value, sub, icon: Icon, alert = false }) {
  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-2 ${alert ? "bg-red-950/30 border-red-500/30" : "bg-slate-900 border-slate-800"}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{label}</span>
        {Icon && <Icon size={16} className={alert ? "text-red-400" : "text-indigo-400"} />}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

// ─── VIEWS ───────────────────────────────────────────────────────────────────

function DashboardView({ brands, entries }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = fmtDate(today);
  const todayEntries = entries.filter(e => e.date === todayStr);
  const agg = aggregateEntries(todayEntries);

  const chartData = useMemo(() => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = fmtDate(d);
      const de = entries.filter(e => e.date === ds);
      const a = aggregateEntries(de);
      data.push({ date: ds.slice(5), revenue: a?.netSales || 0 });
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-400 mb-4 uppercase">7-Day Revenue Trend</h3>
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={chartData}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{fill:"#64748b", fontSize:11}} />
            <YAxis tick={{fill:"#64748b", fontSize:11}} tickFormatter={v => `£${v/1000}k`} />
            <Tooltip contentStyle={{backgroundColor:"#0f172a", border:"1px solid #334155"}} />
            <Bar dataKey="revenue" fill="#6366f1" radius={[4,4,0,0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AdminPanelView({ brands, users, onAddBrand }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Location Management</h2>
        <button onClick={() => onAddBrand()} className="flex items-center gap-2 bg-indigo-600 px-4 py-2 rounded-xl text-sm font-bold">
          <Plus size={16}/> Add New Location
        </button>
      </div>
      <div className="grid gap-3">
        {brands.map(b => (
          <div key={b.id} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-500/10 text-indigo-400">
                <Building2 size={20}/>
              </div>
              <div>
                <div className="font-bold">{b.name}</div>
                <div className="text-xs text-slate-500">{b.address}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg"><Edit size={14}/></button>
              <button className="p-2 text-slate-400 hover:text-red-400 bg-slate-800 rounded-lg"><Trash2 size={14}/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── LOGIN SCREEN ──────────────────────────────────────────────────────────
function LoginScreen({ users, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 p-8 rounded-3xl space-y-6 shadow-2xl">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-indigo-600 rounded-2xl mb-2"><BarChart2 className="text-white" /></div>
          <h1 className="text-2xl font-bold text-white">Create Brands</h1>
          <p className="text-slate-500 text-sm">Portfolio Management Dashboard</p>
        </div>
        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-xl text-xs text-center">{error}</div>}
        <div className="space-y-4">
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none" />
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none" />
          <button onClick={() => {
            const user = users.find(u => u.email === email && u.password === password);
            if(user) onLogin(user); else setError("Incorrect credentials");
          }} className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl font-bold transition-all">Sign In</button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeView, setActiveView] = useState("dashboard");
  const [brands, setBrands] = useState(SEED_BRANDS);
  const [entries, setEntries] = useState(() => buildMockData(SEED_BRANDS));

  if (!currentUser) return <LoginScreen users={SEED_USERS} onLogin={setCurrentUser} />;

  const NAV = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "tactical", label: "Tactical Ops", icon: BarChart2 },
    ...(currentUser.role === "owner" ? [{ key: "admin", label: "Admin Panel", icon: Settings }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-slate-900 border-r border-slate-800 p-6 flex flex-col">
        <div className="flex items-center gap-2 font-bold text-lg mb-8 text-indigo-400"><BarChart2 size={20}/> Create Brands</div>
        <nav className="flex-1 space-y-1">
          {NAV.map(n => (
            <button key={n.key} onClick={() => setActiveView(n.key)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${activeView === n.key ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800"}`}>
              <n.icon size={16}/> {n.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto pt-6 border-t border-slate-800">
          <div className="text-sm font-bold text-white">{currentUser.name}</div>
          <div className="text-xs text-slate-500 flex items-center gap-1"><Badge label={currentUser.role} color={currentUser.role==="owner"?"violet":"indigo"} /></div>
          <button onClick={() => setCurrentUser(null)} className="mt-4 text-xs text-red-400 hover:text-red-300 flex items-center gap-1"><LogOut size={12}/> Sign Out</button>
        </div>
      </aside>
      <main className="flex-1 p-6 md:p-10 overflow-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold capitalize">{activeView.replace("_", " ")}</h1>
          <p className="text-slate-500 text-sm">Welcome back, {currentUser.name.split(" ")[0]}. Here is what's happening today.</p>
        </header>
        {activeView === "dashboard" && <DashboardView brands={brands} entries={entries} />}
        {activeView === "admin" && <AdminPanelView brands={brands} users={SEED_USERS} onAddBrand={() => alert("Logic to open Create Modal")} />}
        {activeView === "tactical" && <div className="text-slate-500 py-20 text-center">Tactical Analysis View Ready</div>}
      </main>
    </div>
  );
}import { useState, useMemo, useCallback, useEffect, createContext, useContext, useRef } from "react";
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

// ─── Mock Data Generator ──────────────────────────────────────────────────────
function buildMockData(brands) {
  const entries = [];
  const today = new Date();
  brands.forEach(brand => {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dow = d.getDay(); const isWeekend = dow === 0 || dow === 6;
      const mult = isWeekend ? 1.25 : 0.9; const noise = () => 1 + (Math.random() - 0.5) * 0.36;
      const netSales = Math.round(brand.kpiTargets.dailyRevenue * mult * noise());
      const laborCost = Math.round(netSales * 0.28 * noise());
      const cogsCost = Math.round(netSales * 0.30 * noise());
      const totalHours = Math.round(netSales / (48 + Math.random() * 10));
      const dateStr = d.toISOString().split("T")[0];
      entries.push({
        id: `${brand.id}-${dateStr}`,
        brandId: brand.id, brandName: brand.name, date: dateStr,
        netSales, laborCost, cogsCost, totalHours, timestamp: d.toISOString()
      });
    }
  });
  return entries;
}

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
  return { netSales, laborCost, cogsCost, totalHours, primeCost, splh };
}

// ─── Shared Components ────────────────────────────────────────────────────────
function Badge({ label, color = "slate" }) {
  const colors = {
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    violet: "bg-violet-50 text-violet-600 border-violet-100",
    slate: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold border ${colors[color]}`}>{label}</span>;
}

function StatCard({ label, value, icon: Icon, alert = false }) {
  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-2 transition-all hover:shadow-md ${alert ? "bg-red-50 border-red-100" : "bg-white border-slate-200"}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</span>
        {Icon && <Icon size={18} className={alert ? "text-red-500" : "text-indigo-600"} />}
      </div>
      <div className={`text-2xl font-bold ${alert ? "text-red-700" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

// ─── VIEWS ───────────────────────────────────────────────────────────────────

function DashboardView({ entries }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = fmtDate(today);
  const todayEntries = entries.filter(e => e.date === todayStr);
  const agg = aggregateEntries(todayEntries);

  const chartData = useMemo(() => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = fmtDate(d);
      const de = entries.filter(e => e.date === ds);
      const a = aggregateEntries(de);
      data.push({ date: ds.slice(5), revenue: a?.netSales || 0 });
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
        <h3 className="text-sm font-bold text-slate-700 mb-6 uppercase tracking-wider">7-Day Revenue Analysis</h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="date" tick={{fill:"#64748b", fontSize:12}} axisLine={false} tickLine={false} />
            <YAxis tick={{fill:"#64748b", fontSize:12}} axisLine={false} tickLine={false} tickFormatter={v => `£${v/1000}k`} />
            <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{backgroundColor:"#ffffff", border:"1px solid #e2e8f0", borderRadius:"12px"}} />
            <Bar dataKey="revenue" fill="#6366f1" radius={[6,6,0,0]} barSize={40} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AdminPanelView({ brands, onAddBrand }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Locations</h2>
          <p className="text-sm text-slate-500">Manage your group portfolio and targets</p>
        </div>
        <button onClick={() => onAddBrand()} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 transition-all">
          <Plus size={18}/> New Location
        </button>
      </div>
      <div className="grid gap-4">
        {brands.map(b => (
          <div key={b.id} className="bg-white border border-slate-200 p-5 rounded-2xl flex items-center justify-between hover:border-indigo-200 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-indigo-50 text-indigo-600">
                <Building2 size={24}/>
              </div>
              <div>
                <div className="font-bold text-slate-900">{b.name}</div>
                <div className="text-xs text-slate-500 font-medium">{b.address}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="p-2.5 text-slate-400 hover:text-indigo-600 bg-slate-50 rounded-xl transition-colors"><Edit size={16}/></button>
              <button className="p-2.5 text-slate-400 hover:text-red-600 bg-slate-50 rounded-xl transition-colors"><Trash2 size={16}/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── LOGIN SCREEN ──────────────────────────────────────────────────────────
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
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Email Address</label>
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@createbrands.co.uk" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm focus:border-indigo-500 focus:bg-white transition-all outline-none text-slate-900" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm focus:border-indigo-500 focus:bg-white transition-all outline-none text-slate-900" />
          </div>
          <button onClick={() => {
            const user = users.find(u => u.email === email && u.password === password);
            if(user) onLogin(user); else setError("Invalid login details");
          }} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-100 transition-all mt-2">Sign In</button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeView, setActiveView] = useState("dashboard");
  const [brands, setBrands] = useState(SEED_BRANDS);
  const [entries, setEntries] = useState(() => buildMockData(SEED_BRANDS));

  if (!currentUser) return <LoginScreen users={SEED_USERS} onLogin={setCurrentUser} />;

  const NAV = [
    { key: "dashboard", label: "Executive Summary", icon: LayoutDashboard },
    { key: "tactical", label: "Operations", icon: BarChart2 },
    ...(currentUser.role === "owner" ? [{ key: "admin", label: "Brand Settings", icon: Settings }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row font-sans">
      <aside className="w-full md:w-72 bg-white border-r border-slate-200 p-8 flex flex-col shadow-sm z-20">
        <div className="flex items-center gap-3 font-black text-xl mb-12 text-slate-900 tracking-tight">
          <div className="p-2 bg-indigo-600 rounded-xl"><BarChart2 size={18} className="text-white"/></div>
          Create Brands
        </div>
        <nav className="flex-1 space-y-2">
          {NAV.map(n => (
            <button key={n.key} onClick={() => setActiveView(n.key)} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl text-sm font-bold transition-all ${activeView === n.key ? "bg-indigo-50 text-indigo-600 shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}>
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
        <header className="mb-12 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight capitalize">{activeView.replace("_", " ")}</h1>
            <p className="text-slate-500 font-medium mt-1">Hello, {currentUser.name.split(" ")[0]}. Portfolio status is looking good.</p>
          </div>
          <div className="hidden lg:flex gap-3">
             <div className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-500 flex items-center gap-2"><Clock size={14}/> Live Sync Active</div>
          </div>
        </header>
        {activeView === "dashboard" && <DashboardView brands={brands} entries={entries} />}
        {activeView === "admin" && <AdminPanelView brands={brands} onAddBrand={() => alert("Admin UI Active")} />}
        {activeView === "tactical" && <div className="bg-white border border-slate-200 rounded-3xl p-20 text-center text-slate-400 font-bold border-dashed">Operational Analytics Initializing...</div>}
      </main>
    </div>
  );
}