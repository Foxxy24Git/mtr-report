"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRightLeft, AlertTriangle, FileCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  Th,
  Td,
} from "@/components/ui/Table";
import { fmtDateTime } from "@/lib/format";
import { nextShift, type ShiftCode } from "@/lib/shift";
import { SHIFT_LABELS, SHIFT_NAMES } from "@/lib/constants";
import type { TicketListItem } from "@/lib/ticketQueries";

interface LeaderOption {
  id: string;
  nama: string;
  kategori: "infrastruktur" | "divisi";
  tipe: "tetap" | "pjs";
  namaPjs: string | null;
}

/** Label dropdown: nama + penanda PJS bila pejabat pengganti. */
function leaderLabel(l: LeaderOption): string {
  return l.tipe === "pjs" ? `${l.nama} [PJS: ${l.namaPjs ?? "-"}]` : l.nama;
}

interface SupervisiOption {
  id: string;
  nama: string;
}

interface Props {
  initialItems: TicketListItem[];
  shifts: string[];
  role: "superadmin" | "user" | "supervisi";
  currentShift: string;
  leaders: LeaderOption[];
  supervisiUsers: SupervisiOption[];
  petugasUsers: SupervisiOption[];
  currentUserId: string;
  currentUserHasTtd: boolean;
}

const SELECT_CLS =
  "px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";

export function DailyMonitoringClient({
  initialItems,
  shifts,
  role,
  currentShift,
  leaders,
  supervisiUsers,
  petugasUsers,
  currentUserId,
  currentUserHasTtd,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<TicketListItem[]>(initialItems);
  const [loading, setLoading] = useState(false);

  const [kategori, setKategori] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");

  // --- Serah terima shift (batch, global) ---
  const hasShift = shifts.includes(currentShift);
  const toShift = hasShift ? nextShift(currentShift as ShiftCode) : null;
  const [hoOpen, setHoOpen] = useState(false);
  // Langkah modal: "confirm" = peringatan pastikan data benar, "select" = pemilihan supervisi & pimpinan.
  const [hoStep, setHoStep] = useState<"confirm" | "select">("confirm");
  const [hoBusy, setHoBusy] = useState(false);
  const [hoErr, setHoErr] = useState("");
  // Penanda tangan laporan dipilih saat serah terima (PRD revisi §2).
  const [hoInfra, setHoInfra] = useState("");
  const [hoDivisi, setHoDivisi] = useState("");
  const [hoSupervisi, setHoSupervisi] = useState("");
  const [hoSupervisiNext, setHoSupervisiNext] = useState("");
  // Petugas penerima shift (WAJIB, PRD revisi §1).
  const [hoReceiver, setHoReceiver] = useState("");

  // --- Tutup Laporan Shift (tanpa penerima, PART 6) ---
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeErr, setCloseErr] = useState("");
  const canCloseShift = Boolean(hoInfra && hoDivisi && hoSupervisi);

  const leadersInfra = leaders.filter((l) => l.kategori === "infrastruktur");
  const leadersDivisi = leaders.filter((l) => l.kategori === "divisi");
  // Penerima dipilih dari petugas (role=user) selain diri sendiri.
  const receiverOptions = petugasUsers.filter((u) => u.id !== currentUserId);
  const canHandover = Boolean(
    hoInfra && hoDivisi && hoSupervisi && hoReceiver
  );

  function resetHandoverPick() {
    setHoInfra("");
    setHoDivisi("");
    setHoSupervisi("");
    setHoSupervisiNext("");
    setHoReceiver("");
  }

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("dailyMonitoring", "1");
      if (kategori) qs.set("kategori", kategori);
      const res = await fetch(`/api/tickets?${qs.toString()}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [kategori]);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const handle = setTimeout(loadTickets, 150);
    return () => clearTimeout(handle);
  }, [loadTickets]);

  // Daftar vendor unik untuk dropdown filter (client-side, dari data termuat).
  const vendorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of items) if (t.vendor?.trim()) set.add(t.vendor.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  // Pisahkan tiket sesuai PRD §4.B: milik shift aktif (saya) vs tindak lanjut.
  // Filter vendor diterapkan client-side sebelum pemisahan.
  const { mine, lanjutan } = useMemo(() => {
    const m: TicketListItem[] = [];
    const l: TicketListItem[] = [];
    for (const t of items) {
      if (vendorFilter && (t.vendor?.trim() ?? "") !== vendorFilter) continue;
      (t.lanjutan ? l : m).push(t);
    }
    return { mine: m, lanjutan: l };
  }, [items, vendorFilter]);

  async function confirmHandover() {
    setHoErr("");
    setHoBusy(true);
    try {
      const res = await fetch("/api/shift/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pimpinanInfraId: hoInfra,
          pimpinanDivisiId: hoDivisi,
          supervisiId: hoSupervisi,
          supervisiNextId: hoSupervisiNext || null,
          receiverUserId: hoReceiver,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHoErr(data.error ?? "Gagal melakukan serah terima.");
        return;
      }
      setHoOpen(false);
      resetHandoverPick();
      await loadTickets();
      router.refresh();
    } finally {
      setHoBusy(false);
    }
  }

  async function confirmCloseShift() {
    setCloseErr("");
    setCloseBusy(true);
    try {
      const res = await fetch("/api/shift/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pimpinanInfraId: hoInfra,
          pimpinanDivisiId: hoDivisi,
          supervisiId: hoSupervisi,
          supervisiNextId: hoSupervisiNext || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCloseErr(data.error ?? "Gagal menutup laporan shift.");
        return;
      }
      setCloseOpen(false);
      resetHandoverPick();
      await loadTickets();
      router.refresh();
    } finally {
      setCloseBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Aksi global */}
      {role !== "supervisi" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 bg-surface-subtle/60 px-4 py-3">
          <div className="text-sm text-gray-600">
            {hasShift ? (
              <>
                Shift aktif Anda:{" "}
                <span className="font-semibold text-gray-900">
                  {SHIFT_NAMES[currentShift] ?? `Shift ${currentShift}`}
                </span>
                . Serah terima akan meneruskan semua tiket open ke{" "}
                <span className="font-semibold text-gray-900">
                  {toShift
                    ? SHIFT_NAMES[toShift] ?? `Shift ${toShift}`
                    : "—"}
                </span>
                .
              </>
            ) : (
              "Pilih shift aktif di Dashboard untuk dapat melakukan serah terima shift."
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!hasShift}
              onClick={() => {
                setCloseErr("");
                resetHandoverPick();
                setCloseOpen(true);
              }}
            >
              <FileCheck className="w-4 h-4" /> Tutup Laporan Shift
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={!hasShift}
              onClick={() => {
                setHoErr("");
                resetHandoverPick();
                setHoStep("confirm");
                setHoOpen(true);
              }}
            >
              <AlertTriangle className="w-4 h-4" /> Serah Terima Shift ke Shift
              Berikutnya
            </Button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={kategori}
          onChange={(e) => setKategori(e.target.value)}
          className={SELECT_CLS}
          aria-label="Filter kategori"
        >
          <option value="">Semua Kategori</option>
          <option value="atm">ATM</option>
          <option value="jaringan">Jaringan Kantor</option>
        </select>

        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className={SELECT_CLS}
          aria-label="Filter vendor"
        >
          <option value="">Semua Vendor</option>
          {vendorOptions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        {loading && (
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
        )}
        <span className="text-xs text-gray-500 ml-auto">
          {items.length} tiket pada shift ini
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-surface-subtle/40 py-10 text-center text-sm text-gray-500">
          Tidak ada tiket aktif pada shift ini.
        </div>
      ) : (
        <div className="space-y-6">
          <TicketSection
            title="Tiket Saya"
            subtitle="Tiket yang Anda buka pada shift ini (proses & selesai) — tetap tampil sampai serah terima shift."
            tickets={mine}
            emptyText="Belum ada tiket yang Anda buka pada shift ini."
            tone="mine"
            onOpen={(id) => router.push(`/daily-monitoring/${id}`)}
          />
          <TicketSection
            title="Tindak Lanjut Shift Sebelumnya"
            subtitle="Tiket yang diteruskan ke shift Anda dari shift sebelumnya."
            tickets={lanjutan}
            emptyText="Tidak ada tiket tindak lanjut dari shift sebelumnya."
            tone="lanjutan"
            onOpen={(id) => router.push(`/daily-monitoring/${id}`)}
          />
        </div>
      )}

      {/* ---- Modal serah terima shift (batch) ---- */}
      <Modal
        open={hoOpen}
        onClose={() => setHoOpen(false)}
        title={
          hoStep === "confirm"
            ? "Konfirmasi serah terima shift"
            : "Serahkan semua tiket open ke shift berikutnya?"
        }
        size="sm"
      >
        {hoStep === "confirm" ? (
          <>
            <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              <p>
                Pastikan seluruh kegiatan penanganan sudah benar dan tidak ada
                typo.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="secondary" onClick={() => setHoOpen(false)}>
                Periksa kembali
              </Button>
              <Button variant="danger" onClick={() => setHoStep("select")}>
                Ya, sudah benar
              </Button>
            </div>
          </>
        ) : (
          <>
        <div className="flex items-start gap-2 text-sm text-gray-600">
          <ArrowRightLeft className="w-5 h-5 text-accent-dark shrink-0 mt-0.5" />
          <p>
            Semua tiket yang masih <span className="font-semibold">open</span>{" "}
            akan diteruskan dari{" "}
            <span className="font-semibold text-gray-900">
              {SHIFT_LABELS[currentShift] ?? `Shift ${currentShift}`}
            </span>{" "}
            ke{" "}
            <span className="font-semibold text-gray-900">
              {toShift ? SHIFT_LABELS[toShift] ?? `Shift ${toShift}` : "—"}
            </span>
            . Penanda{" "}
            <span className="font-medium">
              &ldquo;TINDAK LANJUT MONITORING SELANJUTNYA&rdquo;
            </span>{" "}
            otomatis ditambahkan pada tiap tiket dengan timestamp saat ini.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <Select
            label="Pimpinan Bag. Infrastruktur"
            required
            value={hoInfra}
            onChange={(e) => setHoInfra(e.target.value)}
          >
            <option value="">— Pilih pimpinan —</option>
            {leadersInfra.map((l) => (
              <option key={l.id} value={l.id}>
                {leaderLabel(l)}
              </option>
            ))}
          </Select>
          <Select
            label="Pimpinan Divisi"
            required
            value={hoDivisi}
            onChange={(e) => setHoDivisi(e.target.value)}
          >
            <option value="">— Pilih pimpinan —</option>
            {leadersDivisi.map((l) => (
              <option key={l.id} value={l.id}>
                {leaderLabel(l)}
              </option>
            ))}
          </Select>
          <Select
            label="Supervisi"
            required
            value={hoSupervisi}
            onChange={(e) => setHoSupervisi(e.target.value)}
          >
            <option value="">— Pilih supervisi —</option>
            {supervisiUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nama}
              </option>
            ))}
          </Select>
          <div>
            <Select
              label="Supervisi Selanjutnya"
              value={hoSupervisiNext}
              onChange={(e) => setHoSupervisiNext(e.target.value)}
            >
              <option value="">— Tidak ada —</option>
              {supervisiUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nama}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-gray-500">
              (opsional — hanya jika ada pergantian supervisi)
            </p>
          </div>
          <Select
            label="Petugas yang Menerima Shift"
            required
            value={hoReceiver}
            onChange={(e) => setHoReceiver(e.target.value)}
          >
            <option value="">— Pilih petugas penerima —</option>
            {receiverOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nama}
              </option>
            ))}
          </Select>
        </div>

        {!currentUserHasTtd && (
          <p className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <span>
              Anda belum mengupload tanda tangan digital. TTD pada laporan akan
              tampil sebagai placeholder. Upload TTD di menu Setting.
            </span>
          </p>
        )}

        {hoErr && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {hoErr}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setHoStep("confirm")}>
            Kembali
          </Button>
          <Button
            loading={hoBusy}
            disabled={!canHandover}
            onClick={confirmHandover}
          >
            <ArrowRightLeft className="w-4 h-4" /> Serahkan Shift
          </Button>
        </div>
          </>
        )}
      </Modal>

      {/* ---- Modal Tutup Laporan Shift (tanpa penerima, PART 6) ---- */}
      <Modal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="Tutup Laporan Shift"
        size="sm"
      >
        <div className="flex items-start gap-2 text-sm text-gray-600">
          <FileCheck className="w-5 h-5 text-accent-dark shrink-0 mt-0.5" />
          <p>
            Tutup laporan shift{" "}
            <span className="font-semibold text-gray-900">
              {SHIFT_LABELS[currentShift] ?? `Shift ${currentShift}`}
            </span>{" "}
            tanpa penerima (mis. lupa serah terima). Laporan shift dibuat dan
            menunggu approval supervisi. Tiket open tidak diteruskan ke shift
            berikutnya.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <Select
            label="Pimpinan Bag. Infrastruktur"
            required
            value={hoInfra}
            onChange={(e) => setHoInfra(e.target.value)}
          >
            <option value="">— Pilih pimpinan —</option>
            {leadersInfra.map((l) => (
              <option key={l.id} value={l.id}>
                {leaderLabel(l)}
              </option>
            ))}
          </Select>
          <Select
            label="Pimpinan Divisi"
            required
            value={hoDivisi}
            onChange={(e) => setHoDivisi(e.target.value)}
          >
            <option value="">— Pilih pimpinan —</option>
            {leadersDivisi.map((l) => (
              <option key={l.id} value={l.id}>
                {leaderLabel(l)}
              </option>
            ))}
          </Select>
          <Select
            label="Supervisi"
            required
            value={hoSupervisi}
            onChange={(e) => setHoSupervisi(e.target.value)}
          >
            <option value="">— Pilih supervisi —</option>
            {supervisiUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nama}
              </option>
            ))}
          </Select>
          <div>
            <Select
              label="Supervisi Selanjutnya"
              value={hoSupervisiNext}
              onChange={(e) => setHoSupervisiNext(e.target.value)}
            >
              <option value="">— Tidak ada —</option>
              {supervisiUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nama}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-gray-500">
              (opsional — hanya jika ada pergantian supervisi)
            </p>
          </div>
        </div>

        {!currentUserHasTtd && (
          <p className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <span>
              Anda belum mengupload tanda tangan digital. TTD pada laporan akan
              tampil sebagai placeholder. Upload TTD di menu Setting.
            </span>
          </p>
        )}

        {closeErr && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {closeErr}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setCloseOpen(false)}>
            Batal
          </Button>
          <Button
            loading={closeBusy}
            disabled={!canCloseShift}
            onClick={confirmCloseShift}
          >
            <FileCheck className="w-4 h-4" /> Tutup Laporan Shift
          </Button>
        </div>
      </Modal>
    </div>
  );
}

interface TicketSectionProps {
  title: string;
  subtitle: string;
  tickets: TicketListItem[];
  emptyText: string;
  tone: "mine" | "lanjutan";
  onOpen: (id: string) => void;
}

function TicketSection({
  title,
  subtitle,
  tickets,
  emptyText,
  tone,
  onOpen,
}: TicketSectionProps) {
  const toneCls =
    tone === "lanjutan"
      ? "border-amber-200 bg-amber-50/40"
      : "border-gray-100 bg-surface-subtle/40";
  return (
    <section className={`rounded-lg border ${toneCls} p-3`}>
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            {title}{" "}
            <span className="ml-1 text-xs font-normal text-gray-500">
              ({tickets.length})
            </span>
          </h2>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </header>

      {tickets.length === 0 ? (
        <p className="px-2 py-4 text-center text-xs text-gray-400">
          {emptyText}
        </p>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <Th>Kode ATM</Th>
              <Th>No Tiket</Th>
              <Th>Tgl Open</Th>
              <Th>PIC</Th>
              <Th>Update Status Terkini</Th>
              <Th>PIC Update</Th>
              <Th>Status</Th>
              <Th>Supervisi</Th>
              <Th>Vendor</Th>
              <Th>Tiket Vendor</Th>
            </TableRow>
          </TableHead>
          <TableBody>
            {tickets.map((t) => (
              <TableRow
                key={t.id}
                className={`cursor-pointer ${
                  t.status === "selesai" ? "opacity-60" : ""
                }`}
                onClick={() => onOpen(t.id)}
              >
                <Td className="font-mono font-medium text-gray-900">
                  {t.kodeAtm}
                  <div className="text-xs font-sans font-normal text-gray-500 max-w-[12rem] truncate">
                    {t.namaAtm}
                  </div>
                </Td>
                <Td className="whitespace-nowrap">
                  <span className="font-mono font-semibold text-primary">
                    {t.noTiket}
                  </span>
                  <div className="mt-0.5 flex items-center gap-1">
                    <Badge variant={t.kategori === "atm" ? "info" : "neutral"}>
                      {t.kategori === "atm" ? "ATM" : "Jaringan"}
                    </Badge>
                    {tone === "lanjutan" && (
                      <Badge
                        variant="info"
                        title="Tindak lanjut dari shift sebelumnya"
                      >
                        <ArrowRightLeft className="w-3 h-3 mr-0.5" /> Tindak
                        Lanjut
                      </Badge>
                    )}
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-xs">
                  {fmtDateTime(t.waktuOpen)}
                </Td>
                <Td className="whitespace-nowrap">{t.ownerNama}</Td>
                <Td className="max-w-[16rem]">
                  {t.lastTeks ? (
                    <span className="line-clamp-2 text-gray-700">
                      {t.lastTeks}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-xs text-gray-500">
                  {t.lastPic ?? "—"}
                </Td>
                <Td>
                  <Badge
                    variant={t.status === "selesai" ? "success" : "warning"}
                  >
                    {t.status === "selesai" ? "Selesai" : "Dalam Proses"}
                  </Badge>
                </Td>
                <Td>
                  <Badge
                    variant={
                      t.supervisiStatus === "approved" ? "success" : "neutral"
                    }
                  >
                    {t.supervisiStatus === "approved"
                      ? `Diapprove oleh ${t.supervisiNama ?? "Supervisi"}`
                      : "Menunggu Approval"}
                  </Badge>
                </Td>
                <Td className="max-w-[10rem]">
                  {t.vendor?.trim() ? (
                    <span className="block truncate text-gray-700">
                      {t.vendor}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </Td>
                <Td className="whitespace-nowrap font-mono text-xs">
                  {t.noTiketVendor?.trim() ? (
                    <span className="text-gray-700">{t.noTiketVendor}</span>
                  ) : (
                    <span className="font-sans text-gray-400">—</span>
                  )}
                </Td>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
