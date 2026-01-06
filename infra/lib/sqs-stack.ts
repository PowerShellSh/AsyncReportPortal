import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export class SqsStack extends cdk.Stack {
  public readonly queue: sqs.Queue;
  public readonly queueUrl: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // SQSキュー
    this.queue = new sqs.Queue(this, 'ReportQueue', {
      queueName: 'report-queue',
      visibilityTimeout: cdk.Duration.seconds(300), // 5分
      retentionPeriod: cdk.Duration.days(14),
    });

    this.queueUrl = this.queue.queueUrl;

    new cdk.CfnOutput(this, 'QueueUrl', {
      value: this.queueUrl,
      exportName: 'QueueUrl',
    });
  }
}
