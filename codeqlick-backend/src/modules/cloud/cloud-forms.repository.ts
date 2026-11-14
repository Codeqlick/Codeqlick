import { Injectable } from '@nestjs/common';
import type { CloudForm, CloudFormSubmission, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type FormWithProject = CloudForm & {
  project: {
    id: string;
    slug: string;
    name: string;
    teamId: string;
    deletedAt: Date | null;
    suspendedAt: Date | null;
    team: { slug: string; name: string; plan: 'FREE' | 'PRO' };
    domains: Array<{ name: string; state: string }>;
  };
};

const withProject = {
  project: {
    select: {
      id: true,
      slug: true,
      name: true,
      teamId: true,
      deletedAt: true,
      suspendedAt: true,
      team: { select: { slug: true, name: true, plan: true } },
      domains: { select: { name: true, state: true } },
    },
  },
} as const;

/** Cloud forms and their submissions (architecture 4.13, Forms). */
@Injectable()
export class CloudFormsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The project's forms, each with how many submissions it keeps: inbox and spam. */
  async list(projectId: string): Promise<Array<CloudForm & { submissions: number; spam: number }>> {
    const forms = await this.prisma.cloudForm.findMany({
      where: { projectId },
      include: { _count: { select: { submissions: { where: { spam: false } } } } },
      orderBy: { createdAt: 'asc' },
    });
    const spam = await this.prisma.cloudFormSubmission.groupBy({
      by: ['formId'],
      where: { spam: true, formId: { in: forms.map((form) => form.id) } },
      _count: { _all: true },
    });
    const spamOf = new Map(spam.map((row) => [row.formId, row._count._all]));
    return forms.map(({ _count, ...form }) => ({
      ...form,
      submissions: _count.submissions,
      spam: spamOf.get(form.id) ?? 0,
    }));
  }

  count(projectId: string): Promise<number> {
    return this.prisma.cloudForm.count({ where: { projectId } });
  }

  find(projectId: string, id: string): Promise<CloudForm | null> {
    return this.prisma.cloudForm.findFirst({ where: { id, projectId } });
  }

  findByKey(key: string): Promise<FormWithProject | null> {
    return this.prisma.cloudForm.findUnique({ where: { key }, include: withProject });
  }

  create(data: Prisma.CloudFormUncheckedCreateInput): Promise<CloudForm> {
    return this.prisma.cloudForm.create({ data });
  }

  update(id: string, data: Prisma.CloudFormUncheckedUpdateInput): Promise<CloudForm> {
    return this.prisma.cloudForm.update({ where: { id }, data });
  }

  /**
   * Deletes a form and takes it out of the notification channels that listed it (decision 63).
   * A channel left with no forms stops getting submissions rather than getting every form's
   * (an empty list means all of them).
   */
  async remove(id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        UPDATE cloud_notify_channels
        SET form_ids = array_remove(form_ids, ${id}::uuid),
            form_submitted = form_submitted AND cardinality(array_remove(form_ids, ${id}::uuid)) > 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE ${id}::uuid = ANY(form_ids)`,
      this.prisma.cloudForm.delete({ where: { id } }),
    ]);
  }

  /** The submissions in the inbox (not spam). */
  async submissionsCount(formId: string): Promise<number> {
    return this.prisma.cloudFormSubmission.count({ where: { formId, spam: false } });
  }

  /** The spam a form keeps. */
  spamCount(formId: string): Promise<number> {
    return this.prisma.cloudFormSubmission.count({ where: { formId, spam: true } });
  }

  /** How many times a form got the same content since `since` (spam or not). */
  countSameContentSince(formId: string, hash: string, since: Date): Promise<number> {
    return this.prisma.cloudFormSubmission.count({
      where: { formId, contentHash: hash, createdAt: { gte: since } },
    });
  }

  /** Submissions of every form of a team's projects since `since` (the plan's monthly count). */
  teamSubmissionsSince(teamId: string, since: Date): Promise<number> {
    return this.prisma.cloudFormSubmission.count({
      where: { createdAt: { gte: since }, spam: false, form: { project: { teamId } } },
    });
  }

  keep(
    formId: string,
    data: Array<[string, string]>,
    email: string | null,
    page: string | null,
    contentHash: string,
    spamReason: string | null = null,
  ) {
    return this.prisma.cloudFormSubmission.create({
      data: { formId, data, email, page, contentHash, spam: spamReason !== null, spamReason },
    });
  }

  /** A submission of a form (null when it isn't the form's). */
  findSubmission(formId: string, id: string): Promise<CloudFormSubmission | null> {
    return this.prisma.cloudFormSubmission.findFirst({ where: { id, formId } });
  }

  /** A form with its project, for delivering a submission. */
  findWithProject(id: string): Promise<FormWithProject | null> {
    return this.prisma.cloudForm.findUnique({ where: { id }, include: withProject });
  }

  /** Moves a submission to or from the spam view (null when it doesn't exist). */
  async setSpam(
    formId: string,
    id: string,
    spam: boolean,
    reason: string | null,
  ): Promise<CloudFormSubmission | null> {
    const { count } = await this.prisma.cloudFormSubmission.updateMany({
      // Only from the other state: two clicks at once change (and deliver) it once.
      where: { id, formId, spam: !spam },
      data: { spam, spamReason: reason },
    });
    if (count === 0) return null;
    return this.prisma.cloudFormSubmission.findUnique({ where: { id } });
  }

  async submissions(
    formId: string,
    q: string | undefined,
    spam: boolean,
    skip: number,
    take: number,
  ): Promise<[CloudFormSubmission[], number]> {
    if (!q) {
      return this.prisma.$transaction([
        this.prisma.cloudFormSubmission.findMany({
          where: { formId, spam },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take,
        }),
        this.prisma.cloudFormSubmission.count({ where: { formId, spam } }),
      ]);
    }
    // A search looks in the email and in the fields (the JSON as text), any case.
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM cloud_form_submissions
      WHERE form_id = ${formId}::uuid AND spam = ${spam}
        AND (email ILIKE ${pattern} OR data::text ILIKE ${pattern})
      ORDER BY created_at DESC, id DESC`;
    const page = ids.slice(skip, skip + take).map((row) => row.id);
    const rows = await this.prisma.cloudFormSubmission.findMany({
      where: { id: { in: page } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return [rows, ids.length];
  }

  /** Every inbox submission of a form (not spam), newest first, for the CSV (at most 10,000). */
  allSubmissions(formId: string): Promise<CloudFormSubmission[]> {
    return this.prisma.cloudFormSubmission.findMany({
      where: { formId, spam: false },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });
  }

  async deleteSubmission(formId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.cloudFormSubmission.deleteMany({ where: { id, formId } });
    return count > 0;
  }

  async deleteSubmissionsBefore(date: Date): Promise<number> {
    const { count } = await this.prisma.cloudFormSubmission.deleteMany({
      where: { createdAt: { lt: date } },
    });
    return count;
  }

  /** Deletes the spam received before `date`. */
  async deleteSpamBefore(date: Date): Promise<number> {
    const { count } = await this.prisma.cloudFormSubmission.deleteMany({
      where: { spam: true, createdAt: { lt: date } },
    });
    return count;
  }

  /** The recipients still in the form's team, with what their email needs. */
  recipients(teamId: string, userIds: string[]) {
    return this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        isActive: true,
        cloudMemberships: { some: { teamId } },
      },
      select: { id: true, email: true, name: true, locale: true },
    });
  }

  /** Which of these people are members of the team. */
  async membersAmong(teamId: string, userIds: string[]): Promise<string[]> {
    const rows = await this.prisma.cloudMember.findMany({
      where: { teamId, userId: { in: userIds } },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  /** Marks the month a form's team was told it ran out (false when it already was). */
  async claimOverLimit(formId: string, month: string): Promise<boolean> {
    const { count } = await this.prisma.cloudForm.updateMany({
      where: { id: formId, OR: [{ overLimitMonth: null }, { overLimitMonth: { not: month } }] },
      data: { overLimitMonth: month },
    });
    return count > 0;
  }
}
