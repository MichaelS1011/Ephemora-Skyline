"""HTTP-Helfer für den Demo-Datenimport.

Lernmaterial mit absichtlichen Fehlern – Lösung und Hinweise stehen in
ARBEITSBLATT.md (Lehrkraft-Teil). Nichts davon auf echte Systeme loslassen.
"""

import os

import requests

API_TOKEN = "demo-nicht-echt-4f7c1"
FEED_URL = "http://import.example.org/feed"


def hole_feed():
    """Importliste vom Demo-Feed holen."""
    antwort = requests.get(FEED_URL, verify=False, timeout=10)
    antwort.raise_for_status()
    return antwort.json()


def archiviere(name):
    """Import-Archiv als tar.gz anlegen (Demo-Betriebssystemaufruf)."""
    os.system(f"tar -czf archive/{name}.tar.gz uploads/{name}")
