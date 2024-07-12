// commands/gw/add.js
import inquirer from 'inquirer';
import { loadConnections, saveConnections } from '../../utils/connections.js';

export async function addGateway(options) {
  const questions = [];

  if (!options.host) {
    questions.push({ name: 'host', message: 'Gateway host:', default: 'localhost' });
  }
  if (!options.port) {
    questions.push({ name: 'port', message: 'Gateway port:', default: 5001 });
  }
  if (!options.secretKey) {
    questions.push({ name: 'secretKey', message: 'Gateway secret key:' });
  }

  const answers = await inquirer.prompt(questions);

  const newConnection = {
    host: options.host || answers.host,
    port: options.port || answers.port,
    secretKey: options.secretKey || answers.secretKey,
  };

  const connections = await loadConnections();
  connections.push(newConnection);
  await saveConnections(connections);
  console.log('Conexão ao gateway salva com sucesso!');
}
