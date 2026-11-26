from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / 'frontend/src/App.tsx').read_text()
CSS = (ROOT / 'frontend/src/styles.css').read_text()


def test_document_detail_exposes_issuer_and_lifecycle_metadata():
    assert 'DOCUMENT OVERVIEW' in APP
    assert 'selectedDocument.issuer_id' in APP
    assert 'selectedDocument.issued_at' in APP
    assert 'selectedDocument.expires_at' in APP
    assert 'selectedDocument.created_at' in APP


def test_document_detail_summarises_version_integrity_without_overclaiming():
    assert 'Version history' in APP
    assert 'versions.filter(item => item.sha256).length' in APP
    assert 'does not establish authenticity' in APP


def test_document_detail_layout_is_responsive():
    assert '.document-overview-grid' in CSS
    assert '@media(max-width:760px)' in CSS
