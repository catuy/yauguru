import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

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
      // summary get an author filled in manually (via the CMS or by hand)
      authors: z.array(z.string()),
      // Slug de una entrada de la collection "genres" (ver más abajo) — antes
      // era un z.enum() hardcodeado; se migró a colección editable desde el
      // CMS igual que "collections". Singular, no array: un libro tiene a lo
      // sumo un género (a diferencia de collections, que admite varios).
      genre: z.string().optional(),
      // Texto libre para traductores/ilustradores/coedición/premios — antes
      // eran 4 campos estructurados separados, pero lo único que hacían era
      // alimentar una única línea "Notas" armada a mano; se unificaron en un
      // solo campo de texto que refleja directamente lo que se muestra.
      notes: z.string().optional(),
      // Ruta pública a un archivo pre-optimizado en public/covers/ (ver
      // materiales/), no una imagen procesada por el pipeline de Vite/Astro:
      // el grid se arma client-side desde un JSON embebido (ver books.ts),
      // así que necesita una URL de string plana, no un objeto ImageMetadata.
      coverImage: z.string().optional(),
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

// Singleton: exactly one entry (about.md), body is the "sobre nosotros" prose
// shown in BookCatalog.astro's about section — no frontmatter fields, the
// social links live as plain markdown links inside the body text itself
// rather than as structured fields. The CMS collection is a "files"
// collection to match (a directly-editable page) — see public/admin/config.yml.
const about = defineCollection({
  loader: glob({ pattern: 'about.md', base: './src/content/about' }),
  schema: z.object({}),
});

// Same shape as editorialCollections (name + order) — the "genre" filter in
// the front and the genre relation field in the books CMS form both read
// from this instead of a hardcoded enum, same idea as editorial collections.
const genres = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/genres' }),
  schema: z.object({
    name: z.string(),
    order: z.number(),
  }),
});

export const collections = {
  books,
  collections: editorialCollections,
  about,
  genres,
};
