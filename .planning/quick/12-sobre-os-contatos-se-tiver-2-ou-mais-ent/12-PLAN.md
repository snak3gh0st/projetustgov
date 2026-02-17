---
phase: quick-12
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/lib/repo-sync.ts
  - web/src/app/api/enrich-contacts/route.ts
autonomous: true
requirements: [CONTACTS-MULTI]

must_haves:
  truths:
    - "Leads with 2+ contact data points from BrasilAPI or siconv_proponentes have ALL contacts in lead_contacts"
    - "BrasilAPI ddd_telefone_2 is captured as a separate lead_contacts entry"
    - "siconv_proponentes telefone+email creates a lead_contacts entry when not already present"
    - "Manually-created contacts by vendedores are never overwritten or duplicated"
    - "Backfill endpoint processes all existing leads and populates missing lead_contacts"
  artifacts:
    - path: "web/src/lib/repo-sync.ts"
      provides: "Multi-contact population during daily sync"
      contains: "ddd_telefone_2"
    - path: "web/src/app/api/enrich-contacts/route.ts"
      provides: "Backfill endpoint for existing leads"
      exports: ["GET"]
  key_links:
    - from: "web/src/lib/repo-sync.ts"
      to: "lead_contacts"
      via: "INSERT ... ON CONFLICT DO NOTHING"
      pattern: "INSERT INTO lead_contacts"
    - from: "web/src/app/api/enrich-contacts/route.ts"
      to: "lead_contacts"
      via: "INSERT per distinct contact"
      pattern: "INSERT INTO lead_contacts"
---

<objective>
Populate lead_contacts with ALL available contact data from both enrichment sources (siconv_proponentes and BrasilAPI), not just a single contact per lead.

Purpose: Currently each lead has at most 1 contact in lead_contacts. When a lead has 2+ distinct contact data points (e.g. BrasilAPI provides telefone_1 + telefone_2, or siconv_proponentes has a different phone than BrasilAPI), ALL contacts should be individually tracked in lead_contacts so vendedores can see and use them all.

Output: Modified repo-sync.ts for ongoing daily sync + new /api/enrich-contacts backfill endpoint for existing data.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@web/src/lib/repo-sync.ts
@web/src/app/api/leads/[cnpj]/contacts/route.ts
@web/src/app/api/setup-crm/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Modify repo-sync.ts to populate lead_contacts from both sources</name>
  <files>web/src/lib/repo-sync.ts</files>
  <action>
Add a new STEP 9 after STEP 8 (BrasilAPI enrichment) that populates lead_contacts from both enrichment sources. This step runs for ALL leads processed in the sync, not just new ones.

1. After STEP 7 (upsert), collect proponentes contact data per CNPJ for later use in STEP 9.

2. In STEP 8 (BrasilAPI enrichment), also read `ddd_telefone_2` from the API response. Store the phone2 data alongside phone1 for use in STEP 9. Change the data extraction block to also capture:
   ```
   const phone2Raw = data.ddd_telefone_2 || ''
   const phone2 = formatPhone(phone2Raw)
   ```
   Store both phones + email per CNPJ in a Map (e.g. `brasilApiContacts`).

3. Create STEP 9: "Populate lead_contacts from enrichment data". For each unique CNPJ in the current sync batch:

   a. Query existing lead_contacts for this CNPJ to know what's already there (to avoid duplicates):
      ```sql
      SELECT telefone, email FROM lead_contacts WHERE lead_cnpj = $1
      ```

   b. Build a list of distinct contacts to insert. A "contact" is a unique (telefone, email) pair from these sources:
      - siconv_proponentes: if proponentes has telefone/email for this CNPJ, create contact entry
      - BrasilAPI telefone_1 + email: create contact entry
      - BrasilAPI telefone_2 (no email): create separate contact entry if phone2 is different from phone1

   c. For each candidate contact, skip if an existing lead_contacts row already has the same telefone OR same email (normalized comparison). This prevents duplicating manually-created contacts.

   d. INSERT new contacts using:
      ```sql
      INSERT INTO lead_contacts (lead_cnpj, telefone, email, principal, telefone_status)
      VALUES ($1, $2, $3, $4, 'desconhecido')
      ```
      The first contact inserted for a CNPJ (if no existing contacts) should be marked `principal = true`. Subsequent contacts should be `principal = false`.

   e. Track the count of new contacts created and log it.

   f. Process in batches to avoid overwhelming the DB. Use the existing `client` connection (already held from STEP 5).

   g. Important: This step should process ALL CNPJs from the current sync batch (not just new leads), because existing leads may gain new BrasilAPI data on re-enrichment.

4. Update the SyncStats interface to include `contacts_created: number` and log it at the end.

CRITICAL CONSTRAINTS:
- Do NOT modify or delete existing lead_contacts rows (only INSERT new ones)
- Use ON CONFLICT DO NOTHING or check-before-insert pattern to avoid duplicates
- Normalize phone comparison: strip non-digits before comparing
- Keep the overall sync within the Vercel timeout (check elapsed time before STEP 9, skip if >200s)
  </action>
  <verify>
    Run `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit src/lib/repo-sync.ts` to verify TypeScript compiles.
    Grep for "ddd_telefone_2" in repo-sync.ts to confirm it's now used.
    Grep for "lead_contacts" in repo-sync.ts to confirm INSERT logic exists.
    Grep for "contacts_created" in repo-sync.ts to confirm stats tracking.
  </verify>
  <done>
    repo-sync.ts compiles without errors, uses ddd_telefone_2 from BrasilAPI, inserts multi-contact entries into lead_contacts for both proponentes and BrasilAPI sources, and tracks contacts_created in sync stats. Existing manually-created contacts are never overwritten.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create /api/enrich-contacts backfill endpoint</name>
  <files>web/src/app/api/enrich-contacts/route.ts</files>
  <action>
Create a new API endpoint at `/api/enrich-contacts/route.ts` that re-processes ALL existing leads to populate missing lead_contacts entries. This is a one-time backfill for the ~240 existing leads.

1. Auth: gestor-only (use getApiSession + role check).

2. Set `maxDuration = 120` (2 minutes for Vercel).

3. GET handler logic:

   a. Get all unique CNPJs from vendedor_projetos:
      ```sql
      SELECT DISTINCT cnpj, telefone, email FROM vendedor_projetos WHERE cnpj IS NOT NULL
      ```

   b. Get all existing lead_contacts grouped by CNPJ:
      ```sql
      SELECT lead_cnpj, telefone, email FROM lead_contacts
      ```
      Build a Map<string, Set<string>> of existing contact fingerprints per CNPJ (normalize: strip phone digits, lowercase email).

   c. For each unique CNPJ:

      i. Check existing contacts for this CNPJ (from the pre-loaded map).

      ii. If vendedor_projetos has telefone/email that's NOT already in lead_contacts, insert it. Mark as principal if this CNPJ has zero existing contacts.

      iii. Call BrasilAPI for this CNPJ (with rate limiting: 300ms delay between calls, abort timeout 10s). Extract:
         - `ddd_telefone_1` -> format with formatPhone()
         - `ddd_telefone_2` -> format with formatPhone()
         - `email`

      iv. For each distinct BrasilAPI contact data point:
         - telefone_1 + email: insert if not duplicate
         - telefone_2 (if different from telefone_1): insert as separate contact if not duplicate

      v. Skip if elapsed time > 100s to avoid timeout.

   d. Return JSON summary:
      ```json
      {
        "success": true,
        "cnpjs_processed": 240,
        "contacts_created": 85,
        "contacts_skipped_duplicate": 155,
        "api_errors": 3,
        "elapsed_ms": 45000
      }
      ```

4. Duplicate detection helper function: `isDuplicate(existing: Set<string>, telefone: string|null, email: string|null): boolean`
   - Normalize telefone by stripping non-digits
   - Normalize email by lowercasing + trimming
   - Return true if existing set contains either the normalized phone or normalized email

5. Phone formatting: Reuse the same formatPhone logic from repo-sync.ts. Either import it (if exported) or copy the function. Prefer importing — add `export` to formatPhone in repo-sync.ts if not already exported.

6. Import `getPool` from `@/lib/db` (same pattern as repo-sync.ts).

CRITICAL CONSTRAINTS:
- Only INSERT, never UPDATE or DELETE existing lead_contacts
- Rate limit BrasilAPI calls (300ms between calls)
- Respect Vercel timeout (check elapsed, stop early if needed)
- Mark first contact per CNPJ as principal only if no existing contacts
  </action>
  <verify>
    Run `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit src/app/api/enrich-contacts/route.ts` to verify TypeScript compiles.
    Verify the file exists and has GET handler with gestor auth check.
  </verify>
  <done>
    /api/enrich-contacts endpoint exists, compiles, is gestor-only, calls BrasilAPI for all existing leads extracting telefone_1 + telefone_2 + email, creates multiple lead_contacts per CNPJ while skipping duplicates, and returns a summary with counts.
  </done>
</task>

</tasks>

<verification>
1. `cd web && npx tsc --noEmit` passes (full project type check)
2. repo-sync.ts contains "ddd_telefone_2" usage
3. repo-sync.ts contains "INSERT INTO lead_contacts" logic
4. /api/enrich-contacts/route.ts exists with GET handler
5. No existing lead_contacts logic is broken (contacts CRUD still works)
</verification>

<success_criteria>
- repo-sync.ts daily sync now creates lead_contacts entries from BOTH proponentes and BrasilAPI (including telefone_2)
- /api/enrich-contacts backfills all existing leads with multi-contact data
- Leads with 2+ data points have 2+ rows in lead_contacts
- Manually-created contacts are never overwritten or duplicated
- Both files compile and pass TypeScript checks
</success_criteria>

<output>
After completion, create `.planning/quick/12-sobre-os-contatos-se-tiver-2-ou-mais-ent/12-SUMMARY.md`
</output>
