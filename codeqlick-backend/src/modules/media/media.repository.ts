import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface MediaUsage {
  /** For a managed site, `id` is its project's and `slug` the site's. */
  type: 'post' | 'portfolio' | 'site';
  id: string;
  slug: string;
}

/** Looks up which posts, case studies and managed sites reference uploaded images. */
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
    const [posts, items, sites, news] = await this.prisma.$transaction([
      this.prisma.post.findMany({ where: { OR: mentions }, select }),
      this.prisma.portfolioItem.findMany({ where: { OR: mentions }, select }),
      // Few rows, and their content is JSON: searched here rather than in SQL.
      this.prisma.managedSite.findMany({ select: { projectId: true, slug: true, content: true } }),
      // A site's news photos (architecture 8.2) are `media/<file>`.
      this.prisma.siteNewsPost.findMany({
        where: { photo: { in: filenames.map((filename) => `media/${filename}`) } },
        select: { photo: true, site: { select: { projectId: true, slug: true } } },
      }),
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
    for (const site of sites) {
      const text = JSON.stringify(site.content);
      for (const filename of filenames) {
        if (text.includes(filename))
          usage.get(filename)?.push({ type: 'site', id: site.projectId, slug: site.slug });
      }
    }
    for (const post of news) {
      const filename = post.photo?.slice('media/'.length) ?? '';
      const used = usage.get(filename);
      if (used && !used.some((item) => item.type === 'site' && item.id === post.site.projectId)) {
        used.push({ type: 'site', id: post.site.projectId, slug: post.site.slug });
      }
    }
    return usage;
  }
}
