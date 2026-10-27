# Spec Delta

## Purpose

Cómo un agente busca movimientos de fondos de JKMate a partir de un pedido en lenguaje natural y muestra el detalle de uno, con respuestas compactas pensadas para que el modelo conteste en pocas llamadas.

## ADDED Requirements

### Requirement: Búsqueda de movimientos
La tool `buscar_movimientos_fondos` MUST devolver una lista resumida de movimientos de fondos que cumplen todos los criterios recibidos. Cada elemento MUST incluir id, número de comprobante, talonario, tipo, clase, fecha, total, tercero (nombre o null), concepto y estado, y MUST NOT incluir renglones ni datos de detalle. La respuesta MUST incluir los criterios efectivamente aplicados (incluidos los rangos por defecto), el total de coincidencias y si la lista quedó truncada. MUST ser de solo lectura.

#### Scenario: Criterios combinados
- **GIVEN** movimientos de distintas clases y fechas
- **WHEN** el agente busca con `clase: "pago"` y `fechaDesde`/`fechaHasta` iguales a ayer
- **THEN** la lista contiene solo los movimientos de clase pago con fecha de ayer y `criterio` muestra ese rango

#### Scenario: Sin resultados
- **GIVEN** ningún movimiento que cumpla los criterios
- **WHEN** el agente busca
- **THEN** la respuesta no es un error: `encontrados` es 0 y `movimientos` está vacío

#### Scenario: Paginado
- **GIVEN** 35 movimientos que cumplen los criterios
- **WHEN** el agente busca con `limite: 20`
- **THEN** la respuesta trae 20 movimientos, `encontrados` es 35 y `truncado` es true
- **AND WHEN** repite la búsqueda con `desde: 20`
- **THEN** trae los 15 restantes y `truncado` es false

### Requirement: Número de comprobante
La búsqueda MUST aceptar el número como lo dice el usuario (`X1 9463`, `X-1-9463`, `X-0001-00009463` o solo `9463`) y MUST normalizarlo a `L-PPPP-NNNNNNNN`, rellenando con ceros. Si el número trae letra y punto de venta, MUST buscar el número completo; si trae solo el número, MUST buscarlo en cualquier letra y punto de venta. Como el mismo número puede existir en varios talonarios, MUST devolver todas las coincidencias. Si el número no se puede interpretar, MUST fallar con `PARAMETRO_INVALIDO`.

#### Scenario: Número abreviado
- **GIVEN** el movimiento 104923 con número `X-0001-00009463`
- **WHEN** el agente busca con `numero: "X1 9463"`
- **THEN** la lista contiene el movimiento 104923 y `criterio.numero` es `X-0001-00009463`

#### Scenario: Número repetido entre talonarios
- **GIVEN** `X-0001-00000001` en varios talonarios
- **WHEN** el agente busca con `numero: "X1 1"`
- **THEN** la lista trae un movimiento por talonario, cada uno con su talonario

#### Scenario: Solo el número
- **GIVEN** el movimiento 104923 con número `X-0001-00009463`
- **WHEN** el agente busca con `numero: "9463"`
- **THEN** la lista contiene el movimiento 104923

#### Scenario: Número ilegible
- **WHEN** el agente busca con `numero: "abc"`
- **THEN** la tool falla con `PARAMETRO_INVALIDO`

### Requirement: Rango de fechas por defecto
Las fechas se comparan por día, sin hora. Si no se recibe número ni fechas, la búsqueda MUST abarcar desde hoy menos un mes hasta hoy. Si se recibe solo `fechaHasta`, `fechaDesde` MUST ser un mes antes; si se recibe solo `fechaDesde`, `fechaHasta` MUST ser hoy. Si se recibe número y no se reciben fechas, la búsqueda MUST NOT aplicar rango de fechas. Si `fechaDesde` es posterior a `fechaHasta`, MUST fallar con `PARAMETRO_INVALIDO`.

#### Scenario: Sin criterios de fecha
- **GIVEN** hoy es 2026-10-26
- **WHEN** el agente busca sin número ni fechas
- **THEN** `criterio.fechaDesde` es `2026-09-26` y `criterio.fechaHasta` es `2026-10-26`

#### Scenario: Número de un movimiento viejo
- **GIVEN** hoy es 2026-10-26 y el movimiento `X-0001-00009463` es del 2026-09-02
- **WHEN** el agente busca con `numero: "X1 9463"` sin fechas
- **THEN** la lista contiene ese movimiento y `criterio.fechaDesde` y `criterio.fechaHasta` son null

#### Scenario: Día completo
- **GIVEN** un movimiento del 2026-10-13
- **WHEN** el agente busca con `fechaDesde` y `fechaHasta` iguales a `2026-10-13`
- **THEN** la lista contiene ese movimiento

### Requirement: Período relativo
La búsqueda MUST aceptar `periodo` con los valores `hoy`, `ayer`, `esta_semana` (de lunes a hoy), `este_mes` (del día 1 a hoy) y `mes_pasado` (el mes calendario anterior completo), y MUST resolverlo con la fecha del servidor, para que el agente no tenga que saber qué día es. `periodo` y las fechas explícitas son excluyentes: si llegan los dos, MUST fallar con `PARAMETRO_INVALIDO`.

#### Scenario: Ayer
- **GIVEN** hoy es 2026-10-26
- **WHEN** el agente busca con `periodo: "ayer"` y `clase: "pago"`
- **THEN** `criterio.fechaDesde` y `criterio.fechaHasta` son `2026-10-25`

#### Scenario: Este mes
- **GIVEN** hoy es 2026-10-26
- **WHEN** el agente busca con `periodo: "este_mes"` e `importe: 500000`
- **THEN** `criterio.fechaDesde` es `2026-10-01` y `criterio.fechaHasta` es `2026-10-26`

#### Scenario: Período y fechas juntos
- **WHEN** el agente busca con `periodo: "ayer"` y `fechaDesde: "2026-10-01"`
- **THEN** la tool falla con `PARAMETRO_INVALIDO`

### Requirement: Importe aproximado
Si se recibe `importe`, la búsqueda MUST traer los movimientos cuyo total esté entre el 95 % y el 105 % de ese importe, ordenados por cercanía al importe. Con `importeExacto: true` MUST traer solo los de total igual al importe. Sin importe, el orden MUST ser por fecha descendente y, a igual fecha, por id descendente.

#### Scenario: Importe aproximado
- **GIVEN** movimientos de 480.000, 500.000 y 530.000 en el rango
- **WHEN** el agente busca con `importe: 500000`
- **THEN** la lista trae 500.000 y luego 480.000, y no trae 530.000

#### Scenario: Importe exacto
- **GIVEN** movimientos de 480.000 y 500.000 en el rango
- **WHEN** el agente busca con `importe: 500000` e `importeExacto: true`
- **THEN** la lista trae solo el de 500.000

### Requirement: Clase del movimiento
La clase de cada movimiento MUST salir de la clase configurada en su tipo de comprobante y MUST informarse como uno de `pago`, `cobro`, `deposito`, `varios`, `reversion` u `otros`. El filtro `clase` MUST aceptar esos mismos valores.

#### Scenario: Pagos
- **GIVEN** un pago a proveedor y un pago varios de fondos del mismo día
- **WHEN** el agente busca con `clase: "pago"` en ese día
- **THEN** la lista trae los dos

#### Scenario: Clase inválida
- **WHEN** el agente busca con `clase: "transferencia"`
- **THEN** la tool falla con `PARAMETRO_INVALIDO`

### Requirement: Tercero
La búsqueda MUST aceptar un texto `tercero` y MUST traer solo los movimientos cuyo cliente o proveedor de cabecera contenga ese texto, sin distinguir mayúsculas.

#### Scenario: Por proveedor
- **GIVEN** movimientos de los proveedores TELECOM ARGENTINA S.A y EDENOR
- **WHEN** el agente busca con `tercero: "telecom"`
- **THEN** la lista trae solo los de TELECOM ARGENTINA S.A

### Requirement: Estado del movimiento
Cada movimiento MUST informar `estado`: `anulado` si está marcado como anulado, `revertido` si tiene una reversión registrada o `vigente` en otro caso. Los movimientos que son una reversión MUST tener clase `reversion`.

#### Scenario: Movimiento revertido
- **GIVEN** un pago cuya reversión es el movimiento 104976
- **WHEN** el agente lo busca o pide su detalle
- **THEN** su `estado` es `revertido`

### Requirement: Detalle de un movimiento
La tool `ver_movimiento_fondo` MUST recibir el id de un movimiento y devolver: cabecera (número, talonario, tipo, clase, fecha, concepto, total, estado, caja, usuario y fecha y hora de carga), tercero (rol `cliente` o `proveedor`, nombre y documento, o null), renglones del debe y del haber (cuenta, importe, leyenda, si es cuenta de fondos y, cuando los hay, tercero, centro de costo y sucursal del renglón), un resumen con las cuentas de fondos que entraron (debe) y salieron (haber) con su importe, los cheques del movimiento y los relacionados (reversión que lo revierte o movimiento que revierte, y asiento contable). MUST omitir los renglones de importe 0. MUST ser de solo lectura. Si el id no existe, MUST fallar con `MOVIMIENTO_NO_ENCONTRADO`.

#### Scenario: Pago en efectivo
- **GIVEN** el movimiento 105007, pago a proveedor de 199.230 con debe Proveedores y haber Caja
- **WHEN** el agente pide su detalle
- **THEN** `debe` tiene Proveedores por 199.230, `haber` tiene Caja por 199.230 con `esFondos: true`, `resumen.salioDe` es Caja por 199.230 y `resumen.entroA` está vacío

#### Scenario: Id inexistente
- **WHEN** el agente pide el detalle del id 999999999
- **THEN** la tool falla con `MOVIMIENTO_NO_ENCONTRADO`

#### Scenario: Reversión
- **GIVEN** el movimiento 104976, que revierte al 104870
- **WHEN** el agente pide el detalle del 104976
- **THEN** `clase` es `reversion` y `relacionados.revierteA` es 104870

### Requirement: Usuario habilitado
Ambas tools MUST ejecutarse con el usuario configurado en el servidor y MUST fallar con `NO_AUTORIZADO` si ese usuario no existe o está dado de baja.

#### Scenario: Usuario dado de baja
- **GIVEN** el servidor configurado con un usuario con fecha de baja anterior a hoy
- **WHEN** el agente llama a cualquiera de las dos tools
- **THEN** la tool falla con `NO_AUTORIZADO`
