/**
 * Metadata-only media row for existing S3 objects (no download / no re-upload).
 * Stores full relative key including `static-assets/...` (S3 prefix left empty until confirmed).
 */
import type pg from 'pg'

export function guessMime(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return 'image/jpeg'
}

/** Strip domain → path starting with static-assets/... */
export function toStaticAssetsPath(input: string): string {
  const raw = (input || '').trim()
  if (!raw) return ''

  let pathname = raw
  try {
    if (/^https?:\/\//i.test(raw)) {
      pathname = new URL(raw).pathname
    }
  } catch {
    return ''
  }

  pathname = pathname.replace(/^\/+/, '')
  const idx = pathname.indexOf('static-assets/')
  if (idx === -1) return ''
  return pathname.slice(idx)
}

export async function ensureS3Media(
  dest: pg.Client,
  opts: { alt: string; diskPath: string },
): Promise<number | undefined> {
  const filename = toStaticAssetsPath(opts.diskPath)
  if (!filename) return undefined

  const mime = guessMime(filename)
  const alt = opts.alt?.trim() || filename

  try {
    const found = await dest.query<{ id: number }>(
      `SELECT id FROM media WHERE filename = $1 LIMIT 1`,
      [filename],
    )

    if (found.rows[0]) {
      await dest.query(
        `UPDATE media
         SET alt = $1, mime_type = $2, updated_at = NOW()
         WHERE id = $3`,
        [alt, mime, found.rows[0].id],
      )
      return found.rows[0].id
    }

    const inserted = await dest.query<{ id: number }>(
      `INSERT INTO media (alt, filename, mime_type, filesize, created_at, updated_at)
       VALUES ($1, $2, $3, 0, NOW(), NOW())
       RETURNING id`,
      [alt, filename, mime],
    )
    return inserted.rows[0].id
  } catch (err) {
    console.warn(`  S3 media metadata failed for ${filename}:`, err)
    return undefined
  }
}
