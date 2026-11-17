import { neoqlickLegalPage, neoqlickLegalMetadata } from '@/components/neoqlick/NeoqlickLegalPage';

export const generateMetadata = neoqlickLegalMetadata('terms');

/** Neoqlick's terms text (architecture 4.18, decision 129), in the six languages of its portal. */
export default neoqlickLegalPage('terms');
