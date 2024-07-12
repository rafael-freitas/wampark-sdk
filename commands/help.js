// commands/help.js
export function helpCommand() {
  console.log(`
    Comandos disponíveis:
    help - Exibe o help
    create <appName> - Cria uma aplicação no diretório atual
    gw ls - Lista as conexões configuradas
    gw add -h <host> -p <port> -k <secretKey> - Adiciona uma conexão para um gateway
    gw del -h <host> -p <port> - Remove a conexão para o gateway de host <host> e porta <port>
    sh <port> <host> - Acessa o shell para o gateway de porta <port>
  `);
}
