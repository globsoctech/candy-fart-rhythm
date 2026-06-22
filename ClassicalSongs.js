// Built-in classical melodies encoded as note sequences.
const QN = 0.5; // Quarter note duration in seconds (120 BPM)

const N = {
    C3: 48, D3: 50, Eb3: 51, E3: 52, F3: 53, G3: 55, A3: 57, Bb3: 58, B3: 59,
    C4: 60, Cs4: 61, D4: 62, Ds4: 63, Eb4: 63, E4: 64, F4: 65, Fs4: 66, G4: 67, Gs4: 68, A4: 69, As4: 70, Bb4: 70, B4: 71,
    C5: 72, Cs5: 73, D5: 74, Ds5: 75, E5: 76, F5: 77, Fs5: 78, G5: 79, Gs5: 80, A5: 81, B5: 83, C6: 84,
    REST: -1
};

const MELODIES = {
    "Fur Elise": [
        [N.E5,0.5],[N.Ds5,0.5],[N.E5,0.5],[N.Ds5,0.5],[N.E5,0.5],[N.B4,0.5],[N.D5,0.5],[N.C5,0.5],[N.A4,1],
        [N.C4,0.5],[N.E4,0.5],[N.A4,0.5],[N.B4,1],[N.E4,0.5],[N.Gs4,0.5],[N.B4,0.5],[N.C5,1],
        [N.E5,0.5],[N.Ds5,0.5],[N.E5,0.5],[N.Ds5,0.5],[N.E5,0.5],[N.B4,0.5],[N.D5,0.5],[N.C5,0.5],[N.A4,1]
    ],
    "Ode to Joy": [
        [N.E4,1],[N.E4,1],[N.F4,1],[N.G4,1],[N.G4,1],[N.F4,1],[N.E4,1],[N.D4,1],
        [N.C4,1],[N.C4,1],[N.D4,1],[N.E4,1],[N.E4,1.5],[N.D4,0.5],[N.D4,2],
        [N.E4,1],[N.E4,1],[N.F4,1],[N.G4,1],[N.G4,1],[N.F4,1],[N.E4,1],[N.D4,1],
        [N.C4,1],[N.C4,1],[N.D4,1],[N.E4,1],[N.D4,1.5],[N.C4,0.5],[N.C4,2]
    ],
    "Turkish March": [
        [N.B4,0.5],[N.A4,0.5],[N.Gs4,0.5],[N.A4,0.5],[N.C5,1],
        [N.D5,0.5],[N.C5,0.5],[N.B4,0.5],[N.C5,0.5],[N.E5,1],
        [N.F5,0.5],[N.E5,0.5],[N.Ds5,0.5],[N.E5,0.5],[N.B5,0.5],[N.A5,0.5],[N.Gs5,0.5],[N.A5,0.5],[N.B5,1]
    ],
    "Eine Kleine Nachtmusik": [
        [N.G4,0.5],[N.D4,0.5],[N.G4,0.5],[N.D4,0.5],[N.G4,0.25],[N.D5,0.25],[N.B4,0.5],[N.G4,1],
        [N.C5,0.5],[N.A4,0.5],[N.Fs4,0.5],[N.A4,0.5],[N.C5,0.25],[N.A4,0.25],[N.Fs4,0.5],[N.D4,1]
    ],
    "The Blue Danube": [
        [N.D4,1],[N.Fs4,0.5],[N.A4,1.5],[N.A4,1],[N.REST,0.5],
        [N.A4,1],[N.A4,1],[N.B4,0.5],[N.A4,0.5],[N.G4,1],[N.REST,1]
    ],
    "Hallelujah Chorus": [
        [N.A4,0.5],[N.A4,0.5],[N.A4,0.5],[N.A4,0.5],[N.A4,0.5],[N.D5,0.5],[N.Cs5,1],
        [N.D5,0.5],[N.A4,0.5],[N.A4,0.5],[N.G4,0.5],[N.Fs4,1]
    ],
    "Spring (Vivaldi)": [
        [N.E5,0.5],[N.Gs5,0.25],[N.Gs5,0.25],[N.Gs5,0.5],[N.Fs5,0.5],[N.E5,1],
        [N.B4,0.5],[N.B4,0.5],[N.Cs5,0.5],[N.Cs5,0.5],[N.B4,1]
    ],
    "Canon in D": [
        [N.Fs5,1],[N.E5,1],[N.D5,1],[N.Cs5,1],[N.B4,1],[N.A4,1],[N.B4,1],[N.Cs5,1],
        [N.D5,1],[N.Cs5,1],[N.B4,1],[N.A4,1],[N.G4,1],[N.Fs4,1],[N.G4,1],[N.E4,1]
    ],
    "Toccata (Bach)": [
        [N.A5,0.5],[N.G5,0.5],[N.A5,2],[N.REST,0.5],
        [N.G5,0.25],[N.F5,0.25],[N.E5,0.25],[N.D5,0.25],[N.Cs5,0.5],[N.D5,2]
    ],
    "Clair de Lune": [
        [N.Bb3,1],[N.D4,1],[N.F4,1],[N.Bb4,1],[N.A4,2],[N.G4,1],[N.F4,1],[N.Eb4,2]
    ],
    "Ride of the Valkyries": [
        [N.B3,0.75],[N.E4,0.25],[N.G4,0.5],[N.B3,0.5],[N.E4,1.5],
        [N.B3,0.75],[N.E4,0.25],[N.G4,0.5],[N.B3,0.5],[N.E4,1.5]
    ],
    "Bolero": [
        [N.C5,1],[N.C5,0.5],[N.B4,0.25],[N.C5,0.25],[N.D5,0.5],[N.C5,0.5],[N.Bb4,0.5],[N.A4,0.5],
        [N.C5,1],[N.A4,1.5],[N.G4,0.5],[N.G4,2]
    ],
    "William Tell Overture": [
        [N.E4,0.25],[N.E4,0.25],[N.E4,0.5],[N.E4,0.25],[N.E4,0.25],[N.E4,0.5],
        [N.E4,0.25],[N.G4,0.25],[N.C4,0.25],[N.D4,0.25],[N.E4,1]
    ],
    "Morning Mood": [
        [N.G4,0.5],[N.E4,0.5],[N.D4,0.5],[N.C4,0.5],[N.D4,0.5],[N.E4,0.5],[N.G4,1],
        [N.E4,0.5],[N.G4,0.5],[N.A4,0.5],[N.E4,0.5],[N.A4,0.5],[N.G4,0.5],[N.E4,1]
    ],
    "Mountain King": [
        [N.C4,0.5],[N.D4,0.5],[N.Ds4,0.5],[N.F4,0.5],[N.G4,0.5],[N.Ds4,0.5],[N.G4,1],
        [N.Fs4,0.5],[N.D4,0.5],[N.Fs4,1],[N.F4,0.5],[N.D4,0.5],[N.F4,1]
    ],
    "Hungarian Dance No. 5": [
        [N.A4,1],[N.A4,0.5],[N.B4,0.5],[N.C5,0.5],[N.A4,0.5],[N.B4,0.5],[N.Gs4,0.5],[N.A4,2]
    ],
    "Danse Macabre": [
        [N.A4,1],[N.REST,0.5],[N.E5,0.5],[N.REST,0.5],[N.A4,0.5],[N.E5,1],
        [N.D5,0.5],[N.A4,0.5],[N.E5,0.5],[N.A4,1]
    ],
    "Waltz of the Flowers": [
        [N.E4,1],[N.A4,0.5],[N.B4,0.5],[N.C5,1],[N.B4,0.5],[N.A4,0.5],[N.B4,1],
        [N.A4,0.5],[N.G4,0.5],[N.A4,1]
    ],
    "Swan Lake": [
        [N.B4,1.5],[N.E5,0.5],[N.D5,0.5],[N.C5,0.5],[N.B4,0.5],[N.A4,0.5],[N.B4,1.5],
        [N.Fs4,0.5],[N.A4,0.5],[N.G4,0.5],[N.Fs4,0.5],[N.E4,1]
    ],
    "Symphony No. 5": [
        [N.G4,0.25],[N.G4,0.25],[N.G4,0.25],[N.Eb4,2],[N.REST,0.5],
        [N.F4,0.25],[N.F4,0.25],[N.F4,0.25],[N.D4,2]
    ]
};

export const CLASSICAL_SONGS = Object.keys(MELODIES).map(title => ({
    title,
    composer: getComposer(title)
}));

function getComposer(title) {
    const map = {
        "Fur Elise": "Beethoven", "Ode to Joy": "Beethoven", "Symphony No. 5": "Beethoven",
        "Turkish March": "Mozart", "Eine Kleine Nachtmusik": "Mozart",
        "The Blue Danube": "Strauss", "Hallelujah Chorus": "Handel",
        "Spring (Vivaldi)": "Vivaldi", "Canon in D": "Pachelbel", "Toccata (Bach)": "Bach",
        "Clair de Lune": "Debussy", "Ride of the Valkyries": "Wagner", "Bolero": "Ravel",
        "William Tell Overture": "Rossini", "Morning Mood": "Grieg", "Mountain King": "Grieg",
        "Hungarian Dance No. 5": "Brahms", "Danse Macabre": "Saint-Saëns",
        "Waltz of the Flowers": "Tchaikovsky", "Swan Lake": "Tchaikovsky"
    };
    return map[title] || "Classical";
}

export function generateSongNotes(title) {
    const melody = MELODIES[title];
    if (!melody) return { notes: [], duration: 0 };

    const notes = [];
    let time = 0;
    const targetDuration = 45;

    while (time < targetDuration) {
        for (const [pitch, beats] of melody) {
            const dur = beats * QN;
            if (pitch !== -1) {
                notes.push({
                    time,
                    duration: dur,
                    midi: pitch,
                    name: midiToName(pitch),
                    velocity: 0.8,
                    hit: false
                });
            }
            time += dur;
            if (time >= targetDuration) break;
        }
    }

    return { notes, duration: time + 1, title };
}

function midiToName(midi) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    return names[midi % 12] + octave;
}
