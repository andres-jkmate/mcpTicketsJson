# contrato-tools Specification

## Purpose

Define el contrato transversal que cumple toda tool del MCP de tickets v2: la forma de la respuesta, los tipos y formatos de los datos, la identidad por sesión, la paginación y los errores uniformes. Así un agente puede interpretar cualquier tool sin casos especiales.

## Requirements

### Requirement: Respuesta estructurada con resumen y datos en texto
Toda tool MUST declarar un `outputSchema` (JSON Schema) y toda respuesta exitosa MUST incluir `structuredContent` que valide contra ese schema. El `content` MUST tener dos bloques de tipo texto: primero un resumen legible en español y después el mismo `structuredContent` serializado como JSON. Hay clientes, como Claude Desktop, que solo le pasan `content` al modelo; sin el JSON, el agente recibiría únicamente el resumen.

#### Scenario: Respuesta exitosa valida contra el outputSchema
- **GIVEN** un cliente MCP autenticado
- **WHEN** invoca cualquier tool con parámetros válidos
- **THEN** la respuesta contiene `structuredContent` que valida contra el `outputSchema` declarado en `tools/list`
- **AND** contiene al menos un bloque `content` de tipo `text` con un resumen no vacío

#### Scenario: Cliente sin soporte de contenido estructurado
- **GIVEN** un cliente MCP que solo lee `content`
- **WHEN** invoca `obtener_contexto_ticket` para un ticket existente
- **THEN** el primer bloque de texto incluye como mínimo el número, el título, el estado y el asignado del ticket
- **AND** el segundo bloque de texto es el `structuredContent` serializado, con el historial, las tareas, las agendas, los presupuestos y los adjuntos

### Requirement: Campos camelCase, estables y sin duplicados
Los nombres de campo de `structuredContent` MUST estar en camelCase y en español, y MUST NOT depender de los nombres de columna de los SP. Una misma respuesta MUST NOT incluir dos campos con el mismo dato ni datos de presentación (colores, íconos, estilos).

#### Scenario: Sin columnas crudas ni datos de UI
- **GIVEN** el ticket #74836
- **WHEN** se invoca `obtener_contexto_ticket` con `ticketId` 74836
- **THEN** ningún nombre de campo de la respuesta está en mayúsculas con guiones bajos (por ejemplo `COD_RECLAMO`)
- **AND** la respuesta no contiene ningún campo de color de perfil ni equivalente
- **AND** cada mensaje del historial tiene una sola fecha

### Requirement: Tipos consistentes entre tools
Un mismo dato MUST tener el mismo nombre y el mismo tipo en todas las tools. Los identificadores MUST ser enteros (el número de ticket incluido). Los booleanos MUST ser `true`/`false`, nunca 0/1. Las personas MUST representarse como un objeto `{ id, nombre }` y cada tipo de persona MUST usar siempre la misma fuente para el nombre.

#### Scenario: Número de ticket entero en todas las tools
- **GIVEN** una tarea asociada al ticket #74836
- **WHEN** se obtiene la tarea con `listar_tareas` y el ticket con `listar_tickets`
- **THEN** en ambas respuestas el ticket se identifica con un campo de tipo entero con valor `74836`

#### Scenario: Booleanos reales
- **WHEN** cualquier tool devuelve un indicador (por ejemplo, si un mensaje es visible para el cliente)
- **THEN** el valor es el booleano JSON `true` o `false`

#### Scenario: Mismo usuario, mismo nombre
- **GIVEN** un usuario que aparece como asignado del ticket y como dueño de una agenda del mismo ticket
- **WHEN** se invoca `obtener_contexto_ticket`
- **THEN** los dos objetos persona tienen el mismo `id` y el mismo `nombre`

### Requirement: Fechas ISO 8601 con offset
Toda fecha-hora MUST serializarse en ISO 8601 con offset explícito (por ejemplo `2026-09-28T15:44:11.925-03:00`). Las fechas sin hora MUST serializarse como `AAAA-MM-DD`.

#### Scenario: Fecha de creación con offset
- **WHEN** se obtiene el ticket #74836
- **THEN** `creadoEn` coincide con el patrón `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?[+-]\d{2}:\d{2}$`

### Requirement: JSON sin escapado Unicode
Los textos de la respuesta (en `structuredContent` y en `content`) MUST emitir los caracteres no ASCII literalmente en UTF-8, sin secuencias `\uXXXX`.

#### Scenario: Acentos literales
- **GIVEN** un ticket cuyo historial contiene la palabra "configuración"
- **WHEN** se serializa la respuesta en el wire
- **THEN** el texto contiene "configuración" literal y no contiene `ó` ni `ó`

### Requirement: Identidad desde la configuración del proceso
El servidor corre localmente por stdio, un proceso por usuario y sin autenticación (proyecto de evaluación). La identidad de quien llama MUST resolverse desde la configuración del proceso (`MCP_COD_USUARIO`) y MUST NOT aceptarse como parámetro de ninguna tool. Los filtros que nombran a otra persona (desarrollador, responsable, asignado) MUST aceptar un id explícito o el valor `"yo"`, que se resuelve desde la sesión.

#### Scenario: Sin parámetro de identidad
- **WHEN** un cliente consulta `tools/list`
- **THEN** ningún `inputSchema` declara un parámetro que represente al usuario que llama

#### Scenario: "yo" resuelto por sesión
- **GIVEN** una sesión cuyo desarrollador asociado es 100936
- **WHEN** se invoca `listar_tareas` con `desarrollador: "yo"`
- **THEN** el resultado es el mismo que con `desarrollador: 100936`

#### Scenario: Proceso sin usuario configurado
- **WHEN** se lanza el servidor sin `MCP_COD_USUARIO`
- **THEN** el proceso termina con un error que lo explica en stderr, sin escribir nada en stdout ni atender tools

### Requirement: Annotations MCP
Toda tool MUST declarar annotations. Todas las tools de este change MUST declarar `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true` y `openWorldHint: false`.

#### Scenario: Tools de lectura anotadas
- **WHEN** un cliente consulta `tools/list`
- **THEN** cada tool incluye `annotations.readOnlyHint` igual a `true`

### Requirement: Paginación con total
Toda tool de listado MUST aceptar `limite` (por defecto 20, máximo 100) y `desplazamiento` (por defecto 0). MUST devolver `total` (cantidad de elementos que cumplen los filtros, sin contar la paginación), `limite`, `desplazamiento` y `hayMas`.

#### Scenario: Segunda página
- **GIVEN** 45 tickets que cumplen los filtros
- **WHEN** se invoca `listar_tickets` con `limite: 20` y `desplazamiento: 20`
- **THEN** la respuesta trae 20 elementos, `total: 45` y `hayMas: true`

#### Scenario: Límite fuera de rango
- **WHEN** se invoca un listado con `limite: 500`
- **THEN** la tool responde con un error de código `PARAMETRO_INVALIDO`

### Requirement: Errores uniformes con código estable
Todo error de negocio o de validación MUST devolverse como resultado de tool con `isError: true`. El `structuredContent` MUST tener la forma `{ error: { codigo, mensaje, detalle? } }`, donde `codigo` es uno de: `PARAMETRO_INVALIDO`, `TICKET_NO_ENCONTRADO`, `NO_AUTORIZADO`, `BASE_NO_DISPONIBLE`, `ERROR_INTERNO`. El `content` de texto MUST repetir el código y el mensaje. Los errores MUST NOT exponer trazas, SQL ni credenciales.

#### Scenario: Ticket inexistente
- **WHEN** se invoca `obtener_contexto_ticket` con un `ticketId` que no existe
- **THEN** la respuesta tiene `isError: true` y `structuredContent.error.codigo` igual a `TICKET_NO_ENCONTRADO`

#### Scenario: Base caída
- **GIVEN** la base Firebird no responde
- **WHEN** se invoca cualquier tool
- **THEN** la respuesta tiene `structuredContent.error.codigo` igual a `BASE_NO_DISPONIBLE` y un mensaje sin detalles de conexión

### Requirement: Logging estructurado de cada invocación
Cada invocación de tool MUST registrar un evento estructurado con: nombre de la tool, usuario de la sesión, duración en ms, cantidad de llamadas a la base, tamaño en caracteres de la respuesta, un identificador de correlación único por invocación y código de error si lo hubo. Todo otro log emitido durante esa invocación (por ejemplo, un error inesperado) MUST llevar el mismo identificador de correlación. El evento MUST NOT incluir el token ni los textos de los tickets.

#### Scenario: Evento de log por llamada
- **WHEN** se invoca `listar_tickets`
- **THEN** se emite un evento con los campos `tool`, `codUsuario`, `duracionMs`, `llamadasBase`, `caracteresRespuesta` e `idCorrelacion`

#### Scenario: Correlación de un error inesperado
- **GIVEN** una invocación que falla con un error inesperado
- **WHEN** se buscan en el log los eventos de esa invocación
- **THEN** el log del error y el evento de invocación tienen el mismo `idCorrelacion`

#### Scenario: Invocaciones distintas
- **WHEN** se invoca dos veces la misma tool con los mismos argumentos
- **THEN** los dos eventos de invocación tienen `idCorrelacion` distintos
