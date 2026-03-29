import { Injectable, Logger } from '@nestjs/common';
import { AIValidationResult } from '../../common/interfaces/ai-validation-result.interface';
import { TestExecutionResult } from '../../common/interfaces/test-execution-result.interface';
import { OpenAIRuntimeConfig, OpenAIService } from './openai.service';

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  constructor(private readonly openAIService: OpenAIService) {}

  async validateExecution(
    result: TestExecutionResult,
    sourceCode?: string,
    runtimeConfig?: OpenAIRuntimeConfig,
  ): Promise<AIValidationResult> {
    if (!this.openAIService.isEnabled(runtimeConfig)) {
      return this.fallbackValidation(result);
    }

    try {
      const response = await this.openAIService.promptForJson<AIValidationResult>({
        systemPrompt: this.buildSystemPrompt(),
        userPrompt: this.buildUserPrompt(result, sourceCode),
        temperature: 0,
        maxTokens: 900,
        runtimeConfig,
      });

      return this.normalizeValidation(response, result);
    } catch (error) {
      this.logger.error(`AI validation failed for "${result.name}". Using fallback decision. ${String(error)}`);
      return this.fallbackValidation(result);
    }
  }

  private buildSystemPrompt(): string {
    return [
      'Você é um analista rigoroso de validação de testes de software.',
      'Avalie se as evidências de execução indicam que o comportamento esperado foi atingido.',
      'Responda apenas JSON com os campos: isBehaviorCorrect (boolean), analysis (string), confidence (number 0..1).',
      'Se logs ou erros contradisserem o esperado, retorne false.',
      'A análise deve ser técnica, objetiva e em português.',
    ].join(' ');
  }

  private buildUserPrompt(result: TestExecutionResult, sourceCode?: string): string {
    const sourceCodeSnippet = this.clipSourceCode(sourceCode);

    return JSON.stringify(
      {
        name: result.name,
        expected: result.expected,
        runtimePassed: result.passed,
        durationMs: result.durationMs,
        logs: result.logs,
        error: result.error ?? null,
        sourceCodeSnippet,
      },
      null,
      2,
    );
  }

  private normalizeValidation(
    candidate: Partial<AIValidationResult>,
    result: TestExecutionResult,
  ): AIValidationResult {
    const analysis =
      typeof candidate.analysis === 'string' && candidate.analysis.trim().length > 0
        ? candidate.analysis.trim()
        : result.passed
          ? 'A execução foi concluída e as evidências indicam comportamento esperado.'
          : 'As evidências de execução indicam divergência em relação ao comportamento esperado.';

    const isBehaviorCorrect =
      typeof candidate.isBehaviorCorrect === 'boolean' ? candidate.isBehaviorCorrect : result.passed;

    const confidenceValue =
      typeof candidate.confidence === 'number' && Number.isFinite(candidate.confidence)
        ? Math.max(0, Math.min(1, candidate.confidence))
        : 0.5;

    return {
      isBehaviorCorrect,
      analysis,
      confidence: confidenceValue,
    };
  }

  private fallbackValidation(result: TestExecutionResult): AIValidationResult {
    if (result.passed) {
      return {
        isBehaviorCorrect: true,
        analysis: 'Validação em fallback: a execução passou sem erros e os logs estão consistentes.',
        confidence: 0.55,
      };
    }

    return {
      isBehaviorCorrect: false,
      analysis: `Validação em fallback: a execução falhou${result.error ? ` com o erro: ${result.error}` : '.'}`,
      confidence: 0.75,
    };
  }

  private clipSourceCode(sourceCode?: string): string | null {
    if (!sourceCode || sourceCode.trim().length === 0) {
      return null;
    }

    const normalized = sourceCode.trim();
    const maxChars = 4000;
    return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}\n... [código truncado]` : normalized;
  }
}
