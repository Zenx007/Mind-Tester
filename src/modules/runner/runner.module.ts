import { Module } from '@nestjs/common';
import { PlaywrightRunner } from './playwright.runner';

@Module({
  providers: [PlaywrightRunner],
  exports: [PlaywrightRunner],
})
export class RunnerModule {}
