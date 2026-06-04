career_simulators_api_spec.md# Reconstrucción de API: Simuladores de Carrera (Career Simulators)

Este documento contiene la especificación con **precisión quirúrgica** para reconstruir el apartado de simuladores de carrera en la API. A continuación, se detallan los contratos (JSON) y comportamientos esperados para los endpoints `GET`, `POST`, `PUT` y `DELETE`.

---

## 1. GET `/api/career-simulators/:slug`

**Propósito:** Devuelve el simulador completo por slug. El frontend usa este JSON para renderizar los 6 pasos sin llamar a IA. La IA solo se invoca en el paso 5 (AI_FEEDBACK) al completar los pasos 2 y 3.

**Comportamiento esperado:**
- **Caché:** Puede cachearse agresivamente (CDN o `Cache-Control: max-age=86400`) porque el contenido es estático y solo cambia si un admin hace `PUT`.
- **Patrón en NestJS:** Debe seguir el mismo patrón que `GET /api/vocational-tests/questions` — devuelve datos de BD directamente, sin procesamiento de IA en tiempo real.
- **HTTP Status:** `200 OK`

**Respuesta Esperada (Ejemplo):**
```json
{
  "_meta": {
    "endpoint": "GET /api/career-simulators/biologia-biomedicina",
    "description": "Devuelve el simulador completo por slug. El frontend usa este JSON para renderizar los 6 pasos sin llamar a IA. La IA solo se invoca en el paso 5 (AI_FEEDBACK) al completar los pasos 2 y 3.",
    "http_status": 200,
    "cache_strategy": "Este endpoint puede cachearse agresivamente (CDN o Cache-Control: max-age=86400) porque el contenido del simulador es estático. Solo cambia si un admin hace PUT.",
    "nestjs_pattern": "Mismo patrón que GET /api/vocational-tests/questions — devuelve datos de BD sin procesamiento IA"
  },
  "id": "a3f9c821-4d17-4e2b-b891-d982c0471fa3",
  "slug": "biologia-biomedicina",
  "career_name": "Biología / Biomedicina",
  "steam_area": "ciencia",
  "estimated_duration_minutes": 6,
  "difficulty": "intermedio",
  "status": "activo",
  "color_token": "#3B82F6",
  "icon": "🔬",
  "short_description": "Descubre si tu forma de pensar encaja con el trabajo real de un científico en salud.",
  "tags": ["laboratorio", "datos", "hipótesis", "salud", "investigación"],
  "total_steps": 6,
  "created_at": "2025-11-10T14:30:00.000Z",
  "updated_at": "2025-11-10T14:30:00.000Z",
  "steps": [
    {
      "order": 1,
      "type": "CONTEXT",
      "title": "El escenario",
      "duration_seconds": 30,
      "ui_hint": "Solo lectura. Mostrar el texto del escenario y el botón CTA. No hay interacción que registrar.",
      "content": {
        "scene": "Son las 9:00 am. Eres epidemióloga en el Centro de Control de Enfermedades de tu estado. Acaban de llegar los datos de monitoreo de las últimas 3 semanas de un brote en 4 ciudades. Tu supervisora necesita un reporte preliminar en 2 horas para enviarlo a las autoridades de salud.",
        "role": "Epidemióloga / Investigadora en Salud Pública",
        "pressure_context": "2 horas para entregar · Datos incompletos de la ciudad D · Tu jefa ya preguntó una vez cómo vas",
        "cta_label": "Entendido, empezar"
      }
    },
    {
      "order": 2,
      "type": "DATA_ANALYSIS",
      "title": "Analiza los datos del brote",
      "duration_seconds": 90,
      "ui_hint": "Renderizar como tabla. Mostrar las 4 opciones como cards seleccionables. Habilitar campo de texto opcional. Botón 'Confirmar' deshabilitado hasta selección. Registrar tiempo desde que el paso se montó hasta que el usuario confirma.",
      "content": {
        "instruction": "Tienes frente a ti los datos de contagios por semana en 4 ciudades. Antes de escribir el reporte, necesitas identificar dónde está el mayor riesgo.",
        "data_type": "TABLE",
        "data": {
          "headers": ["Ciudad", "Semana 1", "Semana 2", "Semana 3", "Población aprox."],
          "rows": [
            { "ciudad": "Ciudad A", "s1": 12,  "s2": 18,  "s3": 22,  "poblacion": "80,000"  },
            { "ciudad": "Ciudad B", "s1": 5,   "s2": 14,  "s3": 41,  "poblacion": "35,000"  },
            { "ciudad": "Ciudad C", "s1": 30,  "s2": 28,  "s3": 25,  "poblacion": "200,000" },
            { "ciudad": "Ciudad D", "s1": 8,   "s2": null, "s3": 19,  "poblacion": "50,000"  }
          ],
          "null_display": "—",
          "null_tooltip": "Sin datos reportados esta semana",
          "footnote": "Casos confirmados por laboratorio. Ciudad D no reportó en semana 2."
        },
        "options": [
          {
            "index": 0,
            "text": "Ciudad A — tiene el mayor número acumulado de casos (52 total)",
            "justification_hint": "¿Por qué te preocupa más el volumen acumulado?",
            "steam_trait_weight": { "ciencia": 3, "tecnologia": 0, "ingenieria": 1, "artes": 0, "matematicas": 2 }
          },
          {
            "index": 1,
            "text": "Ciudad B — su curva casi se triplicó en la semana 3, señal de crecimiento exponencial",
            "justification_hint": "¿Qué indica una curva que se acelera así?",
            "steam_trait_weight": { "ciencia": 5, "tecnologia": 0, "ingenieria": 0, "artes": 0, "matematicas": 3 }
          },
          {
            "index": 2,
            "text": "Ciudad C — tiene la población más grande, cualquier alza ahí impacta más personas",
            "justification_hint": "¿Cómo pesa la densidad poblacional en el riesgo?",
            "steam_trait_weight": { "ciencia": 2, "tecnologia": 0, "ingenieria": 2, "artes": 0, "matematicas": 4 }
          },
          {
            "index": 3,
            "text": "Ciudad D — falta un dato entero de una semana, eso es una alerta roja en sí misma",
            "justification_hint": "¿Por qué el dato faltante puede ser más importante que los datos presentes?",
            "steam_trait_weight": { "ciencia": 4, "tecnologia": 1, "ingenieria": 0, "artes": 0, "matematicas": 2 }
          }
        ],
        "allows_justification_text": true,
        "justification_max_chars": 120,
        "has_single_correct_answer": false
      }
    },
    {
      "order": 3,
      "type": "TRADEOFF_DECISION",
      "title": "Toma la decisión difícil",
      "duration_seconds": 90,
      "ui_hint": "Mostrar las opciones como cards expandibles. Al tocar una card se expande mostrando consecuencias positivas y negativas. Solo una card expandida a la vez. Botón 'Tomar esta decisión' dentro de la card expandida. Al confirmar: micro-animación 1.5s antes de avanzar. Registrar tiempo.",
      "content": {
        "instruction": "El almacén regional solo tiene vacunas para cubrir a 2 de las 4 ciudades en las próximas 48 horas. Las otras 2 tendrán que esperar 5 días más. Tú decides la prioridad.",
        "constraint": "Recursos para 2 ciudades · 48h de ventana · La decisión se envía al Secretario de Salud",
        "options": [
          {
            "index": 0,
            "text": "Ciudad B + Ciudad D",
            "rationale_label": "Controlar el foco de mayor crecimiento y llenar el vacío de información",
            "consequences_positive": [
              "Cortar la curva exponencial de B antes de que escale",
              "Obtener datos reales de D para completar el análisis"
            ],
            "consequences_negative": [
              "Ciudad A acumula más casos sin intervención",
              "Ciudad C, con 200k habitantes, queda expuesta"
            ],
            "steam_trait_weight": { "ciencia": 5, "tecnologia": 0, "ingenieria": 1, "artes": 0, "matematicas": 3 }
          },
          {
            "index": 1,
            "text": "Ciudad C + Ciudad A",
            "rationale_label": "Proteger primero a la mayor cantidad de personas",
            "consequences_positive": [
              "Se protege el 73% de la población total del brote",
              "Reducción inmediata del número absoluto de contagios posibles"
            ],
            "consequences_negative": [
              "Ciudad B sigue creciendo exponencialmente sin control",
              "En 5 días, B podría superar a todas las demás"
            ],
            "steam_trait_weight": { "ciencia": 2, "tecnologia": 0, "ingenieria": 3, "artes": 0, "matematicas": 5 }
          },
          {
            "index": 2,
            "text": "Ciudad B + Ciudad C",
            "rationale_label": "Detener el brote más rápido y proteger la ciudad de mayor impacto potencial",
            "consequences_positive": [
              "Balance entre control del crecimiento y protección masiva",
              "Estrategia más defendible ante las autoridades"
            ],
            "consequences_negative": [
              "Ciudad A y D quedan sin atención inmediata",
              "Ciudad D sigue sin datos confiables"
            ],
            "steam_trait_weight": { "ciencia": 4, "tecnologia": 0, "ingenieria": 2, "artes": 1, "matematicas": 3 }
          },
          {
            "index": 3,
            "text": "Pedir extensión de plazo — necesito los datos de Ciudad D antes de decidir",
            "rationale_label": "No decidir con información incompleta, aunque implique retraso",
            "consequences_positive": [
              "Decisión más informada y metodológicamente correcta",
              "Evita errores por datos faltantes"
            ],
            "consequences_negative": [
              "48h de retraso en cualquier intervención",
              "El brote avanza mientras se espera respuesta burocrática"
            ],
            "steam_trait_weight": { "ciencia": 5, "tecnologia": 0, "ingenieria": 0, "artes": 0, "matematicas": 2 }
          }
        ],
        "allows_justification_text": true,
        "justification_max_chars": 120,
        "has_single_correct_answer": false
      }
    },
    {
      "order": 4,
      "type": "SURPRISE_REVEAL",
      "title": "La realidad de esta carrera",
      "duration_seconds": 30,
      "ui_hint": "Solo lectura. Mostrar el reveal_text en un card con estilo de advertencia (borde ámbar, fondo tintado). Luego el flip_side como sección separada con tono positivo. Botón CTA para continuar.",
      "content": {
        "reveal_text": "El 40% del tiempo real de una epidemióloga se dedica a redactar reportes burocráticos para organismos de salud, llenar formatos federales y justificar metodologías ante comités que no son científicos.",
        "reveal_tone": "honest",
        "follow_up_text": "El trabajo de campo y el análisis de datos —la parte que imaginamos— ocupa menos del 30% de la jornada en la mayoría de las instituciones públicas de salud en México y América Latina.",
        "flip_side": {
          "label": "Pero también esto es real:",
          "text": "Una sola decisión de asignación de recursos, como la que acabas de tomar, puede salvar o costar cientos de vidas. Pocas profesiones tienen esa responsabilidad tan directa."
        },
        "cta_label": "Continuar"
      }
    },
    {
      "order": 5,
      "type": "AI_FEEDBACK",
      "title": "Cómo piensas",
      "duration_seconds": 0,
      "ui_hint": "Mostrar skeleton loader mientras se hace POST a /api/ia/career-simulator-feedback con las decisiones de los pasos 2 y 3. El frontend construye el body del POST con las decisiones almacenadas en el estado de sesión. Mostrar el resultado cuando la IA responde. Si tarda más de 8s o falla, mostrar botón 'Reintentar'.",
      "content": {
        "placeholder": true,
        "ia_endpoint": "POST /api/ia/career-simulator-feedback",
        "ia_request_body_built_from": "SimulatorSessionState.user_decisions (pasos 2 y 3) + avg_response_time + bias_flags",
        "loading_messages": [
          "Analizando cómo tomaste tus decisiones...",
          "Detectando tu estilo de razonamiento...",
          "Preparando tu perfil..."
        ],
        "fields_rendered_from_ia_response": [
          "reasoning_style",
          "steam_affinity_analysis",
          "strengths_detected",
          "honest_reality_check",
          "affinity_score",
          "confidence_level",
          "suggested_next_simulators"
        ]
      }
    },
    {
      "order": 6,
      "type": "EMOTIONAL_REFLECTION",
      "title": "¿Cómo te sentiste?",
      "duration_seconds": 30,
      "ui_hint": "Mostrar la escala de 5 emojis como botones grandes. Al seleccionar uno, activarlo visualmente. Mostrar campo de texto opcional debajo. Botón 'Finalizar simulación' activo desde el inicio (la escala no es obligatoria, pero se recomienda). Al finalizar: guardar en localStorage, navegar a /career-simulator/biologia-biomedicina/result.",
      "content": {
        "instruction": "Ahora que pasaste por las decisiones reales de esta carrera, ¿cómo fue la experiencia?",
        "scale": {
          "type": "labeled_scale",
          "min": 1,
          "max": 5,
          "labels": [
            { "value": 1, "emoji": "😤", "text": "Me frustré rápido, no era lo que esperaba" },
            { "value": 2, "emoji": "😐", "text": "Fue más aburrido de lo que pensaba" },
            { "value": 3, "emoji": "🤔", "text": "Interesante, pero no sé si es para mí" },
            { "value": 4, "emoji": "😮", "text": "Me enganchó más de lo que esperaba" },
            { "value": 5, "emoji": "🔥", "text": "Quiero saber mucho más sobre esto" }
          ]
        },
        "open_question": {
          "text": "¿Hubo algún momento del simulador que te hizo pensar distinto sobre esta carrera? (opcional)",
          "max_chars": 200,
          "required": false
        },
        "steam_trait_weight_by_score": {
          "1": { "ciencia": 0, "tecnologia": 0, "ingenieria": 0, "artes": 0, "matematicas": 0 },
          "2": { "ciencia": 1, "tecnologia": 0, "ingenieria": 0, "artes": 0, "matematicas": 0 },
          "3": { "ciencia": 2, "tecnologia": 0, "ingenieria": 0, "artes": 0, "matematicas": 1 },
          "4": { "ciencia": 4, "tecnologia": 0, "ingenieria": 1, "artes": 0, "matematicas": 2 },
          "5": { "ciencia": 6, "tecnologia": 0, "ingenieria": 1, "artes": 0, "matematicas": 3 }
        },
        "cta_label": "Finalizar simulación"
      }
    }
  ],
  "completion_config": {
    "score_calculation": "Sumar steam_trait_weight de la opción elegida en paso 2 + paso 3 + peso por score emocional en paso 6. Normalizar al 100% por área.",
    "save_to_localstorage_key": "steam_completed_simulators",
    "localstorage_entry_shape": {
      "slug": "biologia-biomedicina",
      "completed_at": "ISO8601",
      "affinity_score": "number (0-100, viene del AI_FEEDBACK)",
      "emotional_score": "number (1-5, viene del paso 6)"
    }
  }
}
```

---

## 2. POST `/api/career-simulators`

**Propósito:** Registra un simulador de carrera completo en la base de datos.
**Comportamiento esperado:**
- Solo puede ser ejecutado por un administrador autenticado.
- No hay intervención de IA en ningún paso de la creación.
- **Entidad NestJS:** `CareerSimulator`
- **Estrategia de guardado:** Los 6 pasos se guardan como un array JSON (`jsonb`) en la columna `steps` de PostgreSQL.
- **HTTP Status (Éxito):** `201 Created`

**Payload Requerido:**
```json
{
  "slug": "biologia-biomedicina",
  "career_name": "Biología / Biomedicina",
  "steam_area": "ciencia",
  "estimated_duration_minutes": 6,
  "difficulty": "intermedio",
  "status": "activo",
  "color_token": "#3B82F6",
  "icon": "🔬",
  "short_description": "Descubre si tu forma de pensar encaja con el trabajo real de un científico en salud.",
  "tags": ["laboratorio", "datos", "hipótesis", "salud", "investigación"],
  "steps": [
    {
      "order": 1,
      "type": "CONTEXT",
      "title": "El escenario",
      "duration_seconds": 30,
      "content": {
        "scene": "Son las 9:00 am. Eres epidemióloga en el Centro de Control de Enfermedades de tu estado. Acaban de llegar los datos de monitoreo de las últimas 3 semanas de un brote en 4 ciudades. Tu supervisora necesita un reporte preliminar en 2 horas para enviarlo a las autoridades de salud.",
        "role": "Epidemióloga / Investigadora en Salud Pública",
        "pressure_context": "2 horas para entregar · Datos incompletos de la ciudad D · Tu jefa ya preguntó una vez cómo vas",
        "cta_label": "Entendido, empezar"
      }
    },
    {
      "order": 2,
      "type": "DATA_ANALYSIS",
      "title": "Analiza los datos del brote",
      "duration_seconds": 90,
      "content": {
        "instruction": "Tienes frente a ti los datos de contagios por semana en 4 ciudades. Antes de escribir el reporte, necesitas identificar dónde está el mayor riesgo.",
        "data_type": "TABLE",
        "data": {
          "headers": ["Ciudad", "Semana 1", "Semana 2", "Semana 3", "Población aprox."],
          "rows": [
            { "ciudad": "Ciudad A", "s1": 12,  "s2": 18,  "s3": 22,  "poblacion": "80,000"  },
            { "ciudad": "Ciudad B", "s1": 5,   "s2": 14,  "s3": 41,  "poblacion": "35,000"  },
            { "ciudad": "Ciudad C", "s1": 30,  "s2": 28,  "s3": 25,  "poblacion": "200,000" },
            { "ciudad": "Ciudad D", "s1": 8,   "s2": null, "s3": 19,  "poblacion": "50,000"  }
          ],
          "null_label": "Sin datos",
          "note": "Los casos son confirmados por laboratorio. Ciudad D no reportó en semana 2."
        },
        "options": [
          {
            "index": 0,
            "text": "Ciudad A — tiene el mayor número acumulado de casos (52 total)",
            "justification_hint": "¿Por qué te preocupa más el volumen acumulado?",
            "steam_trait_weight": { "ciencia": 3, "tecnologia": 0, "ingenieria": 1, "artes": 0, "matematicas": 2 }
          },
          {
            "index": 1,
            "text": "Ciudad B — su curva casi se triplicó en la semana 3, señal de crecimiento exponencial",
            "justification_hint": "¿Qué indica una curva que se acelera así?",
            "steam_trait_weight": { "ciencia": 5, "tecnologia": 0, "ingenieria": 0, "artes": 0, "matematicas": 3 }
          },
          {
            "index": 2,
            "text": "Ciudad C — tiene la población más grande, cualquier alza ahí impacta más personas",
            "justification_hint": "¿Cómo pesa la densidad poblacional en el riesgo?",
            "steam_trait_weight": { "ciencia": 2, "tecnologia": 0, "ingenieria": 2, "artes": 0, "matematicas": 4 }
          },
          {
            "index": 3,
            "text": "Ciudad D — falta un dato entero de una semana, eso es una alerta roja en sí misma",
            "justification_hint": "¿Por qué el dato faltante puede ser más importante que los datos presentes?",
            "steam_trait_weight": { "ciencia": 4, "tecnologia": 1, "ingenieria": 0, "artes": 0, "matematicas": 2 }
          }
        ],
        "allows_justification_text": true,
        "justification_max_chars": 120,
        "has_single_correct_answer": false,
        "evaluator_note": "No hay respuesta incorrecta. Se evalúa el tipo de razonamiento: epidemiológico (B), estadístico (C), metodológico (D) o volumétrico (A)."
      }
    },
    {
      "order": 3,
      "type": "TRADEOFF_DECISION",
      "title": "Toma la decisión difícil",
      "duration_seconds": 90,
      "content": {
        "instruction": "El almacén regional solo tiene vacunas para cubrir a 2 de las 4 ciudades en las próximas 48 horas. Las otras 2 tendrán que esperar 5 días más. Tú decides la prioridad.",
        "constraint": "Recursos para 2 ciudades · 48h de ventana · La decisión se envía al Secretario de Salud",
        "options": [
          {
            "index": 0,
            "text": "Ciudad B + Ciudad D",
            "rationale_label": "Controlar el foco de mayor crecimiento y llenar el vacío de información",
            "consequences_positive": [
              "Cortar la curva exponencial de B antes de que escale",
              "Obtener datos reales de D para completar el análisis"
            ],
            "consequences_negative": [
              "Ciudad A acumula más casos sin intervención",
              "Ciudad C, con 200k habitantes, queda expuesta"
            ],
            "steam_trait_weight": { "ciencia": 5, "tecnologia": 0, "ingenieria": 1, "artes": 0, "matematicas": 3 }
          },
          {
            "index": 1,
            "text": "Ciudad C + Ciudad A",
            "rationale_label": "Proteger primero a la mayor cantidad de personas",
            "consequences_positive": [
              "Se protege el 73% de la población total del brote",
              "Reducción inmediata del número absoluto de contagios posibles"
            ],
            "consequences_negative": [
              "Ciudad B sigue creciendo exponencialmente sin control",
              "En 5 días, B podría superar a todas las demás"
            ],
            "steam_trait_weight": { "ciencia": 2, "tecnologia": 0, "ingenieria": 3, "artes": 0, "matematicas": 5 }
          },
          {
            "index": 2,
            "text": "Ciudad B + Ciudad C",
            "rationale_label": "Detener el brote que crece más rápido y proteger la ciudad de mayor impacto potencial",
            "consequences_positive": [
              "Balance entre control del crecimiento y protección masiva",
              "Estrategia más defendible ante las autoridades"
            ],
            "consequences_negative": [
              "Ciudad A y D quedan sin atención",
              "Ciudad D sigue sin datos confiables"
            ],
            "steam_trait_weight": { "ciencia": 4, "tecnologia": 0, "ingenieria": 2, "artes": 1, "matematicas": 3 }
          },
          {
            "index": 3,
            "text": "Pedir extensión de plazo antes de decidir — necesito los datos de Ciudad D",
            "rationale_label": "No decidir con información incompleta, aunque implique retraso",
            "consequences_positive": [
              "Decisión más informada y metodológicamente correcta",
              "Evita errores por datos faltantes"
            ],
            "consequences_negative": [
              "48h de retraso en cualquier intervención",
              "El brote avanza mientras se espera respuesta burocrática"
            ],
            "steam_trait_weight": { "ciencia": 5, "tecnologia": 0, "ingenieria": 0, "artes": 0, "matematicas": 2 }
          }
        ],
        "allows_justification_text": true,
        "justification_max_chars": 120,
        "has_single_correct_answer": false,
        "evaluator_note": "Opción 0 y 3 revelan pensamiento epidemiológico puro. Opción 1 revela pensamiento estadístico/utilitario. Opción 2 revela pensamiento sistémico/comunicativo."
      }
    },
    {
      "order": 4,
      "type": "SURPRISE_REVEAL",
      "title": "La realidad de esta carrera",
      "duration_seconds": 30,
      "content": {
        "reveal_text": "El 40% del tiempo real de una epidemióloga se dedica a redactar reportes burocráticos para organismos de salud, llenar formatos federales y justificar metodologías ante comités que no son científicos.",
        "reveal_tone": "honest",
        "follow_up_text": "El trabajo de campo y el análisis de datos —la parte que imaginamos— ocupa menos del 30% de la jornada en la mayoría de las instituciones públicas de salud en México y América Latina.",
        "flip_side": {
          "label": "Pero también esto es real:",
          "text": "Una sola decisión de asignación de recursos, como la que acabas de tomar, puede salvar o costar cientos de vidas. Pocas profesiones tienen esa responsabilidad tan directa."
        },
        "cta_label": "Entendido"
      }
    },
    {
      "order": 5,
      "type": "AI_FEEDBACK",
      "title": "Cómo piensas",
      "duration_seconds": 0,
      "content": {
        "placeholder": true,
        "note": "Este paso se genera en runtime por el endpoint POST /api/ia/career-simulator-feedback. El contenido no se almacena en este JSON de definición del simulador. Se genera y retorna al frontend dinámicamente con base en las decisiones del usuario en los pasos 2 y 3.",
        "fields_to_generate": [
          "reasoning_style",
          "steam_affinity_analysis",
          "strengths_detected",
          "honest_reality_check",
          "affinity_score",
          "confidence_level",
          "suggested_next_simulators"
        ]
      }
    },
    {
      "order": 6,
      "type": "EMOTIONAL_REFLECTION",
      "title": "¿Cómo te sentiste?",
      "duration_seconds": 30,
      "content": {
        "instruction": "Ahora que pasaste por las decisiones reales de esta carrera, ¿cómo fue la experiencia?",
        "scale": {
          "type": "labeled_scale",
          "min": 1,
          "max": 5,
          "labels": [
            { "value": 1, "emoji": "😤", "text": "Me frustré rápido, no era lo que esperaba" },
            { "value": 2, "emoji": "😐", "text": "Fue más aburrido de lo que pensaba" },
            { "value": 3, "emoji": "🤔", "text": "Interesante, pero no sé si es para mí" },
            { "value": 4, "emoji": "😮", "text": "Me enganchó más de lo que esperaba" },
            { "value": 5, "emoji": "🔥", "text": "Quiero saber mucho más sobre esto" }
          ]
        },
        "open_question": {
          "text": "¿Hubo algún momento del simulador que te hizo pensar distinto sobre esta carrera? (opcional)",
          "max_chars": 200,
          "required": false
        },
        "steam_trait_weight_by_score": {
          "1": { "ciencia": 0, "tecnologia": 0, "ingenieria": 0, "artes": 0, "matematicas": 0 },
          "2": { "ciencia": 1, "tecnologia": 0, "ingenieria": 0, "artes": 0, "matematicas": 0 },
          "3": { "ciencia": 2, "tecnologia": 0, "ingenieria": 0, "artes": 0, "matematicas": 1 },
          "4": { "ciencia": 4, "tecnologia": 0, "ingenieria": 1, "artes": 0, "matematicas": 2 },
          "5": { "ciencia": 6, "tecnologia": 0, "ingenieria": 1, "artes": 0, "matematicas": 3 }
        }
      }
    }
  ]
}
```

---

## 3. PUT `/api/career-simulators/:id`

**Propósito:** Actualiza un simulador de carrera existente de forma total o parcial.
**Comportamiento esperado:**
- Solo puede ser ejecutado por un administrador autenticado.
- Valida la existencia del ID (`UUID` válido) en la base de datos antes de actualizar.
- El payload sigue la misma estructura que el `POST`, permitiendo la modificación de todos los campos incluyendo el array de `steps`.
- Si se actualiza el `slug`, debe verificar que no colisione con uno ya existente (validación `isUnique`).
- Al actualizar, el campo `updated_at` en base de datos debe actualizarse automáticamente al timestamp actual.
- **HTTP Status (Éxito):** `200 OK` devolviendo el registro actualizado.

**Payload Requerido (Ejemplo de actualización parcial/total):**
*(Idéntico al cuerpo del POST, pero admitiendo omisión de campos en caso de aplicar un `PATCH` o exigiendo el objeto entero si la convención de la API es un `PUT` estricto).*

---

## 4. DELETE `/api/career-simulators/:id`

**Propósito:** Elimina (soft-delete o hard-delete según configuración de BD) un simulador de carrera de la plataforma.
**Comportamiento esperado:**
- Solo puede ser ejecutado por un administrador autenticado.
- Requiere el `:id` del simulador (`UUID`).
- **Validación:** Comprobar si existen registros relacionales importantes amarrados a este simulador antes de borrar (ej. historial de usuarios). De ser así, se recomienda realizar un "Soft Delete" (marcar `status: "inactivo"` o llenar campo `deleted_at`) en lugar de borrar la fila de Postgres para mantener la integridad de los datos históricos.
- **HTTP Status (Éxito):** `200 OK` (retornando mensaje de éxito) o `204 No Content`.

```json
// Respuesta de ejemplo (si aplica)
{
  "message": "Simulador de carrera eliminado correctamente",
  "id": "a3f9c821-4d17-4e2b-b891-d982c0471fa3"
}
```
