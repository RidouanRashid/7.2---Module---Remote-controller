/* ═══════════════════════════════════════════════════════
   SECTIE 0 — BEVEILIGING: controleer of PeerJS geladen is
   ═══════════════════════════════════════════════════════ */
if (typeof Peer === 'undefined') {
  document.body.innerHTML = '<div style="color:#f87171;padding:48px;font-family:monospace;font-size:1.2em;text-align:center;">' +
    'Failed to load PeerJS library.<br>Check your internet connection and reload.</div>';
  throw new Error('PeerJS not loaded');
}

/* ═══════════════════════════════════════════════════════
   SECTIE 1 — CONSTANTEN: alle mogelijke spelacties
   ═══════════════════════════════════════════════════════ */
const ACTIONS = {
  LEFT:'left', RIGHT:'right', ROTATE:'rotate',
  SOFT_DROP:'softDrop', HARD_DROP:'hardDrop',
  HOLD:'hold', PAUSE:'pause'
};

/* ═══════════════════════════════════════════════════════
   SECTIE 2 — UI HULPFUNCTIES: schermen tonen/verbergen,
   terug-knop, statusbalk en toast-meldingen
   ═══════════════════════════════════════════════════════ */
const ui = (function () {
  const ids = ['begin-screen','host-lobby','host-game','host-results',
               'controller-join','controller-waiting','controller-view','controller-gameover'];
  const els = {};
  ids.forEach(function(id) { els[id] = document.getElementById(id); });

  const backBtn  = document.getElementById('back-btn');
  const hostBar  = document.getElementById('host-status-bar');
  const toastEl  = document.getElementById('toast');
  let toastTmr = null;

  function hideAll() {
    ids.forEach(function(id) {
      els[id].style.display = 'none';
      els[id].classList.remove('hidden');
    });
    hostBar.style.display = 'none';
  }
  function show(id) {
    els[id].style.display = 'flex';
  }
  function showBack() { backBtn.style.display = 'block'; }
  function showHostBar() { hostBar.style.display = 'flex'; }
  function toast(msg, dur) {
    toastEl.textContent = msg;
    toastEl.classList.add('visible');
    clearTimeout(toastTmr);
    toastTmr = setTimeout(function() { toastEl.classList.remove('visible'); }, dur || 3000);
  }

  backBtn.addEventListener('click', function() { window.location.href = 'index.html'; });

  return { hideAll, show, showBack, showHostBar, toast };
})();

/* ═══════════════════════════════════════════════════════
   SECTIE 3 — NETWERKBEHEER: peer-to-peer verbinding via
   PeerJS, ondersteunt meerdere spelers tegelijk
   ═══════════════════════════════════════════════════════ */
const networkManager = (function () {
  let peer = null;
  let role = null;
  let roomCode = null;
  let callbacks = {};

  /* Host: lijst van verbonden spelers */
  let players = [];   // [{conn, name, connected}]
  /* Controller: enkele verbinding met de host */
  let conn = null;

  function generateCode() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += c.charAt(Math.floor(Math.random() * c.length));
    return s;
  }
  function fullId(code) { return 'tetris-rc-' + code; }

  /* ── HOST: start een lobby en luister naar inkomende verbindingen ── */
  function hostStart(cbs) {
    role = 'host';
    callbacks = cbs;
    roomCode = generateCode();
    console.log('[host] Room:', roomCode);

    peer = new Peer(fullId(roomCode), { debug: 2 });

    peer.on('open', function() {
      console.log('[host] Peer open');
      if (callbacks.onReady) callbacks.onReady(roomCode);
    });

    peer.on('connection', function(dc) {
      let wired = false;
      function wire() {
        if (wired) return;
        wired = true;
        const idx = players.length;
        const player = { conn: dc, name: 'Player ' + (idx + 1), connected: true };
        players.push(player);
        console.log('[host] Player joined:', player.name);

        dc.on('data', function(data) {
          if (callbacks.onPlayerMessage) callbacks.onPlayerMessage(idx, data);
        });
        dc.on('close', function() {
          console.log('[host] Player left:', player.name);
          player.connected = false;
          if (callbacks.onPlayerLeave) callbacks.onPlayerLeave(idx);
        });
        dc.on('error', function() { player.connected = false; });

        if (callbacks.onPlayerJoin) callbacks.onPlayerJoin(idx, player);
      }
      dc.on('open', wire);
      if (dc.open) wire();
    });

    peer.on('error', function(err) {
      console.error('[host] Error:', err.type, err);
      if (err.type === 'unavailable-id') {
        peer.destroy();
        roomCode = generateCode();
        peer = new Peer(fullId(roomCode), { debug: 2 });
        peer.on('open', function() { if (callbacks.onReady) callbacks.onReady(roomCode); });
        peer.on('connection', function(dc) {
          /* zelfde bedrading — vereenvoudigd bij botsing van kamercode */
        });
      }
    });
  }

  /* ── CONTROLLER: maak verbinding met een bestaande host-kamer ── */
  function controllerJoin(code, cbs) {
    role = 'controller';
    callbacks = cbs;
    roomCode = code.toUpperCase().trim();
    console.log('[ctrl] Joining:', roomCode);

    peer = new Peer({ debug: 2 });
    peer.on('open', function() {
      console.log('[ctrl] Peer open, connecting to host…');
      conn = peer.connect(fullId(roomCode), { reliable: true, serialization: 'json' });
      conn.on('open', function() {
        console.log('[ctrl] Connected!');
        if (callbacks.onConnected) callbacks.onConnected();
      });
      conn.on('data', function(data) {
        console.log('[ctrl] Data:', data);
        if (callbacks.onMessage) callbacks.onMessage(data);
      });
      conn.on('close', function() {
        console.log('[ctrl] Disconnected');
        if (callbacks.onDisconnected) callbacks.onDisconnected();
      });
      conn.on('error', function(err) {
        console.error('[ctrl] Conn error:', err);
      });
    });
    peer.on('error', function(err) {
      console.error('[ctrl] Peer error:', err.type);
      if (callbacks.onError) callbacks.onError(err);
    });
  }

  function sendToAll(data) {
    players.forEach(function(p) {
      if (p.conn && p.conn.open) p.conn.send(data);
    });
  }
  function sendToPlayer(idx, data) {
    const p = players[idx];
    if (p && p.conn && p.conn.open) p.conn.send(data);
  }
  function controllerSend(data) {
    if (conn && conn.open) conn.send(data);
  }
  function getPlayers() { return players; }
  function getRoomCode() { return roomCode; }
  function resetPlayers() { players = []; }

  function destroy() {
    if (conn) try { conn.close(); } catch(_){}
    players.forEach(function(p) { try { p.conn.close(); } catch(_){} });
    if (peer) try { peer.destroy(); } catch(_){}
    peer = null; conn = null; players = [];
  }

  return {
    hostStart, controllerJoin,
    sendToAll, sendToPlayer,
    controllerSend,
    getPlayers, getRoomCode,
    resetPlayers, destroy
  };
})();

/* ═══════════════════════════════════════════════════════
   SECTIE 4 — TETRIS SPEL FABRIEK: maakt een volledig
   Tetris-spel aan met canvas, logica en besturing
   ═══════════════════════════════════════════════════════ */
function createTetrisGame(opts) {
  const canvas = opts.canvas;
  const ctx = canvas.getContext('2d');
  const holdCanvas = opts.holdCanvas;
  const nextCanvas = opts.nextCanvas;
  const onScoreUpdate = opts.onScoreUpdate || function(){};
  const onGameOver = opts.onGameOver || function(){};

  const COLS = 10, ROWS = 20, BLOCK = 32;
  const COLORS = ['#2a2a3a','#40f8f8','#5090ff','#ffc040','#f8f860','#60e860','#c060ff','#ff5060'];
  const SHAPES = [
    [],
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[2,0,0],[2,2,2],[0,0,0]],
    [[0,0,3],[3,3,3],[0,0,0]],
    [[4,4],[4,4]],
    [[0,5,5],[5,5,0],[0,0,0]],
    [[0,6,0],[6,6,6],[0,0,0]],
    [[7,7,0],[0,7,7],[0,0,0]]
  ];

  let bag = [];
  function refillBag() {
    bag = [1,2,3,4,5,6,7];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = bag[i]; bag[i] = bag[j]; bag[j] = t;
    }
  }
  function nextType() { if (!bag.length) refillBag(); return bag.pop(); }

  const S = {
    board:null, cur:null, next:null, hold:null,
    canHold:true, score:0, lines:0,
    interval:600, timer:null, over:false, paused:false
  };

  function resetBoard() {
    S.board = [];
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) row.push(0);
      S.board.push(row);
    }
  }

  function makePiece(type) {
    return { type, shape:SHAPES[type].map(function(r){return r.slice();}), x:3, y:0 };
  }
  function randomPiece() { return makePiece(nextType()); }

  /* ── Tekenen: blok, bord, stuk, mini-preview en volledige weergave ── */
  function drawBlock(x, y, ci) {
    ctx.fillStyle = COLORS[ci];
    ctx.fillRect(x*BLOCK, y*BLOCK, BLOCK-2, BLOCK-2);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
    ctx.strokeRect(x*BLOCK, y*BLOCK, BLOCK-2, BLOCK-2);
  }
  function drawBoard() {
    ctx.fillStyle = COLORS[0];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (S.board[y][x]) drawBlock(x, y, S.board[y][x]);
    ctx.strokeStyle = '#1a1a2e';
    for (let gx = 0; gx <= COLS; gx++) {
      ctx.beginPath(); ctx.moveTo(gx*BLOCK,0); ctx.lineTo(gx*BLOCK,ROWS*BLOCK); ctx.stroke();
    }
    for (let gy = 0; gy <= ROWS; gy++) {
      ctx.beginPath(); ctx.moveTo(0,gy*BLOCK); ctx.lineTo(COLS*BLOCK,gy*BLOCK); ctx.stroke();
    }
  }
  function drawPiece(p, ghost) {
    for (let r = 0; r < p.shape.length; r++)
      for (let c = 0; c < p.shape[r].length; c++)
        if (p.shape[r][c]) {
          ctx.globalAlpha = ghost ? 0.25 : 1;
          drawBlock(p.x+c, p.y+r, p.shape[r][c]);
          ctx.globalAlpha = 1;
        }
  }
  function drawMini(cv, piece) {
    const cx = cv.getContext('2d');
    cx.fillStyle = '#111';
    cx.fillRect(0, 0, cv.width, cv.height);
    if (!piece) return;
    const sz = 13;
    const ox = (cv.width  - piece.shape[0].length * sz) / 2;
    const oy = (cv.height - piece.shape.length * sz) / 2;
    for (let r = 0; r < piece.shape.length; r++)
      for (let c = 0; c < piece.shape[r].length; c++)
        if (piece.shape[r][c]) {
          cx.fillStyle = COLORS[piece.shape[r][c]];
          cx.fillRect(ox + c*sz, oy + r*sz, sz-1, sz-1);
        }
  }
  function draw() {
    if (S.over) return;
    drawBoard();
    let gy = S.cur.y;
    while (valid(S.cur, 0, gy - S.cur.y + 1)) gy++;
    drawPiece({ shape:S.cur.shape, x:S.cur.x, y:gy }, true);
    drawPiece(S.cur, false);
    if (S.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 36px monospace'; ctx.textAlign = 'center';
      ctx.fillText('PAUSED', canvas.width/2, canvas.height/2);
      ctx.textAlign = 'start';
    }
    if (opts.onDraw) opts.onDraw(getFullState());
  }
  function drawGameOverOverlay() {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 40px monospace'; ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width/2, canvas.height/2 - 20);
    ctx.fillStyle = '#e2e8f0'; ctx.font = '20px monospace';
    ctx.fillText('Score: ' + S.score, canvas.width/2, canvas.height/2 + 20);
    ctx.textAlign = 'start';
    if (opts.onDraw) opts.onDraw(getFullState());
  }
  function getFullState() {
    var ghostY = S.cur ? S.cur.y : 0;
    if (S.cur && !S.over) {
      while (valid(S.cur, 0, ghostY - S.cur.y + 1)) ghostY++;
    }
    return {
      board: S.board,
      cur: S.cur ? { shape: S.cur.shape, x: S.cur.x, y: S.cur.y } : null,
      ghostY: ghostY,
      hold: S.hold ? { shape: S.hold.shape } : null,
      next: S.next ? { shape: S.next.shape } : null,
      score: S.score,
      lines: S.lines,
      paused: S.paused,
      over: S.over
    };
  }

  /* ── Logica: botsingsdetectie, rijen wissen, draaien, laten vallen ── */
  function valid(p, ox, oy, shape) {
    ox = ox||0; oy = oy||0; shape = shape || p.shape;
    for (let r = 0; r < shape.length; r++)
      for (let c = 0; c < shape[r].length; c++)
        if (shape[r][c]) {
          const nx = p.x+c+ox, ny = p.y+r+oy;
          if (nx<0||nx>=COLS||ny>=ROWS) return false;
          if (ny>=0 && S.board[ny][nx]) return false;
        }
    return true;
  }
  function merge(p) {
    for (let r = 0; r < p.shape.length; r++)
      for (let c = 0; c < p.shape[r].length; c++)
        if (p.shape[r][c]) {
          const ny = p.y+r;
          if (ny>=0) S.board[ny][p.x+c] = p.shape[r][c];
        }
  }
  function clearLines() {
    let cleared = 0;
    for (let y = ROWS-1; y >= 0; y--) {
      if (S.board[y].every(function(v){return v;})) {
        S.board.splice(y,1);
        S.board.unshift(new Array(COLS).fill(0));
        cleared++; y++;
      }
    }
    if (cleared) {
      S.score += cleared * 100;
      S.lines += cleared;
      const level = Math.floor(S.lines / 10);
      S.interval = Math.max(100, 600 - level * 50);
      onScoreUpdate(S.score, S.lines);
    }
  }
  function rotateMat(p, dir) {
    const s = p.shape, n = s.length;
    const r = [];
    for (let y=0;y<n;y++){r.push([]);for(let x=0;x<n;x++)r[y].push(0);}
    for (let y=0;y<n;y++) for(let x=0;x<n;x++){
      if(dir>0) r[x][n-1-y]=s[y][x]; else r[n-1-x][y]=s[y][x];
    }
    return r;
  }
  function tryRotate(dir) {
    const kicks = [[0,0],[-1,0],[1,0],[0,-1],[0,1]];
    for (let i=0;i<kicks.length;i++) {
      const r = rotateMat(S.cur, dir);
      if (valid(S.cur, kicks[i][0], kicks[i][1], r)) {
        S.cur.shape = r; S.cur.x += kicks[i][0]; S.cur.y += kicks[i][1];
        return true;
      }
    }
    return false;
  }
  function hardDrop() { while(valid(S.cur,0,1)) S.cur.y++; step(); }
  function holdPiece() {
    if (!S.canHold) return;
    if (!S.hold) {
      S.hold = makePiece(S.cur.type);
      S.cur = S.next; S.next = randomPiece();
    } else {
      const ht = S.hold.type;
      S.hold = makePiece(S.cur.type);
      S.cur = makePiece(ht);
    }
    S.canHold = false;
    drawMini(holdCanvas, S.hold);
    draw();
  }
  function togglePause() {
    if (S.over) return;
    S.paused = !S.paused;
    if (S.paused) clearTimeout(S.timer);
    else S.timer = setTimeout(tick, S.interval);
    draw();
  }
  function step() {
    if (valid(S.cur,0,1)) { S.cur.y++; }
    else {
      merge(S.cur); clearLines();
      S.cur = S.next; S.next = randomPiece();
      S.canHold = true;
      drawMini(nextCanvas, S.next);
      if (!valid(S.cur)) {
        S.over = true;
        drawBoard();
        drawPiece(S.cur, false);
        drawGameOverOverlay();
        onGameOver();
        return;
      }
    }
    draw();
  }
  function tick() {
    if (S.over || S.paused) return;
    step();
    S.timer = setTimeout(tick, S.interval);
  }

  /* ── Publieke functies: start, actie verwerken, opruimen ── */
  function start() {
    resetBoard(); refillBag();
    S.cur = randomPiece(); S.next = randomPiece();
    S.hold = null; S.canHold = true;
    S.score = 0; S.lines = 0; S.interval = 600;
    S.over = false; S.paused = false;
    onScoreUpdate(0, 0);
    drawMini(holdCanvas, null);
    drawMini(nextCanvas, S.next);
    draw();
    clearTimeout(S.timer);
    S.timer = setTimeout(tick, S.interval);
  }
  function handleAction(action) {
    if (S.over) return;
    if (action === ACTIONS.PAUSE)     { togglePause(); return; }
    if (action === ACTIONS.HOLD)      { holdPiece(); return; }
    if (S.paused) return;
    switch (action) {
      case ACTIONS.LEFT:      if(valid(S.cur,-1,0)){S.cur.x--;draw();} break;
      case ACTIONS.RIGHT:     if(valid(S.cur, 1,0)){S.cur.x++;draw();} break;
      case ACTIONS.ROTATE:    tryRotate(1); draw(); break;
      case ACTIONS.SOFT_DROP: if(valid(S.cur,0,1)){S.cur.y++;draw();} break;
      case ACTIONS.HARD_DROP: hardDrop(); break;
    }
  }
  function cleanup() { clearTimeout(S.timer); }

  return {
    start, handleAction, cleanup, getFullState,
    isOver:function(){return S.over;},
    getScore:function(){return S.score;},
    getLines:function(){return S.lines;},
    forceStop:function(){ S.over=true; cleanup(); drawGameOverOverlay(); onGameOver(); }
  };
}

/* ═══════════════════════════════════════════════════════
   SECTIE 5 — CONTROLLER STUURKNOPPEN: touch D-pad
   knoppen met herhaling voor mobiele besturing
   ═══════════════════════════════════════════════════════ */
const controllerPad = (function () {
  const REPEAT_DELAY = 170, REPEAT_RATE = 55;
  let repeatTimeout = null, repeatInterval = null;
  let wired = false;

  function init() {
    if (wired) return;
    wired = true;
    const btns = document.querySelectorAll('#controller-view .btn[data-action]');
    for (let i = 0; i < btns.length; i++) wireButton(btns[i]);
  }
  function wireButton(btn) {
    const action  = btn.getAttribute('data-action');
    const repeats = btn.getAttribute('data-repeat') === 'true';
    btn.addEventListener('pointerdown', function(e) {
      e.preventDefault();
      btn.classList.add('pressed');
      if (repeats) startRepeat(action); else sendAction(action);
    });
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
    function release() { btn.classList.remove('pressed'); if(repeats) stopRepeat(); }
  }
  function sendAction(action) { networkManager.controllerSend({ action }); }
  function startRepeat(action) {
    sendAction(action);
    repeatTimeout = setTimeout(function() {
      repeatInterval = setInterval(function() { sendAction(action); }, REPEAT_RATE);
    }, REPEAT_DELAY);
  }
  function stopRepeat() {
    clearTimeout(repeatTimeout); clearInterval(repeatInterval);
    repeatTimeout = null; repeatInterval = null;
  }
  function cleanup() { stopRepeat(); }
  return { init, cleanup };
})();

/* ═══════════════════════════════════════════════════════
   SECTIE 5b — CONTROLLER MINISCHERM: tekent een
   verkleind Tetris-bord op het scherm van de controller
   ═══════════════════════════════════════════════════════ */
const controllerMiniScreen = (function () {
  const COLORS = ['#2a2a3a','#40f8f8','#5090ff','#ffc040','#f8f860','#60e860','#c060ff','#ff5060'];
  const COLS = 10, ROWS = 20;

  var boardCv, boardCtx, holdCv, nextCv, scoreEl, linesEl;
  var ready = false;

  function init() {
    boardCv  = document.getElementById('ctrl-board-cv');
    boardCtx = boardCv.getContext('2d');
    holdCv   = document.getElementById('ctrl-hold-cv');
    nextCv   = document.getElementById('ctrl-next-cv');
    scoreEl  = document.getElementById('ctrl-score');
    linesEl  = document.getElementById('ctrl-lines');
    ready = true;
  }

  function render(state) {
    if (!ready) init();
    var BLK = boardCv.width / COLS;

    /* speelbord tekenen */
    boardCtx.fillStyle = COLORS[0];
    boardCtx.fillRect(0, 0, boardCv.width, boardCv.height);
    for (var y = 0; y < ROWS; y++)
      for (var x = 0; x < COLS; x++)
        if (state.board[y][x]) {
          boardCtx.fillStyle = COLORS[state.board[y][x]];
          boardCtx.fillRect(x * BLK, y * BLK, BLK - 1, BLK - 1);
        }

    /* spookstuk (voorvertoning waar het blok landt) */
    if (state.cur && !state.over) {
      boardCtx.globalAlpha = 0.25;
      drawShape(boardCtx, state.cur.shape, state.cur.x, state.ghostY, BLK);
      boardCtx.globalAlpha = 1;
    }

    /* huidig stuk */
    if (state.cur && !state.over) {
      drawShape(boardCtx, state.cur.shape, state.cur.x, state.cur.y, BLK);
    }

    /* pauze-overlay */
    if (state.paused) {
      boardCtx.fillStyle = 'rgba(0,0,0,0.55)';
      boardCtx.fillRect(0, 0, boardCv.width, boardCv.height);
      boardCtx.fillStyle = '#fff'; boardCtx.font = 'bold 16px monospace'; boardCtx.textAlign = 'center';
      boardCtx.fillText('PAUSED', boardCv.width / 2, boardCv.height / 2);
      boardCtx.textAlign = 'start';
    }

    /* spel voorbij overlay */
    if (state.over) {
      boardCtx.fillStyle = 'rgba(0,0,0,0.6)';
      boardCtx.fillRect(0, 0, boardCv.width, boardCv.height);
      boardCtx.fillStyle = '#fbbf24'; boardCtx.font = 'bold 16px monospace'; boardCtx.textAlign = 'center';
      boardCtx.fillText('GAME OVER', boardCv.width / 2, boardCv.height / 2);
      boardCtx.textAlign = 'start';
    }

    /* vasthouden & volgende */
    drawMiniPiece(holdCv, state.hold);
    drawMiniPiece(nextCv, state.next);

    /* score en lijnen bijwerken */
    scoreEl.textContent = 'Score: ' + state.score;
    linesEl.textContent  = 'Lines: ' + state.lines;
  }

  function drawShape(cx, shape, px, py, blk) {
    for (var r = 0; r < shape.length; r++)
      for (var c = 0; c < shape[r].length; c++)
        if (shape[r][c]) {
          cx.fillStyle = COLORS[shape[r][c]];
          cx.fillRect((px + c) * blk, (py + r) * blk, blk - 1, blk - 1);
        }
  }

  function drawMiniPiece(cv, piece) {
    var cx = cv.getContext('2d');
    cx.fillStyle = '#111';
    cx.fillRect(0, 0, cv.width, cv.height);
    if (!piece || !piece.shape) return;
    var sz = 13;
    var ox = (cv.width  - piece.shape[0].length * sz) / 2;
    var oy = (cv.height - piece.shape.length * sz) / 2;
    for (var r = 0; r < piece.shape.length; r++)
      for (var c = 0; c < piece.shape[r].length; c++)
        if (piece.shape[r][c]) {
          cx.fillStyle = COLORS[piece.shape[r][c]];
          cx.fillRect(ox + c * sz, oy + r * sz, sz - 1, sz - 1);
        }
  }

  return { init: init, render: render };
})();

/* ═══════════════════════════════════════════════════════
   SECTIE 6 — PAGINAVERLOOP: koppelt alle schermen,
   regelt host-lobby, spelstart, resultaten en controller
   ═══════════════════════════════════════════════════════ */
(function () {
  const pillCode     = document.getElementById('pill-code');
  const pillPlayers  = document.getElementById('pill-players');
  const playerListEl = document.getElementById('player-list');
  const startBtn     = document.getElementById('start-game-btn');
  const gamesGrid    = document.getElementById('games-grid');

  let games = [];
  let gameCards = [];

  /* ── Hulpfunctie: bouw een spelkaart-DOM per speler ── */
  function createGameCard(name) {
    const card = document.createElement('div');
    card.className = 'game-card';

    const nameEl = document.createElement('div');
    nameEl.className = 'game-player-name';
    nameEl.textContent = name;

    const infoRow = document.createElement('div');
    infoRow.className = 'game-info-row';

    function makeMini(label) {
      const box = document.createElement('div');
      box.className = 'mini-box';
      const sp = document.createElement('span');
      sp.textContent = label;
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 64;
      cv.className = 'mini-canvas';
      box.appendChild(sp);
      box.appendChild(cv);
      return { box, canvas:cv };
    }

    const holdMini = makeMini('Hold');
    const nextMini = makeMini('Next');
    infoRow.appendChild(holdMini.box);
    infoRow.appendChild(nextMini.box);

    const cv = document.createElement('canvas');
    cv.width = 320; cv.height = 640;
    cv.className = 'game-canvas';

    const scoreRow = document.createElement('div');
    scoreRow.className = 'game-score-row';
    const scoreSp = document.createElement('span');
    scoreSp.textContent = 'Score: 0';
    const linesSp = document.createElement('span');
    linesSp.textContent = 'Lines: 0';
    scoreRow.appendChild(scoreSp);
    scoreRow.appendChild(linesSp);

    card.appendChild(nameEl);
    card.appendChild(infoRow);
    card.appendChild(cv);
    card.appendChild(scoreRow);

    return {
      element: card, canvas: cv,
      holdCanvas: holdMini.canvas, nextCanvas: nextMini.canvas,
      scoreSpan: scoreSp, linesSpan: linesSp
    };
  }

  /* ── Lobby spelerlijst bijwerken ── */
  function updateLobbyList() {
    const pp = networkManager.getPlayers();
    playerListEl.innerHTML = '';
    if (!pp.length) {
      playerListEl.innerHTML = '<div class="player-list-empty">Waiting for players to connect…</div>';
      startBtn.disabled = true;
      return;
    }
    pp.forEach(function(p) {
      if (!p.connected) return;
      const el = document.createElement('div');
      el.className = 'player-entry';
      el.innerHTML = '<span class="player-dot">●</span> <span>' + p.name + '</span>';
      playerListEl.appendChild(el);
    });
    const active = pp.filter(function(p){return p.connected;}).length;
    startBtn.disabled = active === 0;
    pillPlayers.textContent = active + ' player' + (active !== 1 ? 's' : '');
  }

  /* ──────────────────────
     HOST VERLOOP: lobby, spel starten, resultaten
     ────────────────────── */
  document.getElementById('btn-host').addEventListener('click', goHostLobby);
  startBtn.addEventListener('click', startAllGames);
  document.getElementById('play-again-btn').addEventListener('click', backToLobby);
  document.getElementById('exit-btn').addEventListener('click', function() {
    window.location.href = 'index.html';
  });

  function goHostLobby() {
    ui.hideAll();
    ui.show('host-lobby');
    ui.showBack();
    networkManager.hostStart({
      onReady: function(code) {
        document.getElementById('room-code-display').textContent = code;
        pillCode.textContent = code;
      },
      onPlayerJoin: function(idx, player) {
        updateLobbyList();
      },
      onPlayerLeave: function(idx) {
        updateLobbyList();
        /* Als midden in spel en dit spelersspel bestaat, stop het */
        if (games[idx] && !games[idx].isOver()) {
          games[idx].forceStop();
          if (gameCards[idx]) gameCards[idx].element.classList.add('is-over');
          checkAllOver();
        }
      },
      onPlayerMessage: function(idx, data) {
        if (!data) return;
        if (data.type === 'setName') {
          const pp = networkManager.getPlayers();
          if (pp[idx]) {
            pp[idx].name = (data.name || 'Player').substring(0, 16);
            ui.toast(pp[idx].name + ' joined!', 2000);
            updateLobbyList();
          }
          return;
        }
        if (data.action && games[idx] && !games[idx].isOver()) {
          games[idx].handleAction(data.action);
        }
      }
    });
  }

  function startAllGames() {
    const pp = networkManager.getPlayers().filter(function(p){return p.connected;});
    if (!pp.length) return;

    /* Vorige opruimen */
    games.forEach(function(g){ g.cleanup(); });
    games = [];
    gameCards = [];
    gamesGrid.innerHTML = '';

    /* Grootteklasse op basis van aantal spelers */
    const n = pp.length;
    gamesGrid.className = 'p-' + Math.min(n, 4);

    /* Maak een spel per speler */
    pp.forEach(function(player, i) {
      const card = createGameCard(player.name);
      gamesGrid.appendChild(card.element);
      gameCards.push(card);

      const g = createTetrisGame({
        canvas: card.canvas,
        holdCanvas: card.holdCanvas,
        nextCanvas: card.nextCanvas,
        onScoreUpdate: function(score, lines) {
          card.scoreSpan.textContent = 'Score: ' + score;
          card.linesSpan.textContent = 'Lines: ' + lines;
        },
        onGameOver: function() {
          card.element.classList.add('is-over');
          /* Zoek de echte index in de volledige spelerlijst */
          const allPlayers = networkManager.getPlayers();
          const realIdx = allPlayers.indexOf(player);
          if (realIdx >= 0) {
            networkManager.sendToPlayer(realIdx, {
              type: 'yourGameOver',
              score: g.getScore(),
              lines: g.getLines()
            });
          }
          checkAllOver();
        },
        onDraw: function(state) {
          /* Stuur de volledige spelstatus naar de controller */
          const allPlayers = networkManager.getPlayers();
          const realIdx = allPlayers.indexOf(player);
          if (realIdx >= 0) {
            networkManager.sendToPlayer(realIdx, {
              type: 'state',
              board: state.board,
              cur: state.cur,
              ghostY: state.ghostY,
              hold: state.hold,
              next: state.next,
              score: state.score,
              lines: state.lines,
              paused: state.paused,
              over: state.over
            });
          }
        }
      });
      games.push(g);
    });

    /* Toon spelweergave */
    ui.hideAll();
    ui.show('host-game');
    ui.showHostBar();
    ui.showBack();

    /* Vertel controllers dat het spel begint */
    networkManager.sendToAll({ type: 'gameStart' });

    /* Start alle spellen */
    games.forEach(function(g) { g.start(); });
  }

  function checkAllOver() {
    if (!games.length) return;
    const allDone = games.every(function(g){return g.isOver();});
    if (allDone) showResults();
  }

  function showResults() {
    const pp = networkManager.getPlayers();
    const results = [];
    const activePlayers = pp.filter(function(p){return p.connected || true;});
    gameCards.forEach(function(card, i) {
      results.push({
        name: games[i] ? (activePlayers[i] ? activePlayers[i].name : 'Player') : 'Player',
        score: games[i] ? games[i].getScore() : 0,
        lines: games[i] ? games[i].getLines() : 0
      });
    });
    results.sort(function(a,b){return b.score - a.score;});

    const list = document.getElementById('results-list');
    list.innerHTML = '';
    results.forEach(function(r, i) {
      const row = document.createElement('div');
      row.className = 'result-row';
      row.innerHTML = '<span class="result-rank">#' + (i+1) + '</span>' +
        '<span class="result-name">' + r.name + '</span>' +
        '<span class="result-score">' + r.score + ' pts</span>';
      list.appendChild(row);
    });

    networkManager.sendToAll({ type: 'roundOver', results });

    setTimeout(function() {
      ui.hideAll();
      ui.show('host-results');
      ui.showBack();
    }, 2000);
  }

  function backToLobby() {
    games.forEach(function(g){g.cleanup();});
    games = [];
    gameCards = [];
    networkManager.sendToAll({ type: 'backToLobby' });
    ui.hideAll();
    ui.show('host-lobby');
    ui.showBack();
    updateLobbyList();
  }

  /* ──────────────────────
     CONTROLLER VERLOOP: verbinden, wachten, spelen
     ────────────────────── */
  document.getElementById('btn-join').addEventListener('click', showJoinForm);
  document.getElementById('connect-btn').addEventListener('click', doJoin);
  document.getElementById('room-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doJoin();
  });

  let savedCode = '';
  let controllerActive = false;

  function showJoinForm() {
    ui.hideAll();
    ui.show('controller-join');
    ui.showBack();
    document.getElementById('room-input').focus();
  }

  function doJoin() {
    const code = document.getElementById('room-input').value.trim().toUpperCase();
    const name = document.getElementById('name-input').value.trim() || 'Player';
    if (code.length < 4) {
      document.getElementById('join-error').textContent = 'Code must be at least 4 characters';
      return;
    }
    savedCode = code;
    document.getElementById('join-error').textContent = '';
    document.getElementById('connect-btn').disabled = true;
    document.getElementById('connect-btn').textContent = 'Connecting…';

    networkManager.controllerJoin(code, {
      onConnected: function() {
        networkManager.controllerSend({ type: 'setName', name });
        ui.hideAll();
        ui.show('controller-waiting');
        ui.showBack();
        document.getElementById('ctrl-room-code').textContent = savedCode;
      },
      onMessage: function(data) {
        if (!data || !data.type) return;
        switch (data.type) {
          case 'gameStart':
            controllerActive = true;
            ui.hideAll();
            ui.show('controller-view');
            ui.showBack();
            controllerPad.init();
            controllerMiniScreen.init();
            document.getElementById('ctrl-status').textContent = 'Connected';
            document.getElementById('ctrl-status').style.background = '#16a34a';
            break;
          case 'state':
            controllerMiniScreen.render(data);
            break;
          case 'yourGameOver':
            controllerActive = false;
            document.getElementById('ctrl-status').textContent = 'Game Over';
            document.getElementById('ctrl-status').style.background = '#b91c1c';
            break;
          case 'roundOver':
            break;
          case 'backToLobby':
            controllerActive = false;
            ui.hideAll();
            ui.show('controller-waiting');
            ui.showBack();
            break;
        }
      },
      onDisconnected: function() {
        ui.toast('Disconnected from host', 4000);
      },
      onError: function(err) {
        let msg = 'Connection failed';
        if (err && err.type === 'peer-unavailable') msg = 'Room not found — check the code';
        document.getElementById('join-error').textContent = msg;
        document.getElementById('connect-btn').disabled = false;
        document.getElementById('connect-btn').textContent = 'Connect';
      }
    });
  }

  /* ── AUTOMATISCHE ROUTE vanuit index.html op basis van ?role= parameter ── */
  const urlRole = new URLSearchParams(window.location.search).get('role');
  if (urlRole === 'host') {
    goHostLobby();
  } else if (urlRole === 'controller') {
    showJoinForm();
  }

  /* ── TOETSENBORD BESTURING: werkt voor host én controller ── */
  const KEY_MAP = {
    ArrowLeft:'left', ArrowRight:'right', ArrowUp:'rotate',
    ArrowDown:'softDrop', ' ':'hardDrop', z:'hold', c:'hold', p:'pause'
  };
  window.addEventListener('keydown', function(e) {
    const action = KEY_MAP[e.key];
    if (!action) return;
    /* Host: directe spelbesturing */
    if (games.length) {
      e.preventDefault();
      games.forEach(function(g) { if (!g.isOver()) g.handleAction(action); });
      return;
    }
    /* Controller: verstuur actie via netwerk naar host */
    if (controllerActive) {
      e.preventDefault();
      networkManager.controllerSend({ action: action });
    }
  });

  /* ── OPRUIMEN: alles netjes afsluiten bij pagina verlaten ── */
  window.addEventListener('beforeunload', function() {
    games.forEach(function(g){g.cleanup();});
    controllerPad.cleanup();
    networkManager.destroy();
  });
})();
