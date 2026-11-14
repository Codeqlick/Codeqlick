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

  list(projectId: string): Promise<Array<CloudForm & { _count: { submissions: number } }>> {
    return this.prisma.cloudForm.findMany({
      where: { projectId },
      include: { _count: { select: { submissions: true } } },
      orderBy: { createdAt: 'asc' },
    });
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

  async submissionsCount(formId: string): Promise<number> {
    return this.prisma.cloudFormSubmission.count({ where: { formId } });
  }

  /** Submissions of every form of a team's projects since `since` (the plan's monthly count). */
  teamSubmissionsSince(teamId: string, since: Date): Promise<number> {
    return this.prisma.cloudFormSubmission.count({
      where: { createdAt: { gte: since }, form: { project: { teamId } } },
    });
  }

  keep(formId: string, data: Array<[string, string]>, email: string | null, page: string | null) {
    return this.prisma.cloudFormSubmission.create({
      data: { formId, data, email, page },
    });
  }

  async submissions(
    formId: string,
    q: string | undefined,
    skip: number,
    take: number,
  ): Promise<[CloudFormSubmission[], number]> {
    if (!q) {
      return this.prisma.$transaction([
        this.prisma.cloudFormSubmission.findMany({
          where: { formId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take,
        }),
        this.prisma.cloudFormSubmission.count({ where: { formId } }),
      ]);
    }
    // A search looks in the email and in the fields (the JSON as text), any case.
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM cloud_form_submissions
      WHERE form_id = ${formId}::uuid AND (email ILIKE ${pattern} OR data::text ILIKE ${pattern})
      ORDER BY created_at DESC, id DESC`;
    const page = ids.slice(skip, skip + take).map((row) => row.id);
    const rows = await this.prisma.cloudFormSubmission.findMany({
      where: { id: { in: page } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return [rows, ids.length];
  }

  /** Every submission of a form, newest first, for the CSV (at most 10,000). */
  allSubmissions(formId: string): Promise<CloudFormSubmission[]> {
    return this.prisma.cloudFormSubmission.findMany({
      where: { formId },
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
