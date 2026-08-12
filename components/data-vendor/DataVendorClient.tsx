"use client";

import { useState } from "react";
import { Plus, Truck } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export interface VendorRow {
  id: string;
  nama: string;
}

export function DataVendorClient({ initialItems }: { initialItems: VendorRow[] }) {
  const [items, setItems] = useState(
    [...initialItems].sort((a, b) => a.nama.localeCompare(b.nama, "id"))
  );

  const [addNama, setAddNama] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState("");

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddErr("");
    const nama = addNama.trim();
    if (!nama) return setAddErr("Nama vendor wajib diisi.");

    setAddBusy(true);
    try {
      const res = await fetch("/api/vendor-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddErr(data.error ?? "Gagal menambah vendor.");
        return;
      }
      setItems((prev) =>
        [...prev, data.item as VendorRow].sort((a, b) =>
          a.nama.localeCompare(b.nama, "id")
        )
      );
      setAddNama("");
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Data Vendor</h1>
        <p className="page-subtitle">
          Kelola pilihan Vendor pada form Open Tiket. Hanya Super Admin yang
          dapat menambah vendor baru.
        </p>
      </div>

      <Card padding="none">
        <div className="p-5 border-b border-gray-100">
          <CardTitle>Daftar Vendor</CardTitle>
          <p className="mt-0.5 text-sm text-gray-500">
            Muncul sebagai pilihan pada field Vendor di form Open Tiket.
          </p>
        </div>

        {/* Tambah vendor baru */}
        <form
          onSubmit={submitAdd}
          className="p-5 border-b border-gray-100 bg-surface-muted/30"
        >
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <Input
                label="Tambah Vendor Baru"
                placeholder="cth. Sigma"
                value={addNama}
                onChange={(e) => setAddNama(e.target.value)}
              />
            </div>
            <Button type="submit" loading={addBusy}>
              <Plus className="w-4 h-4" /> Tambah
            </Button>
          </div>
          {addErr && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {addErr}
            </p>
          )}
        </form>

        {/* Daftar vendor */}
        <ul>
          {items.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-gray-400">
              Belum ada vendor.
            </li>
          )}
          {items.map((row) => (
            <li
              key={row.id}
              className="px-5 py-3 border-b border-gray-50 last:border-0 flex items-center gap-2.5"
            >
              <Truck className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-sm text-gray-800">{row.nama}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
