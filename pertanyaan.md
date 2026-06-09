a. Notif dipicu kapan? Anda bilang "saat tiket selesai tapi belum approve". Tapi di sistem baru kita pakai approve per laporan shift, bukan per tiket. Jadi maksudnya: notif dikirim saat laporan shift sudah diserahterimakan (pending) tapi belum di-approve, benar?
b. Definisi "supervisi terjadwal hari itu"? Apakah supervisi yang dipilih saat serah terima shift (supervisi_id di shift_reports), atau ada jadwal supervisi terpisah per hari yang perlu dibuat?
c. Notif 1 jam terus menerus — apakah ada batas? Misal berhenti otomatis setelah jam kerja, atau benar-benar tiap jam 24/7 sampai di-approve?
d. Jam berapa scheduler mulai? Langsung saat handover, atau tunggu 1 jam dulu baru notif pertama?

jawab pertanyaa untuk prompt notif tele
a. benar
b. benar supervisi yang terpilih oleh shift approve nya
c. untuk notif muali dari jam 07:00 - 20:00
d. langsung saat handover notif pada supervisi langsung keluar
 ada beberapa tambahan , untuk memasukan id tele supervisi ini saya tidak perlu masukan pada file .env kamu siapkan saja menu pada menu superadmin (manajemen akun) untuk memasukan id tele , untuk input id cukup superadmin saja yang bisa melakukanya

langsung prompt