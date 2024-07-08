import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import simpleGit from 'simple-git';
import { randomBytes } from 'crypto';

const git = simpleGit();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const connectionsFilePath = path.join(__dirname, '.connections');


async function loadConnections() {
  if (await fs.pathExists(connectionsFilePath)) {
    return fs.readJson(connectionsFilePath);
  }
  return [];
}

async function saveConnections(connections) {
  await fs.writeJson(connectionsFilePath, connections, { spaces: 2 });
}

async function listGateways() {
  const connections = await loadConnections();
  console.log('Gateways configurados:');
  connections.forEach((conn, index) => {
    console.log(`${index + 1}. ${conn.host}:${conn.port}`);
  });
}

async function connectGateway() {
  const questions = [
    { name: 'host', message: 'Gateway host:', default: 'localhost' },
    { name: 'port', message: 'Gateway port:', default: 5001 },
    { name: 'secretKey', message: 'Gateway secret key:' },
  ];
  const answers = await inquirer.prompt(questions);
  const connections = await loadConnections();
  connections.push(answers);
  await saveConnections(connections);
  console.log('Conexão ao gateway salva com sucesso!');
}

async function deleteGateway() {
  const connections = await loadConnections();
  if (connections.length === 0) {
    console.log('Nenhuma conexão configurada.');
    return;
  }
  const choices = connections.map((conn, index) => ({
    name: `${conn.host}:${conn.port}`,
    value: index,
  }));
  const { index } = await inquirer.prompt([
    { type: 'list', name: 'index', message: 'Escolha uma conexão para excluir:', choices },
  ]);
  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: `Tem certeza que deseja excluir a conexão ${choices[index].name}?` },
  ]);
  if (confirm) {
    connections.splice(index, 1);
    await saveConnections(connections);
    console.log('Conexão excluída com sucesso!');
  }
}

async function getEnvConfig(conn) {
  const response = await axios.get(`http://${conn.host}:${conn.port}/gateway/env`, {
    headers: { 'X-SECRET-KEY': conn.secretKey },
  });
  return response.data;
}

async function getContainers(conn) {
  const response = await axios.get(`http://${conn.host}:${conn.port}/containers`, {
    headers: { 'X-SECRET-KEY': conn.secretKey },
  });
  return response.data.dataset;
}

async function listContainers() {
  const connections = await loadConnections();
  if (connections.length === 0) {
    console.log('Nenhuma conexão configurada.');
    return;
  }
  const choices = connections.map((conn, index) => ({
    name: `${conn.host}:${conn.port}`,
    value: index,
  }));
  const { index } = await inquirer.prompt([
    { type: 'list', name: 'index', message: 'Escolha uma conexão para listar containers:', choices },
  ]);
  const conn = connections[index];
  const containers = await getContainers(conn);
  console.log('Containers:');
  containers.forEach(container => {
    console.log(`ID: ${container._id}, Name: ${container.name}, Port: ${container.port}`);
  });
}

async function addContainer() {
  const connections = await loadConnections();
  if (connections.length === 0) {
    console.log('Nenhuma conexão configurada.');
    return;
  }
  const choices = connections.map((conn, index) => ({
    name: `${conn.host}:${conn.port}`,
    value: index,
  }));
  const { index } = await inquirer.prompt([
    { type: 'list', name: 'index', message: 'Escolha uma conexão para adicionar container:', choices },
  ]);
  const conn = connections[index];

  // Obter a configuração do ambiente do gateway
  const envConfig = await getEnvConfig(conn);
  const dbUriBase = envConfig.DB_URI.split('/').slice(0, 3).join('/');

  const questions = [
    { name: 'CONTAINER_NAME', message: 'Container name:', default: 'My Container' },
    { name: 'CONTAINER_HOST', message: 'Container host:', default: conn.host },
    { name: 'CONTAINER_PATH', message: 'Container path:', default: '/myContainer' },
    { name: 'CONTAINER_STATIC_PATH', message: 'Container static path (default false):', default: false },
    { name: 'CONTAINER_TENANCY', message: 'Enable tenancy (default true):', default: true },
    { name: 'CONTAINER_PROXY_ENABLED', message: 'Enable proxy (default true):', default: true },
    { name: 'CONTAINER_DB_URI', message: 'Container database URL:', default: dbUriBase },
  ];

  let answers = await inquirer.prompt(questions);
  answers.CONTAINER_DIR = `containers/container-${answers.CONTAINER_PATH.replace(/\//g, '')}`;

  const { containerDir } = await inquirer.prompt([
    { name: 'containerDir', message: 'Container directory:', default: answers.CONTAINER_DIR },
  ]);

  // Garantir que o diretório do container seja criado
  await fs.ensureDir(containerDir);

  // Consultar a API do gateway para obter a lista de containers
  const containers = await getContainers(conn);
  const usedPorts = containers.map(container => container.port);
  let containerPort = parseInt(envConfig.HTTP_PORT) * 10 + 1;

  while (usedPorts.includes(containerPort)) {
    containerPort++;
  }

  // Criar o container via API do gateway
  const containerResponse = await axios.post(`http://${conn.host}:${conn.port}/containers`, {
    name: answers.CONTAINER_NAME,
    path: answers.CONTAINER_PATH,
    port: containerPort,
    host: answers.CONTAINER_HOST,
    proxyEnabled: answers.CONTAINER_PROXY_ENABLED
  }, {
    headers: { 'X-SECRET-KEY': conn.secretKey }
  });

  const containerId = containerResponse.data._id;

  // Clonar o repositório de templates
  const repoUrl = 'https://github.com/rafael-freitas/wampark-sdk-templates';
  const tempDir = path.join(process.cwd(), '.dktmp');
  await git.clone(repoUrl, tempDir);

  // Copiar template de container para o diretório especificado pelo usuário
  const containerTemplateDir = path.join(tempDir, 'container');
  await fs.copy(containerTemplateDir, containerDir);

  // Copiar e modificar o arquivo .env do template container
  const containerEnvTemplatePath = path.join(containerTemplateDir, '.env');
  const containerEnvFilePath = path.join(containerDir, '.env.development');

  if (await fs.pathExists(containerEnvTemplatePath)) {
    let envContent = await fs.readFile(containerEnvTemplatePath, 'utf-8');

    // Substituir variáveis pelos valores fornecidos
    envContent = envContent.replaceAll('WAMP_URL_PLACEHOLDER', envConfig.WAMP_URL)
                           .replaceAll('WAMP_REALM_PLACEHOLDER', envConfig.WAMP_REALM)
                           .replaceAll('WAMP_AUTHID_PLACEHOLDER', envConfig.WAMP_AUTHID)
                           .replaceAll('WAMP_AUTHPASS_PLACEHOLDER', envConfig.WAMP_AUTHPASS)
                           .replaceAll('HTTP_PORT_PLACEHOLDER', containerPort)
                           .replaceAll('HTTP_HOST_PLACEHOLDER', answers.CONTAINER_HOST)
                           .replaceAll('DB_URI_PLACEHOLDER', `${answers.CONTAINER_DB_URI}/${answers.CONTAINER_NAME}`)
                           .replaceAll('GATEWAY_URL_PLACEHOLDER', `http://${conn.host}:${conn.port}`)
                           .replaceAll('GATEWAY_SECRET_KEY_PLACEHOLDER', conn.secretKey)
                           .replaceAll('CONTAINER_ID_PLACEHOLDER', containerId);

    await fs.outputFile(containerEnvFilePath, envContent);
  }

  // Remover o diretório temporário
  await fs.remove(tempDir);

  console.log(`Container ${answers.CONTAINER_NAME} criado com sucesso na pasta ${containerDir}!`);
}

async function deleteContainer() {
  const connections = await loadConnections();
  if (connections.length === 0) {
    console.log('Nenhuma conexão configurada.');
    return;
  }
  const choices = connections.map((conn, index) => ({
    name: `${conn.host}:${conn.port}`,
    value: index,
  }));
  const { index } = await inquirer.prompt([
    { type: 'list', name: 'index', message: 'Escolha uma conexão para excluir container:', choices },
  ]);
  const conn = connections[index];
  const containers = await getContainers(conn);
  const containerChoices = containers.map((container, index) => ({
    name: `ID: ${container._id}, Name: ${container.name}, Port: ${container.port}`,
    value: container._id,
  }));
  const { containerId } = await inquirer.prompt([
    { type: 'list', name: 'containerId', message: 'Escolha um container para excluir:', choices: containerChoices },
  ]);
  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: 'Tem certeza que deseja excluir este container?' },
  ]);
  if (confirm) {
    await axios.delete(`http://${conn.host}:${conn.port}/containers/${containerId}`, {
      headers: { 'X-SECRET-KEY': conn.secretKey },
    });
    console.log('Container excluído com sucesso!');
  }
}

async function startShell() {
  while (true) {
    const { command } = await inquirer.prompt([
      {
        type: 'list',
        name: 'command',
        message: 'Escolha uma opção:',
        choices: [
          { name: 'List gateways', value: 'ls gw' },
          { name: 'Connect to gateway', value: 'connect gw' },
          { name: 'Delete gateway connection', value: 'del gw' },
          { name: 'Add container to gateway', value: 'add container' },
          { name: 'List containers', value: 'ls containers' },
          { name: 'Delete container', value: 'del container' },
          { name: 'Exit', value: 'exit' },
        ],
      },
    ]);

    if (command === 'ls gw') {
      await listGateways();
    } else if (command === 'connect gw') {
      await connectGateway();
    } else if (command === 'del gw') {
      await deleteGateway();
    } else if (command === 'add container') {
      await addContainer();
    } else if (command === 'ls containers') {
      await listContainers();
    } else if (command === 'del container') {
      await deleteContainer();
    } else if (command === 'exit') {
      break;
    }
  }
}

export { startShell };
