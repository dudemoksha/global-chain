import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/site/app-shell";
import { getMyProfile } from "@/lib/profile.functions";
import { bulkUpload, listUploadHistory } from "@/lib/uploads.functions";

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });
const histQuery = queryOptions({ queryKey: ["uploads"], queryFn: () => listUploadHistory() });

type Kind = "suppliers" | "factories" | "inventory";

const TEMPLATES: Record<Kind, string[]> = {
  suppliers: ["legal_name", "country", "industry", "category", "criticality", "lead_time_days"],
  factories: ["name", "country", "city", "capacity_units", "products", "warehouse"],
  inventory: ["sku", "name", "warehouse", "current_stock", "safety_stock", "reorder_level", "unit"],
};

export const Route = createFileRoute("/_authenticated/uploads")({
  head: () => ({ meta: [{ title: "Upload center · Global-Chain" }, { name: "robots", content: "noindex" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(meQuery);
    await context.queryClient.ensureQueryData(histQuery).catch(() => []);
    return null;
  },
  component: UploadsPage,
});

function UploadsPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: history } = useSuspenseQuery(histQuery);
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>("suppliers");
  const [result, setResult] = useState<{ ok: number; failed: number; errors: Array<{ row: number; message: string }> } | null>(null);

  const upload = useMutation({
    mutationFn: (v: { kind: Kind; filename: string; rows: Record<string, unknown>[] }) =>
      bulkUpload({ data: v }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["uploads"] });
      qc.invalidateQueries({ queryKey: [kind === "suppliers" ? "suppliers" : kind] });
    },
  });

  async function onFile(file: File) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: "" });
    setResult(null);
    upload.mutate({ kind, filename: file.name, rows });
  }

  function downloadTemplate() {
    const cols = TEMPLATES[kind];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([cols]);
    XLSX.utils.book_append_sheet(wb, ws, kind);
    XLSX.writeFile(wb, `globalchain-${kind}-template.xlsx`);
  }

  return (
    <AppShell isAdmin={me.isAdmin} email={me.profile?.work_email ?? ""}>
      <div className="mx-auto max-w-[1240px] px-6 py-12">
        <div className="mono-label">§ Data ingestion</div>
        <h1 className="mt-2 font-display text-[32px] font-medium tracking-tight">Upload center</h1>
        <p className="mt-2 max-w-xl text-[13.5px] text-muted-foreground">
          Import suppliers, factories or inventory in bulk from an .xlsx file.
          Download a template for the correct column order.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded-md border border-border bg-card p-6">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TEMPLATES) as Kind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setKind(k); setResult(null); }}
                  className={`rounded-md border px-3 py-1.5 text-[12.5px] font-medium capitalize ${
                    kind === k ? "border-foreground bg-foreground text-background" : "border-border"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-md border border-dashed border-border p-8 text-center">
              <p className="text-[13px] text-muted-foreground">
                Drop or select an .xlsx / .csv file with these columns:
              </p>
              <p className="mt-2 font-mono text-[12px]">{TEMPLATES[kind].join(" · ")}</p>
              <div className="mt-5 flex justify-center gap-3">
                <label className="cursor-pointer rounded-md bg-foreground px-3.5 py-2 text-[13px] font-medium text-background">
                  Choose file
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="rounded-md border border-border px-3.5 py-2 text-[13px] font-medium"
                >
                  Download template
                </button>
              </div>
              {upload.isPending && <p className="mt-3 text-[12px] text-muted-foreground">Processing…</p>}
            </div>

            {result && (
              <div className="mt-6 rounded-md border border-border p-4">
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-[22px] font-medium tabular-nums">{result.ok}</span>
                  <span className="text-[13px] text-muted-foreground">imported</span>
                  <span className="mono-label ml-auto">{result.failed} failed</span>
                </div>
                {result.errors.length > 0 && (
                  <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-[12px] text-muted-foreground">
                    {result.errors.map((e, i) => (
                      <li key={i}>Row {e.row}: {e.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="rounded-md border border-border bg-card p-6">
            <div className="mono-label">Upload history</div>
            {history.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted-foreground">No previous uploads.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {history.map((h) => (
                  <li key={h.id} className="py-2.5 text-[12.5px]">
                    <div className="flex items-baseline justify-between">
                      <span className="font-medium">{h.filename}</span>
                      <span className="mono-label">{h.kind}</span>
                    </div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {new Date(h.created_at).toLocaleString()} · {h.rows_ok} ok · {h.rows_failed} failed
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
