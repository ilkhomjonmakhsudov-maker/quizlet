const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const QUIZ_FILE = path.join(DATA_DIR, 'quizzes.json');
const READY_MS = 3000; // "get ready" countdown before each question opens
const GAME_TTL_MS = 4 * 60 * 60 * 1000; // forget idle games after 4 hours

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

// ---------------------------------------------------------------------------
// Teacher password. Set TEACHER_PASSWORD to protect the dashboard and host
// screen; students only ever use /play, which stays open. With no password
// set (e.g. on the teacher's own laptop) everything is open.
// ---------------------------------------------------------------------------

const PASSWORD = process.env.TEACHER_PASSWORD || '';
const AUTH_COOKIE = 'cq_auth';
const AUTH_TOKEN = crypto.createHmac('sha256', PASSWORD).update('classquiz-teacher').digest('hex');
const TEACHER_PAGES = new Set(['/', '/index.html', '/host', '/host.html']);

function readCookie(header, name) {
  const match = (header || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

function isTeacher(cookieHeader) {
  if (!PASSWORD) return true;
  const token = readCookie(cookieHeader, AUTH_COOKIE);
  return token.length === AUTH_TOKEN.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(AUTH_TOKEN));
}

app.use((req, res, next) => {
  if (isTeacher(req.headers.cookie)) return next();
  if (TEACHER_PAGES.has(req.path)) return res.redirect('/login');
  if (req.path.startsWith('/api/quizzes')) return res.status(401).json({ error: 'Parol kerak.' });
  next();
});

app.post('/api/login', (req, res) => {
  const given = crypto.createHmac('sha256', String(req.body?.password || '')).update('classquiz-teacher').digest('hex');
  if (PASSWORD && !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(AUTH_TOKEN))) {
    // Slow down password guessing.
    return setTimeout(() => res.status(401).json({ error: 'Parol notoʻgʻri.' }), 1000);
  }
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${AUTH_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 60}${secure}`);
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ---------------------------------------------------------------------------
// Quiz storage (a simple JSON file)
// ---------------------------------------------------------------------------

const SAMPLE_QUIZ = {
  id: 'sample',
  title: 'Namuna test: Umumiy bilim',
  questions: [
    {
      text: 'Quyosh sistemasidagi eng katta sayyora qaysi?',
      time: 20,
      image: '',
      options: [
        { text: 'Yer', correct: false },
        { text: 'Yupiter', correct: true },
        { text: 'Saturn', correct: false },
        { text: 'Mars', correct: false },
      ],
    },
    {
      text: 'Dengiz sathida suv 100 °C da qaynaydi.',
      time: 10,
      image: '',
      options: [
        { text: 'Toʻgʻri', correct: true },
        { text: 'Notoʻgʻri', correct: false },
      ],
    },
    {
      text: 'Quyidagilardan qaysilari tub son?',
      time: 30,
      image: '',
      options: [
        { text: '2', correct: true },
        { text: '9', correct: false },
        { text: '13', correct: true },
        { text: '21', correct: false },
      ],
    },
  ],
};

function loadQuizzes() {
  try {
    return JSON.parse(fs.readFileSync(QUIZ_FILE, 'utf8'));
  } catch {
    return [SAMPLE_QUIZ];
  }
}

function saveQuizzes(quizzes) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = QUIZ_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(quizzes, null, 2));
  fs.renameSync(tmp, QUIZ_FILE);
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Returns a clean quiz object, or throws with a message the editor can show.
function sanitizeQuiz(body) {
  const title = String(body?.title || '').trim().slice(0, 120);
  if (!title) throw new Error('Testga nom bering.');
  const rawQuestions = Array.isArray(body?.questions) ? body.questions : [];
  if (!rawQuestions.length) throw new Error('Kamida bitta savol qoʻshing.');

  const questions = rawQuestions.map((q, i) => {
    const text = String(q?.text || '').trim().slice(0, 500);
    if (!text) throw new Error(`${i + 1}-savolning matni yoʻq.`);
    const options = (Array.isArray(q?.options) ? q.options : [])
      .map((o) => ({ text: String(o?.text || '').trim().slice(0, 150), correct: !!o?.correct }))
      .filter((o) => o.text)
      .slice(0, 4);
    if (options.length < 2) throw new Error(`${i + 1}-savolga kamida ikkita javob kerak.`);
    if (!options.some((o) => o.correct)) throw new Error(`${i + 1}-savolda toʻgʻri javob belgilanmagan.`);
    const image = String(q?.image || '').trim().slice(0, 2000);
    return {
      text,
      time: clampInt(q?.time, 5, 240, 20),
      image: /^https?:\/\//i.test(image) ? image : '',
      options,
    };
  });

  return { title, questions };
}

app.get('/api/quizzes', (req, res) => {
  res.json(loadQuizzes().map((q) => ({ id: q.id, title: q.title, count: q.questions.length })));
});

app.get('/api/quizzes/:id', (req, res) => {
  const quiz = loadQuizzes().find((q) => q.id === req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Test topilmadi.' });
  res.json(quiz);
});

app.post('/api/quizzes', (req, res) => {
  try {
    const quiz = { id: crypto.randomUUID(), ...sanitizeQuiz(req.body) };
    const quizzes = loadQuizzes();
    quizzes.push(quiz);
    saveQuizzes(quizzes);
    res.json(quiz);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/quizzes/:id', (req, res) => {
  try {
    const quizzes = loadQuizzes();
    const idx = quizzes.findIndex((q) => q.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Test topilmadi.' });
    quizzes[idx] = { id: req.params.id, ...sanitizeQuiz(req.body) };
    saveQuizzes(quizzes);
    res.json(quizzes[idx]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/quizzes/:id', (req, res) => {
  saveQuizzes(loadQuizzes().filter((q) => q.id !== req.params.id));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Join links
// ---------------------------------------------------------------------------

function lanIp() {
  const candidates = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface || []) {
      if (addr.family === 'IPv4' && !addr.internal) candidates.push(addr.address);
    }
  }
  return (
    candidates.find((a) => a.startsWith('192.168.')) ||
    candidates.find((a) => a.startsWith('10.')) ||
    candidates[0] ||
    'localhost'
  );
}

// The address students should use. If the teacher opened the app via
// localhost, swap in this computer's Wi-Fi address so phones can reach it.
function joinBase(socket) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const host = socket.handshake.headers.host || `localhost:${PORT}`;
  if (/^(localhost|127\.|\[::1\])/i.test(host)) return `http://${lanIp()}:${PORT}`;
  const proto = socket.handshake.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${host}`;
}

// ---------------------------------------------------------------------------
// Live games
// ---------------------------------------------------------------------------

const games = new Map(); // pin -> game

function newPin() {
  let pin;
  do pin = String(crypto.randomInt(100000, 1000000));
  while (games.has(pin));
  return pin;
}

function currentQuestion(game) {
  return game.quiz.questions[game.qIndex];
}

function ranked(game) {
  return [...game.players.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function rankOf(game, playerId) {
  return ranked(game).findIndex((p) => p.id === playerId) + 1;
}

function connectedPlayers(game) {
  return [...game.players.values()].filter((p) => p.connected);
}

function timing(game) {
  const now = Date.now();
  return {
    readyMs: Math.max(0, game.openAt - now),
    remainingMs: Math.max(0, game.closeAt - Math.max(now, game.openAt)),
  };
}

function hostView(game) {
  const q = game.qIndex >= 0 ? currentQuestion(game) : null;
  const showQuestion = q && (game.phase === 'question' || game.phase === 'reveal');
  const view = {
    pin: game.pin,
    joinUrl: game.joinUrl,
    joinBase: game.joinBase,
    qr: game.qr,
    phase: game.phase,
    quizTitle: game.quiz.title,
    qIndex: game.qIndex,
    total: game.quiz.questions.length,
    players: ranked(game).map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      connected: p.connected,
      correctCount: p.history.filter((h) => h && h.correct).length,
    })),
    answeredCount: game.answers.size,
  };
  if (showQuestion) {
    view.question = {
      text: q.text,
      image: q.image,
      time: q.time,
      options: q.options.map((o) => ({
        text: o.text,
        correct: game.phase === 'reveal' ? o.correct : undefined,
      })),
    };
  }
  if (game.phase === 'question') Object.assign(view, timing(game));
  if (game.phase === 'reveal') {
    view.counts = q.options.map(() => 0);
    for (const a of game.answers.values()) view.counts[a.choice]++;
  }
  return view;
}

function playerView(game, player) {
  const view = {
    pin: game.pin,
    phase: game.phase,
    name: player.name,
    score: player.score,
    qIndex: game.qIndex,
    total: game.quiz.questions.length,
  };
  const q = game.qIndex >= 0 ? currentQuestion(game) : null;
  if (game.phase === 'question') {
    const answer = game.answers.get(player.id);
    view.question = { text: q.text, image: q.image, time: q.time, options: q.options.map((o) => o.text) };
    view.answered = answer ? answer.choice : null;
    Object.assign(view, timing(game));
  }
  if (game.phase === 'reveal') {
    const answer = game.answers.get(player.id);
    view.result = {
      answered: !!answer,
      correct: !!answer?.correct,
      points: answer?.points || 0,
      streak: player.streak,
      correctAnswers: q.options.filter((o) => o.correct).map((o) => o.text),
    };
  }
  if (game.phase === 'reveal' || game.phase === 'leaderboard' || game.phase === 'final') {
    view.rank = rankOf(game, player.id);
    view.playerCount = game.players.size;
  }
  return view;
}

function broadcast(game) {
  game.lastActivity = Date.now();
  if (game.hostSocketId) io.to(game.hostSocketId).emit('host:state', hostView(game));
  for (const p of game.players.values()) {
    if (p.socketId) io.to(p.socketId).emit('player:state', playerView(game, p));
  }
}

function startQuestion(game) {
  clearTimeout(game.timer);
  game.qIndex++;
  game.phase = 'question';
  game.answers = new Map();
  const q = currentQuestion(game);
  game.openAt = Date.now() + READY_MS;
  game.closeAt = game.openAt + q.time * 1000;
  game.timer = setTimeout(() => endQuestion(game), game.closeAt - Date.now());
  broadcast(game);
}

function endQuestion(game) {
  if (game.phase !== 'question') return;
  clearTimeout(game.timer);
  for (const p of game.players.values()) {
    if (!game.answers.has(p.id)) {
      p.streak = 0;
      p.history[game.qIndex] = null;
    }
  }
  game.phase = 'reveal';
  broadcast(game);
}

function everyoneAnswered(game) {
  const active = connectedPlayers(game);
  return active.length > 0 && active.every((p) => game.answers.has(p.id));
}

function advance(game) {
  const last = game.qIndex >= game.quiz.questions.length - 1;
  switch (game.phase) {
    case 'lobby':
    case 'leaderboard':
      startQuestion(game);
      break;
    case 'question':
      endQuestion(game);
      break;
    case 'reveal':
      game.phase = last ? 'final' : 'leaderboard';
      broadcast(game);
      break;
  }
}

function closeGame(game) {
  clearTimeout(game.timer);
  io.to(`game:${game.pin}`).emit('game:ended');
  games.delete(game.pin);
}

setInterval(() => {
  const now = Date.now();
  for (const game of games.values()) {
    if (now - game.lastActivity > GAME_TTL_MS) closeGame(game);
  }
}, 10 * 60 * 1000);

io.on('connection', (socket) => {
  const hostGame = () => {
    const game = games.get(socket.data.hostPin);
    return game && game.hostSocketId === socket.id ? game : null;
  };

  // ----- Host -----

  socket.on('host:create', async ({ quizId } = {}, ack = () => {}) => {
    if (!isTeacher(socket.handshake.headers.cookie)) return ack({ error: 'Parol kerak.' });
    const quiz = loadQuizzes().find((q) => q.id === quizId);
    if (!quiz) return ack({ error: 'Test topilmadi.' });
    const pin = newPin();
    const base = joinBase(socket);
    const joinUrl = `${base}/play?pin=${pin}`;
    const game = {
      pin,
      hostKey: crypto.randomUUID(),
      hostSocketId: socket.id,
      quiz: structuredClone(quiz),
      players: new Map(),
      phase: 'lobby',
      qIndex: -1,
      answers: new Map(),
      joinBase: base,
      joinUrl,
      qr: await QRCode.toDataURL(joinUrl, { margin: 1, width: 480 }),
      lastActivity: Date.now(),
    };
    games.set(pin, game);
    socket.data.hostPin = pin;
    ack({ pin, hostKey: game.hostKey });
    broadcast(game);
  });

  socket.on('host:resume', ({ pin, hostKey } = {}, ack = () => {}) => {
    if (!isTeacher(socket.handshake.headers.cookie)) return ack({ error: 'Parol kerak.' });
    const game = games.get(String(pin));
    if (!game || game.hostKey !== hostKey) return ack({ error: 'Bu oʻyin tugagan.' });
    game.hostSocketId = socket.id;
    socket.data.hostPin = game.pin;
    ack({ ok: true });
    broadcast(game);
  });

  // `from` is the phase the host is looking at, so a double press can't skip a screen.
  socket.on('host:next', ({ from } = {}) => {
    const game = hostGame();
    if (game && game.phase === from) advance(game);
  });

  socket.on('host:kick', ({ playerId } = {}) => {
    const game = hostGame();
    const player = game?.players.get(playerId);
    if (!player) return;
    game.players.delete(playerId);
    game.answers.delete(playerId);
    if (player.socketId) {
      io.to(player.socketId).emit('player:kicked');
      io.sockets.sockets.get(player.socketId)?.leave(`game:${game.pin}`);
    }
    broadcast(game);
  });

  socket.on('host:end', () => {
    const game = hostGame();
    if (game) closeGame(game);
  });

  // ----- Player -----

  socket.on('player:join', ({ pin, name, playerId } = {}, ack = () => {}) => {
    const game = games.get(String(pin || '').trim());
    if (!game) return ack({ error: 'Bu PIN kodli oʻyin topilmadi. Raqamni tekshirib, qayta urinib koʻring.' });
    if (game.phase === 'final') return ack({ error: 'Bu oʻyin allaqachon tugagan.' });

    let player = game.players.get(playerId);
    if (!player) {
      const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 20);
      if (!clean) return ack({ error: 'Ismingizni kiriting.' });
      const taken = [...game.players.values()].some((p) => p.name.toLowerCase() === clean.toLowerCase());
      if (taken) return ack({ error: 'Bu ism band. Familiyangizning birinchi harfini qoʻshib koʻring.' });
      player = { id: crypto.randomUUID(), name: clean, score: 0, streak: 0, history: [] };
      game.players.set(player.id, player);
    }
    player.socketId = socket.id;
    player.connected = true;
    socket.data.pin = game.pin;
    socket.data.playerId = player.id;
    socket.join(`game:${game.pin}`);
    ack({ playerId: player.id, name: player.name });
    broadcast(game);
  });

  socket.on('player:answer', ({ choice } = {}) => {
    const game = games.get(socket.data.pin);
    const player = game?.players.get(socket.data.playerId);
    if (!player || game.phase !== 'question' || game.answers.has(player.id)) return;
    const now = Date.now();
    if (now < game.openAt || now > game.closeAt + 500) return;
    const q = currentQuestion(game);
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return;

    // Correct answers earn 500–1000 points: faster answers earn more.
    const correct = q.options[choice].correct;
    const fraction = Math.min(1, (now - game.openAt) / (q.time * 1000));
    const points = correct ? Math.round(1000 * (1 - fraction / 2)) : 0;
    player.score += points;
    player.streak = correct ? player.streak + 1 : 0;
    const answer = { choice, correct, points };
    game.answers.set(player.id, answer);
    player.history[game.qIndex] = answer;

    if (everyoneAnswered(game)) endQuestion(game);
    else broadcast(game);
  });

  socket.on('disconnect', () => {
    const game = games.get(socket.data.pin);
    const player = game?.players.get(socket.data.playerId);
    if (player && player.socketId === socket.id) {
      player.connected = false;
      player.socketId = null;
      if (game.phase === 'question' && everyoneAnswered(game)) endQuestion(game);
      else broadcast(game);
    }
  });
});

server.listen(PORT, () => {
  const ip = lanIp();
  console.log('\n  ClassQuiz ishga tushdi!\n');
  console.log(`  Oʻqituvchi (shu kompyuterda oching):  http://localhost:${PORT}`);
  console.log(`  Oʻquvchilar (bir xil Wi-Fi):          http://${ip}:${PORT}/play\n`);
});
