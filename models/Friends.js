const mongoose = require('mongoose');

const {Schema} = mongoose;

const FriendsSchema = new Schema({
    user1: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      user2: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      socketRoomId:{
        type: String,
        required: true,
      }
});

const Friends = mongoose.model('Friends',FriendsSchema);
Friends.createIndexes();
module.exports = Friends;