require('dotenv').config();
const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const connectToMongo = require('./db/db');
const cors = require('cors');
const path = require("path");
const User = require("./models/User");

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const onlineUsers = new Map();

connectToMongo();

app.set("io", io);

app.use(express.json());
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/', require('./routes/auth'));
app.use('/users', require('./routes/users'));

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("user-connected", async (userId) => {
    onlineUsers.set(userId, socket.id);
    await User.findByIdAndUpdate(userId, { isOnline: true });
    io.emit("user-status-changed", { userId, isOnline: true });
  });

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);
  });

  socket.on("disconnect", async () => {
    console.log("User disconnected:", socket.id);
    let disconnectedUserId;
    for (let [userId, sockId] of onlineUsers.entries()) {
      if (sockId === socket.id) {
        disconnectedUserId = userId;
        onlineUsers.delete(userId);
        break;
      }
    }
    if (disconnectedUserId) {
      await User.findByIdAndUpdate(disconnectedUserId, { isOnline: false, lastOnline: Date.now() });
      io.emit("user-status-changed", { userId: disconnectedUserId, isOnline: false });
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
