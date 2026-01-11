import type { Request, Response } from "express";
import type { RedisClientType } from "redis";
import type { Server as SocketIOServer } from "socket.io";
import type { Model } from "mongoose";
import mongoose from "mongoose";

import response from "../utils/response";
import DriverLocationService from "../service/driverLocationService";
import { getDistanceFromGraphHopper } from "../service/getDistanceFromGraphHopper";

const Order = require("../models/Order") as Model<any>;
const { Driver, AdditionalService } = require("../models/driverModel") as {
    Driver: Model<any>;
    AdditionalService: Model<any>;
};

const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export default class MainOrderController {
    private redisClient: RedisClientType;
    private io: SocketIOServer;
    private driverLocationService: DriverLocationService;

    constructor(redisClient: RedisClientType, io: SocketIOServer) {
        this.redisClient = redisClient;
        this.io = io;
        this.driverLocationService = new DriverLocationService(redisClient);
    }

    // 🚀 Drayver bo'yicha orderlarni olish
    getOrderByDriverId = async (req: Request, res: Response) => {
        try {
            const driverId = String((req.params as any)?.driverId ?? "");

            if (!mongoose.Types.ObjectId.isValid(driverId)) {
                return response.notFound(res, "Invalid driverId");
            }

            const allDriverLocations = await this.driverLocationService.getDriverLocationById(driverId);
            if (!allDriverLocations) {
                return response.notFound(res, "Driver location not found");
            }

            const driver = await Driver.findById(driverId).select("isActive");
            if (!driver || !driver.isActive) {
                const inactivePayload = { isActive: false, message: "Siz active emassiz", orders: [] };
                this.io.emit("new_order", inactivePayload);
                return response.success(res, "Driver inactive", inactivePayload);
            }

            const cacheKey = "active_order";
            const cachedOrders = await this.redisClient.get(cacheKey);

            if (cachedOrders) {
                const orders = JSON.parse(cachedOrders) as any[] | null;

                if (!orders) {
                    return response.success(res, "No active orders", {
                        isActive: true,
                        orders: [],
                        driverLocation: allDriverLocations,
                    });
                }

                const services = await AdditionalService.find().lean();
                const serviceMap = new Map<string, any>(services.map((s: any) => [String(s._id), s]));

                const preparedOrders = await Promise.all(
                    orders.map(async (order: any) => {
                        const routeInfo = await getDistanceFromGraphHopper(allDriverLocations, order.location);

                        let populatedService: any = null;
                        if (order.service?.serviceId) {
                            populatedService = serviceMap.get(String(order.service.serviceId)) || null;
                        }

                        return {
                            ...order,
                            service: order.service
                                ? { ...order.service, serviceId: populatedService }
                                : null,
                            distance: routeInfo ? Math.floor(Number(routeInfo.distanceKm ?? 0)) : null,
                        };
                    })
                );

                const payload = { isActive: true, orders: preparedOrders, driverLocation: allDriverLocations };

                this.io.emit("new_order", payload);
                return response.success(res, "Orders fetched (cache)", payload);
            }

            const orders = await Order.find({
                status: { $in: ["created", "waiting", "driver_assigned"] },
            })
                .populate("clientId")
                .populate({ path: "service.serviceId", model: "Service" })
                .sort({ createdAt: -1 })
                .lean();

            const ordersWithDistance = await Promise.all(
                (orders as any[]).map(async (order: any) => {
                    const routeInfo = await getDistanceFromGraphHopper(allDriverLocations, order.location);
                    return {
                        ...order,
                        distance: routeInfo ? Math.floor(Number(routeInfo.distanceKm ?? 0)) : null,
                    };
                })
            );

            await this.redisClient.set("active_order", JSON.stringify(ordersWithDistance), { EX: 30 });

            const payload = { isActive: true, orders: ordersWithDistance, driverLocation: allDriverLocations };
            this.io.emit("new_order", payload);

            return response.success(res, "Orders fetched", payload);
        } catch (error) {
            return response.serverError(res, errMsg(error));
        }
    };

    // DRIVER ISACTIVE TOGGLE
    toggleActive = async (req: Request, res: Response) => {
        try {
            const driverId = String((req.params as any)?.driverId ?? "");
            const { isActive } = req.body as { isActive?: boolean };

            if (!mongoose.Types.ObjectId.isValid(driverId)) {
                return response.notFound(res, "Invalid driver ID");
            }

            if (typeof isActive !== "boolean") {
                return response.error(res, "isActive must be boolean");
            }

            const updatedDriver = await Driver.findByIdAndUpdate(driverId, { isActive }, { new: true });
            if (!updatedDriver) return response.notFound(res, "Driver not found");

            await this.redisClient.set(`driver:${driverId}:isActive`, String(isActive), { EX: 3600 });
            this.io.emit("driverStatusChanged", { driverId, isActive });

            return response.success(res, "Driver status updated", updatedDriver);
        } catch (error) {
            return response.serverError(res, errMsg(error));
        }
    };

    // Driver location-ni Redis-ga saqlash
    setLocationRedis = async (req: Request, res: Response) => {
        try {
            const { driverId, latitude, longitude } = req.body as {
                driverId?: string;
                latitude?: number;
                longitude?: number;
            };

            if (!driverId || latitude == null || longitude == null) {
                return response.error(res, "DriverId, latitude and longitude required");
            }

            await this.redisClient.set(
                `driver:${driverId}:location`,
                JSON.stringify({ latitude, longitude }),
                { EX: 14400 }
            );

            this.io.emit("driverLocationUpdated", { driverId, latitude, longitude });

            return response.success(res, "Driver location updated in Redis", { driverId, latitude, longitude });
        } catch (error) {
            return response.serverError(res, errMsg(error));
        }
    };

    getLocationRedis = async (req: Request, res: Response) => {
        try {
            const driverId = String((req.params as any)?.driverId ?? "");
            if (!driverId) return response.error(res, "DriverId required");

            const location = await this.redisClient.get(`driver:${driverId}:location`);
            if (!location) return response.notFound(res, "Driver location not found");

            const { latitude, longitude } = JSON.parse(location);

            this.io.emit("driverLocationUpdated", { driverId, latitude, longitude });

            return response.success(res, "Driver location fetched from Redis", { driverId, latitude, longitude });
        } catch (error) {
            return response.serverError(res, errMsg(error));
        }
    };
}
