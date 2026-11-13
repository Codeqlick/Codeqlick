import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';

export class GarageError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface GarageBucket {
  id: string;
  bytes: number;
  objects: number;
}

/**
 * Garage's admin API v2 (architecture 4.13 "Object storage", decision 48): buckets, their quotas
 * and access keys. The single node gets its layout the first time it is needed.
 */
@Injectable()
export class GarageClient {
  private readonly logger = new Logger(GarageClient.name);
  private layout?: Promise<void>;

  constructor(private readonly config: AppConfigService) {}

  get configured(): boolean {
    return this.config.cloudStorage !== undefined;
  }

  private settings() {
    const settings = this.config.cloudStorage;
    if (!settings) throw new GarageError(503, 'Object storage is not set up');
    return settings;
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const { adminUrl, token } = this.settings();
    const init: RequestInit = {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    };
    if (method === 'POST') init.body = JSON.stringify(body ?? {});
    const response = await fetch(`${adminUrl}/v2/${path}`, init);
    const text = await response.text();
    if (!response.ok) {
      let message = text.slice(0, 300);
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? message;
      } catch {
        // Not JSON.
      }
      throw new GarageError(response.status, `Garage ${path}: ${message}`);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** A single node needs a role in the layout before it stores anything. */
  private ready(): Promise<void> {
    this.layout ??= this.ensureLayout().catch((error: unknown) => {
      this.layout = undefined;
      throw error;
    });
    return this.layout;
  }

  private async ensureLayout(): Promise<void> {
    const status = await this.call<{
      layoutVersion: number;
      nodes: Array<{ id: string; role: unknown }>;
    }>('GET', 'GetClusterStatus');
    const node = status.nodes[0];
    if (!node || node.role) return;
    const capacity = this.settings().capacityGb * 1_000_000_000;
    await this.call('POST', 'UpdateClusterLayout', {
      roles: [{ id: node.id, zone: 'dc1', capacity, tags: ['cloud'] }],
    });
    const layout = await this.call<{ version: number }>('GET', 'GetClusterLayout');
    await this.call('POST', 'ApplyClusterLayout', { version: layout.version + 1 });
    this.logger.log(`Garage's layout applied: node ${node.id.slice(0, 16)}, ${capacity} bytes`);
  }

  async createBucket(name: string, maxSize: number, maxObjects: number): Promise<string> {
    await this.ready();
    const bucket = await this.call<{ id: string }>('POST', 'CreateBucket', { globalAlias: name });
    try {
      await this.setQuotas(bucket.id, maxSize, maxObjects);
    } catch (error) {
      await this.deleteBucket(bucket.id).catch(() => undefined);
      throw error;
    }
    return bucket.id;
  }

  async setQuotas(id: string, maxSize: number, maxObjects: number): Promise<void> {
    await this.call('POST', `UpdateBucket?id=${encodeURIComponent(id)}`, {
      quotas: { maxSize, maxObjects },
    });
  }

  async bucket(id: string): Promise<GarageBucket & { maxSize: number | null }> {
    const info = await this.call<{
      id: string;
      bytes: number;
      objects: number;
      quotas: { maxSize: number | null; maxObjects: number | null };
    }>('GET', `GetBucketInfo?id=${encodeURIComponent(id)}`);
    return { id: info.id, bytes: info.bytes, objects: info.objects, maxSize: info.quotas.maxSize };
  }

  /** Garage refuses to delete a bucket that holds objects. */
  async deleteBucket(id: string): Promise<void> {
    await this.call('POST', `DeleteBucket?id=${encodeURIComponent(id)}`);
  }

  /** A key that can only reach one bucket: its id and its secret (Garage's only copy to us). */
  async createKey(
    name: string,
    bucketId: string,
    write: boolean,
  ): Promise<{ accessKeyId: string; secretAccessKey: string }> {
    await this.ready();
    const key = await this.call<{ accessKeyId: string; secretAccessKey: string | null }>(
      'POST',
      'CreateKey',
      { name },
    );
    try {
      await this.call('POST', 'AllowBucketKey', {
        bucketId,
        accessKeyId: key.accessKeyId,
        permissions: { read: true, write, owner: false },
      });
    } catch (error) {
      await this.deleteKey(key.accessKeyId).catch(() => undefined);
      throw error;
    }
    if (!key.secretAccessKey) throw new GarageError(502, 'Garage returned no secret');
    return { accessKeyId: key.accessKeyId, secretAccessKey: key.secretAccessKey };
  }

  async deleteKey(accessKeyId: string): Promise<void> {
    await this.call('POST', `DeleteKey?id=${encodeURIComponent(accessKeyId)}`);
  }
}
