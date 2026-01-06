import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class EcsStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: cdk.StackProps & {
      vpc: ec2.Vpc;
      rdsEndpoint: string;
      rdsPort: number;
      rdsDatabase: string;
      rdsCredentials: secretsmanager.ISecret;
      rdsSecurityGroup: ec2.SecurityGroup;
      queueUrl: string;
    },
  ) {
    super(scope, id, props);

    // ECSクラスター
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: props.vpc,
      clusterName: 'report-cluster',
    });

    // ECRリポジトリ（API用）
    const apiRepository = ecr.Repository.fromRepositoryName(
      this,
      'ApiRepository',
      'report-api',
    );

    // ECRリポジトリ（Worker用）
    const workerRepository = ecr.Repository.fromRepositoryName(
      this,
      'WorkerRepository',
      'report-worker',
    );

    const rdsSecurityGroup = props.rdsSecurityGroup;

    // API用タスク定義
    const apiTaskDefinition = new ecs.FargateTaskDefinition(this, 'ApiTaskDefinition', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    // RDS認証情報を環境変数として追加
    apiTaskDefinition.addContainer('ApiContainer', {
      image: ecs.ContainerImage.fromEcrRepository(apiRepository, 'latest'),
      environment: {
        DATABASE_HOST: props.rdsEndpoint,
        DATABASE_PORT: props.rdsPort.toString(),
        DATABASE_NAME: props.rdsDatabase,
        DATABASE_USER: 'reportuser',
        SQS_QUEUE_URL: props.queueUrl,
        AWS_REGION: this.region,
      },
      secrets: {
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(
          props.rdsCredentials,
          'password',
        ),
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'api',
      }),
    });

    // Worker用タスク定義
    const workerTaskDefinition = new ecs.FargateTaskDefinition(this, 'WorkerTaskDefinition', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    workerTaskDefinition.addContainer('WorkerContainer', {
      image: ecs.ContainerImage.fromEcrRepository(workerRepository, 'latest'),
      environment: {
        DATABASE_HOST: props.rdsEndpoint,
        DATABASE_PORT: props.rdsPort.toString(),
        DATABASE_NAME: props.rdsDatabase,
        DATABASE_USER: 'reportuser',
        SQS_QUEUE_URL: props.queueUrl,
        AWS_REGION: this.region,
        STORAGE_PATH: '/app/storage',
      },
      secrets: {
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(
          props.rdsCredentials,
          'password',
        ),
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'worker',
      }),
    });

    // SQSアクセス権限を追加
    const sqsPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
      resources: [props.queueUrl],
    });

    apiTaskDefinition.addToTaskRolePolicy(sqsPolicy);
    workerTaskDefinition.addToTaskRolePolicy(sqsPolicy);

    // APIサービス（ALB付き）
    const apiService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'ApiService', {
      cluster,
      taskDefinition: apiTaskDefinition,
      desiredCount: 2,
      publicLoadBalancer: true,
      listenerPort: 80,
    });

    // RDSへのアクセスを許可
    apiService.service.connections.allowTo(rdsSecurityGroup, ec2.Port.tcp(props.rdsPort));

    // Workerサービス
    const workerService = new ecs.FargateService(this, 'WorkerService', {
      cluster,
      taskDefinition: workerTaskDefinition,
      desiredCount: 1,
    });

    workerService.connections.allowTo(rdsSecurityGroup, ec2.Port.tcp(props.rdsPort));

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: `http://${apiService.loadBalancer.loadBalancerDnsName}`,
      exportName: 'ApiUrl',
    });
  }
}
