"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  UserPlus,
  CheckCircle2,
  PenLine,
  Pencil,
  Ban,
  RotateCcw,
  ImageIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  Th,
  Td,
} from "@/components/ui/Table";
import type { Role } from "@/lib/roles";

export interface AkunRow {
  id: string;
  username: string;
  nama: string;
  role: Role;
  fotoProfilUrl: string | null;
  ttdUrl: string | null;
  isAktif: boolean;
}

const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Super Admin",
  user: "Petugas",
  supervisi: "Supervisi",
};
const ROLE_VARIANT: Record<Role, "primary" | "info" | "neutral"> = {
  superadmin: "primary",
  user: "info",
  supervisi: "neutral",
};

interface FormState {
  nama: string;
  username: string;
  password: string;
  role: string;
  isAktif: boolean;
}

const EMPTY: FormState = {
  nama: "",
  username: "",
  password: "",
  role: "user",
  isAktif: true,
};

interface Props {
  initialUsers: AkunRow[];
  currentUserId: string;
  editId: string | null;
}

export function ManajemenAkunClient({
  initialUsers,
  currentUserId,
  editId,
}: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [ttdFile, setTtdFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fotoRef = useRef<HTMLInputElement>(null);
  const ttdRef = useRef<HTMLInputElement>(null);

  const editing = users.find((u) => u.id === editingId) ?? null;

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY);
    setFotoFile(null);
    setTtdFile(null);
    setError("");
    setOpen(true);
  }

  function openEdit(u: AkunRow) {
    setEditingId(u.id);
    setForm({
      nama: u.nama,
      username: u.username,
      password: "",
      role: u.role === "superadmin" ? "user" : u.role,
      isAktif: u.isAktif,
    });
    setFotoFile(null);
    setTtdFile(null);
    setError("");
    setOpen(true);
  }

  // Buka modal edit otomatis bila datang dari Dashboard (?edit=<id>).
  useEffect(() => {
    if (editId) {
      const u = initialUsers.find((x) => x.id === editId);
      if (u) openEdit(u);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  /** Unggah foto/ttd untuk user tertentu; kembalikan URL baru bila ada. */
  async function uploadImages(userId: string) {
    const result: { fotoProfilUrl?: string; ttdUrl?: string } = {};
    if (fotoFile) {
      const fd = new FormData();
      fd.append("file", fotoFile);
      const res = await fetch(`/api/users/${userId}/foto`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal mengunggah foto.");
      result.fotoProfilUrl = data.url;
    }
    if (ttdFile) {
      const fd = new FormData();
      fd.append("file", ttdFile);
      const res = await fetch(`/api/users/${userId}/ttd`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal mengunggah TTD.");
      result.ttdUrl = data.url;
    }
    return result;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (editingId) {
        // Edit akun. Role & status tidak dikirim untuk akun Super Admin
        // (tidak dapat diubah — server menolak).
        const isSuper = editing?.role === "superadmin";
        const res = await fetch(`/api/users/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nama: form.nama,
            ...(isSuper
              ? {}
              : { username: form.username, role: form.role, isAktif: form.isAktif }),
            ...(form.password ? { password: form.password } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Gagal menyimpan perubahan.");
          return;
        }
        const imgs = await uploadImages(editingId);
        setUsers((prev) =>
          prev.map((u) =>
            u.id === editingId ? { ...u, ...data.user, ...imgs } : u
          )
        );
      } else {
        // Tambah akun
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nama: form.nama,
            username: form.username,
            password: form.password,
            role: form.role,
            isAktif: form.isAktif,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Gagal menambah akun.");
          return;
        }
        const imgs = await uploadImages(data.user.id);
        setUsers((prev) =>
          [
            {
              ...data.user,
              fotoProfilUrl: imgs.fotoProfilUrl ?? null,
              ttdUrl: imgs.ttdUrl ?? null,
            } as AkunRow,
            ...prev,
          ].sort((a, b) => a.username.localeCompare(b.username))
        );
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }

  /** Aktifkan/nonaktifkan cepat dari tabel. */
  async function toggleAktif(u: AkunRow) {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isAktif: !u.isAktif }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error ?? "Gagal mengubah status akun.");
      return;
    }
    setUsers((prev) =>
      prev.map((x) => (x.id === u.id ? { ...x, isAktif: !u.isAktif } : x))
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Manajemen Akun</h1>
          <p className="page-subtitle">
            Tambah, ubah, dan nonaktifkan akun Petugas &amp; Supervisi.
          </p>
        </div>
        <Button onClick={openAdd}>
          <UserPlus className="w-4 h-4" /> Tambah Akun
        </Button>
      </div>

      <Card padding="none">
        <Table>
          <TableHead>
            <tr>
              <Th>Nama</Th>
              <Th>Username</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Foto</Th>
              <Th>TTD</Th>
              <Th className="text-right">Aksi</Th>
            </tr>
          </TableHead>
          <TableBody>
            {users.map((u) => {
              const isSuper = u.role === "superadmin";
              return (
                <TableRow key={u.id}>
                  <Td className="font-medium text-gray-800">{u.nama}</Td>
                  <Td className="text-gray-600">@{u.username}</Td>
                  <Td>
                    <Badge variant={ROLE_VARIANT[u.role]}>
                      {ROLE_LABELS[u.role]}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge variant={u.isAktif ? "success" : "danger"}>
                      {u.isAktif ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </Td>
                  <Td>
                    {u.fotoProfilUrl ? (
                      <span className="relative inline-block w-8 h-8 rounded-full overflow-hidden bg-gray-100">
                        <Image
                          src={u.fotoProfilUrl}
                          alt={u.nama}
                          fill
                          className="object-cover"
                        />
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <ImageIcon className="w-3.5 h-3.5" /> —
                      </span>
                    )}
                  </Td>
                  <Td>
                    {u.ttdUrl ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Ada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <PenLine className="w-3.5 h-3.5" /> Belum
                      </span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(u)}
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Button>
                      {!isSuper && u.id !== currentUserId && (
                        <Button
                          size="sm"
                          variant={u.isAktif ? "ghost" : "secondary"}
                          onClick={() => toggleAktif(u)}
                          className={u.isAktif ? "text-red-600" : ""}
                        >
                          {u.isAktif ? (
                            <>
                              <Ban className="w-3.5 h-3.5" /> Nonaktifkan
                            </>
                          ) : (
                            <>
                              <RotateCcw className="w-3.5 h-3.5" /> Aktifkan
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </Td>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? "Edit Akun" : "Tambah Akun"}
        description={
          editingId
            ? "Ubah data akun. Kosongkan password bila tidak diganti."
            : "Buat akun Petugas Monitoring atau Supervisi baru."
        }
        size="lg"
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nama Lengkap"
              required
              value={form.nama}
              onChange={(e) => setForm({ ...form, nama: e.target.value })}
            />
            <Input
              label="Username"
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              hint="Huruf kecil, angka, titik, atau garis bawah."
              disabled={editing?.role === "superadmin"}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Peran"
              required
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              disabled={editing?.role === "superadmin"}
            >
              <option value="user">Petugas Monitoring</option>
              <option value="supervisi">Supervisi</option>
            </Select>
            <Input
              label={editingId ? "Reset Password" : "Password Awal"}
              type="text"
              required={!editingId}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              hint={
                editingId
                  ? "Kosongkan jika tidak ingin mengganti."
                  : "Minimal 4 karakter."
              }
            />
          </div>

          {/* Status aktif */}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isAktif}
              onChange={(e) => setForm({ ...form, isAktif: e.target.checked })}
              disabled={editing?.role === "superadmin"}
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            Akun aktif (dapat login)
          </label>

          {/* Upload foto & TTD */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Foto Profil
              </span>
              <input
                ref={fotoRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setFotoFile(e.target.files?.[0] ?? null)}
                className="text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-surface-subtle file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-200"
              />
              {editing?.fotoProfilUrl && !fotoFile && (
                <span className="text-xs text-gray-500">Foto saat ini tersimpan.</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Tanda Tangan
              </span>
              <input
                ref={ttdRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setTtdFile(e.target.files?.[0] ?? null)}
                className="text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-surface-subtle file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-200"
              />
              {editing?.ttdUrl && !ttdFile && (
                <span className="text-xs text-gray-500">TTD saat ini tersimpan.</span>
              )}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" loading={busy}>
              {editingId ? "Simpan" : "Tambah"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
