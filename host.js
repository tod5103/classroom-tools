const socket = io();

const playerList = document.getElementById('playerList');
const playerCount = document.getElementById('playerCount');
const roomPinDisplay = document.getElementById('roomPin');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnReset = document.getElementById('btnReset');
const winnerAnnounce = document.getElementById('winnerAnnounce');
const sequenceList = document.getElementById('sequenceList');

let currentGameState = 'WAITING';
let currentPin = null;
let selectedMode = 'BUZZER';

// 設定模式按鈕
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (currentGameState !== 'WAITING') {
            alert('題目進行中無法更改模式！請先回復待命。');
            return;
        }
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        selectedMode = e.target.dataset.mode;
    });
});

// 創建新房間
socket.emit('create_room');

socket.on('room_created', (pin) => {
    currentPin = pin;
    roomPinDisplay.textContent = pin;
    
    // Generate QR Code containing the current host/origin URL
    const baseUrl = window.location.origin;
    const joinUrl = `${baseUrl}/?pin=${pin}`;
    const qrImg = document.getElementById('qrCode');
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(joinUrl)}`;
    qrImg.style.display = 'block';
});

socket.on('error_alert', (msg) => { alert(msg); });

socket.on('player_list_update', (players) => {
    playerCount.textContent = players.length;
    playerList.innerHTML = players.map(p => `<li>${p.name}</li>`).join('');
});

function renderResults(mode, results, isLive) {
    sequenceList.innerHTML = ''; // Clear sequence list by default

    // If live, and not buzzer, usually we just show a counter
    if (isLive && mode !== 'BUZZER') {
        const total = playerCount.textContent;
        winnerAnnounce.innerHTML = `<div style="font-size:2rem; font-weight:normal;">目前收到的作答份數</div><br><span style="font-size:5rem;">${results.length} / ${total}</span>`;
        if(!winnerAnnounce.classList.contains('show')) winnerAnnounce.classList.add('show');
        return;
    }

    if (results.length === 0) {
        winnerAnnounce.innerHTML = '沒有人作答喔！';
        winnerAnnounce.classList.add('show');
        return;
    }

    if (mode === 'BUZZER') {
        const winner = results[0];
        winnerAnnounce.innerHTML = `👑 ${winner.name} 搶到了！`;
        winnerAnnounce.classList.add('show');
        
        if (results.length > 1) {
            sequenceList.innerHTML = results.slice(1).map((r, index) => `
                <div class="sequence-item">
                    <div><span class="rank">#${index + 2}</span> ${r.name}</div>
                    <div style="color:var(--text-muted); font-size:0.9rem;">+${r.time - winner.time}ms</div>
                </div>
            `).join('');
        }
    } else if (mode === 'MCQ') {
        let counts = {A:0, B:0, C:0, D:0};
        results.forEach(r => { if(counts[r.answer] !== undefined) counts[r.answer]++; });
        winnerAnnounce.innerHTML = `
            <div style="font-size:1.5rem; margin-bottom: 2rem;">統整結果 (${results.length} 人作答)</div>
            <div class="result-grid-mcq">
                <div style="color:#e21b3c; text-align:center;"><h2 style="font-size:3rem">A</h2><p style="font-size:1.5rem">${counts.A} 票</p></div>
                <div style="color:#1368ce; text-align:center;"><h2 style="font-size:3rem">B</h2><p style="font-size:1.5rem">${counts.B} 票</p></div>
                <div style="color:#d89e00; text-align:center;"><h2 style="font-size:3rem">C</h2><p style="font-size:1.5rem">${counts.C} 票</p></div>
                <div style="color:#26890c; text-align:center;"><h2 style="font-size:3rem">D</h2><p style="font-size:1.5rem">${counts.D} 票</p></div>
            </div>`;
    } else if (mode === 'TEXT') {
        winnerAnnounce.innerHTML = `
            <div style="font-size:1.5rem; margin-bottom: 1rem;">所有學生的簡答 (${results.length} 份)</div>
            <div class="result-grid-text">` + results.map(r => `
            <div style="background:rgba(255,255,255,0.1); padding:1rem; border-radius:8px; text-align:left; border-left: 5px solid var(--accent-color);">
                <strong style="color:var(--accent-color); font-size:1.1rem; display:block; margin-bottom:5px;">${r.name}:</strong> 
                <span style="font-size:1.3rem;">${r.answer}</span>
            </div>
        `).join('') + `</div>`;
    } else if (mode === 'DRAW') {
        winnerAnnounce.innerHTML = `
            <div style="font-size:1.5rem; margin-bottom: 1rem;">大家的繪圖作品 (${results.length} 份)</div>
            <div class="result-grid-draw">` + results.map((r, i) => `
            <div class="draw-item">
                <img src="${r.answer}" alt="drawing" style="width: 100%; border-radius: 8px; border:2px solid #555;" />
                <div style="margin-top:10px; font-size:1.2rem; font-weight:bold;">${r.name}</div>
            </div>
        `).join('') + `</div>`;
    }
}

// 實時接收：只給 TEXT, MCQ, DRAW 用
socket.on('live_result_update', (results) => {
    if (currentGameState === 'READY') {
        renderResults(selectedMode, results, true);
    }
});

// 核心狀態更新
socket.on('game_state_update', (data) => {
    currentGameState = data.state;
    // Server overrides mode to ensure sync
    selectedMode = data.mode;
    
    // 同步 UI 狀態
    document.querySelectorAll('.mode-btn').forEach(b => {
        b.classList.remove('active');
        if(b.dataset.mode === selectedMode) b.classList.add('active');
    });

    if (data.state === 'WAITING') {
        btnStart.style.display = 'block';
        btnStop.style.display = 'none';
        winnerAnnounce.classList.remove('show');
        winnerAnnounce.innerHTML = '';
        sequenceList.innerHTML = '';
    } 
    else if (data.state === 'READY') {
        btnStart.style.display = 'none';
        // 搶答模式不顯示手動結算，因為會自動結算
        if (selectedMode !== 'BUZZER') {
            btnStop.style.display = 'block';
        }
        winnerAnnounce.innerHTML = '<div style="font-size:2rem; font-weight:normal;">等待學生作答中...</div>';
        winnerAnnounce.classList.add('show');
    }
    else if (data.state === 'FINISHED') {
        btnStart.style.display = 'none';
        btnStop.style.display = 'none';
        renderResults(selectedMode, data.results, false);
        winnerAnnounce.classList.add('show');
    }
});

// 按鈕事件
btnStart.addEventListener('click', () => {
    if (currentGameState === 'WAITING' && currentPin) {
        socket.emit('host_start', { pin: currentPin, mode: selectedMode });
    }
});

btnStop.addEventListener('click', () => {
    if (currentGameState === 'READY' && currentPin) {
        socket.emit('host_stop', currentPin);
    }
});

btnReset.addEventListener('click', () => {
    if (currentPin) {
        socket.emit('host_reset', currentPin);
    }
});
