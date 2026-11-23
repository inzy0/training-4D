"""Training System engine: a direct port of the formulas in the owner's workbook
ALL_IN_ONE_EXERCISES_SYSTEM.xlsx (Full_Pathway, Day_Planner, Phase_Gates, Daily_Schedule,
Session_Builder, Athlete_Profile, Supplements). Each function names the sheet cells it ports.

Used by tools/training_system_build.py (which checks this port against the workbook's own cached
results, see validation.json) and by anatomy_lab/server.py (/api/ts/*). Pure functions over the
tables the build writes to data/anatomy_lab/training_system/ts.sqlite: `T` maps a table name to
a list of dicts keyed by the workbook's header labels.

The rules are the workbook's rules, reproduced exactly; they are not clinically validated here.
"""
from __future__ import annotations

import math
import re

HML = ("Heavy", "Medium", "Light")
UND = {"Heavy": 1.0, "Medium": 0.85, "Light": 0.7}
UND_LABEL = {"Heavy": "HEAVY (100%)", "Medium": "MEDIUM (85%)", "Light": "LIGHT (70%)"}
# Full_Pathway!J / Day_Planner!F15: sport drill level per phase order (22 phases)
SPORT_LEVEL = (0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6)
# Day_Planner!I11: Conditions_Meta region -> region group used by the combination generator
REGION_GROUP = {"Knee": "Lower", "Ankle / Foot": "Lower", "Hip / Thigh": "Lower", "Shoulder": "Upper",
                "Elbow / Wrist / Hand": "Upper", "Lumbar / Pelvis": "Core", "Cervical / Thoracic": "Core", "Systemic": "Total"}
COMPONENTS = [  # Day_Planner A27:A34 and the Condition_Progression component codes
    ("KEY", "Condition-specific key exercise"), ("MOB", "Mobility / ROM"), ("ACT", "Activation / motor control / proprioception"),
    ("STR", "Strength"), ("PWR", "Power / plyometric / speed"), ("CON", "Conditioning / energy systems"),
    ("SPORT", "Sport skill & drills"), ("REC", "Recovery / regeneration")]
GATE_METRICS = ["PAIN", "EFF", "ROM", "STR", "END", "BAL", "HOP", "CMJ", "RSI", "SPR", "COD", "AER", "PROM", "PSY", "LOAD", "TIME"]
LOWER_IS_BETTER = {"PAIN", "EFF", "COD"}


# ---------------------------------------------------------------- Excel-compatible helpers
def xround(x: float, n: int = 0) -> float:
    """Excel ROUND: half away from zero."""
    m = 10 ** n
    return math.floor(abs(x) * m + 0.5 + 1e-9) / m * (1 if x >= 0 else -1)


def num(v, default=None):
    if v is None or v == "":
        return default
    try:
        return float(str(v).replace(",", ""))
    except ValueError:
        return default


def fmt(x: float) -> str:
    """How Excel shows a number joined into text: no trailing zeros."""
    if x == int(x):
        return str(int(x))
    return (f"{x:.10f}").rstrip("0").rstrip(".")


def pct(x: float) -> str:  # TEXT(x, "0%")
    return f"{int(xround(x * 100))}%"


def mid_item(s: str, i: int) -> str:
    """TRIM(MID(SUBSTITUTE(s,"|",REPT(" ",300)), i*300+1, 300)): the i-th |-item (0-based), '' if missing."""
    parts = str(s or "").split("|")
    return parts[i].strip() if 0 <= i < len(parts) else ""


class Tables:
    """Indexes over the workbook tables the engine needs."""

    def __init__(self, T: dict[str, list[dict]]):
        self.T = T
        self.phases = T["Phase_System"]
        self.phase_ix = {p["Code"]: i for i, p in enumerate(self.phases)}
        self.dose = {d["Phase"]: d for d in T["Phase_Dose"]}
        self.cond = {c["Condition"]: c for c in T["Conditions_Meta"]}
        self.cp = {r["Key"]: r for r in T["Condition_Progression"]}
        self.sport_drill = {r["Key"]: r for r in T["Sport_Drills"]}
        self.acc_phase = T["Accel_Phase"]
        self.acc_phase_ix = {str(r["Phase"]): i for i, r in enumerate(self.acc_phase)}
        self.acc_games = {r["Key"]: r for r in T["Accel_Games"]}
        self.acc_constraints = T["Accel_Constraints"]
        self.acc_methods = T["Accel_Methods"]
        self.acc_recovery = {r["Key"]: r for r in T["Accel_Recovery"]}
        gl = [g for g in T["Generated_Library"] if g.get("ID")]
        self.gen_by_key: dict[str, list[dict]] = {}
        self.gen_by_occ: dict[str, dict] = {}
        for g in gl:
            self.gen_by_key.setdefault(g.get("Planner key", ""), []).append(g)
            occ = g.get("Key # (occurrence)", "")
            if occ and occ not in self.gen_by_occ:
                self.gen_by_occ[occ] = g

    # ------------------------------------------------------------ phase days (Day_Planner!F8, Full_Pathway!N6:N27)
    def phase_days(self, condition: str) -> list[tuple[str, int, int, str]]:
        hf = num(self.cond[condition]["Healing factor"], 1.0)
        out, start = [], 1
        for p in self.phases:
            n = max(1, int(xround(num(self.dose[p["Code"]]["Base days"], 1) * hf)))
            out.append((p["Code"], n, start, p["Phase Name"]))
            start += n
        return out

    def cp_row(self, condition: str, phase: str, comp: str) -> dict | None:
        return self.cp.get(f"{condition}|{phase}|{comp}")

    # ------------------------------------------------------------ one pathway day (Full_Pathway row formulas A..AH)
    def pathway(self, condition: str, sport: str = "General / Non-sport") -> dict:
        meta = self.cond[condition]
        rg = REGION_GROUP.get(meta.get("Region", ""), "Lower")
        table = self.phase_days(condition)
        total = table[-1][2] + table[-1][1] - 1
        days = [self.day(condition, sport, a, table, rg) for a in range(1, total + 1)]
        return {"condition": condition, "sport": sport, "region_group": rg, "meta": meta, "total_days": total,
                "phases": [{"code": c, "days": n, "start": s, "name": nm} for c, n, s, nm in table], "days": days}

    def day(self, condition, sport, a, table, rg) -> dict:
        cur = max((t for t in table if t[2] <= a), key=lambda t: t[2])
        code, ndays, start, pname = cur
        d = a - start + 1
        e = HML[(d - 1) % 3]
        band = int(str(code)[0])
        af = self.acc_phase_ix.get(code, 0)  # Full_Pathway!AF (0-based here)
        ag = 1.0 if ndays <= 1 else (d - 1) / (ndays - 1)
        ah = "E" if band <= 2 else ("M" if band <= 4 else "L")
        ps = self.phases[self.phase_ix[code]]
        dz = self.dose[code]
        r = {"day": a, "week": math.ceil(a / 7), "phase": code, "phase_name": pname, "day_in_phase": d, "phase_days": ndays,
             "undulation": e, "band": band, "progress": ag, "band_group": ah}
        prim = lambda comp: (self.cp_row(condition, code, comp) or {}).get("PRIMARY exercise", "—") or "—"
        r["key"], r["strength"], r["power"] = prim("KEY"), prim("STR"), prim("PWR")
        # H: strength dose progressed
        sets = max(1, int(xround(num(ps["Sets (auto)"], 1) * UND[e])))
        h = f"{sets} x {ps['Reps / Duration']}"
        s0, s1 = num(dz["%1RM start"], 0), num(dz["%1RM end"], 0)
        if s1 > 0:
            h += " @ " + pct(s0 + (s1 - s0) * ag)
        r["strength_dose"] = h
        lvl = SPORT_LEVEL[self.phase_ix[code]]
        sd = self.sport_drill.get(f"{sport}|{lvl}")
        r["sport_drill"] = sd["PRIMARY drill"] if sd else "— (no sport work yet)"
        r["milestone"] = (f"▶ START {code} — {pname}" + (" (check Phase_Gates)" if a > 1 else "")) if d == 1 else (
            f"Test day: exit criteria for {code}" if d == ndays else "")
        # R: game-based / implicit drill
        g = self.acc_games.get(f"{band}|{rg}")
        cons = [c for c in self.acc_constraints if num(c["Min band"], 0) <= band <= num(c["Max band"], 0)]
        r["game"] = (mid_item(g["Base games (5 options)"], (a - 1) % 5) + "  ＋  " + cons[(a * 3 - 1) % len(cons)]["Constraint"]) if g and cons else "—"
        ap = self.acc_phase[af]
        x = (num(ap["Load start"], 0) + (num(ap["Load end"], 0) - num(ap["Load start"], 0)) * ag) * (UND[e] if num(ap["Undulate load? (1/0)"], 0) == 1 else 1)
        r["load_target"] = f"{fmt(xround(x, 2 if x < 2 else 1))} {ap['Unit']} ({e}) · {ap['Loading model']} · {ap['Weekly load rule']}"
        f = [m for m in self.acc_methods if num(m["Min band"], 0) <= band <= num(m["Max band"], 0) and m["Day type"] in (e, "Any")]
        if f:
            n = len(f); k1 = (a * 7) % n; k2 = (a * 7 + max(1, int(n / 2))) % n
            r["acc1"] = f"{f[k1]['Method']} — {f[k1]['Dose']}"
            r["acc2"] = f"{f[k2]['Method']} — {f[k2]['Dose']}"
            r["acc1_why"] = f"Physio: {f[k1]['Physio mechanism']} | S&C: {f[k1]['S&C rationale']} | Evidence {f[k1]['Evidence']} | ⚠ {f[k1]['Cautions']}"
        else:
            r["acc1"] = r["acc2"] = r["acc1_why"] = "—"
        rec = self.acc_recovery.get(f"{e}|{ah}")
        r["recovery"] = (mid_item(rec["Recovery set-up options"], ((a - 1) // 3) % 4) + " · Fuel/sleep: " + rec["Sleep & fuel target"] + " · ⚠ " + rec["Caution"]) if rec else "—"
        r["readiness_check"] = rec["Readiness check next morning"] if rec else "—"
        r["theory"] = ap["Progression theory in play"]
        r["option_tree"] = f"✔ ADVANCE if: {ap['✔ ADVANCE / fast-track if…']}   ▸ ~ HOLD: {ap['~ HOLD response']}   ▸ ✖ REGRESS: {ap['✖ REGRESS trigger → option']}"
        r["floor"] = ap["Biological floor (never skip)"]
        r["evidence"] = f"Phase {ap['Evidence']}"
        r["session_tree"] = (ap["Combined session tree ({KEY} {STR} {PWR} {ACC} {GAME} {REC} auto-filled)"]
                             .replace("{KEY}", r["key"]).replace("{STR}", r["strength"] + " " + h).replace("{PWR}", r["power"])
                             .replace("{ACC}", r["acc1"]).replace("{GAME}", r["game"]).replace("{REC}", r["recovery"]))
        # AB: newest loop combination for today's slot
        comp = {"Heavy": "STR", "Medium": "PWR" if band >= 3 else "ACT", "Light": "CON" if band >= 4 else "MOB"}[e]
        lo, hi = int(num(self.phases[af]["Depth Min"], 1)), int(num(self.phases[af]["Depth Max"], 1))
        key = f"{rg}|{comp}|{lo + a % (hi - lo + 1)}"
        fl = self.gen_by_key.get(key, [])
        if fl:
            gk = fl[len(fl) - 1 - (a - 1) % len(fl)]
            r["new_combo"] = ("" if str(gk.get("Batch", "")).startswith("Batch 1") else "🆕 ") + gk["Exercise (generated)"] + f"  [{key}]"
        else:
            r["new_combo"] = "— (no combo yet for this slot)"
        return r

    # ------------------------------------------------------------ Day_Planner: all 8 components for one day
    def day_plan(self, condition: str, phase: str, day_in_phase: int, sport: str, readiness: float, volume: float, choices: dict | None = None) -> dict:
        choices = choices or {}
        meta = self.cond[condition]
        rg = REGION_GROUP.get(meta.get("Region", ""), "Lower")
        hf = num(meta["Healing factor"], 1.0)
        n = max(1, int(xround(num(self.dose[phase]["Base days"], 1) * hf)))          # F8
        d = max(1, min(int(day_in_phase), n))                                          # F9
        prog = 1.0 if n == 1 else (d - 1) / (n - 1)                                   # F10
        e = HML[(d - 1) % 3]; und = UND[e]                                             # F11, F12
        ps, dz = self.phases[self.phase_ix[phase]], self.dose[phase]
        lerp = lambda a, b: num(dz[a], 0) + (num(dz[b], 0) - num(dz[a], 0)) * prog
        rows = []
        for comp, label in COMPONENTS:
            cp = self.cp_row(condition, phase, comp) or {}
            lvl = int(num(cp.get("Level (1-6)"), 0) or 0)
            ch = choices.get(comp, "")
            opt = ch if ch in ("P", "A", "B", "C", "N") else ("A" if readiness < 55 else "P")  # F27
            dose = "—"
            if lvl:
                if comp in ("KEY", "REC"):
                    dose = cp.get("Dose (phase template)", "—") + (f" · day {d}/{n} · {UND_LABEL[e]}" if comp == "KEY" else "")
                elif comp == "MOB":
                    dose = f"2-3 rounds x {fmt(xround(lerp('Mobility hold s start', 'Mobility hold s end')))} s holds / 8-10 controlled reps"
                elif comp == "ACT":
                    dose = f"{max(2, int(xround(3 * volume)))} sets x {fmt(xround(lerp('Activation s start', 'Activation s end')))} s (or 8-12 reps)"
                elif comp == "STR":
                    dose = f"{max(1, int(xround(num(ps['Sets (auto)'], 1) * und * volume)))} x {ps['Reps / Duration']}"
                    if num(dz["%1RM end"], 0) > 0:
                        dose += " @ " + pct(lerp("%1RM start", "%1RM end")) + (" MVC" if str(phase)[0] == "1" else " 1RM")
                    dose += f" | RPE {ps['RPE Target']} | tempo {ps['Tempo']} | rest {ps['Rest']}"
                elif comp == "PWR":
                    dose = "—" if num(dz["Contacts end"], 0) == 0 else f"{fmt(xround(lerp('Contacts start', 'Contacts end') * und * volume))} contacts/reps, full recovery, max intent"
                elif comp == "CON":
                    dose = f"{fmt(xround(lerp('Conditioning min start', 'Conditioning min end') * und))} min · {dz['Conditioning intensity']}"
                elif comp == "SPORT":
                    dose = "—" if num(dz["Sport min end"], 0) == 0 else f"{fmt(xround(lerp('Sport min start', 'Sport min end') * volume))} min · {dz['Sport intensity']}"
            new = "—"
            if lvl and comp in ("KEY", "MOB", "ACT", "STR", "PWR", "CON"):
                c2 = "STR" if comp == "KEY" else comp
                new = "— none yet (loop adds more)"
                for L in (lvl, lvl - 1, lvl + 1):
                    cnt = len(self.gen_by_key.get(f"{rg}|{c2}|{L}", []))
                    g = self.gen_by_occ.get(f"{rg}|{c2}|{L}|{(d - 1) % max(1, cnt) + 1}")
                    if g:
                        new = g["Exercise (generated)"]; break
            elif comp in ("SPORT", "REC"):
                new = "— (uses sport/recovery lists)"
            opts = {"P": cp.get("PRIMARY exercise", "—"), "A": cp.get("Alt A — easier, same goal", "—"), "B": cp.get("Alt B — equipment swap, same demand", "—"),
                    "C": cp.get("Alt C — position/plane variation (KEY: next step)", "—"), "N": new}
            rows.append({"comp": comp, "label": label, "session": cp.get("Session", "—"), "level": lvl, "option": opt,
                         "today": opts[opt] if lvl else "Not used in this phase", "options": opts, "dose": dose,
                         "physio": cp.get("Physiotherapy justification", "—"), "sc": cp.get("S&C justification", "—")})
        stra = self.cp_row(condition, phase, "STR") or {}
        sd = self.sport_drill.get(f"{sport}|{SPORT_LEVEL[self.phase_ix[phase]]}")
        return {"condition": condition, "phase": phase, "phase_name": ps["Phase Name"], "days": n, "day": d, "progress": prog,
                "undulation": UND_LABEL[e], "factor": und, "region": f"{meta.get('Region')} · {meta.get('Tissue')}", "region_group": rg,
                "criteria": stra.get("Criteria to progress", ""), "precautions": stra.get("Condition precautions", ""),
                "sport_level": SPORT_LEVEL[self.phase_ix[phase]], "sport_drill": sd, "rows": rows}


# ---------------------------------------------------------------- Phase_Gates (S/U/V formulas, C5 auto phase)
def metric_value(code: str, raw1, raw2, manual):
    """Phase_Gates!G/I: AUTO from raw inputs, MANUAL overrides."""
    if manual not in (None, ""):
        return num(manual)
    r1, r2 = num(raw1), num(raw2)
    if code in ("PAIN", "EFF", "PROM", "PSY", "TIME"):
        return r1
    if code == "SPR":  # G20: time ratio is inverted (baseline / current)
        return xround(r2 / r1 * 100, 1) if r1 not in (None, 0) and r2 is not None else None
    if code == "COD":  # G21: asymmetry %
        return xround(abs(r1 - r2) / min(r1, r2) * 100, 1) if r1 is not None and r2 is not None and min(r1, r2) else None
    return xround(r1 / r2 * 100, 1) if r1 is not None and r2 not in (None, 0) else None


def gates(gate_rows: list[dict], values: dict) -> dict:
    out, cum, current = [], True, None
    for g in gate_rows:
        unmet, ok = [], True
        for m in GATE_METRICS:
            th = num(g.get(m, g.get(f"{m} <=", g.get(f"{m} >="))))
            if th is None:
                continue
            v = values.get(m)
            low = m in LOWER_IS_BETTER
            met = v is not None and (v <= th if low else v >= th)
            if not met:
                ok = False
                unmet.append(f"{m} ({'<=' if low else '>='}{fmt(th)})")
        cum = cum and ok
        if cum:
            current = g["Phase"]
        out.append({"phase": g["Phase"], "name": g["Phase name"], "met": ok, "cumulative": cum, "unmet": unmet})
    nxt = next((o for o in out if not o["cumulative"]), None)
    for o in out:
        o["status"] = "► CURRENT" if o["phase"] == current else ("✔ Passed" if o["cumulative"] else "Locked")
    return {"auto_phase": current, "rows": out, "unmet_next": " ".join(nxt["unmet"]) if nxt else ""}


# ---------------------------------------------------------------- Daily_Schedule!F13:F16 readiness
def readiness(sleep_q, soreness, fatigue, stress, mood, sleep_h=None, hrv=None, cmj=None, manual=None) -> dict:
    xs = [num(v) for v in (sleep_q, soreness, fatigue, stress, mood) if num(v) is not None]
    avg = sum(xs) / len(xs) if xs else 0
    s = avg * 20 - (10 if num(sleep_h, 99) < 7 else 0) - (10 if num(hrv) is not None and num(hrv) < 90 else 0) - (10 if num(cmj) is not None and num(cmj) < 92 else 0)
    score = max(0, min(100, int(xround(s))))
    light = "GREEN — train as planned" if score >= 75 else ("AMBER — cut volume ~20%" if score >= 55 else "RED — swap to recovery session")
    mod = 1 if score >= 75 else (0.8 if score >= 55 else 0.5)
    return {"score": score, "light": light, "modifier": mod, "final": num(manual) if num(manual) is not None else mod}


def epley(weight, reps):  # Athlete_Profile!E41
    w, r = num(weight), num(reps)
    return xround(w * (1 + r / 30), 1) if w is not None and r is not None else None


def supplement_dose(row: dict, mass_kg: float, population: str) -> dict:  # Supplements!AB/AC
    per = num(row.get("Dose per kg"))
    mine = row.get("Fixed / Standard Dose", "") if per is None else f"{fmt(xround(per * mass_kg, 1))} {row.get('Unit', '')}  ({fmt(per)} {row.get('Unit', '')}/kg)"
    return {"dose": mine, "population_dose": row.get("General Adult Dose") if population == "General adult" else row.get("Athlete Dose")}


def session_pick(rows: list[tuple[int, dict]], seed: int, n: int) -> list[tuple[int, dict]]:
    """Session_Builder!V21: rank matching rows by MOD(ROW()*seed, 1000003), take the n smallest."""
    return sorted(rows, key=lambda t: ((t[0] * seed) % 1000003, t[0]))[:n]


def phase_goals(phase_row: dict) -> list[str]:
    return [g for g in str(phase_row.get("Allowed Goals (auto filter)", "")).split("|") if g]


def tokens(s: str) -> list[str]:
    return [t for t in re.split(r"[|,;]\s*", str(s or "")) if t.strip()]
