"""Check intro and strengths sections of the BMJ PREFER-CMR paper."""
import os, sys, re
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from research_os.services.publication_console_service import (
    _parse_grobid_tei_into_structured_paper,
)

base = r"C:\Users\Ciaran\Documents\GitHub\research-os-api"
tei_path = os.path.join(base, "_tmp_bmj_tei.xml")

# Re-generate TEI if needed
if not os.path.exists(tei_path):
    import httpx
    pdf_path = os.path.join(base, r"publication_files_store\5e982a43-63ff-4d2d-ad30-ace2eeceac21\758ba871-b3e8-4ae3-86b2-e97a207d733e\24613639-0427-4b2b-8181-4a3b2f02a4f9.pdf")
    with open(pdf_path, 'rb') as f:
        content = f.read()
    timeout = httpx.Timeout(120.0)
    with httpx.Client(timeout=timeout, follow_redirects=True, headers={"Accept":"application/xml"}) as client:
        response = client.post("http://localhost:8070/api/processFulltextDocument",
            data={"consolidateHeader":"0","consolidateCitations":"0"},
            files={"input": ("paper.pdf", content, "application/pdf")})
        tei = response.text
    with open(tei_path, 'w', encoding='utf-8') as f:
        f.write(tei)
else:
    with open(tei_path, 'r', encoding='utf-8') as f:
        tei = f.read()

title = "Clinical utility of CMR in managing patients with elevated LV filling pressures"
result = _parse_grobid_tei_into_structured_paper(tei_xml=tei, title=title)
sections = result.get("sections", [])

# Show body sections with full content for intro and strengths
for s in sections:
    zone = s.get('document_zone', '?')
    level = s.get('level', 0)
    stitle = s.get('title', '(no title)')
    kind = s.get('canonical_kind', '?')
    content = s.get('content', '') or ''
    wc = len(re.findall(r'[A-Za-z0-9]+', content))
    
    if zone == 'body' and level == 1:
        print(f"{'='*80}")
        print(f"[{zone}/L{level}] {stitle} ({kind}) — {wc}w")
        print(f"{'='*80}")
        if kind in ('introduction', 'highlights', 'methods', 'results'):
            print(content[:800] if content else "(empty)")
            if len(content) > 800:
                print(f"\n... [{len(content)-800} more chars]")
        print()
    elif zone == 'body' and level == 2 and kind in ('introduction', 'highlights', 'section'):
        # Show subsections that might contain intro content
        parent_titles = [ss.get('title') for ss in sections if ss.get('document_zone') == 'body' and ss.get('level') == 1]
        print(f"  [{zone}/L{level}] {stitle} ({kind}) — {wc}w")
        if wc > 0:
            print(f"  {content[:300]}")
        print()
