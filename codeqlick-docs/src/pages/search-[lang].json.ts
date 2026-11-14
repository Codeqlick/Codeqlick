import type { APIRoute } from 'astro';
import { render } from 'astro:content';
import { getDocs } from '../lib/docs';
import { LANGS, type Lang } from '../lib/i18n';
import { plainText } from '../lib/plain';

/** `/search-en.json` and `/search-es.json`: one entry per published page. */
export async function getStaticPaths() {
  return LANGS.map((lang) => ({ params: { lang } }));
}

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang;
  const docs = await getDocs();
  const index = await Promise.all(
    docs[lang].map(async (page) => {
      const { headings } = await render(page.entry);
      return {
        url: page.url,
        title: page.title,
        description: page.description,
        headings: headings
          .filter((h) => h.depth === 2 || h.depth === 3)
          .map((h) => ({ text: h.text, id: h.slug })),
        text: plainText(page.entry.body ?? '').slice(0, 20000),
      };
    }),
  );
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
