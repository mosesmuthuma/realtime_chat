const dns = require('dns');
try { 
    dns.setServers(['8.8.8.8', '8.8.4.4']); 
} catch(e) {}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const Message = require('./models/Message');
const Channel = require('./models/Channel');
async function getChannelNames(username) {
    if (!username) return [];
    try {
        const channels = await Channel.find({ username: username.trim() }).sort({ createdAt: 1 });
        return channels.map(c => c.name);
    } catch (err) {
        console.error('Error fetching channels:', err);
        return [];
    }
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const connectedUsers = {};
// Fetch messages for a specific room
app.get('/api/messages/:room', async (req, res) => {
    try {
        const room = req.params.room.toLowerCase().trim();
        const messages = await Message.find({ room }).sort({ _id: 1 });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Socket.io connection logic
io.on('connection', async (socket) => {
    console.log('User connected:', socket.id);

    // Send channel list on load
    try {
        const channels = await Channel.find({});
        socket.emit('channels list', channels.map(c => c.name));
    } catch (err) {
        console.error('Error fetching channels:', err);
    }

    async function updateRoomUsers(room) {
        const socketsInRoom = await io.in(room).fetchSockets();
        const users = socketsInRoom
            .map(s => connectedUsers[s.id]?.username)
            .filter(Boolean);
        io.in(room).emit('online-users', users);
    }

    socket.on('join room', ({ room, username }) => {
        if (room) {
            const cleanRoom = room.toLowerCase().trim();
            socket.join(cleanRoom);
            if (username) {
                connectedUsers[socket.id] = { username, room: cleanRoom };
                updateRoomUsers(cleanRoom);
            }
        }
    });

    socket.on('create channel', async (channelName) => {
        try {
            const name = channelName.toLowerCase().trim();
            if (name) {
                await Channel.updateOne({ name }, { name }, { upsert: true });
                const allChannels = await Channel.find({});
                io.emit('channels list', allChannels.map(c => c.name));
            }
        } catch (err) {
            console.error('Error creating channel:', err);
        }
    });

    socket.on('chat message', async (msgData) => {
    try {
        const cleanRoom = msgData.room.toLowerCase().trim();
        const newMessage = new Message({
            room: cleanRoom,
            username: msgData.username.trim(),
            text: msgData.text,
            timestamp: msgData.timestamp
        });

        const savedMessage = await newMessage.save();
        io.to(cleanRoom).emit('chat message', savedMessage);
    } catch (err) {
        console.error('Error saving message:', err.message);
    }
});

    socket.on('typing', ({ room, username }) => {
        if (room) socket.to(room.toLowerCase().trim()).emit('display_typing', { username });
    });

    socket.on('stop_typing', ({ room }) => {
        if (room) socket.to(room.toLowerCase().trim()).emit('hide_typing');
    });

    socket.on('disconnect', () => {
        const user = connectedUsers[socket.id];
        if (user) {
            const room = user.room;
            delete connectedUsers[socket.id];
            updateRoomUsers(room);
        }
        console.log('User disconnected:', socket.id);
    });
});
const PORT = process.env.PORT || 5000;

// 1. Start the server immediately so port 5000 is always accessible
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// 2. Connect to MongoDB in the background and seed defaults if empty
mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(async () => {
    console.log('MongoDB Connected Successfully');
    
    // WIPE OLD CHANNELS ON STARTUP
    await Channel.deleteMany({});
    console.log('Old channels cleared from database!');
})
.catch(err => {
    console.error('MongoDB connection error:', err);
});