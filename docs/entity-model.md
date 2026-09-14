# Entity model for review

This is a draft TypeORM model based on the system design and requirement analysis documents. It contains 28 tables across the current modules. No migration was generated or executed for this model.

| Module | Tables |
| --- | --- |
| Users | `clubs`, `users` |
| Auth | `refresh_sessions` |
| Horses | `horses`, `horse_ownerships` |
| Training | `training_plans`, `training_sessions`, `time_trials` |
| Performance | `performance_metrics`, `performance_thresholds`, `performance_evaluations` |
| Medical | `medical_records`, `prescriptions`, `injury_markers`, `training_locks`, `care_schedules` |
| Stable | `stalls`, `stable_assignments`, `feeding_plans`, `daily_checklists`, `incidents` |
| Racing | `races`, `race_registrations` |
| Supplies | `supply_items`, `supply_requests` |
| Notifications | `notifications` |
| Audit | `audit_logs` |
| Media | `media_assets` |

`Reports`, `Realtime`, and `Health` have no persistence entity. Reports can query or project data from the domain tables; no separate report table is specified yet.

## Modeling choices to review

- IDs use UUIDs; timestamps use PostgreSQL `timestamptz`; fields use camelCase in TypeScript and snake_case in PostgreSQL. PostgreSQL `numeric` and `bigint` values are represented as strings in entity properties to avoid precision loss.
- All mutable tables have `updated_at` and `version`. `horses`, `clubs`, `users`, `stalls`, and `supply_items` also have `deleted_at`. Metric, medical, prescription, injury, audit, media and refresh-session records do not expose ordinary update/delete lifecycle columns.
- Club ownership is explicit on top-level resources. Child tables inherit club scope through their parent relation. Preventing a cross-club reference requires service checks and, where needed, composite database constraints during migration design.
- The model defines a partial unique index for one ACTIVE training lock per horse. It also defines unique keys for club email, microchip within a club, race registration, session evaluation, and metric source/timestamp idempotency.
- Percent ownership summing to 100%, non-overlapping date ranges, horse eligibility, append-only medical/audit behavior, and the transaction that cancels future sessions when a training lock is created cannot be guaranteed by entity decorators alone. They require service rules and database-level constraints where appropriate.
- Threshold limits and feeding rations are JSONB because the exact shape is not settled in the design. Status fields are `varchar` so values can be finalized before migrations without creating PostgreSQL enum types.
- `care_schedules`, `time_trials`, `refresh_sessions`, and `media_assets` complete flows described outside the design document's core table list. Finance remains out of scope because the design places it in a later phase without a defined schema.

## Migration status

The existing migration `1789344000000-CreateHorses.ts` still creates only the original minimal `horses` table. It does not represent this draft schema. Keep `synchronize: false`; generate and review a replacement/follow-on migration after this entity model is approved. Do not assume `pnpm db:migrate` creates the other 27 tables yet.
