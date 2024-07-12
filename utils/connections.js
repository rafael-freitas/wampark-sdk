// utils/connections.js
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const connectionsFilePath = path.join(__dirname, '.connections');

export async function loadConnections() {
  if (await fs.pathExists(connectionsFilePath)) {
    return fs.readJson(connectionsFilePath);
  }
  return [];
}

export async function saveConnections(connections) {
  await fs.writeJson(connectionsFilePath, connections, { spaces: 2 });
}
