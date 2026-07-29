
-- Coupons table
CREATE TABLE public.coupons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL,
  code_upper text GENERATED ALWAYS AS (upper(code)) STORED,
  discount_type text NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value numeric NOT NULL DEFAULT 0,
  min_subtotal numeric DEFAULT 0,
  max_uses integer DEFAULT NULL,
  max_uses_per_customer integer DEFAULT 1,
  starts_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT NULL,
  is_active boolean NOT NULL DEFAULT true,
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (code_upper)
);

-- Coupon usage tracking
CREATE TABLE public.coupon_usages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_email text NOT NULL,
  user_id uuid DEFAULT NULL,
  discount_applied numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS for coupons
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage coupons" ON public.coupons FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view active coupons" ON public.coupons FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage coupon usages" ON public.coupon_usages FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can insert coupon usage" ON public.coupon_usages FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view own coupon usages" ON public.coupon_usages FOR SELECT USING (user_id = auth.uid() OR customer_email IS NOT NULL);

-- Trigger to update updated_at
CREATE TRIGGER set_coupons_updated_at BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to validate and apply a coupon
CREATE OR REPLACE FUNCTION public.validate_coupon(
  p_code text,
  p_subtotal numeric,
  p_customer_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_coupon RECORD;
  v_customer_uses integer;
  v_discount numeric;
BEGIN
  SELECT * INTO v_coupon FROM public.coupons
    WHERE code_upper = upper(p_code) AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid or inactive coupon code.');
  END IF;

  IF v_coupon.starts_at IS NOT NULL AND now() < v_coupon.starts_at THEN
    RETURN jsonb_build_object('valid', false, 'error', 'This coupon is not yet active.');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND now() > v_coupon.expires_at THEN
    RETURN jsonb_build_object('valid', false, 'error', 'This coupon has expired.');
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.usage_count >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'error', 'This coupon has reached its usage limit.');
  END IF;

  IF v_coupon.min_subtotal IS NOT NULL AND p_subtotal < v_coupon.min_subtotal THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Minimum subtotal of $' || v_coupon.min_subtotal || ' required.');
  END IF;

  SELECT count(*) INTO v_customer_uses FROM public.coupon_usages
    WHERE coupon_id = v_coupon.id AND lower(customer_email) = lower(p_customer_email);

  IF v_coupon.max_uses_per_customer IS NOT NULL AND v_customer_uses >= v_coupon.max_uses_per_customer THEN
    RETURN jsonb_build_object('valid', false, 'error', 'You have already used this coupon.');
  END IF;

  IF v_coupon.discount_type = 'percentage' THEN
    v_discount := ROUND(p_subtotal * v_coupon.discount_value / 100, 2);
  ELSE
    v_discount := LEAST(v_coupon.discount_value, p_subtotal);
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', v_coupon.id,
    'discount', v_discount,
    'discount_type', v_coupon.discount_type,
    'discount_value', v_coupon.discount_value,
    'code', v_coupon.code
  );
END;
$$;
