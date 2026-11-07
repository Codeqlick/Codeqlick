import { Injectable } from '@nestjs/common';
import type { SiteForm } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type FormRow = SiteForm & {
  project: { id: string; name: string; productionUrl: string | null; stagingUrl: string | null };
};

const include = {
  project: { select: { id: true, name: true, productionUrl: true, stagingUrl: true } },
} as const;

@Injectable()
export class SiteFormsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProject(id: string) {
    return this.prisma.clientProject.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
  }

  findByProject(projectId: string): Promise<FormRow | null> {
    return this.prisma.siteForm.findUnique({ where: { projectId }, include });
  }

  findByKey(key: string): Promise<FormRow | null> {
    return this.prisma.siteForm.findUnique({ where: { key }, include });
  }

  upsert(
    projectId: string,
    data: { enabled: boolean; recipients: string[] },
    newKey: string,
  ): Promise<FormRow> {
    return this.prisma.siteForm.upsert({
      where: { projectId },
      create: { projectId, key: newKey, ...data },
      update: data,
      include,
    });
  }

  setKey(projectId: string, key: string): Promise<FormRow> {
    return this.prisma.siteForm.update({ where: { projectId }, data: { key }, include });
  }

  /** One more message: the total and that day's (Madrid) count. */
  async countSubmission(id: string, at: Date): Promise<void> {
    const day = new Date(
      `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(at)}T00:00:00Z`,
    );
    await this.prisma.$transaction([
      this.prisma.siteForm.update({
        where: { id },
        data: { submissions: { increment: 1 }, lastSubmissionAt: at },
      }),
      this.prisma.siteFormDay.upsert({
        where: { formId_day: { formId: id, day } },
        create: { formId: id, day, count: 1 },
        update: { count: { increment: 1 } },
      }),
    ]);
  }

  /** Messages per day (`yyyy-mm-dd`) of a project's form since `since`. */
  async messagesByDay(projectId: string, since: Date): Promise<Map<string, number>> {
    const rows = await this.prisma.siteFormDay.findMany({
      where: { form: { projectId }, day: { gte: since } },
      select: { day: true, count: true },
    });
    return new Map(rows.map((row) => [row.day.toISOString().slice(0, 10), row.count]));
  }
}
