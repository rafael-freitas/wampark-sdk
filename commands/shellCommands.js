// commands/shellCommands.js

import inquirer from 'inquirer';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import simpleGit from 'simple-git';

const git = simpleGit();

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

export async function listContainers(conn) {
  const containers = await getContainers(conn);
  console.log('Containers:');
  containers.forEach(container => {
    console.log(`ID: ${container._id}, Name: ${container.name}, Port: ${container.port}, Active: ${container.active ? 'yes' : 'no'}`);
  });
}

async function getTenants(conn) {
  const response = await axios.get(`http://${conn.host}:${conn.port}/tenant`, {
    headers: { 'X-SECRET-KEY': conn.secretKey },
  });
  return response.data.dataset;
}

export async function addContainer(conn) {
  const envConfig = await getEnvConfig(conn);
  const dbUriBase = envConfig.DB_URI.split('/').slice(0, 3).join('/');

  const questions = [
    { name: 'CONTAINER_NAME', message: 'Container Name:', default: 'My Container' },
    { name: 'CONTAINER_DESCRIPTION', message: 'Container description:', default: 'My Container Description' },
    { name: 'CONTAINER_HOST', message: 'Container host:', default: conn.host },
    { name: 'CONTAINER_PATH', message: 'Container path:', default: 'myContainer' },
    { name: 'CONTAINER_STATIC_PATH', message: 'Container static path (default empty):', default: null },
    { type: 'confirm', name: 'CONTAINER_TENANCY', message: 'Enable tenancy (default true):', default: true },
    { type: 'confirm', name: 'CONTAINER_PROXY_ENABLED', message: 'Enable proxy (default true):', default: true },
    { name: 'CONTAINER_DB_URI', message: 'Container database URL:', default: dbUriBase },
  ];

  let answers = await inquirer.prompt(questions);

  if (!answers.CONTAINER_PATH.startsWith('/')) {
    answers.CONTAINER_PATH = `/${answers.CONTAINER_PATH}`;
  }
  if (answers.CONTAINER_STATIC_PATH && !answers.CONTAINER_STATIC_PATH.startsWith('/')) {
    answers.CONTAINER_STATIC_PATH = `/${answers.CONTAINER_STATIC_PATH}`;
  }

  answers.CONTAINER_DIR = `${answers.CONTAINER_PATH.replace(/\//g, '')}`;

  const { containerDir } = await inquirer.prompt([
    { name: 'containerDir', message: 'Container directory:', default: answers.CONTAINER_DIR },
  ]);

  await fs.ensureDir(containerDir);

  const containers = await getContainers(conn);
  const usedPorts = containers.map(container => container.port);
  let containerPort = parseInt(envConfig.HTTP_PORT) * 10 + 1;

  while (usedPorts.includes(containerPort)) {
    containerPort++;
  }

  const containerResponse = await axios.post(`http://${conn.host}:${conn.port}/containers`, {
    name: answers.CONTAINER_NAME,
    description: answers.CONTAINER_DESCRIPTION,
    path: answers.CONTAINER_PATH,
    staticPath: answers.CONTAINER_STATIC_PATH,
    port: containerPort,
    host: answers.CONTAINER_HOST,
    proxyEnabled: answers.CONTAINER_PROXY_ENABLED,
    tenancyEnabled: answers.CONTAINER_TENANCY,
    dbUri: answers.CONTAINER_DB_URI
  }, {
    headers: { 'X-SECRET-KEY': conn.secretKey }
  });

  const containerId = containerResponse.data._id;

  const repoUrl = 'https://github.com/rafael-freitas/wampark-sdk-templates';
  const tempDir = path.join(process.cwd(), '.dktmp');
  await git.clone(repoUrl, tempDir);

  const containerTemplateDir = path.join(tempDir, 'container');
  await fs.copy(containerTemplateDir, containerDir);

  const containerEnvTemplatePath = path.join(containerTemplateDir, '.env');
  const containerEnvFilePath = path.join(containerDir, '.env.development');

  if (await fs.pathExists(containerEnvTemplatePath)) {
    let envContent = await fs.readFile(containerEnvTemplatePath, 'utf-8');

    envContent = envContent.replaceAll('WAMP_URL_PLACEHOLDER', envConfig.WAMP_URL)
                           .replaceAll('WAMP_REALM_PLACEHOLDER', envConfig.WAMP_REALM)
                           .replaceAll('WAMP_AUTHID_PLACEHOLDER', envConfig.WAMP_AUTHID)
                           .replaceAll('WAMP_AUTHPASS_PLACEHOLDER', envConfig.WAMP_AUTHPASS)
                           .replaceAll('HTTP_PORT_PLACEHOLDER', containerPort)
                           .replaceAll('HTTP_HOST_PLACEHOLDER', answers.CONTAINER_HOST)
                           .replaceAll('DB_URI_PLACEHOLDER', `${answers.CONTAINER_DB_URI}`)
                           .replaceAll('GATEWAY_URL_PLACEHOLDER', `http://${conn.host}:${conn.port}`)
                           .replaceAll('GATEWAY_SECRET_KEY_PLACEHOLDER', conn.secretKey)
                           .replaceAll('CONTAINER_ID_PLACEHOLDER', containerId);

    await fs.outputFile(containerEnvFilePath, envContent);
  }

  await fs.remove(tempDir);

  console.log(`Container ${answers.CONTAINER_NAME} criado com sucesso na pasta ${containerDir}!`);
}

export async function deleteContainer(conn) {
  const containers = await getContainers(conn);
  const containerChoices = containers.map(container => ({
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

export async function listTenants(conn) {
  const tenants = await getTenants(conn);
  console.log('Tenants:');
  tenants.forEach(tenant => {
    console.log(`ID: ${tenant._id}, Name: ${tenant.name}, Domain: ${tenant.domain}`);
  });
}

export async function listTenantContainers(conn, tenantId) {
  try {
    const containers = await getTenantContainers(conn, tenantId);
    console.log('Containers do Tenant:');
    containers.forEach(container => {
      console.log(`ID: ${container._id}, Active: ${container.active}, Installed: ${container.installed}`);
    });
  } catch (error) {
    console.error('Erro ao listar containers do tenant:', error.response ? error.response.data : error.message);
  }
}

export async function promptTenantAndListContainers(conn) {
  const tenants = await getTenants(conn);
  const tenantChoices = tenants.map(tenant => ({
    name: `ID: ${tenant._id}, Name: ${tenant.name}, Domain: ${tenant.domain}`,
    value: tenant._id,
  }));
  const { tenantId } = await inquirer.prompt([
    { type: 'list', name: 'tenantId', message: 'Escolha um tenant para listar os containers:', choices: tenantChoices },
  ]);
  await listTenantContainers(conn, tenantId);
}

export async function addTenant(conn) {
  const questions = [
    { name: 'TENANT_NAME', message: 'Tenant name:', default: 'MyTenant' },
    { name: 'TENANT_DOMAIN', message: 'Tenant domain:', default: 'mytenant.com' },
    { name: 'TENANT_DATABASE_NAME', message: 'Tenant database name:', default: 'mytenant_db' },
  ];

  const answers = await inquirer.prompt(questions);

  const tenantResponse = await axios.post(`http://${conn.host}:${conn.port}/tenant`, {
    name: answers.TENANT_NAME,
    domain: answers.TENANT_DOMAIN,
    databaseName: answers.TENANT_DATABASE_NAME,
  }, {
    headers: { 'X-SECRET-KEY': conn.secretKey }
  });

  console.log(`Tenant ${answers.TENANT_NAME} criado com sucesso!`);
}

export async function deleteTenant(conn) {
  const tenants = await getTenants(conn);
  const tenantChoices = tenants.map(tenant => ({
    name: `ID: ${tenant._id}, Name: ${tenant.name}, Domain: ${tenant.domain}`,
    value: tenant._id,
  }));
  const { tenantId } = await inquirer.prompt([
    { type: 'list', name: 'tenantId', message: 'Escolha um tenant para excluir:', choices: tenantChoices },
  ]);
  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: 'Tem certeza que deseja excluir este tenant?' },
  ]);
  if (confirm) {
    await axios.delete(`http://${conn.host}:${conn.port}/tenant/${tenantId}`, {
      headers: { 'X-SECRET-KEY': conn.secretKey },
    });
    console.log('Tenant excluído com sucesso!');
  }
}

export async function toggleTenantStatus(conn, enable = true) {
  const tenants = await getTenants(conn);
  const tenantChoices = tenants.map(tenant => ({
    name: `ID: ${tenant._id}, Name: ${tenant.name}, Domain: ${tenant.domain}`,
    value: tenant._id,
  }));
  const { tenantId } = await inquirer.prompt([
    { type: 'list', name: 'tenantId', message: `Escolha um tenant para ${enable ? 'habilitar' : 'desabilitar'}:`, choices: tenantChoices },
  ]);
  await axios.put(`http://${conn.host}:${conn.port}/tenant/${tenantId}`, {
    active: enable,
  }, {
    headers: { 'X-SECRET-KEY': conn.secretKey }
  });
  console.log(`Tenant ${enable ? 'habilitado' : 'desabilitado'} com sucesso!`);
}

export async function toggleTenantContainerStatus(conn, enable = true) {
  const tenants = await getTenants(conn);
  const tenantChoices = tenants.map(tenant => ({
    name: `ID: ${tenant._id}, Name: ${tenant.name}, Domain: ${tenant.domain}`,
    value: tenant._id,
  }));
  const { tenantId } = await inquirer.prompt([
    { type: 'list', name: 'tenantId', message: 'Escolha um tenant:', choices: tenantChoices },
  ]);
  const tenant = tenants.find(t => t._id === tenantId);
  if (!tenant.containers || tenant.containers.length === 0) {
    console.log('Nenhum container disponível para este tenant.');
    return;
  }
  const containerChoices = tenant.containers.map(container => ({
    name: `ID: ${container._id}, Container: ${container.container}`,
    value: container._id,
  }));
  const { containerId } = await inquirer.prompt([
    { type: 'list', name: 'containerId', message: `Escolha um container para ${enable ? 'habilitar' : 'desabilitar'}:`, choices: containerChoices },
  ]);
  await axios.put(`http://${conn.host}:${conn.port}/tenant/${tenantId}/containers/${containerId}`, {
    active: enable,
  }, {
    headers: { 'X-SECRET-KEY': conn.secretKey }
  });
  console.log(`Container do tenant ${enable ? 'habilitado' : 'desabilitado'} com sucesso!`);
}

export async function addTenantContainer(conn) {
  const tenants = await getTenants(conn);
  const tenantChoices = tenants.map(tenant => ({
    name: `ID: ${tenant._id}, Name: ${tenant.name}, Domain: ${tenant.domain}`,
    value: tenant._id,
  }));
  const { tenantId } = await inquirer.prompt([
    { type: 'list', name: 'tenantId', message: 'Escolha um tenant:', choices: tenantChoices },
  ]);
  const tenant = tenants.find(t => t._id === tenantId);

  if (!tenant.containers) {
    tenant.containers = []
  }

  const containers = await getContainers(conn);
  const availableContainers = containers.filter(container => !tenant.containers.some(tc => tc.container === container.name));

  if (availableContainers.length === 0) {
    console.log('Nenhum container disponível para adicionar ao tenant.');
    return;
  }

  const containerChoices = availableContainers.map(container => ({
    name: `ID: ${container._id}, Name: ${container.name}`,
    value: container._id,
  }));
  const { containerId } = await inquirer.prompt([
    { type: 'list', name: 'containerId', message: 'Escolha um container para adicionar ao tenant:', choices: containerChoices },
  ]);

  await axios.put(`http://${conn.host}:${conn.port}/tenant/${tenantId}/containers`, {
    container: containerId,
    active: true,
    installed: false
  }, {
    headers: { 'X-SECRET-KEY': conn.secretKey }
  });

  let selectedContainer = containers.find(c => c._id === containerId)

  console.log(`Container [${selectedContainer.name}] adicionado ao tenant [${tenant.name}] com sucesso!`);
}
