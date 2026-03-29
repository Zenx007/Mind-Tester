import { Injectable } from '@nestjs/common';
import { FinalReport } from '../../common/interfaces/final-report.interface';
import { GeneratedTestCase } from '../../common/interfaces/generated-test-case.interface';
import { ValidatedTestResult } from '../../common/interfaces/validated-test-result.interface';

@Injectable()
export class ReportService {
  buildReport(input: {
    score: number;
    results: ValidatedTestResult[];
    generatedTests: GeneratedTestCase[];
  }): FinalReport {
    const totalTests = input.results.length;
    const passedTests = input.results.filter((result) => result.finalPassed).length;
    const failedTests = totalTests - passedTests;

    return {
      score: input.score,
      generatedTests: input.generatedTests.map((test) => ({
        name: test.name,
        expected: test.expected,
        code: test.code,
      })),
      results: input.results.map((result) => ({
        name: result.name,
        passed: result.finalPassed,
        logs: this.mergeLogs(result),
        aiAnalysis: result.aiValidation.analysis,
        screenshotPath: result.screenshotPath,
        error: result.error,
      })),
      summary: `Total de testes: ${totalTests}. Aprovados: ${passedTests}. Falhas: ${failedTests}. Pontuação final: ${input.score}%.`,
    };
  }

  private mergeLogs(result: ValidatedTestResult): string {
    const chunks = [`durationMs=${result.durationMs}`, result.logs.trim()];

    if (result.error) {
      chunks.push(`error=${result.error}`);
    }

    if (result.screenshotPath) {
      chunks.push(`captura=${result.screenshotPath}`);
    }

    return chunks.filter(Boolean).join('\n');
  }
}
