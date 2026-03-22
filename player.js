const socket = io();
const nickname = localStorage.getItem('buzzer_nickname');
const pin = localStorage.getItem('buzzer_pin');

if (!nickname || !pin) window.location.href = '/';

const statusText = document.getElementById('statusText');
const container = document.getElementById('playerContainer');

let currentState = 'WAITING';
let currentMode = 'BUZZER';
let hasAnswered = false;

// Request to join room
socket.emit('join_room', { pin, name: nickname });

socket.on('error_alert', (msg) => {
    alert(msg);
    localStorage.removeItem('buzzer_pin');
    window.location.href = '/';
});

socket.on('join_success', (data) => {
    currentState = data.state;
    currentMode = data.mode || 'BUZZER';
    updateUI(data.state, currentMode, data.results);
});

socket.on('game_state_update', (data) => {
    currentState = data.state;
    currentMode = data.mode;
    if(data.state === 'READY') {
        hasAnswered = false; // Reset lock for new round
        // clear inputs
        document.getElementById('textAnswer').value = '';
        const canvas = document.getElementById('drawCanvas');
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    updateUI(data.state, currentMode, data.results);
});

socket.on('answer_received', () => {
    hasAnswered = true;
    statusText.textContent = "✅ 已收到你的作答，等待其他人...";
    statusText.style.color = "var(--success-color)";
    document.querySelectorAll('.view-section').forEach(el => {
        el.style.opacity = '0.5';
        el.style.pointerEvents = 'none';
    });
});

function updateUI(state, mode, results) {
    container.className = 'player-container'; 
    
    // Reset all views styling
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('active');
        if(!hasAnswered) {
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
        }
    });

    // Make correct view active
    const activeView = document.getElementById(`view-${mode}`);
    if(activeView) activeView.classList.add('active');
    
    if (state === 'WAITING') {
        container.classList.add('state-waiting');
        statusText.textContent = '等待老師發布下一題...';
        statusText.style.color = 'var(--text-muted)';
        const b = document.getElementById('buzzer');
        if(b) b.textContent = '🔒';
    } 
    else if (state === 'READY') {
        container.classList.add('state-ready');
        
        if (mode === 'BUZZER') {
            document.getElementById('buzzer').textContent = 'GO!';
            statusText.textContent = '🔥 請搶答！';
        } else {
            statusText.textContent = '🔥 請火速作答！';
        }
        statusText.style.color = 'var(--success-color)';
        if ('vibrate' in navigator && !hasAnswered) navigator.vibrate(200);
    } 
    else if (state === 'FINISHED') {
        container.classList.add('state-lost'); // Default tint
        if (mode === 'BUZZER') {
            const winner = results[0];
            const b = document.getElementById('buzzer');
            if (winner && winner.id === socket.id) {
                container.classList.replace('state-lost', 'state-won');
                b.textContent = '👑';
                statusText.textContent = '太棒了！你搶到了第一名';
                statusText.style.color = 'var(--accent-color)';
                if('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
            } else if (winner) {
                b.textContent = '❌';
                statusText.textContent = `慢了一步！被 ${winner.name} 搶走啦`;
                statusText.style.color = 'var(--danger-color)';
            }
        } else {
            statusText.textContent = '⏹️ 作答時間已結束，請看大螢幕成績！';
            statusText.style.color = 'var(--text-main)';
        }
    }
}

/* =========================================
   Event Listeners for 4 Modes
========================================= */

// 1. BUZZER
const buzzer = document.getElementById('buzzer');
if(buzzer){
    buzzer.addEventListener('touchstart', (e) => { e.preventDefault(); buzzer.click(); }, { passive: false });
    buzzer.addEventListener('click', () => {
        if (currentState === 'READY' && !hasAnswered) {
            socket.emit('submit_answer', 'BUZZ');
            buzzer.style.transform = "scale(0.95)";
            setTimeout(() => buzzer.style.transform = "", 100);
        }
    });
}

// 2. MCQ
document.querySelectorAll('.mcq-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (currentState === 'READY' && !hasAnswered) {
            socket.emit('submit_answer', e.target.textContent);
        }
    });
});

// 3. TEXT
document.getElementById('textSubmit').addEventListener('click', () => {
    if (currentState === 'READY' && !hasAnswered) {
        const txt = document.getElementById('textAnswer').value;
        if(txt.trim()) socket.emit('submit_answer', txt.trim());
    }
});

// 4. DRAWING
const canvas = document.getElementById('drawCanvas');
const ctx = canvas.getContext('2d');
// Fill white background natively so toDataURL saves background instead of transparent
ctx.fillStyle = "white";
ctx.fillRect(0, 0, canvas.width, canvas.height);

let isDrawing = false;
canvas.addEventListener('pointerdown', e => {
    if(hasAnswered || currentState !== 'READY') return;
    isDrawing = true;
    ctx.beginPath();
    const rect = canvas.getBoundingClientRect();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
});
canvas.addEventListener('pointermove', e => {
    if (!isDrawing || hasAnswered || currentState !== 'READY') return;
    e.preventDefault(); // Stop touch scrolling
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = "black";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.stroke();
});
window.addEventListener('pointerup', () => isDrawing = false);

document.getElementById('drawClear').addEventListener('click', () => {
    if(!hasAnswered && currentState === 'READY') {
        ctx.fillStyle = "white";
        ctx.fillRect(0,0, canvas.width, canvas.height);
    }
});
document.getElementById('drawSubmit').addEventListener('click', () => {
    if (currentState === 'READY' && !hasAnswered) {
        socket.emit('submit_answer', canvas.toDataURL('image/jpeg', 0.8));
    }
});
