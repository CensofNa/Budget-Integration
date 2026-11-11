# Local Development & Linux PM2 Deployment Guide

This guide covers how to run the **Budget Integration Platform** locally for development and how to deploy and manage the 3 independent domain services on a Linux server using **PM2**.

---

## 1. Architecture Overview

The platform is organized into **3 independent domain microservices** backed by a single **PostgreSQL** database (which stores both domain/staging tables and `pg-boss` job queues in the `pgboss` schema):

| Service Name | Default Port | Swagger UI | Health Check | Domain Scope |
| :--- | :--- | :--- | :--- | :--- |
| **`property-service`** | `3001` | `http://localhost:3001/api` | `GET /integration-sync/health` | Properties, Property Units, Unit Types, GL Trees |
| **`budget-service`** | `3002` | `http://localhost:3002/api` | `GET /integration-sync/health` | Budgets, Budget Actuals, Income Statement Actuals, Budget Reports, Property Closings, Send/Update Budgets |
| **`rent-details-service`** | `3003` | `http://localhost:3003/api` | `GET /integration-sync/health` | Box Score Reports, Resident Retention Reports, Occupancy Projections |

Each service embeds its own domain-scoped `pg-boss` background worker by default (`ENABLE_EMBEDDED_WORKER=true`), allowing you to deploy or restart one domain service without affecting the other two.

---

## 2. Prerequisites & Environment Setup

### Prerequisites
- **Node.js**: v20+ (LTS recommended)
- **npm**: v10+
- **PostgreSQL**: v15+ (Redis is **no longer required**)

### Environment Variables (`.env`)
Create a `.env` file in the project root directory:

```ini
# PostgreSQL Connection String (used by Prisma and pg-boss)
DATABASE_URL="postgresql://postgres:password@localhost:5432/century_budget?schema=public"

# Optional Service Port Overrides (Defaults: 3001, 3002, 3003)
PROPERTY_SERVICE_PORT=3001
BUDGET_SERVICE_PORT=3002
RENT_DETAILS_SERVICE_PORT=3003

# Keep embedded pg-boss worker enabled inside each domain service (default: true)
ENABLE_EMBEDDED_WORKER=true
```

---

## 3. Running Locally for Development

### Step 1: Install Dependencies & Generate Prisma Client
From the repository root:

```bash
npm install
npm run prisma:generate
```

*(Optional)* If setting up a local database for the first time, run migrations:
```bash
npm run prisma:migrate
```

### Step 2: Start Domain Services

You can run **only the domain service you are working on**, or run **all 3 services concurrently**:

```bash
# Run only the Property Service (Port 3001)
npm run dev:property

# Run only the Budget Service (Port 3002)
npm run dev:budget

# Run only the Rent Details Service (Port 3003)
npm run dev:rent-details

# Run all 3 services concurrently in one terminal with color-coded output
npm run dev:services
```

### Step 3: Access Swagger UI & Health Endpoints
Once running, open Swagger in your browser to test endpoints interactively:
- **Property Service**: [http://localhost:3001/api](http://localhost:3001/api)
- **Budget Service**: [http://localhost:3002/api](http://localhost:3002/api)
- **Rent Details Service**: [http://localhost:3003/api](http://localhost:3003/api)

### Running the Standalone Worker CLI (Optional)
If you want to run the standalone worker CLI:
- **Interactive mode** (prompts for worker module):
  ```bash
  npm run dev:worker
  ```
- **Non-interactive mode** (skips prompts when `WORKER_MODE` is set):
  ```bash
  WORKER_MODE=BUDGET_DOMAIN npm run dev:worker
  ```
  Supported `WORKER_MODE` values: `ALL`, `PROPERTY_DOMAIN`, `BUDGET_DOMAIN`, `RENT_DETAILS_DOMAIN`, `INCOME_STATEMENT_ONLY`, `BUDGET_REPORT_ONLY`, `REPORT_ONLY`, `BUDGET_ACTUAL_ONLY`, `BUDGET_ONLY`, `PROPERTY_ONLY`, `PROPERTY_UNIT_ONLY`, `UNIT_TYPE_ONLY`, `GL_TREE_ONLY`.

### Typechecking Before Committing
```bash
npm run dev:typecheck
```

---

## 4. Hosting on a Linux Server with PM2

### Step 1: Server Preparation (Ubuntu / Debian / RHEL)

1. **Install Node.js (v20 LTS) and PM2 globally**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs git
   sudo npm install -g pm2
   ```

2. **Clone the repository and install dependencies**:
   ```bash
   git clone <your-repo-url> /opt/budget-integration-platform
   cd /opt/budget-integration-platform
   npm ci
   ```

3. **Configure `.env` and generate the Prisma client**:
   ```bash
   nano .env
   # Add production DATABASE_URL and environment variables
   npm run prisma:generate
   ```

4. **Verify TypeScript compilation**:
   ```bash
   npm run dev:typecheck
   ```

---

### Step 2: Starting Services with PM2

The root [`ecosystem.config.cjs`](./ecosystem.config.cjs) defines all 3 domain services (`property-service`, `budget-service`, `rent-details-service`) with `NODE_ENV=production` and `NON_INTERACTIVE=true`.

```bash
# Start all 3 domain services
npm run pm2:start
# (Equivalent to: pm2 start ecosystem.config.cjs)

# Check status of running services
npm run pm2:status
```

---

### Step 3: Deploying Changes to a Single Service (Isolated Deployment)

When you make changes to a specific domain (for example, `budget-service`), you do **not** need to restart `property-service` or `rent-details-service`:

```bash
cd /opt/budget-integration-platform
git pull origin main

# If package.json or Prisma schema changed:
npm ci
npm run prisma:generate

# Reload ONLY the service that changed:
npm run pm2:reload:budget        # Reloads only budget-service (Port 3002)
# OR
npm run pm2:reload:property      # Reloads only property-service (Port 3001)
# OR
npm run pm2:reload:rent-details  # Reloads only rent-details-service (Port 3003)
```

---

### Step 4: Persistence Across Server Reboots

Configure PM2 to automatically start your services if the Linux VM reboots:

```bash
# Generate and configure the systemd startup script
pm2 startup systemd
# (Copy and run the sudo command that PM2 outputs)

# Save the current running process list
pm2 save
```

---

### Step 5: Monitoring & Logs on Linux

```bash
# View real-time logs for all services
pm2 logs

# View logs for a specific domain service only
pm2 logs property-service
pm2 logs budget-service
pm2 logs rent-details-service

# Interactive terminal dashboard (CPU, memory, logs)
pm2 monit

# Install log rotation so PM2 logs don't fill up disk space
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
```

---

## 5. Optional: Nginx Reverse Proxy Configuration

If your frontend or API consumers prefer a single domain/port (e.g., `https://api.yourdomain.com` or port `80`/`443`) while keeping the 3 services isolated behind the scenes, use the following Nginx configuration (`/etc/nginx/sites-available/budget-integration`):

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    # 1. Property Domain Service (Port 3001)
    location ~ ^/integration-sync/entrata/(properties|property-units|unit-types|gl-trees) {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 2. Rent Details Domain Service (Port 3003)
    location ~ ^/integration-sync/entrata/(report-data/box_score|report-data/resident_retention|occupancy) {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 3. Budget Domain Service (Port 3002)
    location /integration-sync/entrata/ {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
    }
}
```

---

## 6. Inspecting `pg-boss` Queue State in PostgreSQL

Because `pg-boss` stores all jobs in PostgreSQL under the `pgboss` schema, you can inspect queued, active, and failed jobs directly using SQL:

```sql
-- View job counts by queue and state
SELECT name AS queue_name, state, COUNT(*) AS job_count
FROM pgboss.job
GROUP BY name, state
ORDER BY name, state;

-- View recent failed jobs and their error output
SELECT id, name, state, data, output, created_on, completed_on
FROM pgboss.job
WHERE state = 'failed'
ORDER BY completed_on DESC
LIMIT 20;
```

---

## 7. Database & Console Logging (`integration_logs`)

All services use a non-blocking logger that simultaneously writes formatted output to **console** (stdout/stderr) and persists records to the **`integration_logs`** table in PostgreSQL.

### Querying Logs via API (`GET /integration-sync/logs`)

You can query paginated logs directly from any running domain service:
- **Property Service**: `http://localhost:3001/integration-sync/logs` (defaults to `service=property-service`)
- **Budget Service**: `http://localhost:3002/integration-sync/logs` (defaults to `service=budget-service`)
- **Rent Details Service**: `http://localhost:3003/integration-sync/logs` (defaults to `service=rent-details-service`)

```bash
# Get the most recent 10 logs for Rent Details Service
curl "http://localhost:3003/integration-sync/logs?limit=10"

# Get the most recent 10 logs for Budget Service
curl "http://localhost:3002/integration-sync/logs?limit=10"

# Filter budget logs by error level
curl "http://localhost:3002/integration-sync/logs?level=ERROR"

# Filter by entity and action
curl "http://localhost:3002/integration-sync/logs?entityName=BudgetReport&action=BUDGET_REPORT_STAGE_COMPLETED"

# Query logs across all services
curl "http://localhost:3002/integration-sync/logs?service=all&limit=20"

# Search within log messages
curl "http://localhost:3002/integration-sync/logs?search=timeout"
```

#### Supported Query Parameters
- `page`: Page number (default: `1`)
- `limit`: Items per page (default: `20`, max: `100`)
- `level`: `INFO` | `WARN` | `ERROR`
- `service`: Service identifier (default: current service or specify another service / `all`)
- `entityName`: e.g. `Property`, `PropertyUnit`, `UnitType`, `GlTree`, `Budget`, `BudgetActual`, `BudgetReport`, `IncomeStatementActual`, `ReportData`, `Occupancy`
- `action`: e.g. `SEND_BUDGET_COMPLETED`, `BUDGET_REPORT_STAGE_COMPLETED`, `WORKER_JOB_COMPLETED`, `HEALTH_CHECK`
- `companyId`: Filter by company UUID
- `syncRunId`: Filter by sync run UUID
- `search`: Case-insensitive substring search in log messages
- `startDate` / `endDate`: ISO 8601 date filters (e.g. `2026-10-14T00:00:00Z`)

### Direct SQL Inspection of Logs
```sql
-- View recent error logs across all services
SELECT id, service, level, action, message, error_stack, created_at
FROM integration_logs
WHERE level = 'ERROR'
ORDER BY created_at DESC
LIMIT 25;
```
