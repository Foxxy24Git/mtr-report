import { requireSession } from "@/lib/session";
import { MonitoringSlaClient } from "@/components/monitoring-sla/MonitoringSlaClient";

export const dynamic = "force-dynamic";

export default async function MonitoringSlaPage() {
  // Akses semua role (user, supervisi, superadmin).
  await requireSession();

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Monitoring SLA</h1>
        <p className="page-subtitle">
          Dashboard agregat SLA periode: rata-rata SLA, ATM/jaringan dengan SLA
          terendah &amp; paling sering bermasalah, serta distribusi jenis
          gangguan dan sumber penyebab. Pilih rentang tanggal &amp; kategori
          untuk menelusuri.
        </p>
      </div>
      <MonitoringSlaClient />
    </div>
  );
}
