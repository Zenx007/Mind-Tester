export interface TestExecutionResult {
  name: string;
  passed: boolean;
  logs: string;
  expected: string;
  error?: string;
  screenshotPath?: string;
  durationMs: number;
}
