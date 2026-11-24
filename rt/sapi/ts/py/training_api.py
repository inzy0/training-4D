"""Training System API for the Anatomy Lab (/api/ts/*), over data/anatomy_lab/training_system/
built by tools/training_system_build.py from the owner's workbook ALL_IN_ONE_EXERCISES_SYSTEM.xlsx.

Read-only over ts.sqlite. The one write is POST /api/ts/profile: the owner's own inputs (profile.json,
private, local only). The planners, gates, readiness and session builder run tools/training_engine.py,
the port of the workbook's formulas that the build checks against the workbook's cached results.
"""
from __future__ import annotations

import json
import re
import sqlite3
import threading
import time
from functools import lru_cache
from pathlib import Path

from tools import training_engine as E

ROOT = Path(__file__).resolve().parents[1]
TS = ROOT / "data" / "anatomy_lab" / "training_system"
DB = TS / "ts.sqlite"
PROFILE = TS / "profile.json"
ENGINE_TABLES = ["Phase_System", "Phase_Dose", "Conditions_Meta", "Condition_Progression", "Sport_Drills", "Accel_Phase",
                 "Accel_Games", "Accel_Constraints", "Accel_Methods", "Accel_Recovery", "Generated_Library"]
_lock = threading.Lock()


class _RO:  # read-only connection that is always closed (so a rebuild can replace ts.sqlite on Windows)
    def __enter__(self):
        self.c = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, check_same_thread=False)
        return self.c

    def __exit__(self, *a):
        self.c.close()


def _con():
    return _RO()


def reload():
    """Drop cached tables and engine after a rebuild."""
    global _eng
    meta.cache_clear(); pathway.cache_clear()
    with _lock:
        _eng = None


@lru_cache(maxsize=1)
def meta() -> dict:
    with _con() as c:
        return {n: {"sheet": s, "cols": json.loads(cols), "n": k} for n, s, cols, k in c.execute("SELECT name, sheet, cols, n_rows FROM tables_meta")}


def _dicts(name: str) -> list[dict]:
    cols = meta()[name]["cols"]
    with _con() as c:
        return [dict(zip(cols, r[1:])) for r in c.execute(f'SELECT * FROM "t_{name}" ORDER BY rowid')]


_eng = None


def engine() -> E.Tables:
    global _eng
    with _lock:
        if _eng is None:
            _eng = E.Tables({n: _dicts(n) for n in ENGINE_TABLES})
        return _eng


def profile() -> dict:
    try:
        return json.loads(PROFILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_profile(body: dict) -> dict:
    if not isinstance(body, dict) or not isinstance(body.get("metrics", {}), dict):
        raise ValueError("shape")
    body["saved"] = time.strftime("%Y-%m-%d %H:%M:%S"); body["origin"] = "app"
    TS.mkdir(parents=True, exist_ok=True)
    tmp = PROFILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(body, ensure_ascii=False, indent=1), encoding="utf-8"); tmp.replace(PROFILE)
    return {"ok": True, "saved": body["saved"]}


# ---------------------------------------------------------------- generic table pages
def table(name: str, q: str = "", filters: dict | None = None, off: int = 0, lim: int = 50, cols: list[str] | None = None, sort: str = "") -> dict:
    m = meta().get(name)
    if not m:
        raise ValueError("unknown table")
    allc = m["cols"]; ix = {c: j for j, c in enumerate(allc)}
    where, args = [], []
    for k, v in (filters or {}).items():
        if k in ix and v not in (None, ""):
            vals = v if isinstance(v, list) else [v]
            where.append(f"c{ix[k]} IN ({','.join('?' * len(vals))})"); args += [str(x) for x in vals]
    q = q.strip()
    if q and name == "Exercise_Library":
        terms = [t for t in re.findall(r"[\w'-]+", q.lower()) if t][:8]
        if terms:
            where.append("rowid IN (SELECT rowid FROM ex_fts WHERE ex_fts MATCH ?)")
            args.append(" ".join(f'"{t}"*' for t in terms))
    elif q:
        for t in q.lower().split()[:6]:
            where.append("(" + " OR ".join(f"lower(c{j}) LIKE ?" for j in range(len(allc))) + ")"); args += [f"%{t}%"] * len(allc)
    sel = [c for c in (cols or allc) if c in ix]
    w = (" WHERE " + " AND ".join(where)) if where else ""
    order = f" ORDER BY c{ix[sort]}" if sort in ix else " ORDER BY rowid"
    with _con() as c:
        n = c.execute(f'SELECT count(*) FROM "t_{name}"{w}', args).fetchone()[0]
        rows = c.execute(f'SELECT rowid, {", ".join(f"c{ix[s]}" for s in sel)} FROM "t_{name}"{w}{order} LIMIT ? OFFSET ?', args + [min(500, max(1, lim)), max(0, off)]).fetchall()
    return {"table": name, "sheet": m["sheet"], "cols": sel, "total": n, "off": off, "rows": [list(r) for r in rows]}


def row(name: str, rid: int) -> dict:
    m = meta().get(name)
    if not m:
        raise ValueError("unknown table")
    with _con() as c:
        r = c.execute(f'SELECT * FROM "t_{name}" WHERE rowid=?', (rid,)).fetchone()
    return {"table": name, "sheet": m["sheet"], "row": rid, "data": dict(zip(m["cols"], r[1:]))} if r else {"error": "not found"}


def facet(name: str, col: str, filters: dict | None = None, q: str = "") -> list:
    m = meta().get(name); ix = {c: j for j, c in enumerate(m["cols"])}
    if col not in ix:
        raise ValueError("col")
    t = table(name, q, filters, 0, 1)  # reuse WHERE building via a cheap count
    where, args = [], []
    for k, v in (filters or {}).items():
        if k in ix and v not in (None, "") and k != col:
            vals = v if isinstance(v, list) else [v]
            where.append(f"c{ix[k]} IN ({','.join('?' * len(vals))})"); args += [str(x) for x in vals]
    if q.strip() and name == "Exercise_Library":
        terms = [x for x in re.findall(r"[\w'-]+", q.lower()) if x][:8]
        if terms:
            where.append("rowid IN (SELECT rowid FROM ex_fts WHERE ex_fts MATCH ?)"); args.append(" ".join(f'"{x}"*' for x in terms))
    w = (" WHERE " + " AND ".join(where)) if where else ""
    with _con() as c:
        out = [list(r) for r in c.execute(f'SELECT c{ix[col]}, count(*) n FROM "t_{name}"{w} GROUP BY 1 ORDER BY n DESC LIMIT 300', args)]
    return {"col": col, "values": out, "total": t["total"]}


def raw(sheet: str) -> dict:
    with _con() as c:
        r = c.execute("SELECT grid FROM raw WHERE sheet=?", (sheet,)).fetchone()
        s = c.execute("SELECT title, subtitle, n_rows, n_formulas, private, tables FROM sheets WHERE name=?", (sheet,)).fetchone()
    if not s:
        return {"error": "unknown sheet"}
    return {"sheet": sheet, "title": s[0], "subtitle": s[1], "n_rows": s[2], "n_formulas": s[3], "private": bool(s[4]), "tables": json.loads(s[5]),
            "grid": json.loads(r[0]) if r else None}


# ---------------------------------------------------------------- engine routes
@lru_cache(maxsize=64)
def pathway(cond: str, sport: str) -> dict:
    return engine().pathway(cond, sport)


def compute(body: dict) -> dict:
    """Phase_Gates + readiness + 1RM estimates from the inputs the page sends (or the saved profile)."""
    p = body or profile()
    gates_rows = _dicts("Phase_Gates")
    mets = {m["Code"]: m for m in _dicts("Phase_Metrics")}
    vals = {}
    for code, m in mets.items():
        x = (p.get("metrics") or {}).get(code, {})
        vals[code] = E.metric_value(code, x.get("raw1"), x.get("raw2"), x.get("manual"))
    g = E.gates(gates_rows, vals)
    r = p.get("readiness") or {}
    rd = E.readiness(r.get("sleep_q"), r.get("soreness"), r.get("fatigue"), r.get("stress"), r.get("mood"), r.get("sleep_h"), r.get("hrv"), r.get("cmj"), r.get("manual"))
    lifts = [{**x, "estimated": E.epley(x.get("weight"), x.get("reps")), "final": E.num(x.get("tested")) or E.epley(x.get("weight"), x.get("reps")) or 0} for x in (p.get("lifts") or [])]
    manual = str(p.get("manual_phase") or "").strip()
    final = manual if manual in engine().phase_ix else g["auto_phase"]
    ph = engine().phases[engine().phase_ix[final]] if final in engine().phase_ix else None
    order = [x["Code"] for x in engine().phases]
    return {"values": vals, "gates": g, "readiness": rd, "lifts": lifts, "final_phase": final, "phase": ph,
            "progress": (order.index(final) / (len(order) - 1)) if final in order else 0}


def session(a: dict) -> dict:
    """Session_Builder: filter Exercise_Library by phase goals, depth, region, text, equipment on hand; rank by MOD(row*seed, 1000003)."""
    eng = engine(); p = profile()
    ph = a.get("phase") or compute({})["final_phase"]
    prow = eng.phases[eng.phase_ix[ph]]
    goals = [a["goal"]] if a.get("goal") and a["goal"] != "Auto" else E.phase_goals(prow)
    dmin = int(E.num(a.get("dmin"), E.num(prow["Depth Min"], 1))); dmax = int(E.num(a.get("dmax"), E.num(prow["Depth Max"], 6)))
    eq_on = [k for k, v in (p.get("equipment") or {}).items() if str(v).lower() == "yes"] or None
    m = meta()["Exercise_Library"]; ix = {c: j for j, c in enumerate(m["cols"])}
    where = [f"CAST(c{ix['Depth (1-6)']} AS INT) BETWEEN ? AND ?", f"c{ix['Goal']} IN ({','.join('?' * len(goals))})"]
    args: list = [dmin, dmax, *goals]
    if a.get("region") and a["region"] != "Any":
        where.append(f"c{ix['Region']} = ?"); args.append(a["region"])
    if a.get("cat"):
        where.append(f"lower(c{ix['Category']}) LIKE ?"); args.append(f"%{a['cat'].lower()}%")
    if a.get("name"):
        where.append(f"lower(c{ix['Exercise Name']}) LIKE ?"); args.append(f"%{a['name'].lower()}%")
    if eq_on:
        where.append(f"c{ix['Equipment Class']} IN ({','.join('?' * len(eq_on))})"); args += eq_on
    want = ["Exercise Name", "Category", "Movement Pattern", "Equipment Class", "Goal", "Depth (1-6)", "Sets × Reps", "Tempo", "RPE", "Rest",
            "Regression (Easier)", "Standard Progression", "Cues / Technique Focus", "Contraindications", "Depth Reasoning (superficial → deep)",
            "Load Ref (1RM)", "Load Factor", "Primary Muscle(s)", "Secondary Muscle(s)", "Exercise ID"]
    with _con() as c:
        rows = c.execute(f'SELECT rowid, {", ".join(f"c{ix[w]}" for w in want)} FROM "t_Exercise_Library" WHERE {" AND ".join(where)}', args).fetchall()
    seed = int(E.num(a.get("seed"), 7919)); n = max(1, min(15, int(E.num(a.get("n"), 10))))
    vol = E.num(a.get("volume"), 1) or 1
    picks = E.session_pick([(r[0], dict(zip(want, r[1:]))) for r in rows], seed, n)
    sets = max(1, int(E.xround(E.num(prow["Sets (auto)"], 1) * vol)))
    pct = E.num(prow["%1RM (auto)"], 0)
    one_rm = {x["lift"]: x["final"] for x in compute({}).get("lifts", [])}
    out = []
    for rid, d in picks:
        ref = d.get("Load Ref (1RM)"); lf = E.num(d.get("Load Factor"))
        load = f"{E.fmt(E.xround(one_rm[ref] * (lf or 1) * pct, 1))} kg" if ref in one_rm and one_rm[ref] and pct else f"BW / RPE {prow['RPE Target']}"
        out.append({"row": rid, **d, "auto": f"{sets} x {prow['Reps / Duration']} @ {load} | tempo {prow['Tempo']} | rest {prow['Rest']}"})
    return {"phase": ph, "phase_name": prow["Phase Name"], "goals": goals, "depth": [dmin, dmax], "equipment_on": eq_on, "matches": len(rows), "seed": seed,
            "params": {k: prow[k] for k in ("%1RM (auto)", "%1RM Range", "RPE Target", "Sets (auto)", "Reps / Duration", "Tempo", "Rest", "Sessions / Week", "Plyo Contacts / Session", "Conditioning")},
            "picks": out}


def handle_get(path: str, q: dict):
    a = lambda k, d="": q.get(k, [d])[0]  # noqa: E731
    if not DB.exists():
        return 404, {"error": "Training System not built: .venv\\Scripts\\python.exe -m tools.training_system_build <workbook.xlsx>"}
    if path.startswith("/api/ts/div/"):  # training divisions (anatomy_lab/training_divisions.py)
        from anatomy_lab import training_divisions as TD
        return TD.handle_get(path, q)
    if path == "/api/ts/table":
        f = json.loads(a("f") or "{}"); cols = json.loads(a("cols") or "null")
        return 200, table(a("t"), a("q")[:200], f, int(a("off", "0") or 0), int(a("lim", "50") or 50), cols, a("sort"))
    if path == "/api/ts/row":
        return 200, row(a("t"), int(a("id", "0") or 0))
    if path == "/api/ts/facet":
        return 200, facet(a("t"), a("col"), json.loads(a("f") or "{}"), a("q")[:200])
    if path == "/api/ts/raw":
        return 200, raw(a("s"))
    if path == "/api/ts/pathway":
        return 200, pathway(a("c"), a("sport", "General / Non-sport"))
    if path == "/api/ts/dayplan":
        rd = compute({})["readiness"]
        return 200, engine().day_plan(a("c"), a("phase"), int(E.num(a("day"), 1)), a("sport", "General / Non-sport"),
                                      E.num(a("readiness"), rd["score"]), E.num(a("volume"), rd["final"]), json.loads(a("choices") or "{}"))
    if path == "/api/ts/compute":
        return 200, compute({})
    if path == "/api/ts/session":
        return 200, session({k: v[0] for k, v in q.items()})
    if path == "/api/ts/profile":
        return 200, profile()
    return 404, {"error": "unknown route"}


def handle_post(path: str, body: dict):
    if path == "/api/ts/profile":
        return 200, save_profile(body)
    if path == "/api/ts/compute":
        return 200, compute(body)
    return 404, {"error": "unknown route"}
