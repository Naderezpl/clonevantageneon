ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS announcement_bar_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS announcement_bar_text text DEFAULT '',
  ADD COLUMN IF NOT EXISTS announcement_bar_bg_color text DEFAULT '#1a1a1a';