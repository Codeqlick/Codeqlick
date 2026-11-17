import { neoqlickLegalPage, neoqlickLegalMetadata } from '@/components/neoqlick/NeoqlickLegalPage';

export const generateMetadata = neoqlickLegalMetadata('privacy');

/** Neoqlick's privacy text (architecture 4.18, decision 129), in the six languages of its portal. */
export default neoqlickLegalPage('privacy');
