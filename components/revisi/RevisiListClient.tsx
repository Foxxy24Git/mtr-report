"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Inbox, Wrench, Clock } from "lucide-react";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  Th,
  Td,
} from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { RevisiListItem } from "@/lib/activityRevision";

interface Props {
  initialItems: RevisiListItem[];
}

export function RevisiListClient({ initialItems }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<RevisiListItem[]>(initialItems);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/revisi");
      const data = await res.json().catch(() => ({}));
      setItems(res.ok ? (data.items ?? []) : items);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {refreshing && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
        <span className="text-xs text-gray-500 ml-auto">
          {items.length} item menunggu
        </span>
      </div>

      <Table>
        <TableHead>
          <TableRow>
            <Th>No Tiket</Th>
            <Th>Lokasi ATM</Th>
            <Th>Teks Kegiatan</Th>
            <Th>Alasan Supervisi</Th>
            <Th>Status</Th>
            <Th>Aksi</Th>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <Td colSpan={6} className="text-center text-gray-400 py-8">
                <div className="flex flex-col items-center gap-2">
                  <Inbox className="h-6 w-6 text-gray-300" />
                  Tidak ada kegiatan yang perlu direvisi. Kerja bagus!
                </div>
              </Td>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow key={item.id}>
                <Td className="whitespace-nowrap font-mono font-semibold text-primary">
                  {item.noTiket}
                </Td>
                <Td className="font-mono text-sm text-gray-900">
                  {item.kodeAtm}
                  <div className="text-xs font-sans font-normal text-gray-500 max-w-[12rem] truncate">
                    {item.namaAtm}
                  </div>
                </Td>
                <Td className="max-w-xs">
                  <p className="truncate text-xs text-gray-700">{item.teksSaatIni}</p>
                </Td>
                <Td className="max-w-xs">
                  <p className="truncate text-xs text-gray-600">
                    {item.catatan ?? "—"}
                  </p>
                </Td>
                <Td className="whitespace-nowrap">
                  {item.status === "menunggu_petugas" ? (
                    <Badge variant="danger">Menunggu Anda</Badge>
                  ) : (
                    <Badge variant="info">Menunggu Verifikasi Supervisi</Badge>
                  )}
                </Td>
                <Td className="whitespace-nowrap">
                  {item.status === "menunggu_petugas" ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        router.push(
                          `/daily-monitoring/${item.ticketId}?revisi=${item.activityId}`
                        )
                      }
                    >
                      <Wrench className="w-4 h-4" /> Perbaiki
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="w-3.5 h-3.5" /> Menunggu
                    </span>
                  )}
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {items.length > 0 && (
        <button
          type="button"
          onClick={refresh}
          className="text-xs text-gray-500 hover:text-primary transition-colors"
        >
          Segarkan daftar
        </button>
      )}
    </div>
  );
}
