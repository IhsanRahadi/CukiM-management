// routes/api.js
const express = require('express');
const router = express.Router();
const CryptoJS = require('crypto-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const SECRET_KEY = process.env.AES_SECRET_KEY || 'KunciAESEnkripsiRahasiaSuperAman99!';
const JWT_SECRET = process.env.JWT_SECRET || 'KunciRahasiaJWTSuperAman2026!';

// ==========================================
// MIDDLEWARE PROTEKSI JWT
// ==========================================
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <TOKEN>"

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Akses ditolak! Token tidak ditemukan.' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.admin = verified; // Simpan data admin ke request
    next();
  } catch (err) {
    res.status(403).json({ status: 'error', message: 'Token tidak valid atau sudah kedaluwarsa!' });
  }
};

// Middleware untuk memastikan hanya Superadmin yang bisa mengakses
const checkSuperAdmin = (req, res, next) => {
  if (req.admin && req.admin.role === 'superadmin') {
    next();
  } else {
    res.status(403).json({ status: 'error', message: 'Akses ditolak! Hanya Superadmin yang diizinkan.' });
  }
};


// ==========================================
// 1. ENDPOINT AUTHENTICATION (LOGIN)
// ==========================================
router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await db.query('SELECT * FROM admins WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Username atau Password salah!' });
    }

    const admin = result.rows[0];

    // Cek Password menggunakan Bcrypt
    const validPassword = await bcrypt.compare(password, admin.password_hash);
    if (!validPassword) {
      return res.status(400).json({ status: 'error', message: 'Username atau Password salah!' });
    }

    // Buat JWT Token (Berlaku 8 jam)
    const token = jwt.sign(
      { id: admin.id, username: admin.username, nama_admin: admin.nama_admin, role: admin.role }, // Sertakan role admin
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      status: 'success',
      message: 'Login berhasil!',
      token: token,
      admin: { username: admin.username, nama_admin: admin.nama_admin, role: admin.role } // Sertakan role admin
    });

  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================
// 2. USER ROUTES
// ==========================================
router.get('/users', verifyToken, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM users ORDER BY id DESC');
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/users', verifyToken, async (req, res) => {
  const { nik, nama, divisi, status } = req.body;
  try {
    const userStatus = status || 'Aktif';
    const query = 'INSERT INTO users (nik, nama, divisi, status) VALUES ($1, $2, $3, $4) RETURNING *';
    const result = await db.query(query, [nik, nama, divisi, userStatus]);
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Update Status Pegawai (Aktif / Non-Aktif)
router.patch('/users/:id/status', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const result = await db.query(`UPDATE users SET status = $1 WHERE id = $2 RETURNING *`, [status, id]);
    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'User tidak ditemukan' });

    const adminName = req.admin.nama_admin || 'Admin';
    await db.query(
      `INSERT INTO audit_logs (admin_name, action_type, details) VALUES ($1, $2, $3)`,
      [adminName, 'UPDATE_STATUS', `Mengubah status user '${result.rows[0].nama}' (${result.rows[0].nik}) menjadi ${status}`]
    );

    res.json({ status: 'success', message: 'Status pegawai berhasil diperbarui', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Bulk Import Data Excel (>1.000 User)
router.post('/users/bulk-import', verifyToken, async (req, res) => {
  const { rows } = req.body;

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ status: 'error', message: 'Data Excel kosong atau format salah!' });
  }

  try {
    let insertedUsers = 0;
    let insertedAccess = 0;

    for (const row of rows) {
      const nik = String(row.NIK || row.nik || '').trim();
      const nama = String(row.Nama || row.nama || '').trim();
      const divisi = String(row.Divisi || row.divisi || '-').trim();
      const status = String(row.Status || row.status || 'Aktif').trim();

      const namaSistem = String(row.Sistem || row.sistem || '').trim();
      const usernameSistem = String(row.Username || row.username || '').trim();
      const rawPassword = String(row.Password || row.password || '').trim();
      const roleAkses = String(row.Role || row.role || 'User').trim();

      if (!nik || !nama) continue;

      // Upsert User
      const userRes = await db.query(
        `INSERT INTO users (nik, nama, divisi, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (nik) DO UPDATE SET nama = EXCLUDED.nama, divisi = EXCLUDED.divisi, status = EXCLUDED.status
         RETURNING id`,
        [nik, nama, divisi, status]
      );
      const userId = userRes.rows[0].id;
      insertedUsers++;

      // Jika ada data sistem di baris Excel
      if (namaSistem && usernameSistem && rawPassword) {
        let sysRes = await db.query(`SELECT id FROM systems WHERE LOWER(nama_sistem) = LOWER($1)`, [namaSistem]);
        let systemId;

        if (sysRes.rows.length === 0) {
          const newSys = await db.query(`INSERT INTO systems (nama_sistem) VALUES ($1) RETURNING id`, [namaSistem]);
          systemId = newSys.rows[0].id;
        } else {
          systemId = sysRes.rows[0].id;
        }

        // Enkripsi Password AES-256
        const encryptedPassword = CryptoJS.AES.encrypt(rawPassword, SECRET_KEY).toString();

        await db.query(
          `INSERT INTO user_system_accounts (user_id, system_id, username_sistem, encrypted_password, role_akses)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, systemId, usernameSistem, encryptedPassword, roleAkses]
        );
        insertedAccess++;
      }
    }

    // Catat Audit Log
    const adminName = req.admin.nama_admin || 'Admin';
    await db.query(
      `INSERT INTO audit_logs (admin_name, action_type, details) VALUES ($1, $2, $3)`,
      [adminName, 'BULK_IMPORT', `Berhasil import Excel: ${insertedUsers} user & ${insertedAccess} akun sistem`]
    );

    res.json({ status: 'success', message: `Berhasil mengimpor data! (${insertedUsers} User, ${insertedAccess} Akses Sistem)` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Gagal mengimpor data Excel: ' + err.message });
  }
});

// ==========================================
// 3. SYSTEMS ROUTES
// ==========================================
router.get('/systems', verifyToken, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM systems ORDER BY id DESC');
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/systems', verifyToken, async (req, res) => {
  const { nama_sistem, deskripsi, url_sistem } = req.body;
  try {
    const query = 'INSERT INTO systems (nama_sistem, deskripsi, url_sistem) VALUES ($1, $2, $3) RETURNING *';
    const result = await db.query(query, [nama_sistem, deskripsi, url_sistem]);
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================
// 4. ACCESS & VAULT ROUTES
// ==========================================
router.get('/access', verifyToken, async (req, res) => {
  try {
    const query = `
      SELECT usa.id, u.nik, u.nama, u.divisi, s.nama_sistem, usa.username_sistem, usa.role_akses
      FROM user_system_accounts usa
      JOIN users u ON usa.user_id = u.id
      JOIN systems s ON usa.system_id = s.id
      ORDER BY usa.id DESC
    `;
    const result = await db.query(query);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/access', verifyToken, async (req, res) => {
  const { user_id, system_id, username_sistem, raw_password, role_akses } = req.body;
  try {
    const encryptedPassword = CryptoJS.AES.encrypt(raw_password, SECRET_KEY).toString();
    const query = `
      INSERT INTO user_system_accounts (user_id, system_id, username_sistem, encrypted_password, role_akses)
      VALUES ($1, $2, $3, $4, $5) RETURNING id, user_id, system_id, username_sistem, role_akses
    `;
    const result = await db.query(query, [user_id, system_id, username_sistem, encryptedPassword, role_akses]);
    res.json({ status: 'success', message: 'Akses berhasil ditambahkan', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Decrypt Route
router.post('/access/decrypt', verifyToken, async (req, res) => {
  const { account_id } = req.body;
  const adminName = req.admin.nama_admin;

  try {
    const accountQuery = 'SELECT * FROM user_system_accounts WHERE id = $1';
    const accountResult = await db.query(accountQuery, [account_id]);

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Data akses tidak ditemukan' });
    }

    const account = accountResult.rows[0];
    const bytes = CryptoJS.AES.decrypt(account.encrypted_password, SECRET_KEY);
    const decryptedPassword = bytes.toString(CryptoJS.enc.Utf8);

    const auditQuery = `
      INSERT INTO audit_logs (admin_name, action_type, target_user_id, details)
      VALUES ($1, $2, $3, $4)
    `;
    const detailsInfo = `Admin '${adminName}' mengintip password akun '${account.username_sistem}' pada sistem ID: ${account.system_id}`;
    await db.query(auditQuery, [adminName, 'VIEW_PASSWORD', account.user_id, detailsInfo]);

    res.json({
      status: 'success',
      decrypted_password: decryptedPassword,
      message: 'Password berhasil di-dekripsi'
    });

  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================
// 5. AUDIT LOGS ROUTES
// ==========================================
router.get('/audit-logs', verifyToken, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM audit_logs ORDER BY id DESC');
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================
// FITUR EDIT & HAPUS (CRUD COMPLETION)
// ==========================================

// 1. EDIT USER
router.put('/users/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { nik, nama, divisi, status } = req.body;
  try {
    const result = await db.query(
      'UPDATE users SET nik = $1, nama = $2, divisi = $3, status = $4 WHERE id = $5 RETURNING *',
      [nik, nama, divisi, status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'User tidak ditemukan' });

    const adminName = req.admin.nama_admin || 'Admin';
    await db.query(
      'INSERT INTO audit_logs (admin_name, action_type, details) VALUES ($1, $2, $3)',
      [adminName, 'EDIT_USER', `Memperbarui data pegawai '${nama}' (NIK: ${nik})`]
    );

    res.json({ status: 'success', message: 'Data pegawai berhasil diperbarui', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 2. HAPUS USER (Sertakan pencabutan akses)
router.delete('/users/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    // Ambil data user untuk log
    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    if (userRes.rows.length === 0) return res.status(404).json({ status: 'error', message: 'User tidak ditemukan' });
    const user = userRes.rows[0];

    // Hapus akses terkait terlebih dahulu
    await db.query('DELETE FROM user_system_accounts WHERE user_id = $1', [id]);
    // Hapus user
    await db.query('DELETE FROM users WHERE id = $1', [id]);

    const adminName = req.admin.nama_admin || 'Admin';
    await db.query(
      'INSERT INTO audit_logs (admin_name, action_type, details) VALUES ($1, $2, $3)',
      [adminName, 'DELETE_USER', `Menghapus pegawai '${user.nama}' (NIK: ${user.nik}) dan seluruh aksesnya`]
    );

    res.json({ status: 'success', message: 'Pegawai dan seluruh aksesnya berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 3. EDIT AKSES SISTEM (VAULT ITEM)
router.put('/access/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { username_sistem, raw_password, role_akses } = req.body;
  try {
    let query, params;
    if (raw_password) {
      const encryptedPassword = CryptoJS.AES.encrypt(raw_password, SECRET_KEY).toString();
      query = 'UPDATE user_system_accounts SET username_sistem = $1, encrypted_password = $2, role_akses = $3 WHERE id = $4 RETURNING *';
      params = [username_sistem, encryptedPassword, role_akses, id];
    } else {
      query = 'UPDATE user_system_accounts SET username_sistem = $1, role_akses = $2 WHERE id = $3 RETURNING *';
      params = [username_sistem, role_akses, id];
    }

    const result = await db.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Akses tidak ditemukan' });

    const adminName = req.admin.nama_admin || 'Admin';
    await db.query(
      'INSERT INTO audit_logs (admin_name, action_type, details) VALUES ($1, $2, $3)',
      [adminName, 'EDIT_ACCESS', `Memperbarui akun '${username_sistem}' pada Vault`]
    );

    res.json({ status: 'success', message: 'Hak akses berhasil diperbarui', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 4. HAPUS AKSES SISTEM (Mencabut 1 akses)
router.delete('/access/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const accRes = await db.query('SELECT * FROM user_system_accounts WHERE id = $1', [id]);
    if (accRes.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Akses tidak ditemukan' });
    const acc = accRes.rows[0];

    await db.query('DELETE FROM user_system_accounts WHERE id = $1', [id]);

    const adminName = req.admin.nama_admin || 'Admin';
    await db.query(
      'INSERT INTO audit_logs (admin_name, action_type, details) VALUES ($1, $2, $3)',
      [adminName, 'DELETE_ACCESS', `Mencabut akses '${acc.username_sistem}' (ID Akun: ${id})`]
    );

    res.json({ status: 'success', message: 'Hak akses berhasil dicabut/dihapus' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 5. EDIT MASTER SISTEM
router.put('/systems/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { nama_sistem, url_sistem, deskripsi } = req.body;
  try {
    const result = await db.query(
      'UPDATE systems SET nama_sistem = $1, url_sistem = $2, deskripsi = $3 WHERE id = $4 RETURNING *',
      [nama_sistem, url_sistem, deskripsi, id]
    );
    res.json({ status: 'success', message: 'Sistem berhasil diperbarui', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 6. HAPUS MASTER SISTEM
router.delete('/systems/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM user_system_accounts WHERE system_id = $1', [id]);
    await db.query('DELETE FROM systems WHERE id = $1', [id]);
    res.json({ status: 'success', message: 'Sistem berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================
// 7. ADMIN MANAGEMENT (SUPERADMIN ONLY)
// ==========================================

// GET all admins
router.get('/admins', verifyToken, checkSuperAdmin, async (req, res) => {
  try {
    // Jangan sertakan password_hash dalam respons
    const result = await db.query('SELECT id, username, nama_admin, role FROM admins ORDER BY id DESC');
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// POST new admin
router.post('/admins', verifyToken, checkSuperAdmin, async (req, res) => {
  const { username, password, nama_admin, role } = req.body;

  if (!username || !password || !nama_admin || !role) {
    return res.status(400).json({ status: 'error', message: 'Semua field (username, password, nama_admin, role) harus diisi.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = 'INSERT INTO admins (username, password_hash, nama_admin, role) VALUES ($1, $2, $3, $4) RETURNING id, username, nama_admin, role';
    const result = await db.query(query, [username, hashedPassword, nama_admin, role]);

    const adminName = req.admin.nama_admin || 'Superadmin';
    await db.query(
      'INSERT INTO audit_logs (admin_name, action_type, details) VALUES ($1, $2, $3)',
      [adminName, 'CREATE_ADMIN', `Membuat admin baru: '${nama_admin}' (username: ${username}, role: ${role})`]
    );

    res.status(201).json({ status: 'success', message: 'Admin berhasil ditambahkan', data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') { // Unique violation for username
      return res.status(409).json({ status: 'error', message: 'Username sudah digunakan.' });
    }
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// DELETE admin
router.delete('/admins/:id', verifyToken, checkSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const currentAdminId = req.admin.id;

  if (parseInt(id) === currentAdminId) {
    return res.status(403).json({ status: 'error', message: 'Superadmin tidak dapat menghapus akunnya sendiri.' });
  }

  try {
    // Ambil data admin yang akan dihapus untuk log
    const adminRes = await db.query('SELECT username, nama_admin, role FROM admins WHERE id = $1', [id]);
    if (adminRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Admin tidak ditemukan.' });
    }
    const deletedAdmin = adminRes.rows[0];

    await db.query('DELETE FROM admins WHERE id = $1', [id]);

    const adminName = req.admin.nama_admin || 'Superadmin';
    await db.query(
      'INSERT INTO audit_logs (admin_name, action_type, details) VALUES ($1, $2, $3)',
      [adminName, 'DELETE_ADMIN', `Menghapus admin '${deletedAdmin.nama_admin}' (username: ${deletedAdmin.username}, role: ${deletedAdmin.role})`]
    );

    res.json({ status: 'success', message: 'Admin berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

const multer = require('multer');
const XLSX = require('xlsx');

// Konfigurasi penyimpanan temporary di memory RAM
const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// FITUR BULK IMPORT DATA PEGAWAI VIA EXCEL
// ==========================================
router.post('/users/upload-excel', verifyToken, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ status: 'error', message: 'File Excel wajib diunggah!' });
  }

  try {
    // 1. Baca buffer file Excel
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (sheetData.length === 0) {
      return res.status(400).json({ status: 'error', message: 'File Excel yang diunggah kosong!' });
    }

    let insertedCount = 0;
    const defaultPasswordHash = await bcrypt.hash('staff123', 10);

    // 2. Loop dan simpan/update ke database
    for (const row of sheetData) {
      const nik = row.NIK || row.nik;
      const nama = row.Nama || row.nama;
      const divisi = row.Divisi || row.divisi || 'Umum';
      const status = row.Status || row.status || 'Aktif';

      if (!nik || !nama) continue; // Lewati jika data NIK atau Nama kosong

      // Gunakan UPSERT: Tambah data baru, atau Update jika NIK sudah terdaftar
      await db.query(
        `INSERT INTO users (nik, nama, divisi, status, password_hash, role)
         VALUES ($1, $2, $3, $4, $5, 'staff')
         ON CONFLICT (nik) 
         DO UPDATE SET nama = EXCLUDED.nama, divisi = EXCLUDED.divisi, status = EXCLUDED.status`,
        [nik.toString(), nama, divisi, status, defaultPasswordHash]
      );
      insertedCount++;
    }

    // 3. Catat ke Audit Log
    const adminName = req.admin.nama_admin || req.admin.nama || 'Admin';
    await db.query(
      'INSERT INTO audit_logs (admin_name, action_type, details) VALUES ($1, $2, $3)',
      [adminName, 'BULK_IMPORT_USERS', `Mengunggah ${insertedCount} data pegawai via file Excel`]
    );

    res.json({
      status: 'success',
      message: `Berhasil memproses ${insertedCount} data pegawai dari Excel!`
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Gagal memproses file Excel: ' + err.message });
  }
});
module.exports = router;