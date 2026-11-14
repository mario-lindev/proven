# Proven demo video

## What this is
`proven-demo.mp4` is the 2-minute demo: 1920x1080, 30 fps, H.264, with a silent stereo audio track. It shows stills of the real app (`shots/*.png`) with slow zooms, 0.4 s crossfades and burned-in captions. Scene timings and caption text come from `captions.json`. `captions.srt` holds the same captions as a subtitle file.

## Add your voice and face
1. Open `proven-demo.mp4` in iMovie or CapCut. Do not add captions: they are already in the picture.
2. Each caption shows the speaker's name above it. Find your scenes and your words in `SCRIPT.md`.
3. Record your lines as a voiceover while the video plays (iMovie: the microphone button; CapCut: Audio > Record). Keep each line inside its scene.
4. Record a short face clip and put it on top as picture-in-picture, in a top corner so it does not cover the captions.
5. Export at 1080p and upload.

## Re-render
Edit `captions.json` or replace a still in `shots/`, then run:

    python3 video/render.py

It needs ffmpeg at `/opt/homebrew/bin/ffmpeg`. Scene clips are written to `video/build/`, so a failing scene is named in the error. `title.png` and `end.png` are drawn again on every run.
