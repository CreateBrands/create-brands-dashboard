// petpooja-sync — pulls Dubai sales from the Petpooja billing portal into flipdish_sales.
// PETPOOJA 2026-09-11a
//
// How it works (discovered from the portal's own network traffic, like the RMS sync):
//   1. POST https://billing.petpooja.com/  header_changed_rest_id=<id>   -> selects the outlet for the session
//   2. POST /custom_reports/get_data_query/1/28  -> "Orders Summary With Time"        (one row per bill)
//   3. POST /custom_reports/get_data_query/1/39  -> "Item Wise Report With Bill No. With Time" (one row per line)
//   Both take a `filter` JSON on B.created (datetime range). Responses are {fields:[...], final_result:[[...]]}.
//   Bills + lines are joined on Invoice No. and upserted on (sale_id, brand_id), sale_id = pp-<outlet>-<invoice>.
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   PETPOOJA_COOKIE   full cookie string from the portal: "PETPOOJA_CO=...; user_id=...; user_key=..."
//   SYNC_SECRET       same shared secret the other syncs use (x-sync-secret header)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Call:  POST { "fromDate":"YYYY-MM-DD", "toDate":"YYYY-MM-DD", "dry": false }
//        defaults: yesterday..today (Dubai time). dry=true parses and returns a sample without writing.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE = "https://billing.petpooja.com";
const BRAND_ID = "chocoberry-uae";
const CURRENCY = "AED";
const TZ_OFFSET = "+04:00"; // Asia/Dubai, no DST

// Petpooja restaurant id -> dashboard store
const OUTLETS: Record<string, { storeId: string; name: string }> = {
  "328987": { storeId: "store-dubai-downtown", name: "CHOCOBERRY - Downtown Dubai" },
  "348596": { storeId: "store-zahia-mall",     name: "Chocoberry - Al Zahia Mall" },
};

const DS_BILLS = 28;
const DS_LINES = 39;

type Row = Record<string, any>;

function dubaiToday(): string {
  const d = new Date(Date.now() + 4 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const num = (v: any): number => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : 0; };

// "2026-09-10 14:32:11" | "10-09-2026 14:32" | "2026-09-10" -> ISO with Dubai offset
function toIso(dateStr: string, timeStr?: string): string | null {
  let s = String(dateStr || "").trim();
  if (timeStr && !/\d{1,2}:\d{2}/.test(s)) s += " " + String(timeStr).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  let y, mo, d, h = "00", mi = "00", se = "00";
  if (m) { [, y, mo, d] = m; h = m[4] ?? h; mi = m[5] ?? mi; se = m[6] ?? se; }
  else {
    m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    [, d, mo, y] = m; h = m[4] ?? h; mi = m[5] ?? mi; se = m[6] ?? se;
  }
  const p = (x: string) => x.padStart(2, "0");
  return `${y}-${p(mo!)}-${p(d!)}T${p(h)}:${mi}:${se}${TZ_OFFSET}`;
}

class NeedsLogin extends Error {}

async function ppFetch(cookie: string, path: string, form: Record<string, string>) {
  const body = new URLSearchParams(form).toString();
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: {
      "cookie": cookie,
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
      "x-app-client": "billing-web",
      "origin": BASE,
      "referer": BASE + "/custom_reports/reports/",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) create-brands-sync",
    },
    redirect: "manual",
  });
  const text = await res.text();
  if (res.status === 302 || res.status === 301) {
    const loc = res.headers.get("location") || "";
    if (/login|users\/?$/i.test(loc)) throw new NeedsLogin("redirected to login: " + loc);
  }
  return { status: res.status, text, contentType: res.headers.get("content-type") || "" };
}

async function selectOutlet(cookie: string, restId: string) {
  // The portal's hidden form: <form id="change_res" method=post action="https://billing.petpooja.com/">
  const r = await ppFetch(cookie, "/", { header_changed_rest_id: restId });
  if (r.status >= 400) throw new Error(`outlet switch ${restId} -> HTTP ${r.status}`);
}

async function runDatasource(cookie: string, ds: number, from: string, to: string): Promise<Row[]> {
  const filter = [
    { table: "B", field: "created", operator: "gteq", value: `${from} 00:00:00` },
    { table: "B", field: "created", operator: "lteq", value: `${to} 23:59:59` },
  ];
  const r = await ppFetch(cookie, `/custom_reports/get_data_query/1/${ds}`, {
    json_query: "", datasource: String(ds), replace: "[]", filter: JSON.stringify(filter),
  });
  let j: any;
  try { j = JSON.parse(r.text); }
  catch {
    if (/<form[^>]*login|name="password"/i.test(r.text)) throw new NeedsLogin("html login page returned");
    throw new Error(`datasource ${ds}: non-JSON response (HTTP ${r.status}): ${r.text.slice(0, 200)}`);
  }
  if (j.error && j.error !== 0 && j.error !== "0") throw new Error(`datasource ${ds}: ${JSON.stringify(j).slice(0, 300)}`);
  const fields: string[] = j.fields || [];
  return (j.final_result || []).map((arr: any[]) => {
    const o: Row = {}; fields.forEach((f, i) => { o[f] = arr[i]; }); return o;
  });
}

// tolerant column access: first key that matches any of the candidates (case/space-insensitive)
function pick(row: Row, ...cands: string[]): any {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const keys = Object.keys(row);
  for (const c of cands) { const k = keys.find(k => norm(k) === norm(c)); if (k !== undefined) return row[k]; }
  return undefined;
}

function channelOf(orderType: string): string {
  const t = (orderType || "").toLowerCase();
  if (/online|zomato|swiggy|talabat|deliveroo|noon|careem|web|app/.test(t)) return "online";
  return "pos";
}

function buildSales(restId: string, bills: Row[], lines: Row[]) {
  const outlet = OUTLETS[restId];
  const linesByInv = new Map<string, Row[]>();
  for (const l of lines) {
    const inv = String(pick(l, "Invoice No.", "Invoice No", "invoice_no") ?? "").trim();
    if (!inv) continue;
    if (!linesByInv.has(inv)) linesByInv.set(inv, []);
    linesByInv.get(inv)!.push(l);
  }
  const out: any[] = [];
  for (const b of bills) {
    const inv = String(pick(b, "Invoice No.", "Invoice No", "invoice_no") ?? "").trim();
    if (!inv) continue;
    const when = toIso(String(pick(b, "Date", "created") ?? ""));
    if (!when) continue;
    const status = String(pick(b, "Status") ?? "");
    const cancelled = /cancel|void/i.test(status);
    const items = (linesByInv.get(inv) || []).map((l, i) => {
      const qty = num(pick(l, "Qty.", "Qty", "Quantity"));
      const price = num(pick(l, "Price"));
      const final = num(pick(l, "Final Total", "Total"));
      const tax = num(pick(l, "Tax"));
      const sub = num(pick(l, "Sub Total", "Subtotal"));
      return {
        id: `${inv}-${i + 1}`,
        caption: String(pick(l, "Item", "Item Name") ?? ""),
        category: String(pick(l, "Category") ?? ""),
        variation: pick(l, "Variation") || null,
        quantity: qty,
        unitPrice: price,
        retailPrice: sub,
        netRetailPrice: final,
        taxAmount: tax,
        taxPercentage: sub ? Math.round((tax / sub) * 10000) / 100 : null,
        discount: num(pick(l, "Discount")),
        saleItems: [],
      };
    });
    out.push({
      sale_id: `pp-${restId}-${inv}`,
      brand_id: BRAND_ID,
      store_id: outlet.storeId,
      storefront_id: `pp-${restId}`,
      property_name: outlet.name,
      channel: channelOf(String(pick(b, "Order Type") ?? "")),
      sale_time: when,
      business_date: when.slice(0, 10),
      amount_subtotal: num(pick(b, "My Amount (Rs.)", "My Amount")),
      amount_discount: num(pick(b, "Discount (Rs.)", "Discount")),
      amount_tax: num(pick(b, "Total Tax (Rs.)", "Total Tax")),
      amount_total: num(pick(b, "Total (Rs.)", "Total")),
      payment_method: String(pick(b, "Payment Type") ?? ""),
      is_cancelled: cancelled,
      is_fully_refunded: false,
      sale_items: items,
      receipt_lines: [{ method: String(pick(b, "Payment Type") ?? ""), description: pick(b, "Payment Description") ?? null,
                        amount: num(pick(b, "Total (Rs.)", "Total")) }],
      discounts_detail: null,
      raw_rms: { source: "petpooja", bill: b, lines: linesByInv.get(inv) || [] },
      source: "petpooja",
      currency: CURRENCY,
    });
  }
  return out;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("SYNC_SECRET");
  if (secret && req.headers.get("x-sync-secret") !== secret) return new Response("unauthorized", { status: 401 });

  const cookie = Deno.env.get("PETPOOJA_COOKIE") || "";
  if (!cookie) return Response.json({ error: "PETPOOJA_COOKIE secret not set" }, { status: 500 });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: any = {}; try { body = await req.json(); } catch { /* no body */ }
  const today = dubaiToday();
  const from = body.fromDate || addDays(today, -1);
  const to = body.toDate || today;
  const dry = !!body.dry;

  const started = new Date().toISOString();
  const summary: any = { from, to, dry, outlets: {} };
  let status = "ok", errorText: string | null = null, upserted = 0;

  try {
    for (const restId of Object.keys(OUTLETS)) {
      await selectOutlet(cookie, restId);
      const bills = await runDatasource(cookie, DS_BILLS, from, to);
      const lines = await runDatasource(cookie, DS_LINES, from, to);
      const sales = buildSales(restId, bills, lines);
      summary.outlets[restId] = { store: OUTLETS[restId].storeId, bills: bills.length, lines: lines.length, sales: sales.length,
        sample: dry ? sales.slice(0, 2) : undefined, billFields: dry ? Object.keys(bills[0] || {}) : undefined,
        lineFields: dry ? Object.keys(lines[0] || {}) : undefined };
      if (dry) continue;
      for (let i = 0; i < sales.length; i += 200) {
        const chunk = sales.slice(i, i + 200);
        const { error } = await sb.from("flipdish_sales").upsert(chunk, { onConflict: "sale_id,brand_id" });
        if (error) throw new Error(`upsert ${OUTLETS[restId].storeId}: ${error.message}`);
        upserted += chunk.length;
      }
    }
  } catch (e) {
    status = e instanceof NeedsLogin ? "needs_login" : "error";
    errorText = String(e?.message || e);
  }

  summary.upserted = upserted; summary.status = status; summary.error = errorText;
  if (!dry) {
    await sb.from("petpooja_sync_log").insert({ started_at: started, from_date: from, to_date: to, status, upserted, detail: summary });
    if (status === "needs_login") {
      // surface it in the dashboard rather than fail silently
      await sb.from("notifications").insert({
        title: "Petpooja session expired", body: "Dubai sales sync needs a fresh portal login cookie (PETPOOJA_COOKIE secret).",
        kind: "system", created_at: new Date().toISOString(),
      }).then(() => {}, () => {});
    }
  }
  return Response.json(summary, { status: status === "ok" ? 200 : 500 });
});
