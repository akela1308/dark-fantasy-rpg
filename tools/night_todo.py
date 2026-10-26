"""Клипы, готовые в обоих вариантах, по которым ещё нет решения в _night/choices.txt."""
import glob, os
G = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "generated"))
ch = {tuple(l.split("|")[0].split()[:2]) for l in open(G + "/_night/choices.txt") if l.strip()}
skip = {tuple(l.split()[:2]) for l in open(G + "/_night/skip.txt")} if os.path.exists(G + "/_night/skip.txt") else set()
todo = [f[len(G) + 1:-7] for f in sorted(glob.glob(G + "/*/clips/*_v1.mp4") + [f for f in glob.glob(G + "/*/walk/*_v1.mp4") if "/duelist/" not in f])
        if (f.split("/")[-3], os.path.basename(f)[:-7]) not in ch | skip and os.path.exists(f[:-7] + "_v2.mp4")]
print(" ".join(todo))
