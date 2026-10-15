import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Tag } from '../../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { TagsRepository, type TagWithCount } from './tags.repository.js';
import type { CreateTagInput, UpdateTagInput } from './tags.schemas.js';

export interface AdminTag {
  id: string;
  slug: string;
  nameEn: string;
  nameEs: string;
  /** Posts using the tag, drafts and scheduled ones included. */
  postCount: number;
}

/** A tag as the public site shows it: its name in the requested language. */
export interface PublicTag {
  slug: string;
  name: string;
}

export function tagName(tag: Pick<Tag, 'nameEn' | 'nameEs'>, locale: ApiLocale): string {
  return locale === 'es' ? tag.nameEs : tag.nameEn;
}

function toAdminTag(tag: TagWithCount): AdminTag {
  return {
    id: tag.id,
    slug: tag.slug,
    nameEn: tag.nameEn,
    nameEs: tag.nameEs,
    postCount: tag.postCount,
  };
}

@Injectable()
export class TagsService {
  constructor(
    private readonly repository: TagsRepository,
    private readonly activity: ActivityService,
  ) {}

  /** Tags used by at least one post on the public site, with how many, by name. */
  async listPublic(locale: ApiLocale): Promise<(PublicTag & { count: number })[]> {
    const tags = await this.repository.list(true);
    return tags
      .filter((tag) => tag.postCount > 0)
      .map((tag) => ({ slug: tag.slug, name: tagName(tag, locale), count: tag.postCount }))
      .toSorted((a, b) => a.name.localeCompare(b.name, locale));
  }

  async listAll(): Promise<AdminTag[]> {
    return (await this.repository.list(false)).map(toAdminTag);
  }

  /** 400 unless every id is an existing tag. */
  async assertExist(ids: string[]): Promise<void> {
    const unique = [...new Set(ids)];
    if ((await this.repository.countByIds(unique)) !== unique.length) {
      throw new BadRequestException({ errors: [{ path: 'tagIds', message: 'Unknown tag' }] });
    }
  }

  async create(actor: AuthUser, input: CreateTagInput): Promise<AdminTag> {
    if (await this.repository.findBySlug(input.slug)) {
      throw new ConflictException('A tag with this slug already exists');
    }
    const tag = await this.repository.create(input);
    await this.activity.record(actor, {
      action: 'tag.created',
      targetId: tag.id,
      targetLabel: tag.nameEs,
    });
    return toAdminTag({ ...tag, postCount: 0 });
  }

  async update(actor: AuthUser, id: string, input: UpdateTagInput): Promise<AdminTag> {
    await this.findOrThrow(id);
    if (input.slug !== undefined) {
      const clash = await this.repository.findBySlug(input.slug);
      if (clash && clash.id !== id)
        throw new ConflictException('A tag with this slug already exists');
    }
    await this.repository.update(id, input);
    await this.activity.record(actor, {
      action: 'tag.updated',
      targetId: id,
      targetLabel: input.nameEs ?? (await this.findOrThrow(id)).nameEs,
    });
    const updated = (await this.repository.list(false)).find((tag) => tag.id === id);
    if (!updated) throw new NotFoundException('Tag not found');
    return toAdminTag(updated);
  }

  /** Deletes the tag; the posts that used it simply lose it. */
  async delete(actor: AuthUser, id: string): Promise<void> {
    const tag = await this.findOrThrow(id);
    await this.repository.delete(id);
    await this.activity.record(actor, {
      action: 'tag.deleted',
      targetId: id,
      targetLabel: tag.nameEs,
    });
  }

  private async findOrThrow(id: string): Promise<Tag> {
    const tag = await this.repository.findById(id);
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }
}
