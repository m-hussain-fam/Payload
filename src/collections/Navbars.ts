import type { CollectionConfig, Field } from 'payload'

/**
 * One level only: top item → children (e.g. Series → 4–5 links).
 * No deeper nesting. No category/article relations — label + url strings.
 */
const childItemFields: Field[] = [
  {
    type: 'row',
    fields: [
      {
        name: 'label',
        type: 'text',
        required: true,
        label: 'Label',
      },
      {
        name: 'url',
        type: 'text',
        required: true,
        label: 'URL',
        admin: {
          description: 'Path or full URL, e.g. /series/ipl-2024',
        },
      },
    ],
  },
  {
    name: 'openInNewTab',
    type: 'checkbox',
    defaultValue: false,
    label: 'Open in new tab',
  },
]

const topItemFields: Field[] = [
  {
    type: 'row',
    fields: [
      {
        name: 'label',
        type: 'text',
        required: true,
        label: 'Label',
      },
      {
        name: 'url',
        type: 'text',
        label: 'URL',
        admin: {
          description:
            'Optional. Leave empty for a dropdown-only label (no link). Path or full URL otherwise.',
        },
      },
    ],
  },
  {
    name: 'openInNewTab',
    type: 'checkbox',
    defaultValue: false,
    label: 'Open in new tab',
  },
  {
    name: 'children',
    type: 'array',
    label: 'Children',
    labels: {
      singular: 'Child link',
      plural: 'Child links',
    },
    admin: {
      description: 'Optional dropdown links (1 level only). Parent can have no URL.',
      initCollapsed: true,
    },
    fields: childItemFields,
  },
]

export const Navbars: CollectionConfig = {
  slug: 'navbars',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'region', 'isActive'],
    group: 'Content',
    description:
      'One header nav per region. Open a region doc to edit that menu (label + URL, parent → child only).',
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
      admin: {
        description: 'e.g. Header — Global, Header — India',
      },
    },
    {
      name: 'region',
      type: 'relationship',
      relationTo: 'regions',
      required: true,
      unique: true,
      label: 'Region',
      admin: {
        description: 'One navbar document per region — pick region, edit only that tree',
      },
    },
    {
      name: 'items',
      type: 'array',
      label: 'Nav items',
      labels: {
        singular: 'Nav item',
        plural: 'Nav items',
      },
      admin: {
        description: 'Top-level links; add Children for a one-level dropdown',
      },
      fields: topItemFields,
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
