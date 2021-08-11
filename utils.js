
const fs = require('fs');

const oni = `
development:
  AWS_REGION: us-east-1
  AWS_ACCOUNT: 1111111
  AWS_ROLE: role-name
  APP_DEFAULT:
    APP_IMAGE: 'xxxxxxxxxxxxxxxxx/teste'
    APP_NAME: teste
    APP_MEMORY: 512
    APP_MEMORY_RESERVATION: 256
    APP_PORTS:
      - 80
    APP_REGION: us-east-1
    APP_VARIABLES:
      - ENV_A: 'value 1'
      - ENV_B: 'value 2'
    APP_SECRETS:
      - SEC_A: /xxxxx/yyyyyy
    APP_ACCOUNT: 111111111111
    APP_ROLE: role-name
    CLUSTER_NAME: cluster-name
    APP_COMMAND: 
      - ls 
      - -l
    APP_MOUNTPOINTS:
      - volume_xyz:/dev/xxx
    EFS_CONFIG:
      - FILESYSTEM_ID: efsid-xxxxxxxxxx
        ACCESS_POINT_ID: fsid-xxxxxxxxx
        VOLUME_NAME: volume_xyz
        ROOTDIRECTORY: /mount/mnt #not use with access_point
     APP_SRC: ./build
     APP_S3_BUCKET: site-devXXX
     CF_DISTRIBUTION_ID: XXXXXXXXXXXXXXX        
        
`;

async function initSample() {
      await fs.writeFileSync('oni.sample.yaml',oni );
      console.log('Please rename oni.sample.yaml to oni.yaml');
}

module.exports = {
    initSample
}

