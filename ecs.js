const yenv = require('yenv')
const aws = require('aws-sdk');
const { AssumeRole } = require('./auth');

let APP;
let APP_IMAGE;
let APP_NAME;
let APP_MEMORY;
let APP_MEMORY_RESERVATION;
let TMP_PORTS;
let APP_REGION;
let APP_ACCOUNT;
let TPM_VARIABLES;
let TPM_SECRETS;
let APP_COMMAND;
let CLUSTER_NAME;
let TMP_MOUNTPOINTS;
let TMP_EFS_CONFIG;
let AUTH_TYPE;

async function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function initEnvs(app) {
    const env = yenv('oni.yaml', process.env.NODE_ENV)
    APP = env[app];
    APP_IMAGE = APP.APP_IMAGE;
    APP_NAME = APP.APP_NAME;
    APP_MEMORY = APP.APP_MEMORY;
    APP_MEMORY_RESERVATION = APP.APP_MEMORY_RESERVATION;
    TMP_PORTS = APP.APP_PORTS;
    APP_REGION = APP.APP_REGION;
    APP_ACCOUNT = APP.APP_ACCOUNT;
    TPM_VARIABLES = APP.APP_VARIABLES;
    TPM_SECRETS = APP.APP_SECRETS;
    APP_COMMAND = APP.APP_COMMAND || [];
    CLUSTER_NAME = APP.CLUSTER_NAME;
    TMP_MOUNTPOINTS = APP.APP_MOUNTPOINTS;
    TMP_EFS_CONFIG = APP.EFS_CONFIG;
    AUTH_TYPE = 'INFRA';
}

async function DeployECS(app, tag, loadbalance) {


    try {
        await initEnvs(app);

        const cred = await AssumeRole(AUTH_TYPE);

        aws.config.update(
            {
                apiVersion: '2016-11-15',
                accessKeyId: cred.accessKeyId,
                secretAccessKey: cred.secretAccessKey,
                sessionToken: cred.sessionToken,
                region: APP_REGION
            })

        let APP_VARIABLES = [];
        let APP_SECRETS = [];
        let APP_PORTS = [];
        let APP_MOUNTPOINTS = [];
        let APP_VOLUMES = [];


        for (var idx in TPM_VARIABLES) {
            var item = TPM_VARIABLES[idx];
            for (var key in item) {
                var value = item[key];
                APP_VARIABLES.push({ name: key, value: value })
            }
        }

        for (var idx in TPM_SECRETS) {
            var item = TPM_SECRETS[idx];
            for (var key in item) {
                var value = item[key];
                APP_SECRETS.push({ name: key, valueFrom: `arn:aws:ssm:${APP_REGION}:${APP_ACCOUNT}:parameter/${value}` })
            }
        }


        if (TMP_PORTS)
            for (const port of TMP_PORTS) {
                APP_PORTS.push({ containerPort: port })

            }

        if (TMP_MOUNTPOINTS)
            for (const point of TMP_MOUNTPOINTS) {
                APP_MOUNTPOINTS.push({ sourceVolume: point.split(':')[0], containerPath: point.split(':')[1] });
            }

        if (TMP_EFS_CONFIG)
            for (const EFS of TMP_EFS_CONFIG) {
                APP_VOLUMES.push({ efsVolumeConfiguration: { fileSystemId: EFS.FILESYSTEM_ID, rootDirectory: EFS.ROOTDIRECTORY } });
            }



        let containerDefinition = {
            essential: true,
            image: `${APP_IMAGE}:${tag}`,
            memoryReservation: APP_MEMORY_RESERVATION,
            memory: APP_MEMORY,
            name: APP_NAME,
            command: APP_COMMAND,
            environment: APP_VARIABLES,
            secrets: APP_SECRETS,
            portMappings: APP_PORTS,
            mountPoints: APP_MOUNTPOINTS,
            logConfiguration: {
                logDriver: "awslogs",
                options: {
                    "awslogs-group": `/ecs/${CLUSTER_NAME}/${APP_NAME}`,
                    "awslogs-region": `${APP_REGION}`,
                    "awslogs-stream-prefix": `${APP_NAME}`
                }
            },
        }

        console.log(containerDefinition);


        const ecs = new aws.ECS();

        const task = await ecs.registerTaskDefinition({
            containerDefinitions: [containerDefinition],
            family: `${CLUSTER_NAME}-${APP_NAME}`,
            executionRoleArn: `arn:aws:iam::${APP_ACCOUNT}:role/ecs-task-${CLUSTER_NAME}-${APP_REGION}`,
            volumes: APP_VOLUMES
        }).promise();

        const taskARN = task.taskDefinition.taskDefinitionArn;
        console.log('Task Defnition: ', taskARN);

        if (loadbalance) {
            await UpdateService(taskARN, app)
        } else {
            await CodeDeploy(taskARN, app, TMP_PORTS[0])
        }
    } catch (error) {
        console.error(error);
        process.exit(1);
    }



}


async function UpdateService(taskARN, app = 'APP_DEFAULT') {

    try {
        await initEnvs(app);
        const cred = await AssumeRole(AUTH_TYPE);

        aws.config.update(
            {
                apiVersion: '2016-11-15',
                accessKeyId: cred.accessKeyId,
                secretAccessKey: cred.secretAccessKey,
                sessionToken: cred.sessionToken,
                region: APP_REGION
            })

        const ecs = new aws.ECS();

        console.log(`Init deploy app ${APP_NAME} without loadbalance`)
        const service = await ecs.updateService({ service: APP_NAME, cluster: CLUSTER_NAME, taskDefinition: taskARN }).promise();
        if (service.service.status === 'ACTIVE') {
            console.log('Finished deploy')
        } else {
            console.erro('Erro deploy', service);
            process.exit(1);
        }
    } catch (error) {
        console.error(error);
        process.exit(1);
    }

}


async function CodeDeploy(taskARN, appName = 'APP_DEFAULT', appPort = 8080) {

    try {
        await initEnvs(appName);

        let contentDefinition = {
            version: 1,
            Resources: [
                {
                    TargetService: {
                        Type: 'AWS::ECS::Service',
                        Properties: {
                            TaskDefinition: taskARN
                            ,
                            LoadBalancerInfo: {
                                ContainerName: APP_NAME,
                                ContainerPort: appPort
                            }
                            ,
                            CapacityProviderStrategy: [{
                                CapacityProvider: `${CLUSTER_NAME}-capacity-provider`,
                                Base: 0,
                                Weight: 1
                            }]
                        }
                    }
                }
            ]
        }


        const cred = await AssumeRole(AUTH_TYPE);



        aws.config.update(
            {
                apiVersion: '2016-11-15',
                accessKeyId: cred.accessKeyId,
                secretAccessKey: cred.secretAccessKey,
                sessionToken: cred.sessionToken,
                region: APP_REGION
            })

        const codeDeploy = new aws.CodeDeploy();

        console.log(`Init deploy app ${APP_NAME} `)
        console.log(contentDefinition);

        const deploy = await codeDeploy.createDeployment({
            applicationName: `${CLUSTER_NAME}-${APP_NAME}`,
            deploymentConfigName: 'CodeDeployDefault.ECSAllAtOnce',
            deploymentGroupName: `${CLUSTER_NAME}-${APP_NAME}`,
            description: 'Deployment',
            revision: {
                revisionType: 'AppSpecContent',
                appSpecContent: { content: JSON.stringify(contentDefinition) }
            },

        }).promise();

        console.log('DeploymentId ', deploy.deploymentId);


        let statusDeploy;
        statusDeploy = await codeDeploy.getDeployment({ deploymentId: deploy.deploymentId }).promise();
        while (statusDeploy.deploymentInfo.status === 'InProgress' || statusDeploy.deploymentInfo.status === 'Created') {
            await sleep(5000);
            statusDeploy = await codeDeploy.getDeployment({ deploymentId: deploy.deploymentId }).promise();
        }
        if (statusDeploy.deploymentInfo.status === 'Succeeded') {
            console.log('Finished deploy');
        } else {
            console.error('Erro: ', { Message: 'Deployment Failed', Status: statusDeploy.deploymentInfo.status });
            console.error(statusDeploy.deploymentInfo)
            process.exit(1);
        }
    } catch (error) {
        console.error(error);
        process.exit(1);
    }



}

module.exports = {
    DeployECS, CodeDeploy, UpdateService
}