
-- Add variant_data column to cart_items table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'cart_items' 
        AND column_name = 'variant_data'
    ) THEN
        ALTER TABLE public.cart_items
        ADD COLUMN variant_data JSONB;
    END IF;
END
$$;
