import 'server-only';
import { apiFetch } from './client';
import { PUBLIC_REVALIDATE } from './posts';
import type {
  AdminPortfolioItem,
  Locale,
  Paginated,
  PortfolioDetail,
  PortfolioFilters,
  PortfolioInput,
  PortfolioSummary,
  SlugRedirect,
} from './types';

/** With `testimonials`, only case studies with a testimonial in `locale`. */
export function listPortfolio(params: {
  locale: Locale;
  page?: number;
  pageSize?: number;
  testimonials?: boolean;
  technology?: string;
  service?: string;
}) {
  return apiFetch<Paginated<PortfolioSummary>>('/portfolio', {
    query: {
      locale: params.locale,
      page: params.page,
      pageSize: params.pageSize,
      testimonials: params.testimonials ? 'true' : undefined,
      technology: params.technology,
      service: params.service,
    },
    revalidate: PUBLIC_REVALIDATE,
  });
}

/** Technologies and services used by the published case studies, for the list's filters. */
export function getPortfolioFilters() {
  return apiFetch<PortfolioFilters>('/portfolio/filters', { revalidate: PUBLIC_REVALIDATE });
}

export function getPortfolioItem(slug: string, locale: Locale) {
  return apiFetch<PortfolioDetail>(`/portfolio/${encodeURIComponent(slug)}`, {
    query: { locale },
    revalidate: PUBLIC_REVALIDATE,
  });
}

/** The current slug of the live case study that `slug` used to name (decision 51); 404 otherwise. */
export function getPortfolioRedirect(slug: string) {
  return apiFetch<SlugRedirect>(`/portfolio/redirects/${encodeURIComponent(slug)}`, {
    revalidate: PUBLIC_REVALIDATE,
  });
}

export function adminListPortfolio(params: { page?: number; pageSize?: number } = {}) {
  return apiFetch<Paginated<AdminPortfolioItem>>('/admin/portfolio', {
    auth: 'required',
    query: { page: params.page, pageSize: params.pageSize },
  });
}

export function adminGetPortfolioItem(id: string) {
  return apiFetch<AdminPortfolioItem>(`/admin/portfolio/${encodeURIComponent(id)}`, {
    auth: 'required',
  });
}

export function adminCreatePortfolioItem(input: PortfolioInput) {
  return apiFetch<AdminPortfolioItem>('/admin/portfolio', {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

export function adminUpdatePortfolioItem(id: string, input: Partial<PortfolioInput>) {
  return apiFetch<AdminPortfolioItem>(`/admin/portfolio/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    auth: 'required',
  });
}

export function adminDeletePortfolioItem(id: string) {
  return apiFetch<void>(`/admin/portfolio/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}
