import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { listCatatanSupervisiForOwner } from "@/lib/shiftReportQueries";
import { CatatanSupervisiListClient } from "@/components/supervisi/CatatanSupervisiListClient";

export const dynamic = "force-dynamic";

export default async function CatatanSupervisiPage() {
  const session = await requireSession();
  if (session.role !== "user") redirect("/dashboard");

  const items = await listCatatanSupervisiForOwner(session.sub);

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Catatan Supervisi</h1>
        <p className="page-subtitle">
          Catatan yang diberikan supervisi saat menyetujui laporan shift Anda.
        </p>
      </div>
      <CatatanSupervisiListClient initialItems={items} />
    </div>
  );
}
