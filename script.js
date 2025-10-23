const GameState = {
    MENU: 'menu',
    LEVEL_SELECT: 'level_select',
    MULTIPLAYER: 'multiplayer',
    INSTRUCTIONS: 'instructions',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'game_over'
};

const GameMode = {
    PVE: 'pve',
    MULTIPLAYER: 'multiplayer'
};

const PowerUpType = {
    RAPID_FIRE: 'rapid_fire',
    SHIELD: 'shield',
    MULTI_SHOT: 'multi_shot'
};

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = 800;
        this.canvas.height = 600;
        
        this.state = GameState.MENU;
        this.mode = null;
        this.level = 1;
        this.score = 0;
        this.lives = 3;
        
        this.player = null;
        this.enemies = [];
        this.bullets = [];
        this.enemyBullets = [];
        this.powerUps = [];
        
        this.activePowerUp = null;
        this.powerUpEndTime = 0;
        
        this.keys = {};
        this.lastShot = 0;
        this.shotCooldown = 300;
        
        this.enemyDirection = 1;
        this.enemySpeed = 1;
        this.enemyDropAmount = 20;
        
        this.isMultiplayer = false;
        this.roomCode = null;
        this.isHost = false;
        this.playerId = null;
        this.opponentData = null;
        this.gameRef = null;
        this.firebaseReady = false;
        
        this.animationId = null;
        this.lastTime = 0;
        
        this.initEventListeners();
        this.showScreen('menu-screen');
    }
    
    initEventListeners() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            if (e.key === 'Escape' && this.state === GameState.PLAYING) {
                this.pauseGame();
            }
            if (e.key === ' ') {
                e.preventDefault();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
        
        document.getElementById('btn-pve').addEventListener('click', () => {
            this.mode = GameMode.PVE;
            this.showScreen('level-select-screen');
        });
        
        document.querySelectorAll('.level-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.level = parseInt(e.target.dataset.level);
                this.startPvE();
            });
        });
        
        document.getElementById('btn-create-room').addEventListener('click', () => {
            this.createMultiplayerRoom();
        });
        
        document.getElementById('btn-join-room').addEventListener('click', () => {
            this.showJoinRoomScreen();
        });
        
        document.getElementById('btn-join-game').addEventListener('click', () => {
            const code = document.getElementById('room-code-input').value.toUpperCase();
            if (code.length === 6) {
                this.joinMultiplayerRoom(code);
            }
        });
        
        document.getElementById('btn-instructions').addEventListener('click', () => {
            this.showScreen('instructions-screen');
        });
        
        document.getElementById('btn-back-from-level').addEventListener('click', () => {
            this.showScreen('menu-screen');
        });
        
        document.getElementById('btn-back-from-multiplayer').addEventListener('click', () => {
            this.leaveMultiplayerRoom();
            this.showScreen('menu-screen');
        });
        
        document.getElementById('btn-back-from-instructions').addEventListener('click', () => {
            this.showScreen('menu-screen');
        });
        
        document.getElementById('btn-resume').addEventListener('click', () => {
            this.resumeGame();
        });
        
        document.getElementById('btn-quit').addEventListener('click', () => {
            this.quitToMenu();
        });
        
        document.getElementById('btn-play-again').addEventListener('click', () => {
            if (this.mode === GameMode.PVE) {
                this.startPvE();
            }
        });
        
        document.getElementById('btn-main-menu').addEventListener('click', () => {
            this.quitToMenu();
        });
    }
    
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }
    
    startPvE() {
        this.mode = GameMode.PVE;
        this.isMultiplayer = false;
        this.resetGame();
        this.initGame();
        this.showScreen('game-screen');
        this.state = GameState.PLAYING;
        this.gameLoop(0);
    }
    
    createMultiplayerRoom() {
        if (!window.firebaseInitialized) {
            alert('Firebase is not configured. Please set up firebase-config.js with your Firebase credentials.');
            return;
        }
        
        if (!this.firebaseReady) {
            alert('Firebase is still initializing. Please wait a moment and try again.');
            return;
        }
        
        const user = firebase.auth().currentUser;
        if (!user) {
            alert('Authentication not ready. Please refresh the page and try again.');
            return;
        }
        
        this.roomCode = this.generateRoomCode();
        this.isHost = true;
        this.isMultiplayer = true;
        this.mode = GameMode.MULTIPLAYER;
        this.playerId = 'player1';
        
        document.getElementById('room-code-display').textContent = this.roomCode;
        document.getElementById('room-creation').style.display = 'block';
        document.getElementById('room-joining').style.display = 'none';
        this.showScreen('multiplayer-screen');
        
        const db = firebase.database();
        this.gameRef = db.ref('rooms/' + this.roomCode);
        
        this.gameRef.set({
            host: user.uid,
            players: 1,
            status: 'waiting',
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        this.gameRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && data.players === 2 && data.status === 'waiting') {
                this.gameRef.update({ status: 'playing' });
                this.startMultiplayerGame();
            }
        });
    }
    
    showJoinRoomScreen() {
        document.getElementById('room-creation').style.display = 'none';
        document.getElementById('room-joining').style.display = 'block';
        document.getElementById('room-code-input').value = '';
        this.showScreen('multiplayer-screen');
    }
    
    joinMultiplayerRoom(code) {
        if (!window.firebaseInitialized) {
            alert('Firebase is not configured. Please set up firebase-config.js with your Firebase credentials.');
            return;
        }
        
        if (!this.firebaseReady) {
            alert('Firebase is still initializing. Please wait a moment and try again.');
            return;
        }
        
        const user = firebase.auth().currentUser;
        if (!user) {
            alert('Authentication not ready. Please refresh the page and try again.');
            return;
        }
        
        const db = firebase.database();
        const roomRef = db.ref('rooms/' + code);
        
        roomRef.once('value').then((snapshot) => {
            if (!snapshot.exists()) {
                alert('Room not found!');
                return;
            }
            
            const roomData = snapshot.val();
            if (roomData.players >= 2) {
                alert('Room is full!');
                return;
            }
            
            this.roomCode = code;
            this.isHost = false;
            this.isMultiplayer = true;
            this.mode = GameMode.MULTIPLAYER;
            this.playerId = 'player2';
            this.gameRef = roomRef;
            
            roomRef.update({
                players: 2,
                guest: user.uid
            });
            
            this.startMultiplayerGame();
        });
    }
    
    startMultiplayerGame() {
        this.resetGame();
        this.level = 1;
        this.initGame();
        this.showScreen('game-screen');
        this.state = GameState.PLAYING;
        
        if (this.isMultiplayer && this.gameRef) {
            const opponentId = this.isHost ? 'player2' : 'player1';
            this.gameRef.child('gameState/' + opponentId).on('value', (snapshot) => {
                if (snapshot.exists()) {
                    this.opponentData = snapshot.val();
                    this.updateOpponentInfo();
                }
            });
            
            document.getElementById('opponent-info').style.display = 'block';
        }
        
        this.gameLoop(0);
    }
    
    leaveMultiplayerRoom() {
        if (this.gameRef) {
            this.gameRef.child('gameState/player1').off();
            this.gameRef.child('gameState/player2').off();
            
            if (this.isHost) {
                this.gameRef.remove();
            }
            this.gameRef = null;
        }
        this.roomCode = null;
        this.isMultiplayer = false;
        this.isHost = false;
        this.playerId = null;
        this.opponentData = null;
    }
    
    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
    
    resetGame() {
        this.score = 0;
        this.lives = 3;
        this.enemies = [];
        this.bullets = [];
        this.enemyBullets = [];
        this.powerUps = [];
        this.activePowerUp = null;
        this.powerUpEndTime = 0;
        this.updateHUD();
    }
    
    initGame() {
        this.player = {
            x: this.canvas.width / 2 - 20,
            y: this.canvas.height - 60,
            width: 40,
            height: 40,
            speed: 5,
            hasShield: false
        };
        
        this.createEnemies();
        this.setEnemySpeed();
    }
    
    createEnemies() {
        this.enemies = [];
        const rows = 3 + this.level;
        const cols = 8;
        const enemyWidth = 35;
        const enemyHeight = 35;
        const padding = 15;
        const offsetX = 80;
        const offsetY = 50;
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const enemyType = row < 2 ? 'weak' : (row < 4 ? 'medium' : 'strong');
                this.enemies.push({
                    x: offsetX + col * (enemyWidth + padding),
                    y: offsetY + row * (enemyHeight + padding),
                    width: enemyWidth,
                    height: enemyHeight,
                    type: enemyType,
                    health: enemyType === 'weak' ? 1 : (enemyType === 'medium' ? 2 : 3),
                    maxHealth: enemyType === 'weak' ? 1 : (enemyType === 'medium' ? 2 : 3),
                    points: enemyType === 'weak' ? 10 : (enemyType === 'medium' ? 20 : 30)
                });
            }
        }
        
        this.enemyDirection = 1;
    }
    
    setEnemySpeed() {
        this.enemySpeed = 1 + (this.level * 0.3);
        this.shotCooldown = Math.max(150, 300 - (this.level * 30));
    }
    
    gameLoop(currentTime) {
        if (this.state !== GameState.PLAYING) {
            return;
        }
        
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        this.update(deltaTime);
        this.render();
        
        this.animationId = requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    update(deltaTime) {
        this.handleInput(deltaTime);
        this.updateBullets();
        this.updateEnemies();
        this.updateEnemyBullets();
        this.updatePowerUps();
        this.checkCollisions();
        this.checkPowerUpExpiry();
        
        if (Math.random() < 0.002 * this.level) {
            this.spawnPowerUp();
        }
        
        if (this.enemies.length === 0) {
            this.levelComplete();
        }
        
        if (this.isMultiplayer && this.gameRef) {
            this.syncMultiplayerState();
        }
    }
    
    handleInput(deltaTime) {
        if (this.keys['ArrowLeft']) {
            this.player.x = Math.max(0, this.player.x - this.player.speed);
        }
        if (this.keys['ArrowRight']) {
            this.player.x = Math.min(this.canvas.width - this.player.width, this.player.x + this.player.speed);
        }
        if (this.keys[' ']) {
            this.shoot();
        }
    }
    
    shoot() {
        const now = Date.now();
        const cooldown = this.activePowerUp === PowerUpType.RAPID_FIRE ? this.shotCooldown / 2 : this.shotCooldown;
        
        if (now - this.lastShot > cooldown) {
            if (this.activePowerUp === PowerUpType.MULTI_SHOT) {
                this.bullets.push({
                    x: this.player.x + this.player.width / 2 - 2,
                    y: this.player.y,
                    width: 4,
                    height: 15,
                    speed: 8
                });
                this.bullets.push({
                    x: this.player.x + this.player.width / 2 - 2 - 15,
                    y: this.player.y,
                    width: 4,
                    height: 15,
                    speed: 8
                });
                this.bullets.push({
                    x: this.player.x + this.player.width / 2 - 2 + 15,
                    y: this.player.y,
                    width: 4,
                    height: 15,
                    speed: 8
                });
            } else {
                this.bullets.push({
                    x: this.player.x + this.player.width / 2 - 2,
                    y: this.player.y,
                    width: 4,
                    height: 15,
                    speed: 8
                });
            }
            this.lastShot = now;
        }
    }
    
    updateBullets() {
        this.bullets = this.bullets.filter(bullet => {
            bullet.y -= bullet.speed;
            return bullet.y > -bullet.height;
        });
    }
    
    updateEnemies() {
        if (this.enemies.length === 0) return;
        
        let shouldMoveDown = false;
        
        for (let enemy of this.enemies) {
            enemy.x += this.enemySpeed * this.enemyDirection;
            
            if (enemy.x <= 0 || enemy.x + enemy.width >= this.canvas.width) {
                shouldMoveDown = true;
            }
        }
        
        if (shouldMoveDown) {
            this.enemyDirection *= -1;
            for (let enemy of this.enemies) {
                enemy.y += this.enemyDropAmount;
            }
        }
        
        if (Math.random() < 0.01 + (this.level * 0.005)) {
            const shooter = this.enemies[Math.floor(Math.random() * this.enemies.length)];
            if (shooter) {
                this.enemyBullets.push({
                    x: shooter.x + shooter.width / 2 - 2,
                    y: shooter.y + shooter.height,
                    width: 4,
                    height: 12,
                    speed: 4
                });
            }
        }
        
        for (let enemy of this.enemies) {
            if (enemy.y + enemy.height >= this.player.y) {
                this.gameOver();
                break;
            }
        }
    }
    
    updateEnemyBullets() {
        this.enemyBullets = this.enemyBullets.filter(bullet => {
            bullet.y += bullet.speed;
            return bullet.y < this.canvas.height;
        });
    }
    
    updatePowerUps() {
        this.powerUps = this.powerUps.filter(powerUp => {
            powerUp.y += 2;
            return powerUp.y < this.canvas.height;
        });
    }
    
    spawnPowerUp() {
        const types = [PowerUpType.RAPID_FIRE, PowerUpType.SHIELD, PowerUpType.MULTI_SHOT];
        const type = types[Math.floor(Math.random() * types.length)];
        
        this.powerUps.push({
            x: Math.random() * (this.canvas.width - 30),
            y: 0,
            width: 30,
            height: 30,
            type: type
        });
    }
    
    checkCollisions() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                
                if (this.isColliding(bullet, enemy)) {
                    this.bullets.splice(i, 1);
                    enemy.health--;
                    
                    if (enemy.health <= 0) {
                        this.score += enemy.points;
                        this.enemies.splice(j, 1);
                    }
                    this.updateHUD();
                    break;
                }
            }
        }
        
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const bullet = this.enemyBullets[i];
            
            if (this.isColliding(bullet, this.player)) {
                this.enemyBullets.splice(i, 1);
                
                if (!this.player.hasShield) {
                    this.lives--;
                    this.updateHUD();
                    
                    if (this.lives <= 0) {
                        this.gameOver();
                    }
                }
            }
        }
        
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const powerUp = this.powerUps[i];
            
            if (this.isColliding(powerUp, this.player)) {
                this.activatePowerUp(powerUp.type);
                this.powerUps.splice(i, 1);
            }
        }
    }
    
    isColliding(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }
    
    activatePowerUp(type) {
        this.activePowerUp = type;
        this.powerUpEndTime = Date.now() + 10000;
        
        if (type === PowerUpType.SHIELD) {
            this.player.hasShield = true;
        }
        
        this.updatePowerUpStatus();
    }
    
    checkPowerUpExpiry() {
        if (this.activePowerUp && Date.now() > this.powerUpEndTime) {
            if (this.activePowerUp === PowerUpType.SHIELD) {
                this.player.hasShield = false;
            }
            this.activePowerUp = null;
            this.updatePowerUpStatus();
        }
    }
    
    updatePowerUpStatus() {
        const statusEl = document.getElementById('powerup-status');
        if (this.activePowerUp) {
            const names = {
                [PowerUpType.RAPID_FIRE]: '🔵 Rapid Fire',
                [PowerUpType.SHIELD]: '🟢 Shield',
                [PowerUpType.MULTI_SHOT]: '🟡 Multi-Shot'
            };
            statusEl.textContent = names[this.activePowerUp];
        } else {
            statusEl.textContent = '';
        }
    }
    
    updateOpponentInfo() {
        if (!this.isMultiplayer || !this.opponentData) return;
        
        const opponentInfoEl = document.getElementById('opponent-info');
        opponentInfoEl.textContent = `Opponent - Score: ${this.opponentData.score || 0} | Level: ${this.opponentData.level || 1}`;
        opponentInfoEl.style.color = '#ffff00';
    }
    
    levelComplete() {
        this.level++;
        document.getElementById('current-level').textContent = this.level;
        this.initGame();
    }
    
    syncMultiplayerState() {
        if (!this.gameRef) return;
        
        const playerId = this.isHost ? 'player1' : 'player2';
        this.gameRef.child('gameState/' + playerId).set({
            x: this.player.x,
            y: this.player.y,
            score: this.score,
            lives: this.lives,
            level: this.level,
            enemiesRemaining: this.enemies.length,
            lastUpdate: Date.now()
        });
    }
    
    render() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.drawStars();
        this.drawPlayer();
        this.drawEnemies();
        this.drawBullets();
        this.drawEnemyBullets();
        this.drawPowerUps();
        
        if (this.isMultiplayer && this.opponentData) {
            this.drawOpponent();
        }
    }
    
    drawStars() {
        this.ctx.fillStyle = '#fff';
        for (let i = 0; i < 50; i++) {
            const x = (i * 37) % this.canvas.width;
            const y = (i * 73) % this.canvas.height;
            this.ctx.fillRect(x, y, 1, 1);
        }
    }
    
    drawPlayer() {
        this.ctx.fillStyle = this.player.hasShield ? '#00ff00' : '#0ff';
        this.ctx.beginPath();
        this.ctx.moveTo(this.player.x + this.player.width / 2, this.player.y);
        this.ctx.lineTo(this.player.x, this.player.y + this.player.height);
        this.ctx.lineTo(this.player.x + this.player.width, this.player.y + this.player.height);
        this.ctx.closePath();
        this.ctx.fill();
        
        if (this.player.hasShield) {
            this.ctx.strokeStyle = '#00ff00';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, 30, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    }
    
    drawOpponent() {
        if (!this.opponentData) return;
        
        this.ctx.fillStyle = '#ff0';
        this.ctx.globalAlpha = 0.5;
        this.ctx.beginPath();
        this.ctx.moveTo(this.opponentData.x + 20, this.opponentData.y);
        this.ctx.lineTo(this.opponentData.x, this.opponentData.y + 40);
        this.ctx.lineTo(this.opponentData.x + 40, this.opponentData.y + 40);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.globalAlpha = 1;
    }
    
    drawEnemies() {
        for (let enemy of this.enemies) {
            const colors = {
                'weak': '#f00',
                'medium': '#f80',
                'strong': '#f0f'
            };
            
            this.ctx.fillStyle = colors[enemy.type];
            this.ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
            
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(enemy.x + 8, enemy.y + 8, 6, 6);
            this.ctx.fillRect(enemy.x + 21, enemy.y + 8, 6, 6);
            
            if (enemy.health < enemy.maxHealth) {
                const healthBarWidth = (enemy.health / enemy.maxHealth) * enemy.width;
                this.ctx.fillStyle = '#0f0';
                this.ctx.fillRect(enemy.x, enemy.y - 5, healthBarWidth, 3);
            }
        }
    }
    
    drawBullets() {
        this.ctx.fillStyle = '#0ff';
        for (let bullet of this.bullets) {
            this.ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
        }
    }
    
    drawEnemyBullets() {
        this.ctx.fillStyle = '#ff0';
        for (let bullet of this.enemyBullets) {
            this.ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
        }
    }
    
    drawPowerUps() {
        for (let powerUp of this.powerUps) {
            const colors = {
                [PowerUpType.RAPID_FIRE]: '#00f',
                [PowerUpType.SHIELD]: '#0f0',
                [PowerUpType.MULTI_SHOT]: '#ff0'
            };
            
            this.ctx.fillStyle = colors[powerUp.type];
            this.ctx.beginPath();
            this.ctx.arc(powerUp.x + powerUp.width / 2, powerUp.y + powerUp.height / 2, powerUp.width / 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
    
    updateHUD() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('lives').textContent = this.lives;
        document.getElementById('current-level').textContent = this.level;
    }
    
    pauseGame() {
        this.state = GameState.PAUSED;
        document.getElementById('pause-overlay').style.display = 'block';
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }
    
    resumeGame() {
        this.state = GameState.PLAYING;
        document.getElementById('pause-overlay').style.display = 'none';
        this.lastTime = performance.now();
        this.gameLoop(this.lastTime);
    }
    
    gameOver() {
        this.state = GameState.GAME_OVER;
        document.getElementById('game-over-title').textContent = 'GAME OVER';
        document.getElementById('final-score').textContent = `Final Score: ${this.score}`;
        document.getElementById('game-over-overlay').style.display = 'block';
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        if (this.isMultiplayer && this.gameRef) {
            this.gameRef.update({ status: 'finished' });
        }
    }
    
    quitToMenu() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        this.leaveMultiplayerRoom();
        
        document.getElementById('pause-overlay').style.display = 'none';
        document.getElementById('game-over-overlay').style.display = 'none';
        document.getElementById('opponent-info').style.display = 'none';
        
        this.state = GameState.MENU;
        this.showScreen('menu-screen');
    }
}

let game;

window.addEventListener('load', () => {
    game = new Game();
    
    if (window.firebaseInitialized) {
        firebase.auth().signInAnonymously()
            .then(() => {
                game.firebaseReady = true;
                console.log('Firebase authentication successful');
            })
            .catch((error) => {
                console.error('Firebase auth error:', error);
                game.firebaseReady = false;
            });
    }
});
