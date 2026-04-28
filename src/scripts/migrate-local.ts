import { createDatabase } from '../server/db/sqlite.ts';
import { envService } from '../server/env.ts';

const database = createDatabase(envService.getEnv('REMOTE_AGENT_DB_PATH'));

database.client.close();
console.log(`Applied local migrations: ${database.storagePath}`);
