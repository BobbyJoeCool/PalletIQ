"""Generate the PalletIQ Desktop App manual test checklist — both formats.

Writes PalletIQ-Desktop-Manual-Checklist.docx (printable, one page per screen) and
rewrites the SCREENS array inside PalletIQ-Desktop-Manual-Checklist.html (interactive),
so the two can never drift apart. Edit SCREENS here and re-run:

    python3 Documentation/gen_desktop_checklist.py

Same layout and status key as the floor app's checklist (gen_checklist.py). Demo
accounts are in Documentation/seed-reference.md (Roman roster; desktop password
Desktop1234). Screen specs: Documentation/ScreenSpecs/Desktop-*.md.
"""

import json
import re
from pathlib import Path

from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn

doc = Document()

# -- Page setup: landscape for wider tables
for section in doc.sections:
    section.orientation = 1  # landscape
    section.page_width = Cm(29.7)
    section.page_height = Cm(21.0)
    section.top_margin = Cm(1.5)
    section.bottom_margin = Cm(1.5)
    section.left_margin = Cm(1.5)
    section.right_margin = Cm(1.5)

# -- Styles
style = doc.styles['Normal']
font = style.font
font.name = 'Calibri'
font.size = Pt(9)

# -- Title page
doc.add_paragraph()
doc.add_paragraph()
title = doc.add_paragraph('PalletIQ Desktop App')
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
for run in title.runs:
    run.font.size = Pt(28)
    run.font.bold = True

subtitle = doc.add_paragraph('Manual Test Checklist')
subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
for run in subtitle.runs:
    run.font.size = Pt(18)

doc.add_paragraph()
legend = doc.add_paragraph()
legend.alignment = WD_ALIGN_PARAGRAPH.CENTER
legend.add_run('Status Key:  ').bold = True
legend.add_run('✓ Works    ✗ Doesn\'t Work    — Not Tested    ? Partial Works')
for run in legend.runs:
    run.font.size = Pt(12)

doc.add_paragraph()
info = doc.add_paragraph()
info.alignment = WD_ALIGN_PARAGRAPH.CENTER
info.add_run('Tester: ____________________    Date: ____________________    Version: ____________________')
for run in info.runs:
    run.font.size = Pt(11)

doc.add_page_break()

# -- Screen data: (screen_code, screen_name, test_items)
SCREENS = [
    ("LOGIN", "Desktop Sign-in", [
        "App opens to the sign-in screen when no session is stored",
        "LWW (z930l01 / Desktop1234) signs in; Home greets them by first name",
        "Header shows name, zNumber and role label (LWW / OM / System Admin)",
        "zNumber is accepted in upper or lower case",
        "Wrong password: 'Incorrect password.', password box clears, zNumber kept",
        "Team member (e.g. z830t01): 'does not have desktop access' — shown before any password check",
        "ICQA member below LEAD (home department IQA) can sign in",
        "Unknown zNumber: 'No team member found for that zNumber.'",
        "Eligible user with no password set: 'No desktop password has been set…'",
        "API stopped: sign-in shows 'Check that the API is running'",
        "Sign out returns to the sign-in screen",
        "Close and reopen the app while signed in: still signed in",
        "Session ends on its own when the 12-hour token expires",
    ]),
    ("SHELL", "Shell / Navigation", [
        "Side nav lists Home and every Manager screen",
        "Only unbuilt screens (DPCI Setup Edit, Hung Pallet/Location Resolution) show a Soon tag",
        "Unbuilt screen opens a Coming Soon page naming its issue number",
        "Home shows one card per screen; built screens say Open",
        "Floor App button is always visible in the header",
        "Version shows at the bottom of the nav",
        "Window keeps its minimum size; each region scrolls on its own, the window does not",
    ]),
    ("FLOOR", "Embedded Floor App", [
        "Floor App button opens the floor app in a window over the current page",
        "Floor app opens on its Home screen, signed in as the desktop user — no badge/PIN",
        "On-screen keypad / keyboard and their footer toggles are not shown",
        "Typing on the physical keyboard fills the active field (digits; letters only in keyboard fields)",
        "Enter confirms, Backspace deletes, Delete clears, Tab / Shift+Tab move fields, Esc leaves the field",
        "A USB scanner scan is delivered whole to the active field",
        "Minimize hides the window; the desktop page underneath is usable",
        "Close hides the window; header button shows a green dot while it runs hidden",
        "Reopening returns to the same floor screen with in-progress entries intact",
        "Floor app's own Logout returns to its Home, still signed in",
        "Signing out of the desktop app ends the floor app; next sign-in starts it fresh",
        "Floor app dev server stopped: window shows 'could not be reached' with Retry",
        "No idle logout inside the embedded floor app",
    ]),
    ("AUDIT", "Audit Tool", [
        "Three empty panes, each with its own type and identifier",
        "Location lookup (8 digits, with or without dashes) shows summary and trail",
        "Pallet ID lookup shows summary, activity and container events",
        "DPCI lookup (with or without dashes) shows item setup and trail",
        "Container ID lookup shows the same history CII shows",
        "zNumber lookup (any case) shows activity and scan-log entries; no credentials shown",
        "Aisle lookup with bin and/or level range merges every matching location's trail",
        "Inverted or non-numeric range: 'not a valid identifier'",
        "Not found: 'No record found.' — other panes untouched",
        "Identifiers in summaries and trails are highlighted chips",
        "Dragging a chip onto a pane loads that record there",
        "Clicking a chip opens 'Open in Pane 1/2/3'; choosing one loads it",
        "A pane filled by a chip shows that type and identifier in its form",
        "Over 500 history entries: pane says older history is not shown",
        "Pane Print prints only that pane, light background, no app chrome",
        "Print All prints every filled pane as sections",
        "Pane Export saves a one-sheet .xlsx; Export All saves one workbook, a sheet per pane",
        "A team member's session cannot use the Audit Tool API (403)",
    ]),
    ("LSE-ZONE", "Location Setup — Zone Setup", [
        "Aisle picker lists every live aisle",
        "Grid: zones 1–4 left to right, Odd/Even columns, top level at the top",
        "Each cell shows storage code · size; a cell with carve-outs shows an XO count",
        "Click selects one cell; drag selects a rectangle; Shift-click a range; Ctrl/Cmd-click toggles",
        "Level and side headings select the row / column; All selects every cell",
        "Storage code and size pickers start at NO CHANGE; Apply disabled until one changes",
        "Apply changes only the chosen attribute(s) on every selected cell",
        "Apply over a cell holding freight: confirmation lists up to 10 locations; Cancel changes nothing",
        "Apply anyway updates the cells; stored pallets keep their own codes",
        "Not For Storage (XO) is never offered as a zone storage code",
        "Selecting one cell lists its locations with status, pallets and contraction",
        "Not For Storage… is disabled on a location that isn't empty",
        "Carve-out requires a reason; Other requires a note",
        "Carved-out location shows its reason in the cell list and the aisle's Not For Storage list",
        "LWW: Restore is disabled / absent",
        "OM or ICQA: Restore puts back the zone's storage code",
        "Floor app: ELZ cell for that zone still shows the zone's code, not XO",
        "Floor app: Manual Put and Pallet Reinstate refuse the XO location for every role",
        "Floor app: Stage Aisle never suggests the XO location",
    ]),
    ("LSE-CON", "Location Setup — Contraction", [
        "Contraction tab tints cells: dark red fully contracted, lighter when partly",
        "Summary shows contracted locations out of the aisle's total",
        "All floor locations selects level 1 of every zone-side",
        "All top locations selects each zone-side's top level",
        "On a Half Small / Extra Small top level, the preset selects the top 3 levels",
        "Split aisle (e.g. x08/x09): top preset follows each side's own height",
        "Contract / Open apply to the selection",
        "Contracting a location that holds a pallet is allowed",
        "One cell selected: each location has its own Contract / Open",
        "Floor app: contracted locations are excluded from putaway and staging as before",
    ]),
    ("LSE-AISLE", "Location Setup — New / Delete Aisle", [
        "LWW does not see New aisle or Delete aisle",
        "OM / ICQA / Admin: New aisle opens the form",
        "Zone ranges fill as an even split; uneven counts give the extra bins to the zones nearest Zone 1",
        "Zone ranges can be edited; Reset to even split undoes edits",
        "Zone direction: default Zone 1 at the highest bins; reversed puts Zone 1 at the lowest",
        "First bin can be any number (e.g. 41)",
        "Single-sided (odd only / even only) aisle creates only that side's bins",
        "Levels set per side; + Level copies the top level; − Level removes the top",
        "Zone override gives one zone-side its own level list",
        "Preview grid and location count update live; Create disabled with the first problem shown",
        "Existing aisle number refused ('already exists')",
        "Create opens the new aisle; every location EMPTY with its zone's code and size",
        "New aisle works on the floor (LII, ELZ, putaway)",
        "Delete aisle with any non-empty location: refused, lists up to 10",
        "Delete an empty aisle: hidden from the picker and every floor lookup",
        "Re-creating a deleted aisle number works",
    ]),
    ("JFA", "Job/Function Assignment", [
        "LWW / OM / Admin can open it; ICQA below LEAD and team members cannot",
        "Opens on today and the viewer's home shift; on a non-home day, that date's day shift",
        "Date picker and Day/Night toggle switch the roster",
        "Roster lists the department's team members scheduled for the shift (simulated myTime)",
        "Some workers have short days; their bar is dimmed after their scheduled end",
        "RAMP badge with function and percent on ramping workers",
        "Header shows each function: needs (target ÷ (rate × shift hours)), staffed, forecast vs target",
        "Ramping workers count at their percent: staffed shows an 'eff.' figure; forecast drops to match",
        "Staffing figures follow the pointer's time over a bar; else now / shift start",
        "Shift-click selects a range of names; Ctrl/Cmd-click toggles one",
        "Function click with workers selected fills their unassigned time",
        "Workers with assigned time: dialog lists each with Override; Override all / Ignore all work",
        "Override replaces the worker's whole scheduled time; Ignore only fills gaps",
        "Downtime / Time Off ask for the reason first; Other needs a note",
        "Function click with nobody selected calls up who worked it (they sort to the top, others dim)",
        "Dragging a section edge snaps to 15 minutes; a shared divider moves both sections",
        "Typing an earlier start extends the first section; a later start leaves that time unassigned",
        "Typing an earlier finish leaves the end unassigned and flags ⚠",
        "Unassigned scheduled time shows hatched; clicking it opens assign",
        "Click a section: edit function, reason, times, or Clear section",
        "Double-click a bar: split dialog starts at the clicked time, before/after doing the same thing",
        "Split: change split time, before start/function, after end/function; Confirm / Cancel",
        "Attendance codes (VLE, VNS, COF, VAC, SCK, LOA, OTH) show on the bar",
        "Night shift (A2/B2) times past midnight land on the next day",
        "Every save shows 'Saved'; a rejected save shows the reason and changes nothing",
        "IRP on the floor still reports the worker's assigned hours correctly",
    ]),
    ("PGD", "Prod Goal / Ramping / Daily Plan", [
        "LWW / OM / Admin can open it; ICQA below LEAD cannot",
        "Daily Plan: date and Day/Night shift selection",
        "Daily Drop shows simulated volume for CA, CF, FP, BKP, BK",
        "Staffing: scheduled, minus whole-shift Time Off by code, net available",
        "Partial Time Off (e.g. VLE) does not reduce net available",
        "Other departments show net headcount and their targets only",
        "Blank target shows the simulated target as its placeholder",
        "Needs updates live as a target is typed (18,000 CA cartons at 180/hr, 10-hour shift → 10)",
        "Functions without a goal (GPM, CON) have no target box",
        "Save targets; the roster then uses the entered target",
        "Clearing a target and saving returns to the simulated one",
        "Ramping: add with worker type-ahead, function, percent, start, optional end",
        "Percent outside 1–99 refused; overlapping override for the same worker + function refused",
        "Edit percent in place; End today; Remove",
        "Upcoming override marked 'upcoming'",
        "LWW sees prod goals as view only (no Change)",
        "OM / Admin: Change sets a rate from today or a future date",
        "Back-dated goal change refused",
        "Future change listed under Scheduled changes; today's rate unchanged until then",
        "Cancel removes a scheduled change",
        "History lists past rates",
        "IRP and the roster use the rate in force on the date being viewed",
    ]),
    ("TPS", "Team Prod Summary", [
        "Every desktop user can open it, ICQA included",
        "ICQA (no function list) sees WHS with a note",
        "Opens on today and the home shift; live view says 'as of' and refreshes each minute",
        "Past shift is a static snapshot as of its end",
        "Pull and production cards show staffed (with ramping count) and plan (marked simulated if not entered)",
        "Team Prod gauge: actual rate vs ramping-weighted standard, percent and units/hr",
        "% to Plan gauge: actual / target units; colour judged against how much of the shift has passed",
        "Pull cards show Est. finish during the shift",
        "Est. finish after the shift end shows amber with '+Xh Ym'",
        "BKP and BK cards say output is not tracked yet",
        "GPM and CON cards show pallets so far and per hour",
        "Downtime card shows headcount",
        "Expand shows each worker's hours, count, rate and % to goal, with RAMP badges",
        "% to goal is against the ramping-adjusted goal (65% ramp at 117/hr of 180 reads 100%)",
        "Expanded rows are ordered by % to goal, highest first",
        "% to goal is green at 100%+, blends toward red, and is full red at 60% or below",
        "Downtime expands to names with hours",
        "Figures match IRP for the same worker and function (except % to goal for ramping workers)",
    ]),
]


def set_cell_shading(cell, color_hex):
    """Set cell background color."""
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shading = tcPr.makeelement(qn('w:shd'), {
        qn('w:fill'): color_hex,
        qn('w:val'): 'clear',
    })
    tcPr.append(shading)


def add_screen_page(screen_code, screen_name, items):
    # Header
    heading = doc.add_heading(f'{screen_code} — {screen_name}', level=1)
    heading.runs[0].font.color.rgb = RGBColor(0x1A, 0x1A, 0x2E)

    # Info line
    info = doc.add_paragraph()
    info.add_run('Tester: ____________    Date: ____________    Version: ____________').font.size = Pt(9)

    # Table: # | Test Item | Status | Comments
    table = doc.add_table(rows=1, cols=4)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True

    # Set column widths
    widths = [Cm(0.8), Cm(16), Cm(2.5), Cm(6)]
    for i, width in enumerate(widths):
        table.columns[i].width = width

    # Header row
    header_cells = table.rows[0].cells
    headers = ['#', 'Test Item', 'Status', 'Comments']
    for i, (cell, text) in enumerate(zip(header_cells, headers)):
        cell.text = text
        for p in cell.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for run in p.runs:
                run.font.bold = True
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        set_cell_shading(cell, '1A1A2E')

    # Data rows
    for idx, item in enumerate(items, 1):
        row = table.add_row()
        cells = row.cells

        # Number
        cells[0].text = str(idx)
        cells[0].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER

        # Test item
        cells[1].text = item

        # Status (empty, to be filled: checkmark/x/dash/?)
        cells[2].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER

        # Comments (empty)
        # leave blank

        # Style all cells
        for cell in cells:
            for p in cell.paragraphs:
                for run in p.runs:
                    run.font.size = Pt(9)

        # Alternate row shading
        if idx % 2 == 0:
            for cell in cells:
                set_cell_shading(cell, 'F0F0F5')


# Generate all screen pages
for i, (code, name, items) in enumerate(SCREENS):
    add_screen_page(code, name, items)
    if i < len(SCREENS) - 1:
        doc.add_page_break()

# Save
here = Path(__file__).resolve().parent
docx_path = here / 'PalletIQ-Desktop-Manual-Checklist.docx'
doc.save(docx_path)
print(f'Saved to {docx_path}')

# Rewrite the HTML checklist's SCREENS array from the same list.
html_path = here / 'PalletIQ-Desktop-Manual-Checklist.html'
html = html_path.read_text(encoding='utf-8')
block = 'const SCREENS = [\n  // GENERATED by Documentation/gen_desktop_checklist.py — edit the list there, not here.\n'
block += ''.join(f'  {json.dumps([code, name, items], ensure_ascii=False)},\n' for code, name, items in SCREENS)
block += '];\n'
html, count = re.subn(r'const SCREENS = \[\n.*?\n\];\n', lambda _: block, html, count=1, flags=re.S)
if count != 1:
    raise SystemExit('SCREENS array not found in the HTML checklist')
html_path.write_text(html, encoding='utf-8')
print(f'Updated {html_path}')
