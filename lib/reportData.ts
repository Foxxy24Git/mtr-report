import "server-only";
import { ShiftKode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SHIFT_LABELS } from "@/lib/constants";
import { SERVERS } from "@/lib/suhuServer";
import { buildReportTicketWhere } from "@/lib/reportQuery";
import { resolveSender, resolveAcknowledger, resolveLeaderName } from "@/lib/reportSignatures";
import { resolveShiftReportSignatures } from "@/lib/shiftReport";
import { resolveReportLogoPath } from "@/lib/appSettings";
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
    // Filter shift via openShiftKode (shift asal, immutable) — bukan shiftKode
    // current yang dimutasi saat serah terima. Lihat lib/reportQuery.ts.
    where: buildReportTicketWhere({
      startWib,
      endWib,
      shift,
      ownerUserId: p.ownerUserId,
    }),
    orderBy: { waktuOpen: "asc" },
    include: {
      atm: { select: { kodeAtm: true, namaAtm: true } },
      owner: { select: { nama: true, ttdUrl: true } },
      approver: { select: { nama: true, ttdUrl: true } },
      pimpinanInfra: { select: { nama: true, tipe: true, namaPjs: true } },
      pimpinanDivisi: { select: { nama: true, tipe: true, namaPjs: true } },
      activities: { orderBy: { waktu: "asc" }, include: { user: { select: { nama: true } } } },
    },
  });

  // Urutan baris laporan (PRD §4.D revisi): tiket SELESAI tampil lebih dulu,
  // lalu tiket DALAM PROSES (yang diteruskan ke shift berikutnya) di bawah.
  // Query sudah orderBy waktuOpen asc, jadi partisi stabil ini menjaga urutan
  // waktu_open ASC di dalam masing-masing kelompok.
  const orderedRows = [
    ...ticketRows.filter((t) => t.status === "selesai"),
    ...ticketRows.filter((t) => t.status !== "selesai"),
  ];

  const tickets: ReportTicket[] = orderedRows.map((t, i) => {
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
  const approver = ticketRows.find((t) => t.statusSupervisi === "approved" && t.approver);

  // Pimpinan & supervisi penanda tangan dipilih saat serah terima shift
  // (PRD revisi §2): ambil handover terbaru shift ini pada tanggal laporan.
  const handover = shift
    ? await prisma.shiftHandover.findFirst({
        where: { fromShift: shift, at: { gte: startWib, lt: endWib } },
        orderBy: { at: "desc" },
        include: {
          pimpinanInfra: { select: { nama: true, tipe: true, namaPjs: true } },
          pimpinanDivisi: { select: { nama: true, tipe: true, namaPjs: true } },
          supervisi: { select: { nama: true, ttdUrl: true } },
          fromUser: { select: { nama: true, ttdUrl: true } },
          toUser: { select: { nama: true, ttdUrl: true } },
        },
      })
    : null;

  // PART 4: blok tanda tangan bersumber dari ShiftReport bila ada (paradigma
  // approval baru). Ambil laporan shift untuk (shift, hari, owner?) terbaru.
  const shiftReport = shift
    ? await prisma.shiftReport.findFirst({
        where: {
          shiftKode: shift,
          tanggal: { gte: startWib, lt: endWib },
          ...(p.ownerUserId ? { ownerUserId: p.ownerUserId } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          ownerUser: { select: { nama: true, ttdUrl: true } },
          receiverUser: { select: { nama: true, ttdUrl: true } },
          supervisi: { select: { nama: true, ttdUrl: true } },
          pimpinanInfra: { select: { nama: true, tipe: true, namaPjs: true } },
          pimpinanDivisi: { select: { nama: true, tipe: true, namaPjs: true } },
        },
      })
    : null;

  // Supervisi sudah approve jika ada tiket approved pada laporan (PRD revisi §4).
  const supervisiApproved = Boolean(approver);

  // Penyerah (C26): owner tiket PERTAMA shift (owner awal) — TTD selalu ikut
  // walau laporan diunduh sebelum serah terima. Fallback: fromUser handover →
  // gabungan nama owner. ticketRows sudah orderBy waktuOpen asc → [0] = paling awal.
  const sender = resolveSender(
    ticketRows[0]?.owner,
    handover?.fromUser,
    uniqueJoin(ticketRows.map((t) => t.owner.nama))
  );

  let signatures: ReportSignatures;
  if (shiftReport) {
    // Paradigma baru (PART 4): seluruh blok tanda tangan dari ShiftReport.
    // Penyerah jatuh ke owner-pertama-tiket bila owner laporan tak bernama.
    const s = resolveShiftReportSignatures(shiftReport);
    signatures = {
      penyerah: s.penyerah || sender.nama,
      penyerahTtdPath: s.penyerah ? s.penyerahTtdPath : sender.ttdPath,
      penerima: s.penerima,
      penerimaTtdPath: s.penerimaTtdPath,
      supervisi: s.supervisi,
      supervisiApproved: s.supervisiApproved,
      supervisiTtdPath: s.supervisiTtdPath,
      pimpinanInfra: s.pimpinanInfra,
      pimpinanDivisi: s.pimpinanDivisi,
    };
  } else {
    // Fallback (data lama tanpa ShiftReport): logika handover/tiket lama.
    signatures = {
      penyerah: sender.nama,
      penyerahTtdPath: sender.ttdPath,
      // Penerima: petugas yang dipilih saat serah terima (to_user / receiver).
      penerima: handover?.toUser?.nama ?? "",
      penerimaTtdPath: handover?.toUser?.ttdUrl ?? null,
      supervisi:
        handover?.supervisi?.nama ||
        uniqueJoin(
          ticketRows
            .filter((t) => t.statusSupervisi === "approved")
            .map((t) => t.approver?.nama ?? null)
        ),
      supervisiApproved,
      // TTD supervisi hanya relevan setelah approve (excel meng-gate via flag).
      supervisiTtdPath: supervisiApproved
        ? handover?.supervisi?.ttdUrl ?? approver?.approver?.ttdUrl ?? null
        : null,
      // O26/R26: pimpinan pilihan handover → fallback pimpinan tingkat tiket.
      // Tanpa default — kosong sampai dipilih saat serah terima (PART 4).
      // Nama yang dicetak mengikuti tipe: PJS → nama_pjs (PART 5).
      pimpinanInfra: resolveAcknowledger(
        resolveLeaderName(handover?.pimpinanInfra),
        uniqueJoin(ticketRows.map((t) => resolveLeaderName(t.pimpinanInfra) || null))
      ),
      pimpinanDivisi: resolveAcknowledger(
        resolveLeaderName(handover?.pimpinanDivisi),
        uniqueJoin(ticketRows.map((t) => resolveLeaderName(t.pimpinanDivisi) || null))
      ),
    };
  }

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
    logoPath: (await resolveReportLogoPath()) ?? undefined,
  };

  const ownerSlug = p.ownerUserId ? `-user-${(namaPetugas || "user").replace(/\s+/g, "_")}` : "";
  const shiftSlug = shift ? `-Shift${shift}` : "";
  const filename = `Laporan-Harian-${p.tanggal}${shiftSlug}${ownerSlug}.xlsx`;

  return { data, filename, count: tickets.length };
}
