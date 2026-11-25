/**
 * Seed / sync Teams from legacy labwis (Wisden group → Cricket sport).
 * Logos: metadata-only Media rows — filename = static-assets/images/teams/{id}.png (no download).
 *
 *   pnpm seed:teams
 *   pnpm seed:teams -- --dry-run
 */

import 'dotenv/config'
import pg from 'pg'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { ensureS3Media } from './lib/ensure-s3-media'

const DRY_RUN = process.argv.includes('--dry-run')

const SOURCE_DATABASE_URL =
  process.env.SOURCE_DATABASE_URL ||
  'postgresql://USER:PASSWORD@127.0.0.1:5401/siwafmasstg'

/** Legacy Teams role under Wisden group */
const LEGACY_TEAMS_ROLE_ID = 3

type SourceTeam = {
  entity_master_id: number
  entity_name: string
  canonical_url: string | null
  entity_url: string | null
  player_image_path: string | null
  team_id: number | null
  is_active: number | null
}

/** Keep full path slug: team/afghanistan-1188 (same idea as players/...) */
function slugFromRow(row: SourceTeam): string {
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
  const idPart = row.team_id || row.entity_master_id
  return namePart ? `team/${namePart}-${idPart}` : `team/${idPart}`
}

function resolveTeamCdnUrl(row: SourceTeam): string {
  let teamId = row.team_id
  if (!teamId && row.player_image_path?.trim()) {
    const m = row.player_image_path.trim().match(/^(\d+)\.(png|jpe?g|webp|gif)$/i)
    if (m) teamId = Number(m[1])
  }
  if (!teamId) return ''
  return `static-assets/images/teams/${teamId}.png`
}

async function fetchSourceTeams(): Promise<SourceTeam[]> {
  const client = new pg.Client({ connectionString: SOURCE_DATABASE_URL })
  await client.connect()
  try {
    const { rows } = await client.query<SourceTeam>(
      `
      SELECT
        em.entity_master_id::float8 AS entity_master_id,
        em.entity_name,
        em.canonical_url,
        em.entity_url,
        em.player_image_path,
        NULLIF(em.add_info->>'team_id', '')::float8 AS team_id,
        em.is_active::float8 AS is_active
      FROM labwis.labwis_entity_role_map erm
      JOIN labwis.labwis_entity_master em
        ON em.entity_master_id = erm.entity_master_id
      WHERE erm.entity_role_id = $1
        AND COALESCE(erm.is_active, 0) = 1
        AND COALESCE(em.is_deleted, 0) = 0
      ORDER BY em.entity_master_id
    `,
      [LEGACY_TEAMS_ROLE_ID],
    )
    return rows
  } finally {
    await client.end()
  }
}

async function main() {
  console.log(`\nTeams seed — ${DRY_RUN ? 'DRY RUN' : 'LIVE WRITE'}`)
  console.log(`Source: ${SOURCE_DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}`)
  console.log(`Logos: media.filename = static-assets/images/teams/{id}.png\n`)

  const source = await fetchSourceTeams()
  console.log(`Fetched ${source.length} active teams from legacy\n`)

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
  console.log(`Sport: ${cricketDoc.name} (id ${cricketDoc.id})\n`)

  const dest = DRY_RUN ? null : new pg.Client({ connectionString: process.env.DATABASE_URL })
  if (dest) await dest.connect()

  const usedSlugs = new Set<string>()
  let created = 0
  let updated = 0
  let withImage = 0
  let skipped = 0

  try {
    for (let i = 0; i < source.length; i++) {
      const row = source[i]
      let slug = slugFromRow(row)
      if (usedSlugs.has(slug)) {
        slug = `${slug}-${row.entity_master_id}`
      }
      usedSlugs.add(slug)

      const diskPath = resolveTeamCdnUrl(row)
      const teamId =
        row.team_id ||
        (row.player_image_path?.match(/^(\d+)\./)?.[1]
          ? Number(row.player_image_path.match(/^(\d+)\./)?.[1])
          : null)

      if (DRY_RUN) {
        if (i < 5 || i === source.length - 1) {
          console.log(
            `dry: ${row.entity_name} → ${slug}` +
              (diskPath ? ` | logo ${diskPath}` : ' | no logo') +
              ` (legacy ${row.entity_master_id})`,
          )
        } else if (i === 5) {
          console.log('dry: …')
        }
        if (diskPath) withImage++
        created++
        continue
      }

      let imageId: number | undefined
      if (diskPath && teamId && dest) {
        imageId = await ensureS3Media(dest, {
          alt: row.entity_name?.trim() || `Team ${teamId}`,
          diskPath,
        })
        if (imageId) withImage++
      }

      const data = {
        name: row.entity_name?.trim() || `Team ${row.entity_master_id}`,
        slug,
        sport: cricketDoc.id,
        legacyEntityId: row.entity_master_id,
        isActive: row.is_active === 1 || row.is_active == null,
        ...(imageId ? { image: imageId } : {}),
      }

      const existing = await payload.find({
        collection: 'teams',
        where: { legacyEntityId: { equals: row.entity_master_id } },
        limit: 1,
        overrideAccess: true,
      })

      if (existing.docs[0]) {
        await payload.update({
          collection: 'teams',
          id: existing.docs[0].id,
          data,
          overrideAccess: true,
        })
        updated++
      } else {
        try {
          await payload.create({
            collection: 'teams',
            data,
            overrideAccess: true,
          })
          created++
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
            await payload.create({
              collection: 'teams',
              data: { ...data, slug: `${slug}-${row.entity_master_id}` },
              overrideAccess: true,
            })
            created++
          } else {
            skipped++
            console.error(`fail legacy ${row.entity_master_id}: ${msg}`)
          }
        }
      }

      if ((i + 1) % 50 === 0 || i === source.length - 1) {
        console.log(
          `progress ${i + 1}/${source.length} (created ${created}, updated ${updated}, logos ${withImage}, failed ${skipped})`,
        )
      }
    }
  } finally {
    if (dest) await dest.end()
  }

  console.log(
    `\nDone. created=${created} updated=${updated} logos=${withImage} failed=${skipped}`,
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
