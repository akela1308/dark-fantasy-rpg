"""Генерация кадров (Nano Banana Pro) и видео (Veo 3.1) для Mortis.
python3 tools/veo_client.py image "prompt" out.png [ref1 ...] [--aspect 1:1]
python3 tools/veo_client.py vsubmit in.png "prompt" out_prefix [--sec 6] [--aspect 16:9] [--n 2] [--last last.png]
python3 tools/veo_client.py vpoll out_prefix      # забирает готовое видео по сохранённой операции
Ключ берётся из VEO_SA_KEY, в проект не копируется."""
import base64, io, json, os, sys, time, urllib.request, urllib.error
from google.oauth2 import service_account
from google.auth.transport.requests import Request
from PIL import Image

PROJECT = "veo-bot-501814"
_CANDS = [os.environ.get("VEO_SA_KEY", ""),
          "/Users/maksimilin/Desktop/AI/MAKSIM ILIN/Video_Zavod/brand/_keys/video-zavod-sa.json",
          os.path.expanduser("~/mnt/Video_Zavod/brand/_keys/video-zavod-sa.json")]
KEY = next((p for p in _CANDS if p and os.path.exists(p)), None)
IMG = f"https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/publishers/google/models/gemini-3-pro-image:generateContent"
VEO = f"https://us-central1-aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/us-central1/publishers/google/models/veo-3.1-generate-001"
STYLE = ("Hand-painted 2D dark fantasy game sprite art, painterly oil and gouache texture, muted earthy palette, "
         "dramatic light, rich detail. Original character. No text, no letters, no logos, no UI. ")
NEG = ("text, letters, subtitles, watermark, logo, UI, duplicate character, second person, extra arms, extra fingers, "
       "deformed hands, melted face, morphing, style change, 3D render, photorealistic, camera movement, camera shake, "
       "zoom, cut, scene change, background change, shadows on background, objects appearing or disappearing, fire, smoke, steam, vapor, breath mist, white puffs, sparks, muzzle flash, glow, "
       "weapons switching hands, weapon passed to the other hand, weapon changing shape or size, sword turning into another weapon, character turning around")

def token():
    if not KEY: raise SystemExit("ключ не найден, задай VEO_SA_KEY")
    c = service_account.Credentials.from_service_account_file(KEY, scopes=["https://www.googleapis.com/auth/cloud-platform"])
    c.refresh(Request()); return c.token

def call(url, body, tok, timeout=170):
    h = {"Authorization": "Bearer " + tok, "Content-Type": "application/json", "x-goog-user-project": PROJECT}
    for _ in range(5):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(body).encode(), headers=h), timeout=timeout))
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(60); continue
            raise SystemExit(f"HTTP {e.code}: {e.read()[:400].decode('utf-8', 'ignore')}")
    raise SystemExit("429 слишком много раз")

def b64img(path, side=1024):
    im = Image.open(path)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA"); bg = Image.new("RGB", im.size, (0, 255, 0)); bg.paste(im, mask=im.split()[3]); im = bg
    im = im.convert("RGB"); im.thumbnail((side, side)); b = io.BytesIO(); im.save(b, "JPEG", quality=92)
    return base64.b64encode(b.getvalue()).decode()

def opt(args, name, default):
    if name in args:
        i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
    return default

def image(args):
    # --size 1K/2K/4K (по умолчанию 2K), --nostyle: без спрайтового префикса STYLE (для карт)
    aspect = opt(args, "--aspect", "16:9"); size = opt(args, "--size", "2K")
    nostyle = "--nostyle" in args
    if nostyle: args.remove("--nostyle")
    prompt, out, refs = args[0], args[1], args[2:]
    parts = [{"text": ("" if nostyle else STYLE) + prompt}] + [{"inlineData": {"mimeType": "image/jpeg", "data": b64img(r)}} for r in refs]
    body = {"contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"responseModalities": ["TEXT", "IMAGE"], "imageConfig": {"aspectRatio": aspect, "imageSize": size}}}
    r = call(IMG, body, token())
    # С TEXT+IMAGE модель отдаёт сначала черновик-«мысль» в 1K (1376x768), потом финал в 2K.
    # Раньше брался первый кусок, поэтому вместо 2K приходил 1K. Берём последний не-мысленный.
    imgs = [p for p in (r.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
            if p.get("inlineData", {}).get("data")]
    final = [p for p in imgs if not p.get("thought")] or imgs
    if final:
        open(out, "wb").write(base64.b64decode(final[-1]["inlineData"]["data"]))
        open(os.path.splitext(out)[0] + "_prompt.txt", "w").write(prompt + "\nrefs: " + ", ".join(refs))
        print("ok", out); return
    raise SystemExit("картинки нет: " + json.dumps(r)[:400])

def vsubmit(args):
    sec = int(opt(args, "--sec", "6")); aspect = opt(args, "--aspect", "16:9")
    n = int(opt(args, "--n", "2")); last = opt(args, "--last", None)
    img, prompt, prefix = args[0], args[1], args[2]
    pre = ("Game sprite animation on a flat solid chroma green background. Keep exactly the same hand-painted 2D art style, "
           "the same single character, same costume and weapons for the whole clip. The camera is locked off, does not move or zoom. "
           "The character stays in place in the center of the frame. Action: ")
    inst = {"prompt": pre + prompt, "image": {"bytesBase64Encoded": b64img(img, 1920), "mimeType": "image/jpeg"}}
    if last: inst["lastFrame"] = {"bytesBase64Encoded": b64img(last, 1920), "mimeType": "image/jpeg"}
    body = {"instances": [inst], "parameters": {"aspectRatio": aspect, "durationSeconds": sec, "sampleCount": n,
            "generateAudio": False, "resolution": "720p", "negativePrompt": NEG}}
    op = call(VEO + ":predictLongRunning", body, token())["name"]
    json.dump({"op": op, "prompt": prompt, "img": img, "last": last, "sec": sec}, open(prefix + "_op.json", "w"), ensure_ascii=False, indent=1)
    print("submitted", prefix)

def vpoll(args):
    prefix = args[0]; op = json.load(open(prefix + "_op.json"))["op"]
    p = call(VEO + ":fetchPredictOperation", {"operationName": op}, token())
    if not p.get("done"): print("wait", prefix); return
    vids = (p.get("response") or {}).get("videos") or []
    if "error" in p or not vids: raise SystemExit("ошибка: " + json.dumps(p.get("error") or p.get("response"))[:400])
    for i, v in enumerate(vids, 1):
        open(f"{prefix}_v{i}.mp4", "wb").write(base64.b64decode(v["bytesBase64Encoded"])); print("ok", f"{prefix}_v{i}.mp4")

if __name__ == "__main__":
    a = sys.argv[1:]; cmd = a.pop(0)
    {"image": image, "vsubmit": vsubmit, "vpoll": vpoll}[cmd](a)
