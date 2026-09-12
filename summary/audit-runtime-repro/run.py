# pattern: Imperative Shell
"""独立运行审查夹具，不调用 Maven、不改原测试文件或构建目录。"""
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET

repo = Path(__file__).resolve().parents[2]
workspace = Path(__file__).resolve().parent
report = repo / "backend/workflow-service/target/surefire-reports/TEST-com.aetherflow.workflow.service.impl.WorkflowServiceImplTest.xml"
properties = {item.attrib["name"]: item.attrib["value"] for item in ET.parse(report).getroot().find("properties")}
classpath = properties["java.class.path"]
jdk = Path(properties["java.home"]) / "bin"
output = workspace / "classes"
output.mkdir(exist_ok=True)
compile_args = workspace / "javac.args"
compile_args.write_text('-encoding UTF-8\n-proc:none\n-cp "' + classpath.replace('\\', '/') + '"\n-d "' + output.as_posix() + '"\n"' + (workspace / "AuditRuntimeRepro.java").as_posix() + '"\n', encoding="utf-8")
compiled = subprocess.run([str(jdk / "javac.exe"), "@" + str(compile_args)], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
print(compiled.stdout, compiled.stderr, end="")
compiled.check_returncode()
run_args = workspace / "java.args"
run_args.write_text('-cp "' + output.as_posix() + ';' + classpath.replace('\\', '/') + '"\ncom.aetherflow.workflow.service.impl.AuditRuntimeRepro\n', encoding="utf-8")
ran = subprocess.run([str(jdk / "java.exe"), "@" + str(run_args)], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
print(ran.stdout, ran.stderr, end="")
(workspace / "result.txt").write_text(ran.stdout + ran.stderr, encoding="utf-8")
ran.check_returncode()
