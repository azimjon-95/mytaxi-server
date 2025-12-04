const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const redis = require("redis");
require("dotenv").config();

const authMiddleware = require("./middleware/AuthMiddleware");
const notfound = require("./middleware/notfound.middleware");
const soket = require("./socket");

// Express ilova
const app = express();
const PORT = process.env.PORT || 5050;

// ---- MIDDLEWARE ----
const corsOptions = {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
};

app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json());

// ---- REDIS ----
const redisClient = redis.createClient({ url: process.env.REDIS_URL });

redisClient.connect()
    .then(() => console.log("✅ Redis connected"))
    .catch((err) => console.log("❌ Redis error:", err));


// ---- MONGODB ----
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.log("❌ MongoDB error:", err));


// ---- SERVER START ----
const server = app.listen(PORT, () =>
    console.log(`🚀 Server running on port ${PORT}`)
);


// ---- SOCKET.IO ----
const io = require("./middleware/socket.header")(server);
app.set("socket", io);
soket.connect(io);


// ---- ROUTES ----
const userRoutes = require("./routes/Routes")(redisClient, io);

// public endpointlar (token talab qilinmaydi)
app.use("/api/v1", userRoutes.publicRouter);

// himoyalangan endpointlar (token bilan)
app.use("/api/v1", authMiddleware, userRoutes.protectedRouter);


// ---- 404 Middleware ----
app.use(notfound);

