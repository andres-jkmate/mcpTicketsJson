# MCP de fondos

Servidor MCP de JKMate v2 para que un agente consulte movimientos de fondos. Corre local por stdio: Claude Desktop lo lanza como proceso hijo. Se creó a partir de [`apps/_template-mcp`](../_template-mcp/README.md).

En Seq y en el handshake MCP se identifica como `mcp-fondos`.

## Estado

Publica **dos tools de consulta**, las dos de solo lectura (no graban nada en la base):

| Tool | Qué hace |
|---|---|
| `buscar_movimientos_fondos` | Lista resumida y paginada de movimientos, por número (como lo dice el usuario: `X1 9463`), período (`hoy`, `ayer`, `esta_semana`, `este_mes`, `mes_pasado`) o fechas, importe aproximado (±5 %), clase (`pago`, `cobro`, `deposito`, `varios`, `reversion`, `otros`) y tercero. Sin número ni fechas busca el último mes. |
| `ver_movimiento_fondo` | Detalle de un movimiento por su id: cabecera, tercero, debe y haber, resumen de qué cuentas de fondos entraron o salieron, cheques y movimientos relacionados. |

Códigos de error: los cuatro base (`PARAMETRO_INVALIDO`, `NO_AUTORIZADO`, `BASE_NO_DISPONIBLE` y `ERROR_INTERNO`) y `MOVIMIENTO_NO_ENCONTRADO`. Las tools usan los SP `_AG` versionados en [`db/procedimientos/`](db/README.md), que tienen que estar aplicados en la base.

Prompts de ejemplo en Claude Desktop:

- "Quiero ver el movimiento X1 9463" → busca por número y, si hay uno solo, muestra el detalle.
- "¿Qué pagos hice ayer?" → busca con `periodo: "ayer"` y `clase: "pago"`.
- "Estoy buscando un movimiento de 500000 que hice este mes" → busca con `periodo: "este_mes"` e `importe: 500000`, ordenado por cercanía al importe.

"Ayer", "este mes", etc. los resuelve el servidor con la fecha de la máquina donde corre.

## Configuración

Todos los comandos se corren en la raíz del repo.

```powershell
copy apps\fondos-mcp\.env.example apps\fondos-mcp\.env
```

Completá en `apps/fondos-mcp/.env`:

| Variable | Obligatoria | Qué es |
|---|---|---|
| `MCP_COD_USUARIO` | Sí | `COD_USUARIO` de JKMate de quien usa el servidor. Es la identidad de todas las invocaciones. |
| `FIREBIRD_DATABASE` | Sí | Ruta o alias de la base. |
| `FIREBIRD_HOST`, `FIREBIRD_PORT`, `FIREBIRD_USER`, `FIREBIRD_PASSWORD`, `FIREBIRD_POOL_MAX` | No | Conexión a Firebird. Por defecto `127.0.0.1`, `3050`, `SYSDBA`, sin password y 5 conexiones. |
| `LOG_LEVEL`, `SEQ_URL`, `SEQ_API_KEY` | No | Log a stderr y, si hay `SEQ_URL`, también a Seq. |

Si falta una variable obligatoria o alguna es inválida, el servidor no arranca y dice en stderr cuál falló. El `.env` lo leen `npm run dev` y `npm start`; Claude Desktop no lo lee.

## Verificar

```bash
npm run typecheck -w apps/fondos-mcp
npm run lint -w apps/fondos-mcp
npm test -w apps/fondos-mcp       # no necesita base
npm run build -w apps/fondos-mcp
npm run dev -w apps/fondos-mcp    # corre src/ con tsx y queda esperando mensajes MCP por stdin
```

Con `npm run dev`, stderr muestra `mcp-fondos listo (stdio)` y stdout queda vacío hasta recibir un mensaje. Se corta con Ctrl+C.

Para ver la lista de tools, después de `npm run build` y con el `.env` de la sección anterior:

```bash
npx @modelcontextprotocol/inspector --cli node --env-file=apps/fondos-mcp/.env apps/fondos-mcp/dist/index.js --method tools/list
```

Responde con `buscar_movimientos_fondos` y `ver_movimiento_fondo`. Sin `--cli --method tools/list` abre la interfaz web, donde el servidor aparece como `mcp-fondos` y se pueden probar las tools contra la base del `.env`.

## Alta en Claude Desktop

Con las tools de consulta ya le sirve al agente para encontrar y explicar movimientos de fondos. Las tools no escriben en la base.

Antes, `npm run build` en la raíz, y los SP de [`db/procedimientos/`](db/README.md) aplicados en la base configurada. En `%APPDATA%\Claude\claude_desktop_config.json`, dentro de `mcpServers` y sin borrar los servidores que ya estén:

```json
{
  "mcpServers": {
    "fondos": {
      "command": "node",
      "args": ["D:\\Desarrollo\\_Repos\\mcpTicketsJson\\apps\\fondos-mcp\\dist\\index.js"],
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

Reiniciá Claude Desktop por completo. Si el servidor no arranca, el motivo queda en `%APPDATA%\Claude\logs\mcp-server-fondos.log`.
