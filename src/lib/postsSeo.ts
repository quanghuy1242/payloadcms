import type {
  GenerateDescription,
  GenerateImage,
  GenerateTitle,
} from '@payloadcms/plugin-seo/types'

import type { Post } from '../payload-types'
import { toNullableString } from '../utils/strings'

export const generatePostTitle: GenerateTitle<Post> = ({ doc }) => {
  return toNullableString(doc?.title) ?? ''
}

export const generatePostDescription: GenerateDescription<Post> = ({ doc }) => {
  return toNullableString(doc?.excerpt) ?? ''
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
