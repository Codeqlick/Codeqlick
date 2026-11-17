import { Injectable } from '@nestjs/common';
import type { RealmName } from '../../common/realm.js';
import type { Locale, User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { deleteUserRecomputingRatings } from '../cruising/cruising.repository.js';
import { maskEmail } from './unsubscribe-token.js';

export type EmailChangeResult =
  { status: 'done'; user: User; oldEmail: string } | { status: 'invalid' } | { status: 'taken' };

/** Persistence for what people do with their own account: profile, email, export, deletion. */
@Injectable()
export class AccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Whether `email` has an account in `realm` (the other realm's accounts don't count). */
  emailTaken(realm: RealmName, email: string): Promise<boolean> {
    return this.prisma.user.count({ where: { realm, email } }).then((count) => count > 0);
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

  /** Who holds a username in `realm` now, if anyone. */
  usernameOwner(realm: RealmName, username: string): Promise<{ id: string } | null> {
    return this.prisma.user.findUnique({
      where: { realm_username: { realm, username } },
      select: { id: true },
    });
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
  confirmEmailChange(tokenHash: string, realm: RealmName): Promise<EmailChangeResult> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const token = await tx.emailChangeToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!token || token.usedAt || token.expiresAt <= now || !token.user.isActive) {
        return { status: 'invalid' as const };
      }
      // A link of the other realm's account host doesn't work here.
      if (token.user.realm !== realm) {
        return { status: 'invalid' as const };
      }
      if (
        (await tx.user.count({ where: { realm: token.user.realm, email: token.newEmail } })) > 0
      ) {
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
    await deleteUserRecomputingRatings(this.prisma, id);
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
      cruising,
      cruisingSpots,
      cruisingReviews,
      cruisingReportsMade,
      cruisingCheckIns,
      cruisingMessages,
      cruisingMedia,
      cruisingFavorites,
      cruisingAlerts,
      cruisingContacts,
      cruisingTimers,
      cruisingMeetups,
      cruisingMeetupsJoined,
      cruisingTrips,
      cruisingSafetyAlerts,
      cruisingAlbumGrants,
      cruisingRoomMessages,
      cruisingWinks,
      cruisingVisits,
      cruisingNotifications,
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
      p.cruisingProfile.findUnique({
        where: { userId },
        select: {
          birthYear: true,
          termsVersion: true,
          acceptedAt: true,
          emailAlerts: true,
          nickname: true,
          bio: true,
          country: true,
          lookingFor: true,
          showAge: true,
          verificationStatus: true,
          verifiedAt: true,
          favoriteAlerts: true,
          favoriteEmails: true,
          healthConsentAt: true,
          prepStatus: true,
          lastTestedMonth: true,
          healthVisible: true,
          reminderMonths: true,
          showVisits: true,
          suspendedUntil: true,
          suspensionReason: true,
          createdAt: true,
        },
      }),
      // The spots stay in the directory when the account is deleted; here they are the person's.
      p.cruisingSpot.findMany({
        where: { createdById: userId },
        orderBy: { createdAt: 'asc' },
        select: {
          slug: true,
          name: true,
          type: true,
          lat: true,
          lng: true,
          countryCode: true,
          city: true,
          description: true,
          bestTimes: true,
          status: true,
          rejectReason: true,
          createdAt: true,
        },
      }),
      p.cruisingReview.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          rating: true,
          text: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          spot: { select: { slug: true } },
        },
      }),
      p.cruisingReport.findMany({
        where: { reporterId: userId },
        orderBy: { createdAt: 'asc' },
        select: { targetType: true, reason: true, details: true, status: true, createdAt: true },
      }),
      // The spot and nothing else: a check-in never holds a position.
      p.cruisingCheckIn.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          anonymous: true,
          expiresAt: true,
          createdAt: true,
          spot: { select: { slug: true } },
        },
      }),
      p.cruisingMessage.findMany({
        where: { senderId: userId },
        orderBy: { createdAt: 'asc' },
        select: { text: true, createdAt: true },
      }),
      // The list of photos and videos (refs, kinds, statuses, dates); the files stay private.
      p.cruisingMedia.findMany({
        where: { ownerId: userId },
        orderBy: { createdAt: 'asc' },
        select: {
          ref: true,
          kind: true,
          album: true,
          status: true,
          durationSeconds: true,
          createdAt: true,
        },
      }),
      p.cruisingFavorite.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, spot: { select: { slug: true } } },
      }),
      // The alerts of the last two days: the spot and the channel, never who checked in.
      p.cruisingAlert.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { channel: true, createdAt: true, spot: { select: { slug: true } } },
      }),
      // Phase 5: the trusted contacts (their addresses masked: they are someone else's) and timers.
      p.cruisingTrustedContact.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { email: true, displayName: true, status: true, createdAt: true },
      }),
      p.cruisingTimer.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          endsAt: true,
          message: true,
          warnedAt: true,
          firedAt: true,
          endedAt: true,
          createdAt: true,
          spot: { select: { slug: true } },
        },
      }),
      // Phase 5: meetups planned and joined, trips, and the safety alerts posted.
      p.cruisingMeetup.findMany({
        where: { hostId: userId },
        orderBy: { createdAt: 'asc' },
        select: {
          title: true,
          description: true,
          startsAt: true,
          endsAt: true,
          capacity: true,
          status: true,
          createdAt: true,
          spot: { select: { slug: true } },
        },
      }),
      p.cruisingMeetupAttendee.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          anonymous: true,
          createdAt: true,
          meetup: { select: { title: true, startsAt: true, spot: { select: { slug: true } } } },
        },
      }),
      p.cruisingTrip.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          countryCode: true,
          city: true,
          startsOn: true,
          endsOn: true,
          listed: true,
          createdAt: true,
        },
      }),
      p.cruisingSafetyAlert.findMany({
        where: { posterId: userId },
        orderBy: { createdAt: 'asc' },
        select: {
          kind: true,
          note: true,
          expiresAt: true,
          createdAt: true,
          spot: { select: { slug: true } },
        },
      }),
      // Phase 6: who I shared my private album with, and what I wrote in city rooms (7 days).
      p.cruisingAlbumGrant.findMany({
        where: { ownerId: userId },
        orderBy: { createdAt: 'asc' },
        select: {
          createdAt: true,
          grantee: { select: { cruisingProfile: { select: { nickname: true } } } },
        },
      }),
      p.cruisingRoomMessage.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { countryCode: true, citySlug: true, text: true, createdAt: true },
      }),
      // Phase 6: the winks sent and the profiles visited (when, never whose: they are other
      // people), and the notification centre (ids only).
      p.cruisingWink.findMany({
        where: { senderId: userId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      p.cruisingProfileView.findMany({
        where: { viewerId: userId },
        orderBy: { seenAt: 'asc' },
        select: { day: true, seenAt: true },
      }),
      p.cruisingNotification.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { kind: true, data: true, readAt: true, createdAt: true },
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
    // Architecture 4.16: what the three 18+ apps share (never the verification photo).
    const blockSelect = {
      where: { blockerId: userId },
      orderBy: { createdAt: 'asc' as const },
      select: { blockedId: true, sourceApp: true, createdAt: true },
    };
    const [adultVerification, adultSuspensions, adultBlocks] = await Promise.all([
      p.adultVerification.findUnique({
        where: { userId },
        select: {
          status: true,
          sourceApp: true,
          sentAt: true,
          decidedAt: true,
          withdrawnAt: true,
          createdAt: true,
        },
      }),
      p.adultSuspension.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          category: true,
          sourceApp: true,
          reason: true,
          until: true,
          createdAt: true,
          liftedAt: true,
        },
      }),
      Promise.all([
        p.cruisingBlock.findMany(blockSelect),
        p.swipeBlock.findMany(blockSelect),
        p.videochatBlock.findMany(blockSelect),
      ]),
    ]);
    // A block is in the three tables: one row per person blocked, with the app it was made in.
    const blocks = new Map<string, { sourceApp: string | null; createdAt: Date }>();
    for (const row of adultBlocks.flat()) {
      const seen = blocks.get(row.blockedId);
      if (!seen || (!seen.sourceApp && row.sourceApp)) {
        blocks.set(row.blockedId, { sourceApp: row.sourceApp, createdAt: row.createdAt });
      }
    }
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
      cruising: cruising
        ? {
            profile: cruising,
            spotsProposed: cruisingSpots,
            reviews: cruisingReviews,
            reportsMade: cruisingReportsMade,
            checkIns: cruisingCheckIns,
            messagesSent: cruisingMessages,
            media: cruisingMedia,
            favorites: cruisingFavorites,
            alerts: cruisingAlerts,
            trustedContacts: cruisingContacts.map((contact) => ({
              ...contact,
              email: maskEmail(contact.email),
            })),
            timers: cruisingTimers,
            meetupsPlanned: cruisingMeetups,
            meetupsJoined: cruisingMeetupsJoined,
            trips: cruisingTrips,
            safetyAlerts: cruisingSafetyAlerts,
            albumSharedWith: cruisingAlbumGrants.map((grant) => ({
              nickname: grant.grantee.cruisingProfile?.nickname ?? null,
              createdAt: grant.createdAt,
            })),
            roomMessages: cruisingRoomMessages,
            winksSent: cruisingWinks,
            profilesVisited: cruisingVisits,
            notifications: cruisingNotifications,
          }
        : null,
      adult:
        adultVerification || adultSuspensions.length > 0 || blocks.size > 0
          ? {
              verification: adultVerification,
              suspensions: adultSuspensions,
              blocks: [...blocks.values()],
            }
          : null,
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
    const [projects, teams, rooms, pages, videochat, swipe, cruising] = await Promise.all([
      this.prisma.clientProject.count({ where: { clientId: accountId } }),
      this.prisma.cloudMember.count({ where: { userId } }),
      this.prisma.meetingRoom.count({ where: { ownerId: userId } }),
      this.prisma.bookingPage.count({ where: { ownerId: userId } }),
      this.prisma.videochatProfile.count({ where: { userId } }),
      this.prisma.swipeProfile.count({ where: { userId } }),
      this.prisma.cruisingProfile.count({ where: { userId } }),
    ]);
    return { projects, teams, rooms, pages, videochat, swipe, cruising };
  }
}
