import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/** next-intl's navigation, as it comes. Import from `./navigation`, which adapts it to the apps. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
