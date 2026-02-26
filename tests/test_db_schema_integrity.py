from __future__ import annotations

from research_os.db import Base


def test_sqlalchemy_metadata_index_names_are_unique() -> None:
    seen: dict[str, str] = {}
    duplicates: list[tuple[str, str, str]] = []

    for table_name, table in Base.metadata.tables.items():
        for index in table.indexes:
            index_name = str(index.name or "").strip()
            if not index_name:
                continue
            owner = seen.get(index_name)
            if owner is None:
                seen[index_name] = table_name
                continue
            duplicates.append((index_name, owner, table_name))

    assert not duplicates, f"Duplicate index names found: {duplicates}"

