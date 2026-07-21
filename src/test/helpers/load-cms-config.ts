import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const configPath = fileURLToPath(new URL('../../../public/admin/config.yml', import.meta.url));

export function loadCmsConfig() {
  return load(readFileSync(configPath, 'utf-8'));
}

export function findField(fields, name) {
  return fields.find((field) => field.name === name);
}
