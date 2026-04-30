import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createHonoApp } from '../server/app.ts';

const outputFilePath = path.resolve(process.argv[2] ?? 'docs/openapi.json');
const response = await createHonoApp().request('/api/openapi.json');

if (!response.ok) {
  throw new Error(
    `Failed to render OpenAPI spec: ${String(response.status)} ${response.statusText}`,
  );
}

const openApiText = await response.text();

await mkdir(path.dirname(outputFilePath), { recursive: true });
await writeFile(outputFilePath, openApiText);

console.log(`OpenAPI spec written to ${outputFilePath}`);
