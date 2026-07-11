import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "super_admin"
  | "campus_admin"
  | "admissions_officer"
  | "finance_officer"
  | "teacher"
  | "student";

export interface CurrentUserData {
  userId: string;
  email: string | null;
  fullName: string | null;
  campusId: string | null;
  roles: AppRole[];
  primaryRole: AppRole | null;
}

async function fetchCurrentUser(): Promise<CurrentUserData | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [profileRes, rolesRes] = await Promise.all([
    supabase.from("profiles").select("full_name, email, campus_id").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  const roles = (rolesRes.data ?? []).map((r) => r.role as AppRole);
  const priorityOrder: AppRole[] = [
    "super_admin",
    "campus_admin",
    "finance_officer",
    "admissions_officer",
    "teacher",
    "student",
  ];
  const primaryRole = priorityOrder.find((r) => roles.includes(r)) ?? null;

  return {
    userId: user.id,
    email: profileRes.data?.email ?? user.email ?? null,
    fullName: profileRes.data?.full_name ?? null,
    campusId: profileRes.data?.campus_id ?? null,
    roles,
    primaryRole,
  };
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    staleTime: 1000 * 60,
  });
}

export function roleLabel(role: AppRole | null): string {
  switch (role) {
    case "super_admin": return "Super Admin";
    case "campus_admin": return "Campus Admin";
    case "admissions_officer": return "Admissions Officer";
    case "finance_officer": return "Finance Officer";
    case "teacher": return "Teacher";
    case "student": return "Student";
    default: return "Member";
  }
}
