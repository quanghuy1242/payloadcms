// @ts-nocheck
import { relations } from 'drizzle-orm/relations'
import {
  users,
  usersSessions,
  media,
  payloadLockedDocumentsRels,
  payloadLockedDocuments,
  deferredGrants,
  grantMirror,
  chapters,
  books,
  categories,
  posts,
  payloadPreferencesRels,
  payloadPreferences,
  postsTags,
  homepage,
  postsV,
  postsVVersionTags,
  booksV,
  chaptersV,
  booksSubjects,
  booksVVersionSubjects,
  booksImportFailureLog,
  booksVVersionImportFailureLog,
} from './schema'

export const usersSessionsRelations = relations(usersSessions, ({ one }) => ({
  user: one(users, {
    fields: [usersSessions.parentId],
    references: [users.id],
  }),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  usersSessions: many(usersSessions),
  media_avatarId: one(media, {
    fields: [users.avatarId],
    references: [media.id],
    relationName: 'users_avatarId_media_id',
  }),
  media_ownerId: many(media, {
    relationName: 'media_ownerId_users_id',
  }),
  payloadLockedDocumentsRels: many(payloadLockedDocumentsRels),
  payloadPreferencesRels: many(payloadPreferencesRels),
  postsVS: many(postsV),
  posts: many(posts),
  categories: many(categories),
  books: many(books),
  booksVS: many(booksV),
  chapters: many(chapters),
  chaptersVS: many(chaptersV),
  grantMirrors: many(grantMirror),
}))

export const mediaRelations = relations(media, ({ one, many }) => ({
  users: many(users, {
    relationName: 'users_avatarId_media_id',
  }),
  user: one(users, {
    fields: [media.ownerId],
    references: [users.id],
    relationName: 'media_ownerId_users_id',
  }),
  payloadLockedDocumentsRels: many(payloadLockedDocumentsRels),
  homepages_metaImageId: many(homepage, {
    relationName: 'homepage_metaImageId_media_id',
  }),
  homepages_imageBannerId: many(homepage, {
    relationName: 'homepage_imageBannerId_media_id',
  }),
  postsVS_versionCoverImageId: many(postsV, {
    relationName: 'postsV_versionCoverImageId_media_id',
  }),
  postsVS_versionMetaImageId: many(postsV, {
    relationName: 'postsV_versionMetaImageId_media_id',
  }),
  posts_coverImageId: many(posts, {
    relationName: 'posts_coverImageId_media_id',
  }),
  posts_metaImageId: many(posts, {
    relationName: 'posts_metaImageId_media_id',
  }),
  categories: many(categories),
  books: many(books),
  booksVS: many(booksV),
}))

export const payloadLockedDocumentsRelsRelations = relations(
  payloadLockedDocumentsRels,
  ({ one }) => ({
    media: one(media, {
      fields: [payloadLockedDocumentsRels.mediaId],
      references: [media.id],
    }),
    user: one(users, {
      fields: [payloadLockedDocumentsRels.usersId],
      references: [users.id],
    }),
    payloadLockedDocument: one(payloadLockedDocuments, {
      fields: [payloadLockedDocumentsRels.parentId],
      references: [payloadLockedDocuments.id],
    }),
    deferredGrant: one(deferredGrants, {
      fields: [payloadLockedDocumentsRels.deferredGrantsId],
      references: [deferredGrants.id],
    }),
    grantMirror: one(grantMirror, {
      fields: [payloadLockedDocumentsRels.grantMirrorId],
      references: [grantMirror.id],
    }),
    chapter: one(chapters, {
      fields: [payloadLockedDocumentsRels.chaptersId],
      references: [chapters.id],
    }),
    book: one(books, {
      fields: [payloadLockedDocumentsRels.booksId],
      references: [books.id],
    }),
    category: one(categories, {
      fields: [payloadLockedDocumentsRels.categoriesId],
      references: [categories.id],
    }),
    post: one(posts, {
      fields: [payloadLockedDocumentsRels.postsId],
      references: [posts.id],
    }),
  }),
)

export const payloadLockedDocumentsRelations = relations(payloadLockedDocuments, ({ many }) => ({
  payloadLockedDocumentsRels: many(payloadLockedDocumentsRels),
}))

export const deferredGrantsRelations = relations(deferredGrants, ({ many }) => ({
  payloadLockedDocumentsRels: many(payloadLockedDocumentsRels),
}))

export const grantMirrorRelations = relations(grantMirror, ({ one, many }) => ({
  payloadLockedDocumentsRels: many(payloadLockedDocumentsRels),
  user: one(users, {
    fields: [grantMirror.payloadUserIdId],
    references: [users.id],
  }),
}))

export const chaptersRelations = relations(chapters, ({ one, many }) => ({
  payloadLockedDocumentsRels: many(payloadLockedDocumentsRels),
  user: one(users, {
    fields: [chapters.createdById],
    references: [users.id],
  }),
  book: one(books, {
    fields: [chapters.bookId],
    references: [books.id],
  }),
  chaptersVS: many(chaptersV),
}))

export const booksRelations = relations(books, ({ one, many }) => ({
  payloadLockedDocumentsRels: many(payloadLockedDocumentsRels),
  user: one(users, {
    fields: [books.createdById],
    references: [users.id],
  }),
  media: one(media, {
    fields: [books.coverId],
    references: [media.id],
  }),
  booksVS: many(booksV),
  chapters: many(chapters),
  chaptersVS: many(chaptersV),
  booksSubjects: many(booksSubjects),
  booksImportFailureLogs: many(booksImportFailureLog),
}))

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  payloadLockedDocumentsRels: many(payloadLockedDocumentsRels),
  postsVS: many(postsV),
  posts: many(posts),
  media: one(media, {
    fields: [categories.imageId],
    references: [media.id],
  }),
  user: one(users, {
    fields: [categories.createdById],
    references: [users.id],
  }),
}))

export const postsRelations = relations(posts, ({ one, many }) => ({
  payloadLockedDocumentsRels: many(payloadLockedDocumentsRels),
  postsTags: many(postsTags),
  postsVS: many(postsV),
  category: one(categories, {
    fields: [posts.categoryId],
    references: [categories.id],
  }),
  user: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
  media_coverImageId: one(media, {
    fields: [posts.coverImageId],
    references: [media.id],
    relationName: 'posts_coverImageId_media_id',
  }),
  media_metaImageId: one(media, {
    fields: [posts.metaImageId],
    references: [media.id],
    relationName: 'posts_metaImageId_media_id',
  }),
}))

export const payloadPreferencesRelsRelations = relations(payloadPreferencesRels, ({ one }) => ({
  user: one(users, {
    fields: [payloadPreferencesRels.usersId],
    references: [users.id],
  }),
  payloadPreference: one(payloadPreferences, {
    fields: [payloadPreferencesRels.parentId],
    references: [payloadPreferences.id],
  }),
}))

export const payloadPreferencesRelations = relations(payloadPreferences, ({ many }) => ({
  payloadPreferencesRels: many(payloadPreferencesRels),
}))

export const postsTagsRelations = relations(postsTags, ({ one }) => ({
  post: one(posts, {
    fields: [postsTags.parentId],
    references: [posts.id],
  }),
}))

export const homepageRelations = relations(homepage, ({ one }) => ({
  media_metaImageId: one(media, {
    fields: [homepage.metaImageId],
    references: [media.id],
    relationName: 'homepage_metaImageId_media_id',
  }),
  media_imageBannerId: one(media, {
    fields: [homepage.imageBannerId],
    references: [media.id],
    relationName: 'homepage_imageBannerId_media_id',
  }),
}))

export const postsVVersionTagsRelations = relations(postsVVersionTags, ({ one }) => ({
  postsV: one(postsV, {
    fields: [postsVVersionTags.parentId],
    references: [postsV.id],
  }),
}))

export const postsVRelations = relations(postsV, ({ one, many }) => ({
  postsVVersionTags: many(postsVVersionTags),
  category: one(categories, {
    fields: [postsV.versionCategoryId],
    references: [categories.id],
  }),
  user: one(users, {
    fields: [postsV.versionAuthorId],
    references: [users.id],
  }),
  media_versionCoverImageId: one(media, {
    fields: [postsV.versionCoverImageId],
    references: [media.id],
    relationName: 'postsV_versionCoverImageId_media_id',
  }),
  post: one(posts, {
    fields: [postsV.parentId],
    references: [posts.id],
  }),
  media_versionMetaImageId: one(media, {
    fields: [postsV.versionMetaImageId],
    references: [media.id],
    relationName: 'postsV_versionMetaImageId_media_id',
  }),
}))

export const booksVRelations = relations(booksV, ({ one, many }) => ({
  user: one(users, {
    fields: [booksV.versionCreatedById],
    references: [users.id],
  }),
  media: one(media, {
    fields: [booksV.versionCoverId],
    references: [media.id],
  }),
  book: one(books, {
    fields: [booksV.parentId],
    references: [books.id],
  }),
  booksVVersionSubjects: many(booksVVersionSubjects),
  booksVVersionImportFailureLogs: many(booksVVersionImportFailureLog),
}))

export const chaptersVRelations = relations(chaptersV, ({ one }) => ({
  user: one(users, {
    fields: [chaptersV.versionCreatedById],
    references: [users.id],
  }),
  book: one(books, {
    fields: [chaptersV.versionBookId],
    references: [books.id],
  }),
  chapter: one(chapters, {
    fields: [chaptersV.parentId],
    references: [chapters.id],
  }),
}))

export const booksSubjectsRelations = relations(booksSubjects, ({ one }) => ({
  book: one(books, {
    fields: [booksSubjects.parentId],
    references: [books.id],
  }),
}))

export const booksVVersionSubjectsRelations = relations(booksVVersionSubjects, ({ one }) => ({
  booksV: one(booksV, {
    fields: [booksVVersionSubjects.parentId],
    references: [booksV.id],
  }),
}))

export const booksImportFailureLogRelations = relations(booksImportFailureLog, ({ one }) => ({
  book: one(books, {
    fields: [booksImportFailureLog.parentId],
    references: [books.id],
  }),
}))

export const booksVVersionImportFailureLogRelations = relations(
  booksVVersionImportFailureLog,
  ({ one }) => ({
    booksV: one(booksV, {
      fields: [booksVVersionImportFailureLog.parentId],
      references: [booksV.id],
    }),
  }),
)
