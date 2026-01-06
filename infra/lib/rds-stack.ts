import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class RdsStack extends cdk.Stack {
  public readonly rdsEndpoint: string;
  public readonly rdsPort: number;
  public readonly rdsDatabase: string;
  public readonly rdsCredentials: secretsmanager.ISecret;
  public readonly rdsSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: cdk.StackProps & { vpc: ec2.Vpc }) {
    super(scope, id, props);

    // RDS認証情報のシークレット
    this.rdsCredentials = new secretsmanager.Secret(this, 'RdsCredentials', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'reportuser' }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\',
      },
    });

    // RDSサブネットグループ
    const subnetGroup = new rds.SubnetGroup(this, 'RdsSubnetGroup', {
      vpc: props.vpc,
      description: 'Subnet group for RDS',
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    // RDSセキュリティグループ
    this.rdsSecurityGroup = new ec2.SecurityGroup(this, 'RdsSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for RDS',
      allowAllOutbound: true,
    });

    // RDSインスタンス
    const dbInstance = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      credentials: rds.Credentials.fromSecret(this.rdsCredentials),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [this.rdsSecurityGroup],
      subnetGroup,
      databaseName: 'reportdb',
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 本番環境では変更を検討
    });

    // 出力
    this.rdsEndpoint = dbInstance.instanceEndpoint.hostname;
    this.rdsPort = 5432;
    this.rdsDatabase = 'reportdb';

    new cdk.CfnOutput(this, 'RdsEndpoint', {
      value: this.rdsEndpoint,
      exportName: 'RdsEndpoint',
    });

    new cdk.CfnOutput(this, 'RdsSecurityGroupId', {
      value: this.rdsSecurityGroup.securityGroupId,
      exportName: `${this.stackName}-RdsSecurityGroupId`,
    });
  }
}
