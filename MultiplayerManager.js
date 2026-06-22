import { init, id } from '@instantdb/core';
import { INSTANT_DB_APP_ID } from './instant_db_config.js';

const db = init({ appId: INSTANT_DB_APP_ID });

export class MultiplayerManager {
    constructor() {
        this.room = null;
        this.playerId = id();
        this.players = new Map();
        this.roomCode = null;
        this.onPlayersUpdate = null;
        this.onFartReceived = null;
        this.onHighScoresUpdate = null;
        this.highScores = [];
    }

    static generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    join(roomCode) {
        if (this.room) {
            try { this.room.leaveRoom(); } catch (e) { /* ignore */ }
        }

        this.roomCode = roomCode;
        const roomId = `room-${roomCode}`;
        this.room = db.joinRoom('fart-party', roomId);

        this.room.subscribePresence({}, (data) => {
            const { user, peers } = data;
            this.players.clear();
            if (user) this.players.set(this.playerId, { ...user, id: this.playerId });
            Object.entries(peers).forEach(([peerId, player]) => {
                this.players.set(peerId, { ...player, id: peerId });
            });
            if (this.onPlayersUpdate) this.onPlayersUpdate(this.players);
        });

        this.room.subscribeTopic('fart', (event, peer) => {
            if (this.onFartReceived) this.onFartReceived(peer?.id || 'unknown', event);
        });
    }

    subscribeHighScores() {
        db.subscribeQuery({ high_scores: {} }, (resp) => {
            if (resp.data?.high_scores) {
                this.highScores = resp.data.high_scores
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 10);
                if (this.onHighScoresUpdate) this.onHighScoresUpdate(this.highScores);
            }
        });
    }

    saveHighScore(playerName, score) {
        db.transact(
            db.tx.high_scores[id()].update({
                name: playerName,
                score,
                timestamp: Date.now()
            })
        );
    }

    updatePresence(data) {
        if (this.room) {
            this.room.publishPresence({ id: this.playerId, ...data });
        }
    }

    broadcastFart(soundIndex, accuracy) {
        if (this.room) {
            this.room.publishTopic('fart', { soundIndex, accuracy });
        }
    }

    static getCodeFromURL() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('room');
        return code ? code.toUpperCase() : null;
    }

    setURLCode(code) {
        window.history.replaceState({}, '', `?room=${code}`);
    }
}
