import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const KEY = 'calculator';

@Injectable()
export class CalculatorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(): Promise<unknown> {
    return (await this.prisma.setting.findUnique({ where: { key: KEY } }))?.value ?? null;
  }

  async save(value: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value },
      update: { value },
    });
  }
}
