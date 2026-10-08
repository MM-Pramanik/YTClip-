# YTClip

YTClip is a lightweight macOS desktop application for downloading videos, extracting audio, and creating clips from URLs supported by [yt-dlp](https://github.com/yt-dlp/yt-dlp). It provides a graphical interface for configuring downloads, monitoring progress, and choosing where files are saved.

## Features

- Download full videos or audio-only files.
- Create multiple clips from one video using start and end timestamps.
- Select video quality, including best available.
- Choose an output folder and optionally remember it.
- Monitor download progress and logs, cancel jobs, and retry failed jobs.
- Use the source video title or a custom filename prefix.

Supported sites depend on the installed version of yt-dlp. Refer to the [yt-dlp supported sites list](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md).

## Requirements

- macOS
- [Node.js and npm](https://nodejs.org/) for development
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [FFmpeg](https://ffmpeg.org/) installed on your system

Install yt-dlp and FFmpeg with Homebrew:

```bash
brew install yt-dlp ffmpeg
```

YTClip checks common Homebrew and system locations for these tools, including `/opt/homebrew/bin` and `/usr/local/bin`.

## Getting started

Clone the repository, then install dependencies and launch the app:

```bash
git clone <repository-url>
cd YTClip-mac
npm install
npm start
```

Replace `<repository-url>` with the URL of your GitHub repository.

## How the app works

YTClip is an [Electron](https://www.electronjs.org/) application. Its interface runs in a browser window, while the Electron main process handles operating-system features and starts download tools.

### Project structure

| File | Purpose |
| --- | --- |
| [`index.html`](./index.html) | Defines the interface and the IDs used by the renderer. |
| [`style.css`](./style.css) | Styles the interface. |
| [`renderer.js`](./renderer.js) | Handles user interactions, builds download jobs, updates the queue and log, and remembers the output folder in browser storage. |
| [`preload.js`](./preload.js) | Exposes a small, controlled `window.ytclip` API to the interface using Electron's context bridge. |
| [`main.js`](./main.js) | Creates the application window, handles requests from the interface, locates `yt-dlp`, and starts, monitors, or cancels download processes. |
| [`package.json`](./package.json) | Defines the app entry point, npm commands, dependencies, and macOS packaging settings. |

### Download flow

1. The renderer collects the URL, format, quality, clip timestamps, and output folder.
2. It sends a job request through the API exposed by `preload.js`; the renderer does not directly access Node.js or operating-system APIs.
3. The main process validates the URL and required tools, then starts `yt-dlp` with the requested options. For audio conversion and video merging, `yt-dlp` uses the installed FFmpeg tools.
4. The main process sends progress, log, and completion events back through the preload API. The renderer uses these events to update the queue and log.

### Where to customize

- To change labels, controls, or page structure, edit `index.html`; keep element IDs in sync with `renderer.js`.
- To change layout, colors, or typography, edit `style.css`.
- To change form behavior, queue display, or remembered-folder behavior, edit `renderer.js`.
- To change download arguments, tool detection, or operating-system integration, edit `main.js`.
- If you add or change a renderer-to-main operation, expose it in `preload.js` and handle it in `main.js`. Keep this bridge narrow rather than enabling Node.js integration in the page.

## Using YTClip

1. Paste a supported HTTP or HTTPS video URL.
2. Choose **Clips**, **Full video**, or **Audio only**.
3. Set the quality or audio format as needed. For clips, enter one or more start and end times.
4. Choose an output folder and optionally set a filename prefix.
5. Select **Download** to start the job and monitor it in the queue.

## Build a macOS installer

Create a local DMG build with:

```bash
npm run dist
```

The generated installer is placed in `dist/`. Build artifacts and installed dependencies are excluded from Git by `.gitignore`; publish installers as GitHub Release assets rather than committing them to the source repository.

## License

No license has been specified yet. Unless a license is added, the default copyright rules apply and others may not have permission to use, modify, or redistribute this project.
