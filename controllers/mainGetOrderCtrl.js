const Order = require("../models/Order");
const { Driver } = require("../models/driverModel");
const response = require("../utils/response");
const mongoose = require("mongoose");
const axios = require('axios');
require('dotenv').config();


class MainOrderController {
    constructor(redisClient, io) {
        this.redisClient = redisClient;
        this.io = io;
    }
    // 🚀 Drayver bo'yicha orderlarni olish
    // 🚀 Drayver bo'yicha orderlarni olish
    getOrderByDriverId = async (req, res) => {
        try {
            const { driverId } = req.params;

            if (!mongoose.Types.ObjectId.isValid(driverId)) {
                return response.notFound(res, "Invalid driverId");
            }

            // 🔹 Drayverni tekshirish
            const driver = await Driver.findById(driverId).select("isActive");

            // ❌ Driver yo‘q yoki active emas
            if (!driver || !driver.isActive) {
                const inactivePayload = {
                    isActive: false,
                    message: "Siz active emassiz",
                    orders: [],
                };

                // 🔔 Socket orqali yuborish
                this.io.emit(`driver:${driverId}`, inactivePayload);

                return response.success(res, "Driver inactive", inactivePayload);
            }

            // 🔹 Redisdan tekshirish
            const cacheKey = `active_order:${driverId}`;
            const cachedOrders = await this.redisClient.get(cacheKey);

            if (cachedOrders) {
                const payload = {
                    isActive: true,
                    orders: JSON.parse(cachedOrders),
                };

                return response.success(res, "Orders fetched (cache)", payload);
            }

            // 🔹 Orderlarni olish + POPULATE
            const orders = await Order.find({
                status: { $in: ["created", "waiting", "driver_assigned"] },
            })
                .populate({
                    path: "clientId"
                })
                .sort({ createdAt: -1 })
                .lean(); // 🔥 tezroq

            // 🔹 Redisga saqlash (30 sekund)
            await this.redisClient.set(
                cacheKey,
                JSON.stringify(orders),
                { EX: 30 }
            );

            const payload = {
                isActive: true,
                orders,
            };

            // 🔔 Socket orqali real-time yuborish
            this.io.emit(`driver:${driverId}`, payload);

            return response.success(res, "Orders fetched", payload);

        } catch (error) {
            console.error(error);
            return response.serverError(res, error.message);
        }
    };


}

module.exports = MainOrderController;