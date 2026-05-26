import { prisma } from "@/lib/prisma";
import { DataAtmClient } from "@/components/data-atm/DataAtmClient";

export const dynamic = "force-dynamic";

export default async function DataAtmPage() {
  const [items, total] = await Promise.all([
    prisma.atmMaster.findMany({ orderBy: { kodeAtm: "asc" }, take: 200 }),
    prisma.atmMaster.count(),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Data ATM &amp; Jaringan</h1>
        <p className="page-subtitle">
          Master data ATM &amp; jaringan beserta vendor. Semua petugas dapat
          menambah data baru.
        </p>
      </div>
      <DataAtmClient initialItems={items} total={total} />
    </div>
  );
}
