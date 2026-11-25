import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Roles } from './collections/Roles'
import { Regions } from './collections/Regions'
import { Sports } from './collections/Sports'
import { Series } from './collections/Series'
import { Teams } from './collections/Teams'
import { Players } from './collections/Players'
import { Tags } from './collections/Tags'
import { Categories } from './collections/Categories'
import { Articles } from './collections/Articles'
import { Advertisements } from './collections/Advertisements'
import { Navbars } from './collections/Navbars'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  onInit: async (payload) => {
    // Idempotent seed — safe on every boot / migrate script
    const existingRoles = await payload.find({
      collection: 'roles',
      where: { name: { equals: 'admin' } },
      limit: 1,
    })

    let adminRole = existingRoles.docs[0]
    if (!adminRole) {
      adminRole = await payload.create({
        collection: 'roles',
        data: {
          name: 'admin',
          description: 'Administrator user',
        },
      })
      payload.logger.info(`Admin role created with ID: ${adminRole.id}`)
    }

    const existingUsers = await payload.find({
      collection: 'users',
      where: { email: { equals: 'mianmazhar301@gmail.com' } },
      limit: 1,
    })

    if (!existingUsers.docs[0]) {
      await payload.create({
        collection: 'users',
        data: {
          name: 'Super Admin',
          username: 'superadmin',
          email: 'mianmazhar301@gmail.com',
          password: 'AdminPassword123!',
          role: adminRole.id,
          isActive: true,
        },
      })
      payload.logger.info(`✅ Seeded: Admin User mianmazhar301@gmail.com created!`)
    }
  },
  collections: [
    Users,
    Media,
    Roles,
    Regions,
    Sports,
    Series,
    Teams,
    Players,
    Tags,
    Categories,
    Articles,
    Advertisements,
    Navbars,
  ],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  plugins: [],
})


