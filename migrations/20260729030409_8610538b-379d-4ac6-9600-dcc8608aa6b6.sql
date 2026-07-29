ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS whish_number text,
  ADD COLUMN IF NOT EXISTS whish_owner_name text,
  ADD COLUMN IF NOT EXISTS omt_number text,
  ADD COLUMN IF NOT EXISTS omt_owner_name text,
  ADD COLUMN IF NOT EXISTS payment_instructions text;