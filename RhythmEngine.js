import * as Tone from 'tone';

export const LANE_COUNT = 14;
export const GAME_BPM = 96;
export const BEAT_SEC = 60 / GAME_BPM;
export const MAX_SFX_SEC = 2;

function midiToName(midi) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    return names[midi % 12] + octave;
}

export function generateBeatNotes(totalDuration, bpm = GAME_BPM, maxNotes = 55) {
    const beatSec = 60 / bpm;
    const end = Math.max(beatSec * 4, totalDuration - 0.5);
    const notes = [];
    let time = beatSec * 2;
    let step = 0;

    while (time < end && notes.length < maxNotes) {
        const midi = 60 + (step % 7) * 2;
        notes.push({
            time,
            duration: beatSec * 0.75,
            midi,
            name: midiToName(midi),
            velocity: 0.75,
            hit: false
        });
        time += beatSec;
        step++;
    }

    return notes;
}

export function simplifyNotesForGameplay(rawNotes, options = {}) {
    const {
        bpm = GAME_BPM,
        minGapBeats = 1,
        subdivision = 2,
        maxNotes = 55
    } = options;

    const beatSec = 60 / bpm;
    const grid = beatSec / subdivision;
    const minGap = minGapBeats * beatSec;

    const sorted = [...rawNotes].sort((a, b) => a.time - b.time);
    const thinned = [];
    let lastKept = -Infinity;

    for (const note of sorted) {
        const time = Math.round(note.time / grid) * grid;
        if (time - lastKept < minGap - 1e-6) continue;

        thinned.push({
            ...note,
            time,
            duration: Math.max(note.duration || beatSec * 0.75, grid)
        });
        lastKept = time;
        if (thinned.length >= maxNotes) break;
    }

    return thinned;
}

export class RhythmEngine {
    constructor() {
        this.songMeta = null;
        this.notes = [];
        this.startTime = 0;
        this.isPlaying = false;
        this.onProgress = null;
        this.onComplete = null;
        this.synth = null;
        this.panner = null;
        this.musicFilter = null;
        this.musicGain = null;
        this.mp3Player = null;
        this.mp3ObjectUrl = null;
        this.useMp3Playback = false;
        this.songVolume = 0.75;
        this.bpm = GAME_BPM;
    }

    setSongVolume(volume) {
        this.songVolume = Math.max(0, Math.min(1, volume));
        if (this.musicGain) {
            this.musicGain.gain.value = this.songVolume;
        }
    }

    async initAudio() {
        if (this.synth) return;
        await Tone.start();
        await Tone.getContext().resume();

        this.musicGain = new Tone.Gain(this.songVolume);
        this.panner = new Tone.Panner(0);
        this.musicFilter = new Tone.Filter({
            type: 'lowpass',
            frequency: 2400,
            rolloff: -12,
            Q: 0.5
        });
        this.synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.02, decay: 0.2, sustain: 0.45, release: 0.35 }
        }).connect(this.musicFilter);
        this.musicFilter.connect(this.musicGain);
        this.musicGain.connect(this.panner);
        this.setSongVolume(this.songVolume);
    }

    connectTo(node) {
        this.panner.disconnect();
        if (node) this.panner.connect(node);
        else this.panner.toDestination();
    }

    disposeMp3() {
        if (this.mp3Player) {
            this.mp3Player.stop();
            this.mp3Player.disconnect();
            this.mp3Player.dispose();
            this.mp3Player = null;
        }
        if (this.mp3ObjectUrl) {
            URL.revokeObjectURL(this.mp3ObjectUrl);
            this.mp3ObjectUrl = null;
        }
        this.useMp3Playback = false;
    }

    assignLanes(notes) {
        return notes.map((n, i) => ({
            ...n,
            midi: n.midi ?? 60,
            lane: 0,
            colorIdx: i % 2,
            hit: false,
            _played: false
        }));
    }

    loadGeneratedSong(songData) {
        this.disposeMp3();
        this.bpm = songData.bpm || GAME_BPM;
        const simplified = simplifyNotesForGameplay(songData.notes, {
            bpm: this.bpm,
            minGapBeats: 1,
            maxNotes: 55
        });
        this.notes = this.assignLanes(simplified).sort((a, b) => a.time - b.time);
        const last = this.notes[this.notes.length - 1];
        const duration = last ? last.time + 2.5 : songData.duration;
        this.songMeta = { duration, title: songData.title, source: 'generated' };
        return this.notes;
    }

    async loadMp3(file) {
        await this.initAudio();
        this.disposeMp3();

        const url = URL.createObjectURL(file);
        this.mp3ObjectUrl = url;

        await new Promise((resolve, reject) => {
            this.mp3Player = new Tone.Player({
                url,
                onload: resolve,
                onerror: () => reject(new Error('Failed to load MP3'))
            }).connect(this.musicGain);
        });

        const duration = this.mp3Player.buffer.duration;
        if (!duration || duration <= 0) {
            this.disposeMp3();
            throw new Error('Invalid MP3 duration');
        }

        this.bpm = GAME_BPM;
        const rawNotes = generateBeatNotes(duration, this.bpm);
        const simplified = simplifyNotesForGameplay(rawNotes, {
            bpm: this.bpm,
            minGapBeats: 1,
            maxNotes: 55
        });
        this.notes = this.assignLanes(simplified).sort((a, b) => a.time - b.time);
        this.useMp3Playback = true;
        this.songMeta = {
            duration,
            title: file.name.replace(/\.mp3$/i, ''),
            source: 'mp3'
        };

        return this.notes;
    }

    start() {
        this.startTime = performance.now();
        this.isPlaying = true;
        this.notes.forEach(n => { n.hit = false; n._played = false; });

        if (this.mp3Player?.loaded) {
            this.mp3Player.stop();
            this.mp3Player.start();
        }
    }

    stop() {
        this.isPlaying = false;
        if (this.synth) this.synth.releaseAll();
        if (this.mp3Player?.loaded) this.mp3Player.stop();
    }

    update(currentTime) {
        if (!this.isPlaying || !this.songMeta) return 0;

        const elapsedTime = (currentTime - this.startTime) / 1000;
        const totalDuration = this.songMeta.duration;

        this.playDueNotes(elapsedTime);

        if (this.onProgress) {
            this.onProgress(Math.min(1, elapsedTime / totalDuration));
        }

        if (elapsedTime >= totalDuration) {
            this.isPlaying = false;
            if (this.mp3Player?.loaded) this.mp3Player.stop();
            if (this.onComplete) this.onComplete();
        }

        return elapsedTime;
    }

    playDueNotes(elapsedTime) {
        if (this.useMp3Playback || !this.synth || this.songVolume <= 0) return;

        for (const note of this.notes) {
            if (note._played || elapsedTime < note.time) continue;
            note._played = true;

            const pitch = note.name || 'C4';
            const raw = note.velocity != null ? note.velocity : 0.7;
            const baseVel = raw > 1 ? raw / 127 : raw;
            const vel = Math.min(0.9, baseVel * 0.85);
            this.synth.triggerAttackRelease(
                pitch,
                Math.min(note.duration || 0.35, 0.45),
                undefined,
                vel
            );
        }
    }

    getUpcomingNotes(currentTime, lookaheadSeconds = 2) {
        if (!this.isPlaying) return [];
        const elapsedTime = (currentTime - this.startTime) / 1000;
        return this.notes.filter(note =>
            note.time >= elapsedTime - 0.1 &&
            note.time <= elapsedTime + lookaheadSeconds &&
            !note.hit
        );
    }

    checkHit(currentTime, windowSeconds = 0.2) {
        if (!this.isPlaying) return null;

        const elapsedTime = (currentTime - this.startTime) / 1000;

        let bestNote = null;
        let minDiff = Infinity;

        for (const note of this.notes) {
            if (note.hit) continue;

            const diff = Math.abs(note.time - elapsedTime);
            if (diff < windowSeconds && diff < minDiff) {
                minDiff = diff;
                bestNote = note;
            }

            if (note.time > elapsedTime + windowSeconds) break;
        }

        if (bestNote) {
            bestNote.hit = true;
            return {
                accuracy: this.getAccuracyRating(minDiff, windowSeconds),
                diff: minDiff
            };
        }

        return null;
    }

    getAccuracyRating(diff, window) {
        const ratio = diff / window;
        if (ratio < 0.2) return 'PERFECT';
        if (ratio < 0.5) return 'GREAT';
        if (ratio < 0.8) return 'GOOD';
        return 'MISS';
    }
}
