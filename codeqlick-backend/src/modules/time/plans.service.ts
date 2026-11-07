import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { accountOf, type AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { MaintenancePlan } from '../../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { renderEmail } from '../mail/email-layout.js';
import { MailService } from '../mail/mail.service.js';
import { TimeRepository } from './time.repository.js';
import type { PlanInput } from './time.schemas.js';

/** `yyyy-mm` shifted by `delta` months. */
function shiftMonth(month: string, delta: number): string {
  const [year, number] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, number - 1 + delta, 15)).toISOString().slice(0, 7);
}

const monthStart = (month: string) => new Date(`${month}-01T00:00:00Z`);

/** The current month in Madrid. */
export function madridMonthOf(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now).slice(0, 7);
}

export interface PlanView {
  active: boolean;
  name: string;
  monthlyMinutes: number;
  alertPercent: number;
  /** This month (Madrid). */
  month: string;
  usedMinutes: number;
  /** 0 when the allowance is used up (over it, `usedMinutes` says by how much). */
  remainingMinutes: number;
  /** Used ÷ allowance, as a whole percent (can pass 100). */
  percent: number;
  /** The last 4 months, newest first, this one included. */
  months: { month: string; minutes: number }[];
}

export interface PlanSummary {
  project: { id: string; name: string };
  client: { id: string; name: string };
  name: string;
  monthlyMinutes: number;
  usedMinutes: number;
  percent: number;
}

/** "7.5 h" */
const hours = (minutes: number) => `${Math.round((minutes / 60) * 10) / 10} h`;

const percentOf = (used: number, allowance: number) =>
  allowance > 0 ? Math.round((used / allowance) * 100) : 0;

/**
 * Maintenance plans: a monthly hour allowance per project, drawn down by its time entries. Shown
 * to the client in the portal; the team is warned at the plan's threshold and at 100 %, once a
 * month each. Nothing is billed here.
 */
@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    private readonly repository: TimeRepository,
    private readonly activity: ActivityService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  async get(projectId: string, now = new Date()): Promise<PlanView | null> {
    await this.findProject(projectId);
    const plan = await this.repository.findPlan(projectId);
    return plan ? this.view(plan, now) : null;
  }

  /** The client's view; 404 unless it's their project and the plan is active. */
  async getForClient(caller: AuthUser, projectId: string): Promise<PlanView> {
    const project = await this.repository.findProject(projectId);
    if (!project || (caller.role !== 'ADMIN' && project.clientId !== accountOf(caller))) {
      throw new NotFoundException('Project not found');
    }
    const plan = await this.repository.findPlan(projectId);
    if (!plan?.active) throw new NotFoundException('No maintenance plan');
    return this.view(plan, new Date());
  }

  async save(actor: AuthUser, projectId: string, input: PlanInput): Promise<PlanView> {
    const project = await this.findProject(projectId);
    const plan = await this.repository.savePlan(projectId, input);
    await this.activity.record(actor, {
      action: 'project.plan_updated',
      targetId: projectId,
      targetLabel: project.name,
      details: { active: input.active, minutes: input.monthlyMinutes },
    });
    return this.view(plan, new Date());
  }

  /** Every active plan's use in `month` (default: this one), most used first. */
  async overview(
    month?: string,
    now = new Date(),
  ): Promise<{ month: string; plans: PlanSummary[] }> {
    const current = month ?? madridMonthOf(now);
    const plans = await this.repository.activePlans();
    const used = await this.repository.minutesBetween(
      plans.map((plan) => plan.projectId),
      monthStart(current),
      monthStart(shiftMonth(current, 1)),
    );
    return {
      month: current,
      plans: plans
        .map((plan) => {
          const minutes = used.get(plan.projectId) ?? 0;
          return {
            project: { id: plan.project.id, name: plan.project.name },
            client: plan.project.client,
            name: plan.name,
            monthlyMinutes: plan.monthlyMinutes,
            usedMinutes: minutes,
            percent: percentOf(minutes, plan.monthlyMinutes),
          };
        })
        .toSorted((a, b) => b.percent - a.percent),
    };
  }

  /**
   * After time is logged: warns the team when this month's use crosses the plan's threshold or the
   * whole allowance (once a month per level). Never throws.
   */
  async checkAlert(projectId: string, now = new Date()): Promise<void> {
    try {
      const plan = await this.repository.findPlan(projectId);
      if (!plan?.active) return;
      const view = await this.view(plan, now);
      const level =
        view.percent >= 100 ? 100 : view.percent >= plan.alertPercent ? plan.alertPercent : 0;
      const already = plan.alertedMonth === view.month ? plan.alertedLevel : 0;
      if (level === 0 || level <= already) return;
      const project = await this.repository.findProject(projectId);
      const text =
        level >= 100
          ? `${project?.name} has used its whole ${plan.name} allowance this month: ${hours(view.usedMinutes)} of ${hours(plan.monthlyMinutes)}.`
          : `${project?.name} has used ${view.percent} % of its ${plan.name} allowance this month: ${hours(view.usedMinutes)} of ${hours(plan.monthlyMinutes)}.`;
      await this.repository.updatePlan(plan.id, { alertedMonth: view.month, alertedLevel: level });
      await this.mail.send({
        to: this.config.leadsNotifyTo,
        subject: `[codeqlick] ${project?.name}: ${level >= 100 ? 'hours used up' : `${view.percent} % of the monthly hours`}`,
        ...renderEmail(
          {
            locale: 'en',
            preheader: text,
            title: level >= 100 ? 'Monthly hours used up' : 'Monthly hours running low',
            intro: [text, 'Worth telling the client, or agreeing extra hours, before going on.'],
            button: {
              label: 'Open the project',
              url: `${this.config.siteUrl}/es/admin/projects/${projectId}#plan`,
            },
            signoff: [],
          },
          this.config.siteUrl,
        ),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Plan alert for ${projectId} failed: ${reason}`);
    }
  }

  private async view(plan: MaintenancePlan, now: Date): Promise<PlanView> {
    const month = madridMonthOf(now);
    const months = [0, 1, 2, 3].map((back) => shiftMonth(month, -back));
    const entries = await this.repository.entriesSince(plan.projectId, monthStart(months[3]!));
    const totals = new Map<string, number>();
    for (const entry of entries) {
      const key = entry.date.toISOString().slice(0, 7);
      totals.set(key, (totals.get(key) ?? 0) + entry.minutes);
    }
    const used = totals.get(month) ?? 0;
    return {
      active: plan.active,
      name: plan.name,
      monthlyMinutes: plan.monthlyMinutes,
      alertPercent: plan.alertPercent,
      month,
      usedMinutes: used,
      remainingMinutes: Math.max(0, plan.monthlyMinutes - used),
      percent: percentOf(used, plan.monthlyMinutes),
      months: months.map((key) => ({ month: key, minutes: totals.get(key) ?? 0 })),
    };
  }

  private async findProject(id: string) {
    const project = await this.repository.findProject(id);
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
}
