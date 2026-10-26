SET TERM ^ ;

CREATE OR ALTER PROCEDURE PROC_LIST_VAL_FAC_PROV_AG (
  P_COD_PROVEEDOR        INTEGER,
  P_COD_TIPO_COMPROBANTE INTEGER,
  P_NRO_COMPROBANTE      VARCHAR(15),
  P_FECHA                DATE,
  P_FECHA_CONTABLE       DATE,
  P_FECHA_IVA            DATE,
  P_COD_CONDICION_COMPRA INTEGER
)
RETURNS (
  RESULTADO     SMALLINT,
  MENSAJE_ERROR VARCHAR(500),
  CODIGO        VARCHAR(40),
  MENSAJE       VARCHAR(500)
)
AS
BEGIN
/*
  Nombre: PROC_LIST_VAL_FAC_PROV_AG
  Descripción: Bloqueos de negocio de un borrador de factura de proveedor, para que
               preparar_factura_proveedor los muestre (expone PRV_VAL_FAC_PROV_AG). Una fila por
               bloqueo; sin filas = el borrador no tiene bloqueos.
  Última modificación: 2026-10-24
*/
  FOR SELECT CODIGO, MENSAJE
      FROM PRV_VAL_FAC_PROV_AG(:P_COD_PROVEEDOR, :P_COD_TIPO_COMPROBANTE, :P_NRO_COMPROBANTE,
                               :P_FECHA, :P_FECHA_CONTABLE, :P_FECHA_IVA, :P_COD_CONDICION_COMPRA)
      INTO :CODIGO, :MENSAJE
  DO
  BEGIN
    RESULTADO = 1; MENSAJE_ERROR = '';
    SUSPEND;
  END
END^

SET TERM ; ^
