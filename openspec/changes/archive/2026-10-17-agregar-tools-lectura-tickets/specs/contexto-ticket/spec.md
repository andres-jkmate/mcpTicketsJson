# Spec Delta

## Purpose

Permite que un agente obtenga en una sola llamada todo el contexto de un ticket: detalle, historial compacto, tareas, agendas, presupuestos y lista de adjuntos. Reemplaza las 5 o más llamadas que exige la v1.

## ADDED Requirements

### Requirement: Contexto completo en una llamada
La tool `obtener_contexto_ticket` MUST recibir `ticketId` (entero, obligatorio). MUST devolver en una única respuesta las secciones `ticket`, `historial`, `tareas`, `agendas`, `presupuestos` y `adjuntos`. Una sección sin datos MUST devolverse como arreglo vacío, nunca omitirse.

#### Scenario: Ticket #74836
- **GIVEN** el ticket #74836 existe, tiene 5 movimientos de historial, 1 agenda y ningún presupuesto
- **WHEN** se invoca `obtener_contexto_ticket` con `ticketId: 74836`
- **THEN** `ticket.id` es `74836`, `ticket.estado` es `"AGENDADO"` y `ticket.prioridad` es `"CRITICA"`
- **AND** `historial` tiene 5 elementos en orden cronológico ascendente
- **AND** `agendas` tiene 1 elemento y `presupuestos` es un arreglo vacío

#### Scenario: Ticket sin tareas
- **GIVEN** un ticket sin tareas asociadas
- **WHEN** se invoca `obtener_contexto_ticket`
- **THEN** `tareas` es un arreglo vacío y la respuesta no es un error

### Requirement: Detalle del ticket
La sección `ticket` MUST contener: `id`, `titulo`, `estado`, `resultado` (subestado actual: el `RESULTADO_RECLAMO` del último movimiento), `prioridad`, `sistema` (nullable), `proceso` (`{ id, nombre }`, nullable), `cliente` (`{ id, nombre }`), `contacto` (nullable), `asignadoA` (persona, nullable), `creadoEn`, `actualizadoEn` y `pedidoNormalizado` (nullable). Los nombres de persona MUST salir de `USUARIOS.NOMBRE`.

#### Scenario: Datos del detalle
- **GIVEN** el ticket #74836, asignado al usuario 15169
- **WHEN** se invoca `obtener_contexto_ticket` con `ticketId: 74836`
- **THEN** `ticket.asignadoA` es `{ "id": 15169, "nombre": "Andres Pelaez" }`
- **AND** `ticket.proceso` es `{ "id": 488, "nombre": "Ingreso de Asientos" }`
- **AND** `ticket.cliente` es `{ "id": 502312, "nombre": "Suscripciones del Cielo SA" }`

#### Scenario: Subestado distinto del estado
- **GIVEN** un ticket cuyo último movimiento tiene estado "PENDIENTE" y resultado "PRESUPUESTO PENDIENTE APROBACIÓN"
- **WHEN** se obtiene su contexto
- **THEN** `ticket.estado` es `"PENDIENTE"` y `ticket.resultado` es `"PRESUPUESTO PENDIENTE APROBACIÓN"`

### Requirement: Historial compacto
Cada elemento de `historial` MUST contener: `id`, `fecha`, `tipo` (`MENSAJE`, `ASIGNACION`, `CAMBIO_ESTADO`, `CAMBIO_PRIORIDAD` o `CAMBIO_TIPO_SISTEMA`), `autor` (persona), `texto`, `esDelCliente`, `visibleCliente` y `adjuntos` (cantidad). Solo cuando aplican, MAY incluir `destinatario` (persona), `respondeA` (id de mensaje), `evento` y `resultado`; cuando no aplican MUST omitirse.

- `texto` MUST salir del mensaje (su versión editada, si existe), convertido de HTML a texto plano.
- `evento` MUST ser el texto del hito de sistema y MUST aparecer solo cuando `tipo` no es `MENSAJE`.
- `resultado` (subestado del ticket) MUST aparecer en el primer movimiento y en cada movimiento donde cambia respecto del anterior, y en ningún otro.
- MUST NOT incluirse un indicador separado de hito de sistema: `tipo` ya lo expresa.
- Los mensajes eliminados MUST excluirse.

#### Scenario: Mensaje de cliente compacto
- **GIVEN** el primer mensaje del ticket #74836, escrito por el cliente
- **WHEN** se obtiene el contexto
- **THEN** el primer elemento del historial tiene `tipo: "MENSAJE"`, `esDelCliente: true`, `resultado: "INICIADO"` y un único campo de fecha
- **AND** no tiene `evento` ni campos de categoría, origen o color

#### Scenario: Hito de sistema con evento y texto
- **GIVEN** el hito de asignación del ticket #74836, cuyo mensaje es "Prioridad cambiada a CRITICA" y cuyo texto de hito es "Ticket asignado a ANDRES JKMT"
- **WHEN** se obtiene el contexto
- **THEN** ese elemento tiene `tipo: "ASIGNACION"`, `evento: "Ticket asignado a ANDRES JKMT"` y `texto: "Prioridad cambiada a CRITICA"`

#### Scenario: Resultado solo cuando cambia
- **GIVEN** el ticket #74836, cuyos 4 primeros movimientos tienen resultado INICIADO y el quinto AGENDADO
- **WHEN** se obtiene el contexto
- **THEN** solo el primer y el quinto elemento del historial tienen `resultado`, con valores `"INICIADO"` y `"AGENDADO"`

#### Scenario: Mensaje con HTML
- **GIVEN** un mensaje guardado como `<p>Necesitamos una alerta</p>`
- **WHEN** se obtiene el contexto
- **THEN** su `texto` es `"Necesitamos una alerta"`, sin etiquetas

#### Scenario: Solo lo visible para el cliente
- **WHEN** se invoca `obtener_contexto_ticket` con `soloVisibleCliente: true`
- **THEN** todos los elementos de `historial` tienen `visibleCliente: true`

### Requirement: Límite del historial
La tool MUST aceptar `limiteHistorial` (por defecto 50, máximo 200). Cuando el historial supera el límite MUST devolver los movimientos más recientes, en orden cronológico ascendente, e informar `totalHistorial` con la cantidad total.

#### Scenario: Historial largo
- **GIVEN** un ticket con 120 movimientos
- **WHEN** se invoca `obtener_contexto_ticket` con el límite por defecto
- **THEN** `historial` tiene los 50 movimientos más recientes y `totalHistorial` es `120`

### Requirement: Tareas, agendas, presupuestos y adjuntos del ticket
- `tareas` MUST usar la misma forma de elemento que `listar_tareas` e incluir además la `descripcion`.
- `agendas` MUST contener solo `id`, `inicio`, `fin`, `todoElDia`, `realizada` y `usuario` (persona). MUST NOT incluir la descripción ni el título del evento, porque repiten datos del ticket.
- `presupuestos` MUST contener `comprobante` (número de comprobante, string), `fecha` (fecha sin hora), `estado` (`PENDIENTE`, `APROBADO` o `RECHAZADO`), `importe` (número, no texto formateado) y `aprobadoEn` (nullable). Los comprobantes anulados MUST excluirse.
- `adjuntos` MUST contener solo metadatos: `id`, `nombre`, `url`, `mensajeId` y `fecha`. MUST NOT incluir el contenido del archivo. Si el nombre registrado está vacío, `nombre` MUST ser el nombre de archivo de la ruta.

#### Scenario: Adjuntos solo como lista
- **GIVEN** el ticket #74836, con un mensaje que tiene 2 adjuntos sin nombre registrado
- **WHEN** se obtiene el contexto
- **THEN** `adjuntos` tiene 2 elementos con `mensajeId: 17303`, cada uno con `url` y con `nombre` igual al nombre de archivo de su ruta
- **AND** ningún elemento contiene el contenido binario ni base64 del archivo

#### Scenario: Agenda sin datos repetidos
- **WHEN** se obtiene el contexto del ticket #74836
- **THEN** el elemento de `agendas` tiene `id: 156` y no tiene descripción ni título

#### Scenario: Importe numérico
- **GIVEN** el ticket #74619, con un presupuesto aprobado de $ 121,00
- **WHEN** se obtiene el contexto
- **THEN** el elemento de `presupuestos` tiene `estado: "APROBADO"` e `importe: 121`

### Requirement: Visibilidad según el usuario de la sesión
La tool MUST aplicar las mismas reglas de visibilidad que la v1. La v1 no restringe tickets por usuario, así que cualquier usuario autenticado MUST poder obtener el contexto de cualquier ticket existente. La tool MUST NOT responder `NO_AUTORIZADO` por visibilidad del ticket.

#### Scenario: Ticket asignado a otro usuario
- **GIVEN** un ticket asignado a un usuario distinto del de la sesión
- **WHEN** el usuario de la sesión invoca `obtener_contexto_ticket`
- **THEN** la respuesta no es un error y contiene el contexto completo del ticket
