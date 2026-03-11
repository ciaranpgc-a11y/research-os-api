"""Compare GROBID vs Docling table extraction quality."""
import time

pdf_path = r"C:\Users\Ciaran\Documents\GitHub\research-os-api\publication_files_store\5e982a43-63ff-4d2d-ad30-ace2eeceac21\758ba871-b3e8-4ae3-86b2-e97a207d733e\24613639-0427-4b2b-8181-4a3b2f02a4f9.pdf"

# --- GROBID TABLE QUALITY ---
print("=" * 80)
print("GROBID TABLE EXTRACTION")
print("=" * 80)

import httpx
from xml.etree import ElementTree as ET

with open(pdf_path, 'rb') as f:
    content = f.read()

ns = {'tei': 'http://www.tei-c.org/ns/1.0'}
timeout = httpx.Timeout(120.0)
with httpx.Client(timeout=timeout, follow_redirects=True, headers={"Accept": "application/xml"}) as client:
    response = client.post("http://localhost:8070/api/processFulltextDocument",
        data={"consolidateHeader": "0", "consolidateCitations": "0", "teiCoordinates": "figure"},
        files={"input": ("paper.pdf", content, "application/pdf")})
    tei = response.text

root = ET.fromstring(tei.encode('utf-8'))
for fig in root.iter('{http://www.tei-c.org/ns/1.0}figure'):
    if fig.get('type') != 'table':
        continue
    head = fig.find('tei:head', ns)
    head_text = head.text if head is not None else '?'
    table = fig.find('tei:table', ns)
    if table is None:
        print(f"\n{head_text}: NO TABLE ELEMENT")
        continue
    rows = table.findall('tei:row', ns)
    print(f"\n--- {head_text} ({len(rows)} rows) ---")
    for i, row in enumerate(rows):
        cells = row.findall('tei:cell', ns)
        cell_texts = [''.join(c.itertext()).strip()[:40] for c in cells]
        print(f"  Row {i}: {cell_texts}")
        if i >= 20:
            print(f"  ... {len(rows)-i-1} more rows")
            break

# --- DOCLING TABLE QUALITY ---
print("\n" + "=" * 80)
print("DOCLING TABLE EXTRACTION")
print("=" * 80)

t0 = time.time()
from docling.document_converter import DocumentConverter

converter = DocumentConverter()
result = converter.convert(pdf_path)

elapsed = time.time() - t0
print(f"Docling conversion took {elapsed:.1f}s")

doc = result.document

# Find tables
table_count = 0
for item in doc.tables:
    table_count += 1
    # Get export as markdown and HTML
    table_md = item.export_to_markdown()
    table_html = item.export_to_html() if hasattr(item, 'export_to_html') else None
    
    print(f"\n--- Docling Table {table_count} ---")
    if hasattr(item, 'caption_text'):
        print(f"Caption: {item.caption_text(doc)[:100] if item.caption_text(doc) else 'none'}")
    print(f"Markdown:\n{table_md[:2000]}")
    if table_html:
        print(f"\nHTML (first 500 chars):\n{table_html[:500]}")

if table_count == 0:
    print("No tables found by Docling!")
    # Try iterating through document elements
    for el in doc.iterate_items():
        print(f"  Element type: {type(el).__name__}")

print(f"\nTotal Docling tables: {table_count}")
