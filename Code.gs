// ============================================================
//  GOOGLE APPS SCRIPT — RSVP Halal Bihalal SMAN 4 Jember
//  VERSI FINAL — JSONP + doGet
//
//  Cara pasang (WAJIB IKUTI URUTAN):
//  1. Buka Google Sheets Anda
//  2. Extensions → Apps Script
//  3. Hapus semua kode lama, paste kode ini → Save
//  4. Klik Run → pilih fungsi "initSheets" → Run
//     (Izinkan permission yang diminta)
//  5. Deploy → New Deployment
//     - Type       : Web app
//     - Execute as : Me
//     - Who access : Anyone   ← WAJIB ANYONE
//  6. Klik Deploy → SALIN URL deployment
//  7. Buka index.html → tempel URL di bagian GAS_URL
//  8. Upload ulang index.html ke Google Sites
// ============================================================

const SHEET_RESPONSES = "Responses";
const SHEET_DASHBOARD = "Dashboard";
const SHEET_LOG = "Log";
const EMAIL_NOTIF = ""; // isi email panitia jika ingin notifikasi

/* ════════════════════════════════════════════════════════════
   doGet — menerima data via URL query string + JSONP callback
   
   Form HTML memanggil:
   GAS_URL?nama=X&status=Y&...&callback=gasCallback
   
   GAS menyimpan data lalu memanggil:
   gasCallback({"status":"ok"})
   
   Browser menerima respon → fungsi gasCallback() di HTML
   dipanggil → halaman sukses tampil
════════════════════════════════════════════════════════════ */
function doGet(e) {
  // Aktifkan CORS — wajib untuk JSONP
  const output = ContentService.createTextOutput();

  try {
    const p = e ? e.parameter || {} : {};
    const callback = p.callback || ""; // nama fungsi JSONP

    /* ── Ping test (tidak ada nama → hanya cek koneksi) ── */
    if (!p.nama) {
      const msg = JSON.stringify({
        status: "ok",
        message: "Apps Script aktif ✅",
      });
      output.setContent(callback ? callback + "(" + msg + ")" : msg);
      output.setMimeType(ContentService.MimeType.JAVASCRIPT);
      return output;
    }

    /* ── Simpan data ke Sheet ── */
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_RESPONSES);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_RESPONSES);
      buatHeader(sheet);
    } else if (sheet.getLastRow() === 0) {
      buatHeader(sheet);
    }

    const baris = [
      p.timestamp || getWIB(),
      p.nama || "",
      p.status || "",
      Number(p.jumlah_porsi) || 0,
      p.komposisi || "-",
      p.alasan_tidak_hadir || "-",
      "Baru", // G: Status Verifikasi (diisi panitia)
      "", // H: Catatan Panitia  (diisi panitia)
    ];

    sheet.appendRow(baris);

    /* Update dashboard */
    try {
      updateDashboard();
    } catch (de) {
      catatLog("dashboard: " + de);
    }

    /* Email notifikasi (opsional) */
    if (EMAIL_NOTIF) {
      try {
        kirimEmail(p);
      } catch (me) {
        catatLog("email: " + me);
      }
    }

    /* ── Kembalikan JSONP response ── */
    const result = JSON.stringify({ status: "ok", nama: p.nama });
    output.setContent(callback ? callback + "(" + result + ")" : result);
    output.setMimeType(ContentService.MimeType.JAVASCRIPT);
    return output;
  } catch (err) {
    catatLog("doGet ERROR: " + err.toString());
    const errMsg = JSON.stringify({ status: "error", message: err.toString() });
    const cb = e && e.parameter ? e.parameter.callback || "" : "";
    output.setContent(cb ? cb + "(" + errMsg + ")" : errMsg);
    output.setMimeType(ContentService.MimeType.JAVASCRIPT);
    return output;
  }
}

/* ════════════════════════════════════════════════
   BUAT HEADER SHEET RESPONSES
════════════════════════════════════════════════ */
function buatHeader(sheet) {
  const headers = [
    "Timestamp", // A
    "Nama Lengkap", // B
    "Status Kehadiran", // C
    "Jumlah Porsi", // D
    "Komposisi Keluarga", // E
    "Alasan Tidak Hadir", // F
    "Status Verifikasi", // G
    "Catatan Panitia", // H
  ];

  const range = sheet.getRange(1, 1, 1, headers.length);
  range.setValues([headers]);
  range.setBackground("#1A2B5F");
  range.setFontColor("#F0D98A");
  range.setFontWeight("bold");
  range.setFontSize(11);
  range.setHorizontalAlignment("center");
  range.setVerticalAlignment("middle");
  range.setWrap(false);
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 36);

  // Lebar kolom
  const widths = [175, 210, 140, 110, 220, 200, 150, 220];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
}

/* ════════════════════════════════════════════════
   UPDATE DASHBOARD OTOMATIS
════════════════════════════════════════════════ */
function updateDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let dash = ss.getSheetByName(SHEET_DASHBOARD);
  if (!dash) dash = ss.insertSheet(SHEET_DASHBOARD);

  const src = ss.getSheetByName(SHEET_RESPONSES);
  if (!src || src.getLastRow() <= 1) return;

  dash.clearContents();

  // Ambil kolom C (status) dan D (porsi)
  const lastRow = src.getLastRow();
  const dataCols = src.getRange(2, 3, lastRow - 1, 2).getValues();

  let hadir = 0,
    tidak = 0,
    totalPorsi = 0;
  dataCols.forEach(function (row) {
    const status = String(row[0]).trim().toUpperCase();
    const p = Number(row[1]) || 0;
    if (status === "HADIR") {
      hadir++;
      totalPorsi += p;
    } else {
      tidak++;
    }
  });

  const total = hadir + tidak;

  // Tulis ringkasan
  dash
    .getRange("A1")
    .setValue("📊 DASHBOARD RSVP — HALAL BIHALAL SMAN 4 JEMBER 1447 H")
    .setFontSize(12)
    .setFontWeight("bold")
    .setFontColor("#1A2B5F");
  dash
    .getRange("A2")
    .setValue("Diperbarui: " + getWIB())
    .setFontColor("#718096")
    .setFontSize(10);

  dash
    .getRange("A4")
    .setValue("RINGKASAN")
    .setFontWeight("bold")
    .setFontColor("#8B6914");

  const stats = [
    ["Total Responden", total, "#1A2B5F", "#E8EDF8"],
    ["✅  Hadir", hadir, "#0F6E56", "#EAF7F0"],
    ["🙏  Tidak Hadir", tidak, "#C53030", "#FEF0F0"],
    ["🍽️  Total Porsi / Piring", totalPorsi, "#fff", "#1A2B5F"],
  ];

  stats.forEach(function (s, i) {
    const r = 5 + i;
    dash
      .getRange(r, 1)
      .setValue(s[0])
      .setFontSize(11)
      .setBackground(s[3])
      .setFontColor(s[2]);
    dash
      .getRange(r, 2)
      .setValue(s[1])
      .setFontSize(18)
      .setFontWeight("bold")
      .setBackground(s[3])
      .setFontColor(s[2])
      .setHorizontalAlignment("center");
  });

  dash.setColumnWidth(1, 240);
  dash.setColumnWidth(2, 100);

  // Formula SUMIF otomatis di bawah data Responses
  src
    .getRange(lastRow + 2, 3)
    .setValue("TOTAL PORSI →")
    .setFontWeight("bold")
    .setFontColor("#1A2B5F");
  src
    .getRange(lastRow + 2, 4)
    .setFormula("=SUMIF(C2:C" + lastRow + ',"HADIR",D2:D' + lastRow + ")")
    .setFontWeight("bold")
    .setFontSize(14)
    .setFontColor("#1A2B5F");
  src
    .getRange(lastRow + 3, 3)
    .setValue("Jumlah Hadir →")
    .setFontWeight("bold");
  src
    .getRange(lastRow + 3, 4)
    .setFormula("=COUNTIF(C2:C" + lastRow + ',"HADIR")')
    .setFontWeight("bold");
  src
    .getRange(lastRow + 4, 3)
    .setValue("Jumlah Tidak Hadir →")
    .setFontWeight("bold");
  src
    .getRange(lastRow + 4, 4)
    .setFormula("=COUNTIF(C2:C" + lastRow + ',"TIDAK HADIR")')
    .setFontWeight("bold");
}

/* ════════════════════════════════════════════════
   EMAIL NOTIFIKASI (OPSIONAL)
════════════════════════════════════════════════ */
function kirimEmail(p) {
  if (!EMAIL_NOTIF) return;
  GmailApp.sendEmail(
    EMAIL_NOTIF,
    "[RSVP] " + p.nama + " — " + p.status,
    "Konfirmasi baru masuk!\n\n" +
      "Nama     : " +
      p.nama +
      "\n" +
      "Status   : " +
      p.status +
      "\n" +
      "Porsi    : " +
      p.jumlah_porsi +
      " porsi\n" +
      "Komposisi: " +
      p.komposisi +
      "\n" +
      "Waktu    : " +
      p.timestamp +
      "\n\n" +
      "Buka spreadsheet untuk data lengkap.",
  );
}

/* ════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════ */
function getWIB() {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 3600000); // UTC+7
  const z = function (n) {
    return String(n).padStart(2, "0");
  };
  return (
    z(wib.getUTCDate()) +
    "/" +
    z(wib.getUTCMonth() + 1) +
    "/" +
    wib.getUTCFullYear() +
    " " +
    z(wib.getUTCHours()) +
    ":" +
    z(wib.getUTCMinutes()) +
    " WIB"
  );
}

function catatLog(msg) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let log = ss.getSheetByName(SHEET_LOG);
  if (!log) log = ss.insertSheet(SHEET_LOG);
  log.appendRow([getWIB(), msg]);
}

/* ════════════════════════════════════════════════
   INISIALISASI AWAL — Jalankan SATU KALI
   Run → initSheets
════════════════════════════════════════════════ */
function initSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Responses
  let resp = ss.getSheetByName(SHEET_RESPONSES);
  if (!resp) resp = ss.insertSheet(SHEET_RESPONSES);
  if (resp.getLastRow() === 0) buatHeader(resp);

  // Dashboard
  if (!ss.getSheetByName(SHEET_DASHBOARD)) ss.insertSheet(SHEET_DASHBOARD);

  // Log
  let log = ss.getSheetByName(SHEET_LOG);
  if (!log) {
    log = ss.insertSheet(SHEET_LOG);
    log
      .getRange(1, 1, 1, 2)
      .setValues([["Timestamp", "Pesan Error"]])
      .setFontWeight("bold")
      .setBackground("#1A2B5F")
      .setFontColor("#F0D98A");
  }

  SpreadsheetApp.getUi().alert(
    "✅ Inisialisasi berhasil!\n\n" +
      "Sheet Responses, Dashboard, dan Log sudah siap.\n\n" +
      "Langkah berikutnya:\n" +
      "Deploy → New Deployment → Web App\n" +
      "Execute as : Me\n" +
      "Who access : Anyone\n\n" +
      "Salin URL deployment → tempel ke index.html",
  );
}

/* ════════════════════════════════════════════════
   TES KONEKSI — jalankan dari browser:
   buka GAS_URL di browser → harus tampil {"status":"ok"}
════════════════════════════════════════════════ */
function tesKoneksi() {
  const url = ScriptApp.getService().getUrl();
  Logger.log("URL Web App: " + url);
  Logger.log(
    "Tes: " +
      url +
      "?nama=TES&status=HADIR&jumlah_porsi=1&komposisi=-&alasan_tidak_hadir=-&timestamp=tes&callback=cb",
  );
}
