import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { CalibrationDeck } from '@app/common';

/** Decks por defecto (los que antes vivían hardcodeados en el frontend). */
const DEFAULT_DECKS: Partial<CalibrationDeck>[] = [
  {
    moduleId: 'gaming_habits',
    title: 'Hábitos de Gaming',
    subtitle: '¿Qué tipo de decisiones y mecánicas prefieres cuando juegas?',
    icon: 'gamepad-2',
    order: 1,
    status: 'activo',
    cards: [
      { id: 'gh1', text: 'Colaborar en equipo para planificar estrategias en tiempo real', category: 'ingenieria' },
      { id: 'gh2', text: 'Analizar mecánicas de juego para encontrar exploits o bugs', category: 'tecnologia' },
      { id: 'gh3', text: 'Calcular el daño óptimo (min-maxing) y estadísticas de personajes', category: 'matematicas' },
      { id: 'gh4', text: 'Disfrutar de juegos de simulación científica o construcción de ciudades', category: 'ciencia' },
      { id: 'gh5', text: 'Crear mods estéticos, skins o mapas personalizados', category: 'artes' },
      { id: 'gh6', text: 'Resolver acertijos lógicos en juegos de aventura o escape room', category: 'ciencia' },
    ],
  },
  {
    moduleId: 'physical_hobbies',
    title: 'Hobbies y Ecosistemas',
    subtitle: '¿Qué actividades físicas o interacciones con el entorno te apasionan?',
    icon: 'leaf',
    order: 2,
    status: 'activo',
    cards: [
      { id: 'ph1', text: 'Cultivar plantas y monitorear su crecimiento según el suelo', category: 'ciencia' },
      { id: 'ph2', text: 'Armar o reparar dispositivos mecánicos en tu tiempo libre', category: 'ingenieria' },
      { id: 'ph3', text: 'Crear ilustraciones físicas, música o esculpir con materiales', category: 'artes' },
      { id: 'ph4', text: 'Analizar el comportamiento de la fauna local o biodiversidad', category: 'ciencia' },
      { id: 'ph5', text: 'Participar en competencias de ajedrez o resolución de problemas matemáticos', category: 'matematicas' },
      { id: 'ph6', text: 'Configurar un servidor casero o red local para compartir archivos', category: 'tecnologia' },
    ],
  },
  {
    moduleId: 'digital_consumption',
    title: 'Consumo Digital',
    subtitle: '¿Qué tipo de contenido e información consumes en tus dispositivos?',
    icon: 'monitor-smartphone',
    order: 3,
    status: 'activo',
    cards: [
      { id: 'dc1', text: 'Ver documentales sobre astronomía, física cuántica o biología', category: 'ciencia' },
      { id: 'dc2', text: 'Seguir tutoriales de programación, automatización o nuevos softwares', category: 'tecnologia' },
      { id: 'dc3', text: 'Consumir contenido de análisis de diseño, animación o artes digitales', category: 'artes' },
      { id: 'dc4', text: 'Seguir creadores que explican fallas de ingeniería o grandes construcciones', category: 'ingenieria' },
      { id: 'dc5', text: 'Leer hilos explicativos sobre criptografía, economía o teoría de juegos', category: 'matematicas' },
      { id: 'dc6', text: 'Investigar cómo funcionan los algoritmos de recomendación en redes sociales', category: 'tecnologia' },
    ],
  },
  {
    moduleId: 'everyday_mechanics',
    title: 'Resolución Doméstica',
    subtitle: '¿Cómo afrontas los retos técnicos y de organización en tu hogar?',
    icon: 'wrench',
    order: 4,
    status: 'activo',
    cards: [
      { id: 'em1', text: 'Reparar electrodomésticos o conexiones eléctricas en el hogar', category: 'ingenieria' },
      { id: 'em2', text: 'Instalar y configurar sistemas de domótica (luces, asistentes de voz)', category: 'tecnologia' },
      { id: 'em3', text: 'Optimizar el consumo de energía y agua analizando los recibos', category: 'matematicas' },
      { id: 'em4', text: 'Decorar, pintar o rediseñar la distribución estética de tu habitación', category: 'artes' },
      { id: 'em5', text: 'Preparar recetas experimentando con proporciones químicas y temperaturas', category: 'ciencia' },
      { id: 'em6', text: 'Diseñar un sistema eficiente de organización o almacenamiento en casa', category: 'ingenieria' },
    ],
  },
];

@Injectable()
export class CalibrationDeckService {
  constructor(
    @InjectRepository(CalibrationDeck)
    private readonly deckRepo: Repository<CalibrationDeck>,
  ) {}

  /** Siembra los decks por defecto si la tabla está vacía. */
  private async ensureSeeded(): Promise<void> {
    const count = await this.deckRepo.count();
    if (count === 0) {
      await this.deckRepo.save(this.deckRepo.create(DEFAULT_DECKS));
    }
  }

  /** Decks activos, ordenados — para el dashboard y el flujo del estudiante. */
  async getActiveDecks() {
    await this.ensureSeeded();
    return this.deckRepo.find({
      where: { status: 'activo' },
      order: { order: 'ASC' },
    });
  }

  async getDeckByModuleId(moduleId: string) {
    await this.ensureSeeded();
    const deck = await this.deckRepo.findOne({ where: { moduleId } });
    if (!deck) throw new RpcException('Módulo de calibración no encontrado');
    return deck;
  }

  // --- Admin ---

  async getAllDecks() {
    await this.ensureSeeded();
    return this.deckRepo.find({ order: { order: 'ASC' } });
  }

  async createDeck(data: Partial<CalibrationDeck>) {
    if (!data.moduleId || !data.title) {
      throw new RpcException('moduleId y title son obligatorios.');
    }
    const exists = await this.deckRepo.findOne({ where: { moduleId: data.moduleId } });
    if (exists) throw new RpcException('Ya existe un módulo con ese moduleId.');
    const deck = this.deckRepo.create({ cards: [], ...data });
    return this.deckRepo.save(deck);
  }

  async updateDeck(id: string, data: Partial<CalibrationDeck>) {
    const deck = await this.deckRepo.findOne({ where: { id } });
    if (!deck) throw new RpcException('Módulo no encontrado');
    // El moduleId es la clave estable de la ruta: no se cambia al editar.
    delete (data as any).id;
    delete (data as any).moduleId;
    Object.assign(deck, data);
    return this.deckRepo.save(deck);
  }

  async deleteDeck(id: string) {
    const deck = await this.deckRepo.findOne({ where: { id } });
    if (!deck) throw new RpcException('Módulo no encontrado');
    await this.deckRepo.remove(deck);
    return { success: true };
  }
}
