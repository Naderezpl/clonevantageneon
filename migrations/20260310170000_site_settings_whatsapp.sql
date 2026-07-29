-- Add WhatsApp-related fields to site_settings
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS whatsapp_number1 TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number2 TEXT;

