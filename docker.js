const aws = require('aws-sdk');
const yenv = require('yenv');
const Docker = require('dockerode');
const docker = new Docker();
const { AssumeRole } = require('./auth')
const AUTH_TYPE = 'CI';


async function DockerBuild(tag, dockerFile = './Dockerfile', app = 'APP_DEFAULT') {
    const env = yenv('oni.yaml', process.env.NODE_ENV)
    const APP = env[app];
    const APP_IMAGE = APP.APP_IMAGE;

    try {
        console.log(`Building image ${APP_IMAGE}:${tag}`)
        let output = await docker.buildImage({ context: __dirname, src: [dockerFile, '.'] }, { t: `${APP_IMAGE}:${tag}` });
        result = await new Promise((resolve, reject) => {
            docker.modem.followProgress(output, (err, res) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(res);
                    resolve(res);
                }
            });
        });
        console.log(`Finished building`);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }


}

async function DockerPush(app, tag) {
    const env = yenv('oni.yaml', process.env.NODE_ENV)
    const APP = env[app];
    const APP_IMAGE = APP.APP_IMAGE;

    try {
        const authEcr = await DockerLoginECR();

        console.log(`Push image ${APP_IMAGE}:${tag}`)

        let imagePush = docker.getImage(`${APP_IMAGE}:${tag}`);
        let response = await imagePush.push({ authconfig: authEcr });

        const result = await new Promise((resolve, reject) => {
            docker.modem.followProgress(response, (err, res) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(res);
                    resolve(res);
                }
            });
        });
        console.log('Finished push')
    } catch (error) {
        console.error(error);
        process.exit(1);
    }


}


async function DockerLoginECR() {
    const env = yenv('oni.yaml', process.env.NODE_ENV)
    try {
        const cred = await AssumeRole(AUTH_TYPE);
        aws.config.update(
            {
                apiVersion: '2016-11-15',
                accessKeyId: cred.accessKeyId,
                secretAccessKey: cred.secretAccessKey,
                sessionToken: cred.sessionToken,
                region: cred.region
            })

        let ecr = new aws.ECR();
        let authResponse = await ecr.getAuthorizationToken().promise();

        let [user, pass] = Buffer.from(authResponse.authorizationData[0].authorizationToken, 'base64').toString().split(':');

        console.log('user', user);
        console.log('pass', pass);

        return {
            username: user,
            password: pass,
            serveraddress: authResponse.authorizationData[0].proxyEndpoint
        }
    } catch (error) {
        console.error(error);
        process.exit(1);
    }


}

module.exports = {
    DockerBuild, DockerPush
}
