import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { lastValueFrom } from 'rxjs';
import { MatchUniversitiesDto } from '@app/common';

@ApiTags('Universities')
@Controller('universities')
export class UniversitiesController {
  constructor(@Inject('AI_SERVICE') private readonly aiClient: ClientProxy) {}

  @ApiOperation({ summary: 'Get all universities' })
  @ApiResponse({ status: 200, description: 'List of universities' })
  @Get()
  async getUniversities() {
    return lastValueFrom(
      this.aiClient.send({ cmd: 'ai.get-universities' }, {}),
    );
  }

  @ApiOperation({
    summary:
      'A8: matching de universidades (datos duros + IA, filtros sobre caché)',
  })
  @ApiResponse({
    status: 201,
    description: '{ matches: [...], generatedAt } rankeado por matchScore',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiBody({ type: MatchUniversitiesDto })
  @Post('match')
  async matchUniversities(
    @CurrentUser() user: any,
    @Body() body: MatchUniversitiesDto,
  ) {
    return lastValueFrom(
      this.aiClient.send(
        { cmd: 'ai.match-universities' },
        { userId: user.id, request: body },
      ),
    );
  }
}

@ApiTags('Admin Universities')
@ApiBearerAuth()
@Controller('admin/universities')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminUniversitiesController {
  constructor(@Inject('AI_SERVICE') private readonly aiClient: ClientProxy) {}

  @ApiOperation({ summary: 'Create a new university (Admin only)' })
  @ApiResponse({ status: 201, description: 'University created successfully' })
  @ApiBody({
    schema: {
      example: {
        name: 'Universidad Nacional Autónoma de México',
        acronym: 'UNAM',
        type: 'Public',
        website: 'https://www.unam.mx',
        logoUrl: 'https://example.com/logo.png',
        location: { city: 'Mexico City', state: 'CDMX', country: 'Mexico' },
        description: 'La máxima casa de estudios de México.',
        steamCareers: ['Ingeniería en Computación', 'Física', 'Matemáticas'],
        tags: ['public', 'research', 'prestigious'],
      },
    },
  })
  @Post()
  async createUniversity(@Body() data: any) {
    return lastValueFrom(
      this.aiClient.send({ cmd: 'ai.create-university' }, data),
    );
  }

  @ApiOperation({ summary: 'Update a university (Admin only)' })
  @ApiResponse({ status: 200, description: 'University updated successfully' })
  @ApiBody({
    schema: {
      example: {
        description: 'Updated description for this university.',
        steamCareers: [
          'Ingeniería en Computación',
          'Física',
          'Matemáticas',
          'Biología',
        ],
      },
    },
  })
  @Put(':id')
  async updateUniversity(@Param('id') id: string, @Body() data: any) {
    return lastValueFrom(
      this.aiClient.send({ cmd: 'ai.update-university' }, { id, data }),
    );
  }

  @ApiOperation({
    summary: 'Elimina TODAS las universidades (Admin only) — para reiniciar el mapeo',
  })
  @ApiResponse({ status: 200, description: '{ deleted: number }' })
  @Delete('all')
  async deleteAllUniversities() {
    return lastValueFrom(
      this.aiClient.send({ cmd: 'ai.delete-all-universities' }, {}),
    );
  }

  @Delete(':id')
  async deleteUniversity(@Param('id') id: string) {
    return lastValueFrom(
      this.aiClient.send({ cmd: 'ai.delete-university' }, { id }),
    );
  }

  @ApiOperation({
    summary:
      'Descubrimiento automático de universidades vía Google Places (Admin only). ' +
      'Sin "states": corre las 32 capitales + zonas metropolitanas grandes. Con "states": solo esos.',
  })
  @ApiResponse({
    status: 201,
    description:
      '{ totalFound, created, skippedExisting, failed, errors: [{ index, name, error }] }',
  })
  @ApiBody({
    required: false,
    schema: { example: { states: ['Jalisco', 'Nuevo León'] } },
  })
  @Post('discover')
  async discoverUniversities(@Body() body: { states?: string[] }) {
    return lastValueFrom(
      this.aiClient.send(
        { cmd: 'ai.discover-universities' },
        { states: body?.states },
      ),
    );
  }

  @ApiOperation({
    summary:
      'Descubrimiento vía DENUE/INEGI (censo económico oficial, SCIAN 6113 ' +
      'educación superior) — Admin only. Requiere "states" (uno o más).',
  })
  @ApiResponse({
    status: 201,
    description:
      '{ totalFound, created, skippedExisting, failed, errors: [{ index, name, error }] }',
  })
  @ApiBody({
    schema: { example: { states: ['Jalisco'] } },
  })
  @Post('discover-denue')
  async discoverFromDenue(@Body() body: { states: string[] }) {
    return lastValueFrom(
      this.aiClient.send(
        { cmd: 'ai.discover-universities-denue' },
        { states: body?.states },
      ),
    );
  }

  @ApiOperation({
    summary:
      'Carga masiva de universidades (Admin only) — acepta CSV o JSON en el body',
  })
  @ApiResponse({
    status: 201,
    description: '{ created, failed, errors: [{ index, name, error }] }',
  })
  @ApiBody({
    schema: {
      example: {
        csv:
          'name,latitude,longitude,address,website,costTier,tuitionRange,rating,modality,steamPrograms\n' +
          '"Tec de Monterrey",25.6514,-100.2895,"Av. Eugenio Garza Sada 2501",https://tec.mx,private-premium,"$180000-220000 MXN",4.6,presencial,"Ingeniería en Software:tecnologia|Ciencia de Datos:matematicas"',
      },
    },
  })
  @Post('bulk-import')
  async bulkImport(@Body() body: { csv?: string; universities?: any[] }) {
    const rows =
      body.universities ?? (body.csv ? parseUniversitiesCsv(body.csv) : []);
    return lastValueFrom(
      this.aiClient.send({ cmd: 'ai.bulk-create-universities' }, rows),
    );
  }
}

/**
 * Parser de CSV mínimo (sin dependencia externa) para la carga masiva de
 * universidades. Soporta campos entre comillas con comas internas.
 * `steamPrograms` usa el sub-formato "Nombre:area|Nombre2:area2" dentro de
 * su propia celda, ya que es la única columna con estructura anidada.
 */
function parseUniversitiesCsv(csv: string): any[] {
  const lines = csv.split(/\r\n|\n/).filter((line) => line.trim().length);
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        cells.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current);
    return cells.map((c) => c.trim());
  };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
  const numberOrUndefined = (v: string) =>
    v === '' || v === undefined ? undefined : Number(v);

  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, i) => (row[header] = cells[i] ?? ''));

    const lat = numberOrUndefined(row['latitude']);
    const lng = numberOrUndefined(row['longitude']);

    const steamPrograms = (row['steamprograms'] || '')
      .split('|')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [name, area] = entry.split(':').map((s) => s.trim());
        return { name, area };
      });

    return {
      name: row['name'],
      location:
        lat !== undefined && lng !== undefined
          ? { latitude: lat, longitude: lng }
          : undefined,
      address: row['address'] || undefined,
      website: row['website'] || undefined,
      costTier: row['costtier'] || undefined,
      tuitionRange: row['tuitionrange'] || undefined,
      rating: numberOrUndefined(row['rating']),
      modality: row['modality'] || undefined,
      steamPrograms: steamPrograms.length ? steamPrograms : undefined,
    };
  });
}
