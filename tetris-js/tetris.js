// Responsive Tetris canvas: schaalt altijd met parent
(function() {
  // --- CONSTANTEN EN DATA ---
  const COLS = 10, ROWS = 20, BLOCK = 32;
  const COLORS = [
    '#222', '#00f0f0', '#0000f0', '#f0a000', '#f0f000', '#00f000', '#a000f0', '#f00000'
  ];
  const SHAPES = [
    [],
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
    [[2,0,0],[2,2,2],[0,0,0]], // J
    [[0,0,3],[3,3,3],[0,0,0]], // L
    [[4,4],[4,4]], // O
    [[0,5,5],[5,5,0],[0,0,0]], // S
    [[0,6,0],[6,6,6],[0,0,0]], // T
    [[7,7,0],[0,7,7],[0,0,0]]  // Z
  ];

  // --- 7-BAG RANDOMIZER ---
  let bag = [];
  function refillBag() {
    bag = [1,2,3,4,5,6,7];
    for(let i=bag.length-1;i>0;i--) {
      const j = Math.floor(Math.random()*(i+1));
      [bag[i],bag[j]] = [bag[j],bag[i]];
    }
  }
  function randomPieceType() {
    if(bag.length===0) refillBag();
    return bag.pop();
  }

  // --- SPELVARIABELEN ---
  let board, current, next, hold = null, canHold = true, score = 0, lines = 0, dropInterval = 600, dropTimer, gameOver = false;
  const canvas = document.getElementById('tetris-canvas');
  const ctx = canvas.getContext('2d');

  // --- INPUT STATE ---
  const keys = { left: false, right: false, down: false };
  let moveTimer = null, moveDelay = 60, moveRepeat = 40;

  // --- SPELFUNCTIES ---
  function resetBoard() {
    board = Array.from({length: ROWS}, () => Array(COLS).fill(0));
  }
  function newPiece(type) {
    return { type, shape: SHAPES[type].map(r=>[...r]), x: 3, y: 0, rot: 0 };
  }
  function randomPiece() {
    return newPiece(randomPieceType());
  }

  // --- TEKENEN ---
  function drawBlock(x, y, colorIdx) {
    ctx.fillStyle = COLORS[colorIdx];
    ctx.fillRect(x*BLOCK, y*BLOCK, BLOCK-2, BLOCK-2);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(x*BLOCK, y*BLOCK, BLOCK-2, BLOCK-2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#111';
    ctx.strokeRect(x*BLOCK, y*BLOCK, BLOCK-2, BLOCK-2);
  }
  function drawBoard() {
    ctx.fillStyle = COLORS[0];
    ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++)
      if(board[y][x]) drawBlock(x, y, board[y][x]);
    ctx.strokeStyle = '#333';
    for(let x=0;x<=COLS;x++) {
      ctx.beginPath(); ctx.moveTo(x*BLOCK,0); ctx.lineTo(x*BLOCK,ROWS*BLOCK); ctx.stroke();
    }
    for(let y=0;y<=ROWS;y++) {
      ctx.beginPath(); ctx.moveTo(0,y*BLOCK); ctx.lineTo(COLS*BLOCK,y*BLOCK); ctx.stroke();
    }
  }
  function drawPiece(p, ox=0, oy=0, ghost=false) {
    for(let y=0;y<p.shape.length;y++)
      for(let x=0;x<p.shape[y].length;x++)
        if(p.shape[y][x]) {
          ctx.globalAlpha = ghost ? 0.3 : 1;
          drawBlock(p.x+x+ox, p.y+y+oy, p.shape[y][x]);
          ctx.globalAlpha = 1;
        }
  }
  function drawHold() {
    const box = document.getElementById('hold-box');
    box.innerHTML = '';
    if(!hold) { box.textContent = 'HOLD'; return; }
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const cx = c.getContext('2d');
    for(let y=0;y<hold.shape.length;y++)
      for(let x=0;x<hold.shape[y].length;x++)
        if(hold.shape[y][x]) {
          cx.fillStyle = COLORS[hold.shape[y][x]];
          cx.fillRect(x*16, y*16, 14, 14);
        }
    box.appendChild(c);
  }
  function drawNext() {
    const box = document.getElementById('next-box');
    box.innerHTML = 'NEXT';
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const cx = c.getContext('2d');
    for(let y=0;y<next.shape.length;y++)
      for(let x=0;x<next.shape[y].length;x++)
        if(next.shape[y][x]) {
          cx.fillStyle = COLORS[next.shape[y][x]];
          cx.fillRect(x*16, y*16, 14, 14);
        }
    box.appendChild(c);
  }
  function draw() {
    drawBoard();
    let ghost = {...current, y: current.y};
    while(valid(ghost,0,1)) ghost.y++;
    drawPiece(ghost,0,0,true);
    drawPiece(current);
  }

  // --- GAME LOGICA ---
  function valid(p, ox=0, oy=0, shape=p.shape) {
    for(let y=0;y<shape.length;y++)
      for(let x=0;x<shape[y].length;x++)
        if(shape[y][x]) {
          let nx=p.x+x+ox, ny=p.y+y+oy;
          if(nx<0||nx>=COLS||ny>=ROWS) return false;
          if(ny>=0&&board[ny][nx]) return false;
        }
    return true;
  }
  function merge(p) {
    for(let y=0;y<p.shape.length;y++)
      for(let x=0;x<p.shape[y].length;x++)
        if(p.shape[y][x]) {
          let nx=p.x+x, ny=p.y+y;
          if(ny>=0) board[ny][nx]=p.shape[y][x];
        }
  }
  function clearLines() {
    let cleared=0;
    for(let y=ROWS-1;y>=0;y--) {
      if(board[y].every(v=>v)) {
        board.splice(y,1);
        board.unshift(Array(COLS).fill(0));
        cleared++;
        y++;
      }
    }
    if(cleared) {
      score+=cleared*100;
      lines+=cleared;
      document.getElementById('score').textContent=score;
      document.getElementById('lines').textContent=lines;
    }
  }
  function rotate(p, dir=1) {
    const s = p.shape, n = s.length;
    let r = Array.from({length:n},()=>Array(n).fill(0));
    for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
      if(dir>0) r[x][n-1-y]=s[y][x]; // CW
      else r[n-1-x][y]=s[y][x]; // CCW
    }
    return r;
  }
  function tryRotate(p, dir=1) {
    let kicks = [ [0,0], [-1,0], [1,0], [0,-1], [0,1] ];
    for(let i=0;i<kicks.length;i++) {
      let r = rotate(p,dir);
      let ox = kicks[i][0], oy = kicks[i][1];
      if(valid(p,ox,oy,r)) {
        p.shape = r; p.x += ox; p.y += oy;
        return true;
      }
    }
    return false;
  }
  function hardDrop() {
    while(valid(current,0,1)) current.y++;
    step();
  }
  function holdPiece() {
    if(!canHold) return;
    if(!hold) {
      hold = {...current};
      current = next; next = randomPiece();
    } else {
      let temp = hold;
      hold = {...current};
      current = {...temp, x:3, y:0};
    }
    canHold = false;
    drawHold();
    draw();
  }
  function step() {
    if(valid(current,0,1)) {
      current.y++;
    } else {
      merge(current);
      clearLines();
      current = next; next = randomPiece();
      canHold = true;
      if(!valid(current)) { gameOver=true; alert('Game Over!'); return; }
      drawNext();
    }
    draw();
  }
  function tick() {
    if(gameOver) return;
    step();
    dropTimer = setTimeout(tick, dropInterval);
  }
  function start() {
    resetBoard();
    refillBag();
    current = randomPiece();
    next = randomPiece();
    hold = null;
    canHold = true;
    score = 0; lines = 0; gameOver = false;
    document.getElementById('score').textContent=score;
    document.getElementById('lines').textContent=lines;
    drawHold(); drawNext();
    draw();
    clearTimeout(dropTimer);
    dropTimer = setTimeout(tick, dropInterval);
  }

  // --- INPUT HANDLING ---
  document.addEventListener('keydown', e => {
    if(gameOver) return;
    if(e.key==='ArrowLeft') keys.left = true;
    if(e.key==='ArrowRight') keys.right = true;
    if(e.key==='ArrowDown') keys.down = true;
    if(e.key==='ArrowUp') { tryRotate(current,1); draw(); }
    if(e.key==='z'||e.key==='Z') { tryRotate(current,-1); draw(); }
    if(e.key===' '||e.code==='Space') { hardDrop(); }
    if(e.key==='Shift'||e.key==='c') { holdPiece(); }
    if(!moveTimer) moveTimer = setTimeout(moveLoop, moveDelay);
  });
  document.addEventListener('keyup', e => {
    if(e.key==='ArrowLeft') keys.left = false;
    if(e.key==='ArrowRight') keys.right = false;
    if(e.key==='ArrowDown') keys.down = false;
    if(!keys.left && !keys.right && !keys.down) { clearTimeout(moveTimer); moveTimer = null; }
  });
  function moveLoop() {
    if(keys.left && valid(current,-1,0)) { current.x--; draw(); }
    if(keys.right && valid(current,1,0)) { current.x++; draw(); }
    if(keys.down && valid(current,0,1)) { current.y++; draw(); }
    if(keys.left || keys.right || keys.down) moveTimer = setTimeout(moveLoop, moveRepeat);
    else moveTimer = null;
  }

  // --- START ---
  start();
})();
