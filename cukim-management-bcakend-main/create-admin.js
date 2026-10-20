// backend-api/create-admin.js
const bcrypt = require('bcryptjs');
const db = require('./config/db');

async function createAdmin() {
  const username = 'admin';
  const rawPassword = 'admin123';
  const namaAdmin = 'Super Admin';

  try {
    // Hash password menggunakan bcrypt langsung dari environment Node.js Anda
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    // Masukkan ke database
    const query = `
      INSERT INTO admins (username, password_hash, nama_admin)
      VALUES ($1, $2, $3)
      ON CONFLICT (username) 
      DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id, username, nama_admin;
    `;

    const result = await db.query(query, [username, hashedPassword, namaAdmin]);
    console.log('✅ Admin berhasil dibuat / diperbarui!');
    console.log('Data Admin:', result.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error('❌ Gagal membuat admin:', err.message);
    process.exit(1);
  }
}

createAdmin();