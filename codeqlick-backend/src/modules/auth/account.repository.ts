import { Injectable } from '@nestjs/common';
import type { Locale, User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

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
    data: { name?: string; locale?: Locale; username?: string | null; avatarKey?: string | null },
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

  /** Who holds a username now, if anyone. */
  usernameOwner(username: string): Promise<{ id: string } | null> {
    return this.prisma.user.findUnique({ where: { username }, select: { id: true } });
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

  /** Sessions, tokens, proposals, support requests and video chat data go with it (cascade). */
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
      projects,
      proposals,
      tickets,
      comments,
      siteEdits,
      leads,
      videochat,
      likesGiven,
      blocksMade,
      reportsMade,
      sanctions,
      appeals,
      meetingRooms,
      bookingPages,
      swipe,
      swipePhotos,
      swipeLikesGiven,
      swipeMessages,
      swipeReportsMade,
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
      p.videochatProfile.findUnique({
        where: { userId },
        select: {
          nickname: true,
          gender: true,
          seeking: true,
          country: true,
          language: true,
          interests: true,
          sameCountryOnly: true,
          sameLanguageOnly: true,
          adultConfirmedAt: true,
          termsVersion: true,
          termsAcceptedAt: true,
          suspendedUntil: true,
          suspensionReason: true,
          createdAt: true,
        },
      }),
      p.videochatLike.count({ where: { fromId: userId } }),
      p.videochatBlock.count({ where: { blockerId: userId } }),
      p.videochatReport.findMany({
        where: { reporterId: userId },
        orderBy: { createdAt: 'asc' },
        select: { reason: true, details: true, status: true, createdAt: true },
      }),
      p.videochatSanction.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { kind: true, reason: true, until: true, createdAt: true },
      }),
      p.videochatAppeal.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { message: true, status: true, response: true, createdAt: true },
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
      p.swipeProfile.findUnique({
        where: { userId },
        select: {
          nickname: true,
          gender: true,
          seeking: true,
          interests: true,
          bio: true,
          birthYear: true,
          country: true,
          ageMin: true,
          ageMax: true,
          sameCountry: true,
          emailAlerts: true,
          blurPhotos: true,
          adultConfirmedAt: true,
          termsVersion: true,
          termsAcceptedAt: true,
          verificationStatus: true,
          verificationSentAt: true,
          verifiedAt: true,
          suspendedUntil: true,
          suspensionReason: true,
          createdAt: true,
        },
      }),
      p.swipePhoto.findMany({
        where: { ownerId: userId },
        orderBy: { createdAt: 'asc' },
        select: { ref: true, status: true, rejectReason: true, likes: true, createdAt: true },
      }),
      p.swipeVote.count({ where: { voterId: userId, like: true } }),
      p.swipeMessage.findMany({
        where: { senderId: userId },
        orderBy: { createdAt: 'asc' },
        select: { text: true, createdAt: true },
      }),
      p.swipeReport.findMany({
        where: { reporterId: userId },
        orderBy: { createdAt: 'asc' },
        select: { reason: true, details: true, status: true, createdAt: true },
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
      projects,
      proposals,
      supportRequests: tickets,
      updateComments: comments,
      websiteEdits: siteEdits,
      contactRequests: leads,
      videochat: videochat
        ? {
            profile: videochat,
            likesGiven,
            blocksMade,
            reportsMade,
            sanctions,
            appeals,
          }
        : null,
      meetingRooms,
      bookingPages,
      swipe: swipe
        ? {
            profile: swipe,
            photos: swipePhotos,
            likesGiven: swipeLikesGiven,
            messagesSent: swipeMessages,
            reportsMade: swipeReportsMade,
          }
        : null,
      cloud:
        cloudTeams.length + cloudTokens.length + cloudEvents.length > 0
          ? { teams: cloudTeams, tokens: cloudTokens, events: cloudEvents }
          : null,
    };
  }
}
