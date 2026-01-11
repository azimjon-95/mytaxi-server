import type { Request, Response } from "express";
import type { RedisClientType } from "redis";
import type { Server as SocketIOServer } from "socket.io";
import type mongoose from "mongoose";
import mongooseLib from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// Models (hozir JS => vaqtincha typed require)
const Order = require("../models/Order") as mongoose.Model<any>;
const User = require("../models/clinetModel") as mongoose.Model<any>;
const { Driver } = require("../models/driverModel") as { Driver: mongoose.Model<any> };

// Service
const { getDistanceFromGraphHopper } = require("../service/getDistanceFromGraphHopper") as {
    getDistanceFromGraphHopper: (
        driverLocation: any,
        clientLocation: any
    ) => Promise<{ distanceKm?: number; durationMin?: number } | null>;
};

// response helper (signature’lar aralash ishlatilgan => any)
const response: any = require("../utils/response");

// ---- distance va ETA helpers ----
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function calculateETA(distance: number, speed = 40) {
    return Math.ceil((distance / speed) * 60);
}

type GetAvailableDriversParams = { clId: string; orId: string };
type IdParams = { id: string };
type CancelParams = { orderId: string };

const errMsg = (err: unknown): string =>
    err instanceof Error ? err.message : String(err);

class OrderController {
    private redisClient: RedisClientType | null;
    private io: SocketIOServer | null;

    constructor(redisClient: RedisClientType | null, io: SocketIOServer | null) {
        this.redisClient = redisClient;
        this.io = io;
    }

    // ---------------------------
    // GET AVAILABLE DRIVERS
    // ---------------------------
    getAvailableDrivers = async (req: Request<GetAvailableDriversParams>, res: Response) => {
        try {
            const { clId: clientId, orId: orderId } = req.params;

            if (!clientId || !mongooseLib.Types.ObjectId.isValid(clientId)) {
                return response.notFound(res, "clientId noto‘g‘ri yoki berilmagan");
            }

            const redisKey = `active_order:${orderId}`;
            let orderData: any = null;

            // 1️⃣ REDISDAN O‘QISH
            if (this.redisClient) {
                const redisData = await this.redisClient.get(redisKey);
                if (redisData) orderData = JSON.parse(redisData);
            }

            if (!orderData) {
                // 2️⃣ MONGO DB'DAN O‘QISH
                const allowedStatuses = ["waiting", "driver_assigned", "on_the_car", "completed"];

                const order = await Order.findOne({
                    _id: orderId,
                    clientId: new mongooseLib.Types.ObjectId(clientId),
                    status: { $in: allowedStatuses }
                }).select("-__v");

                // 🔥 Order topilmasa — MAIN holat
                if (!order) {
                    const responseData = { status: "main", driver: {}, availableDrivers: [] };

                    if (this.io) this.io.emit("availableDriversUpdate", responseData);
                    return response.success(res, "Order topilmadi", responseData);
                }

                orderData = order.toObject();

                if (this.redisClient) {
                    await this.redisClient.setEx(redisKey, 30, JSON.stringify(orderData));
                }
            }

            // 3️⃣ DRIVER ASSIGNED BO‘LSA
            if (orderData?.status === "driver_assigned") {
                const driverId = orderData?.driver?.driverId;

                const driver =
                    driverId && mongooseLib.Types.ObjectId.isValid(String(driverId))
                        ? await Driver.findById(driverId).select("-__v")
                        : null;

                const driverInfo = driver
                    ? {
                        _id: driver._id,
                        firstName: driver.firstName,
                        lastName: driver.lastName,
                        phoneNumber: driver.phoneNumber,
                        car: driver.car,
                        birthDate: driver.birthDate,
                        balance: driver.balance,
                        isActive: driver.isActive
                    }
                    : null;

                const responseData = {
                    status: "driver",
                    driver: { ...orderData.driver, driverInfo },
                    availableDrivers: []
                };

                if (this.io) this.io.emit("availableDriversUpdate", responseData);
                return response.success(res, "Driver assigned", responseData);
            }

            // 4️⃣ DRIVER YO‘Q — availableDrivers qaytariladi
            const availableDrivers = await Promise.all(
                (orderData.availableDrivers || []).map(async (d: any) => {
                    if (!d.driverId) return d;

                    const driver = await Driver.findById(d.driverId).select("-__v");
                    return driver
                        ? {
                            ...d,
                            driverId: {
                                _id: driver._id,
                                firstName: driver.firstName,
                                lastName: driver.lastName,
                                phoneNumber: driver.phoneNumber,
                                car: driver.car,
                                birthDate: driver.birthDate,
                                balance: driver.balance,
                                isActive: driver.isActive
                            }
                        }
                        : d;
                })
            );

            const responseData = {
                status: "availableDrivers",
                availableDrivers,
                driver: null
            };

            if (this.io) this.io.emit("availableDriversUpdate", responseData);
            return response.success(res, "Available drivers list", responseData);
        } catch (err) {
            console.error("getAvailableDrivers ERROR:", err);
            return response.serverError(res, "Server xatosi");
        }
    };

    // ---------------------------
    // ASSIGN DRIVER (new version)
    // ---------------------------
    assignDriverByClient = async (req: Request, res: Response) => {
        try {
            const { orderId, driverId, driverLocation, clientLocation } = req.body as any;

            const expireSeconds = 30;
            const expireAt = Date.now() + expireSeconds * 1000;

            if (!orderId || !driverId || !driverLocation || !clientLocation) {
                return response.error(res, "Missing required fields");
            }

            if (!this.redisClient) {
                return response.serverError(res, "Redis client not initialized");
            }

            /* 1️⃣ ORDER (REDIS → DB) */
            let activeOrder: any = await this.redisClient.get(`active_order:${orderId}`);

            if (activeOrder) {
                activeOrder = JSON.parse(activeOrder);
            } else {
                const orderFromDB = await Order.findById(orderId);
                if (!orderFromDB) return response.notFound(res, "Order not found");

                activeOrder = orderFromDB.toObject();

                await this.redisClient.set(`active_order:${orderId}`, JSON.stringify(activeOrder), {
                    EX: 1800
                });
            }

            /* 2️⃣ MASOFA & ETA */
            const routeInfo = await getDistanceFromGraphHopper(driverLocation, clientLocation);
            if (!routeInfo) return response.error(res, "Cannot  route");

            const { distanceKm = 0, durationMin = 0 } = routeInfo;

            /* 3️⃣ DRIVER */
            const driver = await Driver.findById(driverId);
            if (!driver) return response.notFound(res, "Driver not found");

            /* 4️⃣ NEW DRIVER (expireAt bilan) */
            const newDriver = {
                driverId,
                modelName: driver.car ? `${driver.car.make} ${driver.car.modelName}` : "Unknown",
                plateNumber: driver.car?.plateNumber || "Unknown",
                color: driver.car?.color || "Unknown",
                phone: driver.phone,
                distance: distanceKm,
                eta: durationMin,
                expireAt
            };

            /* 5️⃣ ORDERGA QO‘SHISH */
            const order = await Order.findById(orderId);
            if (!order) return response.notFound(res, "Order not found");

            const alreadyExists = (order.availableDrivers || []).some(
                (d: any) => String(d.driverId) === String(driverId)
            );

            if (!alreadyExists) {
                order.availableDrivers.push(newDriver);
                await order.save();
            }

            /* 6️⃣ REDIS TTL (har driver uchun) */
            await this.redisClient.set(
                `expire:order:${orderId}:driver:${driverId}`,
                "1",
                { EX: expireSeconds }
            );

            /* 7️⃣ POPULATE + REDIS UPDATE */
            const populatedOrder = await Order.findById(orderId).populate("availableDrivers.driverId");

            if (populatedOrder) {
                await this.redisClient.set(`active_order:${orderId}`, JSON.stringify(populatedOrder.toObject()), {
                    EX: 1800
                });
            }

            if (this.io) this.io.emit("availableDriversUpdate", populatedOrder);

            return response.success(res, "Driver added (TTL + cron)", newDriver);
        } catch (err) {
            console.error("ASSIGN DRIVER ERROR:", err);
            return response.serverError(res, "Server Error", errMsg(err));
        }
    };

    // ---------------------------
    // WATCH ACTIVE ORDER
    // ---------------------------
    watchActiveOrder = async (req: Request, res: Response) => {
        try {
            const { clientId } = req.params as any;
            if (!clientId) return response.warning(res, "ClientId is required");

            if (!this.redisClient) {
                return response.serverError(res, "Redis client not initialized");
            }

            const cachedOrderRaw = await this.redisClient.get(`active_order:${clientId}`);

            if (cachedOrderRaw) {
                const parsed = JSON.parse(cachedOrderRaw);
                if (parsed && parsed !== "null") {
                    return response.success(res, {
                        message: "Active order fetched from cache",
                        activeOrder: parsed,
                        status: true
                    });
                }
            }

            const order = await Order.findOne({
                clientId,
                status: { $in: ["waiting", "driver_assigned", "on_the_car"] }
            })
                .sort({ createdAt: -1 })
                .populate("clientId");

            if (!order) {
                return response.success(res, {
                    message: "No active order found>>>",
                    activeOrder: null,
                    status: false
                });
            }

            await this.redisClient.set(`active_order:${clientId}`, JSON.stringify(order), { EX: 60 * 5 });

            return response.success(res, {
                message: "Active order fetched from database",
                activeOrder: order,
                status: true
            });
        } catch (err) {
            console.log(err);
            return response.serverError(res, errMsg(err));
        }
    };

    // ---------------------------
    // 🚕 DRIVER TANLASH
    // ---------------------------
    assignDriver = async (req: Request, res: Response) => {
        try {
            const { orderId, driverId } = req.body as any;

            if (!orderId || !driverId) {
                return response.error(res, "orderId va driverId majburiy!");
            }

            const order = await Order.findById(orderId);
            if (!order) return response.notFound(res, "Order topilmadi");

            const selectedDriver = (order.availableDrivers || []).find(
                (d: any) => String(d.driverId) === String(driverId)
            );

            if (!selectedDriver) {
                return response.notFound(res, "Bu driver availableDrivers ichida yo‘q");
            }

            order.driver = {
                driverId: selectedDriver.driverId,
                modelName: selectedDriver.modelName,
                carNumber: selectedDriver.carNumber,
                color: selectedDriver.color,
                phone: selectedDriver.phone,
                distance: selectedDriver.distance,
                eta: selectedDriver.eta
            };

            order.status = "driver_assigned";

            order.timeline.push({
                stage: "driver_assigned",
                driverId: selectedDriver.driverId
            });

            const savedOrder = await order.save();

            if (this.redisClient) {
                await this.redisClient.set(`active_order:${orderId}`, JSON.stringify(savedOrder), { EX: 60 * 60 });
            }

            if (this.io) this.io.emit("availableDriversUpdate", savedOrder);

            return response.success(res, "Driver muvaffaqiyatli assign qilindi", savedOrder);
        } catch (err) {
            console.log(err);
            return response.serverError(res, "Server xatosi", errMsg(err));
        }
    };

    // ---------------------------
    // CREATE ORDER
    // ---------------------------
    create = async (req: Request, res: Response) => {
        try {
            const { when } = req.body as any;

            let initialStatus = "created";
            let timeline: any[] = [{ stage: "created", timestamp: new Date() }];

            if (when === "waiting") {
                initialStatus = "waiting";
                timeline = [{ stage: "waiting", timestamp: new Date() }];
            }

            const order = new Order({
                ...req.body,
                status: initialStatus,
                availableDrivers: [],
                timeline
            });

            await order.save();

            const populatedOrder = await Order.findById(order._id).populate("clientId");

            // Redis-ga saqlash (1 soatga) — active_order list
            if (this.redisClient && populatedOrder && populatedOrder._id) {
                const cacheKey = "active_order";
                const cachedData = await this.redisClient.get(cacheKey);

                let orders: any[] = [];
                if (cachedData) {
                    try {
                        const parsed = JSON.parse(cachedData);
                        orders = Array.isArray(parsed) ? parsed : [parsed];
                    } catch {
                        orders = [];
                    }
                }

                orders.push(populatedOrder);

                await this.redisClient.set(cacheKey, JSON.stringify(orders), { EX: 60 * 60 });
            }

            if (this.io) this.io.emit("new_order", order);

            return response.created(res, "Order created", order);
        } catch (err) {
            console.error("Create order error:", err);
            return response.error(res, errMsg(err));
        }
    };

    // ---------------------------
    // GET ALL ORDERS
    // ---------------------------
    getAll = async (req: Request, res: Response) => {
        try {
            if (!this.redisClient) {
                // Redis bo'lmasa ham DB'dan olib beramiz
                const orders = await Order.find()
                    .populate("clientId", "name phone")
                    .populate("availableDrivers.driverId", "model carNumber color phone")
                    .populate("driver.driverId", "model carNumber color phone");

                return response.success(res, "Orders fetched", orders);
            }

            const cachedOrders = await this.redisClient.get("orders:all");
            if (cachedOrders) {
                return response.success(res, "Orders fetched (cache)", JSON.parse(cachedOrders));
            }

            const orders = await Order.find()
                .populate("clientId", "name phone")
                .populate("availableDrivers.driverId", "model carNumber color phone")
                .populate("driver.driverId", "model carNumber color phone");

            await this.redisClient.set("orders:all", JSON.stringify(orders), { EX: 60 * 5 });

            return response.success(res, "Orders fetched", orders);
        } catch (err) {
            return response.error(res, errMsg(err));
        }
    };

    // ---------------------------
    // UPDATE METER
    // ---------------------------
    updateMeter = async (req: Request, res: Response) => {
        try {
            const { orderId, latitude, longitude } = req.body as any;

            const order = await Order.findById(orderId);
            if (!order) return response.notFound(res, "Order not found");

            if (!order.meter?.started) return response.warning(res, "Meter not started");

            const dist = calculateDistance(
                order.meter.lastLocation.latitude,
                order.meter.lastLocation.longitude,
                latitude,
                longitude
            );

            if (dist > 0 && dist < 2) order.meter.totalDistance += dist;

            const now = new Date();
            const last = new Date(order.updatedAt);
            const diffMin = (now.getTime() - last.getTime()) / 1000 / 60;

            if (diffMin > 0 && diffMin <= 1) order.meter.totalMinutes += diffMin;

            order.meter.lastLocation = { latitude, longitude };

            await order.save();

            return response.success(res, "Meter updated", order.meter);
        } catch (err) {
            return response.error(res, errMsg(err));
        }
    };

    // ---------------------------
    // START METER
    // ---------------------------
    startMeter = async (req: Request, res: Response) => {
        try {
            const { orderId, latitude, longitude } = req.body as any;

            const order = await Order.findById(orderId);
            if (!order) return response.notFound(res, "Order not found");

            if (order.meter?.started) return response.warning(res, "Meter already started");

            order.status = "on_the_car";

            order.meter = {
                started: true,
                startTime: new Date(),
                startLocation: { latitude, longitude },
                lastLocation: { latitude, longitude },
                totalDistance: 0,
                totalMinutes: 0
            };

            order.timeline.push({
                stage: "on_the_car",
                driverId: order.driver?.driverId || null,
                timestamp: new Date()
            });

            await order.save();

            return response.success(res, "Meter started", order.meter);
        } catch (err) {
            return response.error(res, errMsg(err));
        }
    };

    // ---------------------------
    // GET ORDER BY ID
    // ---------------------------
    getById = async (req: Request<IdParams>, res: Response) => {
        try {
            const { id } = req.params;

            if (this.redisClient) {
                const cachedOrder = await this.redisClient.get(`order:${id}`);
                if (cachedOrder) {
                    return response.success(res, "Order fetched (cache)", JSON.parse(cachedOrder));
                }
            }

            const order = await Order.findById(id)
                .populate("clientId", "name phone")
                .populate("availableDrivers.driverId", "model carNumber color phone")
                .populate("driver.driverId", "model carNumber color phone");

            if (!order) return response.notFound(res, "Order not found");

            if (this.redisClient) {
                await this.redisClient.set(`order:${id}`, JSON.stringify(order), { EX: 60 * 5 });
            }

            return response.success(res, "Order fetched", order);
        } catch (err) {
            return response.error(res, errMsg(err));
        }
    };

    // ---------------------------
    // UPDATE ORDER (distance/payment)
    // ---------------------------
    update = async (req: Request<IdParams>, res: Response) => {
        try {
            const { id } = req.params;

            const order = await Order.findById(id);
            if (!order) return response.notFound(res, "Order not found");

            if (req.body?.endLatitude && req.body?.endLongitude) {
                const distance = calculateDistance(
                    order.location.latitude,
                    order.location.longitude,
                    req.body.endLatitude,
                    req.body.endLongitude
                );

                const fare = distance * 2;
                const cashback = fare * 0.05;

                order.traveledDistance = distance;
                order.amountPaid = fare;
                order.cashbackPaid = cashback;
                order.status = "completed";
                order.timeline.push({ stage: "completed", driverId: order.driver?.driverId || null });

                if (this.io) {
                    this.io.to(String(order.clientId)).emit("order_completed", {
                        orderId: order._id,
                        distance,
                        fare,
                        cashback
                    });
                }
            }

            Object.keys(req.body || {}).forEach((key) => {
                if (!["endLatitude", "endLongitude"].includes(key)) {
                    (order as any)[key] = (req.body as any)[key];
                }
            });

            await order.save();

            if (this.redisClient) {
                await this.redisClient.set(`order:${id}`, JSON.stringify(order), { EX: 60 * 5 });
            }

            return response.success(res, "Order updated", order);
        } catch (err) {
            return response.error(res, errMsg(err));
        }
    };

    // ---------------------------
    // COMPLETE ORDER
    // ---------------------------
    completeOrder = async (req: Request, res: Response) => {
        try {
            const { orderId, endLatitude, endLongitude } = req.body as any;

            const order = await Order.findById(orderId);
            if (!order) return response.notFound(res, "Order topilmadi");

            if (order.status !== "on_the_car" && order.status !== "on_the_way") {
                return response.warning(res, "Buyurtma hozir yakunlanadigan holatda emas");
            }

            let totalDistance = order?.meter?.totalDistance || 0;
            let totalMinutes = order?.meter?.totalMinutes || 0;

            if (!order?.meter?.started && endLatitude && endLongitude) {
                const dist = calculateDistance(
                    order.location.latitude,
                    order.location.longitude,
                    endLatitude,
                    endLongitude
                );
                totalDistance = dist;
                totalMinutes = dist * 2;
            }

            const PRICE_PER_KM = Number(process.env.PRICE_PER_KM ?? 3000);
            const PRICE_PER_MINUTE = Number(process.env.PRICE_PER_MINUTE ?? 200);
            const CLIENT_CASHBACK = Number(process.env.CLIENT_CASHBACK ?? 0.05);

            const kmPrice = totalDistance * PRICE_PER_KM;
            const minutePrice = totalMinutes * PRICE_PER_MINUTE;

            const totalFare = Math.round(kmPrice + minutePrice);
            const cashback = Math.round(totalFare * CLIENT_CASHBACK);

            order.traveledDistance = totalDistance;
            order.totalMinutes = totalMinutes;
            order.amountPaid = totalFare;
            order.cashbackPaid = cashback;
            order.status = "completed";

            order.timeline.push({
                stage: "completed",
                driverId: order.driver?.driverId || null,
                timestamp: new Date()
            });

            await order.save();

            if (this.io) {
                this.io.to(String(order.clientId)).emit("order_completed", {
                    orderId: order._id,
                    distance: totalDistance,
                    minutes: totalMinutes,
                    fare: totalFare,
                    cashback
                });
            }

            return response.success(res, "Buyurtma yakunlandi", {
                distance: totalDistance,
                minutes: totalMinutes,
                fare: totalFare,
                cashback
            });
        } catch (err) {
            console.log(err);
            return response.serverError(res, "Server xatosi", errMsg(err));
        }
    };

    // ---------------------------
    // DELETE ORDER
    // ---------------------------
    delete = async (req: Request<IdParams>, res: Response) => {
        try {
            const { id } = req.params;
            const order = await Order.findByIdAndDelete(id);
            if (!order) return response.notFound(res, "Order not found");

            if (this.redisClient) await this.redisClient.del(`order:${id}`);

            return response.success(res, "Order deleted", order);
        } catch (err) {
            return response.error(res, errMsg(err));
        }
    };

    // ---------------------------
    // CANCEL ORDER
    // ---------------------------
    cancelOrder = async (req: Request<CancelParams>, res: Response) => {
        try {
            const { orderId } = req.params;
            const { cancelledBy, cancelReason } = req.body as any;

            if (!["client", "driver", "admin"].includes(cancelledBy)) {
                return response.notFound(res, "cancelledBy noto‘g‘ri!");
            }

            const order = await Order.findById(orderId);
            if (!order) return response.notFound(res, "Zakaz topilmadi!");

            if (["completed", "cancelled"].includes(order.status)) {
                return response.notFound(res, "Bu zakazni bekor qilib bo‘lmaydi!");
            }

            // 🟢 Client bekor qilsa → cashback -2000
            if (cancelledBy === "client") {
                const user = await User.findById(order.clientId);
                if (user) {
                    const minusSum = 2000;
                    user.cashback = Math.max(0, (user.cashback || 0) - minusSum);
                    await user.save();
                }
            }

            order.status = "cancelled";
            order.cancelledBy = cancelledBy;
            order.cancelReason = cancelReason || "Izoh berilmagan";

            order.timeline.push({
                stage: "cancelled",
                driverId: order?.driver?.driverId || null
            });

            await order.save();

            // Redis cache tozalash
            if (this.redisClient) {
                try {
                    await this.redisClient.del(`order:${orderId}`);
                    await this.redisClient.del(`active_order:${orderId}`);

                    if (order.driver?.driverId) {
                        await this.redisClient.del(`driver:${order.driver.driverId}:currentOrder`);
                    }

                    await this.redisClient.del(`user:${order.clientId}:currentOrder`);
                } catch (redisErr) {
                    console.error("❗ Redis clear error:", redisErr);
                }
            }

            // SOCKET event
            if (this.io) {
                this.io.emit("availableDriversUpdate", order);
            }

            return response.success(res, "Zakaz bekor qilindi!", order);
        } catch (err) {
            console.error("Cancel Order Error:", err);
            return response.serverError(res, "Server xatosi!");
        }
    };
}

export = OrderController;
