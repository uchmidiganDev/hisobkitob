# Hisob-kitob — Vercel uchun to‘liq loyiha (v2)

Telegram Mini App: qarzlar, xarajatlar, eslatmalar va kun/oy/yil hisobotlari. Mobil qora-yashil interfeys saqlangan. Railway va doimiy ishlaydigan bot jarayoni kerak emas.

## Nima kerak?
1. Vercel akkaunti.
2. PostgreSQL baza (masalan, Neon). Pooled connection string oling: `postgresql://...?...sslmode=require`.
3. BotFather bot tokeni.
4. Lokal sozlash uchun Node.js 24 va npm.

**Bu ZIP tayyor kod, hali sizning Vercel akkauntingizga deploy qilinmagan.** Haqiqiy PostgreSQL ulanishi va Telegram webhook deploydan keyin tekshiriladi. SQLite’dagi eski ma’lumotlar avtomatik ko‘chirilmaydi; bu yangi baza bilan boshlanadi.

## 1. Papkani ochish
`package.json` turgan papkada PowerShell oching:

```powershell
npm install
Copy-Item .env.example .env
npm run secrets
notepad .env
```
`npm run secrets` ikkita tasodifiy kalit chiqaradi. Ularni `.env`ga yozing:

```env
BOT_TOKEN=BotFather_tokeni
APP_URL=https://loyiha-nomingiz.vercel.app
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
WEBHOOK_SECRET=birinchi_yaratilgan_kalit
CRON_SECRET=ikkinchi_yaratilgan_kalit
ALLOWED_USER_IDS=
PORT=3000
```
Haqiqiy token va baza parolini GitHub’ga yuklamang. ZIPda token mavjud emas. `ALLOWED_USER_IDS` bo‘sh bo‘lsa, hamma o‘z shaxsiy yozuvlarini yurita oladi; faqat o‘zingiz uchun Telegram raqamli ID’ingizni yozing.

## 2. Bazani yaratish
Neon loyihasini ochib, pooled PostgreSQL URLni `DATABASE_URL`ga kiriting. So‘ng:

```powershell
npm run db:migrate
```
`Baza tayyor.` chiqishi kerak. Muqobil: bazaning SQL editorida `lib/schema.sql` ichidagi SQLni ishga tushiring. Migratsiya qayta bajarilishi mumkin, mavjud yozuvlarni o‘chirmaydi.

## 3. Vercel’ga joylash (GitHub bilan)
1. Fayllarni repoga yuklang. `.env` va `node_modules`ni yuklamang.
2. Vercel → Add New Project → reponi tanlang.
3. Framework Preset: **Other**. Root Directory: `package.json` turgan papka.
4. Build Command: bo‘sh. Output Directory: `public`. Install Command: `npm ci`.
5. Node.js Version: **24.x**.
6. Environment Variables → Production’da `BOT_TOKEN`, `DATABASE_URL`, `APP_URL`, `WEBHOOK_SECRET`, `CRON_SECRET`, kerak bo‘lsa `ALLOWED_USER_IDS`ni qo‘shing.
7. Deploy qiling. Domen ma’lum bo‘lgach `APP_URL`ni shu HTTPS domenga almashtiring va **Redeploy** qiling. Lokal `.env`dagi APP_URLni ham moslang.
8. Production domeniga Telegram kirishi uchun u Vercel login/dev protection bilan yopiq bo‘lmasin. Preview deploy uchun haqiqiy bot webhookini sozlamang.

## GitHub’siz Vercel’ga joylash
```powershell
npm install -g vercel
vercel login
vercel
```
Loyihani ulab, Vercel dashboard’da yuqoridagi environment variables’ni kiriting. Keyin:
```powershell
vercel --prod
```
Deploy sozlamalarida Other / public / Node 24 ni tanlang. `.env` fayli Vercel’da avtomatik production variables bo‘lib qolmaydi: qiymatlarni dashboard’da alohida kiriting.

## 4. Telegram’ni ulash
Brauzerda `https://SIZNING-DOMEN.vercel.app/api/health` ni oching: `{"ok":true}` chiqishi kerak. Keyin lokal `.env` barcha production qiymatlari bilan mos ekanini tekshirib:

```powershell
npm run bot:setup
```
Bu buyruq webhook, menu va bot komandalarini sozlaydi. Telegram’da botga `/start` yuboring va **Hisob-kitobni ochish**ni bosing.
**Eski Railway/local polling jarayonini to‘xtating**: bitta tokenni bir vaqtning o‘zida polling va webhook bilan ishlatmang. Bu loyiha `getUpdates` ishlatmaydi.

## 5. Hisobot va eslatma jadvali
`vercel.json` ichida Vercel Hobby uchun kuniga bir martadan ishlaydigan ikkita cron bor:
- `0 19 * * *` UTC → Toshkent 00:00: kechagi kun hisoboti. Oy/yil yakunida qo‘shimcha hisobot.
- `0 4 * * *` UTC → Toshkent 09:00: qarz muddati kelganda eslatma, yopilguncha har kuni.

**Vercel Hobby bu ishlarni belgilangan soat ichida kechiktirib ishga tushirishi mumkin. Aynan 00:00 kafolatlanmaydi.** Vercel cron production deployment’da ishlaydi va `CRON_SECRET`ni avtomatik `Authorization: Bearer ...` sarlavhasida yuboradi.

### Tez-tez tekshirish va xatodan keyin tez qayta urinish
Tashqi HTTPS scheduler xizmatida quyidagini sozlang:
- URL: `https://SIZNING-DOMEN.vercel.app/api/cron`
- Method: GET
- Har 1 yoki 5 daqiqada
- Header nomi: `Authorization`
- Header qiymati: `Bearer CRON_SECRET_QIYMATI`

Maxfiy kalitni URLga qo‘ymang. Dublikat chaqiruvlar bir xil hisobotni takroran navbatga qo‘shmaydi. Har daqiqada tekshirilsa, 00:00/09:00 dan keyingi chaqiruvda yuborish boshlanadi; hosting, Telegram va tarmoq tufayli mutlaq soniya aniqligi kafolatlanmaydi. Tashqi scheduler bo‘lmasa, muvaffaqiyatsiz yetkazish keyingi kunlik cron chaqiruvlarida qayta uriniladi. Xabar ko‘p bo‘lsa tez-tez scheduler zarur.

## Funksiyalar
- Men olgan / men bergan qarz: sabab, ism, summa, olingan va qaytarish sanasi.
- Qarzlarni tahrirlash/o‘chirish/qaytarildi deb belgilash/qayta ochish.
- Xarajatlar: nom, summa, sana, kategoriya, tahrirlash va o‘chirish.
- Qidirish, davr/holat filtrlari, kun/oy/yil jami va 7 kunlik diagramma.
- Har bir Telegram foydalanuvchisi faqat o‘z yozuvlarini ko‘radi.
- Telegram initData HMAC tekshiruvi va bir soatlik sessiya.
- `/stop`, sozlamalarda eslatma va hisobotni o‘chirish.
- PostgreSQL’da persistent outbox, webhook update deduplication, parallel yuborishda row lock.
- Pul UZS, bazada butun tiyin. Qarzlar xarajatlardan alohida; qarzni yopish xarajat qo‘shmaydi.

## Cheklov va xulq
- Hisobot yuborilgandan keyin eski xarajatni tahrirlash Mini App jamini o‘zgartiradi, eski Telegram xabarini qayta yozmaydi.
- Downtime bo‘lsa, yetishmagan hisobotlar 31 kundan paketlarda tiklanadi. Qarz uchun joriy kun eslatmasi yuboriladi.
- Telegram xabarni qabul qilgandan keyin funksiya keskin uzilsa, transaction commit bo‘lmasligi va qayta yuborish ehtimoli bor (at-least-once delivery).
- Shaxsiy/kichik foydalanuvchi guruhi uchun mo‘ljallangan. Juda katta tarix va foydalanuvchilar uchun pagination va alohida queue worker kerak bo‘ladi.
- Baza provayderida backup sozlang. Vercel fayl tizimi bazani saqlash uchun ishlatilmaydi.

## Lokal ishlatish va test
```powershell
npm start
npm test
```
`npm start` localhost:3000 ochadi. Lokal autentifikatsiya uchun Telegram’dan ochiladigan HTTPS tunnel kerak. Oddiy brauzerda login bypass yo‘q.
Testlar haqiqiy PostgreSQL dvigatelining WASM varianti PGlite orqali schema, SQL, deduplication, hisobot sanalari va foydalanuvchilar ajratilishini tekshiradi; bu cloud baza yoki haqiqiy Telegram yetkazish testi emas.

## Xatolar
- `/api/health` 500: DATABASE_URL, SSL va `db:migrate`ni tekshiring.
- `Unauthorized`: WEBHOOK_SECRET/CRON_SECRET lokal va Vercel’da bir xil bo‘lsin; o‘zgarishdan keyin redeploy va bot:setup.
- Mini App login xatosi: bot ichidan qayta oching, token aynan shu botniki bo‘lsin.
- `/start` javobsiz: webhook setup, production URL va Vercel protection’ni tekshiring.
- Vercel 404: Root Directory va `vercel.json` loyiha ildizida ekanini tekshiring.

Rasmiy manbalar:
- https://vercel.com/docs/functions/runtimes/node-js
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://core.telegram.org/bots/api#setwebhook
