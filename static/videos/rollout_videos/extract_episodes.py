"""Extract per-episode rollout clips from eval videos.

kick:         episode boundaries = human reset events (dark foreground fraction)
dynamic_pick: episode boundaries = robot still at home (low-motion runs)

For each video: discard episode 1, save episodes 2..6 as separate clips,
each clip starting at the first sustained robot motion in its window.
"""
import subprocess, sys, json, os
import numpy as np

W, H, FPS = 320, 180, 10
MOTION_TH = 20.0
MOTION_SUSTAIN = 3   # frames at FPS
PAD = 0.2            # s before motion onset
N_SAVE = 5           # episodes to save (after discarding the first)

def decode(path):
    cmd = ["ffmpeg", "-v", "error", "-i", path,
           "-vf", f"fps={FPS},scale={W}:{H}", "-pix_fmt", "gray", "-f", "rawvideo", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    fs = W * H
    frames = []
    while True:
        buf = proc.stdout.read(fs)
        if len(buf) < fs:
            break
        frames.append(np.frombuffer(buf, dtype=np.uint8))
    proc.wait()
    return np.stack(frames)

def motion_signal(F):
    k = F.shape[1] // 100
    out = np.empty(len(F) - 1, dtype=np.float32)
    for i in range(0, len(F) - 1, 500):
        j = min(i + 500, len(F) - 1)
        d = np.abs(F[i:j].astype(np.int16) - F[i + 1:j + 1].astype(np.int16))
        out[i:j] = np.partition(d, -k, axis=1)[:, -k:].mean(axis=1)
    return out

def runs_of(mask, min_len):
    out = []
    i = 0
    while i < len(mask):
        if mask[i]:
            j = i
            while j < len(mask) and mask[j]:
                j += 1
            if j - i >= min_len:
                out.append([i, j])
            i = j
        else:
            i += 1
    return out

def merge_runs(runs, gap):
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < gap:
            merged[-1][1] = r[1]
        else:
            merged.append(list(r))
    return merged

def dark_frac(F):
    bg = np.median(F[::50].astype(np.float32), axis=0)
    out = np.empty(len(F), dtype=np.float32)
    for i in range(0, len(F), 500):
        out[i:i + 500] = ((bg - F[i:i + 500].astype(np.float32)) > 50).mean(axis=1)
    return out

def boundaries_kick(F, m):
    frac = dark_frac(F)
    runs = runs_of(frac > 0.12, 1)
    merged = merge_runs(runs, int(2.5 * FPS))
    return [r for r in merged if r[1] - r[0] >= int(0.3 * FPS)]

def boundaries_dp(F, m):
    # between episodes the robot returns to a fixed home pose and pauses; the
    # policy can also pause mid-episode, at some other pose. Cluster the poses
    # of all still moments -- home is the pose that recurs every episode.
    n = len(F)
    Fim = F.reshape(n, H, W).astype(np.float32)
    quiet = runs_of(m < 20, int(0.4 * FPS))
    if len(quiet) < 3:
        return quiet
    feats = np.stack([np.median(Fim[a:b, 0:110, 90:250], axis=0).ravel() for a, b in quiet])
    D = np.abs(feats[:, None, :] - feats[None, :, :]).mean(-1)
    counts = (D < 6).sum(1)
    members = np.nonzero(D[int(np.argmax(counts))] < 6)[0]
    template = np.median(feats[members], axis=0)
    dist = np.abs(feats - template).mean(-1)
    th = max(np.percentile(dist[members], 90) * 1.5, 7.0)
    bounds = [list(quiet[i]) for i in range(len(quiet)) if dist[i] < th]
    return merge_runs(bounds, int(2.5 * FPS))

def boundaries_balance(F, m):
    # between episodes: episode-end stillness -> homing to fixed reset joints
    # (plus a random plate tilt at the wrist) -> 1.5s settle. Detect the settle:
    # arm matches the video-start reset pose (three arm-segment ROIs vote, the
    # tilt only changes the wrist/plate) AND the arm is still.
    n = len(F)
    Fu = F.reshape(n, H, W)
    mm = np.concatenate([m, [m[-1]]])
    rois = [Fu[:, r0:r1, c0:c1].reshape(n, -1).astype(np.float32)
            for r0, r1, c0, c1 in [(15, 55, 100, 260), (55, 95, 100, 260), (95, 135, 80, 280)]]

    # the reference must actually be the reset pose; the video start usually is,
    # but not always -- so try the start plus the longest still runs as candidate
    # references and keep whichever finds the most reset holds
    cand = [[3, 20]]
    long_quiet = sorted(runs_of(mm < 15, int(1.2 * FPS)), key=lambda r: r[0] - r[1])[:8]
    cand += [[q[0], min(q[1], q[0] + 20)] for q in long_quiet]
    # the stable eval runs 20 episodes per video, so the cycle is about
    # duration/20; a reset's post-done hold and settle are separated by well
    # under half a cycle, while real episodes are at least a cycle apart
    merge_gap = int(max(9, 0.35 * n / FPS / 20) * FPS)
    best_hold = []
    for a, b in cand:
        votes = np.zeros(n, dtype=int)
        for roi in rois:
            ref = np.median(roi[a:b], axis=0)
            d = np.abs(roi - ref).mean(1)
            votes += d < max(np.percentile(d, 10), 3.0)
        hold = runs_of((votes >= 2) & (mm < 25), int(0.4 * FPS))
        merged = merge_runs([list(h) for h in hold], merge_gap)
        if len(merged) > len(best_hold):
            best_hold = [list(h) for h in hold]
    hold = best_hold
    if not hold:
        return []
    blocks = merge_runs(hold, merge_gap)
    quiet = runs_of(mm < 15, int(1.2 * FPS))
    if len(blocks) >= 3:
        # fill boundaries whose settle never matched the pose: a gap of ~k cycles
        # gets k-1 boundaries, snapped to a nearby quiet run when one exists
        ms = np.convolve(m, np.ones(7) / 7, mode="same")
        starts = np.array([r[0] for r in blocks])
        S = np.median(np.diff(starts))
        out = [blocks[0]]
        for r in blocks[1:]:
            prev = out[-1]
            gap = r[0] - prev[0]
            k = int(round(gap / S))
            for j in range(1, k):
                exp = prev[0] + int(round(gap * j / k))
                inside = [q for q in quiet
                          if q[0] > out[-1][1] + 2 * FPS and q[1] < r[0] - 2 * FPS
                          and abs(q[0] - exp) < 0.3 * S]
                lo = max(exp - int(0.25 * S), out[-1][1] + 1)
                hi = min(exp + int(0.25 * S), r[0] - 1, len(ms))
                if inside:
                    out.append(list(min(inside, key=lambda q: abs(q[0] - exp))))
                elif hi > lo:
                    t = lo + int(np.argmin(ms[lo:hi]))
                    out.append([t, t + 1])
            out.append(r)
        blocks = sorted(out)
    # extend each block back over the episode-end stillness so the previous
    # episode's clip ends when the robot stops, not mid-homing
    for r in blocks:
        prev_q = [q for q in quiet if q[1] <= r[0] and r[0] - q[1] < 6 * FPS]
        if prev_q:
            r[0] = min(r[0], prev_q[-1][0])
    return blocks

def motion_onset(m, a, b, clean=None):
    for t in range(a, min(b, len(m)) - MOTION_SUSTAIN):
        if np.all(m[t:t + MOTION_SUSTAIN] > MOTION_TH):
            if clean is None or clean[max(t - 3, 0):t + 5].all():
                return t
    return None

def process(path, task, outdir, cut=True):
    name = os.path.splitext(os.path.basename(path))[0]
    F = decode(path)
    m = motion_signal(F)
    fns = {"kick": boundaries_kick, "dynamic_pick": boundaries_dp, "balance": boundaries_balance}
    bounds = fns[task](F, m)
    n = len(F)

    # episode windows: [start_of_video -> b0], [b0.end -> b1.start], ...
    windows = []
    prev_end = 0
    for r in bounds:
        if r[0] - prev_end > 2 * FPS:
            windows.append((prev_end, r[0]))
        prev_end = r[1]
    if n - prev_end > 3 * FPS:
        windows.append((prev_end, n))

    spacing = np.diff([w[0] for w in windows]) / FPS if len(windows) > 2 else np.array([])
    flags = []
    if len(windows) < N_SAVE + 1:
        flags.append(f"ONLY {len(windows)} WINDOWS")
    if len(spacing):
        med = float(np.median(spacing))
        for i, s in enumerate(spacing[:N_SAVE + 1]):
            if s > 1.8 * med or s < 0.45 * med:
                flags.append(f"irregular spacing at window {i+1}: {s:.1f}s (median {med:.1f}s)")

    # for kick, the clip must not show the human: onset requires the dark-
    # foreground (hand) gone, and the end backs off before the hand enters
    clean = None
    end_margin = 0.0
    if task == "kick":
        clean = dark_frac(F) < 0.08
        end_margin = 0.5

    episodes = []
    for wi, (a, b) in enumerate(windows[1:1 + N_SAVE], start=2):
        onset = motion_onset(m, a, b, clean)
        if onset is None:
            flags.append(f"ep{wi}: no motion onset found")
            onset = a
        start = max(onset / FPS - PAD, a / FPS)
        end = max(b / FPS - end_margin, start + 1.0)
        episodes.append({"ep": wi, "start": round(start, 2), "end": round(end, 2)})

    rec = {"path": path, "task": task, "n_boundaries": len(bounds),
           "windows": [[round(a / FPS, 1), round(b / FPS, 1)] for a, b in windows],
           "episodes": episodes, "flags": flags}
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, f"{name}_analysis.json"), "w") as f:
        json.dump(rec, f, indent=1)

    status = "FLAGGED" if flags else "ok"
    print(f"[{task}/{name}] {len(bounds)} boundaries, {len(windows)} windows -> {status}")
    for fl in flags:
        print(f"    ! {fl}")
    for e in episodes:
        print(f"    ep{e['ep']}: {e['start']:7.2f} - {e['end']:7.2f}  ({e['end']-e['start']:.1f}s)")

    if cut and not any("ONLY" in f for f in flags):
        for e in episodes:
            out = os.path.join(outdir, f"{name}_ep{e['ep']}.mp4")
            subprocess.run(["ffmpeg", "-y", "-v", "error",
                            "-ss", str(e["start"]), "-to", str(e["end"]), "-i", path,
                            "-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
                            "-pix_fmt", "yuv420p", "-an", out], check=True)
        print(f"    saved {len(episodes)} clips to {outdir}")
    sys.stdout.flush()
    return rec

if __name__ == "__main__":
    task = sys.argv[1]
    videos = sys.argv[2:]
    base = "/Users/johnsonhung/Desktop/Research/iliad/fast/rollout_videos"
    outdir = os.path.join(base, task, "clips")
    for v in videos:
        try:
            process(v, task, outdir)
        except Exception as ex:
            print(f"[{task}/{os.path.basename(v)}] ERROR: {ex}")
            sys.stdout.flush()
