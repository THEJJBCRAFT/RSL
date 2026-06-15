const redstoneMs = 10000;
const cc3Ms = 3600;
const fadeMs = 1600;

const canvas = document.querySelector("#shaderCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
const cursorLight = document.querySelector("#cursorLight");
const redstoneStage = document.querySelector("#redstoneStage");
const cc3Stage = document.querySelector("#cc3Stage");
const finalStage = document.querySelector("#finalStage");
const siteShell = document.querySelector("#home");
const redstoneProgress = document.querySelector("#redstoneProgress");
const globalSkip = document.querySelector("#globalSkip");
const replayButton = document.querySelector("#replayButton");
const skipIntroButton = document.querySelector("#skipIntroButton");
const enterButton = document.querySelector("#enterButton");

let width = 0;
let height = 0;
let particles = [];
let introTimers = [];
let introStart = performance.now();
let showingIntro = true;

function resize() {
  const scale = Math.min(window.devicePixelRatio || 1, 1.5);
  width = Math.floor(window.innerWidth * scale);
  height = Math.floor(window.innerHeight * scale);
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  buildParticles();
}

function buildParticles() {
  const count = Math.min(180, Math.max(70, Math.floor((window.innerWidth * window.innerHeight) / 9000)));
  particles = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    z: .35 + Math.random() * 1.65,
    speed: .25 + Math.random() * 1.4,
    hue: Math.random()
  }));
}

function drawShader(time) {
  const t = time * 0.001;
  const grd = ctx.createLinearGradient(0, 0, width, height);
  grd.addColorStop(0, "#05070b");
  grd.addColorStop(.33 + Math.sin(t * .32) * .08, "#141022");
  grd.addColorStop(.68, "#16070d");
  grd.addColorStop(1, "#061814");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 5; i++) {
    const x = width * (.5 + Math.sin(t * (.23 + i * .07) + i * 1.9) * .38);
    const y = height * (.5 + Math.cos(t * (.19 + i * .05) + i * 2.4) * .33);
    const radius = Math.max(width, height) * (.18 + i * .035);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const color = i % 3 === 0 ? "255,50,72" : i % 3 === 1 ? "79,244,207" : "139,92,246";
    glow.addColorStop(0, `rgba(${color}, .24)`);
    glow.addColorStop(1, `rgba(${color}, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  particles.forEach(p => {
    p.y -= p.speed * p.z;
    p.x += Math.sin(t + p.hue * 8) * .32;
    if (p.y < -20) {
      p.y = height + 20;
      p.x = Math.random() * width;
    }
    const red = p.hue > .66 ? 255 : 79;
    const green = p.hue > .33 && p.hue < .66 ? 244 : 50 + p.hue * 90;
    const blue = p.hue > .66 ? 130 : 207;
    ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${.24 + p.z * .16})`;
    ctx.fillRect(p.x, p.y, 2 * p.z, 16 * p.z);
  });
  ctx.restore();

  requestAnimationFrame(drawShader);
}

function setStage(activeStage) {
  [redstoneStage, cc3Stage, finalStage].forEach(stage => {
    stage.classList.toggle("is-active", stage === activeStage);
  });
}

function clearIntroTimers() {
  introTimers.forEach(timer => clearTimeout(timer));
  introTimers = [];
}

function startIntro() {
  clearIntroTimers();
  showingIntro = true;
  introStart = performance.now();
  siteShell.classList.remove("is-visible");
  setStage(redstoneStage);

  introTimers.push(setTimeout(() => setStage(cc3Stage), redstoneMs));
  introTimers.push(setTimeout(() => setStage(finalStage), redstoneMs + cc3Ms));
  introTimers.push(setTimeout(showSite, redstoneMs + cc3Ms + fadeMs));
}

function showSite() {
  clearIntroTimers();
  showingIntro = false;
  setStage(null);
  siteShell.classList.add("is-visible");
}

function updateProgress(now) {
  if (showingIntro) {
    const ratio = Math.max(0, Math.min(1, (now - introStart) / redstoneMs));
    redstoneProgress.style.width = `${ratio * 100}%`;
  }
  requestAnimationFrame(updateProgress);
}

function moveCursor(event) {
  cursorLight.style.left = `${event.clientX}px`;
  cursorLight.style.top = `${event.clientY}px`;
}

function restartFromButton(event) {
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: "smooth" });
  startIntro();
}

window.addEventListener("resize", resize);
window.addEventListener("pointermove", moveCursor);
globalSkip.addEventListener("click", showSite);
replayButton.addEventListener("click", startIntro);
skipIntroButton.addEventListener("click", restartFromButton);
enterButton.addEventListener("click", showSite);

resize();
requestAnimationFrame(drawShader);
requestAnimationFrame(updateProgress);
startIntro();
