# Custom Sound Packs

Place your custom sound files here in organized folders.

## Folder Structure

```
/public/sounds/
├── esports/           # Example: Esports-themed pack
│   ├── correct.mp3
│   ├── incorrect.mp3
│   ├── victory.mp3
│   ├── defeat.mp3
│   ├── your_turn.mp3
│   ├── go.mp3
│   ├── countdown_tick.mp3
│   ├── countdown_urgent.mp3
│   ├── relay_handoff.mp3
│   ├── teammate_correct.mp3
│   ├── timeout.mp3
│   ├── double_callin.mp3
│   ├── round_end.mp3
│   ├── halftime.mp3
│   ├── streak_3.mp3
│   ├── streak_5.mp3
│   └── streak_10.mp3
├── retro/             # Example: 8-bit style pack
│   └── ...
└── minimal/           # Example: Clean, minimal sounds
    └── ...
```

## Available Sound Types

| Sound Type | Description | When Played |
|------------|-------------|-------------|
| `correct.mp3` | Correct answer | When player answers correctly |
| `incorrect.mp3` | Wrong answer | When player answers incorrectly |
| `victory.mp3` | Match won | When team wins the match |
| `defeat.mp3` | Match lost | When team loses the match |
| `your_turn.mp3` | Turn alert | When it becomes player's turn |
| `go.mp3` | GO! signal | At round/countdown start |
| `countdown_tick.mp3` | Countdown tick | Each second of countdown (5-3) |
| `countdown_urgent.mp3` | Urgent tick | Final 2 seconds of countdown |
| `relay_handoff.mp3` | Relay handoff | When teammate finishes their slot |
| `teammate_correct.mp3` | Team correct | When teammate answers correctly |
| `timeout.mp3` | Timeout called | When IGL calls a timeout |
| `double_callin.mp3` | Double call-in | When anchor activates double call-in |
| `round_end.mp3` | Round complete | When a round ends |
| `halftime.mp3` | Halftime | At halftime break |
| `streak_3.mp3` | 3x streak | When player hits 3 correct in a row |
| `streak_5.mp3` | 5x streak | When player hits 5 correct in a row |
| `streak_10.mp3` | 10x streak | When player hits 10 correct in a row |

## Adding a New Pack

1. Create a folder with your pack ID (e.g., `/public/sounds/mypack/`)

2. Add your MP3 files named exactly as shown above

3. Register your pack in `src/lib/sound-engine.ts`:

```typescript
const SOUND_PACKS: Record<string, SoundPackConfig> = {
    'mypack': {
        id: 'mypack',
        name: 'My Custom Pack',
        customSounds: ['correct', 'incorrect', 'victory', 'go'], // Only list sounds you have files for
        volumeMultiplier: 1.0, // Optional: adjust overall volume (0.0 - 1.0)
    },
};
```

4. Add your pack as a shop item in `src/lib/items.ts`:

```typescript
{
    id: 'sound_mypack',
    name: 'My Custom Pack',
    description: 'Custom sounds for your arena experience',
    type: ItemType.SOUND,
    rarity: Rarity.RARE,
    price: 5000,
    assetValue: 'mypack', // Must match folder name and SOUND_PACKS key
},
```

## Audio Recommendations

- **Format**: MP3 (recommended) or WAV
- **Duration**: Keep sounds short (0.1s - 1.0s for most, up to 3s for victory/defeat)
- **Sample Rate**: 44.1kHz or 48kHz
- **Bit Depth**: 16-bit or higher
- **Loudness**: Normalize to around -6dB to -3dB peak

## Fallback Behavior

If a sound file is missing or fails to load, the system automatically falls back to procedural (synthesized) sounds. This means:

- You don't need to provide ALL sounds - only the ones you want to customize
- Any missing sounds will use the built-in procedural versions
- The system is resilient to network issues or file errors
