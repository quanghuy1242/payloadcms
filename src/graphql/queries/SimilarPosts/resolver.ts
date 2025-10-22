import type { Payload } from 'payload'

interface SimilarPostsArgs {
  postId: number
  limit?: number
}

export const similarPostsResolver = async (
  _: any,
  args: SimilarPostsArgs,
  context: any,
): Promise<{ docs: any[]; totalDocs: number }> => {
  const payload: Payload = context.req.payload
  const { postId, limit = 4 } = args

  // Clamp limit between 1 and 10
  const clampedLimit = Math.max(1, Math.min(limit, 10))

  // First, get the current post to extract metadata
  const currentPost = await payload.findByID({
    collection: 'posts',
    id: postId,
  })

  if (!currentPost) {
    return { docs: [], totalDocs: 0 }
  }

  const categoryId =
    typeof currentPost.category === 'object' ? currentPost.category.id : currentPost.category

  const authorId =
    typeof currentPost.author === 'object' ? currentPost.author.id : currentPost.author

  const tags = currentPost.tags?.map((t) => t.tag).filter(Boolean) || []

  // Build OR conditions for similarity matching
  const orConditions: any[] = [{ category: { equals: categoryId } }]

  // Add tag matching if tags exist
  if (tags.length > 0) {
    orConditions.push({ 'tags.tag': { in: tags } })
  }

  // Query for similar posts
  const results = await payload.find({
    collection: 'posts',
    where: {
      and: [
        { id: { not_equals: postId } },
        { _status: { equals: 'published' } },
        {
          or: orConditions,
        },
      ],
    },
    limit: clampedLimit * 3, // Get more for scoring
    sort: '-createdAt',
  })

  // Score and sort results
  const scoredPosts = results.docs.map((post) => {
    let score = 0

    // Category match: +10 points
    const postCategoryId = typeof post.category === 'object' ? post.category.id : post.category
    if (postCategoryId === categoryId) {
      score += 10
    }

    // Tag matches: +3 points per matching tag
    const postTags = post.tags?.map((t) => t.tag).filter(Boolean) || []
    const matchingTags = postTags.filter((tag) => tags.includes(tag))
    score += matchingTags.length * 3

    // Author match: +2 points
    const postAuthorId = typeof post.author === 'object' ? post.author.id : post.author
    if (postAuthorId === authorId) {
      score += 2
    }

    return { post, score }
  })

  // Sort by score DESC, then by createdAt DESC for ties
  scoredPosts.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score
    }
    return new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime()
  })

  const topPosts = scoredPosts.slice(0, clampedLimit).map((item) => item.post)

  return {
    docs: topPosts,
    totalDocs: topPosts.length,
  }
}
