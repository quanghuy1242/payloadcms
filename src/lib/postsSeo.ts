import type {
  GenerateDescription,
  GenerateImage,
  GenerateTitle,
} from '@payloadcms/plugin-seo/types'

import type { Post } from '../payload-types'

export const generatePostTitle: GenerateTitle<Post> = ({ doc }) => {
  if (typeof doc?.title === 'string') {
    return doc.title.trim()
  }

  return ''
}

export const generatePostDescription: GenerateDescription<Post> = ({ doc }) => {
  if (typeof doc?.excerpt === 'string') {
    return doc.excerpt
  }

  return ''
}

export const generatePostImage: GenerateImage<Post> = ({ doc }) => {
  const { coverImage } = doc ?? {}

  if (coverImage && typeof coverImage === 'object') {
    if ('id' in coverImage && coverImage.id) {
      return coverImage.id as string | number
    }
  }

  return (coverImage ?? '') as string | number
}

