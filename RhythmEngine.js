import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';

export const LANE_COUNT = 14;
export const GAME_BPM = 96;
export const BEAT_SEC = 60 / GAME_BPM;

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

function pickMelodyTrack(midiData) {
    let bestTrack = null;
    let bestScore = -1;

    for (const track of midiData.tracks) {
        if (!track.notes.length) continue;
        const melodic = track.notes.filter(n => n.midi >= 55 && n.midi <= 84).length;
        const score = melodic * 3 + track.notes.length;
        if (score > bestScore) {
            bestScore = score;
            bestTrack = track;
        }
    }

    return bestTrack || midiData.tracks.find(t => t.notes.length) || midiData.tracks[0];
}

export class RhythmEngine {
    constructor() {
        this.midiData = null;
        this.notes = [];
        this.startTime = 0;
        this.isPlaying = false;
        this.onProgress = null;
        this.onComplete = null;
        this.synth = null;
        this.panner = null;
        this.musicFilter = null;
        this.songVolume = 0.75;
        this.bpm = GAME_BPM;
    }

    setSongVolume(volume) {
        this.songVolume = Math.max(0, Math.min(1, volume));
        if (!this.synth) return;
        this.synth.volume.value = this.songVolume <= 0
            ? -Infinity
            : Tone.gainToDb(this.songVolume);
    }

    async initAudio() {
        if (this.synth) return;
        await Tone.start();
        this.panner = new Tone.Panner(0);
        this.musicFilter = new Tone.Filter({
            type: 'lowpass',
            frequency: 1600,
            rolloff: -24,
            Q: 0.6
        });
        this.synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.06, decay: 0.28, sustain: 0.35, release: 0.55 },
            volume: -8
        }).connect(this.musicFilter);
        this.musicFilter.connect(this.panner);
        this.setSongVolume(this.songVolume);
    }

    connectTo(node) {
        this.panner.disconnect();
        if (node) this.panner.connect(node);
        else this.panner.toDestination();
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
        this.bpm = songData.bpm || GAME_BPM;
        const simplified = simplifyNotesForGameplay(songData.notes, {
            bpm: this.bpm,
            minGapBeats: 1,
            maxNotes: 55
        });
        this.notes = this.assignLanes(simplified).sort((a, b) => a.time - b.time);
        const last = this.notes[this.notes.length - 1];
        this.midiData = { duration: last ? last.time + 2.5 : songData.duration };
        return this.notes;
    }

    async loadMidiFromUrl(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch MIDI');
        const arrayBuffer = await response.arrayBuffer();
        return this.loadMidiFromArrayBuffer(arrayBuffer);
    }

    async loadMidi(file) {
        const arrayBuffer = await file.arrayBuffer();
        return this.loadMidiFromArrayBuffer(arrayBuffer);
    }

    async loadMidiFromArrayBuffer(arrayBuffer) {
        this.midiData = new Midi(arrayBuffer);
        this.bpm = this.midiData.header.tempos[0]?.bpm || GAME_BPM;

        const melodyTrack = pickMelodyTrack(this.midiData);
        const rawNotes = (melodyTrack?.notes || []).flatMap(note => {
            if (note.velocity <= 0) return [];
            return [{
                time: note.time,
                duration: note.duration,
                name: note.name,
                midi: note.midi,
                velocity: note.velocity,
                hit: false
            }];
        });

        const simplified = simplifyNotesForGameplay(rawNotes, {
            bpm: this.bpm,
            minGapBeats: 1,
            maxNotes: 60
        });
        this.notes = this.assignLanes(simplified).sort((a, b) => a.time - b.time);

        if (!this.midiData.duration && this.notes.length) {
            const last = this.notes[this.notes.length - 1];
            this.midiData.duration = last.time + last.duration + 1;
        }

        return this.notes;
    }

    start() {
        this.startTime = performance.now();
        this.isPlaying = true;
        this.notes.forEach(n => { n.hit = false; n._played = false; });
    }

    stop() {
        this.isPlaying = false;
        if (this.synth) this.synth.releaseAll();
    }

    update(currentTime) {
        if (!this.isPlaying || !this.midiData) return 0;

        const elapsedTime = (currentTime - this.startTime) / 1000;
        const totalDuration = this.midiData.duration;

        this.playDueNotes(elapsedTime);

        if (this.onProgress) {
            this.onProgress(Math.min(1, elapsedTime / totalDuration));
        }

        if (elapsedTime >= totalDuration) {
            this.isPlaying = false;
            if (this.onComplete) this.onComplete();
        }

        return elapsedTime;
    }

    playDueNotes(elapsedTime) {
        if (!this.synth || this.songVolume <= 0) return;

        for (const note of this.notes) {
            if (note._played || elapsedTime < note.time) continue;
            note._played = true;

            const pitch = note.name || 'C4';
            const raw = note.velocity != null ? note.velocity : 0.7;
            const baseVel = raw > 1 ? raw / 127 : raw;
            const vel = Math.min(0.55, baseVel * this.songVolume * 0.7);
            this.synth.triggerAttackRelease(
                pitch,
                Math.min(note.duration || 0.3, 0.32),
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
