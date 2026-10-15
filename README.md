# ClassQuiz

Sinf uchun Kahoot uslubidagi jonli test. Oʻqituvchi oʻyin ekranini proyektorga
chiqaradi, oʻquvchilar esa telefonlarida QR kodni skanerlab yoki PIN kodni
kiritib qoʻshiladi.

## Ishga tushirish

1. Noutbuk va oʻquvchilarning telefonlari **bir xil Wi-Fi** tarmogʻida boʻlsin.
2. **Start ClassQuiz.command** faylini ikki marta bosing (yoki `npm start`).
   Oʻqituvchi paneli http://localhost:3000 manzilida ochiladi.
3. Dars davomida Terminal oynasini yopmang. Yopsangiz, dastur toʻxtaydi.

Faqat birinchi marta: https://nodejs.org saytidan Node.js oʻrnating. Agar macOS
faylni ochishga ruxsat bermasa, ustiga oʻng tugmani bosing, **Open** ni tanlang
va tasdiqlang.

## Oʻyinni oʻtkazish

1. Panelda test yarating (yoki koʻp savolni birdaniga qoʻshish uchun
   **Savollarni joylash** tugmasidan foydalaning), soʻng **▶ Oʻyinni boshlash** ni bosing.
2. Ekranni proyektorga chiqaring. Oʻquvchilar QR kodni skanerlaydi yoki
   koʻrsatilgan manzilga kirib, 6 xonali PIN kodni kiritadi.
3. **Boshlash** ni bosing. Keyingi bosqichga oʻtish uchun **Probel** tugmasini
   (yoki **Keyingi** ni) bosing: savol → natijalar → reyting.
4. Oxirida ballar jadvalini saqlash uchun **Natijalarni yuklab olish** ni bosing.

Maslahatlar: oʻquvchini oʻyindan chiqarish uchun kutish ekranida uning ismini
bosing. Sahifani yangilagan yoki Wi-Fi uzilgan oʻquvchilar avtomatik qayta
qoʻshiladi. Toʻgʻri javobni tezroq bergan oʻquvchi koʻproq ball oladi (500–1000).

## Savollarni joylash namunasi

```
Fransiyaning poytaxti qaysi?
- London
* Parij
- Rim

Quyosh – yulduz.
* Toʻgʻri
- Notoʻgʻri
```
`*` toʻgʻri javobni, `-` notoʻgʻri javobni bildiradi. Savollar orasida boʻsh qator qoldiring.

Testlar `data/quizzes.json` faylida saqlanadi.

## Internetga joylash (Render)

1. Loyihani GitHub'ga yuklang.
2. https://render.com saytida **New → Blueprint** ni tanlang va shu repozitoriyni ulang.
   Render `render.yaml` faylini oʻzi topadi.
3. Soʻralganda **TEACHER_PASSWORD** uchun oʻqituvchi parolini kiriting.
4. Tayyor boʻlgach, sayt manzili `https://classquiz-xxxx.onrender.com` koʻrinishida boʻladi.
   Oʻqituvchi shu manzilni ochib parol bilan kiradi; oʻquvchilar `/play` sahifasidan qoʻshiladi.

Eslatmalar:
- Bepul rejada sayt 15 daqiqa ishlatilmasa "uxlab qoladi". Darsdan 1–2 daqiqa oldin saytni
  ochib qoʻying — keyin odatdagidek ishlaydi.
- Doimiy savollar `data/quizzes.json` faylida saqlanadi. Ularni oʻzgartirish uchun shu faylni
  GitHub'da tahrirlang — Render saytni avtomatik yangilaydi. Saytning oʻzida qilingan
  oʻzgarishlar server qayta ishga tushganda yoʻqolishi mumkin.
- Oʻz kompyuteringizda ishlatganda parol shart emas (TEACHER_PASSWORD oʻrnatilmasa, panel ochiq).
