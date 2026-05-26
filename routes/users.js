const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const User = require("../models/User");
const Friends = require("../models/Friends");
const FriendRequest = require("../models/FriendRequest");
const Message = require("../models/Message");
const multer = require("multer");
const path = require("path");

// Configure Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, req.user.id + '-' + uniqueSuffix + path.extname(file.originalname))
  }
})
const upload = multer({ storage: storage });

router.post("/upload-profile", verifyToken, upload.single('profilePic'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    const userId = req.user.id;
    const profilePicUrl = `/uploads/${req.file.filename}`;
    
    await User.findByIdAndUpdate(userId, { profilePic: profilePicUrl });
    
    res.json({ success: true, profilePic: profilePicUrl });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

router.get("/me", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/update-profile", verifyToken, async (req, res) => {
  try {
    const { username } = req.body;
    const userId = req.user.id;
    
    if (username) {
       const existing = await User.findOne({ username, _id: { $ne: userId } });
       if(existing) {
         return res.status(400).json({ success: false, message: "Username already taken" });
       }
       await User.findByIdAndUpdate(userId, { username });
    }
    
    res.json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

router.get("/", verifyToken, async (req, res) => {
  try {
    const searchQuery = req.query.search || "";
    let query = { _id: { $ne: req.user.id } };
    
    if (searchQuery) {
      query.$or = [
        { username: { $regex: searchQuery, $options: "i" } },
        { email: { $regex: searchQuery, $options: "i" } }
      ];
    }
    
    const users = await User.find(query, "username email profilePic isOnline lastOnline");
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

router.get("/pending-requests", verifyToken, async (req, res) => {
  try {
    const requests = await FriendRequest.find({ to: req.user.id, status: "pending" })
      .populate("from", "username email profilePic");
    res.json(requests);
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

router.post("/frndrequest", verifyToken, async (req, res) => {
  try {
    const { frndId } = req.body;
    const userId = req.user.id;

    if (userId === frndId) {
      return res.status(400).json({ success: false, message: "Cannot add yourself" });
    }

    const existingFriend = await Friends.findOne({
      $or: [
        { user1: userId, user2: frndId },
        { user1: frndId, user2: userId },
      ],
    });

    if (existingFriend) {
      return res.status(400).json({ success: false, message: "Already friends" });
    }

    const existingReq = await FriendRequest.findOne({
      from: userId,
      to: frndId,
      status: "pending"
    });

    if (existingReq) {
      return res.status(400).json({ success: false, message: "Request already sent" });
    }
    
    const incomingReq = await FriendRequest.findOne({
      from: frndId,
      to: userId,
      status: "pending"
    });
    
    if (incomingReq) {
       return res.status(400).json({ success: false, message: "They already sent you a request. Check pending requests." });
    }

    await FriendRequest.create({
      from: userId,
      to: frndId,
      status: "pending"
    });

    res.json({ success: true, message: "Friend request sent" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/accept-request", verifyToken, async (req, res) => {
  try {
    const { requestId } = req.body;
    const userId = req.user.id;

    const request = await FriendRequest.findOne({ _id: requestId, to: userId, status: "pending" });
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    request.status = "accepted";
    await request.save();

    const roomId = [userId, request.from.toString()].sort().join("_");
    
    await Friends.create({
      user1: request.from,
      user2: userId,
      socketRoomId: roomId,
    });

    res.json({ success: true, roomId, message: "Friend request accepted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/reject-request", verifyToken, async (req, res) => {
  try {
    const { requestId } = req.body;
    const userId = req.user.id;

    const request = await FriendRequest.findOne({ _id: requestId, to: userId, status: "pending" });
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    request.status = "rejected";
    await request.save();

    res.json({ success: true, message: "Friend request rejected" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/getAllMsgs", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const friendships = await Friends.find({
      $or: [{ user1: userId }, { user2: userId }],
    });

    const friendIds = friendships.map((f) =>
      f.user1.toString() === userId ? f.user2 : f.user1
    );

    const friends = await User.find(
      { _id: { $in: friendIds } },
      "username email profilePic isOnline lastOnline"
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
            profilePic: friend.profilePic,
            isOnline: friend.isOnline,
            lastOnline: friend.lastOnline,
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
          console.error(`Error fetching message for friend ${friend.username}:`, innerErr);
          return null;
        }
      })
    );

    res.json(result.filter(r => r !== null));
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
      return res.status(400).json({ error: "Receiver and content are required." });
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
