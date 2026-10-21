# Design

## Context

El motivo está en proposal.md (Why) y los requisitos en `specs/medicion-agente/spec.md`. Este documento cubre cómo se construye.

Estado al 2026-10-20:

- **v1** (`mcp-tickets`, .NET) corre local en `http://localhost:5003/mcp` con `MCP_FUNCTIONS_FILE=tickets-functions.json` y sin `MCP_INSTRUCTIONS_FILE`. Publica 24 tools y autentica con un JWT obtenido por `client_credentials`, que está en `MEDICION_TOKEN_V1` y dura 15 días.
- **v2** (este repo) se lanza por stdio desde `dist/index.js`. Publica 4 tools, todas de lectura.
- Las dos versiones usan la base `E:\Bases\CREAR_JK3_20261016.fdb` y la identidad `COD_USUARIO = 15169` (`COD_DESARROLLADOR = 100936`).
- `scripts/medir-eficiencia.ts` ya se conecta a las dos versiones (`conectar()`) y mide caracteres. Su línea base del 2026-10-20 está en `medicion/resultados/2026-10-20-1002.md`.
- Lo que cada versión le manda al modelo por turno, contando solo `name`, `description` e `input_schema`: **v1 = 22.582 caracteres** y **v2 = 11.203 caracteres**. El `outputSchema` no llega al modelo (v1 = 1.675 y v2 = 12.576 caracteres).

## Goals / Non-Goals

**Goals:**
- Medir el costo y el tiempo de un agente real con la menor cantidad posible de diferencias entre v1 y v2, salvo las tools.
- Que el reporte se pueda regenerar sin volver a gastar tokens.
- Ver los objetos compuestos que arma el agente para escribir en la v2.

**Non-Goals:**
- Reproducir el prompt de sistema de Claude Desktop o de Claude Code. Las cifras absolutas van a ser menores que en esos clientes, pero la comparación entre versiones sigue siendo válida porque el prompt es el mismo para las dos.
- Medir la latencia real de los SP de escritura, porque se interceptan.
- Evaluar la calidad redaccional de las respuestas, más allá del criterio de éxito de cada caso.

## Decisions

### D1. Loop de agente manual con el SDK de Anthropic

El loop se escribe a mano con `@anthropic-ai/sdk`: se llama a `messages.stream(...)` y se toma `finalMessage()`. Mientras `stop_reason === "tool_use"`, se ejecutan las tools y se vuelve a llamar.

- **Por qué:** hace falta medir cada request y cada tool por separado, interceptar escrituras y hablar con la v2 por stdio local.
- **Alternativas descartadas:**
  - Tool Runner del SDK: oculta los tiempos por turno.
  - Conector MCP de la API (`mcp_servers`): necesita una URL pública y no permite interceptar.
  - Claude Agent SDK: agrega su propio prompt de sistema y sus tools, que contaminan la comparación.

### D2. Parámetros del modelo

| Parámetro | Valor | Motivo |
|---|---|---|
| `model` | `claude-opus-5-5` | Es el modelo que usa el equipo. |
| `output_config.effort` | `"medium"` | Es el default del modelo, pero se fija explícito para que la medición no dependa del default. |
| `thinking` | sin especificar (adaptive) | En Opus 5.5 no se puede desactivar. Se cobra como salida y está incluido en `output_tokens`. |
| `max_tokens` | 16000 | |
| `cache_control` | `{ type: "ephemeral" }` en la raíz | Caché automático, como en los clientes reales. |
| `tool_choice` | `auto` | El forzado devuelve 400 en este modelo. |
| `fallbacks` | **no se usa** | Un fallback a otro modelo contaminaría la medición. Un rechazo (`stop_reason: "refusal"`) marca la corrida como fallida con su motivo. |

El historial **solo se agrega, nunca se edita**: se devuelve `response.content` tal cual en cada turno. Opus 5.5 vincula los bloques de thinking a la conversación.

### D3. Prompt de sistema neutro y fijo

El prompt es corto y el mismo para las dos versiones. Indica que es un asistente de soporte de JKMate, que responde en español, que la fecha es la de la ejecución, y que antes de una escritura no pide confirmación porque el usuario ya la dio en el pedido. No menciona nombres de tools ni pistas sobre cómo usarlas. La fecha va al final del prompt y en formato de día, para no romper el caché entre corridas del mismo día.

### D4. Tools que recibe el modelo

- Se obtienen con `listTools()` de cada servidor y se convierten a `{ name, description, input_schema }`.
- Se ordenan por nombre para que el prefijo cacheado sea estable.
- A la v2 se le agregan las tools de escritura de D7, cargadas de `medicion/agente/escritura-v2.json`.
- El arnés registra el tamaño en caracteres y en tokens (con `count_tokens`) de la lista que recibe el modelo en cada versión, y lo informa en el reporte.

### D5. Resultado de tool = bloques de texto de `content`

Se concatenan los bloques `text` de `content`. Es lo que hace Claude Desktop, y por eso la v2 manda el resumen y el JSON serializado en `content` (principio de diseño 2 en `config.yaml`). `isError: true` se convierte en `tool_result` con `is_error: true`. Las tools que el modelo pide en paralelo en un mismo turno se ejecutan en paralelo y se devuelven todas juntas en un único mensaje.

### D6. Interceptación de escrituras

Las listas son explícitas y se guardan en `medicion/agente/tools.json`:

| Versión | Lectura (se reenvía) | Escritura (se intercepta) |
|---|---|---|
| v1 | `user_info`, `listar_tickets`, `historial_ticket`, `detalle_ticket`, `agendas_ticket`, `presupuestos_ticket`, `buscar_cliente`, `listar_resultados_reclamo`, `listar_categorias_mensaje_reclamo`, `listar_origenes_mensaje`, `listar_desarrolladores`, `listar_tipos_asignacion`, `listar_tareas_desarrollador`, `listar_tareas_responsable`, `listar_comentarios_tarea`, `agenda_usuario`, `agendas_disponibles` | `crear_ticket`, `agregar_mensaje_ticket`, `crear_tarea`, `editar_tarea`, `agregar_comentario_tarea`, `agendar_ticket`, `mover_tarea_tablero` |
| v2 | `obtener_contexto_ticket`, `listar_tickets`, `listar_tareas`, `resumir_tickets` | `crear_tarea`, `actualizar_ticket` (D7) |

Una tool que no está en ninguna lista se intercepta. Así, si la v1 agrega una tool nueva, nunca escribe por accidente.

**Validación:** se usa JSON Schema con `ajv`, contra el `input_schema` publicado de esa tool. Para la v2 de lectura no hace falta, porque esas tools ya validan con zod.

**Plantilla de respuesta:** se toma una respuesta real por tool de escritura. Las de `crear_tarea` y `agregar_mensaje_ticket` de la v1 se obtienen con una única ejecución manual confirmada contra la base de prueba. Se guardan en `medicion/agente/plantillas/`, sin textos de tickets. Los identificadores de la plantilla se reemplazan por valores ficticios crecientes. Para la v2, la respuesta sigue el contrato de la v2: `structuredContent` con `{ id, ... }`, resumen y JSON en `content`.

**Límite conocido:** la v1 real puede rechazar en el SP algo que el JSON Schema acepta (por ejemplo, un `COD_DESARROLLADOR` inexistente). Para que eso no favorezca a ninguna versión, el arnés hace las mismas verificaciones referenciales mínimas en las dos: que el ticket exista y que el desarrollador exista, consultando la base en modo lectura. Si falla alguna, devuelve el error que devolvería el servidor.

### D7. Schemas de escritura de la v2 con objetos compuestos

Siguen el contrato de la v2: camelCase, identidad sacada de la sesión y errores uniformes.

**`crear_tarea`**:

```json
{
  "type": "object",
  "properties": {
    "tarea": {
      "type": "object",
      "properties": {
        "nombre":    { "type": "string", "maxLength": 200 },
        "tipoId":    { "type": "integer", "description": "Tipo de asignación. Omitir si no se conoce." },
        "prioridad": { "type": "integer" }
      },
      "required": ["nombre"]
    },
    "asignacion": {
      "type": "object",
      "properties": {
        "desarrollador": { "$ref": "#/$defs/personaRef" },
        "responsable":   { "$ref": "#/$defs/personaRef" }
      },
      "required": ["desarrollador"]
    },
    "planificacion": {
      "type": "object",
      "properties": {
        "horasEstimadas":  { "type": "integer", "minimum": 1 },
        "fechaCompromiso": { "type": "string", "format": "date" }
      }
    },
    "ticketId": { "type": "integer" },
    "descripcion": {
      "type": "object",
      "properties": {
        "pedido":              { "type": "string" },
        "objetivo":            { "type": "string" },
        "criteriosAceptacion": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
        "objetosAfectados": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "tipo":   { "enum": ["tabla", "procedure", "formulario", "webservice", "reporte"] },
              "nombre": { "type": "string" },
              "accion": { "enum": ["crear", "modificar", "eliminar", "revisar"] }
            },
            "required": ["tipo", "nombre"]
          }
        }
      },
      "required": ["pedido", "criteriosAceptacion"]
    }
  },
  "required": ["tarea", "asignacion", "descripcion"],
  "$defs": {
    "personaRef": {
      "description": "Una persona: \"yo\", { id } si se conoce el código, o { nombre } para que el servidor la busque.",
      "anyOf": [
        { "const": "yo" },
        { "type": "object", "properties": { "id": { "type": "integer" } }, "required": ["id"], "additionalProperties": false },
        { "type": "object", "properties": { "nombre": { "type": "string" } }, "required": ["nombre"], "additionalProperties": false }
      ]
    }
  }
}
```

La v2 no tiene una tool para listar desarrolladores, así que `personaRef` acepta `{ nombre }`. El arnés lo resuelve contra la base:
- Si encuentra un único desarrollador, la escritura es válida.
- Si encuentra varios, devuelve el error `PARAMETRO_INVALIDO` con los candidatos.
- Si no encuentra ninguno, devuelve el error `NO_ENCONTRADO`.

**`actualizar_ticket`** (caso 5):

```json
{
  "type": "object",
  "properties": {
    "ticketId": { "type": "integer" },
    "cambios": {
      "type": "object",
      "properties": {
        "prioridad":  { "enum": ["BAJA", "MEDIA", "ALTA", "URGENTE", "CRITICA"] },
        "sistema":    { "enum": ["JK3", "JK2", "DESKTOP", "CRM"] },
        "asignadoA":  { "$ref": "#/$defs/personaRef" }
      },
      "minProperties": 1
    },
    "mensaje": {
      "type": "object",
      "properties": {
        "texto":   { "type": "string", "maxLength": 3000 },
        "interno": { "type": "boolean", "default": false }
      },
      "required": ["texto"]
    }
  },
  "required": ["ticketId"],
  "anyOf": [{ "required": ["cambios"] }, { "required": ["mensaje"] }]
}
```

En la v1, el mismo caso se resuelve con una sola llamada a `agregar_mensaje_ticket` (`P_NUEVA_PRIORIDAD` + `P_MENSAJE`). Las dos versiones necesitan entonces una sola escritura, y la diferencia queda en la forma de los argumentos y en las lecturas previas.

Estos schemas se usan solo en el arnés. Si después se implementan como tools reales de la v2, se reutilizan tal cual en otro change.

### D8. Verdad de referencia y verificadores

Al empezar la ejecución, el arnés obtiene de la base los datos esperados de cada caso, en modo lectura y usando la capa `src/db` de la v2 con su misma configuración:

| Caso | Datos esperados | Verificador |
|---|---|---|
| 1. Estado de 74836 | estado, resultado e ids de tareas no finalizadas | la respuesta menciona el estado y todos los ids de tareas abiertas |
| 2. Mis tickets agendados | ids de tickets en estado AGENDADO asignados al usuario | están todos los ids, o el total correcto si son más de 25 |
| 3. Mis tareas pendientes | ids de tareas no finalizadas del desarrollador 100936 | ídem |
| 4. Crear tarea | id del desarrollador nombrado en el pedido | hubo una única escritura de creación, con el ticket 74836, ese desarrollador (por id o resuelto por nombre), un nombre no vacío y ≥ 1 criterio (en v1, los criterios tienen que aparecer en `DESCRIPCION`) |
| 5. Prioridad + mensaje | — | hubo una escritura sobre el ticket del caso con prioridad ALTA y un mensaje no vacío |

Se usa la misma referencia para las dos versiones. Los verificadores de escritura traducen los argumentos de cada versión a una forma común: `{ operacion, ticketId, desarrolladorId, nombre, criterios, prioridad, mensaje }`.

Precisiones de la implementación (`scripts/agente/verificacion.ts`):
- Solo cuentan las escrituras que pasaron la validación. Un intento inválido seguido de uno correcto es éxito, y su costo queda en la medición.
- Caso 4 en la v1: hay criterios si la `DESCRIPCION` menciona "criterio" o "aceptación".
- Caso 5: también es éxito si el agente reparte la prioridad y el mensaje en dos escrituras válidas sobre el mismo ticket. Una escritura sobre otro ticket es falla.
- Los ids se reconocen con separador de miles o con `#` (`74.836`, `#74836`).
- Los desarrolladores se resuelven por coincidencia de todas las palabras con `DESARROLLADORES.NOMBRE`, `ALIAS` o el `USUARIOS.NOMBRE` vinculado, solo entre los activos. Una coincidencia exacta tiene prioridad. Como la v2 no tiene un SP de desarrolladores, se leen con una consulta directa en una transacción de solo lectura.

Para los casos 4 y 5 se fija en `casos.json` un desarrollador (con su nombre, tal como lo diría una persona) y un ticket abierto de la base de prueba. Se eligen en la tarea 3.3 y quedan **A CONFIRMAR** por el usuario.

### D9. Caché entre repeticiones

El caché de 5 minutos hace que la primera corrida de cada versión pague la escritura de caché, y las siguientes, si son cercanas, lean del caché. Para que el efecto sea parejo:
- Las repeticiones se intercalan: caso 1 con v1, caso 1 con v2, caso 2 con v1, y así.
- La v1 y la v2 alternan quién va primero en cada repetición.
- El reporte usa la mediana y separa la escritura de caché de la lectura.

Así se refleja el uso real, que es una sesión corta con el caché ya caliente.

### D10. Archivos

```
medicion/agente/
  casos.json            casos, pedidos, desarrollador y ticket de los casos 4-5
  tools.json            listas de lectura/escritura por versión (D6)
  escritura-v2.json     schemas de D7
  plantillas/           respuestas de escritura de v1 y v2
  precios.json          USD por MTok: entrada, salida, lectura y escritura de caché por modelo
  corridas/             registros completos (.jsonl), en .gitignore
  resultados/           AAAA-MM-DD-HHmm.{json,md}
scripts/medir-agente.ts                 CLI: --repeticiones, --casos, --versiones, --tope-usd, --solo-reporte
scripts/agente/                         loop, conexión a las dos versiones, interceptación, verificadores, reporte
```

`conectar()` y `medirResultado()` se sacan de `scripts/medir-eficiencia.ts` a un módulo común. Así no se duplican, y el script actual sigue funcionando igual.

`precios.json` arranca con Opus 5.5: entrada 4, salida 20, lectura de caché 0,20 y escritura de caché de 5 minutos 5,00 USD/MTok (1,25 × entrada). Los valores **se verifican contra la página de precios vigente antes de la primera corrida**.

### D11. Investigación del tamaño del contexto (#74703, #74836)

Es un script de diagnóstico de un solo uso (`scripts/agente/diagnostico-contexto.ts`) que, para cada ticket del conjunto de `medicion-eficiencia`:
- En la v2, desglosa `structuredContent` de `obtener_contexto_ticket` por sección (`ticket`, `historial`, `tareas`, `agendas`, `presupuestos`, `adjuntos`) y, dentro de `historial` y `tareas`, informa la cantidad de elementos y los caracteres de los textos largos (`texto` y `descripcion`).
- En la v1, informa los caracteres y la cantidad de filas de cada una de las 5 llamadas.

Las hipótesis a confirmar o descartar son estas:
1. La v2 trae el historial completo (hasta 50 movimientos) y la v1 menos.
2. La v2 incluye la `descripcion` completa de las tareas.
3. El `content` de la v2 duplica el JSON junto al resumen.

El hallazgo se documenta en la sección "Hallazgos" de este design, con una tabla por ticket. Si la causa es un defecto de diseño de `contexto-ticket` (información que el agente no necesita), se abre un change aparte y se mide el agente **antes y después**.

### D12. Estimador sin API (agregado el 2026-10-20)

El jefe de proyecto necesita por ahora un aproximado en función de la cantidad de tokens, y no hay credenciales de la API. El estimador (`npm run estimar:agente`) simula la conversación sin modelo. Reutiliza la conexión a v1 y v2, el interceptor (D6), las tools del modelo (D4), los casos y `precios.json`.

**Guiones fijos** (`medicion/agente/guiones.json`): por caso y versión, la secuencia de turnos con las llamadas y los argumentos que usaría un agente razonable. Las llamadas de un mismo turno van en paralelo.

| Caso | v1 | v2 |
|---|---|---|
| 1. Estado del ticket | `detalle_ticket` → `historial_ticket`, `agendas_ticket`, `presupuestos_ticket` y `listar_tareas_responsable` en paralelo → respuesta (3 turnos) | `obtener_contexto_ticket` → respuesta (2 turnos) |
| 2. Mis tickets agendados | `listar_tickets` → respuesta | `listar_tickets` → respuesta |
| 3. Mis tareas pendientes | `listar_tareas_desarrollador` → respuesta | `listar_tareas` → respuesta |
| 4. Crear tarea | `listar_desarrolladores` → `crear_tarea` → respuesta (3 turnos) | `crear_tarea` con `{ nombre }` → respuesta (2 turnos) |
| 5. Prioridad y mensaje | `agregar_mensaje_ticket` → respuesta | `actualizar_ticket` → respuesta |

Los argumentos de lectura repiten los de `medicion/tickets.json` cuando el caso coincide. Las escrituras pasan por el interceptor, y un guion cuya escritura no valida es un error del guion.

**Entrada de cada turno** = prompt de tool use que agrega la API (constante e igual para las dos versiones) + tools + sistema + historial. El resultado de cada tool son los bloques de texto de `content` (D5).

**Caché.** Se calculan dos escenarios:
- **Sesión caliente** (principal, como en D9): las tools y el sistema ya están en caché, y se leen. En cada turno se lee de la caché el prefijo del request anterior y se escribe lo nuevo. Solo el pedido del primer turno es entrada sin caché.
- **Sin caché** (cota superior): toda la entrada se paga como entrada normal.

**Salida de cada turno** = argumentos de las llamadas (caracteres ÷ razón) + un supuesto fijo de thinking por turno + un supuesto fijo para la respuesta final en el último turno. Los dos supuestos son iguales para las dos versiones, así que la diferencia de salida sale de la cantidad de turnos y de los argumentos. La salida de cada turno vuelve a entrar como historial en los turnos siguientes. Del thinking solo vuelve lo que la API conserva, que se estima en cero.

**Configuración** (`medicion/agente/estimacion.json`): la razón de caracteres por token (3,5 por defecto), el supuesto de thinking por turno, el supuesto de respuesta final y los tokens del prompt de tool use. Si aparecen credenciales, la razón se calibra una vez con `count_tokens` sobre las mismas tools y respuestas.

**Reporte**: `medicion/agente/estimaciones/AAAA-MM-DD-HHmm.{json,md}`, por caso y versión: turnos, tokens de entrada sin caché, de lectura y de escritura de caché, tokens de salida y costo, en los dos escenarios. Incluye el total por versión, la diferencia v1 → v2 y un rango con razones de 3 y de 4 caracteres por token. El reporte declara que es una estimación y sus supuestos.

**Límites**: no se miden el thinking real, el largo real de las respuestas, las llamadas de más ni los reintentos. Tampoco la tasa de éxito, así que no hay costo por tarea bien resuelta. Esas cifras las da el arnés con agente (D1–D10) cuando haya credenciales.

## Risks / Trade-offs

- **[Las respuestas simuladas no reproducen todos los errores reales de la v1]** → Plantillas tomadas de respuestas reales y verificaciones referenciales mínimas iguales en las dos versiones (D6). Los errores de SP que no se reproducen quedan como límite declarado en el reporte.
- **[Variabilidad del agente]** → 5 repeticiones, mediana con mínimo y máximo, y tasa de éxito. Si un caso muestra mucha dispersión, se aumenta N solo para ese caso.
- **[Costo mayor al estimado]** → Primero una corrida de prueba con N = 1 y un tope de costo configurable (`--tope-usd`) que corta la ejecución.
- **[El token de la v1 vence a los 15 días]** → El arnés comprueba la conexión a la v1 antes de empezar y falla con un mensaje claro que indica cómo renovarlo.
- **[Las cifras absolutas no son las de Claude Desktop]** → Ese cliente agrega su propio prompt de sistema. Se declara en el reporte, y las conclusiones se basan en la diferencia relativa y en el costo por tarea bien resuelta.
- **[Los datos de referencia salen de la misma base que lee la v2]** → Los verificadores comparan contra datos de la base y no contra la salida de ninguna tool. La v1 lee las mismas tablas por otros SP.
- **[La base de prueba cambia entre corridas]** → Nada escribe en ella durante la ejecución (escrituras interceptadas), y los datos de referencia se toman una vez al empezar.

## Migration Plan

No hay despliegue. Es una herramienta de desarrollo local que se ejecuta a mano. Rollback: borrar los archivos nuevos. La v1 y la v2 no cambian.

## Open Questions

- ~~¿Qué desarrollador y qué ticket se usan en los casos 4 y 5?~~ Resuelto en la tarea 3.3 (aprobado por el usuario el 2026-10-20): caso 4 = Gustavo Oviedo (`GOVIEDO`, `COD_DESARROLLADOR = 100934`; "Oviedo" solo coincide con 5 desarrolladores, "Gustavo Oviedo" con uno); caso 5 = ticket #75056 (abierto, prioridad BAJA, asignado al usuario).

## Filas creadas para las plantillas (tarea 4.1)

Con confirmación del usuario, el 2026-10-20 se ejecutó una única vez cada escritura de la v1 contra `CREAR_JK3_20261016.fdb`:

| Tool v1 | Fila creada | Datos |
|---|---|---|
| `crear_tarea` | tarea `COD_ASIGNACION_JK3 = 6359` | nombre `[PRUEBA MEDICION] plantilla`, desarrollador 100936, sin ticket |
| `agregar_mensaje_ticket` | mensaje `COD_MENSAJE_CLIENTE = 18673` en el ticket #75056 | nota interna `[PRUEBA MEDICION] plantilla`, sin cambio de prioridad |

Se pueden borrar después de la medición. Las respuestas están en `medicion/agente/plantillas/`, con los ids reemplazados por marcadores. La v1 `crear_tarea` no devuelve el id de la tarea creada. Las otras 5 tools de escritura de la v1 no tienen plantilla real: si el agente las llama, el arnés responde con la forma genérica de la v1 (`{"resultado":[{"RESULTADO":1,"MENSAJE":""}]}`). Eso queda registrado en la corrida.

## Hallazgos

Diagnóstico del 2026-10-20 con `scripts/agente/diagnostico-contexto.ts`. Los totales coinciden exactamente con el reporte `medicion/resultados/2026-10-20-1017.md`, que repite las cifras de la línea base `2026-10-20-1002.md`. Todas las cifras son en caracteres.

**#74836** (v1 5.427 · v2 6.866)

| v1: llamada | Caracteres | Filas | | v2: sección | Caracteres | Elementos | Textos largos |
|---|---:|---:|---|---|---:|---:|---:|
| detalle_ticket | 467 | 1 | | ticket | 437 | — | — |
| historial_ticket | 4.483 | 5 | | historial | 1.482 | 5 | 266 |
| agendas_ticket | 445 | 1 | | agendas | 167 | 1 | — |
| presupuestos_ticket | 16 | 0 | | presupuestos | 2 | 0 | — |
| listar_tareas_responsable | 16 | 0 | | tareas | 4.113 | 1 | 3.665 |
| | | | | adjuntos | 415 | 2 | — |
| | | | | resumen + JSON | 158 + 6.708 | | |

**#74111** (v1 24.461 · v2 14.025)

| v1: llamada | Caracteres | Filas | | v2: sección | Caracteres | Elementos | Textos largos |
|---|---:|---:|---|---|---:|---:|---:|
| detalle_ticket | 429 | 1 | | ticket | 364 | — | — |
| historial_ticket | 19.930 | 20 | | historial | 7.876 | 20 | 2.363 |
| agendas_ticket | 4.070 | 7 | | agendas | 1.184 | 7 | — |
| presupuestos_ticket | 16 | 0 | | presupuestos | 2 | 0 | — |
| listar_tareas_responsable | 16 | 0 | | tareas | 4.355 | 2 | 3.524 |
| | | | | adjuntos | 2 | 0 | — |
| | | | | resumen + JSON | 149 + 13.876 | | |

**#74703** (v1 4.547 · v2 17.053)

| v1: llamada | Caracteres | Filas | | v2: sección | Caracteres | Elementos | Textos largos |
|---|---:|---:|---|---|---:|---:|---:|
| detalle_ticket | 469 | 1 | | ticket | 442 | — | — |
| historial_ticket | 3.216 | 3 | | historial | 1.295 | 3 | 519 |
| agendas_ticket | 830 | 1 | | agendas | 170 | 1 | — |
| presupuestos_ticket | 16 | 0 | | presupuestos | 2 | 0 | — |
| listar_tareas_responsable | 16 | 0 | | tareas | 14.871 | 4 | 13.188 |
| | | | | adjuntos | 2 | 0 | — |
| | | | | resumen + JSON | 179 + 16.874 | | |

**#74619** (v1 15.974 · v2 6.680)

| v1: llamada | Caracteres | Filas | | v2: sección | Caracteres | Elementos | Textos largos |
|---|---:|---:|---|---|---:|---:|---:|
| detalle_ticket | 445 | 1 | | ticket | 400 | — | — |
| historial_ticket | 13.313 | 13 | | historial | 5.390 | 13 | 1.627 |
| agendas_ticket | 1.827 | 3 | | agendas | 496 | 3 | — |
| presupuestos_ticket | 373 | 1 | | presupuestos | 135 | 1 | — |
| listar_tareas_responsable | 16 | 0 | | tareas | 2 | 0 | 0 |
| | | | | adjuntos | 2 | 0 | — |
| | | | | resumen + JSON | 162 + 6.518 | | |

**Hipótesis de D11:**

1. *La v2 trae el historial completo y la v1 menos* → **descartada**. Las dos traen la misma cantidad de movimientos (5, 20, 3 y 13), y el historial de la v2 ocupa entre un 33 % y un 60 % del de la v1.
2. *La v2 incluye la `descripcion` completa de las tareas* → **confirmada, y es la causa**. En el #74703, las 4 descripciones suman 13.188 caracteres (77 % de la respuesta). En el #74836 la única tarea suma 3.665 (53 %). Sin las tareas, la v2 es más chica que la v1 en los 4 tickets.
3. *El `content` de la v2 duplica el JSON junto al resumen* → **descartada**. El `content` es el resumen (150 a 180 caracteres) más una sola copia del JSON. El `structuredContent` no llega al modelo (D5).

**Causa de la diferencia:** la v1 no trae ninguna tarea. `listar_tareas_responsable` devolvió 0 filas en los 4 tickets, aunque tres de ellos tienen tareas: el SP filtra por el usuario como responsable y la v1 no tiene una tool que liste las tareas de un ticket. Por eso la comparación de caracteres de `medicion-eficiencia` no es entre la misma información: la v2 da más datos (las tareas con su descripción) y la v1 no puede darlos. No es ruido: es información que la v1 no ofrece.

**Consecuencias:**
- El arnés con agente mide esto mejor, porque el criterio de éxito del caso 1 exige las tareas abiertas. Con la v1, el agente tiene que encontrarlas de otra forma o no lo logra.
- **Hallazgo al implementar el interceptor (tarea 4.2):** en la v2 real, `resultadoError` (`src/errores.ts`) pone en `content` solo `CODIGO: mensaje`. El `detalle`, con los campos inválidos, queda solo en `structuredContent`, que el modelo no ve (D5). Un agente que manda un parámetro inválido a una lectura de la v2 no sabe qué campo corregir. En el arnés, los errores simulados de escritura de la v2 incluyen el detalle en `content`, como pide la spec. Corregir la v2 real va en un change aparte.
- Queda una **decisión abierta para un change aparte** sobre `contexto-ticket`: si conviene devolver las descripciones de las tareas detrás de un parámetro opcional (principio de diseño 7), y dejar por defecto solo nombre, estado y asignación. No es un defecto evidente: depende de si el agente necesita la descripción para responder sobre el ticket. Si se cambia, se mide el agente **antes y después**, como dice D11.

## Resultados (estimación)

Estimación sin API del 2026-10-20 (`medicion/agente/estimaciones/2026-10-20-1521.md`), con los supuestos por defecto de `medicion/agente/estimacion.json`: 3,5 caracteres por token, 300 tokens de thinking por turno, 400 de respuesta final y 346 de prompt de tool use. Es un aproximado: no incluye el thinking real, las llamadas de más, los reintentos ni la tasa de éxito. Costos en USD por ejecución de cada caso, una vez.

| Caso | v1 caliente | v2 caliente | Dif. | v1 sin caché | v2 sin caché | Dif. | Turnos v1 → v2 |
|---|---:|---:|---:|---:|---:|---:|---:|
| estado-ticket | 0,0398 | 0,0320 | −19,5 % | 0,1175 | 0,0646 | −45,0 % | 3 → 2 |
| mis-tickets-agendados | 0,0290 | 0,0274 | −5,4 % | 0,0802 | 0,0609 | −24,1 % | 2 → 2 |
| mis-tareas-pendientes | 0,1601 | 0,0353 | −77,9 % | 0,1852 | 0,0672 | −63,7 % | 2 → 2 |
| crear-tarea | 0,0670 | 0,0246 | −63,2 % | 0,1644 | 0,0592 | −64,0 % | 3 → 2 |
| prioridad-mensaje | 0,0245 | 0,0234 | −4,2 % | 0,0769 | 0,0580 | −24,6 % | 2 → 2 |
| **Total** | **0,3203** | **0,1428** | **−55,4 %** | **0,6242** | **0,3100** | **−50,3 %** | 12 → 10 |

Con razones de 3 y 4 caracteres por token, la diferencia total queda entre −53 % y −58 % en sesión caliente y entre −49 % y −52 % sin caché. La conclusión no depende de la razón.

**De dónde sale la diferencia:**
- **Respuestas grandes de la v1 que entran al historial.** `listar_tareas_desarrollador` devuelve 95.518 caracteres (todas las tareas, sin paginar) contra 9.302 de `listar_tareas` (20 con el total). `listar_desarrolladores`, que la v1 necesita para crear una tarea, devuelve 23.048 caracteres; la v2 resuelve al desarrollador por nombre. En sesión caliente, esas respuestas se pagan como escritura de caché (5 USD/MTok), y son la mayor parte de la diferencia: sin el caso de tareas pendientes, la diferencia total en sesión caliente baja a −32,9 %.
- **Turnos.** La v1 necesita un turno más en el estado del ticket y en crear una tarea. Cada turno vuelve a leer las tools y el historial, y suma el thinking supuesto.
- **Casos de una sola llamada chica** (agendados, prioridad y mensaje): con caché la diferencia es de 4 % a 5 %, casi toda por el tamaño de las tools.

**Peso de las definiciones de tools:** v1 = 24 tools, 22.582 caracteres (≈ 6.452 tokens por turno); v2 = 6 tools, 14.337 caracteres (≈ 4.096 tokens). En sesión caliente, leerlas de la caché cuesta US$ 0,0013 por turno en la v1 y US$ 0,0008 en la v2: unos 5 % a 6 % del costo total. Sin caché pesan mucho más: US$ 0,0258 contra US$ 0,0164 por turno, alrededor de la mitad del costo total en las dos versiones. Por eso, sin caché, aun los casos de una sola llamada bajan alrededor de un 24 %.

**Salvedades:**
- En el caso 1, la v1 no trae las tareas del ticket (ver Hallazgos): su costo corresponde a una respuesta incompleta, que con el criterio de éxito de D8 probablemente fallaría. La v2 cuesta menos y además trae más información.
- La salida casi no cambia entre versiones (5.870 contra 5.192 tokens), porque los supuestos de thinking y respuesta final son fijos. El thinking real puede ser mayor cuando el agente tiene que buscar algo en una respuesta grande, así que la estimación probablemente subestima la ventaja de la v2.
- La primera escritura de las tools en caché no se cuenta en sesión caliente, porque se supone que ya están cacheadas.
- Las cifras con agente real (costo por tarea bien resuelta, tiempos y reintentos) quedan para las tareas 7.x, cuando haya credenciales de la API.
