# Plantilla de MCP

Molde para crear un MCP nuevo en este monorepo. Es un MCP mínimo que compila y pasa sus tests junto con el resto del repo (`npm test` en la raíz), así que siempre está al día con los paquetes compartidos. **No se instala ni se publica.**

Trae:

- `obtener_ejemplo`, una tool de lectura sobre un SP `_AG`. El SP `PROC_GET_EJEMPLO_AG` no existe: la tool está para mostrar la forma.
- Un test unitario de esa tool con un `AccesoDatos` simulado, sin base (`test/obtener-ejemplo.test.ts`).
- Un test de contrato que levanta el servidor en memoria, lista las tools, prueba un input inválido y uno válido y verifica que las descripciones sigan la plantilla (`test/contrato.test.ts`).
- `src/index.ts` (stdio), `src/config.ts`, `src/errores.ts`, `src/servidor.ts` y `.env.example`.

Lo común (validación del input, errores uniformes, log de cada invocación con `idCorrelacion`, servidor MCP y acceso a Firebird) viene de `@mcp-jkmate/core` y `@mcp-jkmate/firebird`. Un MCP no reimplementa ninguna de esas piezas.

## Crear un MCP nuevo

Los ejemplos usan `clientes` como nombre. Todos los comandos se corren en la raíz del repo.

### 1. Copiar la plantilla

```powershell
robocopy apps\_template-mcp apps\clientes-mcp /E /XD node_modules dist /XF .env
```

En bash: `rsync -a --exclude node_modules --exclude dist --exclude .env apps/_template-mcp/ apps/clientes-mcp/`.

### 2. Renombrar

- `package.json`: `"name": "@mcp-jkmate/clientes-mcp"` y una `description` propia.
- `src/servidor.ts`: `NOMBRE_SERVIDOR = 'mcp-clientes'`. Es el nombre que el servidor informa en el handshake y el campo `app` de cada log en Seq.
- `src/errores.ts`: reemplazá `EJEMPLO_NO_ENCONTRADO` por los códigos propios del dominio (por ejemplo `CLIENTE_NO_ENCONTRADO`), o borralo si no hace falta ninguno. Los cuatro códigos base (`PARAMETRO_INVALIDO`, `NO_AUTORIZADO`, `BASE_NO_DISPONIBLE` y `ERROR_INTERNO`) son obligatorios: si falta alguno, el servidor no compila.
- Este README: reemplazalo por el del MCP nuevo (qué tools expone, configuración y alta en Claude Desktop).

Después, `npm install` en la raíz para registrar el workspace nuevo.

### 3. Stored procedures

La forma de los datos se resuelve en la base, con SP públicos `_AG` específicos para agentes (convenciones en el hub JKMate-Knowledge, `firebird/convenciones.md`).

1. Proponé los SP en el `design.md` del change de OpenSpec. Nunca se crean directamente.
2. Una vez confirmados y aplicados, versioná sus scripts en `apps/clientes-mcp/db/procedimientos/`, uno por archivo y numerados en orden de ejecución.

### 4. Tools

Por cada tool, un archivo en `src/tools/` con la forma de `obtener-ejemplo.ts`, registrado en `src/tools/index.ts`. Borrá `obtener-ejemplo.ts` cuando ya no sirva de guía.

- Nombre en español, snake_case, verbo_sustantivo (`obtener_cliente`, `listar_clientes`).
- `inputSchema` con `additionalProperties: false` y un `entrada` de zod que valide lo mismo. Si el input no pasa la validación, el wrapper responde `PARAMETRO_INVALIDO`.
- `outputSchema` de éxito: el servidor le agrega la forma de error con los códigos de `src/errores.ts`.
- Annotations en todas las tools (`readOnlyHint` en lecturas, `destructiveHint` donde corresponda).
- Los errores de negocio se lanzan con el `ErrorTool` de `src/errores.ts`, no con el de `@mcp-jkmate/core`. Así, un código que el servidor no declaró no compila.
- Los SP se llaman dentro de `acceso.enTransaccion(...)` con `ctx.medidor`, y su resultado pasa por `aplicarContrato` (`RESULTADO`/`MENSAJE_ERROR`).
- La identidad del usuario sale de `ctx.sesion`, nunca de un parámetro.

**Descripción obligatoria.** Cuatro partes, en este orden y cada una al comienzo de una línea:

```
Qué hace: devuelve el detalle de un cliente: razón social, CUIT y condición de IVA.
Cuándo usarla: cuando ya tenés el código del cliente y necesitás sus datos.
Parámetros: clienteId, el código del cliente (ej.: 1234).
Qué NO hacer: no la uses para buscar por nombre; para eso está buscar_clientes.
```

"Parámetros" lleva al menos un ejemplo concreto (`ej.:` o `por ejemplo`). Una tool sin parámetros escribe `Parámetros: ninguno.`. En "Qué NO hacer" va la tool a usar en su lugar, si existe. El test de contrato lo verifica con `problemasDeDescripcion`.

### 5. Tests

- Adaptá `test/obtener-ejemplo.test.ts` a cada tool: filas simuladas con `accesoSimulado` y verificación de la respuesta, los errores y los parámetros que llegan al SP.
- En `test/contrato.test.ts`, actualizá la lista de nombres que espera `tools/list` y los argumentos de los casos inválido y válido. El resto (descripciones, annotations y códigos del outputSchema) recorre todas las tools solo.

### 6. Configuración local

```powershell
copy apps\clientes-mcp\.env.example apps\clientes-mcp\.env
```

Completá `MCP_COD_USUARIO` y `FIREBIRD_*`. El `.env` lo leen `npm run dev` y `npm start`. Claude Desktop no lo lee.

### 7. Verificar

```bash
npm run typecheck -w apps/clientes-mcp
npm run lint -w apps/clientes-mcp
npm test -w apps/clientes-mcp
npm run build -w apps/clientes-mcp
npm run dev -w apps/clientes-mcp      # corre src/ con tsx y queda esperando mensajes MCP por stdin
```

Para probar las tools con una interfaz: `npx @modelcontextprotocol/inspector node apps/clientes-mcp/dist/index.js`.

### 8. Alta en Claude Desktop

En `%APPDATA%\Claude\claude_desktop_config.json`, dentro de `mcpServers` y sin borrar los servidores que ya estén:

```json
{
  "mcpServers": {
    "clientes": {
      "command": "node",
      "args": ["D:\\Desarrollo\\_Repos\\mcpTicketsJson\\apps\\clientes-mcp\\dist\\index.js"],
      "env": {
        "MCP_COD_USUARIO": "15169",
        "FIREBIRD_HOST": "127.0.0.1",
        "FIREBIRD_DATABASE": "E:\\Bases\\CREAR_JK3_20261016.fdb",
        "FIREBIRD_USER": "SYSDBA",
        "FIREBIRD_PASSWORD": "<password>"
      }
    }
  }
}
```

Reiniciá Claude Desktop por completo. Si el servidor no arranca, el motivo queda en `%APPDATA%\Claude\logs\mcp-server-clientes.log`.
