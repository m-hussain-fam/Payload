import type { CollectionConfig } from 'payload'

export const Regions: CollectionConfig = {
  slug: 'regions',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'code', 'isActive'],
    group: 'Taxonomy',
    description: 'Site regions (Global, India, UK, Rest of Asia, …)',
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
            description: 'e.g. india, united-kingdom, global',
          },
        },
      ],
    },
    {
      name: 'code',
      type: 'text',
      unique: true,
      label: 'Code',
      admin: {
        description: 'Short stable code for app logic, e.g. global, in, gb, rest-of-asia',
      },
    },
    {
      name: 'legacyEntityId',
      type: 'number',
      unique: true,
      label: 'Legacy Entity ID',
      admin: {
        position: 'sidebar',
        description: 'Old CMS labwis_entity_master.entity_master_id — for migration mapping',
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
