// cron/cleanupAvailableDrivers.js
const cron = require("node-cron");
const Order = require("../models/Order"); // mos yo‘l
let redisClient; // keyin set qilamiz
let io;

function setClients({ redis, socket }) {
    redisClient = redis;
    io = socket;
}


function startCleanupCron() {
    cron.schedule("*/10 * * * * *", async () => { // har 10 sekund
        try {
            const now = Date.now();
            const orders = await Order.find({
                "availableDrivers.expireAt": { $lte: now }
            });

            for (const order of orders) {
                order.availableDrivers = order.availableDrivers.filter(
                    d => d.expireAt > now
                );

                await order.save();

                if (redisClient.isOpen) {
                    await redisClient.set(
                        `active_order:${order._id}`,
                        JSON.stringify(order.toObject()),
                        "EX",
                        1800
                    );
                }

                if (io) io.emit("availableDriversUpdate", order);
            }
        } catch (err) {
            console.error("CRON CLEANUP ERROR:", err);
        }
    });
}

module.exports = { startCleanupCron, setClients };
