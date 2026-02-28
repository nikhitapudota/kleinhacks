const gameCanvas = document.getElementById('gameCanvas');
const gameCtx = gameCanvas.getContext('2d');
const motionCanvas = document.getElementById('motionCanvas');
const motionCtx = motionCanvas.getContext('2d', { willReadFrequently: true });
const video = document.getElementById('cameraFeed');
const scoreLabel = document.getElementById('score');
const statusLabel = document.getElementById('status');
const highScoreLabel = document.getElementById('highScore');
const movementReadout = document.getElementById('movementReadout');
const startButton = document.getElementById('startButton');
const resetButton = document.getElementById('resetButton');
const physicsConceptLabel = document.getElementById('physicsConcept');
const speedMetricLabel = document.getElementById('speedMetric');
const reactionMetricLabel = document.getElementById('reactionMetric');
const coachPromptLabel = document.getElementById('coachPrompt');
const quizOverlay = document.getElementById('quizOverlay');
const quizQuestion = document.getElementById('quizQuestion');
const quizChoices = document.getElementById('quizChoices');
const quizFeedback = document.getElementById('quizFeedback');

const lanes = [90, 210, 330];
const player = {
  x: gameCanvas.width / 2,
  targetX: gameCanvas.width / 2,
  y: 550,
  radius: 18,
};

const MOTION_THRESHOLD = 26;
const MIN_ACTIVE_PIXELS = 50;
const PLAYER_MIN_X = 70;
const PLAYER_MAX_X = 350;
const PLAYER_FOLLOW_STRENGTH = 0.42;
const OBSTACLE_BASE_SPEED = 1.6;
const OBSTACLE_SPEED_VARIANCE = 0.8;
const OBSTACLE_SPEED_RAMP = 0.012;
const OBSTACLE_MAX_SPEED = 3.2;
const OBSTACLE_SPAWN_INTERVAL = 65;
const COIN_SPAWN_INTERVAL = 210;
const COIN_SPEED_BASE = 2.2;
const COIN_SPEED_VARIANCE = 0.7;
const EDUCATION_ROTATE_INTERVAL = 8000;

let obstacles = [];
let coins = [];
let score = 0;
let frameCounter = 0;
let gameOver = false;
let isRunning = false;
let previousLuma = null;
let smoothedMotionX = 0.5;
let lastPlayerX = player.x;
let lastPlayerUpdate = performance.now();
let previousTargetX = player.targetX;
let maxHorizontalSpeed = 0;
let movementStartTime = null;
let reactionMs = null;
let conceptIndex = 0;
let quizActive = false;
let motionReadoutTick = 0;
let noMotionFrames = 0;
let lastMetricUpdate = 0;
let metricReadoutTick = 0;
let highScore = Number.parseInt(localStorage.getItem('motionRunnerHighScore') || '0', 10);
const physicsConcepts = [
  {
    title: 'Velocity',
    text: 'Velocity = change in position over time. Faster side-steps increase px/s.',
    question: {
      prompt: 'Which quantity describes change in position over time?',
      choices: ['Velocity', 'Mass', 'Temperature'],
      answer: 0,
    },
  },
  {
    title: 'Acceleration',
    text: 'Acceleration is how quickly your speed changes when you switch direction.',
    question: {
      prompt: 'Acceleration is best described as a change in what?',
      choices: ['Color', 'Speed over time', 'Obstacle size'],
      answer: 1,
    },
  },
  {
    title: 'Reaction Time',
    text: 'Reaction time is delay between obstacle spawn and your first movement response.',
    question: {
      prompt: 'In this game, reaction time measures the delay between obstacle spawn and your…',
      choices: ['First movement response', 'Highest score', 'Camera startup'],
      answer: 0,
    },
  },
  {
    title: 'Relative Motion',
    text: 'You move horizontally while obstacles move vertically, creating relative trajectories.',
    question: {
      prompt: 'Relative motion here comes from your horizontal movement compared to…',
      choices: ['Vertical obstacle movement', 'Audio volume', 'Button color'],
      answer: 0,
    },
  },
];

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
  gameCtx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
  gameCtx.fill();
}

function drawObstacles() {
  obstacles.forEach((obstacle) => {
    gameCtx.fillStyle = '#ff6f91';
    gameCtx.fillRect(lanes[obstacle.lane] - 24, obstacle.y, 48, 48);
  });
}

function drawCoins() {
  coins.forEach((coin) => {
    const coinX = lanes[coin.lane];
    gameCtx.fillStyle = '#ffd85d';
    gameCtx.beginPath();
    gameCtx.arc(coinX, coin.y, 14, 0, Math.PI * 2);
    gameCtx.fill();
    gameCtx.strokeStyle = '#f5a800';
    gameCtx.lineWidth = 3;
    gameCtx.stroke();
  });
}

function spawnObstacle() {
  const lane = Math.floor(Math.random() * lanes.length);
  const scaledSpeed = OBSTACLE_BASE_SPEED + Math.min(score * OBSTACLE_SPEED_RAMP, OBSTACLE_MAX_SPEED - OBSTACLE_BASE_SPEED);
  const speed = scaledSpeed + Math.random() * OBSTACLE_SPEED_VARIANCE;
  obstacles.push({ lane, y: -50, speed });
}

function spawnCoin() {
  const lane = Math.floor(Math.random() * lanes.length);
  coins.push({ lane, y: -30, speed: COIN_SPEED_BASE + Math.random() * COIN_SPEED_VARIANCE });
}

function moveObstacles() {
  obstacles = obstacles
    .map((obstacle) => ({ ...obstacle, y: obstacle.y + obstacle.speed }))
    .filter((obstacle) => obstacle.y < gameCanvas.height + 60);
}

function moveCoins() {
  coins = coins
    .map((coin) => ({ ...coin, y: coin.y + coin.speed }))
    .filter((coin) => coin.y < gameCanvas.height + 40);
}

function checkCoinCollection() {
  if (quizActive) {
    return;
  }

  let collected = false;
  coins = coins.filter((coin) => {
    const coinX = lanes[coin.lane];
    const closeX = Math.abs(coinX - player.x) < 28;
    const closeY = Math.abs(coin.y - player.y) < 30;
    const hit = closeX && closeY;
    if (hit) {
      collected = true;
    }
    return !hit;
  });

  if (collected) {
    openQuiz();
  }
}

function checkCollision() {
  return obstacles.some((obstacle) => {
    const obstacleX = lanes[obstacle.lane];
    const closeX = Math.abs(obstacleX - player.x) < 34;
    const closeY = obstacle.y + 48 >= player.y - player.radius && obstacle.y <= player.y + player.radius;
    return closeX && closeY;
  });
}

function updateGame() {
  if (!isRunning || quizActive) {
    if (isRunning) {
      requestAnimationFrame(updateGame);
    }
    return;
  }

  frameCounter += 1;
  if (frameCounter % OBSTACLE_SPAWN_INTERVAL === 0) {
    spawnObstacle();
    movementStartTime = performance.now();
    reactionMs = null;
    score += 1;
    scoreLabel.textContent = `Score: ${score}`;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('motionRunnerHighScore', String(highScore));
      highScoreLabel.textContent = `High score: ${highScore}`;
    }
  }

  if (frameCounter % COIN_SPAWN_INTERVAL === 0) {
    spawnCoin();
  }

  moveObstacles();
  moveCoins();
  checkCoinCollection();

  if (checkCollision()) {
    gameOver = true;
    isRunning = false;
    statusLabel.textContent = 'Status: Game over — press reset.';
    coachPromptLabel.textContent = 'Coach: In physics terms, earlier acceleration gives you more time to clear each lane.';
  }

  renderGame();

  if (!gameOver) {
    requestAnimationFrame(updateGame);
  }
}

function renderGame() {
  drawTrack();
  drawObstacles();
  drawCoins();
  drawPlayer();
}

function openQuiz() {
  quizActive = true;
  isRunning = false;

  const concept = physicsConcepts[Math.floor(Math.random() * physicsConcepts.length)];
  const { prompt, choices, answer } = concept.question;

  quizOverlay.classList.remove('hidden');
  quizQuestion.textContent = `${concept.title}: ${prompt}`;
  quizFeedback.textContent = '';
  quizChoices.innerHTML = '';

  choices.forEach((choice, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quiz-choice';
    button.textContent = choice;
    button.addEventListener('click', () => {
      const correct = index === answer;
      quizFeedback.textContent = correct ? '✅ Correct! Keep running.' : `❌ Not quite. Correct answer: ${choices[answer]}.`;
      coachPromptLabel.textContent = correct
        ? `Coach: Nice! You connected movement with ${concept.title.toLowerCase()}.`
        : `Coach: Review ${concept.title.toLowerCase()} and try the next coin.`;

      setTimeout(() => {
        quizOverlay.classList.add('hidden');
        quizActive = false;
        if (!gameOver) {
          isRunning = true;
          statusLabel.textContent = 'Status: Running';
          requestAnimationFrame(updateGame);
        }
      }, 900);
    });

    quizChoices.appendChild(button);
  });

  statusLabel.textContent = 'Status: Quiz time';
}

function mapMotionToTrackX(normalizedX) {
  const clamped = Math.max(0, Math.min(1, normalizedX));
  return PLAYER_MIN_X + clamped * (PLAYER_MAX_X - PLAYER_MIN_X);
}

function updatePlayerPosition() {
  const dx = player.targetX - player.x;
  if (Math.abs(dx) < 0.5) {
    player.x = player.targetX;
    return;
  }

  player.x += dx * PLAYER_FOLLOW_STRENGTH;
}


function updatePhysicsConcept() {
  const concept = physicsConcepts[conceptIndex % physicsConcepts.length];
  physicsConceptLabel.textContent = `Concept: ${concept.title} — ${concept.text}`;
  conceptIndex += 1;
}

function updatePhysicsMetrics(now) {
  const dt = Math.max((now - lastPlayerUpdate) / 1000, 0.001);
  const speed = Math.abs(player.x - lastPlayerX) / dt;
  maxHorizontalSpeed = Math.max(maxHorizontalSpeed, speed);

  metricReadoutTick += 1;
  if (now - lastMetricUpdate > 120 || metricReadoutTick % 3 === 0) {
    speedMetricLabel.textContent = `Horizontal speed: ${Math.round(speed / 5) * 5} px/s (max ${Math.round(maxHorizontalSpeed / 5) * 5} px/s)`;
    reactionMetricLabel.textContent = reactionMs === null ? 'Reaction time: -- ms' : `Reaction time: ${reactionMs} ms`;
    lastMetricUpdate = now;
  }

  lastPlayerX = player.x;
  lastPlayerUpdate = now;
}

function maybeRecordReaction(now) {
  const movedEnough = Math.abs(player.targetX - previousTargetX) > 8;
  if (movementStartTime !== null && reactionMs === null && movedEnough) {
    reactionMs = Math.max(0, Math.round(now - movementStartTime));
    coachPromptLabel.textContent = reactionMs < 450
      ? 'Coach: Great reflexes! Low reaction times help avoid collisions.'
      : 'Coach: Try anticipating obstacle patterns to reduce reaction time.';
  }

  if (movedEnough) {
    previousTargetX = player.targetX;
  }
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
    noMotionFrames = 0;
    const movementCenter = sumX / activePixels;
    const normalizedX = movementCenter / motionCanvas.width;
    smoothedMotionX = smoothedMotionX * 0.6 + normalizedX * 0.4;
    player.targetX = mapMotionToTrackX(smoothedMotionX);
    motionReadoutTick += 1;
    if (motionReadoutTick % 8 === 0) {
      movementReadout.textContent = `Movement: x=${smoothedMotionX.toFixed(2)} active=${Math.round(activePixels / 20) * 20}`;
    }
    if (!gameOver && !isRunning && !quizActive) {
      statusLabel.textContent = 'Status: Tracking movement';
    }
  } else {
    noMotionFrames += 1;
    if (noMotionFrames > 10) {
      movementReadout.textContent = 'Movement: move left/right to control the character';
    }
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
  coins = [];
  score = 0;
  frameCounter = 0;
  gameOver = false;
  player.x = gameCanvas.width / 2;
  player.targetX = gameCanvas.width / 2;
  smoothedMotionX = 0.5;
  lastPlayerX = player.x;
  previousTargetX = player.targetX;
  maxHorizontalSpeed = 0;
  movementStartTime = null;
  reactionMs = null;
  noMotionFrames = 0;
  motionReadoutTick = 0;
  scoreLabel.textContent = 'Score: 0';
  quizActive = false;
  quizOverlay.classList.add('hidden');
  statusLabel.textContent = 'Status: Ready';
  coachPromptLabel.textContent = 'Coach: Start moving to unlock physics tips.';
  speedMetricLabel.textContent = 'Horizontal speed: 0 px/s';
  reactionMetricLabel.textContent = 'Reaction time: -- ms';
  highScoreLabel.textContent = `High score: ${highScore}`;
  renderGame();
}

function animationLoop() {
  updatePlayerPosition();
  const now = performance.now();
  maybeRecordReaction(now);
  updatePhysicsMetrics(now);
  renderGame();
  requestAnimationFrame(animationLoop);
}

startButton.addEventListener('click', startGame);
resetButton.addEventListener('click', resetGame);

highScoreLabel.textContent = `High score: ${highScore}`;
renderGame();
updatePhysicsConcept();
setInterval(updatePhysicsConcept, EDUCATION_ROTATE_INTERVAL);
requestAnimationFrame(animationLoop);
setupCamera();
