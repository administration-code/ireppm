"""Build 'Consent to Service by Email (2 pages)': the LTB form for Tenant 1 + a page for Tenants 2-8."""
import io, pypdf
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
U = "/root/.claude/uploads/2381269b-ca4b-59d5-8f40-7d48650787bf/"
OUT = "consent_multi.pdf"
ROW_TOP, ROW_H = 150, 82          # first row top (from page top) and row height, in points
COLS = [("Rent increase", 300), ("Notice of entry", 352), ("LTB documents", 404), ("Tenancy communication", 456)]

b = io.BytesIO(); c = canvas.Canvas(b, pagesize=(612, 792)); H = 792
c.setFont("Helvetica-Bold", 14); c.drawString(36, H - 50, "Consent to Service by Email: additional tenants")
c.setFont("Helvetica", 9.5)
lines = [
  "This page continues the Landlord and Tenant Board's Consent to Service by Email form for the same rental unit.",
  "Each tenant below agrees to receive the notices and documents ticked in their row by email at the email address",
  "shown, on the same terms as the previous page. Consent can be revoked at any time by giving written notice.",
]
for i, t in enumerate(lines): c.drawString(36, H - 72 - i * 13, t)
c.setFont("Helvetica-Bold", 8)
c.drawString(36, H - ROW_TOP + 14, "Tenant name and email")
for label, x in COLS:
    c.saveState(); c.translate(x + 4, H - ROW_TOP + 6); c.rotate(35); c.drawString(0, 0, label); c.restoreState()
c.drawString(510, H - ROW_TOP + 14, "")
c.setStrokeColor(HexColor("#999999"))
for i in range(7):
    top = ROW_TOP + i * ROW_H
    y = H - top
    c.setFont("Helvetica-Bold", 9); c.drawString(36, y - 12, f"Tenant {i + 2}")
    c.setFont("Helvetica", 7.5); c.setFillColor(HexColor("#666666"))
    c.drawString(36, y - 24, "Name"); c.drawString(36, y - 44, "Email"); c.setFillColor(HexColor("#000000"))
    c.line(66, y - 26, 290, y - 26); c.line(66, y - 46, 290, y - 46)
    for _, x in COLS: c.rect(x + 8, y - 30, 11, 11)
    c.setFont("Helvetica", 7.5); c.setFillColor(HexColor("#666666"))
    c.drawString(36, y - 70, "Signature"); c.drawString(400, y - 70, "Date (dd/mm/yyyy)"); c.setFillColor(HexColor("#000000"))
    c.line(80, y - 72, 380, y - 72); c.line(470, y - 72, 576, y - 72)
    c.line(36, y - ROW_H + 4, 576, y - ROW_H + 4)
c.setFont("Helvetica", 7); c.setFillColor(HexColor("#666666"))
c.drawString(36, 28, "Rows for tenants not on this lease are left blank.")
c.showPage(); c.save(); b.seek(0)

r = pypdf.PdfReader(U + "703a9c8d-Email_Service_Consent.pdf"); r.decrypt("")
w = pypdf.PdfWriter(); w.add_page(r.pages[0]); w.add_page(pypdf.PdfReader(b).pages[0])
w.write(OUT); print("wrote", OUT)
