// const express = require('express');
// const mongoose = require('mongoose');
// const cors = require('cors');
// const db = require('./utils/db')
// const app = express();
// const ResultScheduler = require('./utils/resultScheduler');

// app.use(express.json());
// // app.use(cors({
// //   origin: true,
// //   credentials: true,
// //   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS','PATCH'],
// //   allowedHeaders: ['Content-Type', 'Authorization']
// // }));
// app.use(cors({
//   origin: '*',
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
//   allowedHeaders: ['Content-Type', 'Authorization'],
//   credentials: true,
//   maxAge: 600
// }));
// require('dotenv').config()
// db();
// db().then(function (db) {
//   console.log(`Db connnected`)
// })
// ResultScheduler.init();

// const authRoutes = require('./routes/auth');
// const userRoutes = require('./routes/user');
// const walletRoutes = require('./routes/transaction');
// const adminRoutes = require('./routes/admin');
// const adminGameRoutes = require('./routes/adminGame');
// const userGameRoutes = require('./routes/UserGame');
// const AdminSetting = require("./routes/adminSettings")
// app.use('/api/auth', authRoutes);
// app.use('/api/user', userRoutes);
// app.use('/api', walletRoutes);
// app.use('/api/admin', adminRoutes);
// app.use('/api/admin/games', adminGameRoutes);
// app.use('/api/admin/admin-settings', AdminSetting );
// app.use('/api/games', userGameRoutes);
// const PORT = process.env.PORT || 9000;
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });
// app.get("/testing", (req, res) => {
//   res.sendFile(__dirname + "/testingpayement.html");
// })
// app.get("/Spinner", (req, res) => {
//   res.sendFile(__dirname + "/Spinner.html");
// })
// app.get("/deposit", (req, res) => {
//   res.sendFile(__dirname + "/manual-deposit.html");
// })

// require('dotenv').config(); // Always top
// const express = require('express');
// const cors = require('cors');
// const db = require('./utils/db');
// const ResultScheduler = require('./utils/resultScheduler');

// const app = express();

// // Middleware
// app.use(express.json());
// app.use(cors({
//   origin: '*',
//   methods: ['GET','POST','PUT','DELETE','OPTIONS','PATCH'],
//   allowedHeaders: ['Content-Type','Authorization'],
//   credentials: true
// }));

// // Connect DB
// db().then(() => console.log('MongoDB Connected'));

// // Start Result Scheduler
// ResultScheduler.init();

// // Routes
// const authRoutes = require('./routes/auth');
// const userRoutes = require('./routes/user');
// const walletRoutes = require('./routes/transaction');
// const adminRoutes = require('./routes/admin');
// const adminGameRoutes = require('./routes/adminGame');
// const userGameRoutes = require('./routes/UserGame');
// const AdminSetting = require('./routes/adminSettings');

// app.use('/api/auth', authRoutes);
// app.use('/api/user', userRoutes);
// app.use('/api', walletRoutes);
// app.use('/api/admin', adminRoutes);
// app.use('/api/admin/games', adminGameRoutes);
// app.use('/api/admin/admin-settings', AdminSetting);
// app.use('/api/games', userGameRoutes);

// // Static test pages
// app.get("/testing", (req,res)=> res.sendFile(__dirname + "/testingpayement.html"));
// app.get("/Spinner", (req,res)=> res.sendFile(__dirname + "/Spinner.html"));
// app.get("/deposit", (req,res)=> res.sendFile(__dirname + "/manual-deposit.html"));

// // Start Server
// const PORT = process.env.PORT || 9000;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
// ==========================
// 🌍 Environment Setup
// ==========================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./utils/db');
const ResultScheduler = require('./utils/resultScheduler');

// ==========================
// ⚙️ Initialize App
// ==========================
const app = express();

// ==========================
// 🧩 Middleware
// ==========================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ CORS Configuration (Production Safe)
app.use(
  cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// ==========================
// 💾 Database Connection
// ==========================
(async () => {
  try {
    await db();
    console.log('✅ MongoDB Connected');
  } catch (err) {
    console.error('❌ MongoDB Connection Failed:', err.message);
    process.exit(1);
  }
})();

// ==========================
// 🕐 Start Result Scheduler
// ==========================
try {
  ResultScheduler.init();
  console.log('🕒 Result Scheduler Started');
} catch (err) {
  console.error('❌ Scheduler Error:', err.message);
}

// ==========================
// 🚏 Routes
// ==========================
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const walletRoutes = require('./routes/transaction');
const adminRoutes = require('./routes/admin');
const adminGameRoutes = require('./routes/adminGame');
const userGameRoutes = require('./routes/UserGame');
const AdminSetting = require('./routes/adminSettings');

// 🧭 Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/games', adminGameRoutes);
app.use('/api/admin/admin-settings', AdminSetting);
app.use('/api/games', userGameRoutes);

// ==========================
// 🧪 Static Testing Pages
// ==========================
const path = require('path');
app.get('/testing', (req, res) => res.sendFile(path.join(__dirname, 'testingpayement.html')));
app.get('/Spinner', (req, res) => res.sendFile(path.join(__dirname, 'Spinner.html')));
app.get('/deposit', (req, res) => res.sendFile(path.join(__dirname, 'manual-deposit.html')));

// ==========================
// 🧱 Global Error Handling
// ==========================
app.use((err, req, res, next) => {
  console.error('🔥 Global Error:', err.stack);
  res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

// ==========================
// 🚀 Start Server
// ==========================
const PORT = process.env.PORT || 9003;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Base URL: http://localhost:${PORT}`);
});
