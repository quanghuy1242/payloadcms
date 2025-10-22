import { SimilarPosts } from './SimilarPosts'

export const queries = (GraphQL: any, payload: any) => {
  return {
    SimilarPosts: SimilarPosts(GraphQL, payload),
    // Add more queries here as needed
  }
}
