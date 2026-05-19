"""iCloud CalDAV-Client — Read-Only Wrapper um python-caldav.

Architektur:
- ICloudClient kapselt caldav.DAVClient
- 30s connect-Timeout gegen Hangs (analog zu ai_chat_with_provider)
- fetch_events nutzt expand=True → iCloud expandiert RRULE serverseitig

Nicht enthalten (kommt in icloud_sync.py):
- DB-Persistierung
- Idempotenz-Logik
- Scheduler-Integration
"""

import logging
from datetime import datetime
from typing import Iterable

import caldav
from caldav.lib import error as caldav_error

logger = logging.getLogger(__name__)

ICLOUD_CALDAV_URL = "https://caldav.icloud.com/"


class ICloudConnectionError(Exception):
    """Verbindung zu iCloud fehlgeschlagen (auth, network, etc.)."""


class ICloudClient:
    """Read-Only CalDAV-Wrapper fuer iCloud."""

    def __init__(self, apple_id: str, app_password: str, timeout: float = 30.0):
        if not apple_id or not app_password:
            raise ICloudConnectionError(
                "Apple-ID und App-Passwort sind beide noetig"
            )
        self.apple_id = apple_id
        self._password = app_password
        self._timeout = timeout
        self._client: caldav.DAVClient | None = None
        self._principal = None

    def _get_client(self) -> caldav.DAVClient:
        """Lazy DAVClient mit Connection-Timeout."""
        if self._client is None:
            self._client = caldav.DAVClient(
                url=ICLOUD_CALDAV_URL,
                username=self.apple_id,
                password=self._password,
                timeout=self._timeout,
            )
        return self._client

    @property
    def principal(self):
        """Apple-Principal (lazy-loaded). Wirft bei Auth-Fehler."""
        if self._principal is None:
            try:
                self._principal = self._get_client().principal()
            except caldav_error.AuthorizationError as e:
                raise ICloudConnectionError(
                    f"Auth fehlgeschlagen — App-Passwort pruefen: {e}"
                ) from e
            except Exception as e:
                raise ICloudConnectionError(
                    f"iCloud nicht erreichbar: {type(e).__name__}: {e}"
                ) from e
        return self._principal

    def test_connection(self) -> dict:
        """Pingt iCloud an, gibt Diagnose-Info zurueck.

        Returns:
            {"ok": True, "principal_url": "...", "calendar_count": N}
            Wirft ICloudConnectionError bei Fehler.
        """
        cals = self.list_calendars()
        return {
            "ok": True,
            "principal_url": str(self.principal.url),
            "calendar_count": len(cals),
        }

    def list_calendars(self) -> list[dict]:
        """Listet alle iCloud-Kalender mit Metadaten.

        Returns:
            Liste von {"url", "name", "color"} Dicts.
            Farbe kann None sein wenn iCloud keine setzt.
        """
        result = []
        try:
            cals = self.principal.calendars()
        except Exception as e:
            raise ICloudConnectionError(
                f"Konnte Kalender-Liste nicht holen: {e}"
            ) from e

        for cal in cals:
            # Color-Property via Apple-CalDAV-Extension
            color = None
            try:
                props = cal.get_properties([
                    "{http://apple.com/ns/ical/}calendar-color"
                ])
                color = props.get(
                    "{http://apple.com/ns/ical/}calendar-color"
                )
            except Exception as e:
                # Color ist Best-Effort, kein Showstopper
                logger.debug(f"Color-Fetch fehlgeschlagen fuer "
                             f"{cal.name}: {e}")

            result.append({
                "url": str(cal.url),
                "name": cal.name or "(unbenannt)",
                "color": color,
            })

        return result

    def fetch_events(
        self,
        cal_url: str,
        start: datetime,
        end: datetime,
    ) -> Iterable:
        """Holt Events im Zeitfenster.

        Wichtig: expand=True laesst iCloud die Recurrences expandieren.
        Jede Recurrence-Instanz kommt als eigenes VEVENT zurueck.

        Lookup-Pattern: iCloud leitet Calendar-URLs auf regionale Server
        um (caldav.icloud.com → p169-caldav.icloud.com). caldav-Lib's
        Calendar(client, url) wirft bei Host-Mismatch. Daher gehen wir
        ueber Principal.calendars() und matchen per URL-String.

        Yields:
            caldav.Event-Objekte (mit .icalendar_component + .etag)
        """
        # Calendar via Principal-Lookup finden (vermeidet URL-Join-Bug)
        target = None
        for cal in self.principal.calendars():
            if str(cal.url) == cal_url:
                target = cal
                break
        if target is None:
            raise ICloudConnectionError(
                f"Calendar not found in principal for URL {cal_url}"
            )

        try:
            events = target.search(
                start=start, end=end,
                event=True, expand=True,
            )
        except Exception as e:
            raise ICloudConnectionError(
                f"Event-Fetch fehlgeschlagen fuer {cal_url}: {e}"
            ) from e
        return events
