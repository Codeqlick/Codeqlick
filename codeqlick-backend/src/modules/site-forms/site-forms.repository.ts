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

  async countSubmission(id: string, at: Date): Promise<void> {
    await this.prisma.siteForm.update({
      where: { id },
      data: { submissions: { increment: 1 }, lastSubmissionAt: at },
    });
  }
}
