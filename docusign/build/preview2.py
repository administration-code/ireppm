import json, sys, io, base64
import pypdf
from reportlab.pdfgen import canvas
d = json.load(open(sys.argv[1])); out = sys.argv[2]
cols = [(0,0,1),(0.8,0,0.6),(0,0.5,0.5),(0.6,0.3,0)]
w = pypdf.PdfWriter()
for doc in d['documents']:
    pdf = pypdf.PdfReader(io.BytesIO(base64.b64decode(doc['documentBase64'])))
    for pi, page in enumerate(pdf.pages):
        b = io.BytesIO(); c = canvas.Canvas(b, pagesize=(612, 792))
        for si, s in enumerate(d['recipients']['signers']):
            col = cols[si % 4]
            for kind, lst in s.get('tabs', {}).items():
                for t in lst:
                    if t['documentId'] != doc['documentId'] or int(t['pageNumber']) != pi + 1: continue
                    x = float(t['xPosition']); y = 792 - float(t['yPosition'])
                    c.setStrokeColorRGB(*col); c.setFillColorRGB(*col)
                    if kind == 'textTabs':
                        wd, ht = float(t['width']), float(t['height']); c.rect(x, y - ht, wd, ht)
                        c.setFont('Helvetica', 6); c.drawString(x + 2, y - 7, t['tabLabel'])
                    elif kind == 'checkboxTabs':
                        c.rect(x, y - 10, 10, 10, fill=1); c.setFont('Helvetica', 5); c.drawString(x + 12, y - 7, t['tabLabel'])
                    else:
                        c.rect(x, y - 22, 110 if kind == 'signHereTabs' else 70, 22)
                        c.setFont('Helvetica', 7); c.drawString(x + 2, y - 13, s['roleName'] + ': ' + t['tabLabel'])
        c.showPage(); c.save(); b.seek(0)
        page.merge_page(pypdf.PdfReader(b).pages[0]); w.add_page(page)
w.write(out)
