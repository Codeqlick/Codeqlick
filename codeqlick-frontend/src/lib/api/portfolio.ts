import 'server-only';
import { apiFetch } from './client';
import { PUBLIC_REVALIDATE } from './posts';
import type {
  AdminPortfolioItem,
  Locale,
  Paginated,
  PortfolioDetail,
  PortfolioInput,
  PortfolioSummary,
} from './types';

export function listPortfolio(params: { locale: Locale; page?: number; pageSize?: number }) {
  return apiFetch<Paginated<PortfolioSummary>>('/portfolio', {
    query: { locale: params.locale, page: params.page, pageSize: params.pageSize },
    revalidate: PUBLIC_REVALIDATE,
  });
}

export function getPortfolioItem(slug: string, locale: Locale) {
  return apiFetch<PortfolioDetail>(`/portfolio/${encodeURIComponent(slug)}`, {
    query: { locale },
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
