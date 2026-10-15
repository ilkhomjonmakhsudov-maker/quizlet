#!/bin/bash
# ClassQuizni ishga tushirish uchun shu faylni ikki marta bosing
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
(sleep 2 && open "http://localhost:3000") &
node server.js
