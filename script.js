const firebaseConfig = {
    apiKey: "AIzaSyBrjBUyE3jW7c9DK8x2F8eANlSya9FxUYg",
    authDomain: "moodconnect-465eb.firebaseapp.com",
    projectId: "moodconnect-465eb",
    storageBucket: "moodconnect-465eb.firebasestorage.app",
    messagingSenderId: "451443068092",
    appId: "1:451443068092:web:a80b38f9d9406d80ced4b9"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let currentUser = {};
let roomCode = '';
let userRef;
let beforeUnloadListener;
let messagesUnsubscribe = null;

function generateRoomCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    document.getElementById('roomCode').value = result;
}

async function joinRoom() {
    const userName = document.getElementById('userName').value.trim();
    roomCode = document.getElementById('roomCode').value.trim().toUpperCase();

    if (!userName || !roomCode) {
        alert('Please enter both name and room code');
        return;
    }

    currentUser = {
        id: Math.random().toString(36).substr(2, 9),
        name: userName,
        room: roomCode
    };

    const roomRef = db.collection("rooms").doc(roomCode);
    await roomRef.set({ exists: true }, { merge: true });

    userRef = roomRef.collection("users").doc(currentUser.id);
    await userRef.set({
        name: currentUser.name,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    roomRef.collection("users").onSnapshot((snapshot) => {
        const users = [];
        snapshot.forEach(doc => {
            if (doc.id !== currentUser.id) users.push(doc.data().name);
        });
        updateConnectionStatus(users);
    });

    beforeUnloadListener = async () => await userRef.delete();
    window.addEventListener('beforeunload', beforeUnloadListener);

    localStorage.setItem('moodConnectUser', JSON.stringify(currentUser));
    document.getElementById('landingPage').style.display = 'none';
    document.getElementById('roomPage').style.display = 'block';
    document.getElementById('currentRoomCode').textContent = roomCode;
    
    setupChatListener();
}

function updateConnectionStatus(users) {
    const status = document.getElementById('connectionStatus');
    const statusText = users.length > 0 
        ? `Connected with: ${users.join(', ')}`
        : 'Waiting for partners...';
        
    status.innerHTML = `
        <div class="status-dot ${users.length > 0 ? 'online' : 'offline'}"></div>
        <span>${statusText}</span>
    `;
}

async function setupChatListener() {
    if (messagesUnsubscribe) messagesUnsubscribe();
    
    messagesUnsubscribe = db.collection("rooms").doc(roomCode)
        .collection("moods")
        .orderBy("timestamp", "asc")
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === "added") {
                    addMessageToChat(change.doc.data());
                }
            });
        });

    const snapshot = await db.collection("rooms").doc(roomCode)
        .collection("moods")
        .orderBy("timestamp", "asc")
        .get();

    snapshot.forEach(doc => addMessageToChat(doc.data()));
}

function addMessageToChat(mood) {
    const chatContainer = document.getElementById('chatContainer');
    const messageId = `msg-${mood.timestamp?.toMillis() || Date.now()}`;
    
    if (document.getElementById(messageId)) return;

    const isOwn = mood.userId === currentUser.id;
    const date = new Date(mood.timestamp?.toDate() || new Date());
    const timeString = date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
    });

    const messageElement = document.createElement('div');
    messageElement.id = messageId;
    messageElement.className = `chat-message ${isOwn ? 'own-message' : 'partner-message'}`;
    messageElement.innerHTML = `
        <div class="message-header">
            <span class="message-emoji">${mood.emoji}</span>
            ${!isOwn ? `<span class="message-sender">${mood.userName}</span>` : ''}
        </div>
        <div class="message-content">${mood.note}</div>
        <div class="message-time">${timeString}</div>
    `;

    chatContainer.appendChild(messageElement);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function postMood() {
    const mood = document.getElementById('moodSelector').value;
    const note = document.getElementById('moodNote').value.trim();

    if (!note) {
        alert('Please enter a message');
        return;
    }

    try {
        await db.collection("rooms").doc(roomCode)
            .collection("moods")
            .add({
                emoji: mood,
                note: note,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                userId: currentUser.id,
                userName: currentUser.name
            });

        document.getElementById('moodNote').value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Error sending message. Please try again.');
    }
}

async function logout() {
    try {
        await userRef.delete();
        const messagesRef = db.collection("rooms").doc(roomCode).collection("moods");
        const snapshot = await messagesRef.get();
        const batch = db.batch();
        snapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    } catch (error) {
        console.error('Logout error:', error);
    }
    
    localStorage.removeItem('moodConnectUser');
    document.getElementById('roomPage').style.display = 'none';
    document.getElementById('landingPage').style.display = 'block';
    document.getElementById('chatContainer').innerHTML = '';
    window.removeEventListener('beforeunload', beforeUnloadListener);
    
    if (messagesUnsubscribe) messagesUnsubscribe();
}

// Enter key support
document.getElementById('moodNote').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        postMood();
    }
});

// Check for existing session
const savedUser = localStorage.getItem('moodConnectUser');
if (savedUser) {
    currentUser = JSON.parse(savedUser);
    roomCode = currentUser.room;
    document.getElementById('landingPage').style.display = 'none';
    document.getElementById('roomPage').style.display = 'block';
    document.getElementById('currentRoomCode').textContent = roomCode;
    setupChatListener();
}