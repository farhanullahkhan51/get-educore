import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Row = { month: string; income: number; expense: number; net: number };
const money = (n: number) => `PKR ${Math.round(n).toLocaleString("en-PK")}`;

export function PnlWidget({ campusId }: { campusId: string | null }) {
  const { data = [], isError } = useQuery({
    queryKey: ["finance-pnl", campusId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("finance_pnl_monthly" as any, { _campus: campusId, _months: 6 } as any);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  if (isError) return null;
  const tot = data.reduce((a, r) => ({ income: a.income + Number(r.income), expense: a.expense + Number(r.expense) }), { income: 0, expense: 0 });
  const net = tot.income - tot.expense;
  const max = Math.max(1, ...data.flatMap((r) => [Number(r.income), Number(r.expense)]));
  return (
    <Card className="mb-6 shadow-none">
      <CardHeader className="pb-2"><CardTitle className="text-base">Income vs Expenses · last 6 months</CardTitle></CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
          <div><div className="text-xs text-muted-foreground">Fees collected</div><div className="font-semibold">{money(tot.income)}</div></div>
          <div><div className="text-xs text-muted-foreground">Expenses</div><div className="font-semibold">{money(tot.expense)}</div></div>
          <div><div className="text-xs text-muted-foreground">Net cash flow</div><div className={`font-semibold ${net < 0 ? "text-destructive" : "text-primary"}`}>{money(net)}</div></div>
        </div>
        <div className="flex h-28 items-end gap-3">
          {data.map((r) => (
            <div key={r.month} className="flex flex-1 flex-col items-center gap-1" title={`${r.month}: in ${money(r.income)}, out ${money(r.expense)}`}>
              <div className="flex h-24 w-full items-end justify-center gap-1">
                <div className="w-1/3 rounded-sm bg-primary" style={{ height: `${(Number(r.income) / max) * 100}%` }} />
                <div className="w-1/3 rounded-sm bg-destructive/70" style={{ height: `${(Number(r.expense) / max) * 100}%` }} />
              </div>
              <div className="text-[10px] text-muted-foreground">{r.month.slice(5)}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary" />Fees collected</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-destructive/70" />Approved expenses</span>
        </div>
      </CardContent>
    </Card>
  );
}
