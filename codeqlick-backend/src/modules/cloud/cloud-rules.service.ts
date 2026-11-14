import { Injectable, Logger } from '@nestjs/common';
import { evaluate, type CloudConfig, type Evaluation } from './cloud-config.js';
import { CloudProtectionRepository } from './cloud-protection.repository.js';
import { CloudStorage } from './cloud.storage.js';

/** Parsed configs kept in memory, by deployment id: deployments are immutable (decision 52). */
const CACHE_SIZE = 1000;

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
    this.configs.set(deploymentId, config);
    if (this.configs.size > CACHE_SIZE) {
      const oldest = this.configs.keys().next().value;
      if (oldest !== undefined) this.configs.delete(oldest);
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
