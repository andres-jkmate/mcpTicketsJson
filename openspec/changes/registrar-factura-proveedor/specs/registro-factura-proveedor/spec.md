# Spec Delta

## Purpose

Define cómo un agente prepara y registra una factura de proveedor en JKMate a partir de un pedido en lenguaje natural: arma un borrador, la base resuelve cada dato e informa su origen o las opciones cuando es ambiguo, calcula los importes y, al confirmar, graba la factura completa en una sola transacción. Es un prototipo acotado a facturas a cuenta corriente.

## ADDED Requirements

### Requirement: Preparación sin escritura
El servidor MUST publicar la tool `preparar_factura_proveedor`, que recibe un borrador de factura y devuelve cómo quedaría. MUST NOT escribir en la base ni dejar datos temporales (tampoco en tablas SEMI). MUST declarar `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true` y `openWorldHint: false`. Llamarla dos veces con el mismo borrador y el mismo estado de la base MUST devolver la misma respuesta.

#### Scenario: Preparar no deja rastros
- **GIVEN** la cantidad de filas de `COMPROBANTES_PROVEEDORES` y `SEMI_COMPROBANTES_PROVEEDORES`
- **WHEN** el agente llama a `preparar_factura_proveedor` con un borrador completo
- **THEN** las dos cantidades quedan iguales

#### Scenario: Annotations de preparar
- **WHEN** un cliente pide `tools/list`
- **THEN** `preparar_factura_proveedor` declara `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true` y `openWorldHint: false`

### Requirement: Borrador en lenguaje del usuario
El borrador de `preparar_factura_proveedor` MUST aceptar el proveedor como texto libre (razón social, nombre comercial, código o CUIT) o como código, el número como lo dijo el usuario (por ejemplo `A1 135`), fechas opcionales, valores opcionales para los datos del perfil y una lista de ítems con texto libre o código de artículo y monto. MUST aceptar un borrador incompleto: lo que falte se informa como pendiente, no como error. El borrador MUST vivir del lado del agente; el servidor MUST NOT guardar borradores entre llamadas.

#### Scenario: Pedido incompleto
- **GIVEN** el pedido "carga 100.000 de honorarios para SOFUN", sin número de factura
- **WHEN** el agente llama a `preparar_factura_proveedor` con proveedor `SOFUN` y un ítem `honorarios` de 100000
- **THEN** la respuesta no es un error, marca `listoParaRegistrar: false` e incluye el número entre los pendientes

#### Scenario: Ítem agregado en otro turno
- **GIVEN** un borrador ya preparado con un ítem de honorarios
- **WHEN** el usuario pide "agregá 50.000 de gastos varios" y el agente vuelve a llamar a `preparar_factura_proveedor` con los dos ítems
- **THEN** la respuesta muestra las dos líneas y el total calculado de ambas

### Requirement: Cada dato resuelto con su origen o con opciones
Para cada dato de la factura (proveedor, perfil, tipo de comprobante, número, sucursal, centro de costo, condición de compra, moneda, fechas y artículo de cada ítem) la respuesta de `preparar_factura_proveedor` MUST incluir el valor resuelto con su origen (por ejemplo `informado`, `unico`, `por_defecto`, `letra`, `plantilla_proveedor`, `historial_proveedor`, `catalogo`, `hoy`) o, si no pudo resolverlo, un pendiente con el campo, el texto del usuario y la lista de opciones válidas con código y descripción. Una opción MAY venir marcada como sugerida, con el motivo. La respuesta MUST indicar con un booleano si el borrador está listo para registrar, y eso MUST ser `true` solo si no quedan pendientes ni bloqueos.

#### Scenario: Proveedor ambiguo con sugerencia
- **GIVEN** dos proveedores cuya razón social contiene "TELECOM", y solo uno tiene un artículo de Internet en su plantilla
- **WHEN** el agente prepara "factura A1 135 de Telecom de 200.000 por Internet"
- **THEN** el proveedor queda pendiente con los dos como opciones, el que tiene Internet en su plantilla marcado como sugerido y con el motivo

#### Scenario: Dato resuelto
- **GIVEN** un perfil del usuario con una sola sucursal habilitada
- **WHEN** el agente prepara un borrador sin sucursal
- **THEN** la sucursal aparece resuelta con ese código y origen `unico`

### Requirement: Valores tomados del perfil de facturación de compras
Los perfiles posibles MUST ser los de facturación de compras asignados al usuario de la sesión. Para el perfil y, dentro de él, para el tipo de comprobante, la sucursal, el centro de costo, la condición de compra y la moneda, el servidor MUST aplicar en orden: si hay una sola opción, se usa; si una opción está marcada como por defecto, se usa; si no, queda pendiente con la lista de opciones del perfil. Un valor informado por el agente MUST estar en esa lista. Si el usuario no tiene ningún perfil, la tool MUST responder `NO_AUTORIZADO`.

#### Scenario: Varias opciones sin defecto
- **GIVEN** un perfil con dos monedas habilitadas y ninguna marcada por defecto
- **WHEN** el agente prepara un borrador sin moneda
- **THEN** la moneda queda pendiente con exactamente esas dos opciones

#### Scenario: Opción por defecto
- **GIVEN** un perfil con dos condiciones de compra, una marcada por defecto
- **WHEN** el agente prepara un borrador sin condición
- **THEN** la condición queda resuelta con la marcada y origen `por_defecto`

#### Scenario: Usuario sin perfil
- **GIVEN** un `MCP_COD_USUARIO` sin perfiles de facturación de compras asignados
- **WHEN** el agente llama a cualquiera de las dos tools
- **THEN** la respuesta es un error `NO_AUTORIZADO`

### Requirement: Número y tipo de comprobante
El servidor MUST normalizar el número informado como letra, punto de venta y número al formato `L-PPPP-NNNNNNNN`, completando con ceros (por ejemplo `A1 135` → `A-0001-00000135`). Si la letra no es A, B o C, o falta el número, el número MUST quedar pendiente. El tipo de comprobante MUST elegirse entre los tipos "Factura" del perfil, filtrando por la letra (según el código AFIP del tipo) antes de aplicar la regla del perfil.

#### Scenario: Número abreviado
- **WHEN** el agente prepara un borrador con número `A1 135`
- **THEN** el número resuelto es `A-0001-00000135`

#### Scenario: Tipo desde la letra
- **GIVEN** un perfil con un tipo "Factura" de letra A y otro de letra C, ninguno por defecto
- **WHEN** el agente prepara un borrador con número `A-0001-00000135`
- **THEN** el tipo queda resuelto con el de letra A y origen `letra`

### Requirement: Artículo de cada ítem
Para un ítem informado con texto, el servidor MUST buscar el artículo en este orden y quedarse con el primer nivel que dé resultados: artículos de la plantilla del proveedor, artículos usados antes con ese proveedor, catálogo de artículos. Si en ese nivel hay un solo artículo que coincide, se usa con ese origen; si hay varios, el artículo queda pendiente con ellos como opciones; si no hay ninguno, queda pendiente sin opciones.

#### Scenario: Artículo por plantilla
- **GIVEN** un proveedor cuya plantilla tiene un solo artículo que coincide con "Internet", y un catálogo con tres
- **WHEN** el agente prepara un ítem "Internet" para ese proveedor
- **THEN** el artículo queda resuelto con el de la plantilla y origen `plantilla_proveedor`

#### Scenario: Artículo ambiguo en el catálogo
- **GIVEN** un proveedor sin plantilla ni historial y tres artículos del catálogo que coinciden con "honorarios"
- **WHEN** el agente prepara un ítem "honorarios" para ese proveedor
- **THEN** el artículo queda pendiente con esos tres como opciones

### Requirement: Montos con impuestos calculados por la base
El monto de cada ítem MUST interpretarse como total de la línea con impuestos incluidos. Si el usuario da un único total para la factura, el agente lo carga como monto de su única línea. Para cada ítem con artículo resuelto, la respuesta MUST informar los importes que calcula la base para ese proveedor, artículo y fecha (neto, no gravado, exento, IVA, otros impuestos y percepciones), y el total calculado de la factura. El servidor MUST NOT exigir que los importes coincidan con los del papel.

#### Scenario: Línea gravada
- **GIVEN** un artículo gravado con IVA 21% y un proveedor sin percepciones
- **WHEN** el agente prepara un ítem de 121000
- **THEN** la línea informa neto 100000 e IVA 21000, y el total calculado es 121000

### Requirement: Fechas por defecto
Si el borrador no trae fecha del comprobante, MUST usarse la fecha del día. La fecha de recepción, la contable y la de IVA MUST tomar por defecto la fecha del comprobante. Una fecha de IVA anterior a la del comprobante MUST quedar como bloqueo. El vencimiento de la cuota MUST calcularse desde la fecha de recepción según la condición de compra.

#### Scenario: Sin fechas
- **WHEN** el agente prepara un borrador sin fechas el 2026-10-24
- **THEN** la fecha del comprobante y las demás fechas quedan resueltas en `2026-10-24`, con origen `hoy` la primera

### Requirement: Solo facturas a cuenta corriente
El prototipo MUST registrar solo comprobantes de tipo "Factura" con condición de compra de modalidad "Cuenta Corriente", generando el crédito y las cuotas según la condición. Una condición de otra modalidad MUST quedar como bloqueo en `preparar_factura_proveedor` y MUST rechazarse con `PARAMETRO_INVALIDO` en `registrar_factura_proveedor`. El registro MUST NOT generar retenciones, movimientos de fondos, asiento contable ni adjuntos. En una base que no sea de Argentina (sin el precompilador `PRJ_ARGENTINA`), las dos tools MUST tratar el borrador como bloqueado y `registrar_factura_proveedor` MUST rechazarlo con `PARAMETRO_INVALIDO`, porque allí el grabado de JK3 genera retenciones que este prototipo no cubre.

#### Scenario: Condición de contado
- **GIVEN** un perfil que habilita una condición de modalidad "Contado"
- **WHEN** el agente prepara un borrador con esa condición
- **THEN** la respuesta tiene un bloqueo por la condición y `listoParaRegistrar: false`

#### Scenario: Base de otro país
- **GIVEN** una base sin el precompilador `PRJ_ARGENTINA`
- **WHEN** el agente llama a `registrar_factura_proveedor` con un borrador completo
- **THEN** la respuesta es un error `PARAMETRO_INVALIDO` y no se graba nada

### Requirement: Validaciones de negocio
Tanto `preparar_factura_proveedor` (como bloqueo) como `registrar_factura_proveedor` (como error) MUST detectar: un comprobante ya cargado para el mismo proveedor, número y tipo (`COMPROBANTE_DUPLICADO`), y una fecha contable o de IVA en un período cerrado para la empresa del tipo de comprobante (`PERIODO_CERRADO`). La comparación de duplicados MUST hacerse con el número normalizado tal como se graba.

#### Scenario: Factura repetida
- **GIVEN** una factura ya registrada para el proveedor 4, tipo 132 y número `A-0001-00000135`
- **WHEN** el agente llama a `registrar_factura_proveedor` con esos mismos datos
- **THEN** la respuesta es un error `COMPROBANTE_DUPLICADO` y no se graba nada

#### Scenario: Período cerrado
- **GIVEN** un período de compras cerrado para la empresa del tipo de comprobante
- **WHEN** el agente prepara un borrador con fecha de IVA dentro de ese período
- **THEN** la respuesta tiene un bloqueo `PERIODO_CERRADO` y `listoParaRegistrar: false`

### Requirement: Registro con revalidación
El servidor MUST publicar la tool `registrar_factura_proveedor`, que recibe el borrador resuelto: solo códigos (proveedor, tipo, sucursal, centro de costo, condición, moneda, artículos), número normalizado, fechas y montos; MUST NOT aceptar texto libre para resolver. MUST volver a validar cada dato contra la base y contra el perfil del usuario antes de grabar; un valor fuera del perfil, un proveedor o artículo inexistente o un ítem sin monto positivo MUST rechazarse con `PARAMETRO_INVALIDO`. MUST declarar `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false` y `openWorldHint: false`. La descripción de la tool MUST indicar que se usa solo después de mostrarle al usuario el resultado de `preparar_factura_proveedor` y obtener su confirmación.

#### Scenario: Valor fuera del perfil
- **GIVEN** un perfil que solo habilita la sucursal 3
- **WHEN** el agente llama a `registrar_factura_proveedor` con sucursal 1
- **THEN** la respuesta es un error `PARAMETRO_INVALIDO` que nombra la sucursal, y no se graba nada

#### Scenario: Annotations de registrar
- **WHEN** un cliente pide `tools/list`
- **THEN** `registrar_factura_proveedor` declara `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false` y `openWorldHint: false`

### Requirement: Grabado atómico y equivalente a JK3
`registrar_factura_proveedor` MUST grabar la factura en una sola transacción: cabecera, líneas, alícuotas, crédito, cuotas y el pase de las tablas temporales a las reales, con el mismo resultado que produce el formulario de JK3 para los mismos datos. Si cualquier paso falla, MUST revertirse todo: ni el comprobante ni filas en las tablas SEMI deben quedar grabados. El usuario de carga del comprobante MUST ser el de la sesión (`MCP_COD_USUARIO`).

#### Scenario: Registro exitoso
- **GIVEN** un borrador listo para registrar
- **WHEN** el agente llama a `registrar_factura_proveedor`
- **THEN** existe un comprobante nuevo con su detalle, su crédito y sus cuotas, cargado por el usuario de la sesión, y no quedan filas de ese comprobante en las tablas SEMI

#### Scenario: Falla a mitad del grabado
- **GIVEN** un paso del grabado que falla después de haber creado la cabecera temporal
- **WHEN** el agente llama a `registrar_factura_proveedor`
- **THEN** la respuesta es un error, no existe el comprobante y no quedan filas en las tablas SEMI

### Requirement: Respuesta del registro
Una respuesta exitosa de `registrar_factura_proveedor` MUST incluir el código interno del comprobante, su número, el número interno de compras si la base lo asigna, el proveedor `{ id, nombre }`, el total grabado y las cuotas con su vencimiento (`AAAA-MM-DD`) y monto.

#### Scenario: Datos devueltos
- **WHEN** `registrar_factura_proveedor` graba una factura a cuenta corriente con una cuota
- **THEN** la respuesta incluye el código del comprobante, el número `A-0001-00000135`, el total y una cuota con su vencimiento
