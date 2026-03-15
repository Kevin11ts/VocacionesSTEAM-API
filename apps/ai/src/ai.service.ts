import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private genAI: GoogleGenerativeAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY') || 'mock';
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateRecommendations(locationInput: string, scores: Record<string, number>) {
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });

      const prompt = `
      Actúa como un orientador vocacional experto. Tengo un estudiante en "${locationInput || 'México'}".
      Sus fortalezas en el modelo STEAM son:
      Ciencia: ${scores['ciencia'] || 0}/12
      Tecnología: ${scores['tecnologia'] || 0}/12
      Ingeniería: ${scores['ingenieria'] || 0}/12
      Arte: ${scores['arte'] || 0}/12
      Matemáticas: ${scores['matematicas'] || 0}/12

      Genera un JSON estrictamente con la siguiente estructura (NO markdown, SOLO JSON válido):
      {
        "description": "Una breve descripción de 3 líneas sobre el perfil del alumno y por qué encaja en estas áreas.",
        "universities": [
          {
            "name": "Nombre de la universidad real en esa región",
            "location": "Ciudad, Estado",
            "suggestedMajor": "Carrera exacta sugerida",
            "matchReason": "Razón corta de por qué hace match con su perfil",
            "keyDates": "Fechas estimadas de admisión",
            "studyPlan": ["Materia 1", "Materia 2", "Materia 3"],
            "websiteUrl": "URL real de la universidad"
          }
        ]
      }`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      return JSON.parse(responseText);
    } catch (error) {
      this.logger.error('Error in AI Recommendation', error);
      // Respuesta de respaldo para resiliencia
      return {
        description: 'Perfil explorador general debido a fallas de servicio externo. Sigue tus pasiones científicas.',
        universities: []
      };
    }
  }
}
