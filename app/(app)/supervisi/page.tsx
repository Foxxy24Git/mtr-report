import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { listTickets } from "@/lib/ticketQueries";
import { SupervisiClient } from "@/components/supervisi/SupervisiClient";

export const dynamic = "force-dynamic";

export default async function SupervisiPage() {
  const session = await requireSession();
  if (session.role !== "supervisi" && session.role !== "superadmin") {
    redirect("/dashboard");
  }

  // Supervisi hanya melihat tiket yang terikat ke dirinya; superadmin (override
  // emergency) melihat semua tiket (PRD revisi §4).
  const items = await listTickets({
    currentUserId: session.sub,
    supervisiId: session.role === "supervisi" ? session.sub : null,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Supervisi</h1>
        <p className="page-subtitle">
          Tinjau tiket gangguan ATM &amp; jaringan, lihat seluruh kronologi, lalu
          setujui. Tiket dapat di-approve setelah ditutup (Selesai); tanda tangan
          digital Anda otomatis terpasang di laporan.
        </p>
      </div>
      <SupervisiClient initialItems={items} />
    </div>
  );
}
