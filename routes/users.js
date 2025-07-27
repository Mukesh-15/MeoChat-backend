const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const User = require("../models/User");
const Friends = require("../models/Friends");
const Message = require("../models/Message");

router.get("/", verifyToken, async (req, res) => {
  try {
    const users = await User.find({}, "username email");
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

router.post("/frndrequest", verifyToken, async (req, res) => {
  try {
    const { frndId } = req.body;
    const userId = req.user.id;

    if (userId === frndId) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot add yourself" });
    }

    const existing = await Friends.findOne({
      $or: [
        { user1: userId, user2: frndId },
        { user1: frndId, user2: userId },
      ],
    });

    if (existing) {
      return res
        .status(400)
        .json({ success: false, message: "Already friends" });
    }

    const roomId = [userId, frndId].sort().join("_");

    await Friends.create({
      user1: userId,
      user2: frndId,
      socketRoomId: roomId,
    });

    res.json({ success: true, roomId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/getAllMsgs", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get friend IDs
    const friendships = await Friends.find({
      $or: [{ user1: userId }, { user2: userId }],
    });

    const friendIds = friendships.map((f) =>
      f.user1.toString() === userId ? f.user2 : f.user1
    );

    // Fetch friends' basic info
    const friends = await User.find(
      { _id: { $in: friendIds } },
      "username email"
    );

    const result = await Promise.all(
      friends.map(async (friend) => {
        try {
          const lastMsg = await Message.findOne({
            $or: [
              { from: userId, to: friend._id },
              { from: friend._id, to: userId },
            ],
          })
            .sort({ timestamp: -1 })
            .lean();

          return {
            friendId: friend._id,
            username: friend.username,
            email: friend.email,
            message: lastMsg?.content || "No messages yet",
            time: lastMsg
              ? new Date(lastMsg.timestamp).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })
              : "",
            unread: lastMsg
              ? !lastMsg.isRead && String(lastMsg.to) === userId
              : false,
          };
        } catch (innerErr) {
          console.error(
            `Error fetching message for friend ${friend.username}:`,
            innerErr
          );
          return {
            friendId: friend._id,
            username: friend.username,
            email: friend.email,
            message: "",
            time: "",
            unread: false,
          };
        }
      })
    );

    res.json(result);
  } catch (err) {
    console.error("Error in /getAllMsgs:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/sendMsg", verifyToken, async (req, res) => {
  try {
    const from = req.user.id;
    const { to, content } = req.body;

    if (!to || !content) {
      return res
        .status(400)
        .json({ error: "Receiver and content are required." });
    }

    const newMessage = new Message({
      from,
      to,
      content,
    });

    await newMessage.save();

    try {
      const io = req.app.get("io");
      io.to([from, to].sort().join("_")).emit("send-message", {
        from,
        to,
        content,
        timestamp: newMessage.timestamp,
      });
    } catch (error) {
      console.log("msg socket not sent");
    }

    res.status(201).json({
      message: "Message sent successfully.",
      data: {
        from,
        to,
        content,
        timestamp: newMessage.timestamp,
      },
    });
  } catch (err) {
    console.error("Error in /sendMsg:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/messages/:friendId", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = req.params.friendId;

    const messages = await Message.find({
      $or: [
        { from: userId, to: friendId },
        { from: friendId, to: userId },
      ],
    }).sort({ timestamp: 1 });

    res.json({ yourId: userId, messages });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
