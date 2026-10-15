import { Injectable, NotFoundException } from '@nestjs/common';
import type { SavedReply } from '../../generated/prisma/client.js';
import { SavedRepliesRepository } from './saved-replies.repository.js';
import type { CreateSavedReplyInput, UpdateSavedReplyInput } from './saved-replies.schemas.js';

export interface SavedReplyView {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
}

function toView(reply: SavedReply): SavedReplyView {
  return {
    id: reply.id,
    title: reply.title,
    body: reply.body,
    updatedAt: reply.updatedAt.toISOString(),
  };
}

@Injectable()
export class SavedRepliesService {
  constructor(private readonly repository: SavedRepliesRepository) {}

  async list(): Promise<SavedReplyView[]> {
    return (await this.repository.list()).map(toView);
  }

  async create(input: CreateSavedReplyInput): Promise<SavedReplyView> {
    return toView(await this.repository.create(input));
  }

  async update(id: string, input: UpdateSavedReplyInput): Promise<SavedReplyView> {
    await this.findOrThrow(id);
    return toView(await this.repository.update(id, input));
  }

  async delete(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.repository.delete(id);
  }

  private async findOrThrow(id: string): Promise<SavedReply> {
    const reply = await this.repository.findById(id);
    if (!reply) throw new NotFoundException('Saved reply not found');
    return reply;
  }
}
