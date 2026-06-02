import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getShiftReportDetail } from "@/lib/shiftReportQueries";
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

  // Supervisi hanya boleh membuka laporan yang terikat ke dirinya. Superadmin
  // (override/emergency) boleh membuka semua tetapi tidak meng-approve.
  if (session.role === "supervisi" && report.supervisiId !== session.sub) {
    redirect("/supervisi");
  }

  return (
    <ShiftReportDetailClient
      report={report}
      canApprove={session.role === "supervisi" && report.supervisiId === session.sub}
    />
  );
}
