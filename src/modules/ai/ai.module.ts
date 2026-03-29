import { Module } from '@nestjs/common';
import { CodeContextService } from './code-context.service';
import { OpenAIService } from './openai.service';
import { TestGeneratorService } from './test-generator.service';
import { ValidationService } from './validation.service';

@Module({
  providers: [OpenAIService, TestGeneratorService, ValidationService, CodeContextService],
  exports: [TestGeneratorService, ValidationService, CodeContextService],
})
export class AiModule {}
