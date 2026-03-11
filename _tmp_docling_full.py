"""Full Docling table extraction test."""
import os
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

import time
t0 = time.time()

from docling.document_converter import DocumentConverter

pdf_path = r"C:\Users\Ciaran\Documents\GitHub\research-os-api\publication_files_store\5e982a43-63ff-4d2d-ad30-ace2eeceac21\758ba871-b3e8-4ae3-86b2-e97a207d733e\24613639-0427-4b2b-8181-4a3b2f02a4f9.pdf"

converter = DocumentConverter()
result = converter.convert(pdf_path)
doc = result.document

elapsed = time.time() - t0
print(f"Docling conversion took {elapsed:.1f}s\n")

table_idx = 0
for item in doc.tables:
    table_idx += 1
    # Export with doc reference to avoid deprecation warning
    md = item.export_to_markdown(doc)
    
    print(f"{'='*80}")
    print(f"TABLE {table_idx}")
    print(f"{'='*80}")
    print(md)
    print()
    
    # Check for structured data
    if hasattr(item, 'data') and item.data:
        tdata = item.data
        print(f"  Structured data type: {type(tdata).__name__}")
        if hasattr(tdata, 'num_rows'):
            print(f"  Rows: {tdata.num_rows}, Cols: {tdata.num_cols}")
        if hasattr(tdata, 'grid'):
            print(f"  Grid shape: {len(tdata.grid)} x {len(tdata.grid[0]) if tdata.grid else 0}")
            for r_idx, row in enumerate(tdata.grid):
                cells = [c.text[:30] if hasattr(c, 'text') else str(c)[:30] for c in row]
                print(f"    Row {r_idx}: {cells}")
                if r_idx > 20:
                    print(f"    ... more rows")
                    break
    
    # Try HTML export
    if hasattr(item, 'export_to_html'):
        try:
            html = item.export_to_html(doc)
            print(f"\n  HTML length: {len(html)} chars")
            print(f"  HTML preview: {html[:500]}")
        except Exception as e:
            print(f"  HTML export error: {e}")

print(f"\nTotal tables: {table_idx}")
