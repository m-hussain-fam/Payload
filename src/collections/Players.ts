import type { CollectionConfig } from 'payload'

export const Players: CollectionConfig = {
  slug: 'players',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'sport', 'isActive'],
    group: 'Taxonomy',
    description: 'Players (cricket squad / profile entities)',
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
            description: 'Full legacy path, e.g. players/aaron-finch-4196',
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
        description: 'Legacy Wisden-group players map to Cricket',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      label: 'Player Image',
      admin: {
        position: 'sidebar',
        description:
          'Migrated: Media filename = static-assets/images/players/{id}.png on existing S3.',
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
