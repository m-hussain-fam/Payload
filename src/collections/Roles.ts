import type { CollectionConfig } from 'payload'

export const Roles: CollectionConfig = {
  slug: 'roles',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'description'],
    group: 'Users & Access', // Yeh sidebar mein alag section bana dega
    description: 'Manage system and website user roles',
  },
  access: {
    // for only development purpose we made it true for all operations
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      unique: true,
      label: 'Role Name',
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Description',
    },
  ],
}
