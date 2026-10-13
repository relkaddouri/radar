#!/usr/bin/env python3
"""Génère les fichiers calendrier (.ics) de Radar à partir de data.json.

Usage : python3 tools/build_ics.py   (depuis la racine du dépôt)

Produit :
  ics/<id>.ics              un fichier par événement à venir (bouton « Ajouter au calendrier »)
  ics/incontournables.ics   abonnement : événements de niveau 3
  ics/tout.ics              abonnement : tout l'agenda
Chaque événement a une alerte 30 minutes avant (ou la veille à 20 h pour un événement sans heure).
"""
import json, os, re, glob
from datetime import datetime, date, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "ics")
SPORT = {"football": "Football", "basket": "Basket", "tennis": "Tennis", "f1": "F1",
         "boxe": "Boxe", "mma": "MMA", "culture": "Culture"}


def esc(s):
    return (str(s or "").replace("\\", "\\\\").replace(";", "\\;")
            .replace(",", "\\,").replace("\n", "\\n"))


def fold(line):
    b = line.encode("utf-8")
    if len(b) <= 74:
        return line
    out, cur = [], b""
    for ch in line:
        c = ch.encode("utf-8")
        if len(cur) + len(c) > 73:
            out.append(cur.decode("utf-8"))
            cur = b" " + c
        else:
            cur += c
    out.append(cur.decode("utf-8"))
    return "\r\n".join(out)


def is_date_only(ev):
    return ev.get("allDay") or re.fullmatch(r"\d{4}-\d{2}-\d{2}", ev.get("start", "")) is not None


def parse_date(s):
    return date.fromisoformat(s[:10])


def end_of(ev):
    if ev.get("end"):
        return datetime.combine(parse_date(ev["end"]), datetime.max.time(), tzinfo=timezone.utc)
    if is_date_only(ev):
        return datetime.combine(parse_date(ev["start"]), datetime.max.time(), tzinfo=timezone.utc)
    return datetime.fromisoformat(ev["start"]).astimezone(timezone.utc) + timedelta(hours=3)


def vevent(ev, stamp):
    title = f'{ev.get("title","")} ({SPORT.get(ev.get("sport"), ev.get("sport",""))})'
    desc = " — ".join(x for x in [ev.get("comp"), ev.get("why")] if x)
    lines = ["BEGIN:VEVENT", f'UID:{ev["id"]}@radar', f"DTSTAMP:{stamp}"]
    if is_date_only(ev):
        d1 = parse_date(ev["start"])
        d2 = parse_date(ev["end"]) if ev.get("end") else d1
        lines += [f"DTSTART;VALUE=DATE:{d1:%Y%m%d}", f"DTEND;VALUE=DATE:{d2 + timedelta(days=1):%Y%m%d}",
                  "TRANSP:TRANSPARENT"]
        alarm = "-PT4H"  # veille à 20 h
    else:
        s = datetime.fromisoformat(ev["start"]).astimezone(timezone.utc)
        lines += [f"DTSTART:{s:%Y%m%dT%H%M%SZ}", f"DTEND:{s + timedelta(hours=2):%Y%m%dT%H%M%SZ}"]
        alarm = "-PT30M"
    lines += [f"SUMMARY:{esc(title)}", f"LOCATION:{esc(ev.get('place'))}", f"DESCRIPTION:{esc(desc)}",
              "BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{esc(title)}", f"TRIGGER:{alarm}", "END:VALARM",
              "END:VEVENT"]
    return lines


def calendar(name, events, stamp):
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Radar//FR", "CALSCALE:GREGORIAN",
             "METHOD:PUBLISH", f"X-WR-CALNAME:{esc(name)}", "X-WR-TIMEZONE:Africa/Casablanca",
             "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"]
    for ev in events:
        lines += vevent(ev, stamp)
    lines.append("END:VCALENDAR")
    return "\r\n".join(fold(l) for l in lines) + "\r\n"


def main():
    data = json.load(open(os.path.join(ROOT, "data.json"), encoding="utf-8"))
    now = datetime.now(timezone.utc)
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    events = [e for e in data.get("events", []) if e.get("id") and e.get("start") and end_of(e) >= now]
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, "*.ics")):
        os.remove(f)
    for ev in events:
        safe = re.sub(r"[^A-Za-z0-9_.-]", "_", ev["id"])
        open(os.path.join(OUT, f"{safe}.ics"), "w", encoding="utf-8", newline="").write(
            calendar(ev.get("title", "Radar"), [ev], stamp))
    top = [e for e in events if e.get("level", 0) >= 3]
    open(os.path.join(OUT, "incontournables.ics"), "w", encoding="utf-8", newline="").write(
        calendar("Radar · Incontournables", top, stamp))
    open(os.path.join(OUT, "tout.ics"), "w", encoding="utf-8", newline="").write(
        calendar("Radar · Agenda", events, stamp))
    print(f"{len(events)} événements, {len(top)} incontournables")


if __name__ == "__main__":
    main()
