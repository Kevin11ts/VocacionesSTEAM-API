import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private geminiTests: GoogleGenerativeAI;
  private geminiUnis: GoogleGenerativeAI;
  private groq: Groq;

  constructor(private configService: ConfigService) {
    // TODO: Descomentar cuando se configure billing en Google Cloud
    // this.geminiTests = new GoogleGenerativeAI(
    //   this.configService.get<string>('GEMINI_API_KEY_TESTS') || '',
    // );
    // this.geminiUnis = new GoogleGenerativeAI(
    //   this.configService.get<string>('GEMINI_API_KEY_UNIS') || '',
    // );
    this.groq = new Groq({
      apiKey: this.configService.get<string>('GROQ_API_KEY') || '',
    });
  }

  // TODO: Descomentar cuando se configure billing en Google Cloud
  /*
  async generateRecommendations(
    locationInput: string,
    scores: Record<string, number>,
  ): Promise<{ description: string; universities: any[] }> {
    try {
      this.logger.log('Generando recomendaciones con Gemini 1.5 Flash...');
      const model = this.geminiTests.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: { responseMimeType: 'application/json' },
      });

      const prompt = `
Eres un orientador vocacional experto en áreas STEAM (Ciencia, Tecnología, 
Ingeniería, Arte y Matemáticas) con amplio conocimiento de universidades 
en México.

Un estudiante completó un test vocacional con los siguientes puntajes:
- Ciencia: ${scores['ciencia'] || 0}
- Tecnología: ${scores['tecnologia'] || 0}
- Ingeniería: ${scores['ingenieria'] || 0}
- Arte: ${scores['arte'] || 0}
- Matemáticas: ${scores['matematicas'] || 0}

Ubicación del estudiante: ${locationInput || 'México'}

Tu tarea es:
1. Generar una descripción personalizada del perfil vocacional del estudiante
2. Sugerir universidades reales de México cercanas a su ubicación que 
   tengan carreras afines a su perfil STEAM

Responde ÚNICAMENTE con un JSON válido con esta estructura exacta,
sin texto adicional, sin markdown, sin explicaciones fuera del JSON:

{
  "description": "Descripción personalizada del perfil vocacional del estudiante en 3-4 oraciones. Menciona sus fortalezas STEAM dominantes, cómo se relacionan entre sí y qué tipo de profesional podría llegar a ser. Usa un tono motivador y cercano dirigido al estudiante.",

  "universities": [
    {
      "name": "Nombre completo de la universidad",
      "location": "Ciudad, Estado",
      "suggestedMajor": "Nombre de la carrera sugerida",
      "matchReason": "Explicación de 2-3 oraciones de por qué esta carrera en esta universidad hace match con el perfil del estudiante basándote en sus puntajes STEAM dominantes.",
      "keyDates": "Convocatoria: Mes Año | Examen: Mes Año | Inicio: Mes Año",
      "studyPlan": [
        "Materia o área de estudio 1",
        "Materia o área de estudio 2",
        "Materia o área de estudio 3",
        "Materia o área de estudio 4",
        "Materia o área de estudio 5"
      ],
      "websiteUrl": "https://sitio-oficial-real.edu.mx"
    }
  ]
}

Reglas importantes:
- Incluye exactamente 5 universidades reales de México
- Ordénalas por cercanía a la ubicación del estudiante
- Cada carrera debe estar directamente relacionada con las áreas STEAM donde el estudiante obtuvo mayor puntaje
- studyPlan debe tener entre 4 y 6 materias representativas
- keyDates debe tener fechas aproximadas realistas para 2025-2026
- websiteUrl debe ser el sitio oficial real de la universidad
- El JSON debe ser válido y parseable sin modificaciones
\`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      return JSON.parse(responseText);

    } catch (error) {
      this.logger.error(
        'Error con Gemini Tests, usando fallback Groq...', error
      );
      return this.generateRecommendationsFallback(locationInput, scores);
    }
  }
  */

  async generateRecommendations(
    locationInput: string,
    scores: Record<string, number>,
  ): Promise<{ description: string; universities: any[] }> {
    this.logger.log('Generando recomendaciones con Groq...');
    return this.generateRecommendationsFallback(locationInput, scores);
  }

  private async generateRecommendationsFallback(
    locationInput: string,
    scores: Record<string, number>,
  ): Promise<{ description: string; universities: any[] }> {
    this.logger.log('Usando fallback Groq para recomendaciones...');

    const completion = await this.groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content:
            'Eres un orientador vocacional y experto universitario de alto nivel especializado en áreas STEAM ' +
            '(Ciencia, Tecnología, Ingeniería, Arte y Matemáticas) en México. ' +
            'Tu objetivo es analizar los puntajes de un estudiante y conectarlo con excelentes opciones educativas ' +
            'cercanas a su ubicación. Responde ÚNICAMENTE con JSON válido, sin markdown ni texto adicional.',
        },
        {
          role: 'user',
          content: `Un estudiante completó un test vocacional de 20 preguntas con los siguientes puntajes:
- Ciencia: ${scores['ciencia'] || 0}
- Tecnología: ${scores['tecnologia'] || 0}
- Ingeniería: ${scores['ingenieria'] || 0}
- Arte: ${scores['arte'] || 0}
- Matemáticas: ${scores['matematicas'] || 0}

Ubicación del estudiante (C.P. o Ciudad): ${locationInput || 'México'}

Tu tarea es:
1. Analizar los puntajes para generar un perfil vocacional profesional.
2. Sugerir 5 universidades reales de México que estén lo más cerca posible a la ubicación proporcionada.

Responde ÚNICAMENTE con un JSON válido con esta estructura exacta:

{
  "description": "Descripción profesional del perfil vocacional en 4-5 oraciones. Analiza la combinación de sus puntajes más altos, explica su estilo de pensamiento y resolución de problemas, y describe el tipo de impacto profesional que podría lograr. Mantén un tono inspirador y experto.",
  "universities": [
    {
      "name": "Nombre oficial completo de la universidad",
      "location": "Ciudad, Estado",
      "suggestedMajor": "Nombre de la carrera sugerida",
      "matchReason": "Explicación de 2-3 oraciones de por qué esta universidad y carrera hacen un excelente match con el perfil STEAM del estudiante.",
      "keyDates": "Convocatoria: Mes Año | Examen: Mes Año | Inicio: Mes Año",
      "studyPlan": [
        "Materia representativa 1", "Materia representativa 2", "Materia representativa 3",
        "Materia representativa 4", "Materia representativa 5"
      ],
      "websiteUrl": "https://sitio-oficial-real.edu.mx"
    }
  ]
}

Reglas críticas:
- Incluye exactamente 5 universidades reales de México.
- Asegúrate de que las universidades estén lo más cerca posible de la ubicación: ${locationInput || 'México'}.
- Las carreras sugeridas deben estar alineadas con las áreas STEAM dominantes.
- El JSON debe ser 100% válido y parseable.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 3000,
    });

    const content = completion.choices[0]?.message?.content || '{}';
    return JSON.parse(content);
  }
}
