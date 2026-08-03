import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (!input?.userId || typeof input.userId !== "string") throw new Error("userId is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin, error: roleError } = await supabase.rpc("is_super_admin", { _user_id: userId });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin) throw new Error("Forbidden: only Super Admins can delete users");
    if (data.userId === userId) throw new Error("You cannot delete your own account");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Prevent removing the last remaining Super Admin
    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    if ((targetRoles ?? []).some((r) => r.role === "super_admin")) {
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "super_admin");
      if ((count ?? 0) <= 1) throw new Error("Cannot delete the last remaining Super Admin");
    }

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("students").update({ profile_id: null }).eq("profile_id", data.userId);
    await supabaseAdmin.from("staff").update({ profile_id: null }).eq("profile_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);


    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
