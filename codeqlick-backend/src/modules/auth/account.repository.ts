import { Injectable } from '@nestjs/common';
import type { Locale, User } from '../../generated/prisma/client.js';
import { isUniqueViolation } from '../../common/prisma-errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { usernameColumns } from './username.js';

export type EmailChangeResult =
  { status: 'done'; user: User; oldEmail: string } | { status: 'invalid' } | { status: 'taken' };

/** Persistence for what people do with their own account: profile, email, export, deletion. */
@Injectable()
export class AccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  emailTaken(email: string): Promise<boolean> {
    return this.prisma.user.count({ where: { email } }).then((count) => count > 0);
  }

  updateProfile(
    id: string,
    data: { name?: string; locale?: Locale; avatarKey?: string | null },
  ): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  /** Every profile photo still in use. */
  async avatarKeys(): Promise<Set<string>> {
    const rows = await this.prisma.user.findMany({
      where: { avatarKey: { not: null } },
      select: { avatarKey: true },
    });
    return new Set(rows.map((row) => row.avatarKey as string));
  }

  /** Who holds a username now, in any capitals (`key` is the lower-cased name), if anyone. */
  usernameOwner(key: string): Promise<{ id: string } | null> {
    return this.prisma.user.findUnique({ where: { usernameLower: key }, select: { id: true } });
  }

  /**
   * Stores the username (null removes it) with its lower-cased key. Null when someone else holds
   * it in any capitals: the unique index decides between two people saving it at once.
   */
  async setUsername(id: string, username: string | null): Promise<User | null> {
    try {
      return await this.prisma.user.update({ where: { id }, data: usernameColumns(username) });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  /** Replaces the user's pending email change with this one. */
  async replaceEmailChange(
    userId: string,
    newEmail: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.emailChangeToken.deleteMany({ where: { userId, usedAt: null } }),
      this.prisma.emailChangeToken.create({ data: { userId, newEmail, tokenHash, expiresAt } }),
    ]);
  }

  /**
   * Spends the token and moves the account to its new email, ending every session (the person
   * signs in again with the new address). Refused when the token is unknown, used or expired, or
   * when the address got an account meanwhile.
   */
  confirmEmailChange(tokenHash: string): Promise<EmailChangeResult> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const token = await tx.emailChangeToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!token || token.usedAt || token.expiresAt <= now || !token.user.isActive) {
        return { status: 'invalid' as const };
      }
      if ((await tx.user.count({ where: { email: token.newEmail } })) > 0) {
        return { status: 'taken' as const };
      }
      await tx.emailChangeToken.update({ where: { id: token.id }, data: { usedAt: now } });
      const user = await tx.user.update({
        where: { id: token.userId },
        data: { email: token.newEmail },
      });
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      });
      return { status: 'done' as const, user, oldEmail: token.user.email };
    });
  }

  /** Projects owned by the account: they keep a client account from deleting itself. */
  ownedProjects(id: string): Promise<number> {
    return this.prisma.clientProject.count({ where: { clientId: id } });
  }

  /** Sessions, tokens, proposals and support requests go with it (cascade). */
  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }

  /**
   * What the platform keeps about the person (GDPR access): their own records, and of their
   * client account the projects, proposals and support requests they can see.
   */
  async export(userId: string, accountId: string | null) {
    const p = this.prisma;
    const [
      user,
      sessions,
      passkeys,
      projects,
      proposals,
      tickets,
      comments,
      siteEdits,
      leads,
      meetingRooms,
      bookingPages,
      cloudTeams,
      cloudTokens,
      cloudEvents,
    ] = await Promise.all([
      p.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          username: true,
          avatarKey: true,
          role: true,
          locale: true,
          weeklyDigest: true,
          monthlyReport: true,
          registeredAt: true,
          createdAt: true,
          updatedAt: true,
          totpEnabledAt: true,
          memberOf: { select: { name: true, email: true } },
        },
      }),
      p.session.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, expiresAt: true, revokedAt: true, userAgent: true, ip: true },
      }),
      // Never the key or the credential's ID (decision 104).
      p.passkey.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          name: true,
          deviceType: true,
          backedUp: true,
          createdAt: true,
          lastUsedAt: true,
        },
      }),
      accountId
        ? p.clientProject.findMany({
            where: { clientId: accountId },
            orderBy: { createdAt: 'asc' },
            select: {
              name: true,
              description: true,
              phase: true,
              progress: true,
              startDate: true,
              dueDate: true,
              stagingUrl: true,
              productionUrl: true,
              domainName: true,
              createdAt: true,
            },
          })
        : [],
      accountId
        ? p.proposal.findMany({
            where: { clientId: accountId },
            orderBy: { number: 'asc' },
            select: {
              number: true,
              title: true,
              summary: true,
              currency: true,
              status: true,
              validUntil: true,
              sentAt: true,
              respondedAt: true,
              acceptedName: true,
              declineReason: true,
              items: { select: { description: true, quantity: true, unitPrice: true } },
            },
          })
        : [],
      accountId
        ? p.supportTicket.findMany({
            where: { clientId: accountId },
            orderBy: { number: 'asc' },
            select: {
              number: true,
              title: true,
              type: true,
              status: true,
              createdAt: true,
              resolvedAt: true,
              messages: {
                orderBy: { createdAt: 'asc' },
                select: { body: true, createdAt: true, author: { select: { name: true } } },
              },
            },
          })
        : [],
      p.projectUpdateComment.findMany({
        where: { authorId: userId },
        orderBy: { createdAt: 'asc' },
        select: { body: true, createdAt: true, update: { select: { title: true } } },
      }),
      p.managedSiteRevision.count({ where: { authorId: userId } }),
      p.lead.findMany({
        where: { clientId: userId },
        orderBy: { createdAt: 'asc' },
        select: { name: true, email: true, company: true, message: true, createdAt: true },
      }),
      p.meetingRoom.findMany({
        where: { ownerId: userId },
        orderBy: { createdAt: 'asc' },
        select: { code: true, title: true, lobby: true, createdAt: true, lastUsedAt: true },
      }),
      p.bookingPage.findMany({
        where: { ownerId: userId },
        orderBy: { createdAt: 'asc' },
        select: {
          slug: true,
          title: true,
          description: true,
          durationMinutes: true,
          location: true,
          askPhone: true,
          timeZone: true,
          weekly: true,
          minNoticeHours: true,
          horizonDays: true,
          enabled: true,
          createdAt: true,
          appointments: {
            orderBy: { startsAt: 'asc' },
            select: {
              name: true,
              email: true,
              phone: true,
              note: true,
              startsAt: true,
              endsAt: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
      p.cloudMember.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          role: true,
          termsVersion: true,
          termsAcceptedAt: true,
          createdAt: true,
          team: { select: { slug: true, name: true, plan: true, createdAt: true } },
        },
      }),
      // Names and use, never the secret (only its hash is kept).
      p.cloudToken.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          name: true,
          prefix: true,
          expiresAt: true,
          lastUsedAt: true,
          lastUsedIp: true,
          createdAt: true,
        },
      }),
      p.cloudEvent.findMany({
        where: { actorId: userId },
        orderBy: { createdAt: 'asc' },
        select: { action: true, targetLabel: true, tokenName: true, ip: true, createdAt: true },
      }),
    ]);
    return {
      user,
      sessions,
      passkeys,
      projects,
      proposals,
      supportRequests: tickets,
      updateComments: comments,
      websiteEdits: siteEdits,
      contactRequests: leads,
      meetingRooms,
      bookingPages,
      cloud:
        cloudTeams.length + cloudTokens.length + cloudEvents.length > 0
          ? { teams: cloudTeams, tokens: cloudTokens, events: cloudEvents }
          : null,
    };
  }

  /** The caller's own account activity (`account.*`), newest first. */
  ownActivity(userId: string, take: number) {
    return this.prisma.activityLog.findMany({
      where: { actorId: userId, action: { startsWith: 'account.' } },
      orderBy: { createdAt: 'desc' },
      take,
      select: { action: true, createdAt: true, details: true },
    });
  }

  /**
   * How much of each part of the platform the person uses (decision 108, the account site's
   * "Your apps"): rows they own in each app, read only.
   */
  async appsUsage(userId: string, accountId: string) {
    const [projects, teams, rooms, pages] = await Promise.all([
      this.prisma.clientProject.count({ where: { clientId: accountId } }),
      this.prisma.cloudMember.count({ where: { userId } }),
      this.prisma.meetingRoom.count({ where: { ownerId: userId } }),
      this.prisma.bookingPage.count({ where: { ownerId: userId } }),
    ]);
    return { projects, teams, rooms, pages };
  }
}
