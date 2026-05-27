import { ShiftKode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { fmtDate } from "@/lib/format";
import { parseTanggal, todayKeyWIB } from "@/lib/suhuServer";
import {
  SuhuServerClient,
  type AcLog,
  type ServerLog,
} from "@/components/suhu-server/SuhuServerClient";
import { ShiftRequiredNotice } from "@/components/ShiftRequiredNotice";

export const dynamic = "force-dynamic";

export default async function SuhuServerPage() {
  const session = await requireSession();

  if (!(Object.values(ShiftKode) as string[]).includes(session.shift)) {
    return <ShiftRequiredNotice />;
  }

  const tanggalKey = todayKeyWIB();
  const tanggal = parseTanggal(tanggalKey)!;
  const shiftKode = session.shift as ShiftKode;

  const [acRows, serverRows] = await Promise.all([
    prisma.acTempLog.findMany({
      where: { tanggal, shiftKode },
      orderBy: { urutan: "asc" },
    }),
    prisma.serverLog.findMany({ where: { tanggal, shiftKode } }),
  ]);

  const initialAc: AcLog[] = acRows.map((r) => ({
    id: r.id,
    urutan: r.urutan,
    waktuPantau: r.waktuPantau.toISOString(),
    suhuRoomServer: r.suhuRoomServer,
    suhuPanel: r.suhuPanel,
    statusAktifKiri: r.statusAktifKiri,
    statusAktifKanan: r.statusAktifKanan,
    pantau12jamKiri: r.pantau12jamKiri,
    pantau12jamKanan: r.pantau12jamKanan,
  }));

  const initialServer: ServerLog[] = serverRows.map((r) => ({
    id: r.id,
    fase: r.fase,
    npay: r.npay,
    ajAtmb: r.ajAtmb,
    bifast: r.bifast,
    prima: r.prima,
    cipHost: r.cipHost,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Suhu AC &amp; Log Server</h1>
        <p className="page-subtitle">
          Pemantauan suhu ruang server (3× per shift) dan log kondisi server
          NPAY, AJ-ATMB, BI-FAST, PRIMA, &amp; Cip-Host (awal &amp; akhir shift).
        </p>
      </div>
      <SuhuServerClient
        tanggal={tanggalKey}
        tanggalLabel={fmtDate(tanggal)}
        shift={session.shift}
        nama={session.nama}
        initialAc={initialAc}
        initialServer={initialServer}
      />
    </div>
  );
}
