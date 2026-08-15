import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type VerifyRequest = {
  groupId: number | string;
  planName: string;
  duration: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toHex(signature);
}

async function isGroupAdmin(supabaseUrl: string, anonKey: string, authHeader: string, groupId: number) {
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data, error } = await userClient.rpc("is_group_admin", { target_group_id: groupId });
  if (error) throw error;
  return Boolean(data);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
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
    const razorpayKeySecret = requiredEnv("RAZORPAY_KEY_SECRET");
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return jsonResponse({ error: "Missing authorization." }, 401);

    const body = await req.json() as VerifyRequest;
    const groupId = Number(body.groupId);
    if (!Number.isFinite(groupId)) return jsonResponse({ error: "Invalid group id." }, 400);
    if (!body.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) {
      return jsonResponse({ error: "Missing Razorpay payment verification fields." }, 400);
    }
    if (!(await isGroupAdmin(supabaseUrl, anonKey, authHeader, groupId))) {
      return jsonResponse({ error: "Only a group admin can activate this subscription." }, 403);
    }

    const expectedSignature = await hmacSha256Hex(
      razorpayKeySecret,
      `${body.razorpay_order_id}|${body.razorpay_payment_id}`
    );
    if (expectedSignature !== body.razorpay_signature) {
      return jsonResponse({ error: "Razorpay signature verification failed." }, 400);
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

    const now = new Date();
    const endDate = addMonths(now, String(plan.duration).toLowerCase() === "yearly" ? 12 : 1);
    const transactionReference = `${body.razorpay_payment_id}|${body.razorpay_order_id}`;

    const { data: subscription, error: subscriptionError } = await adminClient
      .from("xxfp_group_subscriptions")
      .insert([{
        group_id: groupId,
        subscription_plan_id: plan.subscription_plan_id,
        start_date: toIsoDate(now),
        end_date: toIsoDate(endDate),
        payment_status: "PAID",
        transaction_reference: transactionReference
      }])
      .select("*")
      .single();
    if (subscriptionError) throw subscriptionError;

    return jsonResponse({
      subscription,
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
    return jsonResponse({ error: error instanceof Error ? error.message : "Unable to verify Razorpay payment." }, 500);
  }
});
