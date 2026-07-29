CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Admin helper
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

-- user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_roles_admin_all" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_self_select" ON public.user_roles;
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "user_roles_self_select" ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

-- categories
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NULL,
  slug TEXT NULL,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER NOT NULL DEFAULT 0,
  background_color TEXT NOT NULL DEFAULT '#FFFFFF',
  text_color TEXT NOT NULL DEFAULT '#000000',
  image_url TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "categories_public_select" ON public.categories;
DROP POLICY IF EXISTS "categories_admin_write" ON public.categories;
CREATE POLICY "categories_public_select" ON public.categories FOR SELECT USING (TRUE);
CREATE POLICY "categories_admin_write" ON public.categories FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- nav_items
CREATE TABLE IF NOT EXISTS public.nav_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.nav_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nav_public_select" ON public.nav_items;
DROP POLICY IF EXISTS "nav_admin_write" ON public.nav_items;
CREATE POLICY "nav_public_select" ON public.nav_items FOR SELECT USING (TRUE);
CREATE POLICY "nav_admin_write" ON public.nav_items FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- products
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NULL,
  category_id UUID NULL REFERENCES public.categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_public_select" ON public.products;
DROP POLICY IF EXISTS "products_admin_write" ON public.products;
CREATE POLICY "products_public_select" ON public.products FOR SELECT USING (TRUE);
CREATE POLICY "products_admin_write" ON public.products FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- product_variants
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "variants_public_select" ON public.product_variants;
DROP POLICY IF EXISTS "variants_admin_write" ON public.product_variants;
CREATE POLICY "variants_public_select" ON public.product_variants FOR SELECT USING (TRUE);
CREATE POLICY "variants_admin_write" ON public.product_variants FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- product_images
CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID NULL REFERENCES public.product_variants(id) ON DELETE SET NULL,
  image_url TEXT NOT NULL,
  title TEXT NULL,
  url TEXT NULL,
  position INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "images_public_select" ON public.product_images;
DROP POLICY IF EXISTS "images_admin_write" ON public.product_images;
CREATE POLICY "images_public_select" ON public.product_images FOR SELECT USING (TRUE);
CREATE POLICY "images_admin_write" ON public.product_images FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- orders
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  total_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orders_user_select" ON public.orders;
DROP POLICY IF EXISTS "orders_user_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_select" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_update" ON public.orders;
CREATE POLICY "orders_user_select" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "orders_user_insert" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "orders_admin_select" ON public.orders FOR SELECT USING (public.is_admin());
CREATE POLICY "orders_admin_update" ON public.orders FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- order_items
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_items_user_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_user_insert" ON public.order_items;
DROP POLICY IF EXISTS "order_items_admin_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_admin_delete" ON public.order_items;
CREATE POLICY "order_items_user_select" ON public.order_items FOR SELECT
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid()));
CREATE POLICY "order_items_user_insert" ON public.order_items FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid()));
CREATE POLICY "order_items_admin_select" ON public.order_items FOR SELECT USING (public.is_admin());
CREATE POLICY "order_items_admin_delete" ON public.order_items FOR DELETE USING (public.is_admin());

-- favorites (optional feature)
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "favorites_user_rw" ON public.favorites;
DROP POLICY IF EXISTS "favorites_admin_all" ON public.favorites;
CREATE POLICY "favorites_user_rw" ON public.favorites FOR ALL
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "favorites_admin_all" ON public.favorites FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- cart_items (optional, for persistent carts)
CREATE TABLE IF NOT EXISTS public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  variant_data JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cart_user_rw" ON public.cart_items;
DROP POLICY IF EXISTS "cart_admin_all" ON public.cart_items;
CREATE POLICY "cart_user_rw" ON public.cart_items FOR ALL
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cart_admin_all" ON public.cart_items FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- site_settings (single row, latest by id)
CREATE TABLE IF NOT EXISTS public.site_settings (
  id BIGSERIAL PRIMARY KEY,
  company_name TEXT NOT NULL DEFAULT 'LINKORA',
  logo_url TEXT NULL,
  contact_email TEXT NULL,
  contact_phone TEXT NULL,
  contact_address TEXT NULL,
  order_notification_email TEXT NULL,
  show_featured_products BOOLEAN NOT NULL DEFAULT TRUE,
  show_on_sale_products BOOLEAN NOT NULL DEFAULT TRUE,
  featured_products_title TEXT NULL,
  on_sale_products_title TEXT NULL,
  featured_products_description TEXT NULL,
  on_sale_products_description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_public_select" ON public.site_settings;
DROP POLICY IF EXISTS "settings_admin_write" ON public.site_settings;
CREATE POLICY "settings_public_select" ON public.site_settings FOR SELECT USING (TRUE);
CREATE POLICY "settings_admin_write" ON public.site_settings FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- notifications (optional)
CREATE TABLE IF NOT EXISTS public.notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NULL REFERENCES auth.users(id),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_user_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_admin_all" ON public.notifications;
CREATE POLICY "notifications_user_select" ON public.notifications FOR SELECT
USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "notifications_admin_all" ON public.notifications FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Storage bucket for images
INSERT INTO storage.buckets (id, name, public)
VALUES ('imageassets','imageassets', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "public_read_imageassets" ON storage.objects;
DROP POLICY IF EXISTS "admin_manage_imageassets" ON storage.objects;

CREATE POLICY "public_read_imageassets"
ON storage.objects FOR SELECT
USING (bucket_id = 'imageassets');

CREATE POLICY "admin_manage_imageassets"
ON storage.objects FOR ALL
USING (bucket_id = 'imageassets' AND public.is_admin())
WITH CHECK (bucket_id = 'imageassets' AND public.is_admin());

-- Seed defaults (optional, runs once)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.site_settings) THEN
    INSERT INTO public.site_settings (company_name) VALUES ('LINKORA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.nav_items) THEN
    INSERT INTO public.nav_items (title, url, "order", is_enabled)
    VALUES
      ('Home','/',0,TRUE),
      ('Shop','/shop',1,TRUE),
      ('Custom Neon','/custom',2,TRUE),
      ('Inspiration','/inspiration',3,TRUE),
      ('About Us','/about',4,TRUE);
  END IF;
END
$$;