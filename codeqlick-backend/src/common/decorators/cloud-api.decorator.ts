import { SetMetadata } from '@nestjs/common';

export const CLOUD_API_KEY = 'cloudApi';

/**
 * Lets Codeqlick Cloud's API tokens (`cqk_…`) call a route (or a whole controller), besides
 * sessions. Tokens are refused everywhere else (architecture 4.13, decision 35).
 */
export const CloudApi = () => SetMetadata(CLOUD_API_KEY, true);
