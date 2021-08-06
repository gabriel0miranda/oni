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
let ECS_TYPE;
let ECS_NETWORK_MODE;
let TMP_MOUNTPOINTS;
let TMP_EFS_CONFIG;
let AUTH_TYPE;
let lastTask = '';
let lastIdMessage = '';

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
    ECS_TYPE = APP.ECS_TYPE;
    ECS_NETWORK_MODE = APP.ECS_NETWORK_MODE;
    TMP_MOUNTPOINTS = APP.APP_MOUNTPOINTS;
    TMP_EFS_CONFIG = APP.EFS_CONFIG;
    TMP_CONSTRAINTS = APP.CONSTRAINTS;
    TASK_ARN = APP.TASK_ARN;
    AUTH_TYPE = 'INFRA';
}


async function GetLogFailedContainerDeploy(credencias, task) {

    aws.config.update(
        {
            apiVersion: '2016-11-15',
            accessKeyId: credencias.accessKeyId,
            secretAccessKey: credencias.secretAccessKey,
            sessionToken: credencias.sessionToken,
            region: APP_REGION
        })

    const cloudwatch = new aws.CloudWatchLogs();
    const logs = await cloudwatch.getLogEvents({
        logGroupName: `/ecs/${CLUSTER_NAME}/${APP_NAME}`,
        logStreamName: `${APP_NAME}/${APP_NAME}/${task}`,
        startFromHead: false,
        limit: 200
    }).promise();

    console.log('Log fom stopped container');
    for (const log of logs.$response.data.events) {
        console.log(log.message);
    }
}

async function DeployECS(app, tag, loadbalance) {


    try {
        await initEnvs(app);

        const cred = await AssumeRole(AUTH_TYPE, app);

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
        let APP_CONSTRAINTS = [];
        let APP_CMDS = [];


        for (var idx in TPM_VARIABLES) {
            var item = TPM_VARIABLES[idx];
            for (var key in item) {
                var value = item[key];
                APP_VARIABLES.push({ name: key, value: value.toString() })
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
                APP_VOLUMES.push({ name: EFS.VOLUME_NAME, efsVolumeConfiguration: { transitEncryption: 'ENABLED', fileSystemId: EFS.FILESYSTEM_ID, authorizationConfig: { accessPointId: EFS.ACCESS_POINT_ID } } });
            }

        if (TMP_CONSTRAINTS)
            for (const CONST of TMP_CONSTRAINTS) {
                APP_CONSTRAINTS.push({ expression: CONST[0], type: CONST[1] });
            }

        if (APP_COMMAND)
            for (const cmd of APP_COMMAND) {
                APP_CMDS.push(cmd.toString());
            }



        let containerDefinition = {
            essential: true,
            image: `${APP_IMAGE}:${tag}`,
            memoryReservation: APP_MEMORY_RESERVATION,
            memory: APP_MEMORY,
            name: APP_NAME,
            command: APP_CMDS,
            environment: APP_VARIABLES,
            secrets: APP_SECRETS,
            portMappings: APP_PORTS,
            mountPoints: APP_MOUNTPOINTS,
            networkMode: ECS_NETWORK_MODE,
            logConfiguration: {
                logDriver: "awslogs",
                options: {
                    "awslogs-group": `/ecs/${CLUSTER_NAME}/${APP_NAME}`,
                    "awslogs-region": `${APP_REGION}`,
                    "awslogs-stream-prefix": `${APP_NAME}`
                }
            },
        }

        console.log('ContainerDefinition: ', containerDefinition);


        const ecs = new aws.ECS();

        const task = await ecs.registerTaskDefinition({
            containerDefinitions: [containerDefinition],
            family: `${CLUSTER_NAME}-${APP_NAME}`,
            executionRoleArn: `arn:aws:iam::${APP_ACCOUNT}:role/ecs-task-${CLUSTER_NAME}-${APP_REGION}`,
            placementConstraints: APP_CONSTRAINTS,
            volumes: APP_VOLUMES,
            taskRoleArn: TASK_ARN ? `arn:aws:iam::${APP_ACCOUNT}:role/ecs-task-${CLUSTER_NAME}-${APP_REGION}` : ''
        }).promise();

        const taskARN = task.taskDefinition.taskDefinitionArn;
        console.log('\x1b[36mTask Defnition: ', taskARN);

        if (loadbalance) {
            await UpdateService(taskARN, app, cred)
        } else {
            await CodeDeploy(taskARN, app, TMP_PORTS[0], cred)
        }
    } catch (error) {
        console.error('\x1b[31m', error);
        process.exit(1);
    }



}


async function UpdateService(taskARN, app = 'APP_DEFAULT', credencias) {

    try {
        //await initEnvs(app);
        //const cred = await AssumeRole(AUTH_TYPE);

        aws.config.update(
            {
                apiVersion: '2016-11-15',
                accessKeyId: credencias.accessKeyId,
                secretAccessKey: credencias.secretAccessKey,
                sessionToken: credencias.sessionToken,
                region: APP_REGION
            })

        const ecs = new aws.ECS();

        console.log('\x1b[36m', `Init deploy app ${APP_NAME} without loadbalance`);
        const service = await ecs.updateService({ service: APP_NAME, cluster: CLUSTER_NAME, taskDefinition: taskARN }).promise();
        if (service.service.status === 'ACTIVE') {
            console.log('\x1b[32m', 'Finished deploy')
        } else {
            console.erro('\x1b[31mErro deploy', service);
            process.exit(1);
        }
    } catch (error) {
        console.error('\x1b[31m', error);
        process.exit(1);
    }

}

async function stopDeployment(deploymentId, credencias) {
    aws.config.update(
        {
            apiVersion: '2016-11-15',
            accessKeyId: credencias.accessKeyId,
            secretAccessKey: credencias.secretAccessKey,
            sessionToken: credencias.sessionToken,
            region: APP_REGION
        })

    try {
        const codeDeploy = new aws.CodeDeploy();
        console.log('\x1b[31m', 'Stopping Deployment by Timeout')
        await codeDeploy.stopDeployment({ deploymentId: deploymentId, autoRollbackEnabled: true }).promise();
        console.error('\x1b[31m', 'Deployment Stopped');


        const ecs = new aws.ECS();
        await sleep(10000);
        const taskDetails = await ecs.describeTasks({ cluster: CLUSTER_NAME, tasks: [`arn:aws:ecs:${APP_REGION}:${APP_ACCOUNT}:task/${CLUSTER_NAME}/${lastTask}`] }).promise();
        if (taskDetails.$response.data.tasks[0].containers)
        console.log('Stopped Reason: ', taskDetails.$response.data.tasks[0].containers[0].reason)
        
        await GetLogFailedContainerDeploy(credencias,lastTask);

        process.exit(1);

        

    } catch (error) {
        console.error('\x1b[31m', error);
        process.exit(1);
    }

}

async function CodeDeploy(taskARN, appName = 'APP_DEFAULT', appPort = 8080, credencias) {

    if (ECS_TYPE == "FARGATE" ) {
        var RESOURCE_PROPERTIES = `{
                            TaskDefinition: taskARN,
                            LoadBalancerInfo: {
                                ContainerName: APP_NAME,
                                ContainerPort: appPort
                            }
                        }`
    } else {
        var RESOURCE_PROPERTIES = `{
                            TaskDefinition: taskARN,
                            LoadBalancerInfo: {
                                ContainerName: APP_NAME,
                                ContainerPort: appPort
                            }
                        },
                            CapacityProviderStrategy: [{
                                CapacityProvider: ${CLUSTER_NAME}-capacity-provider,
                                Base: 0,
                                Weight: 1
                            }]
                        }`
    }

    try {
        //await initEnvs(appName);

        let contentDefinition = {
            version: 1,
            Resources: [
                {
                    TargetService: {
                        Type: 'AWS::ECS::Service',
                        Properties: `${RESOURCE_PROPERTIES}`
                    }
                }
            ]
        }


        //const cred = await AssumeRole(AUTH_TYPE);



        aws.config.update(
            {
                apiVersion: '2016-11-15',
                accessKeyId: credencias.accessKeyId,
                secretAccessKey: credencias.secretAccessKey,
                sessionToken: credencias.sessionToken,
                region: APP_REGION
            })

        const codeDeploy = new aws.CodeDeploy();

        console.log('\x1b[36m', `Init deploy app ${APP_NAME} `)
        console.log('AppSecp: ', JSON.stringify(contentDefinition));

        const deploy = await codeDeploy.createDeployment({
            applicationName: `${CLUSTER_NAME}-${APP_NAME}`,
            deploymentConfigName: 'CodeDeployDefault.ECSAllAtOnce',
            deploymentGroupName: `${CLUSTER_NAME}-${APP_NAME}`,
            description: 'Deployment',
            revision: {
                revisionType: 'AppSpecContent',
                appSpecContent: { content: JSON.stringify(contentDefinition) }
            },
            autoRollbackConfiguration: {
                enabled: true,
                events: ['DEPLOYMENT_FAILURE']
            }

        }).promise();

        console.log('\x1b[32m ', 'Deployment created!');
        console.log('\x1b[36m', `For more info: https://${APP_REGION}.console.aws.amazon.com/codesuite/codedeploy/deployments/${deploy.deploymentId}`);


        let statusDeploy;
        let timeOut = 0;
        statusDeploy = await codeDeploy.getDeployment({ deploymentId: deploy.deploymentId }).promise();
        while (statusDeploy.deploymentInfo.status === 'InProgress' || statusDeploy.deploymentInfo.status === 'Created') {
            await sleep(5000);
            timeOut = timeOut + 5;
            await PrintEventsECS(credencias);
            statusDeploy = await codeDeploy.getDeployment({ deploymentId: deploy.deploymentId }).promise();

            if (timeOut > 600 && (statusDeploy.deploymentInfo.status === 'InProgress' || statusDeploy.deploymentInfo.status === 'Created'))
                await stopDeployment(deploy.deploymentId, credencias)


        }
        if (statusDeploy.deploymentInfo.status === 'Succeeded') {
            console.log('\x1b[32m', 'Finished deploy');
        } else {
            console.error('\x1b[31mErro: ', { Message: 'Deployment Failed', Status: statusDeploy.deploymentInfo.status });
            console.error(statusDeploy.deploymentInfo)
            process.exit(1);
        }
        //await GetFailedDeployMsg(credencias);
    } catch (error) {
        console.error('\x1b[31m', error);
        process.exit(1);
    }

}


function GetSortOrder(prop) {
    return function (a, b) {
        if (new Date(a[prop]) > new Date(b[prop])) {
            return 1;
        } else if (new Date(a[prop]) < new Date(b[prop])) {
            return -1;
        }
        return 0;
    }
}

async function GetLastTask(events) {
    let count = 0;
    for (let i =  events.length -1; i>=0; i--) {
        if (events[i].message.includes('has started 1 tasks: (task') && count === 0) {
            count = 1;
        } else if (events[i].message.includes('has started 1 tasks: (task') && count === 1) {
            lastTask = events[i].message.split('(')[2].replace('task ', '').replace(').', '');
            console.log('lastTask ==> ',lastTask);
            break;
        }
    }
}

async function PrintEventsECS(credencias) {
    try {

        aws.config.update(
            {
                apiVersion: '2016-11-15',
                accessKeyId: credencias.accessKeyId,
                secretAccessKey: credencias.secretAccessKey,
                sessionToken: credencias.sessionToken,
                region: APP_REGION
            });

        const ecs = new aws.ECS();

        const service = await ecs.describeServices({ cluster: CLUSTER_NAME, services: [APP_NAME] }).promise();
        let events = service.$response.data.services[0].events;
        events.sort(GetSortOrder('createdAt'));
        const eventsSize = events.length - 1;
        if (eventsSize <= 0) {


            if (lastIdMessage != events[0].id)
                console.log('\x1b[35m', `${events[0].createdAt} => ${events[0].message}`)


            // if (events[0].message.includes('has started 1 tasks: (task'))
            //     lastTask = events[0].message.split('(')[2].replace('task ', '').replace(').', '');
            await GetLastTask(events);

            lastIdMessage = events[0].id;
        } {


            if (lastIdMessage != events[eventsSize].id)
                console.log('\x1b[35m', `${events[eventsSize].createdAt} => ${events[eventsSize].message}`)

            // if (events[eventsSize].message.includes('has started 1 tasks: (task'))
            //     lastTask = events[eventsSize].message.split('(')[2].replace('task ', '').replace(').', '');
            await GetLastTask(events);

            lastIdMessage = events[eventsSize].id;
        }


    } catch (error) {
        console.error('\x1b[31m', error);
        process.exit(1);
    }
}

module.exports = {
    DeployECS, CodeDeploy, UpdateService
}
