import { Injectable } from '@nestjs/common';
import type { CloudBucket, CloudBucketKey, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type BucketWithKeys = CloudBucket & { keys: CloudBucketKey[] };

/** Projects' buckets and their keys (architecture 4.13 "Object storage", decision 48). */
@Injectable()
export class CloudStorageRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(projectId: string): Promise<BucketWithKeys[]> {
    return this.prisma.cloudBucket.findMany({
      where: { projectId },
      include: { keys: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  count(projectId: string): Promise<number> {
    return this.prisma.cloudBucket.count({ where: { projectId } });
  }

  find(projectId: string, id: string): Promise<BucketWithKeys | null> {
    return this.prisma.cloudBucket.findFirst({
      where: { id, projectId },
      include: { keys: { orderBy: { createdAt: 'asc' } } },
    });
  }

  nameTaken(name: string): Promise<boolean> {
    return this.prisma.cloudBucket.count({ where: { name } }).then((n) => n > 0);
  }

  create(data: Prisma.CloudBucketUncheckedCreateInput): Promise<CloudBucket> {
    return this.prisma.cloudBucket.create({ data });
  }

  delete(id: string): Promise<unknown> {
    return this.prisma.cloudBucket.delete({ where: { id } });
  }

  createKey(data: Prisma.CloudBucketKeyUncheckedCreateInput): Promise<CloudBucketKey> {
    return this.prisma.cloudBucketKey.create({ data });
  }

  findKey(bucketId: string, id: string): Promise<CloudBucketKey | null> {
    return this.prisma.cloudBucketKey.findFirst({ where: { id, bucketId } });
  }

  deleteKey(id: string): Promise<unknown> {
    return this.prisma.cloudBucketKey.delete({ where: { id } });
  }

  /** Buckets with their team's plan (to keep quotas in step with it). */
  all() {
    return this.prisma.cloudBucket.findMany({
      include: {
        keys: true,
        project: { select: { deletedAt: true, team: { select: { plan: true } } } },
      },
    });
  }
}
