import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';

export type BuildResult = { ok: true; release: string; ms: number } | { ok: false; error: string };

/** HTTP client of site-builder (codeqlick-sites/builder), inside the Docker network. */
@Injectable()
export class SiteBuilderClient {
  constructor(private readonly config: AppConfigService) {}

  private target() {
    const builder = this.config.siteBuilder;
    if (!builder) throw new ServiceUnavailableException('The site builder is not configured');
    return builder;
  }

  /** The demos' content, which new sites start from. */
  async presets(): Promise<Array<{ key: string; content: Record<string, unknown> }>> {
    const { url, token } = this.target();
    const response = await fetch(`${url}/presets`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!response?.ok) throw new ServiceUnavailableException('The site builder is not answering');
    return ((await response.json()) as { presets: [] }).presets;
  }

  /** Marks a site for removal (only request previews); the host unpublishes it. */
  async remove(slug: string): Promise<void> {
    const { url, token } = this.target();
    const response = await fetch(`${url}/sites/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!response?.ok) throw new ServiceUnavailableException('The site builder is not answering');
  }

  /** Builds and publishes a site; a failed build is a result, an unreachable builder an error. */
  async build(input: {
    slug: string;
    preset: string;
    domains: string[];
    content: Record<string, unknown>;
  }): Promise<BuildResult> {
    const { url, token } = this.target();
    let response: Response;
    try {
      response = await fetch(`${url}/build`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(240_000),
      });
    } catch {
      return { ok: false, error: 'The site builder is not answering' };
    }
    const body = (await response.json().catch(() => null)) as BuildResult | null;
    return body ?? { ok: false, error: `The site builder answered ${response.status}` };
  }

  /** Builds a draft's preview under `base` (never published); a failed build is a result. */
  async buildDraft(input: {
    slug: string;
    preset: string;
    content: Record<string, unknown>;
    base: string;
  }): Promise<{ ok: true; ms: number } | { ok: false; error: string }> {
    const { url, token } = this.target();
    try {
      const response = await fetch(`${url}/drafts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(240_000),
      });
      const body = (await response.json().catch(() => null)) as
        { ok: true; ms: number } | { ok: false; error: string } | null;
      return body ?? { ok: false, error: `The site builder answered ${response.status}` };
    } catch {
      return { ok: false, error: 'The site builder is not answering' };
    }
  }

  /** A file of a draft's preview, as the builder answers it; null when it has none. */
  async draftFile(slug: string, path: string): Promise<Response | null> {
    const { url, token } = this.target();
    const response = await fetch(
      `${url}/drafts/${encodeURIComponent(slug)}/${path.split('/').map(encodeURIComponent).join('/')}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) },
    ).catch(() => null);
    if (!response) throw new ServiceUnavailableException('The site builder is not answering');
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    return response;
  }

  /** Deletes a draft's preview (best effort: a missing builder leaves nothing to delete). */
  async removeDraft(slug: string): Promise<void> {
    const builder = this.config.siteBuilder;
    if (!builder) return;
    await fetch(`${builder.url}/drafts/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${builder.token}` },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => undefined);
  }
}
