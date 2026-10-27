SET TERM ^ ;

CREATE OR ALTER PROCEDURE PROC_LIST_DET_MOV_FONDO_AG (
  P_COD_MOVIMIENTO_FONDO INTEGER
)
RETURNS (
  RESULTADO     SMALLINT,
  MENSAJE_ERROR VARCHAR(500),
  LADO          CHAR(1),
  CUENTA        VARCHAR(50),
  IMPORTE       NUMERIC(18,3),
  LEYENDA       VARCHAR(50),
  ES_FONDOS     SMALLINT,
  UNIDADES      NUMERIC(18,3),
  TERCERO       VARCHAR(100),
  DOCUMENTO     VARCHAR(30),
  CENTRO_COSTO  VARCHAR(50),
  SUCURSAL      VARCHAR(50)
)
AS
BEGIN
/*
  Nombre: PROC_LIST_DET_MOV_FONDO_AG
  Descripción: Renglones del debe (LADO = 'D') y del haber (LADO = 'H') de un movimiento de fondos
               para ver_movimiento_fondo (fondos-mcp), en un solo cursor. Envuelve los SP del
               formulario PROC_GET_M_FONDO_C_DEBE y PROC_GET_M_FONDO_C_HABER.
               Descarta los renglones de importe 0, que esos SP devuelven en los dos lados.
               ES_FONDOS es SOLO_LECTURA (CUENTAS_FONDOS.ES_FONDOS: Caja, bancos). TERCERO es el del
               renglón (proveedor, cliente o empleado), que suele venir vacío.
               No valida el usuario: la tool lo llama después de PROC_GET_MOV_FONDO_AG en la misma
               transacción.
  Última modificación: 2026-10-26
*/
  RESULTADO = 1; MENSAJE_ERROR = '';

  LADO = 'D';
  FOR SELECT D.CUENTA, D.IMPORTE, D.LEYENDA, D.SOLO_LECTURA, D.UNIDADES,
             COALESCE(D.PROVEEDOR, D.CLIENTE, D.EMPLEADO), D.DOCUMENTO, D.CENTRO_COSTO, D.SUCURSAL
      FROM PROC_GET_M_FONDO_C_DEBE(:P_COD_MOVIMIENTO_FONDO) D
      WHERE D.IMPORTE <> 0
      INTO :CUENTA, :IMPORTE, :LEYENDA, :ES_FONDOS, :UNIDADES, :TERCERO, :DOCUMENTO, :CENTRO_COSTO, :SUCURSAL
  DO SUSPEND;

  LADO = 'H';
  FOR SELECT H.CUENTA, H.IMPORTE, H.LEYENDA, H.SOLO_LECTURA, H.UNIDADES,
             COALESCE(H.PROVEEDOR, H.CLIENTE, H.EMPLEADO), H.DOCUMENTO, H.CENTRO_COSTO, H.SUCURSAL
      FROM PROC_GET_M_FONDO_C_HABER(:P_COD_MOVIMIENTO_FONDO) H
      WHERE H.IMPORTE <> 0
      INTO :CUENTA, :IMPORTE, :LEYENDA, :ES_FONDOS, :UNIDADES, :TERCERO, :DOCUMENTO, :CENTRO_COSTO, :SUCURSAL
  DO SUSPEND;
END^

SET TERM ; ^
