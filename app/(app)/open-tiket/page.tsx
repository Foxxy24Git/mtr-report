import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { OpenTiketForm } from "@/components/open-tiket/OpenTiketForm";
import { ShiftRequiredNotice } from "@/components/ShiftRequiredNotice";
import { SHIFT_LABELS } from "@/lib/constants";
import { ALL_SHIFTS, type ShiftCode } from "@/lib/shift";

export const dynamic = "force-dynamic";

export default async function OpenTiketPage() {
  const session = await requireSession();

  if (!ALL_SHIFTS.includes(session.shift as ShiftCode)) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="page-title">Open Tiket</h1>
          <p className="page-subtitle">
            Buka tiket gangguan ATM / jaringan.
          </p>
        </div>
        <ShiftRequiredNotice />
      </div>
    );
  }

  const lookups = await prisma.masterLookup.findMany({
    orderBy: { nilai: "asc" },
    select: { tipe: true, nilai: true },
  });

  const opsi = {
    jenis_gangguan: [] as string[],
    sumber_penyebab: [] as string[],
    jenis_penanganan: [] as string[],
  };
  for (const l of lookups) opsi[l.tipe].push(l.nilai);

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Open Tiket</h1>
        <p className="page-subtitle">
          Buka tiket gangguan ATM / jaringan. Nomor tiket dibuat otomatis. PIC
          shift: <span className="font-medium">{session.nama}</span> ·{" "}
          {SHIFT_LABELS[session.shift] ?? `Shift ${session.shift}`}
        </p>
      </div>
      <OpenTiketForm opsi={opsi} />
    </div>
  );
}
