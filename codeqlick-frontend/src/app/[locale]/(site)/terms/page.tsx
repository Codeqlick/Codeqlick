import type { Metadata } from 'next';
import { legalMetadata, legalPage } from '@/components/content/LegalPage';

const metadata = legalMetadata('terms');

/** Terms of sale of a website bought online (decision 20); not indexed. */
export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return { ...(await metadata(props)), robots: { index: false, follow: true } };
}
export default legalPage('terms');
