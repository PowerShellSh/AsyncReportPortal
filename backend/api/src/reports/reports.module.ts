import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { DatabaseService } from '../database.service';
import { SqsService } from '../sqs.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, DatabaseService, SqsService],
})
export class ReportsModule {}
