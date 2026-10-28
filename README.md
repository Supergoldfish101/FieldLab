# FieldLab

Browser-local antenna exploration and NEC2++ modeling, with 15 antenna presets and an offline PWA. Run `npm run dev` and open http://127.0.0.1:4186. No npm install is needed. Run `npm test` for numerical, geometry, matching and PWA checks.

## GitHub Pages

Live app: https://supergoldfish101.github.io/FieldLab/

Source: https://github.com/Supergoldfish101/FieldLab

The `Publish FieldLab` workflow tests and publishes the checked-in `dist/` directory on pushes to `main`, or when started manually. Pages uses GitHub Actions as its publishing source. No runtime server, database, account, API key or deployment secret is required. All application modules, NEC WASM files and source archives are served from the same repository path. The local `server.mjs` is only a development file server.

Saved setups, preferences and installed offline apps belong to their browser origin. To move from another FieldLab address, download setup JSON there and use **Import setup** at the new address. Install the new address separately and wait for **Offline ready**. The original address's saved data and installation remain separate.

Keep `LICENSE`, the vendored license notices, and both downloads in `dist/source/` when redistributing. After application changes, follow the release steps below before committing. Platform-specific hosting metadata and local credentials are excluded from this repository.

## Calculation modes

Live preview uses prescribed currents, ideal images / Fresnel reflections and normalized pattern directivity for instant height feedback. Accurate mode solves wire currents, mutual coupling, complex feed impedance, conductor loss and far fields using NEC2++ 2.5.0, @necpp-engine/wasm 0.9.0. It runs in a cancellable module Worker without a server, SharedArrayBuffer or external runtime. While waiting / invalid / canceled, displayed plots are explicitly preview. Matching changes reuse solved field bases without another NEC run. All new controls and results are in the lower center beneath the 3D viewport.

All 15 presets use NEC wire geometries: dipoles, V forms, slopers, EF wires, inverted L, EF vertical, loops, Yagis, Hexbeam and phased array. Yagi and Hexbeam parasitic elements are passive. Hexbeam follows single-band KIO / G3TXQ published reference proportions, not a commercial multiband product model. The phased array uses two coupled ports with equal Thevenin source voltages at 0 and -90 degrees; a real harness is excluded. Loops are fed on the middle of the first side. Bent and end-fed ports use short feed bridges with matching adjacent segment lengths. No insulation, spreader loading, buried wires or terrain model is included.

End-fed antennas have visible explicit counterpoise / radial return wires. Auto adds 0.05 wavelength counterpoise to EF wires and four 0.25 wavelength radials to EF verticals. Existing explicit vertical return settings take precedence. All wires must clear the flat half-space. Finite soil uses NEC Sommerfeld-Norton ground; preset permittivity / conductivity are illustrative constant properties. There is no unspecified coax return or earth stake. Coax common-mode current is not solved.

Standard / Fine targets roughly 60 / 100 segments per wavelength with a 900-segment offline limit. A second impedance solve at 1.5 times density reports relative complex Z-matrix difference and warns over 5 percent. This is sensitivity evidence, not a physical accuracy guarantee. High impedance end feeds especially depend on return / bridge geometry. Angular sampling is 5 degrees and can miss narrow lobes. Gain uses NEC electric fields and accepted port power, not upper-hemisphere renormalization. After-device gain additionally includes mismatch and assumed device loss, referenced to available source power.

## Matching

Selectable 1:1, 2:1, 4:1, 9:1, 49:1, 64:1 impedance ratios divide antenna-side complex impedance before SWR is calculated against the chosen radio impedance. For coupled ports, the full impedance matrix is solved with transformed source resistance; basis fields / currents are recombined. Recommendation maximizes accepted power among common ratios at the current frequency. It does not guarantee a broadband match or remove reactance. Each device is ideal, with user-assumed matched loss; no real core frequency response, tuner or coax loss. A separate 1:1 current balun / common-mode choke recommendation does not change differential SWR.

The 15-point sweep holds physical geometry fixed and solves impedance at every frequency. Gold shows selected-device SWR, gray direct-feed SWR. CSV, full result JSON and NEC geometry deck exports are available. The geometry deck uses ideal voltage sources; source resistance / device networks are documented in full JSON rather than embedded in the deck. Letter landscape one-page reports include gain basis, maximum azimuth / elevation, raw Z, selected device, SWR and mesh sensitivity.

## Preserved workbench features

Dark default / optional light theme, Metric / Imperial header conversion without physical rounding, input such as `12'-3"` and fractional inches, interactive 3D direction picking with chart feedback, Escape to resume live inspection, DX candidate highlighting, current color overlay, local named setups / JSON import-export, comparison snapshots and one-page printing. Antenna and pattern surfaces use separate schematic scales. Compare gain numbers only with compatible power references. Old longwire/randomwire/efhw presets migrate to general EF wire / sloper with dimensions preserved.

## Build, source and PWA releases

1. `node scripts/build-pwa.mjs` after dist changes.
2. `npm test`.
3. `python scripts/package-source.py` to regenerate the served preferred-source archive.

The service worker fingerprints and caches the complete runtime, including WASM and worker imports. Source archives in dist/source are deliberately excluded from offline precache / version hashing. New versions wait for Reload to update. Offline ready checks every required asset; repair.html rebuilds runtime cache without deleting local saved setups. Authentication / redirected HTML is never cached as the app shell. Public hosting was explicitly authorized for PWA service-worker access. Local disconnected-server tests cover reload, new solves, matching and printing; actual OS installation remains user-controlled.

## Licensing and corresponding source

FieldLab original application source is licensed GPL-2.0-or-later. See LICENSE. It is distributed together with the GPL-2.0-or-later NEC2++ WASM engine. `dist/source/fieldlab-source.zip` includes preferred editable application sources, build scripts, tests and vendored runtime. Complete corresponding NEC native / JS source and build scripts are served beside it as `necpp-wasm-v0.9.0-source.tar.gz`; see `dist/vendor/necpp/PROVENANCE.md` for exact commit, hashes and rebuild instructions. Copy both archives to retain the complete source distribution. Three.js and OrbitControls retain their MIT license in `dist/vendor/LICENSE-three.txt`. Font service is optional; system fallbacks work offline.

References: https://www.nec2.org/part_3/secii.html ; https://github.com/andrekuehne/necpp/tree/wasm-v0.9.0 ; https://www.k4kio.com/specifications/ ; https://www.hex-beam.com/specs/

## Length tuning, multiband planning and dBi references

Auto tune length performs a bounded NEC impedance search at the selected frequency and fixed matching ratio / radio impedance. It scans a coarse interval, refines three promising regions, applies an improvement and offers Undo. Cancellation or setup changes leave dimensions unchanged. The original point remains a comparison; the optimum reported is inside the search bounds. It does not promise a global minimum or simulate a tuner. Inverted L can hold either leg or scale both. Yagi preset element lengths and Hexbeam wire geometry scale according to the normal length control, not a model of independently tuning one commercial element.

Inverted-L total, rise and horizontal inputs are all editable. The last two distinct edited dimensions are held, and the remaining dimension is calculated. Invalid negative / over-limit derived dimensions preserve the previous antenna. Calculation metadata persists in portable setups. Feet / inches and header unit conversion use the existing canonical meter parser.

End-fed multiband / non-resonant intent preserves wire length when choosing another band. It adds no duplicate antenna type. Random wire is a separate hash-routed page (`#random-wire`) with an independent saved installation / preferences. It scans a bounded range, marks potential high-impedance windows near positive half-wave multiples (red hatch) separately from odd quarter-wave resonances (amber), and selects a diverse geometric shortlist ranked by avoidance of half-wave buffers. Teal means outside both buffers; clear windows only exclude half-wave buffers and can include amber advisories. Continuous frequency spans are checked, including crossings between sample frequencies. These are free-space length heuristics, not predictions of actual impedance. This is not impedance screening. An explicit NEC stage samples each selected band's center and optional span edges, holds physical radiator and return geometry fixed, meshes for the highest design frequency, and compares 1:1 / 2:1 / 4:1 / 9:1 / 49:1 / 64:1 ratios from complex Z. Results rank by sampled bands meeting the chosen SWR target, then worst SWR. A tuner-range threshold does not simulate matching networks, and neither sampled SWR nor resonance screening proves full-band coverage or useful efficiency. Up to 12 shortlisted lengths are checked; all geometric clear windows are bounded by scan resolution. CSV exports include every ratio and frequency sample.

Using a candidate transfers its explicit return length, physical feed-bridge reference, highest-frequency mesh floor, chosen ratio and frequency into the workbench. These numerical settings persist so raw impedance reproduces across contexts. Workbench provides the finer-mesh sensitivity check and far-field solution; the random-wire table itself solves impedance without a finer-mesh check. Set nominal length resets the inherited mesh / bridge reference for a new preset.

Optional dBi reference is off by default. It displays absolute gain labels on polar cuts and the 3D legend, with a dashed zero-dBi guide only when zero lies inside the displayed scale. With comparisons enabled, both patterns use the same absolute reference / floor; relative mode retains individually normalized peaks. Probe and DX markers use that same reference. Gain values and NEC cache identity are unchanged. Printed reports isolate the main pattern so their maximum marker and reference labels agree. Radius is logarithmic gain, not physical distance; the selected preview directivity / NEC accepted-power gain / after-device realized gain basis remains explicit.

The new pages, tuning worker and imports are included in offline precache. Primary non-resonant installation reference: https://palomar-engineers.com/wp-content/uploads/Bullet-End-Fed-Antenna-Typical-Configuration-Notes-03192023.pdf

The Random wire page also accepts a single installed length for per-band SWR sweeps, with 21/41/81 uniform samples plus exact editable band edges and 20% frequency margins. Fixed geometry and returns are reused across every frequency, with mesh chosen for the highest sample. US reference edges (ARRL) are editable; 60 m defaults only to the 5.3515-5.3665 MHz segment, excluding separate channels. Shaded windows and edge markers distinguish in-band samples. Direct-feed and selected ideal-ratio curves share a 1-20+ logarithmic SWR axis; inspection and CSV retain unclipped values. Ratio or radio impedance changes re-score cached raw matrices without a new solve. Sweep calculations, controls and source are included in the offline cache.

The single-length sweep has an inline Unun ratio selector synchronized with the Random wire sidebar matching target. Cached curves update immediately in either direction. The workbench SWR chart shades the reference band and labels both edges; edges outside a narrow sweep use directional labels and a Show full band button expands the sweep. Reference limits use the same US defaults, including 2 m and 70 cm; the 60 m marker covers only its continuous segment.


## Math audit — 2026-10-17

Reviewed complex impedance, ideal matching and power normalization, all 15 wire geometries, sampling and cached results, unit conversion, soil reflection, pattern coordinates/integration, and report/export calculations.

Corrections:
- End-fed inverted-L and vertical return conductors now rotate with the complete installation. A vertical first radiator segment previously left the return direction fixed in world coordinates, changing inverted-L impedance when changing bearing.
- Segmentation tolerates floating-point noise at integer boundaries. A rigid rotation of a nominal full-wave square loop previously could change its mesh and impedance.
- End-fed source bridges are capped by available return length. Very short returns previously had unequal source-adjacent segment lengths. Impossible thick-wire geometries are rejected rather than using invalid source neighborhoods.
- SWR uses a scaled, cancellation-resistant expression: q = (R² + X² + Z0²) / (2 R Z0), SWR = q + sqrt(q−1)sqrt(q+1). It agrees with reflection-coefficient calculations for ordinary impedances and remains finite for representable extreme mismatches that previously rounded to infinity. Nonpositive real reference impedances are rejected.
- Single-length random-wire sweep identity now includes the inverted-L resizing policy, so changing which section is held fixed invalidates old geometry results.
- Free-space NEC deck export now requests the same 37 theta samples/full sphere as the live solver, instead of 19/one hemisphere.
- Accurate-mode print reports identify explicit NEC return wires instead of calling an automatically generated return an implicit ground.

Clarifications, not changes to the physics:
- A prominent return-path summary beside the random-wire SWR controls states actual count, length, slope, omitted coax/earth connections, and the before-tuner measurement plane.
- A bulk-mesh convergence check holds feed-bridge dimensions fixed; it does not establish feed-region independence or physical installation accuracy. This is now explicit in the UI/report.
- A 9:1 impedance ratio divides both R and X by 9. It does not cancel reactance. Typical 71 ft manufacturer examples include a substantially longer return than the 1.056 m isolated wire in the reported screenshot. We did not change the user's dimensions to make SWR look better.

Validation includes independent reflection-coefficient and power-transfer identities over R/X/reference/ratio grids; all-type rigid-rotation invariance; all-type perfect-conductor frequency/length scaling; short-return geometry and real NEC solves; known dipole impedance/gain and power conservation; soil limits; workbench/random-wire impedance parity; and browser verification of stale-result invalidation. These are model/software checks, not a substitute for measured feed-point impedance. Random-wire sweeps remain sampled, with no finer-mesh convergence check at every sweep point; feedline, tuner, transformer core response and insulation remain outside the model.

References: https://www.nec2.org/part_3/cards/secii.html ; https://ipo.llnl.gov/sites/default/files/2020-07/NEC5%20Validation%20Manual%20092419.pdf ; https://palomar-engineers.com/wp-content/uploads/Bullet-End-Fed-Antenna-Typical-Configuration-Notes-03192023.pdf
