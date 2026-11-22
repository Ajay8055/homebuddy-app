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
      .select("household_id,role")
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
      const { data: otherMembers, error: otherMembersError } = await userClient
        .from("household_members").select("user_id")
        .eq("household_id", actualHouseholdId).neq("user_id", user.id);
      if (otherMembersError) throw new Error(otherMembersError.message);
      if ((otherMembers ?? []).length === 0 && !transferToUserId) {
        // A final member deleting their account must not leave an orphaned household.
        exitDisposition = "delete_empty_household";
      } else {
        const { data: disposition, error: exitError } = await userClient.rpc("prepare_household_owner_exit", {
          target_household_id: actualHouseholdId,
          transfer_to_user_id: transferToUserId,
        });
        if (exitError) throw new Error(exitError.message);
        exitDisposition = disposition;
      }
    }

    // Remove the Auth identity only after the household ownership transition succeeds.
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

    let emptyHouseholdCleanupWarning = false;
    if (exitDisposition === "delete_empty_household" && actualHouseholdId) {
      try {
        const bucket = adminClient.storage.from("homebuddy-documents");
        const { data: folders, error: listError } = await bucket.list(actualHouseholdId, { limit: 1000 });
        if (listError) throw listError;
        for (const folder of (folders ?? []).filter((x:any) => !x.id)) {
          const { data: files, error: filesError } = await bucket.list(actualHouseholdId + "/" + folder.name, { limit: 1000 });
          if (filesError) throw filesError;
          const paths = (files ?? []).filter((x:any) => x.id).map((x:any) => actualHouseholdId + "/" + folder.name + "/" + x.name);
          if (paths.length) { const { error } = await bucket.remove(paths); if (error) throw error; }
        }
        const { error: householdDeleteError } = await adminClient.from("households").delete().eq("id", actualHouseholdId);
        if (householdDeleteError) throw householdDeleteError;
      } catch (e) {
        emptyHouseholdCleanupWarning = true;
        console.error("Account deleted; empty household cleanup needs attention", e);
      }
    }

    // These tables intentionally do not all have auth.users foreign keys. Clean
    // up user-owned rows explicitly after Auth deletion; preserve shared records.
    const cleanup = await Promise.allSettled([
      adminClient.from("household_members").delete().eq("user_id", user.id),
      adminClient.from("personal_expenses").delete().eq("user_id", user.id),
      adminClient.from("notifications").delete().eq("user_id", user.id),
      adminClient.from("notification_preferences").delete().eq("user_id", user.id),
      adminClient.from("notification_subscriptions").delete().eq("user_id", user.id),
      adminClient.from("native_push_tokens").delete().eq("user_id", user.id),
      adminClient.from("bills").update({ created_by: null }).eq("created_by", user.id),
      adminClient.from("household_tasks").update({ created_by: null }).eq("created_by", user.id),
      adminClient.from("household_tasks").update({ assigned_to: null }).eq("assigned_to", user.id),
      adminClient.from("household_events").update({ created_by: null }).eq("created_by", user.id),
      adminClient.from("maintenance_reminders").update({ created_by: null }).eq("created_by", user.id),
      adminClient.from("home_assets").update({ created_by: null }).eq("created_by", user.id),
      adminClient.from("household_documents").update({ uploaded_by: null }).eq("uploaded_by", user.id),
      adminClient.from("shared_expenses").update({ created_by: null }).eq("created_by", user.id),
      adminClient.from("shared_expenses").update({ paid_by: null }).eq("paid_by", user.id),
    ]);
    const cleanupFailures = cleanup.filter(x => x.status === "rejected" || (x.status === "fulfilled" && x.value?.error)).length;
    if (cleanupFailures) console.error("Account deleted; some related rows need cleanup", cleanupFailures);

    return new Response(JSON.stringify({ success: true, householdDisposition: exitDisposition === "delete_empty_household" ? "deleted" : transferToUserId ? "transferred" : "archived_or_member_exit", cleanupWarnings: cleanupFailures + (emptyHouseholdCleanupWarning ? 1 : 0) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Account deletion failed." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
