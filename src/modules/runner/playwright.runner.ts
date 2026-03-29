import { Injectable, Logger } from '@nestjs/common';
import {
  APIRequestContext,
  Browser,
  BrowserContext,
  Page,
  chromium,
  expect,
  request as playwrightRequest,
} from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { GeneratedTestCase } from '../../common/interfaces/generated-test-case.interface';
import { TestExecutionResult } from '../../common/interfaces/test-execution-result.interface';

interface RunGeneratedTestsInput {
  tests: GeneratedTestCase[];
  userStory?: string;
  url?: string;
  endpoint?: string;
  endpointMethod?: string;
  sourceCode?: string;
}

interface ExecutionHarness {
  page: Page;
  request: APIRequestContext;
  expect: typeof expect;
  log: (...args: unknown[]) => void;
  endpoint?: string;
  endpointMethod?: string;
  url?: string;
  userStory?: string;
  sourceCode?: string;
  context: BrowserContext;
}

type GeneratedExecutable = (harness: ExecutionHarness) => Promise<void>;

@Injectable()
export class PlaywrightRunner {
  private readonly logger = new Logger(PlaywrightRunner.name);
  private readonly screenshotDir = path.join(process.cwd(), 'artifacts', 'screenshots');
  private readonly timeoutMs = Number(process.env.PLAYWRIGHT_TIMEOUT_MS ?? 45000);
  private readonly headless = String(process.env.PLAYWRIGHT_HEADLESS ?? 'true').toLowerCase() !== 'false';

  async runGeneratedTests(input: RunGeneratedTestsInput): Promise<TestExecutionResult[]> {
    await mkdir(this.screenshotDir, { recursive: true });

    const browser = await chromium.launch({ headless: this.headless });
    const browserContext = await browser.newContext();
    const apiContext = await playwrightRequest.newContext();

    const resolvedEndpoint = this.resolveEndpoint(input.url, input.endpoint);
    const results: TestExecutionResult[] = [];

    try {
      for (const testCase of input.tests) {
        const result = await this.executeSingleTest(testCase, {
          browserContext,
          apiContext,
          userStory: input.userStory,
          url: input.url,
          endpoint: resolvedEndpoint,
          endpointMethod: input.endpointMethod ?? 'GET',
          sourceCode: input.sourceCode,
        });
        results.push(result);
      }

      return results;
    } finally {
      await apiContext.dispose();
      await browserContext.close();
      await browser.close();
    }
  }

  private async executeSingleTest(
    testCase: GeneratedTestCase,
    runtime: {
      browserContext: BrowserContext;
      apiContext: APIRequestContext;
      url?: string;
      endpoint?: string;
      endpointMethod?: string;
      userStory?: string;
      sourceCode?: string;
    },
  ): Promise<TestExecutionResult> {
    const startedAt = Date.now();
    const logs: string[] = [];
    const shouldCaptureScreenshot = this.shouldCaptureScreenshot(testCase.code, runtime.url);
    let page: Page | undefined;
    let passed = false;
    let errorMessage: string | undefined;
    let screenshotPath: string | undefined;

    try {
      page = await runtime.browserContext.newPage();
      page.setDefaultTimeout(this.timeoutMs);

      page.on('console', (msg) => {
        logs.push(`[browser:${msg.type()}] ${msg.text()}`);
      });

      page.on('pageerror', (error) => {
        logs.push(`[pageerror] ${error.message}`);
      });

      await this.executeGeneratedCode(this.normalizeCode(testCase.code), {
        page,
        request: runtime.apiContext,
        expect,
        log: (...args: unknown[]) => {
          const text = args.map((arg) => this.serializeLogArg(arg)).join(' ');
          logs.push(text);
        },
        endpoint: runtime.endpoint,
        endpointMethod: runtime.endpointMethod,
        url: runtime.url,
        userStory: runtime.userStory,
        sourceCode: runtime.sourceCode,
        context: runtime.browserContext,
      });

      passed = true;
      this.logger.log(`Teste aprovado: ${testCase.name}`);
    } catch (error) {
      const e = error as Error;
      errorMessage = e.message;
      this.logger.warn(`Teste falhou: ${testCase.name} -> ${errorMessage}`);

      if (page && shouldCaptureScreenshot) {
        screenshotPath = path.join(this.screenshotDir, `${this.slugify(testCase.name)}-${Date.now()}.png`);

        try {
          await page.screenshot({ path: screenshotPath, fullPage: true });
          logs.push(`Captura de falha salva em ${screenshotPath}`);
        } catch (screenshotError) {
          logs.push(`Não foi possível salvar a captura de falha: ${String(screenshotError)}`);
        }
      } else if (!shouldCaptureScreenshot) {
        logs.push('Captura de tela não aplicável para teste de API/backend.');
      }
    } finally {
      if (page && !page.isClosed()) {
        await page.close();
      }
    }

    return {
      name: testCase.name,
      passed,
      expected: testCase.expected,
      logs: logs.join('\n'),
      error: errorMessage,
      screenshotPath,
      durationMs: Date.now() - startedAt,
    };
  }

  private async executeGeneratedCode(code: string, harness: ExecutionHarness): Promise<void> {
    const wrappedCode = `
      "use strict";
      module.exports = async function runGeneratedTest({ page, request, expect, log, endpoint, endpointMethod, url, userStory, sourceCode, context }) {
        ${code}
      };
    `;

    const sandbox: {
      module: { exports: unknown };
      exports: Record<string, unknown>;
      console: Console;
      setTimeout: typeof setTimeout;
      clearTimeout: typeof clearTimeout;
      URL: typeof URL;
    } = {
      module: { exports: undefined },
      exports: {},
      console,
      setTimeout,
      clearTimeout,
      URL,
    };

    vm.createContext(sandbox);
    const script = new vm.Script(wrappedCode, { filename: 'generated-playwright-test.js' });
    script.runInContext(sandbox);

    const executable = sandbox.module.exports as GeneratedExecutable;

    if (typeof executable !== 'function') {
      throw new Error('O código de teste gerado não é executável.');
    }

    await Promise.race([
      executable(harness),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`O teste gerado excedeu o tempo limite de ${this.timeoutMs}ms.`)), this.timeoutMs);
      }),
    ]);
  }

  private normalizeCode(code: string): string {
    return code
      .replace(/```(?:typescript|ts|javascript|js)?/gi, '')
      .replace(/```/g, '')
      .trim();
  }

  private serializeLogArg(input: unknown): string {
    if (typeof input === 'string') {
      return input;
    }

    try {
      return JSON.stringify(input);
    } catch {
      return String(input);
    }
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
      .slice(0, 80);
  }

  private resolveEndpoint(url?: string, endpoint?: string): string {
    if (!endpoint) {
      return '';
    }

    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint;
    }

    if (!url) {
      throw new Error(
        'Endpoint relativo recebido sem URL base. Informe um endpoint absoluto para execução somente de API.',
      );
    }

    return new URL(endpoint, url).toString();
  }

  private shouldCaptureScreenshot(code: string, url?: string): boolean {
    if (!url) {
      return false;
    }

    const normalized = code.toLowerCase();
    return normalized.includes('page.');
  }
}
