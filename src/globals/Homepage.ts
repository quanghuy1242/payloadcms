import type { GlobalConfig } from 'payload'

export const Homepage: GlobalConfig = {
  slug: 'homepage',
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
  ],
}
