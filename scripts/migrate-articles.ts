/**
 * Migrate published articles from legacy labwis → Payload.
 * - bodyHtml = full_text (HTML); body (Lexical) left empty
 * - Relations: categories, tags, players, teams, series (Language skipped)
 * - Cover: metadata-only Media — filename = static-assets/waf-images/... (no download)
 *
 *   pnpm migrate:articles
 *   pnpm migrate:articles -- --dry-run
 *   pnpm migrate:articles -- --limit=100
 *   pnpm migrate:articles -- --offset=500
 */

import 'dotenv/config'
import pg from 'pg'
import { getPayload, type Payload } from 'payload'
import config from '../src/payload.config'
import { ensureS3Media } from './lib/ensure-s3-media'

const DRY_RUN = process.argv.includes('--dry-run')
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 0) || 0
const OFFSET = Number(process.argv.find((a) => a.startsWith('--offset='))?.split('=')[1] || 0) || 0
const PAGE_SIZE = 100
const IDS = (process.argv.find((a) => a.startsWith('--ids='))?.slice('--ids='.length) || '')
  .split(/[,\s]+/)
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)

const SOURCE_DATABASE_URL =
  process.env.SOURCE_DATABASE_URL ||
  'postgresql://USER:PASSWORD@127.0.0.1:5401/siwafmasstg'

/** Legacy entity_role_id → Payload collection */
const ROLE = {
  categories: 1,
  tags: 22,
  teams: 3,
  series: 6,
  players: 102,
  // language: 2 — skipped
} as const

type SourceArticle = {
  article_id: number
  title: string | null
  title_alias: string | null
  intro_text: string | null
  full_text: string | null
  browser_title: string | null
  published_date: Date | string | null
  is_published: number | null
  author_id: number | null
  image_path: string | null
  image_file_name: string | null
  short_desc: string | null
  meta_desc: string | null
  keywords: string | null
  custom_meta: string | null
  seo_browser_title: string | null
}

type EntityLink = {
  asset_id: number
  entity_role_id: number
  entity_master_id: number
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Full S3-relative key including static-assets/ */
function resolveCoverPath(imagePath: string | null, fileName: string | null): string {
  if (!imagePath?.trim() || !fileName?.trim()) return ''
  const pathPart = imagePath.trim().replace(/^\/+/, '')
  const file = fileName.trim().replace(/^\/+/, '')
  return `static-assets/waf-images/${pathPart}${file}`
}

async function loadIdMap(
  payload: Payload,
  collection:
    | 'categories'
    | 'tags'
    | 'players'
    | 'teams'
    | 'series'
    | 'users',
  field: 'legacyEntityId' | 'legacyUserId',
): Promise<Map<number, number | string>> {
  const map = new Map<number, number | string>()
  let page = 1
  for (;;) {
    const res = await payload.find({
      collection,
      limit: 500,
      page,
      depth: 0,
      overrideAccess: true,
    })
    for (const doc of res.docs) {
      const legacy = (doc as Record<string, unknown>)[field]
      if (legacy != null && legacy !== '') map.set(Number(legacy), doc.id)
    }
    if (!res.hasNextPage) break
    page++
  }
  return map
}

async function fetchArticlesPage(
  client: pg.Client,
  offset: number,
  limit: number,
  onlyIds: number[] = [],
): Promise<SourceArticle[]> {
  const { rows } = await client.query<SourceArticle>(
    `
    SELECT
      a.article_id::float8 AS article_id,
      a.title,
      a.title_alias,
      a.intro_text,
      a.full_text,
      a.browser_title,
      a.published_date,
      a.is_published::float8 AS is_published,
      al.author_id::float8 AS author_id,
      al.image_path,
      al.image_file_name,
      al.short_desc,
      al.web_detail_jsn#>>'{data,seo,meta_desc}' AS meta_desc,
      al.web_detail_jsn#>>'{data,seo,keywords}' AS keywords,
      al.web_detail_jsn#>>'{data,seo,custom_meta}' AS custom_meta,
      COALESCE(
        al.web_detail_jsn#>>'{data,seo,browser_title}',
        a.browser_title
      ) AS seo_browser_title
    FROM labwis.labwis_article a
    JOIN labwis.labwis_asset_list al ON al.asset_id = a.article_id
    WHERE COALESCE(a.is_deleted, 0) = 0
      AND COALESCE(a.is_published, 0) = 1
      AND (
        CARDINALITY($3::numeric[]) = 0
        OR a.article_id = ANY($3::numeric[])
      )
    ORDER BY a.article_id
    OFFSET $1 LIMIT $2
  `,
    [offset, limit, onlyIds],
  )
  return rows
}

async function fetchEntityLinks(client: pg.Client, assetIds: number[]): Promise<EntityLink[]> {
  if (!assetIds.length) return []
  const { rows } = await client.query<EntityLink>(
    `
    SELECT
      aem.asset_id::float8 AS asset_id,
      er.entity_role_id::float8 AS entity_role_id,
      em.entity_master_id::float8 AS entity_master_id
    FROM labwis.labwis_asset_entity_map aem
    JOIN labwis.labwis_entity_role_map erm
      ON erm.entity_role_map_id = aem.entity_role_map_id
    JOIN labwis.labwis_entity_role er
      ON er.entity_role_id = erm.entity_role_id
    JOIN labwis.labwis_entity_master em
      ON em.entity_master_id = erm.entity_master_id
    WHERE aem.asset_id = ANY($1::numeric[])
      AND COALESCE(aem.is_deleted, 0) = 0
      AND er.entity_role_id = ANY($2::numeric[])
  `,
    [assetIds, [ROLE.categories, ROLE.tags, ROLE.teams, ROLE.series, ROLE.players]],
  )
  return rows
}

function mapIds(
  links: EntityLink[],
  roleId: number,
  lookup: Map<number, number | string>,
): (number | string)[] {
  const out: (number | string)[] = []
  const seen = new Set<string>()
  for (const link of links) {
    if (link.entity_role_id !== roleId) continue
    const id = lookup.get(link.entity_master_id)
    if (id == null) continue
    const key = String(id)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(id)
  }
  return out
}

async function main() {
  console.log(`\nArticles migrate — ${DRY_RUN ? 'DRY RUN' : 'LIVE WRITE'}`)
  console.log(`Source: ${SOURCE_DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}`)
  console.log(`Cover: media.filename = static-assets/waf-images/{path}{file}`)
  console.log(`Offset=${OFFSET} Limit=${LIMIT || 'all'} PageSize=${PAGE_SIZE}`)
  if (IDS.length) console.log(`Only IDs: ${IDS.length} article(s)`)
  console.log(`Relations: categories, tags, players, teams, series (Language skipped)\n`)

  const source = new pg.Client({ connectionString: SOURCE_DATABASE_URL })
  await source.connect()

  const payload = await getPayload({ config })

  console.log('Loading Payload ID maps…')
  const [categoriesMap, tagsMap, playersMap, teamsMap, seriesMap, usersMap] = await Promise.all([
    loadIdMap(payload, 'categories', 'legacyEntityId'),
    loadIdMap(payload, 'tags', 'legacyEntityId'),
    loadIdMap(payload, 'players', 'legacyEntityId'),
    loadIdMap(payload, 'teams', 'legacyEntityId'),
    loadIdMap(payload, 'series', 'legacyEntityId'),
    loadIdMap(payload, 'users', 'legacyUserId'),
  ])
  console.log(
    `Maps: categories=${categoriesMap.size} tags=${tagsMap.size} players=${playersMap.size} teams=${teamsMap.size} series=${seriesMap.size} users=${usersMap.size}`,
  )

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
  const cricketId = cricket.docs[0]?.id
  if (!cricketId) throw new Error('Cricket sport not found — run pnpm seed:sports first')
  console.log(`Sport: Cricket (id ${cricketId})\n`)

  const dest = DRY_RUN ? null : new pg.Client({ connectionString: process.env.DATABASE_URL })
  if (dest) await dest.connect()

  const usedSlugs = new Set<string>()
  let created = 0
  let updated = 0
  let skipped = 0
  let withCover = 0
  let processed = 0

  try {
    let offset = OFFSET
    for (;;) {
      const remaining = LIMIT > 0 ? Math.max(0, LIMIT - processed) : PAGE_SIZE
      if (LIMIT > 0 && remaining === 0) break
      const take = LIMIT > 0 ? Math.min(PAGE_SIZE, remaining) : PAGE_SIZE

      const page = await fetchArticlesPage(source, offset, take, IDS)
      if (!page.length) break

      const assetIds = page.map((r) => r.article_id)
      const allLinks = await fetchEntityLinks(source, assetIds)
      const linksByAsset = new Map<number, EntityLink[]>()
      for (const link of allLinks) {
        const list = linksByAsset.get(link.asset_id) || []
        list.push(link)
        linksByAsset.set(link.asset_id, list)
      }

      for (const row of page) {
        processed++
        const links = linksByAsset.get(row.article_id) || []

        let slug = (row.title_alias || '').trim().toLowerCase() || slugify(row.title || '') || `article-${row.article_id}`
        if (usedSlugs.has(slug)) slug = `${slug}-${row.article_id}`
        usedSlugs.add(slug)

        const coverPath = resolveCoverPath(row.image_path, row.image_file_name)
        const authorId = row.author_id != null ? usersMap.get(Number(row.author_id)) : undefined

        const data: Record<string, unknown> = {
          title: row.title?.trim() || `Article ${row.article_id}`,
          slug,
          excerpt: row.intro_text?.trim() || row.short_desc?.trim() || undefined,
          bodyHtml: row.full_text || undefined,
          sport: cricketId,
          author: authorId,
          categories: mapIds(links, ROLE.categories, categoriesMap),
          tags: mapIds(links, ROLE.tags, tagsMap),
          players: mapIds(links, ROLE.players, playersMap),
          teams: mapIds(links, ROLE.teams, teamsMap),
          series: mapIds(links, ROLE.series, seriesMap),
          seo: {
            title: row.seo_browser_title?.trim() || row.browser_title?.trim() || undefined,
            description: row.meta_desc?.trim() || undefined,
            keywords: row.keywords?.trim() || undefined,
            customMeta: row.custom_meta?.trim() || undefined,
          },
          status: 'published',
          publishedAt: row.published_date ? new Date(row.published_date).toISOString() : undefined,
          legacyArticleId: row.article_id,
        }

        if (DRY_RUN) {
          if (processed <= 3 || (LIMIT && processed === LIMIT)) {
            console.log(
              `dry: ${data.title} → ${slug} | cats=${(data.categories as unknown[]).length} tags=${(data.tags as unknown[]).length} players=${(data.players as unknown[]).length} teams=${(data.teams as unknown[]).length} series=${(data.series as unknown[]).length}` +
                (coverPath ? ` | cover ${coverPath}` : ''),
            )
          }
          if (coverPath) withCover++
          created++
          continue
        }

        if (coverPath && dest) {
          const mediaId = await ensureS3Media(dest, {
            alt: String(data.title),
            diskPath: coverPath,
          })
          if (mediaId) {
            data.coverImage = mediaId
            withCover++
          }
        }

        try {
          const existing = await payload.find({
            collection: 'articles',
            where: { legacyArticleId: { equals: row.article_id } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })

          if (existing.docs[0]) {
            await payload.update({
              collection: 'articles',
              id: existing.docs[0].id,
              data,
              draft: false,
              overrideAccess: true,
            })
            updated++
          } else {
            try {
              await payload.create({
                collection: 'articles',
                data,
                draft: false,
                overrideAccess: true,
              })
              created++
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
                await payload.create({
                  collection: 'articles',
                  data: { ...data, slug: `${slug}-${row.article_id}` },
                  draft: false,
                  overrideAccess: true,
                })
                created++
              } else {
                skipped++
                console.error(`fail article ${row.article_id}: ${msg}`)
              }
            }
          }
        } catch (err) {
          skipped++
          console.error(`fail article ${row.article_id}:`, err)
        }

        if (processed % 100 === 0) {
          console.log(
            `progress ${processed} (created ${created}, updated ${updated}, covers ${withCover}, failed ${skipped})`,
          )
        }
      }

      offset += page.length
      if (page.length < take) break
    }
  } finally {
    await source.end()
    if (dest) await dest.end()
  }

  console.log(
    `\nDone. processed=${processed} created=${created} updated=${updated} covers=${withCover} failed=${skipped}`,
  )
  process.exit(skipped > 0 && created + updated === 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
