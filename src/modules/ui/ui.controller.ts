import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import * as path from 'node:path';

@Controller()
export class UiController {
  @Get('screenshots/:filename')
  async getScreenshot(@Param('filename') filename: string, @Res({ passthrough: true }) response: any): Promise<StreamableFile> {
    const safeFilename = path.basename(filename);

    if (safeFilename !== filename) {
      throw new NotFoundException({
        erro: 'Captura não encontrada.',
        explicacao: 'O nome do arquivo informado é inválido.',
        sugestao: 'Tente novamente usando o arquivo retornado no relatório.',
      });
    }

    const filePath = path.join(process.cwd(), 'artifacts', 'screenshots', safeFilename);

    try {
      await access(filePath);
    } catch {
      throw new NotFoundException({
        erro: 'Captura não encontrada.',
        explicacao: 'O arquivo de captura não existe no servidor.',
        sugestao: 'Execute o teste novamente para gerar uma nova captura de falha.',
      });
    }

    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(createReadStream(filePath));
  }

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderHome(): string {
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mind Tester AI</title>
  <style>
    :root {
      --bg: #f5f7fb;
      --card: #ffffff;
      --text: #1a2a3a;
      --muted: #607387;
      --primary: #0f5ea8;
      --primary-2: #2d8cff;
      --success: #1f8f46;
      --danger: #c62828;
      --border: #d8e1ea;
      --shadow: 0 12px 30px rgba(15, 94, 168, 0.12);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: "Segoe UI", "Avenir Next", "Trebuchet MS", sans-serif;
      background: radial-gradient(circle at top right, #dceeff 0%, var(--bg) 45%);
      color: var(--text);
      min-height: 100vh;
    }

    .container {
      max-width: 980px;
      margin: 40px auto;
      padding: 0 16px;
    }

    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: var(--shadow);
      padding: 20px;
      margin-bottom: 16px;
    }

    h1 {
      margin: 0 0 8px;
      font-size: 28px;
      line-height: 1.2;
    }

    p.subtitle {
      margin: 0;
      color: var(--muted);
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }

    label {
      display: block;
      font-weight: 700;
      margin-bottom: 6px;
      font-size: 14px;
    }

    input, textarea {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      font: inherit;
      color: var(--text);
      background: #fff;
    }

    select {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      font: inherit;
      color: var(--text);
      background: #fff;
    }

    textarea { min-height: 120px; resize: vertical; }

    .actions {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
      margin-top: 10px;
    }

    button {
      border: 0;
      border-radius: 10px;
      padding: 12px 18px;
      background: linear-gradient(90deg, var(--primary), var(--primary-2));
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }

    button:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .status {
      color: var(--muted);
      font-size: 14px;
    }

    .helper {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }

    .score {
      font-size: 30px;
      font-weight: 800;
      margin: 0;
    }

    .summary {
      margin: 8px 0 0;
      color: var(--muted);
    }

    .result {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      margin-top: 10px;
      background: #fcfdff;
    }

    .generated {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      margin-top: 10px;
      background: #f8fbff;
    }

    .pill {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      margin-left: 8px;
    }

    .pass { background: #e5f6ea; color: var(--success); }
    .fail { background: #fde8e8; color: var(--danger); }

    .shot {
      margin: 10px 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
    }

    .shot img {
      display: block;
      width: 100%;
      height: auto;
    }

    pre {
      background: #0b1a2b;
      color: #c6dbf7;
      border-radius: 8px;
      padding: 10px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }

    @media (max-width: 640px) {
      .container { margin-top: 20px; }
      h1 { font-size: 24px; }
    }
  </style>
</head>
<body>
  <main class="container">
    <section class="card">
      <h1>Mind Tester AI</h1>
      <p class="subtitle">Gere e execute testes automatizados com IA em um clique.</p>
    </section>

    <section class="card">
      <form id="testForm" class="grid">
        <p class="helper">
          Você pode testar apenas <strong>backend (endpoint)</strong>, apenas <strong>frontend (url)</strong>,
          apenas <strong>código local (codePath)</strong>, ou combinar tudo no mesmo pipeline.
        </p>
        <p class="helper">
          <strong>Endpoint</strong> valida API/backend. <strong>URL</strong> valida tela/frontend.
        </p>
        <p class="helper">
          OpenAI opcional: se preencher a chave abaixo, ela será usada somente nesta execução e não será salva no servidor.
        </p>
        <p class="helper">
          Para endpoints de escrita (POST/PUT/PATCH), o body é inferido automaticamente pela IA a partir do endpoint.
        </p>
        <p class="helper">
          Para validar regras internas do seu sistema, informe o caminho local do código (arquivo ou pasta).
          Exemplo: /Users/seu-usuario/projeto/src
        </p>

        <div>
          <label for="userStory">História do Usuário</label>
          <textarea id="userStory" name="userStory" required>Como usuário, quero validar a home e a disponibilidade do endpoint para garantir experiência estável.</textarea>
        </div>

        <div>
          <label for="endpoint">Endpoint (Backend/API)</label>
          <input id="endpoint" name="endpoint" type="text" value="https://jsonplaceholder.typicode.com/posts/1" placeholder="https://api.exemplo.com/health" />
        </div>

        <div>
          <label for="endpointMethod">Método do Endpoint</label>
          <select id="endpointMethod" name="endpointMethod">
            <option value="GET" selected>GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>

        <div>
          <label for="url">URL da Página (Frontend/UI)</label>
          <input id="url" name="url" type="url" value="https://example.com" placeholder="https://site.exemplo.com" />
        </div>

        <div>
          <label for="openaiApiKey">Chave da OpenAI (opcional)</label>
          <input id="openaiApiKey" name="openaiApiKey" type="password" autocomplete="off" placeholder="sk-..." />
        </div>

        <div>
          <label for="codePath">Caminho local do código para análise da IA (opcional)</label>
          <input id="codePath" name="codePath" type="text" placeholder="/Users/seu-usuario/projeto/src" />
        </div>

        <div class="actions">
          <button id="runBtn" type="submit">Executar Teste</button>
          <span id="status" class="status">Aguardando execução...</span>
        </div>
      </form>
    </section>

    <section id="resultCard" class="card" style="display:none;">
      <p id="score" class="score"></p>
      <p id="summary" class="summary"></p>
      <div id="generatedTests"></div>
      <div id="results"></div>
    </section>
  </main>

  <script>
    const form = document.getElementById('testForm');
    const runBtn = document.getElementById('runBtn');
    const statusEl = document.getElementById('status');
    const resultCard = document.getElementById('resultCard');
    const scoreEl = document.getElementById('score');
    const summaryEl = document.getElementById('summary');
    const generatedTestsEl = document.getElementById('generatedTests');
    const resultsEl = document.getElementById('results');

    function escapeHtml(text) {
      return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function renderResults(report) {
      scoreEl.textContent = 'Pontuação: ' + report.score + '%';
      summaryEl.textContent = report.summary || '';
      const resultMap = new Map((report.results || []).map(function(item) { return [item.name, item]; }));

      generatedTestsEl.innerHTML = (report.generatedTests || [])
        .map(function(test) {
          const testResult = resultMap.get(test.name);
          const badgeClass = testResult && testResult.passed ? 'pass' : 'fail';
          const badgeText = testResult ? (testResult.passed ? 'PASSOU' : 'FALHOU') : 'SEM RESULTADO';
          return '<article class="generated">'
            + '<h3>Teste Gerado: ' + escapeHtml(test.name) + '<span class="pill ' + badgeClass + '">' + badgeText + '</span></h3>'
            + '<p><strong>Esperado:</strong> ' + escapeHtml(test.expected || '') + '</p>'
            + '<pre>' + escapeHtml(test.code || '') + '</pre>'
            + '</article>';
        })
        .join('');

      resultsEl.innerHTML = report.results
        .map(function(result) {
          const badgeClass = result.passed ? 'pass' : 'fail';
          const badgeText = result.passed ? 'PASSOU' : 'FALHOU';
          const logs = escapeHtml(result.logs || '');
          const aiAnalysis = escapeHtml(result.aiAnalysis || '');
          const error = result.error ? '<p><strong>Erro:</strong> ' + escapeHtml(result.error) + '</p>' : '';
          const screenshot = result.screenshotPath
            ? (function() {
                const filename = String(result.screenshotPath).split(/[\\\\/]/).pop();
                const imageUrl = '/screenshots/' + encodeURIComponent(filename);
                return '<div class="shot"><img src="' + imageUrl + '" alt="Captura de falha" loading="lazy" /></div>'
                  + '<p><strong>Arquivo:</strong> ' + escapeHtml(result.screenshotPath) + '</p>';
              })()
            : '';

          return '<article class="result">'
            + '<h3>' + escapeHtml(result.name) + '<span class="pill ' + badgeClass + '">' + badgeText + '</span></h3>'
            + '<p><strong>Análise IA:</strong> ' + aiAnalysis + '</p>'
            + error
            + screenshot
            + '<pre>' + logs + '</pre>'
            + '</article>';
        })
        .join('');

      resultCard.style.display = 'block';
    }

    function montarMensagemErroApi(body) {
      if (!body || typeof body !== 'object') {
        return 'Não foi possível interpretar o erro retornado pela API.';
      }

      const partes = [];

      if (body.erro) {
        partes.push('Erro: ' + body.erro);
      }

      if (body.explicacao) {
        partes.push('Explicação: ' + body.explicacao);
      }

      if (body.sugestao) {
        partes.push('Sugestão: ' + body.sugestao);
      }

      if (Array.isArray(body.detalhes) && body.detalhes.length > 0) {
        partes.push('Detalhes: ' + body.detalhes.join(' | '));
      }

      if (partes.length > 0) {
        return partes.join('\\n');
      }

      if (body.message) {
        return String(body.message);
      }

      return 'A API retornou um erro sem detalhes.';
    }

    form.addEventListener('submit', async function(event) {
      event.preventDefault();

      const payload = {
        userStory: document.getElementById('userStory').value,
        endpoint: document.getElementById('endpoint').value.trim(),
        url: document.getElementById('url').value.trim(),
        endpointMethod: document.getElementById('endpointMethod').value,
      };

      const aiApiKey = document.getElementById('openaiApiKey').value.trim();
      const codePath = document.getElementById('codePath').value.trim();

      if (aiApiKey) {
        payload.aiConfig = {
          apiKey: aiApiKey || undefined,
        };
      }

      if (codePath) {
        payload.codePath = codePath;
      }

      if (!payload.endpoint && !payload.url && !payload.codePath && !payload.userStory.trim()) {
        statusEl.textContent = 'Preencha userStory, endpoint (backend), url (frontend) ou caminho do código.';
        return;
      }

      runBtn.disabled = true;
      statusEl.textContent = 'Executando pipeline de testes...';

      try {
        const response = await fetch('/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const body = await response.json();

        if (!response.ok) {
          throw new Error(montarMensagemErroApi(body));
        }

        renderResults(body);
        statusEl.textContent = 'Execução concluída com sucesso.';
      } catch (error) {
        resultCard.style.display = 'block';
        scoreEl.textContent = 'Erro na execução';
        summaryEl.textContent = String(error.message || error);
        generatedTestsEl.innerHTML = '';
        resultsEl.innerHTML = '';
        statusEl.textContent = 'Falha na execução.';
      } finally {
        runBtn.disabled = false;
      }
    });
  </script>
</body>
</html>`;
  }
}
