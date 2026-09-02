import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useEntitlements, type FeatureKey } from "@/lib/entitlements";

/**
 * Renders children only when the institution's plan (and chosen examination
 * system) includes the feature; otherwise shows an upgrade notice.
 */
export function FeatureGate({
  feature,
  title,
  children,
}: {
  feature: FeatureKey;
  title: string;
  children: ReactNode;
}) {
  const { can, planName, isLoading } = useEntitlements();
  if (isLoading) return null;
  if (can(feature)) return <>{children}</>;

  return (
    <Card className="mx-auto mt-10 max-w-lg shadow-none">
      <CardContent className="space-y-3 py-10 text-center">
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="font-serif text-lg">{title} is not part of your plan</h2>
        <p className="text-sm text-muted-foreground">
          {planName ? `Your ${planName} plan` : "Your current plan"} does not include this module.
          Contact your administrator to upgrade.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
