const canvas = document.getElementById("spelplan");
const ctx = canvas.getContext("2d");

const ANTAL_NIVAER = 10;
const TOPPFALT = 28;
const RODA = "#ff2a2a";
const GRON = "#2f9e44";
const LILA = "#c04dff";
const LAVA = "#8f1403";
const LAVA_LJUS = "#ff4a12";
const SPELARE = "#2ad4ff";

// Andel av de borttagbara väggarna som öppnas för att ge fler vägar till målet.
const EXTRA_VAGAR = 0.5;

// Andel av de inre lavaväggarna som istället blir bruna och ofarliga.
const BRUNA_VAGGAR = 0.3;

let niva = 0;
let karta, kolumner, rader, ruta, offsetX, offsetY;
let spelare, mal;
let monster = [];
let traffTimer = 0;
let klart = false;
let forlorat = false;
let orsak = "";
let allaKlara = false;
let fynd = [];
let poang = 0;
let poangNiva = 0;
let stjarnor = 0;

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

  // Öppnar slumpade väggar mellan två gångar så att det finns flera vägar.
  for (let y = 1; y < r - 1; y++) {
    for (let x = 1; x < k - 1; x++) {
      const mellanVagg = (x % 2 === 0) !== (y % 2 === 0);
      if (rutnat[y][x] === 1 && mellanVagg && Math.random() < EXTRA_VAGAR) rutnat[y][x] = 0;
    }
  }
  // 1 = lava, 2 = brun vägg som man bara studsar mot.
  for (let y = 1; y < r - 1; y++) {
    for (let x = 1; x < k - 1; x++) {
      if (rutnat[y][x] === 1 && Math.random() < BRUNA_VAGGAR) rutnat[y][x] = 2;
    }
  }
  return rutnat;
}

function startaNiva() {
  const n = 8 + 2 * niva;
  const m = 5 + niva;
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
  poang = poangNiva;
  stjarnor = 0;
  skapaMonster();
  skapaFynd();
}

// Slumpar ut pengar och 3 stjärnor på gångar utanför start och mål.
function skapaFynd() {
  const platser = [];
  for (let y = 1; y < rader - 1; y++) {
    for (let x = 1; x < kolumner - 1; x++) {
      const franStart = Math.abs(x - 1) + Math.abs(y - 1);
      if (karta[y][x] === 0 && franStart > 3 && !(x === mal.x && y === mal.y)) platser.push({ x, y });
    }
  }
  const typer = [...Array(3).fill("stjarna"), ...Array(6 + niva).fill("pengar")];
  fynd = [];
  for (const typ of typer) {
    if (!platser.length) break;
    const p = platser.splice(Math.floor(Math.random() * platser.length), 1)[0];
    fynd.push({ typ, x: p.x, y: p.y });
  }
}

function plockaUpp() {
  fynd = fynd.filter((f) => {
    if (f.x !== spelare.x || f.y !== spelare.y) return true;
    if (f.typ === "stjarna") {
      stjarnor++;
      poang += 5;
    } else {
      poang++;
    }
    return false;
  });
}

function ritaFynd(f) {
  const cx = offsetX + (f.x + 0.5) * ruta;
  const cy = offsetY + (f.y + 0.5) * ruta;
  ctx.shadowColor = "#ffd23a";
  ctx.shadowBlur = 6;
  ctx.fillStyle = f.typ === "stjarna" ? "#fff27a" : "#f5b800";
  ctx.beginPath();
  if (f.typ === "stjarna") {
    for (let i = 0; i < 10; i++) {
      const r = ruta * (i % 2 === 0 ? 0.4 : 0.17);
      const v = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(cx + r * Math.cos(v), cy + r * Math.sin(v));
    }
    ctx.closePath();
  } else {
    ctx.arc(cx, cy, ruta * 0.22, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.shadowBlur = 0;
}

// tempo = antal bilder mellan varje steg, så lägre tal är snabbare.
const MONSTERTYPER = {
  vandrare: { farg: LILA, tempo: () => Math.max(22, 38 - 3 * niva) },
  springare: { farg: "#ff4dcb", tempo: () => Math.max(12, 18 - niva) },
  jagare: { farg: "#e6e6e6", tempo: () => Math.max(30, 50 - 2 * niva) },
};

const TYPLISTA = ["vandrare", "springare", "jagare"];

// Varje monster får en egen hastighet: 0.7 = 30 % snabbare, 1.4 = 40 % långsammare.
function slumpTempo(typ) {
  const faktor = 0.7 + Math.random() * 0.7;
  return Math.max(5, Math.round(MONSTERTYPER[typ].tempo() * faktor));
}

// Placerar monster på slumpade gångar en bit från start och mål.
function skapaMonster() {
  const antal = 3 + niva;
  const typer = Array.from({ length: antal }, (_, i) => TYPLISTA[i % TYPLISTA.length]);
  const platser = [];
  for (let y = 1; y < rader - 1; y++) {
    for (let x = 1; x < kolumner - 1; x++) {
      const franStart = Math.abs(x - 1) + Math.abs(y - 1);
      const franMal = Math.abs(x - mal.x) + Math.abs(y - mal.y);
      if (karta[y][x] === 0 && franStart > 8 && franMal > 2) platser.push({ x, y });
    }
  }
  monster = [];
  for (const typ of typer) {
    if (!platser.length) break;
    const p = platser.splice(Math.floor(Math.random() * platser.length), 1)[0];
    monster.push({ typ, x: p.x, y: p.y, dx: 0, dy: 0, tempo: slumpTempo(typ), raknare: 0, arg: 0, vila: 0 });
  }
}

// Avstånd i steg från spelaren, högst maxSteg steg bort.
function avstandFranSpelare(maxSteg) {
  const avstand = new Map([[spelare.y * kolumner + spelare.x, 0]]);
  const ko = [[spelare.x, spelare.y]];
  for (let i = 0; i < ko.length; i++) {
    const [x, y] = ko[i];
    const d = avstand.get(y * kolumner + x);
    if (d >= maxSteg) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nyckel = (y + dy) * kolumner + (x + dx);
      if (karta[y + dy][x + dx] === 0 && !avstand.has(nyckel)) {
        avstand.set(nyckel, d + 1);
        ko.push([x + dx, y + dy]);
      }
    }
  }
  return avstand;
}

// Start- och målrutan är gröna och monster får inte gå in på dem.
function arGron(x, y) {
  return (x === 1 && y === 1) || (x === mal.x && y === mal.y);
}

// Rak siktlinje längs rad eller kolumn utan väggar emellan.
function harSiktlinje(m) {
  if (m.x !== spelare.x && m.y !== spelare.y) return false;
  const sx = Math.sign(spelare.x - m.x);
  const sy = Math.sign(spelare.y - m.y);
  for (let x = m.x + sx, y = m.y + sy; x !== spelare.x || y !== spelare.y; x += sx, y += sy) {
    if (karta[y][x] !== 0) return false;
  }
  return true;
}

function flyttaMonster(m) {
  const val = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(
    ([dx, dy]) => karta[m.y + dy][m.x + dx] === 0 && !arGron(m.x + dx, m.y + dy)
  );
  if (!val.length) return;
  let lista = val;

  if (m.typ === "jagare" && m.arg > 0) {
    const avstand = avstandFranSpelare(60);
    const nu = avstand.get(m.y * kolumner + m.x);
    const narmare = val.filter(([dx, dy]) => avstand.get((m.y + dy) * kolumner + (m.x + dx)) < nu);
    if (nu !== undefined && narmare.length) lista = narmare;
  }
  if (lista === val) {
    // Vänder bara i en återvändsgränd.
    const framat = val.filter(([dx, dy]) => !(dx === -m.dx && dy === -m.dy));
    if (framat.length) lista = framat;
  }

  const [dx, dy] = lista[Math.floor(Math.random() * lista.length)];
  m.x += dx;
  m.y += dy;
  m.dx = dx;
  m.dy = dy;
}

// Ljus uppe till vänster och skugga nere till höger på den senaste formen.
function skuggaForm(cx, cy, r) {
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r * 1.2);
  g.addColorStop(0, "rgba(255,255,255,0.5)");
  g.addColorStop(0.5, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.shadowBlur = 0;
  ctx.fillStyle = g;
  ctx.fill();
}

function ritaMonster(m) {
  const cx = offsetX + (m.x + 0.5) * ruta;
  const cy = offsetY + (m.y + 0.5) * ruta;
  const farg = m.arg > 0 ? RODA : MONSTERTYPER[m.typ].farg;
  ctx.shadowColor = farg;
  ctx.shadowBlur = 10;
  ctx.fillStyle = farg;
  ctx.beginPath();
  if (m.typ === "vandrare") {
    ctx.arc(cx, cy, ruta * 0.4, 0, Math.PI * 2);
  } else if (m.typ === "springare") {
    const r = ruta * 0.42;
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
  } else {
    ctx.rect(cx - ruta * 0.38, cy - ruta * 0.38, ruta * 0.76, ruta * 0.76);
  }
  ctx.fill();
  skuggaForm(cx, cy, ruta * 0.42);
  const arg = m.arg > 0 || m.typ === "jagare";
  for (const sida of [-1, 1]) {
    const ex = cx + sida * ruta * 0.15;
    const ey = cy - ruta * 0.08;
    ctx.fillStyle = arg ? RODA : "#f2f2f2";
    ctx.beginPath();
    ctx.ellipse(ex, ey, ruta * 0.1, ruta * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(ex + m.dx * ruta * 0.04, ey + m.dy * ruta * 0.04, ruta * 0.05, 0, Math.PI * 2);
    ctx.fill();
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
  if (karta[ny][nx] === 2) return;
  if (karta[ny][nx] === 1) {
    forlorat = true;
    orsak = "Lavan är farlig!";
    traffTimer = 12;
    return;
  }
  spelare.x = nx;
  spelare.y = ny;
  plockaUpp();
  kollaMonster();
  if (forlorat) return;
  if (nx === mal.x && ny === mal.y) {
    klart = true;
    if (niva + 1 >= ANTAL_NIVAER) allaKlara = true;
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
  } else if (e.key === " ") {
    e.preventDefault();
    if (forlorat) {
      startaNiva();
    } else if (allaKlara) {
      poangNiva = 0;
      niva = 0;
      allaKlara = false;
      startaNiva();
    } else if (klart) {
      poangNiva = poang;
      niva++;
      startaNiva();
    }
  }
});

// Bestämt "slump" 0–1 per ruta så att mönstret inte fladdrar mellan bilderna.
function brus(x, y, i) {
  const s = Math.sin(x * 127.1 + y * 311.7 + i * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function ritaSten(x, y, px, py) {
  const g = 80 + Math.floor(brus(x, y, 0) * 30);
  const kant = Math.max(1, ruta * 0.08);
  ctx.fillStyle = "#1e1e23";
  ctx.fillRect(px, py, ruta, ruta);
  ctx.fillStyle = `rgb(${g}, ${g}, ${g + 4})`;
  ctx.fillRect(px + 1, py + 1, ruta - 2, ruta - 2);
  // Korn i stenen.
  for (let i = 1; i <= 10; i++) {
    ctx.fillStyle = brus(x, y, i) > 0.5 ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.18)";
    const s = Math.max(1, ruta * 0.07);
    ctx.fillRect(px + 2 + brus(x, y, i + 20) * (ruta - 4 - s), py + 2 + brus(x, y, i + 40) * (ruta - 4 - s), s, s);
  }
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(px + 1, py + 1, ruta - 2, kant);
  ctx.fillRect(px + 1, py + 1, kant, ruta - 2);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(px + 1, py + ruta - 1 - kant, ruta - 2, kant);
  ctx.fillRect(px + ruta - 1 - kant, py + 1, kant, ruta - 2);
  // Spricka på vissa plattor.
  if (brus(x, y, 60) < 0.3) {
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const sx = px + ruta * (0.2 + brus(x, y, 61) * 0.6);
    ctx.moveTo(sx, py + 2);
    ctx.lineTo(sx + ruta * (brus(x, y, 62) - 0.5) * 0.4, py + ruta * 0.5);
    ctx.lineTo(sx + ruta * (brus(x, y, 63) - 0.5) * 0.5, py + ruta - 2);
    ctx.stroke();
  }
}

function ritaTra(x, y, px, py) {
  const ljus = brus(x, y, 0) * 0.3;
  ctx.fillStyle = "#2e1a0a";
  ctx.fillRect(px, py, ruta, ruta);
  // Två brädor ovanpå varandra med vedådrornas riktning längs brädan.
  for (let b = 0; b < 2; b++) {
    const by = py + 1 + b * (ruta / 2);
    const bh = ruta / 2 - 1;
    const r = 110 + Math.floor((ljus + brus(x, y, 10 + b) * 0.25) * 60);
    ctx.fillStyle = `rgb(${r}, ${Math.floor(r * 0.62)}, ${Math.floor(r * 0.33)})`;
    ctx.fillRect(px + 1, by, ruta - 2, bh);
    ctx.strokeStyle = "rgba(50,25,8,0.45)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const ly = by + (bh * i) / 4;
      ctx.beginPath();
      ctx.moveTo(px + 1, ly);
      ctx.bezierCurveTo(
        px + ruta * 0.35, ly + (brus(x, y, 20 + b * 3 + i) - 0.5) * bh * 0.3,
        px + ruta * 0.65, ly + (brus(x, y, 30 + b * 3 + i) - 0.5) * bh * 0.3,
        px + ruta - 1, ly
      );
      ctx.stroke();
    }
    // Kvist på vissa brädor.
    if (brus(x, y, 40 + b) < 0.2) {
      ctx.fillStyle = "rgba(40,20,6,0.7)";
      ctx.beginPath();
      ctx.ellipse(px + ruta * (0.3 + brus(x, y, 50 + b) * 0.4), by + bh / 2, ruta * 0.1, bh * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Spik i hjärnen på varje bräda.
  ctx.fillStyle = "rgba(20,12,6,0.8)";
  const s = Math.max(1, ruta * 0.06);
  for (const [nx, ny] of [[0.12, 0.25], [0.88, 0.25], [0.12, 0.75], [0.88, 0.75]]) {
    ctx.fillRect(px + ruta * nx - s / 2, py + ruta * ny - s / 2, s, s);
  }
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(px + 1, py + 1, ruta - 2, 1);
}

function rita() {
  ctx.fillStyle = "#08080c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ccc";
  ctx.font = "16px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`Nivå ${niva + 1} av ${ANTAL_NIVAER}`, 10, 19);
  ctx.textAlign = "right";
  ctx.fillText(`Poäng: ${poang}   Stjärnor: ${stjarnor}/3`, canvas.width - 10, 19);
  ctx.textAlign = "left";

  // Skakar lite när man förlorar.
  const skak = traffTimer > 0 ? (Math.random() - 0.5) * 6 : 0;
  ctx.save();
  ctx.translate(skak, skak);

  // Stenplattor på gångarna.
  for (let y = 0; y < rader; y++) {
    for (let x = 0; x < kolumner; x++) {
      if (karta[y][x] === 0) ritaSten(x, y, offsetX + x * ruta, offsetY + y * ruta);
    }
  }

  // Lava: orange botten med gula fläckar som pulserar.
  const tid = performance.now() / 300;
  ctx.shadowColor = LAVA;
  ctx.shadowBlur = traffTimer > 0 ? 18 : 8;
  ctx.fillStyle = traffTimer > 0 ? "#ffb070" : LAVA;
  for (let y = 0; y < rader; y++) {
    for (let x = 0; x < kolumner; x++) {
      if (karta[y][x] === 1) {
        ctx.fillRect(offsetX + x * ruta, offsetY + y * ruta, ruta, ruta);
      }
    }
  }
  ctx.shadowBlur = 0;
  for (let y = 0; y < rader; y++) {
    for (let x = 0; x < kolumner; x++) {
      if (karta[y][x] !== 1) continue;
      const px = offsetX + x * ruta;
      const py = offsetY + y * ruta;
      // Mörk skorpa som flyter ovanpå.
      ctx.fillStyle = "rgba(25, 4, 0, 0.55)";
      ctx.beginPath();
      ctx.ellipse(
        px + ruta * (0.25 + brus(x, y, 70) * 0.5),
        py + ruta * (0.25 + brus(x, y, 71) * 0.5),
        ruta * (0.15 + brus(x, y, 72) * 0.2),
        ruta * (0.1 + brus(x, y, 73) * 0.15),
        brus(x, y, 74) * Math.PI,
        0,
        Math.PI * 2
      );
      ctx.fill();
      // Glödande fläckar som pulserar, med het kärna.
      for (let i = 0; i < 2; i++) {
        const bx = px + ruta * (0.2 + brus(x, y, 80 + i) * 0.6);
        const by = py + ruta * (0.2 + brus(x, y, 90 + i) * 0.6);
        const puls = 0.5 + 0.5 * Math.sin(tid + x * 1.7 + y * 2.3 + i * 2.1);
        ctx.globalAlpha = 0.3 + 0.4 * puls;
        ctx.fillStyle = LAVA_LJUS;
        ctx.beginPath();
        ctx.arc(bx, by, ruta * (0.14 + 0.08 * puls), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.25 + 0.5 * puls;
        ctx.fillStyle = "#ffb02e";
        ctx.beginPath();
        ctx.arc(bx, by, ruta * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;

  for (let y = 0; y < rader; y++) {
    for (let x = 0; x < kolumner; x++) {
      if (karta[y][x] === 2) ritaTra(x, y, offsetX + x * ruta, offsetY + y * ruta);
    }
  }
  ctx.shadowColor = GRON;
  ctx.shadowBlur = 3;
  ctx.fillStyle = GRON;
  ctx.fillRect(offsetX + ruta, offsetY + ruta, ruta, ruta);
  ctx.fillRect(offsetX + mal.x * ruta, offsetY + mal.y * ruta, ruta, ruta);

  ctx.shadowBlur = 0;
  fynd.forEach(ritaFynd);
  ctx.fillStyle = SPELARE;
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(
    offsetX + (spelare.x + 0.5) * ruta,
    offsetY + (spelare.y + 0.5) * ruta,
    ruta * 0.32,
    0,
    Math.PI * 2
  );
  ctx.fill();
  skuggaForm(offsetX + (spelare.x + 0.5) * ruta, offsetY + (spelare.y + 0.5) * ruta, ruta * 0.32);
  ctx.stroke();

  monster.forEach(ritaMonster);

  ctx.restore();

  if (forlorat) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = RODA;
    ctx.font = "28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Du förlorade! " + orsak, canvas.width / 2, canvas.height / 2);
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("Tryck mellanslag för att försöka igen", canvas.width / 2, canvas.height / 2 + 30);
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
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText(
      allaKlara ? "Tryck mellanslag för att spela igen" : "Tryck mellanslag för nästa nivå",
      canvas.width / 2,
      canvas.height / 2 + 30
    );
  }

  if (!klart && !forlorat) {
    for (const m of monster) {
      if (m.typ === "jagare") {
        // Blir arg 1,5 s vid siktlinje och vilar sedan 1,5 s så man hinner undan.
        if (m.arg > 0) {
          m.arg--;
          if (m.arg === 0) m.vila = 90;
        } else if (m.vila > 0) {
          m.vila--;
        } else if (harSiktlinje(m)) {
          m.arg = 90;
        }
      }
      m.raknare++;
      if (m.raknare >= (m.arg > 0 ? 11 : m.tempo)) {
        m.raknare = 0;
        flyttaMonster(m);
        kollaMonster();
      }
    }
  }

  if (traffTimer > 0) traffTimer--;
  requestAnimationFrame(rita);
}

startaNiva();
rita();
