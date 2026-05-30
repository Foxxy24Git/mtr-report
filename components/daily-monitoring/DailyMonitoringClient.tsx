"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRightLeft } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
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

interface Props {
  initialItems: TicketListItem[];
  shifts: string[];
  role: "superadmin" | "user" | "supervisi";
  currentShift: string;
}

const SELECT_CLS =
  "px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";

export function DailyMonitoringClient({
  initialItems,
  shifts,
  role,
  currentShift,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<TicketListItem[]>(initialItems);
  const [loading, setLoading] = useState(false);

  const [kategori, setKategori] = useState("");

  // --- Serah terima shift (batch, global) ---
  const hasShift = shifts.includes(currentShift);
  const toShift = hasShift ? nextShift(currentShift as ShiftCode) : null;
  const [hoOpen, setHoOpen] = useState(false);
  const [hoBusy, setHoBusy] = useState(false);
  const [hoErr, setHoErr] = useState("");

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

  // Pisahkan tiket sesuai PRD §4.B: milik shift aktif (saya) vs tindak lanjut.
  const { mine, lanjutan } = useMemo(() => {
    const m: TicketListItem[] = [];
    const l: TicketListItem[] = [];
    for (const t of items) (t.lanjutan ? l : m).push(t);
    return { mine: m, lanjutan: l };
  }, [items]);

  async function confirmHandover() {
    setHoErr("");
    setHoBusy(true);
    try {
      const res = await fetch("/api/shift/handover", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHoErr(data.error ?? "Gagal melakukan serah terima.");
        return;
      }
      setHoOpen(false);
      await loadTickets();
      router.refresh();
    } finally {
      setHoBusy(false);
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
          <Button
            size="sm"
            variant="secondary"
            disabled={!hasShift}
            onClick={() => {
              setHoErr("");
              setHoOpen(true);
            }}
          >
            <ArrowRightLeft className="w-4 h-4" /> Serah Terima Shift ke Shift
            Berikutnya
          </Button>
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

        {loading && (
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
        )}
        <span className="text-xs text-gray-500 ml-auto">
          {items.length} tiket aktif
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
            subtitle="Tiket yang Anda buka pada shift aktif ini."
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
        title="Serahkan semua tiket open ke shift berikutnya?"
        size="sm"
      >
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
        {hoErr && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {hoErr}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setHoOpen(false)}>
            Batal
          </Button>
          <Button loading={hoBusy} onClick={confirmHandover}>
            <ArrowRightLeft className="w-4 h-4" /> Ya, Serahkan
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
            </TableRow>
          </TableHead>
          <TableBody>
            {tickets.map((t) => (
              <TableRow
                key={t.id}
                className="cursor-pointer"
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
                        variant="warning"
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
                    {t.status === "selesai" ? "Selesai" : "Proses"}
                  </Badge>
                </Td>
                <Td>
                  <Badge
                    variant={
                      t.statusSupervisi === "approved" ? "success" : "neutral"
                    }
                  >
                    {t.statusSupervisi === "approved"
                      ? "Sudah Approve"
                      : "Belum Approve"}
                  </Badge>
                </Td>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
