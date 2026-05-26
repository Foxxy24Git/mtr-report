"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRightLeft } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  Th,
  Td,
} from "@/components/ui/Table";
import { fmtDateTime } from "@/lib/format";
import type { TicketListItem } from "@/lib/ticketQueries";

interface Props {
  initialItems: TicketListItem[];
  shifts: string[];
}

type Scope = "all" | "mine" | "lanjutan";

const SELECT_CLS =
  "px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";

export function DailyMonitoringClient({ initialItems, shifts }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<TicketListItem[]>(initialItems);
  const [loading, setLoading] = useState(false);

  const [kategori, setKategori] = useState("");
  const [shift, setShift] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [status, setStatus] = useState("");

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (kategori) qs.set("kategori", kategori);
        if (shift) qs.set("shift", shift);
        if (scope !== "all") qs.set("scope", scope);
        if (status) qs.set("status", status);
        const res = await fetch(`/api/tickets?${qs.toString()}`);
        const data = await res.json();
        setItems(data.items ?? []);
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => clearTimeout(handle);
  }, [kategori, shift, scope, status]);

  return (
    <div className="space-y-4">
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
          value={shift}
          onChange={(e) => setShift(e.target.value)}
          className={SELECT_CLS}
          aria-label="Filter shift"
        >
          <option value="">Semua Shift</option>
          {shifts.map((s) => (
            <option key={s} value={s}>
              Shift {s}
            </option>
          ))}
        </select>

        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as Scope)}
          className={SELECT_CLS}
          aria-label="Filter kepemilikan"
        >
          <option value="all">Semua Tiket</option>
          <option value="mine">Milik Saya (shift ini)</option>
          <option value="lanjutan">Dilanjutkan (lintas shift)</option>
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={SELECT_CLS}
          aria-label="Filter status"
        >
          <option value="">Semua Status</option>
          <option value="proses">Proses</option>
          <option value="selesai">Selesai</option>
        </select>

        {loading && (
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
        )}
        <span className="text-xs text-gray-500 ml-auto">
          {items.length} tiket
        </span>
      </div>

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
          {items.length === 0 ? (
            <TableRow>
              <Td colSpan={8} className="text-center text-gray-400 py-8">
                Tidak ada tiket sesuai filter.
              </Td>
            </TableRow>
          ) : (
            items.map((t) => (
              <TableRow
                key={t.id}
                className="cursor-pointer"
                onClick={() => router.push(`/daily-monitoring/${t.id}`)}
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
                    <Badge variant="neutral">Shift {t.shiftKode}</Badge>
                    {t.lanjutan && (
                      <Badge variant="warning" title="Dilanjutkan dari shift sebelumnya">
                        <ArrowRightLeft className="w-3 h-3 mr-0.5" /> Lanjutan
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
                  <Badge variant={t.status === "selesai" ? "success" : "warning"}>
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
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
