const { rmSync } = require('node:fs');
const { resolve, sep } = require('node:path');

const distDirectory = resolve(__dirname, '..', 'dist');
const migrationsBuild = resolve(distDirectory, 'migrations-runtime');

if (!migrationsBuild.startsWith(`${distDirectory}${sep}`)) {
  throw new Error('La ruta de limpieza salió del directorio dist.');
}

rmSync(migrationsBuild, { recursive: true, force: true });
