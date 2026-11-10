const canvas = document.getElementById("spelplan");
const ctx = canvas.getContext("2d");

const ANTAL_NIVAER = 5;
const TOPPFALT = 28;
const RODA = "#ff2a2a";
const GRON = "#2aff6a";
const LILA = "#c04dff";

let niva = 0;
let karta, kolumner, rader, ruta, offsetX, offsetY;
let spelare, mal;
let monster = [];
let monsterRaknare = 0;
let traffTimer = 0;
let klart = false;
let forlorat = false;
let orsak = "";
let allaKlara = false;

// Skapar en labyrint (rekursiv backtracking); 1 = vägg, 0 = gång.
function skapaLabyrint(n, m) {
  const k = 2 * n + 1;
  const r = 2 * m + 1;
  const rutnat = Array.from({ length: r }, () => Array(k).fill(1));
  const stack = [[1, 1]];
  rutnat[1][1] = 0;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const grannar = [[2, 0], [-2, 0], [0, 2], [0, -2]]
      .map(([dx, dy]) => [x + dx, y + dy, dx / 2, dy / 2])
      .filter(([nx, ny]) => nx > 0 && ny > 0 && nx < k - 1 && ny < r - 1 && rutnat[ny][nx] === 1);
    if (grannar.length === 0) {
      stack.pop();
      continue;
    }
    const [nx, ny, hx, hy] = grannar[Math.floor(Math.random() * grannar.length)];
    rutnat[y + hy][x + hx] = 0;
    rutnat[ny][nx] = 0;
    stack.push([nx, ny]);
  }
  return rutnat;
}

function startaNiva() {
  const n = 5 + 2 * niva;
  const m = 3 + niva;
  karta = skapaLabyrint(n, m);
  kolumner = 2 * n + 1;
  rader = 2 * m + 1;
  ruta = Math.floor(Math.min(canvas.width / kolumner, (canvas.height - TOPPFALT) / rader));
  offsetX = Math.floor((canvas.width - ruta * kolumner) / 2);
  offsetY = TOPPFALT + Math.floor((canvas.height - TOPPFALT - ruta * rader) / 2);
  spelare = { x: 1, y: 1 };
  mal = { x: kolumner - 2, y: rader - 2 };
  klart = false;
  forlorat = false;
  monsterRaknare = 0;
  skapaMonster(niva + 1);
}

// Placerar monster på slumpade gångar en bit från start och mål.
function skapaMonster(antal) {
  const platser = [];
  for (let y = 1; y < rader - 1; y++) {
    for (let x = 1; x < kolumner - 1; x++) {
      const franStart = Math.abs(x - 1) + Math.abs(y - 1);
      const franMal = Math.abs(x - mal.x) + Math.abs(y - mal.y);
      if (karta[y][x] === 0 && franStart > 8 && franMal > 2) platser.push({ x, y });
    }
  }
  monster = [];
  for (let i = 0; i < antal && platser.length; i++) {
    const p = platser.splice(Math.floor(Math.random() * platser.length), 1)[0];
    monster.push({ x: p.x, y: p.y, dx: 0, dy: 0 });
  }
}

function flyttaMonster() {
  for (const m of monster) {
    const val = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => karta[m.y + dy][m.x + dx] === 0);
    // Vänder bara i en återvändsgränd.
    const framat = val.filter(([dx, dy]) => !(dx === -m.dx && dy === -m.dy));
    const lista = framat.length ? framat : val;
    const [dx, dy] = lista[Math.floor(Math.random() * lista.length)];
    m.x += dx;
    m.y += dy;
    m.dx = dx;
    m.dy = dy;
  }
}

function kollaMonster() {
  if (monster.some((m) => m.x === spelare.x && m.y === spelare.y)) {
    forlorat = true;
    orsak = "Ett monster fångade dig!";
    traffTimer = 12;
  }
}

function flytta(dx, dy) {
  if (klart || forlorat) return;
  const nx = spelare.x + dx;
  const ny = spelare.y + dy;
  if (karta[ny][nx] === 1) {
    forlorat = true;
    orsak = "Väggarna är farliga!";
    traffTimer = 12;
    return;
  }
  spelare.x = nx;
  spelare.y = ny;
  kollaMonster();
  if (forlorat) return;
  if (nx === mal.x && ny === mal.y) {
    klart = true;
    if (niva + 1 >= ANTAL_NIVAER) {
      allaKlara = true;
    } else {
      setTimeout(() => {
        niva++;
        startaNiva();
      }, 900);
    }
  }
}

document.addEventListener("keydown", (e) => {
  const riktningar = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
  };
  if (riktningar[e.key]) {
    e.preventDefault();
    flytta(...riktningar[e.key]);
  } else if (e.key === "Enter" && forlorat) {
    startaNiva();
  } else if (e.key === "Enter" && allaKlara) {
    niva = 0;
    allaKlara = false;
    startaNiva();
  }
});

function rita() {
  ctx.fillStyle = "#08080c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ccc";
  ctx.font = "16px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`Nivå ${niva + 1} av ${ANTAL_NIVAER}`, 10, 19);

  // Skakar lite när man förlorar.
  const skak = traffTimer > 0 ? (Math.random() - 0.5) * 6 : 0;
  ctx.save();
  ctx.translate(skak, skak);

  ctx.shadowColor = RODA;
  ctx.shadowBlur = traffTimer > 0 ? 18 : 8;
  ctx.fillStyle = traffTimer > 0 ? "#ff8080" : RODA;
  for (let y = 0; y < rader; y++) {
    for (let x = 0; x < kolumner; x++) {
      if (karta[y][x] === 1) {
        ctx.fillRect(offsetX + x * ruta, offsetY + y * ruta, ruta, ruta);
      }
    }
  }

  ctx.shadowColor = GRON;
  ctx.shadowBlur = 10;
  ctx.fillStyle = GRON;
  ctx.fillRect(offsetX + ruta, offsetY + ruta, ruta, ruta);
  ctx.fillRect(offsetX + mal.x * ruta, offsetY + mal.y * ruta, ruta, ruta);

  ctx.shadowBlur = 0;
  ctx.fillStyle = RODA;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(
    offsetX + (spelare.x + 0.5) * ruta,
    offsetY + (spelare.y + 0.5) * ruta,
    ruta * 0.32,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.stroke();

  for (const m of monster) {
    const cx = offsetX + (m.x + 0.5) * ruta;
    const cy = offsetY + (m.y + 0.5) * ruta;
    ctx.shadowColor = LILA;
    ctx.shadowBlur = 10;
    ctx.fillStyle = LILA;
    ctx.beginPath();
    ctx.arc(cx, cy, ruta * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx - ruta * 0.15, cy - ruta * 0.08, ruta * 0.1, 0, Math.PI * 2);
    ctx.arc(cx + ruta * 0.15, cy - ruta * 0.08, ruta * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  if (forlorat) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = RODA;
    ctx.font = "28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Du förlorade! " + orsak, canvas.width / 2, canvas.height / 2);
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("Tryck Enter för att försöka igen", canvas.width / 2, canvas.height / 2 + 30);
  }

  if (klart) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = GRON;
    ctx.font = "28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      allaKlara ? "Du klarade alla nivåer!" : "Nivå klar!",
      canvas.width / 2,
      canvas.height / 2
    );
    if (allaKlara) {
      ctx.font = "16px system-ui, sans-serif";
      ctx.fillText("Tryck Enter för att spela igen", canvas.width / 2, canvas.height / 2 + 30);
    }
  }

  if (!klart && !forlorat) {
    monsterRaknare++;
    if (monsterRaknare >= Math.max(10, 30 - 4 * niva)) {
      monsterRaknare = 0;
      flyttaMonster();
      kollaMonster();
    }
  }

  if (traffTimer > 0) traffTimer--;
  requestAnimationFrame(rita);
}

startaNiva();
rita();
