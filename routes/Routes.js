const express = require("express");
const UserController = require("../controllers/userController");
const OrderController = require("../controllers/orderController");
const MainOrderController = require("../controllers/mainGetOrderCtrl");
const DriverController = require("../controllers/driverController");
const ConfigController = require("../controllers/configController");
const upload = require("../middleware/upload");

module.exports = (redisClient, io) => {
    // Controllers
    const userCtrl = new UserController(redisClient, io);
    const orderCtrl = new OrderController(redisClient, io);
    const driverCtrl = new DriverController(redisClient, io);
    const configCtrl = new ConfigController(redisClient, io);
    const MainGetOrder = new MainOrderController(redisClient, io);

    // ====================== PUBLIC ROUTES ======================
    const publicRouter = express.Router();

    // --- User routes ---
    publicRouter.post("/client", (req, res) => userCtrl.createUser(req, res));
    publicRouter.get("/client/:phone", (req, res) => userCtrl.getUserByPhone(req, res));
    publicRouter.post("/client/login", (req, res) => userCtrl.loginWithPin(req, res));

    // --- Order routes ---
    publicRouter.post("/orders", (req, res) => orderCtrl.create(req, res));
    publicRouter.get("/orders", (req, res) => orderCtrl.getAll(req, res));
    publicRouter.get("/orders/:id", (req, res) => orderCtrl.getById(req, res));
    publicRouter.put("/orders/:id", (req, res) => orderCtrl.update(req, res));
    publicRouter.delete("/orders/:id", (req, res) => orderCtrl.delete(req, res));

    // --- MainGetOrder routes ---
    publicRouter.get("/main/orders/:driverId", (req, res) => MainGetOrder.getOrderByDriverId(req, res));
    publicRouter.patch("/driver/toggle/:driverId", (req, res) => MainGetOrder.toggleActive(req, res));
    publicRouter.post("/main/driver/location", (req, res) => MainGetOrder.setLocationRedis(req, res));
    publicRouter.get("/main/driver/location/:driverId", (req, res) => MainGetOrder.getLocationRedis(req, res));

    // --- Driver routes ---
    publicRouter.post("/driver/login", (req, res) => driverCtrl.login(req, res));
    publicRouter.post("/driver", (req, res) => driverCtrl.create(req, res));
    publicRouter.get("/driver", (req, res) => driverCtrl.getAll(req, res));
    publicRouter.get("/driver/:id", (req, res) => driverCtrl.getById(req, res));
    publicRouter.put("/driver/:id", (req, res) => driverCtrl.update(req, res));
    publicRouter.delete("/driver/:id", (req, res) => driverCtrl.delete(req, res));

    // 🚗 CAR TYPE
    publicRouter.post(
        "/config/car-types",
        upload.single("image"),       // 🔥 rasmni handle qiladi
        (req, res) => configCtrl.createCarType(req, res)
    );
    publicRouter.get("/config/car-types", (req, res) => configCtrl.getCarTypes(req, res));
    publicRouter.put("/config/car-types/:id", (req, res) => configCtrl.updateCarType(req, res));
    publicRouter.delete("/config/car-types/:id", (req, res) => configCtrl.deleteCarType(req, res));

    // 🔥 SERVICES
    publicRouter.post("/config/services", (req, res) => configCtrl.createService(req, res));
    publicRouter.get("/config/services", (req, res) => configCtrl.getServices(req, res));
    publicRouter.put("/config/services/:id", (req, res) => configCtrl.updateService(req, res));
    publicRouter.delete("/config/services/:id", (req, res) => configCtrl.deleteService(req, res));
    // ====================== PROTECTED ROUTES ======================
    const protectedRouter = express.Router();

    // --- User protected routes ---
    protectedRouter.get("/client", (req, res) => userCtrl.getAllUsers(req, res));
    protectedRouter.put("/client/:phone", (req, res) => userCtrl.updateUser(req, res));
    protectedRouter.delete("/client/:phone", (req, res) => userCtrl.deleteUser(req, res));

    // --- Order protected routes ---
    protectedRouter.post("/orders/assign-driver", (req, res) => orderCtrl.assignDriverByClient(req, res));
    protectedRouter.post("/orders/start-meter", (req, res) => orderCtrl.startMeter(req, res));
    protectedRouter.post("/orders/complete", (req, res) => orderCtrl.completeOrder(req, res));
    protectedRouter.post("/orders/update-meter", (req, res) => orderCtrl.updateMeter(req, res));
    protectedRouter.get("/orders/live/:clientId", (req, res) => orderCtrl.watchActiveOrder(req, res));
    protectedRouter.get("/orders/drivers/:clId/:orId", (req, res) => orderCtrl.getAvailableDrivers(req, res));
    protectedRouter.post("/orders/select-driver", (req, res) => orderCtrl.assignDriver(req, res));
    protectedRouter.post("/orders/cancel/:orderId", (req, res) => orderCtrl.cancelOrder(req, res));

    return { publicRouter, protectedRouter };
};
