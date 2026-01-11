import express from "express";
import type { Router, Request, Response } from "express";
import type { RedisClientType } from "redis";
import type { Server as SocketIOServer } from "socket.io";

import upload from "../middleware/upload";

// JS controllerlar bo‘lsa ham any bilan ishlaydi
const UserController = require("../controllers/userController");
const OrderController = require("../controllers/orderController");
const DriverController = require("../controllers/driverController");
const ConfigController = require("../controllers/configController");

import MainOrderController from "../controllers/mainGetOrderCtrl";

export default function buildRoutes(redis: RedisClientType, io: SocketIOServer): {
    publicRouter: Router;
    protectedRouter: Router;
} {
    const userCtrl = new UserController(redis, io);
    const orderCtrl = new OrderController(redis, io);
    const driverCtrl = new DriverController(redis, io);
    const configCtrl = new ConfigController(redis, io);
    const mainGetOrder = new MainOrderController(redis, io);

    const publicRouter = express.Router();

    publicRouter.post("/client", (req: Request, res: Response) => userCtrl.createUser(req, res));
    publicRouter.get("/client/:phone", (req: Request, res: Response) => userCtrl.getUserByPhone(req, res));
    publicRouter.post("/client/login", (req: Request, res: Response) => userCtrl.loginWithPin(req, res));

    publicRouter.post("/orders", (req: Request, res: Response) => orderCtrl.create(req, res));
    publicRouter.get("/orders", (req: Request, res: Response) => orderCtrl.getAll(req, res));
    publicRouter.get("/orders/:id", (req: Request, res: Response) => orderCtrl.getById(req, res));
    publicRouter.put("/orders/:id", (req: Request, res: Response) => orderCtrl.update(req, res));
    publicRouter.delete("/orders/:id", (req: Request, res: Response) => orderCtrl.delete(req, res));

    publicRouter.get("/main/orders/:driverId", (req: Request, res: Response) =>
        mainGetOrder.getOrderByDriverId(req, res)
    );
    publicRouter.patch("/driver/toggle/:driverId", (req: Request, res: Response) =>
        mainGetOrder.toggleActive(req, res)
    );
    publicRouter.post("/main/driver/location", (req: Request, res: Response) =>
        mainGetOrder.setLocationRedis(req, res)
    );
    publicRouter.get("/main/driver/location/:driverId", (req: Request, res: Response) =>
        mainGetOrder.getLocationRedis(req, res)
    );

    publicRouter.post("/driver/login", (req: Request, res: Response) => driverCtrl.login(req, res));
    publicRouter.post("/driver", (req: Request, res: Response) => driverCtrl.create(req, res));
    publicRouter.get("/driver", (req: Request, res: Response) => driverCtrl.getAll(req, res));
    publicRouter.get("/driver/:id", (req: Request, res: Response) => driverCtrl.getById(req, res));
    publicRouter.put("/driver/:id", (req: Request, res: Response) => driverCtrl.update(req, res));
    publicRouter.delete("/driver/:id", (req: Request, res: Response) => driverCtrl.delete(req, res));

    publicRouter.post("/config/car-types", upload.single("image"), (req: Request, res: Response) =>
        configCtrl.createCarType(req, res)
    );
    publicRouter.get("/config/car-types", (req: Request, res: Response) => configCtrl.getCarTypes(req, res));
    publicRouter.put("/config/car-types/:id", (req: Request, res: Response) => configCtrl.updateCarType(req, res));
    publicRouter.delete("/config/car-types/:id", (req: Request, res: Response) => configCtrl.deleteCarType(req, res));

    publicRouter.post("/config/services", (req: Request, res: Response) => configCtrl.createService(req, res));
    publicRouter.get("/config/services", (req: Request, res: Response) => configCtrl.getServices(req, res));
    publicRouter.put("/config/services/:id", (req: Request, res: Response) => configCtrl.updateService(req, res));
    publicRouter.delete("/config/services/:id", (req: Request, res: Response) => configCtrl.deleteService(req, res));

    const protectedRouter = express.Router();

    protectedRouter.get("/client", (req: Request, res: Response) => userCtrl.getAllUsers(req, res));
    protectedRouter.put("/client/:phone", (req: Request, res: Response) => userCtrl.updateUser(req, res));
    protectedRouter.delete("/client/:phone", (req: Request, res: Response) => userCtrl.deleteUser(req, res));

    protectedRouter.post("/orders/assign-driver", (req: Request, res: Response) => orderCtrl.assignDriverByClient(req, res));
    protectedRouter.post("/orders/start-meter", (req: Request, res: Response) => orderCtrl.startMeter(req, res));
    protectedRouter.post("/orders/complete", (req: Request, res: Response) => orderCtrl.completeOrder(req, res));
    protectedRouter.post("/orders/update-meter", (req: Request, res: Response) => orderCtrl.updateMeter(req, res));
    protectedRouter.get("/orders/live/:clientId", (req: Request, res: Response) => orderCtrl.watchActiveOrder(req, res));
    protectedRouter.get("/orders/drivers/:clId/:orId", (req: Request, res: Response) => orderCtrl.getAvailableDrivers(req, res));
    protectedRouter.post("/orders/select-driver", (req: Request, res: Response) => orderCtrl.assignDriver(req, res));
    protectedRouter.post("/orders/cancel/:orderId", (req: Request, res: Response) => orderCtrl.cancelOrder(req, res));

    return { publicRouter, protectedRouter };
}
