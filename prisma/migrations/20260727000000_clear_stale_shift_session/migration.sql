-- Sesi shift kini dipulihkan saat login (lihat resumableShiftSession di
-- lib/shift.ts). Sebelum perubahan ini, serah terima / tutup laporan shift
-- hanya mengosongkan cookie sesi dan meninggalkan users.current_shift tetap
-- terisi. Bersihkan sisa data tersebut agar login pertama setelah deploy tidak
-- memulihkan shift yang sebenarnya sudah ditutup.
--
-- Baris dianggap kotor bila petugas punya catatan serah terima / tutup shift
-- (shift_handovers) yang terjadi pada atau sesudah awal sesi shift tersimpan.
UPDATE users u
SET current_shift = NULL,
    shift_started_at = NULL
WHERE u.current_shift IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM shift_handovers h
    WHERE h.from_user = u.id
      AND (u.shift_started_at IS NULL OR h.at >= u.shift_started_at)
  );
