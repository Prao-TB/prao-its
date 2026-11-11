const canvas = document.getElementById("spelplan");
const ctx = canvas.getContext("2d");

const ANTAL_NIVAER = 100;
// Banan slutar bli större efter nivå 10 (index 9) och de nya monstren kommer efter nivå 15.
const MAX_STORLEKSNIVA = 9;
const NYA_MONSTER_FRAN = 15;
const ANTAL_BROAR = 3;
const TOPPFALT = 28;
const RODA = "#ff2a2a";
const GRON = "#2f9e44";
const LILA = "#c04dff";
const LAVA = "#8f1403";
const LAVA_LJUS = "#ff4a12";
const SPELARE = "#2ad4ff";

// Svårare nivåer: färre öppna vägar och färre ofarliga väggar ju längre man kommit.
const extraVagar = () => Math.max(0.15, 0.5 - 0.004 * niva);
const brunaVaggar = () => Math.max(0.1, 0.3 - 0.002 * niva);
const grundNiva = () => Math.min(niva, MAX_STORLEKSNIVA);

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
let skott = [];
let skarm = "start"; // "start", "val" eller "spel"
let valdNiva = 0;

// upplast = antal nivåer som är öppna, stjarnor = bäst antal stjärnor per nivå, poang = sparad poäng.
const SPARNYCKEL = "flykten-framsteg";
let framsteg = laddaFramsteg();

function laddaFramsteg() {
  const f = { upplast: 1, stjarnor: Array(ANTAL_NIVAER).fill(0), poang: 0, rekord: 0 };
  try {
    const sparat = JSON.parse(localStorage.getItem(SPARNYCKEL));
    if (sparat) {
      f.upplast = Math.min(ANTAL_NIVAER, Math.max(1, Number(sparat.upplast) || 1));
      f.poang = Math.max(0, Number(sparat.poang) || 0);
      f.rekord = Math.max(f.poang, Number(sparat.rekord) || 0);
      for (let i = 0; i < ANTAL_NIVAER; i++) f.stjarnor[i] = Math.min(3, Number(sparat.stjarnor?.[i]) || 0);
    }
  } catch {
    // Sparat värde saknas eller localStorage är avstängt.
  }
  return f;
}

function sparaFramsteg() {
  try {
    localStorage.setItem(SPARNYCKEL, JSON.stringify(framsteg));
  } catch {
    // localStorage är avstängt.
  }
}

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
      if (rutnat[y][x] === 1 && mellanVagg && Math.random() < extraVagar()) rutnat[y][x] = 0;
    }
  }
  // 1 = lava, 2 = brun vägg som man bara studsar mot.
  for (let y = 1; y < r - 1; y++) {
    for (let x = 1; x < k - 1; x++) {
      if (rutnat[y][x] === 1 && Math.random() < brunaVaggar()) rutnat[y][x] = 2;
    }
  }
  // 3 = träbro mellan två gångar som blir lava när man gått över den.
  const broKandidater = [];
  for (let y = 1; y < r - 1; y++) {
    for (let x = 1; x < k - 1; x++) {
      const mellanVagg = (x % 2 === 0) !== (y % 2 === 0);
      if (rutnat[y][x] !== 0 && mellanVagg) broKandidater.push([x, y]);
    }
  }
  for (let i = 0; i < ANTAL_BROAR && broKandidater.length; i++) {
    const [bx, by] = broKandidater.splice(Math.floor(Math.random() * broKandidater.length), 1)[0];
    rutnat[by][bx] = 3;
  }
  return rutnat;
}

function startaNiva() {
  const n = 6 + grundNiva();
  const m = 4 + Math.floor(grundNiva() / 2);
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
  skott = [];
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
  const typer = [...Array(3).fill("stjarna"), ...Array(6 + grundNiva()).fill("pengar")];
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
  vandrare: { farg: LILA, tempo: () => Math.max(22, 38 - 3 * grundNiva()) },
  springare: { farg: "#ff4dcb", tempo: () => Math.max(12, 18 - grundNiva()) },
  jagare: { farg: "#e6e6e6", tempo: () => Math.max(30, 50 - 2 * grundNiva()), jagar: true, argTempo: 11 },
  // Ser spelaren genom väggar om den står rakt åt sidan eller rakt under, högst 10 rutor bort.
  spok: { farg: "#7fd8ff", tempo: () => Math.max(34, 54 - 2 * grundNiva()), jagar: true, argTempo: 13, genomVaggar: true },
  // Skjuter lava längs gången när den har rak siktlinje.
  skytt: { farg: "#ff7a1a", tempo: () => Math.max(36, 56 - 2 * grundNiva()) },
};

const TYPLISTA = ["vandrare", "springare", "jagare"];

// Varje monster får en egen hastighet: 0.7 = 30 % snabbare, 1.4 = 40 % långsammare.
function slumpTempo(typ) {
  const faktor = 0.7 + Math.random() * 0.7;
  // Efter nivå 10 blir monstren bara långsamt snabbare, högst 30 %.
  const sent = Math.min(0.3, Math.max(0, niva - MAX_STORLEKSNIVA) * 0.004);
  return Math.max(5, Math.round(MONSTERTYPER[typ].tempo() * faktor * (1 - sent)));
}

// Placerar monster på slumpade gångar en bit från start och mål.
function skapaMonster() {
  // Flest vanliga monster på nivå 10, sedan färre och färre ner till 5.
  const grundAntal = niva === 0 ? 1 : 2 + grundNiva();
  const minskning = Math.floor(Math.max(0, niva - MAX_STORLEKSNIVA) / 3);
  const antal = niva > MAX_STORLEKSNIVA ? Math.max(5, grundAntal - minskning) : grundAntal;
  const typer = Array.from({ length: antal }, (_, i) => TYPLISTA[i % TYPLISTA.length]);
  if (niva >= NYA_MONSTER_FRAN) {
    const par = 1 + Math.floor((niva - NYA_MONSTER_FRAN) / 25);
    for (let i = 0; i < par; i++) typer.push("skytt", "spok");
  }
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
    monster.push({ typ, x: p.x, y: p.y, dx: 0, dy: 0, tempo: slumpTempo(typ), raknare: 0, arg: 0, vila: 0, laddar: 0 });
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

// Rak siktlinje längs rad eller kolumn, utan väggar emellan (spöket ignorerar väggar).
function harSiktlinje(m) {
  if (m.x !== spelare.x && m.y !== spelare.y) return false;
  if (MONSTERTYPER[m.typ].genomVaggar) {
    return Math.abs(spelare.x - m.x) + Math.abs(spelare.y - m.y) <= 10;
  }
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

  if (MONSTERTYPER[m.typ].jagar && m.arg > 0) {
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
  const farg = m.laddar > 0 ? "#ffe14a" : m.arg > 0 ? RODA : MONSTERTYPER[m.typ].farg;
  ctx.globalAlpha = m.typ === "spok" ? 0.8 : 1;
  ctx.shadowColor = farg;
  ctx.shadowBlur = 10;
  ctx.fillStyle = farg;
  ctx.beginPath();
  if (m.typ === "vandrare") {
    ctx.arc(cx, cy, ruta * 0.4, 0, Math.PI * 2);
  } else if (m.typ === "skytt") {
    const r = ruta * 0.42;
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy + r * 0.8);
    ctx.lineTo(cx - r, cy + r * 0.8);
    ctx.closePath();
  } else if (m.typ === "spok") {
    const r = ruta * 0.4;
    ctx.arc(cx, cy - r * 0.15, r, Math.PI, 0);
    ctx.lineTo(cx + r, cy + r);
    ctx.lineTo(cx + r * 0.5, cy + r * 0.7);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.5, cy + r * 0.7);
    ctx.lineTo(cx - r, cy + r);
    ctx.closePath();
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
  ctx.globalAlpha = 1;
}

function ritaSkott(s) {
  const cx = offsetX + (s.x + 0.5) * ruta;
  const cy = offsetY + (s.y + 0.5) * ruta;
  ctx.shadowColor = LAVA_LJUS;
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#ff5a14";
  ctx.beginPath();
  ctx.arc(cx, cy, ruta * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffc23a";
  ctx.beginPath();
  ctx.arc(cx, cy, ruta * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function kollaSkott() {
  if (skott.some((s) => s.x === spelare.x && s.y === spelare.y)) {
    forlorat = true;
    orsak = "Du träffades av lava!";
    traffTimer = 12;
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
  if (skarm !== "spel" || klart || forlorat) return;
  const nx = spelare.x + dx;
  const ny = spelare.y + dy;
  if (karta[ny][nx] === 2) return;
  if (karta[ny][nx] === 1) {
    forlorat = true;
    orsak = "Lavan är farlig!";
    traffTimer = 12;
    return;
  }
  const fran = { x: spelare.x, y: spelare.y };
  spelare.x = nx;
  spelare.y = ny;
  if (karta[fran.y][fran.x] === 3) karta[fran.y][fran.x] = 1;
  plockaUpp();
  kollaMonster();
  kollaSkott();
  if (forlorat) return;
  if (nx === mal.x && ny === mal.y) {
    klart = true;
    framsteg.stjarnor[niva] = Math.max(framsteg.stjarnor[niva], stjarnor);
    framsteg.upplast = Math.min(ANTAL_NIVAER, Math.max(framsteg.upplast, niva + 2));
    framsteg.poang = poang;
    framsteg.rekord = Math.max(framsteg.rekord, poang);
    sparaFramsteg();
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
    if (skarm === "val") {
      const [dx, dy] = riktningar[e.key];
      valdNiva = Math.min(ANTAL_NIVAER - 1, Math.max(0, valdNiva + dx + dy * 10));
    } else {
      flytta(...riktningar[e.key]);
    }
  } else if (e.key === "Escape") {
    if (skarm === "spel") {
      valdNiva = niva;
      skarm = "val";
    } else if (skarm === "val") {
      skarm = "start";
    }
  } else if (e.key === " ") {
    e.preventDefault();
    if (skarm === "start") {
      valdNiva = framsteg.upplast - 1;
      skarm = "val";
    } else if (skarm === "val") {
      if (valdNiva < framsteg.upplast) {
        niva = valdNiva;
        poangNiva = framsteg.poang;
        allaKlara = false;
        startaNiva();
        skarm = "spel";
      }
    } else if (forlorat) {
      startaNiva();
    } else if (allaKlara) {
      allaKlara = false;
      valdNiva = niva;
      skarm = "val";
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

function ritaBro(x, y, px, py) {
  // Gången ligger till vänster och höger om bron eller ovanför och under.
  const vagrat = karta[y][x - 1] === 0 && karta[y][x + 1] === 0;
  const bx = vagrat ? px : px + ruta * 0.15;
  const by = vagrat ? py + ruta * 0.15 : py;
  const bb = vagrat ? ruta : ruta * 0.7;
  const bh = vagrat ? ruta * 0.7 : ruta;
  ctx.shadowColor = LAVA_LJUS;
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#3a210b";
  ctx.fillRect(bx, by, bb, bh);
  ctx.shadowBlur = 0;
  for (let i = 0; i < 3; i++) {
    const r = 140 + Math.floor(brus(x, y, 100 + i) * 40);
    ctx.fillStyle = `rgb(${r}, ${Math.floor(r * 0.66)}, ${Math.floor(r * 0.36)})`;
    if (vagrat) ctx.fillRect(bx + (bb * i) / 3, by + 1, bb / 3 - 1, bh - 2);
    else ctx.fillRect(bx + 1, by + (bh * i) / 3, bb - 2, bh / 3 - 1);
  }
}

function ritaStartsida() {
  const w = canvas.width;
  const h = canvas.height;
  const tid = performance.now() / 400;
  ctx.fillStyle = "#08080c";
  ctx.fillRect(0, 0, w, h);

  // Pulserande lavaglöd längst ner.
  const glod = ctx.createLinearGradient(0, h * 0.6, 0, h);
  glod.addColorStop(0, "rgba(143, 20, 3, 0)");
  glod.addColorStop(1, `rgba(255, 74, 18, ${0.45 + 0.15 * Math.sin(tid)})`);
  ctx.fillStyle = glod;
  ctx.fillRect(0, h * 0.6, w, h * 0.4);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = LAVA_LJUS;
  ctx.shadowBlur = 20 + 8 * Math.sin(tid);
  ctx.fillStyle = "#ff6a2a";
  ctx.font = "bold 72px system-ui, sans-serif";
  ctx.fillText("FLYKTEN", w / 2, h * 0.28);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#ccc";
  ctx.font = "20px system-ui, sans-serif";
  ctx.fillText("Ta dig igenom labyrinten till den gröna rutan.", w / 2, h * 0.4);

  ctx.font = "17px system-ui, sans-serif";
  ctx.fillStyle = "#aaa";
  const rader = [
    "Piltangenterna för att flytta dig.",
    "Lavan är farlig, men de bruna träväggarna är ofarliga.",
    "Plocka mynt (1 poäng) och stjärnor (5 poäng).",
    "Träbroar över lavan går bara att gå över en gång.",
    "Se upp för monstren.",
  ];
  rader.forEach((text, i) => ctx.fillText(text, w / 2, h * 0.5 + i * 28));

  ctx.globalAlpha = 0.55 + 0.45 * Math.sin(tid * 1.5);
  ctx.fillStyle = "#fff";
  ctx.font = "22px system-ui, sans-serif";
  ctx.fillText("Tryck mellanslag för att starta", w / 2, h * 0.84);
  ctx.globalAlpha = 1;
}

function stjarnaForm(cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = r * (i % 2 === 0 ? 1 : 0.42);
    const v = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + rr * Math.cos(v), cy + rr * Math.sin(v));
  }
  ctx.closePath();
}

function ritaNivaval() {
  const w = canvas.width;
  const tid = performance.now() / 400;
  ctx.fillStyle = "#08080c";
  ctx.fillRect(0, 0, w, canvas.height);
  ctx.textBaseline = "alphabetic";

  ctx.textAlign = "left";
  ctx.fillStyle = "#ff6a2a";
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.fillText("VÄLJ NIVÅ", 40, 42);

  ctx.fillStyle = "#888";
  ctx.font = "14px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Pilar: välj   Mellanslag: spela   Esc: tillbaka", 250, 38);

  const totalt = framsteg.stjarnor.reduce((summa, s) => summa + s, 0);
  ctx.fillStyle = "#ffd23a";
  ctx.font = "16px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`Rekord: ${framsteg.rekord}   Stjärnor: ${totalt}/${ANTAL_NIVAER * 3}`, w - 40, 38);

  const bredd = 82;
  const hojd = 40;
  const mellan = 6;
  const startX = (w - (10 * bredd + 9 * mellan)) / 2;
  for (let i = 0; i < ANTAL_NIVAER; i++) {
    const x = startX + (i % 10) * (bredd + mellan);
    const y = 64 + Math.floor(i / 10) * (hojd + mellan);
    const last = i >= framsteg.upplast;
    const klarad = i < framsteg.upplast - 1;

    ctx.fillStyle = last ? "#15151a" : klarad ? "#16301b" : "#3a2410";
    ctx.fillRect(x, y, bredd, hojd);
    ctx.strokeStyle = last ? "#2a2a32" : klarad ? GRON : LAVA_LJUS;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, bredd - 1.5, hojd - 1.5);

    ctx.fillStyle = last ? "#555" : "#fff";
    ctx.font = "bold 16px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(String(i + 1), x + 9, y + 26);

    if (last) {
      ctx.fillStyle = "#666";
      ctx.fillRect(x + bredd - 26, y + hojd / 2 - 3, 14, 11);
      ctx.strokeStyle = "#666";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + bredd - 19, y + hojd / 2 - 3, 4.5, Math.PI, 0);
      ctx.stroke();
    } else {
      for (let j = 0; j < 3; j++) {
        stjarnaForm(x + bredd - 40 + j * 14, y + hojd / 2, 6);
        if (j < framsteg.stjarnor[i]) {
          ctx.fillStyle = "#ffd23a";
          ctx.fill();
        } else {
          ctx.strokeStyle = "#666";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    if (i === valdNiva) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.65 + 0.35 * Math.sin(tid * 2)})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 1, y - 1, bredd + 2, hojd + 2);
    }
  }
}

function rita() {
  if (skarm !== "spel") {
    if (skarm === "start") ritaStartsida();
    else ritaNivaval();
    requestAnimationFrame(rita);
    return;
  }
  ctx.fillStyle = "#08080c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ccc";
  ctx.font = "16px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`Nivå ${niva + 1} av ${ANTAL_NIVAER}`, 10, 19);
  ctx.textAlign = "right";
  ctx.fillText(
    `Poäng: ${poang}   Rekord: ${Math.max(framsteg.rekord, poang)}   Stjärnor: ${stjarnor}/3`,
    canvas.width - 10,
    19
  );
  ctx.textAlign = "center";
  ctx.fillStyle = "#777";
  ctx.fillText("Esc: nivåval", canvas.width / 2, 19);
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
      if (karta[y][x] === 1 || karta[y][x] === 3) {
        ctx.fillRect(offsetX + x * ruta, offsetY + y * ruta, ruta, ruta);
      }
    }
  }
  ctx.shadowBlur = 0;
  for (let y = 0; y < rader; y++) {
    for (let x = 0; x < kolumner; x++) {
      if (karta[y][x] !== 1 && karta[y][x] !== 3) continue;
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
      else if (karta[y][x] === 3) ritaBro(x, y, offsetX + x * ruta, offsetY + y * ruta);
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
  skott.forEach(ritaSkott);

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
      const typ = MONSTERTYPER[m.typ];
      if (typ.jagar) {
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
      if (m.typ === "skytt") {
        // Laddar en kort stund (syns som gult) innan skottet går, så man hinner väja.
        if (m.laddar > 0) {
          m.laddar--;
          if (m.laddar === 0) {
            skott.push({ x: m.x, y: m.y, dx: m.sdx, dy: m.sdy, raknare: 0 });
            m.vila = 100;
          }
          continue;
        }
        if (m.vila > 0) {
          m.vila--;
        } else if (harSiktlinje(m)) {
          m.laddar = 35;
          m.sdx = Math.sign(spelare.x - m.x);
          m.sdy = Math.sign(spelare.y - m.y);
          continue;
        }
      }
      m.raknare++;
      if (m.raknare >= (m.arg > 0 ? typ.argTempo : m.tempo)) {
        m.raknare = 0;
        flyttaMonster(m);
        kollaMonster();
      }
    }
    for (const s of skott) {
      s.raknare++;
      if (s.raknare >= 6) {
        s.raknare = 0;
        s.x += s.dx;
        s.y += s.dy;
        if (karta[s.y][s.x] !== 0) s.borta = true;
      }
    }
    skott = skott.filter((s) => !s.borta);
    kollaSkott();
  }

  if (traffTimer > 0) traffTimer--;
  requestAnimationFrame(rita);
}

startaNiva();
rita();
