#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { RdsStack } from '../lib/rds-stack';
import { SqsStack } from '../lib/sqs-stack';
import { EcsStack } from '../lib/ecs-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
};

// ネットワークスタック
const networkStack = new NetworkStack(app, 'NetworkStack', {
  env,
});

// RDSスタック
const rdsStack = new RdsStack(app, 'RdsStack', {
  env,
  vpc: networkStack.vpc,
});

// SQSスタック
const sqsStack = new SqsStack(app, 'SqsStack', {
  env,
});

// ECSスタック
const ecsStack = new EcsStack(app, 'EcsStack', {
  env,
  vpc: networkStack.vpc,
  rdsEndpoint: rdsStack.rdsEndpoint,
  rdsPort: rdsStack.rdsPort,
  rdsDatabase: rdsStack.rdsDatabase,
  rdsCredentials: rdsStack.rdsCredentials,
  rdsSecurityGroup: rdsStack.rdsSecurityGroup,
  queueUrl: sqsStack.queueUrl,
});

// 依存関係
rdsStack.addDependency(networkStack);
ecsStack.addDependency(networkStack);
ecsStack.addDependency(rdsStack);
ecsStack.addDependency(sqsStack);
