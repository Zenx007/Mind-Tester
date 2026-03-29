import { Injectable, Logger } from '@nestjs/common';
import { FinalReport } from '../../common/interfaces/final-report.interface';
import { ValidatedTestResult } from '../../common/interfaces/validated-test-result.interface';
import { CodeContextService } from '../ai/code-context.service';
import { TestGeneratorService } from '../ai/test-generator.service';
import { ValidationService } from '../ai/validation.service';
import { ReportService } from '../report/report.service';
import { PlaywrightRunner } from '../runner/playwright.runner';
import { ScoreService } from '../scoring/score.service';
import { RunTestDto } from './dtos/run-test.dto';

@Injectable()
export class TestOrchestrator {
  private readonly logger = new Logger(TestOrchestrator.name);

  constructor(
    private readonly codeContextService: CodeContextService,
    private readonly testGeneratorService: TestGeneratorService,
    private readonly playwrightRunner: PlaywrightRunner,
    private readonly validationService: ValidationService,
    private readonly scoreService: ScoreService,
    private readonly reportService: ReportService,
  ) {}

  async execute(input: RunTestDto): Promise<FinalReport> {
    const startTime = Date.now();
    const runtimeAIConfig = {
      apiKey: input.aiConfig?.apiKey?.trim(),
      model: input.aiConfig?.model?.trim(),
      baseUrl: input.aiConfig?.baseUrl?.trim(),
    };
    const sourceCode = await this.codeContextService.resolveSourceCode({
      codePath: input.codePath,
      sourceCode: input.sourceCode,
    });
    const enrichedInput: RunTestDto = {
      ...input,
      sourceCode,
    };

    this.logger.log('Step 1/5 - Generating tests with AI');
    const generatedSuite = await this.testGeneratorService.generateTestSuite(enrichedInput, runtimeAIConfig);

    this.logger.log(`Generated ${generatedSuite.tests.length} test(s)`);
    this.logger.log('Step 2/5 - Executing generated tests with Playwright');
    const executionResults = await this.playwrightRunner.runGeneratedTests({
      tests: generatedSuite.tests,
      userStory: enrichedInput.userStory?.trim(),
      url: enrichedInput.url?.trim(),
      endpoint: enrichedInput.endpoint?.trim(),
      endpointMethod: enrichedInput.endpointMethod ?? 'GET',
      sourceCode,
    });

    this.logger.log('Step 3/5 - Validating execution evidence with AI');
    const validatedResults: ValidatedTestResult[] = [];

    for (const result of executionResults) {
      const aiValidation = await this.validationService.validateExecution(
        result,
        sourceCode,
        runtimeAIConfig,
      );
      validatedResults.push({
        ...result,
        aiValidation,
        finalPassed: aiValidation.isBehaviorCorrect,
      });
    }

    this.logger.log('Step 4/5 - Calculating final score');
    const approvedTests = validatedResults.filter((result) => result.finalPassed).length;
    const score = this.scoreService.calculateScore(validatedResults.length, approvedTests);

    this.logger.log('Step 5/5 - Building final report');
    const report = this.reportService.buildReport({
      score,
      results: validatedResults,
      generatedTests: generatedSuite.tests,
    });

    this.logger.log(`Pipeline completed in ${Date.now() - startTime}ms`);
    return report;
  }
}
