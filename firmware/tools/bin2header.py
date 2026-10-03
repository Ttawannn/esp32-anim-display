"""Embed a binary file as a C array: bin2header.py <input> <output.h> <symbol>"""
import sys

src, dst, name = sys.argv[1:4]
data = open(src, "rb").read()
rows = ["  " + ", ".join(f"0x{b:02X}" for b in data[i:i + 20]) + "," for i in range(0, len(data), 20)]
with open(dst, "w", newline="\n") as f:
    f.write("#pragma once\n#include <stddef.h>\n#include <stdint.h>\n\n")
    f.write(f"// Generated from {src.replace(chr(92), '/')} by tools/bin2header.py\n")
    f.write(f"static const uint8_t {name}[] = {{\n" + "\n".join(rows) + "\n};\n")
    f.write(f"static const size_t {name}Len = sizeof({name});\n")
