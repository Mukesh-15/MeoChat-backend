const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const JWT_SECRET = process.env.JWT_SECRET;

router.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !password || !email) {
      return res.status(401).json({
        success: false,
        message: "Please enter a valid username, email and password",
      });
    }
    const find = await User.exists({ username: username });
    if (find) {
      return res.json({ success: false, message: "Username already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPass = await bcrypt.hash(password, salt);

    const user = await User.create({
      username: username,
      email: email,
      password: hashedPass,
    });

    const data = {
      user: {
        id: user.id,
      },
    };

    const authToken = jwt.sign(data, JWT_SECRET, { expiresIn: "10d" });

    console.log(`user with id: ${user.id} created`);
    return res.json({ success: true, authToken: authToken });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

router.post(
  "/login",
  [
    body("username", "Enter a valid username").exists(),
    body("password", "password cannot be empty").exists(),
  ],
  async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid username and password",
      });
    }

    const { username, password } = req.body;

    try {
      const user = await User.findOne({ username });
      if (!user) {
        return res
          .status(400)
          .json({ status: false, message: "Invalid username or password" });
      }

      const comparePass = await bcrypt.compare(password, user.password);
      if (!comparePass) {
        return res
          .status(400)
          .json({ status: false, message: "Invalid Password or Username" });
      }
      const token = {
        user: {
          id: user.id,
        },
      };

      const authToken = jwt.sign(token, JWT_SECRET, { expiresIn: "10d" });

      return res.json({ success: true, authToken: authToken });
    } catch (error) {
      return res.json({ success: false, message: "internal server error" });
    }
  }
);

module.exports = router;
