"""Synthesizes the soundtrack (music + sound effects) for the video.

Everything is generated from scratch with numpy, so there are no licensing issues.
Timings come from config.json so sound effects line up with the visuals.
Usage: python3 scripts/make_audio.py [output.wav]
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

ROOT = Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / "config.json").read_text())
S, CAM, CUE = CFG["scenes"], CFG["cam"], CFG["cues"]
SR = 44100
T = float(CFG["duration"])
N = int(SR * T)
BAR = 2.4  # 100 BPM, 4/4
BEAT = BAR / 4
rng = np.random.default_rng(7)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(dur):
    return np.arange(int(dur * SR)) / SR


class Bus:
    def __init__(self):
        self.l = np.zeros(N)
        self.r = np.zeros(N)

    def add(self, x, t0, gain=1.0, pan=0.0):
        i = int(round(t0 * SR))
        if i >= N or len(x) == 0:
            return
        if i < 0:
            x = x[-i:]
            i = 0
        j = min(N, i + len(x))
        gl, gr = gain * np.sqrt((1 - pan) / 2), gain * np.sqrt((1 + pan) / 2)
        self.l[i:j] += x[: j - i] * gl
        self.r[i:j] += x[: j - i] * gr

    def apply(self, fn):
        self.l, self.r = fn(self.l), fn(self.r)


def lowpass(x, f, order=2):
    return sosfilt(butter(order, f, "low", fs=SR, output="sos"), x)


def highpass(x, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x)


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def sweep_noise(dur, f0, f1, width=0.6, curve=None):
    """Band-limited noise whose centre frequency glides from f0 to f1."""
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 512
    zi = None
    for k in range(0, n, blk):
        u = k / max(1, n - 1)
        if curve is not None:
            u = curve(u)
        fc = f0 * (f1 / f0) ** u
        lo, hi = max(30, fc * (1 - width / 2)), min(SR / 2 - 100, fc * (1 + width / 2))
        sos = butter(2, [lo, hi], "band", fs=SR, output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[k:k + blk], zi = sosfilt(sos, noise[k:k + blk], zi=zi)
    return out / (np.max(np.abs(out)) + 1e-9)


# ------------------------------------------------------------------ harmony
CH = {
    "C": [48, 55, 60, 64, 67], "G": [43, 55, 59, 62, 67], "Am": [45, 52, 57, 60, 64], "F": [41, 53, 57, 60, 65],
    "Dm": [38, 50, 57, 62, 65], "E": [40, 52, 56, 59, 64], "Gs": [43, 55, 60, 62, 67],
}
NBARS = int(round(T / BAR))  # 75


def section(b):
    if b < 4:
        return "intro"
    if b < 17:
        return "soft"
    if b < 34:
        return "groove"
    if b < 39:
        return "break"
    if b < 53:
        return "groove"
    if b < 66:
        return "tense"
    if b == 66:
        return "build"
    if b < 73:
        return "outro"
    return "end"


def chord_for(b):
    sec = section(b)
    if sec == "tense":
        return ["Am", "Am", "F", "F", "Dm", "Dm", "E", "E"][(b - 53) % 8]
    if sec == "build":
        return "Gs"
    if sec == "end":
        return "C"
    return ["C", "G", "Am", "F"][b % 4]


def pad_note(f, dur, rel=1.6, bright=1.6):
    t = tt(dur + rel)
    sig = np.zeros_like(t)
    for det in (-0.09, 0.0, 0.09):
        ff = f * 2 ** (det / 12)
        for h in range(1, 7):
            sig += np.sin(2 * np.pi * ff * h * t + h * 1.7 + det * 40) / h ** bright
    a = min(0.7, dur / 2)
    env = np.minimum(t / a, 1.0) * np.where(t < dur, 1.0, np.exp(-(t - dur) / (rel / 4)))
    return sig * env


def pluck(f, dur=0.6, decay=0.17):
    t = tt(dur)
    sig = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.1 * np.sin(2 * np.pi * 3 * f * t)
    return sig * np.exp(-t / decay) * np.minimum(t / 0.004, 1)


def bass_note(f, dur, decay=0.3):
    t = tt(dur)
    sig = np.tanh(1.6 * (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)))
    return sig * np.exp(-t / decay) * np.minimum(t / 0.006, 1)


def kick(g=1.0):
    t = tt(0.5)
    f = 46 + 95 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return g * (np.sin(ph) * np.exp(-t / 0.2) + 0.25 * rng.standard_normal(len(t)) * np.exp(-t / 0.003))


def clap():
    t = tt(0.35)
    env = np.exp(-t / 0.11)
    for d in (0.0, 0.012, 0.024):
        env += 0.6 * np.exp(-np.maximum(t - d, 0) / 0.006) * (t >= d)
    return bandpass(rng.standard_normal(len(t)), 900, 5000) * env * 0.9


def hat(open_=False):
    t = tt(0.25 if open_ else 0.08)
    return highpass(rng.standard_normal(len(t)), 7000) * np.exp(-t / (0.08 if open_ else 0.022))


music = Bus()
pads, arps, drums, bassb = Bus(), Bus(), Bus(), Bus()

for b in range(NBARS):
    t0 = b * BAR
    sec = section(b)
    chord = CH[chord_for(b)]
    # pad
    pg = {"intro": 0.10 + 0.05 * b, "soft": 0.22, "groove": 0.2, "break": 0.26, "tense": 0.2, "build": 0.24, "outro": 0.24, "end": 0.28}[sec]
    dur = BAR if sec != "end" else T - t0 - 1.2
    for k, m in enumerate(chord[1:]):
        pads.add(pad_note(mtof(m), dur, rel=1.6 if sec != "end" else 1.0, bright=1.9 if sec == "tense" else 1.6), t0, pg / 4, pan=(-0.5 + k / 3))
    # arpeggio
    if sec in ("soft", "groove", "break", "outro", "intro"):
        tones = [chord[2] + 12, chord[3] + 12, chord[4] + 12, chord[2] + 24]
        pat = [0, 1, 2, 1, 3, 2, 1, 2]
        step = BEAT / 2
        if sec == "intro":
            pat, step = [0, 2, 3, 1], BEAT
        ag = {"intro": 0.10, "soft": 0.13, "groove": 0.12, "break": 0.15, "outro": 0.14}[sec]
        for i, p in enumerate(pat):
            arps.add(pluck(mtof(tones[p])), t0 + i * step, ag * (0.8 + 0.2 * (i % 2 == 0)), pan=0.3 * np.sin(i))
    if sec == "tense":
        # dark low pulse arpeggio
        tones = [chord[1], chord[2], chord[1] + 12, chord[2]]
        for i in range(8):
            arps.add(pluck(mtof(tones[i % 4]), 0.5, 0.12), t0 + i * BEAT / 2, 0.08)
    # bass
    root = chord[0] if chord[0] >= 40 else chord[0] + 12
    if sec in ("groove", "outro"):
        for i in range(8):
            bassb.add(bass_note(mtof(root - 12), BEAT / 2 + 0.05, 0.18), t0 + i * BEAT / 2, 0.3 if i % 2 == 0 else 0.22)
    elif sec in ("soft", "break"):
        bassb.add(bass_note(mtof(root - 12), BAR, 1.2), t0, 0.26)
    elif sec == "tense":
        for i in range(8):
            bassb.add(bass_note(mtof(root - 12), BEAT / 2, 0.12), t0 + i * BEAT / 2, 0.24)
    elif sec in ("end",):
        bassb.add(bass_note(mtof(root - 12), 4.5, 1.6), t0, 0.32)
    # drums
    if sec in ("groove", "outro"):
        for i in range(4):
            drums.add(kick(), t0 + i * BEAT, 0.62 if i in (0, 2) else 0.42)
            if i in (1, 3):
                drums.add(clap(), t0 + i * BEAT, 0.3, pan=0.05)
        for i in range(8):
            drums.add(hat(i % 4 == 2), t0 + i * BEAT / 2, 0.1 if i % 2 else 0.14, pan=0.25)
    elif sec == "soft" and b >= 9:
        for i in range(8):
            drums.add(hat(), t0 + i * BEAT / 2, 0.06 if i % 2 else 0.09, pan=0.25)
    elif sec == "tense" and b >= 57:
        for i in range(4):  # heartbeat: lub-dub
            drums.add(kick(), t0 + i * BEAT, 0.42)
            drums.add(kick(), t0 + i * BEAT + 0.16, 0.24)
    elif sec == "build":
        hits = [t0 + x for x in np.concatenate([np.arange(0, 1.2, 0.3), np.arange(1.2, 1.8, 0.15), np.arange(1.8, 2.4, 0.075)])]
        for k, h in enumerate(hits):
            drums.add(clap(), h, 0.12 + 0.25 * k / len(hits))

pads.apply(lambda x: lowpass(x, 2600))
arps_dl, arps_dr = arps.l.copy(), arps.r.copy()
d = int(0.45 * SR)
for k in range(1, 5):  # ping-pong delay
    g = 0.38 ** k
    if k % 2:
        arps.l[d * k:] += arps_dr[: N - d * k] * g
        arps.r[d * k:] += arps_dl[: N - d * k] * g
    else:
        arps.l[d * k:] += arps_dl[: N - d * k] * g
        arps.r[d * k:] += arps_dr[: N - d * k] * g
bassb.apply(lambda x: lowpass(x, 900))


def apply_section_filter(bus, lo_cut):
    """Muffle the breakdown (bars 34-38) so the groove return feels bigger."""
    i0, i1 = int(34 * BAR * SR), int(39 * BAR * SR)
    for ch in ("l", "r"):
        x = getattr(bus, ch)
        x[i0:i1] = lowpass(x[i0:i1], lo_cut)


apply_section_filter(arps, 2200)

for bus, g in ((pads, 1.0), (arps, 1.0), (bassb, 1.0), (drums, 1.0)):
    music.l += bus.l * g
    music.r += bus.r * g

# ------------------------------------------------------------------ sound effects
fx = Bus()


def env_shape(n, a=0.3, b=0.7):
    u = np.linspace(0, 1, n)
    return np.where(u < a, (u / a) ** 2, ((1 - u) / (1 - a)) ** 1.5) if b else u


def whoosh(t0, dur, f0, f1, gain=0.3, a=0.5, pan=0.0):
    x = sweep_noise(dur, f0, f1)
    fx.add(x * env_shape(len(x), a), t0, gain, pan)


def riser(t0, dur, gain=0.25):
    x = sweep_noise(dur, 300, 6000, width=0.8, curve=lambda u: u ** 1.5)
    t = tt(dur)
    s = np.sin(2 * np.pi * np.cumsum(200 * 6 ** (t / dur)) / SR) * 0.4
    e = (t / dur) ** 2.2
    fx.add((x + s) * e, t0, gain)


def blip(t0, gain=0.25, f=1320):
    t = tt(0.5)
    x = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.5 * t)) * np.exp(-t / 0.12)
    fx.add(x, t0, gain)
    fx.add(kick(0.6), t0, gain * 0.9)


def chime(t0, notes, gain=0.16, step=0.09, decay=1.2):
    for k, m in enumerate(notes):
        t = tt(decay * 3)
        f = mtof(m)
        x = (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t / 0.2)) * np.exp(-t / decay)
        fx.add(x, t0 + k * step, gain, pan=(-0.3 + 0.6 * k / max(1, len(notes) - 1)))


# flights: descending through the sky
f1, o1, f2 = CAM["flyDJ"], CAM["outDJ"], CAM["flyGJ"]
whoosh(f1[0], f1[1] - f1[0], 3500, 260, 0.34, a=0.55)
blip(f1[1], 0.24)
whoosh(o1[0], o1[1] - o1[0], 250, 3000, 0.28, a=0.6)
whoosh(CUE["route"][0], CUE["route"][1] - CUE["route"][0], 600, 1800, 0.12, a=0.5, pan=-0.2)
whoosh(f2[0], f2[1] - f2[0], 3500, 260, 0.32, a=0.55)
blip(f2[1], 0.24)
riser(f2[0] + 0.6, (39 * BAR) - (f2[0] + 0.6), 0.1)

# section transitions
for a in [S["djTitle"][0], S["gjTitle"][0]] + [r[0] for r in S["djTeams"]] + [r[0] for r in S["gjTeams"]] + [S["djGroup"][0], S["gjGroup"][0]]:
    whoosh(a + 0.05, 0.7, 700, 4200, 0.09, a=0.35)
chime(S["intro"][0] + 0.4, [72, 76, 79, 84], 0.12, 0.14, 1.6)
chime(S["leader"][0] + 0.5, [76, 79, 83], 0.08, 0.1, 1.0)

# hospital alarm
for k in range(3):
    t = tt(0.17)
    x = np.sign(np.sin(2 * np.pi * 988 * t)) * 0.5 + np.sin(2 * np.pi * 1480 * t) * 0.5
    fx.add(lowpass(x, 4000) * np.minimum(1, np.minimum(t / 0.005, (0.17 - t) / 0.01)), CUE["alert"] + k * 0.3, 0.13)

# clock time-lapse ticks (accelerating)
c0, c1 = CUE["clockLapse"]
tk, k = c0, 0
while tk < c1:
    t = tt(0.03)
    x = bandpass(rng.standard_normal(len(t)), 2500 if k % 2 else 3800, 6000) * np.exp(-t / 0.004)
    fx.add(x, tk, 0.22)
    rate = 3 + 14 * ((tk - c0) / (c1 - c0)) ** 1.4
    tk += 1 / rate
    k += 1

# phone: ringtone + vibration
r0, r1 = CUE["phoneRing"]
ring = [76, 83, 88, 83, 79, 83, 88, 91]
tr = r0
while tr < r1 - 0.2:
    for k, m in enumerate(ring):
        if tr + k * 0.13 < r1:
            t = tt(0.3)
            f = mtof(m)
            x = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 3.9 * f * t) * np.exp(-t / 0.03)) * np.exp(-t / 0.12)
            fx.add(x, tr + k * 0.13, 0.17)
    tr += 1.25
t = tt(r1 - r0)
buzz = lowpass(np.sign(np.sin(2 * np.pi * 150 * t)), 400) * ((t % 0.6) < 0.4) * 0.5
fx.add(buzz, r0, 0.1)
blip(CUE["callAccept"], 0.12, 1760)

# night drive: engine hum + road noise + passing street lamps
d0, d1 = CUE["driveStart"] - 0.3, S["night"][1] + 0.2
t = tt(d1 - d0)
eng = np.sin(2 * np.pi * 52 * t + 2 * np.sin(2 * np.pi * 0.7 * t)) + 0.5 * np.sin(2 * np.pi * 104 * t) + 0.25 * np.sin(2 * np.pi * 156 * t)
road = lowpass(rng.standard_normal(len(t)), 700)
road /= np.max(np.abs(road))
e = np.minimum(1, np.minimum(t / 0.6, (t[-1] - t) / 0.6))
fx.add(lowpass(eng, 300) * e, d0, 0.12)
fx.add(road * e, d0, 0.12)
tl = CUE["driveStart"] + 0.2
while tl < d1 - 0.5:
    whoosh(tl, 0.45, 1500, 500, 0.035, a=0.5, pan=0.4)
    tl += 420 / 800

# stamps
for ts in CUE["stamps"]:
    hit = ts + 0.14
    t = tt(0.4)
    thud = np.sin(2 * np.pi * np.cumsum(55 + 60 * np.exp(-t / 0.03)) / SR) * np.exp(-t / 0.11)
    slap = lowpass(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.035)
    fx.add(thud * 0.8 + slap * 0.5, hit, 0.42)

# impact and finale
im = CUE["impact"]
t = tt(3.0)
boom = np.sin(2 * np.pi * np.cumsum(38 + 70 * np.exp(-t / 0.06)) / SR) * np.exp(-t / 0.9)
crash = highpass(rng.standard_normal(len(t)), 5000) * np.exp(-t / 1.1)
fx.add(boom, im, 0.6)
fx.add(crash, im, 0.12)
riser(im - BAR, BAR, 0.16)
chime(S["outro"][0] + 9.35, [72, 79, 84, 88, 91], 0.12, 0.12, 2.0)

# ------------------------------------------------------------------ mix
tgrid = np.arange(N) / SR


def duck(t, a, b, depth, ramp=0.25):
    up = np.clip((t - (a - ramp)) / ramp, 0, 1)
    down = np.clip(((b + ramp) - t) / ramp, 0, 1)
    return 1 - depth * np.minimum(up, down)


mgain = duck(tgrid, CUE["phoneRing"][0], CUE["callAccept"] + 0.3, 0.45)
mgain *= duck(tgrid, CUE["driveStart"], S["night"][1], 0.2)
music.l *= mgain
music.r *= mgain

# reverb send (music + some fx)
ir_t = tt(2.6)
irl = rng.standard_normal(len(ir_t)) * np.exp(-ir_t / 0.55)
irr = rng.standard_normal(len(ir_t)) * np.exp(-ir_t / 0.55)
irl, irr = lowpass(irl, 5000), lowpass(irr, 5000)
irl /= np.sqrt(np.sum(irl ** 2))
irr /= np.sqrt(np.sum(irr ** 2))
send_l = pads.l * 0.5 * mgain + arps.l * 0.6 * mgain + fx.l * 0.25
send_r = pads.r * 0.5 * mgain + arps.r * 0.6 * mgain + fx.r * 0.25
wet_l = fftconvolve(send_l, irl)[:N]
wet_r = fftconvolve(send_r, irr)[:N]

L = music.l + fx.l + wet_l * 0.35
R = music.r + fx.r + wet_r * 0.35
fade = np.minimum(1, np.minimum(tgrid / 0.4, np.maximum(0, (T - tgrid) / 3.0)))
L *= fade
R *= fade
peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
L, R = L / peak, R / peak
# gentle soft clip then normalize to -1 dBFS
drive = 1.6
L, R = np.tanh(L * drive) / np.tanh(drive), np.tanh(R * drive) / np.tanh(drive)
g = 10 ** (-1 / 20) / max(np.max(np.abs(L)), np.max(np.abs(R)))
out = np.stack([L * g, R * g], axis=1)
dst = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "output" / "audio.wav"
dst.parent.mkdir(parents=True, exist_ok=True)
wavfile.write(dst, SR, (out * 32767).astype(np.int16))
print(f"wrote {dst} ({T:.0f}s)")
