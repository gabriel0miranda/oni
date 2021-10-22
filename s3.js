const aws = require('aws-sdk');
const yenv = require('yenv')
const mime = require('mime-types');
const S3SyncClient = require('s3-sync-client');
const { AssumeRole } = require('./auth');
const fs = require('fs');

let APP_SRC;
let APP_S3_BUCKET;
let CF_DISTRIBUTION_ID;
let APP_REGION;
let AUTH_TYPE;

async function initEnvs(app) {
    const env = yenv('oni.yaml', process.env.NODE_ENV)
    APP = env[app];
    APP_SRC = APP.APP_SRC;
    APP_S3_BUCKET = APP.APP_S3_BUCKET;
    APP_REGION = APP.APP_REGION;
    CF_DISTRIBUTION_ID = APP.CF_DISTRIBUTION_ID;
    AUTH_TYPE = 'INFRA';
}

async function UploadS3(app) {    
    const cred = await AssumeRole(AUTH_TYPE, app);  

    const sync = await new S3SyncClient({
        region: APP_REGION,    credentials: {
            accessKeyId: cred.accessKeyId,
            secretAccessKey: cred.secretAccessKey,
            sessionToken: cred.sessionToken
        }    
    });
    await sync.bucketWithLocal(APP_SRC, APP_S3_BUCKET,{delete: true,    commandInput: {
        ACL: 'public-read', ContentType: (syncCommandInput) => (
            mime.lookup(syncCommandInput.Key) || 'text/html'
        ) 
    }});
}

async function InvalidateCloudFront(app) {
    const cred = await AssumeRole(AUTH_TYPE, app);
    aws.config.update(
        {
            apiVersion: '2016-11-15',
            accessKeyId: cred.accessKeyId,
            secretAccessKey: cred.secretAccessKey,
            sessionToken: cred.sessionToken,            
            region: APP_REGION
        });

    const cl = await new aws.CloudFront();

    const caller = Math.floor(+new Date() / 1000);

    const invalidation = await cl.createInvalidation({DistributionId: CF_DISTRIBUTION_ID, 
        InvalidationBatch: {
            CallerReference: `${caller}`,            
            Paths: {
                Quantity: 1,
                Items: ['/*']
            }
    }}).promise();    
}

async function DeployS3(app) {
    await initEnvs(app)
    await UploadS3(app);
    await InvalidateCloudFront(app);
}

 module.exports = {
     DeployS3
 }

