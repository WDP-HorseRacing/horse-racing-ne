# Race-horse API

NestJS modular monolith scaffold for the Racehorse Training and Management System. This repository provides the module boundaries and infrastructure described in `Racehorse_System_Design_NestJS.docx`; it intentionally has almost no business behavior yet.

## Stack and boundaries

- REST API under `/api/v1`, OpenAPI at `/docs`, Socket.IO namespace `/events`
- PostgreSQL with TypeORM and versioned migrations; `synchronize` is disabled
- Redis client ready for cache or background work, but no cache or queue is active yet
- S3-compatible object storage through AWS SDK v3, with MinIO for local development
- Internal domain events via `@nestjs/event-emitter`
- Global DTO validation, consistent HTTP error format, and correlation ID header
- Modules: Auth, Users, Horses, Training, Performance, Medical, Stable, Racing, Supplies, Reports, Notifications, Audit, Media, and Realtime

The `HorsesModule` demonstrates the intended `entity → repository → service → DTO mapper` structure. It exports its service so another module can call a public facade instead of importing its repository. All current REST route contracts and request DTOs are registered across Auth, Users, Horses, Training, Performance, Medical, Stable, Racing, Supplies, Reports, Media, Notifications, and Audit. These routes deliberately return HTTP `501 Not Implemented` until their authentication, authorization, persistence, and business services are added. The health route remains functional. Review the complete [endpoint catalog](docs/api-catalog.md) or [OpenAPI JSON](docs/openapi.contracts.json); regenerate both with `pnpm docs:api` without a database connection.

| API group      | Prepared routes                                                         |
| -------------- | ----------------------------------------------------------------------- |
| Auth and Users | Login, refresh, logout; list, create, update and change status of users |
| Horses         | Profile CRUD, ownership shares, current owner's horses                  |
| Training       | Plans, sessions, start, complete, cancel and evaluation                 |
| Performance    | Metric ingestion, session metrics and horse summary                     |
| Medical        | Records, prescriptions, injuries, training lock and release             |
| Operations     | Stalls, assignments, feeding, checklists, incidents, races and supplies |
| Supporting     | Notifications, audit, media upload/download URL contracts and reports   |

See `/docs` for exact paths and request schemas. These contracts do not imply that the corresponding workflows are implemented.

For each new use case, place HTTP or socket handling in `controllers/`, orchestration and transactions in `services/`, persistence in `repositories/`, data models in `entities/`, request/response types in `dto/`, and rules in `policies/`. Publish internal events only after a transaction commits. Keep TypeORM entities out of API responses.

## Local setup

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL and Redis: `docker compose up -d`.
3. Install dependencies: `pnpm install`.
4. Apply migrations: `pnpm db:migrate`.
5. Start the API: `pnpm start:dev`.

Check `GET http://localhost:3000/api/v1/health` for `{ "status": "ok" }` and open `http://localhost:3000/docs` for Swagger. Database configuration is required at startup. Redis connects lazily when a feature first uses it.

MinIO's S3 API is available at `http://localhost:9100` and its management console at `http://localhost:9101`. Docker Compose creates the configured `S3_BUCKET` automatically. `ObjectStorageService` exposes presigned upload/download URLs, object metadata lookup, and deletion; the public Media API remains contract-only until authentication and media metadata persistence are implemented.

## Commands

| Command                                | Purpose                                               |
| -------------------------------------- | ----------------------------------------------------- |
| `pnpm build`                           | Compile the app                                       |
| `pnpm lint`                            | Run ESLint                                            |
| `pnpm test`                            | Run unit tests                                        |
| `pnpm db:migrate`                      | Apply pending migrations                              |
| `pnpm db:revert`                       | Revert the last migration                             |
| `pnpm db:generate src/migrations/Name` | Generate a migration from entity changes              |
| `pnpm docs:api`                        | Regenerate the REST endpoint catalog from controllers |

The initial migration creates only the minimal `horses` table as an example. The full draft of 28 entity tables is listed in [docs/entity-model.md](docs/entity-model.md); it has not been migrated yet and currently differs from that initial migration. The Socket.IO gateway currently rejects connections until JWT handshake authorization and room policies are added. The HTTP route contracts are visible in Swagger, but Auth, RBAC, notifications, audit workflows, media storage, and domain behavior are not implemented yet.
