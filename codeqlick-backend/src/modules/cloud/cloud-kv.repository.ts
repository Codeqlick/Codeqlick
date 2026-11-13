import { Injectable } from '@nestjs/common';
import { Prisma, type CloudKvEntry } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Entries that haven't expired at `now`. */
const live = (now: Date): Prisma.CloudKvEntryWhereInput => ({
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

/** Projects' key-value stores (architecture 4.13 "Key-value store", decision 45). */
@Injectable()
export class CloudKvRepository {
  constructor(private readonly prisma: PrismaService) {}

  async usage(projectId: string, now: Date): Promise<{ keys: number; bytes: number }> {
    const result = await this.prisma.cloudKvEntry.aggregate({
      where: { projectId, ...live(now) },
      _count: { _all: true },
      _sum: { size: true },
    });
    return { keys: result._count._all, bytes: result._sum.size ?? 0 };
  }

  list(
    projectId: string,
    now: Date,
    query: { prefix?: string; cursor?: string; take: number },
  ): Promise<Array<Pick<CloudKvEntry, 'key' | 'size' | 'expiresAt' | 'updatedAt'>>> {
    return this.prisma.cloudKvEntry.findMany({
      where: {
        projectId,
        AND: [
          live(now),
          query.prefix ? { key: { startsWith: query.prefix } } : {},
          query.cursor ? { key: { gt: query.cursor } } : {},
        ],
      },
      select: { key: true, size: true, expiresAt: true, updatedAt: true },
      orderBy: { key: 'asc' },
      take: query.take,
    });
  }

  get(projectId: string, key: string, now: Date): Promise<CloudKvEntry | null> {
    return this.prisma.cloudKvEntry.findFirst({ where: { projectId, key, ...live(now) } });
  }

  put(
    projectId: string,
    key: string,
    value: Prisma.InputJsonValue | typeof Prisma.JsonNull,
    size: number,
    expiresAt: Date | null,
  ): Promise<CloudKvEntry> {
    return this.prisma.cloudKvEntry.upsert({
      where: { projectId_key: { projectId, key } },
      create: { projectId, key, value, size, expiresAt },
      update: { value, size, expiresAt },
    });
  }

  async delete(projectId: string, key: string, now: Date): Promise<boolean> {
    const { count } = await this.prisma.cloudKvEntry.deleteMany({
      where: { projectId, key, ...live(now) },
    });
    return count > 0;
  }

  /**
   * Adds `by` to an integer entry in one statement (a missing or expired one starts at 0);
   * null when the entry holds something else.
   */
  async incr(
    projectId: string,
    key: string,
    by: number,
    expiresAt: Date | null,
    now: Date,
  ): Promise<{ value: Prisma.JsonValue; updatedAt: Date; expiresAt: Date | null } | null> {
    const keepExpiry = expiresAt === null;
    const rows = await this.prisma.$queryRaw<
      Array<{ value: Prisma.JsonValue; updated_at: Date; expires_at: Date | null }>
    >`
      INSERT INTO cloud_kv_entries AS e (project_id, key, value, size, expires_at, created_at, updated_at)
      VALUES (${projectId}::uuid, ${key}, to_jsonb(${by}::bigint), length(${by}::bigint::text),
              ${expiresAt}, ${now}, ${now})
      ON CONFLICT (project_id, key) DO UPDATE SET
        value = CASE WHEN e.expires_at IS NOT NULL AND e.expires_at <= ${now} THEN EXCLUDED.value
                     ELSE to_jsonb((e.value #>> '{}')::numeric::bigint + ${by}::bigint) END,
        size = CASE WHEN e.expires_at IS NOT NULL AND e.expires_at <= ${now} THEN EXCLUDED.size
                    ELSE length(((e.value #>> '{}')::numeric::bigint + ${by}::bigint)::text) END,
        expires_at = CASE WHEN NOT ${keepExpiry} THEN EXCLUDED.expires_at
                          WHEN e.expires_at IS NOT NULL AND e.expires_at <= ${now} THEN NULL
                          ELSE e.expires_at END,
        updated_at = ${now}
      WHERE (e.expires_at IS NOT NULL AND e.expires_at <= ${now})
         OR (jsonb_typeof(e.value) = 'number' AND (e.value #>> '{}') ~ '^-?[0-9]{1,18}$')
      RETURNING value, updated_at, expires_at`;
    const row = rows[0];
    return row ? { value: row.value, updatedAt: row.updated_at, expiresAt: row.expires_at } : null;
  }

  deleteExpired(now: Date): Promise<unknown> {
    return this.prisma.cloudKvEntry.deleteMany({ where: { expiresAt: { lte: now } } });
  }

  /** A live, unsuspended project by its address. */
  publicProject(slug: string): Promise<{ id: string } | null> {
    return this.prisma.cloudProject.findFirst({
      where: { slug, deletedAt: null, suspendedAt: null },
      select: { id: true },
    });
  }
}
