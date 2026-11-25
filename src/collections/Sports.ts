import type { CollectionConfig } from 'payload'

export const Sports: CollectionConfig = {
  slug: 'sports',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'code', 'isActive'],
    group: 'Taxonomy',
    description: 'Sports (Cricket now; Football etc. later)',
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
            description: 'e.g. cricket, football',
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
        description: 'Short stable code for app/feed logic, e.g. cricket',
      },
    },
    {
      name: 'legacyEntityId',
      type: 'number',
      unique: true,
      label: 'Legacy Entity ID',
      admin: {
        position: 'sidebar',
        description: 'Old CMS labwis_entity_master.entity_master_id (e.g. Cricket = 7)',
      },
    },
    {
      name: 'legacyGroupId',
      type: 'number',
      unique: true,
      label: 'Legacy Group ID',
      admin: {
        position: 'sidebar',
        description: 'Old CMS labwis_entity_group.entity_group_id',
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
