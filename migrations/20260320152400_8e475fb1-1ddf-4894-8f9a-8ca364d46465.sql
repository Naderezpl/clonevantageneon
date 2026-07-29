CREATE TABLE public.store_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  description text DEFAULT '',
  icon text DEFAULT 'Sparkles',
  is_enabled boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view enabled highlights" ON public.store_highlights
  FOR SELECT USING (is_enabled = true);

CREATE POLICY "Admins can manage highlights" ON public.store_highlights
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));