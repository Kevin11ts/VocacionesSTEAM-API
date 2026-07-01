import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import {
  AxisMeta,
  CareerCatalogItem,
  SteamAxis,
  VocationCatalogItem,
} from '@app/common';
import {
  AXES,
  AxisMetaData,
  CareerCatalogEntry,
  DEFAULT_AXIS_META,
  VocationCatalogEntry,
} from './profile-engine';
import {
  DEFAULT_CAREER_CATALOG,
  DEFAULT_VOCATION_CATALOG,
} from './catalog-seed';

/**
 * Administra los catálogos de vocaciones (A6), carreras (A7) y los metadatos
 * narrativos por eje. Siembra los valores por defecto al arrancar si las
 * tablas están vacías; en runtime la BD es la fuente de verdad.
 */
@Injectable()
export class CatalogService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    @InjectRepository(VocationCatalogItem)
    private readonly vocationRepository: Repository<VocationCatalogItem>,
    @InjectRepository(CareerCatalogItem)
    private readonly careerRepository: Repository<CareerCatalogItem>,
    @InjectRepository(AxisMeta)
    private readonly axisMetaRepository: Repository<AxisMeta>,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.seedIfEmpty();
    } catch (error) {
      this.logger.error('No se pudieron sembrar los catálogos', error);
    }
  }

  private async seedIfEmpty() {
    if ((await this.vocationRepository.count()) === 0) {
      for (const axis of AXES) {
        for (const v of DEFAULT_VOCATION_CATALOG[axis]) {
          await this.vocationRepository.save(
            this.vocationRepository.create({ ...v, axis }),
          );
        }
      }
      this.logger.log('Catálogo de vocaciones sembrado (15 entradas)');
    }
    if ((await this.careerRepository.count()) === 0) {
      for (const axis of AXES) {
        for (const c of DEFAULT_CAREER_CATALOG[axis]) {
          await this.careerRepository.save(
            this.careerRepository.create({ ...c, axis }),
          );
        }
      }
      this.logger.log('Catálogo de carreras sembrado (15 entradas)');
    }
    if ((await this.axisMetaRepository.count()) === 0) {
      for (const axis of AXES) {
        await this.axisMetaRepository.save(
          this.axisMetaRepository.create({ axis, ...DEFAULT_AXIS_META[axis] }),
        );
      }
      this.logger.log('Metadatos de ejes sembrados (5 entradas)');
    }
  }

  // --- Lecturas agrupadas por eje (las consume el motor) ---

  async getVocationCatalog(): Promise<Record<SteamAxis, VocationCatalogEntry[]>> {
    const items = await this.vocationRepository.find({
      order: { createdAt: 'ASC' },
    });
    const grouped = this.emptyGroups<VocationCatalogEntry>();
    for (const item of items) {
      grouped[item.axis]?.push({
        name: item.name,
        description: item.description,
        skills: item.skills,
        icon: item.icon,
      });
    }
    return grouped;
  }

  async getCareerCatalog(): Promise<Record<SteamAxis, CareerCatalogEntry[]>> {
    const items = await this.careerRepository.find({
      order: { createdAt: 'ASC' },
    });
    const grouped = this.emptyGroups<CareerCatalogEntry>();
    for (const item of items) {
      grouped[item.axis]?.push({
        careerName: item.careerName,
        studyPlanHighlights: item.studyPlanHighlights,
        careerFields: item.careerFields,
        relatedSimulatorSlug: item.relatedSimulatorSlug ?? undefined,
        icon: item.icon,
      });
    }
    return grouped;
  }

  async getAxisMeta(): Promise<Record<SteamAxis, AxisMetaData>> {
    const rows = await this.axisMetaRepository.find();
    const meta = { ...DEFAULT_AXIS_META };
    for (const row of rows) {
      if (!AXES.includes(row.axis)) continue;
      meta[row.axis] = {
        label: row.label,
        adjective: row.adjective,
        icon: row.icon,
        archetype: row.archetype,
        strengthTitle: row.strengthTitle,
        strengthDesc: row.strengthDesc,
        workStyle: row.workStyle,
      };
    }
    return meta;
  }

  async getFullCatalog() {
    const [vocations, careers, axisMeta] = await Promise.all([
      this.vocationRepository.find({ order: { createdAt: 'ASC' } }),
      this.careerRepository.find({ order: { createdAt: 'ASC' } }),
      this.axisMetaRepository.find(),
    ]);
    return { vocations, careers, axisMeta };
  }

  // --- CRUD de vocaciones (admin) ---

  async createVocation(data: Partial<VocationCatalogItem>) {
    this.assertAxis(data.axis);
    return this.vocationRepository.save(this.vocationRepository.create(data));
  }

  async updateVocation(id: string, data: Partial<VocationCatalogItem>) {
    const item = await this.vocationRepository.findOne({ where: { id } });
    if (!item) throw new RpcException('Vocation not found');
    if (data.axis !== undefined) this.assertAxis(data.axis);
    Object.assign(item, data);
    return this.vocationRepository.save(item);
  }

  async deleteVocation(id: string) {
    const item = await this.vocationRepository.findOne({ where: { id } });
    if (!item) throw new RpcException('Vocation not found');
    await this.vocationRepository.remove(item);
    return { success: true, message: 'Vocation deleted' };
  }

  // --- CRUD de carreras (admin) ---

  async createCareer(data: Partial<CareerCatalogItem>) {
    this.assertAxis(data.axis);
    return this.careerRepository.save(this.careerRepository.create(data));
  }

  async updateCareer(id: string, data: Partial<CareerCatalogItem>) {
    const item = await this.careerRepository.findOne({ where: { id } });
    if (!item) throw new RpcException('Career not found');
    if (data.axis !== undefined) this.assertAxis(data.axis);
    Object.assign(item, data);
    return this.careerRepository.save(item);
  }

  async deleteCareer(id: string) {
    const item = await this.careerRepository.findOne({ where: { id } });
    if (!item) throw new RpcException('Career not found');
    await this.careerRepository.remove(item);
    return { success: true, message: 'Career deleted' };
  }

  // --- AxisMeta (admin) ---

  async updateAxisMeta(axis: SteamAxis, data: Partial<AxisMeta>) {
    this.assertAxis(axis);
    const row = await this.axisMetaRepository.findOne({ where: { axis } });
    if (!row) throw new RpcException('Axis meta not found');
    delete data.axis; // la clave del eje no se cambia
    Object.assign(row, data);
    return this.axisMetaRepository.save(row);
  }

  // --- Utilidades ---

  private assertAxis(axis?: string): asserts axis is SteamAxis {
    if (!axis || !AXES.includes(axis as SteamAxis)) {
      throw new RpcException(
        `Eje STEAM inválido: "${axis}". Válidos: ${AXES.join(', ')} (RG-5)`,
      );
    }
  }

  private emptyGroups<T>(): Record<SteamAxis, T[]> {
    return {
      ciencia: [],
      tecnologia: [],
      ingenieria: [],
      artes: [],
      matematicas: [],
    };
  }
}
