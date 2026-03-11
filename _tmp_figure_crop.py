"""Test figure cropping via GROBID coordinates + PyMuPDF."""
import httpx, fitz, os
from xml.etree import ElementTree as ET

pdf_path = r"C:\Users\Ciaran\Documents\GitHub\research-os-api\publication_files_store\5e982a43-63ff-4d2d-ad30-ace2eeceac21\758ba871-b3e8-4ae3-86b2-e97a207d733e\24613639-0427-4b2b-8181-4a3b2f02a4f9.pdf"
out_dir = r"C:\Users\Ciaran\Documents\GitHub\research-os-api\_tmp_figures"
os.makedirs(out_dir, exist_ok=True)

# Get GROBID TEI with coordinates
with open(pdf_path, 'rb') as f:
    content = f.read()

timeout = httpx.Timeout(120.0)
ns = {'tei': 'http://www.tei-c.org/ns/1.0'}

with httpx.Client(timeout=timeout, follow_redirects=True, headers={"Accept": "application/xml"}) as client:
    response = client.post("http://localhost:8070/api/processFulltextDocument",
        data={"consolidateHeader": "0", "consolidateCitations": "0", "teiCoordinates": "figure"},
        files={"input": ("paper.pdf", content, "application/pdf")})
    tei = response.text

root = ET.fromstring(tei.encode('utf-8'))
doc = fitz.open(pdf_path)

fig_idx = 0
for fig in root.iter('{http://www.tei-c.org/ns/1.0}figure'):
    fig_type = fig.get('type', 'figure')
    if fig_type == 'table':
        continue
    
    coords = fig.get('coords')
    head = fig.find('tei:head', ns)
    head_text = head.text if head is not None else '(no heading)'
    label = fig.find('tei:label', ns)
    label_text = label.text if label is not None else ''
    
    # Also check for <graphic> child with coords
    graphic = fig.find('tei:graphic', ns)
    graphic_coords = graphic.get('coords') if graphic is not None else None
    
    if not coords and not graphic_coords:
        print(f"  SKIP {head_text} - no coordinates")
        continue
    
    fig_idx += 1
    
    # Parse coordinates - format: page,x,y,width,height
    # GROBID may have multiple coordinate sets separated by ;
    coord_str = graphic_coords or coords
    for coord_part in coord_str.split(';'):
        parts = coord_part.strip().split(',')
        if len(parts) < 5:
            continue
        page_num = int(parts[0]) - 1  # 0-indexed
        x = float(parts[1])
        y = float(parts[2])
        w = float(parts[3])
        h = float(parts[4])
        
        rect = fitz.Rect(x, y, x + w, y + h)
        page = doc[page_num]
        
        # Render at 2x resolution for quality
        mat = fitz.Matrix(2, 2)
        pix = page.get_pixmap(matrix=mat, clip=rect)
        
        fname = f"fig{fig_idx}_p{page_num+1}_{label_text or 'unlabeled'}.png"
        fpath = os.path.join(out_dir, fname)
        pix.save(fpath)
        
        print(f"Figure {fig_idx}: {head_text}")
        print(f"  Label: {label_text}")
        print(f"  Coords: page={page_num+1}, x={x:.1f}, y={y:.1f}, w={w:.1f}, h={h:.1f}")
        print(f"  Cropped: {pix.width}x{pix.height} px")
        print(f"  Saved: {fname} ({os.path.getsize(fpath)//1024} KB)")
        print()

doc.close()
print(f"Total figures extracted: {fig_idx}")
print(f"Output directory: {out_dir}")
