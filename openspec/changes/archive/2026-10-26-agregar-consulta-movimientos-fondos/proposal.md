# Proposal

## Why

El operador quiere encontrar y entender un movimiento de fondos hablándole a Claude Desktop ("quiero ver el movimiento X1 9463", "¿qué pagos hice ayer?", "estoy buscando un movimiento de 500000 que hice este mes"). Hoy eso exige abrir el formulario JK3 `ver_movimientos_fondos`, que solo trabaja con el código interno del movimiento y arma la vista con siete llamadas separadas. `fondos-mcp` ya existe sin tools; este change le agrega las dos de consulta, con un JSON pensado para que el modelo responda con pocas llamadas y pocos tokens.

## What Changes

- **Dos tools de solo lectura en `fondos-mcp`:**
  - `buscar_movimientos_fondos`: lista resumida y paginada de movimientos, filtrable por número de comprobante (como lo dice el usuario: `X1 9463`), rango de fechas, importe aproximado, clase (pago, cobro, depósito, varios, reversión) y tercero.
  - `ver_movimiento_fondo`: el detalle de un movimiento por su id: cabecera, tercero, estado, renglones del debe y del haber, un resumen de qué cuentas de fondos entraron o salieron, cheques y movimientos relacionados.
- **Reglas de búsqueda** acordadas en la exploración y verificadas con los datos de `CREAR_JK3_20261016`:
  - el número se normaliza a `L-PPPP-NNNNNNNN`; si falta letra o punto de venta se busca por el número solo; como el número se repite entre talonarios, la búsqueda devuelve una lista y el detalle se pide por id;
  - "pagos", "cobros", etc. salen de `TIPOS_COMPROBANTES.TIPO_COMPROBANTE`, no se infieren;
  - "que hice" no filtra por usuario: solo cuenta la fecha;
  - sin fechas se buscan los movimientos del último mes; si viene número, no se aplica rango por defecto;
  - períodos relativos (`hoy`, `ayer`, `esta_semana`, `este_mes`, `mes_pasado`) que resuelve el servidor, porque el modelo no siempre sabe qué día es;
  - un importe se toma como aproximado (±5 %) y los resultados se ordenan por cercanía, salvo que se pida exacto;
  - el estado se deriva de `ANULADO` y de `COD_MOVIMIENTO_REVERTIDO`, que el movimiento original guarda apuntando a su reversión.
- **SP nuevos `_AG`** que devuelven ya la forma que necesitan las tools y reusan los de JK3 (`PROC_GET_MOV_FONDOS_X_CODIGO`, `PROC_GET_M_FONDO_C_DEBE`, `PROC_GET_M_FONDO_C_HABER`, `PROC_GET_CHEQUES_X_MOV_FON`); propuestos en `design.md`, se crean solo con confirmación.
- **Código de error del dominio** `MOVIMIENTO_NO_ENCONTRADO`.

Fuera de alcance: registrar o revertir movimientos, cupones de tarjeta (el formulario llama a `PROC_GET_CUPONES_X_MOV`, que no existe en la base), escaneos adjuntos, asiento contable detallado, filtros por permisos de talonario o caja del usuario, y crear índices nuevos.

## Capabilities

### New Capabilities
- `consulta-movimientos-fondos`: cómo un agente busca movimientos de fondos a partir de un pedido en lenguaje natural y muestra el detalle de uno: criterios de búsqueda, normalización del número, rangos por defecto, importe aproximado, clase, estado y forma del detalle.

### Modified Capabilities
- `fondos-mcp`: deja de exigir `tools/list` vacío (publica las dos tools) y pasa a declarar `MOVIMIENTO_NO_ENCONTRADO`.

## Impact

- **Código**: `apps/fondos-mcp` (tools, normalización del número, errores, tests, README, `db/procedimientos/`). No se tocan `packages/`, las otras apps ni la plantilla.
- **Base de datos** (`CREAR_JK3_20261016`): cuatro SP nuevos `_AG`, solo de lectura, aplicados con confirmación explícita. Ningún DDL sobre tablas.
- **Rendimiento**: la búsqueda por número sin talonario recorre `MOVIMIENTOS_FONDOS` (no hay índice que empiece por `NRO_COMPROBANTE`): ~85 ms con 63 mil filas en la copia local. El resto de las búsquedas usa `IDX_MOVIMIENTOS_FONDOS_FECHA`.
- **Dependencias**: ninguna nueva.
- **Orden de archivo**: el delta de `fondos-mcp` modifica la spec que crea `crear-fondos-mcp`, así que ese change se archiva antes que este.
- **Claude Desktop**: el README pasa a documentar el alta como útil (ya hay tools) y los prompts de ejemplo.
