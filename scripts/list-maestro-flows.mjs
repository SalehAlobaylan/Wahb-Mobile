import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const flowsDirectory = resolve(import.meta.dirname, '..', '.maestro');
const flows = (await readdir(flowsDirectory))
  .filter((entry) => entry.endsWith('.yaml') || entry.endsWith('.yml'))
  .sort();

if (!flows.length) {
  throw new Error('No Maestro flows were found in .maestro.');
}

for (const flow of flows) {
  process.stdout.write(`${flow}\n`);
}
