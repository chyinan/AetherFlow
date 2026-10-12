"""不依赖 Maven 下载的结构化映射核心契约检查，要求 JAVA_HOME 指向 JDK 17+。"""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "backend/workflow-service/src/main/java/com/aetherflow/workflow/node/mapping/StructuredDataMapper.java"
FIXTURES = ROOT / "backend/workflow-service/src/test/resources/structured-mapping-cases.json"


def java(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        return "list(" + ", ".join(map(java, value)) + ")"
    return "map(" + ", ".join(java(part) for item in value.items() for part in item) + ")"


def main():
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    cases = "\n".join(
        "        verify(" + java(item["name"]) + ", StructuredDataMapper.transform(" + java(item["input"])
        + ", " + java(item["config"]) + "), " + java(item["expected"]) + ");"
        for item in fixtures
    )
    harness = '''import com.aetherflow.workflow.node.mapping.StructuredDataMapper;
import java.util.*;
import java.math.BigDecimal;
public class MappingContractCheck {
    static int passed;
    static Map<String,Object> map(Object... entries) {
        Map<String,Object> result = new LinkedHashMap<>();
        for (int i=0;i<entries.length;i+=2) result.put((String)entries[i],entries[i+1]);
        return result;
    }
    static List<Object> list(Object... values) { return new ArrayList<>(Arrays.asList(values)); }
    static boolean equal(Object a, Object b) {
        if (a instanceof Number && b instanceof Number) return new BigDecimal(a.toString()).compareTo(new BigDecimal(b.toString())) == 0;
        if (a instanceof List<?> x && b instanceof List<?> y) {
            if (x.size()!=y.size()) return false;
            for (int i=0;i<x.size();i++) if(!equal(x.get(i),y.get(i))) return false;
            return true;
        }
        if(a instanceof Map<?,?> x && b instanceof Map<?,?> y) {
            if(!x.keySet().equals(y.keySet())) return false;
            for(Object key:x.keySet()) if(!equal(x.get(key),y.get(key))) return false;
            return true;
        }
        return Objects.equals(a,b);
    }
    static void verify(String name,Object actual,Object expected) {
        if(!equal(actual,expected)) throw new AssertionError(name+": "+actual+" != "+expected);
        passed++;
    }
    static void rejects(String name,Runnable action,String message) {
        try { action.run(); } catch(IllegalArgumentException exception) {
            if(!exception.getMessage().contains(message)) throw new AssertionError(name+": "+exception.getMessage());
            passed++; return;
        }
        throw new AssertionError(name+" 没有被拒绝");
    }
    public static void main(String[] args) {
''' + cases + '''
        Map<String,Object> mapping = map("operation","map","sourcePath","items","shape","value","value",map("type","path","value","$"));
        rejects("缺失字段",()->StructuredDataMapper.readPath(map(),"missing.field"),"字段路径不存在");
        rejects("错误数组类型",()->StructuredDataMapper.transform(map("items","abc"),mapping),"必须是数组");
        rejects("数组限额",()->StructuredDataMapper.transform(map("items",Collections.nCopies(1001,1)),mapping),"1000");
        rejects("未知操作",()->StructuredDataMapper.validate(map("operation","execute")),"operation");
        rejects("目标路径覆盖",()->StructuredDataMapper.validate(map("operation","object","fields",list(
            map("target","a","type","path","value","$"),map("target","a.b","type","path","value","$")))),"互相覆盖");
        rejects("代码式路径",()->StructuredDataMapper.validatePath("items.filter(x)"),"无效字段路径");
        rejects("数值比较不自动转换字符串",()->StructuredDataMapper.validate(map("operation","filter","filter",map("enabled",true,"operator","gt","value","2"))),"JSON 数字");
        rejects("顶层空值",()->StructuredDataMapper.transform(map("a",null),map("operation","select","sourcePath","a")),"顶层映射结果不能为 null");
        mapping.put("value",map("type","literal","value","a".repeat(100000)));
        rejects("总文本限额",()->StructuredDataMapper.transform(map("items",Collections.nCopies(11,1)),mapping),"100 万字符");
        Map<String,Object> original = map("a",list(1));
        Map<String,Object> copied = (Map<String,Object>)StructuredDataMapper.readPath(original,"$");
        ((List<Object>)copied.get("a")).add(2);
        verify("深拷贝",original,map("a",list(1)));
        System.out.println("结构化映射纯 Java 契约通过: "+passed+" 项（含 ''' + str(len(fixtures)) + ''' 组前后端共享数据）");
    }
}
'''
    java_home = os.environ.get("JAVA_HOME")
    javac = str(Path(java_home) / "bin/javac") if java_home else shutil.which("javac")
    runtime = str(Path(java_home) / "bin/java") if java_home else shutil.which("java")
    if not javac or not runtime:
        raise SystemExit("未找到 JDK，请设置 JAVA_HOME。此检查不下载依赖。")
    with tempfile.TemporaryDirectory(prefix="aetherflow-mapping-") as directory:
        output = Path(directory)
        check = output / "MappingContractCheck.java"
        check.write_text(harness, encoding="utf-8")
        subprocess.run([javac, "--release", "17", "-encoding", "UTF-8", "-d", str(output), str(SOURCE), str(check)], check=True)
        subprocess.run([runtime, "-cp", str(output), "MappingContractCheck"], check=True)


if __name__ == "__main__":
    main()
