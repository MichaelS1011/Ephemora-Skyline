"""Berichtserstellung für den Demo-Datenimport.

Diese Datei ist absichtlich sauber – sie dient als Vergleich, damit die
Lernenden auch unbelasteten Code im Projekt sehen.
"""

import csv


def zahle_pro_quelle(zeilen):
    """Zeilen pro Quelle zählen; Ergebnis als sortierte Liste (Quelle, Anzahl)."""
    zaehler = {}
    for zeile in zeilen:
        quelle = zeile["quelle"]
        zaehler[quelle] = zaehler.get(quelle, 0) + 1
    return sorted(zaehler.items())


def schreibe_bericht(zeilen, zielpfad):
    """Kleinen CSV-Bericht schreiben."""
    with open(zielpfad, "w", newline="", encoding="utf-8") as fh:
        schreiber = csv.writer(fh)
        schreiber.writerow(["quelle", "anzahl"])
        for quelle, anzahl in zahle_pro_quelle(zeilen):
            schreiber.writerow([quelle, anzahl])
