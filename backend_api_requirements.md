# Documentación de Requerimientos Backend (API) 🚀

Este documento detalla **exclusivamente lo que falta por implementar o migrar en el Backend** para que la PWA funcione 100% conectada a una API REST tradicional, eliminando la dependencia de datos estáticos en el Frontend, el uso de Firebase para datos relacionales y el uso de IA en los simuladores.

Esta guía está diseñada para que un desarrollador Backend pueda estructurar los endpoints, lógica y formatos de respuesta necesarios.

---

## 1. Mapa de Universidades 📍

Actualmente, las universidades se están obteniendo directamente de **Firebase Firestore**. Se debe migrar esto para que consuma un endpoint de la API.

### Endpoint Requerido
- `GET /api/universities`

### Lógica
Debe devolver un listado de todas las instituciones educativas guardadas en la base de datos que ofrecen carreras STEAM.

### Formato de Respuesta Esperado (JSON)
```json
[
  {
    "id": "uuid-o-id-numerico",
    "name": "Universidad del Valle",
    "location": {
      "latitude": 14.6038,
      "longitude": -90.4893
    },
    "address": "18 Avenida 11-95, Zona 15, Guatemala",
    "programs": ["Ingeniería en Sistemas", "Mecatrónica"],
    "contactUrl": "https://uvg.edu.gt",
    "logoUrl": "https://link-al-logo.png"
  }
]
```

---

## 2. Tests Complementarios (Calibración) 🧩

En el frontend existen 4 módulos de calibración o "tests complementarios" (*Hábitos de Gaming*, *Hobbies Físicos*, *Consumo Digital*, *Mecánica Cotidiana*). Actualmente, las respuestas de estos tests se guardan **únicamente en el `localStorage`** del navegador y el frontend calcula el peso final.

### Endpoint Requerido
- `POST /api/tests/calibration`
- `GET /api/tests/calibration/:userId`

### Lógica
El backend debe almacenar las respuestas de estos submódulos para cada usuario autenticado. Cuando el usuario envíe el test principal (`POST /api/tests/submit`), el backend debe utilizar estas respuestas guardadas para ajustar la ponderación final de afinidad STEAM en el servidor (en lugar de hacerlo en el frontend).

### Formato de Petición (`POST /api/tests/calibration`)
```json
{
  "userId": "uuid-del-usuario",
  "moduleId": "gaming_habits", 
  "answers": {
    "gh1": "liked",
    "gh2": "disliked",
    "gh3": "skipped"
  }
}
```

---

## 3. Simuladores de Carrera (Experiencia de Usuario) 🎮

Actualmente, toda la data de los simuladores de carrera (las historias, preguntas y opciones) está **quemada en el frontend** (`career-simulators.data.ts`). Además, el feedback final estaba planeado para usar IA. Como el requerimiento cambió a **NO usar IA**, toda la lógica de evaluación debe hacerse en el backend basada en un sistema de puntajes (reglas estáticas).

### Endpoints Requeridos
1. `GET /api/simulators` (Devuelve el catálogo de simuladores disponibles)
2. `GET /api/simulators/:slug` (Devuelve la estructura de un simulador específico)
3. `POST /api/simulators/:slug/submit` (Envía las respuestas del usuario y retorna el resultado matemático/lógico, sin IA).

### Formato de Respuesta para `GET /api/simulators/:slug`
El backend debe devolver la estructura exacta de los 6 pasos:
```json
{
  "careerId": "software-engineering",
  "careerName": "Ingeniería de Software",
  "description": "Enfrenta el colapso de un servidor de pagos en Black Friday...",
  "steamAreaName": "Tecnología",
  "areaClass": "tech-area",
  "areaEmoji": "💻",
  "steps": [
    {
      "id": "step-1-context",
      "type": "CONTEXT",
      "title": "El Incidente",
      "content": "Son las 11:45 PM y los servidores están cayendo..."
    },
    {
      "id": "step-2-decision",
      "type": "TRADEOFF_DECISION",
      "title": "¿Qué haces primero?",
      "content": "Debes elegir una acción inmediata.",
      "options": [
        {
          "id": "opt1",
          "text": "Reiniciar los servidores a lo bruto.",
          "steamTraitWeight": { "tecnologia": 5, "ingenieria": -2 }
        },
        {
          "id": "opt2",
          "text": "Revisar los logs para aislar el problema.",
          "steamTraitWeight": { "tecnologia": 10, "ciencia": 5 }
        }
      ]
    }
    // ... hasta 6 pasos
  ]
}
```

### Lógica para `POST /api/simulators/:slug/submit` (SIN IA)
Al recibir las decisiones del usuario (cuánto tiempo tardó, qué opciones eligió), el backend **NO** llamará a un modelo de lenguaje. En su lugar, deberá:
1. Sumar los `steamTraitWeight` de las opciones elegidas.
2. Calcular una puntuación de afinidad.
3. Devolver textos predefinidos almacenados en la base de datos basados en el puntaje obtenido (ej. si saca > 80% en tecnología, devolver un `feedbackMessage` específico).

### Formato de Respuesta Esperado (Feedback)
```json
{
  "reasoning_style": "Analítico y Cauteloso",
  "steam_affinity_analysis": "Tus decisiones muestran una fuerte inclinación a resolver problemas estructurales...",
  "strengths_detected": ["Análisis de datos bajo presión", "Pensamiento lógico"],
  "honest_reality_check": "Aunque tomas buenas decisiones, podrías mejorar tu velocidad de respuesta.",
  "affinity_score": 85,
  "confidence_level": "high",
  "suggested_next_simulators": ["data-science", "cybersecurity"]
}
```

---

## 4. Administrador: CRUD de Simuladores de Carrera ⚙️

Para que la aplicación sea dinámica, los administradores deben poder crear, editar y eliminar los simuladores de carrera y sus pasos desde el panel de control. Actualmente, este CRUD **no existe ni en Front ni en Back**.

### Endpoints Requeridos (Protegidos para Rol 'admin')
- `GET /api/admin/simulators` (Lista todos los simuladores para la tabla del admin)
- `POST /api/admin/simulators` (Crea un nuevo simulador con sus 6 pasos y opciones)
- `PUT /api/admin/simulators/:id` (Actualiza textos, opciones o pesos de un simulador)
- `DELETE /api/admin/simulators/:id` (Elimina o desactiva un simulador)

### Lógica y Relaciones en Base de Datos
El modelo de base de datos deberá soportar una relación jerárquica:
- **Simulator** (1) -> (N) **Steps**
- **Step** (1) -> (N) **Options**
- **Option** (1) -> (1) **SteamTraitWeights** (Json o tabla relacionada para almacenar los pesos de Ciencia, Tecnología, etc., que aporta cada respuesta).

El backend debe validar que todo simulador que se cree a través del `POST` tenga **exactamente 6 pasos** siguiendo el flujo didáctico establecido (`CONTEXT`, `DATA_ANALYSIS`, `TRADEOFF_DECISION`, `SURPRISE_REVEAL`, `AI_FEEDBACK` -> que ahora será `LOGIC_FEEDBACK`, y `EMOTIONAL_REFLECTION`).
