"""Test PyMuPDF built-in table extraction quality."""
import fitz

pdf_path = r"C:\Users\Ciaran\Documents\GitHub\research-os-api\publication_files_store\5e982a43-63ff-4d2d-ad30-ace2eeceac21\758ba871-b3e8-4ae3-86b2-e97a207d733e\24613639-0427-4b2b-8181-4a3b2f02a4f9.pdf"

doc = fitz.open(pdf_path)

print(f"PDF has {len(doc)} pages")
print("=" * 80)
print("PyMuPDF TABLE EXTRACTION (find_tables)")
print("=" * 80)

total_tables = 0
for page_num in range(len(doc)):
    page = doc[page_num]
    tables = page.find_tables()
    if tables.tables:
        for t_idx, table in enumerate(tables.tables):
            total_tables += 1
            print(f"\n--- Page {page_num+1}, Table {t_idx+1} ---")
            print(f"  Bounding box: {table.bbox}")
            print(f"  Rows: {table.row_count}, Cols: {table.col_count}")
            
            # Extract as pandas-like data
            data = table.extract()
            for r_idx, row in enumerate(data):
                cleaned = [str(c)[:35] if c else '' for c in row]
                print(f"  Row {r_idx}: {cleaned}")
                if r_idx >= 25:
                    print(f"  ... {len(data)-r_idx-1} more rows")
                    break

            # Also try markdown output if available
            if hasattr(table, 'to_markdown'):
                md = table.to_markdown()
                if md:
                    print(f"\n  Markdown (first 500 chars):\n{md[:500]}")

doc.close()
print(f"\nTotal tables found: {total_tables}")
