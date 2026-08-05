import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getShiftReportDetail } from "@/lib/shiftReportQueries";
import { resolvePeranApproval } from "@/lib/shiftReportApproval";
import { ShiftReportDetailClient } from "@/components/supervisi/ShiftReportDetailClient";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function SupervisiShiftReportPage({ params }: Params) {
  const { id } = await params;
  const session = await requireSession();
  if (session.role !== "supervisi" && session.role !== "superadmin") {
    redirect("/dashboard");
  }

  const report = await getShiftReportDetail(id);
  if (!report) notFound();

  // Supervisi hanya boleh membuka laporan yang terikat ke dirinya — sebagai
  // supervisi utama ATAU supervisi selanjutnya (shift malam). Superadmin
  // (override/emergency) boleh membuka semua tetapi tidak meng-approve.
  const peran = resolvePeranApproval(
    {
      shiftKode: report.shiftKode,
      supervisiId: report.supervisiId,
      supervisiNextId: report.supervisiNextId,
    },
    session.sub
  );
  if (session.role === "supervisi" && !peran) {
    redirect("/supervisi");
  }

  return (
    <ShiftReportDetailClient
      report={report}
      peran={session.role === "supervisi" ? peran : null}
    />
  );
}
