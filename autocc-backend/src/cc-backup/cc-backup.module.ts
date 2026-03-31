import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CcBackupService } from './cc-backup.service';
import { CcBackupController } from './cc-backup.controller';
import { CcBackup } from './entities/cc-backup.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CcBackup])],
  controllers: [CcBackupController],
  providers: [CcBackupService],
})
export class CcBackupModule {}
