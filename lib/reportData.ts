import "server-only";
import { ShiftKode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SHIFT_LABELS } from "@/lib/constants";
import { SERVERS } from "@/lib/suhuServer";
import type {
  ReportData,
  ReportTicket,
  ReportAcCheck,
  ReportServer,
  ReportSignatures,
} from "@/lib/excelReport";

const TZ = "Asia/Jakarta";
const SHIFTS = Object.values(ShiftKode) as string[];

export interface GatherParams {
  tanggal: string; // YYYY-MM-DD (WIB)
  shift?: string | null;
  ownerUserId?: string | null;
}

export interface GatherResult {
  data: ReportData;
  filename: string;
  count: number;
}

function fmtTimeWIB(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(d);
}

function fmtHariTgl(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(d);
}

function fmtTglLabel(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(d);
}

function uniqueJoin(values: (string | null | undefined)[]): string {
  const seen = new Set<string>();
  for (const v of values) {
    const s = (v ?? "").trim();
    if (s) seen.add(s);
  }
  return [...seen].join(" / ");
}

/** Gabung data laporan untuk satu tanggal (+ shift / owner opsional). */
export async function gatherReportData(p: GatherParams): Promise<GatherResult> {
  const startWib = new Date(`${p.tanggal}T00:00:00+07:00`);
  const endWib = new Date(startWib.getTime() + 24 * 60 * 60 * 1000);

  const [y, m, d] = p.tanggal.split("-").map(Number);
  const jumlahHari = new Date(y, m, 0).getDate();
  const tanggalDate = new Date(Date.UTC(y, m - 1, d));

  const shift = p.shift && SHIFTS.includes(p.shift) ? (p.shift as ShiftKode) : null;

  // ----------------------- Tiket -----------------------
  const ticketRows = await prisma.ticket.findMany({
    where: {
      waktuOpen: { gte: startWib, lt: endWib },
      ...(shift ? { shiftKode: shift } : {}),
      ...(p.ownerUserId ? { ownerUserId: p.ownerUserId } : {}),
    },
    orderBy: { waktuOpen: "asc" },
    include: {
      atm: { select: { kodeAtm: true, namaAtm: true } },
      owner: { select: { nama: true } },
      approver: { select: { nama: true, ttdUrl: true } },
      pimpinanInfra: { select: { nama: true } },
      pimpinanDivisi: { select: { nama: true } },
      activities: { orderBy: { waktu: "asc" }, include: { user: { select: { nama: true } } } },
    },
  });

  const tickets: ReportTicket[] = ticketRows.map((t, i) => {
    const cp =
      t.cpTipe === "wag"
        ? "WAG"
        : t.cpTipe === "pic"
          ? `${t.cpNama ?? "-"}${t.cpTelp ? ` (${t.cpTelp})` : ""}`
          : "-";
    const unit = t.atm ? `${t.atm.kodeAtm} – ${t.atm.namaAtm}` : "-";
    return {
      no: i + 1,
      waktuKejadian: t.waktuOpen,
      unitKerja: unit,
      waktuRespon: t.waktuResponInternal ? fmtTimeWIB(t.waktuResponInternal) : "-",
      contactPerson: cp,
      jenisGangguan: t.jenisGangguan ?? "-",
      sumberPenyebab: t.sumberPenyebab ?? "-",
      metodePenanganan: t.metodePenanganan ?? "-",
      vendor: t.vendor ?? "-",
      activities: t.activities.map((a) => ({
        waktu: a.waktu,
        teks: a.teks,
        isTindakLanjut: a.isTindakLanjutFlag,
      })),
      noTiketVendor: t.noTiketVendor ?? "-",
      waktuSelesai: t.status === "selesai" ? t.waktuSelesai : null,
      keterangan: t.keterangan ?? "-",
    };
  });

  // ----------------------- Suhu AC & Log Server -----------------------
  let acChecks: ReportAcCheck[] = [];
  let servers: ReportServer[] = SERVERS.map((s) => ({ label: s.label, awal: "-", akhir: "-" }));

  if (shift) {
    const [acRows, serverRows] = await Promise.all([
      prisma.acTempLog.findMany({
        where: { tanggal: tanggalDate, shiftKode: shift },
        orderBy: { urutan: "asc" },
      }),
      prisma.serverLog.findMany({ where: { tanggal: tanggalDate, shiftKode: shift } }),
    ]);

    acChecks = acRows.map((a) => ({
      urutan: a.urutan,
      waktu: a.waktuPantau,
      room: a.suhuRoomServer ?? "",
      panel: a.suhuPanel ?? "",
      kiri: a.statusAktifKiri,
      kanan: a.statusAktifKanan,
      p12kiri: a.pantau12jamKiri ?? "",
      p12kanan: a.pantau12jamKanan ?? "",
    }));

    const awal = serverRows.find((s) => s.fase === "awal");
    const akhir = serverRows.find((s) => s.fase === "akhir");
    servers = SERVERS.map((s) => ({
      label: s.label,
      awal: (awal?.[s.key] as string | null) ?? "-",
      akhir: (akhir?.[s.key] as string | null) ?? "-",
    }));
  }

  // ----------------------- Tanda tangan -----------------------
  const defaultLeaders = await prisma.leader.findMany({
    where: { aktif: true, isPjs: false },
    orderBy: { nama: "asc" },
  });
  const defInfra = defaultLeaders.find((l) => l.jabatan === "infrastruktur")?.nama ?? "";
  const defDivisi = defaultLeaders.find((l) => l.jabatan === "divisi")?.nama ?? "";

  const approver = ticketRows.find((t) => t.statusSupervisi === "approved" && t.approver);

  const signatures: ReportSignatures = {
    penyerah: uniqueJoin(ticketRows.map((t) => t.owner.nama)),
    // Serah terima kini batch otomatis tanpa pemilihan petugas penerima —
    // kolom penerima ditandatangani manual pada form.
    penerima: "",
    supervisi: uniqueJoin(
      ticketRows.filter((t) => t.statusSupervisi === "approved").map((t) => t.approver?.nama ?? null)
    ),
    supervisiTtdPath: approver?.approver?.ttdUrl ?? null,
    pimpinanInfra:
      uniqueJoin(ticketRows.map((t) => t.pimpinanInfra?.nama ?? null)) || defInfra,
    pimpinanDivisi:
      uniqueJoin(ticketRows.map((t) => t.pimpinanDivisi?.nama ?? null)) || defDivisi,
  };

  // ----------------------- Meta & nama file -----------------------
  const namaPetugas = signatures.penyerah || "-";
  const shiftLabel = shift ? SHIFT_LABELS[shift] ?? `Shift ${shift}` : "Semua Shift";

  const data: ReportData = {
    hariTgl: fmtHariTgl(startWib),
    tanggalLabel: fmtTglLabel(startWib),
    namaPetugas,
    shiftLabel,
    jumlahHari,
    tickets,
    acChecks,
    servers,
    signatures,
  };

  const ownerSlug = p.ownerUserId ? `-user-${(namaPetugas || "user").replace(/\s+/g, "_")}` : "";
  const shiftSlug = shift ? `-Shift${shift}` : "";
  const filename = `Laporan-Harian-${p.tanggal}${shiftSlug}${ownerSlug}.xlsx`;

  return { data, filename, count: tickets.length };
}
