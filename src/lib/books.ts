import { getCollection } from 'astro:content';

export interface BookCard {
	slug: string;
	title: string;
	collectionSlugs: string[];
	collectionNames: string[];
	collectionOrder: number;
	series: string;
	year: number | null;
	authors: string[];
	// Slug into the "genres" collection (e.g. "poesia") — what filtering
	// compares against, mirroring collectionSlugs.
	genre: string;
	// Resolved display name (e.g. "Poesía") — what gets shown, mirroring
	// collectionNames.
	genreName: string;
	notes: string;
	coverImage: string;
}

export async function getBookData() {
	const [books, collectionEntries, genreEntries] = await Promise.all([
		getCollection('books'),
		getCollection('collections'),
		getCollection('genres'),
	]);

	const collectionMeta = new Map(
		collectionEntries.map((c) => [c.id, { name: c.data.name, order: c.data.order }])
	);
	const genreMeta = new Map(genreEntries.map((g) => [g.id, { name: g.data.name, order: g.data.order }]));

	const bookData: BookCard[] = books.map((b) => {
		const slugs = b.data.collections;
		const metas = slugs.map((slug) => collectionMeta.get(slug));
		const names = slugs.map((slug, i) => metas[i]?.name ?? slug);
		const orders = metas.map((m) => m?.order ?? 999);
		const genre = b.data.genre ?? '';
		return {
			slug: b.id,
			title: b.data.title,
			collectionSlugs: slugs,
			collectionNames: names,
			collectionOrder: Math.min(...orders),
			series: b.data.series ?? '',
			year: b.data.year ?? null,
			authors: b.data.authors ?? [],
			genre,
			genreName: genre ? (genreMeta.get(genre)?.name ?? genre) : '',
			notes: b.data.notes ?? '',
			coverImage: b.data.coverImage ?? '',
		};
	});

	const collectionOptions = [...collectionMeta.entries()]
		.sort((a, b) => a[1].order - b[1].order)
		.map(([slug, meta]) => ({ slug, name: meta.name }));

	const genreOptions = [...genreMeta.entries()]
		.sort((a, b) => a[1].order - b[1].order)
		.map(([slug, meta]) => ({ slug, name: meta.name }));

	const years = [...new Set(bookData.map((b) => b.year).filter((y): y is number => !!y))].sort(
		(a, b) => b - a
	);

	return { bookData, collectionOptions, genreOptions, years };
}
