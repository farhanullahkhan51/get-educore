import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useCurrentUser, roleLabel, type AppRole } from "@/hooks/use-current-user";
import { useTenant } from "@/lib/tenant-context";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Building2,
  BookOpen,
  Users,
  UserCog,
  GraduationCap,
  Layers,
  LogOut,
  ShieldCheck,
  Inbox,
  Wallet,
  BookMarked,
  ClipboardCheck,
  Award,
  Landmark,
  Menu,
  CalendarDays,
  ArrowDownUp,
  Megaphone,
  CalendarCheck,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { AssistantMenu } from "@/components/assistant/assistant-menu";
import { EditableList } from "@/components/layout/editable";
import { EditModeButton, EditModeBanner } from "@/components/layout/edit-mode-bar";
import { PullToRefresh } from "@/components/layout/pull-to-refresh";
import { useEntitlements, type FeatureKey } from "@/lib/entitlements";
import { TrialBanner } from "@/components/layout/trial-banner";
import { ReadOnlyShield } from "@/components/layout/read-only-shield";
import { RouteProgress } from "@/components/layout/route-progress";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
  /** Plan/academic-system capability required to see this module. */
  feature?: FeatureKey;
}

const NAV: NavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["super_admin", "campus_admin", "admissions_officer", "finance_officer", "teacher"],
  },

  { to: "/portal", label: "My Portal", icon: GraduationCap, roles: ["student"], feature: "portal" },
  { to: "/campuses", label: "Campuses", icon: Building2, roles: ["super_admin"] },
  { to: "/programs", label: "Programs", icon: BookOpen, roles: ["super_admin", "campus_admin"] },
  {
    to: "/classes",
    label: "Classes & Sections",
    icon: Layers,
    roles: ["super_admin", "campus_admin"],
  },
  {
    to: "/admissions",
    label: "Admissions",
    icon: Inbox,
    roles: ["super_admin", "campus_admin", "admissions_officer"],
    feature: "admissions",
  },
  {
    to: "/students",
    label: "Students",
    icon: GraduationCap,
    roles: ["super_admin", "campus_admin", "admissions_officer", "finance_officer", "teacher"],
  },
  { to: "/staff", label: "Staff & HR", icon: Users, roles: ["super_admin", "campus_admin", "teacher"] },
  { to: "/courses", label: "Courses", icon: BookMarked, roles: ["super_admin", "campus_admin"] },
  {
    to: "/academics",
    label: "Academics",
    icon: ClipboardCheck,
    roles: ["super_admin", "campus_admin", "teacher"],
    feature: "academics",
  },
  {
    to: "/results",
    label: "Results",
    icon: Award,
    roles: ["super_admin", "campus_admin", "teacher"],
  },
  {
    to: "/board",
    label: "BISE Board",
    icon: Landmark,
    roles: ["super_admin", "campus_admin", "admissions_officer"],
    feature: "board",
  },
  {
    to: "/cambridge",
    label: "Cambridge",
    icon: BookMarked,
    roles: ["super_admin", "campus_admin", "admissions_officer"],
    feature: "cambridge",
  },
  {
    to: "/track-switch",
    label: "Track Switch",
    icon: Layers,
    roles: ["super_admin", "campus_admin"],
    feature: "track_switch",
  },
  {
    to: "/timetable",
    label: "Timetable",
    icon: CalendarDays,
    roles: ["super_admin", "campus_admin", "teacher"],
    feature: "timetable",
  },
  {
    to: "/notices",
    label: "Notice Board",
    icon: Megaphone,
    roles: ["super_admin", "campus_admin", "admissions_officer", "finance_officer", "teacher"],
    feature: "notices",
  },
  {
    to: "/fees",
    label: "Fees & Finance",
    icon: Wallet,
    roles: ["super_admin", "campus_admin", "finance_officer"],
    feature: "fees",
  },
  {
    to: "/certificates",
    label: "Certificates",
    icon: Award,
    roles: ["super_admin", "campus_admin", "admissions_officer"],
    feature: "certificates",
  },
  {
    to: "/import-export",
    label: "Import & Export",
    icon: ArrowDownUp,
    roles: ["super_admin", "campus_admin"],
  },
  { to: "/billing", label: "Billing & Plan", icon: Wallet, roles: ["super_admin"] },
  { to: "/users", label: "Users & Roles", icon: UserCog, roles: ["super_admin"] },
  { to: "/platform", label: "Platform Admin", icon: ShieldCheck, roles: ["super_admin"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useCurrentUser();
  const { tenant, preview, setPreview } = useTenant();
  const ent = useEntitlements();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const brandBlock = (
    <div className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border">
      {tenant?.logo_url ? (
        <img
          src={tenant.logo_url}
          alt={`${tenant.name} logo`}
          className="h-8 w-8 rounded-sm object-contain bg-sidebar-primary-foreground"
        />
      ) : (
        <div className="grid h-8 w-8 place-items-center rounded-sm bg-sidebar-primary text-sidebar-primary-foreground">
          <GraduationCap className="h-4 w-4" />
        </div>
      )}
      <div>
        <div className="font-serif text-base font-semibold text-sidebar-primary">
          {tenant?.name ?? "EduCore"}
        </div>
        <div className="text-[10px] uppercase tracking-widest opacity-60">Admin Suite</div>
      </div>
    </div>
  );

  const navByPath = new Map(NAV.map((item) => [item.to, item]));

  const navList = (onNavigate?: () => void) => (
    <EditableList
      scope="sidebar"
      className="flex-1 space-y-0.5 overflow-y-auto p-3"
      render={(block) => {
        const item = navByPath.get(block.id);
        if (!item) return null;
        if (!(user?.roles.some((r) => item.roles.includes(r)) ?? false)) return null;
        if (item.feature && !ent.can(item.feature)) return null;
        const Icon = item.icon;
        const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
        return (
          <Link
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {block.label}
          </Link>
        );
      }}
    />
  );

  const userBlock = (
    <div className="border-t border-sidebar-border p-3">
      <div className="mb-2 px-2 text-xs">
        <div className="truncate font-medium text-sidebar-primary">
          {isLoading ? "…" : (user?.fullName ?? user?.email ?? "Signed in")}
        </div>
        <div className="flex items-center gap-1 opacity-70">
          <ShieldCheck className="h-3 w-3" />
          {roleLabel(user?.primaryRole ?? null)}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={signOut}
        className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <LogOut className="mr-2 h-4 w-4" /> Sign out
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <RouteProgress />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>
      {preview && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-foreground px-4 py-1.5 text-xs text-background">
          <span className="truncate">
            Previewing <strong className="font-semibold">{preview.name}</strong> — branding only,
            data is unchanged
          </span>
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="shrink-0 rounded-sm border border-background/40 px-2 py-0.5 font-medium hover:bg-background/15"
          >
            Exit preview
          </button>
        </div>
      )}
      <aside
        className={`hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex ${preview ? "pt-7" : ""}`}
      >
        {brandBlock}
        {navList()}
        {userBlock}
      </aside>

      <main className={`flex-1 overflow-x-hidden ${preview ? "pt-7" : ""}`}>
        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-background px-4 py-3 md:hidden">
          <div className="flex items-center gap-2 min-w-0">
            {tenant?.logo_url ? (
              <img src={tenant.logo_url} alt="" className="h-7 w-7 rounded-sm object-contain" />
            ) : (
              <div className="grid h-7 w-7 place-items-center rounded-sm bg-primary text-primary-foreground">
                <GraduationCap className="h-4 w-4" />
              </div>
            )}
            <div className="font-serif text-sm font-semibold truncate">
              {tenant?.name ?? "EduCore"}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {ent.can("edit_mode") && <EditModeButton />}
            {ent.can("ai_assistant") && <AssistantMenu />}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open navigation">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-72 bg-sidebar text-sidebar-foreground p-0 flex flex-col"
              >
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                {brandBlock}
                {navList(() => setMobileOpen(false))}
                {userBlock}
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Desktop top bar */}
        <div className="sticky top-0 z-30 hidden items-center justify-end border-b bg-background px-6 py-2 md:flex">
          <div className="flex items-center gap-2">
            {ent.can("edit_mode") && <EditModeButton />}
            {ent.can("ai_assistant") && <AssistantMenu />}
          </div>
        </div>

        <div data-allow-readonly>
          <TrialBanner />
        </div>
        <ReadOnlyShield />

        <EditModeBanner />

        <PullToRefresh>
          <div
            id="main-content"
            key={location.pathname}
            className="animate-page-enter mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8"
          >
            {children}
          </div>
        </PullToRefresh>
      </main>
    </div>
  );
}
