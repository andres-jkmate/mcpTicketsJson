# Design

## Context

La motivación está en `proposal.md` (sección Why) y los requisitos en `specs/`. Acá va solo el estado actual que condiciona el diseño.

**Lo observado en la v1 (`tickets-jkmate-mcp`, 2026-10-15, ticket #74836):**

| Llamada v1 | Caracteres aprox. | Observaciones |
|---|---|---|
| `detalle_ticket` | ~560 | `COD_ESTADO` y `ESTADO` juntos; fechas sin offset (`2026-09-28T15:44:11.925`). |
| `historial_ticket` | ~4.300 | 35 campos por fila. Duplicado `FECHA_HORA`/`FECHA_ORDEN` (`RESULTADO_RECLAMO`/`ESTADO_RECLAMO` **no** son duplicados: ver abajo). Flags 0/1. `COLOR_PERFIL_JK`. En los hitos de sistema, `MENSAJE` y `TEXTO_HITO` **difieren** (por ejemplo "Prioridad cambiada a CRITICA" contra "Ticket asignado a ANDRES JKMT"). |
| `agendas_ticket` | ~480 | `EVENTO` repite "#74836 - título". El mismo usuario 15169 se llama "Andres Pelaez" acá y "ANDRES JKMT" en detalle e historial. |
| `presupuestos_ticket` | ~20 | Vacío. |
| tareas del ticket | — | No hay filtro por ticket. Hay que listar por desarrollador o por responsable con rango de fechas y filtrar del lado del agente. |

**Lo verificado en la base de testing (`CREAR_JK3_20261016.fdb`, 2026-10-16, tickets #74836, #74111, #74703 y #74619):**

- Existen los 23 SP que usa la v1 (ver `docs/tickets-functions.json`) y `PROC_GET_ARCHIVO_ADJ_SAC_X_RECL` para adjuntos.
- `COD_RECLAMO` y `NRO_TICKET` son siempre el mismo valor (confirmado por el usuario).
- `RESULTADO_RECLAMO` es el subestado y `ESTADO_RECLAMO` el estado: "PRESUPUESTO PENDIENTE APROBACIÓN" frente a "PENDIENTE" en el #74111.
- En los mensajes comunes `TEXTO_HITO` repite `MENSAJE`; en los hitos de sistema dicen cosas distintas y las dos sirven (evento + motivo).
- `TIPO_HITO` lo calcula `PROC_GET_HITOS_TICKET_PORTAL` y toma 5 valores: `MENSAJE`, `ASIGNACION`, `CAMBIO_ESTADO`, `CAMBIO_PRIORIDAD` y `CAMBIO_TIPO_SISTEMA` (leído del código del SP el 2026-10-16; en el #74836 solo aparecen los 3 primeros).
- Los mensajes pueden traer HTML (`<p>…</p>`).
- `PROC_GET_AGENDAS_TICKET_ADMIN.DESCRIPCION` repite el primer mensaje y el título, con mojibake ("travÃ©s").
- `PROC_GET_PRES_TICKET_PORTAL.IMPORTE` es un VARCHAR formateado desde `COMPROBANTES.TOTAL`; el estado sale de `RECLAMOS_COMPROBANTES.APROBADO`.
- Adjuntos: solo `RUTA` (URL pública), `RUTA_REAL`, `OBSERVACION` (nombre, puede venir vacía), `FECHA` (DATE) y `COD_MENSAJE_CLIENTE`. No hay tipo de contenido ni tamaño.
- `PROC_GET_TICKETS_ADMIN_PORTAL` tiene parámetros que el JSON de la v1 no documenta (`P_AGENDADO_A`, `P_FECHA_AGENDA`, `P_ORDEN_POR_AGENDA`, `P_FECHA_CREACION_DESDE/HASTA`) y devuelve flags de agenda activa y de presupuesto pendiente/aprobado/rechazado.
- `ESTADOS_RECLAMOS` tiene 9 estados; los abiertos son los de `FINALIZADO = 0` (criterio confirmado por el usuario). `A PRESUPUESTAR` existe en el catálogo aunque hoy no lo usa ningún ticket.
- Prioridades en uso: SIN ASIGNAR, BAJA, MEDIA, ALTA, URGENTE y CRITICA. Sistemas: JK3, JK2, DESKTOP, CRM o NULL (casi todos los tickets viejos).
- Estados de `ASIGNACION_JK3` en uso: POR INICIAR, INICIADA, REABIERTO, FINALIZA DESARROLLO, FINALIZADA y ARCHIVADO. `HORAS_ESTIMADAS` es INTEGER; hay `FECHA_COMPROMISO`.
- Nombre canónico: `USUARIOS.NOMBRE` ("Andres Pelaez", "Carolina Guerra"). El historial v1 muestra `USUARIOS.ALIAS` ("ANDRES JKMT", "Carolina"). `DESARROLLADORES.NOMBRE` es un login ("APELAEZ"); el vínculo es `USUARIOS.COD_DESARROLLADOR`, y 8 desarrolladores tienen además un usuario técnico con alias `DEV-*`.
- Los TIMESTAMP se guardan en hora local: el #74836 se creó a las 15:44:11.925 (-03:00).
- Columnas de texto en `ISO8859_1`; existe la colación `ES_ES_CI_AI`.
- El esquema real y las decisiones tomadas con el usuario el 2026-10-16 (visibilidad, nombres de desarrollador, agenda, tareas) están en D8.
- El catálogo de `conocimiento-jkmate-mcp` es un agregado de instalaciones de clientes y no sirve para la base de tickets. La fuente es la base de testing, vía `firebird-escritura` (solo lectura para el relevamiento).
- El código de la v1 (`tickets-jkmate-mcp`) no está disponible. El acceso a Firebird se eligió sin ella (ver D2).

## Goals / Non-Goals

**Goals:**
- Que un agente arme el contexto de un ticket con 1 llamada en lugar de 5 o más, y con muchos menos caracteres (meta orientativa: −70 % en el #74836; la cifra real la da el script).
- Que el contrato sea idéntico en todas las tools, para que el agente no necesite casos especiales.
- Que toda la incertidumbre sobre el esquema quede en un solo lugar, para reescribir poco cuando el usuario confirme los SP reales.

**Non-Goals:**
- Cache de respuestas, rate limiting o multi-tenant por cliente de JKMate.
- Tokenizar para medir tokens exactos. Se mide en caracteres, la unidad que pidió el experimento.
- Paridad de filtros con la v1 más allá de lo que piden los specs (por ejemplo, `MODULO` o `PCON_DEP_ACTIVAS` de la v1).

## Decisions

### D1. Arquitectura del servidor

```
src/
  index.ts               # arranque: config, sesión del proceso y transporte stdio
  auth/sesion.ts         # { codUsuario, codDesarrollador } del proceso
  db/firebird.ts         # pool + ejecutarSp(nombre, params) -> filas  (D2)
  db/sp.ts               # wrappers tipados por SP (_AG)
  mapeo/                 # fecha(offset), booleano, persona, error-de-SP -> código
  servidor-mcp.ts        # Server de bajo nivel del SDK: handlers propios de tools/list y tools/call
  tools/definicion.ts    # DefinicionTool: JSON Schema publicado + validador zod + annotations + handler
  tools/ejecutar.ts      # wrapper común: valida input, mide, loguea y convierte errores
  tools/<tool>.ts        # una DefinicionTool por tool
  errores.ts             # ErrorTool { codigo, mensaje, detalle? } -> resultado isError
  logger.ts              # pino + transporte a Seq
scripts/medir-eficiencia.ts
medicion/tickets.json
```

- **Transporte stdio, sin autenticación** (decisión del usuario, 2026-10-17): el proyecto es una evaluación y el cliente objetivo es Claude Desktop, que lanza servidores locales por stdio. Es un desvío consciente del estándar del equipo (Streamable HTTP con OAuth): el servidor HTTP con OAuth que se había implementado se eliminó para dejar lo mínimo. Pasar a Streamable HTTP más adelante solo cambia `index.ts` y la forma de obtener la sesión; las tools y el contrato no cambian. Como stdout es el canal del protocolo, todo log va a stderr.
- **Mapeo en una sola capa (`mapeo/`)**: los SP devuelven columnas y la capa las convierte a camelCase, booleanos y fechas con offset. Alternativa descartada: que el SP arme el JSON (con `LIST()` o concatenación). Haría frágil el escapado, mezclaría presentación con datos y complicaría los tests.
- **Fechas**: Firebird 3 `TIMESTAMP` no tiene zona. El servidor interpreta todas las fechas en la zona configurada (`ZONA_HORARIA_BASE`, por defecto `America/Argentina/Buenos_Aires`) y las serializa con offset.
- **Sin escapado Unicode**: `JSON.stringify` de Node no escapa los caracteres no ASCII. Un test verifica sobre el wire que no aparezcan `\u00XX`, para que ninguna capa intermedia lo reintroduzca.
- **Server de bajo nivel, no `McpServer`** (decisión del usuario, 2026-10-17): `McpServer.registerTool` valida el input por su cuenta y, si falla, devuelve un error solo de texto sin código; además publica schemas convertidos desde zod. Con `Server` y handlers propios de `tools/list`/`tools/call` se publican tal cual los JSON Schema de D4–D7, y el input se valida con zod en el wrapper común, que responde `PARAMETRO_INVALIDO` con la forma uniforme.
- **`content` con resumen y JSON** (decisión del 2026-10-17, tras la prueba en Claude Desktop): el `content` lleva dos bloques de texto, el resumen y `JSON.stringify(structuredContent)`. Claude Desktop le pasa al modelo solo `content`; con el resumen solo, el agente veía "5 movimientos, 1 tarea" sin su contenido. El evento `caracteresRespuesta` cuenta solo el texto del `content`, que ya incluye los datos. Los "Resumen en texto" de cada tool son el primer bloque.
- **Errores**: los handlers lanzan `ErrorTool`. El wrapper común lo convierte en `{ isError: true, structuredContent: { error }, content: [texto] }`. Los errores inesperados se loguean con su traza en Seq y salen como `ERROR_INTERNO` sin detalle.
- **`error` dentro de cada `outputSchema`** (decisión del usuario, 2026-10-17): el cliente del SDK TS (1.32.1, `client/index.js`) valida `structuredContent` contra el `outputSchema` aunque `isError` sea `true`. Por eso todo `outputSchema` publicado agrega la propiedad `error` y un `anyOf`: o están los campos obligatorios de éxito, o está `error`. Lo aplica un helper (`conError`) sobre los schemas de D4–D7, que acá se muestran sin esa parte.
- **Identidad**: un proceso = un usuario. `codUsuario` sale de la variable de entorno `MCP_COD_USUARIO` (obligatoria; sin ella el proceso no arranca) y `codDesarrollador` se resuelve una vez al arrancar con `USUARIOS.COD_DESARROLLADOR` (puede ser NULL). `"yo"` se resuelve contra esa sesión y ninguna tool recibe la identidad como parámetro. No hay autenticación: quien configura el proceso decide con qué usuario consulta. Como la v1 no aplica visibilidad por usuario, los SP `_AG` no reciben el usuario de la sesión.

### D2. Acceso a Firebird

La regla era reutilizar el mecanismo de `tickets-jkmate-mcp`, pero su código no está disponible. El usuario decidió (2026-10-16) elegir sin la v1; es un desvío consciente.

- **Firebird**: `node-firebird` (JS puro, no requiere fbclient). Pool configurado por env (`FIREBIRD_HOST`, `FIREBIRD_PORT`, `FIREBIRD_DATABASE`, `FIREBIRD_USER`, `FIREBIRD_PASSWORD`, `FIREBIRD_POOL_MAX`), charset de conexión `UTF8` para que Firebird translitere las columnas `ISO8859_1`. La interfaz `ejecutarSp(nombre, params): Promise<Fila[]>` aísla el driver. Los BLOB de texto se leen completos antes de mapear. Errores de conexión (`ECONNREFUSED`, timeouts, base no disponible) → `BASE_NO_DISPONIBLE`.
- Si más adelante aparece el código de la v1 y difiere, se revisa en otro change.

### D3. SP específicos para agentes, aislando lo no confirmado

- Naming y contrato según el hub (`JKMate-Knowledge/firebird/convenciones.md`): públicos `PROC_GET_*` / `PROC_LIST_*` con `RESULTADO`/`MENSAJE_ERROR`, y privados `PRV_*` con pre y postcondiciones. Sufijo `_AG` (agente) para no chocar con SP existentes. Todos los nombres caben en 31 caracteres, el límite de Firebird 3.
- **Contrato en selectables**: si la validación falla, se devuelve 1 fila con `RESULTADO = 0` y `MENSAJE_ERROR`. Si sale bien, cada fila trae `RESULTADO = 1`. Cero filas es "sin datos", no un error. Mapeo en el MCP: `RESULTADO = 0` → `PARAMETRO_INVALIDO`. El prefijo `NO_AUTORIZADO:` en `MENSAJE_ERROR` → `NO_AUTORIZADO` queda reservado para SP futuros; ningún SP de este change lo usa (sin regla de visibilidad, igual que la v1).
- **Aislamiento**: el conocimiento del esquema de tickets, historial y tareas queda en tres privados: `PRV_LIST_TICKETS_BASE_AG` (cabecera con estado actual, agenda y presupuesto), `PRV_LIST_HIST_BASE_AG` (movimientos) y `PRV_LIST_TAREAS_BASE_AG` (asignaciones). Agendas, presupuestos y adjuntos son proyecciones chicas en sus públicos. Si un SP de la v1 ya resuelve la base (historial, adjuntos), se envuelve en lugar de reescribirlo. Los filtros baratos o indexables se aplican dentro del privado; afuera quedan texto, orden y paginación.
- **Paginación y total**: `COUNT(*) OVER ()` (funciones de ventana de Firebird 3) más `OFFSET … ROWS FETCH NEXT … ROWS ONLY`, en una sola consulta.
- **Múltiples estados**: Firebird no tiene parámetros arreglo. Se pasan como CSV (`P_ESTADOS = 'INICIADO,AGENDADO'`) y se filtra con `',' || :P_ESTADOS || ',' CONTAINING ',' || ESTADO || ','`.
- **Texto sin acentos**: `CONTAINING` ya ignora mayúsculas. Las columnas son `ISO8859_1`, así que se compara con `COLLATE ES_ES_CI_AI` (verificado también sobre BLOB).
- **Persona canónica**: los nombres salen siempre de `COALESCE(USUARIOS.NOMBRE, USUARIOS.ALIAS)`, por join en los privados. Para un desarrollador se busca el usuario por `USUARIOS.COD_DESARROLLADOR`, prefiriendo el que no tiene alias `DEV-*`; si no tiene usuario, se usa `DESARROLLADORES.NOMBRE`. No se usa el nombre que traiga cada SP v1. Así se corrige "ANDRES JKMT" contra "Andres Pelaez".
- Alternativa descartada: un único SP que devuelva todo el contexto en un result set heterogéneo. Firebird solo devuelve un shape por SP, y forzarlo implicaría columnas genéricas o JSON armado en SQL.

### D4. `obtener_contexto_ticket`

**SP**: `PROC_GET_TICKET_AG`, `PROC_LIST_HIST_TICKET_AG`, `PROC_LIST_TAREAS_AG` (compartido con `listar_tareas`), `PROC_LIST_AGENDAS_TICKET_AG`, `PROC_LIST_PRESUP_TICKET_AG` y `PROC_LIST_ADJUNTOS_TICKET_AG`. Se ejecutan en paralelo dentro de una única transacción de solo lectura (snapshot consistente): una llamada MCP y seis llamadas a la base. Si `PROC_GET_TICKET_AG` no devuelve filas → `TICKET_NO_ENCONTRADO`.

**Fuentes v1 verificadas en la base de testing** (los privados las envuelven o las leen):

| Sección | Fuente | Nota |
|---|---|---|
| `ticket` | `PROC_GET_INFO_TICKET_PORTAL` + `CLIENTES` | El SP no trae el nombre del cliente, solo `COD_CLIENTE_TICKET`. |
| `historial` | `PROC_GET_HITOS_TICKET_PORTAL` | Se usan `MENSAJE`, `TEXTO_HITO`, `RESULTADO_RECLAMO`, `TIPO_HITO`, `ES_MENSAJE_CLIENTE`, `VISIBLE_CLIENTE`, `ADJUNTOS`, `ELIMINADO` y `COD_MENSAJE_RESPUESTA`. |
| `tareas` | `ASIGNACION_JK3` | No hay SP v1 que filtre por ticket. |
| `agendas` | `PROC_GET_AGENDAS_TICKET_ADMIN` | Se descartan `EVENTO` y `DESCRIPCION` (repiten título y primer mensaje, con mojibake). |
| `presupuestos` | `RECLAMOS_COMPROBANTES` + `COMPROBANTES` (lógica de `PROC_GET_PRES_TICKET_PORTAL`) | El SP v1 formatea el importe como texto (`"$ 121,00"`); el privado lee `COMPROBANTES.TOTAL`. |
| `adjuntos` | `PROC_GET_ARCHIVO_ADJ_SAC_X_RECL` | No hay tipo de contenido ni tamaño. `OBSERVACION` puede venir vacía. |

**inputSchema**
```json
{
  "type": "object",
  "properties": {
    "ticketId": { "type": "integer", "minimum": 1, "description": "Número de ticket (COD_RECLAMO = NRO_TICKET)" },
    "soloVisibleCliente": { "type": "boolean", "default": false, "description": "true = oculta notas internas del historial" },
    "limiteHistorial": { "type": "integer", "minimum": 1, "maximum": 200, "default": 50 }
  },
  "required": ["ticketId"],
  "additionalProperties": false
}
```

**`$defs` compartidas por todas las tools**
```json
{
  "persona":   { "type": "object", "properties": { "id": { "type": "integer" }, "nombre": { "type": "string" } }, "required": ["id", "nombre"] },
  "refNombre": { "type": "object", "properties": { "id": { "type": "integer" }, "nombre": { "type": "string" } }, "required": ["id", "nombre"] },
  "fechaHora": { "type": "string", "format": "date-time" },
  "fecha":     { "type": "string", "format": "date" },
  "estadoTicket":      { "enum": ["INICIADO", "INICIADO Y EN TRÁMITE", "EN TRÁMITE", "AGENDADO", "A PRESUPUESTAR", "PENDIENTE", "PRESUPUESTO APROBADO", "FINALIZADO", "CANCELADO"] },
  "prioridadTicket":   { "enum": ["SIN ASIGNAR", "BAJA", "MEDIA", "ALTA", "URGENTE", "CRITICA"] },
  "sistema":           { "enum": ["JK3", "JK2", "DESKTOP", "CRM", null] },
  "estadoTarea":       { "enum": ["POR INICIAR", "INICIADA", "REABIERTO", "FINALIZA DESARROLLO", "FINALIZADA", "ARCHIVADO"] },
  "estadoPresupuesto": { "enum": ["PENDIENTE", "APROBADO", "RECHAZADO"] },
  "tarea": {
    "type": "object",
    "properties": {
      "id": { "type": "integer" },
      "nombre": { "type": "string" },
      "estado": { "$ref": "#/$defs/estadoTarea" },
      "prioridad": { "type": ["integer", "null"] },
      "tipo": { "anyOf": [{ "$ref": "#/$defs/refNombre" }, { "type": "null" }] },
      "ticketId": { "type": ["integer", "null"] },
      "desarrollador": { "anyOf": [{ "$ref": "#/$defs/persona" }, { "type": "null" }] },
      "responsable": { "anyOf": [{ "$ref": "#/$defs/persona" }, { "type": "null" }] },
      "horasEstimadas": { "type": ["integer", "null"] },
      "fechaCompromiso": { "anyOf": [{ "$ref": "#/$defs/fecha" }, { "type": "null" }] },
      "creadaEn": { "$ref": "#/$defs/fechaHora" },
      "descripcion": { "type": ["string", "null"] }
    },
    "required": ["id", "nombre", "estado", "prioridad", "tipo", "ticketId", "desarrollador", "responsable", "horasEstimadas", "fechaCompromiso", "creadaEn"]
  }
}
```

- **Enums con test**: `estadoTicket` refleja `ESTADOS_RECLAMOS` (incluye `A PRESUPUESTAR`, que hoy no usa ningún ticket). Un test de integración compara el enum contra la tabla, para que un estado nuevo en la base no deje el schema desactualizado sin aviso. Para `TIPO_HITO` no hay tabla: los 5 valores salen del código de `PROC_GET_HITOS_TICKET_PORTAL`, y un test de integración recorre tickets de prueba y falla si aparece un valor fuera del enum.
- **Persona (P1)**: `id` es `COD_USUARIO` en tickets, historial y agendas, y `COD_DESARROLLADOR` en tareas, para que coincida con lo que acepta cada filtro. El nombre sale siempre de `USUARIOS.NOMBRE` ("Andres Pelaez", "Carolina Guerra"). Para un desarrollador se busca el usuario por `USUARIOS.COD_DESARROLLADOR`, prefiriendo el que no tiene alias `DEV-*`; si no tiene usuario vinculado se usa `DESARROLLADORES.NOMBRE` (que es un login, por ejemplo "APELAEZ").

**outputSchema**
```json
{
  "type": "object",
  "properties": {
    "ticket": {
      "type": "object",
      "properties": {
        "id": { "type": "integer" },
        "titulo": { "type": "string" },
        "estado": { "$ref": "#/$defs/estadoTicket" },
        "resultado": { "type": "string", "description": "Subestado actual (RESULTADO_RECLAMO del último movimiento)" },
        "prioridad": { "$ref": "#/$defs/prioridadTicket" },
        "sistema": { "$ref": "#/$defs/sistema" },
        "proceso": { "anyOf": [{ "$ref": "#/$defs/refNombre" }, { "type": "null" }] },
        "cliente": { "$ref": "#/$defs/refNombre" },
        "contacto": { "type": ["string", "null"] },
        "asignadoA": { "anyOf": [{ "$ref": "#/$defs/persona" }, { "type": "null" }] },
        "creadoEn": { "$ref": "#/$defs/fechaHora" },
        "actualizadoEn": { "$ref": "#/$defs/fechaHora" },
        "pedidoNormalizado": { "type": ["string", "null"] }
      },
      "required": ["id", "titulo", "estado", "resultado", "prioridad", "sistema", "proceso", "cliente", "contacto", "asignadoA", "creadoEn", "actualizadoEn", "pedidoNormalizado"]
    },
    "totalHistorial": { "type": "integer" },
    "historial": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "integer" },
          "fecha": { "$ref": "#/$defs/fechaHora" },
          "tipo": { "enum": ["MENSAJE", "ASIGNACION", "CAMBIO_ESTADO", "CAMBIO_PRIORIDAD", "CAMBIO_TIPO_SISTEMA"] },
          "autor": { "$ref": "#/$defs/persona" },
          "destinatario": { "$ref": "#/$defs/persona" },
          "evento": { "type": "string", "description": "Qué hizo el sistema (TEXTO_HITO). Solo si tipo != MENSAJE" },
          "texto": { "type": "string", "description": "Texto del mensaje, sin HTML" },
          "resultado": { "type": "string", "description": "Solo cuando cambia respecto del movimiento anterior" },
          "esDelCliente": { "type": "boolean" },
          "visibleCliente": { "type": "boolean" },
          "adjuntos": { "type": "integer" },
          "respondeA": { "type": "integer" }
        },
        "required": ["id", "fecha", "tipo", "autor", "texto", "esDelCliente", "visibleCliente", "adjuntos"]
      }
    },
    "tareas": { "type": "array", "items": { "$ref": "#/$defs/tarea" } },
    "agendas": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "integer" },
          "inicio": { "$ref": "#/$defs/fechaHora" },
          "fin": { "anyOf": [{ "$ref": "#/$defs/fechaHora" }, { "type": "null" }] },
          "todoElDia": { "type": "boolean" },
          "realizada": { "type": "boolean" },
          "usuario": { "$ref": "#/$defs/persona" }
        },
        "required": ["id", "inicio", "fin", "todoElDia", "realizada", "usuario"]
      }
    },
    "presupuestos": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "comprobante": { "type": "string" },
          "fecha": { "$ref": "#/$defs/fecha" },
          "estado": { "$ref": "#/$defs/estadoPresupuesto" },
          "importe": { "type": "number" },
          "aprobadoEn": { "anyOf": [{ "$ref": "#/$defs/fechaHora" }, { "type": "null" }] }
        },
        "required": ["comprobante", "fecha", "estado", "importe", "aprobadoEn"]
      }
    },
    "adjuntos": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "integer" },
          "nombre": { "type": "string" },
          "url": { "type": "string", "format": "uri" },
          "mensajeId": { "type": "integer" },
          "fecha": { "$ref": "#/$defs/fecha" }
        },
        "required": ["id", "nombre", "url", "mensajeId", "fecha"]
      }
    }
  },
  "required": ["ticket", "totalHistorial", "historial", "tareas", "agendas", "presupuestos", "adjuntos"]
}
```

**Reglas de mapeo**
- **Historial (P2, P3, P4)**:
  - `texto` = `MENSAJE_EDITADO` si no está vacío, si no `MENSAJE` (como la v1), convertido de HTML a texto plano (`<p>`, `<br>` → saltos de línea; resto de etiquetas fuera; entidades decodificadas).
  - `evento` = `TEXTO_HITO`, solo cuando `tipo` no es `MENSAJE`. En los mensajes comunes `TEXTO_HITO` repite `MENSAJE`. En los hitos de sistema dicen cosas distintas: en el #74836, `MENSAJE` = "Prioridad cambiada a CRITICA" y `TEXTO_HITO` = "Ticket asignado a ANDRES JKMT".
  - `resultado` (`RESULTADO_RECLAMO`) solo en el primer movimiento y cuando cambia respecto del anterior. No es duplicado de `ESTADO_RECLAMO`: en el #74111 conviven "PRESUPUESTO PENDIENTE APROBACIÓN" (resultado) con "PENDIENTE" (estado).
  - No se expone `ES_HITO_SISTEMA`: `tipo` ya lo dice.
  - `destinatario`, `evento`, `resultado` y `respondeA` **se omiten** cuando no aplican. Es el único lugar donde se omiten campos, porque es la sección que más se repite.
  - Los movimientos con `ELIMINADO = 1` se excluyen.
- **`ticket.resultado`**: `RESULTADO_RECLAMO` del último movimiento.
- **Agendas (P6)**: sin `descripcion` ni `evento`. `fin` es nullable: en testing hay 1 agenda de ticket sin `FECHA_HASTA` (verificado el 2026-10-17).
- **Tareas**: `desarrollador` es nullable: hay 8 asignaciones sin `COD_DESARROLLADOR` (verificado el 2026-10-17).
- **Presupuestos**: `comprobante` = `NRO_COMPROBANTE`; `estado` sale de `RECLAMOS_COMPROBANTES.APROBADO` (1 → `APROBADO`, 0 → `RECHAZADO`, NULL → `PENDIENTE`); `importe` = `COMPROBANTES.TOTAL`. Se excluyen los anulados, igual que la v1.
- **Adjuntos (P7)**: `nombre` = `OBSERVACION`, o el último segmento de `RUTA_REAL` si viene vacía (caso #74836); `url` = `RUTA`; `fecha` es DATE. Nunca el contenido.

**Ejemplo** (#74836, datos de la base de testing del 2026-10-16):
```json
{
  "ticket": {
    "id": 74836, "titulo": "error al cargar asiento", "estado": "AGENDADO", "resultado": "AGENDADO",
    "prioridad": "CRITICA", "sistema": "JK3",
    "proceso": { "id": 488, "nombre": "Ingreso de Asientos" },
    "cliente": { "id": 502312, "nombre": "Suscripciones del Cielo SA" }, "contacto": "julieta marchan",
    "asignadoA": { "id": 15169, "nombre": "Andres Pelaez" },
    "creadoEn": "2026-09-28T15:44:11.925-03:00", "actualizadoEn": "2026-10-05T13:09:35.383-03:00",
    "pedidoNormalizado": null
  },
  "totalHistorial": 5,
  "historial": [
    { "id": 17141, "fecha": "2026-09-28T15:44:11.925-03:00", "tipo": "MENSAJE", "autor": { "id": 15246, "nombre": "SANTOS LARA" },
      "texto": "Titulo: error al cargar asiento\nno puedo cargar e3l asiento por un error adjujnto imagen", "resultado": "INICIADO",
      "esDelCliente": true, "visibleCliente": true, "adjuntos": 0 },
    { "id": 17303, "fecha": "2026-09-30T11:39:17.147-03:00", "tipo": "MENSAJE", "autor": { "id": 15246, "nombre": "SANTOS LARA" },
      "texto": "adjutno archivos que antes no me adjunto", "esDelCliente": true, "visibleCliente": true, "adjuntos": 2 },
    { "id": 17310, "fecha": "2026-09-30T13:02:47.946-03:00", "tipo": "ASIGNACION", "autor": { "id": 22, "nombre": "Soporte Clientes" },
      "destinatario": { "id": 15169, "nombre": "Andres Pelaez" }, "evento": "Ticket asignado a ANDRES JKMT",
      "texto": "Prioridad cambiada a CRITICA", "esDelCliente": false, "visibleCliente": true, "adjuntos": 0 },
    { "id": 17311, "fecha": "2026-09-30T13:02:47.946-03:00", "tipo": "MENSAJE", "autor": { "id": 22, "nombre": "Soporte Clientes" },
      "destinatario": { "id": 15169, "nombre": "Andres Pelaez" }, "texto": "Se revisara el error.",
      "esDelCliente": false, "visibleCliente": true, "adjuntos": 0 },
    { "id": 17697, "fecha": "2026-10-05T13:09:35.383-03:00", "tipo": "CAMBIO_ESTADO", "autor": { "id": 15169, "nombre": "Andres Pelaez" },
      "destinatario": { "id": 15169, "nombre": "Andres Pelaez" }, "evento": "Estado cambiado de INICIADO a AGENDADO",
      "texto": "Ticket agendado el dia 2026-10-06 a las 09:00:00.0000 horas para el usuario Andres Pelaez", "resultado": "AGENDADO",
      "esDelCliente": false, "visibleCliente": true, "adjuntos": 0 }
  ],
  "tareas": [],
  "agendas": [
    { "id": 156, "inicio": "2026-10-06T09:00:00-03:00", "fin": "2026-10-06T09:50:00-03:00", "todoElDia": false,
      "realizada": false, "usuario": { "id": 15169, "nombre": "Andres Pelaez" } }
  ],
  "presupuestos": [],
  "adjuntos": [
    { "id": 6168, "nombre": "78B92411E06CEEF0AD2D773CFAF867E8.png", "url": "https://ticket.jakemate.net:19089/api/Files/attachments/ticket/78B92411E06CEEF0AD2D773CFAF867E8.png", "mensajeId": 17303, "fecha": "2026-09-30" },
    { "id": 6169, "nombre": "3EF72423FB95A481914EF9887CA29A52.png", "url": "https://ticket.jakemate.net:19089/api/Files/attachments/ticket/3EF72423FB95A481914EF9887CA29A52.png", "mensajeId": 17303, "fecha": "2026-09-30" }
  ]
}
```
Resumen en texto: `Ticket #74836 "error al cargar asiento" — AGENDADO, prioridad CRITICA, asignado a Andres Pelaez. 5 movimientos, 0 tareas, 1 agenda, 0 presupuestos, 2 adjuntos.`

Ejemplo de presupuesto (#74619): `{ "comprobante": "P-0001-00000088", "fecha": "2026-10-05", "estado": "APROBADO", "importe": 121.00, "aprobadoEn": "2026-10-07T09:35:22.378-03:00" }`.

Estimación: ~3.000 caracteres en una llamada contra ~5.400 en 4 llamadas de la v1 (más las de tareas). El ahorro mayor sigue estando en el historial. Las `url` de adjuntos suman ~100 caracteres cada una.

### D5. `listar_tickets`

**SP**: `PROC_LIST_TICKETS_AG` (sobre `PRV_LIST_TICKETS_BASE_AG`). La v1 (`PROC_GET_TICKETS_ADMIN_PORTAL`) filtra un solo estado y una sola prioridad, no pagina con total y no busca texto, así que se necesita el SP nuevo. Sí aprovecha su lógica de agenda activa y de presupuestos (`TIENE_AGENDA_ACTIVA`, `TIENE_PRESUPUESTO_PENDIENTE/APROBADO/RECHAZADO`, `P_AGENDADO_A`, `P_ORDEN_POR_AGENDA`).

**inputSchema**
```json
{
  "type": "object",
  "properties": {
    "estados": { "type": "array", "items": { "$ref": "#/$defs/estadoTicket" }, "minItems": 1, "uniqueItems": true, "description": "OR entre valores. Si se indica, se ignora soloAbiertos" },
    "soloAbiertos": { "type": "boolean", "default": true, "description": "Solo tickets cuyo estado tiene ESTADOS_RECLAMOS.FINALIZADO = 0" },
    "prioridades": { "type": "array", "items": { "$ref": "#/$defs/prioridadTicket" }, "minItems": 1, "uniqueItems": true },
    "sistema": { "enum": ["JK3", "JK2", "DESKTOP", "CRM"] },
    "asignadoA": { "anyOf": [{ "type": "integer" }, { "const": "yo" }], "description": "Usuario asignado (COD_USUARIO)" },
    "agendadoA": { "anyOf": [{ "type": "integer" }, { "const": "yo" }], "description": "Usuario con agenda activa para el ticket" },
    "clienteId": { "type": "integer" },
    "creadoDesde": { "$ref": "#/$defs/fecha" },
    "creadoHasta": { "$ref": "#/$defs/fecha" },
    "texto": { "type": "string", "minLength": 3, "maxLength": 100, "description": "Busca en título y pedido normalizado, sin distinguir mayúsculas ni acentos" },
    "buscarEnMensajes": { "type": "boolean", "default": false, "description": "Extiende 'texto' a los mensajes (más lento)" },
    "orden": { "enum": ["actualizacion", "creacion", "agenda"], "default": "actualizacion", "description": "'actualizacion' y 'creacion': más reciente primero. 'agenda': fecha de proximaAgenda ascendente (vencidas incluidas), sin agenda al final" },
    "limite": { "type": "integer", "minimum": 1, "maximum": 100, "default": 20 },
    "desplazamiento": { "type": "integer", "minimum": 0, "default": 0 }
  },
  "additionalProperties": false
}
```

**soloAbiertos (P9)**: el valor por defecto es `true` porque en la base de testing hay ~33.000 tickets cerrados contra ~1.300 abiertos. El criterio es `ESTADOS_RECLAMOS.FINALIZADO = 0`, confirmado por el usuario. Hoy son abiertos: INICIADO, INICIADO Y EN TRÁMITE, EN TRÁMITE, AGENDADO, A PRESUPUESTAR, PENDIENTE y PRESUPUESTO APROBADO.

**outputSchema**
```json
{
  "type": "object",
  "properties": {
    "total": { "type": "integer" }, "limite": { "type": "integer" }, "desplazamiento": { "type": "integer" }, "hayMas": { "type": "boolean" },
    "tickets": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "integer" },
          "titulo": { "type": "string" },
          "estado": { "$ref": "#/$defs/estadoTicket" },
          "prioridad": { "$ref": "#/$defs/prioridadTicket" },
          "sistema": { "$ref": "#/$defs/sistema" },
          "cliente": { "$ref": "#/$defs/refNombre" },
          "asignadoA": { "anyOf": [{ "$ref": "#/$defs/persona" }, { "type": "null" }] },
          "creadoEn": { "$ref": "#/$defs/fechaHora" },
          "actualizadoEn": { "$ref": "#/$defs/fechaHora" },
          "proximaAgenda": {
            "anyOf": [
              { "type": "object", "properties": { "inicio": { "$ref": "#/$defs/fechaHora" }, "usuario": { "$ref": "#/$defs/persona" } }, "required": ["inicio", "usuario"] },
              { "type": "null" }
            ]
          },
          "presupuesto": { "anyOf": [{ "$ref": "#/$defs/estadoPresupuesto" }, { "type": "null" }], "description": "Estado del presupuesto más reciente; null si no tiene" }
        },
        "required": ["id", "titulo", "estado", "prioridad", "sistema", "cliente", "asignadoA", "creadoEn", "actualizadoEn", "proximaAgenda", "presupuesto"]
      }
    }
  },
  "required": ["total", "limite", "desplazamiento", "hayMas", "tickets"]
}
```
**P5**: `proximaAgenda` y `presupuesto` evitan llamar a `obtener_contexto_ticket` solo para saber si el ticket está agendado o presupuestado.

**Ejemplo** (`{ "asignadoA": "yo", "estados": ["AGENDADO"], "limite": 2 }`; el segundo ticket es ilustrativo):
```json
{
  "total": 7, "limite": 2, "desplazamiento": 0, "hayMas": true,
  "tickets": [
    { "id": 74836, "titulo": "error al cargar asiento", "estado": "AGENDADO", "prioridad": "CRITICA", "sistema": "JK3",
      "cliente": { "id": 502312, "nombre": "Suscripciones del Cielo SA" }, "asignadoA": { "id": 15169, "nombre": "Andres Pelaez" },
      "creadoEn": "2026-09-28T15:44:11.925-03:00", "actualizadoEn": "2026-10-05T13:09:35.383-03:00",
      "proximaAgenda": { "inicio": "2026-10-06T09:00:00-03:00", "usuario": { "id": 15169, "nombre": "Andres Pelaez" } },
      "presupuesto": null },
    { "id": 74790, "titulo": "no imprime factura B", "estado": "AGENDADO", "prioridad": "ALTA", "sistema": "JK3",
      "cliente": { "id": 501877, "nombre": "OTRO CLIENTE SRL" }, "asignadoA": { "id": 15169, "nombre": "Andres Pelaez" },
      "creadoEn": "2026-09-25T10:02:00-03:00", "actualizadoEn": "2026-10-02T16:40:12.004-03:00",
      "proximaAgenda": null, "presupuesto": "PENDIENTE" }
  ]
}
```
Resumen en texto: `7 tickets (mostrando 1–2). #74836 AGENDADO/CRITICA "error al cargar asiento"; #74790 AGENDADO/ALTA "no imprime factura B".`

### D6. `listar_tareas`

**SP**: `PROC_LIST_TAREAS_AG` (sobre `PRV_LIST_TAREAS_BASE_AG`, que lee `ASIGNACION_JK3`). El join con tickets compara `NRO_TICKET` (VARCHAR(20)) contra el número de ticket: se normaliza con `TRIM` y se descartan los valores no numéricos. El MCP expone siempre `ticketId` entero. `HORAS_ESTIMADAS` es INTEGER en la tabla.

**inputSchema**
```json
{
  "type": "object",
  "properties": {
    "desarrollador": { "anyOf": [{ "type": "integer" }, { "const": "yo" }], "description": "Desarrollador ASIGNADO (COD_DESARROLLADOR)" },
    "responsable": { "anyOf": [{ "type": "integer" }, { "const": "yo" }], "description": "Desarrollador RESPONSABLE (supervisor)" },
    "ticketId": { "type": "integer" },
    "estados": { "type": "array", "items": { "$ref": "#/$defs/estadoTarea" }, "minItems": 1, "uniqueItems": true, "description": "Si se indica, se ignora soloPendientes" },
    "soloPendientes": { "type": "boolean", "default": true, "description": "Excluye FINALIZADA y ARCHIVADO" },
    "prioridad": { "type": "integer" },
    "creadaDesde": { "$ref": "#/$defs/fecha" },
    "creadaHasta": { "$ref": "#/$defs/fecha" },
    "incluirDescansos": { "type": "boolean", "default": false },
    "incluirDescripcion": { "type": "boolean", "default": false },
    "limite": { "type": "integer", "minimum": 1, "maximum": 100, "default": 20 },
    "desplazamiento": { "type": "integer", "minimum": 0, "default": 0 }
  },
  "additionalProperties": false
}
```
Sin `desarrollador`, `responsable` ni `ticketId`, el handler aplica `desarrollador: "yo"`. **P8**: `FINALIZA DESARROLLO` cuenta como pendiente (falta el cierre). El estado `EN_CURSO` que ofrece `mover_tarea_tablero` en la v1 no aparece en los datos y no está en el enum.

**outputSchema**
```json
{
  "type": "object",
  "properties": {
    "total": { "type": "integer" }, "limite": { "type": "integer" }, "desplazamiento": { "type": "integer" }, "hayMas": { "type": "boolean" },
    "tareas": { "type": "array", "items": { "$ref": "#/$defs/tarea" } }
  },
  "required": ["total", "limite", "desplazamiento", "hayMas", "tareas"]
}
```
`descripcion` solo aparece cuando `incluirDescripcion: true`. En `obtener_contexto_ticket` aparece siempre.

**Ejemplo** (`{ "ticketId": 74703, "soloPendientes": false, "limite": 2 }`, datos de la base de testing; `tipo` ilustrativo):
```json
{
  "total": 4, "limite": 2, "desplazamiento": 0, "hayMas": true,
  "tareas": [
    { "id": 6248, "nombre": "Asientos de compras sin nombre del Proveedor", "estado": "FINALIZA DESARROLLO", "prioridad": 2,
      "tipo": { "id": 1, "nombre": "DESARROLLO" }, "ticketId": 74703,
      "desarrollador": { "id": 100936, "nombre": "Andres Pelaez" }, "responsable": { "id": 100936, "nombre": "Andres Pelaez" },
      "horasEstimadas": 2, "fechaCompromiso": null, "creadaEn": "2026-10-07T11:29:47.440-03:00" },
    { "id": 6249, "nombre": "Generador de asientos de compras: NIT/Proveedor, ver comprobante, imprimir asiento y reorden de grilla",
      "estado": "FINALIZA DESARROLLO", "prioridad": 3, "tipo": null, "ticketId": 74703,
      "desarrollador": { "id": 1117419, "nombre": "Abril Ocampo" }, "responsable": null,
      "horasEstimadas": 6, "fechaCompromiso": null, "creadaEn": "2026-10-07T13:51:56.077-03:00" }
  ]
}
```
El desarrollador 1117419 tiene usuario vinculado ("Abril Ocampo", verificado el 2026-10-16). Uno sin usuario vinculado mostraría el login de `DESARROLLADORES`.

Resumen en texto: `4 tareas (mostrando 1–2). #6248 FINALIZA DESARROLLO p2 "Asientos de compras sin nombre del Proveedor" (Andres Pelaez); #6249 FINALIZA DESARROLLO p3 "Generador de asientos de compras…" (Abril Ocampo).`

### D7. `resumir_tickets`

**SP**: `PROC_LIST_RESUMEN_TICKETS_AG`. Un solo SP con `P_DIMENSION` (`ESTADO` | `PRIORIDAD` | `SISTEMA` | `CLIENTE` | `ASIGNADO`). El MCP lo llama una vez por dimensión pedida (en paralelo, misma transacción) y toma `total` de la primera. Agrupa con `GROUP BY` en la base. Para `CLIENTE` y `ASIGNADO` devuelve el top 20 más una fila "resto" con `CLAVE_ID` NULL.

**inputSchema**: los mismos filtros que `listar_tickets` (`estados`, `soloAbiertos`, `prioridades`, `sistema`, `asignadoA`, `agendadoA`, `clienteId`, `creadoDesde`, `creadoHasta`, `texto`, `buscarEnMensajes`), sin `orden`, `limite` ni `desplazamiento`, más:
```json
{ "agruparPor": { "type": "array", "items": { "enum": ["estado", "prioridad", "sistema", "cliente", "asignado"] }, "minItems": 1, "uniqueItems": true, "default": ["estado", "prioridad", "cliente"] } }
```

**outputSchema**
```json
{
  "type": "object",
  "$defs": {
    "conteoTexto": { "type": "object", "properties": { "clave": { "type": ["string", "null"] }, "cantidad": { "type": "integer" } }, "required": ["clave", "cantidad"] },
    "conteoRef": { "type": "object", "properties": { "clave": { "anyOf": [{ "$ref": "#/$defs/refNombre" }, { "type": "null" }] }, "cantidad": { "type": "integer" } }, "required": ["clave", "cantidad"] }
  },
  "properties": {
    "total": { "type": "integer" },
    "porEstado": { "type": "array", "items": { "$ref": "#/$defs/conteoTexto" } },
    "porPrioridad": { "type": "array", "items": { "$ref": "#/$defs/conteoTexto" } },
    "porSistema": { "type": "array", "items": { "$ref": "#/$defs/conteoTexto" } },
    "porCliente": { "type": "array", "items": { "$ref": "#/$defs/conteoRef" } },
    "porAsignado": { "type": "array", "items": { "$ref": "#/$defs/conteoRef" } }
  },
  "required": ["total"]
}
```
Solo están presentes las dimensiones pedidas. En `porSistema`, `clave: null` agrupa los tickets sin sistema (la mayoría de los viejos). En `porCliente` y `porAsignado`, `clave: null` es la fila "resto" (y en `porAsignado` también los tickets sin asignar).

**Ejemplo** (`{ "asignadoA": "yo", "agruparPor": ["estado", "prioridad"] }`, ilustrativo):
```json
{ "total": 12,
  "porEstado": [{ "clave": "AGENDADO", "cantidad": 7 }, { "clave": "EN TRÁMITE", "cantidad": 5 }],
  "porPrioridad": [{ "clave": "BAJA", "cantidad": 6 }, { "clave": "CRITICA", "cantidad": 4 }, { "clave": "MEDIA", "cantidad": 2 }] }
```
Resumen en texto: `12 tickets abiertos. Por estado: AGENDADO 7, EN TRÁMITE 5. Por prioridad: BAJA 6, CRITICA 4, MEDIA 2.`

### D8. Esquema real y scripts SQL

Convenciones del hub: encabezado, `RESULTADO`/`MENSAJE_ERROR` en públicos y pre/postcondiciones en privados. Tablas, columnas y lógica verificadas el 2026-10-16 en `CREAR_JK3_20261016.fdb` leyendo el código de los SP de la v1 (`PROC_GET_INFO_TICKET_PORTAL`, `PROC_GET_TICKETS_ADMIN_PORTAL`, `PROC_GET_HITOS_TICKET_PORTAL`, `PROC_GET_AGENDAS_TICKET_ADMIN`, `PROC_GET_PRES_TICKET_PORTAL`, `PROC_GET_ARCHIVO_ADJ_SAC_X_RECL`, `GET_ASIGNACION` y `GET_ASIGNACION_DESARROLLADORES`).

**Esquema real (resumen)**
- **Estado actual del ticket**: no es una columna de `RECLAMOS`. Sale del último movimiento de `DET_RECLAMOS_CLIENTES` (mayor `FECHA_ORDEN`, desempate por `COD_MENSAJE_CLIENTE`) → `RESULTADOS_RECLAMOS` (`DESCRIPCION` = resultado/subestado) → `ESTADOS_RECLAMOS` (`ESTADO`, `FINALIZADO`). El asignado es `COD_USUARIO_DESTINO` de ese movimiento y `actualizadoEn` es su `FECHA_ORDEN`. Es la misma lógica de `PROC_GET_INFO_TICKET_PORTAL` y `PROC_GET_TICKETS_ADMIN_PORTAL`.
- **`RECLAMOS`**: `TITULO`, `PEDIDO_NORMALIZADO` (BLOB), `PRIORIDAD`, `TIPO_SISTEMA`, `CONTACTO`, `COD_CLIENTE`, `COD_PROCESO_SISTEMA` (→ `PROCESOS_SISTEMAS.NOMBRE`), `FECHA_HORA` (creación). No hay columna de tipo de ticket: `ticket.tipo` se quitó del contrato.
- **Charset**: las columnas de texto son `ISO8859_1`. La búsqueda sin acentos usa `COLLATE ES_ES_CI_AI` (verificado que funciona también sobre el BLOB `PEDIDO_NORMALIZADO`). La conexión del MCP usa charset UTF8 para que Firebird translitere.
- **Visibilidad**: los SP de tickets de la v1 no filtran por usuario. Decisión del usuario (2026-10-16): la v2 hace lo mismo. Ningún SP `_AG` recibe el usuario de la sesión; la sesión solo resuelve `"yo"`.
- **Historial**: se envuelve `PROC_GET_HITOS_TICKET_PORTAL(:ticket, 0)`, que calcula `TIPO_HITO` recorriendo la secuencia (`MENSAJE`, `ASIGNACION`, `CAMBIO_ESTADO`, `CAMBIO_PRIORIDAD`, `CAMBIO_TIPO_SISTEMA`). Siempre se llama con 0 para que el cálculo use la secuencia completa; el filtro de visibilidad se aplica afuera. Texto = `MENSAJE_EDITADO` si no está vacío, si no `MENSAJE` (la v1 hace lo mismo para `TEXTO_HITO` y para el texto de respuesta).
- **Personas**: `COALESCE(USUARIOS.NOMBRE, USUARIOS.ALIAS)` (mismo `COALESCE` que la v1 en listados). Para un desarrollador: el usuario con `USUARIOS.COD_DESARROLLADOR` vinculado cuyo `ALIAS` no empieza con `DEV-` (8 desarrolladores tienen además un usuario técnico `DEV-*`); si solo hay uno `DEV-*`, ese; si no hay ninguno, `DESARROLLADORES.NOMBRE` (login). Criterio confirmado por el usuario.
- **Agendas**: `EVENTOS` (`COD_RECLAMO`, `FECHA_EVENTO`, `FECHA_HASTA`, `TODO_DIA`, `REALIZADO`) → `AGENDA_EVENTOS.COD_USUARIO` (verificado: coincide en las 36.993 agendas con el join `USUARIOS.COD_AGENDA_EVENTO` de la otra v1, y ninguna queda sin usuario). `proximaAgenda` y `agendadoA` siguen a `PROC_GET_TICKETS_ADMIN_PORTAL` (confirmado por el usuario): la agenda es el evento con `FECHA_EVENTO` más reciente, sin mirar `REALIZADO`, y `agendadoA` matchea cualquier evento del usuario en el ticket.
- **Presupuestos**: `RECLAMOS_COMPROBANTES` + `COMPROBANTES` + `TIPOS_COMPROBANTES` con `TIPO_COMPROBANTE = 'Presupuesto'` y no anulados. `APROBADO` 1/0/NULL → `APROBADO`/`RECHAZADO`/`PENDIENTE`. `NRO_COMPROBANTE` es VARCHAR(15), `TOTAL` NUMERIC(18,3), `FECHA` DATE.
- **Adjuntos**: se envuelve `PROC_GET_ARCHIVO_ADJ_SAC_X_RECL` (tabla `ARCHIVOS_ADJUNTOS_SAC`). `FECHA` es TIMESTAMP; se expone como fecha.
- **Tareas**: `ASIGNACION_JK3` (513 filas en testing, sin índice sobre `NRO_TICKET`: el `TRIM` no es problema), tipo en `TIPO_ASIGNACION_JK3.NOMBRE`, `HORAS_ESTIMADAS` INTEGER, `FECHA_COMPROMISO` TIMESTAMP (se expone como fecha). Sin restricción por `ADMIN_DESARROLLADORES` (decisión del usuario: como `GET_ASIGNACION_DESARROLLADORES`).

Los scripts están en `db/procedimientos/` (desde la raíz del repo), un archivo por procedimiento y numerados en orden de ejecución (primero los privados). El orden, los permisos y cómo aplicarlos están en `db/README.md`. El 2026-10-17 se comparó el código de los 11 SP en la base de testing contra esos archivos y coincide.

**Verificaciones previas al DDL (hechas con SELECT, sin crear objetos):** `COLLATE ES_ES_CI_AI CONTAINING` sobre `TITULO` y sobre el BLOB `PEDIDO_NORMALIZADO` funciona; el predicado de último movimiento con `FINALIZADO = 0` responde sin problemas sobre la base de testing; el join de agendas por `AGENDA_EVENTOS.COD_USUARIO` coincide con el de `USUARIOS.COD_AGENDA_EVENTO`; la normalización de `NRO_TICKET` con `SIMILAR TO` devuelve las 4 tareas del #74703. Pendiente para 1.3: medir el plan de `PROC_LIST_TICKETS_AG` sin filtros; si no usa `IDX_DET_RECLAMOS_CLIENTES_FECHA`/`PK_DET_RECLAMOS_CLIENTES` como la v1, copiar su cláusula `PLAN`.

### D9. Script de medición

- `scripts/medir-eficiencia.ts`, ejecutable con `npx tsx`. Usa el cliente del SDK MCP: Streamable HTTP contra la v1 (`MEDICION_URL_V1` y `MEDICION_TOKEN_V1`; el token nunca se escribe en el reporte) y stdio contra la v2, que se lanza desde `dist/index.js` con las mismas variables de entorno que usa Claude Desktop.
- `medicion/tickets.json` contiene `{ "tickets": [74836, ...], "listados": [...] }`, versionado.
- **Estrategia v1 para "contexto"**: `detalle_ticket` + `historial_ticket` + `agendas_ticket` + `presupuestos_ticket` + `listar_tareas_responsable` desde la fecha de creación del ticket, filtrando `NRO_TICKET` del lado del script. Se cuentan todas las llamadas y todos los caracteres, porque eso es lo que un agente leería.
- **Métrica**: caracteres de `content[].text` concatenado en ambas versiones, más caracteres de `JSON.stringify(structuredContent)` en v2. Se informan los dos, porque un cliente puede leer uno u otro.
- **Salida**: `medicion/resultados/AAAA-MM-DD-HHmm.json` y `.md`, con tabla por caso, reducción porcentual y totales.

## Risks / Trade-offs

- [Los SP y columnas reales difieren de lo supuesto] → Todo el conocimiento del esquema queda en 3 privados más las proyecciones de agendas, presupuestos y adjuntos. La tarea 1.1 los confirma antes de escribir código de datos, y el DDL no se ejecuta sin aprobación.
- [Seleccionar desde SP selectables (`FROM PRV_...`) impide al optimizador usar índices para los filtros que se aplican afuera] → Todos los filtros salvo texto se pasan como parámetros al privado. Afuera solo quedan texto, orden y paginación. Se mide el plan con datos reales en 1.3.
- [El estado actual exige buscar el último movimiento de cada ticket] → Medido el 2026-10-17 en testing: el `NOT EXISTS` de la v1 tarda ~65 s para los abiertos (la v1 no lo nota porque corta con `FIRST 100`). `PRV_LIST_TICKETS_BASE_AG` recorre `RECLAMOS` y busca el último movimiento con `FIRST 1` por índice: ~2,5 s por llamada a `listar_tickets` o por dimensión de `resumir_tickets` (5 dimensiones ≈ 12 s), comparable al listado v1 (~1,8 s). Si hace falta bajar más, la opción es mantener el estado actual en una columna o tabla (otro change).
- [`buscarEnMensajes` recorre BLOBs de `MENSAJES_CLIENTES` (~1,5 M filas)] → Viene apagado por defecto, siempre combinado con los filtros indexables, y está documentado como lento en la descripción de la tool. Si se mide inaceptable, se propone un índice o una tabla de búsqueda en otro change.
- [Sin regla de visibilidad ni autenticación: cualquier usuario configurado ve cualquier ticket] → Es la conducta actual de la v1 (sus SP no filtran por usuario), aceptada por el usuario el 2026-10-16. La identidad igual se exige por OAuth y queda en el log de cada invocación.
- [La zona horaria de la base no es la supuesta] → Se configura con `ZONA_HORARIA_BASE`, y hay un test con un timestamp conocido del #74836.
- [`isError` + `outputSchema`: el cliente del SDK TS valida el error contra el `outputSchema`] → Verificado en 1.32.1. Cada `outputSchema` admite la forma de error (ver D1). Lo cubre un test de integración con el cliente del SDK.
- [Comparar caracteres no es comparar tokens] → Es lo que pide el experimento. Los caracteres en español sin escapado Unicode se acercan más a los tokens reales que la v1, así que la comparación tiende a subestimar la mejora.

## Migration Plan

1. SP reales confirmados (tarea 1.1). Falta la aprobación explícita del DDL (tarea 1.3).
2. Ejecutar los scripts en la base de desarrollo de tickets, desplegar la v2 junto a la v1 (URL distinta) y correr la medición.
3. La v1 no se toca. Rollback: bajar el servicio v2 y hacer `DROP` de los 11 SP `_AG`, que no tienen dependientes fuera de este MCP.

## Open Questions

- Además del #74836, ¿qué tickets componen el conjunto fijo de medición? Se sugieren 4 o 5 con historial largo, con tareas y con presupuestos. Se resuelve al cargar `medicion/tickets.json` y no cambia el diseño.