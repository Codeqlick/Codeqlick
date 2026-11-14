import { Injectable, Logger } from '@nestjs/common';
import { evaluate, type CloudConfig, type Evaluation } from './cloud-config.js';
import { CloudProtectionRepository } from './cloud-protection.repository.js';
import { CloudStorage } from './cloud.storage.js';

/** Parsed configs kept in memory, by deployment id: deployments are immutable (decision 52). */
const CACHE_SIZE = 1000;
/** ... and at most this much of their stored text, so big rule files can't fill the memory. */
const CACHE_BYTES = 32 * 1024 * 1024;

/**
 * What a deployment's `codeqlick.json` rules say about a request (architecture 4.13 "Redirects,
 * rewrites and headers"): the stored config, compiled once and kept, evaluated against the
 * deployment's files with the API's own read-only `stat`.
 */
@Injectable()
export class CloudRulesService {
  private readonly logger = new Logger(CloudRulesService.name);
  /** Least recently used first (a Map keeps insertion order). */
  private readonly configs = new Map<string, CloudConfig | null>();
  private readonly sizes = new Map<string, number>();
  private bytes = 0;

  constructor(
    private readonly repository: CloudProtectionRepository,
    private readonly storage: CloudStorage,
  ) {}

  private async config(deploymentId: string): Promise<CloudConfig | null> {
    if (this.configs.has(deploymentId)) {
      const kept = this.configs.get(deploymentId) ?? null;
      this.configs.delete(deploymentId);
      this.configs.set(deploymentId, kept);
      return kept;
    }
    const row = await this.repository.deploymentConfig(deploymentId);
    // Not found: a deployment not saved yet, so nothing is kept for it.
    if (!row) return null;
    const config = (row.config ?? null) as CloudConfig | null;
    const size = config ? JSON.stringify(config).length : 0;
    this.configs.set(deploymentId, config);
    this.sizes.set(deploymentId, size);
    this.bytes += size;
    // Drop the least recently used, but never the one just read.
    while (this.configs.size > 1 && (this.configs.size > CACHE_SIZE || this.bytes > CACHE_BYTES)) {
      const oldest = this.configs.keys().next().value;
      if (oldest === undefined) break;
      this.configs.delete(oldest);
      this.bytes -= this.sizes.get(oldest) ?? 0;
      this.sizes.delete(oldest);
    }
    return config;
  }

  /** The answer for one request, or null when the deployment has no rules (today's behaviour). */
  async evaluate(deploymentId: string, uri: string, args: string): Promise<Evaluation | null> {
    const config = await this.config(deploymentId);
    if (!config) return null;
    try {
      return await evaluate(config, uri, args, (path) => this.storage.isFile(deploymentId, path));
    } catch (error) {
      // A stored config that doesn't compile can't happen (it is checked when unpacked).
      this.logger.error(`Rules of deployment ${deploymentId} failed: ${String(error)}`);
      return null;
    }
  }
}
