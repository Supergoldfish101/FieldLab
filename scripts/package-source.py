"""Package the preferred source for the browser application, without checkout state.

Run after build-pwa.mjs. Upstream NEC corresponding source is distributed separately
beside this archive; see dist/vendor/necpp/PROVENANCE.md for hashes and rebuild steps.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
target = root / 'dist/source/fieldlab-source.zip'
target.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(target, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
    for name in ['README.md', 'LICENSE', 'package.json', 'server.mjs']:
        archive.write(root / name, 'fieldlab/' + name)
    for folder in ['dist', 'scripts', 'pwa', 'tests']:
        for file in sorted((root / folder).rglob('*')):
            if not file.is_file() or 'source' in file.relative_to(root).parts or '__pycache__' in file.parts:
                continue
            archive.write(file, 'fieldlab/' + file.relative_to(root).as_posix())
print(f'{target.name}: {target.stat().st_size} bytes')
