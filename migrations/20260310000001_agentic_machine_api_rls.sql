CREATE OR REPLACE FUNCTION public.ai_agent_key_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  headers JSONB := COALESCE(current_setting('request.headers', true), '{}')::jsonb;
  raw_key TEXT := NULLIF(headers->>'x-ai-api-key', '');
  hash TEXT;
  key_id UUID;
BEGIN
  IF raw_key IS NULL THEN
    RETURN NULL;
  END IF;

  hash := encode(digest(raw_key, 'sha256'), 'hex');

  SELECT k.id
  INTO key_id
  FROM public.ai_agent_keys k
  WHERE k.key_hash = hash
    AND k.is_active = TRUE
  LIMIT 1;

  RETURN key_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_agent_context()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key_id UUID := public.ai_agent_key_id();
  agent RECORD;
BEGIN
  IF key_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 401, 'error', 'Missing API key');
  END IF;

  SELECT id, name, scopes, rate_limit_per_minute
  INTO agent
  FROM public.ai_agent_keys
  WHERE public.ai_agent_keys.id = key_id;

  IF agent.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 401, 'error', 'Invalid API key');
  END IF;

  RETURN jsonb_build_object(
    'ok',
    true,
    'agent',
    jsonb_build_object(
      'id',
      agent.id,
      'name',
      agent.name,
      'scopes',
      agent.scopes,
      'rate_limit_per_minute',
      agent.rate_limit_per_minute
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_agent_key_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_agent_context() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_rate_limit_hit(UUID, INTEGER, INTEGER) TO anon, authenticated;

ALTER TABLE public.ai_carts ADD COLUMN IF NOT EXISTS agent_key_id UUID REFERENCES public.ai_agent_keys(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "ai_carts_key_access" ON public.ai_carts;
CREATE POLICY "ai_carts_key_access" ON public.ai_carts
FOR ALL
USING (agent_key_id = public.ai_agent_key_id())
WITH CHECK (agent_key_id = public.ai_agent_key_id());

DROP POLICY IF EXISTS "ai_cart_items_key_access" ON public.ai_cart_items;
CREATE POLICY "ai_cart_items_key_access" ON public.ai_cart_items
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.ai_carts c
    WHERE c.id = public.ai_cart_items.cart_id
      AND c.agent_key_id = public.ai_agent_key_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.ai_carts c
    WHERE c.id = public.ai_cart_items.cart_id
      AND c.agent_key_id = public.ai_agent_key_id()
  )
);

DROP POLICY IF EXISTS "ai_agent_requests_insert" ON public.ai_agent_requests;
CREATE POLICY "ai_agent_requests_insert" ON public.ai_agent_requests
FOR INSERT
WITH CHECK (key_id = public.ai_agent_key_id());

