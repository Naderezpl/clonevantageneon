-- Allow anon role to insert orders and order_items for guest checkout
GRANT INSERT ON public.orders TO anon;
GRANT INSERT ON public.order_items TO anon;
GRANT SELECT ON public.orders TO anon;
GRANT SELECT ON public.order_items TO anon;

-- Also ensure authenticated role has proper grants
GRANT INSERT, SELECT ON public.orders TO authenticated;
GRANT INSERT, SELECT ON public.order_items TO authenticated;