import { Injectable, OnModuleInit } from '@nestjs/common';
import { SQSClient, SendMessageCommand, CreateQueueCommand, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';

@Injectable()
export class SqsService implements OnModuleInit {
  private sqsClient: SQSClient;
  private queueUrl: string;

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

    // ローカル環境の場合、キューを作成または確認
    if (endpoint) {
      if (!this.queueUrl) {
        await this.createQueueIfNotExists();
      } else {
        // キューが存在するか確認し、存在しない場合は作成を試みる
        await this.ensureQueueExists();
      }
    }
  }

  private async createQueueIfNotExists() {
    try {
      const command = new CreateQueueCommand({
        QueueName: 'report-queue',
      });
      const result = await this.sqsClient.send(command);
      if (result.QueueUrl) {
        this.queueUrl = result.QueueUrl;
        console.log('SQS queue created:', this.queueUrl);
      }
    } catch (error: any) {
      // キューが既に存在する場合はエラーを無視
      if (error.name !== 'QueueAlreadyExists' && error.Code !== 'QueueAlreadyExists') {
        console.error('Failed to create queue:', error);
      } else {
        // キューが既に存在する場合は、標準的なURLを使用
        const region = process.env.AWS_REGION || 'us-east-1';
        this.queueUrl = `http://localstack:4566/000000000000/report-queue`;
        console.log('Queue already exists, using URL:', this.queueUrl);
      }
    }
  }

  private async ensureQueueExists() {
    const originalQueueUrl = this.queueUrl;
    try {
      // キューが存在するか確認するために、GetQueueAttributesを試みる
      const command = new GetQueueAttributesCommand({
        QueueUrl: this.queueUrl,
        AttributeNames: ['QueueArn'],
      });
      await this.sqsClient.send(command);
      console.log('SQS queue exists:', this.queueUrl);
    } catch (error: any) {
      // キューが存在しない場合は作成を試みる
      if (error.name === 'AWS.SimpleQueueService.NonExistentQueue' || error.Code === 'AWS.SimpleQueueService.NonExistentQueue') {
        console.log('Queue does not exist, creating...');
        // 環境変数で指定されたURLを保持したまま、キューを作成
        try {
          const createCommand = new CreateQueueCommand({
            QueueName: 'report-queue',
          });
          await this.sqsClient.send(createCommand);
          // 環境変数で指定されたURLを使用し続ける
          this.queueUrl = originalQueueUrl;
          console.log('Queue created, using URL:', this.queueUrl);
        } catch (createError: any) {
          if (createError.name !== 'QueueAlreadyExists' && createError.Code !== 'QueueAlreadyExists') {
            console.error('Failed to create queue:', createError);
          } else {
            this.queueUrl = originalQueueUrl;
            console.log('Queue already exists, using URL:', this.queueUrl);
          }
        }
      } else {
        console.error('Failed to check queue:', error);
      }
    }
  }

  async sendMessage(message: { reportId: string; name: string }) {
    const command = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(message),
    });

    await this.sqsClient.send(command);
  }
}
