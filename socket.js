class soket {
  async connect(io) {
    io.on("connection", async (socket) => {
      socket.on("disconnect", async () => { });
    });
  }
}

module.exports = new soket();
