import type { GraphQLFieldConfig } from 'graphql'

import { commentsResolver } from './resolver'

export const Comments = (GraphQL: any, payload: any): GraphQLFieldConfig<any, any> => {
  const mediaType = payload.collections['media']?.graphQL?.type

  const publicCommentAuthorType = new GraphQL.GraphQLObjectType({
    name: 'PublicCommentAuthor',
    fields: {
      id: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID) },
      fullName: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      avatar: { type: mediaType ?? GraphQL.GraphQLString },
    },
  })

  const publicCommentType = new GraphQL.GraphQLObjectType({
    name: 'PublicComment',
    fields: {
      id: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID) },
      content: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      status: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      createdAt: { type: GraphQL.GraphQLString },
      updatedAt: { type: GraphQL.GraphQLString },
      parentCommentId: { type: GraphQL.GraphQLID },
      chapterId: { type: GraphQL.GraphQLID },
      postId: { type: GraphQL.GraphQLID },
      isOwnPending: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLBoolean) },
      author: { type: new GraphQL.GraphQLNonNull(publicCommentAuthorType) },
    },
  })

  return {
    type: new GraphQL.GraphQLObjectType({
      name: 'CommentsResult',
      fields: {
        docs: {
          type: new GraphQL.GraphQLNonNull(
            new GraphQL.GraphQLList(new GraphQL.GraphQLNonNull(publicCommentType)),
          ),
        },
        totalDocs: {
          type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLInt),
        },
        viewerCanComment: {
          type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLBoolean),
        },
      },
    }),
    args: {
      chapterId: { type: GraphQL.GraphQLID },
      postId: { type: GraphQL.GraphQLID },
    },
    resolve: commentsResolver,
  }
}
