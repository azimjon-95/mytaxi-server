import type { Server as SocketIOServer } from "socket.io";

class SocketHandler {
  async connect(io: SocketIOServer) {
    io.on("connection", async (socket) => {
      socket.on("disconnect", async () => { });
    });
  }
}

export default new SocketHandler();
