"""Offline source-audit policy checks; C4 source download runs in CI separately."""
import importlib.util
import io
from pathlib import Path
import struct
import unittest
import zipfile

spec = importlib.util.spec_from_file_location(
    "source_audit", Path(__file__).resolve().parents[1] / "scripts/cas-c4-source-audit.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class C4SourceAuditTests(unittest.TestCase):
    def fake_zip(self, header):
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as archive:
            for key in audit.CANDIDATES:
                archive.writestr(f"clothes/{key}/{key}.mhclo", header)
                archive.writestr(f"clothes/{key}/{key}.obj",
                                 "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n")
        return data.getvalue()

    def test_three_distinct_source_identifiers(self):
        self.assertEqual(len(audit.CANDIDATES), 3)
        self.assertEqual(len(set(audit.CANDIDATES)), 3)
        self.assertFalse(any("alex" in name for name in audit.CANDIDATES))

    def test_archive_evidence_must_come_from_each_asset(self):
        result = audit.inspect_makehuman(self.fake_zip("# license CC0\n"))
        for asset in result.values():
            self.assertTrue(asset["licenseCC0"])
            self.assertTrue(asset["objFound"])
            self.assertTrue(asset["mhcloFound"])
            self.assertEqual(asset["geometry"]["triangles"], 1)
            self.assertTrue(asset["files"][0]["sha256"])

    def test_similarly_named_bow_variant_cannot_override_exact_ballet_source(self):
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as archive:
            for key in audit.CANDIDATES:
                archive.writestr(f"clothes/{key}/{key}.mhclo", "# license CC0\n")
                archive.writestr(f"clothes/{key}/shoe.obj",
                                 "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n")
            archive.writestr("clothes/toigo_ballet_flats_with_bows/other.obj",
                             "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nf 1 2 3\n")
        result = audit.inspect_makehuman(data.getvalue())
        self.assertEqual(result["toigo_ballet_flats"]["geometry"]["triangles"], 1)
        self.assertTrue(all("/toigo_ballet_flats/" in x["path"]
                            for x in result["toigo_ballet_flats"]["files"]))

    def test_non_cc0_remains_quarantined(self):
        result = audit.inspect_makehuman(self.fake_zip("# license CC-BY\n"))
        self.assertTrue(all(not x["licenseCC0"] for x in result.values()))

    def test_bad_glb_refused(self):
        with self.assertRaises(ValueError):
            audit.inspect_glb(b"glTF")


if __name__ == "__main__":
    unittest.main()
