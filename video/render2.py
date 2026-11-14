#!/usr/bin/env python3
"""Render proven-demo-v2.mp4: real screen recordings (clips/) + stills, small captions. Run: python3 video/render2.py"""
import json, os, subprocess, textwrap, sys
from concurrent.futures import ThreadPoolExecutor
V = os.path.dirname(os.path.abspath(__file__))
FF = "/opt/homebrew/bin/ffmpeg"
SANS = "/System/Library/Fonts/Supplemental/Arial.ttf"
BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
BG, INK, RUST = "0xf6f7f3", "0x263c59", "0xc4622d"
FPS, XF = 30, 0.3
B = os.path.join(V, "build2"); os.makedirs(B, exist_ok=True)
S = os.path.join(V, "shots"); C = os.path.join(V, "clips")
# scene number -> (clip, [(start, end), ...] in source seconds, speed). Others are stills.
CLIPS = {
    3: ("01-home.mp4", [(0.0, 9.6)], 1.0),
    5: ("04-audit.mp4", [(20.8, 33.2)], 1.0),
    6: ("03-memo.mp4", [(2.0, 9.0), (20.0, 25.6)], 1.0),
    7: ("03-memo.mp4", [(8.5, 20.0)], 1.0),
    8: ("08-how.mp4", [(0.0, 17.1)], 1.2),
    9: ("05-telem.mp4", [(4.5, 19.0)], 1.4),
    10: ("06-learn.mp4", [(1.0, 17.6)], 1.6),
}

def run(cmd):
    env = dict(os.environ, DYLD_FALLBACK_LIBRARY_PATH="/opt/homebrew/Cellar/x265/4.1/lib")
    r = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if r.returncode: sys.exit("FAILED: " + " ".join(cmd) + "\n" + r.stderr[-1500:])

def tf(name, text):
    p = os.path.join(B, name); open(p, "w").write(text); return p

def caption(i, s):
    lines = textwrap.wrap(s["caption"], 80)
    if len(lines) > 2: lines = textwrap.wrap(s["caption"], 95)[:2]
    h = 50 + 44 * len(lines); y = 1080 - 14 - h
    cap = f"drawbox=x=230:y={y}:w=1460:h={h}:color={INK}@0.88:t=fill"
    sp = tf(f"s{i}.who.txt", s["voice"].upper())
    cap += f",drawtext=fontfile='{BOLD}':textfile='{sp}':fontsize=20:fontcolor={RUST}:x=(w-text_w)/2:y={y + 10}"
    for j, ln in enumerate(lines):
        p = tf(f"s{i}.l{j}.txt", ln)
        cap += f",drawtext=fontfile='{SANS}':textfile='{p}':fontsize=34:expansion=none:fontcolor=white:x=(w-text_w)/2:y={y + 38 + 44 * j}"
    return cap

def scene(i, s, last):
    dur = s["end"] - s["start"] + (0 if last else XF)
    cap = caption(i, s)
    out = os.path.join(B, f"scene{i:02d}.mp4")
    badge = f"drawbox=x=0:y=990:w=140:h=90:color={BG}:t=fill"
    if s["scene"] in CLIPS:
        clip, parts, speed = CLIPS[s["scene"]]
        fc, labels = [], []
        for k, (a, b) in enumerate(parts):
            fc.append(f"[0:v]trim=start={a}:end={b},setpts=(PTS-STARTPTS)/{speed}[p{k}]"); labels.append(f"[p{k}]")
        fc.append("".join(labels) + f"concat=n={len(parts)}:v=1:a=0,fps={FPS},scale=1920:1080,setsar=1,"
                  f"tpad=stop_mode=clone:stop_duration=3,{badge},{cap},format=yuv420p[o]")
        ins = ["-i", os.path.join(C, clip)]
    else:
        N = round(dur * FPS)
        z = f"1+0.06*on/{N}" if i % 2 == 0 else f"1.06-0.06*on/{N}"
        m = badge + "," if s["shot"] not in ("title", "end") else ""
        fc = [f"[0:v]{m}scale=3840:2160,zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={N}:s=1920x1080:fps={FPS},setsar=1,{cap},format=yuv420p[o]"]
        ins = ["-i", os.path.join(S, s["shot"] + ".png")]
    run([FF, "-y", *ins, "-filter_complex", ";".join(fc), "-map", "[o]", "-t", f"{dur}", "-r", str(FPS),
         "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", out])
    return out, dur

def main():
    caps = json.load(open(os.path.join(V, "captions.json")))
    with ThreadPoolExecutor(11) as ex:
        clips = list(ex.map(lambda a: scene(a[0], a[1], a[0] == len(caps) - 1), enumerate(caps)))
    ins, fc, off, prev = [], [], 0.0, "[0:v]"
    for k, (c, d) in enumerate(clips):
        ins += ["-i", c]
        if k:
            off += clips[k - 1][1] - XF
            fc.append(f"{prev}[{k}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}[x{k}]")
            prev = f"[x{k}]"
    total = caps[-1]["end"] - caps[0]["start"]
    out = os.path.join(V, "proven-demo-v2.mp4")
    run([FF, "-y", *ins, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-filter_complex", ";".join(fc),
         "-map", prev, "-map", f"{len(clips)}:a", "-t", str(total), "-r", str(FPS), "-c:v", "libx264", "-crf", "18",
         "-pix_fmt", "yuv420p", "-preset", "veryfast", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out])
    print(out)
main()
