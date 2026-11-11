import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const SOURCE_SCHEMA_DIR = path.resolve("..", "budget-api", "prisma", "schema");
const TARGET_SCHEMA_DIR = path.resolve("prisma", "schema");

function syncSchema(): void {
  if (!fs.existsSync(SOURCE_SCHEMA_DIR)) {
    console.error(`[prisma:sync] Source directory not found: ${SOURCE_SCHEMA_DIR}`);
    console.error("[prisma:sync] Make sure 'budget-api' is checked out alongside 'budget-integration-platform'.");
    process.exit(1);
  }

  console.log(`[prisma:sync] Syncing schema from ${SOURCE_SCHEMA_DIR} -> ${TARGET_SCHEMA_DIR}...`);

  if (!fs.existsSync(TARGET_SCHEMA_DIR)) {
    fs.mkdirSync(TARGET_SCHEMA_DIR, { recursive: true });
  }

  const files = fs.readdirSync(SOURCE_SCHEMA_DIR);

  for (const file of files) {
    const sourceFilePath = path.join(SOURCE_SCHEMA_DIR, file);
    const targetFilePath = path.join(TARGET_SCHEMA_DIR, file);

    const stat = fs.statSync(sourceFilePath);
    if (stat.isFile() && file.endsWith(".prisma")) {
      let content = fs.readFileSync(sourceFilePath, "utf-8");

      // Ensure previewFeatures = ["prismaSchemaFolder"] is present in schema.prisma for multi-file schema support
      if (file === "schema.prisma" && !content.includes("prismaSchemaFolder")) {
        content = content.replace(
          /generator\s+client\s+\{[\s\S]*?\}/,
          `generator client {\n  provider        = "prisma-client-js"\n  previewFeatures = ["prismaSchemaFolder"]\n}`
        );
      }

      fs.writeFileSync(targetFilePath, content, "utf-8");
      console.log(`  ✓ Synced ${file}`);
    }
  }

  console.log("\n[prisma:sync] Schema sync complete. Generating Prisma Client...");
  execSync("npx prisma generate", { stdio: "inherit" });
  console.log("[prisma:sync] Done!");
}

syncSchema();
