-- Rollback SQL for AI Features: Agentic Machine-API, AI-Semantic Visual Search, Zero-Click Replenishment, Margin-Aware Dynamic Pricing
-- This script safely removes all AI-related features and their dependencies

-- Step 1: Drop AI-related functions that might depend on vector extension
DROP FUNCTION IF EXISTS public.match_products(vector, integer) CASCADE;
DROP FUNCTION IF EXISTS public.search_products_semantic(text, integer) CASCADE;
DROP FUNCTION IF EXISTS public.get_product_embeddings(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.update_product_embeddings() CASCADE;
DROP FUNCTION IF EXISTS public.find_similar_products(uuid, integer) CASCADE;

-- Step 2: Drop Zero-Click Replenishment functions
DROP FUNCTION IF EXISTS public.check_replenishment_needed(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.schedule_replenishment(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS public.process_zero_click_orders() CASCADE;

-- Step 3: Drop Margin-Aware Dynamic Pricing functions
DROP FUNCTION IF EXISTS public.calculate_dynamic_price(uuid, numeric) CASCADE;
DROP FUNCTION IF EXISTS public.update_product_margins() CASCADE;
DROP FUNCTION IF EXISTS public.get_optimal_price(uuid) CASCADE;

-- Step 4: Drop Agentic Machine-API functions
DROP FUNCTION IF EXISTS public.ai_rate_limit_hit(uuid, integer, integer) CASCADE;
DROP FUNCTION IF EXISTS public.create_ai_agent_key(text, text[]) CASCADE;
DROP FUNCTION IF EXISTS public.validate_ai_agent_key(text) CASCADE;

-- Step 5: Drop AI-specific tables (in correct order due to foreign key constraints)
DROP TABLE IF EXISTS public.ai_cart_items CASCADE;
DROP TABLE IF EXISTS public.ai_carts CASCADE;
DROP TABLE IF EXISTS public.ai_agent_requests CASCADE;
DROP TABLE IF EXISTS public.ai_agent_rate_limits CASCADE;
DROP TABLE IF EXISTS public.ai_agent_keys CASCADE;

-- Step 6: Drop AI-specific columns from existing tables
ALTER TABLE public.products DROP COLUMN IF EXISTS embedding;
ALTER TABLE public.products DROP COLUMN IF EXISTS semantic_vector;
ALTER TABLE public.products DROP COLUMN IF EXISTS last_replenishment_check;
ALTER TABLE public.products DROP COLUMN IF EXISTS replenishment_threshold;
ALTER TABLE public.products DROP COLUMN IF EXISTS auto_replenish_enabled;
ALTER TABLE public.products DROP COLUMN IF EXISTS dynamic_price_enabled;
ALTER TABLE public.products DROP COLUMN IF EXISTS base_margin_percent;
ALTER TABLE public.products DROP COLUMN IF EXISTS current_margin_percent;
ALTER TABLE public.products DROP COLUMN IF EXISTS optimal_price;

-- Step 7: Drop AI-specific indexes
DROP INDEX IF EXISTS public.products_embedding_idx;
DROP INDEX IF EXISTS public.products_semantic_vector_idx;
DROP INDEX IF EXISTS public.product_reviews_product_id_idx;

-- Step 8: Drop product_reviews table (if it was created for AI features)
DROP TABLE IF EXISTS public.product_reviews CASCADE;

-- Step 9: Remove AI-related columns from site_settings
ALTER TABLE public.site_settings DROP COLUMN IF EXISTS ai_search_enabled;
ALTER TABLE public.site_settings DROP COLUMN IF EXISTS dynamic_pricing_enabled;
ALTER TABLE public.site_settings DROP COLUMN IF EXISTS zero_click_replenishment_enabled;
ALTER TABLE public.site_settings DROP COLUMN IF EXISTS ai_agent_rate_limit;

-- Step 10: Drop vector extension (this should now work since dependencies are removed)
DROP EXTENSION IF EXISTS vector CASCADE;

-- Step 11: Drop any AI-specific RLS policies
DROP POLICY IF EXISTS "product_reviews_public_select" ON public.product_reviews;
DROP POLICY IF EXISTS "product_reviews_admin_write" ON public.product_reviews;

-- Step 12: Revert changes to existing tables (remove columns added for AI features)
ALTER TABLE public.products DROP COLUMN IF EXISTS price;
ALTER TABLE public.products DROP COLUMN IF EXISTS is_hidden;
ALTER TABLE public.products DROP COLUMN IF EXISTS is_featured;
ALTER TABLE public.products DROP COLUMN IF EXISTS is_on_sale;
ALTER TABLE public.products DROP COLUMN IF EXISTS track_stock;
ALTER TABLE public.products DROP COLUMN IF EXISTS updated_at;

ALTER TABLE public.product_variants DROP COLUMN IF EXISTS compare_at_price;
ALTER TABLE public.product_variants DROP COLUMN IF EXISTS original_price;
ALTER TABLE public.product_variants DROP COLUMN IF EXISTS sku;
ALTER TABLE public.product_variants DROP COLUMN IF EXISTS is_on_sale;
ALTER TABLE public.product_variants DROP COLUMN IF EXISTS updated_at;

ALTER TABLE public.product_images DROP COLUMN IF EXISTS title;
ALTER TABLE public.product_images DROP COLUMN IF EXISTS position;

ALTER TABLE public.site_settings DROP COLUMN IF EXISTS currency;
ALTER TABLE public.site_settings DROP COLUMN IF EXISTS shipping_time_min_days;
ALTER TABLE public.site_settings DROP COLUMN IF EXISTS shipping_time_max_days;

-- Final cleanup: Remove any remaining AI-related functions that might have been missed
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;