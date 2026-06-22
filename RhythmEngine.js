import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';

export const LANE_COUNT = 14;

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
        this.songVolume = 0.75;
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
        this.synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.02, decay: 0.12, sustain: 0.25, release: 0.35 }
        }).connect(this.panner);
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
        this.notes = this.assignLanes(songData.notes).sort((a, b) => a.time - b.time);
        this.midiData = { duration: songData.duration };
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

        const allNotes = [];
        this.midiData.tracks.forEach(track => {
            track.notes.forEach(note => {
                if (note.velocity <= 0) return;
                allNotes.push({
                    time: note.time,
                    duration: note.duration,
                    name: note.name,
                    midi: note.midi,
                    velocity: note.velocity,
                    hit: false
                });
            });
        });

        this.notes = this.assignLanes(allNotes).sort((a, b) => a.time - b.time);

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

            this.panner.pan.value = 0;

            const pitch = note.name || 'C4';
            const raw = note.velocity != null ? note.velocity : 0.7;
            const baseVel = raw > 1 ? raw / 127 : raw;
            const vel = Math.min(1, baseVel * this.songVolume);
            this.synth.triggerAttackRelease(pitch, Math.min(note.duration || 0.3, 0.45), undefined, vel);
            this.panner.pan.rampTo(0, 0.25);
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

    checkHit(currentTime, windowSeconds = 0.15) {
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
