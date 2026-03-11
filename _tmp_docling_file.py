"""Full Docling table extraction - output to file."""
import os, sys
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

import time
t0 = time.time()

# redirect stderr to suppress verbose INFO logs
import logging
logging.disable(logging.INFO)

from docling.document_converter import DocumentConverter

pdf_path = r"C:\Users\Ciaran\Documents\GitHub\research-os-api\publication_files_store\5e982a43-63ff-4d2d-ad30-ace2eeceac21\758ba871-b3e8-4ae3-86b2-e97a207d733e\24613639-0427-4b2b-8181-4a3b2f02a4f9.pdf"

out = open(r"C:\Users\Ciaran\Documents\GitHub\research-os-api\_tmp_docling_output.txt", "w", encoding="utf-8")

converter = DocumentConverter()
result = converter.convert(pdf_path)
doc = result.document

elapsed = time.time() - t0
out.write(f"Docling conversion took {elapsed:.1f}s\n\n")

table_idx = 0
for item in doc.tables:
    table_idx += 1
    md = item.export_to_markdown(doc)
    
    out.write(f"{'='*80}\n")
    out.write(f"TABLE {table_idx}\n")
    out.write(f"{'='*80}\n")
    out.write(md + "\n\n")
    
    # Check for structured grid data
    if hasattr(item, 'data') and item.data:
        tdata = item.data
        out.write(f"  Data type: {type(tdata).__name__}\n")
        if hasattr(tdata, 'num_rows'):
            out.write(f"  Rows: {tdata.num_rows}, Cols: {tdata.num_cols}\n")
        if hasattr(tdata, 'grid'):
            out.write(f"  Grid: {len(tdata.grid)} rows x {len(tdata.grid[0]) if tdata.grid else 0} cols\n")
            for r_idx, row in enumerate(tdata.grid):
                cells = []
                for c in row:
                    if hasattr(c, 'text'):
                        cells.append(c.text[:40])
                    else:
                        cells.append(str(c)[:40])
                out.write(f"    Row {r_idx}: {cells}\n")
    out.write("\n")

out.write(f"Total tables: {table_idx}\n")
out.close()
print("DONE - check _tmp_docling_output.txt")
