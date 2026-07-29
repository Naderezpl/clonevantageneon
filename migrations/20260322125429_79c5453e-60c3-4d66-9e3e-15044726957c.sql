
ALTER TABLE public.homepage_slides
  ADD COLUMN IF NOT EXISTS mobile_crop_data jsonb DEFAULT NULL;

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS hero_video_mobile_crop jsonb DEFAULT NULL;
