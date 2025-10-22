# Similar Posts GraphQL Query

## Overview

The `SimilarPosts` query returns recommended posts based on a scoring algorithm that considers:
- **Category match**: +10 points
- **Tag matches**: +3 points per matching tag
- **Same author**: +2 points

Posts are sorted by score (descending), then by recency for ties.

## Query Signature

```graphql
query SimilarPosts($postId: Int!, $limit: Int) {
  SimilarPosts(postId: $postId, limit: $limit) {
    docs {
      # Post fields here
    }
    totalDocs
  }
}
```

## Parameters

- `postId` (Int!, required): The ID of the current post
- `limit` (Int, optional): Number of similar posts to return (1-10, default: 4)

## Example Usage

### Basic Query (4 posts)

```graphql
query GetSimilarPosts {
  SimilarPosts(postId: 1) {
    docs {
      id
      title
      slug
      excerpt
      coverImage {
        url
        alt
      }
      category {
        name
        slug
      }
      author {
        name
      }
      createdAt
    }
    totalDocs
  }
}
```

### With Custom Limit (8 posts)

```graphql
query GetSimilarPosts {
  SimilarPosts(postId: 1, limit: 8) {
    docs {
      id
      title
      slug
      excerpt
      coverImage {
        url
        alt
        width
        height
      }
      category {
        name
        slug
      }
      tags {
        tag
      }
      createdAt
    }
    totalDocs
  }
}
```

### With Variables

```graphql
query GetSimilarPosts($postId: Int!, $limit: Int) {
  SimilarPosts(postId: $postId, limit: $limit) {
    docs {
      id
      title
      slug
      excerpt
      coverImage {
        url
      }
      category {
        name
      }
    }
    totalDocs
  }
}
```

Variables:
```json
{
  "postId": 1,
  "limit": 6
}
```

## Scoring Algorithm Details

### Category Match (Highest Priority)
Posts in the same category receive **+10 points**. This ensures that content within the same topic area is prioritized.

### Tag Matching (Medium Priority)
Each matching tag adds **+3 points**. If a post has 3 tags in common with the current post, it receives +9 points.

### Author Match (Lower Priority)
Posts by the same author receive **+2 points**. This helps surface more content from authors readers are already engaged with.

### Tie-Breaking
When posts have the same score, they're sorted by `createdAt` in descending order (newest first).

## Testing in GraphQL Playground

1. Start your dev server: `pnpm dev`
2. Navigate to: `http://localhost:3000/api/graphql-playground`
3. Paste one of the example queries above
4. Execute and verify results

## Integration Example (Next.js)

```typescript
import { gql } from 'graphql-request'

const GET_SIMILAR_POSTS = gql`
  query GetSimilarPosts($postId: Int!, $limit: Int) {
    SimilarPosts(postId: $postId, limit: $limit) {
      docs {
        id
        title
        slug
        excerpt
        coverImage {
          url
          alt
        }
        category {
          name
          slug
        }
        createdAt
      }
      totalDocs
    }
  }
`

// Usage
const { SimilarPosts } = await graphqlClient.request(GET_SIMILAR_POSTS, {
  postId: currentPost.id,
  limit: 4,
})
```

## Future Enhancements

Consider adding these fields to improve recommendations:

1. **readingTime** (number) - Match posts of similar length
2. **viewCount** (number) - Boost popular posts
3. **relatedPosts** (relationship) - Manual curation for important posts
4. **primaryTag** (text) - Stronger topic categorization
