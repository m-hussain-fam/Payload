/**
 * Seed / sync Categories from legacy labwis (Wisden → Cricket).
 *
 *   pnpm seed:categories
 */

import 'dotenv/config'
import pg from 'pg'
import { getPayload } from 'payload'
import config from '../src/payload.config'

const DRY_RUN = process.argv.includes('--dry-run')

const SOURCE_DATABASE_URL =
  process.env.SOURCE_DATABASE_URL ||
  'postgresql://USER:PASSWORD@127.0.0.1:5401/siwafmasstg'

/** Legacy Categories role under Wisden group */
const LEGACY_CATEGORIES_ROLE_ID = 1

type SourceCategory = {
  entity_master_id: number
  entity_name: string
  canonical_url: string | null
  entity_url: string | null
  is_active: number | null
}

/** Keep full path slug: cricket-news, cricket-betting/about-betting */
function slugFromRow(row: SourceCategory): string {
  const raw = (row.canonical_url || row.entity_url || '').trim().replace(/^\/+|\/+$/g, '')
  if (raw) {
    const cleaned = raw
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9/.-]+/g, '-')
      .replace(/\/+/g, '/')
      .replace(/^-+|-+$/g, '')
    if (cleaned) return cleaned
  }
  const namePart = (row.entity_name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return namePart || `category-${row.entity_master_id}`
}

async function fetchSourceCategories(): Promise<SourceCategory[]> {
  const client = new pg.Client({ connectionString: SOURCE_DATABASE_URL })
  await client.connect()
  try {
    const { rows } = await client.query<SourceCategory>(
      `
      SELECT
        em.entity_master_id::float8 AS entity_master_id,
        em.entity_name,
        em.canonical_url,
        em.entity_url,
        em.is_active::float8 AS is_active
      FROM labwis.labwis_entity_role_map erm
      JOIN labwis.labwis_entity_master em
        ON em.entity_master_id = erm.entity_master_id
      WHERE erm.entity_role_id = $1
        AND COALESCE(erm.is_active, 0) = 1
        AND COALESCE(em.is_deleted, 0) = 0
      ORDER BY em.entity_master_id
    `,
      [LEGACY_CATEGORIES_ROLE_ID],
    )
    return rows
  } finally {
    await client.end()
  }
}

async function main() {
  console.log(`\nCategories seed — ${DRY_RUN ? 'DRY RUN' : 'LIVE WRITE'}`)
  console.log(`Source: ${SOURCE_DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}`)

  const source = await fetchSourceCategories()
  console.log(`Fetched ${source.length} active categories from legacy\n`)

  const payload = await getPayload({ config })

  const cricket = await payload.find({
    collection: 'sports',
    where: {
      or: [
        { slug: { equals: 'cricket' } },
        { legacyEntityId: { equals: 7 } },
        { legacyGroupId: { equals: 2 } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })

  const cricketDoc = cricket.docs[0]
  if (!cricketDoc) {
    throw new Error('Cricket sport not found — run pnpm seed:sports first')
  }

  const usedSlugs = new Set<string>()
  let created = 0
  let updated = 0
  let skipped = 0

  for (const row of source) {
    let slug = slugFromRow(row)
    if (usedSlugs.has(slug)) {
      slug = `${slug}-${row.entity_master_id}`
    }
    usedSlugs.add(slug)

    const data = {
      name: row.entity_name?.trim() || `Category ${row.entity_master_id}`,
      slug,
      sport: cricketDoc.id,
      legacyEntityId: row.entity_master_id,
      isActive: row.is_active === 1 || row.is_active == null,
    }

    if (DRY_RUN) {
      console.log(`dry: ${data.name} → ${data.slug} (legacy ${data.legacyEntityId})`)
      created++
      continue
    }

    const existing = await payload.find({
      collection: 'categories',
      where: { legacyEntityId: { equals: row.entity_master_id } },
      limit: 1,
      overrideAccess: true,
    })

    if (existing.docs[0]) {
      await payload.update({
        collection: 'categories',
        id: existing.docs[0].id,
        data,
        overrideAccess: true,
      })
      console.log(`updated: ${data.name}`)
      updated++
    } else {
      try {
        await payload.create({
          collection: 'categories',
          data,
          overrideAccess: true,
        })
        console.log(`created: ${data.name}`)
        created++
      } catch (err) {
        skipped++
        console.error(`fail legacy ${row.entity_master_id}:`, err)
      }
    }
  }

  console.log(`\nDone. created=${created} updated=${updated} failed=${skipped}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
