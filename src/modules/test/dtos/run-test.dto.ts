import { Transform, Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUrl, MinLength, ValidateNested } from 'class-validator';

export class AIConfigDto {
  @Transform(({ value }) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value))
  @IsOptional()
  @IsString({ message: 'A chave da OpenAI deve ser um texto.' })
  apiKey?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value))
  @IsOptional()
  @IsString({ message: 'O modelo da OpenAI deve ser um texto.' })
  model?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value))
  @IsOptional()
  @IsString({ message: 'A baseUrl da OpenAI deve ser um texto.' })
  @IsUrl({ require_tld: false }, { message: 'A baseUrl da OpenAI deve ser uma URL válida (exemplo: https://api.openai.com/v1).' })
  baseUrl?: string;
}

export class RunTestDto {
  @Transform(({ value }) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value))
  @IsOptional()
  @IsString({ message: 'A userStory deve ser um texto válido.' })
  @MinLength(10, { message: 'A userStory deve ter pelo menos 10 caracteres para gerar testes úteis.' })
  userStory?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value))
  @IsOptional()
  @IsString({ message: 'O endpoint deve ser um texto.' })
  endpoint?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value))
  @IsOptional()
  @IsString({ message: 'A url deve ser um texto.' })
  @IsUrl({ require_tld: false }, { message: 'A url deve ser válida (exemplo: https://example.com).' })
  url?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value))
  @IsOptional()
  @IsString({ message: 'O sourceCode deve ser um texto.' })
  sourceCode?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value))
  @IsOptional()
  @IsString({ message: 'O codePath deve ser um texto.' })
  codePath?: string;

  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim().toUpperCase();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsOptional()
  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], {
    message: 'O endpointMethod deve ser um dos valores: GET, POST, PUT, PATCH ou DELETE.',
  })
  endpointMethod?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AIConfigDto)
  aiConfig?: AIConfigDto;
}
