"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  Th,
  Td,
} from "@/components/ui/Table";

export interface AtmItem {
  id: string;
  kodeAtm: string;
  namaAtm: string;
  cabang: string | null;
  alamat: string | null;
  vendorAtm: string | null;
  vendorJaringan: string | null;
}

interface Props {
  initialItems: AtmItem[];
  total: number;
}

const EMPTY_FORM = {
  kodeAtm: "",
  namaAtm: "",
  cabang: "",
  alamat: "",
  vendorAtm: "",
  vendorJaringan: "",
};

export function DataAtmClient({ initialItems, total }: Props) {
  const [items, setItems] = useState<AtmItem[]>(initialItems);
  const [count, setCount] = useState(total);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AtmItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [deleting, setDeleting] = useState<AtmItem | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Pencarian server-side dengan debounce.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/atm?q=${encodeURIComponent(query)}&limit=200`);
        const data = await res.json();
        setItems(data.items ?? []);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  async function refresh() {
    const res = await fetch(`/api/atm?q=${encodeURIComponent(query)}&limit=200`);
    const data = await res.json();
    setItems(data.items ?? []);
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setFormOpen(true);
  }

  function openEdit(item: AtmItem) {
    setEditing(item);
    setForm({
      kodeAtm: item.kodeAtm,
      namaAtm: item.namaAtm,
      cabang: item.cabang ?? "",
      alamat: item.alamat ?? "",
      vendorAtm: item.vendorAtm ?? "",
      vendorJaringan: item.vendorJaringan ?? "",
    });
    setError("");
    setFormOpen(true);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.kodeAtm.trim() || !form.namaAtm.trim()) {
      setError("ID/Kode ATM dan Nama ATM wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `/api/atm/${editing.id}` : "/api/atm";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal menyimpan data.");
        return;
      }
      setFormOpen(false);
      if (!editing) setCount((c) => c + 1);
      await refresh();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError("");
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/atm/${deleting.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(data.error ?? "Gagal menghapus.");
        return;
      }
      setDeleting(null);
      setCount((c) => Math.max(0, c - 1));
      await refresh();
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari kode atau nama ATM…"
            className="w-full pl-9 pr-9 py-2 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
          )}
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" /> Tambah ATM
        </Button>
      </div>

      <p className="text-xs text-gray-500">
        Menampilkan {items.length} dari {count} data master.
      </p>

      <Table>
        <TableHead>
          <TableRow>
            <Th>Kode</Th>
            <Th>Nama / Lokasi</Th>
            <Th>Cabang</Th>
            <Th>Vendor ATM</Th>
            <Th>Vendor Jaringan</Th>
            <Th className="text-right">Aksi</Th>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <Td colSpan={6} className="text-center text-gray-400 py-8">
                Tidak ada data.
              </Td>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow key={item.id}>
                <Td className="font-mono font-medium text-gray-900">
                  {item.kodeAtm}
                </Td>
                <Td>
                  <div className="font-medium text-gray-900">{item.namaAtm}</div>
                  {item.alamat && (
                    <div className="text-xs text-gray-500">{item.alamat}</div>
                  )}
                </Td>
                <Td>{item.cabang ?? "—"}</Td>
                <Td>{item.vendorAtm ?? "—"}</Td>
                <Td>{item.vendorJaringan ?? "—"}</Td>
                <Td className="text-right whitespace-nowrap">
                  <button
                    onClick={() => openEdit(item)}
                    className="p-1.5 rounded-md text-gray-500 hover:bg-primary-50 hover:text-primary transition-colors"
                    title="Ubah"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setDeleteError("");
                      setDeleting(item);
                    }}
                    className="p-1.5 rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Hapus"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Modal tambah/ubah */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Ubah Data ATM" : "Tambah Data ATM / Jaringan"}
        description="Lengkapi data master ATM atau lokasi jaringan."
        size="lg"
      >
        <form onSubmit={submitForm} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="ID / Kode ATM"
              required
              value={form.kodeAtm}
              onChange={(e) => setForm({ ...form, kodeAtm: e.target.value })}
              placeholder="cth. 010101"
            />
            <Input
              label="Nama ATM"
              required
              value={form.namaAtm}
              onChange={(e) => setForm({ ...form, namaAtm: e.target.value })}
              placeholder="cth. ATM CAPEM IBUH PYK"
            />
            <Input
              label="Cabang"
              value={form.cabang}
              onChange={(e) => setForm({ ...form, cabang: e.target.value })}
            />
            <Input
              label="Alamat"
              value={form.alamat}
              onChange={(e) => setForm({ ...form, alamat: e.target.value })}
            />
            <Input
              label="Vendor ATM"
              value={form.vendorAtm}
              onChange={(e) => setForm({ ...form, vendorAtm: e.target.value })}
            />
            <Input
              label="Vendor Jaringan ATM"
              value={form.vendorJaringan}
              onChange={(e) =>
                setForm({ ...form, vendorJaringan: e.target.value })
              }
            />
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2"
            >
              {error}
            </motion.p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setFormOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "Simpan Perubahan" : "Tambah"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Konfirmasi hapus */}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Hapus Data ATM?"
        size="sm"
      >
        <p className="text-sm text-gray-600">
          Yakin menghapus{" "}
          <span className="font-semibold text-gray-900">
            {deleting?.kodeAtm} — {deleting?.namaAtm}
          </span>
          ? Tindakan ini tidak bisa dibatalkan.
        </p>
        {deleteError && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {deleteError}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setDeleting(null)}>
            Batal
          </Button>
          <Button variant="danger" loading={deleteBusy} onClick={confirmDelete}>
            Hapus
          </Button>
        </div>
      </Modal>
    </div>
  );
}
