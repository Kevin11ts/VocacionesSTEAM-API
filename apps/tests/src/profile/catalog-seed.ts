import { SteamAxis } from '@app/common';
import { CareerCatalogEntry, VocationCatalogEntry } from './profile-engine';

/**
 * Semilla inicial de los catálogos de vocaciones (A6) y carreras (A7).
 *
 * Los 2 primeros elementos de cada eje son copia literal del catálogo del
 * motor local del frontend; el tercero amplía el catálogo para cumplir el
 * mínimo de 3 por eje que exige el mandato (§11). Los admins pueden
 * editarlos desde el panel: la BD es la fuente en runtime.
 */
export const DEFAULT_VOCATION_CATALOG: Record<
  SteamAxis,
  VocationCatalogEntry[]
> = {
  ciencia: [
    {
      name: 'Investigación biomédica',
      description:
        'Estudiar el cuerpo humano y enfermedades para desarrollar tratamientos y diagnósticos.',
      skills: ['Método científico', 'Análisis de datos', 'Laboratorio'],
      icon: 'microscope',
    },
    {
      name: 'Ciencias ambientales',
      description:
        'Analizar ecosistemas y proponer soluciones sostenibles a problemas ambientales.',
      skills: ['Observación', 'Modelado', 'Trabajo de campo'],
      icon: 'leaf',
    },
    {
      name: 'Salud y nutrición',
      description:
        'Promover el bienestar estudiando la relación entre alimentación, cuerpo y salud.',
      skills: ['Biología', 'Análisis clínico', 'Comunicación'],
      icon: 'heart-pulse',
    },
  ],
  tecnologia: [
    {
      name: 'Desarrollo de software',
      description:
        'Diseñar y construir aplicaciones y sistemas que resuelven problemas reales.',
      skills: ['Programación', 'Lógica', 'Arquitectura de sistemas'],
      icon: 'code-2',
    },
    {
      name: 'Ciberseguridad',
      description:
        'Proteger sistemas e información frente a amenazas digitales.',
      skills: ['Análisis de riesgos', 'Redes', 'Pensamiento adversario'],
      icon: 'shield',
    },
    {
      name: 'Inteligencia artificial y datos',
      description:
        'Crear sistemas que aprenden de los datos para automatizar decisiones y descubrir patrones.',
      skills: ['Machine Learning', 'Programación', 'Estadística'],
      icon: 'bot',
    },
  ],
  ingenieria: [
    {
      name: 'Ingeniería mecatrónica',
      description:
        'Integrar mecánica, electrónica y software para crear sistemas automatizados.',
      skills: ['Diseño', 'Control', 'Prototipado'],
      icon: 'cpu',
    },
    {
      name: 'Ingeniería civil',
      description: 'Planear y construir infraestructura segura y funcional.',
      skills: ['Cálculo estructural', 'Gestión de proyectos', 'Materiales'],
      icon: 'building-2',
    },
    {
      name: 'Energías renovables',
      description:
        'Diseñar e implementar soluciones de generación y uso eficiente de energía limpia.',
      skills: ['Termodinámica', 'Diseño de sistemas', 'Sostenibilidad'],
      icon: 'sun',
    },
  ],
  artes: [
    {
      name: 'Diseño de experiencia (UX/UI)',
      description:
        'Crear productos digitales útiles, usables y atractivos centrados en las personas.',
      skills: ['Investigación de usuarios', 'Prototipado', 'Diseño visual'],
      icon: 'palette',
    },
    {
      name: 'Producción audiovisual',
      description: 'Contar historias con imagen, sonido y movimiento.',
      skills: ['Narrativa', 'Composición', 'Edición'],
      icon: 'clapperboard',
    },
    {
      name: 'Diseño gráfico y comunicación visual',
      description:
        'Construir identidades y mensajes visuales que comunican con claridad e impacto.',
      skills: ['Tipografía', 'Teoría del color', 'Herramientas digitales'],
      icon: 'pen-tool',
    },
  ],
  matematicas: [
    {
      name: 'Ciencia de datos',
      description:
        'Extraer conocimiento de grandes volúmenes de datos para tomar mejores decisiones.',
      skills: ['Estadística', 'Programación', 'Modelado'],
      icon: 'bar-chart-3',
    },
    {
      name: 'Actuaría / finanzas cuantitativas',
      description:
        'Modelar riesgo e incertidumbre para el sector financiero y asegurador.',
      skills: ['Probabilidad', 'Modelos financieros', 'Análisis'],
      icon: 'trending-up',
    },
    {
      name: 'Investigación de operaciones y logística',
      description:
        'Optimizar procesos, rutas y recursos con modelos matemáticos aplicados.',
      skills: ['Optimización', 'Modelado', 'Pensamiento analítico'],
      icon: 'route',
    },
  ],
};

export const DEFAULT_CAREER_CATALOG: Record<SteamAxis, CareerCatalogEntry[]> = {
  ciencia: [
    {
      careerName: 'Médico Cirujano',
      studyPlanHighlights: [
        'Anatomía',
        'Fisiología',
        'Bioquímica',
        'Farmacología',
      ],
      careerFields: ['Hospitales', 'Investigación clínica', 'Salud pública'],
      relatedSimulatorSlug: 'medicina',
      icon: 'stethoscope',
    },
    {
      careerName: 'Biotecnología',
      studyPlanHighlights: [
        'Biología molecular',
        'Genética',
        'Microbiología',
        'Bioprocesos',
      ],
      careerFields: ['Farmacéutica', 'Agroindustria', 'I+D'],
      relatedSimulatorSlug: 'biotecnologia',
      icon: 'dna',
    },
    {
      careerName: 'Química Farmacéutica Biológica',
      studyPlanHighlights: [
        'Química orgánica',
        'Farmacología',
        'Análisis clínicos',
        'Biología celular',
      ],
      careerFields: [
        'Industria farmacéutica',
        'Laboratorios clínicos',
        'Investigación',
      ],
      icon: 'pill',
    },
  ],
  tecnologia: [
    {
      careerName: 'Ingeniería en Software',
      studyPlanHighlights: [
        'Algoritmos',
        'Estructuras de datos',
        'Bases de datos',
        'Ingeniería de software',
      ],
      careerFields: ['Desarrollo web/móvil', 'Startups', 'Cloud'],
      relatedSimulatorSlug: 'software',
      icon: 'code-2',
    },
    {
      careerName: 'Ingeniería en Inteligencia Artificial',
      studyPlanHighlights: [
        'Machine Learning',
        'Álgebra lineal',
        'Procesamiento de datos',
        'Redes neuronales',
      ],
      careerFields: ['IA aplicada', 'Robótica', 'Análisis predictivo'],
      relatedSimulatorSlug: 'inteligencia-artificial-ml',
      icon: 'bot',
    },
    {
      careerName: 'Ingeniería en Ciberseguridad',
      studyPlanHighlights: [
        'Redes',
        'Criptografía',
        'Sistemas operativos',
        'Hacking ético',
      ],
      careerFields: ['Banca', 'Consultoría', 'Gobierno'],
      icon: 'shield',
    },
  ],
  ingenieria: [
    {
      careerName: 'Ingeniería Mecatrónica',
      studyPlanHighlights: [
        'Mecánica',
        'Electrónica',
        'Control',
        'Programación',
      ],
      careerFields: ['Automatización industrial', 'Robótica', 'Manufactura'],
      relatedSimulatorSlug: 'mecatronica',
      icon: 'cpu',
    },
    {
      careerName: 'Ingeniería Civil',
      studyPlanHighlights: [
        'Estática',
        'Resistencia de materiales',
        'Hidráulica',
        'Construcción',
      ],
      careerFields: ['Construcción', 'Infraestructura', 'Consultoría'],
      relatedSimulatorSlug: 'ingenieria-civil',
      icon: 'building-2',
    },
    {
      careerName: 'Ingeniería Industrial',
      studyPlanHighlights: [
        'Procesos',
        'Logística',
        'Calidad',
        'Gestión de operaciones',
      ],
      careerFields: ['Manufactura', 'Cadena de suministro', 'Consultoría'],
      icon: 'factory',
    },
  ],
  artes: [
    {
      careerName: 'Diseño Digital / UX',
      studyPlanHighlights: [
        'Fundamentos de diseño',
        'Investigación UX',
        'Interacción',
        'Prototipado',
      ],
      careerFields: ['Producto digital', 'Agencias', 'Freelance'],
      relatedSimulatorSlug: 'uxui-design',
      icon: 'palette',
    },
    {
      careerName: 'Animación y Medios Digitales',
      studyPlanHighlights: [
        'Dibujo',
        'Modelado 3D',
        'Narrativa',
        'Postproducción',
      ],
      careerFields: ['Cine', 'Videojuegos', 'Publicidad'],
      relatedSimulatorSlug: 'animacion-digital',
      icon: 'clapperboard',
    },
    {
      careerName: 'Arquitectura',
      studyPlanHighlights: [
        'Diseño arquitectónico',
        'Historia del arte',
        'Estructuras',
        'Urbanismo',
      ],
      careerFields: ['Despachos', 'Construcción', 'Diseño urbano'],
      icon: 'landmark',
    },
  ],
  matematicas: [
    {
      careerName: 'Ciencia de Datos',
      studyPlanHighlights: [
        'Estadística',
        'Programación',
        'Minería de datos',
        'Visualización',
      ],
      careerFields: ['Analítica', 'Banca', 'Tecnología'],
      relatedSimulatorSlug: 'ciencia-de-datos',
      icon: 'bar-chart-3',
    },
    {
      careerName: 'Actuaría',
      studyPlanHighlights: [
        'Probabilidad',
        'Estadística',
        'Modelos de riesgo',
        'Finanzas',
      ],
      careerFields: ['Seguros', 'Banca', 'Consultoría'],
      relatedSimulatorSlug: 'actuaria',
      icon: 'trending-up',
    },
    {
      careerName: 'Matemáticas Aplicadas',
      studyPlanHighlights: [
        'Cálculo avanzado',
        'Ecuaciones diferenciales',
        'Optimización',
        'Simulación',
      ],
      careerFields: ['Investigación', 'Tecnología', 'Finanzas'],
      icon: 'sigma',
    },
  ],
};
