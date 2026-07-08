import { PrismaClient, Role, LeaderKategori, LeaderTipe, LookupTipe } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();
const ROOT = process.cwd();

// --- Parse 1 baris master ATM: "<kode> – <nama>" (separator – atau -) ---
function parseAtmLine(line: string): { kode: string; nama: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Pisahkan pada dash PERTAMA (en-dash atau hyphen). Kode = token awal.
  const m = trimmed.match(/^([0-9A-Za-z]+)\s*[–—-]\s*(.+)$/);
  if (!m) return null;
  const kode = m[1].trim();
  const nama = m[2].replace(/\s+/g, " ").trim();
  if (!kode || !nama) return null;
  return { kode, nama };
}

async function seedMasterLookup() {
  const raw = JSON.parse(
    readFileSync(join(ROOT, "master_seed.json"), "utf-8")
  ) as {
    jenis_penanganan: string[];
    jenis_gangguan: string[];
    sumber_penyebab: string[];
  };

  const rows: { tipe: LookupTipe; nilai: string }[] = [];
  const pushDedup = (tipe: LookupTipe, items: string[]) => {
    const seen = new Set<string>();
    for (const it of items) {
      const nilai = it.trim();
      if (!nilai || seen.has(nilai)) continue;
      seen.add(nilai);
      rows.push({ tipe, nilai });
    }
  };

  pushDedup(LookupTipe.jenis_penanganan, raw.jenis_penanganan);
  pushDedup(LookupTipe.jenis_gangguan, raw.jenis_gangguan);
  pushDedup(LookupTipe.sumber_penyebab, raw.sumber_penyebab);

  const res = await prisma.masterLookup.createMany({
    data: rows,
    skipDuplicates: true,
  });
  console.log(`  master_lookup: ${res.count} baris baru (dari ${rows.length} unik)`);
}

async function seedAtmMaster() {
  const text = readFileSync(join(ROOT, "master_atm_full.txt"), "utf-8");
  const lines = text.split(/\r?\n/);

  const seen = new Set<string>();
  const data: { kodeAtm: string; namaAtm: string }[] = [];
  for (const line of lines) {
    const parsed = parseAtmLine(line);
    if (!parsed) continue;
    if (seen.has(parsed.kode)) continue;
    seen.add(parsed.kode);
    data.push({ kodeAtm: parsed.kode, namaAtm: parsed.nama });
  }

  const res = await prisma.atmMaster.createMany({
    data,
    skipDuplicates: true,
  });
  console.log(`  atm_master: ${res.count} ATM baru (dari ${data.length} baris valid)`);
}

async function seedUsers() {
  const users: { username: string; nama: string; role: Role }[] = [
    { username: "mtr1", nama: "Afrinaldi", role: Role.user },
    { username: "mtr2", nama: "Rian Islami Putra", role: Role.user },
    { username: "mtr3", nama: "Kurnia Fajri", role: Role.user },
    { username: "mtr4", nama: "Ibnu Sauki", role: Role.user },
    { username: "mtr5", nama: "Ridho M R", role: Role.user },
    { username: "superadmin", nama: "Super Admin", role: Role.superadmin },
    { username: "tio", nama: "Tio Rahmayunda", role: Role.supervisi },
    { username: "berto", nama: "Berto L", role: Role.supervisi },
  ];

  for (const u of users) {
    // Password default = username (di-hash bcrypt).
    const passwordHash = await bcrypt.hash(u.username, 10);
    await prisma.user.upsert({
      where: { username: u.username },
      update: { nama: u.nama, role: u.role },
      create: { ...u, passwordHash },
    });
  }
  console.log(`  users: ${users.length} akun (password = username)`);
}

async function seedLeaders() {
  if ((await prisma.leader.count()) > 0) {
    console.log("  leaders: sudah ada, dilewati");
    return;
  }
  await prisma.leader.createMany({
    data: [
      {
        nama: "Pimpinan Bag. Infrastruktur TI",
        jabatan: "Pemimpin Bagian Infrastruktur TI",
        kategori: LeaderKategori.infrastruktur,
        tipe: LeaderTipe.tetap,
      },
      {
        nama: "Pemimpin Divisi TI",
        jabatan: "Pemimpin Divisi TI",
        kategori: LeaderKategori.divisi,
        tipe: LeaderTipe.tetap,
      },
    ],
  });
  console.log("  leaders: 2 entri pimpinan tetap");
}

async function seedAppSettings() {
  // logo_url default kosong → aplikasi & laporan pakai logo default Bank Nagari.
  await prisma.appSetting.upsert({
    where: { key: "logo_url" },
    update: {},
    create: { key: "logo_url", value: null },
  });
  console.log("  app_settings: logo_url siap");
}

async function main() {
  console.log("Seeding mtr-Report…");
  await seedMasterLookup();
  await seedAtmMaster();
  await seedUsers();
  await seedLeaders();
  await seedAppSettings();
  console.log("Selesai.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
