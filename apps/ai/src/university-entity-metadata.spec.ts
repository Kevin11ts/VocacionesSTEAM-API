import { DataSource } from 'typeorm';
import { University } from '@app/common';

describe('Metadatos PostgreSQL de University', () => {
  it('construye las columnas nuevas sin inferir tipos Object', async () => {
    const dataSource = new DataSource({
      type: 'postgres',
      entities: [University],
    });

    await (
      dataSource as unknown as { buildMetadatas(): Promise<void> }
    ).buildMetadatas();

    const metadata = dataSource.getMetadata(University);
    expect(
      metadata.findColumnWithPropertyName('programsVerificationSource')?.type,
    ).toBe('varchar');
  });
});
