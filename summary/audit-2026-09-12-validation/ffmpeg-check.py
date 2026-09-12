import pathlib
import subprocess
import tempfile

results = []
for fmt, muxer in (("m4a", "ipod"), ("aac", "adts")):
    output = pathlib.Path(tempfile.gettempdir()) / f"aetherflow-check-{fmt}.{fmt}"
    completed = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
         "-i", "anullsrc=r=16000:cl=mono", "-t", "0.01", "-f", muxer, str(output)],
        capture_output=True,
    )
    results.append((fmt, completed.returncode, output.exists(), output.stat().st_size if output.exists() else 0,
                    completed.stderr.decode(errors="replace")))
    output.unlink(missing_ok=True)
print(results)
