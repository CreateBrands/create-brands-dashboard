// ============================================================
// EDGE FUNCTION: gmail-connect  (marker: GMAIL_CONNECT_V1)
// The OAuth dance, so nobody has to do it with curl.
//
//   action "status"     → is Gmail connected, and as whom
//   action "authUrl"    → the Google consent URL to send the user to
//   action "exchange"   → swap the returned code for a refresh token and store it
//   action "disconnect" → forget the token
//
// The refresh token is written to `integration_tokens`, which has RLS enabled
// and NO policy — only the service_role can read it. The browser never sees it.
// That matters more than usual here: this app runs as anon with the key in its
// JS bundle, so anything the browser can read is effectively public.
//
// Deploy: dashboard editor paste-over · Verify JWT OFF
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SYNC_SHARED_SECRET
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const db = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    if (req.headers.get("x-sync-secret") !== (Deno.env.get("SYNC_SHARED_SECRET") ?? "_unset_")) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    const body = await req.json().catch(() => ({}));
    const sb = db();

    if (body.action === "status") {
      const { data } = await sb.from("integration_tokens")
        .select("account_email, connected_at, connected_by, last_error").eq("id", "gmail").maybeSingle();
      return json({ ok: true, connected: !!data, ...(data || {}) });
    }

    if (body.action === "authUrl") {
      const { clientId, redirectUri } = body;
      if (!clientId || !redirectUri) return json({ ok: false, error: "clientId and redirectUri are required" }, 400);
      // access_type=offline AND prompt=consent are both required for Google to
      // return a refresh token. Without either you get a one-hour access token
      // and no way to renew it — the single most common setup mistake here.
      const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPE,
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
      });
      return json({ ok: true, url });
    }

    if (body.action === "exchange") {
      const { code, clientId, clientSecret, redirectUri, connectedBy } = body;
      if (!code || !clientId || !clientSecret || !redirectUri) {
        return json({ ok: false, error: "code, clientId, clientSecret and redirectUri are required" }, 400);
      }
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code, client_id: clientId, client_secret: clientSecret,
          redirect_uri: redirectUri, grant_type: "authorization_code",
        }),
      });
      const tok = await r.json();
      if (!tok.refresh_token) {
        // Google omits the refresh token when the account has already granted
        // consent and prompt=consent wasn't forced. Say so, rather than
        // storing a token that dies in an hour.
        return json({
          ok: false,
          error: tok.error_description || tok.error
            || "Google didn't return a refresh token. Remove this app at myaccount.google.com/permissions and connect again.",
        }, 400);
      }

      // Confirm the token works and find out which mailbox it belongs to —
      // connecting the wrong account is easy and otherwise invisible.
      let email = null;
      try {
        const prof = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
          headers: { Authorization: `Bearer ${tok.access_token}` },
        }).then(x => x.json());
        email = prof.emailAddress ?? null;
      } catch { /* non-fatal */ }

      await sb.from("integration_tokens").upsert({
        id: "gmail",
        refresh_token: tok.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
        account_email: email,
        scopes: SCOPE,
        connected_at: new Date().toISOString(),
        connected_by: connectedBy || null,
        last_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

      await sb.from("integration_status").upsert({
        id: "gmail", connected: true, account_email: email,
        connected_at: new Date().toISOString(), last_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

      return json({ ok: true, account_email: email });
    }

    if (body.action === "disconnect") {
      await sb.from("integration_tokens").delete().eq("id", "gmail");
      await sb.from("integration_status").upsert({
        id: "gmail", connected: false, account_email: null,
        connected_at: null, updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      return json({ ok: true });
    }

    return json({ ok: false, error: `unknown action "${body.action}"` }, 400);
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});
// GMAIL_CONNECT_V1
