const mongoose = require('mongoose');

const {Schema} = mongoose;

const OtpSchema = new Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  otp: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 300 //5 mins
  }
});

const Otps = mongoose.model('Otps',OtpSchema);
Otps.createIndexes();
module.exports = Otps;
