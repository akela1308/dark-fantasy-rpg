"""Аудит через Gemini 4 Argon (Vertex, проект veo-bot-501814).
python3 tools/qa/argon.py tasks.json out.jsonl [--par 12]
tasks.json: [{"id", "prompt", "files": [пути картинок или видео], "text": "вложенный текст"}]
Готовые id в out.jsonl пропускаются. Токены копятся в out.jsonl, сумма печатается в конце."""
import base64, json, mimetypes, os, sys, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
from google.oauth2 import service_account
from google.auth.transport.requests import Request
KEY = "/Users/maksimilin/Desktop/AI/MAKSIM ILIN/Video_Zavod/brand/_keys/video-zavod-sa.json"
P = "veo-bot-501814"; M = os.environ.get("ARGON_MODEL", "gemini-4-argon")
U = f"https://aiplatform.googleapis.com/v1/projects/{P}/locations/global/publishers/google/models/{M}:generateContent"
lock = threading.Lock(); cred = service_account.Credentials.from_service_account_file(KEY, scopes=["https://www.googleapis.com/auth/cloud-platform"])


def tok():
    with lock:
        if not cred.valid: cred.refresh(Request())
        return cred.token


def run(t):
    parts = []
    for f in t.get("files", []):
        mt = mimetypes.guess_type(f)[0] or "image/jpeg"
        parts.append({"inlineData": {"mimeType": mt, "data": base64.b64encode(open(f, "rb").read()).decode()}})
    parts.append({"text": t["prompt"] + ("\n\n" + t["text"] if t.get("text") else "")})
    b = {"contents": [{"role": "user", "parts": parts}], "generationConfig": {"maxOutputTokens": t.get("max", 12000), "temperature": 0.2}}
    for a in range(6):
        try:
            r = urllib.request.Request(U, data=json.dumps(b).encode(), headers={"Authorization": "Bearer " + tok(), "x-goog-user-project": P, "Content-Type": "application/json"})
            x = json.load(urllib.request.urlopen(r, timeout=280))
            txt = "".join(p.get("text", "") for p in x["candidates"][0]["content"].get("parts", []))
            return dict(id=t["id"], text=txt, usage=x.get("usageMetadata", {}))
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503): time.sleep(20 * (a + 1)); continue
            return dict(id=t["id"], error=f"{e.code} {e.read()[:200].decode('utf-8', 'ignore')}")
        except Exception as e:
            time.sleep(10); err = str(e)
    return dict(id=t["id"], error="повторы кончились")


if __name__ == "__main__":
    tasks = json.load(open(sys.argv[1])); out = sys.argv[2]
    par = int(sys.argv[sys.argv.index("--par") + 1]) if "--par" in sys.argv else 12
    done = set()
    if os.path.exists(out):
        for l in open(out):
            r = json.loads(l)
            if "error" not in r: done.add(r["id"])
    todo = [t for t in tasks if t["id"] not in done]
    ti = to = 0
    with ThreadPoolExecutor(par) as ex, open(out, "a") as f:
        for r in ex.map(run, todo):
            f.write(json.dumps(r, ensure_ascii=False) + "\n"); f.flush()
            u = r.get("usage", {}); ti += u.get("promptTokenCount", 0); to += u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0)
            print("ok" if "error" not in r else "ОШИБКА " + r["error"][:150], r["id"], flush=True)
    print(f"токены: вход {ti}, выход {to}", flush=True)
