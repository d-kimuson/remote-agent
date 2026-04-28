import { resolve } from 'node:path';

import { createDatabase } from '../server/db/sqlite.ts';
import { envService } from '../server/env.ts';

const database = createDatabase(resolve(envService.getEnv('RA_DIR'), 'data.sql'));

database.client.close();
console.log(`Applied local migrations: ${database.storagePath}`);
