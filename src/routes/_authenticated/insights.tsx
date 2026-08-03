import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/insights")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
