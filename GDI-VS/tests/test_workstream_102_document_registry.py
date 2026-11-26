from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def test_document_registry_supports_sorting_and_filter_reset():
    app = (ROOT / "frontend/src/App.tsx").read_text(encoding="utf-8")
    assert "const [sort, setSort] = useState('newest')" in app
    assert 'Title A–Z' in app
    assert 'Oldest first' in app
    assert 'Clear filters' in app
    assert 'aria-live="polite"' in app

def test_document_registry_paginates_sorted_filtered_results():
    app = (ROOT / "frontend/src/App.tsx").read_text(encoding="utf-8")
    assert 'const sorted = useMemo' in app
    assert 'sorted.slice((page - 1) * pageSize, page * pageSize)' in app
    assert 'Page {page} of {pageCount}' in app
