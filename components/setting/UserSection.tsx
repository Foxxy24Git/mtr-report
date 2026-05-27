"use client";

import { useState } from "react";
import { UserPlus, CheckCircle2, PenLine } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import type { Role } from "@/lib/roles";

export interface UserRow {
  id: string;
  username: string;
  nama: string;
  role: Role;
  fotoProfilUrl: string | null;
  ttdUrl: string | null;
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

export function UserSection({ initialUsers }: { initialUsers: UserRow[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    username: "",
    nama: "",
    role: "user",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setForm({ username: "", nama: "", role: "user", password: "" });
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Gagal menambah pengguna.");
        return;
      }
      setUsers((prev) =>
        [...prev, { ...data.user, fotoProfilUrl: null, ttdUrl: null }].sort(
          (a, b) => a.username.localeCompare(b.username)
        )
      );
      setOpen(false);
      reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="none">
      <div className="flex items-center justify-between p-5 border-b border-gray-100">
        <div>
          <CardTitle>Manajemen Pengguna</CardTitle>
          <p className="text-xs text-gray-500 mt-0.5">
            {users.length} akun. Tambah petugas atau supervisi baru.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          <UserPlus className="w-4 h-4" /> Tambah Pengguna
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="px-5 py-2.5 font-medium">Nama</th>
              <th className="px-5 py-2.5 font-medium">Username</th>
              <th className="px-5 py-2.5 font-medium">Peran</th>
              <th className="px-5 py-2.5 font-medium">TTD</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="border-b border-gray-50 last:border-0 hover:bg-surface-muted/50 transition-colors"
              >
                <td className="px-5 py-3 font-medium text-gray-800">{u.nama}</td>
                <td className="px-5 py-3 text-gray-600">@{u.username}</td>
                <td className="px-5 py-3">
                  <Badge variant={ROLE_VARIANT[u.role]}>
                    {ROLE_LABELS[u.role]}
                  </Badge>
                </td>
                <td className="px-5 py-3">
                  {u.ttdUrl ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Ada
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                      <PenLine className="w-3.5 h-3.5" /> Belum
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Tambah Pengguna"
        description="Buat akun Petugas Monitoring atau Supervisi baru."
      >
        <form onSubmit={submit} className="space-y-4">
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
          />
          <Select
            label="Peran"
            required
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="user">Petugas Monitoring</option>
            <option value="supervisi">Supervisi</option>
          </Select>
          <Input
            label="Password Awal"
            type="text"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            hint="Minimal 4 karakter. Pengguna dapat menggantinya nanti."
          />

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
              <UserPlus className="w-4 h-4" /> Tambah
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
