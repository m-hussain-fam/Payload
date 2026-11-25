import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'username', 'email', 'role', 'isActive'],
    group: 'Users & Access',
  },
  auth: true,
  fields: [
    // Email + Password auth: true se auto aate hain
    {
      type: 'row',
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
          label: 'Full Name',
        },
        {
          name: 'username',
          type: 'text',
          required: true,
          unique: true,
          label: 'Username',
          admin: {
            description: 'Old CMS user_name — unique login/identity handle',
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'role',
          type: 'relationship',
          relationTo: 'roles',
          required: true,
          label: 'User Role',
        },
        {
          name: 'slug',
          type: 'text',
          unique: true,
          label: 'Slug',
          admin: {
            description: 'Public URL slug, e.g. ali-khan',
          },
        },
      ],
    },
    {
      name: 'bio',
      type: 'textarea',
      label: 'Bio',
    },
    {
      name: 'designation',
      type: 'text',
      label: 'Designation',
    },
    {
      name: 'social',
      type: 'group',
      label: 'Social Links',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'instagramUsername',
              type: 'text',
              label: 'Instagram Username',
            },
            {
              name: 'instagramUrl',
              type: 'text',
              label: 'Instagram URL',
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'facebookUsername',
              type: 'text',
              label: 'Facebook Username',
            },
            {
              name: 'facebookUrl',
              type: 'text',
              label: 'Facebook URL',
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'twitterUsername',
              type: 'text',
              label: 'Twitter Username',
            },
            {
              name: 'twitterUrl',
              type: 'text',
              label: 'Twitter URL',
            },
          ],
        },
      ],
    },
    {
      name: 'avatar',
      type: 'upload',
      relationTo: 'media',
      label: 'Profile Picture',
      admin: {
        position: 'sidebar',
        description:
          'Migrated: Media filename = static-assets/... on existing S3. New uploads go to connected storage.',
      },
    },
    {
      name: 'legacyUserId',
      type: 'number',
      label: 'Legacy User ID',
      admin: {
        position: 'sidebar',
        description: 'Old CMS labwis_user.user_id — migration mapping',
      },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      label: 'Active Account',
      admin: {
        position: 'sidebar',
        description: 'Uncheck to block or deactivate this user',
      },
    },
  ],
}
