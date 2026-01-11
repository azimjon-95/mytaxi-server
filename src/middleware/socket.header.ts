import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";

const createSocketServer = (server: HttpServer): SocketIOServer => {
  return new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
      credentials: true
    }
  });
};

export = createSocketServer;
