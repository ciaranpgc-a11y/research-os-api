"""Check where figure legends actually appear in the structured paper output."""
import httpx
from xml.etree import ElementTree as ET

pdf_path = r"C:\Users\Ciaran\Documents\GitHub\research-os-api\publication_files_store\5e982a43-63ff-4d2d-ad30-ace2eeceac21\758ba871-b3e8-4ae3-86b2-e97a207d733e\24613639-0427-4b2b-8181-4a3b2f02a4f9.pdf"

with open(pdf_path, 'rb') as f:
    content = f.read()

timeout = httpx.Timeout(120.0)
ns = {'tei': 'http://www.tei-c.org/ns/1.0'}

with httpx.Client(timeout=timeout, follow_redirects=True, headers={"Accept": "application/xml"}) as client:
    response = client.post("http://localhost:8070/api/processFulltextDocument",
        data={"consolidateHeader": "0", "consolidateCitations": "0", 
              "teiCoordinates": "head,p,s,ref,biblStruct,formula,figure,table"},
        files={"input": ("paper.pdf", content, "application/pdf")})
    tei = response.text

root = ET.fromstring(tei.encode('utf-8'))
body = root.find('.//{http://www.tei-c.org/ns/1.0}body')

out = open(r"C:\Users\Ciaran\Documents\GitHub\research-os-api\_tmp_tei_structure.txt", "w", encoding="utf-8")

# 1. Show where <figure> elements appear in the TEI structure
out.write("=" * 80 + "\n")
out.write("FIGURE ELEMENTS IN TEI\n")
out.write("=" * 80 + "\n\n")

for fig in root.iter('{http://www.tei-c.org/ns/1.0}figure'):
    parent = None
    # Walk up to find parent div
    for potential_parent in root.iter():
        for child in potential_parent:
            if child is fig:
                parent = potential_parent
                break
    
    fig_type = fig.get('type', 'figure')
    fig_id = fig.get('{http://www.w3.org/XML/1998/namespace}id', '?')
    coords = fig.get('coords', '')
    head = fig.find('tei:head', ns)
    head_text = head.text if head is not None else '(none)'
    
    parent_tag = parent.tag.split('}')[1] if parent is not None and '}' in parent.tag else '?'
    parent_head = None
    if parent is not None:
        parent_head_el = parent.find('tei:head', ns)
        if parent_head_el is not None:
            parent_head = parent_head_el.text
    
    all_text = ''.join(fig.itertext()).strip()[:150]
    
    out.write(f"<figure type='{fig_type}' id='{fig_id}'>\n")
    out.write(f"  Parent: <{parent_tag}> heading='{parent_head}'\n")
    out.write(f"  Head: {head_text}\n")
    out.write(f"  Text preview: {all_text[:100]}\n")
    out.write(f"  Coords: {coords[:50]}\n\n")

# 2. Show ALL direct children of each body div to see the interleaving
out.write("\n" + "=" * 80 + "\n")
out.write("BODY DIV STRUCTURE (children of each div)\n")
out.write("=" * 80 + "\n\n")

def show_div_structure(node, depth=0):
    indent = "  " * depth
    tag = node.tag.split('}')[1] if '}' in node.tag else node.tag
    
    if tag == 'div':
        head = node.find('tei:head', ns)
        head_text = head.text if head is not None else '(no heading)'
        out.write(f"{indent}<div> '{head_text}'\n")
        
        for child in node:
            child_tag = child.tag.split('}')[1] if '}' in child.tag else child.tag
            if child_tag == 'div':
                show_div_structure(child, depth+1)
            elif child_tag == 'figure':
                fig_type = child.get('type', 'figure')
                fig_head = child.find('tei:head', ns)
                fh = fig_head.text if fig_head is not None else ''
                fig_text = ''.join(child.itertext()).strip()[:80]
                out.write(f"{indent}  <figure type='{fig_type}'> {fh} :: {fig_text[:60]}\n")
            elif child_tag == 'p':
                text = ''.join(child.itertext()).strip()[:80]
                out.write(f"{indent}  <p> {text[:70]}\n")
            elif child_tag == 'head':
                pass  # already shown
            else:
                out.write(f"{indent}  <{child_tag}>\n")

if body is not None:
    for child in body:
        child_tag = child.tag.split('}')[1] if '}' in child.tag else child.tag
        if child_tag == 'div':
            show_div_structure(child, 0)

# 3. Now check: do any <p> elements contain figure-legend-like text?
out.write("\n" + "=" * 80 + "\n")
out.write("P ELEMENTS WITH FIGURE/TABLE REFERENCES IN TEXT\n") 
out.write("=" * 80 + "\n\n")

import re
for p in root.iter('{http://www.tei-c.org/ns/1.0}p'):
    text = ''.join(p.itertext()).strip()
    # Look for figure legend patterns
    if re.search(r'(?i)^(figure|fig\.?|table)\s+\d', text[:30]):
        # Find parent div heading
        parent_div = None
        for div in root.iter('{http://www.tei-c.org/ns/1.0}div'):
            if p in list(div):
                parent_div = div
        div_head = '?'
        if parent_div is not None:
            h = parent_div.find('tei:head', ns)
            if h is not None:
                div_head = h.text
        out.write(f"  In '{div_head}':\n")
        out.write(f"    {text[:200]}\n\n")

out.close()
print("Done - see _tmp_tei_structure.txt")
