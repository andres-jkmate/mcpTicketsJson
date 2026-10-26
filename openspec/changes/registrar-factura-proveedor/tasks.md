# Tasks

## 1. Escritura y errores del dominio en los paquetes

- [x] 1.1 Agregar `enTransaccionEscritura(trabajo, medidor?)` a `AccesoDatos` en `packages/firebird` (design D4): `readOnly: false`, `READ_COMMITTED`, `wait: true`, rollback y relanzar ante error, error del commit propagado. `enTransaccion` no cambia. Se verifica con tests unitarios nuevos del paquete (error en el segundo SP → rollback y error; commit que falla → error) y con `npm test -w packages/firebird` en verde.
- [x] 1.2 Sumar a `aplicarContrato` un parámetro opcional con los códigos del dominio que se traducen por prefijo `CODIGO:` (design D6); sin el parámetro, el comportamiento actual no cambia. Se verifica con tests del paquete (prefijo conocido → `ErrorTool` con ese código; prefijo desconocido → `PARAMETRO_INVALIDO`) y con `npm test` en la raíz en verde, incluido tickets.
- [x] 1.3 Actualizar el `AccesoDatos` simulado de `test/apoyo.ts` de `comprobantes-prov-mcp` (y el de la plantilla si comparte la interfaz) para soportar `enTransaccionEscritura` y registrar en qué transacción se llamó cada SP. Se verifica con `npm run typecheck` en la raíz en verde.

## 2. Lógica pura de resolución

- [x] 2.1 Implementar la normalización del número (design D7) en `src/dominio/numero.ts`: formatos aceptados, relleno con ceros, pendiente si la letra no es A/B/C o un tramo se pasa de largo. Se verifica con tests unitarios de `A1 135` → `A-0001-00000135` y de los casos inválidos.
- [x] 2.2 Implementar la regla del perfil (design D5) en `src/dominio/perfil.ts`: una opción → `unico`; `POR_DEFECTO = 1` → `por_defecto`; valor informado fuera de la lista → bloqueo; si no → pendiente con opciones. Incluir el filtro de tipos por letra antes de la regla (origen `letra`) y la dependencia del perfil. Se verifica con tests unitarios que cubren los escenarios "Varias opciones sin defecto", "Opción por defecto" y "Tipo desde la letra" del spec.
- [x] 2.3 Implementar la elección del artículo por nivel y la sugerencia de proveedor (design D10) en `src/dominio/articulo.ts`. Se verifica con tests unitarios de los escenarios "Artículo por plantilla", "Artículo ambiguo en el catálogo" y "Proveedor ambiguo con sugerencia".

## 3. Tool `preparar_factura_proveedor`

- [x] 3.1 Definir los códigos del dominio `COMPROBANTE_DUPLICADO` y `PERIODO_CERRADO` en `src/errores.ts` y el test de tipos asociado. Se verifica con `npm run typecheck -w apps/comprobantes-prov-mcp` en verde y con un `@ts-expect-error` para un código no declarado.
- [x] 3.2 Implementar la tool en `src/tools/preparar-factura-proveedor.ts` con el inputSchema, el outputSchema y la descripción de cuatro partes de design D12, usando `enTransaccion` (solo lectura) y los SP `PROC_LIST_PERFIL_OPC_AG`, `PROC_LIST_PROVEEDORES_FC_AG`, `PROC_LIST_ARTICULOS_FC_AG`, `PROC_GET_CALC_LINEA_FC_AG`, `PROC_LIST_VAL_FAC_PROV_AG` y `PROC_LIST_CUOTAS_FC_AG`. Debe armar `resueltos`, `pendientes`, `bloqueos`, `items`, `totalCalculado`, `vencimiento` y `paraRegistrar`, y aplicar las fechas por defecto. Se verifica con tests unitarios con `accesoSimulado` para los escenarios del spec "Pedido incompleto", "Ítem agregado en otro turno", "Dato resuelto", "Usuario sin perfil", "Número abreviado", "Línea gravada", "Sin fechas", "Condición de contado" y "Período cerrado", y con un test que comprueba que no se usa `enTransaccionEscritura`.

## 4. Tool `registrar_factura_proveedor`

- [x] 4.1 Implementar la tool en `src/tools/registrar-factura-proveedor.ts` con el inputSchema cerrado, el outputSchema y la descripción de design D12 (con el "Qué NO hacer" sobre la confirmación previa). Debe llamar, en una sola `enTransaccionEscritura`, a `PROC_INS_FAC_PROV_AG`, a `PROC_INS_DET_FAC_PROV_AG` por ítem y a `PROC_INS_FIN_FAC_PROV_AG`, y mapear la respuesta (cuotas desde las filas de este último). Se verifica con tests unitarios con `accesoSimulado`: orden y transacción de las llamadas; `RESULTADO = 0` en la segunda línea → error y sin llamada al cierre; prefijo `COMPROBANTE_DUPLICADO:` → ese código; valor fuera del perfil → `PARAMETRO_INVALIDO`.
- [x] 4.2 Registrar las dos tools en `src/tools/index.ts` y actualizar `test/contrato.test.ts`: `tools/list` con exactamente las dos, annotations según el spec, descripciones de cuatro partes, enum de códigos con los seis y `obtener_ejemplo` rechazada. Se verifica con `npm test -w apps/comprobantes-prov-mcp` en verde.

## 5. SP en la base (requiere confirmación explícita antes de ejecutar DDL)

- [x] 5.1 Escribir los diez scripts de design D13 en `apps/comprobantes-prov-mcp/db/procedimientos/` (`01-PRV_LIST_PERFIL_OPC_AG.sql` … `10-PROC_INS_FIN_FAC_PROV_AG.sql`), con encabezados de comentario según las convenciones Firebird, completando los públicos 03 y 07 y los controles de perfil que el design deja indicados. Resolver o anotar cada "A CONFIRMAR" leyendo los SP de JK3 involucrados (`PROC_INSERTAR_SEMI_CTE_PROV`, `PROC_SET_SEMI_PROV_UPD_JK3`, `PROC_INSERT_SEMI_DET_PROV_ALI`). Se verifica revisando que cada nombre tiene 31 caracteres o menos y que cada "A CONFIRMAR" del design quedó resuelto o anotado acá.
  - Nombres: el más largo es `PROC_LIST_PROVEEDORES_FC_AG` (27).
  - Se agregó `11-PROC_LIST_CUOTAS_FC_AG.sql` (envoltorio de `LIST_FINANCIAR_CREDITO_PROV`): el design pide `vencimiento` en `preparar` y ningún SP de D12 lo calculaba. Aprobado por el usuario (2026-10-25).
  - Los SP de JK3 no se pudieron leer: la copia local no está registrada en los MCP de base (`DESARROLLO` no responde y el alias `crear` apunta a `10.0.0.52`, que no es la copia local). Quedan anotados en el encabezado de cada script, sin resolver:
    - D4 `wait: true` y `READ_COMMITTED`: se ajustan al probar (tarea 6.1).
    - D7 `CODIGO_AFIP '006'` = B (01).
    - Usuario de caja contra usuario en el cruce de tipos (01).
    - Filtro del catálogo por `BIEN_COMPRAS` o subgrupo de compras (05).
    - Salidas de `PROC_SET_SEMI_PROV_UPD_JK3` y `PROC_INSERTAR_SEMI_CTE_PROV`, y orden de sus parámetros (08).
    - Tipos de `INTERES_MORA`/`TIEMPO_*`, `ES_NETO` de `PROC_INSERT_SEMI_DET_PROV_ALI` y salidas no controladas de cuotas, stock y limpieza (10).
    - Que `LIST_FINANCIAR_CREDITO_PROV` sea de solo lectura (11).
  - Los mensajes que concatenan un código entero usan `CAST(... AS VARCHAR(20))`; los resultados de los SP de JK3 se comparan con `IS DISTINCT FROM 1` para que un NULL también sea error.
- [x] 5.2 Con confirmación explícita del usuario, aplicar los scripts en `CREAR_JK3_20261016` (copia local) en orden, con charset UTF8. Se verifica con que los once SP existen en `RDB$PROCEDURES` y con `SELECT * FROM PROC_LIST_PERFIL_OPC_AG(28, 1)` devolviendo perfil, tipos 132/134, sucursal 3, centro de costo 2, condición 4 y monedas 3/5.
  - 2026-10-25, por `firebird-escritura` (127.0.0.1, `E:\Bases\CREAR_JK3_20261016.fdb`, conexión ISO8859_1): los 11 SP con `RDB$VALID_BLR = 1`; `PROC_LIST_PERFIL_OPC_AG(28, 1)` da lo esperado y un usuario sin perfil devuelve `NO_AUTORIZADO:`.
  - Antes de aplicar se verificaron contra la base las firmas y los cuerpos de los SP de JK3; los "A CONFIRMAR" de 08, 10 y 11 quedaron resueltos (ver encabezados). Siguen abiertos solo los de 01 (letra B, usuario de caja) y 05 (filtro del catálogo).
  - Corrección al aplicar: `PROVEEDORES.CODIGO` es INTEGER (`CODIGO = :P_TEXTO` daba error de conversión) y `CUIT` es VARCHAR(30); se ajustó 04.
- [x] 5.3 Actualizar `apps/comprobantes-prov-mcp/db/README.md`: tabla de los once SP con qué tool los usa, y el aviso de que `registrar` escribe en la base configurada. Se verifica con que la tabla coincide con los archivos de `db/procedimientos/`.

## 6. Integración y documentación de la app

- [x] 6.1 Tests de integración (se saltan sin base): `preparar` con "carga la factura A1 135 de Telecom de 200.000 por Internet" (proveedor pendiente con Telecom Argentina sugerida, número `A-0001-00000135`, tipo 132, moneda pendiente) y con "carga 100.000 de honorarios para SOFUN" (número y artículo pendientes); `registrar` de una factura de prueba con número único por corrida (comprobante, detalle, crédito, cuotas, sin filas en SEMI). Se verifica con los tests en verde contra la copia local, anotando acá el número de comprobante creado.
  - 2026-10-25: 4/4 en verde contra la copia local. Factura de prueba creada: comprobante **16330**, `A-9999-51383583`, Telecom Argentina, total 1210 (neto 1000 + IVA 210), crédito 3884, una cuota al 2026-11-04; detalle y alícuota grabados, cero filas en las SEMI, usuario de carga 28. `CODIGO_COMP` queda NULL, igual que en las facturas que carga JK3 en esta base.
- [ ] 6.2 Actualizar el README de la app: estado (dos tools, prototipo), flujo preparar → confirmar → registrar con un ejemplo de conversación, límites del prototipo (fuera de alcance del proposal y riesgos de design), aviso de escritura en la base y alta en Claude Desktop. Se verifica siguiendo la sección de verificación del README tal como está escrita.
  - README escrito. De la verificación pasaron typecheck, lint, test, build y la integración contra la copia local; falta el paso del Inspector (interfaz gráfica, lo corre el usuario).
- [ ] 6.3 Probar de punta a punta en Claude Desktop los dos pedidos de ejemplo (incluido "y agregá 50.000 de gastos varios") hasta grabar uno en la copia local, y verificar en JK3 que el comprobante se ve igual que uno cargado por el formulario. Anotar acá diferencias y fricciones del patrón para un change posterior.

## 7. Verificación de todo el repo

- [x] 7.1 Correr `npm run build`, `npm test`, `npm run lint` y `npm run typecheck` en la raíz. Se verifica con los cuatro en verde; anotar acá la cantidad de tests por paquete y app.
  - 2026-10-24, sin base: `packages/core` 31, `packages/firebird` 24, `apps/_template-mcp` 13, `apps/comprobantes-prov-mcp` 69 (+4 de integración saltados), `apps/tickets-mcp` 201 (+16 saltados). Hay que volver a correrlo cuando se resuelvan 5.2 y 6.1.
- [x] 7.2 Correr `openspec validate registrar-factura-proveedor --strict`. Se verifica con la validación sin errores.
