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

# Entrata API Configuration
ENTRATA_BASE_URL="https://apis.entrata.com"
ENTRATA_API_KEY="your-entrata-api-key"

# Domain Service Port Configurations
PROPERTY_SERVICE_PORT=3001
BUDGET_SERVICE_PORT=3002
RENT_DETAILS_SERVICE_PORT=3003
PORT=3000

# Worker Settings
# Enables embedded pg-boss workers inside domain services (default: true)
ENABLE_EMBEDDED_WORKER=true
SYNC_INCOME_STATEMENT_ACTUALS_CONCURRENCY=1
```

> **Note**: A Redis server (`REDIS_HOST`, `REDIS_PORT`, etc.) is **not** used or needed.

---

## 8. Local Development Guide

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

## 9. Production Deployment with PM2

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

## 10. Prisma & Database Management

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

## 11. Common Troubleshooting

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
