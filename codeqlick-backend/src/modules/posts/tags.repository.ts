import { Injectable } from '@nestjs/common';
import type { Prisma, Tag } from '../../generated/prisma/client.js';
import { liveWhere } from '../../common/publishing.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type TagWithCount = Tag & { postCount: number };

@Injectable()
export class TagsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Every tag with the number of posts using it (`liveOnly`: posts on the public site). */
  async list(liveOnly: boolean): Promise<TagWithCount[]> {
    const tags = await this.prisma.tag.findMany({
      orderBy: { slug: 'asc' },
      include: {
        _count: {
          select: { posts: liveOnly ? { where: { post: liveWhere() } } : true },
        },
      },
    });
    // eslint-disable-next-line no-underscore-dangle -- Prisma's name for relation counts.
    return tags.map(({ _count, ...tag }) => ({ ...tag, postCount: _count.posts }));
  }

  findById(id: string): Promise<Tag | null> {
    return this.prisma.tag.findUnique({ where: { id } });
  }

  findBySlug(slug: string): Promise<Tag | null> {
    return this.prisma.tag.findUnique({ where: { slug } });
  }

  countByIds(ids: string[]): Promise<number> {
    return this.prisma.tag.count({ where: { id: { in: ids } } });
  }

  create(data: Prisma.TagCreateInput): Promise<Tag> {
    return this.prisma.tag.create({ data });
  }

  update(id: string, data: Prisma.TagUpdateInput): Promise<Tag> {
    return this.prisma.tag.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.tag.delete({ where: { id } });
  }
}
