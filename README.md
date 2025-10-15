# KickScroll - Kick.com Stream Control Extension

A powerful Chrome extension for enhanced control over Kick.com streams with audio processing, bitrate monitoring, and playback controls.

## Features

### 🎮 Playback Controls
- **Left Click**: Toggle play/pause
- **Right Click + Scroll**: Adjust volume with smooth control
- **Middle Click**: Toggle mute

### 🔊 Audio Enhancements
- **Volume Boost**: Increase audio output up to 20dB with safety limits
- **Volume Normalization**: Automatic loudness normalization (LUFS-based)
  - Target loudness adjustment (-48dB to -10dB range)
  - Real-time gain compensation
- **Audio Compressor**: Dynamic range compression with adjustable:
  - Threshold (-50dB to 0dB)
  - Ratio (1:1 to 20:1)
  - Attack and release settings

### 📊 Bitrate Monitoring
- Real-time bitrate display with quality indicators
- Multiple display modes: Current, Average, Min/Max, Combined
- Customizable units: Mbps, kbps, MBps, kBps
- Adjustable refresh rates (250ms - 5000ms)
- Overlay customization (opacity, text color)

### ⚡ Playback Speed
- Speed adjustment with 0.25x - 2x range
- Quick preset buttons for common speeds (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x)

### 🎛️ Control Panel
- Collapsible UI panel with auto-collapse functionality
- Real-time value displays and feedback
- Smooth overlay animations

## Installation

### Load Locally (Development)
1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the extension directory

### Build & Package
```bash
mkdir -p dist
zip -r dist/kickscroll.zip manifest.json content.js style.css icons/
```

## Usage

### Basic Controls
- **Left Click**: Play/Pause
- **Right Click + Mouse Wheel**: Volume adjustment
- **Middle Click**: Mute/Unmute

### Control Panel
1. Click the panel header to expand/collapse
2. Adjust settings using provided buttons and controls
3. Panel auto-collapses after 1.5 seconds of inactivity

### Audio Features
- Toggle Volume Boost, Normalization, or Compressor individually
- Combine features safely - the extension applies effect scaling to prevent dangerous audio levels
- Compressor provides 2.5x maximum combined gain ceiling for safety

### Bitrate Monitoring
- Enable/disable monitoring independently from overlay
- Switch display modes with the "Mode" button
- Cycle through units with the "Unit" button
- Adjust refresh rate and overlay opacity in real-time
- Color customize the overlay display

## Configuration

Key tuning parameters in `content.js`:

```javascript
const AUTO_COLLAPSE_DELAY = 1500;           // Panel auto-collapse time (ms)
const DISABLE_EFFECT_SCALING = false;       // Set true to prevent effect weakening
const DEBUG_LOGGING = true;                 // Enable/disable debug logs
```

### Audio Settings
- `volumeBoostAmount`: 0-20 dB (default 6)
- `normalizationTargetLufs`: -48 to -10 LUFS (default -20)
- `compressorThreshold`: -50 to 0 dB (default -24)
- `compressorRatio`: 1 to 20 (default 12)

### Bitrate Display
- `bitrateRefreshRate`: 250-5000 ms (default 1000)
- `bitrateOpacity`: 0-1 (default 0.85)
- `bitrateTextColor`: Hex color (default #00bcd4)

## Storage

Settings are automatically synced via Chrome's `storage.sync` API under the key `kickScrollSettings`. This allows settings to persist across tab reloads and sync across Chrome profiles.

Data stored:
- Volume boost settings
- Normalization target loudness
- Compressor parameters
- Playback speed
- Bitrate monitor configuration
- Last known volume level

## Development

### Code Structure
- `content.js`: Main runtime logic, event handlers, and audio processing
- `manifest.json`: Extension configuration and permissions
- `style.css`: UI styling with scoped `.ks-` prefixes
- `icons/`: Extension icon assets

### Testing
1. Load extension in Chrome DevTools
2. Open target Kick.com stream
3. Validate:
   - Panel toggling and visibility
   - Audio boost and effects
   - Bitrate overlay updates
   - Right-click volume control
4. Check DevTools Console for any `[KickScroll]` errors

### Debugging
Enable verbose logging by setting `DEBUG_LOGGING = true` in `content.js`. Logs appear in the target tab's DevTools Console with the `[KickScroll]` prefix.

## Safety Features

- **Gain Staging Limits**: Maximum 3.5x combined audio gain regardless of settings
- **Effect Scaling**: Reduces individual effect strength when multiple are active
- **Safety Monitor**: Prevents dangerous audio levels during rapid adjustments
- **Graceful Fallback**: Disables audio features if setup fails, maintains core functionality

## Permissions

- `storage`: Save and load user preferences

The extension only runs on `*://kick.com/*` - no cross-site data collection.

## Troubleshooting

### Audio not working
- Check that audio processing setup succeeded (no errors in console)
- Ensure page audio is unmuted
- Try refreshing the page and reloading the extension

### Overlay not visible
- Toggle overlay with "Overlay" button in control panel
- Check if bitrate monitoring is enabled
- Verify panel is visible (not hidden behind video)

### Settings not persisting
- Ensure Chrome Storage API is accessible
- Check DevTools Console for storage errors
- Try clearing extension storage: `chrome.storage.sync.clear()`

## License

All rights reserved. © 2024 KickScroll

## Contributing

Follow Conventional Commits style:
- `feat:` for new features
- `fix:` for bug fixes
- `refactor:` for code improvements
- `docs:` for documentation updates

Include reproduction steps and screenshots for UI changes in pull requests.
