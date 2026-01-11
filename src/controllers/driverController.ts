import type { Request, Response } from "express";
import type { RedisClientType } from "redis";
import type { Server as SocketIOServer } from "socket.io";
import type mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

// driverModel hozir JS bo‘lgani uchun vaqtincha typed require
const { Driver } = require("../models/driverModel") as { Driver: mongoose.Model<any> };

// response helper typing (utils/response.js dagi metodlar bo'yicha)
const response = require("../utils/response") as {
    error: (res: Response, message: string, data?: unknown) => unknown;
    created: (res: Response, message: string, data?: unknown) => unknown;
    success: (res: Response, message: string, data?: unknown) => unknown;
    notFound: (res: Response, message: string) => unknown;
    serverError: (res: Response, message: string) => unknown;
};

type IdParams = { id: string };
type LoginBody = { login: string; password: string };

const errMsg = (err: unknown): string =>
    err instanceof Error ? err.message : String(err);

class DriverController {
    private redisClient: RedisClientType | null;
    private io: SocketIOServer | null;

    constructor(redisClient: RedisClientType | null, io: SocketIOServer | null) {
        this.redisClient = redisClient;
        this.io = io;
    }

    // CREATE DRIVER
    create = async (req: Request, res: Response) => {
        try {
            const driver = new Driver(req.body);
            await driver.save();

            if (this.redisClient) {
                await this.redisClient.set(`driver:${driver._id}`, JSON.stringify(driver));
            }

            if (this.io) {
                this.io.emit("driverCreated", driver);
            }

            return response.created(res, "Driver created successfully", driver);
        } catch (err) {
            return response.serverError(res, errMsg(err));
        }
    };

    // LOGIN DRIVER
    login = async (req: Request<{}, unknown, LoginBody>, res: Response) => {
        try {
            const { login, password } = req.body;

            if (!login || !password) {
                return response.error(res, "Login yoki parol kiritilmadi");
            }

            // Population bilan driverni topamiz
            const driver = await Driver.findOne({ login, password })
                .populate({
                    path: "car.carType",
                    select: "label value level price isActive"
                })
                .populate({
                    path: "additionalServices",
                    select: "value price"
                });

            if (!driver) {
                return response.notFound(res, "Driver not found");
            }

            // JWT token yaratamiz
            const secret = process.env.JWT_SECRET ?? "secret"; // hozirgi behavior'ni saqlab qoldim
            const token = jwt.sign(
                { id: driver._id, login: driver.login },
                secret,
                { expiresIn: "1d" }
            );

            return response.success(res, "Login successful", { driver, token });
        } catch (err) {
            return response.serverError(res, errMsg(err));
        }
    };

    // READ ALL DRIVERS
    getAll = async (req: Request, res: Response) => {
        try {
            const drivers = await Driver.find()
                .populate({
                    path: "additionalServices",
                    model: "AdditionalService"
                })
                .populate({
                    path: "car.carType",
                    model: "CarType"
                });

            return response.success(res, "Drivers fetched successfully", drivers);
        } catch (err) {
            return response.serverError(res, errMsg(err));
        }
    };

    // READ SINGLE DRIVER
    getById = async (req: Request<IdParams>, res: Response) => {
        try {
            const driver = await Driver.findById(req.params.id);
            if (!driver) return response.notFound(res, "Driver not found");

            return response.success(res, "Driver fetched successfully", driver);
        } catch (err) {
            return response.serverError(res, errMsg(err));
        }
    };

    // UPDATE DRIVER
    update = async (req: Request<IdParams>, res: Response) => {
        try {
            const updatedDriver = await Driver.findByIdAndUpdate(
                req.params.id,
                req.body,
                { new: true, runValidators: true }
            );

            if (!updatedDriver) {
                return response.notFound(res, "Driver not found");
            }

            const driver = await Driver.findById(updatedDriver._id)
                .populate({
                    path: "additionalServices",
                    model: "AdditionalService"
                })
                .populate({
                    path: "car.carType",
                    model: "CarType"
                });

            if (!driver) {
                return response.notFound(res, "Driver not found");
            }

            if (this.redisClient) {
                await this.redisClient.set(`driver:${driver._id}`, JSON.stringify(driver));
            }

            if (this.io) {
                this.io.emit("driverUpdated", driver);
            }

            return response.success(res, "Driver updated successfully", driver);
        } catch (err) {
            return response.serverError(res, errMsg(err));
        }
    };

    // DELETE DRIVER
    delete = async (req: Request<IdParams>, res: Response) => {
        try {
            const driver = await Driver.findByIdAndDelete(req.params.id);
            if (!driver) return response.notFound(res, "Driver not found");

            if (this.redisClient) {
                await this.redisClient.del(`driver:${req.params.id}`);
            }

            if (this.io) {
                this.io.emit("driverDeleted", { id: req.params.id });
            }

            return response.success(res, "Driver deleted successfully", { id: req.params.id });
        } catch (err) {
            return response.serverError(res, errMsg(err));
        }
    };
}

// CommonJS require(...) bilan mos ishlashi uchun:
export = DriverController;
