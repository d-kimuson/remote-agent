import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/db/schema.ts',
  out: './drizzle/migrations',
  strict: true,
  dbCredentials: {
    url: '.local/remote-agent.sqlite',
  },
});
