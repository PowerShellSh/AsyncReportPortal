import { Module } from '@nestjs/common';
import { ConsumerService } from './consumer.service';
import { ProcessorService } from './processor.service';
import { DatabaseService } from './database.service';

@Module({
  providers: [ConsumerService, ProcessorService, DatabaseService],
})
export class AppModule {}

