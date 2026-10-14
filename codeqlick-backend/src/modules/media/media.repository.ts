import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface MediaUsage {
  type: 'post' | 'portfolio';
  id: string;
  slug: string;
}

/** Looks up which posts and case studies reference uploaded images. */
@Injectable()
export class MediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Content that mentions each file name, as a cover or inside the Markdown. File names are
   * random UUIDs, so a substring match can't hit by accident.
   */
  async findUsage(filenames: string[]): Promise<Map<string, MediaUsage[]>> {
    const usage = new Map<string, MediaUsage[]>(filenames.map((filename) => [filename, []]));
    if (filenames.length === 0) return usage;

    const mentions = filenames.flatMap((filename) => [
      { coverImageUrl: { contains: filename } },
      { translations: { some: { content: { contains: filename } } } },
    ]);
    const select = {
      id: true,
      slug: true,
      coverImageUrl: true,
      translations: { select: { content: true } },
    } as const;
    const [posts, items] = await this.prisma.$transaction([
      this.prisma.post.findMany({ where: { OR: mentions }, select }),
      this.prisma.portfolioItem.findMany({ where: { OR: mentions }, select }),
    ]);

    const collect = (type: MediaUsage['type'], rows: typeof posts) => {
      for (const row of rows) {
        const text = [row.coverImageUrl ?? '', ...row.translations.map((t) => t.content)].join(
          '\n',
        );
        for (const filename of filenames) {
          if (text.includes(filename))
            usage.get(filename)?.push({ type, id: row.id, slug: row.slug });
        }
      }
    };
    collect('post', posts);
    collect('portfolio', items);
    return usage;
  }
}
