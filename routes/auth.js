const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Otps = require("../models/Otps");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const JWT_SECRET = process.env.JWT_SECRET;

const verifyToken = require("../middleware/verifyToken");
const nodemailer = require("nodemailer");


router.post("/send-otp", verifyToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const email = user.email;

    const rawOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = await bcrypt.hash(rawOtp, 10);

    const validTill = new Date(Date.now() + 5 * 60 * 1000);

    await Otps.create({ user: userId, otp: hashedOtp, validTill });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, 
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP Code",
      html: `<h2>Your OTP is: ${rawOtp}</h2><p>This expires in 5 minutes.</p>`,
    };

    await transporter.sendMail(mailOptions);
    return res.json({ success: true, message: "OTP sent" });
  } catch (err) {
    console.error("OTP error:", err);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
});


router.post("/verify-otp", verifyToken, async (req, res) => {
  const { otp } = req.body;
  const userId = req.user.id;

  if (!otp) {
    return res.status(400).json({ success: false, message: "OTP is required" });
  }

  const otpRecord = await Otps.findOne({ user: userId }).sort({
    createdAt: -1,
  });

  if (!otpRecord) {
    return res
      .status(400)
      .json({ success: false, message: "OTP expired or not found" });
  }

  const isMatch = await bcrypt.compare(otp, otpRecord.otp);

  if (!isMatch) {
    return res.status(400).json({ success: false, message: "Invalid OTP" });
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId, 
    { isVerified: true }, 
    { new: true }
  );

  await Otps.deleteMany({ user: userId });

  return res.json({ success: true, message: "OTP verified successfully" });
});

router.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !password || !email) {
      return res.status(401).json({
        success: false,
        message: "Please enter a valid username,email and password",
      });
    }
    const find = await User.exists({ username:username });
    if(find){
        return res.json({success:false,message:"Username already exists"});
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
        message: "Please enter a valid email and password",
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

      return res.json({ success: true, authToken: authToken,isVerified:user.isVerified});
    } catch (error) {
      return res.json({ success: false, message: "internal server error" });
    }
  }
);

module.exports = router;
