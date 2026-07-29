
-- Allow anon users to insert order items (for guest checkout)
-- The FK constraint ensures order_id is valid
CREATE POLICY "Anon can create order items"
ON public.order_items
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon users to see orders with null user_id (needed for order_items policy evaluation)
-- Also needed so guest can be redirected to confirmation
CREATE POLICY "Anon can view guest orders"
ON public.orders
FOR SELECT
TO anon
USING (user_id IS NULL);
