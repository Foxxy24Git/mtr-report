"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  Loader2,
  ChevronDown,
  ChevronRight,
  Inbox,
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
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { computeSla, formatSlaPersen } from "@/lib/sla";
import { SHIFT_LABELS } from "@/lib/constants";
import type {
  ShiftReportDetail,
  ShiftReportDetailTicket,
} from "@/lib/shiftReportQueries";
import type { TicketActivityItem } from "@/lib/ticketQueries";

interface Props {
  report: ShiftReportDetail;
  canApprove: boolean;
}

export function ShiftReportDetailClient({ report, canApprove }: Props) {
  const router = useRouter();
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const approved = report.status === "approved";

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
          href="/supervisi"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali ke Supervisi
        </Link>
        <div className="mt-2 flex items-center justify-between gap-3">
          <h1 className="page-title">Laporan Shift</h1>
          {approved ? (
            <Badge variant="success">
              <ShieldCheck className="w-3 h-3 mr-0.5" /> Sudah Diapprove
            </Badge>
          ) : (
            <Badge variant="warning">Menunggu Approval</Badge>
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
          <InfoRow label="Pimpinan Infrastruktur" value={report.pimpinanInfra || "—"} />
          <InfoRow label="Pimpinan Divisi" value={report.pimpinanDivisi || "—"} />
        </dl>
        {approved && (
          <p className="mt-3 text-xs text-emerald-700">
            Disetujui oleh {report.approverNama ?? "Supervisi"}
            {report.approvedAt ? ` · ${fmtDateTime(report.approvedAt)}` : ""}
            {report.catatanSupervisi ? ` · Catatan: ${report.catatanSupervisi}` : ""}
          </p>
        )}
      </div>

      {/* Daftar tiket shift ini */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">
          Daftar Tiket Shift Ini{" "}
          <span className="text-xs font-normal text-gray-500">
            ({report.tickets.length})
          </span>
        </h2>
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
                <Th>Lama Penanganan</Th>
                <Th>SLA</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {report.tickets.map((t) => (
                <TicketRow key={t.id} ticket={t} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Approve */}
      {!approved && canApprove && (
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
            Approve Laporan Shift
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
function TicketRow({ ticket }: { ticket: ShiftReportDetailTicket }) {
  const [open, setOpen] = useState(false);
  const [activities, setActivities] = useState<TicketActivityItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const sla = computeSla(
    new Date(ticket.waktuOpen),
    ticket.waktuSelesai ? new Date(ticket.waktuSelesai) : null
  );

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && activities === null) {
      setLoading(true);
      try {
        const res = await fetch(`/api/tickets/${ticket.id}`);
        const data = await res.json().catch(() => ({}));
        setActivities(data.item?.activities ?? []);
      } finally {
        setLoading(false);
      }
    }
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
          <Td colSpan={6} className="bg-surface-subtle/40">
            {loading ? (
              <p className="flex items-center gap-2 text-xs text-gray-500 py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat kronologi…
              </p>
            ) : activities && activities.length > 0 ? (
              <ol className="space-y-1.5 py-1">
                {activities.map((a) => (
                  <li key={a.id} className="flex gap-2 text-xs">
                    <span className="shrink-0 font-mono text-gray-400">
                      {a.isTindakLanjutFlag ? "—" : fmtTime(a.waktu)}
                    </span>
                    <span
                      className={
                        a.isTindakLanjutFlag
                          ? "font-semibold text-gray-700"
                          : "text-gray-700"
                      }
                    >
                      {a.teks}
                      <span className="ml-1 text-gray-400">({a.userNama})</span>
                    </span>
                  </li>
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
