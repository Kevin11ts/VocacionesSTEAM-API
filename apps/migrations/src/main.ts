import dataSource from '../../../libs/common/src/database/typeorm-cli.datasource';

async function run(): Promise<void> {
  await dataSource.initialize();
  try {
    const executed = await dataSource.runMigrations({ transaction: 'all' });
    console.log(
      executed.length === 0
        ? 'Base de datos al día; no hay migraciones pendientes.'
        : `Migraciones aplicadas: ${executed.map((item) => item.name).join(', ')}`,
    );
  } finally {
    await dataSource.destroy();
  }
}

run().catch((error: unknown) => {
  console.error('No fue posible aplicar las migraciones.', error);
  process.exitCode = 1;
});
