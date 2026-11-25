/**
 * Seed / sync Advertisements from legacy labwis_advertisement.
 * - kind: staticPage if waf-static / Terms|Privacy|Contact|Cookie|Returns|Policy title
 * - clients: 1=desktop, 2=mobile, 3=app
 * - Ad Positions NOT migrated
 *
 *   pnpm seed:advertisements
 *   pnpm seed:advertisements -- --dry-run
 */

import 'dotenv/config'
import pg from 'pg'
import { getPayload } from 'payload'
import config from '../src/payload.config'

const DRY_RUN = process.argv.includes('--dry-run')

const SOURCE_DATABASE_URL =
  process.env.SOURCE_DATABASE_URL ||
  'postgresql://USER:PASSWORD@127.0.0.1:5401/siwafmasstg'

type SourceAd = {
  ad_id: number
  ad_title: string | null
  ad_code: string | null
  ad_client: number[] | null
  is_active: number | null
  is_published: number | null
}

const CLIENT_MAP: Record<number, 'desktop' | 'mobile' | 'app'> = {
  1: 'desktop',
  2: 'mobile',
  3: 'app',
}

function detectKind(title: string | null, code: string | null): 'ad' | 'staticPage' {
  const t = (title || '').toLowerCase()
  const c = (code || '').toLowerCase()
  if (c.includes('waf-static')) return 'staticPage'
  if (
    /\bterms\b/.test(t) ||
    /\bprivacy\b/.test(t) ||
    /\bcontact\b/.test(t) ||
    /\bcookie/.test(t) ||
    /\breturns\b/.test(t) ||
    /\bpolicy\b/.test(t)
  ) {
    return 'staticPage'
  }
  return 'ad'
}

function mapClients(raw: number[] | null): ('desktop' | 'mobile' | 'app')[] {
  if (!raw?.length) return []
  const out: ('desktop' | 'mobile' | 'app')[] = []
  const seen = new Set<string>()
  for (const id of raw) {
    const v = CLIENT_MAP[Number(id)]
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

async function fetchSourceAds(): Promise<SourceAd[]> {
  const client = new pg.Client({ connectionString: SOURCE_DATABASE_URL })
  await client.connect()
  try {
    const { rows } = await client.query<SourceAd>(`
      SELECT
        ad_id::float8 AS ad_id,
        ad_title,
        ad_code,
        ad_client,
        is_active::float8 AS is_active,
        is_published::float8 AS is_published
      FROM labwis.labwis_advertisement
      WHERE COALESCE(is_deleted, 0) = 0
      ORDER BY ad_id
    `)
    return rows
  } finally {
    await client.end()
  }
}

async function main() {
  console.log(`\nAdvertisements seed — ${DRY_RUN ? 'DRY RUN' : 'LIVE WRITE'}`)
  console.log(`Source: ${SOURCE_DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}\n`)

  const source = await fetchSourceAds()
  console.log(`Fetched ${source.length} advertisements from legacy\n`)

  const payload = await getPayload({ config })

  let created = 0
  let updated = 0
  let skipped = 0
  let staticPages = 0

  for (let i = 0; i < source.length; i++) {
    const row = source[i]
    const kind = detectKind(row.ad_title, row.ad_code)
    if (kind === 'staticPage') staticPages++

    const data = {
      title: row.ad_title?.trim() || `Ad ${row.ad_id}`,
      kind,
      code: row.ad_code || undefined,
      clients: mapClients(row.ad_client),
      isActive: row.is_published === 1 || row.is_active === 1 || row.is_active == null,
      legacyAdId: row.ad_id,
    }

    if (DRY_RUN) {
      if (i < 5 || kind === 'staticPage' || i === source.length - 1) {
        console.log(
          `dry: [${kind}] ${data.title} → clients=${data.clients.join(',') || '—'} (legacy ${row.ad_id})`,
        )
      } else if (i === 5) {
        console.log('dry: …')
      }
      created++
      continue
    }

    const existing = await payload.find({
      collection: 'advertisements',
      where: { legacyAdId: { equals: row.ad_id } },
      limit: 1,
      overrideAccess: true,
    })

    try {
      if (existing.docs[0]) {
        await payload.update({
          collection: 'advertisements',
          id: existing.docs[0].id,
          data,
          overrideAccess: true,
        })
        updated++
      } else {
        await payload.create({
          collection: 'advertisements',
          data,
          overrideAccess: true,
        })
        created++
      }
    } catch (err) {
      skipped++
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`fail ad ${row.ad_id}: ${msg}`)
    }

    if ((i + 1) % 25 === 0 || i === source.length - 1) {
      console.log(
        `progress ${i + 1}/${source.length} (created ${created}, updated ${updated}, static ${staticPages}, failed ${skipped})`,
      )
    }
  }

  console.log(
    `\nDone. created=${created} updated=${updated} staticPages=${staticPages} failed=${skipped}`,
  )
  process.exit(skipped > 0 && created + updated === 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
