# Chocoberry Dashboard — Session Handover (9 June 2026)

This document hands over the state of work for the **Chocoberry / Create Brands operations dashboard**
after a long session focused on **building a complete Web Push notification system + branding**.
Read this first in the next chat.

---

## 0. PROJECT BASICS (carry-forward)

- **Repo (local):** `C:\dev\create-brands-dashboard\create-brands-dashboard`
- **GitHub:** github.com/CreateBrands/create-brands-dashboard (branch `main`)
- **Production:** create-brands-dashboard.vercel.app (Vercel, Hobby plan — **one concurrent build**)
- **Stack:** React CRA. `src/App.js` is a monolith (~1.39 MB). `src/supabase.js` (~214 KB) holds all DB/Edge-function helpers.
- **Supabase project ID:** `qtjsdbasoouslcpinqhu` (PRO)
- **User (Atif):** Windows CMD, one command per line, pastes whole files. Downloads dir `C:\Users\conta\Downloads`. Email `atifrazzaqfast@gmail.com`. Brief/direct; wants work done now, even late.

### Deploy discipline (FOLLOW EXACTLY)
1. Claude outputs full files to `/mnt/user-data/outputs/` with **distinct filenames** + states the **byte count**.
2. User `copy /Y "C:\Users\conta\Downloads\<file>" src\App.js` (or supabase.js).
3. Verify bytes: `for %F in (src\App.js) do @echo %~zF bytes` — must match.
4. `git status` must say **modified** (if "working tree clean", the copy didn't land — the Downloads `(1)` trap).
5. `git add ... && git commit -m "..." && git push` → Vercel auto-builds (runs ESLint; catches no-undef/no-unused).
6. **`git` must be run from the repo dir** (`cd C:\dev\create-brands-dashboard\create-brands-dashboard` first), else "not a git repository".

### Validation Claude does before staging (container resets each session)
- `npm i @babel/parser` then `node -e "require('@babel/parser').parse(fs.readFileSync('App.js','utf8'),{sourceType:'module',plugins:['jsx']})"` → PARSE OK.
- `grep -c 'React\.use' App.js` must be **0** (bare hook imports only).
- A distinct findstr/grep marker per change; verify import counts before staging.

### Known gotchas (HARD-WON — don't repeat)
- **Downloads `(1)` trap:** re-downloading saves `App_X (1).js`; copying the OLD file = "working tree clean". Use fresh distinct filenames, confirm `git status` says modified.
- **Working-copy drift:** Claude's `/home/claude/work4/*.js` can reset/diverge between turns. ALWAYS restore from the latest known-good `/mnt/user-data/outputs/` file before editing, and confirm which base (grep for expected markers) before applying edits. This session we twice edited a stale base and had to redo.
- **str_replace wrong file / non-unique anchor:** anchor only on grep-confirmed-unique strings; confirm which working file.
- New Supabase tables come up **RLS-enabled** → app (anon key) reads zero → must `ALTER TABLE x DISABLE ROW LEVEL SECURITY`.
- Edge Function secrets only take effect on **redeploy** (cold start).
- BST/UTC off-by-one: local-midnight vs `toISOString()`. Use local date formatter for date strings; `AT TIME ZONE 'Europe/London'` in SQL.

---

## 1. WHAT WAS BUILT THIS SESSION (all DEPLOYED & working unless noted)

Earlier in the session (before the big push project): Add-Manual-Hours store dropdown (brand removed, store-only, derives brandId); Time & Attendance **Day/Week toggle**, **approval tabs** (All / Needs approval / Approved — open shifts are "active", never "Approved"); **live wages everywhere** (Dashboard rollup + labour drill + T&A tiles count in-progress shifts = elapsed × rate, 60s ticks); fixed 36 invisible buttons (`text-slate-700` on `bg-slate-800` → `text-slate-300`); staff notifications for **chat messages** + **schedule published** (DM `toPersonId` bug fixed — threads are type `user`/`ops`, not `dm`); in-app **chime** + OS notification on new unread (poll 25s).

### THE MAIN WORK: Web Push notification system (now fully working)

**Goal:** staff get push notifications (chat, schedule, tasks) even when the app is closed, on iPhone + Android.

**Final working architecture:**
1. Any notification row inserted into `notifications` table →
2. **Database trigger `push_on_notification`** (AFTER INSERT) fires →
3. calls Edge Function **`notify-push-webhook`** (server-side) →
4. which looks up the recipient's rows in `push_subscriptions` and sends Web Push (signed with VAPID) →
5. the **service worker `sw.js`** receives the push event and shows the notification on the device.

This is **server-side and reliable** — does NOT depend on the sender's browser. Dead subscriptions auto-prune (404/410).

---

## 2. CURRENT DEPLOYED STATE — what is LIVE right now

### Git / Vercel (frontend)
Latest deployed code as of end of session:
- **App.js** = `App_TESTDEBUG` version (1387311 bytes) — has the test button WITH a temporary on-screen debug line.
- **supabase.js** = `supabase_TESTDEBUG` version (214385 bytes).

> **⚠️ PENDING DEPLOY (staged, not yet pushed by user):** the **debug-cleanup** versions:
> - `App_CLEAN2_20260609.js` (**1386895** bytes)
> - `supabase_CLEAN2_20260609.js` (**214237** bytes)
> These remove the temporary grey `id=... sent=...` debug line under the test button. **First action in next chat: confirm the user deployed these.** Commit msg: `cleanup: remove temporary test-button debug line`.

### Supabase Edge Functions (deployed separately from git)
- **`send-push`** (JWT OFF) — manual/test sends, browser-invoked by the test button.
  - LIVE version must be **`send-push_fn_cors_20260609.ts`** (has CORS headers + OPTIONS preflight — this was the final fix that made the test button work). If unsure, redeploy that file.
  - Accepts optional `endpoint` param to target one device (currently unused by the button — see §3).
- **`notify-push-webhook`** (JWT OFF) — `notify-push-webhook_fn_20260609.ts`. Called by the DB trigger on every notification INSERT. Reads `payload.record`, sends push to that recipient's subscriptions. **This is the one that fires automatically.**
- Old/legacy (can be deleted): earlier `send-push` versions v1–v5 + `send-push_fn_clean`/`endpoint`. The npm `web-push` library does **NOT** work on Deno Edge (WORKER_ERROR) — we use **`jsr:@negrel/webpush@0.5`** (Web Crypto based).

### Supabase secrets (on the Edge Functions)
- `VAPID_JSON` = (the negrel-library JWK pair — set, length 420) — **the active key**.
- `VAPID_SUBJECT` = `mailto:atifrazzaqfast@gmail.com`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto-provided).
- **Unused (can delete):** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (the original npm web-push keys — superseded).

**Active VAPID public key** (in Vercel env `REACT_APP_VAPID_PUBLIC_KEY`):
`BC2LHyaAaAQ5GVEvXkG3W8xVgtNQ_oEYwS8FqFt9WTl0HvmdJkYrUxhSy6h7GiH7OAx63REs9yGhU-AA-NEQSvY`
(matching VAPID_JSON private d=`4OWZr6zWGgoe-dZJF2ZULOC-bpbUUr_vd2JHzMlTtOU`). If keys ever need regenerating, the function had a `?generate=1` route in dev versions — but the **current clean/cors function does NOT** (removed for security). To rotate: regenerate, set VAPID_JSON + Vercel public key, then **delete all push_subscriptions and have devices re-subscribe** (mismatched keys = 403).

### Supabase tables (RLS DISABLED on all)
- **`push_subscriptions`** — `id, recipient_type ('user'|'ops'), recipient_id, endpoint (UNIQUE), p256dh, auth, user_agent, created_at`. SQL: `push_subscriptions_schema_20260609.sql`.
- **`notifications`** (pre-existing) — `recipient_type, recipient_id, kind, title, body, link_view, read_at, created_at`.

### Supabase trigger (wired via SQL, equivalent to the dashboard "Database Webhooks" entry `push_on_notification`)
```sql
CREATE TRIGGER push_on_notification
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://qtjsdbasoouslcpinqhu.supabase.co/functions/v1/notify-push-webhook',
  'POST', '{"Content-Type":"application/json"}', '{}', '5000');
```
Verified working: `INSERT INTO notifications(...)` → `net._http_response` shows `200 {"ok":true,"sent":1,...}`.

### Service worker + PWA (in repo `public/`)
- **`public/sw.js`** (latest = `sw.js` in outputs) — push handler uses `self.registration.showNotification` with `icon:/logo192.png`, `badge:/badge-96.png`, vibrate, notificationclick → focus/open at linkView.
- **`public/manifest.json`** (= `manifest_20260609.json`) — name "Chocoberry Dashboard", start_url `/`, display standalone, navy theme, maskable icons. (Also `manifest-kiosk.json` for /kiosk.)
- **`public/index.html`** (= `index_20260609.html`) — **added the missing `<link rel="manifest">`** (was absent → Android wouldn't offer Install), title "Chocoberry Dashboard", navy theme-color, kiosk-swap script preserved.
- **Icons (in `public/`):** `logo192.png`, `logo512.png`, `favicon.ico`, `apple-touch-icon.png` = navy roundel + cream Chocoberry logo. `badge-96.png` = monochrome script-"c" for Android status bar. (Generated from user's logo `WhatsApp_Image_2026-06-09_at_22_40_04.jpeg`.)

### supabase.js push helpers (current)
- `subscribeToPush({recipientType, recipientId})` — registers `/sw.js` with `{updateViaCache:"none"}` + `reg.update()` + **controllerchange auto-reload** (so stale SW self-heals), creates PushSubscription with VAPID public key, upserts to push_subscriptions. Returns `{ok, endpoint}` or `{ok:false, reason}`.
- `sendPush({...})` — manual invoke of `send-push` (kept as fallback; NOT auto-called anymore).
- `sendTestNotification({recipientType, recipientId})` — subscribes this device, then invokes `send-push` to the recipient (reliable; no fragile endpoint match). Used by the bell's test button.
- `insertNotifications(rows)` — inserts rows; **no longer calls sendPush** (the DB trigger handles push server-side now — WEB_PUSH_V2).
- `notifyMessageRecipients`, `notifyOpsMembers`, `notifyManagers`, `notifyOpsMember` — create notification rows for events.

### App.js bell (`NotificationBell`)
- Polls every 25s; on new unread: `playDing()` (loud 3-note triangle chime) + visibility-gated visual (in-app **toast** when focused, `showOSNotification` via SW when hidden).
- `showOSNotification` uses **`reg.showNotification`** (the page-level `new Notification()` throws "Illegal constructor" on Android Chrome).
- **"Send me a test notification"** button in the bell footer → `handleSendTest` → `sendTestNotification`. Feedback states: sending / "✓ Test sent" / "⚠ Allow notifications…" / "⚠ Couldn't send".
- Employee/trainee bells use `recipientType="ops" recipientId={opsTeamMemberId||id}`; sidebar uses `"user"`.

---

## 3. HOW PUSH BEHAVES (important for future debugging)

- **A notification to a person reaches ALL their subscribed devices.** This is correct/desired. During testing, multiple test phones were logged into the **same account**, so a test "went to all phones" — that was just test setup, not a bug. (User confirmed this is acceptable.)
- **iPhone:** push ONLY works if the app is **Added to Home Screen** (iOS 16.4+) and opened from the icon. A Safari **tab** subscription accepts the push (`sent:1`) but **will not display**. This caused hours of confusion. Endpoints: iPhone = `web.push.apple.com`, Android/Chrome = `fcm.googleapis.com`.
- **Samsung / One UI:** aggressive battery "sleeping apps" can suppress background push. Set Chrome/PWA to Unrestricted. Also a **stale service worker** (old cached SW with no/old push handler) silently breaks display — fix by clearing site data / reinstalling; the controllerchange auto-reload now mitigates this going forward.
- **The #1 recurring debugging trap: device/id mismatch.** With many subscriptions across accounts/devices, tests kept targeting the wrong `recipient_id`. RELIABLE METHOD: `DELETE FROM push_subscriptions;` → re-subscribe ONE device → it's the only row → test against THAT exact id, watching THAT device.
- **`functions.invoke` (browser) vs `net.http_post` (SQL) differ:** the browser path enforces **CORS**. The `send-push` function MUST return CORS headers + handle OPTIONS preflight (done in `send-push_fn_cors`), or the test button fails with "failed to send request to edge function" while SQL tests still work.

### Diagnostic recipes
- See subscriptions: `SELECT recipient_type, recipient_id, left(endpoint,30), created_at FROM push_subscriptions ORDER BY created_at DESC;`
- Test push directly (server-side, bypasses browser/CORS):
```sql
SELECT net.http_post(
  url := 'https://qtjsdbasoouslcpinqhu.supabase.co/functions/v1/send-push',
  headers := jsonb_build_object('Content-Type','application/json'),
  body := jsonb_build_object('recipientType','ops','recipientId','<ID>','title','Test','body','x'));
-- then:
SELECT id, status_code, content FROM net._http_response ORDER BY id DESC LIMIT 1;
```
  `{"ok":true,"sent":1}` = sent (then device display is separate). `total:0` = wrong/no subscription for that id.
- Test the auto-pipeline (trigger → webhook): `INSERT INTO notifications(recipient_type,recipient_id,kind,title,body) VALUES('ops','<ID>','message','Test','x');` then check `net._http_response`.

---

## 4. PENDING / NEXT STEPS

1. **[FIRST] Confirm debug cleanup deployed.** Staged: `App_CLEAN2_20260609.js` (1386895) + `supabase_CLEAN2_20260609.js` (214237). If user hasn't pushed them, do that (removes the on-screen test-button debug line). The live `send-push` function (cors version) is fine and unaffected.
2. **[OPTIONAL CLEANUP]** Delete unused `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` secrets. Optionally delete legacy `send-push` function versions. Keep `send-push` (cors) + `notify-push-webhook`.
3. **[ROLLOUT]** Staff guide created: `Chocoberry_Notifications_Staff_Guide.docx`. Before sharing, replace placeholder "your dashboard link" with `create-brands-dashboard.vercel.app`. Ensure each staff member logs into their OWN account (so they only get their own notifications).
4. **[KNOWN-OPEN] Samsung Fold 6 specifically** — got it working after clean re-subscribe, but One UI battery suppression may recur for some staff. Mitigations documented (battery Unrestricted, reinstall to clear stale SW).
5. **[CONSIDERED, NOT BUILT] WhatsApp notifications** — user asked; researched. Requires WhatsApp Business Cloud API + a BSP (Twilio/360dialog/Wati) + Meta-approved **utility** templates (~<1p/msg UK) + staff phone numbers/consent. Would hook into `insertNotifications` the same way as push (channel-agnostic). Not started — revisit if push reliability on some devices stays poor.

### Older pending items from prior sessions (still open)
- Farsam Bano / Manpreet Kaur: no `hourly_rate` on punch records → gross not calculating. Check rate flow from profile.
- Stage 2: point Performance (TacticalOpsView) + Chain Performance at the same gross-sales + live-punch-labour model as the Dashboard.
- COGS module → unlocks Prime Cost / Net Margin (currently "Pending COGS").
- Connect 2nd Google account for 5 unmapped stores (cafe-leyton/colindale/derby/leicester/whitechapel).
- Tailwind via CDN warning (cosmetic, "should not be used in production").

---

## 5. KEY OUTPUT FILES (latest of each — in /mnt/user-data/outputs/)

**Frontend (deploy to repo):**
- `App_CLEAN2_20260609.js` (1386895) — latest App.js (debug removed). ← deploy this
- `supabase_CLEAN2_20260609.js` (214237) — latest supabase.js. ← deploy this
- `index_20260609.html`, `manifest_20260609.json`, `sw.js` → `public/`
- Icons → `public/`: `logo192.png`, `logo512.png`, `favicon.ico`, `apple-touch-icon.png`, `badge-96.png`

**Edge Functions (deploy in Supabase):**
- `send-push_fn_cors_20260609.ts` → function slug `send-push` (LIVE/correct version)
- `notify-push-webhook_fn_20260609.ts` → function slug `notify-push-webhook`

**SQL (run in Supabase):**
- `push_subscriptions_schema_20260609.sql` (table — already applied)
- Trigger `push_on_notification` — already applied (see §2)

**Deliverable:**
- `Chocoberry_Notifications_Staff_Guide.docx` — staff rollout one-pager

**Reference (older checkpoints / superseded — don't deploy):** App_TESTDEBUG, supabase_TESTDEBUG (currently live but to be replaced by CLEAN2), App_TESTBTN/2/3, supabase_TESTBTN/2/3, App_WEBPUSH, supabase_WEBPUSH, App_NOTIFY_RING, App_TOAST, App_NOTIFVIS, App_NOTIFFIX, App_PUSHDEBUG, supabase_PUSHDEBUG/SWUPDATE/WEBHOOK/CLEAN, send-push_fn v1–v5/clean/endpoint, App_DMFIX.

---

## 6. STYLE / PROCESS NOTES FOR NEXT CLAUDE

- User is mid-build owner-operator; wants results fast, even very late. Be concise and direct.
- This is `claude.ai` web chat — Claude outputs files to `/mnt/user-data/outputs/`; user copies them into the repo and deploys. Claude cannot see `public/` or run the user's git/Vercel/Supabase.
- When debugging device-side push, **don't guess repeatedly** — use the clean-single-subscription method and read the actual `sent`/`total` and the device. Many "it doesn't work" turns were id mismatches or stale caches, not code.
- Always reconcile working copies against the latest `/mnt/user-data/outputs/` file at session start (drift is real).
- Verify byte counts and `git status` modified; one change at a time; bare React hooks; no `React.use`.
