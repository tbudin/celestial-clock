"""
Visual and alignment check for the orrery.

Usage: python3 scripts/visual-check.py [base_url] [out_dir]

Opens the app in headless Chromium (software WebGL), captures screenshots at
phone, tablet and desktop sizes, and reads window.__celestialClock.verify(),
which measures alignment in screen pixels from the rendered objects.
Exits non-zero if any alignment check fails or console errors appear.
"""

import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173/"
OUT = sys.argv[2] if len(sys.argv) > 2 else "screenshots"
os.makedirs(OUT, exist_ok=True)

VIEWPORTS = {
    "iphone": (390, 844, 3),
    "tablet": (768, 1024, 2),
    "desktop": (1440, 900, 1),
}
TOLERANCE_PX = 0.75

failures = []


def check(name, report, expect=None):
    for hand in ("earth", "year"):
        r = report[hand]
        if r["centreToHandPx"] > TOLERANCE_PX:
            failures.append(f"{name}: {hand} centre is {r['centreToHandPx']:.2f}px off its hand")
        if not r["planetOnHand"]:
            failures.append(f"{name}: {hand} planet is not between Sun and hand tip")
    for pid, d in report["orbitOffsetsPx"].items():
        if d > TOLERANCE_PX:
            failures.append(f"{name}: {pid} is {d:.2f}px off its orbit path")
    if expect:
        e = report["earth"]
        if (e["month"], e["day"]) != (expect["month"], expect["day"]):
            failures.append(f"{name}: Earth hand reads {e['month']}/{e['day']}, expected {expect['month']}/{expect['day']}")
        if report["year"]["year"] != expect["year"]:
            failures.append(f"{name}: year hand reads {report['year']['year']}, expected {expect['year']}")


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    for name, (w, h, dpr) in VIEWPORTS.items():
        ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=dpr, timezone_id="Asia/Singapore")
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(BASE, wait_until="load", timeout=90000)
        page.wait_for_function("window.__celestialClock !== undefined", timeout=30000)
        page.wait_for_timeout(1500)
        page.screenshot(path=f"{OUT}/{name}-live.png", full_page=True)
        report = page.evaluate("window.__celestialClock.verify()")
        print(name, "live", json.dumps(report))
        check(f"{name} live", report)
        if errors:
            failures.append(f"{name}: console errors: {errors[:3]}")
        ctx.close()

    # Known dates, desktop size, each planet scale
    cases = [
        ("leapday", "2028-02-29", "jupiter", {"year": 2028, "month": 2, "day": 29}),
        ("equinox", "2026-03-20", "saturn", {"year": 2026, "month": 3, "day": 20}),
        ("solstice", "2026-12-21", "uranus", {"year": 2026, "month": 12, "day": 21}),
        ("far-past", "1969-07-20", "neptune", {"year": 1969, "month": 7, "day": 20}),
        ("far-future", "2100-01-01", "jupiter", {"year": 2100, "month": 1, "day": 1}),
    ]
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1, timezone_id="Asia/Singapore")
    page = ctx.new_page()
    page.goto(BASE, wait_until="load", timeout=90000)
    page.wait_for_function("window.__celestialClock !== undefined", timeout=30000)
    for label, date, planet, expect in cases:
        page.get_by_role("radio", name=planet.capitalize()).click()
        page.get_by_label("Date").fill(date)
        page.wait_for_timeout(800)
        page.screenshot(path=f"{OUT}/desktop-{label}-{planet}.png")
        report = page.evaluate("window.__celestialClock.verify()")
        print(label, planet, json.dumps(report))
        check(f"{label}/{planet}", report, expect)
    ctx.close()

    # Observer tests: four cities at fixed instants, Earth and Moon panels
    cities = {
        "singapore": "lat=1.2903&lon=103.852&tz=Asia/Singapore&name=Singapore",
        "london": "lat=51.5074&lon=-0.1278&tz=Europe/London&name=London",
        "new-york": "lat=40.7128&lon=-74.006&tz=America/New_York&name=New%20York",
        "sydney": "lat=-33.8688&lon=151.2093&tz=Australia/Sydney&name=Sydney",
    }
    for city, q in cities.items():
        for t in ("2026-06-21T11:30:00Z", "2026-11-12T22:30:00Z"):
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(f"{BASE}?{q}&t={t}", wait_until="load", timeout=90000)
            page.wait_for_timeout(2500)
            page.locator(".telemetry").screenshot(path=f"{OUT}/telemetry-{city}-{t[:10]}.png")
            name = page.locator(".location-name").inner_text()
            if errors:
                failures.append(f"{city}: page errors {errors[:2]}")
            print(city, t, name)
            ctx.close()

    # Location permission granted and denied
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, permissions=["geolocation"], geolocation={"latitude": 48.8566, "longitude": 2.3522}, timezone_id="Europe/Paris")
    page = ctx.new_page()
    page.goto(BASE, wait_until="load", timeout=90000)
    page.wait_for_timeout(1500)
    if page.locator(".location-name").inner_text() != "Your location":
        failures.append("granted permission: device location not used automatically")
    ctx.close()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, timezone_id="Europe/Paris")
    page = ctx.new_page()
    page.goto(BASE, wait_until="load", timeout=90000)
    page.wait_for_timeout(1000)
    if "Approximate" not in page.locator(".location-meta").inner_text():
        failures.append("no permission: approximate location not labelled")
    page.get_by_role("button", name="Use my location").click()
    page.wait_for_timeout(1500)
    if page.locator(".location-note").count() == 0:
        failures.append("denied permission: no explanation shown")
    page.get_by_label("City").select_option("Sydney")
    page.wait_for_timeout(500)
    if page.locator(".location-name").inner_text() != "Sydney":
        failures.append("city selection failed")
    # Playback: one year per second should advance the year
    y0 = int(page.get_by_role("spinbutton", name="Year").input_value())
    page.get_by_role("radio", name="1 year/s").click()
    page.wait_for_timeout(2600)
    y1 = int(page.get_by_role("spinbutton", name="Year").input_value())
    if y1 - y0 < 2:
        failures.append(f"playback at 1 year/s moved {y1 - y0} years in 2.6 s")
    page.screenshot(path=f"{OUT}/iphone-playback.png")
    ctx.close()

    browser.close()

if failures:
    print("\nFAILURES")
    for f in failures:
        print(" -", f)
    sys.exit(1)
print("\nAll alignment checks passed.")
