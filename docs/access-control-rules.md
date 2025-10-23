# Access Control Rules

This document defines all access control rules for the PayloadCMS application.

## Overview

The system implements role-based access control (RBAC) with two roles:
- **Admin** (`role: 'admin'`): Full access to all resources and operations
- **User** (`role: 'user'`): Restricted access based on ownership and publication status

## Core Principles

1. **Admin users bypass all restrictions** - They have full CRUD access to everything
2. **Authentication required** - All operations require authentication (except public endpoints if configured)
3. **Ownership-based access** - Users can only modify their own resources
4. **Publication-based visibility** - Draft/private content is only visible to owners

---

## Collections Access Rules

### Posts Collection

| Operation | Admin | Authenticated User | Unauthenticated |
|-----------|-------|-------------------|-----------------|
| **CREATE** | ✅ Yes | ✅ Yes (auto-assigned as author) | ❌ No |
| **READ** | ✅ All posts | ✅ Published posts OR own drafts | ❌ No access |
| **UPDATE** | ✅ Any post | ✅ Own posts only (via `author` field) | ❌ No |
| **DELETE** | ✅ Any post | ✅ Own posts only (via `author` field) | ❌ No |

**Implementation:**
- Create: `authenticatedAccess`
- Read: `postsReadAccess` (custom logic)
- Update: `ownerAccess('author')`
- Delete: `ownerAccess('author')`

**Special Rules:**
- Posts have `_status` field (draft/published)
- Ownership enforced via `enforceOwnershipHook('author')`
- Slugs are immutable after creation

---

### Categories Collection

| Operation | Admin | Authenticated User | Unauthenticated |
|-----------|-------|-------------------|-----------------|
| **CREATE** | ✅ Yes | ✅ Yes (auto-assigned as `createdBy`) | ❌ No |
| **READ** | ✅ All categories | ✅ All categories | ❌ No access |
| **UPDATE** | ✅ Any category | ✅ Own categories only (via `createdBy`) | ❌ No |
| **DELETE** | ✅ Any category | ✅ Own categories only (via `createdBy`) | ❌ No |

**Implementation:**
- Create: `authenticatedAccess`
- Read: `authenticatedAccess`
- Update: `ownerAccess('createdBy')`
- Delete: `ownerAccess('createdBy')`

**Special Rules:**
- All authenticated users can view all categories
- Ownership enforced via `enforceOwnershipHook('createdBy')`
- Slugs are immutable after creation

---

### Users Collection

| Operation | Admin | Authenticated User | Unauthenticated |
|-----------|-------|-------------------|-----------------|
| **CREATE** | ✅ Yes (can set any role) | ❌ No | ❌ No |
| **READ** | ✅ All users, all fields | ✅ All users, public fields only | ❌ No access |
| **UPDATE** | ✅ Any user, any field | ✅ Own profile only, limited fields | ❌ No |
| **DELETE** | ✅ Any user | ❌ No | ❌ No |

**Implementation:**
- Create: Admin only (`isAdminUser`)
- Read: `authenticatedAccess` (collection level)
- Update: `adminOrSelfAccess`
- Delete: Admin only (`isAdminUser`)

**Field-Level Access:**

| Field | Admin | Self | Other Users | Unauthenticated |
|-------|-------|------|-------------|-----------------|
| `email` | ✅ Read/Write | ✅ Read/Write | ❌ Hidden | ❌ No access |
| `fullName` | ✅ Read/Write | ✅ Read/Write | ✅ Read only | ❌ No access |
| `avatar` | ✅ Read/Write | ✅ Read/Write | ✅ Read only | ❌ No access |
| `bio` | ✅ Read/Write | ✅ Read/Write | ✅ Read only | ❌ No access |
| `role` | ✅ Read/Write | ❌ Hidden | ❌ Hidden | ❌ No access |
| `password` | ✅ Write only | ✅ Write only | ❌ No access | ❌ No access |
| `apiKey` | ✅ Read/Write | ✅ Read/Write | ❌ Hidden | ❌ No access |

**Special Rules:**
- Users cannot change their own `role` (enforced via hook)
- New users default to `role: 'user'`
- Only admins can create users (prevents spam registration)
- Public fields visible for author attribution

---

### Media Collection

| Operation | Admin | Authenticated User | Unauthenticated |
|-----------|-------|-------------------|-----------------|
| **CREATE** | ✅ Yes | ✅ Yes (auto-assigned as owner) | ❌ No |
| **READ** | ✅ All media | ✅ Own media + media in use | ❌ No access |
| **UPDATE** | ✅ Any media | ✅ Own media only (via `owner`) | ❌ No |
| **DELETE** | ✅ Any media | ✅ Own media only (via `owner`) | ❌ No |

**Implementation:**
- Create: `authenticatedAccess`
- Read: `publishedMediaReadAccess` (complex custom logic)
- Update: `ownerAccess('owner')`
- Delete: `ownerAccess('owner')`

**Media Visibility Rules:**

Media is visible to authenticated users if **ANY** of these conditions are met:

1. **Ownership**: User is the media owner
2. **Published Posts**: Media is used in a published post:
   - As `coverImage`
   - As `meta.image` (SEO)
   - Inside Lexical rich text `content`
3. **Categories**: Media is used as category `image`
4. **User Avatars**: Media is used as user `avatar`
5. **Homepage**: Media is used in homepage `imageBanner`

**Special Rules:**
- Private media (not referenced anywhere) is only visible to owner
- Ownership enforced via `enforceOwnershipHook('owner')`
- Media access checks are async and query-intensive

---

## Globals Access Rules

### Homepage Global

| Operation | Admin | Specific Users | Authenticated | Unauthenticated |
|-----------|-------|----------------|---------------|-----------------|
| **READ** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes (public) |
| **UPDATE** | ✅ Yes | ✅ Yes (if email contains 'quanghuy1242') | ❌ No | ❌ No |

**Implementation:**
- Read: `publicReadAccess`
- Update: `adminOrEmailContains('quanghuy1242')`

---

## Access Control Utilities

### Core Functions (`src/utils/access.ts`)

#### `isAdminUser(user)`
- Returns `true` if user has `role: 'admin'`
- Used throughout the system to bypass restrictions

#### `authenticatedAccess({ req })`
- Returns `true` if user is logged in
- Admin users always pass
- Checks if `getUserId(req.user)` returns a valid ID

#### `ownerAccess(field)`
- Returns a query constraint: `{ [field]: { equals: userId } }`
- Limits operations to documents where the specified field matches the user ID
- Blocks unauthenticated users

#### `adminOrSelfAccess({ req, doc, id })`
- Admin users always pass
- Users can access documents where `doc.id === user.id`
- Used for user profile access

#### `adminOrSelfFieldAccess({ req, doc, id })`
- Same as `adminOrSelfAccess` but for field-level access
- Used to hide sensitive fields from other users

#### `postsReadAccess({ req })`
- Admin users see all posts
- Authenticated users see: published posts OR own posts
- Returns query: `{ or: [{ author: { equals: userId } }, { _status: { equals: 'published' } }] }`
- Unauthenticated users blocked

#### `publishedMediaReadAccess({ req, data, id })`
- Complex async function that checks media visibility
- Queries posts, categories, users, and homepage to determine if media is "in use"
- Falls back to owner-only access if not found in any references

### Ownership Hooks (`src/utils/ownership.ts`)

#### `enforceOwnershipHook(fieldName)`
- Auto-assigns current user ID to the specified field during create/update
- Prevents users from claiming ownership of others' content
- Used in `beforeValidate` hooks

---

## Security Considerations

### What's Protected

✅ **Email addresses** - Only visible to self and admins  
✅ **User roles** - Only visible to admins  
✅ **Draft posts** - Only visible to author and admins  
✅ **Private media** - Only visible to owner unless referenced elsewhere  
✅ **API keys** - Auto-protected by PayloadCMS auth system  
✅ **Passwords** - Never returned in responses (PayloadCMS handles this)  

### What's Public (for authenticated users)

✅ **Published posts** - Visible to all authenticated users  
✅ **Categories** - All visible to authenticated users  
✅ **User profiles** - Names, avatars, bios visible for author attribution  
✅ **Media in use** - Visible if referenced in published content  

### Potential Security Risks

⚠️ **User enumeration** - Authenticated users can see all user profiles (limited to public fields)  
⚠️ **Category visibility** - All categories visible to authenticated users  
⚠️ **Media discovery** - Media referenced in published posts is discoverable  

---

## Testing

Comprehensive integration tests in `tests/int/access-control.int.spec.ts` verify:

- ✅ Users can read published posts from others
- ✅ Users cannot read others' drafts
- ✅ Unauthenticated users are blocked
- ✅ Users can update their own resources only
- ✅ Field-level access (email hiding, role protection)
- ✅ Media privacy (private media not accessible)
- ✅ Media visibility (published post media is accessible)

Run tests: `pnpm test:int tests/int/access-control.int.spec.ts`

---

## Common Patterns

### Adding a New Collection with Ownership

```typescript
export const MyCollection: CollectionConfig = {
  slug: 'my-collection',
  access: {
    create: authenticatedAccess,
    read: authenticatedAccess, // or custom logic
    update: ownerAccess('owner'),
    delete: ownerAccess('owner'),
  },
  hooks: {
    beforeValidate: [enforceOwnershipHook('owner')],
  },
  fields: [
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    // ... other fields
  ],
}
```

### Adding Field-Level Access

```typescript
{
  name: 'sensitiveField',
  type: 'text',
  access: {
    read: adminOrSelfFieldAccess,
    update: adminOrSelfFieldAccess,
  },
}
```

### Custom Access Control

```typescript
const customReadAccess: Access = ({ req }) => {
  if (isAdminUser(req.user)) {
    return true
  }

  const userId = getUserId(req.user)
  if (userId == null) {
    return false
  }

  // Custom logic here
  return {
    // Query constraints
  }
}
```

---

## Migration Considerations

When changing access control rules:

1. **Create a migration** if database structure changes
2. **Update tests** to reflect new rules
3. **Check relationships** - ensure related collections still work
4. **Test GraphQL** - queries respect access control
5. **Review frontend** - ensure UI matches new permissions

---

## Related Files

- `src/utils/access.ts` - Core access control utilities
- `src/utils/ownership.ts` - Ownership enforcement hooks
- `src/collections/Posts.ts` - Posts access implementation
- `src/collections/Categories.ts` - Categories access implementation
- `src/collections/Users.ts` - Users access implementation
- `src/collections/Media.ts` - Media access implementation
- `tests/int/access-control.int.spec.ts` - Access control tests

---

**Last Updated:** October 24, 2025
