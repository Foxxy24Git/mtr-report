"use client";

import { useState } from "react";
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
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { computeSla, formatSlaPersen } from "@/lib/sla";
import type { TicketDetail } from "@/lib/ticketQueries";

interface LeaderOpt {
  id: string;
  nama: string;
  isPjs: boolean;
}
interface PetugasOpt {
  id: string;
  nama: string;
  username: string;
}

interface Props {
  initialTicket: TicketDetail;
  opsi: {
    jenis_gangguan: string[];
    sumber_penyebab: string[];
    jenis_penanganan: string[];
  };
  leadersInfra: LeaderOpt[];
  leadersDivisi: LeaderOpt[];
  petugas: PetugasOpt[];
  shifts: string[];
  role: "superadmin" | "user" | "supervisi";
  currentUserId: string;
  currentShift: string;
}

/** Tambahkan `value` ke daftar opsi bila belum ada (agar nilai lama tetap muncul). */
function withCurrent(opsi: string[], value: string | null): string[] {
  if (value && !opsi.includes(value)) return [value, ...opsi];
  return opsi;
}

export function TicketDetailClient({
  initialTicket,
  opsi,
  leadersInfra,
  leadersDivisi,
  petugas,
  shifts,
  role,
  currentUserId,
}: Props) {
  const router = useRouter();
  const [ticket, setTicket] = useState<TicketDetail>(initialTicket);

  const canMutate =
    role !== "supervisi" &&
    (role === "superadmin" || ticket.ownerId === currentUserId);
  const isSelesai = ticket.status === "selesai";

  // --- Kegiatan baru ---
  const [kegiatan, setKegiatan] = useState("");
  const [savingKegiatan, setSavingKegiatan] = useState(false);
  const [kegiatanErr, setKegiatanErr] = useState("");

  // --- Modal edit ---
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    jenisGangguan: "",
    sumberPenyebab: "",
    metodePenanganan: "",
    vendor: "",
    noTiketVendor: "",
    keterangan: "",
    pimpinanInfraId: "",
    pimpinanDivisiId: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editErr, setEditErr] = useState("");

  // --- Modal handover ---
  const [hoOpen, setHoOpen] = useState(false);
  const [hoUser, setHoUser] = useState("");
  const [hoShift, setHoShift] = useState("");
  const [hoBusy, setHoBusy] = useState(false);
  const [hoErr, setHoErr] = useState("");

  // --- Modal close & delete ---
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
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
      keterangan: ticket.keterangan ?? "",
      pimpinanInfraId: ticket.pimpinanInfraId ?? "",
      pimpinanDivisiId: ticket.pimpinanDivisiId ?? "",
    });
    setEditErr("");
    setEditOpen(true);
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditErr("");
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
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

  async function submitHandover(e: React.FormEvent) {
    e.preventDefault();
    setHoErr("");
    if (!hoUser) return setHoErr("Pilih petugas shift berikutnya.");
    if (!hoShift) return setHoErr("Pilih shift tujuan.");
    setHoBusy(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/handover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: hoUser, toShift: hoShift }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHoErr(data.error ?? "Gagal melakukan serah terima.");
        return;
      }
      setHoOpen(false);
      setHoUser("");
      setHoShift("");
      await reload();
    } finally {
      setHoBusy(false);
    }
  }

  async function confirmClose() {
    setActionErr("");
    setCloseBusy(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/close`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionErr(data.error ?? "Gagal menutup tiket.");
        return;
      }
      setCloseOpen(false);
      await reload();
    } finally {
      setCloseBusy(false);
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
      router.push("/daily-monitoring");
    } catch {
      setActionErr("Terjadi kesalahan jaringan.");
      setDelBusy(false);
    }
  }

  const sla = computeSla(
    new Date(ticket.waktuOpen),
    ticket.waktuSelesai ? new Date(ticket.waktuSelesai) : null
  );

  const otherPetugas = petugas.filter((p) => p.id !== ticket.ownerId);

  return (
    <div className="space-y-5">
      <Link
        href="/daily-monitoring"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Kembali ke Daily Monitoring
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
              <Badge
                variant={
                  ticket.statusSupervisi === "approved" ? "success" : "neutral"
                }
              >
                {ticket.statusSupervisi === "approved"
                  ? "Disetujui Supervisi"
                  : "Belum Approve"}
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
            <div>Shift {ticket.shiftKode}</div>
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
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setHoErr("");
                    setHoOpen(true);
                  }}
                >
                  <ArrowRightLeft className="w-4 h-4" /> Serah Terima Shift
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setActionErr("");
                    setCloseOpen(true);
                  }}
                >
                  <CheckCircle2 className="w-4 h-4" /> Close Tiket
                </Button>
              </>
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
        {!canMutate && role === "supervisi" && (
          <p className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
            Mode tinjauan supervisi — hanya dapat melihat kronologi.
          </p>
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
                label="Pimpinan Bag. Infrastruktur"
                value={ticket.pimpinanInfraNama}
              />
              <Field label="Pimpinan Divisi" value={ticket.pimpinanDivisiNama} />
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
            Log append-only — setiap entri tersimpan permanen dengan timestamp,
            tidak dapat diedit/dihapus.
          </p>

          {canMutate && !isSelesai && (
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

          <ol className="relative border-l-2 border-gray-100 ml-2 space-y-4">
            <AnimatePresence initial={false}>
              {ticket.activities.map((a) =>
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
                        {fmtTime(a.waktu)} · Shift {a.shiftKode}
                      </span>
                    </div>
                  </motion.li>
                ) : (
                  <motion.li
                    key={a.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="ml-4"
                  >
                    <span className="absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full bg-primary border-2 border-white" />
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">
                        {fmtDateTime(a.waktu)}
                      </span>
                      <span>· {a.userNama}</span>
                      <Badge variant="neutral">Shift {a.shiftKode}</Badge>
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
        </Card>
      </div>

      {/* ---- Modal edit ---- */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Ubah Detail Gangguan"
        description="Perbarui klasifikasi gangguan, vendor, & pimpinan penanggung jawab."
        size="lg"
      >
        <form onSubmit={submitEdit} className="space-y-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Pimpinan Bag. Infrastruktur"
              value={editForm.pimpinanInfraId}
              onChange={(e) =>
                setEditForm({ ...editForm, pimpinanInfraId: e.target.value })
              }
            >
              <option value="">— Pilih —</option>
              {leadersInfra.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nama}
                  {l.isPjs ? " (PJS)" : ""}
                </option>
              ))}
            </Select>
            <Select
              label="Pimpinan Divisi"
              value={editForm.pimpinanDivisiId}
              onChange={(e) =>
                setEditForm({ ...editForm, pimpinanDivisiId: e.target.value })
              }
            >
              <option value="">— Pilih —</option>
              {leadersDivisi.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nama}
                  {l.isPjs ? " (PJS)" : ""}
                </option>
              ))}
            </Select>
          </div>
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

      {/* ---- Modal serah terima ---- */}
      <Modal
        open={hoOpen}
        onClose={() => setHoOpen(false)}
        title="Serah Terima Shift"
        description="Tiket diteruskan ke shift berikutnya. Penanda TINDAK LANJUT MONITORING SELANJUTNYA otomatis ditambahkan."
      >
        <form onSubmit={submitHandover} className="space-y-4">
          <Select
            label="Petugas Shift Berikutnya"
            required
            value={hoUser}
            onChange={(e) => setHoUser(e.target.value)}
          >
            <option value="">— Pilih petugas —</option>
            {otherPetugas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama} ({p.username})
              </option>
            ))}
          </Select>
          <Select
            label="Shift Tujuan"
            required
            value={hoShift}
            onChange={(e) => setHoShift(e.target.value)}
          >
            <option value="">— Pilih shift —</option>
            {shifts.map((s) => (
              <option key={s} value={s}>
                Shift {s}
              </option>
            ))}
          </Select>
          {hoErr && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {hoErr}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setHoOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" loading={hoBusy}>
              <ArrowRightLeft className="w-4 h-4" /> Serahkan
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
