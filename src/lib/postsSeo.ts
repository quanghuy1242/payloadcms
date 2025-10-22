import type {
  GenerateDescription,
  GenerateImage,
  GenerateTitle,
} from '@payloadcms/plugin-seo/types'

import type { Homepage, Post } from '../payload-types'
import { toNullableString } from '../utils/strings'

// Individual generators for Posts
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

// Individual generators for Homepage
export const generateHomepageTitle: GenerateTitle<Homepage> = ({ doc }) => {
  return toNullableString(doc?.header) ?? ''
}

export const generateHomepageDescription: GenerateDescription<Homepage> = ({ doc }) => {
  return toNullableString(doc?.subHeader) ?? ''
}

export const generateHomepageImage: GenerateImage<Homepage> = ({ doc }) => {
  const docAny = doc as any
  const { imageBanner } = docAny ?? {}

  if (imageBanner && typeof imageBanner === 'object') {
    if ('id' in imageBanner && imageBanner.id) {
      return imageBanner.id as string | number
    }
  }

  return (imageBanner ?? '') as string | number
}

// Universal generators that handle both Post and Homepage
export const generateSeoTitle: GenerateTitle = ({ doc }) => {
  const docAny = doc as any

  // Check if it's a Homepage (has header field)
  if (docAny?.header !== undefined) {
    return toNullableString(docAny.header) ?? ''
  }

  // Otherwise treat as Post (has title field)
  return toNullableString(docAny?.title) ?? ''
}

export const generateSeoDescription: GenerateDescription = ({ doc }) => {
  const docAny = doc as any

  // Check if it's a Homepage (has subHeader field)
  if (docAny?.subHeader !== undefined) {
    return toNullableString(docAny.subHeader) ?? ''
  }

  // Otherwise treat as Post (has excerpt field)
  return toNullableString(docAny?.excerpt) ?? ''
}

export const generateSeoImage: GenerateImage = ({ doc }) => {
  const docAny = doc as any

  // Check if it's a Homepage (has imageBanner field)
  const imageField = docAny?.imageBanner !== undefined ? docAny.imageBanner : docAny?.coverImage

  if (imageField && typeof imageField === 'object') {
    if ('id' in imageField && imageField.id) {
      return imageField.id as string | number
    }
  }

  return (imageField ?? '') as string | number
}
