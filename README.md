# Comifuro 23 Interactive Floormap & Navigator 🗺️✨

Aplikasi peta interaktif berbasis web untuk **Comic Frontier 23 (CF23) di ICE BSD (Hall 5, 6, 7, 8, 9, 10)**. Membantu pengunjung mencari lokasi booth, melihat katalog barang yang dijual oleh tiap circle (komik, artbook, merchandise/goods, craft, cosplay, dll.), serta menghitung rute navigasi jalan kaki tercepat dari posisi awal ke booth tujuan.

---

## 🌟 Fitur Utama

1. **Peta Interaktif Responif (ICE BSD Hall 5 - 10)**:
   - Pan & zoom fleksibel (mouse drag/wheel di desktop, pinch-to-zoom & drag di HP).
   - High-contrast visual floormap architectural layout.
2. **Navigasi Jalan Kaki & Petunjuk Langkah (Turn-by-Turn)**:
   - **Default Posisi Awal**: Pintu Depan Lobi / Information Desk & Lost and Found (Hall 8/9).
   - Mendukung pemilihan manual posisi kamu saat ini (bisa pilih booth terdekat atau klik titik di peta).
   - Rute visual garis animasi neon (*glowing ant-path*) yang melewati lorong utama (*cross-aisle*) dan lorong booth secara realistis.
   - Estimasi jarak (meter) dan estimasi waktu tempuh (menit).
3. **Database Lengkap 1.957 Circle dari Web Catalog Comifuro**:
   - Terintegrasi dengan katalog online `https://catalog.comifuro.net/catalog`.
   - Menampilkan: Nama Circle, Kode Booth (misal `C-24a`, `AA-01/AA-02`), Gambar Circle Cut (banner), Fandom, Hari Tampil (Day 1 / Day 2 / Both Days), dan Tipe Produk (Artbook, Komik, Goods/Merch, Novel, Music, Crafts, Cosplay).
   - Tautan langsung ke media sosial kreator (Twitter/X, Instagram, Web Marketplace).
4. **Pencarian Cepat & Filter Kategori**:
   - Instant search autocomplete: ketik nama circle, nomor booth, atau fandom (misal *Genshin*, *Blue Archive*, *Hololive*, *Honkai*).
   - Filter pills cepat untuk melihat kategori barang tertentu.
5. **Wishlist & Rencana Belanja**:
   - Tandai booth favorit dengan bintang ⭐ (tersimpan aman di local storage browser).
   - Satu klik untuk langsung membuat rute navigasi ke booth yang ada di wishlist.

---

## 🚀 Cara Menjalankan Secara Lokal

Buka terminal di folder project (`C:\Users\reage\Documents\CF26`) dan jalankan:

```bash
# Menggunakan Python
python -m http.server 8089
```

Buka browser dan akses:
👉 `http://localhost:8089`

---

## 🌐 Cara Deploy ke GitHub Pages (Online)

Aplikasi ini dibuat murni menggunakan teknologi web modern (HTML5, CSS3, ES6 JavaScript) tanpa backend server khusus (*static web app*), sehingga dapat di-host secara gratis di **GitHub Pages** atau **Vercel**:

1. Inisialisasi Git di folder ini:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: CF23 Interactive Map & Navigation"
   ```
2. Buat repository baru di GitHub (misal: `cf23-interactive-map`).
3. Hubungkan remote repository dan push:
   ```bash
   git remote add origin https://github.com/<username-kamu>/<nama-repo>.git
   git branch -M main
   git push -u origin main
   ```
4. Di GitHub, buka menu **Settings** > **Pages** > Pada bagian **Build and deployment**, pilih branch `main` dan folder `/ (root)`, lalu klik **Save**.
5. Link webview online kamu akan langsung aktif! (Contoh: `https://<username>.github.io/<nama-repo>/`).

---

## 📁 Struktur File

- `index.html`: Struktur antarmuka pengguna & layout peta interaktif.
- `styles.css`: Styling visual dark-mode glassmorphism & kontrol responsif.
- `app.js`: Engine logika interaksi, pan-zoom, routing A* heuristic, dan modal pencarian.
- `floormap_web.png`: Peta lantai beresolusi tinggi hasil ekstraksi dari dokumen resmi floormap.
- `circles_optimized.json`: Database 1.957 circle beserta katalog barang dan media sosial.
- `booth_coordinates.json`: Pemetaan koordinat matematis seluruh booth dan titik fasilitas di ICE BSD.
