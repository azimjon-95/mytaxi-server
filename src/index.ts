import express from "express";
import mongoose from "mongoose";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import { createClient, type RedisClientType } from "redis";
import dotenv from "dotenv";
import type http from "http";
import type { Server as SocketIOServer } from "socket.io";

import { startCleanupCron, setClients } from "./cron/cleanupAvailableDrivers";
import authMiddleware from "./middleware/AuthMiddleware";
import notfound from "./middleware/notfound.middleware";
import createSocket from "./middleware/socket.header";
import soket from "./socket";
import buildRoutes from "./routes/Routes";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT ?? 5054);

// ---- MIDDLEWARE ----
const corsOptions: CorsOptions = {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true
};

app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- REDIS ----
const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) throw new Error("REDIS_URL env topilmadi (.env ni tekshiring)");

const redisClient: RedisClientType = createClient({ url: REDIS_URL });

redisClient
    .connect()
    .then(() => console.log("✅ Redis connected"))
    .catch((err: unknown) => console.log("❌ Redis error:", err));

// ---- MONGODB ----
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error("MONGO_URI env topilmadi (.env ni tekshiring)");

mongoose
    .connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err: unknown) => console.log("❌ MongoDB error:", err));

// ---- SERVER START ----
const server: http.Server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

// ---- SOCKET.IO ----
const io: SocketIOServer = createSocket(server);
app.set("socket", io);

soket.connect(io);

// Cron-ga clientlarni ulash
setClients({ redis: redisClient, socket: io });
startCleanupCron();

// ---- ROUTES ----
const routes = buildRoutes(redisClient, io);

// public endpointlar
app.use("/api/v1", routes.publicRouter);

// protected endpointlar
app.use("/api/v1", authMiddleware, routes.protectedRouter);

// ---- 404 Middleware ----
app.use(notfound);

export default app;
