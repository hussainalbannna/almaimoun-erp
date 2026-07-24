ALTER FUNCTION public.delete_purchase_invoice_cheque() SET search_path = public;
ALTER FUNCTION public.delete_subpayment_cheque()       SET search_path = public;
ALTER FUNCTION public.sync_subpayment_cheque()         SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.cleanup_purchase_invoice_cheque() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_purchase_invoice_cheque()    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_purchase_invoice_cheque()  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_subpayment_cheque()        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_subpayment_cheque()          FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.next_invoice_number(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.next_invoice_number(text) TO authenticated;
