const Order = require("../models/Order");
const { Driver } = require("../models/driverModel");
const response = require("../utils/response");
const DriverLocationService = require("../service/driverLocationService");
const { getDistanceFromGraphHopper } = require("../service/getDistanceFromGraphHopper");
const mongoose = require("mongoose");
require('dotenv').config();


class MainOrderController {
    constructor(redisClient, io) {
        this.redisClient = redisClient;
        this.io = io;
        this.driverLocationService = new DriverLocationService(redisClient);
    }

    // 🚀 Drayver bo'yicha orderlarni olish
    getOrderByDriverId = async (req, res) => {
        try {
            const { driverId } = req.params;

            // 🔹 Driver ID tekshirish
            if (!mongoose.Types.ObjectId.isValid(driverId)) {
                return response.notFound(res, "Invalid driverId");
            }

            // 🔹 Drayver locationini olish
            const allDriverLocations = await this.driverLocationService.getDriverLocationById(driverId);
            if (!allDriverLocations) {
                return response.notFound(res, "Driver location not found");
            }

            // 🔹 Drayverni tekshirish
            const driver = await Driver.findById(driverId).select("isActive");
            if (!driver || !driver.isActive) {
                const inactivePayload = {
                    isActive: false,
                    message: "Siz active emassiz",
                    orders: [],
                };
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
                    driverLocation: allDriverLocations,
                };
                return response.success(res, "Orders fetched (cache)", payload);
            }

            // 🔹 Orderlarni olish
            const orders = await Order.find({
                status: { $in: ["created", "waiting", "driver_assigned"] },
            })
                .populate({ path: "clientId" })
                .sort({ createdAt: -1 })
                .lean();

            // 🔹 Har bir orderga masofani hisoblash (OSRM orqali)
            const ordersWithDistance = await Promise.all(
                orders.map(async (order) => {
                    const clientLocation = order.location;
                    const distanceKm = await getDistanceFromGraphHopper(allDriverLocations, clientLocation);
                    console.log(distanceKm.distanceKm);

                    return {
                        ...order,
                        distance: distanceKm ? Number(Math.floor(distanceKm.distanceKm)) : null,
                    };
                })
            );

            // 🔹 Redisga saqlash (30 sekund)
            await this.redisClient.set(
                cacheKey,
                JSON.stringify(ordersWithDistance),
                { EX: 30 }
            );

            // 🔹 Payload yaratish va socket orqali yuborish
            const payload = {
                isActive: true,
                orders: ordersWithDistance,
                driverLocation: allDriverLocations,
            };

            this.io.emit(`driver:${driverId}`, payload);

            return response.success(res, "Orders fetched", payload);

        } catch (error) {
            console.error(error);
            return response.serverError(res, error.message);
        }
    };


    // DRIVER ISACTIVE TOGGLE
    toggleActive = async (req, res) => {
        try {
            const { driverId } = req.params;
            const { isActive } = req.body; // true / false

            if (!mongoose.Types.ObjectId.isValid(driverId)) {
                return response.notFound(res, "Invalid driver ID");
            }

            if (typeof isActive !== "boolean") {
                return response.error(res, "isActive must be boolean");
            }

            // 1️⃣ DB update
            const updatedDriver = await Driver.findByIdAndUpdate(
                driverId,
                { isActive },
                { new: true }
            );

            if (!updatedDriver) {
                return response.notFound(res, "Driver not found");
            }

            // 2️⃣ Redis update
            await this.redisClient.set(
                `driver:${driverId}:isActive`,
                isActive.toString(), // "true" / "false"
                { EX: 3600 }
            );

            // 3️⃣ Socket realtime
            this.io.emit("driverStatusChanged", {
                driverId,
                isActive,
            });

            return response.success(
                res,
                "Driver status updated",
                updatedDriver
            );

        } catch (error) {
            return response.serverError(res, error.message);
        }
    };


    // Driver location-ni Redis-ga saqlash
    setLocationRedis = async (req, res) => {
        try {
            const { driverId } = req.body;

            if (!driverId || latitude == null || longitude == null) {
                return response.badRequest(res, "DriverId, latitude and longitude required");
            }

            // Redis key: driver:{id}:location
            await this.redisClient.set(
                `driver:${driverId}:location`,
                JSON.stringify({ latitude, longitude }),
                { EX: 14400 } // TTL 4 soat
            );

            // Socket.IO orqali frontend-ga realtime yuborish
            this.io.emit("driverLocationUpdated", {
                driverId,
                latitude,
                longitude,
            });

            return response.success(res, "Driver location updated in Redis", {
                driverId,
                latitude,
                longitude,
            });
        } catch (error) {
            return response.serverError(res, error.message);
        }
    }
    getLocationRedis = async (req, res) => {
        try {
            const { driverId } = req.params;

            if (!driverId) {
                return response.badRequest(res, "DriverId required");
            }

            // Redisdan olish
            const location = await this.redisClient.get(
                `driver:${driverId}:location`
            );

            if (!location) {
                return response.notFound(res, "Driver location not found");
            }

            const { latitude, longitude } = JSON.parse(location);

            // 🔴 SOCKET orqali yuborish
            this.io.emit("driverLocationUpdated", {
                driverId,
                latitude,
                longitude,
            });

            return response.success(res, "Driver location fetched from Redis", {
                driverId,
                latitude,
                longitude,
            });

        } catch (error) {
            return response.serverError(res, error.message);
        }
    };
}

module.exports = MainOrderController;