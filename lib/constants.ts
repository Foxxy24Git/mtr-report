import {
  LayoutDashboard,
  Activity,
  CalendarRange,
  TicketPlus,
  FileBarChart2,
  BarChart3,
  Server,
  Thermometer,
  Settings,
  ShieldCheck,
  Crown,
  Users,
  Database,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/roles";

export type { Role };

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  /** Role yang boleh mengakses menu ini. Kosong = semua role login. */
  roles?: Role[];
  /** True bila href adalah URL eksternal (dibuka di tab baru). */
  external?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "Ringkasan & status open tiket",
  },
  {
    label: "Daily Monitoring",
    href: "/daily-monitoring",
    icon: Activity,
    description: "Semua tiket ATM & jaringan aktif",
    // Super Admin tidak open/track tiket (PRD §2) — hanya petugas.
    roles: ["user"],
  },
  {
    label: "Weekly Monitoring",
    href: "/weekly-monitoring",
    icon: CalendarRange,
    description: "Riwayat tiket 7 hari terakhir (read-only)",
  },
  {
    label: "Supervisi",
    href: "/supervisi",
    icon: ShieldCheck,
    description: "Tinjau & setujui tiket gangguan",
    roles: ["supervisi"],
  },
  {
    label: "Open Tiket",
    href: "/open-tiket",
    icon: TicketPlus,
    description: "Buat tiket gangguan baru",
    roles: ["user"],
  },
  {
    label: "Monitoring SLA",
    href: "/monitoring-sla",
    icon: BarChart3,
    description: "Dashboard agregat SLA, ATM bermasalah & distribusi gangguan",
  },
  {
    label: "Rekap Laporan",
    href: "/rekap-laporan",
    icon: FileBarChart2,
    description: "Download laporan Excel harian",
  },
  {
    label: "Data ATM",
    href: "/data-atm",
    icon: Server,
    description: "Master data ATM & jaringan",
    roles: ["superadmin", "user"],
  },
  {
    label: "Suhu / Server",
    href: "/suhu-server",
    icon: Thermometer,
    description: "Log suhu AC & pemantauan server",
    roles: ["user"],
  },
  {
    label: "Leader",
    href: "/leader",
    icon: Crown,
    description: "Kelola pimpinan Infrastruktur & Divisi (penanda tangan laporan)",
    roles: ["superadmin"],
  },
  {
    label: "Manajemen Akun",
    href: "/manajemen-akun",
    icon: Users,
    description: "Tambah & ubah akun User/Supervisi",
    roles: ["superadmin"],
  },
  {
    label: "Database Studio",
    href: "/database-studio",
    icon: Database,
    description: "Lihat & kelola data tabel langsung (Super Admin)",
    roles: ["superadmin"],
  },
  {
    label: "Setting",
    href: "/setting",
    icon: Settings,
    description: "Profil, password, & kelola user",
  },
];

export const SHIFT_LABELS: Record<string, string> = {
  A: "Shift Pagi (07:00–15:00)",
  B: "Shift Sore (15:00–23:00)",
  C: "Shift Malam (23:00–07:00)",
  D: "Shift Lembur Pagi (07:00–19:00)",
  E: "Shift Lembur Malam (19:00–07:00)",
};

/** Label pendek tanpa jam — untuk badge/tabel ringkas. */
export const SHIFT_NAMES: Record<string, string> = {
  A: "Shift Pagi",
  B: "Shift Sore",
  C: "Shift Malam",
  D: "Shift Lembur Pagi",
  E: "Shift Lembur Malam",
};

export const APP_NAME = "mtr-Report";
export const APP_SUBTITLE = "Monitoring & Tiket Gangguan ATM";
export const BANK_NAME = "Bank Nagari";
