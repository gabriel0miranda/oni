
const fs = require('fs');

const oni = `
development:
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
       - /dev/null:/dev/xxx
     EFS_CONFIG:
       -  FILESYSTEM_ID: xxsxs-x-x-x-sx-sx-s-xsx-s
          ROOTDIRECTORY: /mount/mnt
  AWS_REGION: us-east-1
  AWS_ACCOUNT: 1111111
  AWS_ROLE: role-name
`;


async function initSample() {
      await fs.writeFileSync('oni.sample.yaml',oni );
      console.log('Please rename oni.sample.yaml to oni.yaml');
}

module.exports = {
    initSample
}

