import type { CollectionConfig } from 'payload'

export const Series: CollectionConfig = {
  slug: 'series',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'sport', 'isActive'],
    group: 'Taxonomy',
    description: 'Competition series (IPL, County Championship, …)',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
          label: 'Name',
        },
        {
          name: 'slug',
          type: 'text',
          required: true,
          unique: true,
          label: 'Slug',
          admin: {
            description: 'Full legacy path, e.g. series/county-championship-2015',
          },
        },
      ],
    },
    {
      name: 'sport',
      type: 'relationship',
      relationTo: 'sports',
      required: true,
      label: 'Sport',
      admin: {
        description: 'Legacy Wisden-group series map to Cricket',
      },
    },
    {
      name: 'legacyEntityId',
      type: 'number',
      unique: true,
      label: 'Legacy Entity ID',
      admin: {
        position: 'sidebar',
        description: 'Old CMS labwis_entity_master.entity_master_id',
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
  ],
}
