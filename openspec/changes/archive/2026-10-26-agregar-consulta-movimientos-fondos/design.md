# Design

## Context

Motivación en `proposal.md`; requisitos en `specs/consulta-movimientos-fondos/spec.md` y el delta de `fondos-mcp`. Estado que condiciona el diseño (2026-10-26, base `CREAR_JK3_20261016` por `firebird-escritura`):

- **App**: `apps/fondos-mcp` existe sin tools (change `crear-fondos-mcp`, completo y sin archivar), con los cuatro códigos base, `test/apoyo.ts` y `db/procedimientos/` vacío. `aplicarContrato(nombreSp, filas, codigosDominio)` ya traduce el prefijo `CODIGO:` de `MENSAJE_ERROR` a códigos del dominio.
- **Cómo consulta hoy JK3** (formulario `ver_movimientos_fondos`, webservices en `METODOS_WEBSERVICES`): recibe el `COD_MOVIMIENTO_FONDO` y llama por separado a `getMovimientoFondosXCodigo` (`PROC_GET_MOV_FONDOS_X_CODIGO`), `Proc_get_mov_fondo_debe` (`PROC_GET_M_FONDO_C_DEBE`), `PROC_GET_M_FONDO_C_HABER`, `get_cheques_x_mov_fon` (`PROC_GET_CHEQUES_X_MOV_FON`), `get_cupones_x_mov` (`PROC_GET_CUPONES_X_MOV`, **no existe en la base**), `PROC_GET_CUENTA_FONDO_X_CODIGO` y `PROC_GET_MOVIMIENTOS_ESCANEOS`. No hay ningún SP para *buscar* movimientos.
- **Datos** (`MOVIMIENTOS_FONDOS`, 63.032 filas, 2.086 de 2026):
  - `NRO_COMPROBANTE` es `CHAR(15)` y siempre `L-PPPP-NNNNNNNN`; letras usadas: X, G, B, E, R, A, C. **No es único**: `X-0001-00000001` está en 13 talonarios.
  - Índices: `IDX_MOVIMIENTOS_FONDOS_FECHA (FECHA)`, `FK_MOVIMIENTOS_FONDOS02 (COD_TALONARIO, NRO_COMPROBANTE)`, `FK_MOVIMIENTOS_FONDOS05 (COD_MOVIMIENTO_REVERTIDO)`; ninguno por `TOTAL`. Buscar solo por número recorre la tabla (~85 ms); fecha + importe tarda ~4 ms.
  - `FECHA` es `TIMESTAMP` con hora 00:00 local; `TOTAL` es `NUMERIC(18,3)`.
  - Clase: `TIPOS_COMPROBANTES.TIPO_COMPROBANTE`, con los valores `Pago`, `Cobro`, `Movimientos varios`, `Depósito`, `Reversión de fondos` y `Otros` en fondos. "Pago" incluye `MOD_COMPRA` (pago a proveedor) y `MOD_FONDOS`.
  - Reversión: el **movimiento original** guarda en `COD_MOVIMIENTO_REVERTIDO` el id de su reversión (1.333 casos, siempre apuntando a un movimiento posterior de clase "Reversión de fondos"; ninguna reversión tiene el campo cargado). `ANULADO` vale 0 en todas las filas.
  - Renglones (`DET_MOVIMIENTOS_FONDOS`): `PROC_GET_M_FONDO_C_DEBE` filtra `HABER = 0` y `_HABER` filtra `DEBE = 0`, así que los 43 renglones con ambos en 0 salen en los dos lados. `SOLO_LECTURA` es `CUENTAS_FONDOS.ES_FONDOS` (Caja, bancos). `COTIZACION` es `INTEGER` y trunca. El tercero de los renglones suele venir vacío; el del movimiento está en la cabecera.
  - `USUARIOS.FECHA_BAJA` marca a los usuarios dados de baja.

## Goals / Non-Goals

**Goals:**
- Resolver los tres prompts de ejemplo con una llamada a `buscar_movimientos_fondos` y, si hace falta, una a `ver_movimiento_fondo`.
- JSON compacto: sin códigos internos que el operador no usa, sin claves vacías en los renglones, con un `resumen` que contesta "¿de dónde salió / adónde entró la plata?" sin pedirle al modelo que razone partida doble.

**Non-Goals:**
- Reemplazar el formulario: ni escaneos, ni cupones, ni el asiento contable detallado, ni la cuenta contable de cada cuenta de fondos.
- Permisos finos por talonario, caja o módulo (ver Open Questions).
- Crear índices o tocar tablas.

## Decisions

### D1. Dos tools: buscar y ver
`buscar_movimientos_fondos` siempre devuelve lista; `ver_movimiento_fondo` recibe solo el id. Como el número se repite entre talonarios, una tool "ver por número" tendría que devolver a veces uno y a veces una lista, y el modelo no sabría qué esperar. Con dos formas fijas, "quiero ver el movimiento X1 9463" se resuelve en dos llamadas cuando la búsqueda trae uno solo, y en una lista para elegir cuando trae varios. **Alternativa descartada:** una sola tool con `detalle: true` cuando hay un único resultado: mezcla dos outputSchemas y obliga a describir los dos en una sola descripción.

### D2. Normalización del número en TypeScript
`src/dominio/numero.ts` interpreta el texto y arma un patrón `LIKE` de 15 caracteres:

| Entrada | Patrón | `criterio.numero` |
|---|---|---|
| `X1 9463`, `X-1-9463`, `X 0001 00009463`, `X-0001-00009463` | `X-0001-00009463` | `X-0001-00009463` |
| `X 9463` (letra y número) | `X-____-00009463` | `X-????-00009463` |
| `9463` | `_-____-00009463` | `?-????-00009463` |

Letra: cualquier A–Z. Punto de venta: hasta 4 dígitos. Número: hasta 8 dígitos y distinto de 0. Cualquier otra entrada → `PARAMETRO_INVALIDO` con el motivo. **Alternativa:** reusar `normalizarNumero` de `comprobantes-prov-mcp`. Se descarta porque allí solo valen A/B/C y siempre exige letra y punto de venta; moverla a `packages/` con opciones complicaría la de facturas para un caso que no comparten.

### D3. Rango de fechas y períodos en TypeScript
`src/dominio/criterio.ts` es una función pura `resolverFechas({ periodo, fechaDesde, fechaHasta, hayNumero }, hoy)` con `hoy` inyectado (en producción, la fecha local del proceso, que corre en la misma máquina que Claude Desktop). Aplica las reglas del spec (períodos, mes por defecto, sin rango si hay número, `desde > hasta` → error) y devuelve las fechas que van al SP y a `criterio`. El SP recibe siempre fechas explícitas. **Alternativa:** calcular los defaults en el SP con `CURRENT_DATE`. Se descarta porque, si no hay filas, la respuesta no tendría de dónde sacar las fechas aplicadas para mostrarlas en `criterio`, y porque así las reglas se prueban con tests unitarios sin base.

### D4. Importe
TS calcula `importeMin = importe × 0,95` e `importeMax = importe × 1,05` (o ambos iguales al importe con `importeExacto`) y los pasa al SP junto con `importe` para ordenar por `ABS(TOTAL - importe)`. El 5 % queda como constante en `criterio.ts`.

### D5. Clase sin acentos y estado, calculados en el SP
La clase se mapea en el SP con prefijos ASCII para no depender del charset de la conexión al comparar `Depósito` y `Reversión de fondos`:

| `TIPO_COMPROBANTE` | `clase` |
|---|---|
| `Pago` | `pago` |
| `Cobro` | `cobro` |
| empieza con `Dep` | `deposito` |
| `Movimientos varios` | `varios` |
| empieza con `Rev` | `reversion` |
| otro | `otros` |

Estado: `anulado` si `ANULADO = 1`; si no, `revertido` si `COD_MOVIMIENTO_REVERTIDO IS NOT NULL`; si no, `vigente`. El mismo `CASE` se repite en los SP 01 y 02. **Alternativa:** una función PSQL compartida. Se descarta para no introducir `CREATE FUNCTION` en el repo por dos expresiones cortas.

### D6. Fechas sin `OR :p IS NULL`
En Firebird 3, `(:P_DESDE IS NULL OR M.FECHA >= :P_DESDE)` impide usar el índice. El SP 01 siempre filtra `M.FECHA >= :V_DESDE AND M.FECHA < :V_HASTA_SIG`. Cuando la búsqueda va sin rango (hay número), usa `1800-01-01` y `3000-01-01` (hay movimientos con fecha `1899-12-30`). Así las búsquedas por fecha usan `IDX_MOVIMIENTOS_FONDOS_FECHA` y la búsqueda por número recorre por índice, cuyo costo se mide en la tarea 4.3.

### D7. Detalle: un SP de cabecera que reusa el de JK3 y dos envoltorios
`PROC_GET_MOV_FONDO_AG` hace `FOR SELECT` sobre `PROC_GET_MOV_FONDOS_X_CODIGO`, que ya resuelve talonario, tipo, tercero, CUIT, caja y usuarios, y agrega clase, estado, rol del tercero y `REVIERTE_A` (búsqueda inversa por `FK_MOVIMIENTOS_FONDOS05`). `PROC_LIST_DET_MOV_FONDO_AG` une `PROC_GET_M_FONDO_C_DEBE` y `_HABER` en un cursor con `LADO` `D`/`H`, descarta los renglones de importe 0 y elige un tercero por renglón (proveedor, cliente o empleado). `PROC_LIST_CHEQUES_MOV_FON_AG` envuelve `PROC_GET_CHEQUES_X_MOV_FON` para agregar el contrato `RESULTADO`. La tool los llama en una sola transacción de solo lectura, en ese orden, y no llama a los otros dos si el primero falla. **Alternativa:** un único SP con un discriminador por fila (como `PRV_LIST_PERFIL_OPC_AG`). Se descarta porque la cabecera, los renglones y los cheques tienen columnas casi disjuntas.

### D8. Tools, SP que las alimentan y esquemas

**`buscar_movimientos_fondos`**:

- SP: `PROC_LIST_MOV_FONDOS_AG`, en una transacción de solo lectura.
- Annotations: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`.
- inputSchema (cerrado; todo opcional):
  ```jsonc
  {
    "numero": "string (1..30), como lo dice el usuario, ej. 'X1 9463'",
    "periodo": "hoy|ayer|esta_semana|este_mes|mes_pasado",
    "fechaDesde": "AAAA-MM-DD", "fechaHasta": "AAAA-MM-DD",
    "importe": "number > 0", "importeExacto": "boolean (default false)",
    "clase": "pago|cobro|deposito|varios|reversion|otros",
    "tercero": "string (2..100)",
    "limite": "integer 1..50 (default 20)", "desde": "integer >= 0 (default 0)"
  }
  ```
- outputSchema:
  ```jsonc
  {
    "criterio": { "numero": "string|null", "fechaDesde": "AAAA-MM-DD|null", "fechaHasta": "AAAA-MM-DD|null",
                  "importeMin": "number|null", "importeMax": "number|null", "clase": "string|null", "tercero": "string|null" },
    "encontrados": "integer", "desde": "integer", "truncado": "boolean",
    "movimientos": [ { "id": "integer", "numero": "string", "talonario": "string|null", "tipo": "string",
                       "clase": "pago|cobro|deposito|varios|reversion|otros", "fecha": "AAAA-MM-DD",
                       "total": "number", "tercero": "string|null", "concepto": "string|null",
                       "estado": "vigente|revertido|anulado" } ]
  }
  ```
- Ejemplo ("¿qué pagos hice ayer?", con hoy = 2026-10-14):
  ```json
  {
    "criterio": { "numero": null, "fechaDesde": "2026-10-13", "fechaHasta": "2026-10-13",
                  "importeMin": null, "importeMax": null, "clase": "pago", "tercero": null },
    "encontrados": 4, "desde": 0, "truncado": false,
    "movimientos": [
      { "id": 105013, "numero": "X-0001-00008559", "talonario": "Orden de pago JK", "tipo": "Pago a prove JKMT",
        "clase": "pago", "fecha": "2026-10-13", "total": 87260.45, "tercero": "TELECOM ARGENTINA S.A",
        "concepto": "Pago a prove JKMT", "estado": "vigente" },
      { "id": 105011, "numero": "X-0001-00008558", "talonario": "Orden de pago JK", "tipo": "Pago a prove JKMT",
        "clase": "pago", "fecha": "2026-10-13", "total": 22064.19, "tercero": "...",
        "concepto": "Pago a prove JKMT", "estado": "vigente" }
    ]
  }
  ```
  (Los nombres de proveedor del ejemplo son ilustrativos.)
- Descripción, "Qué NO hacer": no mandar fechas inventadas si el usuario no nombró un período (el servidor aplica el último mes); para "ayer", "este mes", etc. usar `periodo` en lugar de calcular fechas; no usarla para ver renglones o cheques (eso es `ver_movimiento_fondo`); si vienen varios movimientos con el mismo número, mostrar la lista y preguntar cuál, sin elegir.

**`ver_movimiento_fondo`**:

- SP: `PROC_GET_MOV_FONDO_AG`, `PROC_LIST_DET_MOV_FONDO_AG` y `PROC_LIST_CHEQUES_MOV_FON_AG`, en una transacción de solo lectura (D7).
- Annotations: iguales a las de `buscar_movimientos_fondos`.
- inputSchema (cerrado): `{ "id": "integer > 0" }`.
- outputSchema:
  ```jsonc
  {
    "id": "integer", "numero": "string", "talonario": "string|null", "tipo": "string",
    "clase": "pago|cobro|deposito|varios|reversion|otros", "fecha": "AAAA-MM-DD",
    "concepto": "string|null", "total": "number", "estado": "vigente|revertido|anulado",
    "caja": "integer|null", "usuario": "string", "cargadoPor": "string|null", "cargadoEl": "ISO 8601 con offset|null",
    "tercero": { "rol": "cliente|proveedor", "nombre": "string", "documento": "string|null" } | null,
    "resumen": { "entroA": [ { "cuenta": "string", "importe": "number" } ],
                 "salioDe": [ { "cuenta": "string", "importe": "number" } ] },
    "debe":  [ { "cuenta": "string", "importe": "number", "leyenda": "string|null", "esFondos": "boolean",
                 "unidades?": "number", "tercero?": "string", "documento?": "string",
                 "centroCosto?": "string", "sucursal?": "string" } ],
    "haber": [ "igual que debe" ],
    "cheques": [ { "banco": "string", "sucursal": "string|null", "numero": "string", "tipo": "string|null",
                   "estado": "string|null", "importe": "number", "emision": "AAAA-MM-DD|null",
                   "vencimiento": "AAAA-MM-DD|null", "cobro": "AAAA-MM-DD|null" } ],
    "relacionados": { "revertidoPor": "integer|null", "revierteA": "integer|null", "asientoContable": "integer|null" }
  }
  ```
  Las claves con `?` de los renglones se omiten cuando no hay dato. `unidades` aparece solo si es distinta del importe (moneda extranjera). `resumen` agrupa por cuenta los renglones con `esFondos`: los del debe van a `entroA` y los del haber a `salioDe`.
- Ejemplo (105007, verificado en CREAR salvo el tercero, la caja y el usuario, que son ilustrativos):
  ```json
  {
    "id": 105007, "numero": "X-0001-00008556", "talonario": "Orden de pago JK", "tipo": "Pago a prove JKMT",
    "clase": "pago", "fecha": "2026-10-13", "concepto": "Pago a prove JKMT", "total": 199230,
    "estado": "vigente", "caja": 1, "usuario": "ADMIN", "cargadoPor": "ADMIN", "cargadoEl": "2026-10-13T10:22:05-03:00",
    "tercero": { "rol": "proveedor", "nombre": "TELECOM ARGENTINA S.A", "documento": "30-63945373-8" },
    "resumen": { "entroA": [], "salioDe": [ { "cuenta": "Caja", "importe": 199230 } ] },
    "debe":  [ { "cuenta": "Proveedores", "importe": 199230, "leyenda": "Pago a prove JKMT00008556", "esFondos": false } ],
    "haber": [ { "cuenta": "Caja", "importe": 199230, "leyenda": "Pago a prove JKMT00008556", "esFondos": true } ],
    "cheques": [],
    "relacionados": { "revertidoPor": null, "revierteA": null, "asientoContable": null }
  }
  ```
- Descripción, "Qué NO hacer": no adivinar el id a partir del número (primero `buscar_movimientos_fondos`); no usarla para recorrer varios movimientos uno por uno si alcanza con la lista.

Las dos descripciones siguen la plantilla de cuatro partes y su "Cuándo usarla" cita los prompts de ejemplo del proposal.

### D9. Errores del dominio
Solo `MOVIMIENTO_NO_ENCONTRADO`, lanzado por `PROC_GET_MOV_FONDO_AG` con el prefijo `MOVIMIENTO_NO_ENCONTRADO:`. `NO_AUTORIZADO:` lo traduce `aplicarContrato` sin configuración. Que una búsqueda no encuentre nada no es un error (spec "Sin resultados").

### D10. SP nuevos (propuestos; se crean solo con confirmación)

Los cuatro son públicos, siguen el contrato `RESULTADO`/`MENSAJE_ERROR` y son de solo lectura. El orden de los archivos en `db/procedimientos/` es el de esta tabla. Nombres contados contra el límite de 31 caracteres (el más largo, `PROC_LIST_CHEQUES_MOV_FON_AG`, tiene 28). Columnas verificadas contra CREAR salvo lo marcado como **A CONFIRMAR**.

| Orden | SP | Qué hace |
|---|---|---|
| 01 | `PROC_LIST_MOV_FONDOS_AG` | Búsqueda con conteo, orden y paginado |
| 02 | `PROC_GET_MOV_FONDO_AG` | Cabecera del detalle (envuelve `PROC_GET_MOV_FONDOS_X_CODIGO`) |
| 03 | `PROC_LIST_DET_MOV_FONDO_AG` | Debe y haber en un cursor (envuelve `PROC_GET_M_FONDO_C_DEBE`/`_HABER`) |
| 04 | `PROC_LIST_CHEQUES_MOV_FON_AG` | Cheques (envuelve `PROC_GET_CHEQUES_X_MOV_FON`) |

Scripts propuestos (cuerpo principal; los encabezados de comentario se completan al aplicar):

```sql
-- 01
CREATE OR ALTER PROCEDURE PROC_LIST_MOV_FONDOS_AG (
  P_COD_USUARIO INTEGER, P_NRO_PATRON VARCHAR(15),
  P_FECHA_DESDE DATE, P_FECHA_HASTA DATE,
  P_IMPORTE NUMERIC(18,3), P_IMPORTE_MIN NUMERIC(18,3), P_IMPORTE_MAX NUMERIC(18,3),
  P_CLASE VARCHAR(10), P_TERCERO VARCHAR(100), P_LIMITE INTEGER, P_DESDE INTEGER)
RETURNS (RESULTADO SMALLINT, MENSAJE_ERROR VARCHAR(500), ENCONTRADOS INTEGER,
         COD_MOVIMIENTO_FONDO INTEGER, NRO_COMPROBANTE VARCHAR(15), TALONARIO VARCHAR(50),
         TIPO VARCHAR(50), CLASE VARCHAR(10), FECHA DATE, TOTAL NUMERIC(18,3),
         TERCERO VARCHAR(100), CONCEPTO VARCHAR(50), ESTADO VARCHAR(10))
AS
DECLARE VARIABLE V_DESDE DATE;
DECLARE VARIABLE V_HASTA_SIG DATE;
BEGIN
  IF (NOT EXISTS (SELECT 1 FROM USUARIOS U WHERE U.COD_USUARIO = :P_COD_USUARIO
      AND (U.FECHA_BAJA IS NULL OR U.FECHA_BAJA > CURRENT_DATE))) THEN
  BEGIN
    RESULTADO = 0; MENSAJE_ERROR = 'NO_AUTORIZADO: el usuario configurado no existe o está dado de baja';
    SUSPEND; EXIT;
  END

  -- D6: siempre un rango, para que el optimizador use IDX_MOVIMIENTOS_FONDOS_FECHA
  V_DESDE = COALESCE(:P_FECHA_DESDE, DATE '1800-01-01');
  V_HASTA_SIG = DATEADD(1 DAY TO COALESCE(:P_FECHA_HASTA, DATE '2999-12-31'));

  SELECT COUNT(*)
  FROM MOVIMIENTOS_FONDOS M
  JOIN TIPOS_COMPROBANTES TC ON TC.COD_TIPO_COMPROBANTE = M.COD_TIPO_COMPROBANTE
  LEFT JOIN CLIENTES CL ON CL.COD_CLIENTE = M.COD_CLIENTE
  LEFT JOIN PROVEEDORES P ON P.COD_PROVEEDOR = M.COD_PROVEEDOR
  WHERE M.FECHA >= :V_DESDE AND M.FECHA < :V_HASTA_SIG
    AND (:P_NRO_PATRON IS NULL OR M.NRO_COMPROBANTE LIKE :P_NRO_PATRON)
    AND (:P_IMPORTE_MIN IS NULL OR M.TOTAL BETWEEN :P_IMPORTE_MIN AND :P_IMPORTE_MAX)
    AND (:P_TERCERO IS NULL OR COALESCE(CL.NOMBRE, P.RAZON_SOCIAL) CONTAINING :P_TERCERO)
    AND (:P_CLASE IS NULL
         OR (:P_CLASE = 'pago' AND TC.TIPO_COMPROBANTE = 'Pago')
         OR (:P_CLASE = 'cobro' AND TC.TIPO_COMPROBANTE = 'Cobro')
         OR (:P_CLASE = 'deposito' AND TC.TIPO_COMPROBANTE STARTING WITH 'Dep')
         OR (:P_CLASE = 'varios' AND TC.TIPO_COMPROBANTE = 'Movimientos varios')
         OR (:P_CLASE = 'reversion' AND TC.TIPO_COMPROBANTE STARTING WITH 'Rev')
         OR (:P_CLASE = 'otros' AND TC.TIPO_COMPROBANTE NOT IN ('Pago', 'Cobro', 'Movimientos varios')
             AND TC.TIPO_COMPROBANTE NOT STARTING WITH 'Dep' AND TC.TIPO_COMPROBANTE NOT STARTING WITH 'Rev'))
  INTO :ENCONTRADOS;

  RESULTADO = 1; MENSAJE_ERROR = '';
  IF (:ENCONTRADOS = 0) THEN EXIT;

  FOR SELECT M.COD_MOVIMIENTO_FONDO, TRIM(M.NRO_COMPROBANTE), T.DESCRIPCION, TC.DESCRIPCION,
             CASE WHEN TC.TIPO_COMPROBANTE = 'Pago' THEN 'pago'
                  WHEN TC.TIPO_COMPROBANTE = 'Cobro' THEN 'cobro'
                  WHEN TC.TIPO_COMPROBANTE STARTING WITH 'Dep' THEN 'deposito'
                  WHEN TC.TIPO_COMPROBANTE = 'Movimientos varios' THEN 'varios'
                  WHEN TC.TIPO_COMPROBANTE STARTING WITH 'Rev' THEN 'reversion'
                  ELSE 'otros' END,
             CAST(M.FECHA AS DATE), M.TOTAL, COALESCE(CL.NOMBRE, P.RAZON_SOCIAL), M.CONCEPTO,
             CASE WHEN M.ANULADO = 1 THEN 'anulado'
                  WHEN M.COD_MOVIMIENTO_REVERTIDO IS NOT NULL THEN 'revertido'
                  ELSE 'vigente' END
      FROM MOVIMIENTOS_FONDOS M
      JOIN TIPOS_COMPROBANTES TC ON TC.COD_TIPO_COMPROBANTE = M.COD_TIPO_COMPROBANTE
      LEFT JOIN TALONARIOS T ON T.COD_TALONARIO = M.COD_TALONARIO
      LEFT JOIN CLIENTES CL ON CL.COD_CLIENTE = M.COD_CLIENTE
      LEFT JOIN PROVEEDORES P ON P.COD_PROVEEDOR = M.COD_PROVEEDOR
      WHERE /* mismo WHERE que el conteo */ M.FECHA >= :V_DESDE AND M.FECHA < :V_HASTA_SIG
        AND (:P_NRO_PATRON IS NULL OR M.NRO_COMPROBANTE LIKE :P_NRO_PATRON)
        AND (:P_IMPORTE_MIN IS NULL OR M.TOTAL BETWEEN :P_IMPORTE_MIN AND :P_IMPORTE_MAX)
        AND (:P_TERCERO IS NULL OR COALESCE(CL.NOMBRE, P.RAZON_SOCIAL) CONTAINING :P_TERCERO)
        AND (:P_CLASE IS NULL /* ... mismas ramas que el conteo ... */)
      ORDER BY CASE WHEN :P_IMPORTE IS NULL THEN 0 ELSE ABS(M.TOTAL - :P_IMPORTE) END,
               M.FECHA DESC, M.COD_MOVIMIENTO_FONDO DESC
      OFFSET :P_DESDE ROWS FETCH NEXT :P_LIMITE ROWS ONLY
      INTO :COD_MOVIMIENTO_FONDO, :NRO_COMPROBANTE, :TALONARIO, :TIPO, :CLASE,
           :FECHA, :TOTAL, :TERCERO, :CONCEPTO, :ESTADO
  DO SUSPEND;
END

-- 02
CREATE OR ALTER PROCEDURE PROC_GET_MOV_FONDO_AG (P_COD_USUARIO INTEGER, P_COD_MOVIMIENTO_FONDO INTEGER)
RETURNS (RESULTADO SMALLINT, MENSAJE_ERROR VARCHAR(500),
         COD_MOVIMIENTO_FONDO INTEGER, NRO_COMPROBANTE VARCHAR(15), TALONARIO VARCHAR(50),
         TIPO VARCHAR(100), CLASE VARCHAR(10), FECHA DATE, CONCEPTO VARCHAR(50), TOTAL NUMERIC(18,3),
         ESTADO VARCHAR(10), NUM_CAJA INTEGER, USUARIO VARCHAR(50), CARGADO_POR VARCHAR(50),
         FECHA_HORA_CARGA TIMESTAMP, TERCERO_ROL VARCHAR(10), TERCERO VARCHAR(100),
         TERCERO_DOCUMENTO VARCHAR(30), REVERTIDO_POR INTEGER, REVIERTE_A INTEGER,
         COD_ASIENTO_CONTABLE INTEGER)
AS
DECLARE VARIABLE V_COD_TIPO INTEGER;
DECLARE VARIABLE V_ANULADO SMALLINT;
DECLARE VARIABLE V_COD_CLIENTE INTEGER;
DECLARE VARIABLE V_COD_PROVEEDOR INTEGER;
DECLARE VARIABLE V_TIPO_COMPROBANTE VARCHAR(25);
BEGIN
  IF (NOT EXISTS (SELECT 1 FROM USUARIOS U WHERE U.COD_USUARIO = :P_COD_USUARIO
      AND (U.FECHA_BAJA IS NULL OR U.FECHA_BAJA > CURRENT_DATE))) THEN
  BEGIN
    RESULTADO = 0; MENSAJE_ERROR = 'NO_AUTORIZADO: el usuario configurado no existe o está dado de baja';
    SUSPEND; EXIT;
  END

  -- Reusa el SP del formulario: talonario, tipo, tercero, CUIT, caja y usuarios ya resueltos
  SELECT FIRST 1 X.COD_MOVIMIENTO_FONDO, TRIM(X.NRO_COMPROBANTE), X.DESCRIPCION, X.TIPO_COMP_DESCRIPCION,
         CAST(X.FECHA AS DATE), X.CONCEPTO, X.TOTAL, X.ANULADO, X.NUM_CAJA, X.NOM_USUARIO, X.USUARIO_CREO,
         X.FECHA_HORA_CARGA, X.CLIENTE_PROVEEDOR, X.CLIENTE_PROVEEDOR_CUIT, X.COD_MOVIMIENTO_REVERTIDO,
         X.COD_ASIENTO_CONTABLE, X.COD_TIPO_COMPROBANTE, X.COD_CLIENTE, X.COD_PROVEEDOR
  FROM PROC_GET_MOV_FONDOS_X_CODIGO(:P_COD_MOVIMIENTO_FONDO) X
  INTO :COD_MOVIMIENTO_FONDO, :NRO_COMPROBANTE, :TALONARIO, :TIPO, :FECHA, :CONCEPTO, :TOTAL,
       :V_ANULADO, :NUM_CAJA, :USUARIO, :CARGADO_POR, :FECHA_HORA_CARGA, :TERCERO, :TERCERO_DOCUMENTO,
       :REVERTIDO_POR, :COD_ASIENTO_CONTABLE, :V_COD_TIPO, :V_COD_CLIENTE, :V_COD_PROVEEDOR;

  IF (:COD_MOVIMIENTO_FONDO IS NULL) THEN
  BEGIN
    RESULTADO = 0;
    MENSAJE_ERROR = 'MOVIMIENTO_NO_ENCONTRADO: no existe el movimiento de fondos ' || CAST(:P_COD_MOVIMIENTO_FONDO AS VARCHAR(20));
    SUSPEND; EXIT;
  END

  SELECT TC.TIPO_COMPROBANTE FROM TIPOS_COMPROBANTES TC WHERE TC.COD_TIPO_COMPROBANTE = :V_COD_TIPO
  INTO :V_TIPO_COMPROBANTE;
  CLASE = CASE WHEN :V_TIPO_COMPROBANTE = 'Pago' THEN 'pago'
               WHEN :V_TIPO_COMPROBANTE = 'Cobro' THEN 'cobro'
               WHEN :V_TIPO_COMPROBANTE STARTING WITH 'Dep' THEN 'deposito'
               WHEN :V_TIPO_COMPROBANTE = 'Movimientos varios' THEN 'varios'
               WHEN :V_TIPO_COMPROBANTE STARTING WITH 'Rev' THEN 'reversion'
               ELSE 'otros' END;
  ESTADO = CASE WHEN :V_ANULADO = 1 THEN 'anulado'
                WHEN :REVERTIDO_POR IS NOT NULL THEN 'revertido'
                ELSE 'vigente' END;
  TERCERO_ROL = CASE WHEN :V_COD_CLIENTE IS NOT NULL THEN 'cliente'
                     WHEN :V_COD_PROVEEDOR IS NOT NULL THEN 'proveedor' END;

  -- El original apunta a su reversión; para una reversión se busca al revés (FK_MOVIMIENTOS_FONDOS05)
  SELECT FIRST 1 M.COD_MOVIMIENTO_FONDO FROM MOVIMIENTOS_FONDOS M
  WHERE M.COD_MOVIMIENTO_REVERTIDO = :P_COD_MOVIMIENTO_FONDO
  INTO :REVIERTE_A;

  RESULTADO = 1; MENSAJE_ERROR = '';
  SUSPEND;
END

-- 03
CREATE OR ALTER PROCEDURE PROC_LIST_DET_MOV_FONDO_AG (P_COD_MOVIMIENTO_FONDO INTEGER)
RETURNS (RESULTADO SMALLINT, MENSAJE_ERROR VARCHAR(500), LADO CHAR(1), CUENTA VARCHAR(50),
         IMPORTE NUMERIC(18,3), LEYENDA VARCHAR(50), ES_FONDOS SMALLINT, UNIDADES NUMERIC(18,3),
         TERCERO VARCHAR(100), DOCUMENTO VARCHAR(30), CENTRO_COSTO VARCHAR(50), SUCURSAL VARCHAR(50))
AS
BEGIN
  RESULTADO = 1; MENSAJE_ERROR = '';
  LADO = 'D';
  FOR SELECT D.CUENTA, D.IMPORTE, D.LEYENDA, D.SOLO_LECTURA, D.UNIDADES,
             COALESCE(D.PROVEEDOR, D.CLIENTE, D.EMPLEADO), D.DOCUMENTO, D.CENTRO_COSTO, D.SUCURSAL
      FROM PROC_GET_M_FONDO_C_DEBE(:P_COD_MOVIMIENTO_FONDO) D
      WHERE D.IMPORTE <> 0   -- los renglones en 0 salen en los dos SP de JK3
      INTO :CUENTA, :IMPORTE, :LEYENDA, :ES_FONDOS, :UNIDADES, :TERCERO, :DOCUMENTO, :CENTRO_COSTO, :SUCURSAL
  DO SUSPEND;
  LADO = 'H';
  FOR SELECT H.CUENTA, H.IMPORTE, H.LEYENDA, H.SOLO_LECTURA, H.UNIDADES,
             COALESCE(H.PROVEEDOR, H.CLIENTE, H.EMPLEADO), H.DOCUMENTO, H.CENTRO_COSTO, H.SUCURSAL
      FROM PROC_GET_M_FONDO_C_HABER(:P_COD_MOVIMIENTO_FONDO) H
      WHERE H.IMPORTE <> 0
      INTO :CUENTA, :IMPORTE, :LEYENDA, :ES_FONDOS, :UNIDADES, :TERCERO, :DOCUMENTO, :CENTRO_COSTO, :SUCURSAL
  DO SUSPEND;
END

-- 04
CREATE OR ALTER PROCEDURE PROC_LIST_CHEQUES_MOV_FON_AG (P_COD_MOVIMIENTO_FONDO INTEGER)
RETURNS (RESULTADO SMALLINT, MENSAJE_ERROR VARCHAR(500), BANCO VARCHAR(50), SUCURSAL VARCHAR(50),
         NRO_CHEQUE VARCHAR(18), TIPO_CHEQUE VARCHAR(8), ESTADO_CHEQUE VARCHAR(25), IMPORTE NUMERIC(18,3),
         FECHA_EMISION DATE, FECHA_VENCIMIENTO DATE, FECHA_COBRO DATE)
AS
BEGIN
  RESULTADO = 1; MENSAJE_ERROR = '';
  FOR SELECT C.NOMBRE_BANCO, C.SUCURSAL, C.NRO_CHEQUE, C.TIPO_CHEQUE, C.ESTADO_CHEQUE, C.IMPORTE_CHEQUE,
             C.FECHA_EMISION, C.FECHA_VENCIMIENTO, C.FECHA_COBRO
      FROM PROC_GET_CHEQUES_X_MOV_FON(:P_COD_MOVIMIENTO_FONDO) C
      INTO :BANCO, :SUCURSAL, :NRO_CHEQUE, :TIPO_CHEQUE, :ESTADO_CHEQUE, :IMPORTE,
           :FECHA_EMISION, :FECHA_VENCIMIENTO, :FECHA_COBRO
  DO SUSPEND;
END
```

**A CONFIRMAR** al escribir los scripts (tarea 4.1):
- Que `PROC_GET_MOV_FONDOS_X_CODIGO` expone `COD_TIPO_COMPROBANTE`, `COD_CLIENTE`, `COD_PROVEEDOR`, `ANULADO` y `COD_MOVIMIENTO_REVERTIDO` con esos nombres (el código fuente los asigna; no se revisaron todos los tipos de salida).
- Que `OFFSET ... FETCH` acepta parámetros dentro de un `FOR SELECT` de PSQL en esta versión de Firebird 3; si no, `ROWS (:P_DESDE + 1) TO (:P_DESDE + :P_LIMITE)`.
- Si un movimiento con `COD_USUARIO` inexistente queda afuera por el `INNER JOIN USUARIOS` del SP de JK3 (se vería como no encontrado).

### D11. Tests
- Unitarios puros: `numero.ts` (tabla de D2 y entradas inválidas) y `criterio.ts` (períodos con un `hoy` fijo, incluido `esta_semana` un lunes y `mes_pasado` en enero; mes por defecto; sin rango con número; `desde > hasta`; período y fechas juntos; importe ±5 % y exacto).
- Tools con `accesoSimulado`: parámetros que llegan al SP; mapeo de filas a JSON (claves opcionales omitidas, `unidades` solo si difiere, `resumen` agrupado); `encontrados`/`truncado`; `MOVIMIENTO_NO_ENCONTRADO` sin llamadas a 03 y 04; que nunca se use `enTransaccionEscritura`.
- Contrato: `tools/list` con las dos tools, annotations, descripciones de cuatro partes y enum de códigos con `MOVIMIENTO_NO_ENCONTRADO`.
- Contra CREAR (manual, tarea 5.1): los tres prompts del proposal desde el MCP Inspector o Claude Desktop.

## Risks / Trade-offs

- [Buscar por número sin fechas recorre toda la tabla; en una base de producción con millones de movimientos puede tardar] → Se mide en CREAR (tarea 4.3). Si es lento, la mitigación es un índice por `NRO_COMPROBANTE`, que es DDL y va en un change aparte con confirmación; la descripción de la tool sugiere sumar un período cuando el usuario lo sepa.
- [Con D6, la búsqueda por número sin rango recorre `IDX_MOVIMIENTOS_FONDOS_FECHA` completo, que puede ser más lento que un recorrido natural] → Se mide en la tarea 4.3; si pasa de 300 ms, el SP 01 separa una rama sin predicado de fecha para ese caso.
- [La clase depende de los textos de `TIPOS_COMPROBANTES.TIPO_COMPROBANTE`; otro cliente podría usar textos distintos] → Los textos que no reconoce caen en `otros`, que nunca rompe; los prefijos `Dep`/`Rev` toleran variaciones de acento.
- [Los movimientos viejos sin talonario (40.547 filas, la mayoría anteriores a 2026) tienen `talonario: null` y a veces número vacío] → `talonario` admite null; la búsqueda por número simplemente no los encuentra.
- [La fecha de "hoy" sale del proceso del MCP; si la máquina tiene otra zona horaria que la base, "ayer" puede correrse un día] → El MCP corre en la misma máquina que Claude Desktop, cuya fecha es la que espera el operador.

## Migration Plan

1. Archivar `crear-fondos-mcp` antes que este change (el delta de `fondos-mcp` modifica su spec).
2. Aplicar los SP en CREAR con confirmación; vuelta atrás con `DROP PROCEDURE` en orden inverso. No hay datos que migrar.

## Open Questions

- Permisos: el formulario no filtra por talonario ni caja del usuario; si un cliente lo necesita, se suma como filtro en el SP 01 sin cambiar la forma de las tools.
- Cupones de tarjeta: cuando exista `PROC_GET_CUPONES_X_MOV` en alguna base, se agrega `cupones` al detalle como clave opcional.
