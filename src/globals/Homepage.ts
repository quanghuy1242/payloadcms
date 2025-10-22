import type { GlobalConfig } from 'payload'

import { adminOrEmailContains, publicReadAccess } from '../utils/access'

export const Homepage: GlobalConfig = {
  slug: 'homepage',
  access: {
    read: publicReadAccess,
    update: adminOrEmailContains('quanghuy1242'),
  },
  fields: [
    {
      name: 'header',
      type: 'text',
      required: true,
    },
    {
      name: 'subHeader',
      type: 'text',
    },
    {
      name: 'imageBanner',
      type: 'upload',
      relationTo: 'media' as const,
    },
  ],
}
