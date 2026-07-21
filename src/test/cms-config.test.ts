import { describe, it, expect } from 'vitest';
import { loadCmsConfig, findField, mustFindField, mustFindCollection } from './helpers/load-cms-config';

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
const books = mustFindCollection(config, 'books');
const collections = mustFindCollection(config, 'editorial-collections');

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
    const field = mustFindField(books.fields, 'collections');
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
    const field = mustFindField(books.fields, 'year');
    expect(field.min).toBe(1900);
    expect(field.max).toBe(2030);
  });

  it('offers exactly the genres defined in content.config.ts', () => {
    const field = mustFindField(books.fields, 'genre');
    expect(field.options).toEqual(GENRES);
  });

  it('stores cover images under public/covers, matching the site convention', () => {
    expect(config.media_folder).toBe('public/covers');
    expect(config.public_folder).toBe('/covers');
  });

  it('has exactly the fields actually used on the site — nothing dead, nothing missing', () => {
    // Keep this list in sync with content.config.ts's books schema. Every
    // field here must earn its place by being read somewhere in books.ts /
    // BookCatalog.astro (either displayed, or feeding search/filters) —
    // translators/illustrators/coEdition/awards/featured/purchaseLink/body
    // all got removed for failing that bar. If you're adding a field back,
    // add the matching UI usage first.
    const fieldNames = books.fields.map((f) => f.name);
    expect(fieldNames).toEqual([
      'title',
      'collections',
      'series',
      'year',
      'authors',
      'genre',
      'notes',
      'coverImage',
    ]);
  });

  it('lets notes span multiple lines (a plain string widget only allows one line)', () => {
    const field = mustFindField(books.fields, 'notes');
    expect(field.widget).toBe('text');
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
