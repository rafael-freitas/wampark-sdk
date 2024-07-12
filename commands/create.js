// commands/create.js
import inquirer from 'inquirer';
import simpleGit from 'simple-git';
import fs from 'fs-extra';
import path from 'path';
import { randomBytes } from 'crypto';

const git = simpleGit();

export async function createCommand(appName) {
  const questions = [
    { name: 'HTTP_PORT', message: 'Gateway port:', default: 5001 },
    { name: 'HTTP_HOST', message: 'Gateway host:', default: 'localhost' },
    { name: 'DB_NAME', message: 'Gateway database name:', default: `${appName}_gateway` },
    { name: 'DB_URI', message: 'MongoDB connection string:', default: 'mongodb://localhost:27017' },
    { name: 'WAMP_URL', message: 'Crossbar.io URL:', default: 'ws://localhost:9001/ws' },
    { name: 'WAMP_REALM', message: 'Crossbar.io REALM:', default: 'realm1' },
    { name: 'WAMP_AUTHID', message: 'Crossbar.io AUTHID:' },
    { name: 'WAMP_AUTHPASS', message: 'Crossbar.io AUTHPASS:' },
  ];

  const answers = await inquirer.prompt(questions);

  const repoUrl = 'https://github.com/rafael-freitas/wampark-sdk-templates';
  const tempDir = path.join(process.cwd(), '.dktmp');
  await git.clone(repoUrl, tempDir);

  const appDir = path.join(process.cwd(), appName);
  await fs.copy(path.join(tempDir, 'application'), appDir);
  const gatewayTemplateDir = path.join(tempDir, 'gateway');
  const gatewayDir = path.join(appDir, 'gateway');
  await fs.copy(gatewayTemplateDir, gatewayDir);

  const envTemplatePath = path.join(gatewayTemplateDir, '.env');
  const envFilePath = path.join(gatewayDir, '.env.development');
  
  if (await fs.pathExists(envTemplatePath)) {
    let envContent = await fs.readFile(envTemplatePath, 'utf-8');
    const secretKey = randomBytes(32).toString('hex');
    envContent = envContent.replaceAll('WAMP_URL_PLACEHOLDER', answers.WAMP_URL)
                           .replaceAll('WAMP_REALM_PLACEHOLDER', answers.WAMP_REALM)
                           .replaceAll('WAMP_AUTHID_PLACEHOLDER', answers.WAMP_AUTHID)
                           .replaceAll('WAMP_AUTHPASS_PLACEHOLDER', answers.WAMP_AUTHPASS)
                           .replaceAll('HTTP_PORT_PLACEHOLDER', answers.HTTP_PORT)
                           .replaceAll('HTTP_HOST_PLACEHOLDER', answers.HTTP_HOST)
                           .replaceAll('DB_URI_PLACEHOLDER', `${answers.DB_URI}/${answers.DB_NAME}`)
                           .replaceAll('SECRET_KEY_PLACEHOLDER', secretKey);

    await fs.outputFile(envFilePath, envContent);
  }

  await fs.remove(tempDir);
  await fs.remove(envTemplatePath);

  console.log(`Aplicação ${appName} criada com sucesso!`);
}
