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

### DONE this session (multi-role + advertised roles) — verified in prod
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
- App.js: **App_SELFFILL_PIN.js** (1,122,481 bytes) — latest, deployed.
- supabase.js: **supabase_SELFFILL_PIN.js** (164,760 bytes) — latest, deployed.

### ⚠️ FILE-LINEAGE WARNING (read before building)
This session's outputs DIVERGED into two branches and it caused real confusion. The CANONICAL line is:
  …ADVERTISED_ROLES → (kiosk tasks were also added here) → **REFINEMENTS** (the all-inclusive superset: self-fill + advertised roles + multi-role + kiosk tasks + kiosk "continue" fix) → **SELFFILL_PIN** (current).
A PARALLEL branch (App_KIOSK_TASKS / App_KIOSK_TASKS2, ~1,108,247 bytes) has kiosk tasks but is MISSING the self-fill feature (no SelfFillShell). DO NOT build on the KIOSK_TASKS line — it would regress self-fill. Always confirm App.js is ~1,122,481 bytes (or larger) and that `findstr /c:"function SelfFillShell"` returns before treating a file as current. The self-fill feature IS live in prod (verified via the /onboard form screenshot).

To verify what's deployed if ever unsure: `findstr /c:"function SelfFillShell" src\App.js` (must return) + size check.

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
> "Continuing Chocoberry dashboard. ⚠️ FIRST: latest files are App_SELFFILL_PIN.js (1,122,481 bytes) + supabase_SELFFILL_PIN.js (164,760 bytes) — see the FILE-LINEAGE WARNING in the handoff; do NOT build on the App_KIOSK_TASKS branch (it's missing self-fill). Everything is built and live: full onboarding (RTW docs two-stage approval + versioning + comments; contract author→send→sign→print with frozen snapshot; HMRC tax; policy/allergen acks; employee-self-submitted bank with declaration; onboarding-complete gate), training system, profile polish. Team under PEOPLE → 'Team' (grouped by store, filters+search). Employees can hold multiple job roles. Hiring has a managed advertised-roles list driving the public apply form. Employee SELF-FILL onboarding link (/onboard?token=) lets new hires fill personal details + choose their own (unique-checked) kiosk PIN; bank stays in-app. Kiosk shows tasks on punch-in + a clocked-in menu (break stub / tasks / punch out). Repo: C:\dev\create-brands-dashboard\create-brands-dashboard; read SESSION_HANDOFF.md. Open (none urgent): kiosk Stage 2 (break tracking [simple, UNPAID→deduct] + task-marking); email notifications (Resend); storage hardening; enable PDF-guide link."
