import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

interface HttpRequestLike {
  url: string;
  method: string;
}

interface HttpResponseLike {
  status: (statusCode: number) => HttpResponseLike;
  json: (payload: unknown) => void;
}

interface ErrorPayload {
  erro: string;
  explicacao: string;
  sugestao: string;
  detalhes?: string[];
  statusCode: number;
  timestamp: string;
  path: string;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<HttpResponseLike>();
    const request = ctx.getRequest<HttpRequestLike>();

    const { status, payload } = this.buildPayload(exception, request.url);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`Erro interno em ${request.method} ${request.url}: ${String(exception)}`);
    }

    response.status(status).json(payload);
  }

  private buildPayload(exception: unknown, path: string): { status: number; payload: ErrorPayload } {
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const normalized = this.normalizeHttpException(raw, status);

      return {
        status,
        payload: {
          ...normalized,
          statusCode: status,
          timestamp,
          path,
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      payload: {
        erro: 'Erro interno do servidor.',
        explicacao:
          'Ocorreu uma falha inesperada durante o processamento da requisição.',
        sugestao:
          'Tente novamente em instantes. Se o problema persistir, revise os dados enviados e os logs do servidor.',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        timestamp,
        path,
      },
    };
  }

  private normalizeHttpException(raw: string | object, status: number): Omit<ErrorPayload, 'statusCode' | 'timestamp' | 'path'> {
    const defaultByStatus = this.defaultMessageByStatus(status);

    if (typeof raw === 'string') {
      return {
        ...defaultByStatus,
        explicacao: raw,
      };
    }

    const responseObj = raw as Record<string, unknown>;

    const explicitErro = this.asString(responseObj.erro);
    const explicitExplicacao = this.asString(responseObj.explicacao);
    const explicitSugestao = this.asString(responseObj.sugestao);

    const message = responseObj.message;
    const details = this.extractMessages(message);

    return {
      erro: explicitErro ?? defaultByStatus.erro,
      explicacao:
        explicitExplicacao ??
        (details.length > 0 ? details.join(' ') : defaultByStatus.explicacao),
      sugestao: explicitSugestao ?? defaultByStatus.sugestao,
      detalhes: details.length > 0 ? details : undefined,
    };
  }

  private extractMessages(message: unknown): string[] {
    if (typeof message === 'string') {
      return [this.translateConstraint(message)];
    }

    if (Array.isArray(message)) {
      return message
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => this.translateConstraint(item));
    }

    return [];
  }

  private translateConstraint(message: string): string {
    if (message.includes('should not exist')) {
      return 'Foi enviado um campo não permitido pela API.';
    }

    return message;
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private defaultMessageByStatus(status: number): Omit<ErrorPayload, 'statusCode' | 'timestamp' | 'path'> {
    if (status === HttpStatus.BAD_REQUEST) {
      return {
        erro: 'Dados de entrada inválidos.',
        explicacao: 'A requisição possui campos inválidos ou ausentes.',
        sugestao: 'Revise os campos informados e tente novamente.',
      };
    }

    if (status === HttpStatus.NOT_FOUND) {
      return {
        erro: 'Recurso não encontrado.',
        explicacao: 'A rota ou recurso solicitado não foi localizado.',
        sugestao: 'Verifique se a URL e o método HTTP estão corretos.',
      };
    }

    if (status === HttpStatus.UNAUTHORIZED) {
      return {
        erro: 'Acesso não autorizado.',
        explicacao: 'A requisição exige autenticação válida.',
        sugestao: 'Envie credenciais/tokens válidos para continuar.',
      };
    }

    return {
      erro: 'Falha ao processar requisição.',
      explicacao: 'A requisição não pôde ser concluída com sucesso.',
      sugestao: 'Revise os dados enviados e tente novamente.',
    };
  }
}
