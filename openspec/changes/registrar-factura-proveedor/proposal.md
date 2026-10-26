# Proposal

## Why

Queremos ver cómo Claude graba en JKMate un dato complejo a partir de un pedido en lenguaje natural ("carga la factura A1 135 de Telecom de 200.000 por Internet"). La factura de proveedor sirve de caso: tiene cabecera, líneas, impuestos calculados, crédito y cuotas, y hoy JK3 la arma con una decena de llamadas desde el formulario `facturaproveedor` sobre tablas SEMI. El MCP `comprobantes-prov-mcp` ya existe sin tools; este change le agrega las dos primeras. Es un **prototipo**: la meta es validar el patrón (resolver, mostrar, confirmar y grabar en una transacción), no la exactitud contable.

## What Changes

- **Dos tools en `comprobantes-prov-mcp`:**
  - `preparar_factura_proveedor` (solo lectura): recibe un borrador con texto libre (proveedor, número como lo dice el usuario, ítems con texto y monto) y devuelve, campo por campo, el valor resuelto con su origen o la lista de opciones cuando es ambiguo, más los importes calculados por la base y los avisos. No escribe nada.
  - `registrar_factura_proveedor` (escritura): recibe el borrador ya resuelto (solo códigos), revalida todo contra la base y graba la factura en una única transacción, encadenando los mismos SP que usa JK3 y terminando en `PROC_GUARDAR_SEMI_COMPPROVEEDOR`. Si algo falla, no queda nada grabado ni restos en las tablas SEMI.
- **Reglas de resolución** tomadas del formulario y de los datos reales de `CREAR_JK3_20261016`:
  - perfil de facturación de compras del usuario y sus listas (`PERFILES_FC_COMPRA_*`): si hay una opción se usa; si hay una con `POR_DEFECTO = 1` se usa; si no, se pregunta mostrando esa lista;
  - tipo de comprobante desde la letra del número (`CODIGO_AFIP`) dentro de los tipos del perfil;
  - artículo desde la plantilla del proveedor (`PLANTILLAS_PROV_ARTICULOS`), luego su historial, luego el catálogo;
  - el monto que dice el usuario es el total con impuestos de la línea; la base separa neto, IVA y percepciones;
  - fecha y fecha de recepción: hoy, salvo que el usuario indique otra.
- **El borrador vive en la conversación**: el agente lo arma y lo completa entre turnos ("y agregá 50.000 de gastos varios"); la base no guarda borradores.
- **SP nuevos `_AG`** para resolver, calcular, validar y grabar (propuestos en `design.md`, a aplicar con confirmación).
- **Escritura en `@mcp-jkmate/firebird`**: hoy solo abre transacciones de solo lectura; se agrega una transacción de escritura que confirma o revierte todo y que no oculta un error al confirmar.
- **Códigos de error del dominio** en `comprobantes-prov-mcp`: `COMPROBANTE_DUPLICADO` y `PERIODO_CERRADO`.

Fuera de alcance (prototipo): retenciones (en Argentina no se generan al grabar la factura), condición de contado y movimiento de fondos, asiento contable, XML/PDF/adjuntos, edición manual de alícuotas, notas de crédito y débito, órdenes de compra, cotejo contra los totales del papel, Colombia/Ecuador y control de duplicados con números en formatos distintos.

## Capabilities

### New Capabilities
- `registro-factura-proveedor`: cómo un agente prepara y registra una factura de proveedor a partir de un pedido en lenguaje natural: borrador, resolución de cada dato con su origen, opciones cuando hay ambigüedad, cálculo de importes, validaciones y grabado atómico.

### Modified Capabilities
- `comprobantes-prov-mcp`: deja de exigir `tools/list` vacío (publica las dos tools) y pasa a declarar los códigos del dominio que esas tools usan.
- `plataforma-mcp`: el acceso compartido a Firebird suma una transacción de escritura, para que un MCP no la reimplemente.

## Impact

- **Código**: `apps/comprobantes-prov-mcp` (tools, errores, tests, README, `db/procedimientos/`) y `packages/firebird` (transacción de escritura). No se toca `apps/tickets-mcp` ni la plantilla.
- **Base de datos** (`CREAR_JK3_20261016`): SP nuevos `_AG`, solo con confirmación explícita antes de crearlos. Al registrar, el MCP escribe en las mismas tablas que JK3 (`SEMI_*` de forma transitoria, `COMPROBANTES_PROVEEDORES`, `DET_*`, `CREDITOS_PROVEEDORES`, `CUOTAS_PROVEEDORES`, `PLANTILLAS_PROV_ARTICULOS`) y consume generadores. Las pruebas de registro se hacen sobre esta copia local, nunca en producción.
- **Seguridad**: es la primera tool que escribe. Corre con el `MCP_COD_USUARIO` configurado, que queda como usuario de carga del comprobante; las elecciones se revalidan en el servidor contra el perfil de ese usuario.
- **Dependencias**: ninguna nueva.
- **Claude Desktop**: el README pasa a documentar el alta como útil (ya hay tools) y advierte que `registrar_factura_proveedor` escribe en la base configurada.
