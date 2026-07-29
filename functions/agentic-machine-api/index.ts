// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-ai-api-key, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

const jsonResponse = (
  body: unknown,
  init?: { status?: number; headers?: HeadersInit },
) => {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
};

const getClientIp = (req: Request) => {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    null;
};

const normalizePath = (url: URL) => {
  const prefix = "/agentic-machine-api";
  if (url.pathname.startsWith(prefix)) {
    const rest = url.pathname.slice(prefix.length);
    return rest.length ? rest : "/";
  }
  return url.pathname;
};

type AgentKey = {
  id: string;
  name: string;
  scopes: string[] | null;
  rate_limit_per_minute: number | null;
};

const authenticateAgent = async (
  supabase: ReturnType<typeof createClient>,
  req: Request,
): Promise<
  { ok: true; agent: AgentKey } | { ok: false; status: number; error: string }
> => {
  const raw =
    req.headers.get("x-ai-api-key") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      null;

  if (!raw) {
    return { ok: false, status: 401, error: "Missing API key" };
  }

  const { data, error } = await supabase.rpc("ai_agent_context");
  if (error || !data) return { ok: false, status: 401, error: "Invalid API key" };

  if (!data.ok) {
    return { ok: false, status: data.status ?? 401, error: data.error ?? "Invalid API key" };
  }

  return { ok: true, agent: data.agent as AgentKey };
};

const enforceRateLimit = async (
  supabase: ReturnType<typeof createClient>,
  agent: AgentKey,
) => {
  const limit = agent.rate_limit_per_minute ?? 60;
  const { data, error } = await supabase.rpc("ai_rate_limit_hit", {
    p_key_id: agent.id,
    p_limit: limit,
    p_window_seconds: 60,
  });

  if (error || !data) {
    return { allowed: true, remaining: null as number | null, resetAt: null as string | null };
  }

  return {
    allowed: !!data.allowed,
    remaining: typeof data.remaining === "number" ? data.remaining : null,
    resetAt: typeof data.reset_at === "string" ? data.reset_at : null,
  };
};

const buildOpenApi = (origin: string) => {
  return {
    openapi: "3.0.3",
    info: {
      title: "Agentic Machine-API",
      version: "1.0.0",
      description:
        "Machine-optimized endpoints for AI agents to browse products, search, and manage machine carts.",
    },
    servers: [{ url: `${origin}/api/ai` }],
    components: {
      securitySchemes: {
        AgentApiKey: {
          type: "apiKey",
          in: "header",
          name: "x-ai-api-key",
        },
      },
    },
    security: [{ AgentApiKey: [] }],
    paths: {
      "/products": {
        get: {
          summary: "List products",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50 } },
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } },
          ],
          responses: { "200": { description: "OK" } },
        },
      },
      "/product/{id}": {
        get: {
          summary: "Get product details",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
        },
      },
      "/search": {
        get: {
          summary: "Search products",
          parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      "/cart": {
        get: {
          summary: "Get a machine cart",
          parameters: [{ name: "cart_id", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
        },
        post: {
          summary: "Create or update a machine cart",
          requestBody: { required: true },
          responses: { "200": { description: "OK" } },
        },
      },
      "/store-info": {
        get: {
          summary: "Get store information",
          responses: { "200": { description: "OK" } },
        },
      },
      "/openapi.json": {
        get: {
          summary: "OpenAPI spec",
          security: [],
          responses: { "200": { description: "OK" } },
        },
      },
    },
  };
};

const computeAvailability = (product: any) => {
  const trackStock = !!product.track_stock;
  const variants: any[] = product.variants ?? [];
  if (!trackStock) return { in_stock: true, reason: "track_stock_disabled" };
  if (!variants.length) return { in_stock: true, reason: "no_variants" };
  const anyInStock = variants.some((v) => (v.stock_quantity ?? 0) > 0);
  return { in_stock: anyInStock, reason: anyInStock ? "stock_available" : "out_of_stock" };
};

const minPrice = (product: any) => {
  const variants: any[] = product.variants ?? [];
  const prices = variants.map((v) => Number(v.price)).filter((p) => Number.isFinite(p));
  if (prices.length) return Math.min(...prices);
  if (product.price != null && Number.isFinite(Number(product.price))) return Number(product.price);
  return null;
};

const mapProduct = (product: any, store: any) => {
  const variants: any[] = product.variants ?? [];
  const images: any[] = product.images ?? [];
  const availability = computeAvailability(product);

  return {
    id: product.id,
    name: product.name,
    description: product.description ?? "",
    category_id: product.category_id ?? null,
    price: minPrice(product),
    currency: store?.currency ?? "USD",
    availability,
    flags: {
      is_featured: !!product.is_featured,
      is_on_sale: !!product.is_on_sale,
      is_hidden: !!product.is_hidden,
    },
    shipping_time_days: {
      min: store?.shipping_time_min_days ?? null,
      max: store?.shipping_time_max_days ?? null,
    },
    variants: variants.map((v) => ({
      id: v.id,
      name: v.variant_name,
      price: v.price != null ? Number(v.price) : null,
      compare_at_price: v.compare_at_price != null ? Number(v.compare_at_price) : null,
      original_price: v.original_price != null ? Number(v.original_price) : null,
      is_on_sale: v.is_on_sale ?? null,
      sku: v.sku ?? null,
      stock_quantity: v.stock_quantity ?? null,
      images: images
        .filter((img) => img.variant_id === v.id)
        .map((img) => ({
          id: img.id,
          url: img.image_url,
          title: img.title ?? null,
          position: img.position ?? null,
        })),
    })),
    images: images.map((img) => ({
      id: img.id,
      url: img.image_url,
      title: img.title ?? null,
      position: img.position ?? null,
      variant_id: img.variant_id ?? null,
    })),
    reviews: {
      average_rating: null,
      total_count: 0,
      items: [],
    },
    machine: {
      schema: "linkora.agentic_machine_api.product.v1",
      updated_at: product.updated_at ?? null,
    },
  };
};

const getStoreInfo = async (supabase: ReturnType<typeof createClient>) => {
  const { data } = await supabase
    .from("site_settings")
    .select("*")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  const store = data ?? {};

  return {
    name: store.company_name ?? "LINKORA",
    contact: {
      email: store.contact_email ?? null,
      phone: store.contact_phone ?? null,
      address: store.contact_address ?? null,
    },
    currency: store.currency ?? "USD",
    shipping_time_min_days: store.shipping_time_min_days ?? null,
    shipping_time_max_days: store.shipping_time_max_days ?? null,
    endpoints: {
      products: "/api/ai/products",
      product: "/api/ai/product/{id}",
      search: "/api/ai/search?q=",
      cart: "/api/ai/cart",
      openapi: "/api/ai/openapi.json",
    },
    machine: {
      schema: "linkora.agentic_machine_api.store.v1",
      updated_at: store.updated_at ?? null,
    },
  };
};

const fetchReviewsSummary = async (supabase: ReturnType<typeof createClient>, productId: string) => {
  const { data, error } = await supabase
    .from("product_reviews")
    .select("rating")
    .eq("product_id", productId);

  if (error || !data?.length) {
    return { average_rating: null, total_count: 0 };
  }

  const ratings = data.map((r: any) => Number(r.rating)).filter((n) => Number.isFinite(n));
  if (!ratings.length) return { average_rating: null, total_count: 0 };
  const sum = ratings.reduce((a, b) => a + b, 0);
  return { average_rating: Number((sum / ratings.length).toFixed(2)), total_count: ratings.length };
};

const buildCartTotals = async (
  supabase: ReturnType<typeof createClient>,
  cartId: string,
  currency: string,
) => {
  const { data: items } = await supabase
    .from("ai_cart_items")
    .select("id, product_id, variant_id, quantity, unit_price")
    .eq("cart_id", cartId);

  const mappedItems = (items ?? []).map((i: any) => ({
    id: i.id,
    product_id: i.product_id,
    variant_id: i.variant_id ?? null,
    quantity: i.quantity,
    unit_price: Number(i.unit_price),
    line_total: Number(i.unit_price) * Number(i.quantity),
  }));

  const subtotal = mappedItems.reduce((sum, i) => sum + i.line_total, 0);
  return {
    cart_id: cartId,
    currency,
    items: mappedItems,
    totals: {
      subtotal: Number(subtotal.toFixed(2)),
      shipping: null,
      tax: null,
      total: Number(subtotal.toFixed(2)),
    },
    machine: { schema: "linkora.agentic_machine_api.cart.v1" },
  };
};

const handler = async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent");
  const agentApiKey = req.headers.get("x-ai-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_ANON_KEY") ||
    "";
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        "x-request-id": requestId,
        ...(agentApiKey ? { "x-ai-api-key": agentApiKey } : {}),
      },
    },
  });

  const url = new URL(req.url);
  const path = normalizePath(url);
  const origin = url.origin;

  let agentId: string | null = null;
  let responseStatus = 200;
  let responseBody: unknown = null;

  try {
    if (path === "/openapi.json" && req.method === "GET") {
      responseBody = buildOpenApi(origin);
      responseStatus = 200;
      return jsonResponse(responseBody, { status: responseStatus });
    }

    const auth = await authenticateAgent(supabase, req);
    if (!auth.ok) {
      responseStatus = auth.status;
      responseBody = { error: auth.error, request_id: requestId };
      return jsonResponse(responseBody, { status: responseStatus });
    }

    agentId = auth.agent.id;

    const rate = await enforceRateLimit(supabase, auth.agent);
    if (!rate.allowed) {
      responseStatus = 429;
      responseBody = { error: "Rate limit exceeded", request_id: requestId };
      const headers: HeadersInit = {};
      if (rate.remaining != null) headers["x-ratelimit-remaining"] = String(rate.remaining);
      if (rate.resetAt) headers["x-ratelimit-reset"] = rate.resetAt;
      return jsonResponse(responseBody, { status: responseStatus, headers });
    }

    const store = await getStoreInfo(supabase);

    if (path === "/products" && req.method === "GET") {
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "20"), 1), 50);
      const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);
      const { data, error } = await supabase
        .from("products")
        .select(
          "*, product_variants(*), product_images(*)",
        )
        .eq("is_hidden", false)
        .range(offset, offset + limit - 1);

      if (error) throw new Error(error.message);

      const products = (data ?? []).map((p: any) => {
        const mapped = { ...p, variants: p.product_variants, images: p.product_images };
        return mapProduct(mapped, store);
      });

      responseBody = {
        request_id: requestId,
        count: products.length,
        offset,
        limit,
        products,
        machine: { schema: "linkora.agentic_machine_api.products.v1" },
      };
      responseStatus = 200;
      return jsonResponse(responseBody, { status: responseStatus });
    }

    if (path.startsWith("/product/") && req.method === "GET") {
      const productId = path.split("/")[2];
      if (!productId) {
        responseStatus = 400;
        responseBody = { error: "Missing product id", request_id: requestId };
        return jsonResponse(responseBody, { status: responseStatus });
      }

      const { data, error } = await supabase
        .from("products")
        .select("*, product_variants(*), product_images(*)")
        .eq("id", productId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) {
        responseStatus = 404;
        responseBody = { error: "Product not found", request_id: requestId };
        return jsonResponse(responseBody, { status: responseStatus });
      }

      const mapped = { ...data, variants: data.product_variants, images: data.product_images };
      const product = mapProduct(mapped, store);
      const reviewsSummary = await fetchReviewsSummary(supabase, productId);
      product.reviews = { ...product.reviews, ...reviewsSummary };

      responseBody = { request_id: requestId, product };
      responseStatus = 200;
      return jsonResponse(responseBody, { status: responseStatus });
    }

    if (path === "/store-info" && req.method === "GET") {
      responseBody = { request_id: requestId, store };
      responseStatus = 200;
      return jsonResponse(responseBody, { status: responseStatus });
    }

    if (path === "/search" && req.method === "GET") {
      const q = (url.searchParams.get("q") ?? "").trim();
      if (!q) {
        responseStatus = 400;
        responseBody = { error: "Missing query param q", request_id: requestId };
        return jsonResponse(responseBody, { status: responseStatus });
      }

      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "20"), 1), 50);
      const { data, error } = await supabase
        .from("products")
        .select("*, product_variants(*), product_images(*)")
        .eq("is_hidden", false)
        .ilike("name", `%${q}%`)
        .or(`description.ilike.%${q}%`)
        .limit(limit);

      if (error) throw new Error(error.message);

      const products = (data ?? []).map((p: any) => {
        const mapped = { ...p, variants: p.product_variants, images: p.product_images };
        return mapProduct(mapped, store);
      });

      responseBody = {
        request_id: requestId,
        query: q,
        count: products.length,
        products,
        machine: { schema: "linkora.agentic_machine_api.search.v1" },
      };
      responseStatus = 200;
      return jsonResponse(responseBody, { status: responseStatus });
    }

    if (path === "/cart" && req.method === "GET") {
      const cartId = url.searchParams.get("cart_id");
      if (!cartId) {
        responseStatus = 400;
        responseBody = { error: "Missing cart_id", request_id: requestId };
        return jsonResponse(responseBody, { status: responseStatus });
      }

      const { data: cart, error: cartError } = await supabase
        .from("ai_carts")
        .select("id, currency, status")
        .eq("id", cartId)
        .maybeSingle();

      if (cartError) throw new Error(cartError.message);
      if (!cart) {
        responseStatus = 404;
        responseBody = { error: "Cart not found", request_id: requestId };
        return jsonResponse(responseBody, { status: responseStatus });
      }

      const cartState = await buildCartTotals(supabase, cart.id, cart.currency ?? store.currency ?? "USD");
      responseBody = { request_id: requestId, cart: cartState };
      responseStatus = 200;
      return jsonResponse(responseBody, { status: responseStatus });
    }

    if (path === "/cart" && req.method === "POST") {
      const payload = await req.json().catch(() => ({}));
      const currency = payload.currency ?? store.currency ?? "USD";
      const cartId = payload.cart_id ?? null;

      let activeCartId = cartId as string | null;

      if (!activeCartId) {
        const { data: created, error: createError } = await supabase
          .from("ai_carts")
          .insert({ currency, status: "open", agent_key_id: agentId })
          .select("id")
          .maybeSingle();
        if (createError || !created) throw new Error(createError?.message ?? "Failed to create cart");
        activeCartId = created.id;
      }

      const items: any[] = Array.isArray(payload.items) ? payload.items : [];
      if (items.length) {
        for (const item of items) {
          const productId = item.product_id;
          const variantId = item.variant_id ?? null;
          const quantity = Number(item.quantity ?? 1);

          if (!productId || !Number.isFinite(quantity) || quantity <= 0) continue;

          let unitPrice: number | null = null;
          if (variantId) {
            const { data: variant } = await supabase
              .from("product_variants")
              .select("price")
              .eq("id", variantId)
              .eq("product_id", productId)
              .maybeSingle();
            unitPrice = variant?.price != null ? Number(variant.price) : null;
          }

          if (unitPrice == null) {
            const { data: product } = await supabase
              .from("products")
              .select("price")
              .eq("id", productId)
              .maybeSingle();
            unitPrice = product?.price != null ? Number(product.price) : 0;
          }

          const { data: existing } = await supabase
            .from("ai_cart_items")
            .select("id, quantity")
            .eq("cart_id", activeCartId)
            .eq("product_id", productId)
            .eq("variant_id", variantId)
            .maybeSingle();

          if (existing?.id) {
            await supabase
              .from("ai_cart_items")
              .update({ quantity: Number(existing.quantity) + quantity, unit_price: unitPrice })
              .eq("id", existing.id);
          } else {
            await supabase.from("ai_cart_items").insert({
              cart_id: activeCartId,
              product_id: productId,
              variant_id: variantId,
              quantity,
              unit_price: unitPrice,
            });
          }
        }
      }

      const cartState = await buildCartTotals(supabase, activeCartId, currency);
      responseBody = { request_id: requestId, cart: cartState };
      responseStatus = 200;
      return jsonResponse(responseBody, { status: responseStatus });
    }

    responseStatus = 404;
    responseBody = { error: "Not found", request_id: requestId };
    return jsonResponse(responseBody, { status: responseStatus });
  } catch (err) {
    responseStatus = 500;
    responseBody = { error: (err as Error)?.message ?? "Internal error", request_id: requestId };
    return jsonResponse(responseBody, { status: responseStatus });
  } finally {
    const durationMs = Date.now() - startedAt;
    await supabase.from("ai_agent_requests").insert({
      key_id: agentId,
      path,
      method: req.method,
      status: responseStatus,
      duration_ms: durationMs,
      ip,
      user_agent: userAgent,
    }).catch(() => {});
  }
};

serve(handler);
