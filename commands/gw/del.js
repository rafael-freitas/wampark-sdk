// commands/gw/del.js
import inquirer from 'inquirer';
import { loadConnections, saveConnections } from '../../utils/connections.js';

export async function deleteGateway(options) {
  const connections = await loadConnections();
  if (connections.length === 0) {
    console.log('Nenhuma conexão configurada.');
    return;
  }

  const connectionIndex = connections.findIndex(conn => conn.host === options.host && conn.port === options.port);
  if (connectionIndex === -1) {
    console.log(`Nenhuma conexão encontrada para o host ${options.host} e porta ${options.port}.`);
    return;
  }

  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: `Tem certeza que deseja excluir a conexão ${options.host}:${options.port}?` },
  ]);

  if (confirm) {
    connections.splice(connectionIndex, 1);
    await saveConnections(connections);
    console.log('Conexão excluída com sucesso!');
  }
}
