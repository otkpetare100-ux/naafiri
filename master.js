const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Iniciando Sistema Multiproceso de Naafiri Tracker (API + Bot)...');

// Función para lanzar procesos y mantenerlos vivos
function startProcess(name, command, args) {
  console.log(`[${name}] Lanzando...`);
  const child = spawn(command, args, { stdio: 'inherit' });

  child.on('close', (code) => {
    console.log(`[${name}] El proceso se cerró con código ${code}. Reiniciando en 5s...`);
    setTimeout(() => startProcess(name, command, args), 5000);
  });

  child.on('error', (err) => {
    console.error(`[${name}] Error al lanzar proceso:`, err);
  });

  return child;
}

// Iniciar ambos
startProcess('API', 'node', ['api_server.js']);
startProcess('BOT', 'node', [path.join('bot discord', 'bot.js')]);

