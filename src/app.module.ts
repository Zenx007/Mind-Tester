import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TestModule } from './modules/test/test.module';
import { UiModule } from './modules/ui/ui.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    UiModule,
    TestModule,
  ],
})
export class AppModule {}
