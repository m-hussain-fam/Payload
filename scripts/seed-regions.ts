/**
 * Seed / sync Regions from known Wisden entity_master rows.
 *
 *   pnpm exec tsx scripts/seed-regions.ts
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../src/payload.config'

const REGIONS = [
  {
    name: 'Global',
    slug: 'global',
    code: 'global',
    legacyEntityId: 191967,
  },
  {
    name: 'India',
    slug: 'india',
    code: 'in',
    legacyEntityId: 191927,
  },
  {
    name: 'United Kingdom',
    slug: 'united-kingdom',
    code: 'gb',
    legacyEntityId: 191947,
  },
  {
    name: 'Rest of Asia',
    slug: 'rest-of-asia',
    code: 'rest-of-asia',
    legacyEntityId: 191907,
  },
] as const

async function main() {
  const payload = await getPayload({ config })

  for (const region of REGIONS) {
    const existing = await payload.find({
      collection: 'regions',
      where: { legacyEntityId: { equals: region.legacyEntityId } },
      limit: 1,
      overrideAccess: true,
    })

    if (existing.docs[0]) {
      await payload.update({
        collection: 'regions',
        id: existing.docs[0].id,
        data: {
          name: region.name,
          slug: region.slug,
          code: region.code,
          isActive: true,
        },
        overrideAccess: true,
      })
      console.log(`updated: ${region.name} (legacy ${region.legacyEntityId})`)
      continue
    }

    await payload.create({
      collection: 'regions',
      data: {
        name: region.name,
        slug: region.slug,
        code: region.code,
        legacyEntityId: region.legacyEntityId,
        isActive: true,
      },
      overrideAccess: true,
    })
    console.log(`created: ${region.name} (legacy ${region.legacyEntityId})`)
  }

  console.log('Done.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
