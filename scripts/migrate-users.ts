/**
 * Migrate labwis.labwis_user → Payload `users`
 *
 * Decisions (locked):
 * - Password for ALL users: 1234567
 * - Missing email → `{sanitizedUsername}@example.com`
 * - Existing email kept as-is
 * - Duplicate email/username → SKIP
 * - Photos: metadata-only Media — filename = static-assets/... (NO file download).
 * - Roles: keep OLD role_name exactly (1:1), e.g. "Authors", "Wisden Admin"
 *
 * Usage:
 *   pnpm migrate:users:dry    # report only
 *   pnpm migrate:users        # write to Payload
 *
 * Env (optional):
 *   SOURCE_DATABASE_URL  default: wisden local docker
 *   WISDEN_ASSET_BASE    default: https://www.wisden.com
 */

import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { ensureS3Media, toStaticAssetsPath } from './lib/ensure-s3-media'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const DRY_RUN = process.argv.includes('--dry-run')
const SHARED_PASSWORD = '1234567'
const DUMMY_EMAIL_DOMAIN = 'example.com'
const ASSET_BASE = (process.env.WISDEN_ASSET_BASE || 'https://www.wisden.com').replace(/\/$/, '')
const SOURCE_DATABASE_URL =
  process.env.SOURCE_DATABASE_URL ||
  'postgresql://USER:PASSWORD@127.0.0.1:5401/siwafmasstg'

type SourceUser = {
  user_id: number
  user_name: string | null
  full_name: string | null
  display_name: string | null
  email_id: string | null
  bio: string | null
  designation: string | null
  profile_picture_url: string | null
  image_id: number | null
  image_name: string | null
  socialdata: unknown
  is_active: number | null
  role_name: string | null
}

type RowReport = {
  legacyUserId: number
  username: string
  emailSource: string
  emailFinal: string
  roleOld: string
  roleNew: string
  hasBio: boolean
  hasPhoto: boolean
  hasSocial: boolean
  photoUrl: string
  status: string
  notes: string
}

function normalizeUsername(raw: string): string {
  return raw.trim()
}

function sanitizeEmailLocal(username: string): string {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9._+-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || `user`
}

function toSlug(username: string, legacyId: number): string {
  const base = username
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return base || `user-${legacyId}`
}

/** Keep old CMS role names exactly as stored (1:1). */
function mapRoleName(oldRole: string | null): string {
  const name = (oldRole || 'Authors').trim()
  return name.length ? name : 'Authors'
}

function parseSocial(socialdata: unknown): {
  instagramUsername?: string
  instagramUrl?: string
  facebookUsername?: string
  facebookUrl?: string
  twitterUsername?: string
  twitterUrl?: string
} {
  if (!socialdata) return {}
  const arr = Array.isArray(socialdata)
    ? socialdata
    : typeof socialdata === 'string'
      ? JSON.parse(socialdata)
      : socialdata

  if (!Array.isArray(arr)) return {}

  const out: Record<string, string> = {}
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const id = String((item as { id?: string }).id || '').toLowerCase()
    const username = (item as { username?: string | null }).username || undefined
    const url = (item as { url?: string | null }).url || undefined
    if (!username && !url) continue
    if (id === 'instagram') {
      if (username) out.instagramUsername = username
      if (url) out.instagramUrl = url
    } else if (id === 'facebook') {
      if (username) out.facebookUsername = username
      if (url) out.facebookUrl = url
    } else if (id === 'twitter' || id === 'x') {
      if (username) out.twitterUsername = username
      if (url) out.twitterUrl = url
    }
  }
  return out
}

/** Prefer full static-assets/… path (S3 key). Accept /static-assets or wisden CDN URLs. */
function resolvePhotoPath(profilePictureUrl: string | null): string {
  if (!profilePictureUrl?.trim()) return ''
  const p = profilePictureUrl.trim()
  if (p.startsWith('/static-assets/')) return p.replace(/^\/+/, '')
  if (p.startsWith('static-assets/')) return p
  if (/^https?:\/\/(www\.)?wisden\.com\/static-assets\//i.test(p)) {
    return toStaticAssetsPath(p)
  }
  // Allow ASSET_BASE variants
  if (ASSET_BASE && p.startsWith(`${ASSET_BASE}/static-assets/`)) {
    return toStaticAssetsPath(p)
  }
  return toStaticAssetsPath(p)
}

async function ensureUserMedia(
  dest: pg.Client,
  opts: { alt: string; diskPath: string },
): Promise<number | undefined> {
  return ensureS3Media(dest, opts)
}

async function ensureRole(
  payload: Awaited<ReturnType<typeof getPayload>>,
  roleName: string,
  cache: Map<string, number | string>,
): Promise<number | string> {
  if (cache.has(roleName)) return cache.get(roleName)!

  const existing = await payload.find({
    collection: 'roles',
    where: { name: { equals: roleName } },
    limit: 1,
    overrideAccess: true,
  })

  if (existing.docs[0]) {
    cache.set(roleName, existing.docs[0].id)
    return existing.docs[0].id
  }

  if (DRY_RUN) {
    cache.set(roleName, `dry-${roleName}`)
    return `dry-${roleName}`
  }

  const created = await payload.create({
    collection: 'roles',
    data: {
      name: roleName,
      description: `Migrated from old CMS role: ${roleName}`,
    },
    overrideAccess: true,
  })
  cache.set(roleName, created.id)
  return created.id
}

async function fetchSourceUsers(): Promise<SourceUser[]> {
  const client = new pg.Client({ connectionString: SOURCE_DATABASE_URL })
  await client.connect()
  try {
    const { rows } = await client.query<SourceUser>(`
      SELECT
        u.user_id::float8 AS user_id,
        u.user_name,
        u.full_name,
        u.display_name,
        u.email_id,
        u.bio,
        u.designation,
        u.profile_picture_url,
        u.image_id::float8 AS image_id,
        u.image_name,
        u.socialdata,
        u.is_active::float8 AS is_active,
        r.role_name
      FROM labwis.labwis_user u
      LEFT JOIN labwis.labwis_user_role ur
        ON ur.user_id = u.user_id AND COALESCE(ur.is_deleted, 0) = 0
      LEFT JOIN labwis.labwis_role r
        ON r.role_id = ur.role_id
      WHERE COALESCE(u.is_deleted, 0) = 0
      ORDER BY u.user_id
    `)
    return rows
  } finally {
    await client.end()
  }
}

async function main() {
  console.log(`\nUsers migrate — ${DRY_RUN ? 'DRY RUN' : 'LIVE WRITE'}`)
  console.log(`Source: ${SOURCE_DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}`)
  console.log(`Asset base: ${ASSET_BASE}`)
  console.log(`Password: ${SHARED_PASSWORD}`)
  console.log(`Photos: media.filename = static-assets/... (no download); users.avatar → media\n`)

  const sourceUsers = await fetchSourceUsers()
  console.log(`Fetched ${sourceUsers.length} source users\n`)

  const payload = await getPayload({ config })
  const dest = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await dest.connect()
  const roleCache = new Map<string, number | string>()
  const seenEmails = new Set<string>()
  const seenUsernames = new Set<string>()
  const reports: RowReport[] = []

  let created = 0
  let skipped = 0
  let errors = 0

  try {
  for (const row of sourceUsers) {
    const legacyUserId = Number(row.user_id)
    const usernameRaw = row.user_name?.trim() || `user_${legacyUserId}`
    const username = normalizeUsername(usernameRaw)
    const usernameKey = username.toLowerCase()
    const name = (row.full_name || row.display_name || username).trim()
    const roleOld = row.role_name || 'Authors'
    const roleNew = mapRoleName(row.role_name)
    // Only trust avatar when old CMS has a real image row (avoids copied wrong paths, e.g. Mazhar → Ben Gardner)
    const hasRealImage = Boolean(row.image_id) || Boolean(row.image_name?.trim())
    const photoUrl = hasRealImage ? resolvePhotoPath(row.profile_picture_url) : ''
    const social = parseSocial(row.socialdata)

    const emailSource = row.email_id?.trim() || ''
    let emailFinal = emailSource
    let notes = ''

    const looksLikeEmail = (value: string) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

    if (!emailFinal || !looksLikeEmail(emailFinal)) {
      emailFinal = `${sanitizeEmailLocal(username)}@${DUMMY_EMAIL_DOMAIN}`
      notes = emailSource ? `dummy email (invalid source: ${emailSource})` : 'dummy email'
    }

    const emailKey = emailFinal.toLowerCase()
    let status = notes === 'dummy email' ? 'synthetic_email' : 'ok'

    if (seenUsernames.has(usernameKey)) {
      status = 'duplicate_username'
      notes = 'skipped — username already used in this run'
      skipped++
      reports.push({
        legacyUserId,
        username,
        emailSource,
        emailFinal,
        roleOld,
        roleNew,
        hasBio: Boolean(row.bio?.trim()),
        hasPhoto: Boolean(photoUrl),
        hasSocial: Object.keys(social).length > 0,
        photoUrl,
        status,
        notes,
      })
      continue
    }

    if (seenEmails.has(emailKey)) {
      status = 'duplicate_email'
      notes = 'skipped — email already used in this run'
      skipped++
      reports.push({
        legacyUserId,
        username,
        emailSource,
        emailFinal,
        roleOld,
        roleNew,
        hasBio: Boolean(row.bio?.trim()),
        hasPhoto: Boolean(photoUrl),
        hasSocial: Object.keys(social).length > 0,
        photoUrl,
        status,
        notes,
      })
      continue
    }

    seenUsernames.add(usernameKey)
    seenEmails.add(emailKey)

    try {
      // idempotent: skip if legacyUserId already migrated
      const existing = await payload.find({
        collection: 'users',
        where: { legacyUserId: { equals: legacyUserId } },
        limit: 1,
        overrideAccess: true,
      })

      if (existing.docs.length > 0) {
        // Backfill: point avatar Media.url at CDN (same upload field)
        if (!DRY_RUN && photoUrl) {
          const mediaId = await ensureUserMedia(dest, {
            alt: name,
            diskPath: photoUrl,
          })
          await payload.update({
            collection: 'users',
            id: existing.docs[0].id,
            data: {
              avatar: mediaId,
            },
            overrideAccess: true,
          })
          status = 'updated_avatar'
          notes = `avatar → media ${mediaId} (${photoUrl})`
          created++
        } else {
          status = 'already_migrated'
          notes = `skip — payload id ${existing.docs[0].id}`
          skipped++
        }
        reports.push({
          legacyUserId,
          username,
          emailSource,
          emailFinal,
          roleOld,
          roleNew,
          hasBio: Boolean(row.bio?.trim()),
          hasPhoto: Boolean(photoUrl),
          hasSocial: Object.keys(social).length > 0,
          photoUrl,
          status,
          notes,
        })
        continue
      }

      const roleId = await ensureRole(payload, roleNew, roleCache)
      const slug = toSlug(username, legacyUserId)
      const avatarId =
        !DRY_RUN && photoUrl
          ? await ensureUserMedia(dest, {
              alt: name,
              diskPath: photoUrl,
            })
          : undefined

      if (!DRY_RUN) {
        await payload.create({
          collection: 'users',
          data: {
            name,
            username,
            email: emailFinal,
            password: SHARED_PASSWORD,
            role: roleId,
            slug,
            bio: row.bio?.trim() || undefined,
            designation: row.designation?.trim() || undefined,
            social: Object.keys(social).length ? social : undefined,
            avatar: avatarId,
            legacyUserId,
            isActive: Number(row.is_active) === 1,
          },
          overrideAccess: true,
        })
        created++
      } else {
        created++
      }

      reports.push({
        legacyUserId,
        username,
        emailSource,
        emailFinal,
        roleOld,
        roleNew,
        hasBio: Boolean(row.bio?.trim()),
        hasPhoto: Boolean(photoUrl),
        hasSocial: Object.keys(social).length > 0,
        photoUrl,
        status,
        notes: notes || (DRY_RUN ? 'would create' : 'created'),
      })
    } catch (err) {
      errors++
      const message = err instanceof Error ? err.message : String(err)
      reports.push({
        legacyUserId,
        username,
        emailSource,
        emailFinal,
        roleOld,
        roleNew,
        hasBio: Boolean(row.bio?.trim()),
        hasPhoto: Boolean(photoUrl),
        hasSocial: Object.keys(social).length > 0,
        photoUrl,
        status: 'error',
        notes: message,
      })
      console.error(`Error user_id=${legacyUserId} (${username}):`, message)
    }
  }
  } finally {
    await dest.end()
  }

  const outDir = path.join(ROOT, 'docs')
  await fs.mkdir(outDir, { recursive: true })
  const stamp = DRY_RUN ? 'dry-run' : 'live'
  const csvPath = path.join(outDir, `users-migration-${stamp}.csv`)
  const header = [
    'legacyUserId',
    'username',
    'emailSource',
    'emailFinal',
    'roleOld',
    'roleNew',
    'hasBio',
    'hasPhoto',
    'hasSocial',
    'photoUrl',
    'status',
    'notes',
  ]
  const lines = [
    header.join(','),
    ...reports.map((r) =>
      [
        r.legacyUserId,
        csvEscape(r.username),
        csvEscape(r.emailSource),
        csvEscape(r.emailFinal),
        csvEscape(r.roleOld),
        csvEscape(r.roleNew),
        r.hasBio,
        r.hasPhoto,
        r.hasSocial,
        csvEscape(r.photoUrl),
        csvEscape(r.status),
        csvEscape(r.notes),
      ].join(','),
    ),
  ]
  await fs.writeFile(csvPath, lines.join('\n'), 'utf8')

  console.log('\n--- Summary ---')
  console.log(`Would/did create: ${created}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Errors: ${errors}`)
  console.log(`Report: ${csvPath}`)
  console.log('\nDone.')
  process.exit(errors > 0 ? 1 : 0)
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
