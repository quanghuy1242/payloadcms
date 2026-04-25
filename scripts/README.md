# Scripts

This directory contains utility scripts for managing the PayloadCMS project.

## Available Scripts

### `drizzle-introspect.sh`

Rebuilds the local SQLite database from Payload migrations, then introspects the resulting schema into a Drizzle output directory.

**Usage:**
```bash
pnpm drizzle:introspect
```

**Options:**
- `--db FILE`: SQLite file to migrate and introspect, defaults to `./.payload/data.sqlite`
- `--out DIR`: Output directory for the generated Drizzle files, defaults to `./shared/db/generated`
- `--fresh`: Drop the SQLite database and re-run all migrations from scratch, this is the default
- `--migrate`: Apply only pending migrations against the current database
- `--no-format`: Skip Prettier formatting of the generated output

**Example:**
```bash
bash scripts/drizzle-introspect.sh --db .payload/data.sqlite --out ./shared/db/generated
```

The script runs the same sequence used for local schema inspection:
1. Apply Payload migrations to the selected SQLite database
2. Run `drizzle-kit pull` against that database
3. Format the generated files with Prettier

---

### `promote-user.ts`

Promotes a user to admin role by directly updating the database.

**Usage:**
```bash
pnpm promote:admin --email user@example.com
```

**Options:**
- `--email` or `-e`: Email address of the user to promote (required)

**Example:**
```bash
pnpm promote:admin --email john@example.com
```

---

### `download-datocms-images.ts`

Downloads all images from a DatoCMS project to a local directory. This is useful for migrating media assets from DatoCMS to PayloadCMS.

**Usage:**
```bash
pnpm download:datocms --token YOUR_DATOCMS_TOKEN --output ./downloads [--env production]
```

**Options:**
- `--token` or `-t`: Your DatoCMS read-only API token (required)
- `--output` or `-o`: Output directory for downloaded images (default: `./media/datocms-downloads`)
- `--env` or `-e`: DatoCMS environment name (optional, defaults to primary environment)

**Examples:**

Basic usage (downloads to default directory):
```bash
pnpm download:datocms --token abc123xyz
```

Custom output directory:
```bash
pnpm download:datocms --token abc123xyz --output ./my-images
```

Specific environment:
```bash
pnpm download:datocms --token abc123xyz --env production --output ./prod-images
```

**Features:**
- ✅ Fetches all uploads using DatoCMS GraphQL API with pagination
- ✅ Downloads images with original filenames
- ✅ Skips already downloaded files (resume capability)
- ✅ Saves metadata (alt text, title, focal point, etc.) to `metadata.json`
- ✅ Sanitizes filenames for filesystem safety
- ✅ Shows progress with download statistics

**Getting your DatoCMS API Token:**
1. Go to your DatoCMS project settings
2. Navigate to "API tokens"
3. Create a new read-only token with access to the "Media Area"
4. Copy the token and use it with the script

**Output Structure:**
```
./media/datocms-downloads/
├── metadata.json         # All upload metadata (alt, title, dimensions, etc.)
├── image1.jpg
├── image2.png
└── ...
```

**Next Steps After Download:**
After downloading images from DatoCMS, you can:
1. Upload them to PayloadCMS via the admin panel
2. Use the metadata.json file to restore alt text, titles, and other metadata
3. Create a migration script to bulk import with preserved metadata
