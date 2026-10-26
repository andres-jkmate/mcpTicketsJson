SET TERM ^ ;

CREATE OR ALTER PROCEDURE PROC_LIST_CUOTAS_FC_AG (
  P_COD_CONDICION_COMPRA INTEGER,
  P_TOTAL                NUMERIC(18,3),
  P_FECHA_RECEPCION      DATE
)
RETURNS (
  RESULTADO         SMALLINT,
  MENSAJE_ERROR     VARCHAR(500),
  CUOTA             INTEGER,
  FECHA_VENCIMIENTO DATE,
  MONTO_CUOTA       NUMERIC(18,3)
)
AS
DECLARE VARIABLE V_PAGO INTEGER;
BEGIN
/*
  Nombre: PROC_LIST_CUOTAS_FC_AG
  Descripción: Cuotas que generaría una factura de proveedor según la condición de compra, desde la
               fecha de recepción, para mostrar el vencimiento en preparar_factura_proveedor. Envuelve
               LIST_FINANCIAR_CREDITO_PROV (el mismo cálculo que usa PROC_INS_FIN_FAC_PROV_AG al
               grabar). No escribe.
  Última modificación: 2026-10-24

  Agregado en la implementación (no estaba en el design D13): el design pide `vencimiento` en
  la respuesta de preparar pero ningún SP de D12 lo calculaba.
  Verificado (2026-10-25): LIST_FINANCIAR_CREDITO_PROV solo lee DET_CONDICIONES_COMPRAS y llama a
  INCREMENTAR_FECHA, que no escribe.
*/
  RESULTADO = 0;
  IF (NOT EXISTS (SELECT 1 FROM CONDICIONES_COMPRAS WHERE COD_CONDICION_COMPRA = :P_COD_CONDICION_COMPRA)) THEN
  BEGIN
    MENSAJE_ERROR = 'No existe la condición de compra ' || COALESCE(CAST(:P_COD_CONDICION_COMPRA AS VARCHAR(20)), '');
    SUSPEND; EXIT;
  END
  IF (:P_TOTAL IS NULL OR :P_TOTAL <= 0 OR :P_FECHA_RECEPCION IS NULL) THEN
  BEGIN
    MENSAJE_ERROR = 'Faltan el total o la fecha de recepción';
    SUSPEND; EXIT;
  END

  FOR SELECT CUOTA, PAGO, FECHA_VENCIMIENTO, MONTO_CUOTA
      FROM LIST_FINANCIAR_CREDITO_PROV(:P_COD_CONDICION_COMPRA, :P_TOTAL, :P_FECHA_RECEPCION)
      INTO :CUOTA, :V_PAGO, :FECHA_VENCIMIENTO, :MONTO_CUOTA
  DO
  BEGIN
    RESULTADO = 1; MENSAJE_ERROR = '';
    SUSPEND;
  END
END^

SET TERM ; ^
