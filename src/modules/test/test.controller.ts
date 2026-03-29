import { Body, Controller, Post } from '@nestjs/common';
import { FinalReport } from '../../common/interfaces/final-report.interface';
import { RunTestDto } from './dtos/run-test.dto';
import { TestService } from './test.service';

@Controller('test')
export class TestController {
  constructor(private readonly testService: TestService) {}

  @Post()
  async runTest(@Body() input: RunTestDto): Promise<FinalReport> {
    return this.testService.runAutomatedTest(input);
  }
}
