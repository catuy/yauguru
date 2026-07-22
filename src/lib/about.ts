import { getEntry, render } from 'astro:content';

export async function getAboutData() {
	const entry = await getEntry('about', 'about');
	if (!entry) return null;
	const { Content } = await render(entry);
	return { Content };
}
