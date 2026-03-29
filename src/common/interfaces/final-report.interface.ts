export interface FinalReportResult {
  name: string;
  passed: boolean;
  logs: string;
  aiAnalysis: string;
  screenshotPath?: string;
  error?: string;
}

export interface FinalGeneratedTest {
  name: string;
  expected: string;
  code: string;
}

export interface FinalReport {
  score: number;
  generatedTests: FinalGeneratedTest[];
  results: FinalReportResult[];
  summary: string;
}
