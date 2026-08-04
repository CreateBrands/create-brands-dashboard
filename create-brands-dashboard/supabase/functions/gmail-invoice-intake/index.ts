// ============================================================
// EDGE FUNCTION: gmail-invoice-intake  (marker: GMAIL_INTAKE_V2)
// Polls a Gmail mailbox for supplier invoices, stores each attachment,
// creates an `invoices` row and triggers INVOICE_EXTRACT_V1.
//
// Called on a schedule by pg_cron — see gmail_intake_migration.sql.
// Deploy: dashboard editor paste-over · Verify JWT OFF
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SYNC_SHARED_SECRET,
// Gmail credentials live in integration_tokens, set via the app's Connect button.
//
// Design notes:
//  • Scoped by a Gmail QUERY, not "everything unread". Suppliers email a
//    dedicated label; scanning a whole personal inbox would upload every PDF
//    anyone ever sent, and the extractor would happily try to read all of it.
//  • Every processed message id is recorded, so a re-run cannot create the
//    same invoice twice — the intake is idempotent, which matters when it runs
//    on a cron and a failure mid-batch is normal.
//  • Extraction is triggered but NOT awaited to completion — the extractor
//    already has its own timeout problems on large PDFs, and one slow document
//    should not stall the rest of the batch.
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// Only file types the extractor can actually read. A .docx invoice would be
// stored and then fail extraction with an unhelpful error.
const OK_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
  "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
};

// V2: credentials come from integration_tokens (written by gmail-connect),
// not from function secrets — so connecting is a button in the app rather than
// a redeploy. The table is RLS-locked with no policy, so only this function's
// service_role can read it.
async function accessToken(db: any): Promise<string> {
  const { data: row } = await db.from("integration_tokens")
    .select("refresh_token, client_id, client_secret").eq("id", "gmail").maybeSingle();
  if (!row?.refresh_token) throw new Error("NOT_CONNECTED");
  const body = new URLSearchParams({
    client_id: row.client_id,
    client_secret: row.client_secret,
    refresh_token: row.refresh_token,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const j = await r.json();
  if (!j.access_token) {
    // A revoked or expired refresh token is the most likely long-term failure
    // of this whole feature, so say so plainly rather than "undefined".
    throw new Error(`Gmail auth failed: ${j.error_description || j.error || "no access token returned"}. The refresh token may have been revoked — re-run the consent flow.`);
  }
  return j.access_token;
}

const gmail = async (token: string, path: string) => {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Gmail ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

// Gmail returns base64url, which is not what atob expects.
function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Attachments can be nested several levels down in a multipart message.
function collectParts(part: any, acc: any[] = []): any[] {
  if (!part) return acc;
  if (part.filename && part.body?.attachmentId) acc.push(part);
  (part.parts || []).forEach((p: any) => collectParts(p, acc));
  return acc;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const secret = req.headers.get("x-sync-secret") ?? "";
    if (secret !== (Deno.env.get("SYNC_SHARED_SECRET") ?? "_unset_")) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));

    // Configurable so the query can be tightened without a redeploy.
    const { data: cfg } = await db.from("app_settings").select("value").eq("key", "gmail_intake_query").maybeSingle();
    const query = body.query || cfg?.value || "label:supplier-invoices has:attachment";
    const maxMessages = Math.min(Number(body.max) || 15, 40);

    let token: string;
    try {
      token = await accessToken(db);
    } catch (e) {
      if (String(e).includes("NOT_CONNECTED")) {
        // The cron runs whether or not anyone has connected Gmail. That's not
        // an error worth alarming about — just nothing to do.
        return json({ ok: true, connected: false, checked: 0, imported: 0, note: "Gmail isn't connected yet." });
      }
      await db.from("integration_status").upsert({
        id: "gmail", connected: false, last_error: String(e).slice(0, 300),
        last_run_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      throw e;
    }
    const list = await gmail(token, `messages?q=${encodeURIComponent(query)}&maxResults=${maxMessages}`);
    const ids = (list.messages || []).map((m: any) => m.id);
    if (!ids.length) return json({ ok: true, checked: 0, imported: 0, skipped: 0 });

    // Skip anything already seen. Doing this in one query rather than per
    // message keeps the function well inside its time budget.
    const { data: seenRows } = await db.from("gmail_intake_log").select("message_id").in("message_id", ids);
    const seen = new Set((seenRows || []).map((r: any) => r.message_id));

    let imported = 0, skipped = 0;
    const failures: string[] = [];

    for (const id of ids) {
      if (seen.has(id)) { skipped++; continue; }
      try {
        const msg = await gmail(token, `messages/${id}?format=full`);
        const headers = Object.fromEntries(
          (msg.payload?.headers || []).map((h: any) => [String(h.name).toLowerCase(), h.value]));
        const from = headers.from || "";
        const subject = headers.subject || "(no subject)";

        const parts = collectParts(msg.payload).filter(p => OK_TYPES[p.mimeType]);
        if (!parts.length) {
          // Log it as seen anyway — otherwise a newsletter with a .docx gets
          // re-examined on every single run, forever.
          await db.from("gmail_intake_log").insert({
            message_id: id, sender: from, subject, attachments: 0,
            note: "no readable attachment",
          });
          skipped++;
          continue;
        }

        let madeForThisMessage = 0;
        for (const part of parts) {
          const att = await gmail(token, `messages/${id}/attachments/${part.body.attachmentId}`);
          const bytes = b64urlToBytes(att.data);
          const ext = OK_TYPES[part.mimeType];
          const path = `email/${id}-${madeForThisMessage}.${ext}`;

          const { error: upErr } = await db.storage.from("invoices")
            .upload(path, bytes, { contentType: part.mimeType, upsert: true });
          if (upErr) throw new Error(`storage: ${upErr.message}`);

          const invoiceId = crypto.randomUUID();
          const { error: insErr } = await db.from("invoices").insert({
            id: invoiceId,
            entity: "brand-distribution",
            image_path: path,
            status: "queued",
            source: "email",
            source_ref: id,
            source_sender: from,
            source_subject: subject,
          });
          if (insErr) throw new Error(`invoice row: ${insErr.message}`);

          // Fire the extractor. Deliberately not awaited to completion: one
          // large PDF taking two minutes shouldn't hold up the batch, and the
          // extractor records its own success or failure on the row.
          fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/INVOICE_EXTRACT_V1`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-sync-secret": Deno.env.get("SYNC_SHARED_SECRET") ?? "",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ invoice_id: invoiceId }),
          }).catch(() => { /* the row stays 'queued' and can be retried */ });

          madeForThisMessage++;
        }

        await db.from("gmail_intake_log").insert({
          message_id: id, sender: from, subject, attachments: madeForThisMessage,
        });
        imported += madeForThisMessage;
      } catch (e) {
        failures.push(`${id}: ${String(e).slice(0, 160)}`);
        // Not logged as seen — a transient failure should be retried next run.
      }
    }

    await db.from("integration_status").upsert({
      id: "gmail", connected: true, last_run_at: new Date().toISOString(),
      last_result: `${imported} imported, ${skipped} skipped${failures.length ? `, ${failures.length} failed` : ""}`,
      last_error: failures.length ? failures[0].slice(0, 300) : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

    return json({ ok: true, checked: ids.length, imported, skipped, failures });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});
// GMAIL_INTAKE_V2
