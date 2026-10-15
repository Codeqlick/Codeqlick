import { Module } from '@nestjs/common';
import { CalculatorController } from './calculator.controller.js';
import { CalculatorRepository } from './calculator.repository.js';
import { CalculatorService } from './calculator.service.js';

@Module({
  controllers: [CalculatorController],
  providers: [CalculatorService, CalculatorRepository],
})
export class CalculatorModule {}
