#!/usr/bin/env python3
"""Render proven-demo.mp4 from captions.json + shots/*.png. Run: python3 video/render.py"""
import json, os, subprocess, textwrap, sys
from concurrent.futures import ThreadPoolExecutor
V = os.path.dirname(os.path.abspath(__file__))
FF = "/opt/homebrew/bin/ffmpeg"
SERIF = "/System/Library/Fonts/Supplemental/Georgia.ttf"
SANS = "/System/Library/Fonts/Supplemental/Arial.ttf"
BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
BG, INK, RUST = "0xf6f7f3", "0x263c59", "0xc4622d"
FPS, XF = 30, 0.4
EXTRA = {"memo": ["facts"], "telem": ["telem-map"], "engines": ["ml", "improve"], "how": ["stack"]}
B = os.path.join(V, "build"); os.makedirs(B, exist_ok=True)
S = os.path.join(V, "shots")

def run(cmd):
    # Homebrew ffmpeg 8.0.1 links libx265.215, which only the x265 4.1 keg still has
    env = dict(os.environ, DYLD_FALLBACK_LIBRARY_PATH="/opt/homebrew/Cellar/x265/4.1/lib")
    r = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if r.returncode: sys.exit("FAILED: " + " ".join(cmd) + "\n" + r.stderr[-1500:])

def tf(name, text):
    p = os.path.join(B, name)
    open(p, "w").write(text)
    return p

def card(out, lines):
    # lines: (text, font, size, color, y)
    vf = []
    for i, (t, f, sz, c, y) in enumerate(lines):
        p = tf(f"{os.path.basename(out)}.{i}.txt", t)
        vf.append(f"drawtext=fontfile='{f}':textfile='{p}':fontsize={sz}:fontcolor={c}:x=(w-text_w)/2:y={y}")
    run([FF, "-y", "-f", "lavfi", "-i", f"color=c={BG}:s=1920x1080", "-frames:v", "1", "-vf", ",".join(vf), out])

def scene(i, s, last):
    dur = s["end"] - s["start"] + (0 if last else XF)
    stills = [s["shot"]] + [e for e in EXTRA.get(s["shot"], []) if os.path.exists(os.path.join(S, e + ".png"))]
    n = len(stills); seg = dur / n
    ins, fc, labels = [], [], []
    for k, st in enumerate(stills):
        N = round(seg * FPS)
        ins += ["-i", os.path.join(S, st + ".png")]
        z = f"1+0.06*on/{N}" if (i + k) % 2 == 0 else f"1.06-0.06*on/{N}"
        # hide the Next.js dev badge, bottom-left
        m = f"drawbox=x=0:y=990:w=140:h=90:color={BG}:t=fill," if st not in ("title", "end") else ""
        fc.append(f"[{k}:v]{m}scale=3840:2160,zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={N}:s=1920x1080:fps={FPS},setsar=1[v{k}]")
        labels.append(f"[v{k}]")
    lines = textwrap.wrap(s["caption"], 62)[:2]
    if len(textwrap.wrap(s["caption"], 62)) > 2: lines = textwrap.wrap(s["caption"], 70)[:2]
    cap = f"drawbox=x=150:y=846:w=1620:h={110 + 58 * len(lines)}:color={INK}@0.85:t=fill"
    sp = tf(f"s{i}.who.txt", s["voice"].upper())
    cap += f",drawtext=fontfile='{BOLD}':textfile='{sp}':fontsize=26:fontcolor={RUST}:x=(w-text_w)/2:y=866"
    for j, ln in enumerate(lines):
        p = tf(f"s{i}.l{j}.txt", ln)
        cap += f",drawtext=fontfile='{SANS}':textfile='{p}':fontsize=44:fontcolor=white:x=(w-text_w)/2:y={910 + 58 * j}"
    fc.append("".join(labels) + f"concat=n={n}:v=1:a=0,{cap},format=yuv420p[o]")
    out = os.path.join(B, f"scene{i:02d}.mp4")
    run([FF, "-y", *ins, "-filter_complex", ";".join(fc), "-map", "[o]", "-t", f"{dur}", "-r", str(FPS),
         "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", out])
    return out, dur

def main():
    caps = json.load(open(os.path.join(V, "captions.json")))
    card(os.path.join(S, "title.png"), [
        ("Proven", SERIF, 220, INK, 250),
        ("A search engine gives you links. Proven gives you a verdict.", SERIF, 54, INK, 540)])
    card(os.path.join(S, "end.png"), [
        ("Know what is true before you commit.", SERIF, 92, INK, 280),
        ("proven-tan.vercel.app", SERIF, 60, RUST, 450),
        ("Rishith · Aarav · Mario — SearchHack 2026, built on Telem and Tavily", SANS, 36, INK, 600)])
    fallback = []
    for s in caps:
        if not os.path.exists(os.path.join(S, s["shot"] + ".png")):
            card(os.path.join(S, s["shot"] + ".png"), [(s["shot"].title(), SERIF, 160, INK, 380)])
            fallback.append(s["scene"])
    with ThreadPoolExecutor(8) as ex:
        clips = list(ex.map(lambda a: scene(a[0], a[1], a[0] == len(caps) - 1), enumerate(caps)))
    ins, fc, off, prev = [], [], 0.0, "[0:v]"
    for k, (c, d) in enumerate(clips):
        ins += ["-i", c]
        if k:
            off += clips[k - 1][1] - XF
            fc.append(f"{prev}[{k}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}[x{k}]")
            prev = f"[x{k}]"
    total = caps[-1]["end"] - caps[0]["start"]
    out = os.path.join(V, "proven-demo.mp4")
    run([FF, "-y", *ins, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-filter_complex", ";".join(fc),
         "-map", prev, "-map", f"{len(clips)}:a", "-t", str(total), "-r", str(FPS), "-c:v", "libx264", "-crf", "18",
         "-pix_fmt", "yuv420p", "-preset", "veryfast", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out])
    def ts(t): return f"{int(t//3600):02d}:{int(t%3600//60):02d}:{int(t%60):02d},{int(round(t%1*1000)):03d}"
    open(os.path.join(V, "captions.srt"), "w").write("".join(
        f"{s['scene']}\n{ts(s['start'])} --> {ts(s['end'])}\n{s['voice']}: {s['caption']}\n\n" for s in caps))
    print(out, "fallback scenes:", fallback)
main()
