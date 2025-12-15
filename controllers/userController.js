const User = require("../models/clinetModel");
const response = require("../utils/response");
require('dotenv').config();
const jwt = require('jsonwebtoken');

class UserController {
    constructor(redisClient, io) {
        this.redisClient = redisClient;
        this.io = io; // SOCKET.IO
    }

    // CREATE user
    createUser = async (req, res) => {
        try {
            const { phone, name, surname, age, address } = req.body;

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
            console.log(user);

            return response.created(res, "Foydalanuvchi yaratildi", user);
        } catch (err) {
            return response.serverError(res, err.message);
        }
    };

    // PIN orqali token olish
    loginWithPin = async (req, res) => {
        try {
            const { phone, pin } = req.body;

            if (!phone || !pin) {
                return response.error(res, "Telefon yoki PIN kiritilmadi");
            }

            const user = await User.findOne({ phone });

            // Foydalanuvchi topilmadi
            if (!user) {
                return response.notFound(res, "Foydalanuvchi topilmadi");
            }

            // Agar foydalanuvchi hali PIN o‘rnatmagan bo‘lsa → yangi PIN yoziladi
            if (!user.pin) {
                user.pin = pin;
                await user.save();
                // PIN saqlangandan keyin avtomatik token yaratib beramiz
                const token = jwt.sign(
                    { id: user._id, phone: user.phone },
                    process.env.JWT_SECRET,
                    { expiresIn: "1d" }
                );


                return response.success(res, "PIN yaratildi va login qilindi", {
                    token,
                    user
                });
            }

            // PIN to‘g‘ri bo‘lsa → token yaratiladi
            if (user.pin === pin) {

                const token = jwt.sign(
                    { id: user._id, phone: user.phone },
                    process.env.JWT_SECRET,
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
            return response.serverError(res, err.message);
        }
    };


    // GET all users
    getAllUsers = async (req, res) => {
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
            return response.serverError(res, err.message);
        }
    };

    // GET user by phone
    getUserByPhone = async (req, res) => {
        try {
            const { phone } = req.params;

            if (!phone) {
                // DOMException o'rniga oddiy Error
                throw new Error("Phone number is required");
            }

            // Redis cache tekshirish
            if (this.redisClient) {
                const cached = await this.redisClient.get(`user:${phone}`);
                if (cached) {
                    return response.success(res, "OK", JSON.parse(cached));
                }
            }

            // MongoDB dan olish
            const user = await User.findOne({ phone }).lean(); // lean() => oddiy JS obyekt
            if (!user) {
                return response.notFound(res, "Foydalanuvchi topilmadi");
            }

            // Redis ga saqlash
            if (this.redisClient) {
                await this.redisClient.set(`user:${phone}`, JSON.stringify(user));
            }

            return response.success(res, "OK", user);

        } catch (err) {
            console.error("getUserByPhone error:", err);
            return response.serverError(res, err.message || "Internal server error");
        }
    };


    // UPDATE user
    updateUser = async (req, res) => {
        try {
            const { phone } = req.params;

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
            return response.serverError(res, err.message);
        }
    };

    // DELETE user
    deleteUser = async (req, res) => {
        try {
            const { phone } = req.params;

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
            return response.serverError(res, err.message);
        }
    };
}

module.exports = UserController;
