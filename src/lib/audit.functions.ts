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
  details: z.record(z.any()).optional().nullable(),
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("audit_logs").insert({
      tenant_id: data.tenant_id,
      actor_id: context.userId,
      action: data.action,
      entity_type: data.entity_type,
      entity_id: data.entity_id,
      campus_id: data.campus_id,
      details: (data.details ?? null) as Json | null,
    });
    if (error) throw error;
    return { ok: true };
  });
