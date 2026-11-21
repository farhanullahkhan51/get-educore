import { createFileRoute } from "@tanstack/react-router";
import { verifyChallan } from "@/lib/challan-verify.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/verify/challan/$id")({
  validateSearch: (s: Record<string, unknown>) => ({ t: typeof s["t"] === "string" ? (s["t"] as string) : "" }),
  loaderDeps: ({ search }) => ({ t: search.t }),
  loader: async ({ params, deps }) => {
    try {
      return { challan: await verifyChallan({ data: { id: params.id, t: deps.t } }) };
    } catch {
      return { challan: null };
    }
  },
  head: () => ({
    meta: [
      { title: "Fee Voucher Verification" },
      { name: "description", content: "Live payment status of a scanned fee voucher." },
      { property: "og:title", content: "Fee Voucher Verification" },
      { property: "og:description", content: "Live payment status of a scanned fee voucher." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: VerifyPage,
});

const fmt = (n: number) =>
  new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(n);

function VerifyPage() {
  const { challan: c } = Route.useLoaderData();
  if (!c) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-3 p-8 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="text-xl font-semibold">Voucher not found</h1>
            <p className="text-sm text-muted-foreground">This QR code does not match any fee voucher. It may be invalid or cancelled.</p>
          </CardContent>
        </Card>
      </main>
    );
  }
  const variant = c.status === "paid" || c.status === "waived" ? "default" : c.status === "overdue" ? "destructive" : "secondary";
  const rows: [string, string][] = [
    ["Student", c.studentName],
    ["Student ID", c.studentCode],
    ["Campus", c.campusName || "—"],
    ["Fee type", `${c.category}${c.periodLabel ? ` · ${c.periodLabel}` : ""}`],
    ["Issue date", c.issueDate],
    ["Due date", c.dueDate],
    ...(c.paidOn ? ([["Paid on", c.paidOn]] as [string, string][]) : []),
  ];
  const money: [string, number, boolean?][] = [
    ["Fee amount", c.gross],
    ["Discount / scholarship", -c.discount],
    ["Fine / late fee", c.fine],
    ["Net payable", c.net, true],
    ["Paid", c.paid],
    ["Balance due", c.balance, true],
  ];
  return (
    <main className="flex min-h-screen items-start justify-center bg-muted p-4 sm:items-center">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Verified fee voucher</p>
              <h1 className="text-lg font-semibold">Challan {c.challanNo}</h1>
            </div>
            <Badge variant={variant} className="ml-auto uppercase">{c.status}</Badge>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-medium capitalize">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="divide-y rounded-md border text-sm">
            {money.map(([k, v, bold]) => (
              <div key={k} className={`flex justify-between px-3 py-2 ${bold ? "bg-muted font-semibold" : ""}`}>
                <span>{k}</span>
                <span>{v < 0 ? `− ${fmt(-v)}` : fmt(v)}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground">Live status at {new Date().toLocaleString("en-PK")}</p>
        </CardContent>
      </Card>
    </main>
  );
}
