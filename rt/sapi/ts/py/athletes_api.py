"""Athletes, groups, logs and monitoring for the Training System (/api/ath/*).

Private, local only: data/anatomy_lab/training_system/athletes.sqlite (never exported, never training data).
Every write is recorded in the audit table with who-changed-what and the reason given; manual phase changes and
plan overrides require a reason. Plans and phases come from tools/training_engine.py (the port of the owner's
workbook formulas, checked against the workbook's cached results), with every step of the decision written out.

Monitoring maths (descriptive, not predictive):
  session load = minutes x session RPE (Foster et al. 2001, sRPE)
  acute load = sum of the last 7 days; chronic load = mean weekly load over the last 28 days;
  acute:chronic ratio = acute / chronic (Hulin / Gabbett; contested as a predictor of injury, shown as a trend only)
  monotony = mean daily load / SD of daily load over 7 days; strain = weekly load x monotony (Foster 1998)
  personal tolerance = the largest week-on-week load increase in this athlete's own log NOT followed within 3 days
  by pain > 3/10 (small-sample description of their own data, not a model).
"""
from __future__ import annotations

import json
import math
import sqlite3
import time
from datetime import date, datetime, timedelta
from pathlib import Path

from tools import training_engine as E

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "anatomy_lab" / "training_system" / "athletes.sqlite"
LEVELS = ["Recreational", "Amateur", "Semi-professional", "Professional", "Elite"]
STATUSES = ["Active", "Injured", "Returning", "Inactive"]
SCHEMA = """
CREATE TABLE IF NOT EXISTS athlete (id INTEGER PRIMARY KEY, name TEXT NOT NULL, sport TEXT, position TEXT, level TEXT, status TEXT,
  condition TEXT, injury_date TEXT, phase_manual TEXT, phase_start TEXT, body_mass REAL, height REAL, age REAL, sex TEXT, notes TEXT,
  profile TEXT, created TEXT, updated TEXT, archived INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS grp (id INTEGER PRIMARY KEY, name TEXT UNIQUE, kind TEXT, notes TEXT);
CREATE TABLE IF NOT EXISTS member (grp INTEGER, athlete INTEGER, PRIMARY KEY (grp, athlete));
CREATE TABLE IF NOT EXISTS session (id INTEGER PRIMARY KEY, athlete INTEGER, day TEXT, kind TEXT, minutes REAL, rpe REAL, load REAL,
  pain REAL, readiness REAL, phase TEXT, notes TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, athlete INTEGER, day TEXT, metrics TEXT, notes TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS injury (id INTEGER PRIMARY KEY, athlete INTEGER, day TEXT, region TEXT, condition TEXT, severity TEXT,
  status TEXT, return_day TEXT, notes TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS override (id INTEGER PRIMARY KEY, athlete INTEGER, comp TEXT, field TEXT, value TEXT, reason TEXT,
  active INTEGER DEFAULT 1, created TEXT);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, ts TEXT, athlete INTEGER, action TEXT, detail TEXT, reason TEXT);
CREATE TABLE IF NOT EXISTS staff (id INTEGER PRIMARY KEY, name TEXT, role TEXT, notes TEXT, active INTEGER DEFAULT 1, created TEXT);
CREATE TABLE IF NOT EXISTS care (athlete INTEGER, staff INTEGER, lead INTEGER DEFAULT 0, PRIMARY KEY (athlete, staff));
CREATE TABLE IF NOT EXISTS signoff (id INTEGER PRIMARY KEY, athlete INTEGER, phase TEXT, staff INTEGER, verdict TEXT, note TEXT, ts TEXT);
CREATE TABLE IF NOT EXISTS phase_event (id INTEGER PRIMARY KEY, athlete INTEGER, ts TEXT, from_phase TEXT, to_phase TEXT, direction TEXT, mode TEXT,
  modifications TEXT, gate TEXT, against INTEGER, reason TEXT);
CREATE TABLE IF NOT EXISTS assignment (id INTEGER PRIMARY KEY, athlete INTEGER, kind TEXT, ref TEXT, equipment TEXT, level TEXT, start_day TEXT,
  weekdays TEXT, notes TEXT, reason TEXT, active INTEGER DEFAULT 1, created TEXT);
"""


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


class _Con:  # commit on success, always close (sqlite3's own context manager does not close)
    def __enter__(self):
        DB.parent.mkdir(parents=True, exist_ok=True)
        self.c = sqlite3.connect(DB, check_same_thread=False, timeout=15)
        self.c.row_factory = sqlite3.Row
        self.c.executescript(SCHEMA)
        for t, col, typ in (("athlete", "auto_progress", "INTEGER DEFAULT 0"), ("athlete", "required_roles", "TEXT DEFAULT ''"), ("audit", "by_staff", "INTEGER"), ("phase_event", "by_staff", "INTEGER")):
            try:
                self.c.execute(f"ALTER TABLE {t} ADD COLUMN {col} {typ}")
            except sqlite3.OperationalError:
                pass  # already there
        return self.c

    def __exit__(self, et, ev, tb):
        try:
            if et is None:
                self.c.commit()
        finally:
            self.c.close()


def _con():
    return _Con()


ACTOR = {"id": None}  # staff member acting for the current request (set by handle_post from the body's "by")


def _audit(c, athlete, action, detail, reason=""):
    c.execute("INSERT INTO audit (ts, athlete, action, detail, reason, by_staff) VALUES (?,?,?,?,?,?)", (_now(), athlete, action, json.dumps(detail, ensure_ascii=False), reason or "", ACTOR["id"]))


def _seed(c):
    """First use: the owner's existing profile becomes athlete #1 (nothing else is invented)."""
    if c.execute("SELECT count(*) FROM athlete").fetchone()[0]:
        return
    from anatomy_lab import training_api as TA
    p = TA.profile()
    if not p:
        return
    idn = p.get("identity", {})
    c.execute("INSERT INTO athlete (name, sport, position, level, status, condition, injury_date, phase_manual, phase_start, body_mass, height, age, sex, notes, profile, created, updated) "
              "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
              (idn.get("Athlete name") or "Athlete 1", (p.get("planner") or {}).get("sport") or "General / Non-sport", idn.get("Sport / position", ""),
               "Professional" if idn.get("Population type") == "Elite / drug-tested athlete" else "Amateur", "Injured" if idn.get("Injury / condition") else "Active",
               (p.get("planner") or {}).get("condition") or "", idn.get("Injury / surgery date", ""), p.get("manual_phase") or "", date.today().isoformat(),
               E.num(idn.get("Body mass (kg)")), E.num(idn.get("Height (cm)")), E.num(idn.get("Age (years)")), idn.get("Sex (M/F)", ""),
               f"Imported from the workbook profile (injury: {idn.get('Injury / condition', '')}).", json.dumps(p, ensure_ascii=False), _now(), _now()))
    _audit(c, 1, "create", {"source": "workbook profile.json"}, "first use: imported the existing profile")
    c.commit()


def _row(r):
    return dict(r) if r else None


# ---------------------------------------------------------------- reads
def athletes(include_archived=False):
    try:
        tick_all()  # live: apply any due automatic progressions before showing the roster
    except Exception as e:  # noqa: BLE001
        print("tick:", e)
    with _con() as c:
        _seed(c)
        rows = [dict(r) for r in c.execute("SELECT * FROM athlete" + ("" if include_archived else " WHERE archived=0") + " ORDER BY name")]
        mem = {}
        for g, a in c.execute("SELECT grp, athlete FROM member"):
            mem.setdefault(a, []).append(g)
        groups = [dict(r) for r in c.execute("SELECT * FROM grp ORDER BY name")]
    for r in rows:
        r["groups"] = mem.get(r["id"], [])
        r.pop("profile", None)
        r["summary"] = summary(r["id"])
    return {"athletes": rows, "groups": groups, "levels": LEVELS, "statuses": STATUSES}


def athlete(aid: int):
    with _con() as c:
        _seed(c)
        a = _row(c.execute("SELECT * FROM athlete WHERE id=?", (aid,)).fetchone())
        if not a:
            return {"error": "not found"}
        a["profile"] = json.loads(a["profile"] or "{}")
        a["groups"] = [g for (g,) in c.execute("SELECT grp FROM member WHERE athlete=?", (aid,))]
        a["sessions"] = [dict(r) for r in c.execute("SELECT * FROM session WHERE athlete=? ORDER BY day DESC, id DESC LIMIT 400", (aid,))]
        a["tests"] = [{**dict(r), "metrics": json.loads(r["metrics"] or "{}")} for r in c.execute("SELECT * FROM test WHERE athlete=? ORDER BY day DESC, id DESC", (aid,))]
        a["injuries"] = [dict(r) for r in c.execute("SELECT * FROM injury WHERE athlete=? ORDER BY day DESC, id DESC", (aid,))]
        a["overrides"] = [dict(r) for r in c.execute("SELECT * FROM override WHERE athlete=? ORDER BY active DESC, id DESC", (aid,))]
        a["audit"] = [{**dict(r), "detail": json.loads(r["detail"] or "{}")} for r in c.execute("SELECT * FROM audit WHERE athlete=? ORDER BY id DESC LIMIT 300", (aid,))]
    a["monitor"] = monitor(aid)
    a["plan"] = plan(aid)
    a["programs"] = programs(aid)
    a["suggestions"] = suggestions(aid)
    a["justify"] = justify(aid)
    a["updates"] = updates(aid)
    a["care"] = care_team(aid)
    a["perspectives"] = perspectives(aid)
    return a


def audit_all(limit=500):
    with _con() as c:
        names = {i: n for i, n in c.execute("SELECT id, name FROM athlete")}
        st = {i: f"{n} ({r})" for i, n, r in c.execute("SELECT id, name, role FROM staff")}
        return [{**dict(r), "detail": json.loads(r["detail"] or "{}"), "name": names.get(r["athlete"], ""), "by": st.get(r["by_staff"], "")} for r in c.execute("SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,))]


# ---------------------------------------------------------------- monitoring
def _daily(aid, days=56):
    end = date.today(); start = end - timedelta(days=days - 1)
    with _con() as c:
        rows = c.execute("SELECT day, sum(load), max(pain), avg(readiness), sum(minutes) FROM session WHERE athlete=? AND day>=? GROUP BY day", (aid, start.isoformat())).fetchall()
    by = {r[0]: r for r in rows}
    out = []
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat(); r = by.get(d)
        out.append({"day": d, "load": r[1] or 0 if r else 0, "pain": r[2] if r else None, "readiness": r[3] if r else None, "minutes": r[4] or 0 if r else 0})
    return out


def monitor(aid):
    D = _daily(aid, 56)
    series = []
    for i in range(27, len(D)):
        acute = sum(x["load"] for x in D[i - 6:i + 1]); chronic = sum(x["load"] for x in D[i - 27:i + 1]) / 4
        wk = [x["load"] for x in D[i - 6:i + 1]]; mean = sum(wk) / 7; sd = math.sqrt(sum((x - mean) ** 2 for x in wk) / 7)
        mono = mean / sd if sd > 0 else None
        series.append({"day": D[i]["day"], "acute": acute, "chronic": round(chronic, 1), "acwr": round(acute / chronic, 2) if chronic > 0 else None,
                       "monotony": round(mono, 2) if mono else None, "strain": round(acute * mono) if mono else None})
    last = series[-1] if series else {}
    # personal tolerance: week-on-week load increases and whether pain > 3 followed within 3 days
    weeks = []
    for i in range(13, len(D), 7):
        w0, w1 = sum(x["load"] for x in D[i - 13:i - 6]), sum(x["load"] for x in D[i - 6:i + 1])
        after = [x["pain"] for x in D[i + 1:i + 4] if x["pain"] is not None]
        if w0 > 0:
            weeks.append({"week_end": D[i]["day"], "change_pct": round(100 * (w1 - w0) / w0), "pain_after": max(after) if after else None})
    safe = [w["change_pct"] for w in weeks if w["pain_after"] is not None and w["pain_after"] <= 3 and w["change_pct"] > 0]
    flare = [w["change_pct"] for w in weeks if w["pain_after"] is not None and w["pain_after"] > 3]
    tol = {"n_weeks": len(weeks), "largest_ok_increase_pct": max(safe) if safe else None, "smallest_flare_increase_pct": min(flare) if flare else None, "weeks": weeks}
    flags = []
    if last.get("acwr") and last["acwr"] > 1.5:
        flags.append(f"7-day load is {last['acwr']}× the 28-day weekly average (above 1.5)")
    if last.get("monotony") and last["monotony"] > 2:
        flags.append(f"monotony {last['monotony']} (> 2: little day-to-day variation)")
    recent = [x for x in D[-3:] if x["pain"] is not None]
    if recent and max(x["pain"] for x in recent) > 3:
        flags.append(f"pain {max(x['pain'] for x in recent):g}/10 in the last 3 days (> 3)")
    rd = [x["readiness"] for x in D[-3:] if x["readiness"] is not None]
    if rd and min(rd) < 55:
        flags.append(f"readiness {min(rd):.0f} in the last 3 days (< 55)")
    if tol["largest_ok_increase_pct"] is not None and weeks and weeks[-1]["change_pct"] > tol["largest_ok_increase_pct"]:
        flags.append(f"this week's load rose {weeks[-1]['change_pct']}%, more than this athlete's largest pain-free rise so far ({tol['largest_ok_increase_pct']}%)")
    return {"daily": D, "series": series, "last": last, "tolerance": tol, "flags": flags,
            "method": "load = minutes × session RPE; acute = 7-day sum; chronic = 28-day mean weekly load; monotony = mean / SD of 7 daily loads; strain = weekly load × monotony. Trends for discussion, not injury prediction."}


def summary(aid):
    m = monitor(aid); last = m["last"]
    with _con() as c:
        s = c.execute("SELECT day, readiness, pain FROM session WHERE athlete=? ORDER BY day DESC, id DESC LIMIT 1", (aid,)).fetchone()
        n = c.execute("SELECT count(*) FROM session WHERE athlete=?", (aid,)).fetchone()[0]
        inj = c.execute("SELECT count(*) FROM injury WHERE athlete=? AND status!='Resolved'", (aid,)).fetchone()[0]
    try:
        ph = plan(aid, light=True)
    except Exception:  # noqa: BLE001
        ph = {}
    try:
        progs = [{"title": p["title"], "scheduled": p.get("scheduled"), "level": p.get("level"), "block": p.get("block"), "kind": p["kind"]} for p in programs(aid)]
    except Exception:  # noqa: BLE001
        progs = []
    try:
        up = updates(aid, 6)
    except Exception:  # noqa: BLE001
        up = []
    return {"updates": up[:3], "mode": (last_event(aid) or {}).get("mode") or "Standard", "programs": progs, "sessions": n, "last_day": s["day"] if s else None, "last_readiness": s["readiness"] if s else None, "last_pain": s["pain"] if s else None,
            "acwr": last.get("acwr"), "week_load": last.get("acute"), "monotony": last.get("monotony"), "open_injuries": inj, "flags": m["flags"],
            "phase": ph.get("phase"), "phase_name": ph.get("phase_name"), "auto_phase": ph.get("auto_phase")}


# ---------------------------------------------------------------- plan with reasoning
def plan(aid, day: str | None = None, light=False):
    from anatomy_lab import training_api as TA
    with _con() as c:
        a = _row(c.execute("SELECT * FROM athlete WHERE id=?", (aid,)).fetchone())
        if not a:
            return {"error": "not found"}
        t = c.execute("SELECT metrics, day FROM test WHERE athlete=? ORDER BY day DESC, id DESC LIMIT 1", (aid,)).fetchone()
        s = c.execute("SELECT readiness, day FROM session WHERE athlete=? AND readiness IS NOT NULL ORDER BY day DESC, id DESC LIMIT 1", (aid,)).fetchone()
        ov = [dict(r) for r in c.execute("SELECT * FROM override WHERE athlete=? AND active=1", (aid,))]
    prof = json.loads(a["profile"] or "{}")
    metrics = json.loads(t["metrics"]) if t else {}  # only tests logged in the app count; workbook values are history
    eng = TA.engine()
    vals = {code: E.metric_value(code, x.get("raw1"), x.get("raw2"), x.get("manual")) for code, x in metrics.items()}
    g = E.gates(TA._dicts("Phase_Gates"), vals)
    manual = (a["phase_manual"] or "").strip()
    phase = manual if manual in eng.phase_ix else (g["auto_phase"] or "1")
    why = []
    why.append(f"Tests ({'latest ' + t['day'] if t else 'none logged yet in the app, so only the entry phases pass (workbook test values are kept as history)'}): gates pass in order while every threshold is met → the tests allow up to {g['auto_phase']} (a ceiling, not a jump)." +
               (f" The next gate needs {g['unmet_next']}." if g["unmet_next"] else ""))
    why.append(f"Current phase: {phase} ({eng.phases[eng.phase_ix[phase]]['Phase Name']}); it moves one phase at a time by auto-progress or a phase decision (see history)" +
               (f"; the tests would allow {g['auto_phase']}." if g["auto_phase"] != phase else "."))
    if light:
        return {"phase": phase, "phase_name": eng.phases[eng.phase_ix[phase]]["Phase Name"], "auto_phase": g["auto_phase"]}
    cond = a["condition"] if a["condition"] in eng.cond else None
    today = date.fromisoformat(day) if day else date.today()
    start = date.fromisoformat(a["phase_start"]) if a["phase_start"] else today
    d_in = max(1, (today - start).days + 1)
    rd = s["readiness"] if s else None
    rdx = {"score": None, "final": 1} if rd is None else {"score": rd, "final": 1 if rd >= 75 else 0.8 if rd >= 55 else 0.5}
    why.append(f"Day {d_in} in phase {phase} (phase started {start.isoformat()}).")
    why.append(f"Readiness {('%.0f' % rd) if rd is not None else 'not logged'} → volume × {rdx['final']} ({'≥ 75 green' if rd is None or rd >= 75 else '55–74 amber' if rd >= 55 else '< 55 red'})." + (" Below 55 the planner switches each component to Alt A (easier, same goal)." if rd is not None and rd < 55 else ""))
    ev = last_event(aid)
    mode = ev["mode"] if ev and ev["to_phase"] == phase else "Standard"
    if ev and ev["to_phase"] == phase:
        why.append(f"Phase decision {ev['ts'][:10]}: {ev['direction']} {ev['from_phase']} → {ev['to_phase']} ({mode})" + (" — against the gates" if ev["against"] else "") +
                   f". Reason: {ev['reason']}." + (f" Modifications: {ev['modifications']}." if ev["modifications"] else ""))
    if mode == "Modified":
        rdx = {**rdx, "final": round(rdx["final"] * MODIFIED_VOLUME, 2)}
        why.append(f"Modified mode: volume × {MODIFIED_VOLUME} on top of readiness → × {rdx['final']} (sets, contacts and conditioning minutes scale with it).")
    out = {"athlete": a["name"], "phase": phase, "auto_phase": g["auto_phase"], "gates": g, "values": vals, "day_in_phase": d_in, "readiness": rd, "why": why, "overrides": ov,
           "mode": mode, "modifications": ev["modifications"] if ev and ev["to_phase"] == phase else "", "test_day": t["day"] if t else None}
    if mode == "Court training":
        lvl = E.SPORT_LEVEL[eng.phase_ix[phase]] or 1
        sd = [r for r in TA._dicts("Sport_Drills") if r["Sport"] == (a["sport"] or "General / Non-sport")]
        wu = TA.table("Warmup_10min", "", {"Sport": a["sport"] or "General / Non-sport", "Phase": phase}, 0, 3)
        out["court"] = {"level": lvl, "ladder": sd, "today": next((r for r in sd if str(r["Level"]) == str(lvl)), None),
                        "warmup": dict(zip(wu["cols"], wu["rows"][0][1:])) if wu["rows"] else None}
        why.append(f"Court training mode: sport drill level L{lvl} for {a['sport']} (phase {phase} maps to L{E.SPORT_LEVEL[eng.phase_ix[phase]]}; L1 is the floor in this mode) and the 10-minute warm-up for this phase are added.")
    if cond:
        choices = {o["comp"]: o["value"] for o in ov if o["field"] == "option"}
        dp = eng.day_plan(cond, phase, d_in, a["sport"] or "General / Non-sport", rd if rd is not None else 76, rdx["final"], choices)
        why.append(f"Condition {cond}: phase lasts {dp['days']} days here (Phase_Dose base days × healing factor {eng.cond[cond]['Healing factor']}); day {dp['day']} → {dp['undulation']}, progress {round(100 * dp['progress'])}% through the phase's start→end doses.")
        for r in dp["rows"]:
            o = [x for x in ov if x["comp"] == r["comp"]]
            r["override"] = o
            r["why"] = (f"Option {r['option']}" + (" (override: " + "; ".join(f"{x['field']} = {x['value']} — {x['reason']}" for x in o) + ")" if o else " (readiness rule)" if r["option"] == "A" and rd is not None and rd < 55 else " (primary)")
                        + f"; dose rule for {r['comp']} with day {dp['day']}/{dp['days']} and {dp['undulation']}.")
            for x in o:
                if x["field"] == "exercise":
                    r["today"] = f"{x['value']}  (override)"
                if x["field"] == "dose":
                    r["dose"] = f"{x['value']}  (override)"
        out["day_plan"] = dp
    else:
        why.append("No condition set: add one to get a condition pathway; the session builder below still follows the phase rules.")
    out["progress"] = progression(aid, a, phase, d_in, cond, g, eng)
    why.append(out["progress"]["text"])
    out["session"] = TA.session({"phase": phase, "volume": rdx["final"], "n": 8, "seed": (prof.get("planner") or {}).get("seed", 7919)})
    return out


def dashboard(group: int | None = None):
    A = athletes()["athletes"]
    if group:
        A = [a for a in A if group in a["groups"]]
    by_status = {s: [a["id"] for a in A if a["status"] == s] for s in STATUSES}
    flagged = [{"id": a["id"], "name": a["name"], "flags": a["summary"]["flags"]} for a in A if a["summary"]["flags"]]
    phases = {}
    for a in A:
        phases.setdefault(a["summary"].get("phase") or "—", []).append(a["name"])
    tot = sum(a["summary"]["week_load"] or 0 for a in A)
    return {"n": len(A), "by_status": by_status, "flagged": flagged, "phases": phases, "week_load_total": tot,
            "levels": {lv: sum(1 for a in A if a["level"] == lv) for lv in LEVELS}, "athletes": A}


# ---------------------------------------------------------------- writes (all audited)
FIELDS = ["name", "sport", "position", "level", "status", "condition", "injury_date", "phase_manual", "phase_start", "body_mass", "height", "age", "sex", "notes"]


def save_athlete(b):
    reason = (b.get("reason") or "").strip()
    with _con() as c:
        _seed(c)
        if b.get("id"):
            old = _row(c.execute("SELECT * FROM athlete WHERE id=?", (b["id"],)).fetchone())
            if not old:
                raise ValueError("not found")
            ch = {k: [old[k], b[k]] for k in FIELDS if k in b and str(b[k] or "") != str(old[k] or "")}
            if "phase_manual" in ch and not reason:
                raise ValueError("a reason is required to change the phase by hand")
            if "phase_manual" in ch and "phase_start" not in b:
                b["phase_start"] = date.today().isoformat(); ch["phase_start"] = [old["phase_start"], b["phase_start"]]
            if not ch:
                return {"ok": True, "id": b["id"], "changed": {}}
            c.execute(f"UPDATE athlete SET {', '.join(f'{k}=?' for k in ch)}, updated=? WHERE id=?", [b[k] for k in ch] + [_now(), b["id"]])
            _audit(c, b["id"], "edit", ch, reason)
            aid = b["id"]
        else:
            if not (b.get("name") or "").strip():
                raise ValueError("name required")
            b["phase_manual"] = b.get("phase_manual") or "1"  # every athlete starts at phase 1 and progresses from there
            cur = c.execute(f"INSERT INTO athlete ({', '.join(FIELDS)}, created, updated) VALUES ({', '.join('?' * len(FIELDS))}, ?, ?)",
                            [b.get(k) for k in FIELDS] + [_now(), _now()])
            aid = cur.lastrowid
            if not b.get("phase_start"):
                c.execute("UPDATE athlete SET phase_start=? WHERE id=?", (date.today().isoformat(), aid))
            _audit(c, aid, "create", {k: b.get(k) for k in FIELDS if b.get(k)}, reason)
        if "groups" in b:
            c.execute("DELETE FROM member WHERE athlete=?", (aid,))
            for gid in b["groups"]:
                c.execute("INSERT OR IGNORE INTO member VALUES (?,?)", (int(gid), aid))
        c.commit()
    return {"ok": True, "id": aid}


def archive(b):
    reason = (b.get("reason") or "").strip()
    if not reason:
        raise ValueError("a reason is required to archive an athlete")
    with _con() as c:
        c.execute("UPDATE athlete SET archived=1, updated=? WHERE id=?", (_now(), b["id"]))
        _audit(c, b["id"], "archive", {}, reason); c.commit()
    return {"ok": True}


def members(b):
    """Move / add / remove athletes between groups (bulk). action: move (from -> to), add (to), remove (from)."""
    act, ids = b.get("action"), [int(x) for x in (b.get("athletes") or [])]
    src, dst = b.get("from"), b.get("to")
    if not ids or act not in ("move", "add", "remove"):
        raise ValueError("athletes and action (move, add, remove) required")
    with _con() as c:
        gname = {g: n for g, n in c.execute("SELECT id, name FROM grp")}
        for aid in ids:
            if act in ("move", "remove") and src:
                c.execute("DELETE FROM member WHERE grp=? AND athlete=?", (int(src), aid))
            if act == "move" and not src:
                c.execute("DELETE FROM member WHERE athlete=?", (aid,))
            if act in ("move", "add"):
                if not dst:
                    raise ValueError("target group required")
                c.execute("INSERT OR IGNORE INTO member VALUES (?,?)", (int(dst), aid))
            _audit(c, aid, f"group {act}", {"from": gname.get(int(src)) if src else ("all groups" if act == "move" else None), "to": gname.get(int(dst)) if dst else None}, b.get("reason", ""))
    return {"ok": True, "n": len(ids)}


def delete_athlete(b):
    """Permanent delete: the athlete and every record about them. One audit line is kept (name, counts, reason)."""
    reason = (b.get("reason") or "").strip()
    if not reason:
        raise ValueError("a reason is required to delete an athlete")
    aid = int(b["id"])
    with _con() as c:
        a = _row(c.execute("SELECT name FROM athlete WHERE id=?", (aid,)).fetchone())
        if not a:
            raise ValueError("not found")
        if (b.get("confirm") or "").strip() != a["name"]:
            raise ValueError("type the athlete's name exactly to confirm")
        counts = {}
        for t in ("session", "test", "injury", "override", "assignment", "phase_event"):
            counts[t] = c.execute(f"DELETE FROM {t} WHERE athlete=?", (aid,)).rowcount
        counts["groups"] = c.execute("DELETE FROM member WHERE athlete=?", (aid,)).rowcount
        c.execute("DELETE FROM athlete WHERE id=?", (aid,))
        c.execute("DELETE FROM audit WHERE athlete=?", (aid,))
        _audit(c, None, "athlete deleted", {"id": aid, "name": a["name"], "records_removed": counts}, reason)
    return {"ok": True, "removed": counts}


def restore(b):
    with _con() as c:
        c.execute("UPDATE athlete SET archived=0, updated=? WHERE id=?", (_now(), b["id"]))
        _audit(c, b["id"], "restore", {}, b.get("reason", ""))
    return {"ok": True}


def save_group(b):
    with _con() as c:
        if b.get("delete"):
            c.execute("DELETE FROM grp WHERE id=?", (b["id"],)); c.execute("DELETE FROM member WHERE grp=?", (b["id"],))
            _audit(c, None, "group delete", {"id": b["id"]}, b.get("reason", ""))
        elif b.get("id"):
            c.execute("UPDATE grp SET name=?, kind=?, notes=? WHERE id=?", (b["name"], b.get("kind", ""), b.get("notes", ""), b["id"]))
            _audit(c, None, "group edit", b, b.get("reason", ""))
        else:
            c.execute("INSERT INTO grp (name, kind, notes) VALUES (?,?,?)", (b["name"], b.get("kind", ""), b.get("notes", "")))
            _audit(c, None, "group create", b, b.get("reason", ""))
        c.commit()
    return {"ok": True}


def log_session(b):
    mins, rpe = E.num(b.get("minutes"), 0), E.num(b.get("rpe"), 0)
    if not (0 <= rpe <= 10) or mins < 0:
        raise ValueError("RPE 0-10, minutes >= 0")
    with _con() as c:
        ph = plan(int(b["athlete"]), light=True).get("phase")
        cur = c.execute("INSERT INTO session (athlete, day, kind, minutes, rpe, load, pain, readiness, phase, notes, created) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                        (b["athlete"], b.get("day") or date.today().isoformat(), b.get("kind", ""), mins, rpe, mins * rpe, E.num(b.get("pain")), E.num(b.get("readiness")), ph, b.get("notes", ""), _now()))
        _audit(c, b["athlete"], "session", {"id": cur.lastrowid, "day": b.get("day"), "load": mins * rpe, "pain": b.get("pain"), "readiness": b.get("readiness")}, "")
        c.commit()
    return {"ok": True}


def log_test(b):
    m = b.get("metrics") or {}
    if not isinstance(m, dict):
        raise ValueError("metrics")
    with _con() as c:
        before = plan(int(b["athlete"]), light=True)
        c.execute("INSERT INTO test (athlete, day, metrics, notes, created) VALUES (?,?,?,?,?)", (b["athlete"], b.get("day") or date.today().isoformat(), json.dumps(m), b.get("notes", ""), _now()))
        c.commit()
        after = plan(int(b["athlete"]), light=True)
        _audit(c, b["athlete"], "test", {"day": b.get("day"), "auto_phase_before": before.get("auto_phase"), "auto_phase_after": after.get("auto_phase")}, "")
        c.commit()
    return {"ok": True, "auto_phase": after.get("auto_phase"), "before": before.get("auto_phase")}


def log_injury(b):
    with _con() as c:
        if b.get("id"):
            c.execute("UPDATE injury SET status=?, return_day=?, notes=? WHERE id=?", (b.get("status"), b.get("return_day"), b.get("notes", ""), b["id"]))
            _audit(c, b["athlete"], "injury update", b, b.get("reason", ""))
        else:
            c.execute("INSERT INTO injury (athlete, day, region, condition, severity, status, return_day, notes, created) VALUES (?,?,?,?,?,?,?,?,?)",
                      (b["athlete"], b.get("day") or date.today().isoformat(), b.get("region", ""), b.get("condition", ""), b.get("severity", ""), b.get("status", "Open"), b.get("return_day"), b.get("notes", ""), _now()))
            _audit(c, b["athlete"], "injury", b, b.get("reason", ""))
            if b.get("set_status", True):
                c.execute("UPDATE athlete SET status='Injured', updated=? WHERE id=?", (_now(), b["athlete"]))
        c.commit()
    return {"ok": True}


def set_override(b):
    reason = (b.get("reason") or "").strip()
    with _con() as c:
        if b.get("id"):
            c.execute("UPDATE override SET active=0 WHERE id=?", (b["id"],))
            _audit(c, b["athlete"], "override off", {"id": b["id"]}, reason)
        else:
            if not reason:
                raise ValueError("a reason is required for a plan override")
            if b.get("field") not in ("option", "exercise", "dose"):
                raise ValueError("field must be option, exercise or dose")
            c.execute("INSERT INTO override (athlete, comp, field, value, reason, active, created) VALUES (?,?,?,?,?,1,?)", (b["athlete"], b["comp"], b["field"], b["value"], reason, _now()))
            _audit(c, b["athlete"], "override", {k: b.get(k) for k in ("comp", "field", "value")}, reason)
        c.commit()
    return {"ok": True}


# ---------------------------------------------------------------- live progression, care team, perspectives, sign-offs
ROLES = ["Physiotherapist", "Sports physician", "Orthopaedic surgeon", "S&C coach", "Sport coach", "Athletic trainer", "Dietitian / nutrition", "Psychologist", "Other"]


def _phase_days(eng, cond, phase):
    if cond and cond in eng.cond:
        return max(1, int(E.xround(E.num(eng.dose[phase]["Base days"], 1) * E.num(eng.cond[cond]["Healing factor"], 1.0))))
    return max(1, int(E.num(eng.dose[phase]["Base days"], 1)))


def signoffs(aid, phase):
    with _con() as c:
        rows = [dict(r) for r in c.execute("SELECT s.*, st.name, st.role FROM signoff s LEFT JOIN staff st ON st.id = s.staff WHERE s.athlete=? AND s.phase=? ORDER BY s.id DESC", (aid, phase))]
    latest = {}
    for r in rows:
        latest.setdefault(r["staff"], r)
    return list(latest.values())


def progression(aid, a, phase, d_in, cond, g, eng):
    order = [p["Code"] for p in eng.phases]; i = order.index(phase)
    nxt = order[i + 1] if i + 1 < len(order) else None
    days = _phase_days(eng, cond, phase)
    time_ok = d_in >= days
    gate_rows = {r["phase"]: r for r in g["rows"]}
    gate_ok = bool(nxt) and gate_rows.get(nxt, {}).get("met", False) and all(gate_rows[x]["met"] for x in order[: i + 2] if x in gate_rows)
    unmet = gate_rows.get(nxt, {}).get("unmet", []) if nxt else []
    req = [r for r in (a.get("required_roles") or "").split(",") if r]
    so = signoffs(aid, phase)
    cleared = {x["role"] for x in so if x["verdict"] == "clear"}
    concerns = [x for x in so if x["verdict"] in ("hold", "concern")]
    roles_ok = all(r in cleared for r in req) and not concerns
    ready = bool(nxt) and time_ok and gate_ok and roles_ok
    parts = [f"time {d_in}/{days} days {'✔' if time_ok else '✖'}", f"gate {nxt}: {'✔' if gate_ok else '✖ ' + ' '.join(unmet)}" if nxt else "final phase",
             f"clearances {', '.join(req)}: {'✔' if roles_ok else '✖'}" if req else ("hold / concern raised ✖" if concerns else "no clearances required")]
    text = (f"Progression to {nxt}: READY ({'; '.join(parts)})." if ready else f"Progression to {nxt or '—'}: holding ({'; '.join(parts)}).") + (" Auto-progress is on." if a.get("auto_progress") else "")
    return {"next": nxt, "days": days, "day": d_in, "time_ok": time_ok, "gate_ok": gate_ok, "unmet": unmet, "required": req, "signoffs": so, "roles_ok": roles_ok, "ready": ready, "text": text, "auto": bool(a.get("auto_progress"))}


def tick(aid):
    """Live progression: with auto-progress on, advance one phase when time, gates and clearances are all met."""
    with _con() as c:
        a = _row(c.execute("SELECT * FROM athlete WHERE id=?", (aid,)).fetchone())
    if not a or not a.get("auto_progress") or a.get("archived"):
        return None
    p = plan(aid)
    pr = p.get("progress") or {}
    if pr.get("ready"):
        prev = ACTOR["id"]; ACTOR["id"] = None
        try:
            return move_phase({"athlete": aid, "direction": "next", "mode": p.get("mode") or "Standard", "modifications": p.get("modifications", ""),
                               "reason": f"auto-progress: {pr['text']}"})
        finally:
            ACTOR["id"] = prev
    return None


def staff_list():
    with _con() as c:
        st = [dict(r) for r in c.execute("SELECT * FROM staff ORDER BY active DESC, role, name")]
        care = [dict(r) for r in c.execute("SELECT * FROM care")]
    for x in st:
        x["athletes"] = [r["athlete"] for r in care if r["staff"] == x["id"]]
    return {"staff": st, "roles": ROLES}


def save_staff(b):
    with _con() as c:
        if b.get("id"):
            c.execute("UPDATE staff SET name=?, role=?, notes=?, active=? WHERE id=?", (b["name"], b["role"], b.get("notes", ""), int(b.get("active", 1)), b["id"]))
            _audit(c, None, "staff edit", b, b.get("reason", ""))
        else:
            if not (b.get("name") or "").strip() or b.get("role") not in ROLES:
                raise ValueError("name and a role from the list are required")
            c.execute("INSERT INTO staff (name, role, notes, active, created) VALUES (?,?,?,1,?)", (b["name"].strip(), b["role"], b.get("notes", ""), _now()))
            _audit(c, None, "staff create", {"name": b["name"], "role": b["role"]}, b.get("reason", ""))
    return {"ok": True}


def set_care(b):
    aid, ids = int(b["athlete"]), [int(x) for x in b.get("staff", [])]
    with _con() as c:
        c.execute("DELETE FROM care WHERE athlete=?", (aid,))
        for sid in ids:
            c.execute("INSERT INTO care VALUES (?,?,?)", (aid, sid, int(sid == b.get("lead"))))
        _audit(c, aid, "care team", {"staff": ids, "lead": b.get("lead")}, b.get("reason", ""))
    return {"ok": True}


def set_settings(b):
    aid = int(b["athlete"])
    roles = [r for r in b.get("required_roles", []) if r in ROLES]
    with _con() as c:
        c.execute("UPDATE athlete SET auto_progress=?, required_roles=?, updated=? WHERE id=?", (int(bool(b.get("auto_progress"))), ",".join(roles), _now(), aid))
        _audit(c, aid, "progression settings", {"auto_progress": bool(b.get("auto_progress")), "required_roles": roles}, b.get("reason", ""))
    return {"ok": True}


def sign(b):
    if not ACTOR["id"]:
        raise ValueError("choose who you are ('Acting as') before signing off")
    if b.get("verdict") not in ("clear", "hold", "concern"):
        raise ValueError("verdict: clear, hold or concern")
    with _con() as c:
        c.execute("INSERT INTO signoff (athlete, phase, staff, verdict, note, ts) VALUES (?,?,?,?,?,?)", (b["athlete"], b["phase"], ACTOR["id"], b["verdict"], b.get("note", ""), _now()))
        _audit(c, b["athlete"], f"sign-off {b['verdict']}", {"phase": b["phase"], "note": b.get("note", "")}, b.get("note", ""))
    return {"ok": True}


def care_team(aid):
    with _con() as c:
        return [dict(r) for r in c.execute("SELECT st.*, care.lead FROM care JOIN staff st ON st.id = care.staff WHERE care.athlete=? ORDER BY care.lead DESC, st.role", (aid,))]


def perspectives(aid, phase=None):
    """What each discipline should focus on in a phase, assembled from the workbook's own columns (sources named)."""
    TA = _tables(); eng = TA.engine()
    with _con() as c:
        a = _row(c.execute("SELECT * FROM athlete WHERE id=?", (aid,)).fetchone())
    ph = phase or plan(aid, light=True)["phase"]
    P = eng.phases[eng.phase_ix[ph]]; D = eng.dose[ph]; acc = next((r for r in eng.acc_phase if str(r["Phase"]) == ph), {})
    cond = a["condition"] if a["condition"] in eng.cond else None
    comp = {k: eng.cp_row(cond, ph, k) or {} for k, _ in E.COMPONENTS} if cond else {}
    band = int(ph[0]); bg = "E" if band <= 2 else ("M" if band <= 4 else "L")
    recov = eng.acc_recovery.get(f"Heavy|{bg}", {})
    sd = eng.sport_drill.get(f"{a['sport'] or 'General / Non-sport'}|{E.SPORT_LEVEL[eng.phase_ix[ph]]}")
    tests = [t for t in TA._dicts("Testing_Protocols") if t["ID"] in str(P["Exit Tests (protocol IDs)"])]
    so = signoffs(aid, ph)
    def items(*pairs):
        return [{"k": k, "v": v} for k, v in pairs if v not in (None, "", "—")]
    roles = {
        "Physiotherapist": {"source": "Condition_Progression (physio justification, criteria, precautions), Phase_System, Testing_Protocols",
            "items": items(("Aim", P["Primary Aim"]), ("Criteria to progress", (comp.get("STR") or {}).get("Criteria to progress")), ("Precautions", (comp.get("STR") or {}).get("Condition precautions")),
                           *[(f"{lab} — why", (comp.get(k) or {}).get("Physiotherapy justification")) for k, lab in E.COMPONENTS if comp.get(k)],
                           ("Exit tests", "; ".join(f"{t['ID']} {t['Test']}: {t['Threshold / Norm']}" for t in tests)))},
        "Sports physician": {"source": "Phase_System (tissue state, regress if), Accelerator_Tree (biological floor), Conditions_Meta, condition precautions",
            "items": items(("Tissue / training state", P["Tissue / Training State"]), ("Biological floor (never skip)", acc.get("Biological floor (never skip)")), ("Regress if", P["Regress If"]),
                           ("Condition", f"{cond} · {eng.cond[cond]['Region']} · {eng.cond[cond]['Tissue']} · healing factor ×{eng.cond[cond]['Healing factor']}" if cond else None),
                           ("Precautions", (comp.get("KEY") or {}).get("Condition precautions")), ("Regress trigger", acc.get("✖ REGRESS trigger → option")))},
        "Orthopaedic surgeon": {"source": "Phase_System, Accelerator_Tree, Conditions_Meta",
            "items": items(("Tissue / training state", P["Tissue / Training State"]), ("Biological floor", acc.get("Biological floor (never skip)")), ("Typical phase duration", P["Typical Duration"]),
                           ("Time since injury / surgery", f"{(date.today() - date.fromisoformat(a['injury_date'])).days // 7} weeks (since {a['injury_date']})" if a.get("injury_date") else None))},
        "S&C coach": {"source": "Phase_System + Phase_Dose (dose), Condition_Progression (S&C justification), Accelerator_Tree",
            "items": items(("%1RM", P["%1RM Range"]), ("RPE", P["RPE Target"]), ("Sets × reps", f"{P['Sets (auto)']} × {P['Reps / Duration']}"), ("Tempo / rest", f"{P['Tempo']} / {P['Rest']}"),
                           ("Sessions per week", P["Sessions / Week"]), ("Weekly hard sets per muscle", P["Weekly Hard Sets per Muscle"]), ("Plyo contacts", P["Plyo Contacts / Session"]), ("Conditioning", P["Conditioning"]),
                           ("Loading model", f"{acc.get('Loading model', '')} · {acc.get('Weekly load rule', '')}"), ("Advance / fast-track if", acc.get("✔ ADVANCE / fast-track if…")),
                           *[(f"{lab} — S&C", (comp.get(k) or {}).get("S&C justification")) for k, lab in E.COMPONENTS if k in ("STR", "PWR", "CON") and comp.get(k)])},
        "Sport coach": {"source": "Sport_Drills (6-level ladder), Phase_Dose (sport minutes)",
            "items": items(("Sport drill level", f"L{E.SPORT_LEVEL[eng.phase_ix[ph]]}" + (f" — {sd['Level name']}: {sd['PRIMARY drill']}" if sd else " (no sport work yet)")),
                           ("Alternatives", f"A {sd['Alt A — easier, same goal']} · B {sd['Alt B — different set-up, same demand']} · C {sd['Alt C — variation / perceptual']}" if sd else None),
                           ("Sport minutes", f"{D['Sport min start']}→{D['Sport min end']} min · {D['Sport intensity']}"), ("Why", sd["S&C justification"] if sd else None))},
        "Athletic trainer": {"source": "Accelerator_Tree (session tree, recovery set-ups)",
            "items": items(("Session order", acc.get("Combined session tree ({KEY} {STR} {PWR} {ACC} {GAME} {REC} auto-filled)")), ("Recovery set-up options", recov.get("Recovery set-up options")),
                           ("Readiness check", recov.get("Readiness check next morning")))},
        "Dietitian / nutrition": {"source": "Accelerator_Tree (sleep & fuel), Phase_System (mobility & recovery)",
            "items": items(("Sleep & fuel target", recov.get("Sleep & fuel target")), ("Recovery focus", P["Mobility & Recovery"]), ("Caution", recov.get("Caution")))},
        "Psychologist": {"source": "Phase_Gates (PSY metric), Testing_Protocols, Accelerator_Tree methods",
            "items": items(("Psychological readiness gate", "; ".join(f"{r['Phase']} PSY >= {r.get('PSY >=')}" for r in TA._dicts("Phase_Gates") if r.get("PSY >=")) or None),
                           ("Methods in this stage", "; ".join(f"{m['Method']} ({m['Dose']})" for m in eng.acc_methods if E.num(m["Min band"], 0) <= band <= E.num(m["Max band"], 0) and re_search(m["Method"]))))},
    }
    team = care_team(aid)
    return {"phase": ph, "phase_name": P["Phase Name"], "roles": roles, "team": team, "signoffs": so, "required": [r for r in (a.get("required_roles") or "").split(",") if r]}


def re_search(t):
    import re as _re
    return bool(_re.search(r"graded|imagery|confidence|fear|autonomy|self-paced|mindful|dual-task", t, _re.I))


def tick_all():
    with _con() as c:
        ids = [r[0] for r in c.execute("SELECT id FROM athlete WHERE archived=0 AND auto_progress=1")]
    return [x for x in (tick(i) for i in ids) if x]


def start_loop():
    import threading
    def loop():
        while True:
            try:
                tick_all()
            except Exception as e:  # noqa: BLE001
                print("progression tick:", e)
            time.sleep(3600)
    threading.Thread(target=loop, daemon=True, name="ath-progress").start()


# ---------------------------------------------------------------- phase decisions: justification, advance / shift back, history
MODES = ["Standard", "Modified", "Court training", "Reasoning program"]
MODIFIED_VOLUME = 0.8
_OPS = {"<=": lambda v, t: v <= t, ">=": lambda v, t: v >= t}


def last_event(aid):
    with _con() as c:
        r = c.execute("SELECT * FROM phase_event WHERE athlete=? ORDER BY id DESC LIMIT 1", (aid,)).fetchone()
    return dict(r) if r else None


def justify(aid):
    """Per phase and per metric: the athlete's value, the threshold, met or not, and where the values came from."""
    TA = _tables()
    with _con() as c:
        a = _row(c.execute("SELECT * FROM athlete WHERE id=?", (aid,)).fetchone())
        t = c.execute("SELECT metrics, day FROM test WHERE athlete=? ORDER BY day DESC, id DESC LIMIT 1", (aid,)).fetchone()
        evs = [dict(r) for r in c.execute("SELECT * FROM phase_event WHERE athlete=? ORDER BY id DESC", (aid,))]
    prof = json.loads(a["profile"] or "{}")
    metrics = json.loads(t["metrics"]) if t else {}
    hist = prof.get("metrics", {})
    names = {m["Code"]: m for m in TA._dicts("Phase_Metrics")}
    vals = {code: E.metric_value(code, x.get("raw1"), x.get("raw2"), x.get("manual")) for code, x in metrics.items()}
    rows, cum = [], True
    for g in TA._dicts("Phase_Gates"):
        items = []
        for k, th in g.items():
            m = __import__("re").match(r"^([A-Z]+) (<=|>=)$", k)
            if not m or th in ("", None):
                continue
            code, op = m.group(1), m.group(2); v = vals.get(code); thr = E.num(th)
            ok = v is not None and _OPS[op](v, thr)
            src = metrics.get(code, {})
            how = f"manual {src.get('manual')}" if src.get("manual") not in (None, "") else (f"{src.get('raw1')} / {src.get('raw2')} → {v}%" if src.get("raw1") not in (None, "") else "not tested")
            items.append({"code": code, "metric": names.get(code, {}).get("Metric", code), "op": op, "threshold": thr, "value": v, "met": ok, "how": how, "protocol": names.get(code, {}).get("Protocol", "")})
        met = all(i["met"] for i in items)
        cum = cum and met
        rows.append({"phase": g["Phase"], "name": g["Phase name"], "met": met, "passed": cum, "items": items,
                     "summary": ("entry phase: no thresholds" if not items else ("; ".join(f"{i['code']} {i['value'] if i['value'] is not None else '—'} {i['op']} {i['threshold']:g} {'✔' if i['met'] else '✖'}" for i in items)))})
    hv = {code: E.metric_value(code, x.get("raw1"), x.get("raw2"), x.get("manual")) for code, x in hist.items()}
    return {"source": f"tests logged {t['day']}" if t else "no tests logged in the app yet", "rows": rows, "events": evs, "modes": MODES,
            "history": {k: v for k, v in hv.items() if v is not None}}


def move_phase(b):
    TA = _tables(); eng = TA.engine(); order = [p["Code"] for p in eng.phases]
    aid = int(b["athlete"]); reason = (b.get("reason") or "").strip()
    if not reason:
        raise ValueError("a reason is required for a phase decision")
    mode = b.get("mode") or "Standard"
    if mode not in MODES:
        raise ValueError("mode")
    cur = plan(aid, light=True)["phase"]; i = order.index(cur)
    d = b.get("direction")
    if d == "next":
        to = order[min(i + 1, len(order) - 1)]
    elif d == "back":
        to = order[max(i - 1, 0)]
    elif d in ("to", "hold"):
        to = b.get("to") or cur
        if to not in order:
            raise ValueError("unknown phase")
    else:
        raise ValueError("direction must be next, back, to or hold")
    J = justify(aid)
    gate = next((r for r in J["rows"] if r["phase"] == to), None)
    unmet = [f"{x['code']} {x['value'] if x['value'] is not None else 'not tested'} (needs {x['op']} {x['threshold']:g})" for r in J["rows"][: order.index(to) + 1] for x in r["items"] if not x["met"]]
    against = order.index(to) > i and bool(unmet)
    direction = {"next": "advance", "back": "shift back", "to": "advance" if order.index(to) > i else "shift back" if order.index(to) < i else "hold", "hold": "hold"}[d]
    with _con() as c:
        c.execute("INSERT INTO phase_event (athlete, ts, from_phase, to_phase, direction, mode, modifications, gate, against, reason, by_staff) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                  (aid, _now(), cur, to, direction, mode, b.get("modifications", ""), json.dumps({"unmet_up_to_target": unmet, "target_gate": gate["summary"] if gate else ""}, ensure_ascii=False), int(against), reason, ACTOR["id"]))
        if to != cur or d == "hold":
            c.execute("UPDATE athlete SET phase_manual=?, phase_start=?, updated=? WHERE id=?", (to, date.today().isoformat() if to != cur else _row(c.execute("SELECT phase_start FROM athlete WHERE id=?", (aid,)).fetchone())["phase_start"], _now(), aid))
        _audit(c, aid, f"phase {direction}", {"from": cur, "to": to, "mode": mode, "modifications": b.get("modifications", ""), "against_gates": against, "unmet": unmet[:12]}, reason)
    return {"ok": True, "from": cur, "to": to, "direction": direction, "mode": mode, "against_gates": against, "unmet": unmet}


REHAB_CATS = {"Condition-specific", "Joint prehab", "Mobility", "Warm-up"}


def updates(aid, n=40):
    """What changed for this athlete, grouped: rehab plan, S&C, other."""
    TA = _tables(); cat = {p["ID"]: p["Category"] for p in TA._dicts("Program_Library")}
    with _con() as c:
        rows = [{**dict(r), "detail": json.loads(r["detail"] or "{}")} for r in c.execute("SELECT * FROM audit WHERE athlete=? ORDER BY id DESC LIMIT ?", (aid, n))]
    out = []
    for r in rows:
        act, d = r["action"], r["detail"]
        if act.startswith("phase") or act in ("injury", "injury update", "test") or (act == "edit" and any(k in d for k in ("condition", "phase_manual", "status"))):
            grp = "Rehab plan"
        elif act in ("program assigned", "program removed"):
            ref = d.get("ref", "")
            grp = "Rehab plan" if d.get("kind") == "exercise" or cat.get(ref) in REHAB_CATS else "S&C"
        elif act in ("override", "override off"):
            grp = "Rehab plan" if d.get("comp") in ("KEY", "MOB", "ACT", "REC") else "S&C"
        elif act == "session":
            grp = "Training load"
        else:
            grp = "Other"
        text = {"session": lambda: f"session logged: load {d.get('load')} AU, pain {d.get('pain')}, readiness {d.get('readiness')}",
                "test": lambda: f"tests logged: automatic phase {d.get('auto_phase_before')} → {d.get('auto_phase_after')}",
                "program assigned": lambda: f"{d.get('kind')} {d.get('ref')} {('(' + cat.get(d.get('ref'), '') + ')') if cat.get(d.get('ref')) else ''} assigned",
                "program removed": lambda: "program removed", "override": lambda: f"override {d.get('comp')} {d.get('field')} = {d.get('value')}",
                "injury": lambda: f"injury: {d.get('condition') or d.get('region')} ({d.get('severity')})"}.get(act)
        if act.startswith("phase"):
            text = lambda: f"{act}: {d.get('from')} → {d.get('to')} ({d.get('mode')})" + (" against the gates" if d.get("against_gates") else "") + (f"; modifications: {d.get('modifications')}" if d.get("modifications") else "")
        out.append({"ts": r["ts"], "group": grp, "action": act, "text": text() if text else f"{act}: {json.dumps(d, ensure_ascii=False)[:160]}", "reason": r["reason"]})
    return out


# ---------------------------------------------------------------- programs (Program_Library / Program_Variants) and isometric blocks
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
STAGE_LEVEL = {1: "L1", 2: "L1", 3: "L2", 4: "L3", 5: "L4", 6: "L4"}  # phase stage -> program level (capped to the program's own levels)
_STOP = {"and", "the", "of", "a", "with", "for", "to", "in", "on", "or", "pain", "rehab", "return", "programme", "program", "related", "post", "op", "non", "sport", "sports", "athletes", "active", "people"}
_SYN = {"acl": ["acl", "cruciate"], "achilles": ["achilles", "calf"], "patellar": ["patellar", "jumper", "knee-tendon"], "hamstring": ["hamstring", "nordic"], "ankle": ["ankle", "sprain"],
        "groin": ["groin", "adductor"], "adductor": ["groin", "adductor"], "plantar": ["plantar", "heel"], "gluteal": ["gluteal", "hip"], "rotator": ["rotator", "shoulder", "subacromial"],
        "elbow": ["elbow", "tennis"], "back": ["back", "spine", "trunk", "mcgill"], "shoulder": ["shoulder", "overhead", "thrower"], "tendinopathy": ["tendinopathy", "tendon"]}
_SPORT = {"basketball": ["jumping", "ankle", "patellar"], "volleyball": ["jumping", "ankle", "patellar"], "football": ["field", "sprint", "football", "groin", "hamstring"], "soccer": ["field", "football", "groin", "hamstring"],
          "cricket": ["cricket", "bowler", "overhead"], "rugby": ["contact", "neck", "rugby"], "running": ["runners", "calf", "achilles"], "athletics": ["sprint", "runners"], "tennis": ["overhead", "shoulder", "elbow"],
          "swimming": ["swimmers", "shoulder"], "handball": ["overhead", "handball", "shoulder"], "hockey": ["field", "groin", "ice"], "combat": ["contact", "neck"], "boxing": ["contact", "neck"], "kabaddi": ["contact", "groin"]}


def _tables():
    from anatomy_lab import training_api as TA
    return TA


def _words(t):
    import re as _re
    return {w for w in _re.findall(r"[a-z0-9-]+", (t or "").lower()) if w not in _STOP and len(w) > 2}


def suggestions(aid):
    TA = _tables()
    with _con() as c:
        a = _row(c.execute("SELECT * FROM athlete WHERE id=?", (aid,)).fetchone())
        have = {r[0] for r in c.execute("SELECT ref FROM assignment WHERE athlete=? AND active=1 AND kind='program'", (aid,))}
    ph = plan(aid, light=True).get("phase") or "1"
    stage = int(str(ph)[0])
    cw = _words(a["condition"]); cx = set(cw)
    for w in cw:
        cx |= set(_SYN.get(w, []))
    sx = set()
    for k, v in _SPORT.items():
        if k in (a["sport"] or "").lower():
            sx |= set(v)
    out = []
    for p in TA._dicts("Program_Library"):
        text = _words(f"{p['Program']} {p['Target / condition / sport']}")
        why = []
        hit_c = cx & text
        if hit_c:
            why.append(f"matches the condition ({', '.join(sorted(hit_c))})")
        hit_s = sx & text
        if hit_s:
            why.append(f"suits {a['sport']} ({', '.join(sorted(hit_s))})")
        iso = "isometric" in p["Program"].lower()
        if iso and stage <= 3:
            why.append(f"isometric loading fits stage {stage} ({ph})")
        if not why:
            continue
        score = 3 * len(hit_c) + 2 * len(hit_s) + (2 if iso and stage <= 3 else 0) + (1 if p["Evidence level"] == "A" else 0)
        import re as _re
        m = _re.search(r"from ~?(\d+) weeks", p["Target / condition / sport"])
        if m and a["injury_date"]:
            try:
                wk = (date.today() - date.fromisoformat(a["injury_date"])).days // 7
                if wk < int(m.group(1)):
                    why.append(f"caution: this program starts from ~{m.group(1)} weeks; {a['name']} is at week {wk} since {a['injury_date']}")
                    score -= 4
            except ValueError:
                pass
        out.append({"id": p["ID"], "program": p["Program"], "category": p["Category"], "quality": p["Quality"], "evidence": p["Evidence level"], "why": "; ".join(why), "score": score, "assigned": p["ID"] in have})
    out.sort(key=lambda x: -x["score"])
    return out[:12]


def _variant(prog_id, equipment, level, block):
    TA = _tables()
    f = {"Program ID": prog_id, "Level": level, "Block": block}
    r = TA.table("Program_Variants", "", {**f, "Equipment": equipment} if equipment else f, 0, 5)
    if not r["rows"] and equipment:
        r = TA.table("Program_Variants", "", f, 0, 5)
    return dict(zip(r["cols"], r["rows"][0][1:])) if r["rows"] else None


def program_today(asg, a_phase, day=None):
    """Today's content of one assignment, with the reasoning for the variant chosen."""
    TA = _tables(); today = date.fromisoformat(day) if day else date.today()
    start = date.fromisoformat(asg["start_day"]) if asg["start_day"] else today
    weeks = max(1, (today - start).days // 7 + 1)
    on = [d for d in (asg["weekdays"] or "").split(",") if d]
    scheduled = not on or WEEKDAYS[today.weekday()] in on
    if asg["kind"] == "exercise":
        rid = int(asg["ref"])
        rr = TA.row("Exercise_Library", rid).get("data", {})
        ph = TA.engine().phases[TA.engine().phase_ix[a_phase]]
        sets = max(1, int(E.xround(E.num(ph["Sets (auto)"], 1))))
        auto = f"{sets} x {ph['Reps / Duration']} | RPE {ph['RPE Target']} | tempo {ph['Tempo']} | rest {ph['Rest']}"
        return {"id": asg["id"], "kind": "exercise", "title": rr.get("Exercise Name", f"row {rid}"), "scheduled": scheduled, "weeks": weeks, "row": rid,
                "dose": asg["notes"] or auto, "library_dose": f"{rr.get('Sets × Reps', '')} · tempo {rr.get('Tempo', '')} · RPE {rr.get('RPE', '')} · rest {rr.get('Rest', '')}",
                "strategy": rr.get("Loading Strategy", ""), "cues": rr.get("Cues / Technique Focus", ""), "contra": rr.get("Contraindications", ""),
                "regress": rr.get("Regression (Easier)", ""), "progress": rr.get("Standard Progression", ""),
                "why": [f"Dose from phase {a_phase} ({ph['Phase Name']}): {auto}." if not asg["notes"] else f"Custom dose set by hand: {asg['notes']} (phase rule would give {auto}).",
                        f"Library prescription for reference: {rr.get('Sets × Reps', '')}, tempo {rr.get('Tempo', '')}.", f"{'Scheduled today' if scheduled else 'Not scheduled today'} ({', '.join(on) if on else 'every day'})."]}
    p = next((x for x in TA._dicts("Program_Library") if x["ID"] == asg["ref"]), None)
    if not p:
        return {"id": asg["id"], "kind": "program", "title": asg["ref"], "error": "program not found", "why": []}
    levels = [x for x in p["Levels"].split("|") if x]
    stage = int(str(a_phase)[0])
    want = STAGE_LEVEL.get(stage, "L1")
    auto_level = want if want in levels else min(levels, key=lambda L_: abs(int(L_[1]) - int(want[1])))
    level = asg["level"] if asg["level"] in levels else auto_level
    block = f"B{((weeks - 1) // 4) % 3 + 1}"
    v = _variant(p["ID"], asg["equipment"] or p["Original equipment"], level, block)
    dose = next((d for d in TA._dicts("Program_Dose") if d["Key"] == f"{p['Quality']}|{level}"), {})
    lvl_why = "set by hand" if asg["level"] in levels else f"from phase {a_phase} (stage {stage} -> {want}" + (f", nearest level this program has: {level})" if level != want else ")")
    why = [f"Level {level}: {lvl_why}.", f"Block {block}: week {weeks} since {start.isoformat()} (weeks 1-4 = B1, 5-8 = B2, 9-12 = B3, then repeat).",
           f"Equipment: {(v or {}).get('Equipment') or asg['equipment'] or p['Original equipment']}.", f"{'Scheduled today' if scheduled else 'Not scheduled today'} ({', '.join(on) if on else 'every day'})."]
    return {"id": asg["id"], "kind": "program", "program": p["ID"], "title": p["Program"], "category": p["Category"], "quality": p["Quality"], "level": level, "block": block, "weeks": weeks,
            "scheduled": scheduled, "variant": v, "dose_level": dose.get("Dose / emphasis"), "template": p["Session template"], "advance": p["Advance when"], "regress": p["Regress / stop when"],
            "evidence": f"{p['Evidence level']} - {p['Evidence source']}", "duration": p["Duration × frequency"], "why": why, "notes": asg["notes"]}


def programs(aid, day=None):
    with _con() as c:
        rows = [dict(r) for r in c.execute("SELECT * FROM assignment WHERE athlete=? AND active=1 ORDER BY id", (aid,))]
    ph = plan(aid, light=True).get("phase") or "1"
    return [program_today(r, ph, day) for r in rows]


def assign(b):
    reason = (b.get("reason") or "").strip()
    with _con() as c:
        if b.get("id"):
            c.execute("UPDATE assignment SET active=0 WHERE id=?", (b["id"],))
            _audit(c, b["athlete"], "program removed", {"id": b["id"]}, reason)
            return {"ok": True}
        if b.get("kind") not in ("program", "exercise"):
            raise ValueError("kind")
        if not reason:
            raise ValueError("a reason is required to assign a program")
        cur = c.execute("INSERT INTO assignment (athlete, kind, ref, equipment, level, start_day, weekdays, notes, reason, active, created) VALUES (?,?,?,?,?,?,?,?,?,1,?)",
                        (b["athlete"], b["kind"], str(b["ref"]), b.get("equipment", ""), b.get("level", ""), b.get("start_day") or date.today().isoformat(), b.get("weekdays", ""), b.get("notes", ""), reason, _now()))
        _audit(c, b["athlete"], "program assigned", {**{k: b.get(k) for k in ("kind", "ref", "equipment", "level", "start_day", "weekdays", "notes")}, "id": cur.lastrowid}, reason)
    return {"ok": True}


def handle_get(path, q):
    a = lambda k, d="": q.get(k, [d])[0]  # noqa: E731
    if path == "/api/ath/list":
        return 200, athletes(a("archived") == "1")
    if path == "/api/ath/get":
        return 200, athlete(int(a("id", "0")))
    if path == "/api/ath/plan":
        return 200, plan(int(a("id", "0")), a("day") or None)
    if path == "/api/ath/dashboard":
        return 200, dashboard(int(a("group")) if a("group") else None)
    if path == "/api/ath/audit":
        return 200, audit_all()
    if path == "/api/ath/staff":
        return 200, staff_list()
    if path == "/api/ath/perspectives":
        return 200, perspectives(int(a("id", "0")), a("phase") or None)
    if path == "/api/ath/tick":
        return 200, {"advanced": tick_all()}
    if path == "/api/ath/justify":
        return 200, justify(int(a("id", "0")))
    if path == "/api/ath/updates":
        return 200, updates(int(a("id", "0")))
    if path == "/api/ath/programs":
        return 200, {"programs": programs(int(a("id", "0")), a("day") or None), "suggestions": suggestions(int(a("id", "0")))}
    return 404, {"error": "unknown route"}


def handle_post(path, b):
    f = {"/api/ath/save": save_athlete, "/api/ath/archive": archive, "/api/ath/group": save_group, "/api/ath/session": log_session,
         "/api/ath/test": log_test, "/api/ath/injury": log_injury, "/api/ath/override": set_override, "/api/ath/assign": assign, "/api/ath/phase": move_phase,
         "/api/ath/members": members, "/api/ath/delete": delete_athlete, "/api/ath/restore": restore,
         "/api/ath/staff": save_staff, "/api/ath/care": set_care, "/api/ath/settings": set_settings, "/api/ath/signoff": sign}.get(path)
    if not f:
        return 404, {"error": "unknown route"}
    ACTOR["id"] = int(b["by"]) if str(b.get("by") or "").isdigit() else None
    try:
        return 200, f(b)
    finally:
        ACTOR["id"] = None
