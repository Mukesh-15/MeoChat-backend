const mongoose = require('mongoose');

const mongoURI = 'mongodb://localhost:27017/chat-app';

const connectToMongo = () => {
    mongoose.connect(mongoURI).then(()=>console.log("connected to database")).catch((e)=>console.log(e.message));
}

module.exports = connectToMongo;