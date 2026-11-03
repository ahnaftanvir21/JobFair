import { Global, Module } from '@nestjs/common';
import { FairService } from './fair.service.js';

@Global()
@Module({
  providers: [FairService],
  exports: [FairService],
})
export class FairModule {}
