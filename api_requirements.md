# Especificación de API y Backend (PWA Vocaciones STEAM) 🚀

Este documento detalla todo lo que el backend (ya sea en Firebase Cloud Functions, Node.js/Express, Python, etc.) necesita proveer a la aplicación frontend. Está diseñado para que otro desarrollador backend pueda tomarlo y construir la arquitectura, modelos de datos y endpoints necesarios.

> [!IMPORTANT]
> **Consideración Principal:** Toda la lógica de "Simuladores de Carrera" debe estructurarse para funcionar **SIN IA**. Esto significa que las respuestas y el feedback deben predefinirse mediante reglas lógicas en el backend, en lugar de depender de llamadas a Gemini o ChatGPT.

---

## 1. Consideraciones Generales
*   **Autenticación:** Todos los endpoints (excepto los públicos como listar universidades) deben recibir un *Bearer Token* (JWT) provisto por Firebase Auth.
*   **Formato de Respuesta:** Las respuestas deben mantener una estructura estándar:
    ```json
    {
      "success": true,
      "data": { ... },
      "message": "Mensaje opcional"
    }
    ```

---

## 2. Mapa de Universidades 📍

El frontend ya tiene el mapa de Google Maps y puede geolocalizar al usuario. Ahora necesita consumir los datos reales de las instituciones.

### Estructura de Datos (Universidad)
```json
{
  "id": "uuid",
  "name": "Universidad de San Carlos",
  "location": { "latitude": 14.6349, "longitude": -90.5069 },
  "address": "Ciudad Universitaria, Zona 12",
  "website": "https://www.usac.edu.gt",
  "steamPrograms": [
    { "name": "Ingeniería en Sistemas", "area": "Tecnología" },
    { "name": "Biotecnología", "area": "Ciencia" }
  ]
}
```

### Endpoints Necesarios
*   `GET /api/universities` -> Devuelve la lista de universidades activas.
*   **CRUD Admin:**
    *   `POST /api/admin/universities` -> Crear universidad.
    *   `PUT /api/admin/universities/:id` -> Actualizar información o coordenadas.
    *   `DELETE /api/admin/universities/:id` -> Eliminar.

---

## 3. Simuladores de Carrera (SIN IA) 🎮

El frontend define 6 pasos estandarizados (`CONTEXT`, `DATA_ANALYSIS`, `TRADEOFF_DECISION`, `SURPRISE_REVEAL`, `AI_FEEDBACK` -> Ahora será `LOGIC_FEEDBACK`, `EMOTIONAL_REFLECTION`).

Como ya no habrá IA, el backend debe tener un **motor de reglas** predefinidas. En la base de datos, el administrador guardará las opciones y el feedback exacto que corresponde a cada combinación de opciones elegidas por el usuario.

### Estructura de Datos (Simulador)
```json
{
  "careerId": "software-engineering",
  "careerName": "Ingeniería de Software",
  "steamAreaName": "Tecnología",
  "description": "Enfrenta la caída de los servidores de producción.",
  "steps": [
    {
      "id": "step_1",
      "type": "TRADEOFF_DECISION",
      "title": "Decisión Crítica",
      "content": "El servidor de base de datos llegó al 100%. ¿Qué haces?",
      "options": [
        { "id": "opt_A", "text": "Reiniciar el servidor", "value": 10 },
        { "id": "opt_B", "text": "Escalar horizontalmente", "value": 20 }
      ]
    }
    // ... 6 pasos en total
  ],
  "feedbackRules": [
    {
      "condition": { "opt_A": true },
      "feedbackMessage": "Tomaste la salida fácil pero causaste tiempo de inactividad.",
      "strengths": ["Rapidez en crisis"],
      "areasForImprovement": ["Pensamiento a largo plazo"]
    }
  ]
}
```

### Endpoints Necesarios
*   `GET /api/simulators` -> Catálogo de simuladores disponibles.
*   `GET /api/simulators/:id` -> Obtiene los 6 pasos y opciones para pintar en la UI.
*   `POST /api/simulators/:id/evaluate` -> El frontend envía las decisiones del usuario:
    ```json
    {
      "userId": "123",
      "decisions": [
        { "stepId": "step_1", "selectedOptionId": "opt_B", "timeSpentMs": 1400 }
      ]
    }
    ```
    El backend responde calculando el resultado basado en el `feedbackRules`:
    ```json
    {
      "feedbackMessage": "Excelente razonamiento técnico...",
      "strengths": ["Escalabilidad"],
      "affinityScore": { "S": 10, "T": 80, "E": 60, "A": 0, "M": 30 }
    }
    ```
*   **CRUD Admin:**
    *   `POST /api/admin/simulators` -> Interfaz para que el administrador cree la historia y defina el "árbol de decisiones" de las respuestas.

---

## 4. Tests Complementarios (Error Lab, Hobbies, etc.) 🧪

Son encuestas o minijuegos adicionales. El backend necesita proveer las preguntas dinámicamente o, como mínimo, recibir el resultado para guardarlo en el perfil del usuario.

### Estructura de Datos (Test)
```json
{
  "testId": "error-lab",
  "testName": "Laboratorio de Errores",
  "questions": [
    {
      "id": "q1",
      "text": "¿Cómo reaccionas cuando tu código no compila?",
      "options": [
        { "id": "a", "text": "Me frustro", "points": { "resilience": 2 } },
        { "id": "b", "text": "Reviso los logs", "points": { "resilience": 10 } }
      ]
    }
  ]
}
```

### Endpoints Necesarios
*   `GET /api/tests/:testId` -> Obtener configuración del test.
*   `POST /api/tests/:testId/submit` -> Guarda las respuestas del usuario y calcula el puntaje final.
*   **CRUD Admin:**
    *   `POST /api/admin/tests` -> Administrar preguntas y respuestas de los tests.

---

## 5. Panel de Administrador (CRUD Maestro) ⚙️

El backend deberá proporcionar rutas protegidas únicamente para usuarios con el `role: admin`.
Se sugiere estructurar en Firebase asignando un `Custom Claim` al usuario administrador.

*   `GET /api/admin/stats` -> Para el dashboard (Total de usuarios, total de simulaciones completadas, afinidad STEAM más popular).
*   `GET /api/admin/users` -> Listar todos los usuarios y sus historiales.

---

## Resumen de Tareas para el Backend Developer

1.  **Migrar Lógica de IA a Lógica Estática:** Desarrollar un motor de reglas. En vez de llamar a una API de IA en el paso 5 del simulador, el backend debe cruzar las opciones elegidas por el usuario con una tabla de puntajes predefinida para escupir un `SimulatorResult` válido.
2.  **Modelar Colecciones Firestore/SQL:** Crear las tablas/colecciones para `Universities`, `Simulators`, `SimulatorRules`, `Tests` y `UserHistory`.
3.  **Proteger Endpoints de Admin:** Crear middleware que verifique que el JWT provenga de un usuario con privilegios administrativos antes de permitir el CRUD de Simuladores o Universidades.
4.  **Generar Datos Semilla (Seeders):** Proveer un script para inyectar al menos 10 universidades iniciales y 3 simuladores de carrera predefinidos para poder probar la PWA.
