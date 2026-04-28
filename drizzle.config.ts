import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  strict: true,
  dbCredentials: {
    url: ".local/acp-playground.sqlite",
  },
});
