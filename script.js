const gameCanvas = document.getElementById('gameCanvas');
const gameCtx = gameCanvas.getContext('2d');
const motionCanvas = document.getElementById('motionCanvas');
const motionCtx = motionCanvas.getContext('2d', { willReadFrequently: true });
const video = document.getElementById('cameraFeed');
const scoreLabel = document.getElementById('score');
const statusLabel = document.getElementById('status');
const movementReadout = document.getElementById('movementReadout');
const startButton = document.getElementById('startButton');
const resetButton = document.getElementById('resetButton');

const lanes = [90, 210, 330];
const player = {
  lane: 1,
  y: 550,
  radius: 18,
};

const MOTION_THRESHOLD = 32;
const MIN_ACTIVE_PIXELS = 50;

let obstacles = [];
let score = 0;
let frameCounter = 0;
let gameOver = false;
let isRunning = false;
let previousLuma = null;
let smoothedX = 0.5;

function drawTrack() {
  gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
  gameCtx.fillStyle = '#161e35';
  gameCtx.fillRect(50, 0, 320, gameCanvas.height);

  gameCtx.strokeStyle = 'rgba(255,255,255,0.15)';
  gameCtx.lineWidth = 3;
  gameCtx.setLineDash([16, 20]);
  gameCtx.beginPath();
  gameCtx.moveTo(160, 0);
  gameCtx.lineTo(160, gameCanvas.height);
  gameCtx.moveTo(260, 0);
  gameCtx.lineTo(260, gameCanvas.height);
  gameCtx.stroke();
  gameCtx.setLineDash([]);
}

function drawPlayer() {
  gameCtx.fillStyle = '#7ef5a5';
  gameCtx.beginPath();
  gameCtx.arc(lanes[player.lane], player.y, player.radius, 0, Math.PI * 2);
  gameCtx.fill();
}

function drawObstacles() {
  obstacles.forEach((obstacle) => {
    gameCtx.fillStyle = '#ff6f91';
    gameCtx.fillRect(lanes[obstacle.lane] - 24, obstacle.y, 48, 48);
  });
}

function spawnObstacle() {
  const lane = Math.floor(Math.random() * lanes.length);
  obstacles.push({ lane, y: -50, speed: 4 + Math.random() * 2 });
}

function moveObstacles() {
  obstacles = obstacles
    .map((obstacle) => ({ ...obstacle, y: obstacle.y + obstacle.speed }))
    .filter((obstacle) => obstacle.y < gameCanvas.height + 60);
}

function checkCollision() {
  return obstacles.some((obstacle) => {
    const sameLane = obstacle.lane === player.lane;
    const closeY = obstacle.y + 48 >= player.y - player.radius && obstacle.y <= player.y + player.radius;
    return sameLane && closeY;
  });
}

function updateGame() {
  if (!isRunning) {
    return;
  }

  frameCounter += 1;
  if (frameCounter % 45 === 0) {
    spawnObstacle();
    score += 1;
    scoreLabel.textContent = `Score: ${score}`;
  }

  moveObstacles();

  if (checkCollision()) {
    gameOver = true;
    isRunning = false;
    statusLabel.textContent = 'Status: Game over — press reset.';
  }

  renderGame();

  if (!gameOver) {
    requestAnimationFrame(updateGame);
  }
}

function renderGame() {
  drawTrack();
  drawObstacles();
  drawPlayer();
}

function mapMotionToLane(normalizedX) {
  if (normalizedX < 0.33) {
    return 0;
  }
  if (normalizedX < 0.66) {
    return 1;
  }
  return 2;
}

function processMotionFrame() {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    requestAnimationFrame(processMotionFrame);
    return;
  }

  motionCtx.save();
  motionCtx.scale(-1, 1);
  motionCtx.drawImage(video, -motionCanvas.width, 0, motionCanvas.width, motionCanvas.height);
  motionCtx.restore();

  const frame = motionCtx.getImageData(0, 0, motionCanvas.width, motionCanvas.height);
  const data = frame.data;

  let activePixels = 0;
  let sumX = 0;
  const currentLuma = new Uint8ClampedArray(motionCanvas.width * motionCanvas.height);

  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4;
    const x = pixelIndex % motionCanvas.width;
    const luma = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    currentLuma[pixelIndex] = luma;

    const prev = previousLuma ? previousLuma[pixelIndex] : luma;
    const diff = Math.abs(luma - prev);

    if (diff > MOTION_THRESHOLD) {
      data[i] = 40;
      data[i + 1] = 240;
      data[i + 2] = 90;
      activePixels += 1;
      sumX += x;
    } else {
      const faded = luma * 0.2;
      data[i] = faded;
      data[i + 1] = faded;
      data[i + 2] = faded;
    }
  }

  motionCtx.putImageData(frame, 0, 0);

  if (activePixels > MIN_ACTIVE_PIXELS) {
    const movementCenter = sumX / activePixels;
    const normalizedX = movementCenter / motionCanvas.width;
    smoothedX = smoothedX * 0.82 + normalizedX * 0.18;
    player.lane = mapMotionToLane(smoothedX);
    movementReadout.textContent = `Movement: x=${smoothedX.toFixed(2)} active=${activePixels}`;
    if (!gameOver) {
      statusLabel.textContent = 'Status: Tracking movement';
    }
    renderGame();
  } else {
    movementReadout.textContent = 'Movement: move left/right to control the character';
  }

  previousLuma = currentLuma;
  requestAnimationFrame(processMotionFrame);
}

async function setupCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    statusLabel.textContent = 'Status: Camera API unavailable in this browser';
    movementReadout.textContent = 'Movement: use a modern browser on HTTPS/localhost';
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    });

    video.srcObject = stream;
    await video.play();
    statusLabel.textContent = 'Status: Camera connected';
    movementReadout.textContent = 'Movement: move left/right in front of the camera';
    requestAnimationFrame(processMotionFrame);
  } catch (error) {
    statusLabel.textContent = 'Status: Camera denied/unavailable';
    movementReadout.textContent = 'Movement: camera access is required for controls';
  }
}

function startGame() {
  if (isRunning) {
    return;
  }

  if (gameOver) {
    resetGame();
  }

  isRunning = true;
  statusLabel.textContent = 'Status: Running';
  requestAnimationFrame(updateGame);
}

function resetGame() {
  obstacles = [];
  score = 0;
  frameCounter = 0;
  gameOver = false;
  player.lane = 1;
  scoreLabel.textContent = 'Score: 0';
  statusLabel.textContent = 'Status: Ready';
  renderGame();
}

startButton.addEventListener('click', startGame);
resetButton.addEventListener('click', resetGame);

renderGame();
setupCamera();

