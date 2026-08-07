"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Pencil,
  ArrowRightLeft,
  CheckCircle2,
  Trash2,
  Clock,
  MapPin,
  Send,
  Gauge,
  AlertTriangle,
  RotateCcw,
  Search,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { fmtDateTime, fmtTime, toWibInputValue, wibInputToISO } from "@/lib/format";
import { computeSla, formatSlaPersen } from "@/lib/sla";
import { SHIFT_NAMES } from "@/lib/constants";
import type { TicketDetail } from "@/lib/ticketQueries";

interface Props {
  initialTicket: TicketDetail;
  opsi: {
    jenis_gangguan: string[];
    sumber_penyebab: string[];
    jenis_penanganan: string[];
  };
  role: "superadmin" | "user" | "supervisi";
  currentUserId: string;
  /** Shift aktif pada sesi user saat ini (untuk gating kegiatan setelah handover). */
  currentSessionShift: string;
  /** Tujuan tombol "Kembali" & redirect setelah hapus. */
  backHref?: string;
  backLabel?: string;
  /**
   * Mode read-only (mis. Weekly Monitoring): sembunyikan semua aksi
   * edit/hapus/close/approve/tambah & edit kegiatan. Murni lihat riwayat.
   * Weekly Monitoring mengirim false khusus Super Admin agar bisa override.
   */
  readOnly?: boolean;
}

/** Hasil pencarian master ATM (endpoint /api/atm). */
interface AtmHit {
  id: string;
  kodeAtm: string;
  namaAtm: string;
  vendorAtm: string | null;
}

/** Tambahkan `value` ke daftar opsi bila belum ada (agar nilai lama tetap muncul). */
function withCurrent(opsi: string[], value: string | null): string[] {
  if (value && !opsi.includes(value)) return [value, ...opsi];
  return opsi;
}

export function TicketDetailClient({
  initialTicket,
  opsi,
  role,
  currentUserId,
  currentSessionShift,
  backHref = "/daily-monitoring",
  backLabel = "Kembali ke Daily Monitoring",
  readOnly = false,
}: Props) {
  const router = useRouter();
  const [ticket, setTicket] = useState<TicketDetail>(initialTicket);

  /**
   * Setelah serah terima shift, tiket berpindah ke shift berikutnya
   * (ticket.shiftKode). Petugas shift aktif penerima ikut berhak melakukan
   * mutasi (ubah detail, close, hapus) — sejalan dengan guardTicketMutation
   * di backend yang juga mengizinkan shift holder.
   */
  const isShiftAktifPemegang =
    !!currentSessionShift && currentSessionShift === ticket.shiftKode;
  const canMutate =
    !readOnly &&
    role !== "supervisi" &&
    (role === "superadmin" ||
      ticket.ownerId === currentUserId ||
      isShiftAktifPemegang);
  const isSelesai = ticket.status === "selesai";
  /**
   * Override Super Admin (koreksi human error): buka kembali tiket yang salah
   * di-close serta edit field yang terkunci bagi petugas (kategori,
   * ATM/lokasi, contact person, waktu kejadian). Backend tetap memvalidasi
   * role — UI ini hanya menyembunyikan kontrolnya.
   */
  const isSuperadmin = role === "superadmin";
  const canOverride = canMutate && isSuperadmin;

  /**
   * Hanya petugas shift aktif (atau Super Admin) yang boleh menambah kegiatan.
   * Owner shift sebelumnya tetap bisa lihat tiket, tetapi tidak menambah entri.
   */
  const canAddActivity =
    !readOnly && (role === "superadmin" || (canMutate && isShiftAktifPemegang));

  // --- Kegiatan baru ---
  const [kegiatan, setKegiatan] = useState("");
  const [savingKegiatan, setSavingKegiatan] = useState(false);
  const [kegiatanErr, setKegiatanErr] = useState("");

  // --- Edit entri kegiatan ---
  type Activity = TicketDetail["activities"][number];

  /**
   * Timeline ditampilkan terbalik: kegiatan terbaru di atas.
   * Entri "TINDAK LANJUT MONITORING SELANJUTNYA" (isTindakLanjutFlag) tidak
   * punya relasi eksplisit ke kegiatan induknya — ia hanya baris berikutnya
   * pada urutan ascending. Karena itu activities dikelompokkan dulu menjadi
   * blok (satu kegiatan + flag yang mengikutinya), lalu urutan BLOK saja yang
   * dibalik; urutan di dalam blok tetap (kegiatan dulu, baru tindak lanjutnya).
   */
  const orderedActivities = useMemo(() => {
    const blocks: Activity[][] = [];
    for (const a of ticket.activities) {
      if (!a.isTindakLanjutFlag || blocks.length === 0) {
        blocks.push([a]);
      } else {
        blocks[blocks.length - 1].push(a);
      }
    }
    return blocks.reverse().flat();
  }, [ticket.activities]);

  const [editAct, setEditAct] = useState<Activity | null>(null);
  const [editActTeks, setEditActTeks] = useState("");
  const [editActWaktu, setEditActWaktu] = useState("");
  const [savingAct, setSavingAct] = useState(false);
  const [editActErr, setEditActErr] = useState("");

  /** Boleh edit entri: pembuat entri atau superadmin (PRD §4.B.3 poin 5). */
  function canEditActivity(a: Activity) {
    return (
      !readOnly &&
      role !== "supervisi" &&
      !a.isTindakLanjutFlag &&
      (role === "superadmin" || a.userId === currentUserId)
    );
  }

  function openEditActivity(a: Activity) {
    setEditAct(a);
    setEditActTeks(a.teks);
    setEditActWaktu(toWibInputValue(a.waktu));
    setEditActErr("");
  }

  async function submitEditActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!editAct) return;
    setEditActErr("");
    if (!editActTeks.trim()) return setEditActErr("Teks kegiatan wajib diisi.");
    if (!editActWaktu) return setEditActErr("Waktu entri wajib diisi.");
    setSavingAct(true);
    try {
      const res = await fetch(
        `/api/tickets/${ticket.id}/activities/${editAct.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teks: editActTeks,
            waktu: wibInputToISO(editActWaktu),
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditActErr(data.error ?? "Gagal menyimpan perubahan.");
        return;
      }
      setEditAct(null);
      await reload();
    } finally {
      setSavingAct(false);
    }
  }

  // --- Modal edit ---
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    jenisGangguan: "",
    sumberPenyebab: "",
    metodePenanganan: "",
    vendor: "",
    noTiketVendor: "",
    waktuLaporVendor: "",
    keterangan: "",
    // Field berikut hanya dikirim ke server bila role superadmin.
    kategori: "atm",
    cpTipe: "pic",
    cpNama: "",
    cpTelp: "",
    waktuOpen: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editErr, setEditErr] = useState("");

  // --- Pencarian ATM (override lokasi, superadmin) ---
  const [selectedAtm, setSelectedAtm] = useState<{
    id: string;
    kodeAtm: string;
    namaAtm: string;
  } | null>(null);
  const [atmQuery, setAtmQuery] = useState("");
  const [atmHits, setAtmHits] = useState<AtmHit[]>([]);
  const [atmSearching, setAtmSearching] = useState(false);

  useEffect(() => {
    if (!editOpen || !isSuperadmin) return;
    const q = atmQuery.trim();
    if (!q) {
      setAtmHits([]);
      return;
    }
    const handle = setTimeout(async () => {
      setAtmSearching(true);
      try {
        const res = await fetch(`/api/atm?q=${encodeURIComponent(q)}&limit=10`);
        const data = await res.json().catch(() => ({}));
        setAtmHits(data.items ?? []);
      } finally {
        setAtmSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [atmQuery, editOpen, isSuperadmin]);

  // --- Modal close, reopen & delete ---
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeWaktu, setCloseWaktu] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenBusy, setReopenBusy] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [actionErr, setActionErr] = useState("");

  async function reload() {
    const res = await fetch(`/api/tickets/${ticket.id}`);
    if (res.ok) {
      const data = await res.json();
      setTicket(data.item);
    }
  }

  async function submitKegiatan(e: React.FormEvent) {
    e.preventDefault();
    setKegiatanErr("");
    if (!kegiatan.trim()) return setKegiatanErr("Teks kegiatan wajib diisi.");
    setSavingKegiatan(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teks: kegiatan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setKegiatanErr(data.error ?? "Gagal menyimpan kegiatan.");
        return;
      }
      setKegiatan("");
      await reload();
    } finally {
      setSavingKegiatan(false);
    }
  }

  function openEdit() {
    setEditForm({
      jenisGangguan: ticket.jenisGangguan ?? "",
      sumberPenyebab: ticket.sumberPenyebab ?? "",
      metodePenanganan: ticket.metodePenanganan ?? "",
      vendor: ticket.vendor ?? "",
      noTiketVendor: ticket.noTiketVendor ?? "",
      waktuLaporVendor: "",
      keterangan: ticket.keterangan ?? "",
      kategori: ticket.kategori,
      cpTipe: ticket.cpTipe ?? "pic",
      cpNama: ticket.cpNama ?? "",
      cpTelp: ticket.cpTelp ?? "",
      waktuOpen: toWibInputValue(ticket.waktuOpen),
    });
    setSelectedAtm(
      ticket.atmId && ticket.atm
        ? {
            id: ticket.atmId,
            kodeAtm: ticket.atm.kodeAtm,
            namaAtm: ticket.atm.namaAtm,
          }
        : null
    );
    setAtmQuery("");
    setAtmHits([]);
    setEditErr("");
    setEditOpen(true);
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditErr("");

    // Field dasar — boleh diubah pemilik/petugas shift pemegang & superadmin.
    const payload: Record<string, unknown> = {
      jenisGangguan: editForm.jenisGangguan,
      sumberPenyebab: editForm.sumberPenyebab,
      metodePenanganan: editForm.metodePenanganan,
      vendor: editForm.vendor,
      noTiketVendor: editForm.noTiketVendor,
      keterangan: editForm.keterangan,
    };
    if (editForm.waktuLaporVendor) {
      payload.waktuLaporVendor = wibInputToISO(editForm.waktuLaporVendor);
    }

    // Field override — hanya dikirim untuk superadmin; server menolak 403
    // bila role lain nekat mengirimnya lewat pemanggilan API langsung.
    if (isSuperadmin) {
      if (!selectedAtm) {
        return setEditErr("ATM/lokasi wajib dipilih dari pencarian.");
      }
      if (!editForm.waktuOpen) {
        return setEditErr("Waktu kejadian wajib diisi.");
      }
      if (editForm.cpTipe === "pic" && (!editForm.cpNama || !editForm.cpTelp)) {
        return setEditErr("No PIC wajib mengisi nama dan nomor telepon.");
      }
      if (editForm.cpTipe === "wag" && !editForm.cpNama) {
        return setEditErr("Nama WAG (WhatsApp Group) wajib diisi.");
      }
      payload.kategori = editForm.kategori;
      payload.atmId = selectedAtm.id;
      payload.cpTipe = editForm.cpTipe;
      payload.cpNama = editForm.cpNama;
      payload.cpTelp = editForm.cpTipe === "pic" ? editForm.cpTelp : "";
      payload.waktuOpen = wibInputToISO(editForm.waktuOpen);
    }

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditErr(data.error ?? "Gagal menyimpan perubahan.");
        return;
      }
      setEditOpen(false);
      await reload();
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmClose() {
    setActionErr("");
    setCloseBusy(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          waktuSelesai: closeWaktu ? wibInputToISO(closeWaktu) : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionErr(data.error ?? "Gagal menutup tiket.");
        return;
      }
      setCloseOpen(false);
      setCloseWaktu("");
      await reload();
    } finally {
      setCloseBusy(false);
    }
  }

  /**
   * Buka kembali tiket yang sudah ditutup (override Super Admin).
   * Endpoint hanya mengubah status → proses & mengosongkan waktu selesai;
   * detail tiket lain tidak tersentuh.
   */
  async function confirmReopen() {
    setActionErr("");
    setReopenBusy(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/reopen`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionErr(data.error ?? "Gagal membuka kembali tiket.");
        return;
      }
      setReopenOpen(false);
      await reload();
      // Segarkan halaman server (daftar tiket & badge status ikut berubah).
      router.refresh();
    } finally {
      setReopenBusy(false);
    }
  }

  async function confirmDelete() {
    setActionErr("");
    setDelBusy(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionErr(data.error ?? "Gagal menghapus tiket.");
        setDelBusy(false);
        return;
      }
      router.push(backHref);
    } catch {
      setActionErr("Terjadi kesalahan jaringan.");
      setDelBusy(false);
    }
  }

  const sla = computeSla(
    new Date(ticket.waktuOpen),
    ticket.waktuSelesai ? new Date(ticket.waktuSelesai) : null
  );

  return (
    <div className="space-y-5">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {backLabel}
      </Link>

      {/* Header */}
      <Card padding="lg">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl font-bold font-mono text-primary">
                {ticket.noTiket}
              </span>
              <Badge variant={ticket.kategori === "atm" ? "info" : "neutral"}>
                {ticket.kategori === "atm" ? "ATM" : "Jaringan Kantor"}
              </Badge>
              <Badge variant={isSelesai ? "success" : "warning"}>
                {isSelesai ? "Selesai" : "Proses"}
              </Badge>
            </div>
            {ticket.atm && (
              <div className="mt-2 flex items-start gap-2 text-gray-700">
                <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-gray-900">
                    <span className="font-mono">{ticket.atm.kodeAtm}</span> —{" "}
                    {ticket.atm.namaAtm}
                  </div>
                  {ticket.atm.alamat && (
                    <div className="text-xs text-gray-500">
                      {ticket.atm.alamat}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="text-sm text-gray-500 sm:text-right space-y-0.5">
            <div>
              PIC / Owner:{" "}
              <span className="font-medium text-gray-800">
                {ticket.ownerNama}
              </span>
            </div>
            <div>{SHIFT_NAMES[ticket.shiftKode] ?? `Shift ${ticket.shiftKode}`}</div>
            <div className="flex items-center gap-1 sm:justify-end">
              <Clock className="w-3.5 h-3.5" /> Open: {fmtDateTime(ticket.waktuOpen)}
            </div>
            {ticket.waktuSelesai && (
              <div className="flex items-center gap-1 sm:justify-end text-green-700">
                <CheckCircle2 className="w-3.5 h-3.5" /> Selesai:{" "}
                {fmtDateTime(ticket.waktuSelesai)}
              </div>
            )}
          </div>
        </div>

        {/* Aksi */}
        {canMutate && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={openEdit}>
              <Pencil className="w-4 h-4" /> Ubah Detail
            </Button>
            {!isSelesai && (
              <Button
                size="sm"
                onClick={() => {
                  setActionErr("");
                  setCloseWaktu("");
                  setCloseOpen(true);
                }}
              >
                <CheckCircle2 className="w-4 h-4" /> Close Tiket
              </Button>
            )}
            {canOverride && isSelesai && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActionErr("");
                  setReopenOpen(true);
                }}
              >
                <RotateCcw className="w-4 h-4" /> Buka Kembali Tiket
              </Button>
            )}
            <Button
              variant="danger"
              size="sm"
              className="ml-auto"
              onClick={() => {
                setActionErr("");
                setDelOpen(true);
              }}
            >
              <Trash2 className="w-4 h-4" /> Hapus Tiket
            </Button>
          </div>
        )}
        {!readOnly && role === "supervisi" && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Mode tinjauan — persetujuan kini dilakukan per laporan shift di
              menu Supervisi, bukan per tiket.
            </p>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Detail gangguan + SLA */}
        <div className="space-y-5 lg:col-span-1">
          <Card>
            <CardTitle className="mb-3">Detail Gangguan</CardTitle>
            <dl className="space-y-2.5 text-sm">
              <Field label="Jenis Gangguan" value={ticket.jenisGangguan} />
              <Field label="Sumber Penyebab" value={ticket.sumberPenyebab} />
              <Field label="Metode Penanganan" value={ticket.metodePenanganan} />
              <Field
                label="Contact Person"
                value={
                  ticket.cpTipe === "wag"
                    ? `WAG: ${ticket.cpNama ?? "—"}`
                    : ticket.cpNama
                      ? `${ticket.cpNama}${ticket.cpTelp ? ` · ${ticket.cpTelp}` : ""}`
                      : "—"
                }
              />
              <Field label="Vendor" value={ticket.vendor} />
              <Field label="No Tiket Vendor" value={ticket.noTiketVendor} />
              <Field
                label="Waktu Lapor ke Vendor"
                value={
                  ticket.waktuLaporVendor ? fmtDateTime(ticket.waktuLaporVendor) : null
                }
              />
              <Field label="Keterangan" value={ticket.keterangan} />
            </dl>
          </Card>

          <Card>
            <CardTitle className="mb-3 flex items-center gap-2">
              <Gauge className="w-4 h-4 text-accent" /> SLA Tiket
            </CardTitle>
            {sla.selesai ? (
              <dl className="space-y-2.5 text-sm">
                <Field
                  label="Total Menit Bulan"
                  value={sla.totalMenitBulan.toLocaleString("id-ID")}
                />
                <Field
                  label="Lama Penyelesaian"
                  value={`${sla.lamaHHMM} (${sla.lamaMenit?.toLocaleString("id-ID")} menit)`}
                />
                <Field
                  label="Uptime (Menit)"
                  value={sla.uptimeMenit?.toLocaleString("id-ID")}
                />
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <dt className="text-gray-500">SLA</dt>
                  <dd className="text-lg font-bold text-green-700">
                    {formatSlaPersen(sla.slaPersen!)}
                  </dd>
                </div>
              </dl>
            ) : (
              <div className="text-sm">
                <Badge variant="warning">Dalam Proses</Badge>
                <p className="mt-2 text-xs text-gray-500">
                  SLA dihitung otomatis setelah tiket ditutup (Total menit bulan
                  ={" "}
                  {sla.totalMenitBulan.toLocaleString("id-ID")}).
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* Kegiatan penanganan */}
        <Card className="lg:col-span-2">
          <CardTitle className="mb-1">Kegiatan Penanganan Gangguan</CardTitle>
          <p className="text-xs text-gray-500 mb-4">
            Log kronologis — setiap entri tersimpan dengan timestamp. Pembuat
            entri atau Super Admin dapat memperbaiki teks/waktu; perubahan tetap
            meninggalkan jejak (penanda &ldquo;diedit&rdquo;).
          </p>

          {canMutate && !isSelesai && canAddActivity && (
            <form onSubmit={submitKegiatan} className="mb-5">
              <textarea
                rows={2}
                value={kegiatan}
                onChange={(e) => setKegiatan(e.target.value)}
                placeholder="Tulis perkembangan penanganan terbaru…"
                className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
              {kegiatanErr && (
                <p className="mt-1 text-xs text-red-600">{kegiatanErr}</p>
              )}
              <div className="mt-2 flex justify-end">
                <Button type="submit" size="sm" loading={savingKegiatan}>
                  <Send className="w-4 h-4" /> Simpan Kegiatan
                </Button>
              </div>
            </form>
          )}
          {canMutate && !isSelesai && !canAddActivity && (
            <div className="mb-5 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Tiket ini sudah diserahkan ke shift berikutnya. Kegiatan hanya
                bisa ditambahkan oleh petugas shift aktif (
                {SHIFT_NAMES[ticket.shiftKode] ?? `Shift ${ticket.shiftKode}`}).
              </span>
            </div>
          )}

          <ol className="relative border-l-2 border-gray-100 ml-2 space-y-4">
            <AnimatePresence initial={false}>
              {orderedActivities.map((a) =>
                a.isTindakLanjutFlag ? (
                  <motion.li
                    key={a.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="ml-4"
                  >
                    <div className="flex items-center gap-2 rounded-md bg-accent/10 border border-accent/30 px-3 py-2">
                      <ArrowRightLeft className="w-4 h-4 text-accent-dark shrink-0" />
                      <span className="text-xs font-semibold tracking-wide text-accent-dark">
                        {a.teks}
                      </span>
                      <span className="ml-auto text-[11px] text-gray-500">
                        {fmtTime(a.waktu)} · {SHIFT_NAMES[a.shiftKode] ?? `Shift ${a.shiftKode}`}
                      </span>
                    </div>
                  </motion.li>
                ) : (
                  <motion.li
                    key={a.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="ml-4 group"
                  >
                    <span className="absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full bg-primary border-2 border-white" />
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">
                        {fmtDateTime(a.waktu)}
                      </span>
                      <span>· {a.userNama}</span>
                      <Badge variant="neutral">
                        {SHIFT_NAMES[a.shiftKode] ?? `Shift ${a.shiftKode}`}
                      </Badge>
                      {a.editedAt && (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] text-amber-700"
                          title={`Diedit oleh ${a.editedByNama ?? "—"} · ${fmtDateTime(a.editedAt)}`}
                        >
                          <Pencil className="w-3 h-3" /> diedit
                        </span>
                      )}
                      {canEditActivity(a) && (
                        <button
                          type="button"
                          onClick={() => openEditActivity(a)}
                          className="ml-auto inline-flex items-center gap-1 text-gray-400 hover:text-primary transition-colors sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">
                      {a.teks}
                    </p>
                  </motion.li>
                )
              )}
            </AnimatePresence>
            {ticket.activities.length === 0 && (
              <li className="ml-4 text-sm text-gray-400">Belum ada kegiatan.</li>
            )}
          </ol>

          {ticket.waktuResponInternal ? (
            <div className="mt-4 ml-2 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
              <span>✅ Waktu respon tercatat: {fmtTime(ticket.waktuResponInternal)}</span>
            </div>
          ) : (
            !isSelesai && (
              <div className="mt-4 ml-2 flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                <span>
                  ⏳ Waktu respon akan tercatat otomatis saat Anda menambahkan
                  update kegiatan berikutnya.
                </span>
              </div>
            )
          )}
        </Card>
      </div>

      {/* ---- Modal edit ---- */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Ubah Detail Gangguan"
        description={
          isSuperadmin
            ? "Perbarui klasifikasi gangguan, vendor, dan data dasar tiket."
            : "Perbarui klasifikasi gangguan & vendor."
        }
        size="lg"
      >
        <form onSubmit={submitEdit} className="space-y-4">
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {isSuperadmin && (
            <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 space-y-4">
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Override Super Admin — data dasar berikut terkunci bagi
                  petugas. Perubahan dicatat pada jejak audit (tabel
                  <span className="font-mono"> audit_logs</span>).
                </p>
              </div>

              {/* ATM / lokasi */}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  ATM / Lokasi
                </label>
                {selectedAtm ? (
                  <div className="mt-1 flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2">
                    <div className="text-sm text-gray-900">
                      <span className="font-mono">{selectedAtm.kodeAtm}</span> —{" "}
                      {selectedAtm.namaAtm}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAtm(null);
                        setAtmQuery("");
                        setAtmHits([]);
                      }}
                      className="text-xs text-primary hover:underline shrink-0"
                    >
                      Ganti
                    </button>
                  </div>
                ) : (
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      value={atmQuery}
                      onChange={(e) => setAtmQuery(e.target.value)}
                      placeholder="Ketik kode atau nama ATM…"
                      className="w-full pl-9 pr-9 py-2 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    {atmSearching && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                    )}
                    {atmHits.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-gray-200 bg-white shadow-card-lg">
                        {atmHits.map((hit) => (
                          <button
                            key={hit.id}
                            type="button"
                            onClick={() => {
                              setSelectedAtm(hit);
                              setAtmQuery("");
                              setAtmHits([]);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-primary-50 transition-colors border-b border-gray-50 last:border-0"
                          >
                            <div className="text-sm font-medium text-gray-900">
                              <span className="font-mono">{hit.kodeAtm}</span> —{" "}
                              {hit.namaAtm}
                            </div>
                            <div className="text-xs text-gray-500">
                              Vendor ATM: {hit.vendorAtm ?? "—"}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {!atmSearching &&
                      atmQuery.trim() &&
                      atmHits.length === 0 && (
                        <p className="mt-1 text-xs text-gray-500">
                          Tidak ditemukan. Tambahkan dulu di menu Data ATM.
                        </p>
                      )}
                  </div>
                )}
              </div>

              {/* Kategori */}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Kategori Tiket
                </label>
                <div className="mt-1.5 flex gap-2">
                  {(["atm", "jaringan"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, kategori: k })}
                      className={cn(
                        "flex-1 px-4 py-2 rounded-md border text-sm font-medium transition-all",
                        editForm.kategori === k
                          ? "border-primary bg-primary text-white shadow-sm"
                          : "border-gray-300 bg-white text-gray-600 hover:border-primary/50"
                      )}
                    >
                      {k === "atm" ? "ATM" : "Jaringan Kantor"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contact Person */}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Contact Person
                </label>
                <div className="mt-1.5 flex gap-4">
                  {(
                    [
                      ["pic", "No PIC"],
                      ["wag", "WAG (WhatsApp Group)"],
                    ] as const
                  ).map(([val, label]) => (
                    <label
                      key={val}
                      className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="editCpTipe"
                        checked={editForm.cpTipe === val}
                        onChange={() =>
                          setEditForm({ ...editForm, cpTipe: val })
                        }
                        className="accent-primary"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label={editForm.cpTipe === "pic" ? "Nama PIC" : "Nama WAG"}
                    value={editForm.cpNama}
                    onChange={(e) =>
                      setEditForm({ ...editForm, cpNama: e.target.value })
                    }
                  />
                  {editForm.cpTipe === "pic" && (
                    <Input
                      label="Nomor Telepon"
                      value={editForm.cpTelp}
                      onChange={(e) =>
                        setEditForm({ ...editForm, cpTelp: e.target.value })
                      }
                      placeholder="08xxxxxxxxxx"
                    />
                  )}
                </div>
              </div>

              {/* Waktu kejadian */}
              <div>
                <Input
                  label="Waktu Kejadian (Open)"
                  type="datetime-local"
                  value={editForm.waktuOpen}
                  onChange={(e) =>
                    setEditForm({ ...editForm, waktuOpen: e.target.value })
                  }
                />
                <p className="mt-1 text-xs text-gray-500">
                  Mengubah waktu ini ikut mengubah perhitungan SLA tiket.
                </p>
              </div>
            </div>
          )}

          <Select
            label="Jenis Gangguan"
            value={editForm.jenisGangguan}
            onChange={(e) =>
              setEditForm({ ...editForm, jenisGangguan: e.target.value })
            }
          >
            <option value="">— Pilih —</option>
            {withCurrent(opsi.jenis_gangguan, ticket.jenisGangguan).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
          <Select
            label="Sumber Penyebab Gangguan"
            value={editForm.sumberPenyebab}
            onChange={(e) =>
              setEditForm({ ...editForm, sumberPenyebab: e.target.value })
            }
          >
            <option value="">— Pilih —</option>
            {withCurrent(opsi.sumber_penyebab, ticket.sumberPenyebab).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
          <Select
            label="Metode Penanganan Gangguan"
            value={editForm.metodePenanganan}
            onChange={(e) =>
              setEditForm({ ...editForm, metodePenanganan: e.target.value })
            }
          >
            <option value="">— Pilih —</option>
            {withCurrent(opsi.jenis_penanganan, ticket.metodePenanganan).map(
              (v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              )
            )}
          </Select>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Vendor"
              value={editForm.vendor}
              onChange={(e) =>
                setEditForm({ ...editForm, vendor: e.target.value })
              }
            />
            <Input
              label="No Tiket Vendor"
              value={editForm.noTiketVendor}
              onChange={(e) =>
                setEditForm({ ...editForm, noTiketVendor: e.target.value })
              }
            />
          </div>
          {ticket.waktuLaporVendor ? (
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
              <span>
                ✅ Waktu lapor vendor terkunci: {fmtDateTime(ticket.waktuLaporVendor)}{" "}
                — tidak bisa diubah lagi (basis SLA Eksternal sudah berjalan dari
                titik ini).
              </span>
            </div>
          ) : (
            editForm.noTiketVendor.trim() && (
              <div className="flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-xs text-amber-800">
                  ⏱️ Waktu ini jadi patokan mulai SLA Eksternal (kontrak vendor,
                  Lampiran IV PKS Artajasa) — sekali disimpan TIDAK BISA diubah
                  lagi. Kosongkan untuk pakai waktu sekarang, atau isi kalau Anda
                  sudah lapor ke vendor sebelum sempat mencatatnya di sini.
                </p>
                <Input
                  label="Waktu Lapor ke Vendor (opsional)"
                  type="datetime-local"
                  value={editForm.waktuLaporVendor}
                  onChange={(e) =>
                    setEditForm({ ...editForm, waktuLaporVendor: e.target.value })
                  }
                />
              </div>
            )
          )}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Keterangan
            </label>
            <textarea
              rows={2}
              value={editForm.keterangan}
              onChange={(e) =>
                setEditForm({ ...editForm, keterangan: e.target.value })
              }
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          </div>

          {editErr && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {editErr}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" loading={savingEdit}>
              Simpan Perubahan
            </Button>
          </div>
        </form>
      </Modal>

      {/* ---- Modal edit entri kegiatan ---- */}
      <Modal
        open={!!editAct}
        onClose={() => setEditAct(null)}
        title="Edit Entri Kegiatan"
        description="Perbaiki teks kegiatan atau koreksi waktu entri. Perubahan tetap meninggalkan jejak audit."
        size="md"
      >
        <form onSubmit={submitEditActivity} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Teks Kegiatan
            </label>
            <textarea
              rows={3}
              value={editActTeks}
              onChange={(e) => setEditActTeks(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <Input
            label="Waktu Entri"
            type="datetime-local"
            value={editActWaktu}
            onChange={(e) => setEditActWaktu(e.target.value)}
          />
          {editActErr && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {editActErr}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditAct(null)}
            >
              Batal
            </Button>
            <Button type="submit" loading={savingAct}>
              Simpan Perubahan
            </Button>
          </div>
        </form>
      </Modal>

      {/* ---- Modal close ---- */}
      <Modal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="Tutup Tiket?"
        size="sm"
      >
        <p className="text-sm text-gray-600">
          Tiket akan ditandai <span className="font-semibold">Selesai</span> dan
          Waktu Selesai Gangguan dicatat otomatis. SLA akan dihitung.
        </p>
        <div className="mt-4 flex flex-col gap-1">
          <Input
            label="Waktu Close (opsional)"
            type="datetime-local"
            value={closeWaktu}
            onChange={(e) => setCloseWaktu(e.target.value)}
          />
          <p className="text-xs text-gray-500">
            Kosongkan untuk pakai waktu saat ini. Isi kalau gangguan sudah
            selesai sebelum tiket ini ditutup (mis. telat close).
          </p>
        </div>
        {actionErr && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {actionErr}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setCloseOpen(false)}>
            Batal
          </Button>
          <Button loading={closeBusy} onClick={confirmClose}>
            <CheckCircle2 className="w-4 h-4" /> Ya, Tutup
          </Button>
        </div>
      </Modal>

      {/* ---- Modal buka kembali (reopen) ---- */}
      <Modal
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        title="Buka Kembali Tiket?"
        size="sm"
      >
        <div className="flex items-start gap-2 text-sm text-gray-600">
          <RotateCcw className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <p>
            Tiket{" "}
            <span className="font-mono font-semibold text-gray-900">
              {ticket.noTiket}
            </span>{" "}
            akan kembali berstatus{" "}
            <span className="font-semibold">Proses</span> dan Waktu Selesai
            dikosongkan (SLA dihitung ulang saat tiket ditutup lagi). Detail
            gangguan, vendor, shift, dan riwayat kegiatan tidak diubah.
          </p>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Aksi khusus Super Admin — tercatat pada jejak audit.
        </p>
        {actionErr && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {actionErr}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setReopenOpen(false)}>
            Batal
          </Button>
          <Button loading={reopenBusy} onClick={confirmReopen}>
            <RotateCcw className="w-4 h-4" /> Ya, Buka Kembali
          </Button>
        </div>
      </Modal>

      {/* ---- Modal hapus ---- */}
      <Modal
        open={delOpen}
        onClose={() => setDelOpen(false)}
        title="Hapus Tiket?"
        size="sm"
      >
        <div className="flex items-start gap-2 text-sm text-gray-600">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p>
            Hapus tiket{" "}
            <span className="font-mono font-semibold text-gray-900">
              {ticket.noTiket}
            </span>{" "}
            beserta seluruh kegiatan &amp; riwayat serah terima? Tindakan ini
            tidak bisa dibatalkan (gunakan hanya untuk gangguan sesaat).
          </p>
        </div>
        {actionErr && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {actionErr}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setDelOpen(false)}>
            Batal
          </Button>
          <Button variant="danger" loading={delBusy} onClick={confirmDelete}>
            <Trash2 className="w-4 h-4" /> Hapus
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500 shrink-0">{label}</dt>
      <dd
        className={cn(
          "text-right text-gray-800",
          !value && "text-gray-400 italic"
        )}
      >
        {value || "—"}
      </dd>
    </div>
  );
}
