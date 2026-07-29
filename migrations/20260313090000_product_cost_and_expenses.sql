-- Add product_cost to products
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS product_cost NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Add unit_cost to order_items for historical accuracy
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2);

-- Create expenses table if not exists
CREATE TABLE IF NOT EXISTS public.expenses (
  id BIGSERIAL PRIMARY KEY,
  category TEXT NOT NULL, -- e.g., 'Product Cost', 'Advertising', etc.
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  note TEXT NULL,
  product_id UUID NULL REFERENCES public.products(id) ON DELETE SET NULL,
  order_id UUID NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "expenses_admin_all" ON public.expenses;
DROP POLICY IF EXISTS "expenses_user_insert_from_orders" ON public.expenses;

-- Admins can do everything on expenses
CREATE POLICY "expenses_admin_all" ON public.expenses FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Allow the ordering user to insert expense rows tied to their order
CREATE POLICY "expenses_user_insert_from_orders" ON public.expenses FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = expenses.order_id
      AND o.user_id = auth.uid()
  )
);

-- Trigger to capture product cost at sale time and record expense
CREATE OR REPLACE FUNCTION public.capture_cost_and_create_expense()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_cost NUMERIC(12,2);
BEGIN
  -- fetch current product cost
  SELECT product_cost INTO p_cost FROM public.products WHERE id = NEW.product_id;
  IF p_cost IS NULL THEN
    p_cost := 0;
  END IF;

  -- store unit cost on the order item for historical accuracy
  NEW.unit_cost := p_cost;

  -- record an expense for the cost of goods sold
  INSERT INTO public.expenses (category, amount, date, note, product_id, order_id)
  VALUES ('Product Cost', (NEW.quantity * p_cost), NEW.created_at, 'COGS auto-entry', NEW.product_id, NEW.order_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_cost_and_create_expense ON public.order_items;
CREATE TRIGGER trg_capture_cost_and_create_expense
BEFORE INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.capture_cost_and_create_expense();

