# BSS website V0

A locally runnable V0 of the Budavári Schönherz Studió video archive and
editorial system (TanStack Start + PostgreSQL + Authentik).

## Documentation

- [Maintainers: releases and Docker images](./MAINTAINERS.md)
- [OOB inputs](./docs/oob-inputs.md)
- [Member update webhook (OpenAPI 3.1)](./docs/api/members-webhook.openapi.yaml)
- Examples: [OOB config](./docs/examples/oob-config.example.json),
  [seed JSON](./docs/examples/seed.example.json)

## Prerequisites

- Node 24+ and pnpm (`corepack enable` or `mise install`)
- Docker (PostgreSQL + Authentik)

## Running from a clean clone

No step requires manual database changes.

```bash
pnpm install
cp .env.example .env                              # DATABASE_URL, TEST_DATABASE_URL
pnpm infra:bootstrap                              # local secrets + Authentik blueprint (idempotent)
docker compose -f docker-compose.dev.yml up -d    # PostgreSQL :5582, Authentik :9000
pnpm db:migrate
pnpm check:oob                                    # reports a specific error for missing OOB inputs
pnpm db:seed                                      # optional, idempotent
pnpm webhook:client create "local push"           # first webhook token, no login needed
pnpm dev                                          # http://localhost:3000
```

Quality gate:

```bash
pnpm typecheck && pnpm lint && pnpm check
TEST_DATABASE_URL=postgres://bss:bss@127.0.0.1:5582/bss pnpm test   # Vitest does not read .env
pnpm build
```

Notes:

- `pnpm infra:bootstrap` never overwrites existing secrets.
- The production server applies pending migrations itself, on its first
  request, and exits if they fail.
- The app owns member data: it is written by updates sent to
  `POST /api/webhooks/members`. There is no automatic sync from Authentik —
  Authentik provides login, groups and the username (stored on login; until
  then the profile URL uses the `sub`).
- The webhook OpenAPI spec is generated from the server's field definitions by
  `pnpm openapi:generate`. Don't edit it by hand; a unit test fails if it
  drifts.
- `oob/seed.json` is produced by the scraper (see
  [docs/oob-inputs.md](./docs/oob-inputs.md)). The seed's staff credits
  reference the bootstrap test profiles; if the member table is empty, the
  importer asks you to push members first.
- Authentik UI: http://127.0.0.1:9000

## Commands

| Command                                   | Purpose                                             |
| ----------------------------------------- | --------------------------------------------------- |
| `pnpm dev`                                | dev server (:3000)                                  |
| `pnpm build`                              | production build (Nitro)                            |
| `pnpm typecheck`                          | route generation + `tsc --noEmit`                   |
| `pnpm lint`                               | ESLint                                              |
| `pnpm check` / `pnpm format`              | Prettier check / auto-fix                           |
| `TEST_DATABASE_URL=… pnpm test`           | unit + integration tests                            |
| `pnpm db:generate` / `pnpm db:migrate`    | generate / run migrations                           |
| `pnpm db:seed`                            | idempotent seed import                              |
| `pnpm check:oob`                          | validate OOB config                                 |
| `pnpm infra:bootstrap`                    | local secrets + Authentik blueprint                 |
| `pnpm webhook:client`                     | manage webhook clients                              |
| `pnpm openapi:generate`                   | regenerate the webhook OpenAPI spec                 |
| `pnpm exec tsx scripts/migrate-legacy.ts` | migrate the legacy site (`--dry-run` / `--execute`) |
