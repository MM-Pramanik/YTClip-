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

## Using YTClip

1. Paste a supported HTTP or HTTPS video URL.
2. Choose **Clips**, **Full video**, or **Audio only**.
3. Set the quality or audio format as needed. For clips, enter one or more start and end times.
4. Choose an output folder and optionally set a filename prefix.
5. Select **Download** to start the job and monitor it in the queue.

## Build a macOS installer

Create a macOS disk image with:

```bash
npm run dist
```

The generated installer is placed in `dist/`. Build artifacts and installed dependencies are excluded from Git by `.gitignore`; publish installers as GitHub Release assets rather than committing them to the source repository.

## License

No license has been specified yet. Unless a license is added, the default copyright rules apply and others may not have permission to use, modify, or redistribute this project.
