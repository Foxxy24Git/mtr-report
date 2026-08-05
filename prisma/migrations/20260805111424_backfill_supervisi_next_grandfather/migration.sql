UPDATE shift_reports
SET supervisi_next_approved_at = approved_at,
    supervisi_next_approved_by = approved_by,
    catatan_supervisi_next = 'Auto-grandfathered: laporan disetujui sebelum fitur approval supervisi selanjutnya aktif (migrasi 2026-08-05)'
WHERE shift_kode IN ('C', 'E')
  AND status = 'approved'
  AND supervisi_next_id IS NOT NULL
  AND supervisi_next_approved_at IS NULL;