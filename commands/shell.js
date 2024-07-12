// commands/shell.js
import readline from 'readline';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConnections } from '../utils/connections.js';
import {
  listContainers,
  addContainer,
  deleteContainer,
  listTenants,
  listTenantContainers,
  promptTenantAndListContainers,
  addTenant,
  deleteTenant,
  toggleTenantStatus,
  toggleTenantContainerStatus,
  addTenantContainer,
} from './shellCommands.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = [
  'ls containers',
  'ls tenants',
  'ls tenant containers',
  'add container',
  'add tenant',
  'add tenant-container',
  'del container',
  'del tenant',
  'enable tenant',
  'disable tenant',
  'enable tenant-container',
  'disable tenant-container',
  'help',
  'exit'
];

const historyFilePath = path.resolve(__dirname, '../history.txt');

function completer(line) {
  const hits = commands.filter((c) => c.startsWith(line));
  return [hits.length ? hits : commands, line];
}

function loadHistory() {
  if (fs.existsSync(historyFilePath)) {
    return fs.readFileSync(historyFilePath, 'utf-8').split('\n').filter(Boolean);
  }
  return [];
}

function saveHistory(history) {
  fs.writeFileSync(historyFilePath, history.join('\n'), 'utf-8');
}

async function checkGatewayStatus(conn) {
  try {
    const response = await axios.get(`http://${conn.host}:${conn.port}/healthcheck`);
    return response.data.status;
  } catch (error) {
    return false;
  }
}

function displayHelp() {
  console.log(`
Comandos disponíveis:
  ls containers                    - Lista todos os containers do gateway
  ls tenants                       - Lista todos os tenants
  ls tenant containers <tenantId>  - Lista os containers do tenant especificado
  ls tenant containers             - Mostra um menu com os tenants para selecionar e depois lista os containers
  add container                    - Adiciona um novo container
  del container                    - Remove um container existente
  add tenant                       - Adiciona um novo tenant
  del tenant                       - Remove um tenant existente
  enable tenant                    - Habilita um tenant
  disable tenant                   - Desabilita um tenant
  enable tenant-container          - Habilita um container de tenant
  disable tenant-container         - Desabilita um container de tenant
  add tenant-container             - Adiciona um container a um tenant
  help                             - Mostra os comandos disponíveis
  exit                             - Sai do shell
`);
}

export async function startShell(port, host) {
  const connections = await loadConnections();
  const conn = connections.find(c => c.port === port && c.host === host);

  if (!conn) {
    console.log(`Nenhuma conexão encontrada para o host ${host} e porta ${port}.`);
    return;
  }

  const gatewayStatus = await checkGatewayStatus(conn);
  if (!gatewayStatus) {
    console.log('Gateway está offline. Saindo do shell.');
    return;
  }

  console.log(`Conectado ao gateway ${conn.host}:${conn.port} Status: ${gatewayStatus}`);

  let currentShell;
  let promptActive = false;

  function createGatewayShell() {
    if (currentShell) {
      currentShell.close();
    }

    const history = loadHistory();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `gateway ${host}:${port}> `,
      completer,
      history
    });

    currentShell = rl;

    rl.prompt();

    rl.on('line', async (line) => {
      if (promptActive) return;

      if (line.trim()) {
        history.push(line.trim());
        saveHistory(history);
      }
      
      const [command, ...args] = line.trim().split(' ');

      try {
        switch (command) {
          case 'ls':
            if (args[0] === 'containers') {
              await listContainers(conn);
            } else if (args[0] === 'tenants') {
              await listTenants(conn);
            } else if (args[0] === 'tenant' && args[1] === 'containers') {
              if (args[2]) {
                await listTenantContainers(conn, args[2]);
              } else {
                await promptTenantAndListContainers(conn);
                createGatewayShell();
              }
            } else {
              console.log('Comando desconhecido:', command, args);
            }
            break;
          case 'add':
            if (args[0] === 'container') {
              promptActive = true;
              await addContainer(conn);
              promptActive = false;
            } else if (args[0] === 'tenant') {
              promptActive = true;
              await addTenant(conn);
              promptActive = false;
            } else if (args[0] === 'tenant-container') {
              promptActive = true;
              await addTenantContainer(conn);
              promptActive = false;
            } else {
              console.log('Comando desconhecido:', command, args);
            }
            createGatewayShell();
            break;
          case 'del':
            if (args[0] === 'container') {
              await deleteContainer(conn);
            } else if (args[0] === 'tenant') {
              await deleteTenant(conn);
            } else {
              console.log('Comando desconhecido:', command, args);
            }
            createGatewayShell();
            break;
          case 'enable':
            if (args[0] === 'tenant') {
              await toggleTenantStatus(conn, true);
            } else if (args[0] === 'tenant-container') {
              await toggleTenantContainerStatus(conn, true);
            } else {
              console.log('Comando desconhecido:', command, args);
            }
            createGatewayShell();
            break;
          case 'disable':
            if (args[0] === 'tenant') {
              await toggleTenantStatus(conn, false);
            } else if (args[0] === 'tenant-container') {
              await toggleTenantContainerStatus(conn, false);
            } else {
              console.log('Comando desconhecido:', command, args);
            }
            createGatewayShell();
            break;
          case 'help':
            displayHelp();
            break;
          case 'exit':
            rl.close();
            console.log('Saindo do shell...');
            process.exit(0);
            return;
          default:
            if (command) {
              console.log('Comando desconhecido:', command);
            }
            break;
        }
      } catch (error) {
        console.error('Erro ao executar comando:', error.message);
      }

      rl.prompt();
    }).on('close', () => {
      // console.log('Saindo do shell...');
    });

    return rl;
  }

  createGatewayShell();
}
