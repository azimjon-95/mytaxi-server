const response = require("../utils/response");
const { CarType, AdditionalService } = require("../models/driverModel");
const uploadToImgBB = require("../utils/uploadToImgBB");

class ConfigController {
    constructor(redisClient, io) {
        this.redisClient = redisClient;
        this.io = io;
    }

    /* =======================
    🚗 CAR TYPE
    ======================== */

    // ➕ CREATE
    createCarType = async (req, res) => {
        try {
            const { label, value, level, price } = req.body;

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
                image: imageUrl,
            });

            await this.redisClient.del("carTypes");
            this.io.emit("carType:created", carType);

            return response.success(res, "Car type created", carType);
        } catch (error) {
            return response.serverError(res, error.message);
        }
    };


    // 📥 GET ALL (CACHE)
    getCarTypes = async (req, res) => {
        try {
            const cached = await this.redisClient.get("carTypes");
            if (cached) {
                return response.success(
                    res,
                    JSON.parse(cached),
                    "Car types (cache)"
                );
            }

            const carTypes = await CarType.find().sort({ level: 1 });

            await this.redisClient.set(
                "carTypes",
                JSON.stringify(carTypes),
                "EX",
                3600
            );

            return response.success(res, "Car types fetched", carTypes);
        } catch (error) {
            return response.serverError(res, error.message);
        }
    };

    // ✏️ UPDATE
    updateCarType = async (req, res) => {
        try {
            const { id } = req.params;

            const updated = await CarType.findByIdAndUpdate(
                id,
                req.body,
                { new: true }
            );

            if (!updated)
                return response.notFound(res, "Car type not found", 404);

            await this.redisClient.del("carTypes");
            this.io.emit("carType:updated", updated);

            return response.success(res, updated, "Updated");
        } catch (error) {
            return response.serverError(res, error.message);
        }
    };

    // ❌ DELETE
    deleteCarType = async (req, res) => {
        try {
            const { id } = req.params;

            await CarType.findByIdAndDelete(id);

            await this.redisClient.del("carTypes");
            this.io.emit("carType:deleted", id);

            return response.success(res, null, "Deleted");
        } catch (error) {
            return response.serverError(res, error.message);
        }
    };

    /* =========================
        🔥 ADDITIONAL SERVICES
    ========================== */

    // ➕ CREATE
    createService = async (req, res) => {
        try {
            const service = await AdditionalService.create(req.body);

            await this.redisClient.del("additionalServices");
            this.io.emit("service:created", service);

            return response.success(res, service, "Service created");
        } catch (error) {
            return response.serverError(res, error.message);
        }
    };

    // 📥 GET ALL (CACHE)
    getServices = async (req, res) => {
        try {
            const cached = await this.redisClient.get("additionalServices");
            if (cached) {
                return response.success(
                    res,
                    JSON.parse(cached),
                    "Services (cache)"
                );
            }

            const services = await AdditionalService.find();

            await this.redisClient.set(
                "additionalServices",
                JSON.stringify(services),
                "EX",
                3600
            );

            return response.success(res, services);
        } catch (error) {
            return response.serverError(res, error.message);
        }
    };

    // ✏️ UPDATE
    updateService = async (req, res) => {
        try {
            const { id } = req.params;

            const updated = await AdditionalService.findByIdAndUpdate(
                id,
                req.body,
                { new: true }
            );

            if (!updated)
                return response.notFound(res, "Service not found", 404);

            await this.redisClient.del("additionalServices");
            this.io.emit("service:updated", updated);

            return response.success(res, updated, "Updated");
        } catch (error) {
            return response.serverError(res, error.message);
        }
    };

    // ❌ DELETE
    deleteService = async (req, res) => {
        try {
            const { id } = req.params;

            await AdditionalService.findByIdAndDelete(id);

            await this.redisClient.del("additionalServices");
            this.io.emit("service:deleted", id);

            return response.success(res, null, "Deleted");
        } catch (error) {
            return response.serverError(res, error.message);
        }
    };
}

module.exports = ConfigController;