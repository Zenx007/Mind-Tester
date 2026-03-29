import { Injectable, Logger } from '@nestjs/common';
import { GeneratedTestCase } from '../../common/interfaces/generated-test-case.interface';
import { GeneratedTestSuite } from '../../common/interfaces/generated-test-suite.interface';
import { RunTestDto } from '../test/dtos/run-test.dto';
import { OpenAIRuntimeConfig, OpenAIService } from './openai.service';

interface InferredBodyResult {
  body?: Record<string, unknown>;
  source: 'ia' | 'heuristica' | 'nao_necessario';
}

interface BodyInferenceResponse {
  body?: Record<string, unknown>;
}

interface EndpointProbe {
  optionsStatus?: number;
  optionsAllow?: string;
  requestStatus?: number;
  requestBodyPreview?: string;
}

@Injectable()
export class TestGeneratorService {
  private readonly logger = new Logger(TestGeneratorService.name);

  constructor(private readonly openAIService: OpenAIService) {}

  async generateTestSuite(input: RunTestDto, runtimeConfig?: OpenAIRuntimeConfig): Promise<GeneratedTestSuite> {
    const inferredBody = await this.inferEndpointBody(input, runtimeConfig);

    if (!this.openAIService.isEnabled(runtimeConfig)) {
      return this.buildFallbackSuite(input, inferredBody);
    }

    try {
      const generated = await this.openAIService.promptForJson<GeneratedTestSuite>({
        systemPrompt: this.buildSystemPrompt(),
        userPrompt: this.buildUserPrompt(input, inferredBody),
        temperature: 0.2,
        maxTokens: 2200,
        runtimeConfig,
      });

      return this.normalizeSuite(generated, input, inferredBody);
    } catch (error) {
      this.logger.error(`Falha ao gerar testes com IA. Usando suíte de fallback. ${String(error)}`);
      return this.buildFallbackSuite(input, inferredBody);
    }
  }

  private buildSystemPrompt(): string {
    return [
      'Você é um engenheiro QA sênior especializado em Playwright e validação de qualidade API/UI.',
      'Retorne apenas JSON válido no formato: { "tests": [{ "name": string, "code": string, "expected": string }] }.',
      'Cada test.code DEVE conter instruções TypeScript executáveis para o corpo de uma função assíncrona.',
      'Não inclua imports, markdown, declarações de função em nível superior ou comentários fora das instruções de código.',
      'Use as variáveis disponíveis: page, request, expect, log, endpoint, endpointMethod, url, userStory, sourceCode, context.',
      'Inclua casos de borda relevantes.',
      'Mantenha cada teste isolado e determinístico.',
      'Escreva name e expected em português.',
      'Não repita testes idênticos nem nomes duplicados.',
      'Se endpointMethod for POST/PUT/PATCH, use o body inferido fornecido no prompt.',
      'Quando o prompt incluir código-fonte, analise regras de negócio, validações, campos obrigatórios e fluxos para orientar a geração dos testes.',
    ].join(' ');
  }

  private buildUserPrompt(input: RunTestDto, inferredBody: InferredBodyResult): string {
    const hasUrl = Boolean(input.url?.trim());
    const hasEndpoint = Boolean(input.endpoint?.trim());
    const hasSourceCode = Boolean(input.sourceCode?.trim());
    const scope = this.buildScopeLabel(hasUrl, hasEndpoint, hasSourceCode);
    const endpointMethod = (input.endpointMethod ?? 'GET').toUpperCase();

    const sourceCodeContext = this.summarizeSourceCodeForPrompt(input.sourceCode);
    const userStory = input.userStory?.trim() || 'Não informada';

    return [
      `História do usuário: ${userStory}`,
      `Endpoint de API: ${input.endpoint ?? 'não informado'}`,
      `Método do endpoint: ${endpointMethod}`,
      `URL da página: ${input.url ?? 'não informada'}`,
      `Caminho de código local: ${input.codePath ?? 'não informado'}`,
      `Escopo disponível para teste: ${scope}`,
      `Body inferido automaticamente: ${inferredBody.body ? JSON.stringify(inferredBody.body) : 'não necessário para este método'}`,
      `Fonte da inferência do body: ${inferredBody.source}`,
      `Resumo do código-fonte para análise: ${sourceCodeContext}`,
      'Crie entre 2 e 6 testes de acordo apenas com o escopo disponível.',
      'Se apenas API estiver disponível, não use page. Se apenas UI estiver disponível, não use request.',
      'Quando o método for POST/PUT/PATCH, valide status, conteúdo da resposta e efeito do payload inferido.',
      'Use o código-fonte para gerar testes alinhados às regras reais do sistema.',
      'Todo teste deve registrar evidências úteis de execução com log(...).',
      'Quando apenas sourceCode estiver disponível, use asserts em sourceCode para validar presença de regras, campos obrigatórios e sinais de validação.',
      'Expected deve descrever o critério de sucesso em português.',
    ].join('\n');
  }

  private normalizeSuite(
    candidate: GeneratedTestSuite,
    input: RunTestDto,
    inferredBody: InferredBodyResult,
  ): GeneratedTestSuite {
    if (!candidate || !Array.isArray(candidate.tests) || candidate.tests.length === 0) {
      return this.buildFallbackSuite(input, inferredBody);
    }

    const filtered = candidate.tests
      .filter((test): test is GeneratedTestCase => Boolean(test?.name && test?.code && test?.expected))
      .slice(0, 12);

    const seenSignatures = new Set<string>();
    const nameCounter = new Map<string, number>();
    const normalizedTests: GeneratedTestCase[] = [];

    for (const [index, test] of filtered.entries()) {
      const baseName = test.name.trim() || `Teste Gerado ${index + 1}`;
      const code = this.sanitizeCode(test.code);
      const expected =
        test.expected.trim() || 'O comportamento esperado deve ser atendido sem erros de execução.';

      if (code.length === 0) {
        continue;
      }

      const signature = `${code}::${expected}`.toLowerCase();
      if (seenSignatures.has(signature)) {
        continue;
      }
      seenSignatures.add(signature);

      const current = (nameCounter.get(baseName) ?? 0) + 1;
      nameCounter.set(baseName, current);
      const uniqueName = current === 1 ? baseName : `${baseName} (${current})`;

      normalizedTests.push({
        name: uniqueName,
        code,
        expected,
      });

      if (normalizedTests.length >= 8) {
        break;
      }
    }

    if (normalizedTests.length === 0) {
      return this.buildFallbackSuite(input, inferredBody);
    }

    return { tests: normalizedTests };
  }

  private sanitizeCode(code: string): string {
    return code
      .replace(/```(?:typescript|ts|javascript|js)?/gi, '')
      .replace(/```/g, '')
      .trim();
  }

  private buildFallbackSuite(input: RunTestDto, inferredBody: InferredBodyResult): GeneratedTestSuite {
    const hasUserStory = Boolean(input.userStory?.trim());
    const hasUrl = Boolean(input.url?.trim());
    const hasEndpoint = Boolean(input.endpoint?.trim());
    const hasSourceCode = Boolean(input.sourceCode?.trim());
    const resolvedEndpoint = hasEndpoint ? this.resolveEndpoint(input.url, input.endpoint!) : undefined;
    const endpointMethod = (input.endpointMethod ?? 'GET').toUpperCase();

    if (!hasUrl && !hasEndpoint && !hasSourceCode && hasUserStory) {
      return {
        tests: this.buildStoryFallbackTests(),
      };
    }

    if (!hasUrl && !hasEndpoint && hasSourceCode) {
      return {
        tests: this.buildCodeFallbackTests(),
      };
    }

    if (hasUrl && !hasEndpoint) {
      return {
        tests: [
          {
            name: 'UI básico: a página deve carregar e exibir um título',
            expected: 'A página abre com sucesso e possui um título não vazio.',
            code: [
              'await page.goto(url, { waitUntil: "domcontentloaded" });',
              'const title = await page.title();',
              'log(`title=${title}`);',
              'expect(title.length).toBeGreaterThan(0);',
            ].join('\n'),
          },
          {
            name: 'UI conteúdo: o corpo da página deve exibir texto visível',
            expected: 'A página deve renderizar conteúdo textual visível para o usuário.',
            code: [
              'await page.goto(url, { waitUntil: "domcontentloaded" });',
              'const text = await page.locator("body").innerText();',
              'log(`bodyTextLength=${text.trim().length}`);',
              'expect(text.trim().length).toBeGreaterThan(0);',
            ].join('\n'),
          },
        ],
      };
    }

    const apiFallbackTests = resolvedEndpoint
      ? this.buildApiFallbackTests(resolvedEndpoint, endpointMethod, inferredBody)
      : [];

    if (!hasUrl && hasEndpoint && resolvedEndpoint) {
      return {
        tests: apiFallbackTests,
      };
    }

    return {
      tests: [
        {
          name: 'UI básico: a página deve carregar e exibir um título',
          expected: 'A página abre com sucesso e possui um título não vazio.',
          code: [
            'await page.goto(url, { waitUntil: "domcontentloaded" });',
            'const title = await page.title();',
            'log(`title=${title}`);',
            'expect(title.length).toBeGreaterThan(0);',
          ].join('\n'),
        },
        {
          ...apiFallbackTests[0],
        },
      ],
    };
  }

  private buildStoryFallbackTests(): GeneratedTestCase[] {
    return [
      {
        name: 'História de usuário: deve conter contexto e objetivo claros',
        expected: 'A descrição deve permitir gerar cenários de teste objetivos.',
        code: [
          'const story = (userStory || "").trim();',
          'const palavras = story.split(/\\s+/).filter(Boolean);',
          'const possuiObjetivo = /(quero|devo|deve|para)/i.test(story);',
          'log(`storyLength=${story.length}`);',
          'log(`storyWords=${palavras.length}`);',
          'expect(story.length).toBeGreaterThan(20);',
          'expect(palavras.length).toBeGreaterThan(6);',
          'expect(possuiObjetivo).toBeTruthy();',
        ].join('\n'),
      },
      {
        name: 'História de usuário: deve indicar comportamento verificável',
        expected: 'A história deve trazer critérios minimamente testáveis.',
        code: [
          'const story = (userStory || "").toLowerCase();',
          'const termosTeste = /(validar|teste|erro|sucesso|resultado|resposta|fluxo|endpoint|página|tela)/;',
          'const contemTermo = termosTeste.test(story);',
          'log(`storyHasTestSignal=${contemTermo}`);',
          'expect(contemTermo).toBeTruthy();',
        ].join('\n'),
      },
    ];
  }

  private buildCodeFallbackTests(): GeneratedTestCase[] {
    return [
      {
        name: 'Código estático: contexto de código deve estar disponível',
        expected: 'O pipeline deve receber código-fonte não vazio para análise.',
        code: [
          'expect(typeof sourceCode).toBe("string");',
          'expect((sourceCode || "").trim().length).toBeGreaterThan(0);',
          'log(`sourceCodeLength=${(sourceCode || "").length}`);',
        ].join('\n'),
      },
      {
        name: 'Código estático: regras básicas devem ser identificáveis',
        expected: 'O código deve conter sinais de estrutura e regras relevantes para testes.',
        code: [
          'const content = (sourceCode || "").toLowerCase();',
          'const possuiEstrutura = /(class|function|controller|service|dto|interface)/.test(content);',
          'const possuiRegras = /(validate|validator|required|obrigat|throw new|status)/.test(content);',
          'log(`possuiEstrutura=${possuiEstrutura}`);',
          'log(`possuiRegras=${possuiRegras}`);',
          'expect(possuiEstrutura).toBeTruthy();',
          'expect(possuiRegras).toBeTruthy();',
        ].join('\n'),
      },
    ];
  }

  private buildApiFallbackTests(
    resolvedEndpoint: string,
    method: string,
    inferredBody: InferredBodyResult,
  ): GeneratedTestCase[] {
    const requestCode = this.buildApiRequestCode(method, inferredBody);
    const isWriteMethod = ['POST', 'PUT', 'PATCH'].includes(method);

    const testAvailability: GeneratedTestCase = {
      name: `API disponibilidade: endpoint ${method} não deve retornar erro 5xx`,
      expected: `O endpoint (${method}) deve processar a requisição sem erro interno de servidor.`,
      code: [
        `const endpointFinal = endpoint || '${resolvedEndpoint}';`,
        ...requestCode,
        'const status = response.status();',
        'const body = await response.text();',
        'log(`status=${status}`);',
        'log(`metodo=${method}`);',
        'log(`bodyPreview=${body.slice(0, 200)}`);',
        'expect(status).toBeLessThan(500);',
      ].join('\n'),
    };

    if (isWriteMethod) {
      return [
        testAvailability,
        {
          name: `API escrita: payload inferido para ${method} deve ser válido`,
          expected:
            `Para ${method}, o payload inferido deve conter dados úteis e o endpoint deve aceitar o formato da requisição.`,
          code: [
            `const endpointFinal = endpoint || '${resolvedEndpoint}';`,
            ...requestCode,
            'const status = response.status();',
            'log(`status=${status}`);',
            'log(`chavesPayload=${Object.keys(payload).join(",")}`);',
            'expect(Object.keys(payload).length).toBeGreaterThan(0);',
            'const possuiValorUtil = Object.values(payload).some((value) => {',
            '  if (typeof value === "string") return value.trim().length > 0;',
            '  return value !== null && value !== undefined;',
            '});',
            'expect(possuiValorUtil).toBeTruthy();',
            'expect(status).not.toBe(500);',
            'expect(status).not.toBe(415);',
          ].join('\n'),
        },
      ];
    }

    return [
      testAvailability,
      {
        name: `API resposta: endpoint ${method} deve retornar payload útil`,
        expected: `O endpoint (${method}) deve retornar um payload útil para análise.`,
        code: [
          `const endpointFinal = endpoint || '${resolvedEndpoint}';`,
          ...requestCode,
          'const payload = await response.text();',
          'log(`payloadLength=${payload.length}`);',
          'expect(payload.length).toBeGreaterThan(0);',
        ].join('\n'),
      },
    ];
  }

  private buildApiRequestCode(method: string, inferredBody: InferredBodyResult): string[] {
    const isWriteMethod = ['POST', 'PUT', 'PATCH'].includes(method);

    if (isWriteMethod) {
      const payload = inferredBody.body ?? this.defaultWriteBody('');
      const payloadLiteral = JSON.stringify(payload, null, 2);

      return [
        `const method = endpointMethod || '${method}';`,
        `const payload = ${payloadLiteral};`,
        `log('payloadFonte=${inferredBody.source}');`,
        'log(`payloadInferido=${JSON.stringify(payload)}`);',
        'const response = await request.fetch(endpointFinal, { method, data: payload });',
      ];
    }

    return [
      `const method = endpointMethod || '${method}';`,
      'const response = await request.fetch(endpointFinal, { method });',
    ];
  }

  private async inferEndpointBody(
    input: RunTestDto,
    runtimeConfig?: OpenAIRuntimeConfig,
  ): Promise<InferredBodyResult> {
    const hasEndpoint = Boolean(input.endpoint?.trim());
    const endpointMethod = (input.endpointMethod ?? 'GET').toUpperCase();
    const isWriteMethod = ['POST', 'PUT', 'PATCH'].includes(endpointMethod);

    if (!hasEndpoint || !isWriteMethod) {
      return { source: 'nao_necessario' };
    }

    const resolvedEndpoint = this.resolveEndpoint(input.url, input.endpoint!);
    const heuristicBody = this.defaultWriteBody(resolvedEndpoint, input.sourceCode);
    const probe = await this.collectEndpointProbe(resolvedEndpoint, endpointMethod);

    if (!this.openAIService.isEnabled(runtimeConfig)) {
      return { body: heuristicBody, source: 'heuristica' };
    }

    try {
      const aiInference = await this.openAIService.promptForJson<BodyInferenceResponse>({
        systemPrompt: [
          'Você é especialista em contratos de API REST.',
          'Com base no endpoint, método e respostas de sondagem, infera um body JSON mínimo plausível para testes automatizados.',
          'Retorne apenas JSON no formato: { "body": { ... } }.',
        ].join(' '),
        userPrompt: JSON.stringify(
          {
            endpoint: resolvedEndpoint,
            method: endpointMethod,
            probe,
            fallbackBody: heuristicBody,
            sourceCodeSnippet: this.clipSourceCode(input.sourceCode),
          },
          null,
          2,
        ),
        temperature: 0,
        maxTokens: 800,
        runtimeConfig,
      });

      const normalized = this.normalizeBody(aiInference.body);
      if (normalized) {
        return { body: normalized, source: 'ia' };
      }
    } catch (error) {
      this.logger.warn(`Falha ao inferir body com IA. Usando heurística. ${String(error)}`);
    }

    return { body: heuristicBody, source: 'heuristica' };
  }

  private async collectEndpointProbe(endpoint: string, method: string): Promise<EndpointProbe> {
    const probe: EndpointProbe = {};

    try {
      const optionsResponse = await fetch(endpoint, { method: 'OPTIONS' });
      probe.optionsStatus = optionsResponse.status;
      probe.optionsAllow = optionsResponse.headers.get('allow') ?? undefined;
    } catch {
      // Ignora erro de rede no probe
    }

    try {
      const writeProbe = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      probe.requestStatus = writeProbe.status;
      const text = await writeProbe.text();
      probe.requestBodyPreview = text.slice(0, 700);
    } catch {
      // Ignora erro de rede no probe
    }

    return probe;
  }

  private normalizeBody(body: unknown): Record<string, unknown> | undefined {
    if (!body || Array.isArray(body) || typeof body !== 'object') {
      return undefined;
    }

    const entries = Object.entries(body as Record<string, unknown>);
    if (entries.length === 0) {
      return undefined;
    }

    return Object.fromEntries(entries);
  }

  private defaultWriteBody(endpoint: string, sourceCode?: string): Record<string, unknown> {
    const fromCode = this.buildBodyFromCodeSignals(sourceCode);
    if (fromCode) {
      return fromCode;
    }

    const path = endpoint.toLowerCase();

    if (path.includes('/posts')) {
      return {
        title: 'Teste automatizado',
        body: 'Conteúdo gerado automaticamente para validação.',
        userId: 1,
      };
    }

    if (path.includes('/users')) {
      return {
        name: 'Usuário de Teste',
        email: 'usuario.teste@example.com',
      };
    }

    if (path.includes('/auth') || path.includes('/login')) {
      return {
        email: 'usuario.teste@example.com',
        password: 'Senha@123',
      };
    }

    if (path.includes('/products')) {
      return {
        name: 'Produto de Teste',
        price: 19.9,
      };
    }

    return {
      name: 'Registro de Teste',
      description: 'Payload inferido automaticamente para validação de endpoint.',
    };
  }

  private buildBodyFromCodeSignals(sourceCode?: string): Record<string, unknown> | undefined {
    if (!sourceCode || sourceCode.trim().length === 0) {
      return undefined;
    }

    const lower = sourceCode.toLowerCase();
    const body: Record<string, unknown> = {};

    if (lower.includes('email')) {
      body.email = 'usuario.teste@example.com';
    }
    if (lower.includes('password') || lower.includes('senha')) {
      body.password = 'Senha@123';
    }
    if (lower.includes('name') || lower.includes('nome')) {
      body.name = 'Usuário de Teste';
    }
    if (lower.includes('title') || lower.includes('titulo')) {
      body.title = 'Título de Teste';
    }
    if (lower.includes('description') || lower.includes('descricao')) {
      body.description = 'Descrição de teste gerada automaticamente.';
    }
    if (lower.includes('userid') || lower.includes('user_id') || lower.includes('id_usuario')) {
      body.userId = 1;
    }
    if (lower.includes('price') || lower.includes('preco') || lower.includes('valor')) {
      body.price = 19.9;
    }

    return Object.keys(body).length > 0 ? body : undefined;
  }

  private summarizeSourceCodeForPrompt(sourceCode?: string): string {
    if (!sourceCode || sourceCode.trim().length === 0) {
      return 'nenhum código-fonte informado';
    }

    const clipped = this.clipSourceCode(sourceCode);
    const signals = this.extractCodeSignals(sourceCode);

    return JSON.stringify({
      sinais: signals,
      trecho: clipped,
    });
  }

  private buildScopeLabel(hasUrl: boolean, hasEndpoint: boolean, hasSourceCode: boolean): string {
    if (hasUrl && hasEndpoint && hasSourceCode) {
      return 'UI + API + Código';
    }

    if (hasUrl && hasEndpoint) {
      return 'UI + API';
    }

    if (hasUrl && hasSourceCode) {
      return 'UI + Código';
    }

    if (hasEndpoint && hasSourceCode) {
      return 'API + Código';
    }

    if (hasUrl) {
      return 'Apenas UI';
    }

    if (hasEndpoint) {
      return 'Apenas API';
    }

    if (hasSourceCode) {
      return 'Apenas Código';
    }

    return 'Sem escopo definido';
  }

  private extractCodeSignals(sourceCode: string): string[] {
    const lower = sourceCode.toLowerCase();
    const signals: string[] = [];

    if (lower.includes('throw new')) signals.push('lança exceções');
    if (lower.includes('validate') || lower.includes('validator')) signals.push('possui validações');
    if (lower.includes('required') || lower.includes('obrigat')) signals.push('indica campos obrigatórios');
    if (lower.includes('status') || lower.includes('httpstatus')) signals.push('manipula códigos de status');
    if (lower.includes('email')) signals.push('usa campo email');
    if (lower.includes('password') || lower.includes('senha')) signals.push('usa campo senha');

    return signals;
  }

  private clipSourceCode(sourceCode?: string): string {
    if (!sourceCode) {
      return '';
    }

    const normalized = sourceCode.trim();
    const maxChars = 5000;
    return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}\n... [código truncado]` : normalized;
  }

  private resolveEndpoint(url: string | undefined, endpoint: string): string {
    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint;
    }

    if (!url) {
      throw new Error('Endpoint relativo exige uma URL base.');
    }

    return new URL(endpoint, url).toString();
  }
}
