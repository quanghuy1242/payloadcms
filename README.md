# Payload Blank Starter

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/payloadcms/payload/tree/main/templates/with-vercel-postgres&project-name=payload-project&env=PAYLOAD_SECRET&build-command=pnpm%20run%20ci&stores=%5B%7B%22type%22:%22postgres%22%7D,%7B%22type%22:%22blob%22%7D%5D)

This template comes configured with the bare minimum to get started on anything you need.

## Quick start

Click the 'Deploy' button above to spin up this template directly into Vercel hosting. It will first prompt you save this template into your own Github repo so that you own the code and can make any changes you want to it.

Set up the following services and secrets and then once the app has been built and deployed you will be able to visit your site at the generated URL.
From this point on you can access your admin panel at `/admin` of your app URL, create an admin user and then click the 'Seed the database' button in the dashboard to add content into your app.

### Services

This project uses the following services integrated into Vercel which you will need to click "Add" and "Connect" for:

Turso (libSQL) - globally-distributed SQLite used to host your data. After provisioning, grab the `libsql://` connection URL and a scoped auth token.

Cloudflare R2 - object storage used to host your files such as images and videos. Create an R2 bucket, enable S3 API access, and generate an access key / secret pair with the appropriate permissions.

The connection variables will automatically be setup for you on Vercel when these services are connected.

#### Secrets

You will be prompted to add the following secret values to your project. These should be long unguessable strong passwords, you can also use a password manager to generate one for these.

PAYLOAD_SECRET - used by Payload to sign secrets like JWT tokens

## Quick Start - local setup

To spin up this template locally, follow these steps:

### Clone

After you click the `Deploy` button above, you'll want to have standalone copy of this repo on your machine. If you've already cloned this repo, skip to [Development](#development).

### Development

1. First [clone the repo](#clone) if you have not done so already
2. `cd my-project && cp .env.example .env` to copy the example environment variables. You'll need to add the `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `PAYLOAD_SECRET`, plus your `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` values so the app can connect to Turso and Cloudflare R2. If the Turso variables are omitted during local development, Payload falls back to a local SQLite file in `.payload/data.sqlite`, and if the R2 variables are omitted Payload stores media on the local filesystem instead.

3. `pnpm install && pnpm dev` to install dependencies and start the dev server
4. open `http://localhost:3000` to open the app in your browser

That's it! Changes made in `./src` will be reflected in your app. Follow the on-screen instructions to login and create your first admin user. Then check out [Production](#production) once you're ready to build and serve your app, and [Deployment](#deployment) when you're ready to go live.

#### Docker (Optional)

If you prefer to use Docker for local development instead of a local Postgres instance, the provided docker-compose.yml file can be used.

To do so, follow these steps:

- Modify the `POSTGRES_URL` in your `.env` file to `postgres://postgres@localhost:54320/<dbname>`
- Modify the `docker-compose.yml` file's `POSTGRES_DB` to match the above `<dbname>`
- Run `docker-compose up` to start the database, optionally pass `-d` to run in the background.

## How it works

The Payload config is tailored specifically to the needs of most websites. It is pre-configured in the following ways:

### Collections

See the [Collections](https://payloadcms.com/docs/configuration/collections) docs for details on how to extend this functionality.

- #### Users (Authentication)

  Users are auth-enabled collections that have access to the admin panel.

  For additional help, see the official [Auth Example](https://github.com/payloadcms/payload/tree/main/examples/auth) or the [Authentication](https://payloadcms.com/docs/authentication/overview#authentication-overview) docs.

- #### Media

  This is the uploads enabled collection. It features pre-configured sizes, focal point and manual resizing to help you manage your pictures.

## Working with SQLite / Turso

SQLite (and the hosted Turso libSQL edge network) still follows a strict schema, so the same care applies when making schema changes.

### Local development

By default the SQLite adapter uses `push: true` while `NODE_ENV !== 'production'`, which lets Payload automatically sync schema changes to your local SQLite file without running migrations manually. If you're pointing at Turso during local development you may prefer to leave `push` enabled so schema updates propagate automatically.

If you connect to your production Turso instance from a local machine, set `PUSH` to `false` for safety—otherwise you risk schema drift.

#### Migrations

[Migrations](https://payloadcms.com/docs/database/migrations) are essentially SQL code versions that keep track of your schema. With Turso you should create a migration any time you make a schema change that needs to land in production.

Locally create a migration:

```bash
PAYLOAD_SECRET=dev-secret TURSO_DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..." pnpm payload migrate:create
```

This creates the migration files you will need to push alongside your configuration. Commit both the `.ts` and `.json` artifacts that are generated in `src/migrations`.

On the server after building and before running `pnpm start` you will want to run your migrations:

```bash
pnpm payload migrate
```

This command checks for any migrations that have not yet been run, executes the outstanding migrations, and keeps a record in the database. Turso provides point-in-time snapshots, so consider taking one before running production migrations.

### Docker

Alternatively, you can use [Docker](https://www.docker.com) to spin up this template locally. To do so, follow these steps:

1. Follow [steps 1 and 2 from above](#development), the docker-compose file will automatically use the `.env` file in your project root
1. Next run `docker-compose up`
1. Follow [steps 4 and 5 from above](#development) to login and create your first admin user

That's it! The Docker instance will help you get up and running quickly while also standardizing the development environment across your teams.

## Questions

If you have any issues or questions, reach out to us on [Discord](https://discord.com/invite/payload) or start a [GitHub discussion](https://github.com/payloadcms/payload/discussions).
