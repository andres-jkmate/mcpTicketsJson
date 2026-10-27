# Design

## Context

Motivación en `proposal.md`; requisitos en `specs/registro-factura-proveedor/spec.md` y los deltas de `comprobantes-prov-mcp` y `plataforma-mcp`. Estado que condiciona el diseño (2026-10-24):

- **App**: `apps/comprobantes-prov-mcp` existe sin tools, con los cuatro códigos base, test de contrato genérico, `test/apoyo.ts` y `db/procedimientos/` vacío.
- **Paquete Firebird**: `AccesoDatos.enTransaccion` abre siempre `readOnly: true` y descarta el error del commit (`commitAsync().catch(() => undefined)`), lo cual es inofensivo al leer pero no al escribir. `aplicarContrato` solo traduce `RESULTADO = 0` a `PARAMETRO_INVALIDO` o, con prefijo `NO_AUTORIZADO:`, a `NO_AUTORIZADO`.
- **Base objetivo**: `CREAR_JK3_20261016` (copia local, `E:\Bases\CREAR_JK3_20261016.fdb`). Es Argentina: `TABLA_PRECOMPILADORES` tiene `PRJ_ARGENTINA` y `PRJ_AREVALO`.
- **Cómo graba hoy JK3** (formulario `facturaproveedor`, modalidad `FACTURACIONPROVEEDORES`; webservices leídos en `METODOS_WEBSERVICES`):
  1. *Cerrar*: `PROC_INSERTAR_SEMI_CTE_PROV` → `PROC_GRA_SEM_DET_CTE_PROV_JK3` por línea → `PROC_INSERT_SEMI_DET_PROV_ALI` (alícuotas desde artículo y proveedor, y totales con `PROC_SET_SEMI_PROV_ACT_TOTALES`).
  2. *Grabar*:
     - validaciones `PROC_VALIDAR_PER_CERRADO_EMPR` y `PROC_CTRL_NRO_COMPPROV`;
     - `PROC_SET_SEMI_PROV_UPD_JK3`;
     - en Argentina no se generan retenciones;
     - `LIST_FINANCIAR_CREDITO_PROV`, `PROC_INSERT_SEMI_CREDITO_PROV` y `PROC_INSERT_SEMI_CUOTAS_PROV`;
     - `PROC_GUARDAR_SEMI_COMPPROVEEDOR`, `PROC_INGRESAR_STOCK_CBTE_PROV` y `PROC_BORRAR_SEMI_Y_DET_CTE_PROV`.

  Cada paso es una llamada separada desde el navegador: una falla a mitad deja SEMI huérfanas.
- **Importes de la línea**: `JKMT_TOTAL_IMPORTE_ART_PROV(articulo, monto, proveedor, fecha)` separa neto, no gravado, exento, IVA, impuesto y percepciones a partir de un monto con impuestos, según `ARTICULOS.CONDICION_IMPUESTO_VENTA` y la configuración del proveedor. `TOTAL` es columna calculada en `SEMI_COMPROBANTES_PROVEEDORES` y `COMPROBANTES_PROVEEDORES`.
- **Perfil de facturación de compras**: `PERFILES_FACTURACION_COMPRAS` con `PERFILES_FC_COMPRA_USUARIOS`, `_TIPOS_COMP`, `_SUCURSALES`, `_CCOSTOS`, `_COND_COMP`, `_MONEDAS` (y `_R_APROP`, `_DEPOSITOS`, `_ASIENTOS_MOD`, que no se usan acá), todas con `POR_DEFECTO`. El formulario elige "una sola opción o la primera con `POR_DEFECTO = 1`". En CREAR hay un perfil (`1` GENERAL, usuarios 7 y 28) con:

  | Lista | Opciones |
  |---|---|
  | Tipos | `132` (A, `CODIGO_AFIP` 001) y `134` (C, 011) |
  | Sucursal | `3` |
  | Centro de costo | `2` |
  | Condición | `4` (Cuenta Corriente, 1 cuota a 10 días) |
  | Monedas | `3` Pesos y `5` Dólares |

  Ninguna opción tiene `POR_DEFECTO = 1`.
- **Datos reales**: las 62 facturas cargadas por JK3 desde el 10/08/2026 son todas a cuenta corriente, de 1 a 3 líneas, cantidad 1, con artículos que en la práctica son conceptos (`CON-33` "GASTOS VARIOS 21%"…). El vencimiento real es fecha de recepción + 10 días, aunque la condición tiene `VENCIMIENTO_EN_FECHA_RECEPCION = 0`, porque el formulario siempre parte de la fecha de recepción. Los defaults por proveedor de `PROVEEDORES` (`COD_TIPO_COMPROBANTE_FACTURA`, `COD_CONCEPTO_*`, `PUNTO_VENTA`) están vacíos en los 83 proveedores activos. `PLANTILLAS_PROV_ARTICULOS` sí tiene datos y la actualiza `PROC_GUARDAR_SEMI_COMPPROVEEDOR` en cada grabado.

## Goals / Non-Goals

**Goals:**
- Probar el patrón "lenguaje natural → borrador → preparar → confirmar → registrar" con un dato de varias tablas.
- Reusar la cadena de SP de JK3 para que el comprobante quede igual que uno cargado por el formulario.
- Que todo lo que decide la base sea visible para el agente (origen de cada valor y opciones).

**Non-Goals:**
- Exactitud contable: no se cotejan totales contra el papel ni se editan alícuotas.
- Generalizar a Colombia/Ecuador, notas de crédito y débito, contado, retenciones o asientos.
- Cambiar la configuración de la base (por ejemplo, marcar una moneda por defecto en el perfil).

## Decisions

### D1. Dos tools y el borrador en la conversación
`preparar_factura_proveedor` resuelve y calcula sin escribir; `registrar_factura_proveedor` graba. El borrador lo mantiene el agente y lo reenvía completo en cada llamada; cuando está listo, `preparar` devuelve `paraRegistrar`, que es exactamente el input de `registrar`.

Alternativas descartadas:
- **Una sola tool que falle con `ELECCION_REQUERIDA`**: el agente se entera de las opciones recién al intentar grabar y no puede mostrar una vista previa.
- **Usar las SEMI como borrador entre turnos**: deja basura si el usuario abandona, que es justo lo que pasa hoy con el formulario, y obliga a guardar estado por sesión.

### D2. Reusar los SP de JK3, sin reescribir los inserts
El grabado llama a los mismos SP que el formulario, en el mismo orden. Así triggers, plantillas, número interno (`CODIGO_COMP`) y totales salen igual que en JK3. **Alternativa:** insertar directo en las tablas reales desde un SP nuevo. Se descarta porque duplicaría lógica (alícuotas, totales, plantillas) que ya cambia por cliente.

### D3. Orquestación: tres SP en una transacción de escritura
Firebird 3 no recibe arrays y parsear JSON en PSQL es frágil, así que `registrar` llama, dentro de una sola transacción de escritura:

1. `PROC_INS_FAC_PROV_AG` (cabecera);
2. `PROC_INS_DET_FAC_PROV_AG` (una vez por línea);
3. `PROC_INS_FIN_FAC_PROV_AG` (alícuotas, crédito, cuotas, pase a reales, stock y limpieza de SEMI).

Si cualquiera devuelve `RESULTADO = 0` o lanza, la transacción se revierte. **Alternativa:** un único SP con las líneas en un BLOB delimitado. Se descarta por frágil y difícil de testear.

### D4. Transacción de escritura en `@mcp-jkmate/firebird`
Se agrega `AccesoDatos.enTransaccionEscritura(trabajo, medidor?)`, igual a `enTransaccion` pero con `readOnly: false`, aislamiento `READ_COMMITTED` y `wait: true`. Un error del commit **se propaga**, y ante cualquier error hace rollback y relanza. `enTransaccion` no cambia. El test unitario del paquete cubre "error en el segundo SP → rollback" y "commit que falla → error".

Alternativas descartadas:
- **Un flag `{ escritura: true }` en `enTransaccion`**: es más fácil equivocarse al leer código de tools.
- **Que cada SP confirme por su cuenta**: Firebird no permite `COMMIT` dentro de un SP llamado con `SELECT`, y no daría el todo o nada.

`wait: true` y el aislamiento funcionaron en la integración contra CREAR (2026-10-25), sin otra carga concurrente; la contención con JK3 sobre los generadores sigue **A CONFIRMAR** con uso real.

### D5. La regla del perfil se aplica en TypeScript
Los SP listan las opciones del perfil con su `POR_DEFECTO`; la regla "una opción → se usa; `POR_DEFECTO = 1` → se usa; si no, pendiente" vive en una función pura de la app, que se aplica igual a perfil, tipo, sucursal, centro de costo, condición y moneda, y se testea sin base. El filtro del tipo por letra se aplica antes de la regla. **Alternativa:** aplicar la regla en cada SP. Se descarta porque sería la misma lógica repetida seis veces en PSQL y no aporta conocimiento del esquema.

### D6. Errores del dominio por prefijo
Los SP públicos señalan los errores del dominio con `RESULTADO = 0` y `MENSAJE_ERROR` prefijado con el código (`COMPROBANTE_DUPLICADO: …`, `PERIODO_CERRADO: …`), igual que ya hacen con `NO_AUTORIZADO:`. `aplicarContrato` suma un parámetro opcional con los códigos del dominio que reconoce el MCP; un prefijo fuera de esa lista sigue siendo `PARAMETRO_INVALIDO`. Es un cambio aditivo del paquete: tickets no lo pasa y no cambia. **Alternativa:** que cada tool inspeccione el mensaje. Se descarta porque sería reimplementar el contrato.

### D7. Número y tipo
La normalización vive en TypeScript (función pura):
- acepta `A1 135`, `A 0001 00000135`, `A-1-135`, `A0001-00000135` y el formato completo;
- produce `L-PPPP-NNNNNNNN` con punto de venta de hasta 4 dígitos y número de hasta 8, rellenando con ceros;
- si la letra no es A/B/C, falta el número o un tramo es más largo, el número queda pendiente.

La letra filtra los tipos del perfil por `TIPOS_COMPROBANTES.CODIGO_AFIP`: `001` = A y `011` = C (verificado); `006` = B queda **A CONFIRMAR**, porque CREAR no tiene tipos B en el perfil. `PROC_CTRL_NRO_COMPPROV` vuelve a validar la máscara argentina al registrar.

### D8. Montos y vista previa
Cada ítem lleva un `monto` total con impuestos. `preparar` llama a `PROC_GET_CALC_LINEA_FC_AG`, un wrapper de `JKMT_TOTAL_IMPORTE_ART_PROV`, por línea y suma. Al registrar, `PROC_INS_DET_FAC_PROV_AG` vuelve a calcular con el mismo SP e inserta lo que el formulario manda a `PROC_GRA_SEM_DET_CTE_PROV_JK3`:
- `IMPORTE = PRECIO_UNITARIO`;
- `NETO`, `IVA`, `IMPUESTO`, `NO_GRAVADO` y `EXENTO`;
- `CANTIDAD = 1`.

Las percepciones las agrega después `PROC_INSERT_SEMI_DET_PROV_ALI` como alícuotas, igual que en JK3. El total grabado (columna calculada) puede diferir en centavos del total de la vista previa; `registrar` devuelve el total grabado.

### D9. Valores de cabecera que no vienen del usuario

| Columna SEMI | Origen |
|---|---|
| `COD_USUARIO` | `MCP_COD_USUARIO` |
| `COD_USUARIO_CAJA` | `USUARIOS.COD_USUARIO_CAJA` de ese usuario (si es nulo, el mismo usuario) |
| `CATEGORIA_IVA` | `PROC_GET_CATEGORIAS_IVA_X_COD(PROVEEDORES.COD_CAT_IVA).CATEGORIA_IVA` |
| `COTIZACION` | `DATOS_MONEDA(moneda, fecha).COTIZACION` |
| `MODALIDAD_PAGO` | `CONDICIONES_COMPRAS.MODALIDAD_PAGO` |
| `LETRA` | primer carácter del número |
| `COD_CLIENTE` | `-1`, como el formulario |
| `FECHA_CONTABLE`, `FECHA_IVA`, `FECHA_RECEPCION_FAC` | borrador (por defecto, la fecha) |
| `CONCEPTO` | borrador; `PROC_INSERTAR_SEMI_CTE_PROV` no lo recibe, así que se setea con `PROC_SET_SEMI_PROV_UPD_JK3` |

El crédito replica `Grabar()` del formulario:
- `DESCRIPCION = 'Factura-' || nro`, `CUOTA = 0`, `PAGO = 0`, `MONTO = TOTAL`;
- interés, tiempo y tipo, de la condición.

Las cuotas salen de `LIST_FINANCIAR_CREDITO_PROV(condición, TOTAL, fecha de recepción)` con `COD_CREDITO_IMPUTACION` = crédito.

### D10. Búsqueda de proveedor y artículo
- **Proveedor** (`PROC_LIST_PROVEEDORES_FC_AG`): `CONTAINING` sobre `RAZON_SOCIAL`, `NOMBRE_COMERCIAL`, `CODIGO`, o `CUIT` igual. Solo habilitados (`FECHA_INHABILITACION` nula o futura). Ordena por cantidad de comprobantes y devuelve como máximo 10.
- **Artículo** (`PROC_LIST_ARTICULOS_FC_AG`): `CONTAINING` sobre la descripción y el código, en tres niveles, devolviendo solo el primero que tenga filas:
  1. `PLANTILLAS_PROV_ARTICULOS` del proveedor;
  2. artículos de `DET_COMPROBANTES_PROVEEDORES` del proveedor;
  3. `ARTICULOS` con `FECHA_BAJA` nula.

  Cada fila indica su `ORIGEN`; máximo 10.
- **Sugerencia** (spec "Proveedor ambiguo con sugerencia"): con varios proveedores y un ítem con texto, la app marca como sugerido al único proveedor cuya búsqueda de artículo resuelve en el nivel plantilla.

Es una búsqueda por texto simple, suficiente para el prototipo; los sinónimos ("tel" → "TELEFONIA") quedan para el agente.

### D11. Validaciones compartidas
`PRV_VAL_FAC_PROV_AG` devuelve una fila por bloqueo (`CODIGO`, `MENSAJE`). La usan `PROC_LIST_VAL_FAC_PROV_AG` (desde `preparar`, como bloqueos) y `PROC_INS_FAC_PROV_AG` (al registrar: el primer bloqueo se devuelve como `RESULTADO = 0` con prefijo). Controla:

| Código | Condición |
|---|---|
| `COMPROBANTE_DUPLICADO` | Ya existe el comprobante (`PROC_CTRL_NRO_COMPPROV`, que además valida la máscara) |
| `PERIODO_CERRADO` | `PROC_VALIDAR_PER_CERRADO_EMPR(empresa del tipo, 'MOD_COMPRA', fecha)` sobre la fecha contable y la de IVA |
| `FECHA_IVA_ANTERIOR` | La fecha de IVA es anterior a la fecha del comprobante |
| `CONDICION_NO_CUENTA_CORRIENTE` | La condición no es de modalidad cuenta corriente |
| `PROVEEDOR_INHABILITADO` | El proveedor está inhabilitado |
| `BASE_NO_SOPORTADA` | La base no tiene `PRJ_ARGENTINA` |

Al registrar, los códigos que no son del dominio salen como `PARAMETRO_INVALIDO`. La pertenencia al perfil la controla `PROC_INS_FAC_PROV_AG` usando `PRV_LIST_PERFIL_OPC_AG`.

### D12. Tools, SP que las alimentan y esquemas

**`preparar_factura_proveedor`**:

- SP:
  - `PROC_LIST_PERFIL_OPC_AG` (perfiles y opciones);
  - `PROC_LIST_PROVEEDORES_FC_AG`;
  - `PROC_LIST_ARTICULOS_FC_AG` (una vez por ítem con texto);
  - `PROC_GET_CALC_LINEA_FC_AG` (una vez por ítem resuelto);
  - `PROC_LIST_VAL_FAC_PROV_AG`;
  - `PROC_LIST_CUOTAS_FC_AG` (una vez, cuando hay condición y total calculado): da `vencimiento`, la fecha de la primera cuota.

  Todos en una sola transacción de solo lectura.
- Annotations: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`.
- inputSchema (cerrado; todo opcional salvo `items`):
  ```jsonc
  {
    "proveedor": "string (1..100), texto libre",      // o
    "proveedorId": "integer",
    "numero": "string (1..30), ej. 'A1 135'",
    "fecha": "AAAA-MM-DD", "fechaRecepcion": "AAAA-MM-DD", "fechaContable": "AAAA-MM-DD", "fechaIva": "AAAA-MM-DD",
    "perfilId": "integer", "tipoComprobanteId": "integer", "sucursalId": "integer",
    "centroCostoId": "integer", "condicionCompraId": "integer", "monedaId": "integer",
    "concepto": "string (..50)",
    "items": [ { "articulo": "string (1..100)", "articuloCodigo": "string (..50)", "monto": "number > 0" } ]  // 1..20
  }
  ```
- outputSchema:
  ```jsonc
  {
    "listoParaRegistrar": "boolean",
    "resueltos": { "<campo>": { "id": "integer|string", "descripcion": "string", "origen": "informado|unico|por_defecto|letra|plantilla_proveedor|historial_proveedor|catalogo|hoy|calculado" } },
    "pendientes": [ { "campo": "string", "texto": "string|null", "motivo": "string",
                      "opciones": [ { "id": "integer|string", "descripcion": "string", "sugerido": "boolean", "motivoSugerencia": "string|null" } ] } ],
    "bloqueos": [ { "codigo": "string", "mensaje": "string" } ],
    "items": [ { "orden": "integer", "texto": "string|null", "monto": "number",
                 "articulo": { "codigo": "string", "descripcion": "string", "origen": "string" } | null,
                 "calculado": { "neto": "number", "noGravado": "number", "exento": "number", "iva": "number", "impuesto": "number", "percepciones": "number" } | null } ],
    "totalCalculado": "number|null",
    "vencimiento": "AAAA-MM-DD|null",
    "paraRegistrar": "objeto con el input de registrar_factura_proveedor | null"
  }
  ```
  Los `<campo>` posibles son `proveedor`, `perfil`, `tipoComprobante`, `numero`, `fecha`, `fechaRecepcion`, `fechaContable`, `fechaIva`, `sucursal`, `centroCosto`, `condicionCompra` y `moneda`; cada uno aparece en `resueltos` o en `pendientes`, nunca en los dos. Si el perfil queda pendiente, los campos que dependen de él quedan pendientes con motivo "depende del perfil".
- Ejemplo ("carga la factura A1 135 de Telecom de 200.000 por Internet"; importes ilustrativos, los reales los da `JKMT_TOTAL_IMPORTE_ART_PROV`):
  ```json
  {
    "listoParaRegistrar": false,
    "resueltos": {
      "perfil": { "id": 1, "descripcion": "GENERAL", "origen": "unico" },
      "numero": { "id": "A-0001-00000135", "descripcion": "A-0001-00000135", "origen": "informado" },
      "tipoComprobante": { "id": 132, "descripcion": "FACTURA DE COMPRAS A JKMT", "origen": "letra" },
      "fecha": { "id": "2026-10-24", "descripcion": "2026-10-24", "origen": "hoy" },
      "sucursal": { "id": 3, "descripcion": "Christian", "origen": "unico" },
      "centroCosto": { "id": 2, "descripcion": "Parque", "origen": "unico" },
      "condicionCompra": { "id": 4, "descripcion": "CUENTA CORRIENTE", "origen": "unico" }
    },
    "pendientes": [
      { "campo": "proveedor", "texto": "Telecom", "motivo": "Hay 2 proveedores que coinciden",
        "opciones": [
          { "id": 4, "descripcion": "TELECOM ARGENTINA S.A", "sugerido": true, "motivoSugerencia": "Tiene INTERNET 21% en su plantilla" },
          { "id": 2, "descripcion": "TELECOM PERSONAL S.A.", "sugerido": false, "motivoSugerencia": null } ] },
      { "campo": "moneda", "texto": null, "motivo": "El perfil tiene 2 monedas y ninguna por defecto",
        "opciones": [ { "id": 3, "descripcion": "Pesos", "sugerido": false, "motivoSugerencia": null },
                      { "id": 5, "descripcion": "DOLARES", "sugerido": false, "motivoSugerencia": null } ] }
    ],
    "bloqueos": [],
    "items": [ { "orden": 1, "texto": "Internet", "monto": 200000, "articulo": null, "calculado": null } ],
    "totalCalculado": null,
    "vencimiento": null,
    "paraRegistrar": null
  }
  ```
  El artículo queda sin resolver hasta que se elija el proveedor; la sugerencia ya anticipa `CON-5`.

**`registrar_factura_proveedor`**:

- SP: `PROC_INS_FAC_PROV_AG`, `PROC_INS_DET_FAC_PROV_AG` (por ítem) y `PROC_INS_FIN_FAC_PROV_AG`, en una transacción de escritura (D3, D4).
- Annotations: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`, `openWorldHint: false`.
- inputSchema (cerrado; todo obligatorio salvo `concepto`):
  ```jsonc
  {
    "proveedorId": "integer", "perfilId": "integer", "tipoComprobanteId": "integer",
    "numero": "string, patrón ^[ABC]-\\d{4}-\\d{8}$",
    "fecha": "AAAA-MM-DD", "fechaRecepcion": "AAAA-MM-DD", "fechaContable": "AAAA-MM-DD", "fechaIva": "AAAA-MM-DD",
    "sucursalId": "integer", "centroCostoId": "integer", "condicionCompraId": "integer", "monedaId": "integer",
    "concepto": "string (..50)",
    "items": [ { "articuloCodigo": "string (1..50)", "monto": "number > 0" } ]  // 1..20
  }
  ```
- outputSchema:
  ```jsonc
  {
    "comprobanteId": "integer", "numero": "string", "numeroInterno": "integer|null",
    "proveedor": { "id": "integer", "nombre": "string" },
    "fecha": "AAAA-MM-DD", "total": "number",
    "cuotas": [ { "cuota": "integer", "vencimiento": "AAAA-MM-DD", "monto": "number" } ]
  }
  ```
- Ejemplo:
  ```json
  { "comprobanteId": 16330, "numero": "A-0001-00000135", "numeroInterno": 20261000012,
    "proveedor": { "id": 4, "nombre": "TELECOM ARGENTINA S.A" },
    "fecha": "2026-10-24", "total": 200000,
    "cuotas": [ { "cuota": 1, "vencimiento": "2026-11-03", "monto": 200000 } ] }
  ```

Las dos descripciones siguen la plantilla de cuatro partes. En "Qué NO hacer" de `registrar` va: no llamarla sin haber mostrado la vista previa de `preparar_factura_proveedor` y tener la confirmación del usuario, y no usarla para corregir una factura ya grabada.

### D13. SP nuevos (propuestos; se crean solo con confirmación)

Todos los públicos siguen el contrato `RESULTADO`/`MENSAJE_ERROR` y los privados no validan. El orden de los archivos en `db/procedimientos/` es el de esta lista. Nombres contados contra el límite de 31 caracteres. Las columnas usadas se verificaron contra CREAR, salvo lo marcado como **A CONFIRMAR**.

| Orden | SP | Tipo | Qué hace |
|---|---|---|---|
| 01 | `PRV_LIST_PERFIL_OPC_AG` | privado | Opciones de perfiles y del perfil elegido |
| 02 | `PRV_VAL_FAC_PROV_AG` | privado | Bloqueos de negocio de un borrador |
| 03 | `PROC_LIST_PERFIL_OPC_AG` | público | Expone 01 |
| 04 | `PROC_LIST_PROVEEDORES_FC_AG` | público | Búsqueda de proveedor |
| 05 | `PROC_LIST_ARTICULOS_FC_AG` | público | Búsqueda de artículo por niveles |
| 06 | `PROC_GET_CALC_LINEA_FC_AG` | público | Importes de una línea |
| 07 | `PROC_LIST_VAL_FAC_PROV_AG` | público | Expone 02 |
| 08 | `PROC_INS_FAC_PROV_AG` | público | Revalida y crea la cabecera SEMI |
| 09 | `PROC_INS_DET_FAC_PROV_AG` | público | Calcula e inserta una línea SEMI |
| 10 | `PROC_INS_FIN_FAC_PROV_AG` | público | Alícuotas, crédito, cuotas, pase a reales y limpieza |
| 11 | `PROC_LIST_CUOTAS_FC_AG` | público | Cuotas y vencimiento desde la fecha de recepción (envuelve `LIST_FINANCIAR_CREDITO_PROV`, solo lectura) |

Scripts propuestos (cuerpo principal; los encabezados de comentario `Nombre`/`Descripción`/`Última modificación` y, en privados, `Precondiciones`/`Postcondiciones` se completan al aplicar):

```sql
-- 01
CREATE OR ALTER PROCEDURE PRV_LIST_PERFIL_OPC_AG (P_COD_USUARIO INTEGER, P_COD_PERFIL INTEGER)
RETURNS (CAMPO VARCHAR(20), CODIGO INTEGER, DESCRIPCION VARCHAR(100), POR_DEFECTO SMALLINT,
         LETRA CHAR(1), MODALIDAD VARCHAR(17), COD_EMPRESA INTEGER)
AS
DECLARE VARIABLE V_COD_USUARIO_CAJA INTEGER;
BEGIN
  FOR SELECT P.COD_PERFIL_FACTURACION, P.DESCRIPCION, COALESCE(PU.POR_DEFECTO, 0)
      FROM PERFILES_FACTURACION_COMPRAS P
      JOIN PERFILES_FC_COMPRA_USUARIOS PU ON PU.COD_PERFIL_FACTURACION = P.COD_PERFIL_FACTURACION
      WHERE PU.COD_USUARIO = :P_COD_USUARIO
      INTO :CODIGO, :DESCRIPCION, :POR_DEFECTO
  DO BEGIN CAMPO = 'perfil'; LETRA = NULL; MODALIDAD = NULL; COD_EMPRESA = NULL; SUSPEND; END

  IF (:P_COD_PERFIL IS NULL OR NOT EXISTS (SELECT 1 FROM PERFILES_FC_COMPRA_USUARIOS
      WHERE COD_PERFIL_FACTURACION = :P_COD_PERFIL AND COD_USUARIO = :P_COD_USUARIO)) THEN EXIT;

  SELECT COALESCE(U.COD_USUARIO_CAJA, U.COD_USUARIO) FROM USUARIOS U
  WHERE U.COD_USUARIO = :P_COD_USUARIO INTO :V_COD_USUARIO_CAJA;

  -- Tipos "Factura" del perfil habilitados al usuario de caja en MOD_COMPRA (como PROC_GET_TIPO_COMP_USU_CAJA_PF)
  FOR SELECT TC.COD_TIPO_COMPROBANTE, TC.DESCRIPCION, COALESCE(PT.POR_DEFECTO, 0), T.COD_EMPRESA,
             CASE T.CODIGO_AFIP WHEN '001' THEN 'A' WHEN '006' THEN 'B' WHEN '011' THEN 'C' END
      FROM TIPOS_COMP_USUARIOS_ASIG(:V_COD_USUARIO_CAJA) TC
      JOIN TIPOS_COMPROBANTES_MODULOS M ON M.COD_TIPO_COMPROBANTE = TC.COD_TIPO_COMPROBANTE AND M.MODULO = 'MOD_COMPRA'
      JOIN PERFILES_FC_COMPRA_TIPOS_COMP PT ON PT.COD_TIPO_COMPROBANTE = TC.COD_TIPO_COMPROBANTE
      JOIN TIPOS_COMPROBANTES T ON T.COD_TIPO_COMPROBANTE = TC.COD_TIPO_COMPROBANTE
      WHERE PT.COD_PERFIL_FACTURACION = :P_COD_PERFIL AND TC.TIPO_COMPROBANTE = 'Factura'
      INTO :CODIGO, :DESCRIPCION, :POR_DEFECTO, :COD_EMPRESA, :LETRA
  DO BEGIN CAMPO = 'tipoComprobante'; MODALIDAD = NULL; SUSPEND; END

  LETRA = NULL; COD_EMPRESA = NULL;
  FOR SELECT S.COD_SUCURSAL, S.NOMBRE, COALESCE(X.POR_DEFECTO, 0) FROM PERFILES_FC_COMPRA_SUCURSALES X
      JOIN SUCURSALES S ON S.COD_SUCURSAL = X.COD_SUCURSAL WHERE X.COD_PERFIL_FACTURACION = :P_COD_PERFIL
      INTO :CODIGO, :DESCRIPCION, :POR_DEFECTO
  DO BEGIN CAMPO = 'sucursal'; SUSPEND; END
  FOR SELECT C.COD_CENTRO_COSTO, C.DESCRIPCION, COALESCE(X.POR_DEFECTO, 0) FROM PERFILES_FC_COMPRA_CCOSTOS X
      JOIN CENTROS_COSTOS C ON C.COD_CENTRO_COSTO = X.COD_CENTRO_COSTO WHERE X.COD_PERFIL_FACTURACION = :P_COD_PERFIL
      INTO :CODIGO, :DESCRIPCION, :POR_DEFECTO
  DO BEGIN CAMPO = 'centroCosto'; SUSPEND; END
  FOR SELECT C.COD_CONDICION_COMPRA, C.DESCRIPCION, COALESCE(X.POR_DEFECTO, 0), C.MODALIDAD_PAGO FROM PERFILES_FC_COMPRA_COND_COMP X
      JOIN CONDICIONES_COMPRAS C ON C.COD_CONDICION_COMPRA = X.COD_CONDICION_COMPRA WHERE X.COD_PERFIL_FACTURACION = :P_COD_PERFIL
      INTO :CODIGO, :DESCRIPCION, :POR_DEFECTO, :MODALIDAD
  DO BEGIN CAMPO = 'condicionCompra'; SUSPEND; END
  MODALIDAD = NULL;
  -- PROC_GET_MONEDAS_PFC no filtra por perfil; acá sí
  FOR SELECT M.COD_MONEDA, M.MONEDA, COALESCE(X.POR_DEFECTO, 0) FROM PERFILES_FC_COMPRA_MONEDAS X
      JOIN MONEDAS M ON M.COD_MONEDA = X.COD_MONEDA WHERE X.COD_PERFIL_FACTURACION = :P_COD_PERFIL
      INTO :CODIGO, :DESCRIPCION, :POR_DEFECTO
  DO BEGIN CAMPO = 'moneda'; SUSPEND; END
END

-- 02  (una fila por bloqueo; sin filas = válido)
CREATE OR ALTER PROCEDURE PRV_VAL_FAC_PROV_AG (P_COD_PROVEEDOR INTEGER, P_COD_TIPO_COMPROBANTE INTEGER,
  P_NRO_COMPROBANTE VARCHAR(15), P_FECHA DATE, P_FECHA_CONTABLE DATE, P_FECHA_IVA DATE, P_COD_CONDICION_COMPRA INTEGER)
RETURNS (CODIGO VARCHAR(40), MENSAJE VARCHAR(500))
AS
DECLARE VARIABLE V_EMPRESA INTEGER; DECLARE VARIABLE V_CERRADO SMALLINT; DECLARE VARIABLE V_OK SMALLINT;
DECLARE VARIABLE V_MSJ VARCHAR(500); DECLARE VARIABLE V_MODALIDAD VARCHAR(17);
BEGIN
  IF (NOT EXISTS (SELECT 1 FROM TABLA_PRECOMPILADORES WHERE PRECOMPILADOR = 'PRJ_ARGENTINA')) THEN
  BEGIN CODIGO = 'BASE_NO_SOPORTADA'; MENSAJE = 'El prototipo solo registra facturas en bases de Argentina'; SUSPEND; END

  IF (EXISTS (SELECT 1 FROM PROVEEDORES P WHERE P.COD_PROVEEDOR = :P_COD_PROVEEDOR
      AND P.FECHA_INHABILITACION IS NOT NULL AND P.FECHA_INHABILITACION <= CURRENT_DATE)) THEN
  BEGIN CODIGO = 'PROVEEDOR_INHABILITADO'; MENSAJE = 'El proveedor está inhabilitado'; SUSPEND; END

  IF (:P_NRO_COMPROBANTE IS NOT NULL AND :P_COD_TIPO_COMPROBANTE IS NOT NULL) THEN
  BEGIN
    SELECT RESULTADO, MENSAJE FROM PROC_CTRL_NRO_COMPPROV(:P_COD_PROVEEDOR, :P_NRO_COMPROBANTE, :P_COD_TIPO_COMPROBANTE, NULL)
    INTO :V_OK, :V_MSJ;
    IF (:V_OK = 0) THEN
    BEGIN
      CODIGO = IIF(:V_MSJ STARTING WITH 'Ya se ha cargado', 'COMPROBANTE_DUPLICADO', 'NUMERO_INVALIDO');
      MENSAJE = :V_MSJ; SUSPEND;
    END
  END

  IF (:P_FECHA_IVA < :P_FECHA) THEN
  BEGIN CODIGO = 'FECHA_IVA_ANTERIOR'; MENSAJE = 'La fecha de IVA no puede ser anterior a la del comprobante'; SUSPEND; END

  SELECT COD_EMPRESA FROM TIPOS_COMPROBANTES WHERE COD_TIPO_COMPROBANTE = :P_COD_TIPO_COMPROBANTE INTO :V_EMPRESA;
  IF (:V_EMPRESA IS NOT NULL) THEN
  BEGIN
    SELECT PERIODO_CERRADO FROM PROC_VALIDAR_PER_CERRADO_EMPR(:V_EMPRESA, 'MOD_COMPRA', :P_FECHA_CONTABLE) INTO :V_CERRADO;
    IF (:V_CERRADO = 1) THEN BEGIN CODIGO = 'PERIODO_CERRADO'; MENSAJE = 'La fecha contable cae en un período cerrado'; SUSPEND; END
    SELECT PERIODO_CERRADO FROM PROC_VALIDAR_PER_CERRADO_EMPR(:V_EMPRESA, 'MOD_COMPRA', :P_FECHA_IVA) INTO :V_CERRADO;
    IF (:V_CERRADO = 1) THEN BEGIN CODIGO = 'PERIODO_CERRADO'; MENSAJE = 'La fecha de IVA cae en un período cerrado'; SUSPEND; END
  END

  SELECT MODALIDAD_PAGO FROM CONDICIONES_COMPRAS WHERE COD_CONDICION_COMPRA = :P_COD_CONDICION_COMPRA INTO :V_MODALIDAD;
  IF (:P_COD_CONDICION_COMPRA IS NOT NULL AND COALESCE(:V_MODALIDAD, '') <> 'Cuenta Corriente') THEN
  BEGIN CODIGO = 'CONDICION_NO_CUENTA_CORRIENTE'; MENSAJE = 'El prototipo solo registra facturas a cuenta corriente'; SUSPEND; END
END

-- 04
CREATE OR ALTER PROCEDURE PROC_LIST_PROVEEDORES_FC_AG (P_TEXTO VARCHAR(100), P_COD_PROVEEDOR INTEGER)
RETURNS (RESULTADO SMALLINT, MENSAJE_ERROR VARCHAR(500), COD_PROVEEDOR INTEGER, RAZON_SOCIAL VARCHAR(100),
         NOMBRE_COMERCIAL VARCHAR(100), CUIT VARCHAR(30), CANT_COMPROBANTES INTEGER, ULTIMA_FECHA DATE)
AS
BEGIN
  IF (COALESCE(TRIM(:P_TEXTO), '') = '' AND :P_COD_PROVEEDOR IS NULL) THEN
  BEGIN RESULTADO = 0; MENSAJE_ERROR = 'Indicá el proveedor por texto o código'; SUSPEND; EXIT; END
  RESULTADO = 1;
  FOR SELECT FIRST 10 P.COD_PROVEEDOR, P.RAZON_SOCIAL, P.NOMBRE_COMERCIAL, P.CUIT,
        (SELECT COUNT(*) FROM COMPROBANTES_PROVEEDORES C WHERE C.COD_PROVEEDOR = P.COD_PROVEEDOR) N,
        (SELECT MAX(C.FECHA) FROM COMPROBANTES_PROVEEDORES C WHERE C.COD_PROVEEDOR = P.COD_PROVEEDOR)
      FROM PROVEEDORES P
      WHERE (P.FECHA_INHABILITACION IS NULL OR P.FECHA_INHABILITACION > CURRENT_DATE)
        AND (P.COD_PROVEEDOR = :P_COD_PROVEEDOR
             OR (:P_COD_PROVEEDOR IS NULL AND (P.RAZON_SOCIAL CONTAINING :P_TEXTO OR P.NOMBRE_COMERCIAL CONTAINING :P_TEXTO
                 OR CAST(P.CODIGO AS VARCHAR(20)) = TRIM(:P_TEXTO) OR P.CUIT = TRIM(:P_TEXTO))))
      ORDER BY 5 DESC
      INTO :COD_PROVEEDOR, :RAZON_SOCIAL, :NOMBRE_COMERCIAL, :CUIT, :CANT_COMPROBANTES, :ULTIMA_FECHA
  DO SUSPEND;
END
-- Corregido al aplicar (2026-10-25): PROVEEDORES.CODIGO es INTEGER (comparado con el texto daba error de
-- conversión) y CUIT es VARCHAR(30).

-- 05  (devuelve solo el primer nivel con resultados)
CREATE OR ALTER PROCEDURE PROC_LIST_ARTICULOS_FC_AG (P_COD_PROVEEDOR INTEGER, P_TEXTO VARCHAR(100))
RETURNS (RESULTADO SMALLINT, MENSAJE_ERROR VARCHAR(500), COD_ARTICULO VARCHAR(50), DESCRIPCION VARCHAR(100),
         CONDICION_IMPOSITIVA VARCHAR(50), ORIGEN VARCHAR(20))
AS
DECLARE VARIABLE V_HAY SMALLINT = 0;
BEGIN
  RESULTADO = 1;
  FOR SELECT FIRST 10 A.COD_ARTICULO, A.DESCRIPCION, A.CONDICION_IMPUESTO_VENTA FROM PLANTILLAS_PROV_ARTICULOS PL
      JOIN ARTICULOS A ON A.COD_ARTICULO = PL.COD_ARTICULO
      WHERE PL.COD_PROVEEDOR = :P_COD_PROVEEDOR AND (A.DESCRIPCION CONTAINING :P_TEXTO OR A.COD_ARTICULO = :P_TEXTO)
      INTO :COD_ARTICULO, :DESCRIPCION, :CONDICION_IMPOSITIVA
  DO BEGIN ORIGEN = 'plantilla_proveedor'; V_HAY = 1; SUSPEND; END
  IF (:V_HAY = 1) THEN EXIT;

  FOR SELECT FIRST 10 DISTINCT A.COD_ARTICULO, A.DESCRIPCION, A.CONDICION_IMPUESTO_VENTA FROM DET_COMPROBANTES_PROVEEDORES D
      JOIN COMPROBANTES_PROVEEDORES C ON C.COD_COMPROBANTE_PROVEEDOR = D.COD_COMPROBANTE_PROVEEDOR
      JOIN ARTICULOS A ON A.COD_ARTICULO = D.COD_ARTICULO
      WHERE C.COD_PROVEEDOR = :P_COD_PROVEEDOR AND (A.DESCRIPCION CONTAINING :P_TEXTO OR A.COD_ARTICULO = :P_TEXTO)
      INTO :COD_ARTICULO, :DESCRIPCION, :CONDICION_IMPOSITIVA
  DO BEGIN ORIGEN = 'historial_proveedor'; V_HAY = 1; SUSPEND; END
  IF (:V_HAY = 1) THEN EXIT;

  FOR SELECT FIRST 10 A.COD_ARTICULO, A.DESCRIPCION, A.CONDICION_IMPUESTO_VENTA FROM ARTICULOS A
      WHERE A.FECHA_BAJA IS NULL AND (A.DESCRIPCION CONTAINING :P_TEXTO OR A.COD_ARTICULO = :P_TEXTO)
      INTO :COD_ARTICULO, :DESCRIPCION, :CONDICION_IMPOSITIVA
  DO BEGIN ORIGEN = 'catalogo'; SUSPEND; END
END
-- A CONFIRMAR: si el catálogo debe filtrar además por ARTICULOS.BIEN_COMPRAS o por subgrupo de compras.

-- 06
CREATE OR ALTER PROCEDURE PROC_GET_CALC_LINEA_FC_AG (P_COD_ARTICULO VARCHAR(50), P_MONTO NUMERIC(18,3),
  P_COD_PROVEEDOR INTEGER, P_FECHA DATE)
RETURNS (RESULTADO SMALLINT, MENSAJE_ERROR VARCHAR(500), NETO NUMERIC(18,3), NO_GRAVADO NUMERIC(18,3),
         EXENTO NUMERIC(18,3), IVA NUMERIC(18,3), IMPUESTO NUMERIC(18,3), PERCEPCIONES NUMERIC(18,3),
         PRECIO_UNITARIO NUMERIC(18,3))
AS
BEGIN
  IF (:P_MONTO IS NULL OR :P_MONTO <= 0) THEN BEGIN RESULTADO = 0; MENSAJE_ERROR = 'El monto debe ser mayor a 0'; SUSPEND; EXIT; END
  IF (NOT EXISTS (SELECT 1 FROM ARTICULOS WHERE COD_ARTICULO = :P_COD_ARTICULO)) THEN
  BEGIN RESULTADO = 0; MENSAJE_ERROR = 'No existe el artículo ' || :P_COD_ARTICULO; SUSPEND; EXIT; END
  SELECT NETO_TOTAL, NO_GRAVADO, EXENTO, IVA, IMPUESTO, COALESCE(PERCEP_IVA, 0) + COALESCE(PERCEP_IMPUESTO, 0), PRECIO_UNITARIO
  FROM JKMT_TOTAL_IMPORTE_ART_PROV(:P_COD_ARTICULO, :P_MONTO, :P_COD_PROVEEDOR, :P_FECHA)
  INTO :NETO, :NO_GRAVADO, :EXENTO, :IVA, :IMPUESTO, :PERCEPCIONES, :PRECIO_UNITARIO;
  RESULTADO = 1; SUSPEND;
END

-- 03 y 07: públicos que exponen 01 y 02 con RESULTADO = 1 por fila
--   (07 recibe los mismos parámetros que 02; 03 devuelve RESULTADO = 0 con 'NO_AUTORIZADO: ...' si 01 no da perfiles)

-- 08
CREATE OR ALTER PROCEDURE PROC_INS_FAC_PROV_AG (P_COD_USUARIO INTEGER, P_COD_PERFIL INTEGER, P_COD_PROVEEDOR INTEGER,
  P_COD_TIPO_COMPROBANTE INTEGER, P_NRO_COMPROBANTE VARCHAR(15), P_FECHA DATE, P_FECHA_RECEPCION DATE,
  P_FECHA_CONTABLE DATE, P_FECHA_IVA DATE, P_COD_SUCURSAL INTEGER, P_COD_CENTRO_COSTO INTEGER,
  P_COD_CONDICION_COMPRA INTEGER, P_COD_MONEDA INTEGER, P_CONCEPTO VARCHAR(50))
RETURNS (RESULTADO SMALLINT, MENSAJE_ERROR VARCHAR(500), COD_COMPROBANTE_PROVEEDOR INTEGER)
AS
DECLARE VARIABLE V_COD VARCHAR(40); DECLARE VARIABLE V_MSJ VARCHAR(500); DECLARE VARIABLE V_USU_CAJA INTEGER;
DECLARE VARIABLE V_CAT_IVA VARCHAR(24); DECLARE VARIABLE V_COTIZ NUMERIC(18,3); DECLARE VARIABLE V_MODALIDAD VARCHAR(17);
DECLARE VARIABLE V_CANT INTEGER; DECLARE VARIABLE V_R SMALLINT; DECLARE VARIABLE V_E VARCHAR(500);
BEGIN
  RESULTADO = 0;
  -- Pertenencia al perfil: cada código debe estar en PRV_LIST_PERFIL_OPC_AG(P_COD_USUARIO, P_COD_PERFIL) para su campo
  IF (NOT EXISTS (SELECT 1 FROM PRV_LIST_PERFIL_OPC_AG(:P_COD_USUARIO, NULL) WHERE CAMPO = 'perfil' AND CODIGO = :P_COD_PERFIL)) THEN
  BEGIN MENSAJE_ERROR = 'NO_AUTORIZADO: el perfil no está asignado al usuario'; SUSPEND; EXIT; END
  IF (NOT EXISTS (SELECT 1 FROM PRV_LIST_PERFIL_OPC_AG(:P_COD_USUARIO, :P_COD_PERFIL) WHERE CAMPO = 'tipoComprobante' AND CODIGO = :P_COD_TIPO_COMPROBANTE)) THEN
  BEGIN MENSAJE_ERROR = 'El tipo de comprobante no está en el perfil'; SUSPEND; EXIT; END
  -- ... mismo control para sucursal, centroCosto, condicionCompra y moneda ...

  FOR SELECT CODIGO, MENSAJE FROM PRV_VAL_FAC_PROV_AG(:P_COD_PROVEEDOR, :P_COD_TIPO_COMPROBANTE, :P_NRO_COMPROBANTE,
      :P_FECHA, :P_FECHA_CONTABLE, :P_FECHA_IVA, :P_COD_CONDICION_COMPRA) INTO :V_COD, :V_MSJ
  DO BEGIN MENSAJE_ERROR = :V_COD || ': ' || :V_MSJ; SUSPEND; EXIT; END

  SELECT COALESCE(U.COD_USUARIO_CAJA, U.COD_USUARIO) FROM USUARIOS U WHERE U.COD_USUARIO = :P_COD_USUARIO INTO :V_USU_CAJA;
  SELECT CI.CATEGORIA_IVA FROM PROVEEDORES P, PROC_GET_CATEGORIAS_IVA_X_COD(P.COD_CAT_IVA) CI
  WHERE P.COD_PROVEEDOR = :P_COD_PROVEEDOR INTO :V_CAT_IVA;
  SELECT COTIZACION FROM DATOS_MONEDA(:P_COD_MONEDA, :P_FECHA) INTO :V_COTIZ;
  SELECT MODALIDAD_PAGO FROM CONDICIONES_COMPRAS WHERE COD_CONDICION_COMPRA = :P_COD_CONDICION_COMPRA INTO :V_MODALIDAD;

  -- Mismos parámetros que insSemiComprteProv del formulario; importes en 0, los recalcula PROC_INSERT_SEMI_DET_PROV_ALI
  SELECT COD_COMPROBANTE_PROVEEDOR, CANTIDAD FROM PROC_INSERTAR_SEMI_CTE_PROV(
    :P_COD_PROVEEDOR, -1, :P_NRO_COMPROBANTE, :P_COD_TIPO_COMPROBANTE, NULL, :P_COD_USUARIO, :V_USU_CAJA,
    NULL, NULL, NULL, :P_COD_CONDICION_COMPRA, :P_FECHA, :P_FECHA_CONTABLE, NULL, :V_CAT_IVA, NULL,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, SUBSTRING(:P_NRO_COMPROBANTE FROM 1 FOR 1), :P_FECHA_IVA, :P_COD_MONEDA,
    :V_MODALIDAD, :V_COTIZ, NULL, :P_COD_SUCURSAL, :P_FECHA_RECEPCION, :P_COD_CENTRO_COSTO, NULL, NULL, NULL, NULL)
  INTO :COD_COMPROBANTE_PROVEEDOR, :V_CANT;

  -- CONCEPTO no lo recibe PROC_INSERTAR_SEMI_CTE_PROV: se setea como hace grabarFacturaProveedor()
  SELECT RESULTADO, ERROR FROM PROC_SET_SEMI_PROV_UPD_JK3(:COD_COMPROBANTE_PROVEEDOR, :P_NRO_COMPROBANTE, NULL,
    :P_COD_CONDICION_COMPRA, SUBSTRING(:P_NRO_COMPROBANTE FROM 1 FOR 1), :P_FECHA, :P_FECHA_CONTABLE, :P_FECHA_IVA, 0,
    NULL, :P_CONCEPTO, :P_COD_MONEDA, :V_COTIZ, NULL, NULL, NULL, NULL, NULL, NULL, :P_COD_CENTRO_COSTO,
    :P_COD_SUCURSAL, :P_FECHA_RECEPCION, :P_COD_TIPO_COMPROBANTE, NULL, NULL)
  INTO :V_R, :V_E;

  RESULTADO = 1; SUSPEND;
END
-- Verificado contra CREAR (2026-10-25): PROC_SET_SEMI_PROV_UPD_JK3 es un UPDATE que siempre devuelve RESULTADO = 1 y
-- PROC_INSERTAR_SEMI_CTE_PROV nunca asigna CANTIDAD, así que no se controlan. Cantidad y orden de parámetros coinciden (41 y 25).

-- 09
CREATE OR ALTER PROCEDURE PROC_INS_DET_FAC_PROV_AG (P_COD_COMPROBANTE_PROVEEDOR INTEGER, P_ORDEN INTEGER,
  P_COD_ARTICULO VARCHAR(50), P_MONTO NUMERIC(18,3), P_COD_CENTRO_COSTO INTEGER)
RETURNS (RESULTADO SMALLINT, MENSAJE_ERROR VARCHAR(500))
AS
DECLARE VARIABLE V_PROV INTEGER; DECLARE VARIABLE V_FECHA DATE; DECLARE VARIABLE V_DESC VARCHAR(100);
DECLARE VARIABLE V_NETO NUMERIC(18,3); DECLARE VARIABLE V_NG NUMERIC(18,3); DECLARE VARIABLE V_EX NUMERIC(18,3);
DECLARE VARIABLE V_IVA NUMERIC(18,3); DECLARE VARIABLE V_IMP NUMERIC(18,3); DECLARE VARIABLE V_PU NUMERIC(18,3);
DECLARE VARIABLE V_ERR INTEGER;
BEGIN
  RESULTADO = 0;
  SELECT COD_PROVEEDOR, FECHA FROM SEMI_COMPROBANTES_PROVEEDORES WHERE COD_COMPROBANTE_PROVEEDOR = :P_COD_COMPROBANTE_PROVEEDOR
  INTO :V_PROV, :V_FECHA;
  SELECT DESCRIPCION FROM ARTICULOS WHERE COD_ARTICULO = :P_COD_ARTICULO INTO :V_DESC;
  IF (:V_DESC IS NULL) THEN BEGIN MENSAJE_ERROR = 'No existe el artículo ' || :P_COD_ARTICULO; SUSPEND; EXIT; END
  IF (:P_MONTO IS NULL OR :P_MONTO <= 0) THEN BEGIN MENSAJE_ERROR = 'El monto debe ser mayor a 0'; SUSPEND; EXIT; END

  SELECT NETO_TOTAL, NO_GRAVADO, EXENTO, IVA, IMPUESTO, PRECIO_UNITARIO
  FROM JKMT_TOTAL_IMPORTE_ART_PROV(:P_COD_ARTICULO, :P_MONTO, :V_PROV, :V_FECHA)
  INTO :V_NETO, :V_NG, :V_EX, :V_IVA, :V_IMP, :V_PU;

  SELECT COD_ERROR FROM PROC_GRA_SEM_DET_CTE_PROV_JK3(:P_COD_COMPROBANTE_PROVEEDOR, :P_ORDEN, :P_COD_ARTICULO, :V_DESC, 1,
    :V_PU, :V_IVA, :V_IMP, :V_NETO, :V_NG, :V_EX, NULL, NULL, NULL, :P_COD_CENTRO_COSTO, NULL)
  INTO :V_ERR;
  IF (:V_ERR IS NOT NULL) THEN BEGIN MENSAJE_ERROR = 'No se pudo grabar la línea ' || :P_ORDEN; SUSPEND; EXIT; END
  RESULTADO = 1; SUSPEND;
END

-- 10
CREATE OR ALTER PROCEDURE PROC_INS_FIN_FAC_PROV_AG (P_COD_COMPROBANTE_PROVEEDOR INTEGER, P_COD_USUARIO INTEGER)
RETURNS (RESULTADO SMALLINT, MENSAJE_ERROR VARCHAR(500), COD_COMPROBANTE_PROVEEDOR INTEGER, NRO_COMPROBANTE VARCHAR(15),
         CODIGO_COMP NUMERIC(13,0), COD_PROVEEDOR INTEGER, RAZON_SOCIAL VARCHAR(100), FECHA DATE, TOTAL NUMERIC(18,3),
         CUOTA INTEGER, FECHA_VENCIMIENTO DATE, MONTO_CUOTA NUMERIC(18,3))
AS
DECLARE VARIABLE V_R SMALLINT; DECLARE VARIABLE V_E VARCHAR(500); DECLARE VARIABLE V_COND INTEGER;
DECLARE VARIABLE V_RECEP DATE; DECLARE VARIABLE V_MONEDA INTEGER; DECLARE VARIABLE V_CRED INTEGER;
DECLARE VARIABLE V_INT_MORA NUMERIC(18,3); DECLARE VARIABLE V_T_INT CHAR(3); DECLARE VARIABLE V_TIPO_INT VARCHAR(9);
DECLARE VARIABLE V_T_PER CHAR(3); DECLARE VARIABLE V_PAGO INTEGER; DECLARE VARIABLE V_HONOR NUMERIC(13,0);
DECLARE VARIABLE V_ERR INTEGER;
BEGIN
  RESULTADO = 0;
  COD_COMPROBANTE_PROVEEDOR = :P_COD_COMPROBANTE_PROVEEDOR;

  SELECT ERROR, RESULTADO FROM PROC_INSERT_SEMI_DET_PROV_ALI(:P_COD_COMPROBANTE_PROVEEDOR, 1) INTO :V_E, :V_R;
  IF (:V_R <> 1) THEN BEGIN MENSAJE_ERROR = :V_E; SUSPEND; EXIT; END

  SELECT S.COD_CONDICION_COMPRA, S.FECHA_RECEPCION_FAC, S.COD_MONEDA, S.TOTAL, S.NRO_COMPROBANTE, S.COD_PROVEEDOR
  FROM SEMI_COMPROBANTES_PROVEEDORES S WHERE S.COD_COMPROBANTE_PROVEEDOR = :P_COD_COMPROBANTE_PROVEEDOR
  INTO :V_COND, :V_RECEP, :V_MONEDA, :TOTAL, :NRO_COMPROBANTE, :COD_PROVEEDOR;

  SELECT INTERES_MORA, TIEMPO_INTERES_MORA, TIPO_INTERES_MORA, TIEMPO_PERIODO_INTERES
  FROM PROC_GET_COND_COMPRA_X_COD(:V_COND) INTO :V_INT_MORA, :V_T_INT, :V_TIPO_INT, :V_T_PER;

  SELECT RESULTADO, COD_CREDITO_PROVEEDOR FROM PROC_INSERT_SEMI_CREDITO_PROV(:COD_PROVEEDOR, :P_COD_COMPROBANTE_PROVEEDOR,
    :P_COD_USUARIO, :V_MONEDA, 'Factura-' || TRIM(:NRO_COMPROBANTE), :V_INT_MORA, :V_T_INT, :V_TIPO_INT, :V_T_PER,
    :V_RECEP, 0, 0, 0, NULL, 0, NULL, :TOTAL)
  INTO :V_R, :V_CRED;
  IF (:V_R <> 1) THEN BEGIN MENSAJE_ERROR = 'No se pudo crear el crédito'; SUSPEND; EXIT; END

  FOR SELECT CUOTA, PAGO, FECHA_VENCIMIENTO, MONTO_CUOTA FROM LIST_FINANCIAR_CREDITO_PROV(:V_COND, :TOTAL, :V_RECEP)
      INTO :CUOTA, :V_PAGO, :FECHA_VENCIMIENTO, :MONTO_CUOTA
  DO
    SELECT RESULTADO FROM PROC_INSERT_SEMI_CUOTAS_PROV(:V_CRED, :CUOTA, :V_PAGO, NULL, NULL, :P_COD_COMPROBANTE_PROVEEDOR,
      :V_CRED, NULL, :FECHA_VENCIMIENTO, NULL, :MONTO_CUOTA, 0, 0, 0, 0, 0, '') INTO :V_R;

  SELECT RESULTADO, MENSAJE_ERROR, CODIGO_COMP, CODIGO_HONORARIOS
  FROM PROC_GUARDAR_SEMI_COMPPROVEEDOR(:P_COD_COMPROBANTE_PROVEEDOR) INTO :V_R, :V_E, :CODIGO_COMP, :V_HONOR;
  IF (:V_R <> 1) THEN BEGIN MENSAJE_ERROR = COALESCE(:V_E, 'No se pudo grabar el comprobante'); SUSPEND; EXIT; END
  CODIGO_COMP = COALESCE(:CODIGO_COMP, :V_HONOR);

  SELECT COD_ERROR FROM PROC_INGRESAR_STOCK_CBTE_PROV(:P_COD_COMPROBANTE_PROVEEDOR) INTO :V_ERR;  -- no-op si el tipo no actualiza stock
  SELECT RESULTADO FROM PROC_BORRAR_SEMI_Y_DET_CTE_PROV(:P_COD_COMPROBANTE_PROVEEDOR) INTO :V_R;

  SELECT C.FECHA, C.TOTAL, P.RAZON_SOCIAL FROM COMPROBANTES_PROVEEDORES C JOIN PROVEEDORES P ON P.COD_PROVEEDOR = C.COD_PROVEEDOR
  WHERE C.COD_COMPROBANTE_PROVEEDOR = :P_COD_COMPROBANTE_PROVEEDOR INTO :FECHA, :TOTAL, :RAZON_SOCIAL;

  -- Una fila por cuota real (con lo que quedó grabado)
  RESULTADO = 1; MENSAJE_ERROR = NULL;
  FOR SELECT Q.CUOTA, Q.FECHA_VENCIMIENTO, Q.MONTO_CUOTA FROM CUOTAS_PROVEEDORES Q
      WHERE Q.COD_CREDITO_PROVEEDOR = :V_CRED ORDER BY Q.CUOTA, Q.PAGO
      INTO :CUOTA, :FECHA_VENCIMIENTO, :MONTO_CUOTA
  DO SUSPEND;
END
-- Verificado contra CREAR (2026-10-25): INTERES_MORA es NUMERIC(9,3), TIEMPO_* CHAR(3) y TIPO VARCHAR(9); ES_NETO de
-- PROC_INSERT_SEMI_DET_PROV_ALI no se usa y ese SP devuelve RESULTADO = 1 al terminar; PROC_GUARDAR_SEMI_COMPPROVEEDOR
-- devuelve 1 (-1 solo con retenciones) y no borra las SEMI (lo hace PROC_BORRAR_SEMI_Y_DET_CTE_PROV);
-- COD_ERROR de PROC_GRA_SEM_DET_CTE_PROV_JK3 es NULL si inserta bien. Los resultados de los SP de JK3 se comparan con
-- IS DISTINCT FROM 1 para que un NULL también sea error.

-- 11  (agregado en la implementación: da el vencimiento de preparar; aprobado por el usuario el 2026-10-25)
CREATE OR ALTER PROCEDURE PROC_LIST_CUOTAS_FC_AG (P_COD_CONDICION_COMPRA INTEGER, P_TOTAL NUMERIC(18,3),
  P_FECHA_RECEPCION DATE)
RETURNS (RESULTADO SMALLINT, MENSAJE_ERROR VARCHAR(500), CUOTA INTEGER, FECHA_VENCIMIENTO DATE, MONTO_CUOTA NUMERIC(18,3))
-- Valida que exista la condición y que haya total y fecha; después una fila por cuota de
-- LIST_FINANCIAR_CREDITO_PROV(condición, total, fecha de recepción), el mismo cálculo que usa 10 al grabar.
-- LIST_FINANCIAR_CREDITO_PROV solo lee DET_CONDICIONES_COMPRAS y llama a INCREMENTAR_FECHA, que no escribe.
```

### D14. Tests
- **Unitarios, sin base y con `accesoSimulado`**:
  - normalización del número;
  - la regla del perfil;
  - cruce letra → tipo;
  - armado de `resueltos`, `pendientes`, `bloqueos` y `paraRegistrar`;
  - sugerencia de proveedor;
  - que `registrar` llame a los tres SP en una sola transacción de escritura y en orden;
  - mapeo de `COMPROBANTE_DUPLICADO` y `PERIODO_CERRADO`.
- **Contrato**: dos tools, annotations según los specs, descripciones de cuatro partes, enum de códigos con los seis.
- **Paquete Firebird**: rollback ante error en el segundo SP y error propagado si falla el commit, con `node-firebird` simulado.
- **Integración** (se saltan sin base): `preparar` contra CREAR con los dos pedidos de ejemplo; `registrar` de una factura de prueba en la copia local, verificando comprobante, detalle, crédito, cuotas y SEMI vacías. Como `registrar` confirma, el test usa un número único por corrida y queda documentado que deja datos en la copia.

## Risks / Trade-offs

- **[`PROC_INSERT_SEMI_DET_PROV_ALI` ejecuta `SET GENERATOR GEN_CONTADOR` por `EXECUTE STATEMENT`]** Es un cambio no transaccional de un generador compartido. Con JK3 cargando a la vez, puede pisar el orden de alícuotas de otro comprobante. → Es el mismo riesgo que hoy entre dos operadores de JK3; para el prototipo se acepta y se anota. No se cambia el SP de JK3.
- **[Los generadores no vuelven atrás con el rollback]** Un registro fallido deja huecos en `GEN_COMPROBANTES_PROVEEDORES` y `GEN_CREDITOS_PROVEEDORES`. → Inocuo; ya pasa en JK3.
- **[`CODIGO_COMP` se calcula con `MAX(...)+1` en un trigger]** Dos grabados concurrentes del mismo mes pueden chocar. → Mismo comportamiento que JK3; el error se devuelve como `ERROR_INTERNO` y se reintenta.
- **[Duplicados con formatos mezclados]** El historial tiene números sin guiones (`A04264…`) además de `A-4264-…`, y `PROC_CTRL_NRO_COMPPROV` compara exacto. → Limitación aceptada para el prototipo; un change posterior normaliza la comparación.
- **[El total grabado puede diferir del monto dicho]** Las percepciones las agrega el cálculo de alícuotas y el redondeo es por línea. → `preparar` muestra los importes calculados, `registrar` devuelve el total grabado, y el agente lo informa.
- **[Un agente podría registrar sin confirmación del usuario]** → Annotations de escritura, "Qué NO hacer" explícito y `paraRegistrar` solo cuando el borrador está completo. Que el cliente pida aprobación de la tool depende de su configuración; queda fuera del MCP.
- **[`PLANTILLAS_PROV_ARTICULOS` aprende de cada registro]** Una factura mal cargada influye en las sugerencias siguientes. → Es el comportamiento de JK3; las pruebas se hacen en la copia local.
- **[Moneda sin default en el perfil de CREAR]** Cada factura pregunta la moneda. → Se resuelve marcando `POR_DEFECTO = 1` en el perfil, un cambio de configuración que decide el usuario. No forma parte del change.
- **[Filtro por usuario de caja]** `PROC_GET_TIPO_COMP_USU_CAJA_PF` cruza el perfil con `COD_USUARIO_CAJA` y nuestro SP con `COD_USUARIO`. → Para los usuarios 7 y 28 de CREAR da lo mismo **A CONFIRMAR**; si difiere, se alinea con el formulario.

## Migration Plan

1. Implementar el paquete, la app y los tests con la base simulada.
2. Con confirmación explícita, crear los SP 01–11 en `CREAR_JK3_20261016` (copia local) en el orden de D13 y versionarlos en `apps/comprobantes-prov-mcp/db/procedimientos/`.
3. Probar los pedidos de ejemplo de punta a punta con el Inspector y con Claude Desktop.

Para volver atrás, `DROP PROCEDURE` de los once SP en orden inverso. Las facturas de prueba grabadas quedan en la copia local y se pueden anular desde JK3. No hay migración de datos.

## Open Questions

- El aislamiento y la espera de la transacción de escritura (D4) se ajustan al probar contra la base. No cambian el diseño.
- Si conviene exponer `observaciones` además de `concepto`. Se puede sumar sin cambiar el flujo.
