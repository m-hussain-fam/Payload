import type { CollectionConfig } from 'payload'

export const Tags: CollectionConfig = {
  slug: 'tags',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'sport', 'isActive'],
    group: 'Taxonomy',
    description: 'Editorial topics / tags (article topics, not players)',
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
            description: 'Full legacy path, e.g. topic/abu-dhabi-t10-2022',
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
        description: 'Legacy Wisden-group tags map to Cricket',
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
