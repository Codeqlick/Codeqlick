import { Injectable } from '@nestjs/common';
import type { Passkey, User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface CreatePasskeyData {
  userId: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  name: string;
}

/** Why a passkey couldn't be stored. */
export type CreatePasskeyResult =
  { status: 'created'; passkey: Passkey } | { status: 'limit' } | { status: 'duplicate' };

/** Persistence for passkeys and their ceremonies' challenges (decision 104). */
@Injectable()
export class PasskeyRepository {
  constructor(private readonly prisma: PrismaService) {}

  listForUser(userId: string): Promise<Passkey[]> {
    return this.prisma.passkey.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }

  countForUser(userId: string): Promise<number> {
    return this.prisma.passkey.count({ where: { userId } });
  }

  findByCredentialId(credentialId: string): Promise<(Passkey & { user: User }) | null> {
    return this.prisma.passkey.findUnique({ where: { credentialId }, include: { user: true } });
  }

  /** A new challenge for adding a passkey; earlier unused ones of the person stop working. */
  async replaceRegisterChallenge(userId: string, challenge: string, expiresAt: Date) {
    await this.prisma.$transaction([
      this.prisma.webAuthnChallenge.deleteMany({ where: { userId, purpose: 'REGISTER' } }),
      this.prisma.webAuthnChallenge.create({
        data: { userId, purpose: 'REGISTER', challenge, expiresAt },
      }),
    ]);
  }

  /** A sign-in's challenge; its id goes back with the assertion. */
  async createLoginChallenge(challenge: string, expiresAt: Date): Promise<string> {
    const row = await this.prisma.webAuthnChallenge.create({
      data: { purpose: 'LOGIN', challenge, expiresAt },
      select: { id: true },
    });
    return row.id;
  }

  /**
   * Spends the person's registration challenge `challenge`: true when it existed and hadn't
   * expired. Deleted either way; of two requests with the same challenge only one wins.
   */
  async consumeRegisterChallenge(userId: string, challenge: string, now: Date): Promise<boolean> {
    const row = await this.prisma.webAuthnChallenge.findFirst({
      where: { userId, purpose: 'REGISTER', challenge },
    });
    if (!row) return false;
    const deleted = await this.prisma.webAuthnChallenge.deleteMany({ where: { id: row.id } });
    return deleted.count === 1 && row.expiresAt > now;
  }

  /** Spends a sign-in challenge: its value, or null when unknown, used or expired. */
  async consumeLoginChallenge(id: string, now: Date): Promise<string | null> {
    const row = await this.prisma.webAuthnChallenge.findUnique({ where: { id } });
    if (!row || row.purpose !== 'LOGIN') return null;
    const deleted = await this.prisma.webAuthnChallenge.deleteMany({ where: { id } });
    return deleted.count === 1 && row.expiresAt > now ? row.challenge : null;
  }

  /** Stores a passkey unless the person already has `max` of them or the credential is known. */
  async create(data: CreatePasskeyData, max: number): Promise<CreatePasskeyResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialises additions per person, so two at once can't both pass the limit.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${data.userId}::uuid FOR UPDATE`;
        if ((await tx.passkey.count({ where: { userId: data.userId } })) >= max) {
          return { status: 'limit' } as const;
        }
        const passkey = await tx.passkey.create({
          data: {
            ...data,
            publicKey: new Uint8Array(data.publicKey),
            counter: BigInt(data.counter),
          },
        });
        return { status: 'created', passkey } as const;
      });
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code === 'P2002') {
        return { status: 'duplicate' };
      }
      throw error;
    }
  }

  /**
   * Records a sign-in: the new counter and when. False when the counter changed meanwhile (the
   * same assertion used twice at once).
   */
  async markUsed(id: string, previousCounter: bigint, counter: number): Promise<boolean> {
    const result = await this.prisma.passkey.updateMany({
      where: { id, counter: previousCounter },
      data: { counter: BigInt(counter), lastUsedAt: new Date() },
    });
    return result.count === 1;
  }

  /** Renames one of the person's passkeys; null when it isn't theirs. */
  async rename(userId: string, id: string, name: string): Promise<Passkey | null> {
    const result = await this.prisma.passkey.updateMany({ where: { id, userId }, data: { name } });
    if (result.count !== 1) return null;
    return this.prisma.passkey.findUnique({ where: { id } });
  }

  /** Deletes one of the person's passkeys; null when it isn't theirs. */
  async delete(userId: string, id: string): Promise<Passkey | null> {
    const passkey = await this.prisma.passkey.findFirst({ where: { id, userId } });
    if (!passkey) return null;
    const result = await this.prisma.passkey.deleteMany({ where: { id, userId } });
    return result.count === 1 ? passkey : null;
  }

  /** Deletes challenges that expired before `now` (twice-daily cleanup). */
  async deleteExpiredChallenges(now: Date): Promise<number> {
    const result = await this.prisma.webAuthnChallenge.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return result.count;
  }
}
