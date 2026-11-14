#!/usr/bin/env python3
"""Paste API keys into .env.local without echoing them. Sets MOCK=0. Keeps other lines.
Usage: python3 scripts/set-keys.py   (press Enter to keep a key that is already set)"""
import getpass, os, re

PATH = os.path.join(os.path.dirname(__file__), "..", ".env.local")
KEYS = [
    ("TELEM_API_KEY", "Telem key (hack.telem.ai, $50 credit)"),
    ("TAVILY_API_KEY", "Tavily key (app.tavily.com, redeem SEARCHHACK)"),
    ("ANTHROPIC_API_KEY", "Anthropic key (console.anthropic.com, starts sk-ant-)"),
]

lines = open(PATH).read().splitlines() if os.path.exists(PATH) else []
env = {}
for l in lines:
    m = re.match(r"^([A-Z_]+)=(.*)$", l)
    if m:
        env[m.group(1)] = m.group(2)

for name, label in KEYS:
    have = bool(env.get(name, "").strip())
    v = getpass.getpass(f"{label}{' [set, Enter keeps it]' if have else ''}: ").strip()
    if v:
        env[name] = v
env["MOCK"] = "0"
with open(os.path.join(os.path.dirname(PATH), ".env.example")) as example:
    for line in example:
        setting = re.fullmatch(r"([A-Z_]+)=(.+)", line.rstrip("\n"))
        if setting:
            env.setdefault(*setting.groups())

out, done = [], set()
for l in lines:
    m = re.match(r"^([A-Z_]+)=", l)
    if m and m.group(1) in env:
        out.append(f"{m.group(1)}={env[m.group(1)]}")
        done.add(m.group(1))
    else:
        out.append(l)
for k, v in env.items():
    if k not in done:
        out.append(f"{k}={v}")
open(PATH, "w").write("\n".join(out) + "\n")
os.chmod(PATH, 0o600)
missing = [n for n, _ in KEYS if not env.get(n, "").strip()]
print("Saved .env.local (MOCK=0)." + (f" Still missing: {', '.join(missing)}" if missing else " All 3 keys set."))
