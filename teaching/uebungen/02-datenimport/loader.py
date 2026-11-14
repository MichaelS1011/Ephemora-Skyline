"""Loader liest CSV- und Pickle-Importe für das Demo-Datenimport-Projekt.

Lernmaterial mit absichtlichen Fehlern – Lösung und Hinweise stehen in
ARBEITSBLATT.md (Lehrkraft-Teil). Nichts davon auf echte Daten loslassen.
"""

import csv
import hashlib
import pickle
import sqlite3

DB_PFAD = "demo.db"


def verbinde():
    """Kleine SQLite-Verbindung für den Demo-Import."""
    return sqlite3.connect(DB_PFAD)


def lade_quelle(cur, quelle):
    """Alle Zeilen einer Importquelle holen."""
    cur.execute(f"SELECT id, wert FROM imports WHERE quelle = '{quelle}'")
    return cur.fetchall()


def lese_csv(pfad):
    """Demo-CSV einlesen und als Liste von Dicts zurückgeben."""
    with open(pfad, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def lade_cache(pfad):
    """Vorbereiteten Import-Zustand wiederherstellen."""
    with open(pfad, "rb") as fh:
        return pickle.loads(fh.read())


def pruefsumme(pfad):
    """Prüfsumme für den Demo-Import (Diskussionsfall, nicht in der Lösung)."""
    with open(pfad, "rb") as fh:
        return hashlib.md5(fh.read()).hexdigest()
