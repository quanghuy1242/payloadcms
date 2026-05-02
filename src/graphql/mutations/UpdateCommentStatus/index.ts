import type { GraphQLFieldConfig } from 'graphql'

import { updateCommentStatusResolver } from './resolver'

export const UpdateCommentStatus = (GraphQL: any, payload: any): GraphQLFieldConfig<any, any> => {
  const mediaType = payload.collections['media']?.graphQL?.type

  const publicCommentAuthorType = new GraphQL.GraphQLObjectType({
    name: 'UpdateCommentStatus_PublicCommentAuthor',
    fields: {
      id: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID) },
      fullName: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      avatar: { type: mediaType ?? GraphQL.GraphQLString },
    },
  })

  const publicCommentType = new GraphQL.GraphQLObjectType({
    name: 'UpdateCommentStatus_PublicComment',
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
      isDeleted: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLBoolean) },
      viewerCanEdit: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLBoolean) },
      viewerCanDelete: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLBoolean) },
      editWindowEndsAt: { type: GraphQL.GraphQLString },
      author: { type: new GraphQL.GraphQLNonNull(publicCommentAuthorType) },
    },
  })

  return {
    type: new GraphQL.GraphQLObjectType({
      name: 'UpdateCommentStatusResult',
      fields: {
        comment: { type: new GraphQL.GraphQLNonNull(publicCommentType) },
      },
    }),
    args: {
      commentId: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID) },
      status: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
    },
    resolve: updateCommentStatusResolver,
  }
}
