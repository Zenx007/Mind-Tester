import { BadRequestException, Injectable } from '@nestjs/common';
import { FinalReport } from '../../common/interfaces/final-report.interface';
import { RunTestDto } from './dtos/run-test.dto';
import { TestOrchestrator } from './test.orchestrator';

@Injectable()
export class TestService {
  constructor(private readonly testOrchestrator: TestOrchestrator) {}

  async runAutomatedTest(input: RunTestDto): Promise<FinalReport> {
    this.validateTargets(input);
    return this.testOrchestrator.execute(input);
  }

  private validateTargets(input: RunTestDto): void {
    const hasUserStory = Boolean(input.userStory?.trim());
    const hasEndpoint = Boolean(input.endpoint?.trim());
    const hasUrl = Boolean(input.url?.trim());
    const hasCodePath = Boolean(input.codePath?.trim());
    const hasSourceCode = Boolean(input.sourceCode?.trim());
    const endpointMethod = input.endpointMethod ?? 'GET';

    if (!hasUserStory && !hasEndpoint && !hasUrl && !hasCodePath && !hasSourceCode) {
      throw new BadRequestException({
        erro: 'Nenhum alvo de teste foi informado.',
        explicacao:
          'A execução precisa de pelo menos um alvo para validar: userStory, endpoint (backend/API), url (frontend/UI) ou código-fonte (codePath/sourceCode).',
        sugestao:
          'Preencha a userStory, endpoint para backend, url para frontend ou codePath/sourceCode para análise de código.',
      });
    }

    if (hasEndpoint && !hasUrl) {
      const endpoint = input.endpoint!.trim();
      const isAbsoluteEndpoint = /^https?:\/\//i.test(endpoint);

      if (!isAbsoluteEndpoint) {
        throw new BadRequestException({
          erro: 'Endpoint inválido para execução somente de API.',
          explicacao:
            'Quando a url de frontend não é enviada, o endpoint precisa ser absoluto para o runner acessar corretamente.',
          sugestao:
            'Informe um endpoint completo com protocolo, por exemplo: https://api.exemplo.com/health.',
        });
      }
    }

    if (!hasEndpoint && endpointMethod !== 'GET') {
      throw new BadRequestException({
        erro: 'Método HTTP informado sem endpoint.',
        explicacao:
          'Você definiu endpointMethod diferente de GET, porém não enviou o endpoint de API.',
        sugestao:
          'Preencha o campo endpoint ao usar testes de API, especialmente para POST/PUT/PATCH/DELETE.',
      });
    }
  }
}
