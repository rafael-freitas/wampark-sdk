// commands/gw/ls.js
import { loadConnections } from '../../utils/connections.js';

export async function listGateways() {
  const connections = await loadConnections();
  console.log('Gateways configurados:');
  connections.forEach((conn, index) => {
    console.log(`${index + 1}. ${conn.host}:${conn.port}`);
  });
}
