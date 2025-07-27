const mongoose = require('mongoose');

const {Schema} = mongoose;

const UserSchema = new Schema({
    username : {
        type: String,
        required: true,
        unique: true,   
    },
    email: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: true,
    },
    isOnline: {
        type: Boolean,
        default: false,
    },
    lastOnline: {
        type: Date,
        default: Date.now(),
    },
    isVerified:{
        type:Boolean,
        default:false,
    }
});

const User = mongoose.model('User',UserSchema);
User.createIndexes();
module.exports = User;