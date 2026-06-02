import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { listShiftReports } from "@/lib/shiftReportQueries";
import { ShiftReportListClient } from "@/components/supervisi/ShiftReportListClient";

export const dynamic = "force-dynamic";

export default async function SupervisiPage() {
  const session = await requireSession();
  if (session.role !== "supervisi" && session.role !== "superadmin") {
    redirect("/dashboard");
  }

  // Supervisi melihat laporan shift miliknya; superadmin (override) melihat semua.
  const items = await listShiftReports({
    supervisiId: session.role === "supervisi" ? session.sub : null,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Supervisi</h1>
        <p className="page-subtitle">
          Tinjau laporan shift yang menunggu persetujuan. Setujui satu laporan
          shift sekaligus — tanda tangan digital Anda otomatis terpasang di
          laporan Excel shift tersebut.
        </p>
      </div>
      <ShiftReportListClient initialItems={items} />
    </div>
  );
}
