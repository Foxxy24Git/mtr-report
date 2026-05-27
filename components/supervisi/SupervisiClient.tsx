"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
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
}

const SELECT_CLS =
  "px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";

export function SupervisiClient({ initialItems }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<TicketListItem[]>(initialItems);
  const [loading, setLoading] = useState(false);

  const [statusSupervisi, setStatusSupervisi] = useState("");
  const [kategori, setKategori] = useState("");

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusSupervisi) qs.set("statusSupervisi", statusSupervisi);
      if (kategori) qs.set("kategori", kategori);
      const res = await fetch(`/api/tickets?${qs.toString()}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [statusSupervisi, kategori]);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const handle = setTimeout(loadTickets, 150);
    return () => clearTimeout(handle);
  }, [loadTickets]);

  const belumCount = items.filter((t) => t.statusSupervisi !== "approved").length;

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusSupervisi}
          onChange={(e) => setStatusSupervisi(e.target.value)}
          className={SELECT_CLS}
          aria-label="Filter status supervisi"
        >
          <option value="">Semua Status Supervisi</option>
          <option value="belum">Belum Approve</option>
          <option value="approved">Sudah Approve</option>
        </select>

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

        {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
        <span className="text-xs text-gray-500 ml-auto">
          {belumCount} belum di-approve · {items.length} tiket
        </span>
      </div>

      <Table>
        <TableHead>
          <TableRow>
            <Th>No Tiket</Th>
            <Th>Kode / Lokasi ATM</Th>
            <Th>Kategori</Th>
            <Th>Status</Th>
            <Th>Owner</Th>
            <Th>Status Supervisi</Th>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <Td colSpan={6} className="text-center text-gray-400 py-8">
                Tidak ada tiket sesuai filter.
              </Td>
            </TableRow>
          ) : (
            items.map((t) => (
              <TableRow
                key={t.id}
                className="cursor-pointer"
                onClick={() => router.push(`/supervisi/${t.id}`)}
              >
                <Td className="whitespace-nowrap">
                  <span className="font-mono font-semibold text-primary">
                    {t.noTiket}
                  </span>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {fmtDateTime(t.waktuOpen)}
                  </div>
                </Td>
                <Td className="font-mono font-medium text-gray-900">
                  {t.kodeAtm}
                  <div className="text-xs font-sans font-normal text-gray-500 max-w-[14rem] truncate">
                    {t.namaAtm}
                  </div>
                </Td>
                <Td>
                  <Badge variant={t.kategori === "atm" ? "info" : "neutral"}>
                    {t.kategori === "atm" ? "ATM" : "Jaringan"}
                  </Badge>
                </Td>
                <Td>
                  <Badge variant={t.status === "selesai" ? "success" : "warning"}>
                    {t.status === "selesai" ? "Selesai" : "Proses"}
                  </Badge>
                </Td>
                <Td className="whitespace-nowrap">{t.ownerNama}</Td>
                <Td>
                  {t.statusSupervisi === "approved" ? (
                    <Badge variant="success">
                      <ShieldCheck className="w-3 h-3 mr-0.5" /> Sudah Approve
                    </Badge>
                  ) : (
                    <Badge variant="neutral">Belum Approve</Badge>
                  )}
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
