// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const email = typeof body?.order_notification_email === "string" ? body?.order_notification_email : null;
    const storeEmail = typeof body?.store_email === "string" ? body?.store_email : null;
    const enabledVal = body?.order_email_enabled;
    const enabled = typeof enabledVal === "boolean" ? enabledVal : true;
    if (!email) {
      return new Response(JSON.stringify({ error: "order_notification_email is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: existing, error: fetchErr } = await supabase
      .from("site_settings")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fetchErr && fetchErr.code !== "PGRST116") {
      return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const now = new Date().toISOString();
    if (existing && (existing as any)?.id) {
      const { error: updErr } = await supabase
        .from("site_settings")
        .update({ order_notification_email: email, store_email: storeEmail ?? undefined, order_email_enabled: enabled, updated_at: now })
        .eq("id", (existing as any).id);
      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      const { error: insErr } = await supabase
        .from("site_settings")
        .insert({ order_notification_email: email, store_email: storeEmail ?? email, order_email_enabled: enabled, created_at: now, updated_at: now });
      if (insErr) {
        return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
