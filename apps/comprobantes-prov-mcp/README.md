# MCP de comprobantes de proveedores

Servidor MCP de JKMate v2 para que un agente consulte y registre comprobantes de proveedores. Corre local por stdio: Claude Desktop lo lanza como proceso hijo. Se creó a partir de [`apps/_template-mcp`](../_template-mcp/README.md).

En Seq y en el handshake MCP se identifica como `mcp-comprobantes-prov`.

## Estado

**Prototipo** con dos tools para registrar una factura de proveedor a partir de un pedido en lenguaje natural ("carga la factura A1 135 de Telecom de 200.000 por Internet"). La meta es validar el patrón *resolver → mostrar → confirmar → grabar en una transacción*, no la exactitud contable.

| Tool | Qué hace | Escribe |
|---|---|---|
| `preparar_factura_proveedor` | Resuelve un borrador contra la base: cada dato con su origen o con opciones, importes calculados por la base, vencimiento, bloqueos y, si no falta nada, `paraRegistrar`. | No |
| `registrar_factura_proveedor` | Graba `paraRegistrar` en una sola transacción (cabecera, líneas, alícuotas, crédito, cuotas), con los mismos SP que el formulario de JK3. | **Sí** |

Códigos de error: los cuatro base más `COMPROBANTE_DUPLICADO` y `PERIODO_CERRADO`. Los SP `_AG` que usan están en [`db/procedimientos/`](db/README.md).

> **Atención:** `registrar_factura_proveedor` escribe en la base de `FIREBIRD_DATABASE` con `MCP_COD_USUARIO` como usuario de carga. Usalo solo contra una copia local (`CREAR_JK3_20261016`), nunca en producción.

### Flujo

El borrador vive en la conversación: el agente lo arma, lo reenvía completo a `preparar_factura_proveedor` en cada turno y solo llama a `registrar_factura_proveedor` con `paraRegistrar` después de que el usuario confirma.

```text
(importes ilustrativos: los reales los calcula la base)
Usuario: carga la factura A1 135 de Telecom de 200.000 por Internet
Agente:  → preparar {proveedor: "Telecom", numero: "A1 135", items: [{articulo: "Internet", monto: 200000}]}
         Hay dos Telecom: TELECOM ARGENTINA S.A (sugerido: tiene INTERNET 21% en su plantilla) o
         TELECOM PERSONAL S.A. ¿Cuál? ¿Y en qué moneda: Pesos o Dólares?
Usuario: Argentina, en pesos. Y agregá 50.000 de gastos varios
Agente:  → preparar {proveedorId: 4, numero: "A1 135", monedaId: 3, items: [Internet 200000, gastos varios 50000]}
         Factura A-0001-00000135 de TELECOM ARGENTINA S.A, 24/10/2026, tipo FACTURA DE COMPRAS A:
         INTERNET 21% 200.000 (neto 165.289,26 + IVA 34.710,74), GASTOS VARIOS 21% 50.000 (...).
         Total 250.000, vence el 03/11/2026. ¿La grabo?
Usuario: sí
Agente:  → registrar {…paraRegistrar…}
         Listo: comprobante 16330, total 250.000, una cuota al 03/11/2026.
```

### Límites del prototipo

- Solo facturas (no notas de crédito ni débito) a **cuenta corriente** y en bases de **Argentina** (`PRJ_ARGENTINA`); el resto queda como bloqueo.
- No genera retenciones, movimientos de fondos, asiento contable ni adjuntos (XML/PDF); no edita alícuotas, no usa órdenes de compra ni coteja contra los totales del papel.
- El monto de cada ítem es el total con impuestos; la base separa neto, IVA y percepciones. El total grabado puede diferir en centavos del de la vista previa: `registrar` devuelve el grabado.
- El control de duplicados compara el número exacto: no detecta una factura cargada antes con otro formato (`A04264…` contra `A-4264-…`).
- Comparte con JK3 sus riesgos de concurrencia: `PROC_INSERT_SEMI_DET_PROV_ALI` cambia `GEN_CONTADOR` fuera de la transacción y `CODIGO_COMP` sale de un `MAX()+1`. Un registro fallido deja huecos en los generadores.
- Cada factura grabada alimenta `PLANTILLAS_PROV_ARTICULOS`, que influye en las sugerencias siguientes.
- En CREAR el perfil no tiene moneda por defecto: cada factura pregunta la moneda.

## Configuración

Todos los comandos se corren en la raíz del repo.

```powershell
copy apps\comprobantes-prov-mcp\.env.example apps\comprobantes-prov-mcp\.env
```

Completá en `apps/comprobantes-prov-mcp/.env`:

| Variable | Obligatoria | Qué es |
|---|---|---|
| `MCP_COD_USUARIO` | Sí | `COD_USUARIO` de JKMate de quien usa el servidor. Es la identidad de todas las invocaciones. |
| `FIREBIRD_DATABASE` | Sí | Ruta o alias de la base. |
| `FIREBIRD_HOST`, `FIREBIRD_PORT`, `FIREBIRD_USER`, `FIREBIRD_PASSWORD`, `FIREBIRD_POOL_MAX` | No | Conexión a Firebird. Por defecto `127.0.0.1`, `3050`, `SYSDBA`, sin password y 5 conexiones. |
| `LOG_LEVEL`, `SEQ_URL`, `SEQ_API_KEY` | No | Log a stderr y, si hay `SEQ_URL`, también a Seq. |

Si falta una variable obligatoria o alguna es inválida, el servidor no arranca y dice en stderr cuál falló. El `.env` lo leen `npm run dev` y `npm start`; Claude Desktop no lo lee.

## Verificar

```bash
npm run typecheck -w apps/comprobantes-prov-mcp
npm run lint -w apps/comprobantes-prov-mcp
npm test -w apps/comprobantes-prov-mcp       # no necesita base; los de integración se saltan
npm run build -w apps/comprobantes-prov-mcp
npm run dev -w apps/comprobantes-prov-mcp    # corre src/ con tsx y queda esperando mensajes MCP por stdin
```

Con `npm run dev`, stderr muestra `mcp-comprobantes-prov listo (stdio)` y stdout queda vacío hasta recibir un mensaje. Se corta con Ctrl+C.

Con una interfaz, después de `npm run build` y con el `.env` de la sección anterior:

```bash
npx @modelcontextprotocol/inspector node --env-file=apps/comprobantes-prov-mcp/.env apps/comprobantes-prov-mcp/dist/index.js
```

El servidor aparece como `mcp-comprobantes-prov` con `preparar_factura_proveedor` y `registrar_factura_proveedor`. Con los SP aplicados, `preparar_factura_proveedor` con `{"proveedor": "Telecom", "numero": "A1 135", "items": [{"articulo": "Internet", "monto": 200000}]}` devuelve el proveedor y la moneda como pendientes.

### Integración contra la copia local

Con los SP de [`db/procedimientos/`](db/README.md) aplicados en `CREAR_JK3_20261016` y las variables `FIREBIRD_*` en el entorno, `npm test -w apps/comprobantes-prov-mcp` corre además `test/integracion/`. **El caso de registrar graba una factura de prueba** (punto de venta 9999, número único por corrida) y la deja en la copia; se puede anular desde JK3.

## Alta en Claude Desktop

Ojo: con esta configuración el agente puede **grabar facturas** en la base indicada. Apuntala a la copia local, y conviene dejar que Claude Desktop pida aprobación antes de cada llamada a `registrar_factura_proveedor`.

Antes, `npm run build` en la raíz. En `%APPDATA%\Claude\claude_desktop_config.json`, dentro de `mcpServers` y sin borrar los servidores que ya estén:

```json
{
  "mcpServers": {
    "comprobantes-prov": {
      "command": "node",
      "args": ["D:\\Desarrollo\\_Repos\\mcpTicketsJson\\apps\\comprobantes-prov-mcp\\dist\\index.js"],
      "env": {
        "MCP_COD_USUARIO": "28",
        "FIREBIRD_HOST": "127.0.0.1",
        "FIREBIRD_DATABASE": "E:\\Bases\\CREAR_JK3_20261016.fdb",
        "FIREBIRD_USER": "SYSDBA",
        "FIREBIRD_PASSWORD": "<password>"
      }
    }
  }
}
```

Reiniciá Claude Desktop por completo. Si el servidor no arranca, el motivo queda en `%APPDATA%\Claude\logs\mcp-server-comprobantes-prov.log`.
