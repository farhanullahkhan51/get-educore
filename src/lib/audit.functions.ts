import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

const insertAuditLogSchema = z.object({
  tenant_id: z.string().uuid(),
  action: z.string().min(1).max(40),
  entity_type: z.string().min(1).max(80),
  entity_id: z.string().uuid().optional().nullable(),
  campus_id: z.string().uuid().optional().nullable(),
  details: z.any().optional().nullable(),
});

/**
 * Insert an audit log entry as the authenticated user.
 * Uses the service-role client so the row can be written regardless of
 * the caller's admin status, while the server function itself requires
 * a signed-in session and records that user's ID as the actor.
 */
export const insertAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => insertAuditLogSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Never trust caller-supplied scope: derive the tenant from the caller's own profile
    // and only keep a campus the caller can actually access.
    const { data: tenantId } = await context.supabase.rpc("get_user_tenant", { _user_id: context.userId });
    if (!tenantId) throw new Error("No institution is linked to your account.");
    let campusId: string | null = null;
    if (data.campus_id) {
      const { data: ok } = await context.supabase.rpc("has_campus_access", {
        _user_id: context.userId,
        _campus_id: data.campus_id,
      });
      campusId = ok ? data.campus_id : null;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("audit_logs").insert({
      tenant_id: tenantId as string,
      actor_id: context.userId,
      action: data.action,
      entity_type: data.entity_type,
      entity_id: data.entity_id,
      campus_id: campusId,
      details: (data.details ?? null) as Json | null,
    });
    if (error) throw error;
    return { ok: true };
  });
