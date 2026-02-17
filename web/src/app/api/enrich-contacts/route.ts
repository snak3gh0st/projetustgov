import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { getApiSession } from '@/lib/dal'
import { formatPhone } from '@/lib/repo-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePhone(phone: string | null | undefined): string {
  return phone ? String(phone).replace(/\D/g, '') : ''
}

function normalizeEmail(email: string | null | undefined): string {
  return email ? String(email).trim().toLowerCase() : ''
}

/**
 * Returns true if an existing set of contact fingerprints already contains
 * a match for the given telefone or email (normalized comparison).
 */
function isDuplicate(
  existingPhones: Set<string>,
  existingEmails: Set<string>,
  telefone: string | null,
  email: string | null
): boolean {
  const p = normalizePhone(telefone)
  const e = normalizeEmail(email)
  if (p && existingPhones.has(p)) return true
  if (e && existingEmails.has(e)) return true
  return false
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// GET /api/enrich-contacts
// Backfill lead_contacts for all existing leads from vendedor_projetos +
// BrasilAPI. Gestor-only. One-time operation safe to re-run (no duplicates).
// ---------------------------------------------------------------------------
export async function GET() {
  const session = await getApiSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.role !== 'gestor') {
    return NextResponse.json({ error: 'Forbidden: gestor only' }, { status: 403 })
  }

  const startTime = Date.now()
  const pool = getPool()
  const client = await pool.connect()

  let cnpjs_processed = 0
  let contacts_created = 0
  let contacts_skipped_duplicate = 0
  let api_errors = 0

  try {
    // -----------------------------------------------------------------------
    // 1. Get all unique CNPJs with contact data from vendedor_projetos
    // -----------------------------------------------------------------------
    const projRes = await client.query(
      `SELECT DISTINCT cnpj, telefone, email FROM vendedor_projetos WHERE cnpj IS NOT NULL`
    )
    const projRows: { cnpj: string; telefone: string | null; email: string | null }[] = projRes.rows

    // Build unique CNPJ list
    const cnpjSet = new Set<string>()
    const cnpjContactMap = new Map<string, { telefone: string | null; email: string | null }>()
    for (const row of projRows) {
      const cnpj = row.cnpj
      if (!cnpjSet.has(cnpj)) {
        cnpjSet.add(cnpj)
        cnpjContactMap.set(cnpj, { telefone: row.telefone, email: row.email })
      } else {
        // If a later row has contact data that the first didn't, prefer non-null
        const existing = cnpjContactMap.get(cnpj)!
        if (!existing.telefone && row.telefone) existing.telefone = row.telefone
        if (!existing.email && row.email) existing.email = row.email
      }
    }
    const allCnpjs = Array.from(cnpjSet)

    // -----------------------------------------------------------------------
    // 2. Pre-load ALL existing lead_contacts to avoid N+1 queries
    // -----------------------------------------------------------------------
    const lcRes = await client.query(
      `SELECT lead_cnpj, telefone, email FROM lead_contacts`
    )
    // Map<cnpj, { phones: Set<string>, emails: Set<string> }>
    const existingContactMap = new Map<string, { phones: Set<string>; emails: Set<string> }>()
    for (const row of lcRes.rows as { lead_cnpj: string; telefone: string | null; email: string | null }[]) {
      if (!existingContactMap.has(row.lead_cnpj)) {
        existingContactMap.set(row.lead_cnpj, { phones: new Set(), emails: new Set() })
      }
      const entry = existingContactMap.get(row.lead_cnpj)!
      const p = normalizePhone(row.telefone)
      const e = normalizeEmail(row.email)
      if (p) entry.phones.add(p)
      if (e) entry.emails.add(e)
    }

    // -----------------------------------------------------------------------
    // 3. Process each CNPJ
    // -----------------------------------------------------------------------
    for (const cnpj of allCnpjs) {
      // Timeout check
      if (Date.now() - startTime > 100000) {
        console.log('[enrich-contacts] Elapsed >100s, stopping early')
        break
      }

      cnpjs_processed++

      // Get or create existing contact tracking for this CNPJ
      if (!existingContactMap.has(cnpj)) {
        existingContactMap.set(cnpj, { phones: new Set(), emails: new Set() })
      }
      const existing = existingContactMap.get(cnpj)!
      const hasExistingContacts = existing.phones.size > 0 || existing.emails.size > 0
      let firstContactForCnpj = !hasExistingContacts

      // Helper: insert a contact (returns true if inserted)
      const insertContact = async (telefone: string | null, email: string | null): Promise<boolean> => {
        if (!telefone && !email) return false

        if (isDuplicate(existing.phones, existing.emails, telefone, email)) {
          contacts_skipped_duplicate++
          return false
        }

        const principal = firstContactForCnpj
        firstContactForCnpj = false

        await client.query(
          `INSERT INTO lead_contacts (lead_cnpj, telefone, email, principal, telefone_status)
           VALUES ($1, $2, $3, $4, 'desconhecido')`,
          [cnpj, telefone || null, email || null, principal]
        )

        // Update tracking sets in memory
        const p = normalizePhone(telefone)
        const e = normalizeEmail(email)
        if (p) existing.phones.add(p)
        if (e) existing.emails.add(e)
        contacts_created++
        return true
      }

      // iii-ii. Insert vendedor_projetos contact data (from proponentes via import)
      const projContact = cnpjContactMap.get(cnpj)
      if (projContact) {
        const projPhone = formatPhone(projContact.telefone)
        const projEmail =
          projContact.email && projContact.email.includes('@')
            ? projContact.email.trim().toLowerCase()
            : null
        if (projPhone || projEmail) {
          await insertContact(projPhone, projEmail)
        }
      }

      // iii-iii. Call BrasilAPI for this CNPJ
      try {
        const apiRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
          signal: AbortSignal.timeout(10000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProjetusCRM/1.0)' },
        })

        if (apiRes.ok) {
          const data = await apiRes.json()
          const phone1 = formatPhone(data.ddd_telefone_1 || '')
          const phone2 = formatPhone(data.ddd_telefone_2 || '')
          const rawEmail = (data.email || '').trim().toLowerCase()
          const apiEmail =
            rawEmail && rawEmail !== 'none' && rawEmail !== 'null' && rawEmail.includes('@')
              ? rawEmail
              : null

          // Insert BrasilAPI telefone_1 + email
          if (phone1 || apiEmail) {
            await insertContact(phone1, apiEmail)
          }

          // Insert BrasilAPI telefone_2 as separate entry (only if different from phone1)
          if (phone2) {
            const phone2Digits = normalizePhone(phone2)
            const phone1Digits = normalizePhone(phone1)
            if (phone2Digits && phone2Digits !== phone1Digits) {
              await insertContact(phone2, null)
            }
          }
        }
      } catch {
        api_errors++
      }

      // Rate limit: 300ms between BrasilAPI calls
      await delay(300)
    }
  } finally {
    client.release()
  }

  const elapsed_ms = Date.now() - startTime

  return NextResponse.json({
    success: true,
    cnpjs_processed,
    contacts_created,
    contacts_skipped_duplicate,
    api_errors,
    elapsed_ms,
  })
}
