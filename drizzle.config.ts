import path from "node:path";

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: path.resolve(process.cwd(), ".local", "acp-playground.sqlite"),
  },
});
