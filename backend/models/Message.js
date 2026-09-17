const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    room: { type: String, required: true, lowercase: true, trim: true },
    username: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: String, required: true }
});

module.exports = mongoose.model('Message', messageSchema);