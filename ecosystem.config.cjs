/**
 * PM2 Process Manager Configuration
 *
 * Manages the 3 independent domain services:
 *  1. property-service     (Port 3001) - Properties, Property Units, Unit Types, GL Trees
 *  2. budget-service       (Port 3002) - Budgets, Actuals, Income Statement, Budget Reports, Property Closings
 *  3. rent-details-service (Port 3003) - Box Score, Resident Retention, Occupancy Projections
 *
 * Usage:
 *   Start all services:              npx pm2 start ecosystem.config.cjs
 *   Deploy/restart only 1 service:   npx pm2 reload budget-service
 *   View status:                     npx pm2 status
 *   View logs for 1 service:         npx pm2 logs budget-service
 */
module.exports = {
  apps: [
    {
      name: "property-service",
      script: "./node_modules/tsx/dist/cli.mjs",
      args: "apps/property-service/src/main.ts",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        NON_INTERACTIVE: "true",
        PORT: 3001,
        PROPERTY_SERVICE_PORT: 3001,
        ENABLE_EMBEDDED_WORKER: "true"
      }
    },
    {
      name: "budget-service",
      script: "./node_modules/tsx/dist/cli.mjs",
      args: "apps/budget-service/src/main.ts",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "2G",
      env: {
        NODE_ENV: "production",
        NON_INTERACTIVE: "true",
        PORT: 3002,
        BUDGET_SERVICE_PORT: 3002,
        ENABLE_EMBEDDED_WORKER: "true"
      }
    },
    {
      name: "rent-details-service",
      script: "./node_modules/tsx/dist/cli.mjs",
      args: "apps/rent-details-service/src/main.ts",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        NON_INTERACTIVE: "true",
        PORT: 3003,
        RENT_DETAILS_SERVICE_PORT: 3003,
        ENABLE_EMBEDDED_WORKER: "true"
      }
    }
  ]
};
