# listado-tareas Specification

## Purpose

Permite que un agente liste tareas (asignaciones de desarrollo) filtrando por desarrollador, responsable, ticket y estado con una sola tool. Reemplaza a las dos tools de tareas de la v1, que no filtran por ticket.

## Requirements

### Requirement: Listado liviano de tareas
La tool `listar_tareas` MUST devolver `tareas`, donde cada elemento contiene: `id`, `nombre`, `estado`, `prioridad` (entero, nullable), `tipo` (`{ id, nombre }`, nullable), `ticketId` (entero, nullable), `desarrollador` (persona, nullable), `responsable` (persona, nullable), `horasEstimadas` (entero, nullable), `fechaCompromiso` (fecha, nullable) y `creadaEn`. Por defecto MUST NOT incluir la descripción.

En `desarrollador` y `responsable`, el `id` MUST ser el código de desarrollador. El `nombre` MUST ser el `USUARIOS.NOMBRE` del usuario vinculado a ese desarrollador; si tiene más de uno, el que no tiene alias `DEV-*`; si no tiene usuario, el nombre de `DESARROLLADORES`. El listado MUST NOT restringirse a los desarrolladores que administra el usuario de la sesión.

#### Scenario: Nombre de persona del desarrollador
- **GIVEN** la tarea #6248, asignada al desarrollador 100936, vinculado al usuario "Andres Pelaez"
- **WHEN** aparece en el resultado de `listar_tareas`
- **THEN** su `desarrollador` es `{ "id": 100936, "nombre": "Andres Pelaez" }`

#### Scenario: Sin descripción por defecto
- **WHEN** se invoca `listar_tareas` sin `incluirDescripcion`
- **THEN** ningún elemento tiene el campo `descripcion`

#### Scenario: Descripción a pedido
- **WHEN** se invoca con `incluirDescripcion: true`
- **THEN** cada elemento tiene `descripcion` (string o null)

### Requirement: Filtros de tareas
`listar_tareas` MUST aceptar estos filtros opcionales, que se combinan con AND:

- `desarrollador`: entero o `"yo"`.
- `responsable`: entero o `"yo"`.
- `ticketId`: entero.
- `estados`: arreglo de estados válidos de tarea, OR entre valores. Los estados válidos son `POR INICIAR`, `INICIADA`, `REABIERTO`, `FINALIZA DESARROLLO`, `FINALIZADA` y `ARCHIVADO`.
- `soloPendientes`: booleano, por defecto `true`; excluye `FINALIZADA` y `ARCHIVADO`. Se ignora si se indica `estados`.
- `prioridad`: entero.
- `creadaDesde` / `creadaHasta`: fechas.
- `incluirDescansos`: booleano, por defecto `false`.

Si no se indica `desarrollador`, `responsable` ni `ticketId`, MUST aplicar `desarrollador: "yo"`.

#### Scenario: Tareas de un ticket
- **GIVEN** el ticket #74703 tiene 4 tareas de dos desarrolladores distintos (100936 y 1117419)
- **WHEN** se invoca `listar_tareas` con `ticketId: 74703` y `soloPendientes: false`
- **THEN** el resultado incluye las tareas de ambos desarrolladores y todas tienen `ticketId: 74703`
- **AND** `total` es 4

#### Scenario: Solo pendientes por defecto
- **WHEN** se invoca `listar_tareas` sin `estados` ni `soloPendientes`
- **THEN** ningún elemento tiene `estado` igual a `"FINALIZADA"` o `"ARCHIVADO"`
- **AND** el resultado puede incluir tareas en `"FINALIZA DESARROLLO"`

#### Scenario: Estado de tarea inexistente
- **WHEN** se invoca con `estados: ["EN_CURSO"]`
- **THEN** la respuesta es un error con código `PARAMETRO_INVALIDO`

#### Scenario: Por responsable distinto del asignado
- **GIVEN** una tarea asignada al desarrollador A con responsable B
- **WHEN** se invoca con `responsable: B`
- **THEN** la tarea aparece con `desarrollador.id` igual a A y `responsable.id` igual a B

#### Scenario: Sin filtros de persona ni ticket
- **GIVEN** una sesión cuyo desarrollador es 100936
- **WHEN** se invoca `listar_tareas` sin parámetros
- **THEN** todos los elementos tienen `desarrollador.id` igual a 100936

#### Scenario: Descansos excluidos
- **WHEN** se invoca sin `incluirDescansos`
- **THEN** ninguna tarea marcada como descanso aparece en el resultado

#### Scenario: Usuario sin desarrollador asociado
- **GIVEN** una sesión sin desarrollador asociado
- **WHEN** se invoca con `desarrollador: "yo"`
- **THEN** la respuesta es un error con código `PARAMETRO_INVALIDO` que explica que la sesión no tiene desarrollador

### Requirement: Paginación de tareas
`listar_tareas` MUST paginar según el contrato común (`limite`, `desplazamiento`, `total`, `hayMas`). Por defecto MUST ordenar por `prioridad` y después por `creadaEn` descendente.

#### Scenario: Total informado
- **GIVEN** 30 tareas que cumplen los filtros
- **WHEN** se invoca con `limite: 10`
- **THEN** la respuesta trae 10 tareas, `total: 30` y `hayMas: true`
