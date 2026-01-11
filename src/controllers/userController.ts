import type { Request, Response } from "express";
import type { RedisClientType } from "redis";
import type { Server as SocketIOServer } from "socket.io";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

// JS modelni vaqtincha typed qilib olamiz (keyin modelni ham TS qilamiz)
const User = require("../models/clinetModel") as mongoose.Model<any>;

// response helper typing (utils/response.js dagi metodlar bo'yicha)
const response = require("../utils/response") as {
    error: (res: Response, message: string, data?: unknown) => unknown;
    created: (res: Response, message: string, data?: unknown) => unknown;
    success: (res: Response, message: string, data?: unknown) => unknown;
    notFound: (res: Response, message: string) => unknown;
    serverError: (res: Response, message: string) => unknown;
};

type PhoneParams = { phone: string };

type CreateUserBody = {
    phone: string;
    name?: string;
    surname?: string;
    age?: number;
    address?: string;
};

type LoginWithPinBody = {
    phone: string;
    pin: string;
};

const errMsg = (err: unknown): string =>
    err instanceof Error ? err.message : String(err);

class UserController {
    private redisClient: RedisClientType | null;
    private io: SocketIOServer | null;

    constructor(redisClient: RedisClientType | null, io: SocketIOServer | null) {
        this.redisClient = redisClient;
        this.io = io;
    }

    // CREATE user
    createUser = async (
        req: Request<{}, unknown, CreateUserBody>,
        res: Response
    ) => {
        try {
            const { phone, name, surname, age, address } = req.body;

            if (!phone) return response.error(res, "Telefon raqami kiritilmadi");

            const exists = await User.findOne({ phone });
            if (exists) return response.error(res, "Foydalanuvchi mavjud");

            const user = new User({ phone, name, surname, age, address });
            await user.save();

            // Redis cache
            if (this.redisClient) {
                await this.redisClient.set(`user:${phone}`, JSON.stringify(user));
                await this.redisClient.del("users:all");
            }

            // SOCKET.IO
            if (this.io) this.io.emit("user:created", user);

            return response.created(res, "Foydalanuvchi yaratildi", user);
        } catch (err) {
            return response.serverError(res, errMsg(err));
        }
    };

    // PIN orqali token olish
    loginWithPin = async (
        req: Request<{}, unknown, LoginWithPinBody>,
        res: Response
    ) => {
        try {
            const { phone, pin } = req.body;

            if (!phone || !pin) {
                return response.error(res, "Telefon yoki PIN kiritilmadi");
            }

            const user = await User.findOne({ phone });

            if (!user) {
                return response.notFound(res, "Foydalanuvchi topilmadi");
            }

            const secret = process.env.JWT_SECRET;
            if (!secret) {
                return response.serverError(res, "JWT_SECRET env topilmadi");
            }

            // Agar foydalanuvchi hali PIN o‘rnatmagan bo‘lsa → yangi PIN yoziladi
            if (!user.pin) {
                user.pin = pin;
                await user.save();

                const token = jwt.sign(
                    { id: user._id, phone: user.phone },
                    secret,
                    { expiresIn: "1d" }
                );

                return response.success(res, "PIN yaratildi va login qilindi", {
                    token,
                    user
                });
            }

            // PIN to‘g‘ri bo‘lsa → token yaratiladi
            if (String(user.pin) === String(pin)) {
                const token = jwt.sign(
                    { id: user._id, phone: user.phone },
                    secret,
                    { expiresIn: "1d" }
                );

                return response.success(res, "Muvaffaqiyatli kirildi", {
                    token,
                    user
                });
            }

            // PIN noto‘g‘ri
            return response.error(res, "PIN noto‘g‘ri");
        } catch (err) {
            return response.serverError(res, errMsg(err));
        }
    };

    // GET all users
    getAllUsers = async (req: Request, res: Response) => {
        try {
            if (this.redisClient) {
                const cached = await this.redisClient.get("users:all");
                if (cached) return response.success(res, "OK", JSON.parse(cached));
            }

            const users = await User.find();

            if (this.redisClient) {
                await this.redisClient.set("users:all", JSON.stringify(users));
            }

            return response.success(res, "OK", users);
        } catch (err) {
            return response.serverError(res, errMsg(err));
        }
    };

    // GET user by phone
    getUserByPhone = async (req: Request<PhoneParams>, res: Response) => {
        try {
            const { phone } = req.params;

            if (!phone) {
                return response.error(res, "Phone number is required");
            }

            // Redis cache tekshirish
            if (this.redisClient) {
                const cached = await this.redisClient.get(`user:${phone}`);
                if (cached) return response.success(res, "OK", JSON.parse(cached));
            }

            // MongoDB dan olish
            const user = await User.findOne({ phone }).lean();
            if (!user) return response.notFound(res, "Foydalanuvchi topilmadi");

            // Redis ga saqlash
            if (this.redisClient) {
                await this.redisClient.set(`user:${phone}`, JSON.stringify(user));
            }

            return response.success(res, "OK", user);
        } catch (err) {
            console.error("getUserByPhone error:", err);
            return response.serverError(res, errMsg(err) || "Internal server error");
        }
    };

    // UPDATE user
    updateUser = async (req: Request<PhoneParams>, res: Response) => {
        try {
            const { phone } = req.params;

            if (!phone) return response.error(res, "Telefon raqami topilmadi");

            const user = await User.findOneAndUpdate({ phone }, req.body, { new: true });
            if (!user) return response.notFound(res, "Foydalanuvchi topilmadi");

            if (this.redisClient) {
                await this.redisClient.set(`user:${phone}`, JSON.stringify(user));
                await this.redisClient.del("users:all");
            }

            // SOCKET.IO
            if (this.io) this.io.emit("user:updated", user);

            return response.success(res, "Yangilandi", user);
        } catch (err) {
            return response.serverError(res, errMsg(err));
        }
    };

    // DELETE user
    deleteUser = async (req: Request<PhoneParams>, res: Response) => {
        try {
            const { phone } = req.params;

            if (!phone) return response.error(res, "Telefon raqami topilmadi");

            const user = await User.findOneAndDelete({ phone });
            if (!user) return response.notFound(res, "Foydalanuvchi topilmadi");

            if (this.redisClient) {
                await this.redisClient.del(`user:${phone}`);
                await this.redisClient.del("users:all");
            }

            // SOCKET.IO
            if (this.io) this.io.emit("user:deleted", { phone });

            return response.success(res, "O‘chirildi");
        } catch (err) {
            return response.serverError(res, errMsg(err));
        }
    };
}

export = UserController;
