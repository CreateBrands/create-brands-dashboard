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
SQL files in outputs: training_step3_is_trainee, training_step1_modules, training_stepA_content_progress, training_templates, training_module_type, docs_step1_review_state, docs_two_stage_approval, docs_step2_slots, docs_step3_comments.

---

## 🔜 NOT BUILT — next-session work
1. **Contracts STAGE 2 — web contract signing (THE BIG NEXT BUILD).** Stage 1 (author template + merge-field auto-fill + preview) is DONE. Stage 2 = let the employee actually sign a web-authored contract. Components:
   - **Send-to-employee + manual fill-in step**: when a manager sends a contract, prompt a form for ALL terms EXCEPT name. DECISION (confirmed): only `{{employee_name}}` auto-fills from the record; **everything else is manually entered when sending** — position, start date, salary, hours, probation ({{probation}} new token), store, store address. Rationale: contract terms are a deliberate act and may differ from / not yet be on the record. So the merge engine for contracts = resolve {{employee_name}} only; every other token is a prompted field. (NOTE: this differs from Stage-1 preview, which auto-fills several from the record — Stage 1 preview can stay as-is for quick previewing, but the SEND/SIGN flow uses manual entry. Or simplify Stage-1 preview to match. Builder's choice, but the signed contract must use the manually-entered values.)
   - **Snapshot-on-sign (COMPLIANCE-CRITICAL)**: when the employee signs, freeze the FULLY-FILLED contract text (all tokens + manual fields already substituted) into the signature record — not a reference to an editable template. Must be able to prove exactly what was agreed. This is the part that must not have bugs.
   - **Read + sign in portal** against web content (reuse the existing sign flow — signContractDocument / typed name + tick + timestamp audit — but point it at web content instead of an uploaded file).
   - **Printable one-page view**: contract + signature block on one page → browser Print-to-PDF gives the single compliance document (this is the "one web document" the user wanted; avoids all server-side PDF merging).
2. **Email notifications** for document comments (deferred — needs Resend infra: account, API key, domain verification, send logic). In-app unread badge already works.
3. **Storage hardening (flagged, do properly later)**: the `applicant-photos` bucket is PUBLIC with a broad SELECT policy, and now holds sensitive employee docs (passports, NI, signed contracts). The broad listing could expose data. DON'T just remove the SELECT policy — the app reads files via public URLs (View links, image rendering), so removing it could break viewing. Needs a proper review (signed URLs / scoped policies), not a hasty toggle.
4. **Enable the editor's PDF-guide link** (tiny): upload Training_Content_Authoring_Guide.pdf to storage, paste its public URL into `const TRAINING_GUIDE_PDF_URL = ""` (just above TrainingModuleEditor), redeploy.
5. Category as a defined list (FOH/BOH/General/other) — minor. Optional "Insert image row" button scaffolding a `:::row` block — minor.

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
- App.js: **App_CONTRACT_PREVIEW_FIX.js** (1,045,371 bytes) — latest. (Lineage tail: …EDITOR_HELP → CONTRACT_SIGN → CONTRACT_TEMPLATES → CONTRACT_PREVIEW_FIX.)
- supabase.js: **supabase_CONTRACT_TEMPLATES.js** (147,183 bytes) — latest. (Adds signContractDocument + contract template CRUD + signature mapper fields.)
- Lineage this session: App_TRAINEE_FIX2 → TRAINING_C1 → TRAINING_TEMPLATES → TRAINING_TYPE(_FIX) → STAFF_TRAINING → DOCS_REVIEW → DOCS_TWOSTAGE(_FIX) → DOCS_RTW_PRIVACY → DOCS_COMMENTS → DOCS_HISTORY.

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
> "Continuing Chocoberry dashboard. Shipped + verified: trainee portal, full training content layer (+ image upload, :::row side-by-side, in-editor help), staff library, C2b trainee-progress view, the COMPLETE onboarding document workflow (slots + two-stage approval + RTW privacy + versioning + comment threads + history), profile polish, contract e-signature via PDF upload, and Contracts STAGE 1 (web contract templates with merge-field auto-fill + preview). Repo at C:\dev\create-brands-dashboard\create-brands-dashboard; read SESSION_HANDOFF.md for schema + gotchas. Latest files: App_CONTRACT_PREVIEW_FIX.js + supabase_CONTRACT_TEMPLATES.js. NEXT BIG BUILD: Contracts STAGE 2 — web contract signing (manual fill-in step for hours/probation/salary-override, snapshot-on-sign [compliance-critical], read+sign in portal, printable one-page view). Other open: email notifications (needs Resend), storage hardening (public bucket now holds sensitive docs). Contract template body ready in outputs/contract_template_body.txt."
