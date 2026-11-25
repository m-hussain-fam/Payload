/**
 * Seed / sync Sports from legacy labwis_entity_group (+ Cricket entity_master).
 *
 *   pnpm seed:sports
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../src/payload.config'

function toSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Active sport groups from labwis_entity_group (Wisden meta group excluded). */
const SPORTS = [
  {
    name: 'Cricket',
    slug: 'cricket',
    code: 'cricket',
    legacyEntityId: 7, // entity_master
    legacyGroupId: 2,
  },
  {
    name: 'Football',
    slug: 'football',
    code: 'football',
    legacyEntityId: null,
    legacyGroupId: 3,
  },
  {
    name: 'Tennis',
    slug: 'tennis',
    code: 'tennis',
    legacyEntityId: null,
    legacyGroupId: 4,
  },
  {
    name: 'Badminton',
    slug: 'badminton',
    code: 'badminton',
    legacyEntityId: null,
    legacyGroupId: 5,
  },
  {
    name: 'Kabaddi',
    slug: 'kabaddi',
    code: 'kabaddi',
    legacyEntityId: null,
    legacyGroupId: 6,
  },
  {
    name: 'Formula 1',
    slug: 'formula-1',
    code: 'formula-1',
    legacyEntityId: null,
    legacyGroupId: 7,
  },
] as const

async function main() {
  const payload = await getPayload({ config })

  for (const sport of SPORTS) {
    const slug = sport.slug || toSlug(sport.name)

    const existing = await payload.find({
      collection: 'sports',
      where: {
        or: [
          { legacyGroupId: { equals: sport.legacyGroupId } },
          ...(sport.legacyEntityId
            ? [{ legacyEntityId: { equals: sport.legacyEntityId } }]
            : []),
          { slug: { equals: slug } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })

    const data = {
      name: sport.name,
      slug,
      code: sport.code,
      legacyEntityId: sport.legacyEntityId ?? undefined,
      legacyGroupId: sport.legacyGroupId,
      isActive: true,
    }

    if (existing.docs[0]) {
      await payload.update({
        collection: 'sports',
        id: existing.docs[0].id,
        data,
        overrideAccess: true,
      })
      console.log(`updated: ${sport.name} (group ${sport.legacyGroupId})`)
      continue
    }

    await payload.create({
      collection: 'sports',
      data,
      overrideAccess: true,
    })
    console.log(`created: ${sport.name} (group ${sport.legacyGroupId})`)
  }

  console.log('Done.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
