# Mind Tester AI (NestJS + Playwright + OpenAI)

Sistema de testes automatizados com IA para:

- gerar testes automaticamente
- executar testes com Playwright
- validar resultados com IA
- calcular score e retornar relatório final

## Stack

- NestJS
- TypeScript
- Playwright
- OpenAI API (chat completions)

## Arquitetura

```text
src/
  modules/
    ai/
      ai.module.ts
      openai.service.ts
      test-generator.service.ts
      validation.service.ts
      code-context.service.ts
    report/
      report.module.ts
      report.service.ts
    runner/
      playwright.runner.ts
      runner.module.ts
    scoring/
      score.service.ts
      scoring.module.ts
    test/
      test.controller.ts
      test.module.ts
      test.orchestrator.ts
      test.service.ts
      dtos/
        run-test.dto.ts
    ui/
      ui.controller.ts
      ui.module.ts
  common/
    interfaces/
      ai-validation-result.interface.ts
      final-report.interface.ts
      generated-test-case.interface.ts
      generated-test-suite.interface.ts
      test-execution-result.interface.ts
      validated-test-result.interface.ts
  app.module.ts
  main.ts
```

## Como rodar

1. Instale dependências:

```bash
npm install
```

2. Configure variáveis de ambiente (opcional para IA real):

```bash
cp .env.example .env
```

3. Instale browser do Playwright (necessário para execução real):

```bash
npx playwright install chromium
```

4. Inicie a API:

```bash
npm run start
```

5. Abra a interface web:

```text
http://localhost:3000
```

## Rodando com Docker

Suba tudo com um único comando:

```bash
docker-compose up --build
```

Depois acesse:

```text
http://localhost:3000
```

Observações no modo Docker:

- O projeto roda dentro do container em `/app`.
- Se você usar `codePath`, informe caminhos do container, por exemplo: `/app/src`.
- A chave da OpenAI é opcional no ambiente Docker:
  - Você pode definir `OPENAI_API_KEY` antes de subir o compose (uso padrão em todas as execuções).
  - Ou pode informar a chave pelo front no campo "Chave da OpenAI" (uso apenas na execução atual).
  - Sem chave, o sistema continua funcionando em fallback determinístico (sem IA real).

## Endpoint

### `POST /test`

Campos de alvo:

- `userStory` (opcional): descrição textual da funcionalidade para gerar cenários com IA.
- `endpoint`: backend/API (opcional se `url` for enviado)
- `url`: frontend/UI (opcional se `endpoint` for enviado)
- `codePath` (opcional): caminho local no computador para arquivo/pasta de código-fonte que a IA deve analisar.
- `endpointMethod` (opcional): método HTTP do endpoint (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`). Padrão: `GET`.
- `sourceCode` (opcional): trecho manual de código-fonte (alternativa ao `codePath`).
- Para `POST/PUT/PATCH`, o body é inferido automaticamente pela IA a partir do endpoint (não precisa ser enviado pelo usuário).
- Regra: envie ao menos um alvo entre `userStory`, `endpoint`, `url`, `codePath` ou `sourceCode`.
- `aiConfig` (opcional): permite enviar a chave da OpenAI pelo front para uso apenas na execução atual.

Request:

```json
{
  "userStory": "Como usuário, quero validar a home e o endpoint de saúde",
  "endpoint": "https://jsonplaceholder.typicode.com/posts/1",
  "endpointMethod": "POST",
  "url": "https://example.com",
  "codePath": "/Users/joao/projetos/minha-api/src",
  "aiConfig": {
    "apiKey": "sk-..."
  }
}
```

Response:

```json
{
  "score": 100,
  "generatedTests": [
    {
      "name": "Teste 1",
      "expected": "Comportamento esperado...",
      "code": "..."
    }
  ],
  "results": [
    {
      "name": "UI básico: a página deve carregar e exibir um título",
      "passed": true,
      "logs": "durationMs=...",
      "aiAnalysis": "..."
    }
  ],
  "summary": "Total de testes: ..."
}
```

Em caso de erro de validação, a API responde em português com:

```json
{
  "erro": "Dados de entrada inválidos.",
  "explicacao": "Descrição clara do problema.",
  "sugestao": "Como corrigir e tentar novamente."
}
```

## Fluxo Interno

1. `CodeContextService` lê o caminho local informado e monta contexto de código para IA.
2. `TestGeneratorService` gera casos de teste com IA (e fallback determinístico se necessário).
3. `PlaywrightRunner` executa os testes dinamicamente e captura logs/erros/screenshots em falha.
4. `ValidationService` usa IA para validar evidências de execução.
5. `ScoreService` calcula score percentual.
6. `ReportService` monta relatório final.

## Observações

- Sem `OPENAI_API_KEY`, o sistema continua funcional em fallback determinístico.
- Com `OPENAI_API_KEY`, geração e validação usam IA real.
- Screenshots de falhas são salvas em `artifacts/screenshots/`.
- Capturas de falha são retornadas apenas para testes de frontend/UI (não para testes de API/backend).
