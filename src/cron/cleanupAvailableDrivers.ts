import cron from "node-cron";
import type { RedisClientType } from "redis";
import type { Server as SocketIOServer } from "socket.io";
import Order from "../models/Order"; // ✅ src/cron -> src/models

let redisClient: RedisClientType | null = null;
let io: SocketIOServer | null = null;

export function setClients(payload: { redis: RedisClientType; socket: SocketIOServer }) {
    redisClient = payload.redis;
    io = payload.socket;
}

export function startCleanupCron() {
    cron.schedule("*/10 * * * * *", async () => {
        try {
            const now = Date.now();

            const orders = await Order.find({
                "availableDrivers.expireAt": { $lte: now }
            });

            for (const order of orders) {
                order.availableDrivers = order.availableDrivers.filter((d: any) => d.expireAt > now);
                await order.save();

                if (redisClient && (redisClient as any).isOpen) {
                    await redisClient.set(
                        `active_order:${order._id}`,
                        JSON.stringify(order.toObject()),
                        { EX: 1800 }
                    );
                }

                if (io) io.emit("availableDriversUpdate", order);
            }
        } catch (err) {
            console.error("CRON CLEANUP ERROR:", err);
        }
    });
}
