import { DataSource } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';

const options = {
  type: 'postgres' as const,
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'password',
  database: 'steam_vocations',
  entities: [path.join(__dirname, 'libs/common/src/entities/**/*.ts')],
  synchronize: false,
};

const dataSource = new DataSource(options);

async function generateSql() {
  await dataSource.initialize();
  const sqlInMemory = await dataSource.driver.createSchemaBuilder().log();
  const upQueries = sqlInMemory.upQueries.map(q => q.query + ';').join('\n\n');
  fs.writeFileSync('schema.sql', upQueries);
  console.log('Schema written to schema.sql');
  await dataSource.destroy();
}

generateSql().catch(console.error);
