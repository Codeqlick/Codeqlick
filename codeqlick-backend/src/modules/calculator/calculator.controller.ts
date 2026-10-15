import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { calculatorConfigSchema, type CalculatorConfig } from './calculator.schemas.js';
import { CalculatorService } from './calculator.service.js';

@ApiTags('calculator')
@Controller()
export class CalculatorController {
  constructor(private readonly calculator: CalculatorService) {}

  /** The prices the website's calculator uses; 404 while it is not published. */
  @Public()
  @Get('calculator')
  getPublic(): Promise<CalculatorConfig> {
    return this.calculator.getPublic();
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('admin/calculator')
  get(): Promise<CalculatorConfig> {
    return this.calculator.get();
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Put('admin/calculator')
  save(
    @CurrentUser() user: AuthUser,
    @Body({ schema: calculatorConfigSchema }) body: CalculatorConfig,
  ): Promise<CalculatorConfig> {
    return this.calculator.save(user, body);
  }
}
