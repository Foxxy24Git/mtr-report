"use client";

import { useState } from "react";
import { UserCircle } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ImageUploader } from "@/components/setting/ImageUploader";
import { fmtDate } from "@/lib/format";
import type { Role } from "@/lib/roles";

const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Super Admin",
  user: "Petugas Monitoring",
  supervisi: "Supervisi",
};

interface Props {
  me: {
    username: string;
    nama: string;
    role: Role;
    fotoProfilUrl: string | null;
    ttdUrl: string | null;
    createdAt: string;
  };
}

export function ProfilSection({ me }: Props) {
  const [fotoUrl, setFotoUrl] = useState(me.fotoProfilUrl);
  const [ttdUrl, setTtdUrl] = useState(me.ttdUrl);

  return (
    <div className="space-y-5">
      <Card>
        <CardTitle className="mb-1 flex items-center gap-2">
          <UserCircle className="w-4 h-4 text-primary" /> Identitas
        </CardTitle>
        <p className="text-xs text-gray-500 mb-4">
          Data akun Anda. Username & peran dikelola oleh Super Admin.
        </p>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Nama</dt>
            <dd className="font-medium text-gray-800">{me.nama}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Username</dt>
            <dd className="font-medium text-gray-800">@{me.username}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Peran</dt>
            <dd>
              <Badge variant="primary">{ROLE_LABELS[me.role]}</Badge>
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Terdaftar</dt>
            <dd className="text-gray-800">{fmtDate(me.createdAt)}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardTitle className="mb-4">Foto Profil & Tanda Tangan</CardTitle>
        <div className="space-y-6">
          <ImageUploader
            title="Foto Profil"
            hint="Tampil di bilah atas. PNG/JPG/WEBP, maks 2 MB."
            currentUrl={fotoUrl}
            endpoint="/api/me/foto"
            variant="avatar"
            onUploaded={setFotoUrl}
          />
          <div className="border-t border-gray-100" />
          <ImageUploader
            title="Tanda Tangan Digital"
            hint="Dipakai pada blok tanda tangan di laporan Excel. Disarankan latar transparan/putih. Maks 2 MB."
            currentUrl={ttdUrl}
            endpoint="/api/me/ttd"
            variant="signature"
            onUploaded={setTtdUrl}
          />
        </div>
      </Card>
    </div>
  );
}
