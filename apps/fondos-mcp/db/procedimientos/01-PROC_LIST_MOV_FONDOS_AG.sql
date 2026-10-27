SET TERM ^ ;

CREATE OR ALTER PROCEDURE PROC_LIST_MOV_FONDOS_AG (
  P_COD_USUARIO INTEGER,
  P_NRO_PATRON  VARCHAR(15),
  P_FECHA_DESDE DATE,
  P_FECHA_HASTA DATE,
  P_IMPORTE     NUMERIC(18,3),
  P_IMPORTE_MIN NUMERIC(18,3),
  P_IMPORTE_MAX NUMERIC(18,3),
  P_CLASE       VARCHAR(10),
  P_TERCERO     VARCHAR(100),
  P_LIMITE      INTEGER,
  P_DESDE       INTEGER
)
RETURNS (
  RESULTADO            SMALLINT,
  MENSAJE_ERROR        VARCHAR(500),
  ENCONTRADOS          INTEGER,
  COD_MOVIMIENTO_FONDO INTEGER,
  NRO_COMPROBANTE      VARCHAR(15),
  TALONARIO            VARCHAR(50),
  TIPO                 VARCHAR(50),
  CLASE                VARCHAR(10),
  FECHA                DATE,
  TOTAL                NUMERIC(18,3),
  TERCERO              VARCHAR(100),
  CONCEPTO             VARCHAR(50),
  ESTADO               VARCHAR(10)
)
AS
DECLARE VARIABLE V_DESDE DATE;
DECLARE VARIABLE V_HASTA_SIG DATE;
DECLARE VARIABLE V_DEVUELTAS INTEGER = 0;
BEGIN
/*
  Nombre: PROC_LIST_MOV_FONDOS_AG
  Descripción: Búsqueda de movimientos de fondos para buscar_movimientos_fondos (fondos-mcp).
               Filtra por patrón LIKE del número (L-PPPP-NNNNNNNN con _ como comodín), rango de
               fechas (ambas inclusive; NULL = sin límite), rango de importe, clase y tercero de
               cabecera (CONTAINING). Cuenta las coincidencias, ordena por cercanía al importe (si
               viene) y por fecha e id descendentes, y devuelve la página pedida.
               ENCONTRADOS va en todas las filas; si la página queda vacía (sin coincidencias o
               P_DESDE más allá del final) devuelve una sola fila con ENCONTRADOS y el resto en NULL.
               Clase según TIPOS_COMPROBANTES.TIPO_COMPROBANTE (prefijos ASCII Dep/Rev para no
               depender del charset); estado según ANULADO y COD_MOVIMIENTO_REVERTIDO.
               El rango de fechas se aplica siempre (1800-01-01 a 2999-12-31 si no viene) para que
               el optimizador use IDX_MOVIMIENTOS_FONDOS_FECHA.
  Última modificación: 2026-10-26
*/
  IF (NOT EXISTS (SELECT 1 FROM USUARIOS U WHERE U.COD_USUARIO = :P_COD_USUARIO
      AND (U.FECHA_BAJA IS NULL OR U.FECHA_BAJA > CURRENT_DATE))) THEN
  BEGIN
    RESULTADO = 0; MENSAJE_ERROR = 'NO_AUTORIZADO: el usuario configurado no existe o está dado de baja';
    SUSPEND; EXIT;
  END

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
         OR (:P_CLASE = 'otros' AND COALESCE(TC.TIPO_COMPROBANTE, '') NOT IN ('Pago', 'Cobro', 'Movimientos varios')
             AND COALESCE(TC.TIPO_COMPROBANTE, '') NOT STARTING WITH 'Dep'
             AND COALESCE(TC.TIPO_COMPROBANTE, '') NOT STARTING WITH 'Rev'))
  INTO :ENCONTRADOS;

  RESULTADO = 1; MENSAJE_ERROR = '';

  IF (:ENCONTRADOS > 0) THEN
    FOR SELECT M.COD_MOVIMIENTO_FONDO, TRIM(M.NRO_COMPROBANTE), T.DESCRIPCION, TC.DESCRIPCION,
               TRIM(CASE WHEN TC.TIPO_COMPROBANTE = 'Pago' THEN 'pago'
                    WHEN TC.TIPO_COMPROBANTE = 'Cobro' THEN 'cobro'
                    WHEN TC.TIPO_COMPROBANTE STARTING WITH 'Dep' THEN 'deposito'
                    WHEN TC.TIPO_COMPROBANTE = 'Movimientos varios' THEN 'varios'
                    WHEN TC.TIPO_COMPROBANTE STARTING WITH 'Rev' THEN 'reversion'
                    ELSE 'otros' END),
               CAST(M.FECHA AS DATE), M.TOTAL, COALESCE(CL.NOMBRE, P.RAZON_SOCIAL), M.CONCEPTO,
               TRIM(CASE WHEN M.ANULADO = 1 THEN 'anulado'
                    WHEN M.COD_MOVIMIENTO_REVERTIDO IS NOT NULL THEN 'revertido'
                    ELSE 'vigente' END)
        FROM MOVIMIENTOS_FONDOS M
        JOIN TIPOS_COMPROBANTES TC ON TC.COD_TIPO_COMPROBANTE = M.COD_TIPO_COMPROBANTE
        LEFT JOIN TALONARIOS T ON T.COD_TALONARIO = M.COD_TALONARIO
        LEFT JOIN CLIENTES CL ON CL.COD_CLIENTE = M.COD_CLIENTE
        LEFT JOIN PROVEEDORES P ON P.COD_PROVEEDOR = M.COD_PROVEEDOR
        -- Mismo WHERE que el conteo
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
               OR (:P_CLASE = 'otros' AND COALESCE(TC.TIPO_COMPROBANTE, '') NOT IN ('Pago', 'Cobro', 'Movimientos varios')
                   AND COALESCE(TC.TIPO_COMPROBANTE, '') NOT STARTING WITH 'Dep'
                   AND COALESCE(TC.TIPO_COMPROBANTE, '') NOT STARTING WITH 'Rev'))
        ORDER BY CASE WHEN :P_IMPORTE IS NULL THEN 0 ELSE ABS(M.TOTAL - :P_IMPORTE) END,
                 M.FECHA DESC, M.COD_MOVIMIENTO_FONDO DESC
        OFFSET :P_DESDE ROWS FETCH NEXT :P_LIMITE ROWS ONLY
        INTO :COD_MOVIMIENTO_FONDO, :NRO_COMPROBANTE, :TALONARIO, :TIPO, :CLASE,
             :FECHA, :TOTAL, :TERCERO, :CONCEPTO, :ESTADO
    DO
    BEGIN
      V_DEVUELTAS = V_DEVUELTAS + 1;
      SUSPEND;
    END

  -- Página vacía: una fila solo con el total, para que la tool lo informe igual
  IF (V_DEVUELTAS = 0) THEN SUSPEND;
END^

SET TERM ; ^
