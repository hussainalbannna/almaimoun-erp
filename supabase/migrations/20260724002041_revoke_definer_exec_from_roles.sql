REVOKE EXECUTE ON FUNCTION public.cleanup_purchase_invoice_cheque() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_purchase_invoice_cheque()    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_purchase_invoice_cheque()  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_subpayment_cheque()        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_subpayment_cheque()          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number(text) FROM anon;
