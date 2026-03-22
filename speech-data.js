/**
 * Speech Scorer - Data persistence module
 * Stores classrooms and student scores in a JSON file
 */
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'speech-store.json');

function load() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        }
    } catch (e) { console.error('speech-data load error:', e); }
    return { classrooms: {} };
}

function save(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * classrooms = {
 *   [pin]: {
 *     name: string,
 *     pin: string,
 *     teacherPassword: string,
 *     quizItems: [string],
 *     createdAt: string,
 *     students: {
 *       [nickname]: {
 *         nickname: string,
 *         records: [
 *           { sentence, score, grade, heardText, date }
 *         ]
 *       }
 *     }
 *   }
 * }
 */

// ─── Classroom CRUD ───

function createClassroom(name, pin, teacherPassword, quizItems) {
    const data = load();
    if (data.classrooms[pin]) return { ok: false, error: 'PIN 已被使用' };
    data.classrooms[pin] = {
        name,
        pin,
        teacherPassword,
        quizItems: quizItems || [],
        createdAt: new Date().toISOString(),
        students: {}
    };
    save(data);
    return { ok: true };
}

function getClassroom(pin) {
    const data = load();
    return data.classrooms[pin] || null;
}

function updateQuizItems(pin, password, quizItems) {
    const data = load();
    const room = data.classrooms[pin];
    if (!room) return { ok: false, error: '找不到此班級' };
    if (room.teacherPassword !== password) return { ok: false, error: '密碼錯誤' };
    room.quizItems = quizItems;
    save(data);
    return { ok: true };
}

function deleteClassroom(pin, password) {
    const data = load();
    const room = data.classrooms[pin];
    if (!room) return { ok: false, error: '找不到此班級' };
    if (room.teacherPassword !== password) return { ok: false, error: '密碼錯誤' };
    delete data.classrooms[pin];
    save(data);
    return { ok: true };
}

// ─── Student ───

function joinClassroom(pin, nickname) {
    const data = load();
    const room = data.classrooms[pin];
    if (!room) return { ok: false, error: '找不到此班級，請確認 PIN 碼' };
    if (!room.students[nickname]) {
        room.students[nickname] = { nickname, records: [] };
        save(data);
    }
    return { ok: true, className: room.name, quizItems: room.quizItems };
}

function submitScore(pin, nickname, record) {
    const data = load();
    const room = data.classrooms[pin];
    if (!room) return { ok: false, error: '班級不存在' };
    if (!room.students[nickname]) {
        room.students[nickname] = { nickname, records: [] };
    }
    room.students[nickname].records.push({
        ...record,
        date: new Date().toISOString()
    });
    save(data);
    return { ok: true };
}

// ─── Teacher Dashboard ───

function getStudentRecords(pin, password) {
    const data = load();
    const room = data.classrooms[pin];
    if (!room) return { ok: false, error: '找不到此班級' };
    if (room.teacherPassword !== password) return { ok: false, error: '密碼錯誤' };
    return { ok: true, classroom: room };
}

function deleteStudentRecords(pin, password, nickname) {
    const data = load();
    const room = data.classrooms[pin];
    if (!room) return { ok: false, error: '找不到此班級' };
    if (room.teacherPassword !== password) return { ok: false, error: '密碼錯誤' };
    if (room.students[nickname]) {
        room.students[nickname].records = [];
        save(data);
    }
    return { ok: true };
}

module.exports = {
    createClassroom, getClassroom, updateQuizItems, deleteClassroom,
    joinClassroom, submitScore, getStudentRecords, deleteStudentRecords
};
