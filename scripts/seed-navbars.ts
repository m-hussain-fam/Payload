/**
 * Dummy Header nav for Global region.
 * Top items can omit URL (dropdown-only labels).
 *
 *   pnpm seed:navbars
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../src/payload.config'

const DUMMY_ITEMS = [
  { label: 'Home', url: '/', openInNewTab: false, children: [] },
  { label: 'News', url: '/news', openInNewTab: false, children: [] },
  { label: 'Scores', url: '/scores', openInNewTab: false, children: [] },
  {
    label: 'Series',
    // no url — dropdown-only parent
    openInNewTab: false,
    children: [
      { label: 'IPL 2026', url: '/series/ipl-2026', openInNewTab: false },
      { label: 'World Cup', url: '/series/world-cup', openInNewTab: false },
      { label: 'The Ashes', url: '/series/the-ashes', openInNewTab: false },
    ],
  },
  { label: 'Videos', url: '/videos', openInNewTab: false, children: [] },
  { label: 'Photos', url: '/photos', openInNewTab: false, children: [] },
  { label: 'Quizzes', url: '/quizzes', openInNewTab: false, children: [] },
  { label: 'Features', url: '/features', openInNewTab: false, children: [] },
  { label: 'Cricketbet', url: '/cricketbet', openInNewTab: false, children: [] },
  { label: 'About Wisden', url: '/about', openInNewTab: false, children: [] },
]

async function main() {
  const payload = await getPayload({ config })

  const regions = await payload.find({
    collection: 'regions',
    where: { slug: { equals: 'global' } },
    limit: 1,
    overrideAccess: true,
  })

  const region = regions.docs[0]
  if (!region) {
    throw new Error('Region "global" not found — run seed:regions first')
  }

  const existing = await payload.find({
    collection: 'navbars',
    where: { region: { equals: region.id } },
    limit: 1,
    overrideAccess: true,
  })

  const data = {
    title: 'Header — Global',
    region: region.id,
    items: DUMMY_ITEMS,
    isActive: true,
  }

  if (existing.docs[0]) {
    await payload.update({
      collection: 'navbars',
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
    })
    console.log(`Updated navbar ${existing.docs[0].id} (Global)`)
  } else {
    const created = await payload.create({
      collection: 'navbars',
      data,
      overrideAccess: true,
    })
    console.log(`Created navbar ${created.id} (Global)`)
  }

  console.log(`Seeded ${DUMMY_ITEMS.length} top items (Series = dropdown-only, no URL)`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
