import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const GENRES = [
  'poesía',
  'novela',
  'cuentos',
  'ensayo',
  'teatro',
  'audio (cd/dvd)',
  'historieta',
  'otro',
] as const;

const books = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/books' }),
  schema: () =>
    z.object({
      title: z.string(),
      // slugs de entradas de la collection "collections" -- un libro puede
      // pertenecer a más de una (ej: publicado en "rescate" y luego
      // redistribuido a través de "clu-de-yauguru")
      collections: z.array(z.string()).min(1),
      series: z.string().optional(),
      year: z.number().optional(),
      // TODO: restore .min(1) once the ~13 entries flagged in the import
      // summary get an author filled in manually via PagesCMS
      authors: z.array(z.string()),
      genre: z.enum(GENRES).optional(),
      translators: z.array(z.string()).optional(),
      illustrators: z.array(z.string()).optional(),
      coEdition: z.string().optional(),
      awards: z.array(z.string()).optional(),
      // Ruta pública a un archivo pre-optimizado en public/covers/ (ver
      // materiales/), no una imagen procesada por el pipeline de Vite/Astro:
      // el grid se arma client-side desde un JSON embebido (ver books.ts),
      // así que necesita una URL de string plana, no un objeto ImageMetadata.
      coverImage: z.string().optional(),
      purchaseLink: z.string().url().optional(),
      featured: z.boolean().default(false),
    }),
});

const editorialCollections = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/collections' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      order: z.number(),
      description: z.string().optional(),
      coverImage: image().optional(),
    }),
});

export const collections = {
  books,
  collections: editorialCollections,
};
