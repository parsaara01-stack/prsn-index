"""Open one GitHub issue per new SEC alert. Input: blocks written by `python -m engine monitor` (ALERTS_OUT)."""
import subprocess
import sys

text = open(sys.argv[1]).read()
subprocess.run(["gh", "label", "create", "alert", "--color", "C8322B", "--description", "SEC filing that needs a human check", "--force"], check=False)
for block in filter(None, (b.strip() for b in text.split("<<<END>>>"))):
    head, _, body = block.partition("\n")
    _, title, first = head.split("|", 2)
    subprocess.run(["gh", "issue", "create", "--title", title, "--label", "alert", "--body", first + "\n" + body], check=True)
