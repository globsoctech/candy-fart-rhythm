import * as Tone from 'tone';
import { RhythmEngine, BEAT_SEC, MAX_SFX_SEC } from './RhythmEngine.js';
import { MultiplayerManager } from './MultiplayerManager.js';
import { CLASSICAL_SONGS, generateSongNotes } from './ClassicalSongs.js';

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;

// Jedna ścieżka rytmu — nuty spadają pionowo środkiem ekranu
const NOTE_LOOKAHEAD = BEAT_SEC * 4;
const KEYBOARD_H = 150;
const KEYBOARD_Y = DESIGN_HEIGHT - KEYBOARD_H - 20;
const HIT_LINE_Y = KEYBOARD_Y - 8;
const NOTE_TOP_Y = 50;
const TRACK_X = DESIGN_WIDTH / 2;
const TRACK_W = 110;
const KEY_W = 140;

class Game {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        document.getElementById('game-stage').prepend(this.canvas);

        this.engine = new RhythmEngine();
        this.multiplayer = new MultiplayerManager();

        this.state = 'LOBBY';
        this.score = 0;
        this.combo = 0;
        this.selectedCharacter = 'candy_king';

        this.assets = {};
        this.fartPool = [];

        this.characters = [
            { id: 'candy_king', name: 'Candy King', img: 'assets/character_candy_king.png' },
            { id: 'neon_goth', name: 'Neon Goth', img: 'assets/character_neon_goth.png' },
            { id: 'pastel_bunny', name: 'Pastel Bunny', img: 'assets/character_pastel_bunny.png' }
        ];

        this.classicalSongs = CLASSICAL_SONGS;
        this.particles = [];
        this.remotePlayers = new Map();

        this.musicVolume = parseFloat(localStorage.getItem('cfr_music') || '0.75');
        this.sfxVolume = parseFloat(localStorage.getItem('cfr_sfx') || '0.8');
        this.masterVolume = parseFloat(localStorage.getItem('cfr_master') || '1');
        this.sfxGain = null;
        this.masterGain = null;

        window.addEventListener('resize', () => this.resize());
        window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 100));
        window.visualViewport?.addEventListener('resize', () => this.resize());
        this.resize();
        this.init();
    }

    async init() {
        await this.loadAssets();
        this.applyUIButtonStyle();
        this.setupLobby();
        this.setupVolumeControls();
        this.applyVolumes();

        this.multiplayer.onPlayersUpdate = (players) => {
            this.remotePlayers = players;
        };
        this.multiplayer.onHighScoresUpdate = (scores) => {
            this.updateLeaderboardUI(scores);
        };
        this.multiplayer.onFartReceived = (peerId, event) => {
            this.triggerRemoteFart(peerId, event);
        };

        let code = MultiplayerManager.getCodeFromURL();
        if (!code) code = MultiplayerManager.generateCode();
        this.joinRoom(code);

        this.multiplayer.subscribeHighScores();

        requestAnimationFrame((t) => this.loop(t));
    }

    joinRoom(code) {
        code = code.toUpperCase();
        this.multiplayer.join(code);
        this.multiplayer.setURLCode(code);
        const codeEl = document.getElementById('room-code');
        if (codeEl) codeEl.innerText = code;
        this.updatePresence();
    }

    showLoadingProgress(onComplete) {
        const wrap = document.getElementById('load-progress-wrap');
        const bar = document.getElementById('load-progress-bar');
        if (!wrap || !bar) { if (onComplete) onComplete(); return; }

        wrap.style.display = 'block';
        bar.style.width = '0%';

        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 20 + 10;
            if (progress >= 100) {
                progress = 100;
                bar.style.width = '100%';
                clearInterval(interval);
                if (onComplete) onComplete();
                setTimeout(() => { wrap.style.display = 'none'; }, 600);
            } else {
                bar.style.width = `${progress}%`;
            }
        }, 80);
    }

    updateLeaderboardUI(scores) {
        const list = document.getElementById('leaderboard-list');
        if (!list) return;
        if (!scores.length) {
            list.innerHTML = '<p style="opacity:0.5;">No scores yet — be the first!</p>';
            return;
        }
        list.innerHTML = '';
        scores.forEach((s, i) => {
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.padding = '5px 0';
            div.style.borderBottom = '1px solid rgba(0,255,255,0.2)';
            div.innerHTML = `<span>${i + 1}. ${s.name}</span> <span style="color:#00ffff">${s.score}</span>`;
            list.appendChild(div);
        });
    }

    async loadAssets() {
        const loadImg = (path) => new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = `${path}?v=2`;
        });

        this.assets.bg = await loadImg('assets/candy_disco_background.png');
        this.assets.fartVFX = await loadImg('assets/fart_cloud_vfx.png');
        this.assets.uiButton = await loadImg('assets/ui_button_candy.png');

        for (const char of this.characters) {
            this.assets[char.id] = await loadImg(char.img);
        }

        this.masterGain = new Tone.Volume(Tone.gainToDb(this.masterVolume)).toDestination();
        this.sfxGain = new Tone.Volume(Tone.gainToDb(this.sfxVolume)).connect(this.masterGain);

        let fartPaths = [];
        try {
            const res = await fetch('assets/audio/farts/manifest.json?v=2');
            if (res.ok) fartPaths = await res.json();
        } catch { /* ignore */ }

        for (let i = 0; i < fartPaths.length; i++) {
            const path = fartPaths[i];
            try {
                const entry = { id: i, path, player: null };
                entry.player = new Tone.Player({
                    url: path,
                    onerror: () => { entry.player = null; }
                }).connect(this.sfxGain);
                this.fartPool.push(entry);
            } catch {
                /* skip */
            }
        }

        await Tone.loaded().catch(() => {});
        this.fartPool = this.fartPool.filter(e => {
            const dur = e.player?.buffer?.duration ?? 0;
            return dur > 0 && dur <= MAX_SFX_SEC + 0.05;
        });
        this.applyVolumes();
    }

    playFartPlayer(player) {
        if (!player?.loaded) return false;
        player.stop();
        const dur = Math.min(MAX_SFX_SEC, player.buffer.duration);
        player.start(0, undefined, dur);
        return true;
    }

    applyVolumes() {
        this.engine.setSongVolume(this.musicVolume);
        if (this.masterGain) {
            this.masterGain.volume.value = this.masterVolume <= 0
                ? -Infinity
                : Tone.gainToDb(this.masterVolume);
        }
        if (this.sfxGain) {
            this.sfxGain.volume.value = this.sfxVolume <= 0
                ? -Infinity
                : Tone.gainToDb(this.sfxVolume);
        }
        const ids = ['music-volume', 'hud-music-volume', 'sfx-volume', 'hud-sfx-volume', 'master-volume', 'hud-master-volume'];
        const musicPct = Math.round(this.musicVolume * 100);
        const sfxPct = Math.round(this.sfxVolume * 100);
        const masterPct = Math.round(this.masterVolume * 100);
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (id.includes('music')) el.value = musicPct;
            else if (id.includes('sfx')) el.value = sfxPct;
            else if (id.includes('master')) el.value = masterPct;
        });
        const ml = document.getElementById('music-volume-label');
        const sl = document.getElementById('sfx-volume-label');
        const mst = document.getElementById('master-volume-label');
        if (ml) ml.textContent = `${musicPct}%`;
        if (sl) sl.textContent = `${sfxPct}%`;
        if (mst) mst.textContent = `${masterPct}%`;
    }

    setupVolumeControls() {
        const bind = (id, storageKey, prop) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', () => {
                const v = parseInt(el.value, 10) / 100;
                this[prop] = v;
                localStorage.setItem(storageKey, String(v));
                const pairId = id.startsWith('hud-') ? id.replace('hud-', '') : `hud-${id}`;
                const pair = document.getElementById(pairId);
                if (pair) pair.value = el.value;
                this.applyVolumes();
            });
        };
        bind('master-volume', 'cfr_master', 'masterVolume');
        bind('hud-master-volume', 'cfr_master', 'masterVolume');
        bind('music-volume', 'cfr_music', 'musicVolume');
        bind('hud-music-volume', 'cfr_music', 'musicVolume');
        bind('sfx-volume', 'cfr_sfx', 'sfxVolume');
        bind('hud-sfx-volume', 'cfr_sfx', 'sfxVolume');
    }

    applyUIButtonStyle() {
        if (!this.assets.uiButton) return;
        const src = 'assets/ui_button_candy.png';
        const startBtn = document.getElementById('start-game');
        if (startBtn) {
            startBtn.style.backgroundImage = `url(${src})`;
            startBtn.style.backgroundSize = 'contain';
            startBtn.style.backgroundRepeat = 'no-repeat';
            startBtn.style.backgroundPosition = 'center';
            startBtn.style.backgroundColor = 'transparent';
            startBtn.style.minWidth = '280px';
            startBtn.style.minHeight = '80px';
            startBtn.style.color = '#fff';
            startBtn.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
            startBtn.style.border = 'none';
            startBtn.style.boxShadow = 'none';
        }
    }

    setupLobby() {
        const charList = document.getElementById('character-list');
        if (charList) {
            charList.innerHTML = '';
            this.characters.forEach(char => {
                const div = document.createElement('div');
                div.className = 'char-option';
                div.style.cursor = 'pointer';
                div.style.border = '4px solid transparent';
                div.style.borderRadius = '10px';
                div.style.padding = '5px';
                div.style.textAlign = 'center';
                div.style.color = 'white';
                if (this.assets[char.id]) {
                    div.innerHTML = `<img src="${char.img}?v=2" width="80" style="image-rendering:pixelated;display:block;margin:0 auto;background:transparent;"><br>${char.name}`;
                } else {
                    div.innerHTML = `<div style="width:80px;height:80px;background:#ff69b4;border-radius:8px;margin:0 auto 4px;"></div>${char.name}`;
                }

                div.onclick = () => {
                    this.selectedCharacter = char.id;
                    Array.from(charList.children).forEach(c => c.style.borderColor = 'transparent');
                    div.style.borderColor = '#ff69b4';
                    this.updatePresence();
                };

                if (char.id === this.selectedCharacter) div.style.borderColor = '#ff69b4';
                charList.appendChild(div);
            });
        }

        const fartGroup = document.getElementById('fart-group');
        if (fartGroup) {
            fartGroup.innerHTML = '';
            const btn = document.createElement('button');
            btn.innerText = '🎲 Test random fart';
            btn.style.padding = '6px 16px';
            btn.style.borderRadius = '15px';
            btn.style.border = '2px solid white';
            btn.style.background = '#9b59b6';
            btn.style.color = 'white';
            btn.style.cursor = 'pointer';
            btn.style.fontWeight = 'bold';
            btn.onclick = () => this.playRandomFart();
            fartGroup.appendChild(btn);
            const info = document.createElement('p');
            info.style.cssText = 'margin:8px 0 0;font-size:0.75rem;opacity:0.7;';
            info.textContent = `${this.fartPool.length || '…'} losowych odgłosów w grze`;
            info.id = 'fart-count-label';
            fartGroup.appendChild(info);
        }

        const copyBtn = document.getElementById('copy-code');
        if (copyBtn) {
            copyBtn.onclick = () => {
                const link = `${window.location.origin}${window.location.pathname}?room=${this.multiplayer.roomCode}`;
                navigator.clipboard?.writeText(link).catch(() => {});
                copyBtn.innerText = 'COPIED!';
                setTimeout(() => { copyBtn.innerText = 'COPY LINK'; }, 1500);
            };
        }

        const joinBtn = document.getElementById('join-code-btn');
        const joinInput = document.getElementById('join-code-input');
        if (joinBtn && joinInput) {
            const doJoin = () => {
                const code = joinInput.value.trim().toUpperCase();
                if (code.length >= 3) {
                    this.joinRoom(code);
                    joinInput.value = '';
                }
            };
            joinBtn.onclick = doJoin;
            joinInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') doJoin();
            });
        }

        const libraryContainer = document.getElementById('song-library');
        if (libraryContainer) {
            libraryContainer.innerHTML = '';
            this.classicalSongs.forEach(song => {
                const div = document.createElement('div');
                div.className = 'song-row';
                div.style.display = 'flex';
                div.style.justifyContent = 'space-between';
                div.style.alignItems = 'center';
                div.style.padding = '8px';
                div.style.background = 'rgba(255,255,255,0.05)';
                div.style.borderRadius = '10px';
                div.innerHTML = `
                    <div style="font-size: 0.85rem; text-align:left;">
                        <strong style="color: #ff69b4">${song.title}</strong><br>
                        <small style="opacity: 0.7">${song.composer}</small>
                    </div>
                    <button class="load-btn" style="background:#ff69b4; border:none; color:white; padding: 5px 10px; border-radius:10px; cursor:pointer; font-size:0.7rem; font-weight:bold; flex-shrink:0;">LOAD</button>
                `;
                const btn = div.querySelector('.load-btn');
                btn.onclick = () => {
                    btn.innerText = 'LOADING...';
                    document.getElementById('midi-status').innerText = `Loading: ${song.title}...`;
                    document.getElementById('midi-status').style.color = '#ffff66';

                    this.showLoadingProgress(() => {
                        const songData = generateSongNotes(song.title);
                        this.engine.loadGeneratedSong(songData);
                        document.getElementById('midi-status').innerText = `Loaded: ${song.title}`;
                        document.getElementById('midi-status').style.color = '#00ffff';
                        Array.from(libraryContainer.children).forEach(c => c.style.background = 'rgba(255,255,255,0.05)');
                        div.style.background = 'rgba(255,105,180,0.3)';
                        btn.innerText = 'SELECTED';
                        setTimeout(() => { btn.innerText = 'LOAD'; }, 1500);
                    });
                };
                libraryContainer.appendChild(div);
            });
        }

        document.getElementById('midi-upload').onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById('midi-status').innerText = `Loading: ${file.name}...`;
                document.getElementById('midi-status').style.color = '#ffff66';
                this.showLoadingProgress(async () => {
                    try {
                        await this.engine.loadMidi(file);
                        document.getElementById('midi-status').innerText = `Loaded: ${file.name}`;
                        document.getElementById('midi-status').style.color = '#00ffff';
                    } catch (err) {
                        document.getElementById('midi-status').innerText = 'Error reading file';
                        document.getElementById('midi-status').style.color = '#ff4444';
                        console.error('Failed to parse MIDI file:', err);
                    }
                });
            }
        };

        document.getElementById('start-game').onclick = async () => {
            const errorEl = document.getElementById('error-message');
            if (!this.engine.midiData) {
                if (errorEl) {
                    errorEl.style.display = 'block';
                    setTimeout(() => { errorEl.style.display = 'none'; }, 3000);
                }
                return;
            }
        if (errorEl) errorEl.style.display = 'none';
        await Tone.start();
        await Tone.getContext().resume();
        await this.engine.initAudio();
        this.engine.connectTo(this.masterGain);
        if (this.engine.notes.length) {
            this.engine.notes = this.engine.assignLanes(
                this.engine.notes.map(({ hit, _played, lane, ...rest }) => rest)
            );
        }
        this.applyVolumes();
        this.startGame();
        };

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && this.state === 'PLAYING') {
                e.preventDefault();
                this.handleInput();
            }
        });

        this.canvas.addEventListener('pointerdown', () => {
            if (this.state === 'PLAYING') this.handleInput();
        });
    }

    startGame() {
        this.state = 'PLAYING';
        document.getElementById('lobby-screen').style.display = 'none';
        document.getElementById('hud').style.display = 'flex';
        this.score = 0;
        this.combo = 0;
        this.updateHUD();

        this.engine.onProgress = (p) => {
            document.getElementById('progress-bar').style.width = `${p * 100}%`;
        };

        this.engine.onComplete = () => {
            this.engine.stop();
            this.state = 'RESULTS';
            const hud = document.getElementById('hud');
            if (hud) {
                const results = document.createElement('div');
                results.id = 'results-overlay';
                results.style.position = 'absolute';
                results.style.top = '50%';
                results.style.left = '50%';
                results.style.transform = 'translate(-50%, -50%)';
                results.style.background = 'rgba(0,0,0,0.9)';
                results.style.padding = '40px';
                results.style.borderRadius = '20px';
                results.style.textAlign = 'center';
                results.style.border = '4px solid #ff69b4';
                results.style.pointerEvents = 'auto';
                results.innerHTML = `
                    <h2 style="font-family: Orbitron; color: #00ffff; font-size: 2.5rem;">PARTY OVER!</h2>
                    <p style="font-size: 1.5rem;">FINAL SCORE: ${this.score}</p>
                    <button id="results-lobby-btn" style="margin-top:16px;background:#ff69b4;color:white;border:3px solid white;padding:10px 28px;border-radius:20px;font-family:Orbitron;font-weight:bold;cursor:pointer;">BACK TO LOBBY</button>
                `;
                document.getElementById('ui-layer').appendChild(results);
                document.getElementById('results-lobby-btn').onclick = () => location.reload();
            }

            const charName = this.characters.find(c => c.id === this.selectedCharacter)?.name || 'Player';
            this.multiplayer.saveHighScore(charName, this.score);
        };

        this.engine.start();
    }

    updatePresence() {
        this.multiplayer.updatePresence({
            character: this.selectedCharacter,
            score: this.score,
            combo: this.combo
        });
    }

    playRandomFart() {
        if (!this.fartPool.length) {
            this.playProceduralFart(Math.random());
            return -1;
        }
        const entry = this.fartPool[Math.floor(Math.random() * this.fartPool.length)];
        if (this.playFartPlayer(entry?.player)) {
            return entry.id;
        }
        this.playProceduralFart(Math.random());
        return -1;
    }

    playFartByIndex(index) {
        const entry = this.fartPool[index];
        if (this.playFartPlayer(entry?.player)) {
            return;
        }
        this.playProceduralFart(Math.random());
    }

    playProceduralFart(seed = 0) {
        const dur = 0.45;
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        const base = 55 + Math.floor((typeof seed === 'number' ? seed : Math.random()) * 40);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(base, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(base * 0.55, ac.currentTime + dur * 0.7);
        gain.gain.setValueAtTime(0.35 * this.sfxVolume * this.masterVolume, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + dur);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start();
        osc.stop(ac.currentTime + dur);
    }

    handleInput() {
        const hit = this.engine.checkHit(performance.now());
        this.triggerFart(hit ? hit.accuracy : 'MISS');

        if (hit) {
            const pointsMap = { PERFECT: 1000, GREAT: 500, GOOD: 200, MISS: 0 };
            const points = pointsMap[hit.accuracy];

            if (hit.accuracy !== 'MISS') {
                this.score += points * (1 + Math.floor(this.combo / 10));
                this.combo++;
            } else {
                this.combo = 0;
            }

            this.showAccuracy(hit.accuracy);
            this.updateHUD();
            this.updatePresence();
        } else {
            this.combo = 0;
            this.showAccuracy('MISS');
            this.updateHUD();
        }
    }

    triggerFart(accuracy) {
        const soundIndex = this.playRandomFart();
        this.multiplayer.broadcastFart(soundIndex, accuracy);
        this.spawnFartParticles(DESIGN_WIDTH / 2, HIT_LINE_Y);
    }

    triggerRemoteFart(peerId, event) {
        if (event.soundIndex >= 0) {
            this.playFartByIndex(event.soundIndex);
        } else {
            this.playRandomFart();
        }

        const players = Array.from(this.remotePlayers.values());
        const index = players.findIndex(p => p.id === peerId);
        if (index !== -1) {
            const x = (index + 1) * (DESIGN_WIDTH / (players.length + 1));
            this.spawnFartParticles(x, HIT_LINE_Y);
        }
    }

    spawnFartParticles(x, y) {
        for (let i = 0; i < 5; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 50,
                y: y + (Math.random() - 0.5) * 50,
                vx: (Math.random() - 0.5) * 10,
                vy: -Math.random() * 5 - 2,
                life: 1.0,
                scale: 0.5 + Math.random() * 1.0,
                rot: Math.random() * Math.PI * 2
            });
        }
    }

    showAccuracy(text) {
        const el = document.getElementById('accuracy-text');
        el.innerText = text;
        el.style.color = text === 'PERFECT' ? '#00ffff' : (text === 'MISS' ? '#ff0000' : '#ff69b4');
        el.style.opacity = '1';
        el.style.transform = 'scale(1.2)';

        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'scale(1)';
        }, 500);
    }

    updateHUD() {
        document.getElementById('score').innerText = String(this.score).padStart(6, '0');
        document.getElementById('combo').innerText = this.combo;
    }

    resize() {
        const vw = window.visualViewport?.width ?? window.innerWidth;
        const vh = window.visualViewport?.height ?? window.innerHeight;
        const scale = Math.max(vw / DESIGN_WIDTH, vh / DESIGN_HEIGHT);

        this.canvas.width = DESIGN_WIDTH;
        this.canvas.height = DESIGN_HEIGHT;

        const stage = document.getElementById('game-stage');
        if (stage) {
            stage.style.width = `${DESIGN_WIDTH}px`;
            stage.style.height = `${DESIGN_HEIGHT}px`;
            stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
        }
    }

    loop(t) {
        this.update(t);
        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    }

    update(t) {
        this.engine.update(t);

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

        if (this.assets.bg) {
            ctx.drawImage(this.assets.bg, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
        } else {
            const grd = ctx.createLinearGradient(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
            grd.addColorStop(0, '#1a0a2e');
            grd.addColorStop(0.5, '#2d1b4e');
            grd.addColorStop(1, '#0a1628');
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
            this.drawDiscoFloor(ctx);
        }

        if (this.state === 'PLAYING') {
            this.drawGame(ctx);
        } else {
            this.drawLobby(ctx);
        }

        this.particles.forEach(p => {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.globalAlpha = p.life;
            const size = 100 * p.scale;
            if (this.assets.fartVFX) {
                ctx.drawImage(this.assets.fartVFX, -size / 2, -size / 2, size, size);
            } else {
                ctx.fillStyle = `hsla(${300 + p.life * 60}, 80%, 60%, ${p.life})`;
                ctx.beginPath();
                ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        });
        ctx.globalAlpha = 1;
    }

    drawDiscoFloor(ctx) {
        const y = DESIGN_HEIGHT * 0.65;
        const h = DESIGN_HEIGHT * 0.35;
        const cols = 12;
        const rows = 4;
        const tileW = DESIGN_WIDTH / cols;
        const tileH = h / rows;
        const colors = ['#ff69b4', '#00ffff', '#7fff00', '#da70d6'];
        const t = performance.now() * 0.002;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                ctx.fillStyle = colors[(c + r + Math.floor(t)) % colors.length] + '44';
                ctx.fillRect(c * tileW, y + r * tileH, tileW - 2, tileH - 2);
            }
        }
    }

    drawLobby(ctx) {
        this.drawPlayers(ctx);
    }

    getNoteScreenPos(note, elapsedTime) {
        const timeUntil = note.time - elapsedTime;
        const progress = 1 - Math.max(0, Math.min(1, timeUntil / NOTE_LOOKAHEAD));
        const fallDist = HIT_LINE_Y - NOTE_TOP_Y;
        return {
            x: TRACK_X,
            y: NOTE_TOP_Y + progress * fallDist,
            progress
        };
    }

    roundRect(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
        ctx.closePath();
    }

    drawSynthesiaOverlay(ctx) {
        const grd = ctx.createLinearGradient(0, 0, 0, KEYBOARD_Y);
        grd.addColorStop(0, 'rgba(80, 220, 255, 0.55)');
        grd.addColorStop(0.55, 'rgba(60, 100, 220, 0.45)');
        grd.addColorStop(1, 'rgba(40, 20, 100, 0.65)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, DESIGN_WIDTH, KEYBOARD_Y);
    }

    drawSingleTrack(ctx) {
        const x = TRACK_X - TRACK_W / 2;

        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(x, NOTE_TOP_Y, TRACK_W, HIT_LINE_Y - NOTE_TOP_Y);

        ctx.strokeStyle = 'rgba(255,105,180,0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, NOTE_TOP_Y, TRACK_W, HIT_LINE_Y - NOTE_TOP_Y);

        const grd = ctx.createLinearGradient(TRACK_X, NOTE_TOP_Y, TRACK_X, HIT_LINE_Y);
        grd.addColorStop(0, 'rgba(0,255,255,0.05)');
        grd.addColorStop(1, 'rgba(255,105,180,0.25)');
        ctx.fillStyle = grd;
        ctx.fillRect(x + 4, NOTE_TOP_Y, TRACK_W - 8, HIT_LINE_Y - NOTE_TOP_Y);

        const bpm = this.engine.bpm || 96;
        const beatSec = 60 / bpm;
        const fallDist = HIT_LINE_Y - NOTE_TOP_Y;
        const pxPerSec = fallDist / NOTE_LOOKAHEAD;
        const beatPx = beatSec * pxPerSec;
        if (this.state === 'PLAYING' && beatPx > 8) {
            const elapsed = this.engine.isPlaying
                ? (performance.now() - this.engine.startTime) / 1000
                : 0;
            const phase = (elapsed % beatSec) / beatSec;
            const offset = phase * beatPx;
            ctx.strokeStyle = 'rgba(255,255,255,0.07)';
            ctx.lineWidth = 1;
            for (let y = HIT_LINE_Y - offset; y >= NOTE_TOP_Y; y -= beatPx) {
                ctx.beginPath();
                ctx.moveTo(x + 6, y);
                ctx.lineTo(x + TRACK_W - 6, y);
                ctx.stroke();
            }
        }

        ctx.strokeStyle = 'rgba(0,255,255,0.85)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(TRACK_X - KEY_W / 2 - 20, HIT_LINE_Y);
        ctx.lineTo(TRACK_X + KEY_W / 2 + 20, HIT_LINE_Y);
        ctx.stroke();
    }

    drawHitKey(ctx, active) {
        const x = TRACK_X - KEY_W / 2;
        ctx.fillStyle = active ? '#b8bcc8' : '#f4f6fb';
        ctx.fillRect(x, KEYBOARD_Y, KEY_W, KEYBOARD_H);
        ctx.strokeStyle = '#9aa0ad';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, KEYBOARD_Y, KEY_W, KEYBOARD_H);
    }

    drawFallingNote(ctx, x, y, note, progress) {
        let color = (note.colorIdx ?? 0) % 2 === 0 ? '#39ff14' : '#ff2bd6';
        if (note.hit) color = '#00ffff';
        else if (note.missed) color = '#555';

        const w = TRACK_W * 0.75;
        const h = 32;
        const nx = x - w / 2;
        const ny = y - h / 2;

        // Ślad / glow w górę
        const trailH = 90 + progress * 40;
        const trail = ctx.createLinearGradient(x, ny - trailH, x, ny);
        trail.addColorStop(0, 'rgba(0,0,0,0)');
        trail.addColorStop(0.5, color + '33');
        trail.addColorStop(1, color + 'aa');
        ctx.fillStyle = trail;
        ctx.fillRect(nx, ny - trailH, w, trailH);

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 22;
        this.roundRect(ctx, nx, ny, w, h, 10);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }

    drawGame(ctx) {
        const currentTime = performance.now();
        const elapsedTime = (currentTime - this.engine.startTime) / 1000;

        this.drawSynthesiaOverlay(ctx);
        this.drawSingleTrack(ctx);

        const upcoming = this.engine.getUpcomingNotes(currentTime, NOTE_LOOKAHEAD);
        let hitActive = false;

        upcoming.forEach(note => {
            const pos = this.getNoteScreenPos(note, elapsedTime);
            if (pos.progress > 0.88) hitActive = true;
            this.drawFallingNote(ctx, pos.x, pos.y, note, pos.progress);
        });

        this.drawPlayers(ctx, true);
        this.drawHitKey(ctx, hitActive);
    }

    drawPlayers(ctx, compact = false) {
        let players = Array.from(this.remotePlayers.values());

        if (!players.length) {
            players = [{
                id: this.multiplayer.playerId,
                character: this.selectedCharacter,
                score: this.score
            }];
        }

        const total = players.length;

        players.forEach((player, i) => {
            const x = compact
                ? (i + 1) * (DESIGN_WIDTH / (total + 1))
                : (i + 1) * (DESIGN_WIDTH / (total + 1));
            const y = compact ? KEYBOARD_Y - 30 : DESIGN_HEIGHT * 0.7;
            const charId = player.character || 'candy_king';
            const img = this.assets[charId];
            const bounce = Math.sin(Date.now() / 200) * 10;
            const drawH = compact ? 110 : 200;
            if (img) {
                const drawW = drawH * (img.width / img.height);
                ctx.drawImage(img, x - drawW / 2, y - drawH + bounce, drawW, drawH);
            } else {
                const colors = { candy_king: '#ff69b4', neon_goth: '#9b59b6', pastel_bunny: '#ffb6c1' };
                ctx.fillStyle = colors[charId] || '#ff69b4';
                ctx.fillRect(x - 80, y - 180 + bounce, 160, 160);
                ctx.fillStyle = '#fff';
                ctx.fillRect(x - 30, y - 150 + bounce, 20, 20);
                ctx.fillRect(x + 10, y - 150 + bounce, 20, 20);
            }

            if (!compact) {
                ctx.fillStyle = 'white';
                ctx.font = 'bold 24px Inter';
                ctx.textAlign = 'center';
                const label = player.id === this.multiplayer.playerId ? 'YOU' : `PLAYER ${i + 1}`;
                ctx.fillText(label, x, y - drawH - 20 + bounce);
            }

            if (this.state === 'PLAYING' && !compact) {
                ctx.fillStyle = '#00ffff';
                ctx.font = 'bold 20px Orbitron';
                ctx.fillText(player.score || 0, x, y - 250 + bounce);
            }
        });
    }
}

new Game();
