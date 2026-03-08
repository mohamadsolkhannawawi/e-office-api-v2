# Template Surat Rekomendasi Beasiswa

## Deskripsi

Template Word (.docx) untuk generate surat rekomendasi beasiswa dengan sistem variable substitution menggunakan docxtemplater.

## Struktur Variabel Template

### Header/Kop Surat

- `{{kop_universitas}}` - Nama universitas (UNIVERSITAS DIPONEGORO)
- `{{kop_fakultas}}` - Nama fakultas (FAKULTAS SAINS DAN MATEMATIKA)
- `{{kop_alamat}}` - Alamat lengkap
- `{{kop_telepon}}` - Nomor telepon
- `{{kop_fax}}` - Nomor fax
- `{{kop_website}}` - Website fakultas
- `{{kop_email}}` - Email fakultas

### Identitas Surat

- `{{judul_surat}}` - Judul surat (SURAT-REKOMENDASI)
- `{{nomor_surat}}` - Nomor surat lengkap (misal: /UN7.F8.1/KM/……/20…)

### Data Mahasiswa

- `{{nama_lengkap}}` - Nama lengkap mahasiswa
- `{{nim}}` - Nomor Induk Mahasiswa
- `{{tempat_lahir}}` - Tempat lahir
- `{{tanggal_lahir}}` - Tanggal lahir (format: DD Month YYYY)
- `{{no_hp}}` - Nomor HP/telepon
- `{{tahun_akademik}}` - Tahun akademik (misal: 2024/2025)
- `{{jurusan}}` - Nama jurusan
- `{{program_studi}}` - Program studi
- `{{semester}}` - Semester saat ini
- `{{ipk}}` - IPK (Indeks Prestasi Kumulatif)
- `{{ips}}` - IPS (Indeks Prestasi Semester)
- `{{keperluan}}` - Keperluan surat (misal: Pengajuan Beasiswa...)

### Penandatangan

- `{{tanggal_terbit}}` - Tanggal penerbitan surat
- `{{jabatan_penandatangan}}` - Jabatan penandatangan
- `{{nama_penandatangan}}` - Nama penandatangan
- `{{nip_penandatangan}}` - NIP penandatangan

### Digital Features (Gambar)

> ⚠️ **PENTING:** Untuk variabel gambar, gunakan format `{%variabel}` (dengan tanda %)
> bukan `{{variabel}}`. Ini adalah syntax khusus untuk docxtemplater-image-module.

- `{%signature_image}` - Tanda tangan digital Wakil Dekan 1 (ditambahkan saat WD1 menyetujui)
- `{%stamp_image}` - Stempel digital (ditambahkan saat UPA memberikan stempel)
- `{%qr_code}` - QR code untuk verifikasi keaslian surat (ditambahkan saat penerbitan)

## Cara Update Template DOCX

Untuk menambahkan variabel gambar ke template Word:

1. Buka file `surat-rekomendasi-beasiswa-template-v1.docx` di Microsoft Word
2. Di bagian tanda tangan (setelah tanggal dan jabatan), tambahkan:
    ```
    {%signature_image}
    ```
3. Di samping tanda tangan (atau overlay), tambahkan:
    ```
    {%stamp_image}
    ```
4. Di pojok kiri bawah surat, tambahkan:
    ```
    {%qr_code}
    ```

### Contoh Struktur Bagian Tanda Tangan:

```
Semarang, {{tanggal_terbit}}
a.n. Dekan
{{jabatan_penandatangan}}

{%signature_image}
{%stamp_image}

{{nama_penandatangan}}
NIP. {{nip_penandatangan}}

{%qr_code}
```

## Workflow Generate Dokumen

1. **Mahasiswa Submit** → DOCX di-generate tanpa tanda tangan, stempel, QR
2. **Supervisor Approve** → DOCX di-generate ulang
3. **Manajer TU Approve** → DOCX di-generate ulang
4. **Wakil Dekan 1 Approve** → DOCX di-generate dengan tanda tangan WD1
5. **UPA Memberi Nomor** → DOCX di-generate dengan nomor surat dan QR code
6. **UPA Memberi Stempel** → DOCX di-generate dengan stempel
7. **Selesai/Terbit** → DOCX final dengan semua elemen

Setiap tahap akan me-regenerate DOCX sehingga preview selalu up-to-date.

## Format Template

Template harus dibuat dalam format Microsoft Word (.docx) dengan:

1. **Kop Surat**: Logo dan informasi universitas/fakultas
2. **Judul**: SURAT-REKOMENDASI dengan nomor surat
3. **Pembuka**: "Dekan Fakultas... dengan ini menerangkan:"
4. **Data Mahasiswa**: Tabel informasi dalam format key-value
5. **Isi Surat**: Paragraf standar tentang status mahasiswa
6. **Poin-poin**: Daftar kondisi mahasiswa (tidak sedang menerima beasiswa, dll)
7. **Penutup**: Kalimat penutup standar
8. **Penandatangan**: Area tanda tangan dengan tempat, tanggal, jabatan, nama, NIP

## Contoh Penggunaan Variabel dalam Word

Dalam dokumen Word, variabel ditulis seperti:

```
Nama: {{nama_lengkap}}
NIM: {{nim}}
Tempat / Tgl Lahir: {{tempat_lahir}}, {{tanggal_lahir}}
```

## File Template

- `surat-rekomendasi-beasiswa-template-v1.docx` - Template versi default (standar)

**Konfigurasi Path Template:**  
Template path dikonfigurasi di `src/config/templates.config.ts`. Untuk mengganti template, update nilai `defaultTemplate` di konfigurasi tersebut.

## Schema Validasi

Semua variabel template harus sesuai dengan schema yang didefinisikan di database `LetterTemplate.schemaDefinition`.
