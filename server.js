const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 1e8 // Allow larger payloads for base64 draw images
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── Speech Scorer API ──────────────────────────────────────────────────────
const speechData = require('./speech-data');

// Teacher: Create a classroom
app.post('/api/speech/classroom', (req, res) => {
    const { name, pin, password, quizItems } = req.body;
    if (!name || !pin || !password) return res.json({ ok: false, error: '請填寫所有必填欄位' });
    if (pin.length < 4) return res.json({ ok: false, error: 'PIN 碼至少需 4 碼' });
    res.json(speechData.createClassroom(name, pin, password, quizItems || []));
});

// Teacher: Update quiz items
app.put('/api/speech/classroom/:pin/quiz', (req, res) => {
    const { password, quizItems } = req.body;
    res.json(speechData.updateQuizItems(req.params.pin, password, quizItems));
});

// Teacher: Delete classroom
app.delete('/api/speech/classroom/:pin', (req, res) => {
    const { password } = req.body;
    res.json(speechData.deleteClassroom(req.params.pin, password));
});

// Teacher: Get all student records (requires password)
app.post('/api/speech/classroom/:pin/records', (req, res) => {
    const { password } = req.body;
    res.json(speechData.getStudentRecords(req.params.pin, password));
});

// Teacher: Delete a student's records
app.post('/api/speech/classroom/:pin/records/delete', (req, res) => {
    const { password, nickname } = req.body;
    res.json(speechData.deleteStudentRecords(req.params.pin, password, nickname));
});

// Student: Join classroom
app.post('/api/speech/join', (req, res) => {
    const { pin, nickname } = req.body;
    if (!pin || !nickname) return res.json({ ok: false, error: '請輸入 PIN 碼和暱稱' });
    res.json(speechData.joinClassroom(pin, nickname));
});

// Student: Submit score
app.post('/api/speech/score', (req, res) => {
    const { pin, nickname, record } = req.body;
    res.json(speechData.submitScore(pin, nickname, record));
});

// ─── Buzzer / Classroom Interaction (Socket.IO) ─────────────────────────────
// rooms[pin] = { state: 'WAITING', mode: 'BUZZER', hostId: id, players: { socketId: { name } }, results: [] }
const rooms = {};

function generatePin() {
    let pin;
    do {
        pin = Math.floor(10000 + Math.random() * 90000).toString();
    } while (rooms[pin]);
    return pin;
}

io.on('connection', (socket) => {
    socket.on('create_room', () => {
        const pin = generatePin();
        rooms[pin] = {
            state: 'WAITING',
            mode: 'BUZZER',
            hostId: socket.id,
            players: {},
            results: []
        };
        socket.join(pin);
        socket.emit('room_created', pin);
    });

    socket.on('join_room', ({ pin, name }) => {
        if (!rooms[pin]) {
            socket.emit('error_alert', '找不到此大廳！請確認 PIN 碼是否正確。');
            return;
        }

        socket.pin = pin;
        socket.playerName = name;
        
        rooms[pin].players[socket.id] = { name };
        socket.join(pin);

        socket.emit('join_success', { state: rooms[pin].state, mode: rooms[pin].mode, results: rooms[pin].results });
        io.to(rooms[pin].hostId).emit('player_list_update', Object.values(rooms[pin].players));
    });

    socket.on('host_start', ({pin, mode}) => {
        if (rooms[pin] && rooms[pin].hostId === socket.id) {
            rooms[pin].state = 'READY';
            rooms[pin].mode = mode || 'BUZZER';
            rooms[pin].results = [];
            io.to(pin).emit('game_state_update', { state: 'READY', mode: rooms[pin].mode, results: [] });
        }
    });

    // Host manually stops MCQ, TEXT, DRAW round
    socket.on('host_stop', (pin) => {
        if (rooms[pin] && rooms[pin].hostId === socket.id) {
            rooms[pin].state = 'FINISHED';
            io.to(pin).emit('game_state_update', { state: 'FINISHED', mode: rooms[pin].mode, results: rooms[pin].results });
        }
    });

    socket.on('host_reset', (pin) => {
        if (rooms[pin] && rooms[pin].hostId === socket.id) {
            rooms[pin].state = 'WAITING';
            rooms[pin].results = [];
            io.to(pin).emit('game_state_update', { state: 'WAITING', mode: rooms[pin].mode, results: [] });
        }
    });

    // Handle universal answers
    socket.on('submit_answer', (data) => {
        const pin = socket.pin;
        if (!pin || !rooms[pin] || rooms[pin].state !== 'READY') return;
        
        const room = rooms[pin];
        
        // Prevent duplicate answers
        if (room.results.find(r => r.id === socket.id)) return;
        
        room.results.push({
            id: socket.id,
            name: socket.playerName,
            time: Date.now(),
            answer: data
        });

        // If BUZZER, it automatically finishes on the first press
        if (room.mode === 'BUZZER') {
            room.state = 'FINISHED';
            io.to(pin).emit('game_state_update', { state: 'FINISHED', mode: room.mode, results: room.results });
        } else {
            // For other modes, notify host live, but game continues until host stops
            io.to(room.hostId).emit('live_result_update', room.results);
            socket.emit('answer_received');
        }
    });

    socket.on('disconnect', () => {
        if (socket.pin && rooms[socket.pin]) {
            delete rooms[socket.pin].players[socket.id];
            io.to(rooms[socket.pin].hostId).emit('player_list_update', Object.values(rooms[socket.pin].players));
        } else {
            for (const [pin, room] of Object.entries(rooms)) {
                if (room.hostId === socket.id) {
                    io.to(pin).emit('error_alert', '出題者已離線，課程已結束。');
                    delete rooms[pin];
                    break;
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Classroom Interaction Server listening on port ${PORT}`);
});
