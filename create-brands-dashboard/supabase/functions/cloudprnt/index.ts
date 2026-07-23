// - Star CloudPRNT endpoint - Supabase Edge Function -
// Serves BOTH label jobs (CK batch/allergen labels) and document jobs
// (Distribution SOs & invoices) to polling Star printers.
// Deploy:  supabase functions deploy cloudprnt --no-verify-jwt
// Secret:  supabase secrets set CLOUDPRNT_TOKEN=<long-random-string>
// Printer Server URL: https://<PROJECT-REF>.supabase.co/functions/v1/cloudprnt?key=<TOKEN>
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const TOKEN = Deno.env.get("CLOUDPRNT_TOKEN") || "";


const W = 42; // safe column width for 80mm Star @ font A

const pad = (l: string, r: string) => {
  const space = W - l.length - r.length;
  return space >= 1 ? l + " ".repeat(space) + r : (l.slice(0, W - r.length - 1) + " " + r);
};
const center = (t: string) => {
  const s = String(t).slice(0, W);
  return " ".repeat(Math.max(0, Math.floor((W - s.length) / 2))) + s;
};
const wrap = (t: string, indent = 0): string[] => {
  const words = String(t).split(/\s+/); const lines: string[] = []; let cur = "";
  const max = W - indent;
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) { lines.push(cur.trim()); cur = w; } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.map(l2 => " ".repeat(indent) + l2);
};
// Firmware 3.6 mangles non-ASCII in text/plain - ASCII only on the wire.
const money = (n: unknown) => "GBP " + (Number(n) || 0).toFixed(2);
const rule = (c = "-") => c.repeat(W);

function labelMarkup(p: Record<string, unknown>): string {
  const allergens = Array.isArray(p.allergens) ? (p.allergens as string[]).filter(Boolean) : [];
  const copies = Math.max(1, Math.min(50, Number(p.copies) || 1));
  const one = [
    rule("="),
    ...wrap(String(p.productName ?? "").toUpperCase()).map(center),
    center(`Made ${p.madeDate ?? ""}  -  ${p.qty ?? ""} ${p.unit ?? ""}`),
    rule("="),
    "",
    center(`USE BY  ${p.useBy ?? "- SET USE-BY -"}`),
    center(`BATCH  ${p.batchNo ?? ""}`),
    "",
    rule(),
    ...(allergens.length
      ? wrap(`CONTAINS: ${allergens.join(", ").toUpperCase()}`)
      : ["Allergens: none declared"]),
    rule(),
    center(`${p.brand ?? "Create Brands"} - Central Kitchen`),
  ].join("\n");
  return Array(copies).fill(one).join("\n\n" + center(". . . . tear . . . .") + "\n\n") + "\n" + pad("", "fmt v4") + "\n\n";
}

function docMarkup(p: Record<string, unknown>): string {
  const out: string[] = [
    rule("="),
    center(String(p.title ?? "").toUpperCase()),
    ...(p.subtitle ? [center(String(p.subtitle))] : []),
    rule("="),
  ];
  for (const m of (Array.isArray(p.meta) ? p.meta : []) as unknown[]) out.push(...wrap(String(m)));
  out.push(rule());
  for (const l of (Array.isArray(p.lines) ? p.lines : []) as Record<string, unknown>[]) {
    const nameLines = wrap(String(l.name ?? ""));
    out.push(...nameLines);
    out.push(pad(`   ${l.qty} x ${money(l.unitPrice)}`, money(l.amount)));
  }
  out.push(rule());
  for (const t of (Array.isArray(p.totals) ? p.totals : []) as Record<string, unknown>[]) {
    out.push(pad(String(t.label ?? ""), money(t.value)));
    if (t.strong) out.push(pad("", "========"));
  }
  if (p.note) { out.push(""); out.push(...wrap("Note: " + String(p.note))); }
  out.push("", center(String(p.footer ?? "Create Brands Distribution")), pad("", "fmt v4"), "");
  return out.join("\n");
}


// === StarPRNT raw bytes: real typography (Deliveroo-style hierarchy) ========
// ESC @ init | ESC GS a n align | ESC i h w magnify | ESC E/F bold | ESC d 3 feed+cut
class Prn {
  bytes: number[] = [];
  constructor() { this.raw(0x1b, 0x40); }
  raw(...b: number[]) { this.bytes.push(...b); return this; }
  txt(s: string) { for (const ch of String(s)) { const c = ch.charCodeAt(0); this.bytes.push(c >= 0x20 && c <= 0x7e ? c : 0x3f); } return this; }
  nl(n = 1) { for (let i = 0; i < n; i++) this.bytes.push(0x0a); return this; }
  align(n: 0 | 1 | 2) { return this.raw(0x1b, 0x1d, 0x61, n); }
  mag(h: number, w: number) { return this.raw(0x1b, 0x69, h, w); }
  bold(on: boolean) { return this.raw(0x1b, on ? 0x45 : 0x46); }
  inverse(on: boolean) { return this.raw(0x1b, on ? 0x34 : 0x35); } // white-on-black band
  cut() { return this.raw(0x1b, 0x64, 0x03); }
  line(l: string, r: string, width = 48) {
    const space = width - l.length - r.length;
    return this.txt(space >= 1 ? l + " ".repeat(space) + r : l.slice(0, width - r.length - 1) + " " + r).nl();
  }
  out() { return new Uint8Array(this.bytes); }
}

function docBytes(p: Record<string, unknown>): Uint8Array {
  const P = new Prn();
  P.align(1).bold(true).mag(1, 1).txt(String(p.title ?? "").toUpperCase()).nl();
  if (p.subtitle) P.txt(String(p.subtitle)).nl();
  P.mag(0, 0).bold(false).nl();
  P.align(0);
  for (const m of (Array.isArray(p.meta) ? p.meta : []) as unknown[]) P.txt(String(m)).nl();
  const num = (n: unknown) => (Number(n) || 0).toFixed(2);
  const cell = (s: string, w: number, right = false) => {
    const t = String(s).slice(0, w);
    return right ? " ".repeat(w - t.length) + t : t + " ".repeat(w - t.length);
  };
  const tRow = (q: string, it: string, r: string, a: string) =>
    cell(q, 3, true) + "   " + cell(it, 24) + cell(r, 8, true) + cell(a, 10, true);
  P.txt("_".repeat(48)).nl();
  P.bold(true).txt(tRow("QTY", "ITEM", "RATE", "AMOUNT")).nl().bold(false);
  P.txt("_".repeat(48)).nl();
  // Word-wrap a name INSIDE the 26-char item column so it never
  // flows into the number columns; numbers ride the first line.
  const wrapName = (t: string, w: number): string[] => {
    const words = String(t).split(/\s+/).filter(Boolean);
    const lines: string[] = []; let cur = "";
    for (const word of words) {
      const cand = cur ? cur + " " + word : word;
      if (cand.length <= w) cur = cand;
      else { if (cur) lines.push(cur); cur = word.length > w ? word.slice(0, w) : word; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  };
  // Group by category, preserving first-seen order; uncategorised last.
  const lineArr = (Array.isArray(p.lines) ? p.lines : []) as Record<string, unknown>[];
  const cats: string[] = [];
  const byCat = new Map<string, Record<string, unknown>[]>();
  for (const l of lineArr) {
    const c = String(l.category || "Other");
    if (!byCat.has(c)) { byCat.set(c, []); cats.push(c); }
    byCat.get(c)!.push(l);
  }
  if (cats.includes("Other") && cats.length > 1) { cats.splice(cats.indexOf("Other"), 1); cats.push("Other"); }
  for (const c of cats) {
    const rows = byCat.get(c)!;
    if (cats.length > 1 || c !== "Other") P.bold(true).txt(`  ${c.toUpperCase()}`).nl().bold(false);
    for (const l of rows) {
      const parts = wrapName(String(l.name ?? ""), 24);
      P.txt(tRow(String(l.qty ?? ""), parts[0], num(l.unitPrice), num(l.amount))).nl();
      for (const extra of parts.slice(1)) P.txt(tRow("", extra, "", "")).nl();
      if (l.note) { P.bold(true); for (const nline of wrapName(">> " + String(l.note), 40)) P.txt("      " + nline).nl(); P.bold(false); }
    }
    P.txt("_".repeat(48)).nl(); // rule between categories (and closing the table)
  }
  const totals = (Array.isArray(p.totals) ? p.totals : []) as Record<string, unknown>[];
  for (const t of totals) {
    if (t.strong) { P.bold(true).mag(1, 1); P.line(String(t.label ?? "").slice(0, 10), money(t.value), 24); P.mag(0, 0).bold(false); }
    else P.line(String(t.label ?? ""), money(t.value));
  }
  if (p.note) P.nl().txt("Note: " + String(p.note)).nl();
  P.nl().align(1).txt(String(p.footer ?? "Create Brands Distribution")).nl();
  P.txt("fmt v14 - amounts in GBP").nl();
  return P.cut().out();
}

function labelBytes(p: Record<string, unknown>): Uint8Array {
  const allergens = Array.isArray(p.allergens) ? (p.allergens as string[]).filter(Boolean) : [];
  const copies = Math.max(1, Math.min(50, Number(p.copies) || 1));
  const P = new Prn();
  const rule = () => P.txt("_".repeat(48)).nl();
  for (let i = 0; i < copies; i++) {
    rule();
    P.align(1).bold(true).mag(1, 1).txt(String(p.productName ?? "").toUpperCase().slice(0, 24)).nl().mag(0, 0).bold(false);
    rule();
    P.align(0);
    P.line(`Made: ${p.madeDate ?? ""}`, `Qty: ${p.qty ?? ""} ${p.unit ?? ""}`);
    P.line("Batch:", String(p.batchNo ?? ""));
    rule();
    P.align(1).bold(true).mag(1, 1).txt(`USE BY ${p.useBy ?? "-SET-"}`.slice(0, 24)).nl().mag(0, 0).bold(false);
    P.align(0);
    rule();
    if (allergens.length) P.bold(true).txt(`CONTAINS: ${allergens.join(", ").toUpperCase()}`.slice(0, 96)).nl().bold(false);
    else P.txt("Allergens: none declared").nl();
    rule();
    P.align(1).txt(`${p.brand ?? "Create Brands"} - Central Kitchen`).nl().align(0);
    P.cut();
  }
  return P.out();
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (TOKEN && url.searchParams.get("key") !== TOKEN) return new Response("forbidden", { status: 403 });
  const mac = url.searchParams.get("mac") || "";

  if (req.method === "POST") {
    const { data } = await supabase.from("ck_label_jobs")
      .select("id").in("status", ["queued", "printing"])
      .order("created_at", { ascending: true }).limit(1);
    const job = data && data[0];
    return Response.json(job
      ? { jobReady: true, mediaTypes: ["application/vnd.star.starprnt", "text/plain"], jobToken: String(job.id) }
      : { jobReady: false });
  }

  if (req.method === "GET") {
    const t = url.searchParams.get("token");
    let q = supabase.from("ck_label_jobs").select("*").in("status", ["queued", "printing"])
      .order("created_at", { ascending: true }).limit(1);
    if (t) q = supabase.from("ck_label_jobs").select("*").eq("id", Number(t)).limit(1);
    const { data } = await q;
    const job = data && data[0];
    if (!job) return new Response("", { status: 404 });
    await supabase.from("ck_label_jobs").update({
      status: "printing", printer_mac: mac || null,
      last_error: `served type=${url.searchParams.get("type") || ""} accept=${req.headers.get("accept") || ""}`,
    }).eq("id", job.id);
    const wantsRaw = (url.searchParams.get("type") || "").includes("star");
    if (wantsRaw) {
      const bytes = job.kind === "doc" ? docBytes(job.payload || {}) : labelBytes(job.payload || {});
      return new Response(bytes, { headers: { "Content-Type": "application/vnd.star.starprnt" } });
    }
    const body = job.kind === "doc" ? docMarkup(job.payload || {}) : labelMarkup(job.payload || {});
    return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  if (req.method === "DELETE") {
    const t = Number(url.searchParams.get("token"));
    const code = url.searchParams.get("code") || "";
    if (t) {
      const ok = code === "" || code.startsWith("2") || code.toUpperCase() === "OK";
      await supabase.from("ck_label_jobs").update({
        status: ok ? "done" : "failed", printed_at: new Date().toISOString(),
        last_error: ok ? null : `code=${code} type=${url.searchParams.get("type") || ""} mac=${mac}`,
      }).eq("id", t);
    }
    return new Response("", { status: 200 });
  }

  return new Response("method", { status: 405 });
});
