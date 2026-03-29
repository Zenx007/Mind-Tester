import { AIValidationResult } from './ai-validation-result.interface';
import { TestExecutionResult } from './test-execution-result.interface';

export interface ValidatedTestResult extends TestExecutionResult {
  aiValidation: AIValidationResult;
  finalPassed: boolean;
}
