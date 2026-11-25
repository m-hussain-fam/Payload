import type { CollectionConfig } from 'payload'

export const Articles: CollectionConfig = {
  slug: 'articles',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'author', 'status', 'publishedAt'],
    group: 'Content',
    description: 'News / features articles',
  },
  access: {
    read: () => true,
  },
  versions: {
    drafts: true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Title',
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      label: 'Slug',
      admin: {
        description: 'Legacy title_alias, e.g. james-rew-is-ready-for-test-cricket-...',
      },
    },
    {
      name: 'excerpt',
      type: 'textarea',
      label: 'Excerpt',
      admin: {
        description: 'Legacy intro_text / listing short_desc',
      },
    },
    {
      name: 'body',
      type: 'richText',
      label: 'Body',
      admin: {
        description: 'New articles — Lexical rich text. Frontend prefers this when set.',
      },
    },
    {
      name: 'bodyHtml',
      type: 'textarea',
      label: 'Body (Legacy HTML)',
      // Payload defaultMaxTextLength is 40_000 — long legacy articles exceed that
      maxLength: 1_000_000,
      admin: {
        description:
          'Migrated full_text (HTML + iframes + shortcodes). Preview by default; Edit HTML to change.',
        components: {
          Field: '/components/BodyHtmlField#BodyHtmlField',
        },
      },
    },
    {
      name: 'coverImage',
      type: 'upload',
      relationTo: 'media',
      label: 'Cover Image',
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      label: 'Author',
    },
    {
      name: 'sport',
      type: 'relationship',
      relationTo: 'sports',
      label: 'Sport',
      admin: {
        description: 'Default Cricket for Wisden-migrated articles',
      },
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
      label: 'Categories',
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      label: 'Tags',
    },
    {
      name: 'players',
      type: 'relationship',
      relationTo: 'players',
      hasMany: true,
      label: 'Players',
    },
    {
      name: 'teams',
      type: 'relationship',
      relationTo: 'teams',
      hasMany: true,
      label: 'Teams',
    },
    {
      name: 'series',
      type: 'relationship',
      relationTo: 'series',
      hasMany: true,
      label: 'Series',
    },
    {
      type: 'tabs',
      label: 'SEO & Social',
      tabs: [
        {
          label: 'General',
          name: 'seo',
          description: 'Legacy: browser_title, meta_desc, keywords, custom_meta',
          fields: [
            {
              name: 'title',
              type: 'text',
              label: 'Browser / SEO Title',
            },
            {
              name: 'description',
              type: 'textarea',
              label: 'Meta Description',
            },
            {
              name: 'keywords',
              type: 'text',
              label: 'Meta Keywords',
            },
            {
              name: 'canonicalUrl',
              type: 'text',
              label: 'Canonical URL',
            },
            {
              name: 'customMeta',
              type: 'textarea',
              label: 'Custom Meta',
              admin: {
                description: 'Raw custom meta tags / snippets from legacy seo.custom_meta',
              },
            },
          ],
        },
        {
          label: 'Facebook',
          name: 'facebook',
          description: 'Open Graph — legacy article CMS me alag FB fields nahi thi; naye articles ke liye',
          fields: [
            {
              name: 'title',
              type: 'text',
              label: 'OG Title',
            },
            {
              name: 'description',
              type: 'textarea',
              label: 'OG Description',
            },
            {
              name: 'image',
              type: 'upload',
              relationTo: 'media',
              label: 'OG Image',
            },
          ],
        },
        {
          label: 'Twitter',
          name: 'twitter',
          fields: [
            {
              name: 'card',
              type: 'select',
              label: 'Card Type',
              defaultValue: 'summary_large_image',
              options: [
                { label: 'Summary', value: 'summary' },
                { label: 'Summary Large Image', value: 'summary_large_image' },
              ],
            },
            {
              name: 'title',
              type: 'text',
              label: 'Twitter Title',
            },
            {
              name: 'description',
              type: 'textarea',
              label: 'Twitter Description',
            },
            {
              name: 'image',
              type: 'upload',
              relationTo: 'media',
              label: 'Twitter Image',
            },
          ],
        },
        {
          label: 'Advanced',
          name: 'seoAdvanced',
          fields: [
            {
              name: 'robots',
              type: 'text',
              label: 'Meta Robots',
              admin: {
                description: 'e.g. index,follow — legacy seo.meta_robots',
              },
            },
          ],
        },
      ],
    },

    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
      label: 'Status',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: 'Published At',
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'legacyArticleId',
      type: 'number',
      unique: true,
      label: 'Legacy Article ID',
      admin: {
        position: 'sidebar',
        description: 'Old CMS labwis_article.article_id',
      },
    },
  ],
}
