# listado-tickets Specification

## Purpose

Permite que un agente encuentre tickets con filtros combinables, búsqueda por texto y paginación con total, y que obtenga conteos agregados sin traer los tickets uno por uno.

## Requirements

### Requirement: Listado liviano de tickets
La tool `listar_tickets` MUST devolver `tickets`, donde cada elemento contiene solo: `id`, `titulo`, `estado`, `prioridad`, `sistema` (nullable), `cliente` (`{ id, nombre }`), `asignadoA` (persona, nullable), `creadoEn`, `actualizadoEn`, `proximaAgenda` (`{ inicio, usuario }` de la agenda con fecha más reciente del ticket, como la v1; nullable) y `presupuesto` (estado del presupuesto más reciente: `PENDIENTE`, `APROBADO` o `RECHAZADO`; nullable). MUST NOT incluir textos largos (mensajes, pedido normalizado, descripción).

El parámetro `orden` MUST aceptar `actualizacion` (por defecto), `creacion` o `agenda`. Los dos primeros ordenan por la fecha correspondiente en forma descendente; `agenda` ordena por la fecha de `proximaAgenda` en forma ascendente (la más antigua primero, incluidas las vencidas), con los tickets sin agenda al final.

#### Scenario: Elemento liviano
- **WHEN** se invoca `listar_tickets` sin filtros
- **THEN** ningún elemento de `tickets` contiene `pedidoNormalizado` ni textos de mensajes
- **AND** los elementos están ordenados por `actualizadoEn` descendente

#### Scenario: Agenda y presupuesto sin otra llamada
- **GIVEN** el ticket #74836, con una agenda del usuario 15169 el 2026-10-06 a las 09:00 y sin presupuestos
- **WHEN** aparece en el resultado de `listar_tickets`
- **THEN** su `proximaAgenda` es `{ "inicio": "2026-10-06T09:00:00-03:00", "usuario": { "id": 15169, "nombre": "Andres Pelaez" } }` y su `presupuesto` es `null`

### Requirement: Filtros combinables
`listar_tickets` MUST aceptar estos filtros opcionales, que se combinan con AND entre sí:

- `estados`: arreglo de estados válidos de ticket, OR entre valores.
- `soloAbiertos`: booleano, por defecto `true`. Abierto = estado con `ESTADOS_RECLAMOS.FINALIZADO = 0`. Se ignora si se indica `estados`.
- `prioridades`: arreglo de prioridades válidas, OR entre valores.
- `sistema`: `JK3`, `JK2`, `DESKTOP` o `CRM`.
- `asignadoA`: entero o `"yo"`.
- `agendadoA`: entero o `"yo"`; usuario con alguna agenda en el ticket (mismo criterio que la v1).
- `clienteId`: entero.
- `creadoDesde` / `creadoHasta`: fecha `AAAA-MM-DD`, ambos inclusive.
- `texto`: string.

Los valores de estado y prioridad fuera del catálogo MUST rechazarse con `PARAMETRO_INVALIDO`.

#### Scenario: Solo abiertos por defecto
- **WHEN** se invoca `listar_tickets` sin `estados` ni `soloAbiertos`
- **THEN** ningún elemento tiene `estado` igual a `"FINALIZADO"` o `"CANCELADO"`

#### Scenario: Incluir cerrados
- **WHEN** se invoca con `soloAbiertos: false`
- **THEN** el resultado puede incluir tickets en estado `"FINALIZADO"` o `"CANCELADO"`

#### Scenario: Estados explícitos ignoran soloAbiertos
- **WHEN** se invoca con `estados: ["FINALIZADO"]` y sin `soloAbiertos`
- **THEN** todos los elementos tienen `estado: "FINALIZADO"`

#### Scenario: Agendados a mí
- **GIVEN** una sesión del usuario 15169
- **WHEN** se invoca con `agendadoA: "yo"`
- **THEN** todos los elementos tienen `proximaAgenda.usuario.id` igual a 15169

#### Scenario: Varios estados a la vez
- **WHEN** se invoca `listar_tickets` con `estados: ["INICIADO", "AGENDADO"]`
- **THEN** todos los elementos tienen `estado` igual a `"INICIADO"` o `"AGENDADO"`
- **AND** `total` cuenta los tickets de ambos estados

#### Scenario: Mis tickets en un rango de fechas
- **GIVEN** una sesión del usuario 15169
- **WHEN** se invoca `listar_tickets` con `asignadoA: "yo"`, `creadoDesde: "2026-09-01"` y `creadoHasta: "2026-09-30"`
- **THEN** todos los elementos tienen `asignadoA.id` igual a 15169 y `creadoEn` dentro de septiembre de 2026
- **AND** el resultado incluye el ticket #74836

#### Scenario: Rango de fechas invertido
- **WHEN** se invoca con `creadoDesde` posterior a `creadoHasta`
- **THEN** la respuesta es un error con código `PARAMETRO_INVALIDO`

#### Scenario: Estado inexistente
- **WHEN** se invoca con `estados: ["NO_EXISTE"]`
- **THEN** la respuesta es un error con código `PARAMETRO_INVALIDO`

#### Scenario: Estado válido sin tickets
- **GIVEN** que ningún ticket está en estado `"A PRESUPUESTAR"`
- **WHEN** se invoca con `estados: ["A PRESUPUESTAR"]`
- **THEN** la respuesta no es un error, `tickets` es vacío y `total` es 0

#### Scenario: Catálogo de estados al día
- **GIVEN** la tabla `ESTADOS_RECLAMOS` de la base
- **WHEN** corre el test de integración del catálogo
- **THEN** los valores aceptados en `estados` son exactamente los de esa tabla

### Requirement: Búsqueda por texto libre
El filtro `texto` MUST buscar, sin distinguir mayúsculas ni acentos, en el título del ticket y en el pedido normalizado. Con `buscarEnMensajes: true` MUST buscar también en el texto de los mensajes del historial. Un `texto` de menos de 3 caracteres MUST rechazarse con `PARAMETRO_INVALIDO`.

#### Scenario: Búsqueda en título
- **WHEN** se invoca `listar_tickets` con `texto: "asiento"`
- **THEN** el resultado incluye el ticket #74836 (título "error al cargar asiento")

#### Scenario: Búsqueda en mensajes
- **GIVEN** un ticket cuyo título no contiene "imagen", pero sí uno de sus mensajes
- **WHEN** se invoca con `texto: "imagen"` y `buscarEnMensajes: true`
- **THEN** ese ticket aparece en el resultado
- **AND** sin `buscarEnMensajes` no aparece

#### Scenario: Texto demasiado corto
- **WHEN** se invoca con `texto: "as"`
- **THEN** la respuesta es un error con código `PARAMETRO_INVALIDO`

### Requirement: Resumen agregado de tickets
La tool `resumir_tickets` MUST aceptar los mismos filtros que `listar_tickets` (sin `orden` ni paginación, y con el mismo `soloAbiertos: true` por defecto) y `agruparPor`: un arreglo con uno o más de `estado`, `prioridad`, `sistema`, `cliente` y `asignado` (por defecto `estado`, `prioridad` y `cliente`). MUST devolver `total` y, por cada dimensión pedida, un arreglo de `{ clave, cantidad }` ordenado por `cantidad` descendente. Los conteos MUST calcularse en la base, no trayendo los tickets al servidor MCP.

#### Scenario: Conteo por estado
- **GIVEN** 3 tickets en estado INICIADO y 2 en AGENDADO que cumplen los filtros
- **WHEN** se invoca `resumir_tickets` con `agruparPor: ["estado"]`
- **THEN** `porEstado` es `[{ "clave": "INICIADO", "cantidad": 3 }, { "clave": "AGENDADO", "cantidad": 2 }]` y `total` es 5

#### Scenario: Suma de conteos igual al total
- **WHEN** se invoca `resumir_tickets` con cualquier combinación de filtros
- **THEN** la suma de `cantidad` de `porEstado` es igual a `total`

#### Scenario: Top de clientes
- **GIVEN** más de 20 clientes con tickets que cumplen los filtros
- **WHEN** se agrupa por `cliente`
- **THEN** `porCliente` tiene 21 elementos: los 20 con más tickets (con `clave` `{ id, nombre }`) más uno con `clave: null` que acumula el resto
- **AND** `porAsignado` sigue la misma regla, y su `clave: null` acumula además los tickets sin asignar

#### Scenario: Tickets sin sistema
- **GIVEN** tickets con sistema NULL que cumplen los filtros
- **WHEN** se agrupa por `sistema`
- **THEN** `porSistema` incluye un elemento con `clave: null` que los cuenta
