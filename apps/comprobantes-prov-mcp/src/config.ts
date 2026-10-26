import { z } from 'zod';

const entero = (porDefecto: number) => z.coerce.number().int().positive().default(porDefecto);
const textoOpcional = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v));

const esquemaConfig = z.object({
  /** COD_USUARIO de JKMate de quien usa el servidor (stdio: un usuario por proceso). */
  MCP_COD_USUARIO: z.coerce.number().int().positive({ message: 'debe ser el COD_USUARIO de JKMate (entero positivo)' }),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SEQ_URL: textoOpcional,
  SEQ_API_KEY: textoOpcional,

  FIREBIRD_HOST: z.string().default('127.0.0.1'),
  FIREBIRD_PORT: entero(3050),
  FIREBIRD_DATABASE: z.string().min(1, 'falta la ruta o alias de la base'),
  FIREBIRD_USER: z.string().default('SYSDBA'),
  FIREBIRD_PASSWORD: textoOpcional,
  FIREBIRD_POOL_MAX: entero(5),
});

export type Config = z.infer<typeof esquemaConfig>;

/** Lee la configuración desde variables de entorno. Falla al arrancar si algún valor es inválido. */
export function cargarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resultado = esquemaConfig.safeParse(env);
  if (!resultado.success) {
    const detalle = resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida: ${detalle}`);
  }
  return resultado.data;
}
