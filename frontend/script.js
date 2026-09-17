const socket = io();

let currentUsername = localStorage.getItem('chat_username');
if (!currentUsername || currentUsername.trim() === '') {
    currentUsername = prompt('Enter your username to join the chat:');
    currentUsername = currentUsername ? currentUsername.trim() : 'Anonymous';
    localStorage.setItem('chat_username', currentUsername);
}

let currentRoom = '';
const unreadCounts = {};

const usernameDisplay = document.getElementById('current-username');
const channelListContainer = document.getElementById('channels-container');
const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const onlineUsersContainer = document.getElementById('online-users-list');
const currentChannelTitle = document.getElementById('current-channel-title');
const onlineCountEl = document.getElementById('online-count');
const addChannelBtn = document.getElementById('add-channel-btn');
const clearChatBtn = document.getElementById('clear-chat-btn');
const typingIndicatorEl = document.getElementById('typing-indicator');
const logoutBtn = document.getElementById('logout-btn');
const changeUsernameBtn = document.getElementById('change-username-btn');
const emojiToggleBtn = document.getElementById('emoji-toggle-btn');
const emojiPicker = document.getElementById('emoji-picker');

if (usernameDisplay) usernameDisplay.textContent = currentUsername;

// Socket Event: Channels List (Starts empty if no channels exist)
socket.on('channels list', (channels) => {
    renderChannels(channels);
    if (channels.length === 0) {
        currentRoom = '';
        if (currentChannelTitle) currentChannelTitle.textContent = 'No Channels';
        if (messageInput) {
            messageInput.value = '';
            messageInput.placeholder = 'Create a channel to start chatting...';
        }
        if (messagesContainer) messagesContainer.innerHTML = '';
    } else if (!currentRoom || !channels.map(c => c.toLowerCase()).includes(currentRoom)) {
        switchChannel(channels[0]);
    }
});

// Socket Event: Online Users
socket.on('online-users', (users) => {
    if (onlineCountEl) onlineCountEl.textContent = users.length;
    if (onlineUsersContainer) {
        onlineUsersContainer.innerHTML = users.map(user => `
            <div class="flex items-center space-x-2 text-sm text-gray-300 py-1">
                <span class="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                <span class="text-white">${escapeHtml(user)}</span>
            </div>
        `).join('');
    }
});

// Socket Event: Incoming Messages & Unread Badges
socket.on('chat message', (msg) => {
    const cleanMsgRoom = msg.room.toLowerCase().trim();
    
    if (cleanMsgRoom === currentRoom.toLowerCase().trim()) {
        appendMessage(msg);
    } else {
        unreadCounts[cleanMsgRoom] = (unreadCounts[cleanMsgRoom] || 0) + 1;
        updateChannelBadge(cleanMsgRoom, unreadCounts[cleanMsgRoom]);
    }
});

// Typing Indicators
let typingTimeout = null;
if (messageInput) {
    messageInput.addEventListener('input', () => {
        if (!currentRoom) return;
        socket.emit('typing', { room: currentRoom, username: currentUsername });
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('stop_typing', { room: currentRoom });
        }, 1500);
    });
}

socket.on('display_typing', ({ username }) => {
    if (typingIndicatorEl) typingIndicatorEl.textContent = `${username} is typing...`;
});

socket.on('hide_typing', () => {
    if (typingIndicatorEl) typingIndicatorEl.textContent = '';
});

function switchChannel(roomName) {
    currentRoom = roomName.toLowerCase().trim();
    if (currentChannelTitle) currentChannelTitle.textContent = roomName;
    if (messageInput) messageInput.placeholder = `Message ${roomName}`;
    if (messagesContainer) messagesContainer.innerHTML = '';
    if (typingIndicatorEl) typingIndicatorEl.textContent = '';

    // Reset unread counts when switching into the channel
    unreadCounts[currentRoom] = 0;
    updateChannelBadge(currentRoom, 0);

    socket.emit('join room', { room: currentRoom, username: currentUsername });

    fetch(`/api/messages/${currentRoom}`)
        .then(res => res.json())
        .then(messages => {
            messages.forEach(msg => appendMessage(msg));
        })
        .catch(err => console.error('Error fetching messages:', err));

    if (channelListContainer) {
        Array.from(channelListContainer.children).forEach(el => {
            if (el.dataset.room === currentRoom) {
                el.classList.add('bg-[#3a3c42]', 'text-white');
                el.classList.remove('text-[#949ba4]', 'hover:bg-[#35373c]');
            } else {
                el.classList.remove('bg-[#3a3c42]', 'text-white');
                el.classList.add('text-[#949ba4]', 'hover:bg-[#35373c]');
            }
        });
    }
}

function renderChannels(channels) {
    if (!channelListContainer) return;
    channelListContainer.innerHTML = '';

    channels.forEach(room => {
        const count = unreadCounts[room] || 0;
        const div = document.createElement('div');
        div.dataset.room = room;
        div.className = `flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition font-medium ${
            room === currentRoom ? 'bg-[#3a3c42] text-white' : 'text-[#949ba4] hover:bg-[#35373c] hover:text-white'
        }`;

        div.innerHTML = `
            <span class="truncate flex-1">${escapeHtml(room)}</span>
            <div class="flex items-center space-x-2">
                <span class="unread-badge ${count > 0 ? '' : 'hidden'} bg-red-500 text-white text-xs px-1.5 py-0.2 rounded-full font-bold">${count}</span>
                <button type="button" class="delete-channel-btn text-xs text-[#949ba4] hover:text-red-400 p-1" title="Delete Channel">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        `;

        div.addEventListener('click', (e) => {
            if (e.target.closest('.delete-channel-btn')) return;
            switchChannel(room);
        });

        const deleteBtn = div.querySelector('.delete-channel-btn');
        deleteBtn.addEventListener('click', () => deleteChannel(room));

        channelListContainer.appendChild(div);
    });
}

function updateChannelBadge(room) {
    if (!channelListContainer) return;
    const item = Array.from(channelListContainer.children).find(el => el.dataset.room === room);
    if (!item) return;

    const badge = item.querySelector('.unread-badge');
    const count = unreadCounts[room] || 0;
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

function deleteChannel(roomName) {
    // Hide or remove the channel ONLY from your personal sidebar view
    const channelElement = document.querySelector(`[data-room="${roomName}"]`);
    if (channelElement) {
        channelElement.remove();
    }

    // If you are currently inside the room you just hid, switch to general or another room
    if (currentRoom === roomName) {
        const remainingChannels = Array.from(channelListContainer.children).map(el => el.dataset.room);
        if (remainingChannels.length > 0) {
            switchChannel(remainingChannels[0]);
        } else {
            currentRoom = '';
            if (currentChannelTitle) currentChannelTitle.textContent = 'No Channels';
            if (messagesContainer) messagesContainer.innerHTML = '';
        }
    }
}
if (addChannelBtn) {
    addChannelBtn.addEventListener('click', () => {
        const channelName = prompt("Enter new channel name:");
        if (channelName !== null) {
            const trimmed = channelName.trim().toLowerCase();
            if (trimmed !== "") {
                socket.emit('create channel', trimmed);
            } else {
                alert("Channel name cannot be empty.");
            }
        }
    });
}

if (emojiToggleBtn && emojiPicker) {
    if (emojiPicker.innerHTML.trim() === '') {
        const emojis = ['😀', '😂', '😍', '👍', '🔥', '🎉', '❤️', '😎', '🙌', '🚀', '😭', '✨', '👏', '🥳', '💯', '🙏'];
        emojis.forEach(emoji => {
            const span = document.createElement('span');
            span.textContent = emoji;
            span.className = 'cursor-pointer text-xl text-white hover:bg-[#3f4147] rounded p-1 transition select-none';
            span.addEventListener('click', () => {
                if (messageInput) {
                    messageInput.value += emoji;
                    messageInput.focus();
                }
                emojiPicker.classList.add('hidden');
            });
            emojiPicker.appendChild(span);
        });
    }

    emojiToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPicker.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && !emojiToggleBtn.contains(e.target)) {
            emojiPicker.classList.add('hidden');
        }
    });
}

if (messageForm) {
    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = messageInput.value.trim();
        if (!text || !currentRoom) return;

        const msgObj = {
            room: currentRoom,
            username: currentUsername,
            text: text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        socket.emit('chat message', msgObj);
        socket.emit('stop_typing', { room: currentRoom });
        messageInput.value = '';
        if (emojiPicker) emojiPicker.classList.add('hidden');
    });
}

function appendMessage(msg) {
    if (!messagesContainer) return;
    const div = document.createElement('div');
    div.className = 'flex flex-col space-y-1';
    div.innerHTML = `
        <div class="flex items-center space-x-2">
            <span class="font-bold text-white text-sm">${escapeHtml(msg.user || msg.username)}</span>
            <span class="text-xs text-[#949ba4]">${escapeHtml(msg.timestamp)}</span>
        </div>
        <p class="text-sm text-[#dbdee1]">${escapeHtml(msg.text)}</p>
    `;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

if (clearChatBtn && messagesContainer) {
    clearChatBtn.addEventListener('click', () => {
        messagesContainer.innerHTML = '';
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('chat_username');
        if (typeof socket !== 'undefined') socket.disconnect();
        window.location.reload();
    });
}

if (changeUsernameBtn) {
    changeUsernameBtn.addEventListener('click', () => {
        const newName = prompt('Enter your new username:', currentUsername);
        if (newName && newName.trim() !== '') {
            currentUsername = newName.trim();
            localStorage.setItem('chat_username', currentUsername);
            if (usernameDisplay) usernameDisplay.textContent = currentUsername;
            if (currentRoom) {
                socket.emit('join room', { room: currentRoom, username: currentUsername });
            }
        }
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}