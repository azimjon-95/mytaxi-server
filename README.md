# MyTaxi Server (TypeScript)

🚖 MyTaxi Server — Node.js (TypeScript), Express, MongoDB, Redis va Socket.IO asosida ishlab chiqilgan taxi buyurtmalarini boshqarish, driver location, real-time eventlar va user management uchun backend server.

---

## 1) Texnologiyalar

- Node.js + TypeScript
- Express
- MongoDB (Mongoose)
- Redis (cache / TTL / realtime uchun)
- Socket.IO (real-time)
- Multer (rasm upload memoryStorage)
- node-cron (availableDrivers cleanup)
- Docker & Docker Compose (MongoDB, Redis, Redis Commander)

---

## 2) Talablar

- Node.js: 20+ (WSL Ubuntu’da ham bo‘ladi)
- npm
- MongoDB + Redis (local yoki Docker orqali)

---

## 3) Loyihani local ishga tushirish (Ubuntu/WSL)

### 3.1) Install
```bash
cd server
npm install
