"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  ChevronDown,
  ChevronRight,
  Inbox,
  Flag,
  Check,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  Th,
  Td,
} from "@/components/ui/Table";
import { cn } from "@/lib/cn";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { computeSla, formatSlaPersen } from "@/lib/sla";
import { SHIFT_LABELS } from "@/lib/constants";
import type {
  ShiftReportDetail,
  ShiftReportDetailTicket,
} from "@/lib/shiftReportQueries";
import type { TicketActivityItem } from "@/lib/ticketQueries";
import { butuhApprovalSupervisiNext, type PeranApproval } from "@/lib/shiftReportApproval";

interface Props {
  report: ShiftReportDetail;
  /** Peran viewer; null = tidak berhak approve (mis. superadmin, atau
   * petugas pemilik laporan). */
  peran: PeranApproval;
  /** Tujuan link "Kembali" — default ke Supervisi. */
  backHref?: string;
  /** Label link "Kembali" — default "Kembali ke Supervisi". */
  backLabel?: string;
}

export function ShiftReportDetailClient({
  report,
  peran,
  backHref = "/supervisi",
  backLabel = "Kembali ke Supervisi",
}: Props) {
  const router = useRouter();
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const approved = report.label === "Sudah Diapprove";
  const utamaSudah = Boolean(report.approvedAt);
  const nextSudah = Boolean(report.supervisiNextApprovedAt);
  const adaRevisiTertunda = report.pendingRevisionCount > 0;
  // Tombol approve muncul selama masih ada peran viewer yang belum approve —
  // DAN selama tidak ada kegiatan yang masih menunggu revisi petugas (fitur
  // Revisi Supervisi, lihat banner di bawah daftar tiket).
  const bisaApprove =
    !adaRevisiTertunda &&
    (peran === "keduanya"
      ? !utamaSudah || !nextSudah
      : peran === "selanjutnya"
        ? !nextSudah
        : peran === "utama"
          ? !utamaSudah
          : false);
  const labelTombol =
    peran === "keduanya"
      ? "Setujui (Supervisi & Supervisi Selanjutnya)"
      : peran === "selanjutnya"
        ? "Setujui sebagai Supervisi Selanjutnya"
        : "Setujui sebagai Supervisi";

  async function approve() {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch(`/api/shift-reports/${report.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catatan: catatan.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Gagal menyetujui laporan shift.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary"
        >
          <ArrowLeft className="w-4 h-4" /> {backLabel}
        </Link>
        <div className="mt-2 flex items-center justify-between gap-3">
          <h1 className="page-title">Laporan Shift</h1>
          {approved ? (
            <Badge variant="success">
              <ShieldCheck className="w-3 h-3 mr-0.5" /> {report.label}
            </Badge>
          ) : report.label === "Menunggu Approval" ? (
            <Badge variant="warning">{report.label}</Badge>
          ) : (
            <Badge variant="info">{report.label}</Badge>
          )}
        </div>
      </div>

      {/* Info Shift (read-only) */}
      <div className="rounded-lg border border-gray-100 bg-surface-subtle/60 p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Info Shift</h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 text-sm">
          <InfoRow label="Tanggal" value={fmtDate(report.tanggal)} />
          <InfoRow
            label="Shift"
            value={SHIFT_LABELS[report.shiftKode] ?? `Shift ${report.shiftKode}`}
          />
          <InfoRow label="Petugas (Owner)" value={report.ownerNama} />
          <InfoRow label="Penerima" value={report.receiverNama ?? "—"} />
          <InfoRow
            label="Supervisi"
            value={
              (report.supervisiNama ?? "—") +
              (report.approvedAt ? " · sudah approve" : " · menunggu")
            }
          />
          {butuhApprovalSupervisiNext({
            shiftKode: report.shiftKode,
            supervisiNextId: report.supervisiNextId,
          }) && (
            <InfoRow
              label="Supervisi Selanjutnya"
              value={
                (report.supervisiNextNama ?? "—") +
                (report.supervisiNextApprovedAt
                  ? " · sudah approve"
                  : " · menunggu")
              }
            />
          )}
          <InfoRow label="Pimpinan Infrastruktur" value={report.pimpinanInfra || "—"} />
          <InfoRow label="Pimpinan Divisi" value={report.pimpinanDivisi || "—"} />
        </dl>
        {report.approvedAt && (
          <p className="mt-3 text-xs text-emerald-700">
            Supervisi: disetujui oleh {report.approverNama ?? "—"} ·{" "}
            {fmtDateTime(report.approvedAt)}
            {report.catatanSupervisi ? ` · Catatan: ${report.catatanSupervisi}` : ""}
          </p>
        )}
        {report.supervisiNextApprovedAt && (
          <p className="mt-1 text-xs text-emerald-700">
            Supervisi Selanjutnya: disetujui oleh{" "}
            {report.supervisiNextApproverNama ?? "—"} ·{" "}
            {fmtDateTime(report.supervisiNextApprovedAt)}
            {report.catatanSupervisiNext
              ? ` · Catatan: ${report.catatanSupervisiNext}`
              : ""}
          </p>
        )}
      </div>

      {(peran === "selanjutnya" || peran === "keduanya") && (
        <p className="rounded-lg border border-sky-200 bg-sky-50/60 px-4 py-3 text-sm text-sky-800">
          Tiket bertanda <b>Lanjutan</b> di bawah adalah tindak lanjut dari shift
          ini yang menjadi tanggung jawab pemantauan Anda.
        </p>
      )}

      {/* Daftar tiket shift ini */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">
          Daftar Tiket Shift Ini{" "}
          <span className="text-xs font-normal text-gray-500">
            ({report.tickets.length})
          </span>
        </h2>
        {report.tickets.some((t) => t.status !== "selesai") && (
          <p className="mb-2 text-xs text-gray-500">
            Tiket berstatus <b>Proses</b> ditampilkan sebagai informasi
            transparansi — persetujuan berlaku untuk laporan shift secara
            keseluruhan, bukan per tiket.
          </p>
        )}
        {report.tickets.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-surface-subtle/40 py-10 text-center text-sm text-gray-500">
            <Inbox className="h-6 w-6 text-gray-300" />
            Tidak ada gangguan pada shift ini.
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <Th>No Tiket</Th>
                <Th>Kategori</Th>
                <Th>Lokasi ATM</Th>
                <Th>Status</Th>
                <Th>Jenis Gangguan</Th>
                <Th>Sumber Penyebab</Th>
                <Th>Metode Penanganan</Th>
                <Th>Vendor</Th>
                <Th>No Tiket Vendor</Th>
                <Th>Lama Penanganan</Th>
                <Th>SLA</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...report.tickets]
                .sort((a, b) => Number(b.isLanjutan) - Number(a.isLanjutan))
                .map((t) => (
                  <TicketRow key={t.id} ticket={t} canFlag={!approved} />
                ))}
            </TableBody>
          </Table>
        )}
      </div>

      {!approved && adaRevisiTertunda && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            <b>{report.pendingRevisionCount}</b> kegiatan masih menunggu revisi
            petugas — buka kronologi tiket di bawah untuk melihat &amp;
            memverifikasi. Laporan ini tidak bisa disetujui sampai semuanya
            selesai.
          </span>
        </div>
      )}

      {/* Approve */}
      {bisaApprove && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
          <label className="block text-sm font-medium text-gray-700">
            Catatan Supervisi (opsional)
          </label>
          <textarea
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            rows={2}
            placeholder="Catatan sebelum menyetujui laporan shift…"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-500"
          />
          {err && (
            <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {err}
            </p>
          )}
          <button
            type="button"
            onClick={approve}
            disabled={busy}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
            {labelTombol}
          </button>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-1 sm:border-0">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900 text-right">{value}</dd>
    </div>
  );
}

/** Baris tiket dengan accordion kronologi (lazy-load via /api/tickets/[id]). */
function TicketRow({
  ticket,
  canFlag,
}: {
  ticket: ShiftReportDetailTicket;
  /** True bila laporan belum di-approve — hanya saat itu boleh menandai revisi baru. */
  canFlag: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activities, setActivities] = useState<TicketActivityItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const sla = computeSla(
    new Date(ticket.waktuOpen),
    ticket.waktuSelesai ? new Date(ticket.waktuSelesai) : null
  );

  async function loadActivities() {
    const res = await fetch(`/api/tickets/${ticket.id}`);
    const data = await res.json().catch(() => ({}));
    setActivities(data.item?.activities ?? []);
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && activities === null) {
      setLoading(true);
      try {
        await loadActivities();
      } finally {
        setLoading(false);
      }
    }
  }

  /** Dipanggil setelah tandai/verifikasi revisi berhasil — segarkan baris ini
   * dan status laporan (pendingRevisionCount) di komponen induk. */
  async function onRevisiChanged() {
    await loadActivities();
    router.refresh();
  }

  return (
    <>
      <TableRow className="cursor-pointer" onClick={toggle}>
        <Td className="whitespace-nowrap">
          <span className="inline-flex items-center gap-1 font-mono font-semibold text-primary">
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {ticket.noTiket}
          </span>
          {ticket.isLanjutan && (
            <div className="mt-0.5">
              <Badge variant="info">Lanjutan</Badge>
            </div>
          )}
        </Td>
        <Td>
          <Badge variant={ticket.kategori === "atm" ? "info" : "neutral"}>
            {ticket.kategori === "atm" ? "ATM" : "Jaringan"}
          </Badge>
        </Td>
        <Td className="font-mono font-medium text-gray-900">
          {ticket.kodeAtm}
          <div className="text-xs font-sans font-normal text-gray-500 max-w-[14rem] truncate">
            {ticket.namaAtm}
          </div>
        </Td>
        <Td>
          <Badge variant={ticket.status === "selesai" ? "success" : "warning"}>
            {ticket.status === "selesai" ? "Selesai" : "Proses"}
          </Badge>
        </Td>
        <Td className="text-gray-600">{ticket.jenisGangguan ?? "—"}</Td>
        <Td className="text-gray-600">{ticket.sumberPenyebab ?? "—"}</Td>
        <Td className="text-gray-600">{ticket.metodePenanganan ?? "—"}</Td>
        <Td className="max-w-[10rem]">
          {ticket.vendor?.trim() ? (
            <span className="block truncate text-gray-700">{ticket.vendor}</span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </Td>
        <Td className="whitespace-nowrap font-mono text-xs">
          {ticket.noTiketVendor?.trim() ? (
            <span className="text-gray-700">{ticket.noTiketVendor}</span>
          ) : (
            <span className="font-sans text-gray-400">—</span>
          )}
        </Td>
        <Td className="whitespace-nowrap text-xs">
          {sla.lamaHHMM ? (
            <span className="font-medium text-gray-700">{sla.lamaHHMM}</span>
          ) : (
            <span className="text-amber-600">Berjalan</span>
          )}
        </Td>
        <Td className="whitespace-nowrap text-xs">
          {sla.slaPersen != null ? formatSlaPersen(sla.slaPersen) : "—"}
        </Td>
      </TableRow>
      {open && (
        <TableRow>
          <Td colSpan={11} className="bg-surface-subtle/40">
            {loading ? (
              <p className="flex items-center gap-2 text-xs text-gray-500 py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat kronologi…
              </p>
            ) : activities && activities.length > 0 ? (
              <ol className="space-y-1.5 py-1">
                {activities.map((a) => (
                  <ActivityLine
                    key={a.id}
                    ticketId={ticket.id}
                    activity={a}
                    canFlag={canFlag}
                    onChanged={onRevisiChanged}
                  />
                ))}
              </ol>
            ) : (
              <p className="py-2 text-xs text-gray-400">
                Belum ada kegiatan penanganan.
              </p>
            )}
          </Td>
        </TableRow>
      )}
    </>
  );
}

/**
 * Satu baris kronologi + kontrol revisi Supervisi:
 * - Belum ditandai → tombol "Tandai revisi" (butuh alasan).
 * - menunggu_petugas → banner alasan, menunggu petugas memperbaiki.
 * - menunggu_verifikasi → banner + tombol Terima / Masih salah (revisi lagi).
 */
function ActivityLine({
  ticketId,
  activity,
  canFlag,
  onChanged,
}: {
  ticketId: string;
  activity: TicketActivityItem;
  canFlag: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagCatatan, setFlagCatatan] = useState("");
  const [flagBusy, setFlagBusy] = useState(false);
  const [flagErr, setFlagErr] = useState("");

  const [tolakOpen, setTolakOpen] = useState(false);
  const [tolakCatatan, setTolakCatatan] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyErr, setVerifyErr] = useState("");

  const revisi = activity.revisi;
  const bisaDitandai =
    canFlag &&
    !activity.isTindakLanjutFlag &&
    !activity.isSupervisiEntry &&
    (!revisi || revisi.status === "selesai");

  async function submitFlag() {
    setFlagErr("");
    if (!flagCatatan.trim()) {
      setFlagErr("Alasan revisi wajib diisi.");
      return;
    }
    setFlagBusy(true);
    try {
      const res = await fetch(
        `/api/tickets/${ticketId}/activities/${activity.id}/revisi`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ catatan: flagCatatan.trim() }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFlagErr(data.error ?? "Gagal menandai revisi.");
        return;
      }
      setFlagOpen(false);
      setFlagCatatan("");
      await onChanged();
    } finally {
      setFlagBusy(false);
    }
  }

  async function verify(action: "terima" | "tolak") {
    if (!revisi) return;
    setVerifyErr("");
    if (action === "tolak" && !tolakCatatan.trim()) {
      setVerifyErr("Alasan wajib diisi saat menolak revisi.");
      return;
    }
    setVerifyBusy(true);
    try {
      const res = await fetch(`/api/revisi/${revisi.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          catatan: action === "tolak" ? tolakCatatan.trim() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setVerifyErr(data.error ?? "Gagal memverifikasi revisi.");
        return;
      }
      setTolakOpen(false);
      setTolakCatatan("");
      await onChanged();
    } finally {
      setVerifyBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-1 text-xs border-b border-gray-100/70 last:border-0 pb-1.5">
      <div className="flex gap-2">
        <span className="shrink-0 font-mono text-gray-400">
          {activity.isTindakLanjutFlag ? "—" : fmtTime(activity.waktu)}
        </span>
        <span
          className={
            activity.isTindakLanjutFlag
              ? "font-semibold text-gray-700"
              : "text-gray-700"
          }
        >
          {activity.teks}
          <span className="ml-1 text-gray-400">({activity.userNama})</span>
        </span>
        {bisaDitandai && !flagOpen && (
          <button
            type="button"
            onClick={() => setFlagOpen(true)}
            className="ml-auto shrink-0 inline-flex items-center gap-1 text-gray-400 hover:text-red-600 transition-colors"
          >
            <Flag className="h-3 w-3" /> Tandai revisi
          </button>
        )}
      </div>

      {revisi && revisi.status !== "selesai" && (
        <div
          className={cn(
            "ml-6 rounded-md border px-2.5 py-1.5",
            revisi.status === "menunggu_petugas"
              ? "border-amber-200 bg-amber-50"
              : "border-sky-200 bg-sky-50"
          )}
        >
          <p
            className={
              revisi.status === "menunggu_petugas"
                ? "text-amber-800"
                : "text-sky-800"
            }
          >
            <b>
              {revisi.status === "menunggu_petugas"
                ? "Menunggu revisi petugas"
                : "Menunggu verifikasi Anda"}
            </b>
            {revisi.catatan ? ` — ${revisi.catatan}` : ""}
          </p>
          {revisi.status === "menunggu_verifikasi" && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={verifyBusy}
                onClick={() => verify("terima")}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-white text-[11px] font-medium hover:bg-emerald-700 disabled:opacity-60"
              >
                <Check className="h-3 w-3" /> Terima
              </button>
              {!tolakOpen ? (
                <button
                  type="button"
                  disabled={verifyBusy}
                  onClick={() => setTolakOpen(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-red-700 text-[11px] font-medium hover:bg-red-50 disabled:opacity-60"
                >
                  <X className="h-3 w-3" /> Masih salah, revisi lagi
                </button>
              ) : (
                <div className="w-full mt-1 flex flex-col gap-1">
                  <textarea
                    rows={2}
                    value={tolakCatatan}
                    onChange={(e) => setTolakCatatan(e.target.value)}
                    placeholder="Jelaskan apa yang masih salah…"
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTolakOpen(false);
                        setTolakCatatan("");
                        setVerifyErr("");
                      }}
                      className="text-[11px] text-gray-500 hover:text-gray-700"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={verifyBusy}
                      onClick={() => verify("tolak")}
                      className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-white text-[11px] font-medium hover:bg-red-700 disabled:opacity-60"
                    >
                      Kirim
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {verifyErr && (
            <p className="mt-1 text-[11px] text-red-600">{verifyErr}</p>
          )}
        </div>
      )}

      {flagOpen && (
        <div className="ml-6 flex flex-col gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5">
          <textarea
            rows={2}
            value={flagCatatan}
            onChange={(e) => setFlagCatatan(e.target.value)}
            placeholder="Jelaskan bagian mana yang salah/typo…"
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-500"
          />
          {flagErr && <p className="text-[11px] text-red-600">{flagErr}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setFlagOpen(false);
                setFlagCatatan("");
                setFlagErr("");
              }}
              className="text-[11px] text-gray-500 hover:text-gray-700"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={flagBusy}
              onClick={submitFlag}
              className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-white text-[11px] font-medium hover:bg-red-700 disabled:opacity-60"
            >
              <Flag className="h-3 w-3" /> Tandai Revisi
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
