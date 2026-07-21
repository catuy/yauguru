import { describe, it, expect } from 'vitest';
import { loadCmsConfig, findField } from './helpers/load-cms-config';

const GENRES = [
  'poesía',
  'novela',
  'cuentos',
  'ensayo',
  'teatro',
  'audio (cd/dvd)',
  'historieta',
  'otro',
];

const config = loadCmsConfig();
const books = config.collections.find((c) => c.name === 'books');
const collections = config.collections.find((c) => c.name === 'editorial-collections');

describe('admin/config.yml — backend', () => {
  it('uses the GitHub backend with no OAuth client (PAT-only auth)', () => {
    expect(config.backend.name).toBe('github');
    expect(config.backend.repo).toBe('catuy/yauguru');
    expect(config.backend.base_url).toBeUndefined();
  });
});

describe('admin/config.yml — books collection', () => {
  it('points at the real content folder', () => {
    expect(books.folder).toBe('src/content/books');
  });

  it('requires at least one collection reference, matching by slug', () => {
    const field = findField(books.fields, 'collections');
    expect(field.widget).toBe('relation');
    expect(field.collection).toBe('editorial-collections');
    expect(field.min).toBe(1);
    expect(field.value_field).toBe('{{slug}}');
  });

  it('does not name a top-level collection the same as a field on another collection (Sveltia identifier collision — caused book fields to bleed into the editorial-collections form)', () => {
    const topLevelNames = config.collections.map((c) => c.name);
    for (const collection of config.collections) {
      for (const field of collection.fields) {
        expect(topLevelNames).not.toContain(field.name);
      }
    }
  });

  it('restricts publication year to 1900-2030', () => {
    const field = findField(books.fields, 'year');
    expect(field.min).toBe(1900);
    expect(field.max).toBe(2030);
  });

  it('offers exactly the genres defined in content.config.ts', () => {
    const field = findField(books.fields, 'genre');
    expect(field.options).toEqual(GENRES);
  });

  it('validates purchaseLink as an http(s) URL', () => {
    const field = findField(books.fields, 'purchaseLink');
    const [pattern] = field.pattern;
    const regex = new RegExp(pattern);
    expect('https://example.com').toMatch(regex);
    expect('ftp://example.com').not.toMatch(regex);
  });

  it('stores cover images under public/covers, matching the site convention', () => {
    expect(config.media_folder).toBe('public/covers');
    expect(config.public_folder).toBe('/covers');
  });
});

describe('admin/config.yml — collections (editorial)', () => {
  it('points at the real content folder', () => {
    expect(collections.folder).toBe('src/content/collections');
  });

  it('has the name/order fields required by content.config.ts', () => {
    expect(findField(collections.fields, 'name')).toBeDefined();
    expect(findField(collections.fields, 'order')).toBeDefined();
  });
});
