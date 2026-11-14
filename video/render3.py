# Final cut: each scene is as long as its spoken line. Screen recording + face in the corner + captions.
import os, subprocess, textwrap
os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = "/opt/homebrew/Cellar/x265/4.1/lib"
FF = "/opt/homebrew/bin/ffmpeg"
B = "build3"; os.makedirs(B, exist_ok=True)
ARIAL = "/System/Library/Fonts/Supplemental/Arial.ttf"
V = "voice/take%d.mov"
# (name, visual kind, src, src start, src length used, take, take start, take end, speaker, caption, face mode, top label)
S = [
 ("01", "face", None, 0, 0, 1, 0.7, 9.8, "MARIO · RISHITH · AARAV", "I'm Mario, I'm 13. I'm Rishith, I'm 14. I'm Aarav, I'm 16. Investors check pitch claims by hand, days late. We built Proven.", "full", ""),
 ("02a", "still", "shots/google-ai-mode-real.jpg", 0, 0, 3, 0.0, 3.3, "AARAV", "Ask AI search one question and you get one good answer.", "pip", "Real Google AI Mode answer, captured today"),
 ("02b", "still", "shots/compare.png", 0, 0, 3, 3.3, 6.6, "AARAV", "Diligence is a hundred questions. Proven runs the whole job.", "pip", ""),
 ("03", "clip", "clips/01-home.mp4", 0.5, 9.0, 4, 0.0, 6.25, "MARIO", "This is Proven. Ask about any company. It searches, reads the pages, and writes a memo while you watch.", "pip", ""),
 ("04", "still", "shots/run.png", 0, 0, 2, 0.0, 6.2, "RISHITH", "Run everything does it in one click: a pitch audit, a full memo, and a watch that re-checks the company.", "pip", ""),
 ("05", "clip", "clips/04-audit.mp4", 21.0, 12.2, 3, 7.1, 15.1, "AARAV", "Pitch Audit on rippling.com: 8 claims in 20 seconds. 5 hold up, 2 are contradicted, 1 is unclear. Trust score 69.", "pip", ""),
 ("06", "clip", "clips/03-memo.mp4", 2.0, 7.9, 4, 6.85, 14.75, "MARIO", "The Builder.ai memo. Verdict: Pass, 95% confidence. 19 of 19 lines verified. 3 high-severity contradictions.", "pip", ""),
 ("07", "clip", "clips/03-memo.mp4", 8.5, 11.5, 2, 7.0, 16.5, "RISHITH", "It gave lenders a 2024 sales forecast of about $220M. An audit put sales at about $50M. Hover a line for the quote.", "pip", ""),
 ("07b", "clip", "clips/07-live.mp4", 14.0, 16.6, 0, 0, 5.5, "LIVE ROOM", "Say a claim on a call. Proven checks it while you are still talking.", "none", ""),
 ("08", "clip", "clips/08-how.mp4", 0.0, 17.0, 3, 15.6, 23.5, "AARAV", "Plan. Route through Telem and Tavily. Research until proven. Write. Find each quote in code. No quote, no line.", "pip", ""),
 ("09", "clip", "clips/05-telem.mp4", 4.5, 15.5, 4, 15.3, 23.75, "MARIO", "Today Telem routed over 250 questions across 16 engines. About two thirds of our verified proof came from engines Telem chose.", "pip", ""),
 ("10", "clip", "clips/06-learn.mp4", 1.0, 16.6, 4, 23.75, 31.5, "MARIO", "An engine earns credit only when its page backs a verified line. Proven learns only from what it could prove.", "pip", ""),
 ("11", "still", "shots/end.png", 0, 0, 2, 17.1, 25.5, "RISHITH", "For investors and buyers. Know what is true before you commit. Built by Rishith, Aarav and Mario. proven-tan.vercel.app", "pip", ""),
]
def esc(p): return p.replace(":", "\\:")
outs = []
for (name, kind, src, ss, slen, take, t0, t1, who, cap, face, label) in S:
    dur = round(t1 - t0, 3)
    lines = textwrap.wrap(cap, 72)[:2]
    if len(lines) == 1: lines.append("")
    for i, l in enumerate(lines): open(f"{B}/{name}.l{i}.txt", "w").write(l)
    open(f"{B}/{name}.who.txt", "w").write(who)
    open(f"{B}/{name}.lab.txt", "w").write(label)
    ins = []; fc = []
    if kind == "clip":
        ins += ["-ss", str(ss), "-t", str(slen), "-i", src]
        fc.append(f"[0:v]setpts=PTS*{dur/slen:.5f},fps=30,scale=1920:1080,drawbox=0:1000:130:80:color=0xf6f7f3:t=fill[bg]")
    elif kind == "still":
        ins += ["-loop", "1", "-t", str(dur), "-i", src]
        fc.append("[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x10151c,fps=30,setsar=1[bg]")
    else:  # face full frame
        ins += ["-ss", str(t0), "-t", str(dur), "-i", V % take]
        fc.append("[0:v]fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xf6f7f3,setsar=1[bg]")
    last = "bg"
    if take and kind != "face":
        ins += ["-ss", str(t0), "-t", str(dur), "-i", V % take]
        if face == "pip":
            fc.append("[1:v]fps=30,scale=420:280,drawbox=0:0:420:280:color=0xf6f7f3:t=6[f]")
            fc.append("[bg][f]overlay=1460:36[v1]"); last = "v1"
        aud = "[1:a]"
    elif kind == "face":
        aud = "[0:a]"
    else:
        ins += ["-f", "lavfi", "-t", str(dur), "-i", "anullsrc=r=48000:cl=stereo"]
        aud = "[1:a]"
    dt = (f"[{last}]drawbox=230:928:1460:138:color=0x263c59@0.88:t=fill,"
          f"drawtext=fontfile={ARIAL}:textfile={B}/{name}.who.txt:expansion=none:fontsize=20:fontcolor=0xe08a5a:x=(w-text_w)/2:y=940,"
          f"drawtext=fontfile={ARIAL}:textfile={B}/{name}.l0.txt:expansion=none:fontsize=34:fontcolor=white:x=(w-text_w)/2:y=970,"
          f"drawtext=fontfile={ARIAL}:textfile={B}/{name}.l1.txt:expansion=none:fontsize=34:fontcolor=white:x=(w-text_w)/2:y=1014")
    if label:
        dt += f",drawbox=40:36:640:52:color=0xc4622d@0.95:t=fill,drawtext=fontfile={ARIAL}:textfile={B}/{name}.lab.txt:expansion=none:fontsize=26:fontcolor=white:x=60:y=48"
    fc.append(dt + "[v]")
    fc.append(f"{aud}aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5[a]" if take else f"{aud}anull[a]")
    out = f"{B}/{name}.mp4"
    cmd = [FF, "-y", "-loglevel", "error"] + ins + ["-filter_complex", ";".join(fc), "-map", "[v]", "-map", "[a]", "-t", str(dur),
           "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", out]
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(name, dur, "ok" if r.returncode == 0 else "FAIL " + r.stderr[-400:], flush=True)
    if r.returncode == 0: outs.append(out)
open(f"{B}/list.txt", "w").write("".join(f"file '{os.path.abspath(o)}'\n" for o in outs))
final = os.path.expanduser("~/Desktop/Proven-demo-final.mp4")
r = subprocess.run([FF, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", f"{B}/list.txt", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", final], capture_output=True, text=True)
print("final", final, r.returncode, r.stderr[-300:])
