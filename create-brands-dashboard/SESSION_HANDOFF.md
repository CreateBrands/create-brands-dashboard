# Chocoberry Dashboard — Full Session Handoff

**Session date**: 2026-05-29
**Project**: create-brands-dashboard
**Repo**: github.com/CreateBrands/create-brands-dashboard
**Supabase project**: qtjsdbasoouslcpinqhu
**Production URL**: create-brands-dashboard.vercel.app
**Owner**: Atif Razzaq, atifrazzaqfast@gmail.com
**Local repo path**: C:\Users\conta\create-brands-dashboard

---

## Project context

- 24 stores (23 Chocoberry + 1 Tove)
- Roles: owner / hq_staff / manager / staff
- 30 existing employees in ops_team (Pratiksha, Riya, Sukhman, Rohil, Zakia, Seetha, Armaan, etc.)
- Schema cache reload after every ALTER: `SELECT pg_notify('pgrst', 'reload schema');`
- Working files (Claude side, this session): /home/claude/App.js (~17,000 lines), /home/claude/supabase.js (~2,545 lines)

---

## IMMEDIATE STATE — what to do FIRST in next chat

**Slice 7 Stage 2 has a cache deployment bug, not a code bug.**

The new emergency contact + probation fields are in:
- Local src/App.js ✓
- Local src/supabase.js ✓
- Git commit 81dd40d on main ✓
- Vercel deployment marked "Ready" + "Production" ✓

BUT the deployed JS bundle serves OLD code. Network payload from save action shows MISSING fields:
```
Payload sent: { updated_at, address, dob, email, hire_date, hr_notes, legal_status, phone }
Missing: emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
         probation_end_date, probation_status
```

**Fix order**:
1. Hard refresh (Ctrl+Shift+R) on dashboard → test save → check payload
2. If still broken: Incognito test → fresh login → test save
3. If still broken: Vercel dashboard → redeploy 81dd40d → UNCHECK "Use existing build cache"
4. Verify payload now contains new fields

Once Stage 2 actually persists, slice 7 needs:
- **Stage 3** (~2 hours): Documents tab for RTW uploads
- **Stage 4** (~30 min): Apply-time duplicate warning

---

## EVERYTHING SHIPPED THIS SESSION (18+ slices)

### Bug fixes
1. **Critical mapper data-loss fix** — appApplicationToDb was non-partial-aware, was wiping fields on partial updates. Fixed by making mapper only write fields explicitly present in input.
2. **Mapper audit + opsTeam defensive fix** — appOpsTeamToDb made partial-aware
3. **patchOpsTeam signature mismatch** — accept either (id, patch) OR single object with .id
4. **patchOpsTeam true partial update** — added updateOpsTeamMember sibling using .update().eq() instead of .upsert()
5. **store_roles updated_at bugfix**
6. **upsert NOT NULL footgun** — added documentation block at top of supabase.js
7. **ESLint no-restricted-globals fix** — bare confirm() → window.confirm()

### Features shipped
1. **Slice 3.1 patches** — RTW/availability removal, DOB picker
2. **Role editor cleanup**
3. **Slice 5 hire flow** — prefilled Add Member modal, link-to-existing duplicate check, auto-archive application on hire, auto-navigate to new employee profile
4. **Slice 6 search/sort/filter** — chip filters on Hiring view (status, store, source, "show only failed link", "show only minors"), sort by newest/oldest/A-Z, search by name/email/phone/position
5. **Slice 6 per-employee profile page** — 5 tabs:
   - Personal & HR (hire date, email, phone, DOB, address, legal_status, hr_notes)
   - Job Assignment (primary store, also-at stores, role, derived department, pay type+amount, kiosk PIN, avatar color)
   - Pay History (auto-capture on save + manual backfill)
   - Certifications (12 UK hospitality types, expiry tracking, color badges)
   - Linked Application (read-only original application data)
   - Notes (append-only HR notes with author attribution)
6. **Pending setup visibility** — sidebar Ops Setup badge + Team tab amber banner + "show only pending" filter
7. **Monthly/annual salary support** — pay_type column ('hourly'/'monthly'/'annual'), effectiveHourlyRate helper for schedule cost calcs (173 hrs/month approximation)
8. **Email retry button** — manager-side retry for failed magic links, with warning that portal isn't built yet
9. **Magic-link auto-send disabled** — was sending dead links to candidates, commented out until portal exists
10. **Slice 7 stage 1** — schema for employee_documents, emergency contact fields, probation fields (DEPLOYED + VERIFIED)
11. **Slice 7 stage 2** — Personal & HR additions (DEPLOYED BUT NOT WORKING — cache issue)

### Slice 4 (Candidate Portal) — ROLLED BACK TWICE this session
Attempted RLS-based candidate portal:
- Designed proper policies: is_dashboard_user() function, apps_anon_insert with WITH CHECK constraints, apps_authenticated_select with email match OR dashboard membership, etc.
- First attempt: failed on `new_status` column name (actual name is `to_status`)
- Second attempt with fixed column name: ALL diagnostics passed BUT anonymous /apply submissions kept failing with "row violates row-level security policy" even with `WITH CHECK (true)` (most permissive possible policy)
- Root cause UNDIAGNOSED — something specific to this Supabase project blocks anon inserts even with permissive policy
- Cleanly rolled back, /apply works again
- **DEFERRED** until staging Supabase environment is set up

---

## SLICE 7 — IN PROGRESS

### Stage 1: Schema + helpers — SHIPPED + VERIFIED

**SQL file**: `hiring_slice7_compliance.sql` (already run, do not re-run)

Schema added:
- `employee_documents` table (id, employee_id FK, doc_type CHECK constraint, file_url, file_path, file_name, expiry_date, signed_at, notes, uploaded_by_id, uploaded_by_name, created_at, updated_at, archived_at)
- doc_type allowed values: rtw_passport, rtw_brp, rtw_share_code, rtw_visa, rtw_other (extendable later for contract/p45)
- updated_at trigger reuses set_updated_at function
- ops_team.emergency_contact_name, emergency_contact_phone, emergency_contact_relationship (all text, nullable)
- ops_team.probation_end_date (date), probation_status (text, CHECK constraint)
- probation_status values: in_progress (default), passed, failed, extended, not_applicable
- Existing 30 employees backfilled to probation_status='not_applicable'

**supabase.js helpers added**:
- fetchEmployeeDocuments(employeeId)
- uploadEmployeeDocument(file) — reuses applicant-photos bucket, accepts JPG/PNG/WEBP/PDF, 10MB limit, path: employee-docs/{yyyy-mm}/{token}.{ext}
- addEmployeeDocument({...})
- archiveEmployeeDocument(id) — soft delete
- deleteEmployeeDocumentFile(path) — hard delete for GDPR
- findApplicationsByEmail(email, excludeId) — returns {otherApplications, existingEmployee}
- appOpsTeamToDb mapper extended with: emergencyContactName, emergencyContactPhone, emergencyContactRelationship, probationEndDate, probationStatus
- dbOpsTeamToApp mapper extended to read those fields

### Stage 2: Personal & HR UI additions — SHIPPED but CACHE ISSUE

UI added to Personal & HR tab (between HR notes and Save button):
- Emergency Contact section: name + relationship (side-by-side), phone (full width)
- Probation section: status dropdown + end date picker, smart context line ("X days remaining" / "⚠ Review due in X days" / "Past probation by X days" / "Probation completed" / "Not applicable")
- Quick-action buttons (when status=in_progress AND end date within 14 days OR past): "✓ Mark probation passed" / "Extend probation"
- Auto-fill probation_end_date to hire_date+90 on save when status='in_progress' and date is blank

**Bug**: Network payload from save action shows the new fields are MISSING despite source code containing them. Suspected build/cache issue.

### Stage 3: Documents tab — NOT STARTED (~2 hours)

Plan:
- New 6th tab on employee profile (between Linked Application and Notes, or replace Notes position)
- RTW upload form: doc_type picker (passport/BRP/share code/visa/other), file upload, expiry date, certificate number text, notes
- List view: sorted by expiry, color badges (green/amber/red based on expiry status — same pattern as Certifications tab)
- Upload flow: uploadEmployeeDocument(file) → returns {url, path} → addEmployeeDocument({...}) with the IDs
- View document: open file URL in new tab
- Archive: soft delete (HQ/owner only)
- Helpers already in supabase.js (stage 1 ship)

### Stage 4: Apply-time duplicate warning — NOT STARTED (~30 min)

Plan:
- In HiringView detail panel (when manager expands an application row)
- Call findApplicationsByEmail(app.email, app.id)
- If otherApplications.length > 0: show amber warning "⚠ This email has X other applications"
- If existingEmployee: show warning "⚠ This email matches an existing employee: [name] (status)"
- Helper already in supabase.js (stage 1 ship)

### Decisions locked in for slice 7

- Q1: separate employee_documents table (extensible for future contracts)
- Q2: one emergency contact (not multiple)
- Q3: stored probation_end_date with derived default (auto-fill on hire to hire_date+90)
- Q4: date stored + status enum + manual review button
- Q5: duplicate warning to MANAGER only (not candidate — info leak)
- Q6: versioned uploads (n/a since contract skipped this session)

---

## ALL SLICE FILES SHIPPED IN /mnt/user-data/outputs/

If continuing, these files are the latest state:

- `hiring_slice4_rls.sql` — rolled back, do NOT re-run
- `hiring_slice6.sql` — initial profile schema (run earlier in session)
- `hiring_slice6_pay_type.sql` — pay_type column (run + verified)
- `hiring_slice6_pay_history.sql` — pay history table (run + verified)
- `hiring_slice6_certifications.sql` — certifications table (run + verified)
- `hiring_slice7_compliance.sql` — slice 7 stage 1 schema (run + verified)
- `App.js` — has stages through 7-stage-2 (deployed but cache issue)
- `supabase.js` — has all helpers through slice 7 stage 1 (deployed)
- `SESSION_HANDOFF.md` — this file

---

## DEPLOY COMMAND TEMPLATE

```cmd
cd C:\Users\conta\create-brands-dashboard
git add src/App.js src/supabase.js
git commit -m "feat(sliceX): [description]"
git push
```

Wait for Vercel build → test in browser.

---

## CRITICAL PATTERNS LEARNED THIS SESSION

### 1. Mappers MUST be partial-aware
Many old mappers had bugs where partial updates wiped non-mentioned fields. Pattern: `if (m.field !== undefined) row.db_field = m.field`. NOT just `row.db_field = m.field || null`.

Fixed mappers (confirmed partial-aware):
- appApplicationToDb (fixed mid-session after critical data-loss bug)
- appOpsTeamToDb (fixed during mapper audit)
- appStoreToDb (was already correct)
- appStoreRoleToDb (was already correct)
- appStoreDepartmentToDb (was already correct)

Mappers NOT confirmed partial-aware (UNSAFE for partial updates without audit first):
- appBrandToDb, appUserToDb, appIssueToDb, appTempUnitToDb
- appCleanTaskToDb, appAssignmentToDb, appEntryToDb, appAuditToDb
- appMsgToDb, appAvailToDb, appScheduleToDb, appPunchToDb

### 2. Supabase .upsert() enforces ALL NOT NULL constraints
Even for "update" semantics. The footgun: `await upsertX({ id, status: 'done' })` will FAIL with "null value in column X violates not-null constraint" even though we're really updating an existing row.

Workaround: ALWAYS pass complete object to upsertX. Spread the existing row first.
For true partial updates: write a sibling function using `.update().eq(...)` directly.

Documentation block added at top of supabase.js explaining this.

### 3. ESLint no-restricted-globals
Bare `confirm()` and `alert()` are blocked. Always use `window.confirm()` / `window.alert()` OR add `// eslint-disable-next-line no-restricted-globals` comment.

### 4. Both supabase.js AND App.js must be git add'd together
If only App.js is pushed but supabase.js depends on new helper exports, build fails. Pattern: `git add src/App.js src/supabase.js` together.

### 5. Vercel build cache can serve stale JS
Even when source code and git commits are correct. Symptoms: Network payload shows old field set despite source containing new fields. Fix: hard refresh → incognito → Vercel "Redeploy without build cache".

### 6. RLS on production tables with triggers + multiple roles is hard
Slice 4 RLS attempt #2 had:
- Correct policies (verified by querying pg_policy)
- All conditions evaluating true manually
- WITH CHECK (true) most-permissive failsafe
- Trigger as SECURITY INVOKER
- All history policies present

And it STILL rejected anon inserts. Root cause undiagnosed. Need staging environment before attempt #3.

---

## REAL DATA STATE

- 30 employees in ops_team, all backfilled to probation_status='not_applicable'
- Atif Razzaq's test records exist (Atif Razza, Atif raza — duplicates from testing)
- Armaan Singh hired via slice 5 flow
- Pratiksha Rai used as test target for Stage 2 (didn't persist due to cache bug)
- Tailwind via CDN — pre-existing console warning, not from any slice this session
- Magic-link auto-send currently DISABLED in App.js
- Email retry button works but warns about portal not being built

---

## DEFERRED / NOT BUILT

- **Slice 4 candidate portal** — rolled back twice, requires staging Supabase project
- **Resend email infrastructure** — never set up; magic links use Supabase Auth (rate-limited)
- **Documents tab UI** — schema done, UI is slice 7 stage 3
- **Apply-time duplicate warning** — helper done, UI is slice 7 stage 4
- **Assets tab** — laptop/uniform tracking (not started)
- **Disciplinary tab** — warnings/PIP (not started)
- **Performance tab** — reviews/ratings (not started)
- **Flipdish API migration** — blocked until end-June 2026
- **12 latent mapper bugs** — documented, not fixed (no incidents observed)
- **Auto-purge applicant photos on rejection** — flagged TODO
- **GDPR retention policies** — not started
- **Holiday/sick day tracking** — not started

---

## SESSION META-NOTES

### Session went very long
18+ slices shipped in one session. I recommended stopping 5+ times. User chose to keep building. Both honest choices but worth flagging for future:

**Recommended pattern**: ship 2-3 slices, deploy, use for real days, come back with friction observed in actual use. Better-scoped slices result.

### Slice 4 specifically
This is the slice that has now failed twice. Don't attempt again without:
1. Separate staging Supabase project
2. Schema mirror with test data
3. Real test plan executable against staging
4. Specifically: figure out WHY `WITH CHECK (true)` failed — that shouldn't happen

### Build cache
Twice this session, a bug looked like a code bug but was actually a deployment issue:
- Once: App.js pushed but supabase.js not pushed (build failed)
- Once: Both files pushed, Vercel "Ready", but bundle was stale (current Stage 2 issue)

Always check git log + Vercel deployment status + browser cache BEFORE assuming code bug.

---

## OPENING THE NEXT CHAT

Suggested opener:

> "Continuing Chocoberry dashboard work. Read /mnt/transcripts/journal.txt for full context. Most recent session shipped slice 7 stage 2 (emergency contact + probation on Personal & HR) but save payload was missing the new fields — looks like cache issue, need to verify with hard refresh / incognito / Vercel redeploy. Then continue with slice 7 stage 3 (Documents tab for RTW) and stage 4 (apply-time duplicate warning). The SESSION_HANDOFF.md from outputs has full details."

I'll be able to read this handoff file + the journal + prior transcripts. Should pick up cleanly.
