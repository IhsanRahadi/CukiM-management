// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const apiRoutes = require('./routes/api'); // Import route API baru

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Panggil Route API utama dengan prefix /api
app.use('/api', apiRoutes);

// Endpoint Dasar
app.get('/', (req, res) => {
  res.json({ message: 'API Backend Access Management Siap Digunakan!' });
});

// Jalankan Server
app.listen(5000, '0.0.0.0', () => {
  console.log('Backend berjalan dan bisa diakses dari LAN pada port 5000');
});