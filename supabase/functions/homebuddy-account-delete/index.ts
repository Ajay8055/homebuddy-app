import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Sign in again before deleting your account." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Your session has expired. Sign in again and retry." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const householdId = body?.householdId ?? null;
    const transferToUserId = body?.transferToUserId ?? null;
    if (householdId !== null && (typeof householdId !== "string" || !/^[0-9a-f-]{36}$/i.test(householdId))) {
      return new Response(JSON.stringify({ error: "Invalid household selection." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (transferToUserId !== null && (typeof transferToUserId !== "string" || !/^[0-9a-f-]{36}$/i.test(transferToUserId))) {
      return new Response(JSON.stringify({ error: "Invalid ownership transfer selection." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: memberships, error: membershipError } = await userClient
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .limit(2);
    if (membershipError) throw new Error(membershipError.message);
    if ((memberships ?? []).length > 1) {
      throw new Error("Your account belongs to more than one household. Contact support before deleting it.");
    }

    const actualHouseholdId = memberships?.[0]?.household_id ?? null;
    if (actualHouseholdId && householdId && householdId !== actualHouseholdId) {
      throw new Error("The selected household does not match your account membership.");
    }
    if (!actualHouseholdId && (householdId || transferToUserId)) {
      throw new Error("No household membership was found for this account.");
    }

    let exitDisposition: string | null = null;
    if (actualHouseholdId) {
      const { data: disposition, error: exitError } = await userClient.rpc("prepare_household_owner_exit", {
        target_household_id: actualHouseholdId,
        transfer_to_user_id: transferToUserId,
      });
      if (exitError) throw new Error(exitError.message);
      exitDisposition = disposition;
    }

    // Deleting the auth user cascades their private expenses, notifications,
    // device subscriptions and membership. Shared records are retained and
    // their author/payer references become NULL through ON DELETE SET NULL.
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      if (exitDisposition === "archived" || exitDisposition === "transferred") {
        const { error: rollbackError } = await adminClient.rpc("rollback_household_owner_exit", {
          target_household_id: actualHouseholdId,
          original_owner_id: user.id,
          transfer_to_user_id: transferToUserId,
        });
        if (rollbackError) {
          throw new Error("Account deletion failed and household rollback also failed. Please contact support before retrying. " + rollbackError.message);
        }
      }
      throw new Error(deleteError.message);
    }

    return new Response(JSON.stringify({ success: true, householdDisposition: transferToUserId ? "transferred" : "archived_or_member_exit" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Account deletion failed." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
