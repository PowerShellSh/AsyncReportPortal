import { Injectable, OnModuleInit } from '@nestjs/common';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { ProcessorService } from './processor.service';

@Injectable()
export class ConsumerService implements OnModuleInit {
  private sqsClient: SQSClient;
  private queueUrl: string;
  private isPolling = false;

  constructor(private readonly processorService: ProcessorService) {}

  async onModuleInit() {
    const endpoint = process.env.AWS_ENDPOINT_URL;
    const region = process.env.AWS_REGION || 'us-east-1';

    this.sqsClient = new SQSClient({
      region,
      endpoint: endpoint || undefined,
      credentials: endpoint
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
          }
        : undefined,
    });

    this.queueUrl = process.env.SQS_QUEUE_URL || '';

    console.log('Starting SQS consumer...');
    this.startPolling();
  }

  private async startPolling() {
    if (this.isPolling) return;
    this.isPolling = true;

    while (this.isPolling) {
      try {
        const command = new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20, // Long polling
        });

        const response = await this.sqsClient.send(command);

        if (response.Messages && response.Messages.length > 0) {
          for (const message of response.Messages) {
            await this.processMessage(message);
          }
        }
      } catch (error) {
        console.error('Error polling SQS:', error);
        // エラー時は少し待ってから再試行
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async processMessage(message: any) {
    try {
      const body = JSON.parse(message.Body);
      const { reportId, name } = body;

      console.log(`Processing report: ${reportId}, name: ${name}`);

      // レポート処理を実行
      await this.processorService.processReport(reportId, name);

      // メッセージを削除（処理成功時のみ）
      const deleteCommand = new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      });
      await this.sqsClient.send(deleteCommand);

      console.log(`Report ${reportId} processed successfully`);
    } catch (error) {
      console.error('Error processing message:', error);
      // エラー時はメッセージを削除せず、後で再処理される
    }
  }
}

