#!/bin/sh
# Bind mount ./public:/app/public dimiliki user host (biasanya root dari git
# clone), sedangkan proses app jalan sebagai user non-root "nextjs". Tanpa ini,
# upload (logo/foto/ttd) gagal dengan EACCES karena "nextjs" tak boleh menulis
# ke folder yang dimiliki host user. Jalan sekali di tiap start container
# (sebagai root) lalu turun hak ke "nextjs" untuk proses aplikasi sebenarnya.
set -e

mkdir -p public/uploads/foto public/uploads/ttd public/uploads/logo
chown -R nextjs:nodejs public/uploads

exec su-exec nextjs:nodejs "$@"
