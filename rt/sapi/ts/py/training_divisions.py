"""Training divisions for Training 4D: sprinting & speed, agility, power & plyometrics, max strength, hypertrophy,
strength endurance, conditioning, mobility, motor control & balance, rehab & activation, recovery, sport skill.

For each division, from the owner's training workbook only:
- the six-level ladder (Depth_Model L1 foundational -> L6 elite) with the exercises at each level, their prescription
  (sets x reps, load, RPE, rest, tempo), equipment, set-up, and each exercise's own progression chain
  (regression -> standard -> advanced -> elite -> complex / combination);
- equipment mix per level, programs (Program_Library / Program_Variants), loading strategies, drill bank, elite methods,
  training-science concepts, phase doses (Phase_System rows whose Allowed Goals include the division's goal);
- biomechanics: Anatomy_Map base movements (prime movers, tendons, ligaments, joint angles, line of force) and every
  force stated as a multiple of body weight in the division's exercises (quoted with the exercise);
- knowledge ladder: Atlas_Subjects / Atlas_Topics of biomechanics, exercise physiology and performance science.
Mixed programs combine divisions with the workbook's own rules: C3 exercise order, C5 concurrent training,
C4 contrast pairs (x2) and N15 French contrast (x3).

Routes (GET, via training_api.handle_get): /api/ts/div/{list, get, ex, combo}
"""
from __future__ import annotations

import re

from anatomy_lab import training_api as TA

# C3 "Exercise order" (Training_Science): power -> heavy strength -> hypertrophy -> isolation -> conditioning -> mobility.
# rank = position in that rule; None = not named by C3 (placed after the ranked blocks, in the order chosen).
DIV = {
    "sprint": {"name": "Sprinting & speed", "goals": ["Speed/Agility"], "kw": r"sprint|accelerat|max.?velocity|speed|stride|skip|wall drill|resisted|flying|fly\b|hill",
               "anatomy": ["Sprint (acceleration / max velocity)", "Sprint drills (A-skip / B-skip / wall drill)", "Sled push / drag", "Hip flexor raise / psoas march"],
               "programs": ["Speed"], "elite": ["Speed"], "drills": ["Acceleration, braking", "First-step quickness", "Foot speed, rhythm", "Reaction + acceleration"],
               "science": r"speed|sprint|velocity", "rank": 0},
    "agility": {"name": "Agility & change of direction", "goals": ["Speed/Agility"], "kw": r"agility|cut|change of direction|\bcod\b|shuffle|lateral|decel|505|t.?test|reactive|crossover|pivot",
                "anatomy": ["Change of direction / cutting", "Deceleration / braking step", "Lateral bound / shuffle", "Single-leg balance reach (Y-balance / star)"],
                "programs": ["Speed", "Game-specific"], "elite": ["Agility", "Cognitive-motor", "Cognitive"],
                "drills": ["Reactive agility", "Lateral agility, reaction", "Landing under decision", "Dual-task cognition", "First-step quickness"], "science": r"agility|reactive|change of direction", "rank": 0},
    "power": {"name": "Power & plyometrics", "goals": ["Power/Plyometric"], "kw": None,
              "anatomy": ["Jump and land", "Pull from floor (clean/high pull)", "Push press / jerk (overhead drive)", "Rotational throw", "Kettlebell swing (hip-hinge ballistic)"],
              "programs": ["Power", "Plyometric"], "elite": ["Power", "Strength-power"], "drills": ["Landing quality, jump power", "Power with accuracy", "Landing control, foot speed"],
              "science": r"power|plyometric|ballistic|velocity|rate of force", "rank": 0},
    "strength": {"name": "Max strength", "goals": ["Max Strength"], "kw": None,
                 "anatomy": ["Squat", "Hip hinge", "Split squat / lunge", "Horizontal push", "Vertical push", "Horizontal pull", "Vertical pull"],
                 "programs": ["Strength"], "elite": ["Strength", "Strength (low load)"], "drills": [], "science": r"strength|1rm|intensity|load", "rank": 1},
    "hypertrophy": {"name": "Hypertrophy", "goals": ["Hypertrophy"], "kw": None, "anatomy": ["Squat", "Hip hinge", "Horizontal push", "Vertical pull", "Elbow flexion (curl / hammer)", "Elbow extension (triceps)"],
                    "programs": ["Hypertrophy"], "elite": [], "drills": [], "science": r"hypertroph|volume|failure|tension|muscle growth", "rank": 2},
    "endurance": {"name": "Strength endurance", "goals": ["Strength Endurance"], "kw": None, "anatomy": ["Loaded carry", "Back extension / spinal extensor endurance", "Calf raise / ankle complex"],
                  "programs": [], "elite": [], "drills": ["Strength-endurance, fun", "Work capacity, fun"], "science": r"endurance|density|circuit", "rank": None},
    "conditioning": {"name": "Conditioning", "goals": ["Conditioning"], "kw": None, "anatomy": ["Battle rope waves", "Skipping / jump rope", "Sled push / drag", "Deep-water / aquatic running"],
                     "programs": ["Conditioning"], "elite": ["Conditioning", "Conditioning/skill", "Environmental"], "drills": ["Work capacity, fun", "Mixed movement, fun"],
                     "science": r"cardio|aerobic|interval|conditioning|vo2|threshold", "rank": 4},
    "mobility": {"name": "Mobility", "goals": ["Mobility"], "kw": None, "anatomy": ["Hip 90/90 & rotation", "Thoracic mobility drill", "Ankle dorsiflexion drill", "Shoulder mobility drill"],
                 "programs": ["Mobility"], "elite": [], "drills": [], "science": r"mobility|flexib|stretch|range", "rank": 5},
    "balance": {"name": "Motor control & balance", "goals": ["Motor Control/Balance"], "kw": None, "anatomy": ["Single-leg balance reach (Y-balance / star)", "Dead bug (contralateral control)", "Bird dog", "Anti-rotation"],
                "programs": [], "elite": [], "drills": ["Reactive stability"], "science": r"balance|motor|proprio|stability", "rank": None},
    "rehab": {"name": "Rehab & activation", "goals": ["Rehab/Activation"], "kw": None, "anatomy": ["Glute bridge / hip thrust", "Rotator cuff ER/IR", "Spanish squat / knee isometric", "Foot intrinsic / short foot"],
              "programs": ["Prehab", "Activation", "Tendon"], "elite": ["Prehab"], "drills": [], "science": r"tendon|isometric|activation|rehab|injury", "rank": None},
    "recovery": {"name": "Recovery", "goals": ["Recovery"], "kw": None, "anatomy": ["360° diaphragmatic breathing"], "programs": [], "elite": ["Recovery"], "drills": [], "science": r"recover|sleep|fatigue|deload", "rank": None},
    "skill": {"name": "Sport skill", "goals": ["Sport Skill"], "kw": None, "anatomy": [], "programs": ["Game-specific"], "elite": [], "drills": [], "science": r"skill|transfer|specific", "rank": None},
}
EXC = ["Exercise ID", "Exercise Name", "Goal", "Depth (1-6)", "Category", "Movement Pattern", "Equipment Class", "Modality / Equipment", "Region", "Position / Grip / Stance",
       "Sets × Reps", "Load / Intensity", "RPE", "Rest", "Tempo", "Frequency", "Loading Strategy", "Primary Muscle(s)", "Primary Intent (Biomechanical)",
       "Regression (Easier)", "Standard Progression", "Advanced Progression", "Elite / Expertised Variation", "Complex / Combination Progression"]
BW = re.compile(r"[^.;]{0,90}?(\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?)\s*[x×]\s*(?:body ?weight|BW|bodyweight)[^.;]{0,60}", re.I)
_EX = None


def _ex():
    """Exercise_Library rows with the columns used here (cached per process)."""
    global _EX
    if _EX is None:
        import json
        with TA._con() as con:
            cols = json.loads(con.execute("SELECT cols FROM tables_meta WHERE name='Exercise_Library'").fetchone()[0])
            idx = {k: cols.index(k) for k in EXC + ["Cues / Technique Focus", "Contraindications", "S&C Application"] if k in cols}
            sel = ", ".join(f"c{i}" for i in idx.values())
            _EX = [dict(zip(idx.keys(), r)) | {"__row": r0} for r0, *r in con.execute(f'SELECT rowid, {sel} FROM "t_Exercise_Library"')]
    return _EX


def _ladder():
    return [r for r in TA._dicts("Depth_Model") if re.match(r"^L[1-6] [A-Z]", str(r.get("Name") or ""))][:6]


def _in(d, e):
    if e.get("Goal") not in DIV[d]["goals"]:
        return False
    kw = DIV[d]["kw"]
    return True if not kw else bool(re.search(kw, f"{e.get('Exercise Name')} {e.get('Movement Pattern')} {e.get('Category')}", re.I))


def _lvl(e):
    try:
        return int(str(e.get("Depth (1-6)") or "0")[:1])
    except ValueError:
        return 0


def _bodyweight(e):
    return bool(re.search(r"body ?weight|^bw\b|none", str(e.get("Equipment Class") or e.get("Modality / Equipment") or ""), re.I))


_MEM, _LIST, _FORCE = {}, None, {}


def _members(d):
    """Exercises of a division, computed once per process (the browser engine is several times slower than CPython)."""
    if d not in _MEM:
        _MEM[d] = [e for e in _ex() if _in(d, e)]
    return _MEM[d]


def divisions():
    global _LIST
    if _LIST is not None:
        return _LIST
    out = []
    for k, d in DIV.items():
        ex = _members(k)
        out.append({"id": k, "name": d["name"], "n": len(ex), "by_level": {str(l): sum(1 for e in ex if _lvl(e) == l) for l in range(1, 7)}, "rank": d["rank"]})
    _LIST = out
    return out


def get(d, level=None, eq="", q="", bw=False, off=0, lim=40):
    if d not in DIV:
        return {"error": "unknown division"}
    D = DIV[d]
    ex = _members(d)
    eqs = {}
    for e in ex:
        k = e.get("Equipment Class") or "—"
        eqs.setdefault(k, [0] * 6)
        if 1 <= _lvl(e) <= 6:
            eqs[k][_lvl(e) - 1] += 1
    sel = [e for e in ex if (not level or _lvl(e) == int(level)) and (not eq or (e.get("Equipment Class") or "—") == eq) and (not bw or _bodyweight(e))
           and (not q or q.lower() in f"{e.get('Exercise Name')} {e.get('Movement Pattern')} {e.get('Primary Muscle(s)')}".lower())]
    ladder = _ladder()
    sci = [r for r in TA._dicts("Training_Science") if re.search(D["science"], f"{r['Concept']} {r['What it trains / adapts']}", re.I)]
    am = {r["Base movement"]: r for r in TA._dicts("Anatomy_Map")}
    goals = set(D["goals"])
    phases = [{k: r.get(k) for k in ("Code", "Stage", "Phase Name", "%1RM Range", "RPE Target", "Sets (auto)", "Reps / Duration", "Tempo", "Rest", "Sessions / Week",
                                    "Weekly Hard Sets per Muscle", "Plyo Contacts / Session", "Conditioning")}
              for r in TA._dicts("Phase_System") if goals & {x.strip() for x in re.split(r"[|,;]", str(r.get("Allowed Goals (auto filter)") or ""))}]
    forces = _FORCE.get(d)
    for e in (ex if forces is None else []):
        for col in ("Primary Intent (Biomechanical)", "Cues / Technique Focus", "Position / Grip / Stance", "S&C Application", "Contraindications"):
            m = BW.search(str(e.get(col) or ""))
            if m:
                forces = forces if forces is not None else []
                forces.append({"exercise": e["Exercise Name"], "level": _lvl(e), "where": col, "quote": m.group(0).strip(), "multiple": m.group(1)})
                break
    if d not in _FORCE:
        _FORCE[d] = forces = forces or []
    forces = list(forces)
    for b in D["anatomy"]:
        m = BW.search(str(am.get(b, {}).get("Body position & line of force") or ""))
        if m:
            forces.insert(0, {"exercise": b, "level": None, "where": "Anatomy_Map line of force", "quote": m.group(0).strip(), "multiple": m.group(1)})
    progs = [r for r in TA._dicts("Program_Library") if r["Quality"] in D["programs"]]
    pv = {}
    for r in TA._dicts("Program_Variants"):
        if r["Program ID"] in {p["ID"] for p in progs}:
            pv[r["Program ID"]] = pv.get(r["Program ID"], 0) + 1
    drills = [r for r in TA._dicts("Drill_Bank") if r["Quality"] in D["drills"]]
    dsum = {}
    for r in drills:
        dsum.setdefault(r["Quality"], {}).setdefault(str(r["Level"]), 0)
        dsum[r["Quality"]][str(r["Level"])] += 1
    combos = [r for r in TA._dicts("Training_Science") if r["ID"] in ("C3", "C4", "C5", "N15", "T16") or re.search(r"contrast|complex|cluster|potentiation", r["Concept"], re.I)]
    return {"id": d, "name": D["name"], "goals": D["goals"], "rank": D["rank"], "n": len(ex), "ladder": ladder,
            "by_level": {str(l): sum(1 for e in ex if _lvl(e) == l) for l in range(1, 7)}, "equipment": sorted(eqs.items(), key=lambda kv: -sum(kv[1])),
            "exercises": [{k: e.get(k) for k in EXC} | {"row": e["__row"], "level": _lvl(e)} for e in sel[off:off + lim]], "total": len(sel),
            "science": [{k: r[k] for k in ("ID", "Concept", "What it is", "Evidence-based dose", "How to use in this system", "Common mistakes", "Evidence level", "Key references")} for r in sci][:10],
            "elite": [r for r in TA._dicts("Elite_Methods") if r["Category"] in D["elite"]],
            "programs": [{**{k: p[k] for k in ("ID", "Program", "Target / condition / sport", "Levels", "Duration × frequency", "Progression structure", "Original equipment")}, "variants": pv.get(p["ID"], 0)} for p in progs],
            "loading": [r for r in TA._dicts("Loading_Strategies") if r["Dominant goal"] in goals][:20],
            "drills": {"summary": dsum, "samples": drills[:24]},
            "biomechanics": [{"base": b, **{k: am[b].get(k, "") for k in ("Prime movers (agonists)", "Tendons loaded", "Ligaments / capsule / fascia stressed", "Joint angles & range", "Body position & line of force")}} for b in D["anatomy"] if b in am],
            "phases": phases, "forces": forces[:40], "n_forces": len(forces), "combos": [{k: r[k] for k in ("ID", "Concept", "Evidence-based dose", "How to use in this system", "Evidence level")} for r in combos],
            "knowledge": _knowledge(D["science"]),
            "sources": "Exercise_Library (Goal, Depth 1-6), Depth_Model, Program_Library/Program_Variants, Loading_Strategies, Drill_Bank, Elite_Methods, Training_Science, Phase_System, Anatomy_Map"}


KNOW_SUBJ = ("Biomechanics & Kinesiology", "Exercise Physiology", "Sports Performance Science", "Sports & Exercise Medicine", "Sports Physiotherapy")
KNOW_COLS = ("ID", "Subject", "Level", "Topic", "Must remember (basics)", "Theory / law / principle", "Mechanism chain (cause → effect)", "Physio & sport correlation",
             "Assess / test / investigation", "Key numbers", "Pitfall / misconception", "Self-test question", "Evidence / core source")  # never 'Mastery' / 'My notes'


def _knowledge(rx):
    subj = {r["Subject"]: r for r in TA._dicts("Atlas_Subjects")}
    T = [t for t in TA._dicts("Atlas_Topics") if t["Subject"] in KNOW_SUBJ or re.search(rx, f"{t['Topic']} {t['Physio & sport correlation']}", re.I)]
    T = [t for t in T if re.search(rx, f"{t['Topic']} {t['Theory / law / principle']} {t['Mechanism chain (cause → effect)']} {t['Physio & sport correlation']}", re.I) or t["Subject"] in KNOW_SUBJ[:3]]
    T.sort(key=lambda t: (str(t["Level"]), t["Subject"]))
    return {"levels": ["1 Basic", "2 Core", "3 Advanced", "4 Deep"], "topics": [{k: t.get(k, "") for k in KNOW_COLS} for t in T][:60],
            "subjects": [{"subject": k, "stage": subj[k]["Curriculum stage"], "code": subj[k]["Code"]} for k in KNOW_SUBJ if k in subj]}


def exercise(row):
    import json
    with TA._con() as con:
        cols = json.loads(con.execute("SELECT cols FROM tables_meta WHERE name='Exercise_Library'").fetchone()[0])
        r = con.execute(f'SELECT {", ".join(f"c{i}" for i in range(len(cols)))} FROM "t_Exercise_Library" WHERE rowid=?', (int(row),)).fetchone()
    if not r:
        return {"error": "not found"}
    e = dict(zip(cols, r))
    chain = [("Regression (easier)", e.get("Regression (Easier)")), ("Standard", e.get("Exercise Name")), ("Standard progression", e.get("Standard Progression")),
             ("Advanced", e.get("Advanced Progression")), ("Elite / expert", e.get("Elite / Expertised Variation")), ("Complex / combination", e.get("Complex / Combination Progression"))]
    hide = {"Image Prompt Pose Family", "Reference Diagram File", "Select Flag (auto — do not edit)", "Load Ref (1RM)", "Load Factor"}
    return {"exercise": {k: v for k, v in e.items() if k not in hide}, "chain": [{"step": s, "what": w} for s, w in chain if w and str(w).strip() not in ("—", "-")],
            "forces": [m.group(0).strip() for v in e.values() for m in BW.finditer(str(v or ""))]}


def combo(ds, level=3, spw=3, weeks=4, bw=False):
    ds = [d for d in ds if d in DIV][:5]
    if not ds:
        return {"error": "choose at least one division"}
    level = max(1, min(6, int(level)))
    sci = {r["ID"]: r for r in TA._dicts("Training_Science")}
    ranked = sorted([d for d in ds if DIV[d]["rank"] is not None], key=lambda d: DIV[d]["rank"]) + [d for d in ds if DIV[d]["rank"] is None]
    pools = {d: [e for e in _members(d) if _lvl(e) == level and (not bw or _bodyweight(e))] for d in ds}
    rules = [{"id": "C3", "rule": sci.get("C3", {}).get("Evidence-based dose", ""), "applied": "Blocks ordered " + " → ".join(DIV[d]["name"] for d in ranked)}]
    conc = "conditioning" in ds and any(d in ds for d in ("strength", "hypertrophy", "power"))
    if conc:
        rules.append({"id": "C5", "rule": sci.get("C5", {}).get("Evidence-based dose", ""), "applied": "Conditioning placed in a separate session (PM), at least 6 h after the lifting session"})
    pair = "strength" in ds and "power" in ds
    if pair:
        rules.append({"id": "C4", "rule": sci.get("C4", {}).get("Evidence-based dose", ""), "applied": "×2 contrast pair: a heavy strength exercise followed by a power exercise for the same region (C4: works best in stronger, trained athletes)"})
    triad = pair and ("sprint" in ds or "agility" in ds) and level >= 5
    if triad:
        rules.append({"id": "N15", "rule": sci.get("N15", {}).get("Evidence-based dose", ""), "applied": "×3 triad: strength → power → speed, same region, at level 5-6 only (N15: elite power phases; evidence EMERGING)"})
    dm = _ladder()
    nxt = dm[level] if level < len(dm) else None
    def pick(d, i, region=None):
        P = [e for e in pools[d] if not region or e.get("Region") == region] or pools[d]
        if not P:
            return None
        e = P[(i * 7 + len(d)) % len(P)]
        return {k: e.get(k) for k in ("Exercise Name", "Equipment Class", "Sets × Reps", "Load / Intensity", "RPE", "Rest", "Tempo", "Region")} | {"row": e["__row"]}
    W = []
    for w in range(weeks):
        S_ = []
        for s in range(spw):
            i = w * spw + s
            blocks, placed = [], False
            for d in ranked:  # C3 order; the contrast block takes the place of the first of power / strength (fast, unpaired work stays ahead of it)
                if pair and d in ("strength", "power"):
                    if not placed:
                        hv = pick("strength", i)
                        pw = pick("power", i, hv["Region"] if hv else None)
                        group = [hv, pw]
                        if triad:
                            group.append(pick("sprint" if "sprint" in ds else "agility", i))
                        blocks.append({"division": "×3 French contrast" if triad else "×2 contrast pair", "exercises": [g for g in group if g], "rule": "N15" if triad else "C4"})
                        placed = True
                    continue
                if (triad and d in ("sprint", "agility")) or (conc and d == "conditioning"):
                    continue
                ex = [x for x in (pick(d, i), pick(d, i + 1)) if x]
                if ex:
                    blocks.append({"division": DIV[d]["name"], "exercises": ex[:2]})
            sess = {"session": f"W{w + 1} S{s + 1}", "blocks": blocks}
            if conc:
                sess["pm"] = {"division": DIV["conditioning"]["name"], "exercises": [x for x in (pick("conditioning", i),) if x], "rule": "C5"}
            S_.append(sess)
        W.append({"week": w + 1, "sessions": S_})
    return {"divisions": [{"id": d, "name": DIV[d]["name"], "pool": len(pools[d])} for d in ranked], "level": level, "level_info": dm[level - 1] if level - 1 < len(dm) else None,
            "advance_when": nxt, "rules": rules, "weeks": W,
            "method": "Exercises are drawn from Exercise_Library at the chosen depth level (rotated so sessions vary) with their own prescription. Order, concurrent split, "
                      "×2 contrast and ×3 French contrast follow the workbook's Training_Science rules C3, C5, C4 and N15. Move up a level when the next Depth_Model level's entry requirement is met."}


def handle_get(path, q):
    a = lambda k, d="": q.get(k, [d])[0]  # noqa: E731
    r = path.rsplit("/", 1)[-1]
    if r == "list":
        return 200, divisions()
    if r == "get":
        return 200, get(a("d"), a("level") or None, a("eq"), a("q")[:100], a("bw") == "1", int(a("off", "0") or 0), min(100, int(a("lim", "40") or 40)))
    if r == "ex":
        return 200, exercise(a("row", "0"))
    if r == "combo":
        return 200, combo([x for x in a("ds").split(",") if x], int(a("level", "3") or 3), max(1, min(6, int(a("spw", "3") or 3))), max(1, min(12, int(a("weeks", "4") or 4))), a("bw") == "1")
    return 404, {"error": "unknown route"}
