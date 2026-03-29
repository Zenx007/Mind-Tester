import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ReportModule } from '../report/report.module';
import { RunnerModule } from '../runner/runner.module';
import { ScoringModule } from '../scoring/scoring.module';
import { TestController } from './test.controller';
import { TestOrchestrator } from './test.orchestrator';
import { TestService } from './test.service';

@Module({
  imports: [AiModule, RunnerModule, ScoringModule, ReportModule],
  controllers: [TestController],
  providers: [TestService, TestOrchestrator],
})
export class TestModule {}
