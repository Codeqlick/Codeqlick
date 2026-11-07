import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user.js';
import { ActivityService } from '../activity/activity.service.js';
import { CalculatorRepository } from './calculator.repository.js';
import {
  calculatorConfigSchema,
  DEFAULT_CALCULATOR,
  type CalculatorConfig,
} from './calculator.schemas.js';

/** The cost calculator's prices: edited in the admin panel, read by the public calculator. */
@Injectable()
export class CalculatorService {
  constructor(
    private readonly repository: CalculatorRepository,
    private readonly activity: ActivityService,
  ) {}

  /** The saved prices, or the empty defaults (a stored value that no longer fits is ignored). */
  async get(): Promise<CalculatorConfig> {
    const parsed = calculatorConfigSchema.safeParse(await this.repository.find());
    return parsed.success ? parsed.data : DEFAULT_CALCULATOR;
  }

  /** For the website: 404 until the team publishes it. */
  async getPublic(): Promise<CalculatorConfig> {
    const config = await this.get();
    if (!config.enabled) throw new NotFoundException('The calculator is not published');
    return config;
  }

  async save(actor: AuthUser, config: CalculatorConfig): Promise<CalculatorConfig> {
    await this.repository.save(config);
    await this.activity.record(actor, {
      action: 'settings.calculator_updated',
      targetLabel: 'Calculator',
      details: { enabled: config.enabled },
    });
    return config;
  }
}
