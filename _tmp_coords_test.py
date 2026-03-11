"""Check GROBID coordinates with repeated teiCoordinates params."""
import httpx, re

base = r"C:\Users\Ciaran\Documents\GitHub\research-os-api"
store = base + r"\publication_files_store"
pdf_path = store + r"\5e982a43-63ff-4d2d-ad30-ace2eeceac21\758ba871-b3e8-4ae3-86b2-e97a207d733e\24613639-0427-4b2b-8181-4a3b2f02a4f9.pdf"

with open(pdf_path, 'rb') as f:
    content = f.read()

timeout = httpx.Timeout(120.0)
with httpx.Client(timeout=timeout, follow_redirects=True, headers={"Accept": "application/xml"}) as client:
    # Use multipart fields directly for repeated params
    fields = {
        "consolidateHeader": "0",
        "consolidateCitations": "0",
        "teiCoordinates": "figure",
    }
    response = client.post("http://localhost:8070/api/processFulltextDocument",
        data=fields,
        files={"input": ("paper.pdf", content, "application/pdf")})
    tei = response.text

coord_count = len(re.findall(r'coords="', tei))
print(f"TEI size: {len(tei)} chars, coords attributes: {coord_count}")

# Show samples
for i, m in enumerate(re.finditer(r'<(\w+)[^>]*coords="([^"]+)"', tei)):
    tag = m.group(1)
    coords = m.group(2)
    print(f"  [{tag}] coords: {coords[:150]}")
    if i >= 5:
        break

# Specifically check figure elements
from xml.etree import ElementTree as ET
ns = {'tei': 'http://www.tei-c.org/ns/1.0'}
root = ET.fromstring(tei.encode('utf-8'))

print(f"\n=== FIGURES WITH COORDS ===")
for fig in root.iter('{http://www.tei-c.org/ns/1.0}figure'):
    coords = fig.get('coords', '')
    fig_type = fig.get('type', 'figure')
    head = fig.find('tei:head', ns)
    head_text = (head.text or '') if head is not None else ''
    label = fig.find('tei:label', ns)
    label_text = (label.text or '') if label is not None else ''
    print(f"  [{fig_type}] {head_text or label_text or '(unlabeled)'}")
    print(f"    coords: {coords[:200] if coords else '(NONE)'}")

# Also try extracting images with PyMuPDF
import fitz
doc = fitz.open(pdf_path)
print(f"\n=== PyMuPDF EMBEDDED IMAGES ===")
total_images = 0
for page_num in range(doc.page_count):
    page = doc[page_num]
    images = page.get_images(full=True)
    if images:
        print(f"  Page {page_num+1}: {len(images)} images")
        for img in images[:3]:
            xref = img[0]
            img_info = doc.extract_image(xref)
            ext = img_info.get('ext', '?')
            w = img_info.get('width', 0)
            h = img_info.get('height', 0)
            size = len(img_info.get('image', b''))
            print(f"    xref={xref} {w}x{h} {ext} ({size/1024:.1f}KB)")
        total_images += len(images)
doc.close()
print(f"  Total embedded images: {total_images}")
