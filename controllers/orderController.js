const Order = require("../models/Order");
const User = require("../models/clinetModel");
const Driver = require("../models/driverModel");
const { getDistanceFromGraphHopper } = require("../service/getDistanceFromGraphHopper");
const response = require("../utils/response");
const mongoose = require("mongoose");
require('dotenv').config();

// distance va ETA helpers
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function calculateETA(distance, speed = 40) {
    return Math.ceil((distance / speed) * 60);
}

class OrderController {
    constructor(redisClient, io) {
        this.redisClient = redisClient;
        this.io = io;
    }
    async getAvailableDrivers(req, res) {
        try {
            const { clId: clientId, orId: orderId } = req.params;

            if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
                return response.notFound(res, "clientId noto‘g‘ri yoki berilmagan");
            }

            const redisKey = `active_order:${orderId}`;
            let orderData = null;

            // 1️⃣ REDISDAN O‘QISH
            const redisData = await this.redisClient.get(redisKey);
            if (redisData) {
                orderData = JSON.parse(redisData);
            } else {
                // 2️⃣ MONGO DB'DAN O‘QISH
                const allowedStatuses = ["waiting", "driver_assigned", "on_the_car", "completed"];

                const order = await Order.findOne({
                    _id: orderId,
                    clientId: new mongoose.Types.ObjectId(clientId),
                    status: { $in: allowedStatuses }  // 🔥 faqat siz aytgan statuslar
                }).select("-__v");

                // 🔥 Order topilmasa — MAIN holatni qaytaramiz
                if (!order) {
                    const responseData = {
                        status: "main",
                        driver: {},
                        availableDrivers: []
                    };

                    this.io.emit("availableDriversUpdate", responseData);
                    return response.success(res, "Order topilmadi", responseData);
                }

                orderData = order.toObject();

                await this.redisClient.setEx(redisKey, 30, JSON.stringify(orderData));
            }
            console.log(orderData);

            // 3️⃣ DRIVER ASSIGNED BO‘LSA
            if (orderData?.status === "driver_assigned") {
                const driverId = orderData?.driver?.driverId;

                const driver = (driverId && mongoose.Types.ObjectId.isValid(driverId))
                    ? await Driver.findById(driverId).select("-__v")
                    : null;

                const driverInfo = driver ? {
                    _id: driver._id,
                    firstName: driver.firstName,
                    lastName: driver.lastName,
                    phoneNumber: driver.phoneNumber,
                    car: driver.car,
                    birthDate: driver.birthDate,
                    balance: driver.balance,
                    isActive: driver.isActive,
                } : null;

                const responseData = {
                    status: "driver",
                    driver: { ...orderData.driver, driverInfo },
                    availableDrivers: []
                };

                this.io.emit("availableDriversUpdate", responseData);
                return response.success(res, "Driver assigned", responseData);
            }

            // 4️⃣ DRIVER YO‘Q — availableDrivers qaytariladi
            const availableDrivers = await Promise.all(
                (orderData.availableDrivers || []).map(async d => {
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
                                isActive: driver.isActive,
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

            this.io.emit("availableDriversUpdate", responseData);
            return response.success(res, "Available drivers list", responseData);

        } catch (err) {
            console.error("getAvailableDrivers ERROR:", err);
            return response.serverError(res, "Server xatosi");
        }
    }


    async assignDriverByClient(req, res) {
        try {
            const { orderId, driverId, driverLocation, clientLocation } = req.body;
            console.log(orderId, driverId, driverLocation, clientLocation);


            if (!orderId || !driverId || !driverLocation || !clientLocation) {
                return response.error(res, "Missing required fields");
            }

            // 1️⃣ ORDER REDISDAN TEKSHIRILADI
            let activeOrder = await this.redisClient.get(`active_order:${orderId}`);
            if (activeOrder) {
                activeOrder = JSON.parse(activeOrder);
            } else {
                const orderFromDB = await Order.findById(orderId);
                if (!orderFromDB) return response.notFound(res, "Order not found from Redis and DB");
                activeOrder = orderFromDB.toObject();

                await this.redisClient.set(
                    `active_order:${orderId}`,
                    JSON.stringify(activeOrder),
                    "EX",
                    1800
                );
            }

            // 2️⃣ MASOFA VA ETA HISOBLASH (GraphHopper)
            const routeInfo = await getDistanceFromGraphHopper(driverLocation, clientLocation);
            if (!routeInfo) return response.error(res, "Cannot calculate route");

            const { distanceKm, durationMin } = routeInfo;

            // 3️⃣ DRIVER MA'LUMOTINI DB DAN OLISH
            const driver = await Driver.findById(driverId);
            if (!driver) return response.notFound(res, "Driver not found");

            // 4️⃣ AVAILABLE DRIVERS GA QO‘SHISH
            const newDriver = {
                driverId,
                modelName: driver.car ? `${driver.car.make} ${driver.car.modelName}` : "Unknown",
                plateNumber: driver.car?.plateNumber || "Unknown",
                color: driver.car?.color || "Unknown",
                phone: driver.phone,
                distance: distanceKm,
                eta: durationMin,
                timestamp: new Date(),
            };

            const order = await Order.findById(orderId);
            order.availableDrivers.push(newDriver);
            await order.save();

            const populatedOrder = await Order.findById(orderId)
                .populate({
                    path: 'availableDrivers.driverId',
                });

            // Redis yangilash
            await this.redisClient.set(
                `active_order:${orderId}`,
                JSON.stringify(order.toObject()),
                "EX",
                1800
            );

            this.io.emit("availableDriversUpdate", populatedOrder);

            return response.success(res, "Driver added", newDriver);

        } catch (err) {
            console.error("ADD DRIVER ERROR:", err);
            return response.serverError(res, "Server Error", err.message);
        }
    }

    // async assignDriverByClient(req, res) {
    //     try {
    //         const { orderId, driverId, driverLocation, clientLocation } = req.body;

    //         if (!orderId || !driverId || !driverLocation || !clientLocation) {
    //             return response.error(res, "Missing required fields");
    //         }

    //         // 1️⃣ ORDER REDISDAN TEKSHIRILADI
    //         let activeOrder = await this.redisClient.get(`active_order:${orderId}`);
    //         if (activeOrder) {
    //             activeOrder = JSON.parse(activeOrder);
    //         } else {
    //             // Redis’da topilmasa MongoDB’dan olish
    //             const orderFromDB = await Order.findById(orderId);
    //             if (!orderFromDB) return response.notFound(res, "Order not found from Redis and DB");

    //             activeOrder = orderFromDB.toObject();

    //             // Redis’ga saqlash (expire vaqti 30 daqiqa, ixtiyoriy)
    //             await this.redisClient.set(
    //                 `active_order:${orderId}`,
    //                 JSON.stringify(activeOrder),
    //                 "EX",
    //                 1800
    //             );
    //         }

    //         // 2️⃣ MASOFA VA ETA HISOBLASH (OSRM)
    //         const startLocation = driverLocation;
    //         const endLocation = clientLocation;
    //         const url = `${process.env.OSRM_URL}/route/v1/driving/${startLocation.longitude},${startLocation.latitude};${endLocation.longitude},${endLocation.latitude}?overview=false`;

    //         // const { data } = await axios.get(url);
    //         // if (!data?.routes?.length) {
    //         //     return response.error(res, "Cannot calculate route");
    //         // }

    //         const route = [];
    //         const distance = Number((route.distance / 1000).toFixed(1));  // km
    //         const eta = Math.round(route.duration / 60); // minutes

    //         // 3️⃣ DRIVER MA'LUMOTINI DB DAN OLISH
    //         const driver = await Driver.findById(driverId);
    //         if (!driver) return response.notFound(res, "Driver not found");

    //         // 5️⃣ AVAILABLE DRIVERS GA QO‘SHISH
    //         const newDriver = {
    //             driverId,
    //             modelName: driver.car ? `${driver.car.make} ${driver.car.modelName}` : "Unknown",
    //             plateNumber: driver.car?.plateNumber || "Unknown",
    //             color: driver.car?.color || "Unknown",
    //             phone: driver.phone,
    //             distance: 1,
    //             eta: 3,
    //             timestamp: new Date(),
    //         };

    //         // MongoDB order’ga qo‘shish
    //         const order = await Order.findById(orderId);
    //         order.availableDrivers.push(newDriver);
    //         await order.save();

    //         const populatedOrder = await Order.findById(orderId)
    //             .populate({
    //                 path: 'availableDrivers.driverId',
    //             });
    //         // Redis ham yangilash
    //         await this.redisClient.set(
    //             `active_order:${orderId}`,
    //             JSON.stringify(order.toObject()),
    //             "EX",
    //             1800
    //         );

    //         this.io.emit("availableDriversUpdate", populatedOrder);

    //         return response.success(res, "Driver added", newDriver);

    //     } catch (err) {
    //         console.error("ADD DRIVER ERROR:", err);
    //         return response.serverError(res, "Server Error", err.message);
    //     }
    // }

    async watchActiveOrder(req, res) {
        try {
            const { clientId } = req.params;
            if (!clientId) return response.warning(res, "ClientId is required");

            // Redis cache tekshirish
            const cachedOrder = await this.redisClient.get(`active_order:${clientId}`);

            if (JSON.parse(cachedOrder) && JSON.parse(cachedOrder) !== "null") {
                return response.success(res, {
                    message: "Active order fetched from cache",
                    activeOrder: JSON.parse(cachedOrder),
                    status: true
                });
            }

            // MongoDB fallback
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

            // Redis ga saqlash
            await this.redisClient.set(
                `active_order:${clientId}`,
                JSON.stringify(order),
                { EX: 60 * 5 }
            );

            return response.success(res, {
                message: "Active order fetched from database",
                activeOrder: order,
                status: true
            });

        } catch (err) {
            console.log(err);
            return response.serverError(res, err.message);
        }
    }

    // 🚕 DRAIVER TANLASH
    assignDriver = async (req, res) => {
        try {
            const { orderId, driverId } = req.body;

            if (!orderId || !driverId) {
                return response.error(res, "orderId va driverId majburiy!");
            }

            // 1️⃣ ORDERNI TOPAMIZ
            const order = await Order.findById(orderId);
            if (!order) return response.notFound(res, "Order topilmadi");

            // 2️⃣ availableDrivers ichidan tanlangan drayverni topish
            const selectedDriver = order.availableDrivers.find(
                (d) => String(d.driverId) === driverId
            );

            if (!selectedDriver) {
                return response.notFound(res, "Bu driver availableDrivers ichida yo‘q");
            }

            // 3️⃣ order.driver ga ko‘chiramiz
            order.driver = {
                driverId: selectedDriver.driverId,
                modelName: selectedDriver.modelName,
                carNumber: selectedDriver.carNumber,
                color: selectedDriver.color,
                phone: selectedDriver.phone,
                distance: selectedDriver.distance,
                eta: selectedDriver.eta,
            };

            // 4️⃣ Order statusini o‘zgartiramiz
            order.status = "driver_assigned";

            // 5️⃣ Timelinega yozamiz
            order.timeline.push({
                stage: "driver_assigned",
                driverId: selectedDriver.driverId,
            });

            // 6️⃣ Save qilamiz
            const savedOrder = await order.save();

            // 7️⃣ Redisga real-time uchun yozamiz
            await this.redisClient.set(
                `active_order:${orderId}`,
                JSON.stringify(savedOrder),
                { EX: 60 * 60 } // 1 soat
            );

            // 8️⃣ Socket orqali client va drayverga yuborish
            this.io.emit("availableDriversUpdate", savedOrder);

            return response.success(res, "Driver muvaffaqiyatli assign qilindi", savedOrder);

        } catch (err) {
            console.log(err);
            return response.serverError(res, "Server xatosi", err.message);
        }
    };

    // CREATE order
    async create(req, res) {
        try {
            const { when } = req.body;
            // Boshlang‘ich status va timeline
            let initialStatus = "created";
            let timeline = [{ stage: "created", timestamp: new Date() }];

            if (when === "waiting") {
                initialStatus = "waiting";
                timeline = [{ stage: "waiting", timestamp: new Date() }];
            }

            const order = new Order({
                ...req.body,
                status: initialStatus,
                availableDrivers: [],
                timeline,
            });

            await order.save();

            // Redis-ga saqlash (1 soatga)
            if (order._id) {
                await this.redisClient.set(
                    `active_order:${order._id}`,
                    JSON.stringify(order),
                    "EX",
                    60 * 60 // 1 soat
                );
            }

            // Socket.io orqali xabar yuborish
            this.io.emit("new_order", order);

            return response.created(res, "Order created", order);
        } catch (err) {
            console.error("Create order error:", err);
            return response.error(res, err.message);
        }
    }

    // GET all orders
    async getAll(req, res) {
        try {
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
            return response.error(res, err.message);
        }
    }

    // Update the meter for an order
    async updateMeter(req, res) {
        try {
            const { orderId, latitude, longitude } = req.body;

            const order = await Order.findById(orderId);
            if (!order) return response.notFound(res, "Order not found");

            if (!order.meter?.started)
                return response.warning(res, "Meter not started");

            // Masofa
            const dist = calculateDistance(
                order.meter.lastLocation.latitude,
                order.meter.lastLocation.longitude,
                latitude,
                longitude
            );

            if (dist > 0 && dist < 2) order.meter.totalDistance += dist;

            // Vaqt
            const now = new Date();
            const last = new Date(order.updatedAt);
            const diffMin = (now - last) / 1000 / 60;

            if (diffMin > 0 && diffMin <= 1)
                order.meter.totalMinutes += diffMin;

            order.meter.lastLocation = { latitude, longitude };

            await order.save();

            return response.success(res, "Meter updated", order.meter);
        } catch (err) {
            return response.error(res, err.message);
        }
    }


    // Start the meter for an order
    async startMeter(req, res) {
        try {
            const { orderId, latitude, longitude } = req.body;

            const order = await Order.findById(orderId);
            if (!order) return response.notFound(res, "Order not found");

            if (order.meter?.started)
                return response.warning(res, "Meter already started");

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
            return response.error(res, err.message);
        }
    }

    // GET by ID
    async getById(req, res) {
        try {
            const { id } = req.params;

            const cachedOrder = await this.redisClient.get(`order:${id}`);
            if (cachedOrder) return response.success(res, "Order fetched (cache)", JSON.parse(cachedOrder));

            const order = await Order.findById(id)
                .populate("clientId", "name phone")
                .populate("availableDrivers.driverId", "model carNumber color phone")
                .populate("driver.driverId", "model carNumber color phone");

            if (!order) return response.notFound(res, "Order not found");

            await this.redisClient.set(`order:${id}`, JSON.stringify(order), { EX: 60 * 5 });
            return response.success(res, "Order fetched", order);
        } catch (err) {
            return response.error(res, err.message);
        }
    }

    // UPDATE order (traveled distance va payment)
    async update(req, res) {
        try {
            const { id } = req.params;
            const order = await Order.findById(id);
            if (!order) return response.notFound(res, "Order not found");

            // Agar driver manzilga yetib kelgan bo'lsa
            if (req.body.endLatitude && req.body.endLongitude) {
                const distance = calculateDistance(
                    order.location.latitude,
                    order.location.longitude,
                    req.body.endLatitude,
                    req.body.endLongitude
                );
                const fare = distance * 2; // km * narx
                const cashback = fare * 0.05;

                order.traveledDistance = distance;
                order.amountPaid = fare;
                order.cashbackPaid = cashback;
                order.status = "completed";
                order.timeline.push({ stage: "completed", driverId: order.driver?.driverId || null });

                // Socket: clientga realtime update yuborish
                this.io.to(order.clientId.toString()).emit("order_completed", {
                    orderId: order._id,
                    distance,
                    fare,
                    cashback
                });
            }

            // Boshqa update fields
            Object.keys(req.body).forEach((key) => {
                if (!["endLatitude", "endLongitude"].includes(key)) {
                    order[key] = req.body[key];
                }
            });

            await order.save();
            await this.redisClient.set(`order:${id}`, JSON.stringify(order), { EX: 60 * 5 });

            return response.success(res, "Order updated", order);
        } catch (err) {
            return response.error(res, err.message);
        }
    }

    // COMPLETE ORDER (KM + MINUT asosida hisob-kitob)
    async completeOrder(req, res) {
        try {
            const { orderId, endLatitude, endLongitude } = req.body;

            const order = await Order.findById(orderId);
            if (!order) return response.notFound(res, "Order topilmadi");

            if (order.status !== "on_the_car" && order.status !== "on_the_way") {
                return response.warning(res, "Buyurtma hozir yakunlanadigan holatda emas");
            }

            // Agar schyotchik ishlatilgan bo'lsa — shu hisob asos!!!
            let totalDistance = order?.meter?.totalDistance || 0;  // KM
            let totalMinutes = order?.meter?.totalMinutes || 0;    // MIN

            /** 
             * ------------------------------------------------------
             *  Agar schyotchik YOQILMAGAN bo'lsa → avtomatik masofa hisoblash
             * ------------------------------------------------------
             */
            if (!order?.meter?.started && endLatitude && endLongitude) {

                const dist = calculateDistance(
                    order.location.latitude,
                    order.location.longitude,
                    endLatitude,
                    endLongitude
                );

                totalDistance = dist;
                // vaqtni avtomatik baholash: 1 km ≈ 2 daqiqa
                totalMinutes = dist * 2;
            }

            /** 
             * -----------------------------
             * Yakuniy narx hisoblash
             * -----------------------------
             */
            const PRICE_PER_KM = process.env.PRICE_PER_KM || 3000;
            const PRICE_PER_MINUTE = process.env.PRICE_PER_MINUTE || 200;
            const CLIENT_CASHBACK = process.env.CLIENT_CASHBACK || 0.05; // 5%

            const kmPrice = totalDistance * PRICE_PER_KM;
            const minutePrice = totalMinutes * PRICE_PER_MINUTE;

            const totalFare = Math.round(kmPrice + minutePrice);
            const cashback = Math.round(totalFare * CLIENT_CASHBACK);

            /** 
             * -----------------------------
             * Orderni yakunlash
             * -----------------------------
             */
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


            /** 
             * -----------------------------
             * Socket: Clientga real-time yuborish
             * -----------------------------
             */
            this.io.to(order.clientId.toString()).emit("order_completed", {
                orderId: order._id,
                distance: totalDistance,
                minutes: totalMinutes,
                fare: totalFare,
                cashback
            });

            return response.success(res, "Buyurtma yakunlandi", {
                distance: totalDistance,
                minutes: totalMinutes,
                fare: totalFare,
                cashback
            });

        } catch (err) {
            console.log(err);
            return response.serverError(res, "Server xatosi", err);
        }
    }


    // DELETE order
    async delete(req, res) {
        try {
            const { id } = req.params;
            const order = await Order.findByIdAndDelete(id);
            if (!order) return response.notFound(res, "Order not found");

            await this.redisClient.del(`order:${id}`);
            return response.success(res, "Order deleted", order);
        } catch (err) {
            return response.error(res, err.message);
        }
    }

    // CANCEL order
    async cancelOrder(req, res) {
        try {
            const { orderId } = req.params;
            const { cancelledBy, cancelReason } = req.body;

            if (!["client", "driver", "admin"].includes(cancelledBy)) {
                return response.notFound(res, "cancelledBy noto‘g‘ri!");
            }

            const order = await Order.findById(orderId);
            if (!order) return response.notFound(res, "Zakaz topilmadi!");

            if (["completed", "cancelled"].includes(order.status)) {
                return response.notFound(res, "Bu zakazni bekor qilib bo‘lmaydi!");
            }

            // 🟢 AGAR CLIENT BEKOR QILGAN BO'LSA → CASHBACK -2000
            if (cancelledBy === "client") {
                const user = await User.findById(order.clientId);
                if (user) {
                    const minusSum = 2000;
                    user.cashback = Math.max(0, (user.cashback || 0) - minusSum);
                    await user.save();
                }
            }

            // 🔴 Zakazni bekor qilish
            order.status = "cancelled";
            order.cancelledBy = cancelledBy;
            order.cancelReason = cancelReason || "Izoh berilmagan";

            order.timeline.push({
                stage: "cancelled",
                driverId: order?.driver?.driverId || null,
            });

            await order.save();

            // =============================
            //    REDIS — CACHE TOZALASH
            // =============================

            if (this.redisClient) {
                try {
                    // 1️⃣ Order cache
                    await this.redisClient.del(`order:${orderId}`);

                    // 2️⃣ Available Drivers cache
                    await this.redisClient.del(`active_order:${orderId}`);

                    // 3️⃣ Driver aktiv zakazi
                    if (order.driver?.driverId) {
                        await this.redisClient.del(`driver:${order.driver.driverId}:currentOrder`);
                    }

                    // 4️⃣ Client aktiv zakazi
                    await this.redisClient.del(`user:${order.clientId}:currentOrder`);
                } catch (redisErr) {
                    console.error("❗ Redis clear error:", redisErr);
                }
            }

            // SOCKET event
            if (this.io) {
                this.io.emit("availableDriversUpdate", order);
                if (order.driver?.driverId) {
                    this.io
                        .emit("availableDriversUpdate", order);
                }
            }

            return response.success(res, "Zakaz bekor qilindi!", order);

        } catch (err) {
            console.error("Cancel Order Error:", err);
            return response.serverError(res, "Server xatosi!");
        }
    }

}

module.exports = OrderController;