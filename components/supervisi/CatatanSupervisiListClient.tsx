"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Eye, Inbox } from "lucide-react";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  Th,
  Td,
} from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { fmtDate } from "@/lib/format";
import { SHIFT_NAMES } from "@/lib/constants";
import type { CatatanSupervisiItem } from "@/lib/shiftReportQueries";

interface Props {
  initialItems: CatatanSupervisiItem[];
}

const SELECT_CLS =
  "px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";

export function CatatanSupervisiListClient({ initialItems }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<CatatanSupervisiItem[]>(initialItems);
  const [loading, setLoading] = useState(false);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const res = await fetch(`/api/catatan-supervisi?${qs.toString()}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const handle = setTimeout(load, 150);
    return () => clearTimeout(handle);
  }, [load]);

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className={SELECT_CLS}
            aria-label="Tanggal dari"
          />
          <span>—</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className={SELECT_CLS}
            aria-label="Tanggal sampai"
          />
        </div>

        {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
        <span className="text-xs text-gray-500 ml-auto">
          {items.length} catatan
        </span>
      </div>

      <Table>
        <TableHead>
          <TableRow>
            <Th>Tanggal</Th>
            <Th>Shift</Th>
            <Th>Catatan</Th>
            <Th>Jml Tiket</Th>
            <Th>Aksi</Th>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <Td colSpan={5} className="text-center text-gray-400 py-8">
                <div className="flex flex-col items-center gap-2">
                  <Inbox className="h-6 w-6 text-gray-300" />
                  Belum ada catatan supervisi.
                </div>
              </Td>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow
                key={item.id}
                className="cursor-pointer hover:bg-surface-subtle/60 transition-colors"
                onClick={() => router.push(`/catatan-supervisi/${item.id}`)}
              >
                <Td className="whitespace-nowrap">{fmtDate(item.tanggal)}</Td>
                <Td className="whitespace-nowrap text-sm">
                  {SHIFT_NAMES[item.shiftKode] ?? `Shift ${item.shiftKode}`}
                </Td>
                <Td className="max-w-xs">
                  {item.catatanSupervisi && (
                    <p className="truncate text-xs text-gray-700">
                      <span className="font-medium text-gray-500">Supervisi:</span>{" "}
                      {item.catatanSupervisi}
                    </p>
                  )}
                  {item.catatanSupervisiNext && (
                    <p className="truncate text-xs text-gray-700">
                      <span className="font-medium text-gray-500">
                        Supervisi Selanjutnya:
                      </span>{" "}
                      {item.catatanSupervisiNext}
                    </p>
                  )}
                </Td>
                <Td className="text-center font-medium">{item.jmlTiket}</Td>
                <Td>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/catatan-supervisi/${item.id}`);
                    }}
                  >
                    <Eye className="w-4 h-4" />
                    Lihat Detail
                  </Button>
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
