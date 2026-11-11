# Budget Integration Platform

## 1. Purpose

The **Budget Integration Platform** is a Node.js / TypeScript integration framework for synchronizing property-management data from external PMS systems such as **Entrata**, **Yardi**, and **Excel imports** into a common canonical PostgreSQL database.

The platform supports:

- Multi-company and multi-organization data isolation
- Multiple PMS sources per organization
- Staging-first integration
- Canonical production tables
- Source-to-canonical record mapping
- Idempotent sync using `sourceHash`
- BullMQ-based background processing
- Scheduled sync jobs
- Future plug-in style connectors

Current focus:

- Entrata Property sync
- Entrata Property Unit sync
- Planned Entrata Unit Type sync
- Future Yardi and Excel integration

---

## 2. Core Architecture

```text
External PMS / Excel
        ↓
Connector
        ↓
Sync Job
        ↓
Staging API Batch
        ↓
Staging Entity Rows
        ↓
Transform Queue
        ↓
Transformer
        ↓
Canonical Tables
        ↓
SourceRecordMap
```

### Important Rules

1. Raw PMS payloads should not be stored directly in production tables.
2. Full API responses go into `StagingApiBatch.rawResponse`.
3. Individual raw records go into entity staging tables.
4. Production tables must remain source-neutral.
5. Every domain record should include:
   - `companyId`
   - `organizationId`
6. External IDs should be mapped through `SourceRecordMap`.
7. Repeated syncs should be safe through `sourceHash`.

---

## 3. Technology Stack

| Area | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| ORM | Prisma |
| Database | PostgreSQL |
| Queue | BullMQ |
| Queue Store | Redis |
| HTTP Client | Axios |
| Worker Runner | tsx |
| Package Style | npm workspaces |

---

## 4. Folder Structure

```text
budget-integration-platform/
│
├── apps/
│   └── worker/
│       ├── src/
│       │   ├── jobs/
│       │   │   ├── sync-entrata-properties.job.ts
│       │   │   ├── transform-staged-properties.job.ts
│       │   │   ├── sync-entrata-property-units.job.ts
│       │   │   └── transform-staged-property-units.job.ts
│       │   │
│       │   ├── processors/
│       │   │   ├── sync-property.processor.ts
│       │   │   ├── sync-property-units.processor.ts
│       │   │   ├── transform-property-staging.processor.ts
│       │   │   └── transform-property-unit-staging.processor.ts
│       │   │
│       │   ├── schedulers/
│       │   │   ├── entrata-property.scheduler.ts
│       │   │   └── entrata-property-unit.scheduler.ts
│       │   │
│       │   └── main.ts
│       │
│       └── package.json
│
├── packages/
│   ├── database/
│   │   ├── src/
│   │   │   ├── prisma.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── integration-core/
│   │   ├── src/
│   │   │   ├── queues/
│   │   │   │   ├── queue-names.ts
│   │   │   │   ├── job-types.ts
│   │   │   │   ├── redis-connection.ts
│   │   │   │   └── integration-queues.ts
│   │   │   │
│   │   │   ├── transformers/
│   │   │   │   ├── entrata-property.transformer.ts
│   │   │   │   └── entrata-property-unit.transformer.ts
│   │   │   │
│   │   │   ├── utils/
│   │   │   │   └── hash.ts
│   │   │   │
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── connectors/
│       └── entrata/
│           ├── src/
│           │   ├── entrata-property.connector.ts
│           │   ├── entrata-property-units.connector.ts
│           │   ├── entrata-unit-types.connector.ts
│           │   └── index.ts
│           └── package.json
│
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
│
├── prisma.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## 5. File Naming Conventions

| Purpose | Pattern | Example |
|---|---|---|
| Connector | `<provider>-<entity>.connector.ts` | `entrata-property-units.connector.ts` |
| Sync job | `sync-<provider>-<entity>.job.ts` | `sync-entrata-property-units.job.ts` |
| Transform job | `transform-staged-<entity>.job.ts` | `transform-staged-property-units.job.ts` |
| Transformer | `<provider>-<entity>.transformer.ts` | `entrata-property-unit.transformer.ts` |
| Processor | `<action>-<entity>.processor.ts` | `sync-property-units.processor.ts` |
| Scheduler | `<provider>-<entity>.scheduler.ts` | `entrata-property-unit.scheduler.ts` |

---

## 6. Queue Naming

Recommended queue names:

```ts
export const QueueNames = {
  SyncProperty: "sync-property-queue",
  SyncPropertyUnit: "sync-property-unit-queue",
  TransformPropertyStaging: "transform-property-staging-queue",
  TransformPropertyUnitStaging: "transform-property-unit-staging-queue"
} as const;
```

Do not confuse queue names with job names.

| Queue | Job Name |
|---|---|
| `sync-property-queue` | `sync-entrata-property` |
| `sync-property-unit-queue` | `sync-entrata-property-units` |
| `transform-property-staging-queue` | `transform-property-staging` |
| `transform-property-unit-staging-queue` | `transform-property-unit-staging` |

Correct job-name check:

```ts
if (job.name !== "sync-entrata-property-units") {
  return;
}
```

Incorrect:

```ts
if (job.name !== "sync-property-unit-queue") {
  return;
}
```

---

## 7. Database Concepts

### Company

Represents the customer/company.

### Organization

Represents the business unit, root organization, legal entity, or operating organization.

### IntegrationSource

Represents a configured PMS/source for an organization.

Examples:

```text
GALLERY_ENTRATA
GALLERY_YARDI
GALLERY_EXCEL
```

### IntegrationSourceConfig

Stores source-level connection and credential details.

Example:

```json
{
  "baseUrl": "https://apis.entrata.com",
  "orgSlug": "galleryresidential"
}
```

Credential example:

```json
{
  "authType": "apikey",
  "apiKeySecretRef": "vault://gallery/entrata/api-key"
}
```

For local development only:

```json
{
  "authType": "apikey",
  "apiKey": "local-dev-key"
}
```

### IntegrationSourceEntity

Stores entity-specific configuration.

Examples:

```text
Property
PropertyUnit
UnitType
Budget
Actual
```

Recommended fields:

```prisma
syncSettingsJson   Json?
mappingProfileJson Json?
```

Example Property config:

```json
{
  "schedule": "0 */1 * * *",
  "batchSize": 50,
  "syncMode": "incremental"
}
```

Example PropertyUnit config:

```json
{
  "schedule": "*/2 * * * *",
  "propertyUnitBatchSize": 1,
  "transformBatchSize": 50,
  "syncMode": "incremental",
  "availableUnitsOnly": false,
  "usePropertyPreferences": false,
  "includeDisabledFloorplans": false,
  "includeDisabledUnits": true
}
```

### SourceRecordMap

Maps external records to canonical records.

Example:

```text
Entrata PropertyID 100154067 → properties.id
Entrata UnitID 55270 → property_units.id
```

This table is used for:

- Matching
- Idempotency
- Re-sync
- Multi-source mapping
- Avoiding duplicate canonical records

---

## 8. Staging Pattern

### StagingApiBatch

Stores full request and response:

```text
entityName
sourceMethod
requestId
rawRequest
rawResponse
status
```

### StagingProperty

Stores one external property payload per row.

### StagingPropertyUnit

Stores one external property unit payload per row.

### Why Staging Exists

Staging provides:

- Audit trail
- Replay support
- Debugging
- Raw payload preservation
- Safer transformations
- Separation between external payload and canonical records

---

## 9. Idempotency / sourceHash

The platform creates a deterministic SHA256 hash from the normalized source payload.

Flow:

```text
Incoming payload
  ↓
Normalize JSON key order
  ↓
Create sourceHash
  ↓
Compare with SourceRecordMap.sourceHash
```

If unchanged:

```text
transformStatus = SKIPPED
```

If new or changed:

```text
transformStatus = PENDING
```

Expected logs:

```text
First run:
Received: 118, Staged: 118, Skipped: 0, Pending transform: 118

Second run with no changes:
Received: 118, Staged: 118, Skipped: 118, Pending transform: 0
```

---

## 10. BullMQ Flow

### Property Sync

```text
entrata-property.scheduler.ts
  ↓
sync-property-queue
  ↓
sync-property.processor.ts
  ↓
sync-entrata-properties.job.ts
  ↓
StagingProperty
  ↓
transform-property-staging-queue
  ↓
transform-property-staging.processor.ts
  ↓
transform-staged-properties.job.ts
  ↓
entrata-property.transformer.ts
  ↓
properties and related tables
```

### Property Unit Sync

```text
entrata-property-unit.scheduler.ts
  ↓
sync-property-unit-queue
  ↓
sync-property-units.processor.ts
  ↓
sync-entrata-property-units.job.ts
  ↓
StagingPropertyUnit
  ↓
transform-property-unit-staging-queue
  ↓
transform-property-unit-staging.processor.ts
  ↓
transform-staged-property-units.job.ts
  ↓
entrata-property-unit.transformer.ts
  ↓
property_units and related tables
```

---

## 11. Entrata Integration Notes

### Property API

Endpoint pattern:

```text
https://apis.entrata.com/ext/orgs/{orgSlug}/v1/properties
```

Method:

```json
{
  "method": {
    "name": "getProperties"
  }
}
```

### Property Unit API

Endpoint pattern currently verified in implementation:

```text
https://apis.entrata.com/ext/orgs/{orgSlug}/v1/propertyunits
```

Method:

```json
{
  "method": {
    "name": "getPropertyUnits",
    "params": {
      "propertyIds": "100154067",
      "availableUnitsOnly": "0",
      "usePropertyPreferences": "0",
      "includeDisabledFloorplans": "0",
      "includeDisabledUnits": "1"
    }
  }
}
```

Current config:

```json
{
  "propertyUnitBatchSize": 1
}
```

This means:

```text
1 propertyId per getPropertyUnits API request
```

The job still loops through all mapped properties.

### Unit Type API

Endpoint pattern:

```text
https://apis.entrata.com/ext/orgs/{orgSlug}/v1/propertyunits
```

Method:

```json
{
  "method": {
    "name": "getUnitTypes",
    "params": {
      "propertyId": 100121180
    }
  }
}
```

Recommended entity name:

```text
UnitType
```

---

## 12. Environment Variables

Create `.env`:

```env
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/budget_integration_db?schema=public"

ENTRATA_BASE_URL="https://apis.entrata.com"
ENTRATA_API_KEY="your_actual_entrata_api_key"

PROPERTY_SERVICE_PORT=3001
BUDGET_SERVICE_PORT=3002
RENT_DETAILS_SERVICE_PORT=3003
PORT=3000

ENABLE_EMBEDDED_WORKER=true
```

---

## 13. Prisma Commands

```powershell
# Reformat all files under prisma/schema/*.prisma consistently.
npx prisma format

# Regenerate the Prisma Client (packages/database) from the schema.
# Run this after every schema change and after a fresh npm install.
npx prisma generate

# Create a new migration from the current schema diff and apply it locally.
# Prompts for confirmation and runs `prisma generate` automatically after.
npx prisma migrate dev --name migration_name_here

# Real examples from this project's migration history:
npx prisma migrate dev --name add_property_unit_schema
npx prisma migrate dev --name add_entity_specific_sync_config

# Re-run prisma/seed.ts (see the "seed" entry in package.json).
npx prisma db seed

# Open Prisma Studio, a visual DB browser, at http://localhost:5555.
npx prisma studio

# Validate prisma/schema/*.prisma for syntax/relation errors without
# generating a client or touching the database.
npx prisma validate

# Sanity-check that the CLI and installed client/package versions match —
# a mismatch is a common source of "model not found" errors.
npx prisma --version
npm ls prisma
npm ls @prisma/client
```

---

## 14. Prisma 7 Note

For Prisma 7, keep the datasource URL in `prisma.config.ts`.

Example:

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    url: env("DATABASE_URL")
  }
});
```

`schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
}
```

Keep `prisma` and `@prisma/client` versions aligned.

---

## 15. npm Commands

All available `package.json` scripts, grouped by purpose.

### Setup

```powershell
# Install all workspace dependencies (apps/*, packages/*, packages/connectors/*)
npm install
```

### Run apps (dev, via tsx — no build step required)

```powershell
# Run the worker: BullMQ processors for sync/transform/projection jobs.
# On startup it prompts interactively for which processors to load
# (ALL, REPORT_ONLY, BUDGET_ACTUAL_ONLY, BUDGET_ONLY, PROPERTY_ONLY,
# PROPERTY_UNIT_ONLY, UNIT_TYPE_ONLY, GL_TREE_ONLY, NONE).
npm run dev:worker

# Skip the interactive prompt by setting WORKER_MODE (useful for scripts
# or a process manager like PM2). Must be one of the modes listed above.
$env:WORKER_MODE = "BUDGET_ACTUAL_ONLY"
npm run dev:worker

# Run the NestJS API (apps/api): currently exposes the integration-sync
# controller, e.g. POST /integration-sync/entrata/budget-actuals.
npm run dev:api
```

Add the worker script if it's missing from `package.json`:

```powershell
npm pkg set scripts.dev:worker="tsx apps/worker/src/main.ts"
```

### Type check and build

```powershell
# Type check the whole workspace without emitting output. Run this after
# any change — it's the fastest way to catch mistakes across packages.
npm run dev:typecheck

# Compile TypeScript to JS (tsc) for a production build.
npm run dev:build
```

### Prisma (npm script aliases)

These wrap the `npx prisma ...` commands in section 13 above and read
`DATABASE_URL` from `.env` the same way.

```powershell
# Generate the Prisma Client from prisma/schema — run after pulling schema
# changes or editing any prisma/schema/*.prisma file.
npm run prisma:generate

# Create and apply a new migration in dev, prompts for a migration name.
npm run prisma:migrate

# Open Prisma Studio (visual DB browser) at http://localhost:5555.
npm run prisma:studio
```

### Tests

```powershell
# No test suite is configured yet; this currently just exits with an error.
npm test
```

---

## 16. Local Setup Flow

```powershell
# 1. Install dependencies
npm install

# 2. Make sure the "budget-integration-redis" container is running,
#    reachable at the host/port configured in .env (REDIS_HOST, REDIS_PORT).
#    TODO: document the exact start command for this container.

# 3. Prepare the database
npx prisma format
npx prisma generate
npx prisma migrate dev
npx prisma db seed

# 4. Type check (optional, but cheap and catches setup issues early)
npm run dev:typecheck

# 5. Run the worker — pick a mode at the interactive prompt, or set
#    WORKER_MODE beforehand to skip it (see section 15 for valid values).
npm run dev:worker

# Optional: run the API in another terminal.
npm run dev:api
```

---

## 17. Expected Worker Logs

Scheduler registration:

```text
Budget Integration Worker started
Registered Property scheduler: sync-entrata-property-...
Registered PropertyUnit scheduler: sync-entrata-property-units-...
Schedulers registered. Workers are running. Press Ctrl+C to stop.
```

Property sync with no changes:

```text
Entrata Property sync completed. Received: 118, Staged: 118, Skipped: 118, Pending transform: 0.
```

PropertyUnit sync:

```text
PropertyUnit sync found 119 distinct property IDs in 119 batches. Batch size: 1.
Calling getPropertyUnits batch 1/119...
Received getPropertyUnits batch 1/119...
Entrata PropertyUnit sync completed...
PropertyUnit transform batch processed...
```

---

## 18. Cleanup SQL

Remove property and unit data:

```sql
delete from property_unit_spaces;
delete from property_unit_addresses;
delete from property_units;

delete from lease_start_windows;
delete from property_lease_terms;
delete from property_space_options;
delete from space_options;
delete from property_office_hours;
delete from property_post_months;
delete from property_addresses;

delete from source_record_maps
where canonical_table_name in ('properties', 'property_units')
   or entity_name in ('Property', 'PropertyUnit');

delete from staging_property_units;
delete from staging_properties;

delete from staging_api_batches
where entity_name in ('Property', 'PropertyUnit');

delete from integration_sync_runs
where entity_name in ('Property', 'PropertyUnit')
   or sync_type in ('PROPERTY_SYNC', 'PROPERTY_UNIT_SYNC');

delete from integration_queue_jobs
where entity_name in ('Property', 'PropertyUnit');

delete from properties;
```

Clear Redis:

```powershell
docker exec -it redis redis-cli FLUSHALL
```

---

## 19. How to Add a New Entity for Existing Provider

Example: Add Entrata `UnitType`.

### Step 1: Add Prisma schema

Recommended tables:

```text
staging_unit_types
property_unit_types
property_unit_type_floorplans
property_unit_type_rent_terms
```

Run:

```powershell
npx prisma format
npx prisma migrate dev --name prisma_init
npx prisma generate

npx prisma db seed
```

### Step 2: Add IntegrationSourceEntity

Seed:

```ts
{
  integrationSourceId: ids.entrataSourceId,
  entityName: "UnitType",
  isEnabled: true,
  syncMode: "incremental",
  isAuthoritative: true,
  priorityOrder: 3,
  syncSettingsJson: {
    schedule: "*/10 * * * *",
    propertyBatchSize: 1,
    transformBatchSize: 50,
    syncMode: "incremental"
  }
}
```

### Step 3: Add connector

```text
packages/connectors/entrata/src/entrata-unit-types.connector.ts
```

Export it:

```ts
export * from "./entrata-unit-types.connector.js";
```

### Step 4: Add sync job

```text
apps/worker/src/jobs/sync-entrata-unit-types.job.ts
```

Responsibilities:

```text
Fetch mapped property IDs
Batch property IDs
Call connector
Create StagingApiBatch
Create StagingUnitType rows
Calculate sourceHash
Skip unchanged records
Return sync result
```

### Step 5: Add transformer

```text
packages/integration-core/src/transformers/entrata-unit-type.transformer.ts
```

Responsibilities:

```text
Resolve Property using SourceRecordMap
Upsert canonical UnitType
Upsert child floorplan/rent-term records
Update SourceRecordMap
Mark staging row TRANSFORMED
```

### Step 6: Add transform job

```text
apps/worker/src/jobs/transform-staged-unit-types.job.ts
```

### Step 7: Add queues

Update:

```text
packages/integration-core/src/queues/queue-names.ts
packages/integration-core/src/queues/job-types.ts
packages/integration-core/src/queues/integration-queues.ts
```

### Step 8: Add processors

```text
apps/worker/src/processors/sync-unit-types.processor.ts
apps/worker/src/processors/transform-unit-type-staging.processor.ts
```

### Step 9: Add scheduler

```text
apps/worker/src/schedulers/entrata-unit-type.scheduler.ts
```

### Step 10: Register in main

```ts
import "./processors/sync-unit-types.processor.js";
import "./processors/transform-unit-type-staging.processor.js";

import { registerEntrataUnitTypeSchedulers } from "./schedulers/entrata-unit-type.scheduler.js";

await registerEntrataUnitTypeSchedulers();
```

---

## 20. How to Add a New Provider

Example: Add Yardi.

### Step 1: Create connector folder

```text
packages/connectors/yardi/
```

### Step 2: Implement provider connector

The connector should only call external APIs. It should not write to the database.

```ts
export async function fetchYardiProperties(options: YardiPropertyRequestOptions): Promise<unknown> {
  return response.data;
}
```

### Step 3: Add IntegrationSource

Example:

```text
sourceType = "yardi"
sourceCode = "GALLERY_YARDI"
```

### Step 4: Add IntegrationSourceConfig

Example:

```json
{
  "baseUrl": "https://yardi-api-url",
  "clientId": "...",
  "environment": "prod"
}
```

### Step 5: Add IntegrationSourceEntity rows

Examples:

```text
Property
PropertyUnit
UnitType
Actual
Budget
```

### Step 6: Create provider sync jobs

```text
sync-yardi-properties.job.ts
sync-yardi-property-units.job.ts
```

### Step 7: Create provider transformers

```text
yardi-property.transformer.ts
yardi-property-unit.transformer.ts
```

### Step 8: Reuse canonical tables

Avoid provider-specific production tables unless necessary.

Use:

```text
properties
property_units
source_record_maps
```

---

## 21. How to Add Excel Integration

Excel should use the same pattern.

```text
Upload Excel
  ↓
Store file metadata
  ↓
Parse rows
  ↓
Create StagingApiBatch or StagingFileBatch
  ↓
Create staging rows
  ↓
Transform into canonical tables
```

Recommended future tables:

```text
staging_file_batches
integration_uploaded_files
```

Use `IntegrationSourceEntity.mappingProfileJson` for column mapping:

```json
{
  "columns": {
    "Property Id": "sourcePropertyId",
    "Unit Number": "unitNumber",
    "Floor Plan": "floorPlanName",
    "Bedrooms": "bedrooms",
    "Bathrooms": "bathrooms"
  }
}
```

---

## 22. Production Hardening To Add

Recommended future additions:

```text
integration_error_logs
retry failed sync run API
retry failed staging record API
Bull Board monitoring
queue metrics dashboard
distributed sync locking
API rate limiting
secret provider integration
dead-letter queue
```

Recommended distributed lock key:

```text
companyId + organizationId + integrationSourceId + entityName
```

Only one active sync should run per entity/source at a time.

---

## 23. Common Troubleshooting

### PropertyUnit job does not trigger

Check:

```text
main.ts imports processor
scheduler registered
queue name matches processor queue
job name check is correct
Redis was flushed after queue rename
```

### Prisma model not found

Run:

```powershell
npx prisma generate
```

If needed:

```powershell
Remove-Item -Recurse -Force node_modules\.prisma
npx prisma generate
```

### Old queues still running

```powershell
docker exec -it budget-integration-redis redis-cli FLUSHALL
```

### Prisma version mismatch

```powershell
npx prisma --version
npm ls prisma
npm ls @prisma/client
```

---

## 24. Current Implementation Status

| Area | Status |
|---|---|
| Property sync | Implemented |
| Property staging | Implemented |
| Property transformation | Implemented |
| Property idempotency | Implemented |
| PropertyUnit sync | Implemented |
| PropertyUnit staging | Implemented |
| PropertyUnit transformation | Implemented |
| BullMQ queues | Implemented |
| Scheduled jobs | Implemented |
| Entity-specific configuration | In progress |
| UnitType sync | Planned next |
| Yardi connector | Planned |
| Excel connector | Planned |
| Monitoring dashboard | Planned |
| Retry API/UI | Planned |

---

## 25. Recommended Next Steps

1. Complete entity-specific sync configuration.
2. Move `Property` and `PropertyUnit` schedules to `IntegrationSourceEntity.syncSettingsJson`.
3. Add `UnitType` schema.
4. Implement Entrata `getUnitTypes`.
5. Add UnitType BullMQ queue, scheduler, processor, sync job, and transformer.
6. Add integration error log table.
7. Add Bull Board monitoring.
8. Add failed sync/staging retry support.
9. Add Yardi connector.
10. Add Excel import connector.
