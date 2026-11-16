import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { Prisma, type CloudBucketKey } from '../../generated/prisma/client.js';
import type { CloudCtx } from './cloud-caller.js';
import { CLOUD_PLANS, KEYS_PER_BUCKET } from './cloud-plans.js';
import { CloudProjectsService } from './cloud-projects.service.js';
import { CloudStorageRepository, type BucketWithKeys } from './cloud-storage.repository.js';
import { CloudTeamsService } from './cloud-teams.service.js';
import { CloudDiskService } from './cloud-disk.service.js';
import { GarageClient, GarageError, type GarageCorsRule } from './garage.client.js';
import type { UpdateBucketInput } from './cloud.schemas.js';

export interface BucketKeyView {
  id: string;
  name: string;
  accessKeyId: string;
  write: boolean;
  createdAt: string;
}

export interface BucketView {
  id: string;
  name: string;
  endpoint: string;
  region: string;
  sizeBytes: number | null;
  objects: number | null;
  maxBytes: number;
  maxObjects: number;
  /** Public read (decision 111): anyone downloads its files at `publicUrl`. */
  public: boolean;
  publicUrl: string | null;
  cors: GarageCorsRule | null;
  keys: BucketKeyView[];
  createdAt: string;
}

const HOUR_MS = 3_600_000;

/** The stored CORS rule, when it is one (the column is JSON). */
function storedCors(value: Prisma.JsonValue | null): GarageCorsRule | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rule = value as Record<string, unknown>;
  const list = (key: string) =>
    Array.isArray(rule[key]) ? (rule[key] as unknown[]).filter((v) => typeof v === 'string') : [];
  return {
    origins: list('origins') as string[],
    methods: list('methods') as string[],
    headers: list('headers') as string[],
    exposeHeaders: list('exposeHeaders') as string[],
    maxAge: typeof rule.maxAge === 'number' ? rule.maxAge : 0,
  };
}

/** Whether two lists hold the same values, in any order. */
function sameSet(x: string[], y: string[]): boolean {
  const a = x.toSorted();
  const b = y.toSorted();
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/** Whether two rules say the same (Garage may answer the lists in its own order). */
export function sameCors(a: GarageCorsRule | null, b: GarageCorsRule | null): boolean {
  if (!a || !b) return a === b;
  return (
    sameSet(a.origins, b.origins) &&
    sameSet(a.methods, b.methods) &&
    sameSet(a.headers, b.headers) &&
    sameSet(a.exposeHeaders, b.exposeHeaders) &&
    a.maxAge === b.maxAge
  );
}

/** Where a public bucket's files are read: `https://s3.<domain>/_public/<bucket>/`. */
export function publicUrl(endpoint: string, name: string): string {
  return `${endpoint}/_public/${name}/`;
}

/** Garage's errors as the API's: unavailable, or what Garage said. */
function fromGarage(error: unknown): never {
  if (error instanceof GarageError) {
    if (error.status === 503) throw new ServiceUnavailableException(error.message);
    throw new HttpException(error.message, error.status >= 500 ? 502 : error.status);
  }
  throw error;
}

/** Projects' S3-compatible buckets (architecture 4.13 "Object storage", decision 48). */
@Injectable()
export class CloudStorageService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CloudStorageService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly storage: CloudStorageRepository,
    private readonly garage: GarageClient,
    private readonly projects: CloudProjectsService,
    private readonly teams: CloudTeamsService,
    private readonly config: AppConfigService,
    private readonly disk: CloudDiskService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest || !this.garage.configured) return;
    // Every 10 minutes, so a full disk freezes the buckets soon (decision 49).
    this.timer = setInterval(() => void this.sync(), HOUR_MS / 6).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private keyView(key: CloudBucketKey): BucketKeyView {
    return {
      id: key.id,
      name: key.name,
      accessKeyId: key.accessKeyId,
      write: key.write,
      createdAt: key.createdAt.toISOString(),
    };
  }

  private async view(bucket: BucketWithKeys, plan: 'FREE' | 'PRO'): Promise<BucketView> {
    const settings = this.config.cloudStorage!;
    const usage = await this.garage.bucket(bucket.garageId).catch(() => null);
    return {
      id: bucket.id,
      name: bucket.name,
      endpoint: settings.endpoint,
      region: settings.region,
      sizeBytes: usage?.bytes ?? null,
      objects: usage?.objects ?? null,
      maxBytes: CLOUD_PLANS[plan].bucketBytes,
      maxObjects: CLOUD_PLANS[plan].bucketObjects,
      public: bucket.publicAt !== null,
      publicUrl: bucket.publicAt ? publicUrl(settings.endpoint, bucket.name) : null,
      cors: storedCors(bucket.cors),
      keys: bucket.keys.map((key) => this.keyView(key)),
      createdAt: bucket.createdAt.toISOString(),
    };
  }

  /** What every bucket holds, from Garage (the disk guard's report); 0 when it can't be read. */
  async totalBytes(): Promise<number> {
    if (!this.garage.configured) return 0;
    let total = 0;
    for (const bucket of await this.storage.all()) {
      total += (await this.garage.bucket(bucket.garageId).catch(() => null))?.bytes ?? 0;
    }
    return total;
  }

  async list(ctx: CloudCtx, projectId: string) {
    const { project } = await this.projects.project(ctx, projectId);
    const settings = this.config.cloudStorage;
    const publicLimit = CLOUD_PLANS[project.team.plan].publicBucketsPerProject;
    if (!settings) {
      return {
        configured: false,
        endpoint: null,
        region: null,
        publicLimit,
        publicCount: 0,
        items: [],
      };
    }
    const buckets = await this.storage.list(project.id);
    return {
      configured: true,
      endpoint: settings.endpoint,
      region: settings.region,
      publicLimit,
      publicCount: buckets.filter((bucket) => bucket.publicAt !== null).length,
      items: await Promise.all(buckets.map((b) => this.view(b, project.team.plan))),
    };
  }

  async create(ctx: CloudCtx, projectId: string, name: string): Promise<BucketView> {
    const { project, membership } = await this.projects.project(ctx, projectId, 'ADMIN');
    if (!this.garage.configured)
      throw new ServiceUnavailableException('Object storage is not set up');
    this.disk.assertRoom();
    const limits = CLOUD_PLANS[project.team.plan];
    if ((await this.storage.count(project.id)) >= limits.bucketsPerProject) {
      throw new ConflictException(
        `A project has at most ${limits.bucketsPerProject} buckets on this plan`,
      );
    }
    if (await this.storage.nameTaken(name))
      throw new ConflictException('That bucket name is taken');
    const garageId = await this.garage
      .createBucket(name, limits.bucketBytes, limits.bucketObjects)
      .catch((error: unknown) => {
        if (error instanceof GarageError && error.status === 409) {
          throw new ConflictException('That bucket name is taken');
        }
        return fromGarage(error);
      });
    let bucket;
    try {
      bucket = await this.storage.create({ projectId: project.id, name, garageId });
    } catch (error) {
      await this.garage.deleteBucket(garageId).catch(() => undefined);
      throw error;
    }
    await this.teams.record(ctx, membership.teamId, 'bucket.created', name);
    return this.view({ ...bucket, keys: [] }, project.team.plan);
  }

  /**
   * Public read and the CORS rule (decision 111). Garage is changed first, the row only once it
   * accepted; an event per real change.
   */
  async update(
    ctx: CloudCtx,
    projectId: string,
    id: string,
    input: UpdateBucketInput,
  ): Promise<BucketView> {
    const { project, membership } = await this.projects.project(ctx, projectId, 'ADMIN');
    if (!this.garage.configured)
      throw new ServiceUnavailableException('Object storage is not set up');
    let bucket = await this.storage.find(project.id, id);
    if (!bucket) throw new NotFoundException('Bucket not found');
    const keys = bucket.keys;

    if (input.public !== undefined && input.public !== (bucket.publicAt !== null)) {
      if (input.public) {
        if (project.suspendedAt) throw new ForbiddenException('This project is suspended');
        const limit = CLOUD_PLANS[project.team.plan].publicBucketsPerProject;
        if ((await this.storage.countPublic(project.id)) >= limit) {
          throw new ConflictException(
            `A project has at most ${limit} public ${limit === 1 ? 'bucket' : 'buckets'} on this plan`,
          );
        }
      }
      await this.garage.setWebsite(bucket.garageId, input.public).catch(fromGarage);
      bucket = {
        ...(await this.storage.update(bucket.id, {
          publicAt: input.public ? new Date() : null,
        })),
        keys,
      };
      await this.teams.record(
        ctx,
        membership.teamId,
        input.public ? 'bucket.public_enabled' : 'bucket.public_disabled',
        bucket.name,
      );
    }

    if (input.cors !== undefined && !sameCors(storedCors(bucket.cors), input.cors)) {
      await this.garage.setCors(bucket.garageId, input.cors).catch(fromGarage);
      bucket = {
        ...(await this.storage.update(bucket.id, {
          cors: input.cors ? { ...input.cors } : Prisma.DbNull,
        })),
        keys,
      };
      if (input.cors) {
        await this.teams.record(ctx, membership.teamId, 'bucket.cors_updated', bucket.name, {
          origins: input.cors.origins,
          methods: input.cors.methods,
        });
      } else {
        await this.teams.record(ctx, membership.teamId, 'bucket.cors_cleared', bucket.name);
      }
    }
    return this.view(bucket, project.team.plan);
  }

  async remove(ctx: CloudCtx, projectId: string, id: string): Promise<void> {
    const { project, membership } = await this.projects.project(ctx, projectId, 'ADMIN');
    const bucket = await this.storage.find(project.id, id);
    if (!bucket) throw new NotFoundException('Bucket not found');
    const usage = await this.garage.bucket(bucket.garageId).catch(fromGarage);
    if (usage.objects > 0) {
      throw new ConflictException('Empty the bucket before deleting it');
    }
    for (const key of bucket.keys)
      await this.garage.deleteKey(key.accessKeyId).catch(() => undefined);
    await this.garage.deleteBucket(bucket.garageId).catch(fromGarage);
    await this.storage.delete(bucket.id);
    await this.teams.record(ctx, membership.teamId, 'bucket.deleted', bucket.name);
  }

  async createKey(
    ctx: CloudCtx,
    projectId: string,
    bucketId: string,
    input: { name: string; write: boolean },
  ): Promise<BucketKeyView & { secretAccessKey: string }> {
    const { project, membership } = await this.projects.project(ctx, projectId, 'ADMIN');
    const bucket = await this.storage.find(project.id, bucketId);
    if (!bucket) throw new NotFoundException('Bucket not found');
    if (bucket.keys.length >= KEYS_PER_BUCKET) {
      throw new ConflictException(`A bucket has at most ${KEYS_PER_BUCKET} keys`);
    }
    const created = await this.garage
      .createKey(`${bucket.name}/${input.name}`.slice(0, 120), bucket.garageId, input.write)
      .catch(fromGarage);
    let key: CloudBucketKey;
    try {
      key = await this.storage.createKey({
        bucketId: bucket.id,
        name: input.name,
        accessKeyId: created.accessKeyId,
        write: input.write,
      });
    } catch (error) {
      await this.garage.deleteKey(created.accessKeyId).catch(() => undefined);
      throw error;
    }
    await this.teams.record(
      ctx,
      membership.teamId,
      'bucket.key_created',
      `${bucket.name}/${input.name}`,
    );
    return { ...this.keyView(key), secretAccessKey: created.secretAccessKey };
  }

  async removeKey(
    ctx: CloudCtx,
    projectId: string,
    bucketId: string,
    keyId: string,
  ): Promise<void> {
    const { project, membership } = await this.projects.project(ctx, projectId, 'ADMIN');
    const bucket = await this.storage.find(project.id, bucketId);
    const key = bucket ? await this.storage.findKey(bucket.id, keyId) : null;
    if (!bucket || !key) throw new NotFoundException('Key not found');
    await this.garage.deleteKey(key.accessKeyId).catch((error: unknown) => {
      if (!(error instanceof GarageError && error.status === 404)) fromGarage(error);
    });
    await this.storage.deleteKey(key.id);
    await this.teams.record(
      ctx,
      membership.teamId,
      'bucket.key_deleted',
      `${bucket.name}/${key.name}`,
    );
  }

  /**
   * Every 10 minutes: quotas follow the team's plan (frozen while the disk is full); public read
   * and CORS follow the rows (public read off while the project is suspended); a deleted project's
   * buckets stop being public, its keys are deleted (so its buckets can't be reached) and its
   * empty buckets go.
   */
  async sync(): Promise<void> {
    try {
      for (const bucket of await this.storage.all()) {
        if (bucket.project.deletedAt) {
          if (bucket.publicAt) {
            await this.garage.setWebsite(bucket.garageId, false).catch(() => undefined);
            await this.storage.update(bucket.id, { publicAt: null });
          }
          for (const key of bucket.keys) {
            await this.garage.deleteKey(key.accessKeyId).catch(() => undefined);
          }
          const usage = await this.garage.bucket(bucket.garageId).catch(() => null);
          if (usage && usage.objects === 0) {
            await this.garage.deleteBucket(bucket.garageId);
            await this.storage.delete(bucket.id);
          }
          continue;
        }
        const limits = CLOUD_PLANS[bucket.project.team.plan];
        const usage = await this.garage.bucket(bucket.garageId);
        // A full disk: no bucket may grow past what it holds now (decision 49).
        const maxSize = this.disk.full
          ? Math.min(usage.bytes, limits.bucketBytes)
          : limits.bucketBytes;
        if (usage.maxSize !== maxSize) {
          await this.garage.setQuotas(bucket.garageId, maxSize, limits.bucketObjects);
        }
        // Public read follows the row, and is off while the project is suspended (decision 111).
        const website = bucket.publicAt !== null && !bucket.project.suspendedAt;
        if (usage.website !== website) await this.garage.setWebsite(bucket.garageId, website);
        const cors = storedCors(bucket.cors);
        if (!sameCors(usage.cors, cors)) await this.garage.setCors(bucket.garageId, cors);
      }
    } catch (error) {
      this.logger.error(`The buckets' sync failed: ${String(error)}`);
    }
  }
}
