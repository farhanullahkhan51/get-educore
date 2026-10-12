import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const PENDING_CLAIM_KEY = "educore.pendingStudentClaim";

/** Links the signed-in account to a student record (student code + guardian phone). */
export async function claimStudentAccount(code: string, phone: string) {
  const { data, error } = await supabase.rpc("claim_student_account", { _code: code, _phone: phone });
  if (error) return { ok: false, message: "Could not verify right now. Please try again." };
  return data as { ok: boolean; message: string };
}

/** Runs a claim saved during registration (used once the user has a session). */
export async function runPendingClaim(): Promise<{ ok: boolean; message: string } | null> {
  const raw = localStorage.getItem(PENDING_CLAIM_KEY);
  if (!raw) return null;
  localStorage.removeItem(PENDING_CLAIM_KEY);
  try {
    const { code, phone } = JSON.parse(raw);
    return await claimStudentAccount(String(code), String(phone));
  } catch {
    return null;
  }
}

export function ClaimStudentForm({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true);
        const res = await claimStudentAccount(String(fd.get("code")).trim(), String(fd.get("phone")).trim());
        setBusy(false);
        if (!res.ok) return toast.error(res.message);
        toast.success(res.message);
        await qc.invalidateQueries();
        onDone?.();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="cl-code">Student code / Roll no.</Label>
        <Input id="cl-code" name="code" required maxLength={40} placeholder="e.g. STU-2024-0012" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cl-phone">Guardian phone (as given to the school)</Label>
        <Input id="cl-phone" name="phone" required maxLength={20} inputMode="tel" placeholder="0300 1234567" />
      </div>
      <Button type="submit" disabled={busy}>{busy ? "Verifying…" : "Activate my portal"}</Button>
    </form>
  );
}
