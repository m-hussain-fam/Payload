/**
 * Seed / sync Players from legacy labwis (Wisden group → Cricket).
 * Images: metadata-only Media rows — filename = static-assets/images/players/{id}.png (no download).
 *
 *   pnpm seed:players
 *   pnpm seed:players -- --dry-run
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

/** Legacy Players role under Wisden group (entity_type 53) */
const LEGACY_PLAYERS_ROLE_ID = 102

type SourcePlayer = {
  entity_master_id: number
  entity_name: string
  canonical_url: string | null
  entity_url: string | null
  player_image_path: string | null
  player_id: number | null
  is_active: number | null
}

/** Keep full path slug: players/aaron-finch-4196 */
function slugFromRow(row: SourcePlayer): string {
  const raw = (row.canonical_url || row.entity_url || '').trim().replace(/^\/+|\/+$/g, '')
  if (raw) {
    // normalize but keep players/ prefix and slashes as path segments → single slug string
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
  const idPart = row.player_id || row.entity_master_id
  return namePart ? `players/${namePart}-${idPart}` : `players/${idPart}`
}

function resolvePlayerCdnUrl(row: SourcePlayer): string {
  const fromPath = row.player_image_path?.trim()
  let playerId = row.player_id

  if (!playerId && fromPath) {
    const m = fromPath.match(/^(\d+)\.(png|jpe?g|webp|gif)$/i)
    if (m) playerId = Number(m[1])
  }

  if (!playerId) return ''

  // Full S3-relative key (include static-assets; Payload S3 prefix stays empty until confirmed)
  return `static-assets/images/players/${playerId}.png`
}

async function fetchSourcePlayers(): Promise<SourcePlayer[]> {
  const client = new pg.Client({ connectionString: SOURCE_DATABASE_URL })
  await client.connect()
  try {
    const { rows } = await client.query<SourcePlayer>(
      `
      SELECT
        em.entity_master_id::float8 AS entity_master_id,
        em.entity_name,
        em.canonical_url,
        em.entity_url,
        em.player_image_path,
        NULLIF(em.add_info->>'player_id', '')::float8 AS player_id,
        em.is_active::float8 AS is_active
      FROM labwis.labwis_entity_role_map erm
      JOIN labwis.labwis_entity_master em
        ON em.entity_master_id = erm.entity_master_id
      WHERE erm.entity_role_id = $1
        AND COALESCE(erm.is_active, 0) = 1
        AND COALESCE(em.is_deleted, 0) = 0
      ORDER BY em.entity_master_id
    `,
      [LEGACY_PLAYERS_ROLE_ID],
    )
    return rows
  } finally {
    await client.end()
  }
}

async function main() {
  console.log(`\nPlayers seed — ${DRY_RUN ? 'DRY RUN' : 'LIVE WRITE'}`)
  console.log(`Source: ${SOURCE_DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}`)
  console.log(`Images: media.filename = static-assets/images/players/{id}.png\n`)

  const source = await fetchSourcePlayers()
  console.log(`Fetched ${source.length} active players from legacy\n`)

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

      const diskPath = resolvePlayerCdnUrl(row)
      const playerId =
        row.player_id ||
        (row.player_image_path?.match(/^(\d+)\./)?.[1]
          ? Number(row.player_image_path.match(/^(\d+)\./)?.[1])
          : null)

      if (DRY_RUN) {
        if (i < 5 || i === source.length - 1) {
          console.log(
            `dry: ${row.entity_name} → ${slug}` +
              (diskPath ? ` | img ${diskPath}` : ' | no img') +
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
      if (diskPath && playerId && dest) {
        imageId = await ensureS3Media(dest, {
          alt: row.entity_name?.trim() || `Player ${playerId}`,
          diskPath,
        })
        if (imageId) withImage++
      }

      const data = {
        name: row.entity_name?.trim() || `Player ${row.entity_master_id}`,
        slug,
        sport: cricketDoc.id,
        legacyEntityId: row.entity_master_id,
        isActive: row.is_active === 1 || row.is_active == null,
        ...(imageId ? { image: imageId } : {}),
      }

      const existing = await payload.find({
        collection: 'players',
        where: { legacyEntityId: { equals: row.entity_master_id } },
        limit: 1,
        overrideAccess: true,
      })

      if (existing.docs[0]) {
        await payload.update({
          collection: 'players',
          id: existing.docs[0].id,
          data,
          overrideAccess: true,
        })
        updated++
      } else {
        try {
          await payload.create({
            collection: 'players',
            data,
            overrideAccess: true,
          })
          created++
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
            await payload.create({
              collection: 'players',
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

      if ((i + 1) % 500 === 0 || i === source.length - 1) {
        console.log(
          `progress ${i + 1}/${source.length} (created ${created}, updated ${updated}, images ${withImage}, failed ${skipped})`,
        )
      }
    }
  } finally {
    if (dest) await dest.end()
  }

  console.log(
    `\nDone. created=${created} updated=${updated} images=${withImage} failed=${skipped}`,
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
