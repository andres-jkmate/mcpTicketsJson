# Tasks

## 1. Investigación del tamaño del contexto (#74703, #74836)

- [x] 1.1 Extraer `conectar()` y `medirResultado()` de `scripts/medir-eficiencia.ts` a un módulo común en `scripts/agente/` y hacer que `medir-eficiencia.ts` lo use. Se verifica con `npm test` (pasa `medicion.test.ts`) y con `npm run medir`, que produce las mismas cifras que `medicion/resultados/2026-10-20-1002.md`.
- [x] 1.2 Implementar `scripts/agente/diagnostico-contexto.ts` (design D11): desglose por sección del `structuredContent` de la v2 (cantidad de elementos y caracteres de `texto`/`descripcion`) y caracteres y filas por llamada de la v1, para los 4 tickets del conjunto. Se verifica cuando la salida suma por ticket los mismos caracteres que informa el reporte de `medicion-eficiencia`, con ±1 % de tolerancia.
- [x] 1.3 Correr el diagnóstico y completar la sección "Hallazgos" de `design.md`, con una tabla por ticket y la confirmación o descarte de cada hipótesis de D11. Si la causa es un defecto de `contexto-ticket`, dejar anotado que hace falta un change aparte y avisar al usuario. Se verifica cuando la sección deja de decir "(se completa en la tarea 1.3)".

## 2. Dependencias y configuración

- [x] 2.1 Agregar `@anthropic-ai/sdk` y `ajv` (con `ajv-formats`) como dependencias de desarrollo, y el script `medir:agente` en `package.json`. Agregar `medicion/agente/corridas/` a `.gitignore` y `ANTHROPIC_API_KEY` a `.env.example` (comentada, con la alternativa `ant auth login`). Se verifica con `npm run typecheck` y con `git check-ignore medicion/agente/corridas/x.jsonl`.
- [x] 2.2 Crear `medicion/agente/precios.json` con los precios de Opus 5.5 verificados contra la página de precios vigente (design D10), y `medicion/agente/tools.json` con las listas de D6. Se verifica con un test que carga los dos archivos y rechaza un modelo sin precio o una tool que figure en las dos listas a la vez.

## 3. Casos y verdad de referencia

- [x] 3.1 Crear `medicion/agente/escritura-v2.json` con los schemas de `crear_tarea` y `actualizar_ticket` de D7. Se verifica con tests de `ajv`: aceptan un ejemplo válido de cada uno y rechazan la falta de `descripcion.criteriosAceptacion`, un `personaRef` con `id` y `nombre` juntos, y `actualizar_ticket` sin `cambios` ni `mensaje`.
- [x] 3.2 Implementar la carga y validación de `medicion/agente/casos.json` (spec "Conjunto fijo de casos"). Se verifica con tests: un conjunto sin alguno de los 5 casos obligatorios falla, y uno completo carga con 5 repeticiones por defecto.
- [x] 3.3 Elegir con consultas de lectura a la base de prueba un desarrollador (distinto del usuario, con un nombre único) para el caso 4 y un ticket abierto para el caso 5. Redactar los 5 pedidos en lenguaje natural y **confirmarlos con el usuario** antes de guardarlos en `casos.json`. Se verifica cuando el usuario aprueba y el archivo pasa la validación de 3.2.
- [x] 3.4 Implementar la obtención de la verdad de referencia de D8, de solo lectura y con la capa `src/db`. Se verifica con un test de integración (se saltea sin `FIREBIRD_*`) que obtiene datos no vacíos para los casos 1, 2 y 3 y resuelve el desarrollador del caso 4.

## 4. Interceptación de escrituras

- [x] 4.1 Obtener las plantillas de respuesta. **Pedir confirmación explícita al usuario** y ejecutar una única vez contra la base de prueba `crear_tarea` y `agregar_mensaje_ticket` de la v1 con datos marcados como de prueba. Guardar las respuestas en `medicion/agente/plantillas/`, sin textos de tickets. Registrar en `design.md` qué filas se crearon, para poder borrarlas. Se verifica cuando existen las dos plantillas de v1 y las dos de v2 (armadas según el contrato de la v2).
- [x] 4.2 Implementar el interceptor (D6): clasificación por lista (lo desconocido se intercepta), validación con `ajv`, resolución de `personaRef` con `{ nombre }`, verificaciones referenciales mínimas (ticket y desarrollador existentes) iguales para las dos versiones y respuesta desde la plantilla con ids ficticios. Se verifica con tests unitarios por cada escenario de la spec "Escrituras interceptadas", con un servidor MCP simulado que falla el test si recibe una tool de escritura.

## 5. Loop de agente y registro

- [x] 5.1 Implementar la conversión de tools (D4: `name`/`description`/`input_schema`, ordenadas, v2 con los schemas de escritura agregados) y el registro de su tamaño en caracteres y tokens con `count_tokens`. Se verifica con un test sobre tools simuladas (no llega `outputSchema`, el orden es estable) y comprobando en una ejecución real que v1 = 24 tools y v2 = 6. Las cantidades ya se comprobaron contra los servidores reales (v1 = 24 y 22.582 caracteres; v2 = 6 y 14.337); falta el tamaño en tokens con `count_tokens`. **Movida a `medir-agente-corridas-reales` (2026-10-21): requiere credenciales de la API.**
- [x] 5.2 Implementar el loop (D1, D2, D3, D5): streaming con `finalMessage()`, historial solo agregado, tools paralelas devueltas en un único mensaje, `content` de texto como resultado, `is_error`, límite de turnos y rechazo del modelo como fallo. Se verifica con tests sobre un cliente de Anthropic simulado: dos turnos con tool, tools paralelas, error de tool que no corta la corrida, `refusal` y corte por límite de turnos.
- [x] 5.3 Implementar el registro por turno y por corrida en `.jsonl` (spec "Registro por turno"), con tiempo del modelo, de las tools y total. Se verifica con un test: la suma de los tiempos del modelo y de las tools no supera el total, y están todos los campos de `usage`.
- [x] 5.4 Implementar la verificación de éxito por caso (D8), con normalización de los argumentos de escritura de cada versión. Se verifica con tests por cada escenario de la spec "Verificación de éxito por caso", con argumentos de v1 y de v2 para los casos 4 y 5.

## 6. Ejecución, costo y reporte

- [x] 6.1 Implementar la CLI `scripts/medir-agente.ts` (`--repeticiones`, `--casos`, `--versiones`, `--tope-usd`, `--solo-reporte`), con el orden intercalado y alternado de D9, la comprobación previa de conexión a la v1 y a la API, y el corte por tope de costo. Se verifica con un test del planificador de orden y otro del corte por tope con un cliente simulado.
- [x] 6.2 Implementar el cálculo de costo desde `precios.json` y el reporte JSON y Markdown (spec "Reporte comparativo": medianas, mín/máx, éxito, costo por tarea bien resuelta, "sin éxitos", tamaños de las tools, sin textos ni credenciales). Se verifica con tests sobre registros de ejemplo y regenerando el reporte con `--solo-reporte` después de cambiar un precio.
- [x] 6.3 Documentar en `README.md` (sección "Medición con agente") los requisitos (v1 local, token, API key), los comandos, el costo estimado y cómo leer el reporte. Se verifica siguiendo los pasos del README en una terminal nueva. La sección ya está escrita; falta seguir sus pasos de punta a punta. **Movida a `medir-agente-corridas-reales` (2026-10-21): requiere credenciales de la API.**

## 7. Corridas

- [x] 7.1 Corrida de prueba: `npm run medir:agente -- --repeticiones 1 --tope-usd 5`. Revisar con el usuario los registros (argumentos de escritura que armó el agente y verificadores) y el costo real por corrida, y **confirmar con el usuario** el presupuesto de la corrida completa. Se verifica cuando hay un reporte con 10 corridas y el usuario aprueba seguir. **Movida a `medir-agente-corridas-reales` (2026-10-21): requiere credenciales de la API.**
- [x] 7.2 Corrida completa con N = 5 y el tope acordado. Se verifica con el reporte en `medicion/agente/resultados/` y un conteo de filas de tareas y mensajes de tickets igual antes y después (spec "Ninguna escritura real"). **Movida a `medir-agente-corridas-reales` (2026-10-21): requiere credenciales de la API.**
- [x] 7.3 Resumir los resultados para la decisión de migrar (diferencia de costo y tiempo por tarea bien resuelta, por caso y en total, más lo observado sobre los objetos compuestos) en una sección "Resultados" de `design.md`. Se verifica cuando el usuario revisa el resumen. **Movida a `medir-agente-corridas-reales` (2026-10-21): requiere credenciales de la API.**

## 8. Estimador sin API (design D12)

- [x] 8.1 Crear `medicion/agente/guiones.json` (los guiones de D12 para los 5 casos y las dos versiones) y `medicion/agente/estimacion.json` (razón de caracteres por token, supuestos de salida y tokens del prompt de tool use), con su carga y validación. Se verifica con tests: falla un guion sin alguno de los 5 casos o de las dos versiones, falla una tool que la versión no publica, y la configuración por defecto carga.
- [x] 8.2 Implementar el simulador: ejecuta el guion (lecturas reenviadas, escrituras por el interceptor) y calcula por turno la entrada sin caché, la lectura y la escritura de caché, y la salida, en los escenarios "sesión caliente" y "sin caché". Se verifica con tests sobre servidores simulados: el historial crece turno a turno, la lectura de caché de un turno es igual al prefijo del anterior, cambiar la razón cambia los tokens en proporción, y una escritura del guion que no valida es error.
- [x] 8.3 Implementar la CLI `npm run estimar:agente` (`--casos`, `--versiones`, `--razon`) y el reporte JSON y Markdown en `medicion/agente/estimaciones/` (spec "Estimación sin API": supuestos, rango con razones de 3 y 4, total y diferencia v1 → v2, sin textos). Se verifica con tests del reporte y ejecutándolo sin `ANTHROPIC_API_KEY`.
- [x] 8.4 Correr la estimación contra la v1 y la v2 y resumir en una sección "Resultados (estimación)" de `design.md` el costo estimado por caso y en total, la diferencia v1 → v2 y el peso de las definiciones de tools. Se verifica cuando el usuario revisa el resumen.
