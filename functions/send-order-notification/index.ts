// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers for all responses
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Handle CORS preflight requests
const handleCors = (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }
  return null;
};

const sendEmail = async (
  toEmail: string,
  subject: string,
  text: string,
  html: string,
  opts?: { replyTo?: string | null; fromName?: string | null; fromEmail?: string | null }
) => {
  try {
    const apiKey = Deno.env.get("RESEND_API_KEY") || "";
    const fromEmail = Deno.env.get("RESEND_FROM") || "";
    if (!apiKey) {
      return { success: false, error: "CONFIG_MISSING: Missing RESEND_API_KEY" };
    }
    if (!fromEmail && !opts?.fromEmail) {
      return { success: false, error: "CONFIG_MISSING: Missing sender email (RESEND_FROM or opts.fromEmail)" };
    }

    const chosenFrom = opts?.fromEmail?.trim() || fromEmail;
    const fromHeader = opts?.fromName ? `${opts.fromName} <${chosenFrom}>` : chosenFrom;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromHeader,
        to: [toEmail],
        subject,
        text,
        html,
        reply_to: opts?.replyTo || undefined,
      }),
    });

    if (!resp.ok) {
      const details = await resp.text();
      return { success: false, error: details || `Email provider error (${resp.status})` };
    }

    return { success: true };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error };
  }
};

const escapeHtml = (v: string) =>
  v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isSafeEmail = (v: unknown): v is string => {
  if (typeof v !== "string") return false;
  if (v.length < 3 || v.length > 254) return false;
  if (/[\r\n]/.test(v)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
};

type OrderRow = {
  id: string;
  created_at: string;
  status: string | null;
  total_price: number | null;
  user_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  shipping_address: string | null;
};

type OrderItemRow = {
  quantity: number;
  price: number;
  product: { name: string | null } | null;
  variant_data: { variant_name?: string } | null;
};

const handler = async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Simple GET diagnostics
  if (req.method === "GET") {
    try {
      const urlObj = new URL(req.url);
      const diag = urlObj.searchParams.get("diag");
      if (diag === "1") {
        const hasSupabaseUrl = !!Deno.env.get("SUPABASE_URL");
        const hasServiceRole = !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const hasResendKey = !!Deno.env.get("RESEND_API_KEY");
        const hasResendFrom = !!Deno.env.get("RESEND_FROM");
        let dbOk = false;
        let dbError: string | null = null;
        try {
          const supabase = createClient(
            Deno.env.get("SUPABASE_URL") || "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
          );
          const { error } = await supabase.from("site_settings").select("id").limit(1);
          dbOk = !error;
          dbError = error ? (error.message || "unknown") : null;
        } catch (e) {
          dbOk = false;
          dbError = e instanceof Error ? e.message : String(e);
        }
        return new Response(
          JSON.stringify({
            ok: true,
            endpoint: "send-order-notification",
            env: {
              supabaseUrl: hasSupabaseUrl,
              serviceRole: hasServiceRole,
              resendKey: hasResendKey,
              resendFrom: hasResendFrom,
            },
            db: { ok: dbOk, error: dbError },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ ok: true, function: "send-order-notification" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch {
      return new Response(
        JSON.stringify({ ok: false, function: "send-order-notification" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const payloadRaw = await req.json().catch(() => null);
    const payload = isRecord(payloadRaw) ? payloadRaw : {};
    const orderId = typeof payload.orderId === "string" ? payload.orderId : undefined;
    const testEmail = payload.testEmail === true;
    const emailAddress = typeof payload.emailAddress === "string" ? payload.emailAddress : undefined;
    const statusUpdate = payload.statusUpdate === true;
    const newStatus = typeof payload.newStatus === "string" ? payload.newStatus : undefined;
    const paymentMethod = typeof payload.paymentMethod === "string" ? payload.paymentMethod : undefined;
    const paymentStatus = typeof payload.paymentStatus === "string" ? payload.paymentStatus : undefined;
    const adminEmailOverride = typeof payload.adminEmail === "string" ? payload.adminEmail : undefined;

    if (testEmail) {
      if (!emailAddress) {
        return new Response(JSON.stringify({ error: "emailAddress is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Fetch store email to use as the sender
      const { data: st } = await supabase
        .from("site_settings")
        .select("contact_email, order_notification_email, company_name")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      const rawStore = (st as any)?.contact_email || (st as any)?.order_notification_email || emailAddress;
      const sender = isSafeEmail(rawStore) ? rawStore : emailAddress;
      const subject = "Order notifications test";
      const text = "This is a test email from your store's order notification system.";
      const html = `<p>${escapeHtml(text)}</p>`;
      const r = await sendEmail(emailAddress, subject, text, html, { fromEmail: sender, fromName: `${(st as any)?.company_name || "Store"} Orders` });
      if (!r.success) {
        return new Response(JSON.stringify({ error: "Failed to send test email", details: r.error }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!orderId) {
      return new Response(JSON.stringify({ error: "Order ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Fetch order details
    const { data: orderRaw, error: orderError } = await supabase
      .from("orders")
      .select("id, created_at, status, total_price, user_id, customer_email, customer_name, customer_phone, shipping_address")
      .eq("id", orderId)
      .maybeSingle();
    const order = (orderRaw as unknown as OrderRow | null) ?? null;
    
    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: "Order not found", details: orderError }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    
    // Fetch order items
    const { data: orderItemsRaw, error: orderItemsError } = await supabase
      .from("order_items")
      .select(`
        quantity,
        price,
        variant_data,
        product:product_id(name)
      `)
      .eq("order_id", orderId);
    const orderItems = (orderItemsRaw as unknown as OrderItemRow[] | null) ?? [];
    
    if (orderItemsError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch order items", details: orderItemsError }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    
    const { data: siteSettings, error: siteSettingsError } = await supabase
      .from("site_settings")
      .select("order_notification_email, contact_email, company_name")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (siteSettingsError) {
      console.error("Error fetching site settings:", siteSettingsError);
      // Continue with the default email if settings can't be fetched
    }
    
    const emailEnabled = true;
    // Store email is the single sender identity for all emails
    const rawStore = adminEmailOverride || siteSettings?.order_notification_email || siteSettings?.contact_email || "admin@example.com";
    const storeEmail = isSafeEmail(rawStore) ? rawStore : "admin@example.com";
    const storeName = siteSettings?.company_name || "Store";
    if (!emailEnabled) {
      return new Response(
        JSON.stringify({ success: false, message: "Order email notifications disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure email is sent only once per order
    const { data: existingNote } = await supabase
      .from("notifications")
      .select("id")
      .eq("order_id", orderId)
      .eq("type", "order_email_sent")
      .maybeSingle();
    if (existingNote) {
      return new Response(
        JSON.stringify({ success: true, message: "Order email already sent" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Format order details for the email
    const orderDate = new Date(order.created_at).toLocaleString();
    let customerEmail: string | null = order.customer_email;
    if (!customerEmail && order.user_id) {
      try {
        const { data: u } = await supabase.auth.admin.getUserById(order.user_id);
        customerEmail = u?.user?.email || null;
      } catch (err) {
        console.error("Error fetching user email:", err);
      }
    }
    
    // Format order items for the email
    const getItemLabel = (item: OrderItemRow) => {
      const productName = item.product?.name || "Unknown Product";
      const variantName = item.variant_data?.variant_name;
      const label = variantName && variantName !== "Default"
        ? `${productName} - ${variantName}`
        : productName;
      return label;
    };

    const formattedItemsText = orderItems.map((item) => {
      const label = getItemLabel(item);
      const price = Number(item.price || 0);
      const quantity = Number(item.quantity || 0);
      const total = price * quantity;
      return `- ${label} x${quantity} @ $${price.toFixed(2)} = $${total.toFixed(2)}`;
    }).join("\n");

    const formattedItemsHtml = orderItems.map((item) => {
      const label = getItemLabel(item);
      const price = Number(item.price || 0);
      const quantity = Number(item.quantity || 0);
      const total = price * quantity;
      return `<li>${escapeHtml(label)} x${quantity} @ $${price.toFixed(2)} = $${total.toFixed(2)}</li>`;
    }).join("");
    
    // Create email content
    const orderShortId = `#${orderId.slice(-6)}`;
    const total = Number(order.total_price || 0);
    const customerName = order.customer_name || "";
    const customerPhone = order.customer_phone || "";
    const shippingAddress = order.shipping_address || "";
    const status = order.status || "pending";

    const adminSubject = statusUpdate && newStatus
      ? `Order ${orderShortId} status: ${newStatus}`
      : `New Order – Order ${orderShortId}`;

    const adminText = [
      `A new order has been placed.`,
      ``,
      `Customer Name: ${customerName || "-"}`,
      `Customer Email: ${customerEmail || "-"}`,
      `Phone: ${customerPhone || "-"}`,
      ``,
      `Shipping Address:`,
      `${shippingAddress || "-"}`,
      ``,
      `Order Details:`,
      `${formattedItemsText || "-"}`,
      ``,
      `Total: $${total.toFixed(2)}`,
      `Payment Method: ${paymentMethod || "N/A"}`,
      `Payment Status: ${paymentStatus || (statusUpdate ? (newStatus || status) : status)}`,
      ``,
      `Order ID: ${orderShortId}`,
      `Order Date: ${orderDate}`,
    ].join("\n");

    const adminHtml = `
      <h2>New Order – Order ${escapeHtml(orderShortId)}</h2>
      <p>A new order has been placed.</p>
      <h3>Customer Information</h3>
      <p><strong>Full name:</strong> ${escapeHtml(customerName || "-")}</p>
      <p><strong>Email:</strong> ${escapeHtml(customerEmail || "-")}</p>
      <p><strong>Phone number:</strong> ${escapeHtml(customerPhone || "-")}</p>
      <h3>Shipping Address</h3>
      <pre style="white-space:pre-wrap">${escapeHtml(shippingAddress || "-")}</pre>
      <h3>Order Details</h3>
      <ul>${formattedItemsHtml || "<li>-</li>"}</ul>
      <p><strong>Total:</strong> $${total.toFixed(2)}</p>
      <p><strong>Payment Method:</strong> ${escapeHtml(paymentMethod || "N/A")}</p>
      <p><strong>Payment Status:</strong> ${escapeHtml(paymentStatus || (statusUpdate ? (newStatus || status) : status))}</p>
      <p><strong>Order ID:</strong> ${escapeHtml(orderShortId)}</p>
      <p><strong>Order Date:</strong> ${escapeHtml(orderDate)}</p>
    `;

    // Admin notification: FROM store email TO store email (self-send)
    let adminResult = await sendEmail(
      storeEmail,
      adminSubject,
      adminText,
      adminHtml,
      { replyTo: customerEmail || null, fromName: `${storeName} Orders`, fromEmail: storeEmail }
    );
    if (!adminResult.success) {
      // Fallback: try provider default sender if storeEmail is not yet verified
      adminResult = await sendEmail(
        storeEmail,
        adminSubject,
        adminText,
        adminHtml,
        { replyTo: customerEmail || null, fromName: `${storeName} Orders` }
      );
      if (!adminResult.success) {
        await supabase.from("notifications").insert({
          type: "order_email_error",
          message: `Admin email failed for order ${orderId}: ${String(adminResult.error)}`,
          order_id: orderId,
          is_read: false,
        }).then(() => {}).catch(() => {});
        return new Response(JSON.stringify({ error: "Failed to send admin email", details: adminResult.error }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Log that fallback sender was used
      await supabase.from("notifications").insert({
        type: "order_email_sent",
        message: `Admin email sent for order ${orderId} using fallback sender`,
        order_id: orderId,
        is_read: false,
      }).then(() => {}).catch(() => {});
    }
    await supabase.from("notifications").insert({
      type: "order_email_sent",
      message: `Admin email sent for order ${orderId}`,
      order_id: orderId,
      is_read: false,
    }).then(() => {}).catch(() => {});

    // Customer notification: FROM store email TO customer email
    if (customerEmail) {
      const customerSubject = statusUpdate && newStatus ? `Update on your order ${orderShortId}: ${newStatus}` : `Order Confirmation ${orderShortId}`;
      const customerText = [
        `Thank you for your order from ${storeName}!`,
        ``,
        `Order ID: ${orderShortId}`,
        `Date: ${orderDate}`,
        `Status: ${statusUpdate && newStatus ? newStatus : status}`,
        ``,
        `Items:`,
        formattedItemsText || "-",
        ``,
        `Total: $${total.toFixed(2)}`,
        `Payment Method: ${paymentMethod || "N/A"}`,
        ``,
        `Shipping Address:`,
        shippingAddress || "-",
        ``,
        `If you have any questions, reply to this email or contact us at ${storeEmail}.`,
      ].join("\n");
      const customerHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#333;">Thank you for your order!</h2>
          <p>Hi ${escapeHtml(customerName || "there")}, your order from <strong>${escapeHtml(storeName)}</strong> has been received.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:4px 8px;color:#666;">Order ID</td><td style="padding:4px 8px;font-weight:bold;">${escapeHtml(orderShortId)}</td></tr>
            <tr><td style="padding:4px 8px;color:#666;">Date</td><td style="padding:4px 8px;">${escapeHtml(orderDate)}</td></tr>
            <tr><td style="padding:4px 8px;color:#666;">Status</td><td style="padding:4px 8px;">${escapeHtml(statusUpdate && newStatus ? newStatus : status)}</td></tr>
            <tr><td style="padding:4px 8px;color:#666;">Payment</td><td style="padding:4px 8px;">${escapeHtml(paymentMethod || "N/A")}</td></tr>
          </table>
          <h3 style="color:#333;">Order Items</h3>
          <ul style="padding-left:20px;">${formattedItemsHtml || "<li>-</li>"}</ul>
          <p style="font-size:18px;font-weight:bold;">Total: $${total.toFixed(2)}</p>
          <h3 style="color:#333;">Shipping Address</h3>
          <pre style="white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:4px;">${escapeHtml(shippingAddress || "-")}</pre>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
          <p style="color:#666;font-size:13px;">If you have any questions, reply to this email or contact us at ${escapeHtml(storeEmail)}.</p>
        </div>
      `;
      await sendEmail(
        customerEmail,
        customerSubject,
        customerText,
        customerHtml,
        { replyTo: storeEmail, fromName: `${storeName}`, fromEmail: storeEmail }
      );
    }
    
    // Return success response
    return new Response(
      JSON.stringify({ success: true, message: "Order email sent", adminTo: storeEmail, customerTo: customerEmail || null }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
