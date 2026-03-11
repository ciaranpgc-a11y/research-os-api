"""Check GROBID TEI coordinates for figures and tables."""
import os, sys, re
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

import httpx
from xml.etree import ElementTree as ET

base = r"C:\Users\Ciaran\Documents\GitHub\research-os-api"
store = os.path.join(base, "publication_files_store")

# BMJ PREFER-CMR paper
pdf_path = os.path.join(store, r"5e982a43-63ff-4d2d-ad30-ace2eeceac21\758ba871-b3e8-4ae3-86b2-e97a207d733e\24613639-0427-4b2b-8181-4a3b2f02a4f9.pdf")

print("Sending to GROBID with teiCoordinates...")
with open(pdf_path, 'rb') as f:
    content = f.read()

timeout = httpx.Timeout(120.0)
with httpx.Client(timeout=timeout, follow_redirects=True, headers={"Accept":"application/xml"}) as client:
    response = client.post("http://localhost:8070/api/processFulltextDocument",
        data={
            "consolidateHeader": "0",
            "consolidateCitations": "0",
            "includeRawCitations": "1",
            "teiCoordinates": "head,p,s,ref,biblStruct,formula,figure,table",
        },
        files={"input": ("paper.pdf", content, "application/pdf")})
    tei = response.text

print(f"TEI size: {len(tei)} chars")

ns = {'tei': 'http://www.tei-c.org/ns/1.0'}
root = ET.fromstring(tei.encode('utf-8'))

# Find all figure elements with coordinates
print("\n=== FIGURES ===")
for fig in root.iter('{http://www.tei-c.org/ns/1.0}figure'):
    fig_type = fig.get('type', 'figure')
    fig_id = fig.get('{http://www.w3.org/XML/1998/namespace}id', '?')
    coords = fig.get('coords', '')
    
    head = fig.find('tei:head', ns)
    head_text = head.text if head is not None else '(no head)'
    
    label = fig.find('tei:label', ns)
    label_text = label.text if label is not None else '(no label)'
    
    desc = fig.find('tei:figDesc', ns)
    desc_text = (''.join(desc.itertext()) if desc is not None else '(no desc)')[:100]
    
    # Check for table element inside
    table_el = fig.find('tei:table', ns)
    has_table = table_el is not None
    
    print(f"\n  [{fig_type}] id={fig_id} label={label_text}")
    print(f"  head: {head_text}")
    print(f"  desc: {desc_text}...")
    print(f"  coords: {coords[:200] if coords else '(NONE)'}")
    if has_table:
        rows = table_el.findall('tei:row', ns)
        print(f"  TABLE: {len(rows)} rows")
        for i, row in enumerate(rows[:3]):
            cells = row.findall('tei:cell', ns)
            cell_texts = [(''.join(c.itertext()))[:30] for c in cells[:5]]
            print(f"    row{i}: {cell_texts}")
        if len(rows) > 3:
            print(f"    ... ({len(rows)-3} more rows)")

# Also check if coords appear on paragraph elements
print("\n=== SAMPLE P COORDS ===")
for i, p in enumerate(root.iter('{http://www.tei-c.org/ns/1.0}p')):
    coords = p.get('coords', '')
    if coords and i < 3:
        print(f"  P#{i} coords: {coords[:200]}")

print("\nDone!")
