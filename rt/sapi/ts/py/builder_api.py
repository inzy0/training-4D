"""Training 4D builder: your own exercises, programs, questions and trials, with reasoning, a rule check against the
workbook, an unlimited exercise generator, a theory & evidence library, and an Excel export / sheet import.

Storage: data/anatomy_lab/training_system/builder.sqlite (private, never exported; on the public site the same file
lives in the visitor's browser, per account).

- Generator: the workbook's Combo_Dimensions grammar (base movement x intent x stance x equipment x gravity x chain x
  plane x lever x focus x skill x environment), only the combinations each base row allows; depth (L1-L6) = sum of the
  dimension points; reasoning = each chosen option's physiotherapy rationale, S&C rationale and caution, verbatim from
  the workbook; options are ranked by the workbook's "Learned weight (auto from your ratings)".
- Program check: C3 exercise order, C5 concurrent split, Phase_System dose (RPE, sessions/week, weekly hard sets per
  muscle), Depth_Model level jumps, contraindications, all with the rule and its source.
- Theory library: Atlas_Topics (theory, mechanism, evidence / core source, pitfalls, self-test question) and
  Training_Science (dose, evidence level, key references), grouped into physiotherapy, sports science, biomechanics,
  motor learning, human performance and sport & movement. "Proof" here = the cited source and evidence level in the
  workbook; "validation" = your own trials (pre/post with the test's MDC95).
- Sheets: export as .xlsx (tabs Builder_Exercises / Builder_Programs / Builder_Program_Items / Builder_Questions /
  Builder_Trials); rows typed into tabs of the same names in the owner's workbook are imported after the next rebuild.

Routes: GET /api/ath/bld/{state, generate, check, theory, export, dims}; POST /api/ath/bld/{ex, ex_del, from_lib, from_gen,
prog, prog_del, item, item_del, q, q_del, trial, trial_del, rate, import_sheet}
"""
from __future__ import annotations

import base64
import io
import json
import random
import re
import sqlite3
import zipfile
from datetime import date, datetime
from pathlib import Path
from xml.sax.saxutils import escape

from anatomy_lab import training_api as TA

DBF = Path(__file__).resolve().parents[1] / "data" / "anatomy_lab" / "training_system" / "builder.sqlite"
SCHEMA = """
CREATE TABLE IF NOT EXISTS ex (id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT, goal TEXT, level INTEGER, category TEXT, pattern TEXT, equipment TEXT,
  setup TEXT, sets_reps TEXT, load TEXT, rpe TEXT, rest TEXT, tempo TEXT, muscles TEXT, intent TEXT, cues TEXT, errors TEXT, contraindications TEXT,
  regression TEXT, progression TEXT, description TEXT, origin TEXT, base_row INTEGER, combo TEXT, reasoning TEXT, rating INTEGER, created TEXT, updated TEXT);
CREATE TABLE IF NOT EXISTS prog (id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT, goal TEXT, level INTEGER, phase TEXT, weeks INTEGER, spw INTEGER,
  description TEXT, reasoning TEXT, mode TEXT, created TEXT, updated TEXT);
CREATE TABLE IF NOT EXISTS item (id INTEGER PRIMARY KEY, prog INTEGER, week INTEGER, day INTEGER, ord INTEGER, src TEXT, ref INTEGER, name TEXT, goal TEXT,
  sets_reps TEXT, load TEXT, rpe TEXT, rest TEXT, tempo TEXT, block TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS question (id INTEGER PRIMARY KEY, code TEXT UNIQUE, question TEXT, hypothesis TEXT, theories TEXT, metric TEXT, design TEXT,
  status TEXT, answer TEXT, created TEXT, updated TEXT);
CREATE TABLE IF NOT EXISTS trial (id INTEGER PRIMARY KEY, code TEXT UNIQUE, question INTEGER, prog INTEGER, athlete TEXT, start TEXT, planned INTEGER, done INTEGER,
  avg_rpe REAL, worst_pain REAL, metric TEXT, before REAL, after REAL, notes TEXT, created TEXT, updated TEXT);
CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY, ts TEXT, action TEXT, detail TEXT);
"""
GOALS = ["Speed/Agility", "Power/Plyometric", "Max Strength", "Hypertrophy", "Strength Endurance", "Conditioning", "Mobility", "Motor Control/Balance", "Rehab/Activation", "Recovery", "Sport Skill"]
C3_RANK = {"Speed/Agility": 0, "Power/Plyometric": 0, "Max Strength": 1, "Hypertrophy": 2, "Conditioning": 4, "Mobility": 5}  # Training_Science C3
COMP_GOAL = {"MOB": "Mobility", "ACT": "Rehab/Activation", "STR": "Max Strength", "PWR": "Power/Plyometric", "CON": "Conditioning"}
now = lambda: datetime.now().isoformat(timespec="seconds")  # noqa: E731


def _con():
    c = sqlite3.connect(DBF); c.row_factory = sqlite3.Row; c.executescript(SCHEMA); return c


def _log(c, action, detail):
    c.execute("INSERT INTO log (ts, action, detail) VALUES (?,?,?)", (now(), action, json.dumps(detail, ensure_ascii=False)[:4000]))


def _code(c, table, prefix):
    n = c.execute(f"SELECT count(*) FROM {table}").fetchone()[0] + 1
    while c.execute(f"SELECT 1 FROM {table} WHERE code=?", (f"{prefix}-{n:04d}",)).fetchone():
        n += 1
    return f"{prefix}-{n:04d}"


def _rows(c, sql, *a):
    return [dict(r) for r in c.execute(sql, a)]


# ---------------------------------------------------------------- state
def state():
    with _con() as c:
        P = _rows(c, "SELECT * FROM prog ORDER BY id DESC")
        for p in P:
            p["items"] = _rows(c, "SELECT * FROM item WHERE prog=? ORDER BY week, day, ord, id", p["id"])
        return {"exercises": _rows(c, "SELECT * FROM ex ORDER BY id DESC"), "programs": P, "questions": _rows(c, "SELECT * FROM question ORDER BY id DESC"),
                "trials": [dict(t, result=_trial_result(t)) for t in _rows(c, "SELECT * FROM trial ORDER BY id DESC")], "log": _rows(c, "SELECT * FROM log ORDER BY id DESC LIMIT 40"),
                "goals": GOALS, "phases": [{"code": r["Code"], "name": r["Phase Name"]} for r in TA._dicts("Phase_System")]}


# ---------------------------------------------------------------- generator (Combo_Dimensions grammar)
def _bars(s):
    return [x.strip() for x in str(s or "").split("|") if x.strip()]


def dims():
    D = TA._dicts("Combo_Dimensions")
    by = {}
    for r in D:
        by.setdefault(r["Dimension"], []).append(r)
    bases = [{"option": r["Option"], "region": r["Dimension"].split("-")[1], "components": _bars(r["Extra (|components| / class / sets x reps)"])} for k, v in by.items() if k.startswith("Base-") for r in v]
    return {"bases": bases, "components": list(COMP_GOAL), "equipment": [r["Option"] for r in by.get("Equipment", [])], "dimensions": {k: [r["Option"] for r in v] for k, v in by.items() if not k.startswith("Base-")}}


def generate(base, comp, n=12, seed=1, equipment="", stance="", level=0):
    D = TA._dicts("Combo_Dimensions")
    by = {}
    for r in D:
        by.setdefault(r["Dimension"], {})[r["Option"]] = r
    B = next((r for k, v in by.items() if k.startswith("Base-") for r in v.values() if r["Option"] == base), None)
    if not B:
        return {"error": "unknown base movement"}
    comp = comp if comp in COMP_GOAL else "STR"
    if comp not in _bars(B["Extra (|components| / class / sets x reps)"]):
        return {"error": f"{base} does not allow component {comp} in Combo_Dimensions"}
    pick = lambda dim, allowed: [o for o in by.get(dim, {}) if not allowed or o in allowed]  # noqa: E731
    intents = pick(f"Intent-{comp}", _bars(B.get(f"Intents: {comp}")))
    stances = [s for s in pick("Stance / base", _bars(B["Allowed stances / minds"])) if not stance or s == stance]
    equips = [e for e in pick("Equipment", _bars(B["Allowed equipment"])) if not equipment or e == equipment]
    grav, chains, planes = pick("Gravity / vector", _bars(B["Allowed gravity"])), pick("Kinetic chain", _bars(B["Allowed chains"])), pick("Plane", _bars(B["Allowed planes"]))
    levers = list(by.get("Lever", {})) if str(B.get("Lever applies (Y/N)")).upper().startswith("Y") else [None]
    minds, skills, envs, mods = list(by.get("Mindset / focus", {})), list(by.get("Skill type", {})), list(by.get("Environment", {})), list(by.get("Modifier", {}))
    space = [intents, stances, equips, grav, chains, planes, levers, minds, skills, envs, mods]
    total = 1
    for s in space:
        total *= max(1, len(s))
    if not all(space[:6]):
        return {"error": "no allowed combination for these choices", "total": 0}
    w = lambda dim, o: float(str(by.get(dim, {}).get(o, {}).get("Learned weight (auto from your ratings)") or 1) or 1)  # noqa: E731
    rnd = random.Random(f"{base}|{comp}|{seed}|{equipment}|{stance}")
    def choose(dim, opts):
        if opts == [None]:
            return None
        ws = [max(0.05, w(dim, o)) for o in opts]
        return rnd.choices(opts, weights=ws)[0]
    out, seen, tries = [], set(), 0
    while len(out) < n and tries < n * 40:
        tries += 1
        ch = {"Intent": choose(f"Intent-{comp}", intents), "Stance / base": choose("Stance / base", stances), "Equipment": choose("Equipment", equips),
              "Gravity / vector": choose("Gravity / vector", grav), "Kinetic chain": choose("Kinetic chain", chains), "Plane": choose("Plane", planes),
              "Lever": choose("Lever", levers), "Mindset / focus": choose("Mindset / focus", minds), "Skill type": choose("Skill type", skills),
              "Environment": choose("Environment", envs), "Modifier": choose("Modifier", mods)}
        key = json.dumps(ch, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        dimname = lambda k: f"Intent-{comp}" if k == "Intent" else k  # noqa: E731
        rows = [(k, by[dimname(k)][v]) for k, v in ch.items() if v and v in by.get(dimname(k), {})]
        depth = sum(float(str(r["Points (depth +/-; base depth for Intent)"] or 0) or 0) for _, r in rows)
        depth = int(max(1, min(6, round(depth))))
        if level and depth != int(level):
            continue
        intent = by[f"Intent-{comp}"][ch["Intent"]]
        reasons = [{"dimension": k, "option": r["Option"], "physio": r["Physiotherapy rationale"], "sc": r["S&C rationale"], "caution": r["Caution"]}
                   for k, r in [("Base movement", B)] + rows if r["Physiotherapy rationale"] or r["S&C rationale"] or r["Caution"]]
        name = f"{base} — {ch['Equipment']} · {ch['Intent']} · {ch['Stance / base']}" + (f" · {ch['Modifier']}" if ch["Modifier"] and ch["Modifier"] != "none" else "")
        out.append({"name": name, "base": base, "component": comp, "goal": COMP_GOAL[comp], "level": depth, "choices": ch, "sets_reps": intent["Extra (|components| / class / sets x reps)"],
                    "cautions": [r["caution"] for r in reasons if r["caution"]], "reasoning": reasons})
    return {"base": base, "component": comp, "combinations": total, "results": out,
            "method": "Combinations allowed by the base row of Combo_Dimensions (stances, equipment, gravity, chains, planes, intents); depth = sum of the options' points, "
                      "clamped to L1-L6; options drawn in proportion to the workbook's learned weights; reasoning quoted from each option's rationale columns."}


# ---------------------------------------------------------------- saving
EX_F = ["name", "goal", "level", "category", "pattern", "equipment", "setup", "sets_reps", "load", "rpe", "rest", "tempo", "muscles", "intent", "cues", "errors",
        "contraindications", "regression", "progression", "description", "origin", "base_row", "combo", "reasoning", "rating"]


def save_ex(b):
    if not str(b.get("name") or "").strip():
        raise ValueError("an exercise needs a name")
    v = {k: (json.dumps(b[k], ensure_ascii=False) if isinstance(b.get(k), (list, dict)) else b.get(k)) for k in EX_F if k in b}
    with _con() as c:
        if b.get("id"):
            c.execute(f"UPDATE ex SET {', '.join(f'{k}=?' for k in v)}, updated=? WHERE id=?", (*v.values(), now(), int(b["id"]))); eid = int(b["id"])
        else:
            v["origin"] = v.get("origin") or "own"
            eid = c.execute(f"INSERT INTO ex (code, {', '.join(v)}, created, updated) VALUES (?, {', '.join('?' * len(v))}, ?, ?)", (_code(c, "ex", "BX"), *v.values(), now(), now())).lastrowid
        _log(c, "exercise", {"id": eid, "name": b.get("name")}); c.commit()
    return {"ok": True, "id": eid}


def from_lib(b):
    """Copy a workbook Exercise_Library row into the builder (editable copy; the workbook row stays as it is)."""
    from anatomy_lab import training_divisions as TD
    X = TD.exercise(int(b["row"]))
    if X.get("error"):
        raise ValueError("exercise not found")
    e = X["exercise"]
    return save_ex({"name": e.get("Exercise Name"), "goal": e.get("Goal"), "level": int(str(e.get("Depth (1-6)") or "0")[:1] or 0), "category": e.get("Category"),
                    "pattern": e.get("Movement Pattern"), "equipment": e.get("Equipment Class"), "setup": e.get("Position / Grip / Stance"), "sets_reps": e.get("Sets × Reps"),
                    "load": e.get("Load / Intensity"), "rpe": e.get("RPE"), "rest": e.get("Rest"), "tempo": e.get("Tempo"), "muscles": e.get("Primary Muscle(s)"),
                    "intent": e.get("Primary Intent (Biomechanical)"), "cues": e.get("Cues / Technique Focus"), "errors": e.get("Common Errors"),
                    "contraindications": e.get("Contraindications"), "regression": e.get("Regression (Easier)"), "progression": e.get("Standard Progression"),
                    "origin": f"workbook Exercise_Library row {b['row']}", "base_row": int(b["row"])})


def from_gen(b):
    g = b["gen"]
    return save_ex({"name": g["name"], "goal": g["goal"], "level": g["level"], "pattern": g["base"], "equipment": g["choices"].get("Equipment"), "sets_reps": g["sets_reps"],
                    "intent": g["choices"].get("Intent"), "setup": f"{g['choices'].get('Stance / base')} · {g['choices'].get('Gravity / vector')} · {g['choices'].get('Kinetic chain')} · {g['choices'].get('Plane')}",
                    "cues": g["choices"].get("Mindset / focus"), "contraindications": "; ".join(g.get("cautions") or []), "combo": g["choices"], "reasoning": g["reasoning"],
                    "origin": "generated from Combo_Dimensions", "description": b.get("description", "")})


def rate(b):
    """Rate a generated / own exercise 1-5 (kept here; the workbook's learned weights change only in the workbook)."""
    with _con() as c:
        c.execute("UPDATE ex SET rating=?, updated=? WHERE id=?", (max(1, min(5, int(b["rating"]))), now(), int(b["id"]))); c.commit()
    return {"ok": True}


def save_prog(b):
    if not str(b.get("name") or "").strip():
        raise ValueError("a program needs a name")
    F = ["name", "goal", "level", "phase", "weeks", "spw", "description", "mode"]
    v = {k: b.get(k) for k in F if k in b}
    with _con() as c:
        if b.get("id"):
            c.execute(f"UPDATE prog SET {', '.join(f'{k}=?' for k in v)}, updated=? WHERE id=?", (*v.values(), now(), int(b["id"]))); pid = int(b["id"])
        else:
            pid = c.execute(f"INSERT INTO prog (code, {', '.join(v)}, created, updated) VALUES (?, {', '.join('?' * len(v))}, ?, ?)", (_code(c, "prog", "BP"), *v.values(), now(), now())).lastrowid
        _log(c, "program", {"id": pid, "name": b.get("name")}); c.commit()
    return {"ok": True, "id": pid}


def save_item(b):
    F = ["prog", "week", "day", "ord", "src", "ref", "name", "goal", "sets_reps", "load", "rpe", "rest", "tempo", "block", "note"]
    v = {k: b.get(k) for k in F if k in b}
    with _con() as c:
        if b.get("id"):
            c.execute(f"UPDATE item SET {', '.join(f'{k}=?' for k in v)} WHERE id=?", (*v.values(), int(b["id"]))); iid = int(b["id"])
        else:
            if v.get("ord") is None:
                v["ord"] = (c.execute("SELECT max(ord) FROM item WHERE prog=? AND week=? AND day=?", (v.get("prog"), v.get("week", 1), v.get("day", 1))).fetchone()[0] or 0) + 1
            iid = c.execute(f"INSERT INTO item ({', '.join(v)}) VALUES ({', '.join('?' * len(v))})", tuple(v.values())).lastrowid
        c.commit()
    return {"ok": True, "id": iid}


def save_q(b):
    F = ["question", "hypothesis", "theories", "metric", "design", "status", "answer"]
    v = {k: (json.dumps(b[k], ensure_ascii=False) if isinstance(b.get(k), (list, dict)) else b.get(k)) for k in F if k in b}
    if not str(v.get("question") or "").strip() and not b.get("id"):
        raise ValueError("write the question")
    with _con() as c:
        if b.get("id"):
            c.execute(f"UPDATE question SET {', '.join(f'{k}=?' for k in v)}, updated=? WHERE id=?", (*v.values(), now(), int(b["id"]))); qid = int(b["id"])
        else:
            v.setdefault("status", "idea")
            qid = c.execute(f"INSERT INTO question (code, {', '.join(v)}, created, updated) VALUES (?, {', '.join('?' * len(v))}, ?, ?)", (_code(c, "question", "BQ"), *v.values(), now(), now())).lastrowid
        _log(c, "question", {"id": qid}); c.commit()
    return {"ok": True, "id": qid}


def save_trial(b):
    F = ["question", "prog", "athlete", "start", "planned", "done", "avg_rpe", "worst_pain", "metric", "before", "after", "notes"]
    v = {k: b.get(k) for k in F if k in b}
    with _con() as c:
        if b.get("id"):
            c.execute(f"UPDATE trial SET {', '.join(f'{k}=?' for k in v)}, updated=? WHERE id=?", (*v.values(), now(), int(b["id"]))); tid = int(b["id"])
        else:
            tid = c.execute(f"INSERT INTO trial (code, {', '.join(v)}, created, updated) VALUES (?, {', '.join('?' * len(v))}, ?, ?)", (_code(c, "trial", "BT"), *v.values(), now(), now())).lastrowid
        _log(c, "trial", {"id": tid}); c.commit()
    return {"ok": True, "id": tid}


def _delete(table):
    def f(b):
        with _con() as c:
            if table == "prog":
                c.execute("DELETE FROM item WHERE prog=?", (int(b["id"]),))
            c.execute(f"DELETE FROM {table} WHERE id=?", (int(b["id"]),)); _log(c, f"delete {table}", {"id": b["id"]}); c.commit()
        return {"ok": True}
    return f


def _trial_result(t):
    """Change vs the test's MDC95 (Testing_Protocols reliability), the same rule as Player development."""
    try:
        from anatomy_lab import sport_science as SS
        p = SS._protocols().get(str(t.get("metric") or "").upper(), {})
    except Exception:  # noqa: BLE001
        p = {}
    if t.get("before") is None or t.get("after") is None:
        return {"status": "open", "text": "Log the before and after values to judge the result."}
    ch = round(float(t["after"]) - float(t["before"]), 2)
    mdc = p.get("mdc95")
    if mdc is None:
        return {"status": "measured", "change": ch, "text": f"Change {ch:+g}. No SEM for this test in Testing_Protocols, so it cannot be judged against measurement error."}
    real = abs(ch) >= mdc
    better = (ch < 0) if p.get("dir") == "<=" else (ch > 0)
    return {"status": "beyond error" if real else "within error", "change": ch, "mdc95": mdc, "better": better if real else None,
            "text": f"Change {ch:+g} {'exceeds' if real else 'is within'} the MDC95 of {mdc:g} ({p.get('reliability', '')}). One athlete, no control: a signal to repeat, not proof."}


# ---------------------------------------------------------------- program check (rules with sources)
def _range(s):
    m = re.findall(r"\d+(?:\.\d+)?", str(s or ""))
    return (float(m[0]), float(m[-1])) if m else None


def _sets(sr):
    m = re.match(r"\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*[x×]", str(sr or ""))
    return (int(m.group(1)) + int(m.group(2) or m.group(1))) / 2 if m else None


def check(pid):
    with _con() as c:
        p = c.execute("SELECT * FROM prog WHERE id=?", (int(pid),)).fetchone()
        if not p:
            return {"error": "program not found"}
        p = dict(p); I = _rows(c, "SELECT * FROM item WHERE prog=? ORDER BY week, day, ord, id", int(pid))
        own = {r["id"]: r for r in _rows(c, "SELECT * FROM ex")}
    sci = {r["ID"]: r for r in TA._dicts("Training_Science")}
    ph = next((r for r in TA._dicts("Phase_System") if r["Code"] == p.get("phase")), None)
    F = []
    add = lambda level, text, rule, src: F.append({"level": level, "text": text, "rule": rule, "source": src})  # noqa: E731
    if not I:
        add("act", "No exercises yet: add exercises to days and weeks.", "A program needs content", "app")
    days = {}
    for it in I:
        days.setdefault((it["week"] or 1, it["day"] or 1), []).append(it)
    def goal_of(it):
        if it.get("goal"):
            return it["goal"]
        if it["src"] == "bx" and it["ref"] in own:
            return own[it["ref"]]["goal"]
        return None
    for (w, d), its in sorted(days.items()):
        ranks = [(C3_RANK.get(goal_of(i)), i["name"]) for i in its if C3_RANK.get(goal_of(i)) is not None]
        for a, b in zip(ranks, ranks[1:]):
            if b[0] < a[0]:
                add("watch", f"W{w} D{d}: “{b[1]}” comes after “{a[1]}” but C3 puts it earlier.", sci.get("C3", {}).get("Evidence-based dose", "C3"), "Training_Science C3 (evidence HIGH)"); break
        gs = {goal_of(i) for i in its}
        if "Conditioning" in gs and gs & {"Max Strength", "Hypertrophy", "Power/Plyometric"}:
            add("info", f"W{w} D{d}: conditioning and lifting on the same day — lift first or separate by ≥ 6 h.", sci.get("C5", {}).get("Evidence-based dose", "C5"), "Training_Science C5 (evidence HIGH)")
    if ph:
        rpe = _range(ph.get("RPE Target"))
        for it in I:
            r = _range(it.get("rpe"))
            if rpe and r and (r[1] > rpe[1] + 0.01 or r[0] < rpe[0] - 1.01):
                add("watch", f"“{it['name']}” RPE {it['rpe']} vs phase {ph['Code']} target {ph['RPE Target']}.", "Phase_System RPE Target", f"Phase_System {ph['Code']}")
        spw = _range(ph.get("Sessions / Week"))
        if spw and p.get("spw") and not (spw[0] <= float(p["spw"]) <= spw[1]):
            add("watch", f"{p['spw']} sessions/week vs phase {ph['Code']} {ph['Sessions / Week']}.", "Phase_System Sessions / Week", f"Phase_System {ph['Code']}")
        hs = _range(ph.get("Weekly Hard Sets per Muscle"))
        if hs:
            per = {}
            for it in I:
                mus = own[it["ref"]]["muscles"] if it["src"] == "bx" and it["ref"] in own else None
                s = _sets(it.get("sets_reps"))
                if s and mus:
                    for m_ in [x.strip() for x in re.split(r"[,;/]", mus) if x.strip()][:2]:
                        per[(it["week"] or 1, m_)] = per.get((it["week"] or 1, m_), 0) + s
            for (w, m_), s in sorted(per.items()):
                if s > hs[1] or s < hs[0]:
                    add("info", f"Week {w}: {m_} ≈ {s:g} hard sets vs phase {ph['Code']} {ph['Weekly Hard Sets per Muscle']}.", "Phase_System Weekly Hard Sets per Muscle", f"Phase_System {ph['Code']}")
        add("info", f"Phase {ph['Code']} {ph['Phase Name']}: aim {ph.get('Primary Aim')}; %1RM {ph.get('%1RM Range')}; RPE {ph.get('RPE Target')}; sets {ph.get('Sets (auto)')} × {ph.get('Reps / Duration')}; "
                    f"rest {ph.get('Rest')}; plyo contacts {ph.get('Plyo Contacts / Session')}; allowed goals {str(ph.get('Allowed Goals (auto filter)')).strip('|').replace('|', ', ')}.", "Phase dose for this program", f"Phase_System {ph['Code']}")
        allowed = set(_bars(ph.get("Allowed Goals (auto filter)")))
        for it in I:
            g = goal_of(it)
            if g and allowed and g not in allowed:
                add("watch", f"“{it['name']}” ({g}) is not an allowed goal in phase {ph['Code']}.", "Phase_System Allowed Goals", f"Phase_System {ph['Code']}")
    dm = [r for r in TA._dicts("Depth_Model") if re.match(r"^L[1-6] [A-Z]", str(r.get("Name") or ""))]
    for it in I:
        if it["src"] == "bx" and it["ref"] in own:
            e = own[it["ref"]]
            if p.get("level") and e.get("level") and int(e["level"]) > int(p["level"]) + 1:
                nx = dm[int(e["level"]) - 1] if int(e["level"]) - 1 < len(dm) else {}
                add("watch", f"“{e['name']}” is L{e['level']}, more than one level above the program (L{p['level']}). Entry for {nx.get('Name', '')}: {nx.get('Entry requirement', '')}.", "Depth_Model entry requirement", "Depth_Model")
            if e.get("contraindications"):
                add("info", f"“{e['name']}” — contraindications / cautions: {e['contraindications']}", "Exercise contraindications", f"{e['code']} ({e.get('origin') or 'own'})")
    rank = {"act": 0, "watch": 1, "info": 2}
    F.sort(key=lambda x: rank[x["level"]])
    return {"program": p, "findings": F, "ok": not any(f["level"] == "act" for f in F)}


# ---------------------------------------------------------------- theory & evidence library
DOMAINS = {
    "physio": {"name": "Physiotherapy & rehabilitation", "subjects": ["Musculoskeletal Physiotherapy", "Sports Physiotherapy", "Neurological Physiotherapy", "Cardiorespiratory Physiotherapy", "Exercise Therapy", "Electrotherapy & Physical Agents"], "rx": r"rehab|physio|manual therapy|tendon|tissue healing|pain"},
    "sportsci": {"name": "Sports science & exercise physiology", "subjects": ["Exercise Physiology", "Sports Performance Science", "Sports & Exercise Medicine", "Clinical & Sports Nutrition", "Strength & Conditioning"], "rx": r"vo2|aerobic|anaerobic|fatigue|recovery|training load|periodi"},
    "biomech": {"name": "Biomechanics & kinesiology", "subjects": ["Biomechanics & Kinesiology"], "rx": r"biomech|kinematic|kinetic|lever|torque|moment|force|newton|ground reaction|stiffness"},
    "learning": {"name": "Motor learning & human learning", "subjects": ["Sport & Exercise Psychology"], "rx": r"motor (learning|control|development)|skill acquisition|practice &|feedback variable|constraints-led|dynamic systems|attentional|focus of attention|stages of motor"},
    "performance": {"name": "Human performance & training science", "subjects": [], "rx": r"overload|specificity|adaptation|strength|power|hypertroph|speed|endurance|potentiation|velocity"},
    "sport": {"name": "Sport & movement", "subjects": [], "rx": r"sprint|jump|throw|cutting|change of direction|landing|running|gait|sport"},
}
T_COLS = ("ID", "Subject", "Level", "Topic", "Must remember (basics)", "Theory / law / principle", "Mechanism chain (cause → effect)", "Physio & sport correlation",
          "Assess / test / investigation", "Key numbers", "Pitfall / misconception", "Self-test question", "Evidence / core source")


def theory(domain="", q=""):
    rx_q = re.compile(re.escape(q), re.I) if q else None
    out = {}
    for k, D in DOMAINS.items():
        if domain and k != domain:
            continue
        rx = re.compile(D["rx"], re.I)
        topics = [t for t in TA._dicts("Atlas_Topics") if (t["Subject"] in D["subjects"] or rx.search(f"{t['Topic']} {t['Theory / law / principle']}")) and (not rx_q or rx_q.search(" ".join(str(t.get(c, "")) for c in T_COLS)))]
        science = [s for s in TA._dicts("Training_Science") if s.get("Concept") and rx.search(f"{s['Concept']} {s['What it is']} {s['What it trains / adapts']}") and (not rx_q or rx_q.search(" ".join(str(v) for v in s.values())))]
        topics.sort(key=lambda t: (str(t["Level"]), t["Topic"]))
        out[k] = {"name": D["name"], "topics": [{c: t.get(c, "") for c in T_COLS} for t in topics][:80],
                  "science": [{c: s.get(c, "") for c in ("ID", "Category", "Concept", "What it is", "How it works (mechanism)", "Evidence-based dose", "How to use in this system", "Common mistakes", "Evidence level", "Key references")} for s in science][:60]}
    return {"domains": out, "note": "Theories, mechanisms and sources are the workbook's (Atlas_Topics, Training_Science), shown with their stated source and evidence level. "
                                    "Turn any of them into a question and a trial to test it on your own athletes."}


# ---------------------------------------------------------------- sheets: export (.xlsx) and import (workbook tabs)
SHEETS = {
    "Builder_Exercises": ("ex", ["code"] + EX_F[:-4] + ["rating", "created", "updated"]),
    "Builder_Programs": ("prog", ["code", "name", "goal", "level", "phase", "weeks", "spw", "description", "mode", "created", "updated"]),
    "Builder_Program_Items": ("item", ["prog_code", "week", "day", "ord", "src", "ref", "name", "goal", "sets_reps", "load", "rpe", "rest", "tempo", "block", "note"]),
    "Builder_Questions": ("question", ["code", "question", "hypothesis", "theories", "metric", "design", "status", "answer", "created", "updated"]),
    "Builder_Trials": ("trial", ["code", "question", "prog", "athlete", "start", "planned", "done", "avg_rpe", "worst_pain", "metric", "before", "after", "notes", "created"]),
}


def _sheet_rows():
    with _con() as c:
        pc = {r["id"]: r["code"] for r in c.execute("SELECT id, code FROM prog")}
        out = {}
        for name, (table, cols) in SHEETS.items():
            rows = _rows(c, f"SELECT * FROM {table} ORDER BY id")
            if table == "item":
                for r in rows:
                    r["prog_code"] = pc.get(r["prog"], "")
            out[name] = [cols] + [[r.get(k) for k in cols] for r in rows]
    return out


def _xlsx(sheets):
    """Minimal .xlsx writer (inline strings, numbers), standard library only, so it also runs in the browser."""
    def cell(ref, v):
        if v is None or v == "":
            return ""
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return f'<c r="{ref}"><v>{v}</v></c>'
        return f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{escape(str(v))}</t></is></c>'
    def col(i):
        s = ""
        i += 1
        while i:
            i, r = divmod(i - 1, 26); s = chr(65 + r) + s
        return s
    buf = io.BytesIO(); z = zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED); names = list(sheets)
    z.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
               + "".join(f'<Override PartName="/xl/worksheets/sheet{i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(len(names))) + "</Types>")
    z.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
    z.writestr("xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
               + "".join(f'<sheet name="{escape(n)}" sheetId="{i + 1}" r:id="rId{i + 1}"/>' for i, n in enumerate(names)) + "</sheets></workbook>")
    z.writestr("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
               + "".join(f'<Relationship Id="rId{i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i + 1}.xml"/>' for i in range(len(names))) + "</Relationships>")
    for i, n in enumerate(names):
        rows = "".join(f'<row r="{r + 1}">' + "".join(cell(f"{col(c)}{r + 1}", v) for c, v in enumerate(row)) + "</row>" for r, row in enumerate(sheets[n]))
        z.writestr(f"xl/worksheets/sheet{i + 1}.xml", f'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{rows}</sheetData></worksheet>')
    z.close()
    return buf.getvalue()


def export():
    S = _sheet_rows()
    return {"filename": f"Meridian_Builder_{date.today().isoformat()}.xlsx", "b64": base64.b64encode(_xlsx(S)).decode(), "tsv": {k: "\n".join("\t".join("" if v is None else str(v).replace("\t", " ").replace("\n", " ") for v in r) for r in rows) for k, rows in S.items()},
            "counts": {k: len(v) - 1 for k, v in S.items()}}


def import_sheet(b=None):
    """Rows typed into Builder_* tabs of the owner's workbook (raw grids stored by the last rebuild) -> builder, by code."""
    with TA._con() as con:
        raw = {s: json.loads(g) for s, g in con.execute("SELECT sheet, grid FROM raw WHERE sheet LIKE 'Builder_%'")}
    if not raw:
        return {"ok": True, "imported": 0, "note": "No Builder_* tabs in the workbook yet (add them in the Google Sheet; they arrive with the next sync)."}
    n = 0
    with _con() as c:
        pc = {r["code"]: r["id"] for r in c.execute("SELECT id, code FROM prog")}
        for name, (table, cols) in SHEETS.items():
            g = raw.get(name)
            if not g or len(g) < 2:
                continue
            head = [str(h or "").strip() for h in g[0]]
            for row in g[1:]:
                d = {h: (row[i] if i < len(row) else None) for i, h in enumerate(head) if h in cols}
                if not any(v not in (None, "") for v in d.values()):
                    continue
                if table == "item":
                    d["prog"] = pc.get(d.pop("prog_code", None))
                    if not d["prog"]:
                        continue
                    c.execute(f"INSERT INTO item ({', '.join(d)}) VALUES ({', '.join('?' * len(d))})", tuple(d.values())); n += 1; continue
                code = d.get("code")
                if code and c.execute(f"SELECT 1 FROM {table} WHERE code=?", (code,)).fetchone():
                    k = [x for x in d if x != "code"]
                    c.execute(f"UPDATE {table} SET {', '.join(f'{x}=?' for x in k)} WHERE code=?", (*[d[x] for x in k], code))
                else:
                    d.setdefault("code", _code(c, table, {"ex": "BX", "prog": "BP", "question": "BQ", "trial": "BT"}[table]))
                    c.execute(f"INSERT INTO {table} ({', '.join(d)}) VALUES ({', '.join('?' * len(d))})", tuple(d.values()))
                    if table == "prog":
                        pc[d["code"]] = c.execute("SELECT id FROM prog WHERE code=?", (d["code"],)).fetchone()[0]
                n += 1
        _log(c, "import sheet", {"rows": n}); c.commit()
    return {"ok": True, "imported": n}


# ---------------------------------------------------------------- routing
def handle_get(path, q):
    a = lambda k, d="": q.get(k, [d])[0]  # noqa: E731
    r = path.rsplit("/", 1)[-1]
    if r == "state":
        return 200, state()
    if r == "dims":
        return 200, dims()
    if r == "generate":
        return 200, generate(a("base"), a("comp", "STR"), min(40, int(a("n", "12") or 12)), a("seed", "1"), a("eq"), a("stance"), int(a("level", "0") or 0))
    if r == "check":
        return 200, check(a("id", "0"))
    if r == "theory":
        return 200, theory(a("domain"), a("q")[:80])
    if r == "export":
        return 200, export()
    return 404, {"error": "unknown route"}


POST = {"ex": save_ex, "ex_del": _delete("ex"), "from_lib": from_lib, "from_gen": from_gen, "rate": rate, "prog": save_prog, "prog_del": _delete("prog"),
        "item": save_item, "item_del": _delete("item"), "q": save_q, "q_del": _delete("question"), "trial": save_trial, "trial_del": _delete("trial"), "import_sheet": import_sheet}


def handle_post(path, b):
    f = POST.get(path.rsplit("/", 1)[-1])
    if not f:
        return 404, {"error": "unknown route"}
    try:
        return 200, f(b)
    except (ValueError, KeyError) as e:
        return 400, {"ok": False, "error": str(e)}
