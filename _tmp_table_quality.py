"""Examine GROBID table structure quality."""
import httpx, re
from xml.etree import ElementTree as ET

base = r"C:\Users\Ciaran\Documents\GitHub\research-os-api"
store = base + r"\publication_files_store"
pdf_path = store + r"\5e982a43-63ff-4d2d-ad30-ace2eeceac21\758ba871-b3e8-4ae3-86b2-e97a207d733e\24613639-0427-4b2b-8181-4a3b2f02a4f9.pdf"

with open(pdf_path, 'rb') as f:
    content = f.read()

timeout = httpx.Timeout(120.0)
with httpx.Client(timeout=timeout, follow_redirects=True, headers={"Accept": "application/xml"}) as client:
    response = client.post("http://localhost:8070/api/processFulltextDocument",
        data={"consolidateHeader": "0", "consolidateCitations": "0", "teiCoordinates": "figure"},
        files={"input": ("paper.pdf", content, "application/pdf")})
    tei = response.text

ns = {'tei': 'http://www.tei-c.org/ns/1.0'}
root = ET.fromstring(tei.encode('utf-8'))

for fig in root.iter('{http://www.tei-c.org/ns/1.0}figure'):
    fig_type = fig.get('type', 'figure')
    if fig_type != 'table':
        continue
    head = fig.find('tei:head', ns)
    head_text = head.text if head is not None else '?'
    
    table = fig.find('tei:table', ns)
    if table is None:
        print(f"\n{head_text}: NO TABLE ELEMENT")
        continue
    
    rows = table.findall('tei:row', ns)
    print(f"\n{'='*80}")
    print(f"{head_text} — {len(rows)} rows")
    print(f"{'='*80}")
    
    for i, row in enumerate(rows):
        role = row.get('role', '')
        cells = row.findall('tei:cell', ns)
        cell_data = []
        for c in cells:
            text = ''.join(c.itertext()).strip()
            cols = c.get('cols', '1')
            role_c = c.get('role', '')
            if cols != '1' or role_c:
                cell_data.append(f"[{text}](cols={cols},role={role_c})")
            else:
                cell_data.append(text[:30])
        row_label = f" ({role})" if role else ""
        print(f"  Row {i}{row_label}: {cell_data}")
        if i > 15:
            print(f"  ... ({len(rows)-i-1} more rows)")
            break

# Now compare: how does the actual PDF table look?
import fitz
doc = fitz.open(pdf_path)
# Table 1 is on page 4 per GROBID coords (4,44.50,54.00,510.21,272.16)
page = doc[3]  # 0-indexed
print(f"\n{'='*80}")
print(f"PDF Page 4 text (where Table 1 is):")
print(f"{'='*80}")
text = page.get_text("text")
# Just show table region
lines = text.split('\n')
for i, line in enumerate(lines):
    if 'Table' in line or 'Not similar' in line or 'Similar' in line:
        for l in lines[max(0,i-1):min(len(lines),i+20)]:
            print(f"  {l}")
        break
doc.close()
