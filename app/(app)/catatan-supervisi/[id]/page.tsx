import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getShiftReportDetail } from "@/lib/shiftReportQueries";
import { ShiftReportDetailClient } from "@/components/supervisi/ShiftReportDetailClient";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function CatatanSupervisiDetailPage({ params }: Params) {
  const { id } = await params;
  const session = await requireSession();
  if (session.role !== "user") redirect("/dashboard");

  const report = await getShiftReportDetail(id);
  if (!report) notFound();
  // Petugas hanya boleh buka laporan miliknya sendiri (owner).
  if (report.ownerUserId !== session.sub) redirect("/catatan-supervisi");

  return (
    <ShiftReportDetailClient
      report={report}
      peran={null}
      backHref="/catatan-supervisi"
      backLabel="Kembali ke Catatan Supervisi"
    />
  );
}
