import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Prisma, type CloudKvEntry } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CloudCtx } from './cloud-caller.js';
import { CloudKvRepository } from './cloud-kv.repository.js';
import { KV_VALUE_BYTES } from './cloud-plans.js';
import { CloudProjectsService } from './cloud-projects.service.js';
import type { KvIncrInput, KvListQuery, KvPutInput } from './cloud.schemas.js';
import { CloudTeamsService } from './cloud-teams.service.js';

export interface KvEntryView {
  key: string;
  value: Prisma.JsonValue;
  size: number;
  expiresAt: string | null;
  updatedAt: string;
}

export interface KvListView {
  items: Array<{ key: string; size: number; expiresAt: string | null; updatedAt: string }>;
  cursor: string | null;
  usage: { keys: number; bytes: number; maxKeys: number; maxBytes: number };
}

/** Keys anyone may read through the public route. */
export const PUBLIC_KV_PREFIX = 'public:';

const HOUR_MS = 3_600_000;
const expiry = (ttl: number | undefined, now: Date) =>
  ttl ? new Date(now.getTime() + ttl * 1000) : null;

/** Projects' key-value stores (architecture 4.13 "Key-value store", decision 45). */
@Injectable()
export class CloudKvService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CloudKvService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly kv: CloudKvRepository,
    private readonly projects: CloudProjectsService,
    private readonly teams: CloudTeamsService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.cleanup(), HOUR_MS).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async cleanup(now = new Date()): Promise<void> {
    try {
      await this.kv.deleteExpired(now);
    } catch (error) {
      this.logger.error(`Key-value cleanup failed: ${String(error)}`);
    }
  }

  private view(entry: CloudKvEntry): KvEntryView {
    return {
      key: entry.key,
      value: entry.value,
      size: entry.size,
      expiresAt: entry.expiresAt?.toISOString() ?? null,
      updatedAt: entry.updatedAt.toISOString(),
    };
  }

  private async store(ctx: CloudCtx, projectId: string) {
    const { project } = await this.projects.project(ctx, projectId);
    return { project, limits: this.teams.limits(project.team.plan) };
  }

  async list(ctx: CloudCtx, projectId: string, query: KvListQuery): Promise<KvListView> {
    const { project, limits } = await this.store(ctx, projectId);
    const now = new Date();
    const [rows, usage] = await Promise.all([
      this.kv.list(project.id, now, {
        prefix: query.prefix,
        cursor: query.cursor,
        take: query.limit + 1,
      }),
      this.kv.usage(project.id, now),
    ]);
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((row) => ({
        key: row.key,
        size: row.size,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
      })),
      cursor: rows.length > query.limit ? (page.at(-1)?.key ?? null) : null,
      usage: { ...usage, maxKeys: limits.kvKeysPerProject, maxBytes: limits.kvBytesPerProject },
    };
  }

  async get(ctx: CloudCtx, projectId: string, key: string): Promise<KvEntryView> {
    const { project } = await this.store(ctx, projectId);
    const entry = await this.kv.get(project.id, key, new Date());
    if (!entry) throw new NotFoundException('Key not found');
    return this.view(entry);
  }

  async put(
    ctx: CloudCtx,
    projectId: string,
    key: string,
    input: KvPutInput,
  ): Promise<KvEntryView> {
    const { project, limits } = await this.store(ctx, projectId);
    const size = Buffer.byteLength(JSON.stringify(input.value ?? null));
    if (size > KV_VALUE_BYTES) {
      throw new PayloadTooLargeException(`A value is at most ${KV_VALUE_BYTES / 1024} KB`);
    }
    const now = new Date();
    const [current, usage] = await Promise.all([
      this.kv.get(project.id, key, now),
      this.kv.usage(project.id, now),
    ]);
    if (!current && usage.keys >= limits.kvKeysPerProject) {
      throw new ConflictException(`A project's store has at most ${limits.kvKeysPerProject} keys`);
    }
    if (usage.bytes - (current?.size ?? 0) + size > limits.kvBytesPerProject) {
      throw new ConflictException(
        `A project's store holds at most ${Math.round(limits.kvBytesPerProject / 1024 / 1024)} MB`,
      );
    }
    const value = input.value === null ? Prisma.JsonNull : (input.value as Prisma.InputJsonValue);
    return this.view(await this.kv.put(project.id, key, value, size, expiry(input.ttl, now)));
  }

  async remove(ctx: CloudCtx, projectId: string, key: string): Promise<void> {
    const { project } = await this.store(ctx, projectId);
    if (!(await this.kv.delete(project.id, key, new Date()))) {
      throw new NotFoundException('Key not found');
    }
  }

  async incr(
    ctx: CloudCtx,
    projectId: string,
    key: string,
    input: KvIncrInput,
  ): Promise<{ key: string; value: Prisma.JsonValue }> {
    const { project, limits } = await this.store(ctx, projectId);
    const now = new Date();
    if (!(await this.kv.get(project.id, key, now))) {
      const usage = await this.kv.usage(project.id, now);
      if (usage.keys >= limits.kvKeysPerProject) {
        throw new ConflictException(
          `A project's store has at most ${limits.kvKeysPerProject} keys`,
        );
      }
    }
    const result = await this.kv.incr(project.id, key, input.by, expiry(input.ttl, now), now);
    if (!result) throw new ConflictException("That key's value isn't an integer");
    return { key, value: result.value };
  }

  /** A `public:` key's value, for anyone (no token). */
  async publicValue(slug: string, key: string): Promise<Prisma.JsonValue> {
    if (!key.startsWith(PUBLIC_KV_PREFIX)) throw new NotFoundException('Key not found');
    const project = await this.kv.publicProject(slug);
    const entry = project ? await this.kv.get(project.id, key, new Date()) : null;
    if (!entry) throw new NotFoundException('Key not found');
    return entry.value;
  }
}
