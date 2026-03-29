import { BadRequestException, ValidationPipe, ValidationError } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new ApiExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const details = flattenValidationErrors(errors);

        return new BadRequestException({
          erro: 'Dados de entrada inválidos.',
          explicacao:
            details.length > 0
              ? details.join(' ')
              : 'A requisição contém campos inválidos.',
          sugestao:
            'Revise os campos obrigatórios, formatos de URL e tamanhos mínimos. Depois tente novamente.',
          message: details,
        });
      },
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();

function flattenValidationErrors(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => {
    const current = Object.values(error.constraints ?? {}).map((message) => translateConstraint(message));
    const children = flattenValidationErrors(error.children ?? []);
    return [...current, ...children];
  });
}

function translateConstraint(message: string): string {
  if (message.includes('should not exist')) {
    return 'Foi enviado um campo não permitido pela API.';
  }

  return message;
}
