import { getCollection } from 'astro:content';

export const GENRE_LABELS: Record<string, string> = {
	'poesía': 'Poesía',
	novela: 'Novela',
	cuentos: 'Cuentos',
	ensayo: 'Ensayo',
	teatro: 'Teatro',
	'audio (cd/dvd)': 'Audio (CD/DVD)',
	historieta: 'Historieta',
	otro: 'Otro',
};

export interface BookCard {
	slug: string;
	title: string;
	collectionSlugs: string[];
	collectionNames: string[];
	collectionOrder: number;
	series: string;
	year: number | null;
	authors: string[];
	genre: string;
	notes: string;
	purchaseLink: string;
	coverImage: string;
}

export async function getBookData() {
	const [books, collectionEntries] = await Promise.all([
		getCollection('books'),
		getCollection('collections'),
	]);

	const collectionMeta = new Map(
		collectionEntries.map((c) => [c.id, { name: c.data.name, order: c.data.order }])
	);

	const bookData: BookCard[] = books.map((b) => {
		const slugs = b.data.collections;
		const metas = slugs.map((slug) => collectionMeta.get(slug));
		const names = slugs.map((slug, i) => metas[i]?.name ?? slug);
		const orders = metas.map((m) => m?.order ?? 999);
		return {
			slug: b.id,
			title: b.data.title,
			collectionSlugs: slugs,
			collectionNames: names,
			collectionOrder: Math.min(...orders),
			series: b.data.series ?? '',
			year: b.data.year ?? null,
			authors: b.data.authors ?? [],
			genre: b.data.genre ?? '',
			notes: b.data.notes ?? '',
			purchaseLink: b.data.purchaseLink ?? '',
			coverImage: b.data.coverImage ?? '',
		};
	});

	const collectionOptions = [...collectionMeta.entries()]
		.sort((a, b) => a[1].order - b[1].order)
		.map(([slug, meta]) => ({ slug, name: meta.name }));

	const genresPresent = [...new Set(bookData.map((b) => b.genre).filter(Boolean))].sort();
	const years = [...new Set(bookData.map((b) => b.year).filter((y): y is number => !!y))].sort(
		(a, b) => b - a
	);

	return { bookData, collectionOptions, genresPresent, years };
}
