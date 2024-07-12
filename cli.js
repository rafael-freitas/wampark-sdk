// cli.js
import { Command } from 'commander';
import { startShell } from './commands/shell.js';
import { helpCommand } from './commands/help.js';
import { createCommand } from './commands/create.js';
import { listGateways } from './commands/gw/ls.js';
import { addGateway } from './commands/gw/add.js';
import { deleteGateway } from './commands/gw/del.js';

const program = new Command();

program
  .version('1.0.0')
  .description('CLI para acelerar a geração de código para aplicações utilizando wampark');

program
  .command('help')
  .description('Exibe o help')
  .action(helpCommand);

program
  .command('create <appName>')
  .description('Criar uma aplicação no diretório atual')
  .action(createCommand);

const gw = program.command('gw').description('Gerenciamento de gateways');

gw
  .command('ls')
  .description('Lista as conexões configuradas')
  .action(listGateways);

gw
  .command('add')
  .description('Adiciona uma conexão para um gateway')
  .requiredOption('-h, --host <host>', 'Gateway host')
  .requiredOption('-p, --port <port>', 'Gateway port')
  .requiredOption('-k, --secretKey <secretKey>', 'Gateway secret key')
  .action((options) => addGateway(options));

gw
  .command('del')
  .description('Remove a conexão para o gateway de host <host> e porta <port>')
  .requiredOption('-h, --host <host>', 'Gateway host')
  .requiredOption('-p, --port <port>', 'Gateway port')
  .action((options) => deleteGateway(options));

program
  .command('sh [port] [host]')
  .description('Acessa o shell para o gateway de porta <port> e host [host]')
  .action((port = '5001', host = 'localhost') => startShell(port, host));

program.parse(process.argv);
