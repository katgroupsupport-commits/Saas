import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type OrderRequest = {
  groupId: number | string;
  planName: string;
  duration: string;
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

async function isGroupAdmin(supabaseUrl: string, anonKey: string, authHeader: string, groupId: number) {
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data, error } = await userClient.rpc("is_group_admin", { target_group_id: groupId });
  if (error) throw error;
  return Boolean(data);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const razorpayKeyId = requiredEnv("RAZORPAY_KEY_ID");
    const razorpayKeySecret = requiredEnv("RAZORPAY_KEY_SECRET");
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return jsonResponse({ error: "Missing authorization." }, 401);

    const body = await req.json() as OrderRequest;
    const groupId = Number(body.groupId);
    if (!Number.isFinite(groupId)) return jsonResponse({ error: "Invalid group id." }, 400);
    if (!body.planName || !body.duration) return jsonResponse({ error: "Plan name and duration are required." }, 400);
    if (!(await isGroupAdmin(supabaseUrl, anonKey, authHeader, groupId))) {
      return jsonResponse({ error: "Only a group admin can buy a plan for this group." }, 403);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: plan, error: planError } = await adminClient
      .from("xxfp_subscription_plans")
      .select("*")
      .eq("plan_name", body.planName)
      .eq("duration", body.duration)
      .maybeSingle();
    if (planError) throw planError;
    if (!plan) return jsonResponse({ error: "Selected plan was not found." }, 404);

    const amount = Number(plan.amount || 0);
    if (!amount || amount <= 0) return jsonResponse({ error: "Free plan does not require Razorpay payment." }, 400);

    const receipt = `bg_${groupId}_${Date.now().toString().slice(-8)}`;
    const credentials = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency: "INR",
        receipt,
        notes: {
          group_id: String(groupId),
          subscription_plan_id: String(plan.subscription_plan_id),
          plan_name: String(plan.plan_name),
          duration: String(plan.duration)
        }
      })
    });

    const order = await orderResponse.json();
    if (!orderResponse.ok) {
      return jsonResponse({ error: order?.error?.description ?? "Unable to create Razorpay order.", details: order }, 502);
    }

    return jsonResponse({
      order,
      plan: {
        id: plan.subscription_plan_id,
        name: plan.plan_name,
        duration: plan.duration,
        amount: Number(plan.amount),
        maxMembers: Number(plan.max_members),
        features: String(plan.features ?? "").split(",").filter(Boolean)
      }
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unable to create Razorpay order." }, 500);
  }
});
