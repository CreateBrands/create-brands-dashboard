// ════════════════════════════════════════════════════════════════════════════
// ChainPerformanceView — final merged version
// ════════════════════════════════════════════════════════════════════════════
// Features:
//   • Auto-refresh every 30s on Today view
//   • Custom date range picker (in addition to today/yesterday/7d/month)
//   • EOD reconciliation banner with real eod_entries schema fields
//   • CSV export of leaderboard
//   • Per-store drill-down modal with hourly channel breakdown
//
// REQUIRES these helpers in supabase.js:
//   • fetchChainSummary
//   • fetchStoreLeaderboard
//   • fetchStoreChannelTimeline
//   • fetchEODTodaySummary (matched to eod_entries schema: date, net_sales,
//                            total_orders, atv, cash_variance, manager, timestamp)
//
// USAGE: Replace the existing ChainPerformanceView component in App.js with
// this entire file (everything from the import line to the last closing brace).

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  fetchChainSummary,
  fetchStoreLeaderboard,
  fetchStoreChannelTimeline,
  fetchEODTodaySummary,
} from "./supabase";

// ────────────────────────────────────────────────────────────────────────────
// Channel config
// ────────────────────────────────────────────────────────────────────────────
const CHANNELS = [
  { key: "Web",            label: "Web",          color: "#7c3aed", hint: "Flipdish-hosted website orders" },
  { key: "POS",            label: "POS",          color: "#f59e0b", hint: "In-store till transactions" },
  { key: "UberEats",       label: "UberEats",     color: "#10b981", hint: "Uber Eats marketplace orders" },
  { key: "Deliveroo",      label: "Deliveroo",    color: "#06b6d4", hint: "Deliveroo marketplace orders" },
  { key: "JustEats",       label: "JustEat",      color: "#f97316", hint: "Just Eat marketplace orders" },
  { key: "FlipdishWebApp", label: "Flipdish App", color: "#ec4899", hint: "Flipdish-branded customer app" },
];

const AUTO_REFRESH_MS = 30_000;

// ────────────────────────────────────────────────────────────────────────────
// Formatters
// ────────────────────────────────────────────────────────────────────────────
const fmt = new Intl.NumberFormat("en-GB");
const fmtCurrency = (n) =>
  n == null ? "—" : "£" + Math.round(Number(n)).toLocaleString("en-GB");
const fmtCurrencyDecimal = (n) =>
  n == null ? "—" : "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const toLocalDateStr = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay   = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────
export function ChainPerformanceView() {
  const [range, setRange] = useState("today");
  const [customFrom, setCustomFrom] = useState(toLocalDateStr(new Date()));
  const [customTo, setCustomTo]     = useState(toLocalDateStr(new Date()));
  const [summary, setSummary] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [eod, setEod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const intervalRef = useRef(null);

  const { from, to } = useMemo(() => {
    if (range === "custom") {
      return { from: startOfDay(customFrom), to: endOfDay(customTo) };
    }
    const now = new Date();
    if (range === "today")     return { from: startOfDay(now), to: now };
    if (range === "yesterday") {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    if (range === "last7days") {
      const s = new Date(now); s.setDate(s.getDate() - 7);
      return { from: startOfDay(s), to: now };
    }
    if (range === "thismonth") {
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    }
    return { from: startOfDay(now), to: now };
  }, [range, customFrom, customTo]);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    setError(null);
    try {
      const [s, l, e] = await Promise.all([
        fetchChainSummary({ from, to }),
        fetchStoreLeaderboard({ from, to }),
        range === "today" ? fetchEODTodaySummary() : Promise.resolve(null),
      ]);
      setSummary(s);
      setLeaderboard(l);
      setEod(e);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [from.getTime(), to.getTime()]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (range === "today") {
      intervalRef.current = setInterval(() => load(true), AUTO_REFRESH_MS);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [range, from.getTime(), to.getTime()]);

  const handleExport = () => {
    if (!leaderboard.length) return;
    const cols = ["Store", "Total", "Web", "POS", "UberEats", "Deliveroo", "JustEat", "App", "Web Revenue"];
    const rows = leaderboard.map(r => [
      r.short_name, r.total_orders, r.web_orders, r.pos_count,
      r.uber_count, r.deli_count, r.je_count, r.fda_count,
      r.web_revenue?.toFixed(2) || "0.00",
    ]);
    const csv = [cols, ...rows].map(row =>
      row.map(c => {
        const s = String(c ?? "");
        return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chain-performance-${toLocalDateStr(from)}-to-${toLocalDateStr(to)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "28px", color: "#f1f5f9" }}>Chain Performance</h1>
          <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: "14px" }}>
            Real-time data from Flipdish webhooks across all channels
            {lastUpdated && range === "today" && (
              <span style={{ marginLeft: "12px", color: "#64748b", fontSize: "12px" }}>
                · Updated {lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                {refreshing && " · refreshing…"}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <RangePicker value={range} onChange={setRange} />
          <button onClick={() => load()} disabled={refreshing} style={btnSecondary}>↻ Refresh</button>
          <button onClick={handleExport} disabled={!leaderboard.length} style={btnSecondary}>↓ CSV</button>
        </div>
      </div>

      {/* Custom date inputs */}
      {range === "custom" && (
        <div style={{ marginBottom: "16px", display: "flex", gap: "12px", alignItems: "center", padding: "12px", background: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }}>
          <span style={{ color: "#94a3b8", fontSize: "13px" }}>From</span>
          <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} style={dateInput} />
          <span style={{ color: "#94a3b8", fontSize: "13px" }}>To</span>
          <input type="date" value={customTo} min={customFrom} max={toLocalDateStr(new Date())} onChange={(e) => setCustomTo(e.target.value)} style={dateInput} />
        </div>
      )}

      {/* EOD reconciliation banner (today only) */}
      {range === "today" && eod && (
        <EodBanner eod={eod} chainTotal={summary?.total_orders ?? 0} />
      )}

      {error && <Banner type="error">Failed to load: {error}</Banner>}
      {loading && !summary && <Banner type="info">Loading…</Banner>}

      {summary && (
        <>
          <HeroSummary summary={summary} />
          <ChannelBreakdown summary={summary} />
          <StoreLeaderboard leaderboard={leaderboard} onSelect={setSelectedStore} />
        </>
      )}

      {selectedStore && (
        <StoreDrillDown
          store={selectedStore}
          from={from}
          to={to}
          onClose={() => setSelectedStore(null)}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// EOD reconciliation banner — uses real eod_entries schema fields
// ────────────────────────────────────────────────────────────────────────────
function EodBanner({ eod, chainTotal }) {
  const {
    stores_with_eod,
    total_revenue, total_orders_eod, atv_eod, variance,
    last_entered_minutes_ago, manager_name, submitted_at,
  } = eod;

  const submitted = stores_with_eod > 0;
  const hasVariance = variance != null && Math.abs(variance) > 0.50;

  return (
    <div style={{
      background: submitted ? "#0f2027" : "#1e293b",
      border: `1px solid ${submitted ? "#065f46" : "#334155"}`,
      borderRadius: "10px",
      padding: "14px 18px",
      marginBottom: "20px",
      fontSize: "13px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
          <Stat
            label="EOD Submitted"
            value={submitted ? "✓ Yes" : "Not yet"}
            valueColor={submitted ? "#10b981" : "#fbbf24"}
          />
          {submitted && (
            <>
              <Stat label="Net Sales (EOD)" value={fmtCurrencyDecimal(total_revenue)} />
              <Stat label="Orders (EOD)" value={total_orders_eod != null ? fmt.format(total_orders_eod) : "—"} />
              <Stat label="ATV (EOD)" value={atv_eod != null ? fmtCurrencyDecimal(atv_eod) : "—"} />
              <Stat label="Live Order Count" value={fmt.format(chainTotal)} />
              {hasVariance && (
                <Stat
                  label="Cash Variance"
                  value={fmtCurrencyDecimal(variance)}
                  valueColor={variance < 0 ? "#fbbf24" : "#10b981"}
                />
              )}
            </>
          )}
        </div>

        {submitted && (
          <div style={{ textAlign: "right", color: "#94a3b8", fontSize: "12px" }}>
            <div>by {manager_name || "—"} at {submitted_at}</div>
            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
              {last_entered_minutes_ago < 60
                ? `${last_entered_minutes_ago}m ago`
                : `${Math.floor(last_entered_minutes_ago / 60)}h ${last_entered_minutes_ago % 60}m ago`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, valueColor }) {
  return (
    <div>
      <div style={{ color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "11px" }}>
        {label}
      </div>
      <div style={{
        color: valueColor || "#f1f5f9",
        fontSize: "16px",
        fontWeight: 600,
        marginTop: "2px",
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// HeroSummary
// ────────────────────────────────────────────────────────────────────────────
function HeroSummary({ summary }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" }}>
      <StatCard
        label="Total orders"
        value={fmt.format(summary.total_orders)}
        sub={`${fmt.format(summary.web_orders)} Web · ${fmt.format(summary.non_web_sales)} POS+marketplaces`}
      />
      <StatCard
        label="Web revenue"
        value={fmtCurrency(summary.web_revenue)}
        sub="Detailed amounts only available for Web channel"
      />
      <StatCard
        label="Channels active"
        value={Object.values(summary.per_channel).filter(c => c.count > 0).length}
        sub="of 6 possible (Web, POS, UberEats, Deliveroo, JustEat, App)"
      />
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
      <div style={{ fontSize: "13px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: "32px", fontWeight: 600, color: "#f1f5f9", margin: "8px 0", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: "12px", color: "#64748b" }}>{sub}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// ChannelBreakdown — 6 channels side by side
// ────────────────────────────────────────────────────────────────────────────
function ChannelBreakdown({ summary }) {
  const total = summary.total_orders || 1;
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px", marginBottom: "24px" }}>
      <h2 style={{ margin: "0 0 16px", fontSize: "18px", color: "#f1f5f9" }}>Channel Breakdown</h2>
      <div style={{ display: "flex", height: "8px", borderRadius: "4px", overflow: "hidden", marginBottom: "16px", background: "#1e293b" }}>
        {CHANNELS.map(ch => {
          const stat = summary.per_channel[ch.key];
          const pct = ((stat?.count || 0) / total) * 100;
          if (pct === 0) return null;
          return <div key={ch.key} title={`${ch.label}: ${stat?.count || 0} orders`} style={{ width: `${pct}%`, background: ch.color }} />;
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "12px" }}>
        {CHANNELS.map(ch => {
          const stat = summary.per_channel[ch.key] || { count: 0, revenue: null };
          const pct = ((stat.count / total) * 100).toFixed(1);
          return (
            <div key={ch.key} style={{
              background: "#1e293b",
              border: `1px solid ${stat.count > 0 ? ch.color : "#334155"}`,
              borderRadius: "10px",
              padding: "12px",
              opacity: stat.count > 0 ? 1 : 0.5,
            }} title={ch.hint}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: ch.color }} />
                {ch.label}
              </div>
              <div style={{ fontSize: "22px", fontWeight: 600, color: "#f1f5f9", fontVariantNumeric: "tabular-nums" }}>
                {fmt.format(stat.count)}
              </div>
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                {pct}%{ch.key === "Web" && stat.revenue != null ? ` · ${fmtCurrency(stat.revenue)}` : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// StoreLeaderboard
// ────────────────────────────────────────────────────────────────────────────
function StoreLeaderboard({ leaderboard, onSelect }) {
  const maxOrders = Math.max(1, ...leaderboard.map(r => r.total_orders));
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px", marginBottom: "24px" }}>
      <h2 style={{ margin: "0 0 16px", fontSize: "18px", color: "#f1f5f9" }}>Stores</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              <th style={th}>Store</th>
              <th style={{ ...th, textAlign: "right" }}>Total</th>
              <th style={{ ...th, textAlign: "right", color: CHANNELS[0].color }}>Web</th>
              <th style={{ ...th, textAlign: "right", color: CHANNELS[1].color }}>POS</th>
              <th style={{ ...th, textAlign: "right", color: CHANNELS[2].color }}>UE</th>
              <th style={{ ...th, textAlign: "right", color: CHANNELS[3].color }}>Deli</th>
              <th style={{ ...th, textAlign: "right", color: CHANNELS[4].color }}>JE</th>
              <th style={{ ...th, textAlign: "right", color: CHANNELS[5].color }}>App</th>
              <th style={{ ...th, textAlign: "right" }}>Web Revenue</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map(r => (
              <tr key={r.store_id}
                style={{ borderBottom: "1px solid #1e293b", cursor: "pointer" }}
                onClick={() => onSelect(r)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#1e293b40"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <td style={td}>{r.short_name}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 600, color: "#f1f5f9", fontVariantNumeric: "tabular-nums" }}>
                  {fmt.format(r.total_orders)}
                </td>
                <td style={tdMuted(r.web_orders)}>{r.web_orders || "—"}</td>
                <td style={tdMuted(r.pos_count)}>{r.pos_count || "—"}</td>
                <td style={tdMuted(r.uber_count)}>{r.uber_count || "—"}</td>
                <td style={tdMuted(r.deli_count)}>{r.deli_count || "—"}</td>
                <td style={tdMuted(r.je_count)}>{r.je_count || "—"}</td>
                <td style={tdMuted(r.fda_count)}>{r.fda_count || "—"}</td>
                <td style={{ ...td, textAlign: "right", color: "#cbd5e1", fontVariantNumeric: "tabular-nums" }}>
                  {r.web_revenue > 0 ? fmtCurrencyDecimal(r.web_revenue) : "—"}
                </td>
                <td style={td}>
                  <div style={{ width: "60px", height: "6px", background: "#1e293b", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ width: `${(r.total_orders / maxOrders) * 100}%`, height: "100%", background: "#7c3aed" }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: "11px", color: "#64748b", margin: "12px 0 0" }}>
        Web Revenue shows actual amounts. POS/marketplace amounts not exposed by Flipdish API — count only.
        Click any store for hourly breakdown.
      </p>
    </div>
  );
}

const th = { padding: "10px 8px", textAlign: "left", fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" };
const td = { padding: "10px 8px", color: "#cbd5e1" };
const tdMuted = (val) => ({ ...td, textAlign: "right", color: val > 0 ? "#cbd5e1" : "#475569", fontVariantNumeric: "tabular-nums" });

// ────────────────────────────────────────────────────────────────────────────
// StoreDrillDown modal
// ────────────────────────────────────────────────────────────────────────────
function StoreDrillDown({ store, from, to, onClose }) {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchStoreChannelTimeline({ storeId: store.store_id, from, to });
        if (!cancelled) setTimeline(data);
      } catch (e) { /* silent */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [store.store_id, from.getTime(), to.getTime()]);

  const nonEmpty = timeline.filter(h => CHANNELS.some(ch => h[ch.key] > 0));
  const maxBucket = Math.max(1, ...nonEmpty.flatMap(h => CHANNELS.map(ch => h[ch.key])));

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px",
        padding: "24px", width: "90%", maxWidth: "800px", maxHeight: "80vh", overflow: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h2 style={{ margin: 0, color: "#f1f5f9", fontSize: "22px" }}>{store.short_name}</h2>
            <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: "13px" }}>
              {fmt.format(store.total_orders)} orders · {fmtCurrencyDecimal(store.web_revenue)} Web revenue
            </p>
          </div>
          <button onClick={onClose} style={btnSecondary}>Close</button>
        </div>
        <h3 style={{ margin: "0 0 12px", color: "#cbd5e1", fontSize: "14px" }}>Hourly breakdown by channel</h3>
        {loading && <div style={{ color: "#94a3b8" }}>Loading…</div>}
        {!loading && nonEmpty.length === 0 && (
          <div style={{ color: "#64748b", padding: "20px 0" }}>No order activity in this date range.</div>
        )}
        {!loading && nonEmpty.length > 0 && (
          <div style={{ display: "grid", gap: "6px" }}>
            {nonEmpty.map(h => (
              <div key={h.hour} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "50px", color: "#94a3b8", fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>{h.hour}</div>
                <div style={{ flex: 1, display: "flex", gap: "2px", height: "20px" }}>
                  {CHANNELS.map(ch => {
                    const v = h[ch.key] || 0;
                    if (v === 0) return null;
                    return (
                      <div key={ch.key} title={`${ch.label}: ${v}`} style={{
                        width: `${(v / maxBucket) * 100}%`, background: ch.color, borderRadius: "3px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "10px", color: "white", fontWeight: 600, minWidth: "20px",
                      }}>{v}</div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// RangePicker / Banner / styles
// ────────────────────────────────────────────────────────────────────────────
function RangePicker({ value, onChange }) {
  const options = [
    { v: "today",     l: "Today" },
    { v: "yesterday", l: "Yesterday" },
    { v: "last7days", l: "7d" },
    { v: "thismonth", l: "Month" },
    { v: "custom",    l: "Custom" },
  ];
  return (
    <div style={{ display: "flex", gap: "4px", background: "#1e293b", padding: "4px", borderRadius: "8px" }}>
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{
          background: value === o.v ? "#7c3aed" : "transparent", border: "none",
          color: value === o.v ? "white" : "#94a3b8", padding: "6px 12px",
          borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 500,
        }}>{o.l}</button>
      ))}
    </div>
  );
}

const btnSecondary = {
  background: "transparent", border: "1px solid #334155",
  color: "#cbd5e1", padding: "6px 12px", borderRadius: "6px", cursor: "pointer",
  fontSize: "13px", fontWeight: 500,
};

const dateInput = {
  background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9",
  padding: "6px 10px", borderRadius: "6px", fontSize: "13px",
  colorScheme: "dark",
};

function Banner({ type = "info", children }) {
  const colors = {
    info:    { bg: "#1e293b", border: "#334155", text: "#cbd5e1" },
    error:   { bg: "#450a0a", border: "#7f1d1d", text: "#fecaca" },
    success: { bg: "#064e3b", border: "#065f46", text: "#a7f3d0" },
  }[type];
  return (
    <div style={{
      background: colors.bg, border: `1px solid ${colors.border}`,
      color: colors.text, padding: "12px 16px", borderRadius: "8px",
      marginBottom: "16px", fontSize: "13px",
    }}>{children}</div>
  );
}
