import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface OpenAIJsonPromptInput {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  runtimeConfig?: OpenAIRuntimeConfig;
}

export interface OpenAIRuntimeConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.model = this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4.1-mini';
    this.baseUrl = this.configService.get<string>('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1';

    if (!this.apiKey) {
      this.logger.warn('OPENAI_API_KEY não configurada. As funcionalidades de IA usarão modo fallback determinístico.');
    }
  }

  isEnabled(runtimeConfig?: OpenAIRuntimeConfig): boolean {
    return Boolean(this.resolveApiKey(runtimeConfig));
  }

  async promptForJson<T>(input: OpenAIJsonPromptInput): Promise<T> {
    const apiKey = this.resolveApiKey(input.runtimeConfig);
    const model = this.resolveModel(input.runtimeConfig);
    const baseUrl = this.resolveBaseUrl(input.runtimeConfig);

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY não está configurada.');
    }

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 1500,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: input.systemPrompt,
          },
          {
            role: 'user',
            content: input.userPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`A requisição para OpenAI falhou (${response.status}): ${errorBody}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const content = this.extractContent(payload);
    return this.safeParseJson<T>(content);
  }

  private extractContent(payload: Record<string, unknown>): string {
    const choices = payload.choices;

    if (!Array.isArray(choices) || choices.length === 0) {
      throw new Error('A resposta da OpenAI não contém choices.');
    }

    const firstChoice = choices[0] as Record<string, unknown>;
    const message = firstChoice.message as Record<string, unknown> | undefined;

    if (!message) {
      throw new Error('A resposta da OpenAI não contém uma mensagem válida.');
    }

    const content = message.content;

    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      const text = content
        .map((part) => {
          if (typeof part === 'string') {
            return part;
          }

          const partRecord = part as Record<string, unknown>;
          return typeof partRecord.text === 'string' ? partRecord.text : '';
        })
        .join('');

      if (text.trim().length > 0) {
        return text;
      }
    }

    throw new Error('O conteúdo da resposta da OpenAI está vazio ou não é suportado.');
  }

  private safeParseJson<T>(content: string): T {
    const trimmed = content.trim();

    try {
      return JSON.parse(trimmed) as T;
    } catch {
      const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (fenceMatch?.[1]) {
        return JSON.parse(fenceMatch[1]) as T;
      }

      const firstBrace = trimmed.indexOf('{');
      const lastBrace = trimmed.lastIndexOf('}');

      if (firstBrace >= 0 && lastBrace > firstBrace) {
        const candidate = trimmed.slice(firstBrace, lastBrace + 1);
        return JSON.parse(candidate) as T;
      }

      throw new Error(`Não foi possível interpretar JSON da resposta da OpenAI: ${content}`);
    }
  }

  private resolveApiKey(runtimeConfig?: OpenAIRuntimeConfig): string | undefined {
    const runtimeKey = runtimeConfig?.apiKey?.trim();
    return runtimeKey && runtimeKey.length > 0 ? runtimeKey : this.apiKey;
  }

  private resolveModel(runtimeConfig?: OpenAIRuntimeConfig): string {
    const runtimeModel = runtimeConfig?.model?.trim();
    return runtimeModel && runtimeModel.length > 0 ? runtimeModel : this.model;
  }

  private resolveBaseUrl(runtimeConfig?: OpenAIRuntimeConfig): string {
    const runtimeBaseUrl = runtimeConfig?.baseUrl?.trim();
    return runtimeBaseUrl && runtimeBaseUrl.length > 0 ? runtimeBaseUrl : this.baseUrl;
  }
}
