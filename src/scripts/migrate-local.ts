import { envService } from "../server/env.ts";
import { createDatabase } from "../server/db/sqlite.ts";

const database = createDatabase(envService.getEnv("ACP_PLAYGROUND_DB_PATH"));

database.client.close();
console.log(`Applied local migrations: ${database.storagePath}`);
