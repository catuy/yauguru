import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const configPath = fileURLToPath(new URL('../../../public/admin/config.yml', import.meta.url));

export interface CmsField {
  name: string;
  [key: string]: unknown;
}

export interface CmsCollection {
  name: string;
  folder: string;
  fields: CmsField[];
  [key: string]: unknown;
}

export interface CmsConfig {
  backend: { name: string; repo: string; base_url?: string };
  media_folder: string;
  public_folder: string;
  collections: CmsCollection[];
}

export function loadCmsConfig(): CmsConfig {
  return load(readFileSync(configPath, 'utf-8')) as CmsConfig;
}

export function findField(fields: CmsField[], name: string) {
  return fields.find((field) => field.name === name);
}

export function mustFindField(fields: CmsField[], name: string): CmsField {
  const field = findField(fields, name);
  if (!field) throw new Error(`Expected field "${name}" to exist`);
  return field;
}

export function mustFindCollection(config: CmsConfig, name: string): CmsCollection {
  const collection = config.collections.find((c) => c.name === name);
  if (!collection) throw new Error(`Expected collection "${name}" to exist`);
  return collection;
}
