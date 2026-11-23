# Budget Integration Platform

A Node.js and TypeScript integration platform for synchronizing property management and financial data from external PMS systems (such as **Entrata**, **Yardi**, and **Excel imports**) into a canonical PostgreSQL database.

---

## 1. Overview & Core Capabilities

The **Budget Integration Platform** decouples PMS data synchronization from core application business logic. It provides:

- **Independent Domain Microservices**: 3 isolated NestJS services (`property-service`, `budget-service`, `rent-details-service`) that can be built, started, and scaled independently.
- **Embedded or Standalone Queue Processing**: Powered by **pg-boss**, a robust job queue engine that runs directly inside PostgreSQL (schema `pgboss`). **No Redis is required.**
- **Staging-First Architecture**: External PMS payloads are captured raw into audit staging tables before being validated, mapped, and transformed into canonical models.
- **Strict Idempotency**: SHA-256 `sourceHash` computation ensures that identical external payloads are skipped automatically (`SKIPPED`) without generating redundant database writes.
- **Source-to-Canonical Mapping**: `SourceRecordMap` tracks relationships between external PMS IDs and internal UUIDs, supporting multiple providers and preventing duplicate records.
- **Multi-Tenant Data Isolation**: Every canonical and staging record enforces strict `companyId` and `organizationId` boundaries.
- **Production-Ready Process Management**: Managed with **PM2** for isolated, zero-downtime reloads per microservice.

---

## 2. Microservices Architecture

The platform is divided into **3 independent domain microservices** plus a standalone worker CLI and a legacy unified API:

| Service Name | Port | Swagger UI | Domain Responsibilities |
| :--- | :--- | :--- | :--- |
| **`property-service`** | `3001` | `http://localhost:3001/api` | Properties, Property Units, Unit Types, GL Account Trees |
| **`budget-service`** | `3002` | `http://localhost:3002/api` | Budgets, Budget Actuals, Income Statement Actuals, Balance Sheet Actuals, Budget Reports, Property Closings, Send/Update Budgets |
| **`rent-details-service`** | `3003` | `http://localhost:3003/api` | Box Score Reports, Resident Retention Reports, Occupancy Projections |
| **`worker`** | CLI | N/A | Standalone runner for domain background workers (`pg-boss`) |
| **`api`** | `3000` | `http://localhost:3000/api` | Legacy monolithic API gateway bundling all modules |

```text
       External PMS (Entrata / Yardi / Excel)
                         │
                         ▼
             [Connectors & API Clients]
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
  property-service budget-service rent-details-service
     (Port 3001)    (Port 3002)     (Port 3003)
         │               │               │
         └───────────────┼───────────────┘
                         ▼
        PostgreSQL Database (Prisma ORM)
         ├── Domain Tables (Canonical)
         ├── Staging Tables (Raw PMS payloads)
         └── `pgboss` Schema (Queue management)
```

Each service embeds its own domain-scoped background worker by default (`ENABLE_EMBEDDED_WORKER=true`), meaning each service processes its own asynchronous queue jobs without relying on a separate worker process.

---

## 3. Technology Stack

| Area | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime** | Node.js (v20+ LTS) | JavaScript runtime |
| **Language** | TypeScript (v5+) | Type-safe development |
| **HTTP Framework** | NestJS (v11+) | Modular REST API and Swagger documentation |
| **API Documentation** | Swagger / OpenAPI | Interactive UI at `/api` on each service |
| **ORM** | Prisma (v6+) | Multi-file schema and database client |
| **Database** | PostgreSQL (v15+) | Primary relational store and queue backend |
| **Queue Engine** | **pg-boss** (v12+) | PostgreSQL-native job queue (**Redis is not required**) |
| **HTTP Client** | Axios | External PMS API requests |
| **Process Manager** | PM2 | Daemon, cluster, and individual process reload |
| **Monorepo Style** | npm workspaces | Modular package and app management |

---

## 4. Repository & Workspace Structure

```text
budget-integration-platform/
│
├── apps/
│   ├── property-service/     # Port 3001: Properties, Units, Unit Types, GL Trees
│   ├── budget-service/       # Port 3002: Budgets, Actuals, Income Statement, Reports
│   ├── rent-details-service/ # Port 3003: Box Score, Resident Retention, Occupancy
│   ├── worker/               # Standalone pg-boss background worker CLI
│   └── api/                  # Legacy monolithic API (Port 3000)
│
├── packages/
│   ├── connectors/           # External PMS API clients (e.g., Entrata connectors)
│   ├── database/             # Prisma client instance and database helper exports
│   ├── domain-property/      # Property domain logic, DTOs, and services
│   ├── domain-budget/        # Budget domain logic, DTOs, and services
│   ├── domain-rent/          # Rent & occupancy domain logic and services
│   ├── integration-core/     # pg-boss queues, job types, base transformers, hash utils
│   ├── plugin-loader/        # Dynamic connector and plugin loading system
│   ├── plugin-sdk/           # SDK interface for future PMS plugins
│   └── common/               # Shared utilities, logging, and constants
│
├── prisma/
│   ├── schema/               # Multi-file Prisma schemas:
│   │   ├── 00-enums.prisma
│   │   ├── 02-core.prisma
│   │   ├── 10-integration.prisma
│   │   ├── 20-property.prisma
│   │   ├── 30-occupancy.prisma
│   │   └── 40-proforma.prisma
│   ├── schema.prisma         # Merged schema reference
│   └── seed.ts               # Database seeder script
│
├── ecosystem.config.cjs      # PM2 production configuration for the 3 domain services
├── DEPLOYMENT_AND_DEV_GUIDE.md
├── package.json
└── tsconfig.json
```

---

## 5. Background Queue Architecture (pg-boss)

Background synchronization, payload staging, transformation, and projections are powered entirely by **pg-boss**.

- **No Redis Dependency**: pg-boss stores its queues, job schedules, retry counts, and dead-letter statuses in PostgreSQL tables under the dedicated `pgboss` schema.
- **Embedded Mode (Default)**: When `ENABLE_EMBEDDED_WORKER=true`, starting a domain service automatically boots its domain worker listener inside the same process.
- **Standalone Mode**: Running `npm run dev:worker` allows you to run workers in an isolated CLI process with an interactive or environment-configured `WORKER_MODE`.

### Queue Names by Domain

#### Property Domain
- `sync-property-queue` & `transform-property-staging-queue`
- `sync-property-unit-queue` & `transform-property-unit-staging-queue`
- `sync-unit-type-queue` & `transform-unit-type-staging-queue`
- `sync-gl-tree-queue` & `transform-gl-tree-staging-queue`

#### Budget Domain
- `sync-budget-queue` & `transform-budget-staging-queue`
- `sync-budget-actual-queue` & `transform-budget-actual-staging-queue`
- `project-budget-actual-snapshots-queue`
- `sync-income-statement-actuals-queue` & `stage-income-statement-actuals-queue`
- `transform-income-statement-actuals-queue` & `project-income-statement-actuals-queue`
- `process-income-statement-property-queue`
- `sync-balance-sheet-actuals-queue`, `stage-balance-sheet-actuals-queue`, etc.

#### Rent Details Domain
- `sync-report-data-queue`
- `transform-report-data-staging-queue`
- `project-occupancy-from-reports-queue`

---

## 6. Staging & Idempotency Pipeline

```text
External PMS API
       ↓
Connector (e.g. Entrata)
       ↓
StagingApiBatch (Audit record with raw request/response)
       ↓
Staging Entity Table (Row per item with sourceHash)
       ↓
Transform Queue (pg-boss)
       ↓
Transformer (Maps fields, resolves foreign keys via SourceRecordMap)
       ↓
Canonical Production Tables (Source-neutral domain records)
       ↓
Projection Queue (pg-boss) [Optional]
       ↓
Projection Tables (Aggregated reporting & analytical snapshots)
```

### Idempotency Flow (sourceHash)
1. The connector receives external entities.
2. The payload is normalized (sorted JSON keys) and a SHA-256 hash is computed.
3. The platform checks `SourceRecordMap.sourceHash`:
   - **Hash Matches**: Record has not changed in the PMS &rarr; Staging status is marked `SKIPPED`. No transformation or write occurs.
   - **Hash Differs / New Record**: Staging status is marked `PENDING` &rarr; Transform job is dispatched to update canonical tables and update the hash.

---

## 7. Environment Configuration

Create a `.env` file in the root directory based on `.env.example`:

```ini
# PostgreSQL Database (used by Prisma and pg-boss)
DATABASE_URL="postgresql://postgres:password@localhost:5432/century_budget?schema=public"

# Domain Service Port Configurations
PROPERTY_SERVICE_PORT=3001
BUDGET_SERVICE_PORT=3002
RENT_DETAILS_SERVICE_PORT=3003
PORT=3000

# Consumer URLs (for API gateway, frontend, or external microservice calls)
# Replace localhost with your VM private IP/hostname when configuring on remote servers
ENTRATA_SYNC_PROPERTY_URL="http://localhost:3001/integration-sync"
ENTRATA_SYNC_BUDGET_URL="http://localhost:3002/integration-sync"
ENTRATA_SYNC_RENT_URL="http://localhost:3003/integration-sync"

# Worker Settings
# Enables embedded pg-boss workers inside domain services (default: true)
ENABLE_EMBEDDED_WORKER=true
SYNC_INCOME_STATEMENT_ACTUALS_CONCURRENCY=1
```

> **Note on Entrata Credentials**: Entrata API credentials (`apiKey`, `orgSlug`, `baseUrl`) are stored securely in the PostgreSQL database in the `public.integration_source_configs` table (`credentials_json` and `connection_json`), rather than in `.env`.
>
> **Note on Redis**: A Redis server (`REDIS_HOST`, `REDIS_PORT`, etc.) is **not** used or needed. All queues are handled by `pg-boss` inside PostgreSQL.

---

## 8. Domain Microservices API Reference & Method Paths

All 3 domain microservices use a common base route prefix: **`/integration-sync`**.

### Base URLs by Service

| Service | Port | Common Base URL (.env) | Swagger UI |
| :--- | :--- | :--- | :--- |
| **`property-service`** | `3001` | `http://<host>:3001/integration-sync` | `http://<host>:3001/api` |
| **`budget-service`** | `3002` | `http://<host>:3002/integration-sync` | `http://<host>:3002/api` |
| **`rent-details-service`** | `3003` | `http://<host>:3003/integration-sync` | `http://<host>:3003/api` |

---

### 1. `property-service` (Port 3001)

Base URL: `http://<host>:3001/integration-sync`

| Method | Path | Full URL | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | `http://<host>:3001/integration-sync/health` | Health check ping |
| `GET` | `/logs` | `http://<host>:3001/integration-sync/logs` | Query paginated integration logs |
| `POST` | `/entrata/properties` | `http://<host>:3001/integration-sync/entrata/properties` | Enqueue Entrata Properties sync (`getProperties`) |
| `POST` | `/entrata/property-units` | `http://<host>:3001/integration-sync/entrata/property-units` | Enqueue Property Units sync (`getPropertyUnits`) |
| `POST` | `/entrata/unit-types` | `http://<host>:3001/integration-sync/entrata/unit-types` | Enqueue Unit Types sync (`getUnitTypes`) |
| `POST` | `/entrata/gl-trees` | `http://<host>:3001/integration-sync/entrata/gl-trees` | Enqueue Chart of Accounts / GL Trees sync (`getGlTrees`) |

---

### 2. `budget-service` (Port 3002)

Base URL: `http://<host>:3002/integration-sync`

#### System & Status
| Method | Path | Full URL | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | `http://<host>:3002/integration-sync/health` | Health check ping |
| `GET` | `/logs` | `http://<host>:3002/integration-sync/logs` | Query paginated integration logs |
| `GET` | `/sync-runs/:syncRunId/status` | `http://<host>:3002/integration-sync/sync-runs/:syncRunId/status` | Poll sync run progress and record counts |

#### Budgets & Actuals
| Method | Path | Full URL | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/entrata/budgets` | `http://<host>:3002/integration-sync/entrata/budgets` | Enqueue Entrata Budgets sync (`getBudgets`) |
| `POST` | `/entrata/budgets/transform` | `http://<host>:3002/integration-sync/entrata/budgets/transform` | Transform staged budgets into canonical tables |
| `POST` | `/entrata/budget-actuals` | `http://<host>:3002/integration-sync/entrata/budget-actuals` | Enqueue Budget Actuals sync (`getBudgetActuals`) |
| `POST` | `/entrata/budget/sync-stream` | `http://<host>:3002/integration-sync/entrata/budget/sync-stream` | Stream live sync progress for Entrata budgets (SSE) |

#### Income Statement Actuals
| Method | Path | Full URL | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/entrata/income-statement-actuals/sync` | `http://<host>:3002/integration-sync/entrata/income-statement-actuals/sync` | Enqueue Income Statement sync |
| `POST` | `/entrata/income-statement-actuals/sync-stream` | `http://<host>:3002/integration-sync/entrata/income-statement-actuals/sync-stream` | Stream live sync progress for Income Statement (SSE) |
| `POST` | `/entrata/income-statement-actuals/stage` | `http://<host>:3002/integration-sync/entrata/income-statement-actuals/stage` | Stage Income Statement actuals from report logs |
| `POST` | `/entrata/income-statement-actuals/transform` | `http://<host>:3002/integration-sync/entrata/income-statement-actuals/transform` | Transform staged Income Statement actuals |
| `POST` | `/entrata/income-statement-actuals/project` | `http://<host>:3002/integration-sync/entrata/income-statement-actuals/project` | Project canonical Income Statement snapshots |

#### Balance Sheet Actuals
| Method | Path | Full URL | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/entrata/balance-sheet/sync` | `http://<host>:3002/integration-sync/entrata/balance-sheet/sync` | Enqueue Balance Sheet sync |
| `POST` | `/entrata/balance-sheet/sync-stream` | `http://<host>:3002/integration-sync/entrata/balance-sheet/sync-stream` | Stream live sync progress for Balance Sheet (SSE) |
| `POST` | `/entrata/balance-sheet/stage` | `http://<host>:3002/integration-sync/entrata/balance-sheet/stage` | Stage Balance Sheet actuals from report logs |
| `POST` | `/entrata/balance-sheet/transform` | `http://<host>:3002/integration-sync/entrata/balance-sheet/transform` | Transform staged Balance Sheet actuals |
| `POST` | `/entrata/balance-sheet/project` | `http://<host>:3002/integration-sync/entrata/balance-sheet/project` | Project canonical Balance Sheet snapshots |

#### Budget Report (Full Financial Report)
| Method | Path | Full URL | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/entrata/budget-report/sync` | `http://<host>:3002/integration-sync/entrata/budget-report/sync` | Enqueue Budget Report sync |
| `POST` | `/entrata/budget-report/sync-stream` | `http://<host>:3002/integration-sync/entrata/budget-report/sync-stream` | Stream live sync progress for Budget Report (SSE) |
| `POST` | `/entrata/budget-report/stage` | `http://<host>:3002/integration-sync/entrata/budget-report/stage` | Stage Budget Report from logs |
| `POST` | `/entrata/budget-report/transform` | `http://<host>:3002/integration-sync/entrata/budget-report/transform` | Transform staged Budget Report into canonical records |
| `POST` | `/entrata/budget-report/project` | `http://<host>:3002/integration-sync/entrata/budget-report/project` | Project canonical Budget Report snapshots |

#### Property Closings (GL Lock & Accounting Months)
| Method | Path | Full URL | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/entrata/property-closings` | `http://<host>:3002/integration-sync/entrata/property-closings` | Sync property closing statuses |
| `POST` | `/entrata/report-data/property_closings` | `http://<host>:3002/integration-sync/entrata/report-data/property_closings` | Sync property closings via report endpoint |

#### Budget Export to Entrata (Transmission)
| Method | Path | Full URL | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/entrata/sync-budgets` | `http://<host>:3002/integration-sync/entrata/sync-budgets` | Smart Send or Update budget to Entrata (also `/sync-budget`, `/send-or-update-budgets`) |
| `POST` | `/entrata/send-budgets` | `http://<host>:3002/integration-sync/entrata/send-budgets` | Send new budget into Entrata (`sendBudgets`) |
| `POST` | `/entrata/update-budgets` | `http://<host>:3002/integration-sync/entrata/update-budgets` | Update existing budget in Entrata (`updateBudgets`) |

---

### 3. `rent-details-service` (Port 3003)

Base URL: `http://<host>:3003/integration-sync`

| Method | Path | Full URL | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | `http://<host>:3003/integration-sync/health` | Health check ping |
| `GET` | `/logs` | `http://<host>:3003/integration-sync/logs` | Query paginated integration logs |
| `POST` | `/entrata/report-data/box_score` | `http://<host>:3003/integration-sync/entrata/report-data/box_score` | Enqueue Box Score report sync (`getReportData`) |
| `POST` | `/entrata/report-data/resident_retention` | `http://<host>:3003/integration-sync/entrata/report-data/resident_retention` | Enqueue Resident Retention report sync (`getReportData`) |
| `POST` | `/entrata/occupancy/project` | `http://<host>:3003/integration-sync/entrata/occupancy/project` | Project Box Score and Retention data into proforma occupancy tables |

---

## 9. Local Development Guide

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Database Preparation

#### 1. Sync the Latest Prisma Schema from `budget-api`
To keep the database schema in sync with the main backend (`budget-api`), run the automated sync command:

```bash
# Automatically copies the latest schema from ../budget-api/prisma/schema and generates the Prisma client
npm run prisma:sync
```

*(Manual alternative)*:
```powershell
# Windows PowerShell
Copy-Item -Path "..\budget-api\prisma\schema\*" -Destination ".\prisma\schema\" -Recurse -Force
npm run prisma:generate

# Linux / Bash
cp -r ../budget-api/prisma/schema/* ./prisma/schema/
npm run prisma:generate
```

#### 2. Apply Migrations & Seed Data
```bash
# Apply migrations (for local development database)
npm run prisma:migrate

# (Optional) Seed initial sample data
npm run prisma:seed
```

### Step 3: Run Domain Services

You can run individual domain services or all of them concurrently:

```bash
# Run all 3 individual services concurrently with color-coded logs
npm run dev:services

# OR run services individually:
npm run dev:property       # Property Service on Port 3001
npm run dev:budget         # Budget Service on Port 3002
npm run dev:rent-details   # Rent Details Service on Port 3003

# Run the standalone worker CLI (interactive menu):
npm run dev:worker

# Run the standalone worker in non-interactive mode:
WORKER_MODE=BUDGET_DOMAIN npm run dev:worker
```

### Step 4: Access Swagger Documentation
- **Property Service**: [http://localhost:3001/api](http://localhost:3001/api)
- **Budget Service**: [http://localhost:3002/api](http://localhost:3002/api)
- **Rent Details Service**: [http://localhost:3003/api](http://localhost:3003/api)

### Step 5: Typecheck & Build
```bash
# Typecheck all workspaces without emitting files
npm run dev:typecheck

# Compile TypeScript to JavaScript
npm run dev:build
```

---

## 10. Production Deployment with PM2

The file [`ecosystem.config.cjs`](./ecosystem.config.cjs) defines the 3 independent microservices with production environment flags (`NODE_ENV=production`, `NON_INTERACTIVE=true`).

### Starting All Services
```bash
# Start all 3 domain services via PM2
npm run pm2:start

# Check service status
npm run pm2:status
```

### Deploying / Reloading a Single Service
When making changes to a specific domain (for example, `budget-service`), deploy and reload **only that service** without interrupting the others:

```bash
# Pull changes from git
git pull origin main

# Re-generate Prisma client if schema changed
npm run prisma:generate

# Reload only the modified service:
npm run pm2:reload:property      # Port 3001
npm run pm2:reload:budget        # Port 3002
npm run pm2:reload:rent-details  # Port 3003
```

### Deploying a Built `dist/` (FileZilla / no git on server)
`npm run build` ([`scripts/build-dist.mjs`](./scripts/build-dist.mjs)) produces a self-contained `dist/`: compiled JS, every workspace `package.json` (entry points rewritten `.ts` → `.js`), `package-lock.json`, `prisma/`, and an `ecosystem.config.cjs` that runs plain `node` (no `tsx`).

`node_modules` is **not** shipped — `argon2` and the Prisma engine must be built on Linux, and npm workspace symlinks don't survive FTP.

```bash
# Local (Windows)
npm run build
# Upload the CONTENTS of dist/ to /var/www/budgetapplication/budget-integration/
```

```bash
# Server — first time
cd /var/www/budgetapplication/budget-integration
cp .env.example .env && nano .env            # DATABASE_URL, ENTRATA_*, ports
npm ci --omit=dev && npx prisma generate
pm2 start ecosystem.config.cjs && pm2 save && pm2 startup

# Server — every update (after uploading the new dist/ contents)
npm ci --omit=dev && npx prisma generate     # only if package-lock.json / prisma/ changed
pm2 reload ecosystem.config.cjs              # or: pm2 reload budget-service
```

Swagger for each service: `http://<host>:<port>/api`.

### Monitoring & Logs
```bash
# Real-time logs for all services
pm2 logs

# Logs for a specific service
pm2 logs property-service
pm2 logs budget-service
pm2 logs rent-details-service

# PM2 system monitor dashboard
pm2 monit
```

---

## 11. Prisma & Database Management

```bash
# Reformat multi-file schemas under prisma/schema/*.prisma
npx prisma format

# Re-generate Prisma Client from schemas
npm run prisma:generate

# Run schema migrations in development
npm run prisma:migrate

# Open visual database browser at http://localhost:5555
npm run prisma:studio

# Validate Prisma schemas without touching the database
npx prisma validate
```

---

## 12. Common Troubleshooting

### 1. `pg-boss` Schema or Queue Errors
- **Issue**: Queue table creation fails or jobs are not picked up.
- **Fix**: Verify your PostgreSQL user has `CREATE SCHEMA` privileges on the target database. pg-boss will automatically initialize the `pgboss` schema on first startup.

### 2. Resetting Staging and Queue State for an Entity
- To purge stuck or test queue entries, use the domain helper `resetReportSyncState` or clear jobs from the `pgboss.job` table directly:
  ```sql
  -- Remove pending jobs for a specific queue in PostgreSQL
  DELETE FROM pgboss.job WHERE name = 'sync-report-data-queue';
  ```

### 3. Prisma "Model Not Found" or Type Mismatch
- **Issue**: TypeScript complains that a Prisma model or relation is missing.
- **Fix**: Run `npm run prisma:generate`. If using an IDE like VS Code, reload the TypeScript language server (`Ctrl+Shift+P` &rarr; *TypeScript: Restart TS Server*).

### 4. Port Conflicts
- **Issue**: `EADDRINUSE: address already in use :::3001` (or 3002 / 3003).
- **Fix**: Check for existing processes using `pm2 status` or run `netstat -ano | findstr :3001` to locate and terminate any orphan node processes.
