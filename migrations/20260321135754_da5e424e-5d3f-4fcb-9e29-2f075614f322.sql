ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS hero_media_mode text NOT NULL DEFAULT 'video',
  ADD COLUMN IF NOT EXISTS hero_video_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hero_slide_duration_ms integer NOT NULL DEFAULT 5000;