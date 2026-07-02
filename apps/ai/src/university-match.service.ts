import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { createHash } from 'crypto';
import {
  AiLog,
  University,
  UniversityMatchCache,
  VocationalTest,
  RecommendedCareerInput,
  UniversityCandidate,
  UniversityMatch,
  UniversityMatchRequest,
  UniversityMatchResponse,
} from '@app/common';
import {
  applyFiltersAndSort,
  computeBaseScore,
  findOfferedCareer,
  haversineKm,
  validateAiMatches,
  MAX_DISTANCE_KM,
  ValidatedAiAdjustment,
} from './university-match.engine';

/**
 * A8 — Matching de universidades en 2 capas (arquitectura obligatoria):
 *
 *   CAPA 1 (determinista): match duro por programa en BD, distancia,
 *   costo y baseScore. Corre siempre, sin IA.
 *
 *   CAPA 2 (IA): UNA llamada con la lista candidata; la IA solo ajusta
 *   el baseScore (±10 máx) y redacta la explicación. Salida validada:
 *   universidades fuera de la lista se descartan. El resultado se cachea
 *   y los filtros (km, costo) se aplican sobre el caché al instante.
 */
@Injectable()
export class UniversityMatchService {
  private readonly logger = new Logger(UniversityMatchService.name);
  private readonly gemini: GoogleGenerativeAI;
  private readonly groq: Groq;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(University)
    private readonly universityRepository: Repository<University>,
    @InjectRepository(UniversityMatchCache)
    private readonly cacheRepository: Repository<UniversityMatchCache>,
    @InjectRepository(VocationalTest)
    private readonly testsRepository: Repository<VocationalTest>,
    @InjectRepository(AiLog)
    private readonly aiLogRepository: Repository<AiLog>,
  ) {
    this.gemini = new GoogleGenerativeAI(
      this.configService.get<string>('GEMINI_API_KEY_UNIS') || '',
    );
    this.groq = new Groq({
      apiKey: this.configService.get<string>('GROQ_API_KEY') || '',
    });
  }

  async matchUniversities(
    userId: string,
    request: UniversityMatchRequest,
  ): Promise<UniversityMatchResponse> {
    if (
      !request?.userLocation ||
      typeof request.userLocation.lat !== 'number' ||
      typeof request.userLocation.lng !== 'number'
    ) {
      throw new RpcException('userLocation {lat, lng} es obligatorio');
    }

    const { careers, dominantAxes, calibrationLevel } =
      await this.resolveStudentContext(userId, request);
    if (!careers.length) {
      throw new RpcException(
        'No hay carreras recomendadas: computa el perfil (A7) antes de pedir universidades',
      );
    }

    // ── CAPA 1: candidatas deterministas dentro del radio máximo ─────────
    const candidates = await this.buildCandidates(
      request,
      careers,
    );
    if (!candidates.length) {
      return { matches: [], generatedAt: new Date().toISOString() };
    }

    // ── CAPA 2: una llamada a la IA, cacheada ─────────────────────────────
    const cacheKey = this.buildCacheKey(request, careers, candidates);
    let adjustments = await this.loadCachedAdjustments(userId, cacheKey);
    if (!adjustments) {
      adjustments = await this.requestAiAdjustments(
        userId,
        candidates,
        careers,
        dominantAxes,
        calibrationLevel,
        request,
        cacheKey,
      );
    }

    // ── Ensamble + filtros sobre el caché (sin IA) ────────────────────────
    const matches: UniversityMatch[] = candidates.map((c) => {
      const adjustment = adjustments?.[c.universityId];
      return {
        universityId: c.universityId,
        name: c.name,
        matchedCareer: c.offersCareer,
        matchScore: adjustment?.matchScore ?? c.baseScore,
        distanceKm: c.distanceKm,
        costTier: c.costTier,
        explanation:
          adjustment?.explanation ||
          this.deterministicExplanation(c),
        websiteUrl: c.websiteUrl,
        googleMapsData: { rating: c.rating, address: c.address },
        scoreAdjustmentReason: adjustment?.scoreAdjustmentReason,
      };
    });

    return {
      matches: applyFiltersAndSort(matches, request.filters),
      generatedAt: new Date().toISOString(),
    };
  }

  // ==========================================================================
  //  Contexto del estudiante (carreras A7 + perfil para el prompt)
  // ==========================================================================

  private async resolveStudentContext(
    userId: string,
    request: UniversityMatchRequest,
  ): Promise<{
    careers: RecommendedCareerInput[];
    dominantAxes: string[];
    calibrationLevel: number;
  }> {
    let careers = request.recommendedCareers ?? [];
    let dominantAxes: string[] = [];
    let calibrationLevel = 55;

    const latestTest = await this.testsRepository.findOne({
      where: { user: { id: userId } },
      order: { completedAt: 'DESC' },
    });
    const profile = latestTest?.profile;
    if (profile) {
      dominantAxes = profile.dominantAxes ?? [];
      calibrationLevel = profile.calibration?.level ?? 55;
      if (!careers.length && Array.isArray(profile.recommendedCareers)) {
        careers = profile.recommendedCareers.map((c) => ({
          careerName: c.careerName,
          axis: c.axis,
        }));
      }
    }
    if (!dominantAxes.length) {
      dominantAxes = [...new Set(careers.map((c) => c.axis))];
    }
    return { careers, dominantAxes, calibrationLevel };
  }

  // ==========================================================================
  //  CAPA 1 — candidatas deterministas
  // ==========================================================================

  private async buildCandidates(
    request: UniversityMatchRequest,
    careers: RecommendedCareerInput[],
  ): Promise<UniversityCandidate[]> {
    const universities = await this.universityRepository.find();
    const origin = request.userLocation;
    const candidates: UniversityCandidate[] = [];

    const located = universities.filter((u) => {
      if (
        typeof u.location?.latitude !== 'number' ||
        typeof u.location?.longitude !== 'number'
      ) {
        this.logger.warn(
          `Universidad "${u.name}" sin coordenadas: excluida de A8`,
        );
        return false;
      }
      return true;
    });

    const distances = await this.resolveDistances(origin, located);

    for (const university of located) {
      const offersCareer = findOfferedCareer(university, careers);
      if (!offersCareer) continue; // match duro: si no la ofrece, se excluye

      const distanceKm = distances.get(university.id);
      if (distanceKm === undefined || distanceKm > MAX_DISTANCE_KM) continue;

      // Sin costTier en BD se asume 'affordable' (neutral); el admin debe
      // completar el dato para un ranking más fiel.
      const costTier = university.costTier ?? 'affordable';
      const rating = university.rating ?? undefined;

      candidates.push({
        universityId: university.id,
        name: university.name,
        offersCareer,
        distanceKm,
        costTier,
        tuitionRange: university.tuitionRange ?? 'información no disponible',
        rating,
        modality: university.modality ?? 'información no disponible',
        baseScore: computeBaseScore({
          distanceKm,
          costTier,
          costPreference: request.filters.costPreference,
          rating,
        }),
        websiteUrl: university.website ?? undefined,
        address: university.address ?? undefined,
      });
    }
    return candidates;
  }

  /**
   * Distancias origen→universidades. Usa Google Maps Distance Matrix si hay
   * GOOGLE_MAPS_API_KEY configurada; si no (o si falla), cae a haversine.
   */
  private async resolveDistances(
    origin: { lat: number; lng: number },
    universities: University[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    for (const u of universities) {
      result.set(
        u.id,
        haversineKm(origin, {
          lat: u.location.latitude,
          lng: u.location.longitude,
        }),
      );
    }

    const apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY');
    if (!apiKey) return result;

    try {
      const chunkSize = 25; // límite de destinos por request del API
      for (let i = 0; i < universities.length; i += chunkSize) {
        const chunk = universities.slice(i, i + chunkSize);
        const destinations = chunk
          .map((u) => `${u.location.latitude},${u.location.longitude}`)
          .join('|');
        const url =
          'https://maps.googleapis.com/maps/api/distancematrix/json' +
          `?origins=${origin.lat},${origin.lng}` +
          `&destinations=${encodeURIComponent(destinations)}` +
          `&key=${apiKey}`;
        const response = await fetch(url);
        const data: any = await response.json();
        const elements = data?.rows?.[0]?.elements ?? [];
        chunk.forEach((u, idx) => {
          const element = elements[idx];
          if (element?.status === 'OK' && element.distance?.value >= 0) {
            result.set(
              u.id,
              Math.round((element.distance.value / 1000) * 10) / 10,
            );
          }
        });
      }
    } catch (error) {
      this.logger.warn(
        `Distance Matrix falló, usando haversine: ${error.message}`,
      );
    }
    return result;
  }

  private deterministicExplanation(c: UniversityCandidate): string {
    const tierLabel: Record<string, string> = {
      public: 'pública',
      affordable: 'de costo accesible',
      'private-premium': 'privada',
    };
    return (
      `Ofrece ${c.offersCareer}, es ${tierLabel[c.costTier] ?? c.costTier} ` +
      `y está a ${c.distanceKm} km de ti.`
    );
  }

  // ==========================================================================
  //  CAPA 2 — IA (ranking fino + explicación), cacheada
  // ==========================================================================

  private buildCacheKey(
    request: UniversityMatchRequest,
    careers: RecommendedCareerInput[],
    candidates: UniversityCandidate[],
  ): string {
    const payload = {
      careers: careers.map((c) => c.careerName).sort(),
      location: {
        lat: Math.round(request.userLocation.lat * 1000) / 1000,
        lng: Math.round(request.userLocation.lng * 1000) / 1000,
      },
      candidates: candidates
        .map((c) => `${c.universityId}:${c.baseScore}`)
        .sort(),
    };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private async loadCachedAdjustments(
    userId: string,
    cacheKey: string,
  ): Promise<Record<string, ValidatedAiAdjustment> | null> {
    const row = await this.cacheRepository.findOne({
      where: { userId, cacheKey },
    });
    return row?.aiAdjustments ?? null;
  }

  private async requestAiAdjustments(
    userId: string,
    candidates: UniversityCandidate[],
    careers: RecommendedCareerInput[],
    dominantAxes: string[],
    calibrationLevel: number,
    request: UniversityMatchRequest,
    cacheKey: string,
  ): Promise<Record<string, ValidatedAiAdjustment> | null> {
    const prompt = this.buildPrompt(
      candidates,
      careers,
      dominantAxes,
      calibrationLevel,
      request,
    );

    const providers: Array<{
      name: string;
      call: () => Promise<{ text: string; tokens: number }>;
    }> = [
      { name: 'Gemini', call: () => this.callGemini(prompt) },
      { name: 'Groq', call: () => this.callGroq(prompt) },
    ];

    for (const provider of providers) {
      const startTime = Date.now();
      try {
        const { text, tokens } = await provider.call();
        const cleaned = text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        const validated = validateAiMatches(parsed?.matches ?? [], candidates);

        await this.saveLog(
          userId,
          dominantAxes.join(' + '),
          Date.now() - startTime,
          true,
          '',
          tokens,
          provider.name,
        );

        // Cachear solo resultados exitosos: los filtros posteriores se
        // aplican sobre este caché sin volver a llamar a la IA.
        await this.cacheRepository.save(
          this.cacheRepository.create({
            userId,
            cacheKey,
            aiAdjustments: validated,
            provider: provider.name,
          }),
        );
        return validated;
      } catch (error) {
        this.logger.error(
          `A8 falló con ${provider.name}: ${error.message}`,
        );
        await this.saveLog(
          userId,
          dominantAxes.join(' + '),
          Date.now() - startTime,
          false,
          error.message,
          0,
          provider.name,
        );
      }
    }

    // Degradación limpia: ranking 100% determinista (matchScore = baseScore).
    this.logger.warn('A8 sin IA disponible: se responde solo con baseScore');
    return null;
  }

  private async callGemini(
    prompt: string,
  ): Promise<{ text: string; tokens: number }> {
    const model = this.gemini.getGenerativeModel({
      model: 'gemini-2.0-flash-lite',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });
    const result = await model.generateContent(prompt);
    return {
      text: result.response.text(),
      tokens: result.response.usageMetadata?.totalTokenCount || 0,
    };
  }

  private async callGroq(
    prompt: string,
  ): Promise<{ text: string; tokens: number }> {
    const completion = await this.groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
      max_tokens: 3000,
    });
    return {
      text: completion.choices[0]?.message?.content || '{}',
      tokens: completion.usage?.total_tokens || 0,
    };
  }

  /**
   * Prompt de `algoritmo-universidades-IA.md` (sección 4), usado literal:
   * reglas estrictas + anti-sesgo + entrada JSON + salida JSON estricta.
   */
  private buildPrompt(
    candidates: UniversityCandidate[],
    careers: RecommendedCareerInput[],
    dominantAxes: string[],
    calibrationLevel: number,
    request: UniversityMatchRequest,
  ): string {
    const entrada = {
      studentProfile: {
        dominantAxes,
        calibrationLevel,
      },
      recommendedCareers: careers.map((c) => ({
        careerName: c.careerName,
        axis: c.axis,
      })),
      filters: {
        maxDistanceKm: request.filters.maxDistanceKm,
        costPreference: request.filters.costPreference,
      },
      candidateUniversities: candidates.map((c) => ({
        universityId: c.universityId,
        name: c.name,
        offersCareer: c.offersCareer,
        distanceKm: c.distanceKm,
        costTier: c.costTier,
        tuitionRange: c.tuitionRange,
        rating: c.rating ?? 'información no disponible',
        modality: c.modality,
        baseScore: c.baseScore,
      })),
    };

    return `SISTEMA:
Eres un orientador vocacional imparcial para estudiantes de México. Tu única tarea
es RANKEAR y EXPLICAR universidades de una lista que se te entrega. Trabajas para un
estudiante real que necesita una decisión justa y honesta.

REGLAS ESTRICTAS:
1. SOLO puedes usar universidades de la lista proporcionada. NUNCA inventes
   universidades, carreras, colegiaturas, fechas ni datos que no estén en la lista.
2. Si te falta un dato, dilo explícitamente ("información no disponible"); no lo supongas.
3. El % de match que devuelvas debe partir del "baseScore" dado. Puedes ajustarlo
   como máximo ±10 puntos, y debes justificar el ajuste con datos de la lista.
4. Basa tu razonamiento ÚNICAMENTE en: ajuste del programa a la carrera recomendada,
   distancia, costo, modalidad y rating. NADA más.

ANTI-SESGO (obligatorio):
5. NO favorezcas universidades por prestigio, fama o por ser privadas/caras.
   Una universidad pública o económica que ofrece el mismo programa cerca del
   estudiante es IGUAL o MÁS valiosa.
6. Presenta un balance: no devuelvas solo opciones caras. Si hay opciones
   públicas/accesibles válidas, deben aparecer arriba cuando los datos lo respalden.
7. No asumas el género, nivel socioeconómico, etnia ni capacidades del estudiante.
8. No uses estereotipos de carrera ("esto es para hombres/mujeres", etc.).
9. Si dos universidades empatan en datos, prioriza la más accesible
   económicamente y la más cercana.

ENTRADA (JSON):
${JSON.stringify(entrada, null, 2)}

SALIDA (JSON estricto, sin texto extra):
{
  "matches": [
    {
      "universityId": "uuid",
      "matchScore": 88,
      "explanation": "Explicación de 2-3 frases basada solo en los datos de la lista.",
      "scoreAdjustmentReason": "Justificación del ajuste aplicado sobre el baseScore"
    }
  ]
}`;
  }

  private async saveLog(
    studentName: string,
    detectedProfile: string,
    latency: number,
    success: boolean,
    errorMessage: string,
    tokensConsumed: number,
    provider: string,
  ) {
    try {
      const log = this.aiLogRepository.create({
        studentName,
        detectedProfile,
        latency,
        success,
        errorMessage,
        tokensConsumed,
        provider,
      });
      await this.aiLogRepository.save(log);
    } catch (err) {
      this.logger.error('Error saving AI log', err);
    }
  }
}
