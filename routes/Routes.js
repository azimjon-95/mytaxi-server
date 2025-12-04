const express = require("express");
const UserController = require("../controllers/userController");
const OrderController = require("../controllers/orderController");

module.exports = (redisClient, io) => {
    const controller = new UserController(redisClient, io);
    const OrderCtrl = new OrderController(redisClient, io);

    // Public router (token talab qilinmaydi)
    const publicRouter = express.Router();
    publicRouter.post("/client", controller.createUser);
    publicRouter.get("/client/:phone", controller.getUserByPhone);
    publicRouter.post("/client/login", controller.loginWithPin);
    // ========================================================
    publicRouter.post("/orders", OrderCtrl.create);
    publicRouter.get("/orders", OrderCtrl.getAll);
    publicRouter.get("/orders/:id", OrderCtrl.getById);
    publicRouter.put("/orders/:id", OrderCtrl.update);
    publicRouter.post("/orders/:id/cancel", OrderCtrl.cancel);
    publicRouter.delete("/orders/:id", OrderCtrl.delete);

    // ======================  PROTECTED ROUTES ====================== 
    // Protected router (token talab qilinadi)
    const protectedRouter = express.Router();
    protectedRouter.post("/orders/select-driver", OrderCtrl.selectDriver);
    protectedRouter.post("/orders/assign-driver", OrderCtrl.assignDriverByClient);
    protectedRouter.post("/orders/start-meter", OrderCtrl.startMeter);
    protectedRouter.post("/orders/complete", OrderCtrl.completeOrder);
    protectedRouter.post("/orders/update-meter", OrderCtrl.updateMeter);


    // Qo‘shimcha ro‘yxatlar (Admin panel uchun)
    // protectedRouter.get("/drivers/available", OrderCtrl.getAvailableDrivers);
    // protectedRouter.get("/orders/client/:clientId", OrderCtrl.getOrdersByClient);
    // protectedRouter.get("/orders/driver/:driverId", OrderCtrl.getOrdersByDriver);
    // ========================================================


    protectedRouter.get("/client", controller.getAllUsers);
    protectedRouter.put("/client/:phone", controller.updateUser);
    protectedRouter.delete("/client/:phone", controller.deleteUser);

    return { publicRouter, protectedRouter };
};
