# Chocoberry Dashboard — Session Handoff

**Last updated**: 2026-05-30 (evening, post contracts (e-sign + stage-1 templates))
**Project**: create-brands-dashboard
**Repo**: github.com/CreateBrands/create-brands-dashboard
**Supabase project**: qtjsdbasoouslcpinqhu (PRODUCTION — building directly against prod, no staging)
**Production URL**: create-brands-dashboard.vercel.app
**Owner**: Atif Razzaq, atifrazzaqfast@gmail.com
**Local repo path**: `C:\dev\create-brands-dashboard\create-brands-dashboard` (DOUBLED folder is real)

---

## ⚠️ ENVIRONMENT — read before any work
- Repo at `C:\dev\create-brands-dashboard\create-brands-dashboard` (nested one level — `git rev-parse --show-toplevel` → `C:/dev/create-brands-dashboard`).
- Vercel **Root Directory = `create-brands-dashboard`** (Settings → Build & Deployment); "Include files outside root" ON. Keep set while doubled structure exists.
- Old `C:\Users\conta` repo is GONE (stray .git removed). Never run git from home folder.
- **No staging. Every SQL change hits production directly.** Watch for real errors per statement; verify objects exist after DDL.
- App.js is now **~1.0 MB / ~18,200 lines**; supabase.js **~140 KB / ~2,920 lines**.

---

## 🪤 GOTCHAS (all learned the hard way; several bit us TODAY)

### Downloads-folder trap
~30 `App*.js` files in Downloads. Newest = highest number / latest timestamp, NOT the unnumbered one. Build files get DISTINCT names. Sort by date.

### Copy can silently fail
`copy` says "file not found" if the download isn't finished or the name differs (a `(1)` suffix). Happened repeatedly today. If a copy fails: `dir "C:\Users\conta\Downloads\<name>*.js"` to find the real file/size, re-download if missing, THEN copy. Always re-run size+findstr checks after.

### Two-checkpoint rule before every commit
```
for %F in (src\App.js) do @echo %~zF bytes      :: must match expected
findstr /c:"<marker>" src\App.js                 :: must return the line
```
Huge negative git diff = wrong file copied.

### ⚠️ pg_notify success ≠ DDL succeeded (BIT US TWICE TODAY)
A multi-statement SQL script can have its CREATE TABLE / ALTER silently skip while the trailing `pg_notify`/`NOTIFY` still returns a row. `training_templates` "succeeded" but didn't exist; only found when a save failed. **After ANY CREATE/ALTER, verify with `SELECT <newcol> FROM <table> LIMIT 1;`** (expect success/rows, NOT "relation/column does not exist"). Re-run the bare statement if it didn't take.

### ⚠️ Hidden CHECK constraints (BIT US TODAY)
`employee_documents.doc_type` has a CHECK constraint allowing only `rtw_passport/rtw_brp/rtw_share_code/rtw_visa/rtw_other`. Writing any other value (e.g. a slot key) → "violates check constraint employee_documents_doc_type_check". There may be other such constraints not visible from code. When inserting into an existing table, reuse values the existing UI already inserts successfully, or check the constraint first.

### Rules-of-hooks (build-failing; parse won't catch)
A hook after an early `return` fails the Vercel build. All hooks before any conditional return. Validate with eslint-plugin-react-hooks at `/home/claude/eslintcheck` (and babel parse at `/home/claude/check.js`) before pushing.

### Field-by-field save objects drop fields (BIT US TODAY)
The training module `handleSave` rebuilt its payload field-by-field and silently dropped `type` (always saved "onboarding"). When a handler reconstructs an object for a helper, make sure EVERY field is carried. Prefer spreads where safe.

---

## ✅ SHIPPED + VERIFIED THIS SESSION

### Trainee portal (journey: applied → reviewing → hired → Training → Employee)
- A trainee = a HIRED employee with `ops_team.is_trainee = true`. "Training" is an employee state, not an application status. "Convert to full staff" clears the flag.
- `ops_team.is_trainee boolean NOT NULL DEFAULT false` (separate column: `role` is JOB TITLE string e.g. "Barista", not a permission level; `status` is lifecycle).
- New hires default to trainee. FIXED: two hire row-creation paths (modal payload keyed on `isHireFlow`; inline `hireApplication` else-branch in supabase.js) — both now set `isTrainee:true`.
- PIN set at hire = trainee login. Trainee login = FULL TAKEOVER → `TraineePortal` only (no sidebar/employee shell). Profile shows "🎓 Trainee" badge + "Convert to full staff".

### Training content layer (manager authoring) — `TrainingAdminView`, "Training" sidebar item (PEOPLE group)
- **training_modules** (per-store, store_id NOT NULL): title, description, category, content (Markdown), required, sort_order, source_template_id, type, archived_at.
- **training_progress**: (employee_id, module_id) UNIQUE; completed_at (trainee tick) + verified_at/verified_by_* (manager). Helpers read-modify-write so the two states don't clobber.
- **training_templates**: reusable blueprints (no store_id, has type). Any manager authors. `instantiateTemplate` copies a template into a NEW independent store module (source_template_id provenance, NO propagation = copy-and-own).
- **type** field on modules+templates: `onboarding` (trainees see) vs `training` (general library, all staff). CHECK constraint NOT VALID. Existing backfilled to onboarding.
- Two tabs: Store modules / Templates. Shared editor `TrainingModuleEditor` (isTemplate prop) with type picker.

### Trainee consumption (`TraineePortal` body) + staff library
- **SafeMarkdown** renderer (hand-rolled, no dependency, no XSS — no markdown lib in package.json). Headings, bold, italic, links, lists, inline code, images.
- Trainee sees ONLY `type==='onboarding'` modules, grouped by category, tick-to-complete, progress bar (counts onboarding-required only), + RTW docs via reused `DocumentsTab`.
- **StaffTrainingView**: "Training" item in EmployeeShell nav; existing staff browse ALL store modules (both types), read-only, grouped by category, expandable Markdown.

### Onboarding documents — TWO-STAGE approval + required slots (the big build)
- **employee_documents** extended (Step 1 + two-stage + slots), all verified to exist:
  - `status` (pending/accepted/rejected) — legacy single-stage, kept in sync for back-compat.
  - `review_stage` (pending / manager_approved / hr_approved / rejected) — SOURCE OF TRUTH.
  - manager_approved_by_id/_name/_at; hr_approved_by_id/_name/_at; rejected_by_id/_name/_at; rejected_stage ('manager'|'hr'); rejection_reason.
  - `required_doc_key` (slot key) + idx_employee_documents_slot.
- **Workflow**: Pending → Manager-approved → HR-approved (final). Manager = manager/hq_staff/owner; HR = hq_staff/owner. Reject at either stage → back to trainee (re-upload restarts at pending).
- **Required slots** (fixed, `REQUIRED_DOC_SLOTS` in App.js): Passport, Share code, Proof of address, NI number (trainee-uploadable); **Right to work (managerOnly)**. Each slot maps to a constraint-valid `doc_type` (slot identity is in `required_doc_key`, NOT doc_type). "X/5 approved" gates on all required = hr_approved.
- **ANY manager upload auto-passes stage 1** → manager_approved (still needs HR). Trainee upload → pending.
- **RTW privacy**: trainee NEVER sees the RTW document/detail/View — only "Handled by your manager". Managers/HR see it fully.
- **Versioning**: re-upload into a slot archives the prior current version (kept as history) and inserts new — slot = single trace.
- **Other documents**: un-keyed uploads (incl. legacy test docs) show in a separate section.
- supabase helpers: `managerApproveDocument`, `hrApproveDocument`, `rejectDocument(id,stage,reviewer,reason)`, `resetDocumentReview`, `_updateDocAndReturn`. `addEmployeeDocument` extended with requiredDocKey/reviewStage/managerApprovedBy + supersede. OLD `setDocumentStatus` REMOVED.
- App components: `DocumentsTab` rebuilt as slot checklist (shared by manager profile + trainee portal, signature `{employeeId, currentUser}`); `DocRejectPrompt`; `DocUploadForm` (now takes `fixedLabel` to hide doc-type picker for slot uploads); helpers `REQUIRED_DOC_SLOTS`, `getSlotLabel`, `docStageMeta`.

### Onboarding documents — STEP 3: comment threads + version history
- **document_comments** table: per-document back-and-forth thread. Anyone with visibility posts (trainee on own docs + any manager/HR). `read_by` array tracks unread (same pattern as inbox_messages); a comment is unread for a viewer if their id isn't in read_by. In-app only — EMAIL DEFERRED (needs Resend).
- supabase helpers: `fetchDocumentComments`, `addDocumentComment`, `markDocumentCommentRead`. Mapper `dbDocumentCommentToApp`.
- UI: collapsible "Comments (n)" per document in `DocCommentThread` with unread badge ("n new"); opening a thread marks its comments read. RTW thread IS visible to trainee (only the RTW *document* is hidden, not its thread — deliberate, so manager can message re: the check).
- **Version history**: re-upload archives the prior version (file kept in storage, never destroyed) and inserts new. Re-uploading an APPROVED slot resets it to needs-review (intended). `fetchArchivedDocuments` returns superseded versions; "Previous versions (n)" expander per slot shows them with View links — MANAGERS/HR ONLY (trainees don't see history).

---

## SCHEMA OBJECTS ADDED THIS SESSION (all on PRODUCTION, all verified)
1. `ops_team.is_trainee`
2. `training_modules` (+ content, + source_template_id, + type)
3. `training_progress`
4. `training_templates` (+ type)
5. `employee_documents.status` + reviewed_by_* + reviewed_at + rejection_reason (Step 1)
6. `employee_documents.review_stage` + manager_approved_* + hr_approved_* + rejected_* (two-stage)
7. `employee_documents.required_doc_key` + idx_employee_documents_slot
8. `document_comments` table (per-document comment threads; read_by array for unread)
9. `employee_documents` signature cols: signed_by_id, signed_by_name, signature_statement, signed_ip (signed_at already existed) — for contract e-sign
10. `employee_documents_stage_chk` constraint widened to allow 'signed'
11. `contract_templates` table (web contract templates — stage 1)
12. `employee_contracts` table (sent+signed web contracts; filled_body = frozen snapshot)
13. ops_team: tax_starter_statement, has_p45, student_loan, tax_completed_at (HMRC tax)
14. ops_team: bank_account_name, bank_sort_code, bank_account_no, bank_provided_at + bank_declared_by_name, bank_declaration, bank_declared_at (employee self-submits + declaration; HR/owner or own-record view)
15. `policy_acknowledgements` table (employee+policy, upsert, audit)
16. ops_team.role_ids text[] (multiple job roles; role_id mirrors role_ids[0])
17. `advertised_roles` table (managed advert titles for hiring; separate from store roles)
18. ops_team: ni_number, selffill_token (unique idx), selffill_completed_at (self-fill link)
19. ops_team: gender (added with self-fill); pin now also employee-settable via self-fill
20. Postgres FUNCTIONS (server_aggregation.sql): agg_flipdish_sales, agg_flipdish_items, agg_flipdish_heatmap, agg_flipdish_last_sale (Chain Performance reads via these RPCs, not raw rows)
21. INDEX idx_flipdish_sales_brand_saletime (brand_id, sale_time DESC) — makes agg_flipdish_last_sale instant (was 10.5s)
22. Edge Function flipdish-rms-sync REWRITTEN: auto-chunk max 2 days/call + resumeFrom + hardened error handling (NOT in repo — lives in Supabase; source saved as flipdish-rms-sync.ts)
SQL files in outputs: training_step3_is_trainee, training_step1_modules, training_stepA_content_progress, training_templates, training_module_type, docs_step1_review_state, docs_two_stage_approval, docs_step2_slots, docs_step3_comments.

---

## 🔜 NOT BUILT — next-session work

### ONBOARDING COMPLETENESS — ALL FOUR BUILT + VERIFIED (this session)
Reviewed onboarding vs UK standard; built the four prioritised gaps. All deployed + tested in prod.
1. **HMRC tax starter checklist** — DONE. Statement A/B/C + P45 flag + student-loan flag. Manager side on profile → new "Onboarding" tab; employee self-service in portal (EmployeeOnboardingSection). Fields on ops_team: tax_starter_statement / has_p45 / student_loan / tax_completed_at.
2. **Policy/allergen acknowledgements** — DONE. ONBOARDING_POLICIES = handbook, allergen (food-safety), health_safety, gdpr. Employee ticks "I have read this" in portal; manager can record in-person. Table policy_acknowledgements (upsert on employee_id+policy_key). Helpers fetchPolicyAcknowledgements / acknowledgePolicy.
3. **Bank details** — DONE, option (A). Stored on ops_team (bank_account_name/sort_code/account_no/provided_at + declaration audit: bank_declared_by_name/bank_declaration/bank_declared_at). EMPLOYEE SELF-SUBMITS their own bank details in their portal/shell onboarding section + must tick accuracy declaration ("I confirm these bank details are correct and authorise payment of my wages to this account") before submit — recorded with name+timestamp. Employee sees only their own (masked to last-4 after submit: "ending 5678"); can update (re-declares). OWNER/HR view full numbers + the declaration on profile → Onboarding → Bank details → View/edit. Managers see only "provided/not provided", never numbers. Access gate: isHqOrOwner OR own record. ⚠️ App-level protection only — NOT encrypted; numbers in DB plaintext, relies on DB access control. User accepted trade-off. Upgrade path = encryption/RLS. NOTE (debugging lesson): a Supabase .update().eq() that matches zero rows / is RLS-blocked returns success with no error — so "saved" UI can be phantom. When a write seems lost, verify in DB directly (SELECT) before changing code. In this case the data WAS saving correctly; the apparent bug was just checking a different employee's record (sakshi vs atif).
4. **Onboarding-complete gate** — DONE. Computed (no column) at top of Onboarding tab: 5 checks (docs hr_approved + contract signed + tax done + bank provided + all policies acked) → "✓ Onboarding complete". Components: OnboardingTab (manager/HR), EmployeeOnboardingSection (employee self-service tax + policies, NO bank). SQL: onboarding_completeness.sql.

### Other open
- **Email notifications** for document comments (needs Resend infra: account, API key, domain verification, send logic). In-app unread badge already works.
- **Storage hardening (flagged)**: `applicant-photos` bucket is PUBLIC with broad SELECT, now holds passports/NI/signed contracts. DON'T just remove the SELECT policy — app reads files via public URLs (View links, image rendering) so removing it breaks viewing. Needs proper review (signed URLs / scoped policies). Related: bank details would benefit from encryption/RLS as a future hardening.
- **Enable editor's PDF-guide link** (tiny): host Training_Content_Authoring_Guide.pdf, paste URL into `const TRAINING_GUIDE_PDF_URL = ""`.
- Albin Tamang (and possibly others) has NO store assigned → "No stores assigned" empty state in employee shell. Fix on Job & Pay tab. Minor data cleanup.
- Category defined list (minor); "Insert image row" button (minor).

### DONE this session (Flipdish: sync recovery + server-side aggregation) — verified in prod
- **SYNC-SAFETY NET (token can't be auto-refreshed — login has hCaptcha + SMS 2FA, confirmed via screenshots; so manual refresh is unavoidable, goal is making it rare/painless):**
  - **Stale-data alarm** (App, deployed): red banner on Chain Performance when no new sale in >30h (signature of token expiry / dead sync). Inline "latest sale" indicator goes amber >18h, red >30h. 30h tolerates a normal quiet overnight so no false alarms. Turns silent failure into same-day visible. (App_SYNC_ALARM.js → now folded into latest.)
  - **last_sale index fix** (SQL): agg_flipdish_last_sale was 10.5s (no index on sale_time → scan); added `idx_flipdish_sales_brand_saletime (brand_id, sale_time DESC)` + dropped the is_cancelled filter from the function → now 21ms. This 10s query was causing the INTERMITTENT "Couldn't load sales data" timeout on page load (it ran in parallel with the other load queries). Fixed.
  - **Auto-chunk sync** (Edge Function flipdish-rms-sync.ts, redeployed in Supabase): processes max 2 DAYS PER INVOCATION (each day ~11s; the free-tier Edge Function execution limit killed 3+ days → that was the cryptic "reading 'error'" 500, NOT a code bug). Returns `resumeFrom` + `moreToProcess` for longer ranges. Backfill pattern: call, read resumeFrom, call again with it, repeat (~7 calls for 2 weeks). Daily case (sync today) = one call, works. Function fully hardened with try/catch around fetch/json/upsert/store-lookup so failures return readable messages (incl. tokenHint on 401/403) not cryptic 500s. Verified: single day 2,979 sales / £58k clean.

- **Sync was DEAD ~2 weeks (expired token) — restored.** The `flipdish-rms-sync` Edge Function authenticates to Flipdish's RMS *portal* API by passing two cookies: `FLIPDISH_FD_AUTHORIZATION` (long-lived, ~Sep 2026) and `FLIPDISH_RMS_TOKEN` (SHORT-LIVED ~24h, scraped from portal cookies). The rms-token had expired, so no new data since ~mid-May. Fixed by refreshing the `FLIPDISH_RMS_TOKEN` secret + backfilling. ⚠️ ROOT CAUSE UNRESOLVED: this token expires every ~24h and must be manually refreshed — the sync WILL die again. Real fix = move to official Flipdish v3.0 API OAuth (App ID/Secret), not portal-cookie scraping. Also the function 500s on multi-day ranges (>~1 day at once = too many rows / 60s fetch timeout) — backfill ONE DAY PER REQUEST (`{"fromDate":"YYYY-MM-DD","toDate":"YYYY-MM-DD"}`). Could be fixed to auto-chunk internally.
- **Chain Performance timeout FIXED via server-side aggregation.** The view was pulling ~44k flipdish_sales rows to the browser per load and intermittently hitting the 2-min statement_timeout (returning partial data). Now aggregates in Postgres via RPCs and ships tiny result sets. SQL functions (in server_aggregation.sql, all CREATE OR REPLACE / idempotent): `agg_flipdish_sales(brand,from,to)` → per store×channel count+revenue; `agg_flipdish_items(brand,from,to)` → per-item qty+revenue (top-level items only, excludes modifiers/cancelled/refunded); `agg_flipdish_heatmap(brand,from,to)` → dow×hour counts; `agg_flipdish_last_sale(brand)` → max sale_time. App: storeMetrics now built from salesAgg/prevSalesAgg (via fetchSalesAggregated current+prior); heatmap via fetchSalesHeatmap; "latest sale" via fetchLastSaleTime; StoreDetailModal fetches its own store's sales on demand (fetchStoreSales, scoped/lazy). Raw `fetchFlipdishSales` full-load no longer drives the view. Items-sold section (top/bottom 10, revenue, category) now uses agg_flipdish_items.
- **⚠️ "13% undercount" was a FALSE ALARM — do not chase it.** Mid-investigation it looked like the dashboard understated revenue (£306k vs £351k). That was a MEASUREMENT ARTIFACT: two *different* 7-day windows were compared (fixed 05-25→05-31 vs rolling today-6→today). When pinned to identical dates, dashboard and SQL match EXACTLY (£303,524.70 / 15,472 both). The dashboard numbers were always correct. The server-side rewrite is still a genuine win (fixes the timeout), just not a correctness fix.


- **Multiple job roles per employee.** ops_team.role_ids (text[]) added; role_id KEPT and mirrors role_ids[0] for backward compat (every single-role reader still works). Schema backfilled role_ids from existing role_id. Both edit paths (Add/Edit Member modal + profile Job & Pay tab) use multi-select CHIP toggles (toggleRole / toggleRoleJP) grouped by department. Team list, profile header, and role filter show/match ALL roles. Department stays SINGLE, derived from first role (deliberate). Validation requires ≥1 role. SQL: multi_role.sql. Files: App_MULTI_ROLE.js / supabase_MULTI_ROLE.js.
- **Advertised roles (managed list for hiring).** New advertised_roles table (id/title/description/active/sort_order) — a SEPARATE, simple list of advert titles managed in Hiring (HQ/owner → "Advertised roles" button → AdvertisedRolesModal: add/rename/hide/remove). DELIBERATELY decoupled from store roles: advert title ≠ assigned role. The PUBLIC apply form now populates its position dropdown from advertised_roles (active only), STORE-INDEPENDENT — this REPLACES the old per-store advertiseForHiring filtering (that flag still exists on store_roles but no longer drives the public form). Manager assigns real store role(s) at hire time via the multi-role picker. ⚠️ Public form shows "No positions open" until at least one advertised role is added. Helpers: fetchAdvertisedRoles/createAdvertisedRole/updateAdvertisedRole/archiveAdvertisedRole + handlers addAdvertisedRole/updateAdvertisedRoleRow/archiveAdvertisedRoleRow. SQL: advertised_roles.sql. Files: App_ADVERTISED_ROLES.js / supabase_ADVERTISED_ROLES.js.

### DONE this session (kiosk + self-fill onboarding) — verified in prod
- **Kiosk: tasks on punch-in + clocked-in menu (Stage 1).** After punch-IN, if the employee has tasks today, a "View today's tasks (N)" button shows the list (assignments matching personId OR any of their roleIds, scoped to the kiosk store, due today by frequency). If already clocked in and PIN entered → 3-option menu: ☕ Go on a break (stub — "coming soon") / ✓ View tasks / ⏹ Punch out. Clocked-in banner+button now say "tap to continue"/"→ Continue" (not Clock Out). todaysTasks useMemo in KioskApp; kiosk shell now also loads assignments/checklists/cleaningTasks/storeRoles. STAGE 2 (not built): break tracking (simple start→punch-to-end, ALWAYS UNPAID → must deduct from hours) + wiring task-MARKING into the existing checklistStates/cleaning completion system.
- **Employee self-fill onboarding link.** Manager creates a stub employee → SelfFillLinkCard generates a secure unguessable token → shares `/onboard?token=...`. New hire (no login) fills PERSONAL details only: name, nickname, photo, email, phone, DOB, gender, address, legal status, NI number, emergency contact (×3), AND chooses their own kiosk PIN. Link stays editable until manager finalizes. Bank EXCLUDED from the public link (done in-app post-login). Security: submitSelfFill whitelists fields server-side (SELFFILL_ALLOWED) — can't write roles/pay/status/bank. Helpers: generateSelfFillToken/clearSelfFillToken/fetchEmployeeBySelfFillToken/submitSelfFill. SQL: selffill_onboarding.sql (ni_number, selffill_token unique idx, selffill_completed_at). Public page: SelfFillShell at IS_SELFFILL route (/onboard).
- **Self-chosen PIN with uniqueness (added on top).** Self-fill form has a "Choose your clock-in PIN" field (4–6 digits). submitSelfFill validates format + GLOBAL uniqueness (isPinAvailable) — rejects "already in use" since the kiosk identifies people by PIN. This was the only piece NOT already in the prior self-fill build.

### DONE this session (Team view) — verified in prod
- **Ops Team moved to PEOPLE → "Team" + restructured.** New standalone OpsTeamView component (was a tab inside OpsSettingsView). Now a "Team" nav item at top of PEOPLE group (pending-setup badge moved here). Members GROUPED BY STORE (section headers + counts; unassigned → "No store assigned" group). Filters: search (name/nickname/role) + store + department + role dropdowns + "Pending only" toggle + Clear. Click row → opens profile (openEmployeeProfile); closing a profile now returns to "team" (closeEmployeeProfile updated). Add Member / Edit / Delete intact (uses addOpsTeam/updateOpsTeam/deleteOpsTeam + OpsConfirmModal). The old "Ops Team" tab REMOVED from Ops Setup; Shift Presets (was bundled there) given its own "Shift Presets" tab in Ops Setup so nothing lost. Orphaned tmModal/showOnlyPending state cleaned from OpsSettingsView. App.js only — no schema/supabase change. NOTE: OpsTeamView was rebuilt fresh (not a literal code move) so add/edit was re-verified working.

### DONE this session (contracts) — verified in prod
- **Contracts STAGE 2 — web contract send + sign + print.** Manager: Contracts → Send → pick employee (name auto-fills) → fill manual fields (position/start_date/salary/hours/probation/store/store_address) → live preview → Send (BLOCKED if any `[[ … — not set ]]` gap remains). Snapshot: filled body FROZEN into employee_contracts.filled_body at send; signing never touches it; independent of template (verified). Employee: "Contracts" tab in employee shell (Stage 2B fix — contracts go to full staff too) + inline in trainee portal → Read & sign (type name + tick + timestamp) → Print/PDF = single compliance file. Manager sees status+audit on profile → Documents → Contracts. Helpers: fetchEmployeeContracts/sendContract/signEmployeeContract/voidContract. fillContractForSend (name auto, rest manual, gap markers). SQL: employee_contracts_step2.sql.

### DONE since last handoff (this session, all verified)
- **Contract e-signature (PDF-upload route)**: new "Contract of employment" slot in DocumentsTab, kind "sign" (vs "approve"). Manager-uploads (like RTW) BUT trainee-visible (RTW stays hidden — gated on `slot.kind !== "sign"`). Employee: Review & sign → type name + tick statement + confirm → records signer id/name/statement/timestamp. Shows "✓ Signed by X on DATE" both ends. Helper `signContractDocument`; mapper fields signedById/signedByName/signatureStatement; review_stage "signed" counts as done in progress. SQL: docs_step4_signature.sql (signature cols), docs_step4b_signed_stage.sql (added 'signed' to employee_documents_stage_chk — the constraint only allowed pending/manager_approved/hr_approved/rejected; same hidden-CHECK-constraint trap as doc_type earlier).
- **Bucket PDF fix**: `applicant-photos` bucket only allowed image MIME types + 5MB, so contract PDFs (and any PDF) were rejected at the storage layer. Added `application/pdf` + raised to 10MB via Supabase dashboard → Edit bucket. This unblocked PDF uploads for ALL document slots, not just contracts. No code change.
- **Contracts STAGE 1 — web contract templates**: new "Contracts" nav item (PEOPLE) → ContractsAdminView. Author `contract_templates` (table: id/title/description/body/created_by/timestamps) with merge tokens; ContractTemplateEditor with an "Insert merge field" palette; Preview picks an employee and renders the FILLED contract via SafeMarkdown on a white page. Merge engine (module-level): CONTRACT_TOKENS, resolveContractTokens(employee, stores), fillContractBody(body, values). Tokens: {{employee_name}} {{position}} {{start_date}} {{salary}} {{store}} {{store_address}} auto-fill; {{hours}} stays literal (manual); unknown tokens left as-is; missing values show `[[ Label — not set ]]`. Store address composes from stores.address/city/postcode (already existed — no schema change). Preview readability fix: SafeMarkdown hard-codes light text for dark bg, so on the white preview box a scoped `.contract-preview-box` style forces dark text. SQL: contract_templates_step1.sql. Helpers: fetchContractTemplates / createContractTemplate / updateContractTemplate / archiveContractTemplate.
- **Contract template asset** (in outputs): `contract_template_body.txt` — the user's real "Statement of Main Terms" contract converted to a paste-ready template with merge tokens, adapted for SafeMarkdown (tables removed — sig boxes replaced by e-sign; columns→sentences; caps headings normalised). NOTE: salary "per annum" wording removed since pay may be hourly — verify per-use.
- **Profile polish**: denser fields, section grouping in Personal & HR, header tidy, Pay History merged into "Job & Pay" tab (7→6). Presentational.
- **C2b — trainee progress view**: "Trainee progress" tab in TrainingAdminView; pick trainee → modules with completed/verified + Verify/Unverify.
- **Training image upload**: "+ Insert image" in editor → uploads + inserts `![](url)` at cursor.
- **Side-by-side image+text**: `:::row`/`:::row-right`/`:::` in SafeMarkdown (tolerant of trailing whitespace). Don't nest images.
- **In-editor formatting help** panel + `TRAINING_GUIDE_PDF_URL` placeholder.
- **Authoring docs** (outputs): Training_Content_Authoring_Guide.pdf + sample_module.txt.

---

## DEFERRED FROM EARLIER (still open)
- Candidate self-apply via anon RLS — rolled back twice, needs staging. (Trainee portal is PIN-gated like the kiosk, sidestepped this.)
- Resend email infra never set up; magic-link auto-send DISABLED.
- Auto-purge applicant photos on rejection; GDPR retention; Assets/Disciplinary/Performance tabs; Holiday/sick tracking.
- Flipdish API migration — blocked until end-June 2026.
- 12 latent mapper bugs (documented in supabase.js header, no incidents).
- Cosmetic: `ChainPerformanceView .jsx` filename has a space; consider flattening the doubled repo folder.

---

## LATEST FILE STATE (deployed + verified)
- App.js: **App_SYNC_ALARM.js** (1,131,558 bytes) — latest, deployed. (lineage: …SELFFILL_PIN → ITEMS_SOLD → SERVER_AGG → SYNC_ALARM)
- supabase.js: **supabase_SERVER_AGG.js** (169,184 bytes) — latest, deployed.

### ⚠️ FILE-LINEAGE WARNING (read before building)
Canonical latest = **App_SYNC_ALARM.js (1,131,558) + supabase_SERVER_AGG.js (169,184)**. (supabase unchanged since SERVER_AGG; the sync-safety SQL — last_sale index + the 4 agg functions — lives in server_aggregation.sql, run directly in Supabase. The Edge Function flipdish-rms-sync lives in Supabase, source saved as flipdish-rms-sync.ts, NOT in the repo.) Lineage: …REFINEMENTS → SELFFILL_PIN → ITEMS_SOLD → SERVER_AGG → SYNC_ALARM. A stale PARALLEL branch (App_KIOSK_TASKS/TASKS2, ~1,108,247) is MISSING self-fill — never build on it. Before treating a file as current: `findstr /c:"fetchSalesAggregated" src\supabase.js` and `findstr /c:"function SelfFillShell" src\App.js` must both return, and App.js should be ~1,131,558+.

---

## CRITICAL PATTERNS (carry-forward)
1. Mappers partial-aware: `if (m.field !== undefined) row.db_field = m.field`.
2. Upsert enforces ALL NOT NULL — pass complete objects / `.update().eq()`. Rows touched by two actors (e.g. training_progress) → read-modify-write.
3. `window.confirm()`/`alert()`, never bare.
4. Hooks before any early return (build-failing; parse won't catch).
5. After CREATE/ALTER on prod: VERIFY with `SELECT ... LIMIT 1`. pg_notify ≠ proof.
6. Inserting into an existing table: reuse known-good values (watch hidden CHECK constraints).
7. Handler payloads must carry EVERY field the helper expects (the type-drop bug).
8. getCertExpiryStatus is module-level (reused cert + doc expiry badges).

Schema cache reload after ALTER: `NOTIFY pgrst, 'reload schema';`

---

## SUGGESTED OPENER FOR NEXT CHAT
> "Continuing Chocoberry dashboard. ⚠️ FIRST: latest files are App_SYNC_ALARM.js (1,131,558 bytes) + supabase_SERVER_AGG.js (169,184 bytes) — see FILE-LINEAGE WARNING; do NOT build on the App_KIOSK_TASKS branch. Everything's built and live: full onboarding (RTW docs two-stage + versioning + comments; contracts author→send→sign→print frozen-snapshot; HMRC tax; policy/allergen acks; employee bank w/ declaration; complete gate), training, profile polish. Team under PEOPLE→'Team' (grouped by store, filters+search). Multiple job roles per employee. Hiring advertised-roles list drives the public apply form. Self-fill onboarding link (/onboard?token=) + self-chosen unique PIN. Kiosk: tasks on punch-in + clocked-in menu. Chain Performance uses SERVER-SIDE aggregation RPCs (agg_flipdish_sales/items/heatmap/last_sale) — fixed a load timeout; numbers verified correct (an earlier '13% undercount' was a FALSE ALARM = mismatched windows, ignore). ⚠️ FLIPDISH SYNC: depends on FLIPDISH_RMS_TOKEN that expires ~24h and CANNOT be auto-refreshed (login has hCaptcha + SMS 2FA — confirmed). Safety net now in place: dashboard shows a red STALE-DATA alarm if no sale >30h; Edge Function flipdish-rms-sync auto-chunks max 2 days/call with resumeFrom (~7 calls for 2wks; daily sync-today = 1 call). When sync dies: refresh the token in Supabase secrets, then call the function following resumeFrom. Repo: C:\\dev\\create-brands-dashboard\\create-brands-dashboard; read SESSION_HANDOFF.md. Other open (non-urgent): kiosk Stage 2 (breaks UNPAID→deduct + task-marking); scheduled daily sync (pg_cron) not set up; email notifications (Resend); storage hardening; PDF-guide link."
