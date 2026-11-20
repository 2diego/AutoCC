import { Module } from '@nestjs/common';
import { RendicionCcController } from './rendicion-cc.controller';
import { RendicionCcService } from './rendicion-cc.service';

@Module({
  controllers: [RendicionCcController],
  providers: [RendicionCcService],
  exports: [RendicionCcService],
})
export class RendicionCcModule {}
