# Flash It Speed Reading - Feature Guide

## Overview

Flash It is a speed reading mode that highlights words one at a time at a user-controlled pace, helping readers increase their reading speed and focus.

## Features

### Adaptive Speed Reading
- **Variable pacing**: Longer words automatically get more display time
  - Short words (≤3 chars): 20% faster
  - Medium words (4-8 chars): Normal speed
  - Long words (9-12 chars): 30% slower
  - Very long words (>12 chars): 50% slower

### Punctuation Pauses
- Sentence endings (. ! ?): +300ms pause
- Commas/semicolons (, ; :): +150ms pause
- Natural reading rhythm

### Dual Display Modes

**Overlay Mode (Default)**
- RSVP-style centered display
- Large text (2x current font size)
- Shows previous and next words for context
- Current word highlighted in different color
- Progress counter (word X of Y)
- Minimal distractions

**Inline Mode**
- Highlights words directly in article
- Smart auto-scroll (only when word goes off-screen)
- Preserves article layout and images
- Less disruptive to reading flow

## Controls

### Toolbar Buttons
1. **Flash It button** (⚡): Toggle speed reading mode on/off
2. **Speed selector**: Choose reading speed (30-200 WPM)
   - 30 WPM: Very slow, beginner-friendly
   - 60 WPM: Slow reading
   - 100 WPM: Comfortable pace
   - 150 WPM: Default, moderate speed
   - 200 WPM: Fast reading
3. **Display mode toggle**: Switch between overlay and inline modes
4. **Pause/Play**: Control playback
5. **Restart**: Start from beginning

### Keyboard Shortcuts
- **F**: Toggle Flash It mode on/off
- **Space**: Pause/resume (when active)
- **R**: Restart from beginning (when active)
- **Esc**: Exit Flash It mode

### Overlay Controls
When in overlay mode, you can also:
- Click **×** to close
- Use the **pause/play/restart** buttons at the bottom
- Click outside the overlay to exit

## Usage

1. **Start Flash It**
   - Click the Flash It button (⚡) in the toolbar
   - Or press **F** key
   - Words will be extracted and playback begins

2. **Adjust Speed**
   - Use the speed dropdown to select WPM
   - Changes apply immediately during playback

3. **Change Display Mode**
   - Click the mode toggle button
   - Switches between overlay and inline without stopping

4. **Control Playback**
   - **Pause**: Press Space or click pause button
   - **Resume**: Press Space again or click play button
   - **Restart**: Press R or click restart button
   - **Stop**: Press Esc, click Flash It button, or close overlay

## How It Works

### Word Extraction
1. Scans all text in article body
2. Wraps each word in a `<span>` element
3. Preserves original formatting and whitespace
4. Skips non-content elements (scripts, styles, SVGs)

### Timing Algorithm
```javascript
baseDelay = (60 / WPM) * 1000 // Convert WPM to ms
delay = baseDelay * lengthMultiplier + punctuationPause
```

Example at 150 WPM:
- Base delay: 400ms
- Short word "is": 320ms (400 × 0.8)
- Medium word "reading": 400ms (400 × 1.0)
- Long word "comprehension": 520ms (400 × 1.3)
- End of sentence: +300ms

### Session Persistence
- Current position saved automatically
- Resumes from last word after pause
- Position cleared when stopping
- Speed and mode settings remembered

## Tips for Best Results

1. **Start Slow**: Begin with 100-150 WPM, gradually increase
2. **Use Overlay Mode**: Less eye movement = faster reading
3. **Take Breaks**: Pause periodically to avoid fatigue
4. **Adjust Speed**: Find your comfortable pace (not too fast/slow)
5. **Mind Punctuation**: Natural pauses help comprehension
6. **Practice**: Speed reading improves with regular use

## Theme Support

Flash It highlights adapt to your chosen theme:
- **Light theme**: Yellow highlight (rgba(255, 235, 59, 0.6))
- **Sepia theme**: Brown highlight (rgba(184, 134, 11, 0.5))
- **Dark theme**: Gold highlight (rgba(255, 193, 7, 0.4))

All colors designed for readability and reduced eye strain.

## Limitations

- Won't work on very short articles (< a few paragraphs)
- Image captions are included in word flow
- Cannot skip sections (must read sequentially)
- No bookmarking of favorite positions

## Technical Details

**Files involved:**
- `reader.html`: Flash It controls and RSVP overlay
- `reader.js`: Word extraction, timing engine, playback controls
- `reader.css`: Highlighting styles and overlay layout

**Storage:**
- Session storage: Current position and state
- Sync storage: Not used (preferences managed per session)

**Performance:**
- Words extracted once per article
- DOM manipulations minimized
- Smooth animations via CSS transitions
- Efficient `setTimeout` scheduling

---

Enjoy faster, focused reading with Flash It! ⚡📖
