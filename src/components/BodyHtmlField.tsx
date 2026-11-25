'use client'

import React, { useState } from 'react'
import { FieldLabel, useField } from '@payloadcms/ui'
import type { TextareaFieldClientComponent } from 'payload'

/**
 * Legacy HTML: preview rendered content by default; toggle to edit raw HTML.
 */
export const BodyHtmlField: TextareaFieldClientComponent = ({ field, path, readOnly }) => {
  const { value, setValue } = useField<string>({ path: path || field?.name || 'bodyHtml' })
  const [editing, setEditing] = useState(false)

  const html = value ?? ''
  const label = typeof field?.label === 'string' ? field.label : 'Body (Legacy HTML)'
  const description =
    typeof field?.admin?.description === 'string' ? field.admin.description : undefined

  return (
    <div className="field-type textarea" style={{ marginBottom: '1.5rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          marginBottom: '0.5rem',
        }}
      >
        <FieldLabel label={label} path={path} required={Boolean(field?.required)} />
        <button
          type="button"
          className="btn btn--size-small btn--style-secondary"
          onClick={() => setEditing((v) => !v)}
          style={{ flexShrink: 0 }}
        >
          {editing ? 'Show preview' : readOnly ? 'View HTML source' : 'Edit HTML'}
        </button>
      </div>

      {description ? (
        <div className="field-description" style={{ marginBottom: '0.5rem', opacity: 0.8 }}>
          {description}
        </div>
      ) : null}

      {editing ? (
        <textarea
          className="textarea-field"
          value={html}
          readOnly={readOnly}
          rows={18}
          onChange={(e) => setValue(e.target.value)}
          style={{
            width: '100%',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: '0.85rem',
            lineHeight: 1.45,
            borderRadius: 8,
          }}
        />
      ) : (
        <div className="body-html-preview-shell">
          {html.trim() ? (
            <div
              className="body-html-preview"
              // Legacy CMS HTML (trusted migrate source). Shortcodes/iframes render as stored.
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p style={{ margin: '1.5rem', opacity: 0.55, textAlign: 'center' }}>
              No legacy HTML body.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default BodyHtmlField
