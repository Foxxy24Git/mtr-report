import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { listOpenRevisionsForUser } from "@/lib/activityRevision";
import { RevisiListClient } from "@/components/revisi/RevisiListClient";

export const dynamic = "force-dynamic";

export default async function RevisiPage() {
  const session = await requireSession();
  if (session.role !== "user") redirect("/dashboard");

  const items = await listOpenRevisionsForUser(session.sub);

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Revisi</h1>
        <p className="page-subtitle">
          Kegiatan yang diminta Supervisi untuk diperbaiki sebelum laporan
          shift bisa disetujui.
        </p>
      </div>
      <RevisiListClient initialItems={items} />
    </div>
  );
}
