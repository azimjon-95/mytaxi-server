import type { Request, Response } from "express";
import type { RedisClientType } from "redis";
import type { Server as SocketIOServer } from "socket.io";
import type mongoose from "mongoose";

// response helper (signature'lar loyihada turlicha ishlatilgan, shuning uchun any)
const response: any = require("../utils/response");

// JS model'lar (keyin TS qilamiz)
const { CarType, AdditionalService } = require("../models/driverModel") as {
    CarType: mongoose.Model<any>;
    AdditionalService: mongoose.Model<any>;
};

// img upload util typing
const uploadToImgBB = require("../utils/uploadToImgBB") as (buffer: Buffer) => Promise<string>;

type IdParams = { id: string };

// Multer file bilan request typing (Express.Multer.File uchun @types/multer kerak bo‘lishi mumkin)
type MulterRequest = Request & { file?: Express.Multer.File };

const errMsg = (err: unknown): string =>
    err instanceof Error ? err.message : String(err);

class ConfigController {
    private redisClient: RedisClientType | null;
    private io: SocketIOServer | null;

    constructor(redisClient: RedisClientType | null, io: SocketIOServer | null) {
        this.redisClient = redisClient;
        this.io = io;
    }

    /* =======================
      🚗 CAR TYPE
    ======================== */

    // ➕ CREATE
    createCarType = async (req: MulterRequest, res: Response) => {
        try {
            const { label, value, level, price } = req.body as Record<string, unknown>;

            if (!req.file) {
                return response.error(res, "Image required");
            }

            // 🔥 imgBB upload
            const imageUrl = await uploadToImgBB(req.file.buffer);

            const carType = await CarType.create({
                label,
                value,
                level,
                price,
                image: imageUrl
            });

            if (this.redisClient) await this.redisClient.del("carTypes");
            if (this.io) this.io.emit("carType:created", carType);

            return response.success(res, "Car type created", carType);
        } catch (error) {
            return response.serverError(res, errMsg(error));
        }
    };

    // 📥 GET ALL (CACHE)
    getCarTypes = async (req: Request, res: Response) => {
        try {
            if (this.redisClient) {
                const cached = await this.redisClient.get("carTypes");
                if (cached) {
                    return response.success(res, JSON.parse(cached), "Car types (cache)");
                }
            }

            const carTypes = await CarType.find().sort({ level: 1 });

            if (this.redisClient) {
                await this.redisClient.set("carTypes", JSON.stringify(carTypes), {
                    EX: 3600
                });
            }

            return response.success(res, "Car types fetched", carTypes);
        } catch (error) {
            return response.serverError(res, errMsg(error));
        }
    };

    // ✏️ UPDATE
    updateCarType = async (req: Request<IdParams>, res: Response) => {
        try {
            const { id } = req.params;

            const updated = await CarType.findByIdAndUpdate(id, req.body, { new: true });

            if (!updated) return response.notFound(res, "Car type not found", 404);

            if (this.redisClient) await this.redisClient.del("carTypes");
            if (this.io) this.io.emit("carType:updated", updated);

            return response.success(res, updated, "Updated");
        } catch (error) {
            return response.serverError(res, errMsg(error));
        }
    };

    // ❌ DELETE
    deleteCarType = async (req: Request<IdParams>, res: Response) => {
        try {
            const { id } = req.params;

            await CarType.findByIdAndDelete(id);

            if (this.redisClient) await this.redisClient.del("carTypes");
            if (this.io) this.io.emit("carType:deleted", id);

            return response.success(res, null, "Deleted");
        } catch (error) {
            return response.serverError(res, errMsg(error));
        }
    };

    /* =========================
        🔥 ADDITIONAL SERVICES
    ========================== */

    // ➕ CREATE
    createService = async (req: Request, res: Response) => {
        try {
            const service = await AdditionalService.create(req.body);

            if (this.redisClient) await this.redisClient.del("additionalServices");
            if (this.io) this.io.emit("service:created", service);

            return response.success(res, service, "Service created");
        } catch (error) {
            return response.serverError(res, errMsg(error));
        }
    };

    // 📥 GET ALL (CACHE)
    getServices = async (req: Request, res: Response) => {
        try {
            if (this.redisClient) {
                const cached = await this.redisClient.get("additionalServices");
                if (cached) {
                    return response.success(res, JSON.parse(cached), "Services (cache)");
                }
            }

            const services = await AdditionalService.find();

            if (this.redisClient) {
                await this.redisClient.set("additionalServices", JSON.stringify(services), {
                    EX: 3600
                });
            }

            return response.success(res, services);
        } catch (error) {
            return response.serverError(res, errMsg(error));
        }
    };

    // ✏️ UPDATE
    updateService = async (req: Request<IdParams>, res: Response) => {
        try {
            const { id } = req.params;

            const updated = await AdditionalService.findByIdAndUpdate(id, req.body, { new: true });

            if (!updated) return response.notFound(res, "Service not found", 404);

            if (this.redisClient) await this.redisClient.del("additionalServices");
            if (this.io) this.io.emit("service:updated", updated);

            return response.success(res, updated, "Updated");
        } catch (error) {
            return response.serverError(res, errMsg(error));
        }
    };

    // ❌ DELETE
    deleteService = async (req: Request<IdParams>, res: Response) => {
        try {
            const { id } = req.params;

            await AdditionalService.findByIdAndDelete(id);

            if (this.redisClient) await this.redisClient.del("additionalServices");
            if (this.io) this.io.emit("service:deleted", id);

            return response.success(res, null, "Deleted");
        } catch (error) {
            return response.serverError(res, errMsg(error));
        }
    };
}

// CommonJS require(...) bilan mos ishlashi uchun:
export = ConfigController;
