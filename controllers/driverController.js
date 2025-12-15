const { Driver } = require("../models/driverModel");
const response = require("../utils/response");
const jwt = require("jsonwebtoken");

class DriverController {
    constructor(redisClient, io) {
        this.redisClient = redisClient;
        this.io = io;
    }

    // CREATE DRIVER
    async create(req, res) {
        try {
            const driver = new Driver(req.body);
            await driver.save();

            await this.redisClient.set(`driver:${driver._id}`, JSON.stringify(driver));
            this.io.emit("driverCreated", driver);

            return response.created(res, "Driver created successfully", driver);
        } catch (err) {
            return response.serverError(res, err.message);
        }
    }

    // LOGIN DRIVER
    async login(req, res) {
        try {
            const { login, password } = req.body;

            // Population bilan driverni topamiz
            const driver = await Driver.findOne({ login, password })
                .populate({
                    path: 'car.carType',
                    select: 'label value level price isActive' // kerakli fieldlarni tanlaymiz
                })
                .populate({
                    path: 'additionalServices',
                    select: 'value price'
                });

            if (!driver) {
                return response.notFound(res, "Driver not found");
            }

            // JWT token yaratamiz
            const token = jwt.sign(
                { id: driver._id, login: driver.login },
                process.env.JWT_SECRET || "secret",
                { expiresIn: "1d" }
            );

            // Population qilingan driver ma'lumotlarini yuboramiz
            return response.success(res, "Login successful", {
                driver,
                token
            });

        } catch (err) {
            return response.serverError(res, err.message);
        }
    }

    // READ ALL DRIVERS// READ ALL DRIVERS
    async getAll(req, res) {
        try {
            const drivers = await Driver.find()
                .populate({
                    path: "additionalServices",
                    model: "AdditionalService", // model nomi
                })
                .populate({
                    path: "car.carType",
                    model: "CarType", // model nomi
                });

            return response.success(res, "Drivers fetched successfully", drivers);
        } catch (err) {
            return response.serverError(res, err.message);
        }
    }


    // READ SINGLE DRIVER
    async getById(req, res) {
        try {
            const driver = await Driver.findById(req.params.id);
            if (!driver) return response.notFound(res, "Driver not found");
            return response.success(res, "Driver fetched successfully", driver);
        } catch (err) {
            return response.serverError(res, err.message);
        }
    }

    // UPDATE DRIVER
    // UPDATE DRIVER
    async update(req, res) {
        try {
            // Avval driver ni yangilaymiz
            const updatedDriver = await Driver.findByIdAndUpdate(
                req.params.id,
                req.body,
                { new: true, runValidators: true } // new: true - yangilangan documentni qaytaradi
            );

            if (!updatedDriver) {
                return response.notFound(res, "Driver not found");
            }

            // Endi yangilangan driver ni populate qilib qayta o‘qiymiz
            const driver = await Driver.findById(updatedDriver._id)
                .populate({
                    path: "additionalServices",
                    model: "AdditionalService",
                })
                .populate({
                    path: "car.carType",
                    model: "CarType",
                });

            // Redis cache ni yangilash
            await this.redisClient.set(`driver:${driver._id}`, JSON.stringify(driver));

            // Real-time update yuborish
            this.io.emit("driverUpdated", driver);

            return response.success(res, "Driver updated successfully", driver);
        } catch (err) {
            return response.serverError(res, err.message);
        }
    }

    // DELETE DRIVER
    async delete(req, res) {
        try {
            const driver = await Driver.findByIdAndDelete(req.params.id);
            if (!driver) return response.notFound(res, "Driver not found");

            await this.redisClient.del(`driver:${req.params.id}`);
            this.io.emit("driverDeleted", { id: req.params.id });

            return response.success(res, "Driver deleted successfully", { id: req.params.id });
        } catch (err) {
            return response.serverError(res, err.message);
        }
    }
}

module.exports = DriverController;
