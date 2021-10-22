const aws = require('aws-sdk');
const yenv = require('yenv');
const Docker = require('dockerode');
const docker = new Docker();
const { AssumeRole } = require('./auth')
const AUTH_TYPE = 'CI';


async function DockerBuild(tag, dockerFile = './Dockerfile', app = 'APP_DEFAULT') {
    try {
        const env = yenv('oni.yaml', process.env.NODE_ENV)
        const APP = env[app];
        const APP_IMAGE = APP.APP_IMAGE;
        
        console.log('\x1b[36m',`Building image ${APP_IMAGE}:${tag}`)

        const authEcr = await DockerLoginECR();

        let output = await docker.buildImage({ context: process.cwd(), src: [dockerFile, '.'] }, { t: `${APP_IMAGE}:${tag}`, authconfig: authEcr });
         await new Promise((resolve, reject) => {
            docker.modem.followProgress(output, (err, res) => {
                if (err) {                    
                    reject(err);
                } else {
                    for (const r of res) {
                        if(r.stream) {
                            console.log(r.stream)
                        } else {
                            if (r.errorDetail) {
                                console.log('\x1b[31m',r.errorDetail.message);
                                process.exit(1);
                            }
 
                        }
                    }
                    resolve(res);
                }
            });
        });

        //  docker.buildImage({ context: process.cwd(), src: [dockerFile, '.'] }, { t: `${APP_IMAGE}:${tag}` }, function (err, stream) {
        //     if(err) {
        //         console.log('\x1b[31m',err);
        //     }
        //     stream.pipe(process.stdout);

        //   });

    } catch (error) {
        console.error('\x1b[31m',error);
        process.exit(1);
    }


}

async function DockerPush(tag, app) {
    try {
        const env = yenv('oni.yaml', process.env.NODE_ENV)
        const APP = env[app];
        const APP_IMAGE = APP.APP_IMAGE;

        const authEcr = await DockerLoginECR();

        console.log('\x1b[36m',`Push image ${APP_IMAGE}:${tag}`)

        let imagePush = docker.getImage(`${APP_IMAGE}:${tag}`);
        let response = await imagePush.push({ authconfig: authEcr });

        const result = await new Promise((resolve, reject) => {
            docker.modem.followProgress(response, (err, res) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(res);
                }
            });
        });
        console.log('\x1b[32m','Finished push')
    } catch (error) {
        console.error('\x1b[31m',error);
        process.exit(1);
    }

}


async function DockerLoginECR() {
    try {
        const env = yenv('oni.yaml', process.env.NODE_ENV)
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

        //console.log('user', user);
        //console.log('pass', pass);

        return {
            username: user,
            password: pass,
            serveraddress: authResponse.authorizationData[0].proxyEndpoint
        }
    } catch (error) {
        console.error('\x1b[31m',error);
        process.exit(1);
    }


}

module.exports = {
    DockerBuild, DockerPush
}
