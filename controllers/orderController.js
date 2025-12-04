const Order = require("../models/Order");
const response = require("../utils/response");

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

    // CREATE order
    async create(req, res) {
        try {
            const order = new Order({
                ...req.body,
                status: "created",
                availableDrivers: [],
                timeline: [{ stage: "created", timestamp: new Date() }]
            });

            await order.save();
            this.io.emit("new_order", order);

            return response.created(res, "Order created", order);
        } catch (err) {
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
                .populate("driver.driverId", "name phone vehicle");

            await this.redisClient.set("orders:all", JSON.stringify(orders), { EX: 60 * 5 });
            return response.success(res, "Orders fetched", orders);
        } catch (err) {
            return response.error(res, err.message);
        }
    }

    // Driver selects an order
    async selectDriver(req, res) {
        try {
            const { orderId, driverId, name, phone, vehicle, latitude, longitude } = req.body;

            const order = await Order.findById(orderId);
            if (!order) return response.notFound(res, "Order not found");

            if (!["created", "waiting"].includes(order.status))
                return response.warning(res, "Order cannot be selected");

            // Driver mavjudmi?
            if (order.availableDrivers.some(d => d.driverId.toString() === driverId))
                return response.warning(res, "Driver already selected");

            const distance = calculateDistance(
                latitude, longitude,
                order.location.latitude, order.location.longitude
            );

            const eta = calculateETA(distance);

            const driverInfo = { driverId, name, phone, vehicle, distance, eta };

            order.availableDrivers.push(driverInfo);
            await order.save();

            this.io.emit("order_driver_updated", {
                orderId,
                availableDrivers: order.availableDrivers
            });

            return response.success(res, "Driver selected", driverInfo);
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


    // Client assigns a driver from availableDrivers
    async assignDriverByClient(req, res) {
        try {
            const { orderId, driverId } = req.body;

            const order = await Order.findById(orderId);
            if (!order) return response.notFound(res, "Order not found");

            const selected = order.availableDrivers.find(d => d.driverId.toString() === driverId);
            if (!selected) return response.warning(res, "Driver not found");

            order.driver = selected;
            order.status = "driver_assigned";

            order.timeline.push({
                stage: "driver_assigned",
                driverId,
                timestamp: new Date()
            });

            await order.save();

            this.io.emit("order_driver_assigned", {
                orderId,
                driver: order.driver,
                status: order.status
            });

            return response.success(res, "Driver assigned", order.driver);
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
                .populate("availableDrivers.driverId", "name phone vehicle")
                .populate("driver.driverId", "name phone vehicle");

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

    // CANCEL order
    async cancel(req, res) {
        try {
            const { id } = req.params;
            const { cancelledBy, reason } = req.body;

            const order = await Order.findById(id);
            if (!order) return response.notFound(res, "Order not found");

            if (["created", "waiting", "driver_assigned"].includes(order.status)) {
                order.status = "cancelled";
                order.cancelledBy = cancelledBy || "client";
                order.cancelReason = reason || "Order cancelled";
                order.timeline.push({ stage: "cancelled", driverId: order.driver?.driverId || null });

                await order.save();
                await this.redisClient.set(`order:${id}`, JSON.stringify(order), { EX: 60 * 5 });

                // Socket: driver va clientga notify
                this.io.emit("order_cancelled", order);

                return response.success(res, "Order cancelled", order);
            } else {
                return response.warning(res, "Order cannot be cancelled at this stage");
            }
        } catch (err) {
            return response.error(res, err.message);
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
}

module.exports = OrderController;
