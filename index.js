#!/usr/bin/env node
const fs = require('fs');
const { DockerBuild, DockerPush } = require('./docker');
const { DeployECS } = require('./ecs');
const {initSample} = require('./utils');

async function init() {

    const argv = require('yargs/yargs')(process.argv.slice(2))
        .usage('Usage: oni <command>  [options]')
        .command('ecs-deploy [options]', 'command for deploy in ecs',
            function (yargs, helpOrVersionSetgs) {
                return yargs.option('name', {
                    alias: 'n',
                    type: 'string',
                    required: true,
                    description: 'Application name defined in oni.yml',
                    default: 'APP_DEFAULT'
                })
                    .option('without-loadbalance', {
                        alias: 'w',
                        type: 'boolean',
                        required: false,
                        description: 'Deploy ecs without loadbalance'
                    })
                    .option('tag', {
                        alias: 't',
                        type: 'string',
                        required: true,
                        description: 'Image tag',
                    })
                    .example('oni ecs-deploy -n MY_APP -i nginx:latest -w')
                    .strictOptions()
            }

        )
        .command('docker <command>', 'docker commands', function (yargs, helpOrVersionSetgs) {
            return yargs.command('build', 'Build docker image', function (yargs, helpOrVersionSetgs) {
                yargs.option('dockerfile', {
                    alias: 'd',
                    type: 'string',
                    required: false,
                    description: 'Dockerfile location',
                    default: './Dockerfile'
                }).option('tag', {
                    alias: 't',
                    type: 'string',
                    required: true,
                    description: 'Image tag',
                })
                    .option('app', {
                        alias: 'a',
                        type: 'string',
                        required: true,
                        description: 'Application name in oni.yml',
                    })
                    .strictOptions()
            })
                .command('push', 'Push image to repository', function (yargs, helpOrVersionSetgs) {
                    return yargs.option('tag', {
                        alias: 't',
                        type: 'string',
                        required: true,
                        description: 'Image tag',
                    })
                        .option('app', {
                            alias: 'a',
                            type: 'string',
                            required: true,
                            description: 'Application name in oni.yml',
                        })
                        .strictOptions()
                })
                .demandCommand(1, 'You need at least one command')
                .recommendCommands()
                .strictCommands()
        })
        .command('init', 'create oni.yaml sample')
        .version('version', 'Show Version', 'Version 0.0.1')
        .alias('version', 'v')
        .demandCommand(1, 'You need at least one command')
        .help()
        .recommendCommands()
        .strictCommands()
        .argv;

    let command = argv["_"];

        if (await fs.existsSync('./oni.yaml')) {
            switch (command[0]) {
                case 'ecs-deploy':
                    await DeployECS(argv.name, argv.tag, argv.w)
                    break;
                case 'docker':
                    switch (command[1]) {
                        case 'build':
                            await DockerBuild(argv.tag, argv.dockerfile, argv.app);
                            break;
                        case 'push':
                            await DockerPush(argv.tag, argv.app);
                            break;
                        default:
                            console.log('Invalid option');
                            break;
                    }
                    break;
                case 'init':
                    await initSample();
                    break;
                default:
                    console.log('Invalid option!')
                    break;
            }
        } else {
            console.error('Erro file oni.yaml not exist.')
            process.exit(1);
        }


        



}

init();