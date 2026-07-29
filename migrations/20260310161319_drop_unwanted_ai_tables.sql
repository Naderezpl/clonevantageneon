-- Drop only unwanted AI-related tables (no functions, columns, or extensions)
-- Safe to run multiple times due to IF EXISTS and CASCADE

-- Agentic Machine-API tables
DROP TABLE IF EXISTS public.ai_cart_items CASCADE;
DROP TABLE IF EXISTS public.ai_carts CASCADE;
DROP TABLE IF EXISTS public.ai_agent_requests CASCADE;
DROP TABLE IF EXISTS public.ai_agent_rate_limits CASCADE;
DROP TABLE IF EXISTS public.ai_agent_keys CASCADE;

-- Semantic search / embeddings tables that may exist
DROP TABLE IF EXISTS public.product_embeddings CASCADE;
DROP TABLE IF EXISTS public.product_vectors CASCADE;
DROP TABLE IF EXISTS public.semantic_index CASCADE;

-- Reviews table if it was created for AI features
DROP TABLE IF EXISTS public.product_reviews CASCADE;
