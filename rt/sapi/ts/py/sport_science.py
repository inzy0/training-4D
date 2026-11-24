"""Sport science layer for Training 4D: sport biomechanics, sport-to-sport transfer, individual player development,
training-to-training comparison, rule-based interpretation, development-program building and squad learning.

Everything here is deterministic and traceable: each finding names the rule it applied and where the threshold or
content came from (the owner's training workbook tables, or a published formula cited by name). No generated text.
Runs in the local server and in the browser (Pyodide) on the public site; standard library only.

Routes (GET, via athletes_api.handle_get): /api/ath/sci/{sports, sport, compare, player, trainings, interpret, plan, cohort}
"""
from __future__ import annotations

import json
import math
import re
from datetime import date, timedelta

from anatomy_lab import athletes_api as A
from anatomy_lab import training_api as TA
from tools import training_engine as E

# ---------------------------------------------------------------- app mappings (shown in the UI, reviewable)
# sport movement words -> workbook Anatomy_Map base movements
MOVE_MAP = [
    (r"\bjump|leap|rebound|spike|block|landing|vertical\b", ["Jump and land"]),
    (r"accelerat|sprint|first.step|max velocity|run\b|running", ["Sprint (acceleration / max velocity)", "Sprint drills (A-skip / B-skip / wall drill)"]),
    (r"lateral|shuffle|slide|side.step", ["Lateral bound / shuffle"]),
    (r"cut|change of direction|\bcod\b|agility|dodg|evasion|swerve", ["Change of direction / cutting"]),
    (r"decel|braking|stop", ["Deceleration / braking step"]),
    (r"throw|bowl|pitch|serve|smash|overhead|javelin|shot", ["Throw / catch", "Rotational throw", "Rotator cuff ER/IR"]),
    (r"kick|strike the ball|shooting", ["Hip flexor raise / psoas march", "Hip 90/90 & rotation"]),
    (r"tackl|contact|scrum|ruck|collision|grappl|clinch|takedown|raid|hold", ["Sled push / drag", "Neck 4-way strength", "Anti-rotation"]),
    (r"swing|bat|rotation|rotational|twist|punch", ["Rotation / chop", "Rotational throw"]),
    (r"grip|hang|climb", ["Grip / forearm", "Hang / support"]),
    (r"pull|stroke|paddl|row\b|rowing", ["Vertical pull", "Horizontal pull"]),
    (r"push|press|bench", ["Horizontal push", "Vertical push"]),
    (r"squat|clean|snatch|jerk|lift", ["Squat", "Pull from floor (clean/high pull)", "Push press / jerk (overhead drive)"]),
    (r"lunge|lunging|reach", ["Split squat / lunge", "Lateral lunge / Cossack squat"]),
    (r"pedal|cycl", ["Squat", "Step-up / step-down"]),
    (r"carry|walking|stairs", ["Loaded carry", "Step-up / step-down"]),
    (r"balance|stance|posture", ["Single-leg balance reach (Y-balance / star)"]),
    (r"hinge|deadlift", ["Hip hinge"]),
]
# Phase_Gates metric codes -> words used to find matching workbook content (programs, methods, science, drills)
QUAL = {"STR": ["strength"], "END": ["endurance"], "BAL": ["balance", "proprioc"], "HOP": ["hop", "plyometric", "reactive", "power"],
        "CMJ": ["jump", "power", "plyometric"], "RSI": ["reactive", "plyometric", "stiffness"], "SPR": ["speed", "sprint", "acceleration"],
        "COD": ["change of direction", "agility", "cutting"], "AER": ["aerobic", "conditioning"], "ROM": ["mobility", "range", "flexib"],
        "PAIN": ["pain", "load management"], "EFF": ["swelling", "effusion", "load management"], "PSY": ["confidence", "psycholog", "fear"],
        "PROM": ["function"], "LOAD": ["load", "conditioning"], "TIME": []}
# Sports_Demands sport -> Atlas_Sports rows (names differ between the two sheets)
ATLAS_OF = {"Field Hockey": ["Field hockey"], "Rugby (union/league)": ["Rugby"], "Sprinting (100-400 m)": ["Athletics — sprints & hurdles"],
            "Distance running": ["Athletics — distance running"], "Combat sports (MMA/Boxing)": ["Boxing", "Judo / MMA"], "Wrestling / Kushti": ["Wrestling"],
            "Baseball/Softball (throwing)": ["Baseball / softball"], "Weightlifting / Powerlifting": ["Weightlifting & powerlifting"],
            "Jumps (long/triple/high)": ["Athletics — jumps"], "Cricket": ["Cricket — fast bowling", "Cricket — batting & fielding"]}
KPI_CODE = [(r"\bcmj\b|counter.?movement|vertical jump", "CMJ"), (r"\brsi\b|reactive strength|drop jump", "RSI"), (r"sprint|\b\d+\s?m\b.*\bs\b|\b10.?m|\b20.?m|\b30.?m|\b40", "SPR"),
            (r"agility|505|t.?test|lane|pro.?agility|illinois", "COD"), (r"yo.?yo|vo2|beep|cooper|aerobic|6mwt|time.?trial|km", "AER"),
            (r"hop", "HOP"), (r"1rm|squat|deadlift|bench|strength|× ?bw|x ?bw|pull.?up|grip", "STR"), (r"balance|y.?balance", "BAL")]


def _t(name):
    return TA._dicts(name)


def _words(s):
    return {w for w in re.split(r"[^a-z0-9]+", str(s or "").lower()) if len(w) > 2}


def _items(s):
    return [x.strip() for x in re.split(r"[,;/]|\band\b|\+", str(s or "")) if x.strip() and x.strip() not in ("—", "-")]


def _num(x):
    return E.num(x)


def _moves(text):
    out = {}
    for rx, bases in MOVE_MAP:
        m = re.search(rx, str(text or ""), re.I)
        if m:
            for b in bases:
                out.setdefault(b, m.group(0))
    return out


def _stage_of(phase):
    for r in _t("Phase_System"):
        if r["Code"] == phase:
            return str(r["Stage"]).split()[0], r
    return "1", {}


def _phase_in(spec, phase):
    """Elite_Methods 'Best Phases' like '5C, 6B' or '1C-3B (rehab), 6C' -> is phase inside?"""
    order = [r["Code"] for r in _t("Phase_System")]
    if phase not in order:
        return False
    i = order.index(phase)
    for part in re.split(r",", str(spec or "")):
        part = re.sub(r"\(.*?\)", "", part).strip()
        if "-" in part or "–" in part:
            a, _, b = re.split(r"\s*[-–]\s*", part)[0], None, re.split(r"\s*[-–]\s*", part)[-1]
            if a in order and b in order and order.index(a) <= i <= order.index(b):
                return True
        elif part == phase:
            return True
    return False


# ---------------------------------------------------------------- sports
def sports():
    fam = {r["Sport"]: r for r in _t("Sport_Family")}
    return [{"sport": r["Sport"], "type": r["Type"], "family": fam.get(r["Sport"], {}).get("Family", "—"), "schedule": fam.get(r["Sport"], {}).get("Schedule type", "—")} for r in _t("Sports_Demands")]


def sport_profile(s):
    d = next((r for r in _t("Sports_Demands") if r["Sport"] == s), None)
    if not d:
        return {"error": f"sport not found: {s}"}
    fam = next((r for r in _t("Sport_Family") if r["Sport"] == s), {})
    famg = next((r for r in _t("Sport_Family_Groups") if r["Family"] == fam.get("Family")), {})
    am = {r["Base movement"]: r for r in _t("Anatomy_Map")}
    moves = _moves(" ".join([d["Key Movements"], d["Unique Skills to Train"], famg.get("Highest-intensity action (clearance target)", "")]))
    biomech = [{"base": b, "matched": w, **{k: am[b].get(k, "") for k in ("Prime movers (agonists)", "Synergists", "Stabilisers / co-contractors", "Tendons loaded",
                                                                            "Ligaments / capsule / fascia stressed", "Joint angles & range", "Body position & line of force")}}
               for b, w in moves.items() if b in am]
    atl = [r for r in _t("Atlas_Sports") if r["Sport"] in ATLAS_OF.get(s, [s])]
    topics = {r["ID"]: r for r in _t("Atlas_Topics")}
    def topic_list(ids):
        return [{"id": i, "topic": topics[i]["Topic"], "subject": topics[i]["Subject"]} for i in re.findall(r"[A-Z]{1,4}\d+(?:\.\d+)?", str(ids or "")) if i in topics]
    atlas = [{"name": r["Sport"], "profile": r["Energy & physical profile"], "demands": r["Key movements & demands"], "injuries": r["Most common injuries"],
              "tests": r["Key tests"], "rts": r["Return-to-sport specifics"], "context": r.get("India context", ""),
              "injury_topics": topic_list(r["Injury topic IDs"]), "rehab_topics": topic_list(r["Rehab & prevention topic IDs"]), "performance_topics": topic_list(r["Performance topic IDs"])} for r in atl]
    kpi_items = [x.strip() for x in re.split(r",(?!\d{3})|;", str(d["Elite KPI / Test Targets"] or "")) if x.strip()]  # keep "2,000 m" whole
    kpis = [{"target": k, "code": next((c for rx, c in KPI_CODE if re.search(rx, k, re.I)), None)} for k in kpi_items]
    drills = [r for r in _t("Sport_Drills") if r["Sport"] == s]
    methods = [r for r in _t("Elite_Methods") if s.split()[0].lower() in str(r["Best Sports"]).lower() or "all" in str(r["Best Sports"]).lower()]
    sched = fam.get("Schedule type")
    load = [r for r in _t("Load_Templates") if r["Schedule type"] == sched]
    return {"sport": s, "demands": d, "family": fam.get("Family"), "family_sports": famg.get("Sports in family"), "highest_action": famg.get("Highest-intensity action (clearance target)"),
            "schedule": sched, "biomechanics": biomech, "atlas": atlas, "kpis": kpis, "drills": drills, "methods": methods, "load_template": load,
            "sources": {"demands": "Sports_Demands", "family": "Sport_Family / Sport_Family_Groups", "biomechanics": "Anatomy_Map (movement words matched by the app's MOVE_MAP)",
                        "atlas": "Atlas_Sports + Atlas_Topics", "drills": "Sport_Drills", "methods": "Elite_Methods (Best Sports)", "load": "Load_Templates"}}


def compare(a, b):
    pa, pb = sport_profile(a), sport_profile(b)
    if pa.get("error") or pb.get("error"):
        return {"error": pa.get("error") or pb.get("error")}
    def sets(p):
        d = p["demands"]
        return {"moves": {x["base"] for x in p["biomechanics"]}, "qualities": {q.lower() for q in _items(d["Key Physical Qualities"])},
                "injuries": {q.lower() for q in _items(d["Common Injuries"])}, "prehab": {q.lower() for q in _items(d["Prehab Priorities"])}}
    sa, sb = sets(pa), sets(pb)
    def split(k):
        # exact matches plus word overlap (e.g. "lateral power" ~ "power")
        A_, B_ = sa[k], sb[k]
        same = sorted(A_ & B_)
        near = sorted({x for x in B_ - A_ if any(_words(x) & _words(y) for y in A_ - B_)})
        return {"shared": same, "related_in_b": near, "new_in_b": sorted(B_ - A_ - set(near)), "only_in_a": sorted(A_ - B_)}
    fields = ["Type", "Energy Systems (approx.)", "Key Movements", "Key Physical Qualities", "Positions / Roles", "Common Injuries", "Elite KPI / Test Targets",
              "Unique Skills to Train", "Ultimate-Performer Focus", "Prehab Priorities", "Season Structure"]
    mv = split("moves")
    jac = lambda x, y: round(len(x & y) / len(x | y), 2) if x | y else None  # noqa: E731
    return {"a": a, "b": b, "side_by_side": [{"field": f, "a": pa["demands"].get(f, ""), "b": pb["demands"].get(f, "")} for f in fields],
            "family": {"a": pa["family"], "b": pb["family"], "same": pa["family"] == pb["family"]},
            "moves": mv, "qualities": split("qualities"), "injuries": split("injuries"), "prehab": split("prehab"),
            "overlap": {"base_movements": jac(sa["moves"], sb["moves"]), "qualities": jac(sa["qualities"], sb["qualities"])},
            "new_movement_detail": [x for x in pb["biomechanics"] if x["base"] in mv["new_in_b"]],
            "b_drills": pb["drills"], "method": "Overlap = shared ÷ all distinct items (Jaccard). 'Related' = shares a word with an item of the other sport. "
                                                 "Movements come from the app's keyword map onto Anatomy_Map; qualities, injuries and prehab are split from the Sports_Demands text."}


# ---------------------------------------------------------------- player development
def _protocols():
    pm = {r["Code"]: r for r in _t("Phase_Metrics")}
    tp = {r["ID"]: r for r in _t("Testing_Protocols")}
    out = {}
    for code, r in pm.items():
        p = tp.get(r.get("Protocol"), {})
        rel = str(p.get("Reliability", ""))
        m = re.search(r"SEM\s*([\d.]+)(?:\s*[-–]\s*([\d.]+))?\s*([%a-z°]+)?", rel, re.I)
        sem = _num(m.group(2) or m.group(1)) if m else None
        out[code] = {"metric": r["Metric"], "dir": r["Direction"], "unit": r["Unit"], "protocol": r.get("Protocol"), "test": p.get("Test", ""),
                     "threshold_text": p.get("Threshold / Norm", ""), "reliability": rel, "sem": sem, "sem_unit": (m.group(3) if m else None),
                     "mdc95": round(1.96 * math.sqrt(2) * sem, 1) if sem else None}
    return out


def _tests(aid):
    with A._con() as c:
        rows = c.execute("SELECT day, metrics FROM test WHERE athlete=? ORDER BY day, id", (aid,)).fetchall()
    out = []
    for r in rows:
        m = json.loads(r["metrics"] or "{}")
        vals = {code: E.metric_value(code, x.get("raw1"), x.get("raw2"), x.get("manual")) for code, x in m.items() if isinstance(x, dict)}
        raws = {code: (x.get("raw1"), x.get("raw2")) for code, x in m.items() if isinstance(x, dict)}
        out.append({"day": r["day"], "values": {k: v for k, v in vals.items() if v is not None}, "raw": raws})
    return out


def player(aid):
    a = A.athlete(aid)
    if not a or a.get("error"):
        return {"error": "athlete not found"}
    ath = a.get("athlete", a)
    pl = A.plan(aid)
    prot = _protocols()
    tests = _tests(aid)
    gates = {r["Phase"]: r for r in _t("Phase_Gates")}
    order = [r["Phase"] for r in _t("Phase_Gates")]
    cur = pl.get("phase") or "1"
    latest = tests[-1]["values"] if tests else {}
    # target gate = the first gate after the current phase that the latest values do not yet pass (gates without any
    # threshold are passed through), so a lag is always measured against the gate that actually blocks progress
    def ths(ph):
        return {code: _num(gates[ph].get(f"{code} {p['dir']}")) for code, p in prot.items() if _num(gates[ph].get(f"{code} {p['dir']}")) is not None}
    def passes(ph):
        return all(latest.get(k) is not None and (latest[k] <= v if prot[k]["dir"] == "<=" else latest[k] >= v) for k, v in ths(ph).items())
    after = order[order.index(cur) + 1:] if cur in order else order
    nxt = next((ph for ph in after if ths(ph) and not passes(ph)), after[0] if after else None)
    metrics = []
    for code, p in prot.items():
        series = [(t["day"], t["values"][code]) for t in tests if code in t["values"]]
        v = series[-1][1] if series else None
        th = _num(gates.get(nxt, {}).get(f"{code} {p['dir']}")) if nxt else None
        low = p["dir"] == "<="
        gap = None if v is None or th is None else round((v - th) if low else (th - v), 1)
        ch = round(series[-1][1] - series[-2][1], 1) if len(series) >= 2 else None
        real = None if ch is None or p["mdc95"] is None else abs(ch) >= p["mdc95"]
        raw = tests[-1]["raw"].get(code) if tests else None
        metrics.append({"code": code, "metric": p["metric"], "unit": p["unit"], "dir": p["dir"], "value": v, "next_gate": th, "gap": gap if gap and gap > 0 else 0 if gap is not None else None,
                        "lag": bool(gap and gap > 0), "series": series, "change": ch, "mdc95": p["mdc95"], "change_beyond_error": real, "test": p["test"], "protocol": p["protocol"],
                        "reliability": p["reliability"], "raw": raw})
    mon = A.monitor(aid)
    d = next((r for r in _t("Sports_Demands") if r["Sport"] == ath.get("sport")), {})
    with A._con() as c:
        inj = [dict(r) for r in c.execute("SELECT day, region, condition, severity, status FROM injury WHERE athlete=? ORDER BY day DESC", (aid,))]
    return {"athlete": {k: ath.get(k) for k in ("id", "name", "sport", "position", "level", "status", "condition", "age", "sex", "body_mass", "height")},
            "phase": cur, "phase_name": pl.get("phase_name"), "next_phase": nxt, "target_gate_note": "first gate after the current phase not yet passed", "auto_phase": pl.get("auto_phase"), "metrics": metrics, "n_tests": len(tests),
            "last_test": tests[-1]["day"] if tests else None, "load": {"last": mon["last"], "flags": mon["flags"], "tolerance": mon["tolerance"], "method": mon["method"]},
            "sport_targets": d.get("Elite KPI / Test Targets", ""), "sport_injuries": d.get("Common Injuries", ""), "prehab": d.get("Prehab Priorities", ""), "injuries": inj,
            "method": "Gap = distance to the next phase's Phase_Gates threshold. Change beyond error: |last − previous| ≥ MDC95 = 1.96 × √2 × SEM, "
                      "with SEM read from the test's Testing_Protocols reliability (upper bound when a range is given); when no SEM is given, change cannot be judged."}


def trainings(aid, a_from, a_to, b_from, b_to):
    def window(f, t):
        with A._con() as c:
            rows = [dict(r) for r in c.execute("SELECT day, kind, minutes, rpe, load, pain, readiness FROM session WHERE athlete=? AND day BETWEEN ? AND ? ORDER BY day", (aid, f, t))]
        days = (date.fromisoformat(t) - date.fromisoformat(f)).days + 1
        daily = {}
        for r in rows:
            daily[r["day"]] = daily.get(r["day"], 0) + (r["load"] or 0)
        loads = [daily.get((date.fromisoformat(f) + timedelta(days=i)).isoformat(), 0) for i in range(days)]
        mean = sum(loads) / days if days else 0
        sd = math.sqrt(sum((x - mean) ** 2 for x in loads) / days) if days else 0
        avg = lambda k: round(sum(r[k] for r in rows if r[k] is not None) / max(1, sum(1 for r in rows if r[k] is not None)), 1) if any(r[k] is not None for r in rows) else None  # noqa: E731
        kinds = {}
        for r in rows:
            kinds[r["kind"] or "—"] = kinds.get(r["kind"] or "—", 0) + (r["load"] or 0)
        mono = round(mean / sd, 2) if sd > 0 else None
        return {"from": f, "to": t, "days": days, "sessions": len(rows), "load": round(sum(loads)), "minutes": round(sum(r["minutes"] or 0 for r in rows)),
                "rpe": avg("rpe"), "pain": avg("pain"), "readiness": avg("readiness"), "monotony": mono, "strain": round(sum(loads) * mono) if mono else None,
                "per_week_load": round(sum(loads) * 7 / days) if days else None, "kinds": kinds, "rows": rows}
    A_, B_ = window(a_from, a_to), window(b_from, b_to)
    delta = {k: (None if A_[k] in (None, 0) or B_[k] is None else round(100 * (B_[k] - A_[k]) / A_[k])) for k in ("sessions", "load", "minutes", "rpe", "monotony", "strain", "per_week_load")}
    return {"a": A_, "b": B_, "delta_pct": delta, "method": "Load = minutes × session RPE (Foster 2001). Monotony = mean ÷ SD of daily load over the window; strain = window load × monotony (Foster 1998). Percent change = (B − A) ÷ A."}


# ---------------------------------------------------------------- interpretation (rule-based) and actions
def _actions(code, sport, phase):
    words = QUAL.get(code, [])
    if not words:
        return {}
    hit = lambda *vals: any(w in " ".join(str(v) for v in vals).lower() for w in words)  # noqa: E731
    if code in ("PAIN", "EFF", "LOAD"):  # symptoms and load: only the training-science concepts, not programs or drills
        return {"science": [{"id": r["ID"], "concept": r["Concept"], "dose": r["Evidence-based dose"], "evidence": r["Evidence level"], "refs": r["Key references"]}
                            for r in _t("Training_Science") if hit(r["Concept"], r["What it trains / adapts"], r["Category"])][:3]}
    lvl = E.SPORT_LEVEL[[r["Code"] for r in _t("Phase_System")].index(phase)] if phase in [r["Code"] for r in _t("Phase_System")] else 1
    return {"programs": [{"id": r["ID"], "program": r["Program"], "quality": r["Quality"], "progression": r["Progression structure"], "duration": r["Duration × frequency"]}
                         for r in _t("Program_Library") if hit(r["Quality"], r["Program"], r["Category"])][:4],
            "methods": [{"method": r["Method"], "dose": r["Dose"], "phases": r["Best Phases"], "evidence": r["Evidence"], "risks": r["Risks / Precautions"]}
                        for r in _t("Elite_Methods") if hit(r["Method"], r["Category"], r["Mechanism"]) and _phase_in(r["Best Phases"], phase)][:3],
            "science": [{"id": r["ID"], "concept": r["Concept"], "dose": r["Evidence-based dose"], "evidence": r["Evidence level"], "refs": r["Key references"]}
                        for r in _t("Training_Science") if hit(r["Concept"], r["What it trains / adapts"])][:3],
            "sport_drill": next(({"level": r["Level name"], "drill": r["PRIMARY drill"], "alt_easier": r["Alt A — easier, same goal"]} for r in _t("Sport_Drills")
                                 if r["Sport"] == sport and str(r["Level"]) == str(lvl or 1)), None)}


def interpret(aid):
    p = player(aid)
    if p.get("error"):
        return p
    sport, phase, F = p["athlete"].get("sport") or "General / Non-sport", p["phase"], []
    add = lambda level, finding, rule, source, code=None: F.append({"level": level, "finding": finding, "rule": rule, "source": source, "code": code,  # noqa: E731
                                                                    "actions": _actions(code, sport, phase) if code else {}})
    if not p["n_tests"]:
        add("act", "No tests logged in the app yet, so lags and progress cannot be judged.", "Phase gates need logged tests.", "Phase_Gates / Testing_Protocols")
    untested = [m for m in p["metrics"] if m["value"] is None and m["next_gate"] is not None]
    if p["n_tests"] and untested:
        add("act", f"Gate {p['next_phase']} also needs {', '.join(m['code'] for m in untested)}, not tested yet.",
            "Every threshold of the target gate needs a logged value", f"Phase_Gates row {p['next_phase']}; tests " + ", ".join(f"{m['protocol']} {m['test']}" for m in untested))
    for m in p["metrics"]:
        if m["lag"]:
            add("act", f"{m['metric']}: {m['value']:g} {m['unit']} — needs {m['dir']} {m['next_gate']:g} for phase {p['next_phase']} (gap {m['gap']:g}).",
                f"Next-phase gate {m['code']} {m['dir']} {m['next_gate']:g}", f"Phase_Gates row {p['next_phase']}; test {m['protocol']} ({m['test']})", m["code"])
        if m["change"] is not None and m["change_beyond_error"] is False:
            add("info", f"{m['metric']}: last change {m['change']:+g} is within measurement error (MDC95 {m['mdc95']:g}).",
                "|change| < 1.96 × √2 × SEM (minimal detectable change, Weir 2005)", f"Testing_Protocols {m['protocol']} reliability: {m['reliability']}", m["code"])
        if m["change"] is not None and m["change_beyond_error"] is True:
            add("info", f"{m['metric']}: change {m['change']:+g} exceeds measurement error (MDC95 {m['mdc95']:g}).", "|change| ≥ MDC95", f"Testing_Protocols {m['protocol']}", None)
    for fl in p["load"]["flags"]:
        add("watch", fl, "Load monitoring thresholds (ACWR > 1.5, monotony > 2, pain > 3, readiness < 55, rise above own pain-free tolerance)",
            "athletes_api.monitor — Foster 1998/2001; Hulin/Gabbett (ACWR contested as an injury predictor, trend only)", "LOAD" if "load" in fl else "PAIN" if "pain" in fl else None)
    if p["last_test"]:
        age = (date.today() - date.fromisoformat(p["last_test"])).days
        if age > 28:
            add("watch", f"Last test was {age} days ago.", "App rule: retest at least every 4 weeks so progress decisions use current values", "app rule (review)")
    hist = " ".join(f"{i.get('region') or ''} {i.get('condition') or ''}" for i in p["injuries"]).lower()
    common = [x for x in _items(p["sport_injuries"]) if _words(x) & _words(hist)]
    if common:
        add("watch", f"Injury history overlaps the sport's common injuries: {', '.join(common)}. Prehab priorities for {sport}: {p['prehab']}.",
            "History ∩ Sports_Demands common injuries", f"Sports_Demands ({sport}): Common Injuries, Prehab Priorities")
    rank = {"act": 0, "watch": 1, "info": 2}
    F.sort(key=lambda x: rank[x["level"]])
    return {"athlete": p["athlete"], "phase": phase, "next_phase": p["next_phase"], "findings": F, "player": p,
            "note": "Rule-based interpretation for coaching discussion. Every line names its rule and source; it is not a diagnosis or a clinical decision."}


def build_plan(aid, weeks=4):
    it = interpret(aid)
    if it.get("error"):
        return it
    p, phase = it["player"], it["phase"]
    sport = p["athlete"].get("sport") or "General / Non-sport"
    stage, ps = _stage_of(phase)
    sched = [r for r in _t("Load_Schedule") if r["Sport"] == sport and str(r["Stage"]) == stage]
    sched.sort(key=lambda r: _num(r["Day #"]) or 0)
    lags = sorted([m for m in p["metrics"] if m["lag"]], key=lambda m: -(m["gap"] or 0))[:3]
    tol = p["load"]["tolerance"].get("largest_ok_increase_pct")
    last_week = p["load"]["last"].get("acute")
    base_week = sum(_num(r["Target load (AU)"]) or 0 for r in sched[:7])
    plan_weeks = []
    for w in range(1, weeks + 1):
        target = base_week
        cap = None
        if last_week and tol is not None:
            cap = round(last_week * (1 + tol / 100) ** w)
            target = min(target, cap) if target else cap
        plan_weeks.append({"week": w, "days": [{k: r.get(k) for k in ("Day", "Day label", "Session focus", "Main content", "Target load (AU)", "Intensity", "Warm-up ID")} for r in sched[:7]],
                           "target_load": round(target) if target else None, "cap_from_tolerance": cap,
                           "emphasis": [{"code": m["code"], "metric": m["metric"], "gap": m["gap"], **_actions(m["code"], sport, phase)} for m in lags],
                           "retest": [{"code": m["code"], "test": m["test"], "protocol": m["protocol"]} for m in lags] if w == weeks else []})
    return {"athlete": p["athlete"], "phase": phase, "phase_name": p["phase_name"], "stage": stage, "phase_aim": ps.get("Primary Aim"), "rpe_target": ps.get("RPE Target"),
            "sessions_per_week": ps.get("Sessions / Week"), "weeks": plan_weeks, "lags": lags,
            "method": "Week template = Load_Schedule for the athlete's sport and stage. Emphasis = up to 3 largest next-gate gaps, each with workbook programs, "
                      "elite methods allowed in this phase (Elite_Methods Best Phases), training-science concepts and the sport drill for this phase's level. "
                      "Weekly load is capped at the athlete's largest pain-free weekly increase so far (compounded per week) when that is known. Last week: retest the lagging metrics."}


# ---------------------------------------------------------------- squad learning
def cohort(sport=""):
    with A._con() as c:  # read only: no roster side effects (athletes() also applies due auto-progressions)
        L = [dict(r) for r in c.execute("SELECT id, sport FROM athlete WHERE archived=0")]
    L = [x for x in L if not sport or x.get("sport") == sport]
    prot = _protocols()
    dist = {}
    for x in L:
        t = _tests(x["id"])
        if t:
            for k, v in t[-1]["values"].items():
                dist.setdefault(k, []).append(v)
    stats = []
    for k, xs in sorted(dist.items()):
        n = len(xs); mean = sum(xs) / n; sd = math.sqrt(sum((v - mean) ** 2 for v in xs) / (n - 1)) if n > 1 else None
        stats.append({"code": k, "metric": prot.get(k, {}).get("metric", k), "n": n, "mean": round(mean, 1), "sd": round(sd, 1) if sd is not None else None,
                      "min": min(xs), "max": max(xs), "swc": round(0.2 * sd, 1) if sd else None})
    resp = {}
    with A._con() as c:
        asg = [dict(r) for r in c.execute("SELECT athlete, kind, ref, start_day FROM assignment WHERE active=1")]
    ids = {x["id"] for x in L}
    for g in asg:
        if g["athlete"] not in ids or not g["start_day"]:
            continue
        t = _tests(g["athlete"])
        before = [x for x in t if x["day"] <= g["start_day"]]
        after = [x for x in t if x["day"] > g["start_day"]]
        if before and after:
            for k in set(before[-1]["values"]) & set(after[-1]["values"]):
                r = resp.setdefault((g["ref"], k), [])
                r.append(after[-1]["values"][k] - before[-1]["values"][k])
    responses = [{"program": ref, "code": k, "metric": prot.get(k, {}).get("metric", k), "n": len(v), "mean_change": round(sum(v) / len(v), 1)} for (ref, k), v in sorted(resp.items())]
    return {"sport": sport or "all", "athletes": len(L), "tests": stats, "responses": responses,
            "method": "Latest logged test per athlete. SWC (smallest worthwhile change) = 0.2 × between-athlete SD (Hopkins). Program response = last test after the "
                      "assignment start minus last test before it. Descriptive only: small groups, no control, not causal."}


def handle_get(path, q):
    a = lambda k, d="": q.get(k, [d])[0]  # noqa: E731
    r = path.rsplit("/", 1)[-1]
    if r == "sports":
        return 200, sports()
    if r == "sport":
        return 200, sport_profile(a("s"))
    if r == "compare":
        return 200, compare(a("a"), a("b"))
    if r == "player":
        return 200, player(int(a("id", "0")))
    if r == "trainings":
        t = date.today()
        return 200, trainings(int(a("id", "0")), a("af") or (t - timedelta(days=13)).isoformat(), a("at") or (t - timedelta(days=7)).isoformat(),
                              a("bf") or (t - timedelta(days=6)).isoformat(), a("bt") or t.isoformat())
    if r == "interpret":
        return 200, interpret(int(a("id", "0")))
    if r == "plan":
        return 200, build_plan(int(a("id", "0")), max(1, min(12, int(a("weeks", "4") or 4))))
    if r == "cohort":
        return 200, cohort(a("sport"))
    return 404, {"error": "unknown route"}
