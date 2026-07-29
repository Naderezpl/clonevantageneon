CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO public;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_on_sale BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS track_stock BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC(10,2);
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS original_price NUMERIC(10,2);
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS is_on_sale BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

ALTER TABLE public.product_images ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.product_images ADD COLUMN IF NOT EXISTS position INTEGER;

ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS shipping_time_min_days INTEGER;
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS shipping_time_max_days INTEGER;

CREATE TABLE IF NOT EXISTS public.ai_agent_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['*']::text[],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.ai_agent_rate_limits (
  key_id UUID NOT NULL REFERENCES public.ai_agent_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, window_start)
);

CREATE TABLE IF NOT EXISTS public.ai_agent_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID REFERENCES public.ai_agent_keys(id),
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  status INTEGER NOT NULL,
  duration_ms INTEGER,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.ai_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.ai_cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES public.ai_carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS ai_cart_items_cart_id_idx ON public.ai_cart_items(cart_id);

CREATE TABLE IF NOT EXISTS public.product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  body TEXT,
  author_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.ai_agent_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_reviews_public_select" ON public.product_reviews;
DROP POLICY IF EXISTS "product_reviews_admin_write" ON public.product_reviews;

CREATE POLICY "product_reviews_public_select" ON public.product_reviews
FOR SELECT
USING (TRUE);

CREATE POLICY "product_reviews_admin_write" ON public.product_reviews
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.ai_rate_limit_hit(
  p_key_id UUID,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  window_start TIMESTAMPTZ := date_trunc('minute', timezone('utc'::text, now()));
  reset_at TIMESTAMPTZ := window_start + make_interval(secs => p_window_seconds);
  new_count INTEGER;
BEGIN
  INSERT INTO public.ai_agent_rate_limits (key_id, window_start, count)
  VALUES (p_key_id, window_start, 1)
  ON CONFLICT (key_id, window_start)
  DO UPDATE SET count = public.ai_agent_rate_limits.count + 1
  RETURNING count INTO new_count;

  UPDATE public.ai_agent_keys
  SET last_used_at = timezone('utc'::text, now())
  WHERE id = p_key_id;

  RETURN jsonb_build_object(
    'allowed', (new_count <= p_limit),
    'remaining', GREATEST(p_limit - new_count, 0),
    'reset_at', reset_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_ai_agent_key(
  p_name TEXT,
  p_scopes TEXT[] DEFAULT ARRAY['*']::text[]
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw TEXT := 'ai_' || encode(gen_random_bytes(24), 'hex');
  hash TEXT := encode(digest(raw, 'sha256'), 'hex');
BEGIN
  INSERT INTO public.ai_agent_keys (name, key_hash, scopes)
  VALUES (p_name, hash, p_scopes);
  RETURN raw;
END;
$$;

