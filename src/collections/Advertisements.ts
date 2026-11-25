import type { CollectionConfig } from 'payload'

export const Advertisements: CollectionConfig = {
  slug: 'advertisements',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'kind', 'clients', 'isActive'],
    group: 'Content',
    description: 'Ad creatives + a few legacy static HTML pages (flagged by kind)',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Title',
    },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'ad',
      label: 'Kind',
      options: [
        { label: 'Ad', value: 'ad' },
        { label: 'Static page', value: 'staticPage' },
      ],
      admin: {
        description:
          'staticPage = Terms / Privacy / Contact etc. stored as ads in legacy; move to Pages later if needed',
        position: 'sidebar',
      },
    },
    {
      name: 'code',
      type: 'textarea',
      label: 'Ad / HTML Code',
      maxLength: 1_000_000,
      admin: {
        description: 'Legacy ad_code — HTML/JS snippet rendered on the site',
        components: {
          Field: '/components/BodyHtmlField#BodyHtmlField',
        },
      },
    },
    {
      name: 'clients',
      type: 'select',
      hasMany: true,
      label: 'Clients',
      options: [
        { label: 'Desktop', value: 'desktop' },
        { label: 'Mobile', value: 'mobile' },
        { label: 'App', value: 'app' },
      ],
      admin: {
        description: 'Legacy ad_client: 1=Desktop, 2=Mobile, 3=App',
      },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      label: 'Active',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'legacyAdId',
      type: 'number',
      unique: true,
      label: 'Legacy Ad ID',
      admin: {
        position: 'sidebar',
        description: 'Old CMS labwis_advertisement.ad_id',
      },
    },
  ],
}
