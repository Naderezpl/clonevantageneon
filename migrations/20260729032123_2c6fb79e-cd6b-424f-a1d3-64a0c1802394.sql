ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;

CREATE OR REPLACE FUNCTION public.delete_stale_unpaid_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.orders
  WHERE is_paid = false
    AND COALESCE(payment_method, 'cod') <> 'cod'
    AND created_at < now() - interval '7 days';
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'delete-stale-unpaid-orders',
  '0 3 * * *',
  $$SELECT public.delete_stale_unpaid_orders();$$
);